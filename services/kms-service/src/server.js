// services/kms-service/src/server.js
//
// Phase 3.4 — Key Management Service.
// Wraps quantum-service /qkd/bb84 to mint AES-256-GCM session keys.
// Stored in Redis under a random kid; write-once / read-once: GET /kms/keys/:kid
// returns the key AND deletes it. Replays return 410 Gone.

const express = require("express")
const axios   = require("axios")
const cache   = require("/shared/cache")
const crypto  = require("crypto")

const PORT     = process.env.PORT || 3006
const QSVC     = process.env.QUANTUM_SERVICE_URL || "http://quantum-service:3005"
const TTL_SEC  = Number(process.env.KEY_TTL_SEC || 300)
const ROUNDS   = Number(process.env.KEY_ROUNDS || 3)
const QUBITS   = Number(process.env.KEY_QUBITS || 512)

const app = express()
app.use(express.json())

const KEY_PREFIX = "kms:key:"

app.get("/health", (_req, res) => res.json({ status: "kms-service running" }))

app.post("/kms/keys", async (_req, res) => {
  try {
    const { data } = await axios.post(`${QSVC}/qkd/bb84`, {
      n_qubits: QUBITS, rounds: ROUNDS, with_eve: false, qber_threshold: 0.11,
      backend: "simulator",   // KMS always uses simulator for fast/free key derivation
    }, { timeout: 30000 })

    if (!data.accepted || !data.key_bits || data.key_length < 256) {
      return res.status(503).json({
        error: "BB84 produced insufficient or rejected key material",
        details: { accepted: data.accepted, key_length: data.key_length, qber: data.qber_per_round }
      })
    }

    const bits = data.key_bits.slice(0, 256)
    const buf  = Buffer.alloc(32)
    for (let i = 0; i < 32; i++) {
      buf[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2)
    }

    const kid = crypto.randomUUID()
    await cache.setEx(KEY_PREFIX + kid, buf.toString("base64"), TTL_SEC)

    res.status(201).json({
      kid,
      ttl_sec: TTL_SEC,
      source: "bb84",
      rounds_accepted: data.rounds_accepted,
      rounds_total:    data.rounds_total,
      qber_mean:       data.qber_mean,
      key_length_bits: 256,
    })
  } catch (e) {
    console.error("mint key failed:", e.message)
    res.status(502).json({ error: "quantum-service unreachable", details: e.message })
  }
})

app.get("/kms/keys/:kid", async (req, res) => {
  const k = KEY_PREFIX + req.params.kid
  const val = await cache.get(k)
  if (!val) return res.status(410).json({ error: "key missing or already consumed" })
  await cache.del(k)
  res.json({
    kid:      req.params.kid,
    key_b64:  val,
    alg:      "AES-256-GCM",
    consumed: true,
  })
})

;(async () => {
  try { await cache.connect() }
  catch (e) { console.error("⚠️ Redis connect failed:", e.message) }
  app.listen(PORT, () => console.log(`KMS service running on port ${PORT}`))
})()

const shutdown = async () => {
  await cache.disconnect().catch(() => {})
  process.exit(0)
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
