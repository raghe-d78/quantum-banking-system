// services/account-service/src/account.repository.js
const createPool = require("../../../shared/db")

const pool = createPool("account_db")

exports.create = async ({ userId, currency = "TND" }) => {
  const result = await pool.query(
    `INSERT INTO accounts (user_id, balance, currency)
     VALUES ($1, 0.000, $2)
     RETURNING id, user_id, balance, currency, created_at`,
    [userId, currency]
  )
  return result.rows[0]
}

exports.findByUserId = async (userId) => {
  const result = await pool.query(
    "SELECT * FROM accounts WHERE user_id = $1",
    [userId]
  )
  return result.rows[0]
}

exports.findById = async (id) => {
  const result = await pool.query(
    "SELECT * FROM accounts WHERE id = $1",
    [id]
  )
  return result.rows[0]
}