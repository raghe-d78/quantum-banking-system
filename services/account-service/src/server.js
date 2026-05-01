// services/account-service/src/server.js
require("dotenv").config()
const app   = require("./app")
const kafka = require("./kafka")

const PORT = process.env.PORT || 3002

console.log("Starting account service...")

;(async () => {
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
  server.close(() => process.exit(0))
}
process.on("SIGTERM", shutdown)
process.on("SIGINT",  shutdown)