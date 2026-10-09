// services/audit-service/src/server.js
//
// Append-only audit worker. Consumes `transaction.events` and
// `transaction.cancelled`, persists one row per (transaction, account, event)
// into audit_db.audit_logs, and exposes a small staff-only read API.
//
// Delivery: at-least-once from Kafka + idempotent INSERT ... ON CONFLICT on the
// composite key → effectively-exactly-once rows. Offsets are committed only
// after the row is durable.
const { Kafka, logLevel } = require("kafkajs")
const express = require("express")
const { createPool } = require("/shared/db")
const { authenticate, requireStaff } = require("/shared/auth")
const log = require("/shared/logger")("audit-service")

const KAFKA_BROKERS   = (process.env.KAFKA_BROKERS || "kafka:9092").split(",")
const TX_TOPIC        = process.env.TX_EVENTS_TOPIC    || "transaction.events"
const CANCELLED_TOPIC = process.env.TX_CANCELLED_TOPIC || "transaction.cancelled"
const GROUP_ID        = process.env.AUDIT_GROUP_ID     || "audit-workers"
const PORT            = Number(process.env.PORT || 3004)

const pool = createPool(process.env.DB_NAME || "audit_db")
const kafka = new Kafka({ clientId: "audit-service", brokers: KAFKA_BROKERS, logLevel: logLevel.WARN, retry: { retries: 10, initialRetryTime: 500 } })
const consumer = kafka.consumer({ groupId: GROUP_ID, sessionTimeout: 30000 })

const INSERT = `
  INSERT INTO audit_logs (
    transaction_id, event_type, account_id, amount, currency, balance_snapshot,
    initiated_by, reference, event_timestamp, kafka_topic, kafka_partition, kafka_offset, payload
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  ON CONFLICT (transaction_id, account_id, event_type) DO NOTHING`

async function insertRows(rows) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    for (const r of rows) await client.query(INSERT, r)
    await client.query("COMMIT")
  } catch (e) { try { await client.query("ROLLBACK") } catch (_) {} throw e }
  finally { client.release() }
}

// Map a Kafka message to one or more audit rows.
function toRows(topic, evt, partition, offset) {
  const meta = [topic, partition, offset, JSON.stringify(evt)]
  if (topic === CANCELLED_TOPIC || evt.type === "TRANSACTION_CANCELLED") {
    const comps = Array.isArray(evt.compensations) && evt.compensations.length
      ? evt.compensations
      : (evt.affectedAccounts || []).map(a => ({ accountId: a, amount: 0, balanceSnapshot: null }))
    return comps.map(c => [
      evt.cancellationId, "TRANSACTION_CANCELLED", c.accountId, c.amount ?? 0, evt.currency || "TND",
      c.balanceSnapshot ?? null, evt.cancelledBy ?? null,
      `Cancellation of ${evt.originalTransactionId}: ${evt.reason || ""}`.slice(0, 500),
      evt.timestamp, ...meta,
    ])
  }
  if (!evt.transactionId || !evt.accountId || !evt.type) return []
  return [[
    evt.transactionId, evt.type, evt.accountId, evt.amount, evt.currency,
    evt.balanceSnapshot ?? null, evt.initiatedBy ?? null, evt.reference ?? null, evt.timestamp, ...meta,
  ]]
}

let processed = 0, failed = 0, lastError = null

async function startConsumer() {
  for (let i = 0; i < 60; i++) {
    try { await pool.query("SELECT 1"); break }
    catch { log.info("waiting for DB…"); await new Promise(r => setTimeout(r, 2000)) }
  }
  await consumer.connect()
  await consumer.subscribe({ topics: [TX_TOPIC, CANCELLED_TOPIC], fromBeginning: true })
  log.info("consuming", { topics: [TX_TOPIC, CANCELLED_TOPIC], group: GROUP_ID })

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      const offset = message.offset
      let evt
      try { evt = JSON.parse(message.value.toString()) }
      catch (e) {
        // Poison message: cannot ever succeed → record and skip.
        log.error("unparseable message skipped", { topic, partition, offset })
        failed++
        await consumer.commitOffsets([{ topic, partition, offset: (BigInt(offset) + 1n).toString() }])
        return
      }
      try {
        const rows = toRows(topic, evt, partition, offset)
        if (rows.length) await insertRows(rows)
        await consumer.commitOffsets([{ topic, partition, offset: (BigInt(offset) + 1n).toString() }])
        processed++
      } catch (e) {
        failed++; lastError = e.message
        log.error("failed to persist audit row; will retry", { topic, partition, offset, err: e.message })
        throw e // kafkajs retries with backoff; offset not committed
      }
    },
  })
}

// ── HTTP ──────────────────────────────────────────────────────────
const app = express()
app.disable("x-powered-by")
app.get("/health", (_req, res) => res.json({ status: "audit-service running", processed, failed, lastError }))
app.get("/ready", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ status: "ready" }) } catch (e) { res.status(503).json({ status: "degraded", error: e.message }) }
})
app.use(authenticate, requireStaff)
app.get("/audit/stats", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::INT8 AS total,
              COUNT(*) FILTER (WHERE event_type='DEPOSIT')::INT8 AS deposits,
              COUNT(*) FILTER (WHERE event_type='WITHDRAW')::INT8 AS withdrawals,
              COUNT(*) FILTER (WHERE event_type LIKE 'TRANSFER_%')::INT8 AS transfers,
              COUNT(*) FILTER (WHERE event_type='TRANSACTION_CANCELLED')::INT8 AS cancellations
         FROM audit_logs`)
    res.json({ ...rows[0], consumer: { processed, failed, lastError } })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
app.get("/audit/recent", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200)
    const params = [limit]
    let where = ""
    if (req.query.accountId) { params.push(req.query.accountId); where = ` WHERE account_id = $2` }
    const { rows } = await pool.query(
      `SELECT transaction_id, event_type, account_id, amount, currency, balance_snapshot,
              initiated_by, reference, event_timestamp, kafka_topic, kafka_partition, kafka_offset
         FROM audit_logs${where} ORDER BY event_timestamp DESC LIMIT $1`, params)
    res.json({ count: rows.length, rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

const server = app.listen(PORT, () => log.info("audit-service listening", { port: PORT }))
startConsumer().catch(err => { log.error("consumer start failed", { err: err.message }); process.exit(1) })

const shutdown = async (signal) => {
  log.info("shutting down", { signal })
  try { await consumer.disconnect() } catch {}
  try { await pool.end() } catch {}
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT",  () => shutdown("SIGINT"))

module.exports = { toRows }
