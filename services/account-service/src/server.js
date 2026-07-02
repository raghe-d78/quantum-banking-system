// services/account-service/src/server.js
require("dotenv").config()
const app   = require("./app")
const kafka = require("./kafka")
const cache = require("/shared/cache")

const PORT = process.env.PORT || 3002

console.log("Starting account service...")

;(async () => {
  // Phase 2.1 — connect Redis (best-effort; cache helpers no-op if down).
  try { await cache.connect() }
  catch (e) { console.error("⚠️  Redis connect failed at boot:", e.message) }

  // Best-effort Kafka connect — service must boot even if Kafka is briefly down.
  try {
    await kafka.connect()
    kafka.startRelay()
  } catch (e) {
    console.error("⚠️  Kafka connect failed at boot, relay will retry:", e.message)
    // Retry connection in background; relay only runs after success.
    const retry = async () => {
      try { await kafka.connect(); kafka.startRelay() }
      catch { setTimeout(retry, 5000) }
    }
    setTimeout(retry, 5000)
  }
})()

const server = app.listen(PORT, () => {
  console.log(`Account service running on port ${PORT}`)
})

const shutdown = async () => {
  console.log("Shutting down…")
  await kafka.disconnect().catch(() => {})
  await cache.disconnect().catch(() => {})
  server.close(() => process.exit(0))
}
process.on("SIGTERM", shutdown)
process.on("SIGINT",  shutdown)