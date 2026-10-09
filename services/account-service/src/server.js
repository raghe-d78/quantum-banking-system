// services/account-service/src/server.js
require("dotenv").config()
const app   = require("./app")
const kafka = require("./kafka")
const cache = require("/shared/cache")
const log   = require("/shared/logger")("account-service")

const PORT = process.env.PORT || 3002

;(async () => {
  try { await cache.connect() } catch (e) { log.warn("redis connect failed at boot (cache disabled)", { err: e.message }) }

  const startKafka = async () => {
    try { await kafka.connect(); kafka.startRelay() }
    catch (e) { log.warn("kafka connect failed, retrying in 5s", { err: e.message }); setTimeout(startKafka, 5000) }
  }
  startKafka()
})()

const server = app.listen(PORT, () => log.info("account-service listening", { port: Number(PORT) }))
server.keepAliveTimeout = 65_000

let shuttingDown = false
const shutdown = async (signal) => {
  if (shuttingDown) return
  shuttingDown = true
  log.info("shutting down", { signal })
  server.close(async () => {
    await kafka.disconnect().catch(() => {})
    await cache.disconnect().catch(() => {})
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT",  () => shutdown("SIGINT"))
