// services/ledger-service/src/Ledger.repository.js
// APPEND-ONLY — no UPDATE or DELETE methods exist by design.
// Read-side queries + reconciliation across ledger_db and account_db
// (same CockroachDB cluster → fully-qualified names, one consistent read).

const createPool = require("/shared/db");
const pool = createPool("ledger_db");

const LEDGER   = "ledger_db.public.ledger_entries";
const ACCOUNTS = "account_db.public.accounts";
const VALID_TYPES = ["CREDIT", "DEBIT"];

exports.append = async ({ accountId, type, amount, balanceSnapshot, reference = null }) => {
  if (!accountId) throw new Error("accountId is required");
  if (!amount)    throw new Error("amount is required");
  if (!VALID_TYPES.includes(type)) throw new Error(`Invalid entry type: "${type}". Must be CREDIT or DEBIT`);

  const result = await pool.query(
    `INSERT INTO ${LEDGER}
       (account_id, type, amount, balance_snapshot, reference)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, account_id, type, amount, balance_snapshot, reference, created_at`,
    [accountId, type, amount, balanceSnapshot, reference]
  );
  return result.rows[0];
};

exports.findByAccountId = async (accountId, { limit = 100, offset = 0 } = {}) => {
  const result = await pool.query(
    `SELECT id, transaction_id, account_id, type, tx_type, amount, balance_snapshot,
            reference, compensates, initiated_by, document_id, created_at
       FROM ${LEDGER}
      WHERE account_id = $1
      ORDER BY created_at ASC, id ASC
      LIMIT $2 OFFSET $3`,
    [accountId, Math.min(Math.max(Number(limit) || 100, 1), 500), Math.max(Number(offset) || 0, 0)]
  );
  return result.rows;
};

exports.findById = async (id) => {
  const result = await pool.query(
    `SELECT id, transaction_id, account_id, type, tx_type, amount, balance_snapshot,
            reference, compensates, initiated_by, document_id, created_at
       FROM ${LEDGER} WHERE id = $1`,
    [id]
  );
  return result.rows[0];
};

// All legs of one business transaction (both sides of a transfer, or every
// compensating row of a cancellation).
exports.findByTransactionId = async (transactionId) => {
  const result = await pool.query(
    `SELECT id, transaction_id, account_id, type, tx_type, amount, balance_snapshot,
            reference, compensates, initiated_by, document_id, created_at
       FROM ${LEDGER} WHERE transaction_id = $1
      ORDER BY account_id ASC, created_at ASC`,
    [transactionId]
  );
  return result.rows;
};

// Reconciliation: recompute the balance from the immutable ledger and compare
// with the cached balance in account_db. Any drift is a P1 incident.
exports.reconcile = async (accountId) => {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COALESCE(SUM(CASE WHEN type='CREDIT' THEN amount ELSE -amount END), 0)::STRING
          FROM ${LEDGER} WHERE account_id = $1)                       AS ledger_balance,
       (SELECT COUNT(*)::INT FROM ${LEDGER} WHERE account_id = $1)    AS entries,
       (SELECT cached_balance::STRING FROM ${ACCOUNTS} WHERE id = $1) AS cached_balance,
       (SELECT balance_snapshot::STRING FROM ${LEDGER} WHERE account_id = $1
          ORDER BY created_at DESC, id DESC LIMIT 1)                  AS last_snapshot`,
    [accountId]
  );
  return rows[0];
};

exports.ping = () => pool.query("SELECT 1");
