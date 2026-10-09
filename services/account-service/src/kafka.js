// services/account-service/src/kafka.js
//
// Kafka producer + outbox relay. The relay claims PENDING rows with
// FOR UPDATE SKIP LOCKED inside a transaction, publishes them, and marks them
// SENT in the same transaction → safe to run on every replica concurrently.
const { Kafka, Partitioners, logLevel } = require("kafkajs")
const { withTransaction } = require("/shared/db")
const outboxRepo = require("./repositories/outbox.repository")
const log = require("/shared/logger")("account-service")

const KAFKA_BROKERS  = (process.env.KAFKA_BROKERS || "kafka:9092").split(",")
const OUTBOX_POLL_MS = Number(process.env.OUTBOX_POLL_MS || 1000)
const OUTBOX_BATCH   = Number(process.env.OUTBOX_BATCH || 100)
const TX_TOPIC       = process.env.TX_EVENTS_TOPIC || "transaction.events"

const kafka = new Kafka({
  clientId: "account-service",
  brokers:  KAFKA_BROKERS,
  logLevel: logLevel.WARN,
  retry:    { retries: 8, initialRetryTime: 300 },
})

// Idempotent producer: acks=all, exactly-once per partition on retries.
const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
  allowAutoTopicCreation: true,
  idempotent: true,
  maxInFlightRequests: 1,
})

let connected = false
let stopping  = false
let timer     = null

async function connect() {
  if (connected) return
  await producer.connect()
  connected = true
  log.info("kafka producer connected", { brokers: KAFKA_BROKERS })
}

async function disconnect() {
  stopping = true
  if (timer) clearTimeout(timer)
  if (connected) { await producer.disconnect(); connected = false }
}

async function publishOne(row) {
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload
  await producer.send({
    topic: row.topic,
    acks: -1,
    messages: [{
      key: row.partition_key,
      value: JSON.stringify(payload),
      headers: { "x-outbox-id": String(row.id), "x-transaction-id": String(row.transaction_id) },
    }],
  })
}

async function relayTick() {
  if (!connected || stopping) return 0
  return withTransaction(outboxRepo.pool, async (client) => {
    const batch = await outboxRepo.claimPendingBatch(client, OUTBOX_BATCH)
    let sent = 0
    for (const row of batch) {
      try {
        await publishOne(row)
        await outboxRepo.markSent(client, row.id)
        sent++
      } catch (e) {
        log.warn("outbox publish failed", { id: row.id, topic: row.topic, err: e.message })
        await outboxRepo.markFailed(client, row.id, e)
      }
    }
    return sent
  }, { retries: 3 })
}

function startRelay() {
  const tick = async () => {
    let sent = 0
    try { sent = await relayTick() } catch (e) { log.error("relay tick error", { err: e.message }) }
    if (stopping) return
    // Drain fast while there is backlog, otherwise poll.
    timer = setTimeout(tick, sent >= OUTBOX_BATCH ? 0 : OUTBOX_POLL_MS)
  }
  timer = setTimeout(tick, OUTBOX_POLL_MS)
}

module.exports = { kafka, producer, connect, disconnect, startRelay, relayTick, TX_TOPIC }
