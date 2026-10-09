// services/account-service/src/repositories/outbox.repository.js
//
// Transactional outbox (Phase 1.2, hardened in Phase 6). Rows are inserted in
// the SAME transaction as the ledger entries. The relay claims PENDING rows
// with FOR UPDATE SKIP LOCKED so several account-service replicas can relay
// concurrently without double-publishing.
const { pool, T } = require("./pool")

const MAX_ATTEMPTS = Number(process.env.OUTBOX_MAX_ATTEMPTS || 10)

async function enqueue(client, { transactionId, topic, partitionKey, payload }) {
  const { rows } = await client.query(
    `INSERT INTO ${T.outbox} (transaction_id, topic, partition_key, payload)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [transactionId, topic, partitionKey, JSON.stringify(payload)]
  )
  return rows[0].id
}

// Must be called inside a transaction; locked rows stay invisible to other relays.
async function claimPendingBatch(client, limit = 50) {
  const { rows } = await client.query(
    `SELECT id, transaction_id, topic, partition_key, payload, attempts
       FROM ${T.outbox}
      WHERE status = 'PENDING'
      ORDER BY created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED`,
    [limit]
  )
  return rows
}

async function markSent(client, id) {
  await client.query(`UPDATE ${T.outbox} SET status='SENT', sent_at=now() WHERE id=$1`, [id])
}

async function markFailed(client, id, err) {
  await client.query(
    `UPDATE ${T.outbox}
        SET attempts = attempts + 1,
            last_error = $2,
            status = CASE WHEN attempts + 1 >= $3 THEN 'FAILED' ELSE 'PENDING' END
      WHERE id = $1`,
    [id, String(err?.message || err).slice(0, 500), MAX_ATTEMPTS]
  )
}

async function stats() {
  const { rows } = await pool.query(
    `SELECT status, COUNT(*)::INT AS n FROM ${T.outbox} GROUP BY status`
  )
  return Object.fromEntries(rows.map(r => [r.status, r.n]))
}

module.exports = { pool, enqueue, claimPendingBatch, markSent, markFailed, stats }
