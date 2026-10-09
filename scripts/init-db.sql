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

-- Payees: billers and merchants a customer can pay. Each has a settlement
-- account in `accounts` (fixed ids) so every payment stays double-entry.
CREATE TABLE IF NOT EXISTS payees (
  code        VARCHAR(32)  PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  kind        VARCHAR(16)  NOT NULL CHECK (kind IN ('BILLER', 'MERCHANT')),
  category    VARCHAR(32)  NOT NULL,
  account_id  UUID         NOT NULL,
  reference_hint VARCHAR(100),
  active      BOOL         NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

INSERT INTO accounts (id, user_id, cached_balance, currency, status) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 0, 'TND', 'ACTIVE'),
  ('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 0, 'TND', 'ACTIVE'),
  ('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', 0, 'TND', 'ACTIVE'),
  ('a0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000004', 0, 'TND', 'ACTIVE'),
  ('a0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000005', 0, 'TND', 'ACTIVE'),
  ('a0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000006', 0, 'TND', 'ACTIVE'),
  ('a0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000007', 0, 'TND', 'ACTIVE'),
  ('a0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000008', 0, 'TND', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO payees (code, name, kind, category, account_id, reference_hint) VALUES
  ('STEG',      'STEG — Electricity & Gas',   'BILLER',   'Utilities', 'a0000000-0000-4000-8000-000000000001', 'Contract number (e.g. 123456789)'),
  ('SONEDE',    'SONEDE — Water',             'BILLER',   'Utilities', 'a0000000-0000-4000-8000-000000000002', 'Contract number'),
  ('TOPNET',    'Topnet — Internet',          'BILLER',   'Telecom',   'a0000000-0000-4000-8000-000000000003', 'Customer ID'),
  ('OOREDOO',   'Ooredoo — Mobile',           'BILLER',   'Telecom',   'a0000000-0000-4000-8000-000000000004', 'Phone number'),
  ('TT',        'Tunisie Telecom',            'BILLER',   'Telecom',   'a0000000-0000-4000-8000-000000000005', 'Phone or line number'),
  ('CARREFOUR', 'Carrefour Market',           'MERCHANT', 'Retail',    'a0000000-0000-4000-8000-000000000006', 'Receipt number (optional)'),
  ('MONOPRIX',  'Monoprix',                   'MERCHANT', 'Retail',    'a0000000-0000-4000-8000-000000000007', 'Receipt number (optional)'),
  ('JUMIA',     'Jumia Tunisia',              'MERCHANT', 'E-commerce','a0000000-0000-4000-8000-000000000008', 'Order number')
ON CONFLICT (code) DO NOTHING;

-- ── Ledger (append-only) + outbox + cancellation registry ─────────
USE ledger_db;

CREATE TABLE IF NOT EXISTS ledger_entries (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   UUID           NOT NULL,
  account_id       UUID           NOT NULL,
  type             VARCHAR(10)    NOT NULL CHECK (type IN ('CREDIT', 'DEBIT')),
  tx_type          VARCHAR(16)    NOT NULL DEFAULT 'TRANSFER'
                     CHECK (tx_type IN ('DEPOSIT', 'WITHDRAW', 'TRANSFER', 'BILL_PAYMENT', 'MERCHANT_PAYMENT', 'CANCELLATION')),
  amount           DECIMAL(19, 4) NOT NULL CHECK (amount > 0),
  balance_snapshot DECIMAL(19, 4) NOT NULL,
  reference        VARCHAR(100),
  compensates      UUID,                          -- original ledger row this entry reverses
  initiated_by     UUID,                          -- actor user id (staff or customer)
  document_id      UUID,                          -- supporting document (document-cv-service)
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

-- Idempotency keys for POST /transactions: one key per user; the stored
-- response is replayed on retries, inside the same transaction as the write.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id     UUID         NOT NULL,
  idem_key    VARCHAR(128) NOT NULL,
  response    JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idem_key)
);
CREATE INDEX IF NOT EXISTS idx_idem_created ON idempotency_keys (created_at);

-- Transactions suspended by the document-risk policy (CV extension §11):
-- the full request is parked here until staff release or reject it.
CREATE TABLE IF NOT EXISTS held_transactions (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL,
  account_id      UUID         NOT NULL,
  kind            VARCHAR(20)  NOT NULL,
  request         JSONB        NOT NULL,
  document_id     UUID,
  reason          TEXT         NOT NULL,
  risk_score      DECIMAL(6,4),
  status          VARCHAR(16)  NOT NULL DEFAULT 'PENDING_REVIEW'
                    CHECK (status IN ('PENDING_REVIEW','RELEASED','REJECTED')),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  decided_by      UUID,
  decided_at      TIMESTAMPTZ,
  decision_note   TEXT,
  transaction_id  UUID
);
CREATE INDEX IF NOT EXISTS idx_holds_status ON held_transactions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_holds_user   ON held_transactions (user_id, created_at DESC);

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

-- ── Document CV extension ─────────────────────────────────────────
-- One row per uploaded document. Image ciphertext lives on the
-- document-cv-service volume; only metadata, features and the wrapped
-- data key are stored here. fraud-service joins on document_id.
CREATE TABLE IF NOT EXISTS document_analyses (
  document_id       UUID          PRIMARY KEY,
  owner_user_id     UUID          NOT NULL,
  kind              VARCHAR(16)   NOT NULL DEFAULT 'CHECK',
  mime              VARCHAR(32)   NOT NULL,
  size_bytes        INT           NOT NULL,
  sha256            CHAR(64)      NOT NULL,
  phash             CHAR(16),
  status            VARCHAR(16)   NOT NULL CHECK (status IN ('CLEAN','REVIEW','SUSPICIOUS')),
  risk_score        DECIMAL(6,4)  NOT NULL,
  requires_review   BOOL          NOT NULL DEFAULT false,
  features          JSONB         NOT NULL,
  ocr               JSONB,
  integrity         JSONB,
  quality           JSONB,
  signature         JSONB,
  reasons           JSONB,
  expected_amount   DECIMAL(19,4),
  expected_currency VARCHAR(10),
  duplicate_of      UUID,
  transaction_id    UUID,
  enc_nonce         TEXT          NOT NULL,
  wrapped_dek       TEXT          NOT NULL,
  wrap_nonce        TEXT          NOT NULL,
  key_source        VARCHAR(16)   NOT NULL,
  kms_kid           UUID,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  reviewed_by       UUID,
  reviewed_at       TIMESTAMPTZ,
  review_note       TEXT
);
CREATE INDEX IF NOT EXISTS idx_docs_owner   ON document_analyses (owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_docs_status  ON document_analyses (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_docs_sha     ON document_analyses (sha256);

-- Reference signature per customer (experimental, spec §7).
CREATE TABLE IF NOT EXISTS signature_templates (
  user_id      UUID        PRIMARY KEY,
  descriptor   JSONB       NOT NULL,
  crop_png     BYTES       NOT NULL,
  enrolled_by  UUID        NOT NULL,
  enrolled_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
