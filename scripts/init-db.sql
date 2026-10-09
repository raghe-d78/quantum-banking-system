-- scripts/init-db.sql — CockroachDB bootstrap (fresh cluster).
-- Existing clusters: apply scripts/migrations/*.sql in order (make db-migrate).
--
-- One cluster, several logical databases (one per bounded context). A single
-- SQL transaction may span them via fully-qualified names, which the
-- account-service relies on for atomic account + ledger + outbox writes.

CREATE DATABASE IF NOT EXISTS identity_db;
CREATE DATABASE IF NOT EXISTS account_db;
CREATE DATABASE IF NOT EXISTS ledger_db;
CREATE DATABASE IF NOT EXISTS audit_db;
CREATE DATABASE IF NOT EXISTS fraud_db;

-- ── Identity ──────────────────────────────────────────────────────
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
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users (role, status);

-- Bootstrap admin (username: adminn / password: admin123). CHANGE IT after first login.
INSERT INTO users (username, email, name, password_hash, role)
VALUES ('adminn', 'admin@banquee.tn', 'System Admin',
        '$2a$12$ZmfuN1zs1lUflMZxvnhwMe8MNvNGKhKDKhMRQhuHRal7wt8Awnv4e', 'admin')
ON CONFLICT (email) DO NOTHING;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash   TEXT        PRIMARY KEY,
  user_id      UUID        NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expiry ON refresh_tokens (expires_at) WHERE revoked_at IS NULL;

-- ── Accounts ──────────────────────────────────────────────────────
USE account_db;

CREATE TABLE IF NOT EXISTS accounts (
  id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID           NOT NULL UNIQUE,
  cached_balance DECIMAL(19, 4) NOT NULL DEFAULT 0 CHECK (cached_balance >= 0),
  currency       VARCHAR(10)    NOT NULL DEFAULT 'TND' CHECK (currency IN ('TND', 'EUR', 'USD')),
  status         VARCHAR(16)    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FROZEN', 'CLOSED')),
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- ── Ledger (append-only) + outbox + cancellation registry ─────────
USE ledger_db;

CREATE TABLE IF NOT EXISTS ledger_entries (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   UUID           NOT NULL,
  account_id       UUID           NOT NULL,
  type             VARCHAR(10)    NOT NULL CHECK (type IN ('CREDIT', 'DEBIT')),
  tx_type          VARCHAR(16)    NOT NULL DEFAULT 'TRANSFER'
                     CHECK (tx_type IN ('DEPOSIT', 'WITHDRAW', 'TRANSFER', 'CANCELLATION')),
  amount           DECIMAL(19, 4) NOT NULL CHECK (amount > 0),
  balance_snapshot DECIMAL(19, 4) NOT NULL,
  reference        VARCHAR(100),
  compensates      UUID,                          -- original ledger row this entry reverses
  initiated_by     UUID,                          -- actor user id (staff or customer)
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_account_created   ON ledger_entries (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_transaction       ON ledger_entries (transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_daily_cap         ON ledger_entries (account_id, tx_type, type, created_at) WHERE compensates IS NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_compensates       ON ledger_entries (compensates) WHERE compensates IS NOT NULL;

CREATE TABLE IF NOT EXISTS event_outbox (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID         NOT NULL,
  topic           VARCHAR(100) NOT NULL,
  partition_key   VARCHAR(100) NOT NULL,
  payload         JSONB        NOT NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED')),
  attempts        INT          NOT NULL DEFAULT 0,
  last_error      TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON event_outbox (created_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_outbox_tx      ON event_outbox (transaction_id);

CREATE TABLE IF NOT EXISTS cancelled_transactions (
  original_transaction_id UUID        PRIMARY KEY,
  cancellation_id         UUID        NOT NULL UNIQUE,
  reason                  TEXT        NOT NULL,
  cancelled_by            UUID        NOT NULL,
  cancelled_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Audit (append-only, one row per transaction × account × event) ─
USE audit_db;

CREATE TABLE IF NOT EXISTS audit_logs (
  transaction_id   UUID          NOT NULL,
  event_type       VARCHAR(50)   NOT NULL,
  account_id       UUID          NOT NULL,
  amount           DECIMAL(19,4) NOT NULL,
  currency         VARCHAR(10)   NOT NULL,
  balance_snapshot DECIMAL(19,4),
  initiated_by     UUID,
  reference        TEXT,
  event_timestamp  TIMESTAMPTZ   NOT NULL,
  kafka_topic      VARCHAR(100),
  kafka_partition  INT,
  kafka_offset     INT8,
  payload          JSONB,
  recorded_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (transaction_id, account_id, event_type)
);
CREATE INDEX IF NOT EXISTS idx_audit_account_time ON audit_logs (account_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_time         ON audit_logs (event_timestamp DESC);

-- ── Fraud detection ───────────────────────────────────────────────
USE fraud_db;

CREATE TABLE IF NOT EXISTS fraud_scores (
  transaction_id   UUID         NOT NULL,
  account_id       UUID         NOT NULL,
  classical_score  DECIMAL(6,4) NOT NULL,
  quantum_score    DECIMAL(6,4) NOT NULL,
  decision_score   DECIMAL(6,4) NOT NULL,
  risk_level       VARCHAR(16)  NOT NULL CHECK (risk_level IN ('Low','Medium','High','Critical')),
  classical_model  VARCHAR(64)  NOT NULL,
  quantum_model    VARCHAR(64)  NOT NULL,
  scored_at        TIMESTAMPTZ  NOT NULL,
  features         JSONB,
  recorded_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (transaction_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_fraud_scores_account ON fraud_scores (account_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_scores_risk    ON fraud_scores (risk_level, scored_at DESC);

CREATE TABLE IF NOT EXISTS fraud_alerts (
  transaction_id  UUID          NOT NULL,
  account_id      UUID          NOT NULL,
  risk_level      VARCHAR(16)   NOT NULL CHECK (risk_level IN ('High','Critical')),
  decision_score  DECIMAL(6,4)  NOT NULL,
  status          VARCHAR(16)   NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CANCELLED','DISMISSED')),
  payload         JSONB         NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID,
  PRIMARY KEY (transaction_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_status ON fraud_alerts (status, created_at DESC);
