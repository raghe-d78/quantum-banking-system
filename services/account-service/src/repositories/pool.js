// services/account-service/src/repositories/pool.js
//
// ONE connection pool for the whole service. CockroachDB is a single cluster,
// so a transaction opened here can write `account_db.public.accounts`,
// `ledger_db.public.ledger_entries` and `ledger_db.public.event_outbox`
// atomically — no more "two BEGINs, two COMMITs" split-brain window.
const { createPool } = require("/shared/db")

const pool = createPool(process.env.DB_NAME || "ledger_db")

const T = {
  accounts:   "account_db.public.accounts",
  ledger:     "ledger_db.public.ledger_entries",
  outbox:     "ledger_db.public.event_outbox",
  cancelled:  "ledger_db.public.cancelled_transactions",
  payees:     "account_db.public.payees",
  idem:       "ledger_db.public.idempotency_keys",
}

module.exports = { pool, T }
