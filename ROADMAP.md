# Implementation Roadmap — Remaining Work

This document is the bridge between **`development_plan.md`** (the academic
PFE specification) and the **current state of the codebase**. It lists
everything that the spec calls for but is not yet built, ordered into
phases that respect the technical dependencies between deliverables.

Each phase explains **what**, **why** (technical argument), **how** (best
practice), and **acceptance criteria**. Implementation proceeds one phase
at a time so each merge keeps the system in a working state.

---

## Phase 0 — Sprint 1/2 Hardening (foundation gaps)

These are small, contained items that the spec lists in Sprints 1–2 but
were left unfinished. They unblock everything downstream and must land
before Kafka/QKD/QNN work begins.

### 0.1 — Refresh tokens + logout (FR-03, US-1.2)

- **What:** Issue a short-lived **access token** (15 min) and a long-lived
  **refresh token** (7 days). Add `POST /auth/refresh` and `POST /auth/logout`.
- **Why:** A single 24h JWT is the worst of both worlds — long enough that
  a stolen token is dangerous, short enough that users get logged out
  mid-session. Refresh tokens let access tokens expire fast (limiting blast
  radius of theft) while preserving UX. Spec FR-03 explicitly requires it.
- **Best practice:**
  - Sign access and refresh tokens with **different secrets** (`JWT_SECRET`
    and `JWT_REFRESH_SECRET`) so a compromised access secret can't mint
    refresh tokens and vice versa.
  - Store refresh tokens server-side in a `refresh_tokens` table keyed by
    a hash of the token (never store the raw token); enables revocation
    on logout and on password change.
  - Logout = delete the refresh-token row. Access tokens remain valid until
    natural expiry (acceptable given short TTL); a global `tokenVersion`
    on the user can force-invalidate if needed.
  - Rotate refresh tokens on every refresh (refresh-token reuse detection
    catches replay attacks).
- **Acceptance:**
  - `/auth/refresh` returns new access+refresh pair, invalidates the old refresh row.
  - `/auth/logout` deletes the refresh row; subsequent refresh attempts 401.
  - Existing 24h JWT flow keeps working until access TTL is migrated.

### 0.2 — Adopt `shared/money.js` everywhere

- **What:** Replace every `Number(amount)` arithmetic in
  `account.service.js` with `Money` operations.
- **Why:** IEEE-754 floats lose cents at scale (`0.1 + 0.2 !== 0.3`). The
  spec's NFR table mandates **Decimal.js (19, 4)** to "prevent rounding
  errors". The `Money` class is already implemented and tested-by-design
  in `shared/money.js` but never imported. This is a one-line risk for
  financial integrity.
- **Best practice:**
  - All amounts crossing service boundaries are stringified decimals, not
    JS numbers (`"100.0000"` not `100`).
  - DB columns stay `DECIMAL(15,4)`; `pg` driver returns strings — feed
    those directly into `Money` (it accepts strings).
  - Add round-trip tests: deposit 0.1 + 0.2 ten times must equal 3.0000.
- **Acceptance:** Existing deposit/withdraw/transfer endpoints behave
  identically to a human, but `console.log` shows precise 4-dp arithmetic.

### 0.3 — Daily transfer limits + self-transfer guard (T2.5b)

- **What:** Reject transfers to the same account, and reject transfers
  that would push the user past `DAILY_TRANSFER_LIMIT_TND` (env, default
  10 000 TND). Self-transfer is already half-blocked in code; finish the
  daily limit.
- **Why:** Trivial fraud mitigation that the spec calls out by ID. Also a
  prerequisite for the Phase 4 fraud-detection layer (gives the model a
  rule-based baseline to beat).
- **Best practice:** Compute the limit from `ledger_entries` for the last
  24h within the same DB transaction that holds the row lock — otherwise
  two parallel transfers can each pass the check and both commit.
- **Acceptance:** 11 000 TND in a single transfer = 400; 6 000 + 6 000 in
  the same day = second one is 400.

### 0.4 — Rate limiting on auth endpoints

- **What:** `express-rate-limit` on `/auth/*` (5/min/IP for login,
  10/min/IP for refresh).
- **Why:** Spec's Security NFR explicitly lists rate limiting. Without it,
  the bcrypt(10) cost is the only brake on a credential-stuffing attack.
- **Best practice:** Apply at the API Gateway (single choke point). Use
  Redis-backed store once Phase 2 lands; in-memory is fine until then,
  with a clear `// TODO: swap to Redis` marker.
- **Acceptance:** 6th login attempt within 60s returns 429.

### 0.5 — OpenAPI / Swagger documentation

- **What:** `swagger-jsdoc` + `swagger-ui-express` on the API Gateway
  exposing `/docs`.
- **Why:** Spec NFR Maintainability mandates "Swagger / OpenAPI docs".
  Also the cheapest possible win for the jury demo.
- **Best practice:** Generate from JSDoc comments next to each route to
  keep docs and code synchronized. Single aggregated spec served from the
  gateway, even though each route ultimately lives in another service.
- **Acceptance:** `GET /docs` renders all endpoints from §14 of the spec.

---

## Phase 1 — Event Backbone (Kafka + Audit Worker)

Sprint 2 deliverables T7.1–T7.6 in the spec. This phase is a hard
dependency for Phase 4 (fraud detection consumes the same topic).

### 1.1 — Kafka + Zookeeper in docker-compose

- **What:** Add `zookeeper` and `kafka` services; expose 9092 internally,
  9093 to host. Auto-create topics `transaction.events` (3 partitions, 7d
  retention) and `audit.logs` (1 partition, 30d retention).
- **Why:** Decouples synchronous transaction execution from downstream
  consumers (audit, fraud detection, analytics). Enables the spec's
  "Zone 2 event-driven communication bus".
- **Best practice:**
  - Use `bitnami/kafka` (KRaft mode) to drop Zookeeper if simplicity
    matters more than spec literalism — but spec says Zookeeper, so keep
    it for academic fidelity and add a comment.
  - Health checks on both, `depends_on: condition: service_healthy`
    chained from account-service.
  - Topic partitioning by `accountId` so per-account ordering is preserved.

### 1.2 — Transaction event producer in account-service

- **What:** After every successful COMMIT in deposit/withdraw/transfer,
  publish a JSON event `{ transactionId, type, accountId, amount,
  currency, balanceSnapshot, timestamp, initiatedBy }` to
  `transaction.events`, keyed by `accountId`.
- **Why:** Consumers (audit, fraud, analytics) subscribe instead of
  polling — the only way to make the fraud layer non-blocking.
- **Best practice:**
  - **Outbox pattern:** insert the event into a local `event_outbox`
    table inside the same DB transaction as the ledger entry, then a
    relay process publishes from outbox → Kafka. Guarantees
    "at-least-once" without losing events on a Kafka outage.
  - Idempotency key = `transactionId`; consumers dedupe on it.
  - Use `kafkajs` (active maintainer, no native deps).
- **Acceptance:** Deposit produces a visible event on `transaction.events`
  even if Kafka is restarted between the DB commit and the publish.

### 1.3 — `audit-service` (new microservice)

- **What:** Separate Node.js service that consumes `transaction.events`
  and writes to a new `audit_logs` table in CockroachDB, partitioned by
  Kafka offset.
- **Why:** Spec §11 explicitly mandates "Audit-Worker (Node.js Kafka
  Consumer) persists events to `audit_logs` table". Read-only access for
  admins via a future `/admin/audit` endpoint feeds US-4.6 (security logs).
- **Best practice:**
  - **Exactly-once via consumer offset commit only after DB INSERT
    succeeds.** Combined with idempotent INSERT (`ON CONFLICT
    (transaction_id) DO NOTHING`), this is effectively exactly-once.
  - Consumer group `audit-workers`; horizontal scaling = add replicas.
  - Backpressure: pause consumption if DB lag exceeds threshold.

### 1.4 — Load test (T7.5)

- **What:** k6 script firing 100 concurrent deposits at the same account.
- **Why:** Validates that pessimistic locking + Kafka outbox don't lose
  events and the final balance equals the sum of all deposits.
- **Acceptance:** Script in `scripts/loadtest/concurrent-deposits.js`;
  Makefile target `make loadtest`; report committed.

---

## Phase 2 — Redis Cache + Hardening

### 2.1 — Redis service + `cache` module

- **What:** Redis 7 in compose; thin wrapper in `shared/cache.js` with
  `get/set/del` and TTL.
- **Why:** Spec lists Redis explicitly; balance lookups are read-heavy
  and trivially cacheable. Also unblocks distributed rate-limiter store.
- **Best practice:**
  - Cache **read models only**, never write-through. Invalidate on every
    successful ledger commit (publish to a Redis pub/sub channel from
    account-service; all readers `DEL balance:{accountId}`).
  - Short TTL (60s) as a safety net against missed invalidations.
  - Cache key namespace = `{db}:{entity}:{id}`.

### 2.2 — Move rate limiter to Redis store

Once Redis is up, switch `express-rate-limit` to
`rate-limit-redis` so limits are shared across multiple gateway replicas.

---

## Phase 3 — Quantum Layer (QKD + QRNG)

This is the first phase that introduces a Python service. The whole
quantum stack lives in **one new service**, `quantum-service`, written in
Python (Flask + Qiskit) and called via HTTP from Node.

### 3.1 — `quantum-service` skeleton

- **What:** Flask app on port 3004; `/health`, `/qrng`, `/qkd/bb84`,
  `/qkd/visualize`. Qiskit Aer simulator only (free tier).
- **Why:** Qiskit is Python-only — there is no first-class Node binding.
  Isolating it in its own container avoids dragging Python into the rest
  of the stack and lets us later swap simulator → IBM Quantum hardware
  with no JS changes.
- **Best practice:**
  - Pin Qiskit version (`qiskit==1.2.*`) — Qiskit Terra/Aer split changed
    APIs frequently; pin or break.
  - One Gunicorn worker per CPU; circuits release the GIL during execution.
  - Cache compiled circuits (transpilation is slow, execution is cheap).

### 3.2 — Quantum Random Number Generator (FR-13)

- **What:** `GET /qrng?bits=256` returns a hex string of 256 truly-random
  bits (one Hadamard + measure per qubit, batched).
- **Why:** Replaces `crypto.randomBytes` for refresh-token generation
  (Phase 0.1 uses Node's CSPRNG; once QRNG is up, swap it). Spec FR-13.
- **Best practice:**
  - Buffer 4 KB of QRNG bits at a time and serve from buffer; refilling
    via Qiskit per-request would add ~200 ms.
  - Fall back to `secrets.token_bytes()` with a logged warning if
    the simulator is unreachable — never block auth on quantum.

### 3.3 — BB84 protocol (FR-14)

- **What:** `POST /qkd/bb84 { nBits, eavesdropper: bool }` returns
  `{ key, qber, eavesdropperDetected }`. Implements: Alice random bits +
  bases, Bob random bases, optional Eve intercept-resend, basis
  reconciliation, QBER over a sample subset, reject if QBER > 11%.
- **Why:** Demonstrates information-theoretic security — the spec's
  centerpiece for HNDL mitigation.
- **Best practice:**
  - `nBits` ≥ 256 raw → ~128 sifted, fine for AES-128. Document the
    factor-of-4 inflation (raw → sifted → privacy-amplified).
  - Run 3 independent rounds and majority-vote the QBER to smooth
    statistical noise from short keys.

### 3.4 — KMS integration

- **What:** `kms-service` (Node) wraps `quantum-service`'s BB84 output as
  a key store. API: `POST /kms/keys` (generate), `GET /kms/keys/:id`
  (retrieve once, then mark used). Service-to-service calls between
  api-gateway → identity → account use a session key from KMS for
  payload encryption (AES-GCM with the BB84-derived key).
- **Best practice:** **Never** transmit the key itself across the wire
  twice — keys are write-once, read-once, then destroyed.

### 3.5 — Quantum circuit visualization (FR-15)

- **What:** Qiskit's `circuit.draw('mpl')` rendered as PNG, served by
  `GET /qkd/visualize?nBits=8`. Frontend embeds in an admin page.
- **Best practice:** Cap `nBits` at 16 server-side — circuits beyond that
  are unreadable and slow to render.

---

## Phase 4 — Quantum ML Fraud Detection

### 4.1 — Feature pipeline + classical baseline

- **What:** A consumer of `transaction.events` (in `quantum-service` or a
  sibling `fraud-service`) builds per-transaction feature vectors:
  amount, hour, day-of-week, rolling 24h count, rolling 24h sum, recipient
  account age, etc. Train a logistic-regression baseline on synthetic
  data first.
- **Why:** Spec §4.3 acknowledges QML doesn't yet beat classical; the
  comparison is the deliverable. Without a classical baseline there is
  nothing to compare against.

### 4.2 — VQC / QSVM (FR-09, FR-16)

- **What:** Qiskit `VQC` with `ZZFeatureMap` + `RealAmplitudes` ansatz +
  COBYLA optimizer. Train offline on the synthetic dataset; expose
  `POST /fraud/score { features }` returning `{ score, confidence,
  riskLevel }`.
- **Best practice:**
  - Keep **the model file** (`.npz` of trained parameters) checked into
    `quantum-service/models/`. Re-training on container start is too slow
    for a demo.
  - Risk thresholds: <0.25 Low, <0.50 Medium, <0.75 High, ≥0.75 Critical.
  - Confidence = max-class probability after softmax.

### 4.3 — Fraud pipeline wiring

- **What:** `account-service.transfer` (and deposit/withdraw above a
  threshold) publishes the event; `fraud-service` consumes, scores,
  publishes back to `transaction.scored`; `audit-service` (or a new
  `alert-service`) writes Critical/High to a `fraud_alerts` table.
- **Best practice:** Scoring is **post-hoc** in the PoC — we do not
  block the transaction on fraud verdict (latency budget too tight). The
  cancel-tx flow (US-4.5) is the corrective mechanism.

### 4.4 — Cancel fraudulent transaction (US-4.5)

- **What:** `POST /admin/transactions/:id/cancel` writes a compensating
  ledger entry (no UPDATE/DELETE on `ledger_entries`) and emits a
  `transaction.cancelled` event.
- **Best practice:** The compensating entry's `reference` includes the
  original `transactionId` — auditable trail, no history rewrite.

### 4.5 — Frontend: fraud dashboard, alerts, cancel UI, security logs

- US-4.3 (employee monitor), US-4.4 (admin reports), US-4.6 (security
  logs viewer) — pages in `staff_frontend` consuming the new endpoints.

---

## Phase 5 — NFR finalization

### 5.1 — Test coverage to ≥60% (NFR Maintainability)
Jest + supertest already scaffolded. Add integration tests for every
Money path, every Kafka producer, every BB84 / QRNG endpoint.

### 5.2 — HTTPS termination
Caddy reverse proxy in front of api-gateway in a `infrastructure/docker-compose.prod.yml` overlay, with automatic Let's Encrypt.

### 5.3 — Centralized config / secrets
Move `JWT_SECRET`, `JWT_REFRESH_SECRET`, DB creds, Kafka brokers, IBM
Quantum API token to `infrastructure/.env`, referenced from compose with
`${VAR}` syntax. Provide `.env.example`.

### 5.4 — Comparative analysis report
Markdown report: classical baseline accuracy, precision, recall, F1, ROC
AUC vs. quantum. Also runtime per inference. This is the academic
deliverable for §4.3.

---

## Phase ordering rationale

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5
(harden)   (Kafka)     (Redis)     (Quantum)   (Fraud)     (NFR)
                │                       │
                └───────────────────────┴── Phase 4 needs both Kafka events
                                            and the quantum-service skeleton
```

- Phase 1 (Kafka) before Phase 4 (fraud) because fraud detection consumes
  `transaction.events`.
- Phase 2 (Redis) before Phase 5.1 (load tests at scale).
- Phase 3 (quantum-service) before Phase 4 because Phase 4 reuses the
  Python container, model serving infra, and circuit-execution patterns.

---

## Status tracking

Phase progress is tracked in `CHANGELOG.md` under dated headings as each
sub-task lands. Items in this roadmap are crossed off only after their
acceptance criteria pass.
