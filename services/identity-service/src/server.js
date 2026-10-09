// identity-service/src/server.js
require("dotenv").config()
const app = require("./app")
const log = require("/shared/logger")("identity-service")

const PORT = process.env.PORT || 3001
const server = app.listen(PORT, () => log.info("identity-service listening", { port: Number(PORT) }))
server.keepAliveTimeout = 65_000

const shutdown = (signal) => {
  log.info("shutting down", { signal })
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT",  () => shutdown("SIGINT"))
