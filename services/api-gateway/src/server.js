// services/api-gateway/src/server.js
const express = require("express");
const cors    = require("cors");
const axios   = require("axios");

const app = express();

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

// ── Service URLs ──────────────────────────────────────────────────
const IDENTITY = process.env.IDENTITY_SERVICE_URL || "http://identity-service:3001";
const ACCOUNT  = process.env.ACCOUNT_SERVICE_URL  || "http://account-service:3002";

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
app.post("/auth/login", (req, res) =>
  proxy(res, () => axios.post(`${IDENTITY}/auth/login`, req.body))
);

app.get("/auth/me", (req, res) =>
  proxy(res, () =>
    axios.get(`${IDENTITY}/auth/me`, { headers: authHeader(req) })
  )
);

// ── ADMIN → identity-service ──────────────────────────────────────
app.post("/admin/users", (req, res) =>
  proxy(res, () =>
    axios.post(`${IDENTITY}/admin/users`, req.body, { headers: authHeader(req) })
  )
);

// ── ACCOUNT → account-service ─────────────────────────────────────
app.get("/balance", (req, res) =>
  proxy(res, () =>
    axios.get(`${ACCOUNT}/balance`, { headers: authHeader(req) })
  )
);

app.get("/transactions", (req, res) =>
  proxy(res, () =>
    axios.get(`${ACCOUNT}/transactions`, { headers: authHeader(req) })
  )
);

app.get("/transactions/:id", (req, res) =>
  proxy(res, () =>
    axios.get(`${ACCOUNT}/transactions/${req.params.id}`, { headers: authHeader(req) })
  )
);

app.post("/transactions", (req, res) =>
  proxy(res, () =>
    axios.post(`${ACCOUNT}/transactions`, req.body, { headers: authHeader(req) })
  )
);

// ── Health ────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "gateway running" }));

// ── Start ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));

module.exports = app;