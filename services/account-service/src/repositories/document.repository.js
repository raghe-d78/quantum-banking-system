// services/account-service/src/repositories/document.repository.js
//
// Reads document analyses written by document-cv-service (fraud_db, same
// CockroachDB cluster → same transaction) and manages held transactions.
const { pool, T } = require("./pool")

const q = (client) => (client || pool)

// Locks the document row so two transactions cannot both claim it.
const getDocumentForUpdate = async (client, documentId) => {
  const { rows } = await client.query(
    `SELECT document_id, owner_user_id, status, risk_score, requires_review, reasons, features,
            expected_amount, transaction_id, duplicate_of
       FROM ${T.documents} WHERE document_id = $1 FOR UPDATE`,
    [documentId]
  )
  return rows[0]
}

const linkDocument = async (client, documentId, transactionId) => {
  await client.query(`UPDATE ${T.documents} SET transaction_id = $2 WHERE document_id = $1`, [documentId, transactionId])
}

const createHold = async (client, { userId, accountId, kind, request, documentId, reason, riskScore }) => {
  const { rows } = await client.query(
    `INSERT INTO ${T.holds} (user_id, account_id, kind, request, document_id, reason, risk_score)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
    [userId, accountId, kind, JSON.stringify(request), documentId, reason, riskScore ?? null]
  )
  return rows[0]
}

const getHoldForUpdate = async (client, id) => {
  const { rows } = await client.query(`SELECT * FROM ${T.holds} WHERE id = $1 FOR UPDATE`, [id])
  return rows[0]
}

const decideHold = async (client, id, { status, decidedBy, note, transactionId = null }) => {
  await client.query(
    `UPDATE ${T.holds} SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4, transaction_id = $5 WHERE id = $1`,
    [id, status, decidedBy, note || null, transactionId]
  )
}

const listHolds = async ({ status = "PENDING_REVIEW", userId = null, limit = 50 } = {}, client) => {
  const params = []
  let sql = `SELECT h.id, h.user_id, h.account_id, h.kind, h.request, h.document_id, h.reason, h.risk_score, h.status,
                    h.created_at, h.decided_by, h.decided_at, h.decision_note, h.transaction_id,
                    d.status AS document_status, d.reasons AS document_reasons
               FROM ${T.holds} h LEFT JOIN ${T.documents} d ON d.document_id = h.document_id WHERE 1=1`
  if (status) { params.push(status); sql += ` AND h.status = $${params.length}` }
  if (userId) { params.push(userId); sql += ` AND h.user_id = $${params.length}` }
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 200))
  sql += ` ORDER BY h.created_at DESC LIMIT $${params.length}`
  const { rows } = await q(client).query(sql, params)
  return rows
}

module.exports = { getDocumentForUpdate, linkDocument, createHold, getHoldForUpdate, decideHold, listHolds }
