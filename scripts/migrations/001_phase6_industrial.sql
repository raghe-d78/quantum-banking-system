-- scripts/migrations/001_phase6_industrial.sql
-- Upgrade an EXISTING cluster created with the pre-Phase-6 init-db.sql.
-- Idempotent where CockroachDB allows it. Apply with:  make db-migrate

USE account_db;
ALTER TABLE accounts ALTER COLUMN cached_balance SET DATA TYPE DECIMAL(19, 4);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

USE ledger_db;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS tx_type VARCHAR(16) NOT NULL DEFAULT 'TRANSFER';
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS compensates UUID;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS initiated_by UUID;
ALTER TABLE ledger_entries ALTER COLUMN amount SET DATA TYPE DECIMAL(19, 4);
ALTER TABLE ledger_entries ALTER COLUMN balance_snapshot SET DATA TYPE DECIMAL(19, 4);
-- Back-fill tx_type for historical rows from the reference text heuristics.
UPDATE ledger_entries SET tx_type = 'DEPOSIT'      WHERE tx_type = 'TRANSFER' AND type = 'CREDIT' AND reference ILIKE 'Deposit%';
UPDATE ledger_entries SET tx_type = 'WITHDRAW'     WHERE tx_type = 'TRANSFER' AND type = 'DEBIT'  AND reference ILIKE 'Withdrawal%';
UPDATE ledger_entries SET tx_type = 'CANCELLATION' WHERE compensates IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_transaction ON ledger_entries (transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_daily_cap   ON ledger_entries (account_id, tx_type, type, created_at) WHERE compensates IS NULL;
CREATE INDEX IF NOT EXISTS idx_outbox_tx          ON event_outbox (transaction_id);

USE audit_db;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS kafka_topic VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS payload JSONB;
ALTER TABLE audit_logs ALTER PRIMARY KEY USING COLUMNS (transaction_id, account_id, event_type);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs (event_timestamp DESC);

USE fraud_db;
ALTER TABLE fraud_scores ALTER PRIMARY KEY USING COLUMNS (transaction_id, account_id);
ALTER TABLE fraud_alerts ALTER PRIMARY KEY USING COLUMNS (transaction_id, account_id);
