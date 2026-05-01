// services/account-service/src/repositories/outbox.repository.js
//
// Outbox pattern (Phase 1.2): events are inserted into event_outbox in the
// SAME ledger_db transaction as the ledger entries. A relay loop publishes
// PENDING rows to Kafka and marks them SENT. Guarantees at-least-once
// delivery even if Kafka is down at commit time.

const ledgerRepo = require("./ledger.repository")

async function enqueue(client, { transactionId, topic, partitionKey, payload }) {
  const { rows } = await client.query(
    `INSERT INTO event_outbox (transaction_id, topic, partition_key, payload)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [transactionId, topic, partitionKey, JSON.stringify(payload)]
  )
  return rows[0].id
}

async function fetchPendingBatch(limit = 50) {
  const { rows } = await ledgerRepo.pool.query(
    `SELECT id, transaction_id, topic, partition_key, payload, attempts
       FROM event_outbox
      WHERE status = 'PENDING'
      ORDER BY created_at ASC
      LIMIT $1`,
    [limit]
  )
  return rows
}

async function markSent(id) {
  await ledgerRepo.pool.query(
    `UPDATE event_outbox SET status='SENT', sent_at=NOW() WHERE id=$1`,
    [id]
  )
}

async function markFailed(id, err) {
  await ledgerRepo.pool.query(
    `UPDATE event_outbox
        SET attempts = attempts + 1,
            last_error = $2,
            status = CASE WHEN attempts + 1 >= 10 THEN 'FAILED' ELSE 'PENDING' END
      WHERE id = $1`,
    [id, String(err?.message || err).slice(0, 500)]
  )
}

module.exports = { enqueue, fetchPendingBatch, markSent, markFailed }
