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

module.exports = {
  pool,
  create, findByUserId, findById,
  getAccountForUpdate, getAccountForUpdateByUserId, lockAccounts, updateBalance,
}
