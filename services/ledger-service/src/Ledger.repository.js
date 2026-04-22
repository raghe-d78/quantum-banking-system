// services/ledger-service/src/Ledger.repository.js
// APPEND-ONLY — no UPDATE or DELETE methods exist by design

const createPool = require("/shared/db");
const pool = createPool("ledger_db");         

const VALID_TYPES = ["CREDIT", "DEBIT"];

exports.append = async ({ accountId, type, amount, balanceSnapshot, reference = null }) => {
  if (!accountId)
    throw new Error("accountId is required");
  if (!amount)
    throw new Error("amount is required");
  if (!VALID_TYPES.includes(type))
    throw new Error(`Invalid entry type: "${type}". Must be CREDIT or DEBIT`);

  const result = await pool.query(
    `INSERT INTO ledger_entries
       (account_id, type, amount, balance_snapshot, reference)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, account_id, type, amount, balance_snapshot, reference, created_at`,
    [accountId, type, amount, balanceSnapshot, reference]
  );
  return result.rows[0];
};

exports.findByAccountId = async (accountId) => {
  const result = await pool.query(
    `SELECT id, account_id, type, amount, balance_snapshot, reference, created_at
     FROM ledger_entries
     WHERE account_id = $1
     ORDER BY created_at ASC`,
    [accountId]
  );
  return result.rows;
};

exports.findById = async (id) => {
  const result = await pool.query(
    `SELECT id, account_id, type, amount, balance_snapshot, reference, created_at
     FROM ledger_entries
     WHERE id = $1`,
    [id]
  );
  return result.rows[0];
};