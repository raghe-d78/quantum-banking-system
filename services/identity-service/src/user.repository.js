const createPool = require("../../../shared/db")

const pool = createPool("identity_db")

exports.create = async (email, hash) => {
  const result = await pool.query(
    "INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id",
    [email, hash]
  )

  return result.rows[0]
}

exports.findByEmail = async (email) => {
  const result = await pool.query(
    "SELECT * FROM users WHERE email=$1",
    [email]
  )

  return result.rows[0]
}