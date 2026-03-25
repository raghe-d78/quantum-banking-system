// services/identity-service/src/auth.service.js
const bcrypt   = require("bcrypt")
const jwt      = require("jsonwebtoken")
const axios    = require("axios")
const userRepo = require("./user.repository")

const JWT_SECRET      = process.env.JWT_SECRET      || "supersecret_change_in_prod"
const JWT_EXPIRES     = process.env.JWT_EXPIRES     || "24h"
const ACCOUNT_SERVICE = process.env.ACCOUNT_SERVICE_URL || "http://account-service:3002"

// ── Helpers ────────────────────────────────────────────────────────
const signToken = (user) =>
  jwt.sign(
    { userId: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  )

const safeUser = (user) => ({
  id:       user.id,
  username: user.username,
  email:    user.email,
  name:     user.name,
  role:     user.role,
})

// ── Login ──────────────────────────────────────────────────────────
exports.login = async ({ username, password }) => {
  if (!username || !password)
    throw new Error("Username and password are required")

  const user =
    (await userRepo.findByUsername(username)) ||
    (await userRepo.findByEmail(username))

  if (!user) throw new Error("Invalid credentials")

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid)  throw new Error("Invalid credentials")

  const token = signToken(user)
  return { token, user: safeUser(user) }
}

// ── Create user (admin only) ───────────────────────────────────────
// role: "customer" | "employee" | "admin"
exports.createUser = async ({ username, email, name, password, role = "customer" }) => {
  if (!username || !email || !name || !password)
    throw new Error("username, email, name and password are required")

  if (!["admin", "employee", "customer"].includes(role))
    throw new Error("Invalid role. Must be: admin, employee or customer")

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await userRepo.create({ username, email, name, passwordHash, role })

  // If role is "customer" → automatically create a bank account
  if (role === "customer") {
    try {
      const internalToken = jwt.sign(
        { userId: "system", role: "admin" },
        JWT_SECRET,
        { expiresIn: "1m" }
      )
      await axios.post(
        `${ACCOUNT_SERVICE}/accounts/create`,
        { userId: user.id, currency: "TND" },
        { headers: { Authorization: `Bearer ${internalToken}` } }
      )
    } catch (err) {
      console.error("Failed to create bank account:", err.message)
    }
  }

  return { user: safeUser(user) }
}