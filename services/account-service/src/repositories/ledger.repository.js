// services/account-service/src/repositories/ledger.repository.js

const { v4: uuidv4 } = require("uuid");
const createPool = require("../../../shared/db");
const pool = createPool("ledger_db"); // ✅ Your separate ledger database

async function insertEntry(client, entry) {
  // ✅ DESTRUCTURE EXACTLY WHAT THE SERVICE SENDS
  const {
    id,
    transactionId,
    accountId,
    type,
    amount,
    balance_snapshot,  // ← Changed from 'balance' to match service
    reference,
    
    created_at,
  } = entry;

  //  CRITICAL VALIDATION (catches undefined/null/NaN before DB hits)
  if (balance_snapshot === undefined || balance_snapshot === null || isNaN(balance_snapshot)) {
    console.error("❌ balance_snapshot is invalid:", balance_snapshot);
    console.error("Full entry received:", entry);
    throw new Error("balance_snapshot must be a valid number");
  }

  const query = `
    INSERT INTO ledger_entries 
    (id, transaction_id, account_id, type, amount, balance_snapshot, reference, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  const values = [
    id || uuidv4(),
    transactionId,
    accountId,
    type,
    Number(amount),
    Number(balance_snapshot), // ✅ Force to number
    reference || null,
   
    created_at || new Date(),
  ];

  try {
    const { rows } = await client.query(query, values);
    return rows[0];
  } catch (err) {
    console.error("❌ Ledger Insert Failed:", err.message);
    console.error("Values:", values);
    throw err;
  }
}

module.exports = { pool, insertEntry };