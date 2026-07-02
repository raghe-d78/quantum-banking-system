// services/account-service/src/kafka.js
//
// Kafka producer wrapper + outbox relay loop (Phase 1.2).
// One Kafka client per service instance. The relay polls event_outbox
// every OUTBOX_POLL_MS, publishes PENDING rows, and marks them SENT.

const { Kafka, Partitioners, logLevel } = require("kafkajs")
const outboxRepo = require("./repositories/outbox.repository")

const KAFKA_BROKERS  = (process.env.KAFKA_BROKERS || "kafka:9092").split(",")
const OUTBOX_POLL_MS = Number(process.env.OUTBOX_POLL_MS || 1000)
const TX_TOPIC       = process.env.TX_EVENTS_TOPIC || "transaction.events"

const kafka = new Kafka({
  clientId: "account-service",
  brokers:  KAFKA_BROKERS,
  logLevel: logLevel.WARN,
  retry:    { retries: 5, initialRetryTime: 300 },
})

const producer = kafka.producer({
  // Keyed events go to the same partition → per-account ordering.
  createPartitioner: Partitioners.DefaultPartitioner,
  allowAutoTopicCreation: true,
})

let connected = false
let stopping  = false

async function connect() {
  if (connected) return
  await producer.connect()
  connected = true
  console.log(`📨 Kafka producer connected to ${KAFKA_BROKERS.join(",")}`)
}

async function disconnect() {
  stopping = true
  if (connected) await producer.disconnect()
}

async function publishOne(row) {
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload
  await producer.send({
    topic: row.topic,
    messages: [{ key: row.partition_key, value: JSON.stringify(payload) }],
  })
}

async function relayTick() {
  if (!connected || stopping) return
  let batch = []
  try {
    batch = await outboxRepo.fetchPendingBatch(50)
  } catch (e) {
    console.error("outbox relay: fetch failed:", e.message)
    return
  }
  for (const row of batch) {
    try {
      await publishOne(row)
      await outboxRepo.markSent(row.id)
    } catch (e) {
      console.error(`outbox relay: publish failed for ${row.id}:`, e.message)
      await outboxRepo.markFailed(row.id, e).catch(() => {})
    }
  }
}

function startRelay() {
  const tick = async () => {
    try { await relayTick() } catch (e) { console.error("relay tick error:", e.message) }
    if (!stopping) setTimeout(tick, OUTBOX_POLL_MS)
  }
  setTimeout(tick, OUTBOX_POLL_MS)
}

module.exports = { kafka, producer, connect, disconnect, startRelay, TX_TOPIC }
