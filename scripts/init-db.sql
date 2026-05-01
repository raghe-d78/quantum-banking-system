-- scripts/init-db.sql

CREATE DATABASE IF NOT EXISTS identity_db;
CREATE DATABASE IF NOT EXISTS account_db;
CREATE DATABASE IF NOT EXISTS ledger_db;
CREATE DATABASE IF NOT EXISTS transaction_db;
CREATE DATABASE IF NOT EXISTS audit_db;

-- ── Identity DB ───────────────────────────────────────────────────
USE identity_db;

CREATE TABLE IF NOT EXISTS users (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50)  UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  name          VARCHAR(100) NOT NULL,
  password_hash TEXT         NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'customer'
                  CHECK (role IN ('admin', 'employee', 'customer')),
  status        VARCHAR(20)  NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'suspended')),
  phone         VARCHAR(30),
  address       VARCHAR(255),
  created_at    TIMESTAMP    DEFAULT NOW()
);

-- Default admin (password: admin123)
INSERT INTO users (username, email, name, password_hash, role)
VALUES (
  'adminn',
  'admin@banquee.tn',
  'System Admin',
  '$2a$12$ZmfuN1zs1lUflMZxvnhwMe8MNvNGKhKDKhMRQhuHRal7wt8Awnv4e',  -- hash of "admin123"
  'admin'
) ON CONFLICT (email) DO NOTHING;

-- ── Account DB ────────────────────────────────────────────────────
USE account_db;

CREATE TABLE IF NOT EXISTS accounts (
  id         UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID           NOT NULL UNIQUE,
  cached_balance            DECIMAL(15, 3) NOT NULL DEFAULT 0.000,
  currency   VARCHAR(10)    NOT NULL DEFAULT 'TND',
  created_at TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
);
USE ledger_db;
 
CREATE TABLE IF NOT EXISTS ledger_entries (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   UUID           NOT NULL,
  account_id       UUID           NOT NULL,
  type             VARCHAR(10)    NOT NULL CHECK (type IN ('CREDIT', 'DEBIT')),
  amount           DECIMAL(15, 4) NOT NULL CHECK (amount > 0),
  balance_snapshot DECIMAL(15, 4) NOT NULL,
  reference        VARCHAR(100),
  created_at       TIMESTAMP      DEFAULT NOW()
);
 
-- Index for fast lookup by account + chronological order
CREATE INDEX IF NOT EXISTS idx_ledger_account_created
  ON ledger_entries (account_id, created_at ASC);

-- ── Refresh tokens (Phase 0.1) ────────────────────────────────────
USE identity_db;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash   TEXT       PRIMARY KEY,
  user_id      UUID       NOT NULL,
  expires_at   TIMESTAMP  NOT NULL,
  created_at   TIMESTAMP  NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
  ON refresh_tokens (user_id);

-- ── Event Outbox (Phase 1.2) ──────────────────────────────────────
-- Sits in ledger_db so it can be inserted in the same transaction as
-- the ledger entry. A relay loop in account-service publishes PENDING
-- rows to Kafka and flips them to SENT.
USE ledger_db;

CREATE TABLE IF NOT EXISTS event_outbox (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID         NOT NULL,
  topic           VARCHAR(100) NOT NULL,
  partition_key   VARCHAR(100) NOT NULL,
  payload         JSONB        NOT NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','SENT','FAILED')),
  attempts        INT          NOT NULL DEFAULT 0,
  last_error      TEXT,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON event_outbox (status, created_at) WHERE status = 'PENDING';

-- ── Audit Logs (Phase 1.3) ────────────────────────────────────────
USE audit_db;

CREATE TABLE IF NOT EXISTS audit_logs (
  transaction_id   UUID         PRIMARY KEY,
  event_type       VARCHAR(50)  NOT NULL,
  account_id       UUID         NOT NULL,
  amount           DECIMAL(15,4) NOT NULL,
  currency         VARCHAR(10)  NOT NULL,
  balance_snapshot DECIMAL(15,4),
  initiated_by     UUID,
  reference        TEXT,
  event_timestamp  TIMESTAMP    NOT NULL,
  kafka_partition  INT,
  kafka_offset     INT8,
  recorded_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_account_time
  ON audit_logs (account_id, event_timestamp DESC);
