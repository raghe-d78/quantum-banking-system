// services/api-gateway/src/server.js
const express = require("express");
const cors    = require("cors");
const axios   = require("axios");
const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { createClient } = require("redis");
const swaggerUi = require("swagger-ui-express");
const openapiSpec = require("./openapi");

const app = express();

// Trust the docker network proxy hop so req.ip resolves to the real client IP
// (otherwise express-rate-limit would key everyone under the same gateway IP).
app.set("trust proxy", 1);

// ── CORS ──────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:5174")
  .split(",");

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  allowedHeaders: "Origin,X-Requested-With,Content-Type,Accept,Authorization",
}));
app.options("*", cors({ origin: allowedOrigins }));
app.use(express.json());

// ── Rate limiting (Phase 0.4 / Phase 2.2) ─────────────────────────
// Brute-force / credential-stuffing defense for the auth surface.
// Phase 2.2: store moved to Redis so limits hold across multiple gateway replicas.
const AUTH_RL_WINDOW_MS = Number(process.env.AUTH_RL_WINDOW_MS || 15 * 60 * 1000); // 15m
const AUTH_RL_MAX       = Number(process.env.AUTH_RL_MAX       || 20);             // 20 / IP / window
const REDIS_URL         = process.env.REDIS_URL || "redis://redis:6379";

const redisClient = createClient({ url: REDIS_URL });
redisClient.on("error", (e) => console.error("[rate-limit] redis error:", e.message));
redisClient.connect()
  .then(() => console.log("[rate-limit] Redis store connected"))
  .catch((e) => console.error("[rate-limit] Redis connect failed (commands will queue):", e.message));

const authLimiter = rateLimit({
  windowMs: AUTH_RL_WINDOW_MS,
  max:      AUTH_RL_MAX,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: "Too many authentication attempts, please try again later." },
  skip: (req) => req.method === "OPTIONS",
  store: new RedisStore({
    // node-redis v4 buffers commands until ready, so this is safe pre-connect.
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: "rl:auth:",
  }),
});

// Mount BEFORE the route handlers so it covers every /auth/* endpoint.
app.use("/auth", authLimiter);

// ── OpenAPI / Swagger (Phase 0.5) ─────────────────────────────────
// Spec available as JSON at /docs.json, interactive UI at /docs.
app.get("/docs.json", (_req, res) => res.json(openapiSpec));
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(openapiSpec, {
    customSiteTitle: "Quantum Banking API",
    swaggerOptions: { persistAuthorization: true },
  })
);

// ── Service URLs ──────────────────────────────────────────────────
const IDENTITY_SERVICE_URL = process.env.IDENTITY_SERVICE_URL || "http://identity-service:3001";
const ACCOUNT_SERVICE_URL  = process.env.ACCOUNT_SERVICE_URL  || "http://account-service:3002";
const QUANTUM_SERVICE_URL  = process.env.QUANTUM_SERVICE_URL  || "http://quantum-service:3005";
const KMS_SERVICE_URL      = process.env.KMS_SERVICE_URL      || "http://kms-service:3006";

// ── Proxy helper ──────────────────────────────────────────────────
const proxy = async (res, fn) => {
  try {
    const result = await fn();
    res.status(result.status).json(result.data);
  } catch (err) {
    const status = err.response?.status || 500;
    const data   = err.response?.data   || { message: err.message };
    res.status(status).json(data);
  }
};

const authHeader = (req) => ({
  Authorization: req.headers.authorization || "",
});

// ── AUTH → identity-service ───────────────────────────────────────
// Customer login
app.post("/auth/customer/login", (req, res) =>
  proxy(res, () => axios.post(`${IDENTITY_SERVICE_URL}/auth/customer/login`, req.body))
);

// Staff login
app.post("/auth/staff/login", (req, res) =>
  proxy(res, () => axios.post(`${IDENTITY_SERVICE_URL}/auth/staff/login`, req.body))
);

app.get("/auth/me", (req, res) =>
  proxy(res, () =>
    axios.get(`${IDENTITY_SERVICE_URL}/auth/me`, { headers: authHeader(req) })
  )
);

// Refresh access token
app.post("/auth/refresh", (req, res) =>
  proxy(res, () => axios.post(`${IDENTITY_SERVICE_URL}/auth/refresh`, req.body))
);

// Logout (revoke refresh token)
app.post("/auth/logout", (req, res) =>
  proxy(res, () => axios.post(`${IDENTITY_SERVICE_URL}/auth/logout`, req.body))
);

// ── ADMIN → identity-service ──────────────────────────────────────
app.post("/admin/users", (req, res) =>
  proxy(res, () =>
    axios.post(`${IDENTITY_SERVICE_URL}/admin/users`, req.body, { headers: authHeader(req) })
  )
);
app.get("/admin/users", (req, res) =>
  proxy(res, () =>
    axios.get(`${IDENTITY_SERVICE_URL}/admin/users`, {
      headers: authHeader(req),
      params: req.query,
    })
  )
);
app.delete("/admin/users/:id", (req, res) =>
  proxy(res, () =>
    axios.delete(`${IDENTITY_SERVICE_URL}/admin/users/${req.params.id}`, {
      headers: authHeader(req),
    })
  )
);

// ── ACCOUNT → account-service ─────────────────────────────────────
app.get("/balance", (req, res) =>
  proxy(res, () =>
    axios.get(`${ACCOUNT_SERVICE_URL}/balance`, { headers: authHeader(req) })
  )
);

app.get("/transactions", (req, res) =>
  proxy(res, () =>
    axios.get(`${ACCOUNT_SERVICE_URL}/transactions`, { headers: authHeader(req) })
  )
);

app.get("/transactions/:id", (req, res) =>
  proxy(res, () =>
    axios.get(`${ACCOUNT_SERVICE_URL}/transactions/${req.params.id}`, { headers: authHeader(req) })
  )
);

app.post("/transactions", (req, res) =>
  proxy(res, () =>
    axios.post(`${ACCOUNT_SERVICE_URL}/transactions`, req.body, { headers: authHeader(req) })
  )
);

app.get("/admin/accounts/:accountId", (req, res) =>
  proxy(res, () =>
    axios.get(`${ACCOUNT_SERVICE_URL}/admin/accounts/${req.params.accountId}`, { headers: authHeader(req) })
  )
);
app.put("/auth/me", (req, res) =>
  proxy(res, () =>
    axios.put(
      `${IDENTITY_SERVICE_URL}/auth/me`,
      req.body,
      { headers: authHeader(req) }
    )
  )
);
// GET user by id
app.get("/admin/users/:id", (req, res) =>
  proxy(res, () =>
    axios.get(`${IDENTITY_SERVICE_URL}/admin/users/${req.params.id}`, {
      headers: authHeader(req),
    })
  )
);

// UPDATE user
app.put("/admin/users/:id", (req, res) =>
  proxy(res, () =>
    axios.put(
      `${IDENTITY_SERVICE_URL}/admin/users/${req.params.id}`,
      req.body,
      { headers: authHeader(req) }
    )
  )
);
app.post("/admin/deposit", (req, res) =>
  proxy(res, () =>
    axios.post(`${ACCOUNT_SERVICE_URL}/deposit`, req.body, { headers: authHeader(req) })
  )
);
app.post("/withdraw", (req, res) =>
  proxy(res, () =>
    axios.post(`${ACCOUNT_SERVICE_URL}/withdraw`, req.body, {
      headers: authHeader(req),
      timeout: 15000,
    })
  )
);
app.post("/transfer", (req, res) =>
  proxy(res, () =>
    axios.post(`${ACCOUNT_SERVICE_URL}/transfer`, req.body, {
      headers: authHeader(req),
      timeout: 15000, // 15s timeout for transfer operations
    })
  )
);

// ── QUANTUM → quantum-service (Phase 3) ───────────────────────────
app.get("/quantum/backend", (req, res) =>
  proxy(res, () => axios.get(`${QUANTUM_SERVICE_URL}/backend`))
);
app.get("/quantum/qrng", (req, res) =>
  proxy(res, () => axios.get(`${QUANTUM_SERVICE_URL}/qrng`, { params: req.query }))
);
app.post("/quantum/qkd/bb84", (req, res) =>
  proxy(res, () => axios.post(`${QUANTUM_SERVICE_URL}/qkd/bb84`, req.body, { timeout: 60000 }))
);
// PNG passthrough — proxy() expects JSON, so handle separately.
app.get("/quantum/qkd/visualize", async (req, res) => {
  try {
    const r = await axios.get(`${QUANTUM_SERVICE_URL}/qkd/visualize`, {
      params: req.query, responseType: "arraybuffer", timeout: 30000,
    });
    res.set("Content-Type", "image/png").status(r.status).send(Buffer.from(r.data));
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message });
  }
});

// ── KMS → kms-service (Phase 3.4) ─────────────────────────────────
app.post("/kms/keys", (req, res) =>
  proxy(res, () => axios.post(`${KMS_SERVICE_URL}/kms/keys`, req.body, {
    headers: authHeader(req), timeout: 60000,
  }))
);
app.get("/kms/keys/:kid", (req, res) =>
  proxy(res, () => axios.get(`${KMS_SERVICE_URL}/kms/keys/${req.params.kid}`, {
    headers: authHeader(req),
  }))
);

// ── Health ────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "gateway running" }));

// ── Start ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));

module.exports = app;