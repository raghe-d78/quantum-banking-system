// services/identity-service/src/refreshToken.repository.js
// Stores SHA-256 hashes of refresh tokens — never the raw token.
const crypto = require("crypto");
const createPool = require("../../../shared/db");
const pool = createPool("identity_db");

const hash = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

exports.hash = hash;

exports.insert = async ({ token, userId, expiresAt }) => {
  await pool.query(
    `INSERT INTO refresh_tokens (token_hash, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [hash(token), userId, expiresAt]
  );
};

// Returns the row only if the token is present, not revoked, not expired.
exports.findActive = async (token) => {
  const { rows } = await pool.query(
    `SELECT token_hash, user_id, expires_at
     FROM refresh_tokens
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()`,
    [hash(token)]
  );
  return rows[0];
};

exports.revoke = async (token) => {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
    [hash(token)]
  );
};

exports.revokeAllForUser = async (userId) => {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
};
