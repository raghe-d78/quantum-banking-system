// services/api-gateway/src/server.js
const app = require("./app")
const log = require("/shared/logger")("api-gateway")

const PORT = process.env.PORT || 3000
const server = app.listen(PORT, () => log.info("api-gateway listening", { port: Number(PORT) }))
server.keepAliveTimeout = 65_000

const shutdown = (signal) => {
  log.info("shutting down", { signal })
  server.close(async () => { try { await app._redis.quit() } catch (_) {} process.exit(0) })
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT",  () => shutdown("SIGINT"))
