# Implementation Plan — Quantum Banking System

> **Scope:** Bridges the Chapter 2 specification to the *actual* current state of this repository.  
> **Branch:** `docs/chapter-2-and-implementation-plan`  
> **Status:** Planning document — no code changes in this PR.

---

## 1. Executive Summary

The Chapter 2 specification calls for a stack built around **Flask + Qiskit + PostgreSQL + Kafka + Redis + QKD KMS + QNN** running as SOA microservices. The repository as it stands today is a **Node.js (Express) + CockroachDB + React/Vite** system composed of four services (`api-gateway`, `identity-service`, `account-service`, `ledger-service`) with no Python, no Qiskit, no Kafka, no Redis, no QKD layer, and no machine-learning components anywhere in the codebase.

The pragmatic path forward is a **hybrid architecture**: keep the existing Node.js microservices as the backbone of all classical banking flows (authentication, account management, ledger, gateway routing), and introduce a **new Python "quantum-service"** (FastAPI + Qiskit) reachable from the API gateway for the quantum/ML-specific features (QRNG, BB84 simulation, VQC fraud classifier, circuit visualisation). This avoids a full rewrite, preserves the existing CI pipeline, and allows the quantum PoC to be developed and tested independently. A `transaction-orchestrator` service (Node.js) will own the Saga pattern and Kafka integration for Sprint 3, while the `ledger-service` will be hardened from a stub into a real append-only service.

---

## 2. Gap Analysis (Spec vs. Repo)

| Requirement | Spec says | Repo today | Gap | Action |
|---|---|---|---|---|
| FR-01 — Customer login | Email + password → JWT | ✅ Implemented in `identity-service` | Minor | Verify token format matches spec |
| FR-02 — Staff login | Role-based JWT for employees/admin | ✅ Implemented (`role` field in `users`) | Minor | Add role guards to protected endpoints |
| FR-03 — QRNG-seeded JWT secret | JWT secret seeded by quantum RNG | ❌ Hard-coded `JWT_SECRET` in compose | Full gap | Wire `/qrng` from `quantum-service` into secret rotation |
| FR-04 — Refresh tokens | Short-lived access + long-lived refresh | ❌ Single 24 h token, no refresh endpoint | Full gap | Add `POST /auth/refresh`; blacklist via Redis |
| FR-05 — Deposit | `POST /deposit` → update balance | ✅ Exists in `account-service` | Partial | Fix non-atomic dual-pool commit (see §3) |
| FR-06 — Transfer | `POST /transfer` between accounts | ❌ Gateway route exists but `account-service` has no handler | Full gap | Implement in Sprint 3 |
| FR-07 — Withdraw | `POST /withdraw` | ❌ Missing | Full gap | Implement in Sprint 3 |
| FR-08 — Transaction history / filter / export | `GET /transactions`, filter, PDF export | ❌ Gateway proxies exist; `account-service` has no implementation | Full gap | Implement history + jsPDF export in Sprint 3–4 |
| FR-09 — NN fraud classification | Automatic fraud score per transaction | ❌ Totally absent | Full gap | Classical heuristic in Sprint 5; VQC in Sprint 6 |
| FR-10 — Confidence score | Probability output from classifier | ❌ Totally absent | Full gap | Return `risk_score` and `confidence` from `quantum-service` |
| FR-13 — QRNG | Quantum random number generation via Qiskit | ❌ Totally absent | Full gap | `quantum-service` `/qrng` endpoint (Sprint 6) |
| FR-14 — BB84 simulation | QKD channel simulation | ❌ Totally absent | Full gap | `quantum-service` `/bb84/simulate` (Sprint 6) |
| FR-15 — Circuit visualisation | Render Qiskit circuit as image | ❌ Totally absent | Full gap | `quantum-service` `/circuit/visualize` → SVG/PNG (Sprint 6) |
| FR-16 — QNN/VQC classifier | Variational Quantum Classifier inference | ❌ Totally absent | Full gap | `quantum-service` `/fraud/predict` via Qiskit Aer (Sprint 6) |
| FR-17 — KPI dashboard | Real-time metrics UI | ❌ No dashboard service | Full gap | `MetricsDashboard.jsx` in `staff_frontend` (Sprint 6) |
| FR-18 — Security logs | Audit log viewer | ❌ No audit logging | Full gap | `SecurityLogsPage.jsx` + structured logs (Sprint 6) |
| FR-19 — Prometheus metrics | `/metrics` endpoint | ❌ Absent from all services | Full gap | Add `prom-client` to each Node service (Sprint 6) |
| FR-20 — Comparative reports | Classical vs quantum fraud performance | ❌ Absent | Full gap | Report generator page (Sprint 6) |
| NFR — Rate limiting | Express rate limit on all routes | ❌ Missing | Full gap | `express-rate-limit` in every Express service (Sprint 1) |
| NFR — Security headers | Helmet middleware | ❌ Missing | Full gap | `helmet` in every Express service (Sprint 1) |
| NFR — Input validation | Schema validation | ❌ Missing | Full gap | `Joi` validators per route (Sprints 1–3) |
| NFR — HTTPS | TLS termination | ❌ All services run plain HTTP | Full gap | nginx TLS termination (Sprint 6) |
| NFR — Swagger / OpenAPI | API documentation | ❌ Missing | Full gap | `swagger-ui-express` + `openapi.yaml` (Sprint 1+) |
| Architecture — Redis | Token blacklist, session cache | ❌ Not in compose or any service | Full gap | Add Redis container + client in Sprint 1 |
| Architecture — Kafka | Event bus for transactions/fraud | ❌ Not present | Full gap | Add Kafka + Zookeeper in Sprint 5 |
| Architecture — Saga pattern | Distributed transaction coordination | ❌ Not present | Full gap | `transaction-orchestrator` service in Sprint 3 |
| Architecture — QKD KMS | BB84 key management sidecar | ❌ Not present | Full gap | `qkd-kms` Python sidecar in Sprint 6 |
| Architecture — Immutable ledger | Append-only DB with INSERT-only role | ⚠️ `ledger-service` exists but uses absolute `/shared/db` path | Partial | Fix path bug; grant INSERT-only DB role (Sprint 0) |
| Data — `transaction_db` | Fully modelled transaction store | ❌ `init-db.sql` creates DB but no tables | Full gap | Add schema in Sprint 3 |
| Data — Atomic deposit | Transactional balance + ledger update | ❌ Two separate `Pool` objects, no transaction | Critical bug | Fix in Sprint 0 (see §3) |

---

## 3. Critical Bug Fixes (Must Land Before New Features)

The following defects block spec compliance. All should be resolved in **Sprint 0** before feature work begins.

### BUG-01 — Undefined `IDENTITY` variable in API gateway
**File:** `services/api-gateway/src/server.js` lines 44 & 49  
**Description:** Routes `POST /auth/customer/login` and `POST /auth/staff/login` reference `${IDENTITY}` which is never declared. The correct variable is `IDENTITY_SERVICE_URL` defined at line 22. All login calls will throw `ReferenceError: IDENTITY is not defined` at runtime.  
**Fix:** Replace both occurrences of `` `${IDENTITY}/auth/... `` with `` `${IDENTITY_SERVICE_URL}/auth/... ``

### BUG-02 — Absolute `/shared/db` path in ledger-service
**File:** `services/ledger-service/src/Ledger.repository.js` line 4  
**Description:** `require("/shared/db")` uses an absolute filesystem path that only works inside the Docker container if `/shared` is mounted, and breaks entirely on the host or when running tests. The shared module is at `shared/db/index.js` relative to the repo root.  
**Fix:** Replace with `require("../../../shared/db")` (relative path from `services/ledger-service/src/`).

### BUG-03 — Hard-coded CockroachDB host in `shared/db`
**File:** `shared/db/index.js`  
**Description:** The connection string `postgresql://root@cockroachdb:26257/${database}?sslmode=disable` hard-codes the hostname `cockroachdb`, the port `26257`, the user `root`, and disables TLS. This prevents running any service outside Docker and breaks any environment using a different DB host (e.g., CI, staging, production).  
**Fix:** Read `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` from environment variables with safe defaults (parameterize host via env).

### BUG-04 — Empty Jest config in identity-service
**File:** `services/identity-service/jest.config.js` (0 bytes)  
**Description:** An empty Jest config file causes `jest` to fall back to defaults that may not match the project structure, and signals an incomplete test setup.  
**Fix:** Populate with a minimal config: `module.exports = { testEnvironment: 'node', testMatch: ['**/tests/**/*.test.js'] };`

### BUG-05 — Empty account routes file in API gateway
**File:** `services/api-gateway/src/routes/account.routes.js` (0 bytes)  
**Description:** The file exists but is empty, suggesting incomplete refactoring. If it is meant to contain route handlers it must be implemented; if it is a leftover, it should be removed.  
**Fix:** Either implement the route module and import it in `server.js`, or delete the file.

### BUG-06 — Typo in `ProectedRoute.jsx`
**File:** `customer_frontend/src/components/ProectedRoute.jsx`  
**Description:** Filename is missing a `t` — should be `ProtectedRoute.jsx`. The import in `App.jsx` (line 6) already uses the typo-ed name, so both must be renamed together.  
**Fix:** Rename file to `ProtectedRoute.jsx` and update the misspelled import in `App.jsx`.

### BUG-07 — Missing route registrations in `App.jsx`
**File:** `customer_frontend/src/App.jsx`  
**Description:** The app defines nine page components (`BalancePage`, `HistoryPage`, `TransferPage`, `WithdrawPage`, `CreateTransaction`, `UpdateProfilePage`, `TransactionDetail`, `Dashboard`, `LoginPage`) but only three routes are registered: `/login`, `/transaction/:id`, and `/dashboard`. Users cannot navigate to Balance, History, Transfer, Withdraw, CreateTransaction, or UpdateProfile.  
**Fix:** Import and register the missing six page components as `<Route>` entries, with `<ProtectedRoute>` wrappers where appropriate.

### BUG-08 — JWT secret committed to version control
**File:** `infrastructure/docker-compose.yml` lines 26, 44, 70  
**Description:** `JWT_SECRET=banque_super_secret_2026` is committed in plain text in three places. This is a hard-coded secret in version control.  
**Fix:** Remove the inline value; add a `.env` file (git-ignored) and reference `${JWT_SECRET}` from the compose file. Provide a `.env.example` with a placeholder value. Consider rotating the secret and cleaning git history with BFG/git-filter-repo.

### BUG-09 — CockroachDB running `--insecure`
**File:** `infrastructure/docker-compose.yml` line 5  
**Description:** `start-single-node --insecure` disables all TLS and authentication on the database engine. While acceptable for local development, this flag must never be carried into staging or production, and the NFR requires TLS.  
**Fix (immediate):** Document the insecure flag prominently in `README.md` and add a TODO comment. **Fix (Sprint 3):** Switch to certificate-based TLS in the compose file with self-signed certs for dev.

### BUG-10 — Non-atomic deposit
**File:** `services/account-service/src/account.repository.js` (deposit logic)  
**Description:** The deposit handler updates the `accounts` table balance and then writes a `ledger_entries` record using two separate database connections/pools with no transaction wrapper. If the ledger write fails after the balance update, the system is in an inconsistent state — the balance is updated but there is no audit record.  
**Fix:** Use a single CockroachDB connection with `BEGIN` / `COMMIT` / `ROLLBACK` to make both writes atomic.

---

## 4. Target Architecture (After This Plan)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ZONE 1 — Public & Edge Security                                        │
│                                                                         │
│   Browser / Mobile                                                      │
│        │                                                                │
│   ┌────▼──────┐    TLS     ┌─────────────────────────────────────────┐ │
│   │   nginx   │──────────▶ │  api-gateway  (Express, :3000)          │ │
│   │  (LB/TLS) │            │  - Helmet, rate-limit, CORS             │ │
│   └───────────┘            │  - JWT validation middleware            │ │
│                            │  - Proxies to Zone 2 services           │ │
│                            │  - Calls /qrng for secret rotation      │ │
│                            └──────────────────┬──────────────────────┘ │
│                                               │                        │
│                            ┌──────────────────▼──────────────────────┐ │
│                            │  qkd-kms  (Python sidecar, :8001)       │ │
│                            │  - BB84 channel simulation              │ │
│                            │  - Symmetric session key issuance       │ │
│                            └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
         │
┌────────▼────────────────────────────────────────────────────────────────┐
│  ZONE 2 — Application Services                                          │
│                                                                         │
│  ┌────────────────────┐  ┌───────────────────┐  ┌───────────────────┐  │
│  │  identity-service  │  │  account-service  │  │  ledger-service   │  │
│  │  (Express, :3001)  │  │  (Express, :3002) │  │  (Express, :3003) │  │
│  │  - login/logout    │  │  - balance        │  │  - append-only    │  │
│  │  - JWT issue       │  │  - deposit        │  │  - findByAccount  │  │
│  │  - refresh tokens  │  │  - fraud pre-     │  │  - INSERT-only    │  │
│  │  - token blacklist │  │    filter heuristic│  │    DB role        │  │
│  │    via Redis       │  └────────┬──────────┘  └───────────────────┘  │
│  └────────────────────┘           │                                     │
│                                   │ Kafka: transactions.created         │
│  ┌────────────────────────────────▼──────────────────────────────────┐  │
│  │  transaction-orchestrator  (Express, :3004)                       │  │
│  │  - POST /transfer, POST /withdraw                                  │  │
│  │  - Saga pattern (reserve → debit → credit → confirm / compensate) │  │
│  │  - Kafka producer (transactions.created, fraud.flagged)           │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────┐   ┌──────────────────────────────────────────────┐   │
│  │  Redis :6379 │   │  Kafka :9092 + Zookeeper :2181               │   │
│  │  (blacklist, │   │  Topics: transactions.created, fraud.flagged │   │
│  │   cache)     │   └──────────────────────────────────────────────┘   │
│  └──────────────┘                                                       │
└─────────────────────────────────────────────────────────────────────────┘
         │
┌────────▼────────────────────────────────────────────────────────────────┐
│  ZONE 3 — Quantum Intelligence Module                                   │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  quantum-service  (Python 3.11 + FastAPI + Qiskit Aer, :8000)      │ │
│  │                                                                    │ │
│  │  GET  /qrng               → 256-bit quantum random seed            │ │
│  │  POST /bb84/simulate      → simulated BB84 key exchange            │ │
│  │  POST /circuit/visualize  → Qiskit circuit → SVG/PNG              │ │
│  │  POST /fraud/predict      → VQC inference → risk_score, confidence │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  fraud-classical  (Node module inside account-service)             │ │
│  │  - featureExtractor.js  → velocity, geo-delta, amount z-score     │ │
│  │  - rulesEngine.js       → threshold-based pre-filter              │ │
│  │  - riskScorer.js        → aggregates heuristic + quantum scores   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
         │
┌────────▼────────────────────────────────────────────────────────────────┐
│  ZONE 4 — Data & Infrastructure                                         │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  CockroachDB cluster  (3 nodes in dev compose)                   │   │
│  │  - identity_db   : users, refresh_tokens                        │   │
│  │  - account_db    : accounts, transactions (FR-05..FR-08 schema) │   │
│  │  - transaction_db: saga_state, compensation_log                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ledger_db  (INSERT-only role granted to ledger-service)        │   │
│  │  - ledger_entries (append-only, no UPDATE/DELETE)               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Sprint Plan (7 Sprints × 2 Weeks = 14 Weeks)

| Sprint | Dates (relative) | Theme | Backlog Items | Concrete Repo Deliverables |
|---|---|---|---|---|
| **Sprint 0** | S+0 … S+1 | Foundations & Bug Fixes | BUG-01..BUG-10 | Fix `IDENTITY` variable; fix ledger path; parameterize `shared/db` env vars; populate `jest.config.js`; implement or delete empty account routes; rename `ProectedRoute.jsx`; wire missing App.jsx routes; remove committed JWT secret; add `.env.example`; rewrite `README.md`; add `LICENSE`; configure branch protection + PR template |
| **Sprint 1** | S+2 … S+3 | F1 Authentication Hardening | US-1.1, US-1.2, FR-04 | `POST /auth/refresh` endpoint; logout + Redis token blacklist; `express-rate-limit` + `helmet` on `identity-service`; Joi input validation; Swagger UI (`swagger-ui-express`) on `identity-service`; update CI to test identity-service |
| **Sprint 2** | S+4 … S+5 | F2 User & Account Management | F2 all 8 user stories | `GET /profile`, `PATCH /profile` in `identity-service`; employee/customer account creation UI in `staff_frontend`; soft-delete + `is_active` flag + `deactivated_at` column on `users`; `created_by` + `updated_at` audit columns; admin user-management page |
| **Sprint 3** | S+6 … S+7 | F3 Transactions (Core) | FR-05..FR-07, Saga | `POST /transfer`, `POST /withdraw` in new `transaction-orchestrator`; Saga compensating transactions; real `ledger-service` REST endpoints (`GET /ledger/:accountId`); fix non-atomic deposit; `transaction_db` schema; atomic balance updates; Kafka `transactions.created` topic wired |
| **Sprint 4** | S+8 … S+9 | F3 Transactions (UX + Export) | FR-08 | `GET /transactions` with filters (date range, type, amount); `GET /transactions/:id` detail page in `customer_frontend`; `HistoryPage.jsx` and `TransactionDetail.jsx` wiring; jsPDF export button; CockroachDB TLS self-signed certs in dev compose |
| **Sprint 5** | S+10 … S+11 | F4 Fraud Detection (Classical) | FR-09, FR-10 (heuristic) | `fraud/featureExtractor.js`, `fraud/rulesEngine.js`, `fraud/riskScorer.js` in `account-service`; `risk_score` + `is_flagged` columns on transactions; `FraudReviewPage.jsx` in `staff_frontend`; Kafka consumer for fraud topic; employee fraud-review workflow; fraud report generation |
| **Sprint 6** | S+12 … S+13 | F4 Fraud Detection (Quantum) + Observability *(ambitious — consider timebox-splitting internally)* | FR-13..FR-16, FR-17..FR-20 | Stand up `quantum-service` (Python/FastAPI/Qiskit); `/qrng`, `/bb84/simulate`, `/circuit/visualize`, `/fraud/predict`; wire QRNG into JWT secret rotation (FR-03); `qkd-kms` sidecar; `MetricsDashboard.jsx`; `SecurityLogsPage.jsx`; comparative report (FR-20); Prometheus `/metrics` on all services; nginx TLS + rate limiting; `infrastructure/grafana/` dashboard JSON; `docs/api/openapi.yaml` |

---

## 6. New Components — File-Level Plan

> These components do not exist yet. They will be created in the sprints above. This section serves as a reference for developers starting each sprint.

### `services/quantum-service/` (Python 3.11 + FastAPI + Qiskit)

```
services/quantum-service/
├── Dockerfile
├── requirements.txt          # qiskit, qiskit-aer, qiskit-machine-learning,
│                             # fastapi, uvicorn, python-jose[cryptography],
│                             # pydantic, matplotlib, pylatexenc
├── app/
│   ├── main.py               # FastAPI app, CORS, routers
│   ├── qrng.py               # GET /qrng → quantum random bits via Qiskit
│   ├── bb84.py               # POST /bb84/simulate → BB84 protocol sim
│   ├── vqc_classifier.py     # POST /fraud/predict → VQC inference (Qiskit Aer)
│   └── circuit_viz.py        # POST /circuit/visualize → SVG/PNG output
└── tests/
    ├── test_qrng.py
    ├── test_bb84.py
    └── test_vqc.py
```

### `services/transaction-orchestrator/` (Node.js + Express + KafkaJS)

```
services/transaction-orchestrator/
├── package.json
├── Dockerfile
├── src/
│   ├── server.js             # Express app, port 3004
│   ├── routes.js             # POST /transfer, POST /withdraw
│   ├── saga/
│   │   ├── transferSaga.js   # reserve → debit → credit → confirm
│   │   └── compensate.js     # rollback steps
│   ├── kafka/
│   │   ├── producer.js       # publish transactions.created
│   │   └── consumer.js       # consume fraud.flagged
│   └── middleware/
│       └── auth.js
└── tests/
    ├── transfer.saga.test.js
    └── compensate.test.js
```

### `services/qkd-kms/` (Python, optional sidecar)

```
services/qkd-kms/
├── Dockerfile
├── requirements.txt          # fastapi, uvicorn, qiskit, qiskit-aer
└── app/
    ├── main.py               # FastAPI app, port 8001
    └── bb84_channel.py       # BB84 key exchange simulation
```

### `services/account-service/src/fraud/` (Node.js, heuristic pre-filter)

```
services/account-service/src/fraud/
├── featureExtractor.js       # velocity, geo-delta, amount z-score, time-of-day
├── rulesEngine.js            # threshold-based rule evaluation
└── riskScorer.js             # aggregate heuristic + quantum scores → final risk
```

### `infrastructure/docker-compose.yml` — additions

- `redis` service (image: `redis:7-alpine`, port 6379)
- `kafka` + `zookeeper` services (or KRaft single-node, port 9092)
- `quantum-service` service (Python, port 8000)
- `transaction-orchestrator` service (Node, port 3004)
- `qkd-kms` service (Python sidecar, port 8001)
- Two additional `cockroachdb` nodes (`cockroachdb-2`, `cockroachdb-3`) for dev cluster

### `infrastructure/nginx/nginx.conf`

- TLS termination with self-signed cert (dev) / Let's Encrypt (prod)
- Rate limiting (`limit_req_zone`)
- Reverse proxy to `api-gateway:3000`
- Content Security Policy headers

### Frontend pages (not yet created)

| File | Service | Sprint |
|---|---|---|
| `customer_frontend/src/pages/FraudAlertPage.jsx` | customer_frontend | Sprint 5 |
| `staff_frontend/src/pages/FraudReviewPage.jsx` | staff_frontend | Sprint 5 |
| `staff_frontend/src/pages/SecurityLogsPage.jsx` | staff_frontend | Sprint 6 |
| `staff_frontend/src/pages/MetricsDashboard.jsx` | staff_frontend | Sprint 6 |

### CI/CD additions

- `.github/workflows/ci.yml` — extend matrix: add `quantum-service` (Python 3.11 + pytest), add frontend build steps (`npm run build`), ESLint, CodeQL scanning
- `.github/workflows/quantum-ci.yml` — dedicated Python CI for `quantum-service` and `qkd-kms`
- `docs/api/openapi.yaml` — Swagger/OpenAPI 3.0 spec for all REST endpoints across all services

---

## 7. Cross-cutting Concerns

### Security

- **Rotate secrets**: remove `JWT_SECRET=banque_super_secret_2026` from git history using BFG Repo-Cleaner or `git-filter-repo`; use Docker secrets or a `.env` file (git-ignored) going forward
- **Cockroach TLS**: enable certificate-based authentication; stop using `--insecure` in any non-throwaway environment
- **Express hardening**: add `helmet` (security headers), `express-rate-limit` (brute-force protection), and `Joi` schema validation to every Express service
- **nginx CSP**: configure `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options` in nginx
- **Threat model**: document in `docs/security.md`

### Observability

- **Structured logging**: replace `console.log` with `pino` (Node) and Python `structlog` / `logging` (Python); emit JSON logs
- **Prometheus metrics**: add `prom-client` to each Node service; add `prometheus-fastapi-instrumentator` to Python services; expose `/metrics` on each
- **Grafana**: commit dashboard JSON under `infrastructure/grafana/`; add Grafana container to compose

### Testing

- **Coverage target**: ≥ 60% per service (Chapter 2 NFR)
- **Node services**: Jest for every service (currently only `identity-service` and `account-service` run in CI)
- **Python services**: pytest with `httpx` for async FastAPI tests
- **E2E**: Playwright for both `customer_frontend` and `staff_frontend`
- **Integration**: test atomic deposit with real CockroachDB in CI (Docker-in-Docker or GitHub Actions service containers)

### CI/CD

- Extend `.github/workflows/ci.yml` to cover all services
- Add branch protection rules on `main`: require ≥ 1 reviewer, require all status checks to pass
- Add `CODEOWNERS` file so relevant owners are auto-assigned on PRs

---

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Scope creep on quantum features | High | High | Keep VQC as a PoC only; classical heuristic model stays in the production fraud-detection path; quantum output is advisory only |
| CockroachDB ↔ PostgreSQL dialect drift | Medium | Medium | Continue using the `pg` driver (CockroachDB is wire-compatible); gate all DB changes on integration tests running against real CockroachDB in CI |
| Qiskit version churn (API-breaking releases) | High | Medium | Pin exact versions in `requirements.txt`; isolate `quantum-service` so upgrades do not touch Node services |
| Team unfamiliarity with Saga pattern | Medium | High | Allocate Sprint 3 to a dedicated spike before implementing transfer; use a simple in-process coordinator before introducing Kafka |
| Committed secret (`JWT_SECRET`) in git history | High | High | Rotate the secret immediately; clean git history with BFG; audit all commits for other secrets |
| Non-atomic deposit causing balance corruption | High | High | Fix (BUG-10) before Sprint 3 transaction work begins; add integration test that kills the DB mid-transaction |
| `--insecure` CockroachDB reaching staging/prod | Medium | Critical | Enforce via CI check that `--insecure` flag never appears in production compose files; use separate `docker-compose.prod.yml` |

---

## 9. Definition of Done (Per User Story)

- Code merged to `main` via a reviewed Pull Request with at least one approving review
- All unit tests and integration tests pass in CI (GitHub Actions green)
- OpenAPI specification (`docs/api/openapi.yaml`) updated with the new or modified endpoint(s)
- Swagger UI displays the endpoint and its request/response schema correctly
- All error paths (4xx, 5xx) are covered by test cases
- Logs are structured (JSON) and include `traceId`, `service`, `level`, `message`, `timestamp`
- Relevant documentation page in `docs/` updated or created
- Feature demoed in the sprint review with a recorded screen capture attached to the PR

---

## 10. Out of Scope (For Clarity)

- **Real quantum hardware execution**: the `quantum-service` uses Qiskit Aer (simulator) exclusively; no IBM Quantum or other hardware backend is targeted
- **Production-grade QKD**: the BB84 implementation is a teaching/PoC layer exactly as described in the spec; it is not a cryptographically secure key distribution system suitable for production
- **Mobile native apps**: only web-based SPAs (`customer_frontend` and `staff_frontend`) are in scope; no React Native or Capacitor
- **Multi-region deployment**: the architecture is designed to be Kubernetes-ready but actual multi-region cloud deployment is outside the scope of this plan
- **PCI-DSS / banking regulatory compliance**: security measures are implemented to match the spec's NFRs and are not intended to constitute full regulatory compliance
