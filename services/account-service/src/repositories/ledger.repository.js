// services/account-service/src/repositories/ledger.repository.js
// Append-only. There is deliberately no UPDATE/DELETE here.
const { randomUUID } = require("crypto")
const { pool, T } = require("./pool")

const TX_TYPES = ["DEPOSIT", "WITHDRAW", "TRANSFER", "CANCELLATION"]

async function insertEntry(client, entry) {
  const {
    id, transactionId, accountId, type, txType, amount,
    balance_snapshot, reference, created_at, compensates = null, initiatedBy = null,
  } = entry

  if (!["CREDIT", "DEBIT"].includes(type)) throw new Error(`Invalid entry type: ${type}`)
  if (!TX_TYPES.includes(txType))          throw new Error(`Invalid tx_type: ${txType}`)
  if (balance_snapshot === undefined || balance_snapshot === null || Number.isNaN(Number(balance_snapshot)))
    throw new Error("balance_snapshot must be a valid number")

  const { rows } = await client.query(
    `INSERT INTO ${T.ledger}
       (id, transaction_id, account_id, type, tx_type, amount, balance_snapshot,
        reference, created_at, compensates, initiated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [id || randomUUID(), transactionId, accountId, type, txType, String(amount),
     String(balance_snapshot), reference || null, created_at || new Date(), compensates, initiatedBy]
  )
  return rows[0]
}

// Rolling-window sum of outgoing TRANSFER debits only (deposits, withdrawals
// and compensations must not eat into the customer's transfer allowance).
async function sumTransferDebitsSince(client, accountId, sinceIso) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(amount), 0)::STRING AS total
       FROM ${T.ledger}
      WHERE account_id = $1 AND type = 'DEBIT' AND tx_type = 'TRANSFER'
        AND compensates IS NULL AND created_at >= $2`,
    [accountId, sinceIso]
  )
  return rows[0]?.total ?? "0"
}

async function findByTransactionId(client, transactionId) {
  const { rows } = await client.query(
    `SELECT id, account_id, type, tx_type, amount, reference, compensates
       FROM ${T.ledger} WHERE transaction_id = $1 ORDER BY account_id ASC`,
    [transactionId]
  )
  return rows
}

async function findById(id, client) {
  const { rows } = await (client || pool).query(
    `SELECT id, transaction_id, account_id, type, tx_type, amount, balance_snapshot,
            reference, compensates, initiated_by, created_at
       FROM ${T.ledger} WHERE id = $1`,
    [id]
  )
  return rows[0]
}

module.exports = { pool, TX_TYPES, insertEntry, sumTransferDebitsSince, findByTransactionId, findById }
