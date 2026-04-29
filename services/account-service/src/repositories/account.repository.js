// services/account-service/src/account.repository.js
const createPool = require("/shared/db")

const pool = createPool("account_db")

const create = async ({ userId, currency = "TND" }) => {
  const result = await pool.query(
    `INSERT INTO accounts (user_id, cached_balance, currency)
     VALUES ($1, 0.000, $2)
     RETURNING id, user_id, cached_balance, currency, created_at`,
    [userId, currency]
  )
  return result.rows[0]
}

const findByUserId = async (userId) => {
  const result = await pool.query(
    "SELECT * FROM accounts WHERE user_id = $1",
    [userId]
  )
  return result.rows[0]
}
const getAccountByCustomerId = async (client, customerId) => {
  const result = await client.query(
    "SELECT * FROM accounts WHERE user_id = $1",
    [customerId]
  )
  return result.rows[0]
}

const findById = async (id) => {
  const result = await pool.query(
    "SELECT * FROM accounts WHERE id = $1",
    [id]
  )
  return result.rows[0]
}

const getAccountForUpdate = async (client, accountId) => {
  const result = await client.query(
    "SELECT * FROM accounts WHERE id=$1 FOR UPDATE",
    [accountId]
  )
  return result.rows[0]
}


const updateBalance = async (client, accountId, newBalance) => {
  await client.query(
    "UPDATE accounts SET cached_balance=$1 WHERE id=$2",
    [newBalance, accountId]
  )
}

module.exports = {
  pool,
  getAccountForUpdate,
  updateBalance,
  create,
  findByUserId,
  findById,
  getAccountByCustomerId,
}