// services/account-service/src/routes.js
const express     = require("express")
const router      = express.Router()
const axios = require("axios")
const accountService = require("./account.service")
const accountRepo = require("./account.repository")
const { authenticate, requireAdmin, requireStaff } = require("./middleware/auth.middleware")
const txService      = require("./transaction.service");
const exportService  = require("./Export.service");
const IDENTITY_SERVICE_URL = process.env.IDENTITY_SERVICE_URL || "http://identity-service:3001"

const resolveStaffLookup = async (lookup, authHeader) => {
  const directAccount = await accountRepo.findById(lookup)
  if (directAccount) {
    return { account: directAccount, user: null }
  }

  let data
  try {
    ({ data } = await axios.get(
      `${IDENTITY_SERVICE_URL}/admin/users/lookup/${encodeURIComponent(lookup)}`,
      { headers: authHeader }
    ))
  } catch (err) {
    if (err.response?.status === 404) {
      return null
    }
    throw err
  }

  const user = data?.user
  if (!user) {
    return null
  }

  const account = await accountRepo.findByUserId(user.id)
  if (!account) {
    return null
  }

  return { account, user }
}

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

// verify account's existence (used by staff frontend)
router.get("/admin/accounts/:accountId", authenticate, requireStaff, async (req, res) => {
  try {
    console.log("Admin checking account ID:", req.params.accountId)
    const resolved = await resolveStaffLookup(req.params.accountId, {
      Authorization: req.headers.authorization || ""
    })

    if (!resolved) {
      return res.status(404).json({ message: "Account not found" })
    }

    const { account, user } = resolved
    res.json({
      accountId: account.id,
      userId: account.user_id,
      username: user?.username,
      name: user?.name || user?.username || "Customer",
      currency: account.currency,
      balance: Number(account.cached_balance),
    })
  } catch (err) {
    console.error("Error in /admin/accounts/:accountId:", err)
    res.status(400).json({ message: err.message })
  }
})
// services/account-service/src/routes.js

// ✅ Public endpoint for customers to verify recipient accounts
router.get("/accounts/verify/:accountId", authenticate, async (req, res) => {
  try {
    const account = await accountRepo.findById(req.params.accountId);
    
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }
    
    // Fetch user info from identity service if needed
    let userInfo = null;
    try {
      const { data } = await axios.get(
        `${process.env.IDENTITY_SERVICE_URL}/admin/users/${account.user_id}`,
        { headers: { Authorization: req.headers.authorization } }
      );
      userInfo = data;
    } catch (err) {
      // Silently continue if identity service fails
    }
    
    res.json({
      accountId: account.id,
      userId: account.user_id,
      name: userInfo?.name || userInfo?.username || `Account ${account.id.slice(0, 8)}`,
      currency: account.currency,
    });
    
  } catch (err) {
    console.error("Account verification error:", err);
    res.status(500).json({ message: err.message });
  }
});

// ── Transactions ───────────────────────────────────────────────────
// GET /transactions?type=CREDIT&dateFrom=2026-01-01&dateTo=2026-03-31
//                  &minAmount=100&maxAmount=500&initiatedBy=staff
//                  &limit=20&offset=0&order=DESC
router.get("/transactions", authenticate, async (req, res) => {
  try {
    const txs = await txService.listTransactions(req.user.userId, req.query);
    res.json({ transactions: txs, count: txs.length });
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
});
 
// GET /transactions/export?format=csv|pdf  (must be BEFORE /:id route)
router.get("/transactions/export", authenticate, async (req, res) => {
  const format = (req.query.format ?? "csv").toLowerCase();
 
  try {
    if (format === "csv") {
      const csv = await exportService.exportCSV(req.user.userId, req.query);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition",
        `attachment; filename="transactions_${Date.now()}.csv"`);
      return res.send(csv);
    }
 
    if (format === "pdf") {
      const html = await exportService.exportPDF(
        req.user.userId, req.query,
        { name: req.user.name, email: req.user.email }
      );
      // Return HTML for browser print (client calls window.print())
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Content-Disposition",
        `inline; filename="statement_${Date.now()}.html"`);
      return res.send(html);
    }
 
    res.status(400).json({ message: `Unsupported format: ${format}. Use csv or pdf.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
 
// GET /transactions/:id
router.get("/transactions/:id", authenticate, async (req, res) => {
  try {
    res.json({ transaction: await txService.getTransaction(req.user.userId, req.params.id) });
  } catch (err) {
    const status = err.message.includes("not found") ? 404
                 : err.message.includes("denied")    ? 403 : 500;
    res.status(status).json({ message: err.message });
  }
});
 
// ── Admin: lookup account by IBAN (for deposit page recipient verify) ──
router.get("/admin/accounts/:id", authenticate, requireStaff, async (req, res) => {
  try {
    const account = await accountService.findAccountById(req.params.id);
    res.json(account);
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
});
 

// Health check
router.get("/health", (req, res) => res.json({ status: "account-service running" }))

module.exports = router