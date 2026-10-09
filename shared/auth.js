// shared/auth.js
//
// JWT verification + RBAC middleware shared by every Node service. Access
// tokens are HS256-signed by identity-service with JWT_SECRET; every service
// that verifies them must run with the same secret.
//
// Roles: "admin" > "employee" > "customer". Staff = admin | employee.
// Internal service-to-service calls use a short-lived token with
// `{ sub: "system", role: "admin", internal: true }`.

const jwt = require("jsonwebtoken")

const JWT_SECRET = process.env.JWT_SECRET || "supersecret_change_in_prod"
const STAFF_ROLES = ["admin", "employee"]
const ALL_ROLES   = ["admin", "employee", "customer"]

if (process.env.NODE_ENV === "production" && JWT_SECRET === "supersecret_change_in_prod") {
  // Fail loudly rather than run a bank with a default secret.
  throw new Error("JWT_SECRET must be set in production")
}

function extractBearer(req) {
  const header = req.headers.authorization
  if (!header || !header.startsWith("Bearer ")) return null
  return header.slice(7).trim() || null
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] })
}

function authenticate(req, res, next) {
  const token = extractBearer(req)
  if (!token) return res.status(401).json({ message: "Missing or invalid token" })
  try {
    const payload = verifyToken(token)
    if (!payload.userId || !ALL_ROLES.includes(payload.role))
      return res.status(401).json({ message: "Token expired or invalid" })
    req.user = payload
    return next()
  } catch {
    return res.status(401).json({ message: "Token expired or invalid" })
  }
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role))
    return res.status(403).json({ message: roles.includes("customer") ? "Access denied" : (roles.length === 1 && roles[0] === "admin" ? "Admin access required" : "Staff access required") })
  return next()
}

const requireAdmin = requireRole("admin")
const requireStaff = requireRole(...STAFF_ROLES)

const isStaff = (user) => !!user && STAFF_ROLES.includes(user.role)

// Mint a short-lived internal token for service-to-service calls.
function signInternalToken(ttl = "60s") {
  return jwt.sign({ userId: "system", role: "admin", internal: true }, JWT_SECRET, { expiresIn: ttl })
}

module.exports = {
  authenticate, requireAdmin, requireStaff, requireRole, isStaff,
  signInternalToken, verifyToken, extractBearer,
  STAFF_ROLES, ALL_ROLES, JWT_SECRET,
}
