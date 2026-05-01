// services/audit-service/src/server.js
//
// Phase 1.3 — Audit worker.
// Consumes `transaction.events` and persists each event to audit_db.audit_logs.
// Effectively-exactly-once: Kafka offset is committed only after the row is
// inserted, and the INSERT is idempotent via ON CONFLICT (transaction_id).

const { Kafka, logLevel } = require("kafkajs")
const { Pool } = require("pg")
const express = require("express")

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "kafka:9092").split(",")
const TX_TOPIC      = process.env.TX_EVENTS_TOPIC || "transaction.events"
const GROUP_ID      = process.env.AUDIT_GROUP_ID || "audit-workers"
const PORT          = Number(process.env.PORT || 3004)

const pool = new Pool({
  host:     process.env.DB_HOST || "cockroachdb",
  port:     Number(process.env.DB_PORT || 26257),
  user:     process.env.DB_USER || "root",
  database: process.env.DB_NAME || "audit_db",
  ssl:      false,
})

const kafka = new Kafka({
  clientId: "audit-service",
  brokers:  KAFKA_BROKERS,
  logLevel: logLevel.WARN,
  retry:    { retries: 10, initialRetryTime: 500 },
})

const consumer = kafka.consumer({ groupId: GROUP_ID })

async function insertAuditRow(evt, partition, offset) {
  await pool.query(
    `INSERT INTO audit_logs (
       transaction_id, event_type, account_id, amount, currency,
       balance_snapshot, initiated_by, reference, event_timestamp,
       kafka_partition, kafka_offset
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (transaction_id) DO NOTHING`,
    [
      evt.transactionId,
      evt.type,
      evt.accountId,
      evt.amount,
      evt.currency,
      evt.balanceSnapshot ?? null,
      evt.initiatedBy ?? null,
      evt.reference ?? null,
      evt.timestamp,
      partition,
      offset,
    ]
  )
}

async function start() {
  for (let i = 0; i < 30; i++) {
    try { await pool.query("SELECT 1"); break }
    catch { console.log("audit: waiting for DB…"); await new Promise(r => setTimeout(r, 2000)) }
  }

  await consumer.connect()
  await consumer.subscribe({ topic: TX_TOPIC, fromBeginning: true })
  console.log(`📥 audit-service consuming ${TX_TOPIC} (group=${GROUP_ID})`)

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      const offset = message.offset
      try {
        const evt = JSON.parse(message.value.toString())
        await insertAuditRow(evt, partition, offset)
        await consumer.commitOffsets([
          { topic, partition, offset: (BigInt(offset) + 1n).toString() },
        ])
      } catch (e) {
        console.error("audit: failed to process message:", e.message, message.value?.toString())
        throw e
      }
    },
  })
}

const app = express()
app.get("/health", (_req, res) => res.json({ status: "audit-service running" }))
app.get("/audit/stats", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::INT8 AS total,
              COUNT(*) FILTER (WHERE event_type='DEPOSIT')::INT8 AS deposits,
              COUNT(*) FILTER (WHERE event_type='WITHDRAW')::INT8 AS withdrawals,
              COUNT(*) FILTER (WHERE event_type LIKE 'TRANSFER_%')::INT8 AS transfers
         FROM audit_logs`
    )
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})
app.get("/audit/recent", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT transaction_id, event_type, account_id, amount, currency,
              event_timestamp, kafka_partition, kafka_offset
         FROM audit_logs ORDER BY event_timestamp DESC LIMIT 25`
    )
    res.json({ count: rows.length, rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.listen(PORT, () => console.log(`Audit HTTP on :${PORT}`))
start().catch(err => { console.error("audit start failed:", err); process.exit(1) })

const shutdown = async () => {
  console.log("audit shutting down…")
  try { await consumer.disconnect() } catch {}
  try { await pool.end() } catch {}
  process.exit(0)
}
process.on("SIGTERM", shutdown)
process.on("SIGINT",  shutdown)
