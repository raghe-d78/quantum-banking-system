// shared/logger.js — minimal structured (JSON lines) logger.
// Usage: const log = require("/shared/logger")("account-service")
//        log.info("transfer committed", { transactionId })
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
const MIN = LEVELS[(process.env.LOG_LEVEL || "info").toLowerCase()] ?? 20

module.exports = function createLogger(service) {
  const emit = (level, msg, extra) => {
    if (LEVELS[level] < MIN) return
    const line = { ts: new Date().toISOString(), level, service, msg, ...(extra || {}) }
    ;(level === "error" || level === "warn" ? console.error : console.log)(JSON.stringify(line))
  }
  return {
    debug: (m, e) => emit("debug", m, e),
    info:  (m, e) => emit("info",  m, e),
    warn:  (m, e) => emit("warn",  m, e),
    error: (m, e) => emit("error", m, e),
  }
}
