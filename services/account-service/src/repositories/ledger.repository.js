const createPool = require("/shared/db")

const pool = createPool("ledger_db")

async function insertEntry(client, entry) {
  const {
    transactionId,
    accountId,
    type,
    amount,
    balance
  } = entry

  await client.query(
    `INSERT INTO ledger_entries 
    (transaction_id, account_id, type, amount, balance_snapshot)
    VALUES ($1,$2,$3,$4,$5)`,
    [transactionId, accountId, type, amount, balance]
  )
}

module.exports = {
  pool,
  insertEntry
}