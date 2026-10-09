-- scripts/migrations/002_payments_and_idempotency.sql
-- Adds bill / merchant payments, the payee registry and idempotency keys.

USE ledger_db;
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS check_tx_type;
ALTER TABLE ledger_entries ADD CONSTRAINT check_tx_type
  CHECK (tx_type IN ('DEPOSIT', 'WITHDRAW', 'TRANSFER', 'BILL_PAYMENT', 'MERCHANT_PAYMENT', 'CANCELLATION'));
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id     UUID         NOT NULL,
  idem_key    VARCHAR(128) NOT NULL,
  response    JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idem_key)
);
CREATE INDEX IF NOT EXISTS idx_idem_created ON idempotency_keys (created_at);

USE account_db;
-- payees table + seed: copy the block from scripts/init-db.sql (idempotent ON CONFLICT DO NOTHING).
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

