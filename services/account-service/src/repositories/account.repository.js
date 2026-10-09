// services/account-service/src/repositories/account.repository.js
const { pool, T } = require("./pool")

const q = (client) => (client || pool)

const create = async ({ userId, currency = "TND" }, client) => {
  const { rows } = await q(client).query(
    `INSERT INTO ${T.accounts} (user_id, cached_balance, currency)
     VALUES ($1, 0, $2)
     RETURNING id, user_id, cached_balance, currency, status, created_at`,
    [userId, currency]
  )
  return rows[0]
}

const findByUserId = async (userId, client) => {
  const { rows } = await q(client).query(`SELECT * FROM ${T.accounts} WHERE user_id = $1`, [userId])
  return rows[0]
}

const findById = async (id, client) => {
  const { rows } = await q(client).query(`SELECT * FROM ${T.accounts} WHERE id = $1`, [id])
  return rows[0]
}

// Row-level lock: every balance mutation goes through one of these two.
const getAccountForUpdate = async (client, accountId) => {
  const { rows } = await client.query(`SELECT * FROM ${T.accounts} WHERE id = $1 FOR UPDATE`, [accountId])
  return rows[0]
}

const getAccountForUpdateByUserId = async (client, userId) => {
  const { rows } = await client.query(`SELECT * FROM ${T.accounts} WHERE user_id = $1 FOR UPDATE`, [userId])
  return rows[0]
}

// Lock several accounts in deterministic (sorted) order → no lock-order deadlocks.
const lockAccounts = async (client, ids) => {
  const sorted = [...new Set(ids)].sort()
  const out = {}
  for (const id of sorted) {
    const acc = await getAccountForUpdate(client, id)
    if (acc) out[id] = acc
  }
  return out
}

const updateBalance = async (client, accountId, newBalance) => {
  await client.query(
    `UPDATE ${T.accounts} SET cached_balance = $1, updated_at = now() WHERE id = $2`,
    [newBalance, accountId]
  )
}

// ── Payees (billers / merchants) ──────────────────────────────────
const listPayees = async ({ kind } = {}, client) => {
  const params = []
  let sql = `SELECT code, name, kind, category, account_id, reference_hint FROM ${T.payees} WHERE active = true`
  if (kind) { params.push(String(kind).toUpperCase()); sql += ` AND kind = $${params.length}` }
  sql += ` ORDER BY kind, category, name`
  const { rows } = await q(client).query(sql, params)
  return rows
}

const findPayeeByCode = async (code, client) => {
  const { rows } = await q(client).query(
    `SELECT code, name, kind, category, account_id, reference_hint FROM ${T.payees} WHERE code = $1 AND active = true`,
    [String(code).toUpperCase()]
  )
  return rows[0]
}

// ── Idempotency keys (POST /transactions) ─────────────────────────
// Claims the key inside the caller's transaction. Returns { claimed: true }
// when this request owns the key, else the stored row (response may still be
// null if a concurrent request holds it).
const claimIdempotencyKey = async (client, userId, key) => {
  const ins = await client.query(
    `INSERT INTO ${T.idem} (user_id, idem_key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING idem_key`,
    [userId, key]
  )
  if (ins.rows.length) return { claimed: true }
  const { rows } = await client.query(`SELECT response FROM ${T.idem} WHERE user_id = $1 AND idem_key = $2`, [userId, key])
  return { claimed: false, response: rows[0]?.response ?? null }
}

const storeIdempotentResponse = async (client, userId, key, response) => {
  await client.query(`UPDATE ${T.idem} SET response = $3 WHERE user_id = $1 AND idem_key = $2`,
    [userId, key, JSON.stringify(response)])
}

module.exports = {
  pool,
  create, findByUserId, findById,
  getAccountForUpdate, getAccountForUpdateByUserId, lockAccounts, updateBalance,
  listPayees, findPayeeByCode, claimIdempotencyKey, storeIdempotentResponse,
}
