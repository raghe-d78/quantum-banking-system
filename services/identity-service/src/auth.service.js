// services/identity-service/src/auth.service.js
const bcrypt   = require("bcrypt")
const crypto   = require("crypto")
const jwt      = require("jsonwebtoken")
const axios    = require("axios")
const userRepo = require("./user.repository")
const refreshRepo = require("./refreshToken.repository")
const { signInternalToken } = require("/shared/auth")

const JWT_SECRET         = process.env.JWT_SECRET         || "supersecret_change_in_prod"
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (JWT_SECRET + "_refresh")
// Keep the legacy 24h default for backwards-compat with existing frontends
// that don't yet call /auth/refresh. Will be tightened to 15m in a follow-up.
const JWT_EXPIRES         = process.env.JWT_EXPIRES         || "24h"
const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || "7d"
const ACCOUNT_SERVICE     = process.env.ACCOUNT_SERVICE_URL || "http://account-service:3002"
const BCRYPT_ROUNDS       = Number(process.env.BCRYPT_ROUNDS || 12)

// ── Helpers ────────────────────────────────────────────────────────
const signAccessToken = (user) =>
  jwt.sign(
    { userId: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  )

// Refresh tokens carry only userId; role is re-read from DB on refresh
// so that role changes (e.g. admin demotion) take effect within 15 min.
const signRefreshToken = (user) => {
  const jti = crypto.randomBytes(16).toString("hex")
  return jwt.sign(
    { userId: user.id, jti },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES }
  )
}

const refreshExpiryDate = () => {
  // Parse "7d" / "15m" / "24h" → ms
  const match = /^(\d+)([smhd])$/.exec(JWT_REFRESH_EXPIRES)
  const mult  = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }
  const ms    = match ? Number(match[1]) * mult[match[2]] : 7 * 864e5
  return new Date(Date.now() + ms)
}

const issueTokenPair = async (user) => {
  const token        = signAccessToken(user)
  const refreshToken = signRefreshToken(user)
  await refreshRepo.insert({
    token: refreshToken,
    userId: user.id,
    expiresAt: refreshExpiryDate(),
  })
  return { token, refreshToken }
}

const safeUser = (user) => ({
  id:       user.id,
  username: user.username,
  email:    user.email,
  name:     user.name,
  role:     user.role,
})

// ── Login ──────────────────────────────────────────────────────────
exports.login = async ({ username, password, role }) => {
  if (!username || !password)
    throw new Error("Username and password are required")

  const user =
    (await userRepo.findByUsername(username)) ||
    (await userRepo.findByEmail(username))

  if (!user) throw new Error("Invalid credentials")

  // Role check (only when the caller pins a portal: customer vs staff).
  if (role && user.role !== role) {
    throw new Error("Access denied for this user type")
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) throw new Error("Invalid credentials")

  // Suspended users keep their row (audit trail) but cannot authenticate.
  if (user.status && user.status !== "active") {
    throw new Error("Account suspended")
  }

  const { token, refreshToken } = await issueTokenPair(user)
  return { token, refreshToken, user: safeUser(user) }
}

// ── Refresh ────────────────────────────────────────────────────────
// Verifies the refresh token, checks it's still active in the DB, then
// rotates: revokes the old row and issues a new pair.
exports.refresh = async (refreshToken) => {
  if (!refreshToken) throw new Error("refreshToken is required")

  let payload
  try {
    payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET)
  } catch {
    throw new Error("Invalid or expired refresh token")
  }

  const row = await refreshRepo.findActive(refreshToken)
  if (!row) {
    // Token signature was valid but DB row is gone/revoked → likely replay.
    // Conservative response: revoke ALL refresh tokens for this user.
    await refreshRepo.revokeAllForUser(payload.userId)
    throw new Error("Refresh token reuse detected")
  }

  const user = await userRepo.findById(payload.userId)
  if (!user) throw new Error("User no longer exists")
  if (user.status && user.status !== "active") {
    await refreshRepo.revokeAllForUser(user.id)
    throw new Error("Account suspended")
  }

  // Rotate: revoke old, issue new pair
  await refreshRepo.revoke(refreshToken)
  const fresh = await issueTokenPair(user)
  return { ...fresh, user: safeUser(user) }
}

// ── Logout ─────────────────────────────────────────────────────────
exports.logout = async (refreshToken) => {
  if (refreshToken) await refreshRepo.revoke(refreshToken)
  return { ok: true }
}

// ── Create user (admin only) ───────────────────────────────────────
// role: "customer" | "employee" | "admin"
exports.createUser = async ({ username, email, name, password, role = "customer" }) => {
  if (!username || !email || !name || !password)
    throw new Error("username, email, name and password are required")

  if (!["admin", "employee", "customer"].includes(role))
    throw new Error("Invalid role. Must be: admin, employee or customer")
  if (String(password).length < 8)
    throw new Error("Password must be at least 8 characters")
  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(String(username)))
    throw new Error("Username must be 3-50 chars: letters, digits, . _ -")
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email)))
    throw new Error("Invalid email address")

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  const user = await userRepo.create({ username, email, name, passwordHash, role })

  // If role is "customer" → automatically create a bank account
  if (role === "customer") {
    try {
      const internalToken = signInternalToken("60s")
      await axios.post(
        `${ACCOUNT_SERVICE}/accounts/create`,
        { userId: user.id, currency: "TND" },
        { headers: { Authorization: `Bearer ${internalToken}` }, timeout: 5000 }
      )
    } catch (err) {
      // Surface the failure instead of returning a customer with no account.
      console.error("Failed to create bank account:", err.message)
      const e = new Error("User created but account provisioning failed; retry account creation")
      e.code = "ACCOUNT_PROVISIONING_FAILED"
      throw e
    }
  }

  return { user: safeUser(user) }
}