-- scripts/init-db.sql

CREATE DATABASE IF NOT EXISTS identity_db;
CREATE DATABASE IF NOT EXISTS account_db;
CREATE DATABASE IF NOT EXISTS ledger_db;
CREATE DATABASE IF NOT EXISTS transaction_db;

-- ── Identity DB ───────────────────────────────────────────────────
USE identity_db;

CREATE TABLE IF NOT EXISTS users (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50)  UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  name          VARCHAR(100) NOT NULL,
  password_hash TEXT         NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'customer', -- 'admin' | 'employee' | 'customer'
  created_at    TIMESTAMP    DEFAULT NOW()
);

-- Default admin (password: admin123)
INSERT INTO users (username, email, name, password_hash, role)
VALUES (
  'adminn',
  'admin@banquee.tn',
  'System Admin',
  '$2a$12$ZmfuN1zs1lUflMZxvnhwMe8MNvNGKhKDKhMRQhuHRal7wt8Awnv4e',
  'admin'
) ON CONFLICT (email) DO NOTHING;

-- ── Account DB ────────────────────────────────────────────────────
USE account_db;

CREATE TABLE IF NOT EXISTS accounts (
  id         UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID           NOT NULL UNIQUE,
  balance    DECIMAL(15, 3) NOT NULL DEFAULT 0.000,
  currency   VARCHAR(10)    NOT NULL DEFAULT 'TND',
  created_at TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
);
USE ledger_db;
 
CREATE TABLE IF NOT EXISTS ledger_entries (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
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
 