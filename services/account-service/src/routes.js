// services/account-service/src/routes.js
const express     = require("express")
const router      = express.Router()
const accountService = require("./account.service")
const accountRepo = require("./account.repository")
const { authenticate, requireAdmin, requireStaff } = require("./middleware/auth.middleware")

// POST /accounts/create
// Called internally by identity-service when a new customer is created
// Body: { userId, currency? }
router.post("/accounts/create", authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await accountService.createAccount(req.body)
    res.status(201).json(result)
  } catch (err) {
    console.error("Error in /accounts/create:", err)
    res.status(400).json({ message: err.message })
  }
})

// GET /balance
// Called by customer frontend — extracts userId from JWT
router.get("/balance", authenticate, async (req, res) => {
  try {
    console.log("Getting balance for userId:", req.user.userId)
    const result = await accountService.getBalance(req.user.userId)
    res.json(result)
  } catch (err) {
    console.error("Error in /balance:", err)
    res.status(404).json({ message: err.message })
  }
})


// POST /deposit
router.post("/deposit", authenticate, requireStaff, async (req, res) => {
  try {
    const { accountId, amount } = req.body

    const result = await accountService.deposit(accountId, amount)

    res.json(result)
  } catch (err) {
    console.error("Error in /deposit:", err)
    res.status(400).json({
      error: err.message
    })
  }
})

// POST /withdraw
router.post("/customer/withdraw", authenticate, async (req, res) => {
  try {
    const { amount, note } = req.body
    const result = await accountService.withdraw(req.user.userId, amount, note)
    res.json(result)
  } catch (err) {
    console.error("Error in /withdraw:", err)
    res.status(400).json({
      message: err.message
    })
  }
})

// verify account's existence (used by staff frontend)
router.get("/admin/accounts/:accountId", authenticate, requireStaff, async (req, res) => {
  try {
    console.log("Admin checking account ID:", req.params.accountId)
    const account = await accountRepo.findById(req.params.accountId)
    if (!account) {
      return res.status(404).json({ message: "Account not found" })
    }
    res.json({ name: account.username || account.name || "Customer" })
  } catch (err) {
    console.error("Error in /admin/accounts/:accountId:", err)
    res.status(400).json({ message: err.message })
  }
})


// Health check
router.get("/health", (req, res) => res.json({ status: "account-service running" }))

module.exports = router