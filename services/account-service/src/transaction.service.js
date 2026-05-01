// services/account-service/src/transaction.service.js
const ledgerRepo  = require("./repositories/ledger.repository");
const accountRepo = require("./repositories/account.repository");

const VALID_TYPES  = ["CREDIT", "DEBIT"];
const VALID_ORDERS = ["ASC", "DESC"];

// ── GET /transactions ─────────────────────────────────────────────
// Filters: type, dateFrom, dateTo, minAmount, maxAmount, initiatedBy, limit, offset
exports.listTransactions = async (userId, filters = {}) => {
  const account = await accountRepo.findByUserId(userId);
  if (!account) throw new Error("Account not found");

  const {
    type, dateFrom, dateTo, minAmount, maxAmount,
    initiatedBy, limit = 20, offset = 0, order = "DESC",
  } = filters;

  const params  = [account.id];
  let query = `
    SELECT id, account_id, type, amount, balance_snapshot,
           reference, created_at
    FROM ledger_entries
    WHERE account_id = $1
  `;

  if (type && VALID_TYPES.includes(type.toUpperCase())) {
    params.push(type.toUpperCase());
    query += ` AND type = $${params.length}`;
  }
  if (dateFrom) {
    params.push(dateFrom);
    query += ` AND created_at >= $${params.length}`;
  }
  if (dateTo) {
    params.push(dateTo);
    query += ` AND created_at <= $${params.length}::date + interval '1 day'`;
  }
  if (minAmount) {
    params.push(parseFloat(minAmount));
    query += ` AND amount >= $${params.length}`;
  }
  if (maxAmount) {
    params.push(parseFloat(maxAmount));
    query += ` AND amount <= $${params.length}`;
  }
  // NOTE: initiatedBy filter is derived from reference text (no DB column for it).
  // Transfers/deposits are heuristically classified at format-time via deriveInitiator().
  if (initiatedBy === "staff" || initiatedBy === "customer") {
    // Apply post-filter after rows are fetched to avoid querying a non-existent column.
  }

  const safeOrder = VALID_ORDERS.includes(order.toUpperCase()) ? order.toUpperCase() : "DESC";
  query += ` ORDER BY created_at ${safeOrder}`;

  const safeLimit  = Math.min(parseInt(limit)  || 20, 100);
  const safeOffset = Math.max(parseInt(offset) || 0,  0);
  params.push(safeLimit, safeOffset);
  query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const ledgerRepoModule = require("./repositories/ledger.repository");
  const { rows } = await ledgerRepoModule.pool.query(query, params);
  let formatted = rows.map(formatTx);
  if (initiatedBy === "staff") {
    formatted = formatted.filter(tx => tx.initiatedBy === "Staff");
  } else if (initiatedBy === "customer") {
    formatted = formatted.filter(tx => tx.initiatedBy === "Customer");
  }
  return formatted;
};

// ── GET /transactions/:id ─────────────────────────────────────────
exports.getTransaction = async (userId, txId) => {
  const account = await accountRepo.findByUserId(userId);
  if (!account) throw new Error("Account not found");

  const tx = await ledgerRepo.findById(txId);
  if (!tx) throw new Error("Transaction not found");

  // Ownership check — tx must belong to this user's account
  if (tx.account_id !== account.id)
    throw new Error("Access denied");

  return formatTx(tx);
};

// ── Helpers ───────────────────────────────────────────────────────
// Heuristic: deposits are staff-initiated; withdrawals/transfers initiated by customer.
const deriveInitiator = (tx) => {
  const ref = (tx.reference || "").toLowerCase();
  if (tx.type === "CREDIT" && !ref.startsWith("transfer")) return "Staff";
  return "Customer";
};

// ── Formatter ─────────────────────────────────────────────────────
const formatTx = (tx) => ({
  id:              tx.id,
  accountId:       tx.account_id,
  type:            tx.type,
  amount:          parseFloat(tx.amount),
  balanceSnapshot: parseFloat(tx.balance_snapshot),
  reference:       tx.reference ?? null,
  date:            new Date(tx.created_at).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }),
  createdAt:       tx.created_at,
  initiatedBy:     deriveInitiator(tx),
});