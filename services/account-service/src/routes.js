// services/account-service/src/routes.js
const express     = require("express")
const router      = express.Router()
const accountService = require("./account.service")
const { authenticate, requireAdmin } = require("./middleware/auth.middleware")

// POST /accounts/create
// Called internally by identity-service when a new customer is created
// Body: { userId, currency? }
router.post("/accounts/create", authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await accountService.createAccount(req.body)
    res.status(201).json(result)
  } catch (err) {
    res.status(400).json({ message: err.message })
  }
})

// GET /balance
// Called by customer frontend — extracts userId from JWT
router.get("/balance", authenticate, async (req, res) => {
  try {
    const result = await accountService.getBalance(req.user.userId)
    res.json(result)
  } catch (err) {
    res.status(404).json({ message: err.message })
  }
})

// Health check
router.get("/health", (req, res) => res.json({ status: "account-service running" }))

module.exports = router