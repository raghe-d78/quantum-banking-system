// shared/db/index.js
//
// CockroachDB connection factory + transaction helper shared by every Node
// service. Connection parameters are environment-driven so the same code runs
// against the compose stack (insecure single node) and a secure cluster.
//
//   DB_HOST       default "cockroachdb"
//   DB_PORT       default 26257
//   DB_USER       default "root"
//   DB_PASSWORD   default ""           (ignored when empty)
//   DB_SSL        "require" | "disable" (default "disable")
//   DB_POOL_MAX   default 10
//
// CockroachDB is ONE cluster, so a single SQL transaction can touch tables in
// several logical databases when they are referenced with fully-qualified
// names (e.g. `ledger_db.public.ledger_entries`). `withTransaction` relies on
// that to make account + ledger + outbox writes truly atomic, and retries the
// closure on serialization failures (SQLSTATE 40001), which CockroachDB
// raises under contention instead of blocking.

const { Pool } = require("pg")

const RETRYABLE_CODES = new Set(["40001", "40P01", "CR000"])

function connectionString(database) {
  const host = process.env.DB_HOST || "cockroachdb"
  const port = process.env.DB_PORT || "26257"
  const user = process.env.DB_USER || "root"
  const pass = process.env.DB_PASSWORD || ""
  const ssl  = (process.env.DB_SSL || "disable").toLowerCase() === "require" ? "require" : "disable"
  const auth = pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}` : encodeURIComponent(user)
  return `postgresql://${auth}@${host}:${port}/${database}?sslmode=${ssl}`
}

function createPool(database) {
  const pool = new Pool({
    connectionString: connectionString(database),
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: process.env.SERVICE_NAME || database,
  })
  pool.on("error", (err) => {
    console.error(JSON.stringify({ level: "error", logger: "db", msg: "idle client error", err: err.message }))
  })
  return pool
}

function isRetryable(err) {
  return !!err && RETRYABLE_CODES.has(String(err.code))
}

// Run `fn(client)` inside BEGIN/COMMIT. Retries the whole closure on
// serialization conflicts with exponential backoff (CockroachDB best
// practice). Business errors propagate unchanged after a ROLLBACK.
async function withTransaction(pool, fn, { retries = 5, baseDelayMs = 25 } = {}) {
  let lastErr
  for (let attempt = 1; attempt <= retries; attempt++) {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const result = await fn(client)
      await client.query("COMMIT")
      return result
    } catch (err) {
      try { await client.query("ROLLBACK") } catch (_) { /* connection may be gone */ }
      lastErr = err
      if (!isRetryable(err) || attempt === retries) throw err
      const jitter = Math.floor(Math.random() * baseDelayMs)
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** (attempt - 1) + jitter))
    } finally {
      client.release()
    }
  }
  throw lastErr
}

module.exports = createPool
module.exports.createPool = createPool
module.exports.withTransaction = withTransaction
module.exports.isRetryable = isRetryable
module.exports.connectionString = connectionString
