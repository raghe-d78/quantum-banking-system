// shared/cache.js
//
// Phase 2.1 — thin Redis wrapper used as a read-through cache for hot fields
// (e.g. account balances) and as a pub/sub fan-out for cross-replica
// invalidation. Designed so a service can call `connect()` once at boot and
// then use the synchronous-looking get/setEx/del helpers everywhere else.
//
// Usage:
//   const cache = require("/shared/cache")
//   await cache.connect()            // call once at server start
//   const cached = await cache.get("balance:user:" + uid)
//   await cache.setEx("balance:user:" + uid, JSON.stringify(b), 60)
//   await cache.del("balance:user:" + uid)
//   await cache.publishInvalidate("balance:user:" + uid)  // fan-out
//
// All helpers degrade to no-ops + warning if Redis is unreachable, so a Redis
// outage never takes down the data path (we just lose the speed-up).

const { createClient } = require("redis")

const URL = process.env.REDIS_URL || "redis://redis:6379"
const INVALIDATE_CHANNEL = "cache.invalidate"

let client = null      // commands
let subscriber = null  // pub/sub (separate connection — required by node-redis v4)
let ready = false

function log(level, msg, extra) {
  const line = { level, ts: new Date().toISOString(), logger: "cache", msg, ...(extra || {}) }
  console[level === "error" ? "error" : "log"](JSON.stringify(line))
}

async function connect() {
  if (ready) return
  client = createClient({ url: URL })
  subscriber = client.duplicate()
  client.on("error", (err) => log("error", "redis client error", { err: err.message }))
  subscriber.on("error", (err) => log("error", "redis subscriber error", { err: err.message }))
  await client.connect()
  await subscriber.connect()
  // Default subscription: any service can listen for cross-replica invalidations.
  await subscriber.subscribe(INVALIDATE_CHANNEL, async (key) => {
    try { await client.del(key) } catch (_) { /* noop */ }
  })
  ready = true
  log("info", "redis connected", { url: URL })
}

async function disconnect() {
  ready = false
  try { await subscriber?.quit() } catch (_) {}
  try { await client?.quit() } catch (_) {}
}

async function get(key) {
  if (!ready) return null
  try { return await client.get(key) } catch (e) { log("error", "get failed", { key, err: e.message }); return null }
}

async function setEx(key, val, ttlSec) {
  if (!ready) return
  try { await client.set(key, val, { EX: ttlSec }) } catch (e) { log("error", "setEx failed", { key, err: e.message }) }
}

async function del(key) {
  if (!ready) return
  try { await client.del(key) } catch (e) { log("error", "del failed", { key, err: e.message }) }
}

// Publish an invalidation so every replica drops the key from its own Redis
// (idempotent — even the publisher receives & deletes, which is fine).
async function publishInvalidate(key) {
  if (!ready) return
  try { await client.publish(INVALIDATE_CHANNEL, key) } catch (e) { log("error", "publish failed", { key, err: e.message }) }
}

module.exports = { connect, disconnect, get, setEx, del, publishInvalidate, INVALIDATE_CHANNEL, getRawClient: () => client }
