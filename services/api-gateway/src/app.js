// services/api-gateway/src/app.js
//
// Single public entry point. Responsibilities:
//   • TLS is terminated by Caddy (prod overlay); we add security headers (helmet)
//   • JWT verification + coarse RBAC BEFORE anything is proxied downstream
//     (downstream services verify again — defence in depth)
//   • Redis-backed rate limiting (auth surface: tight; everything else: generous)
//   • Request-id propagation, bounded upstream timeouts, status passthrough
const express   = require("express")
const cors      = require("cors")
const helmet    = require("helmet")
const axios     = require("axios")
const crypto    = require("crypto")
const rateLimit = require("express-rate-limit")
const { RedisStore } = require("rate-limit-redis")
const { createClient } = require("redis")
const swaggerUi = require("swagger-ui-express")
const openapiSpec = require("./openapi")
const { authenticate, requireStaff } = require("/shared/auth")
const log = require("/shared/logger")("api-gateway")

const app = express()
app.disable("x-powered-by")

// Only trust X-Forwarded-* when we really sit behind Caddy (prod overlay),
// otherwise clients could spoof their IP to dodge the rate limiter.
if ((process.env.TRUST_PROXY || "false").toLowerCase() === "true") app.set("trust proxy", 1)

app.use(helmet({
  contentSecurityPolicy: false, // Swagger UI needs inline scripts; APIs return JSON only
  crossOriginEmbedderPolicy: false,
}))

// ── CORS ──────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:5174").split(",").map(s => s.trim())
const corsOptions = {
  origin: (origin, cb) => (!origin || allowedOrigins.includes(origin)) ? cb(null, true) : cb(new Error("CORS origin denied")),
  credentials: true,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  allowedHeaders: "Origin,X-Requested-With,Content-Type,Accept,Authorization,X-Request-Id,Idempotency-Key",
  exposedHeaders: "X-Request-Id,RateLimit-Limit,RateLimit-Remaining,RateLimit-Reset,Content-Disposition",
  maxAge: 600,
}
app.use(cors(corsOptions))
app.options("*", cors(corsOptions))
app.use(express.json({ limit: "64kb" }))

// ── Request id + access log ───────────────────────────────────────
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] && /^[\w.-]{8,64}$/.test(req.headers["x-request-id"])
    ? req.headers["x-request-id"] : crypto.randomUUID()
  res.setHeader("X-Request-Id", req.id)
  const t0 = process.hrtime.bigint()
  res.on("finish", () => {
    if (req.path === "/health" || req.path === "/ready") return
    log.info("request", {
      id: req.id, method: req.method, path: req.path, status: res.statusCode,
      ms: Number(process.hrtime.bigint() - t0) / 1e6, user: req.user?.userId, role: req.user?.role,
    })
  })
  next()
})

// ── Rate limiting (Redis-backed, shared across replicas) ──────────
const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379"
const redisClient = createClient({ url: REDIS_URL })
redisClient.on("error", (e) => log.warn("rate-limit redis error", { err: e.message }))
if (process.env.NODE_ENV !== "test") {
  redisClient.connect()
    .then(() => log.info("rate-limit redis connected"))
    .catch((e) => log.warn("rate-limit redis connect failed (commands queue)", { err: e.message }))
}
const store = (prefix) => process.env.NODE_ENV === "test" ? undefined
  : new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args), prefix })

const limiter = (prefix, windowMs, max) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false,
  message: { ok: false, code: "RATE_LIMITED", message: "Too many requests, please try again later." },
  skip: (req) => req.method === "OPTIONS",
  store: store(prefix),
})
const AUTH_RL_WINDOW_MS = Number(process.env.AUTH_RL_WINDOW_MS || 15 * 60 * 1000)
const AUTH_RL_MAX       = Number(process.env.AUTH_RL_MAX       || 20)
const API_RL_WINDOW_MS  = Number(process.env.API_RL_WINDOW_MS  || 60 * 1000)
const API_RL_MAX        = Number(process.env.API_RL_MAX        || 300)
app.use("/auth/customer/login", limiter("rl:auth:", AUTH_RL_WINDOW_MS, AUTH_RL_MAX))
app.use("/auth/staff/login",    limiter("rl:auth:", AUTH_RL_WINDOW_MS, AUTH_RL_MAX))
app.use("/auth/refresh",        limiter("rl:auth:", AUTH_RL_WINDOW_MS, AUTH_RL_MAX * 3))
app.use(limiter("rl:api:", API_RL_WINDOW_MS, API_RL_MAX))

// ── OpenAPI ───────────────────────────────────────────────────────
app.get("/docs.json", (_req, res) => res.json(openapiSpec))
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec, {
  customSiteTitle: "Quantum Banking API", swaggerOptions: { persistAuthorization: true },
}))

// ── Upstreams ─────────────────────────────────────────────────────
const U = {
  identity: process.env.IDENTITY_SERVICE_URL || "http://identity-service:3001",
  account:  process.env.ACCOUNT_SERVICE_URL  || "http://account-service:3002",
  ledger:   process.env.LEDGER_SERVICE_URL   || "http://ledger-service:3003",
  audit:    process.env.AUDIT_SERVICE_URL    || "http://audit-service:3004",
  quantum:  process.env.QUANTUM_SERVICE_URL  || "http://quantum-service:3005",
  kms:      process.env.KMS_SERVICE_URL      || "http://kms-service:3006",
  fraud:    process.env.FRAUD_SERVICE_URL    || "http://fraud-service:3007",
}
const DEFAULT_TIMEOUT = Number(process.env.UPSTREAM_TIMEOUT_MS || 10000)

const fwdHeaders = (req) => ({
  Authorization: req.headers.authorization || "",
  "X-Request-Id": req.id,
  "X-Forwarded-For": req.ip,
  ...(req.headers["idempotency-key"] ? { "Idempotency-Key": req.headers["idempotency-key"] } : {}),
})

// Generic JSON proxy. Keeps upstream status + body; network errors → 502.
function proxy(base, { method, path, timeout = DEFAULT_TIMEOUT, query = true, body = true } = {}) {
  return async (req, res) => {
    const url = `${base}${typeof path === "function" ? path(req) : (path ?? req.path)}`
    try {
      const r = await axios({
        method: method || req.method, url,
        data: body && ["POST", "PUT", "PATCH", "DELETE"].includes((method || req.method).toUpperCase()) ? req.body : undefined,
        params: query ? req.query : undefined,
        headers: fwdHeaders(req), timeout,
        validateStatus: () => true,
      })
      res.status(r.status).json(r.data)
    } catch (err) {
      const code = err.code === "ECONNABORTED" ? 504 : 502
      log.warn("upstream error", { id: req.id, url, err: err.message })
      res.status(code).json({ ok: false, code: code === 504 ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE", message: "Upstream service unavailable" })
    }
  }
}

// Raw passthrough (CSV / HTML / PNG) — copies content headers verbatim.
function proxyRaw(base, { path, timeout = DEFAULT_TIMEOUT } = {}) {
  return async (req, res) => {
    const url = `${base}${typeof path === "function" ? path(req) : (path ?? req.path)}`
    try {
      const r = await axios.get(url, { params: req.query, headers: fwdHeaders(req), timeout, responseType: "arraybuffer", validateStatus: () => true })
      for (const h of ["content-type", "content-disposition", "content-security-policy", "cache-control"])
        if (r.headers[h]) res.setHeader(h, r.headers[h])
      res.status(r.status).send(Buffer.from(r.data))
    } catch (err) {
      res.status(502).json({ ok: false, code: "UPSTREAM_UNAVAILABLE", message: "Upstream service unavailable" })
    }
  }
}

// ── Public ────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "gateway running" }))
app.get("/ready", async (_req, res) => {
  const checks = await Promise.all(Object.entries(U).map(async ([name, base]) => {
    try { const r = await axios.get(`${base}/health`, { timeout: 2000, validateStatus: () => true }); return [name, r.status < 500] }
    catch { return [name, false] }
  }))
  const up = Object.fromEntries(checks)
  const ok = up.identity && up.account
  res.status(ok ? 200 : 503).json({ status: ok ? "ready" : "degraded", upstreams: up })
})

app.post("/auth/customer/login", proxy(U.identity))
app.post("/auth/staff/login",    proxy(U.identity))
app.post("/auth/refresh",        proxy(U.identity))
app.post("/auth/logout",         proxy(U.identity))

// ── Everything below requires a valid access token ────────────────
app.use(authenticate)

// identity (self)
app.get("/auth/me",       proxy(U.identity))
app.put("/auth/me",       proxy(U.identity))
app.put("/auth/password", proxy(U.identity))

// account (self)
app.get("/balance",                 proxy(U.account))
app.post("/withdraw",               proxy(U.account, { timeout: 15000 }))
app.post("/transfer",               proxy(U.account, { timeout: 15000 }))
app.get("/accounts/verify/:id",     proxy(U.account))
app.get("/payees",                  proxy(U.account))
app.post("/transactions",           proxy(U.account, { timeout: 15000 }))
app.get("/transactions",            proxy(U.account))
app.get("/transactions/export",     proxyRaw(U.account, { timeout: 30000 }))
app.get("/transactions/:id",        proxy(U.account))

// quantum demos (any authenticated role)
app.get("/quantum/backend",        proxy(U.quantum, { path: "/backend" }))
app.get("/quantum/qrng",           proxy(U.quantum, { path: "/qrng", timeout: 60000 }))
app.post("/quantum/qkd/bb84",      proxy(U.quantum, { path: "/qkd/bb84", timeout: 120000 }))
app.get("/quantum/qkd/visualize",  proxyRaw(U.quantum, { path: "/qkd/visualize", timeout: 30000 }))

// ── Staff / admin surface ─────────────────────────────────────────
app.use(["/admin", "/fraud", "/kms", "/ledger", "/audit"], requireStaff)

// identity admin (identity enforces admin-only where required)
app.post("/admin/users",       proxy(U.identity))
app.get("/admin/users",        proxy(U.identity))
app.get("/admin/users/:id",    proxy(U.identity))
app.put("/admin/users/:id",    proxy(U.identity))
app.delete("/admin/users/:id", proxy(U.identity))

// account admin
app.post("/admin/deposit",                           proxy(U.account, { path: "/deposit", timeout: 15000 }))
app.get("/admin/accounts/:id",                       proxy(U.account))
app.get("/admin/accounts/:id/transactions",          proxy(U.account))
app.post("/admin/transactions/:id/cancel",           proxy(U.account, { timeout: 15000 }))
app.get("/admin/outbox/stats",                       proxy(U.account))

// ledger read-side + reconciliation
app.get("/ledger/accounts/:id/entries",   proxy(U.ledger))
app.get("/ledger/accounts/:id/reconcile", proxy(U.ledger))
app.get("/ledger/transactions/:txId",     proxy(U.ledger))
app.get("/ledger/entries/:id",            proxy(U.ledger))

// audit
app.get("/audit/stats",  proxy(U.audit))
app.get("/audit/recent", proxy(U.audit))

// kms
app.post("/kms/keys",     proxy(U.kms, { timeout: 60000 }))
app.get("/kms/keys/:kid", proxy(U.kms))

// fraud
app.get("/fraud/stats",                   proxy(U.fraud))
app.get("/fraud/alerts",                  proxy(U.fraud))
app.get("/fraud/model-info",              proxy(U.fraud))
app.post("/fraud/score",                  proxy(U.fraud, { timeout: 30000 }))
app.post("/fraud/alerts/:id/dismiss",     proxy(U.fraud))

// ── 404 / errors ──────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ ok: false, code: "NOT_FOUND", message: "Route not found" }))
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err?.message === "CORS origin denied") return res.status(403).json({ ok: false, code: "CORS_DENIED", message: err.message })
  if (err?.type === "entity.parse.failed")   return res.status(400).json({ ok: false, code: "BAD_JSON", message: "Malformed JSON body" })
  log.error("gateway error", { id: req.id, err: err?.message })
  res.status(500).json({ ok: false, code: "INTERNAL", message: "Internal server error" })
})

module.exports = app
module.exports._redis = redisClient
