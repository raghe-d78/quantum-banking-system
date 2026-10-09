// services/account-service/src/transaction.service.js — read side for customers.
const { E } = require("/shared/errors")
const accountRepo = require("./repositories/account.repository")
const ledgerRepo  = require("./repositories/ledger.repository")
const { pool, T } = require("./repositories/pool")

const VALID_TYPES  = ["CREDIT", "DEBIT"]
const VALID_ORDERS = ["ASC", "DESC"]
const MAX_LIMIT    = 100
const ISO_DATE     = /^\d{4}-\d{2}-\d{2}$/

exports.listTransactions = async (userId, filters = {}) => {
  const account = await accountRepo.findByUserId(userId)
  if (!account) throw E.notFound("Account not found")
  return exports.listForAccount(account.id, filters)
}

exports.listForAccount = async (accountId, filters = {}) => {
  const { type, txType, dateFrom, dateTo, minAmount, maxAmount, initiatedBy, limit = 20, offset = 0, order = "DESC" } = filters
  const params = [accountId]
  let sql = `SELECT id, transaction_id, account_id, type, tx_type, amount, balance_snapshot,
                    reference, compensates, initiated_by, created_at
               FROM ${T.ledger} WHERE account_id = $1`

  if (type && VALID_TYPES.includes(String(type).toUpperCase())) { params.push(String(type).toUpperCase()); sql += ` AND type = $${params.length}` }
  if (txType && ledgerRepo.TX_TYPES.includes(String(txType).toUpperCase())) { params.push(String(txType).toUpperCase()); sql += ` AND tx_type = $${params.length}` }
  if (dateFrom) { if (!ISO_DATE.test(dateFrom)) throw E.validation("dateFrom must be YYYY-MM-DD"); params.push(dateFrom); sql += ` AND created_at >= $${params.length}::DATE` }
  if (dateTo)   { if (!ISO_DATE.test(dateTo))   throw E.validation("dateTo must be YYYY-MM-DD");   params.push(dateTo);   sql += ` AND created_at < $${params.length}::DATE + INTERVAL '1 day'` }
  if (minAmount !== undefined && minAmount !== "") { const v = Number(minAmount); if (!Number.isFinite(v)) throw E.validation("minAmount must be numeric"); params.push(v); sql += ` AND amount >= $${params.length}` }
  if (maxAmount !== undefined && maxAmount !== "") { const v = Number(maxAmount); if (!Number.isFinite(v)) throw E.validation("maxAmount must be numeric"); params.push(v); sql += ` AND amount <= $${params.length}` }
  if (initiatedBy === "staff")    sql += ` AND tx_type IN ('DEPOSIT','CANCELLATION')`
  if (initiatedBy === "customer") sql += ` AND tx_type IN ('WITHDRAW','TRANSFER','BILL_PAYMENT','MERCHANT_PAYMENT')`

  const safeOrder  = VALID_ORDERS.includes(String(order).toUpperCase()) ? String(order).toUpperCase() : "DESC"
  const safeLimit  = Math.min(Math.max(parseInt(limit, 10) || 20, 1), MAX_LIMIT)
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0)
  params.push(safeLimit, safeOffset)
  sql += ` ORDER BY created_at ${safeOrder}, id ${safeOrder} LIMIT $${params.length - 1} OFFSET $${params.length}`

  const { rows } = await pool.query(sql, params)
  return rows.map(formatTx)
}

exports.getTransaction = async (userId, txId) => {
  const account = await accountRepo.findByUserId(userId)
  if (!account) throw E.notFound("Account not found")
  const tx = await ledgerRepo.findById(txId)
  if (!tx) throw E.notFound("Transaction not found")
  if (tx.account_id !== account.id) throw E.forbidden("Access denied")
  return formatTx(tx)
}

const INITIATOR = { DEPOSIT: "Staff", CANCELLATION: "Staff", WITHDRAW: "Customer", TRANSFER: "Customer", BILL_PAYMENT: "Customer", MERCHANT_PAYMENT: "Customer" }

const formatTx = (tx) => ({
  id:              tx.id,
  transactionId:   tx.transaction_id,
  accountId:       tx.account_id,
  type:            tx.type,
  txType:          tx.tx_type,
  amount:          parseFloat(tx.amount),
  balanceSnapshot: parseFloat(tx.balance_snapshot),
  reference:       tx.reference ?? null,
  compensates:     tx.compensates ?? null,
  date:            new Date(tx.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
  createdAt:       tx.created_at,
  initiatedBy:     INITIATOR[tx.tx_type] || "Customer",
})
exports.formatTx = formatTx
