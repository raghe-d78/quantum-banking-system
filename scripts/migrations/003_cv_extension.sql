-- scripts/migrations/003_cv_extension.sql — document CV extension (Phase 7).

USE ledger_db;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS document_id UUID;
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


USE fraud_db;
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
