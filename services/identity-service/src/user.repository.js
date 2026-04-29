// services/identity-service/src/user.repository.js
const createPool = require("../../../shared/db");
const pool = createPool("identity_db");

exports.create = async ({ username, email, name, passwordHash, role = "customer" }) => {
  const result = await pool.query(
    `INSERT INTO users (username, email, name, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, email, name, role, created_at`,
    [username, email, name, passwordHash, role]
  );
  return result.rows[0];
};

exports.findAll = async ({ role, status, search } = {}) => {
  let q = `SELECT id, username, email, name, role, status, created_at FROM users WHERE 1=1`;
  const params = [];
  if (role)   { params.push(role);   q += ` AND role = $${params.length}`; }
  if (status) { params.push(status); q += ` AND status = $${params.length}`; }
  if (search) {
    params.push(`%${search}%`);
    q += ` AND (name ILIKE $${params.length} OR email ILIKE $${params.length} OR username ILIKE $${params.length})`;
  }
  q += ` ORDER BY created_at DESC`;
  const result = await pool.query(q, params);
  return result.rows;
};

exports.findById = async (id) => {
  const result = await pool.query(
    `SELECT id, username, email, name, role, status, phone, address, created_at
     FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0];
};

exports.findByEmail = async (email) => {
  const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  return result.rows[0];
};

exports.findByUsername = async (username) => {
  const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
  return result.rows[0];
};

exports.update = async (id, fields) => {
  const allowed = ["name", "email", "phone", "address", "role", "status"];
  const updates = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (!updates.length) throw new Error("No valid fields to update");

  const setClauses = updates.map(([k], i) => `${k} = $${i + 2}`).join(", ");
  const values     = updates.map(([, v]) => v);

  const result = await pool.query(
    `UPDATE users SET ${setClauses} WHERE id = $1
     RETURNING id, username, email, name, role, status, phone, address, created_at`,
    [id, ...values]
  );
  return result.rows[0];
};

exports.updatePassword = async (id, newHash) => {
  await pool.query("UPDATE users SET password_hash = $2 WHERE id = $1", [id, newHash]);
};

exports.delete = async (id) => {
  const result = await pool.query(
    "DELETE FROM users WHERE id = $1 RETURNING id", [id]
  );
  return result.rows[0];
};