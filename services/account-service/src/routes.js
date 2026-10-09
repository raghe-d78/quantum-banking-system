// services/account-service/src/routes.js
const express = require("express")
const axios   = require("axios")
const router  = express.Router()
const { authenticate, requireAdmin, requireStaff, isStaff } = require("/shared/auth")
const { E } = require("/shared/errors")
const accountService = require("./account.service")
const accountRepo    = require("./repositories/account.repository")
const outboxRepo     = require("./repositories/outbox.repository")
const txService      = require("./transaction.service")
const exportService  = require("./Export.service")

const IDENTITY_SERVICE_URL = process.env.IDENTITY_SERVICE_URL || "http://identity-service:3001"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Wrap async handlers so thrown AppErrors reach the error middleware.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

const identity = (path, authHeader) =>
  axios.get(`${IDENTITY_SERVICE_URL}${path}`, { headers: { Authorization: authHeader || "" }, timeout: 5000 })

// Resolve a staff lookup value (account UUID, user UUID, username or email).
async function resolveStaffLookup(lookup, authHeader) {
  if (UUID_RE.test(lookup)) {
    const direct = await accountRepo.findById(lookup)
    if (direct) return { account: direct, user: null }
  }
  let data
  try { ({ data } = await identity(`/admin/users/lookup/${encodeURIComponent(lookup)}`, authHeader)) }
  catch (err) { if (err.response?.status === 404) return null; throw err }
  const user = data?.user
  if (!user) return null
  const account = await accountRepo.findByUserId(user.id)
  return account ? { account, user } : null
}

// ── internal: identity-service creates the account for a new customer ──
router.post("/accounts/create", authenticate, requireAdmin, wrap(async (req, res) => {
  const result = await accountService.createAccount(req.body || {})
  res.status(201).json(result)
}))

// ── customer ──────────────────────────────────────────────────────
router.get("/balance", authenticate, wrap(async (req, res) => {
  res.json(await accountService.getBalance(req.user.userId))
}))

router.post("/withdraw", authenticate, wrap(async (req, res) => {
  const { amount, note } = req.body || {}
  res.json(await accountService.withdraw(req.user.userId, amount, note))
}))

router.post("/transfer", authenticate, wrap(async (req, res) => {
  const { sourceAccountId, destinationAccountId, amount, reference } = req.body || {}
  const result = await accountService.transfer(sourceAccountId, destinationAccountId, amount, {
    reference, actor: req.user,
  })
  res.status(200).json({ success: true, data: result })
}))

// Recipient check before a transfer: only non-sensitive fields are returned.
router.get("/accounts/verify/:accountId", authenticate, wrap(async (req, res) => {
  const account = await accountRepo.findById(req.params.accountId)
  if (!account) throw E.notFound("Account not found")
  let name = null
  try {
    const { data } = await identity(`/users/${account.user_id}/display-name`, req.headers.authorization)
    name = data?.name || null
  } catch (_) { /* identity down → fall back to masked id */ }
  res.json({
    accountId: account.id,
    name: name || `Account ${account.id.slice(0, 8)}`,
    currency: account.currency,
    status: account.status || "ACTIVE",
  })
}))

// ── payees (billers / merchants) ──────────────────────────────────
router.get("/payees", authenticate, wrap(async (req, res) => {
  const payees = await accountService.listPayees({ kind: req.query.kind })
  res.json({ payees: payees.map(p => ({ code: p.code, name: p.name, kind: p.kind, category: p.category, referenceHint: p.reference_hint })) })
}))

// ── unified transaction creation ──────────────────────────────────
// Body: { kind: TRANSFER|BILL_PAYMENT|MERCHANT_PAYMENT|WITHDRAW, amount, … }
// Optional header Idempotency-Key makes retries safe.
router.post("/transactions", authenticate, wrap(async (req, res) => {
  const key = req.get("Idempotency-Key") || null
  const result = await accountService.createTransaction(req.user, req.body || {}, key)
  res.status(result.replayed ? 200 : 201).json({ success: true, data: result })
}))

// ── transactions (read side) ──────────────────────────────────────
router.get("/transactions", authenticate, wrap(async (req, res) => {
  const txs = await txService.listTransactions(req.user.userId, req.query)
  res.json({ transactions: txs, count: txs.length })
}))

router.get("/transactions/export", authenticate, wrap(async (req, res) => {
  const format = String(req.query.format ?? "csv").toLowerCase()
  if (format === "csv") {
    const csv = await exportService.exportCSV(req.user.userId, req.query)
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", `attachment; filename="transactions_${Date.now()}.csv"`)
    return res.send(csv)
  }
  if (format === "pdf") {
    let userInfo = {}
    try { ({ data: { user: userInfo } } = await identity("/auth/me", req.headers.authorization)) } catch (_) {}
    const html = await exportService.exportPDF(req.user.userId, req.query, { name: userInfo?.name, email: userInfo?.email })
    res.setHeader("Content-Type", "text/html; charset=utf-8")
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'")
    return res.send(html)
  }
  throw E.validation(`Unsupported format: ${format}. Use csv or pdf.`)
}))

router.get("/transactions/:id", authenticate, wrap(async (req, res) => {
  res.json({ transaction: await txService.getTransaction(req.user.userId, req.params.id) })
}))

// ── staff ─────────────────────────────────────────────────────────
router.post("/deposit", authenticate, requireStaff, wrap(async (req, res) => {
  const { accountId, amount, note } = req.body || {}
  res.json(await accountService.deposit(accountId, amount, { actor: req.user, note }))
}))

router.get("/admin/accounts/:accountId", authenticate, requireStaff, wrap(async (req, res) => {
  const resolved = await resolveStaffLookup(req.params.accountId, req.headers.authorization)
  if (!resolved) throw E.notFound("Account not found")
  const { account, user } = resolved
  res.json({
    accountId: account.id,
    userId:    account.user_id,
    username:  user?.username,
    name:      user?.name || user?.username || "Customer",
    currency:  account.currency,
    status:    account.status || "ACTIVE",
    balance:   Number(account.cached_balance),
  })
}))

router.get("/admin/accounts/:accountId/transactions", authenticate, requireStaff, wrap(async (req, res) => {
  const account = await accountRepo.findById(req.params.accountId)
  if (!account) throw E.notFound("Account not found")
  const txs = await txService.listForAccount(account.id, req.query)
  res.json({ transactions: txs, count: txs.length })
}))

router.post("/admin/transactions/:id/cancel", authenticate, requireStaff, wrap(async (req, res) => {
  const result = await accountService.cancelTransaction(req.params.id, {
    reason: req.body?.reason, cancelledBy: req.user.userId,
  })
  res.status(200).json(result)
}))

router.get("/admin/outbox/stats", authenticate, requireStaff, wrap(async (_req, res) => {
  res.json(await outboxRepo.stats())
}))

// ── health ────────────────────────────────────────────────────────
router.get("/health", (_req, res) => res.json({ status: "account-service running" }))
router.get("/ready", wrap(async (_req, res) => {
  await accountRepo.pool.query("SELECT 1")
  res.json({ status: "ready" })
}))

module.exports = router
module.exports._isStaff = isStaff
