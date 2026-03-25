// identity-service/src/user.repository.js
const createPool = require("../../../shared/db")

const pool = createPool("identity_db")

exports.create = async ({ username, email, name, passwordHash, role = "user" }) => {
  const result = await pool.query(
    `INSERT INTO users (username, email, name, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, email, name, role, created_at`,
    [username, email, name, passwordHash, role]
  )
  return result.rows[0]
}

exports.findByEmail = async (email) => {
  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  )
  return result.rows[0]
}

exports.findByUsername = async (username) => {
  const result = await pool.query(
    "SELECT * FROM users WHERE username = $1",
    [username]
  )
  return result.rows[0]
}

exports.findById = async (id) => {
  const result = await pool.query(
    "SELECT id, username, email, name, role, created_at FROM users WHERE id = $1",
    [id]
  )
  return result.rows[0]
}