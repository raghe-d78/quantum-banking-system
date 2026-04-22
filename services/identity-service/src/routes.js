// identity-service/src/routes.js
const express     = require("express")
const router      = express.Router()
const authService = require("./auth.service")
const { authenticate, requireAdmin } = require("./middleware/auth.middleware")

// ── Public ─────────────────────────────────────────────────────────

// POST /auth/login  { username, password }
// Returns { token, user: { id, username, email, name, role } }
router.post("/auth/login", async (req, res) => {
  try {
    const result = await authService.login(req.body)
    res.json(result)
  } catch (err) {
    console.error("Error in /auth/login:", err)
    res.status(401).json({ message: err.message })
  }
})

// ── Admin only ─────────────────────────────────────────────────────

// POST /admin/users  { username, email, name, password, role? }
// Creates a new user — admin JWT required
// After creation, Account Service will be notified via event/HTTP
router.post("/admin/users", authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await authService.createUser(req.body)
    res.status(201).json(result)
  } catch (err) {
    console.error("Error in /admin/users:", err)
    res.status(400).json({ message: err.message })
  }
})

// ── Protected (any authenticated user) ────────────────────────────

// GET /auth/me — returns current user info from token
router.get("/auth/me", authenticate, async (req, res) => {
  try {
    const userRepo = require("./user.repository")
    const user     = await userRepo.findById(req.user.userId)
    if (!user) return res.status(404).json({ message: "User not found" })
    res.json({ user })
  } catch (err) {
    console.error("Error in /auth/me:", err)
    res.status(500).json({ message: err.message })
  }
})

module.exports = router