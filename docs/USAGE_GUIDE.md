# Usage Guide — End-to-End Walkthrough

This guide walks you through **executing the full Quantum Banking System
locally and exercising every feature from the two web interfaces**
(customer + staff). Follow it top-to-bottom on a fresh clone and you
will end up with: backend up, both UIs running, two seeded users, a
funded account, a quantum-signed transfer, and a fraud score on the
audit timeline.

> Companion to the top-level [`README.md`](../README.md) — the README
> tells you _what_ exists, this guide tells you _how to use it_.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Boot the full stack](#2-boot-the-full-stack)
3. [Verify health](#3-verify-health)
4. [Start the two frontends](#4-start-the-two-frontends)
5. [Create your first users](#5-create-your-first-users)
6. [Customer journey (UI walkthrough)](#6-customer-journey-ui-walkthrough)
7. [Staff journey (UI walkthrough)](#7-staff-journey-ui-walkthrough)
8. [Quantum & fraud features in action](#8-quantum--fraud-features-in-action)
9. [Running the automated test suites](#9-running-the-automated-test-suites)
10. [Production-mode (HTTPS) execution](#10-production-mode-https-execution)
11. [Tearing it all down](#11-tearing-it-all-down)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

| Tool             | Min version | Notes                                               |
| ---------------- | ----------- | --------------------------------------------------- |
| Docker Desktop   | 4.30+       | Includes Compose v2.24+ (needed by the prod overlay) |
| Node.js          | 20 LTS      | For running the two Vite frontends locally          |
| npm              | 10+         | Bundled with Node 20                                |
| Python           | 3.11+       | Only required for the Phase 4 fraud-service tests   |
| PowerShell / Bash | any        | Examples below use cross-platform commands          |

> **Windows users:** all paths in this guide are forward-slash; PowerShell
> accepts them. If you copy-paste a `curl` example it works as-is.

---

## 2. Boot the full stack

From the repo root:

```bash
cd infrastructure
cp .env.example .env          # create your local env file
# (optional) edit .env to add IBM_QUANTUM_TOKEN if you want real hardware
docker compose up -d --build
```

This brings up **11 containers**:

| Layer        | Containers                                                              |
| ------------ | ----------------------------------------------------------------------- |
| Datastores   | `cockroachdb`, `redis`                                                  |
| Messaging    | `kafka`, `kafka-init`                                                   |
| Core banking | `identity-service`, `account-service`, `ledger-service`, `audit-service` |
| Edge         | `api-gateway`                                                           |
| Quantum/AI   | `quantum-service`, `kms-service`, `fraud-service`                       |

First boot takes ~3-5 minutes (image pulls + npm installs in containers).

### Default port map

| Port  | Service                                |
| ----- | -------------------------------------- |
| 3000  | API gateway (the only one you need!)   |
| 3001  | identity-service (direct, debug only)  |
| 3002  | account-service                        |
| 3003  | ledger-service                         |
| 3004  | audit-service                          |
| 3005  | quantum-service                        |
| 3006  | kms-service                            |
| 3007  | fraud-service                          |
| 6379  | Redis                                  |
| 8080  | CockroachDB admin UI (`http://localhost:8080`) |
| 9093  | Kafka broker                           |
| 26257 | CockroachDB SQL                        |

---

## 3. Verify health

Once `docker compose ps` shows everything `running (healthy)`:

```bash
# Gateway liveness + readiness (fans out to every upstream)
curl -s http://localhost:3000/health
curl -s http://localhost:3000/ready

# Direct service probes (optional, dev only — the prod overlay hides these ports)
curl -s http://localhost:3001/health
curl -s http://localhost:3005/health
curl -s http://localhost:3007/health
```

Since Phase 6 every non-auth route needs a Bearer token, so grab one
first (the seeded admin is `adminn` / `admin123`):

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/staff/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"adminn","password":"admin123"}' | jq -r .token)

# Quantum smoke test (16 random bytes from the QRNG circuit)
curl -s "http://localhost:3000/quantum/qrng?bytes=16" -H "Authorization: Bearer $TOKEN"
```

Each call should return JSON in <500 ms (QRNG uses the AerSimulator by
default — wall-clock includes the Python cold-start the first time).

---

## 4. Start the two frontends

The frontends are **Vite + React 19** apps. They are not in compose;
run them on the host so hot-reload works.

```bash
# Terminal 1
cd customer_frontend
npm install        # first time only
npm run dev        # → http://localhost:5173

# Terminal 2
cd staff_frontend
npm install        # first time only
npm run dev        # → http://localhost:5174   (Vite picks the next free port)
```

Both apps are pre-configured to call the gateway at
`http://localhost:3000`. Override with `VITE_API_URL` in a `.env.local`
inside each frontend folder.

---

## 5. Create your first users

The schema bootstrap (`scripts/init-db.sql`) seeds **one** account:

| Username | Email              | Password   | Role  |
| -------- | ------------------ | ---------- | ----- |
| `adminn` | `admin@banquee.tn` | `admin123` | admin |

> Change this password right after first login (**Profile → Password**).
> On an existing cluster the seed is idempotent: `make db-init` re-applies it.

Log into the **staff** UI as `adminn / admin123` and use **Create User** to add:

- One **employee** (e.g. `teller1`) for the staff UI
- One **customer** (e.g. `alice`) for the customer UI

Passwords must be at least 8 characters; usernames are 3-50 chars of
letters, digits, `.`, `_`, `-`. Creating a customer provisions the
linked `accounts` row atomically (initial balance 0); if account-service
is down the request fails with `502 ACCOUNT_PROVISIONING_FAILED` instead
of leaving an account-less user behind.

---

## 6. Customer journey (UI walkthrough)

URL: **`http://localhost:5173`**

| Step | Page | Action | What to verify |
|------|------|--------|----------------|
| 1 | `/login` | Log in as `alice` (username or email) | Redirects to `/dashboard` |
| 2 | Dashboard → Balance | Read balance (Redis read-through, 60 s TTL) | Card shows TND balance + account id |
| 3 | Dashboard → Transfer | Paste a recipient account id, **Verify** | Name resolves via `/accounts/verify/:id` (no balance leaks) |
| 4 | Dashboard → Transfer | Send TND | One atomic commit; a transfer from someone else's account returns `403 FORBIDDEN` |
| 5 | Dashboard → Transfer | Exceed 10 000 TND in 24 h | `429 DAILY_LIMIT_EXCEEDED` |
| 6 | Dashboard → Withdraw | Withdraw more than the balance | `422 INSUFFICIENT_FUNDS`, nothing written |
| 7 | Dashboard → History | Filter, open a row, `/transaction/:id` | Detail page reads the real ledger row |
| 8 | Dashboard → History | **Export CSV** / **Print** | Served by `/transactions/export?format=csv|pdf` |
| 9 | Dashboard → Profile | Update phone / address, change password | `PUT /auth/me`, `PUT /auth/password` |
| 10 | Logout | — | Refresh token revoked server-side |

Behind the scenes each request flows:

```
Customer UI ─► API Gateway (3000) ─► identity / account / ledger ─► CockroachDB
                                  └─► Kafka (outbox) ─► audit-service
```

---

## 7. Staff journey (UI walkthrough)

URL: **`http://localhost:5174`**

| Step | Page | Action | What to verify |
|------|------|--------|----------------|
| 1 | `/login` | Log in as `adminn` | Lands on `/admin` (employees land on `/employee`) |
| 2 | Users | Browse, search, edit, suspend / reactivate | A suspended user can no longer log in |
| 3 | Create User | Create an employee or customer | Customer gets an account atomically |
| 4 | Deposit | Look up by account id, username or email, deposit TND | Balance increases; `DEPOSIT` ledger row; audit row |
| 5 | Fraud → Notifications | Open alerts feed (auto-refresh 10 s) | High / Critical verdicts from `fraud-service` |
| 6 | Fraud → Transactions | **Cancel** an alert's transaction | Compensating rows written, alert flips to `CANCELLED` |
| 7 | Fraud → Transactions | **Dismiss** a benign alert | Alert flips to `DISMISSED`, ledger untouched |
| 8 | Fraud → Statistics | KPIs, consumer metrics, model metadata | Both model versions and training metrics |
| 9 | API (curl) | `GET /ledger/accounts/:id/reconcile` | `consistent: true`, `drift: "0.0000"` |

---

## 8. Quantum & fraud features in action

Manual probes, useful for demos:

```bash
H="Authorization: Bearer $TOKEN"     # staff token from section 3

# 1) QRNG — quantum random bytes (Hadamard + measurement)
curl -s 'http://localhost:3000/quantum/qrng?bytes=32' -H "$H"

# 2) BB84 — key distribution, with and without an eavesdropper
curl -s -X POST http://localhost:3000/quantum/qkd/bb84 -H "$H" \
     -H 'Content-Type: application/json' \
     -d '{"n_qubits": 256, "rounds": 3, "with_eve": false}'
curl -s -X POST http://localhost:3000/quantum/qkd/bb84 -H "$H" \
     -H 'Content-Type: application/json' \
     -d '{"n_qubits": 256, "rounds": 3, "with_eve": true}'      # → 422, QBER ≈ 25 %

# 3) Circuit diagram (PNG)
curl -s 'http://localhost:3000/quantum/qkd/visualize?n_qubits=4&with_eve=true' -H "$H" -o bb84.png

# 4) KMS — mint a BB84-derived AES-256-GCM key, then consume it once
KID=$(curl -s -X POST http://localhost:3000/kms/keys -H "$H" | jq -r .kid)
curl -s http://localhost:3000/kms/keys/$KID -H "$H"           # key material
curl -s http://localhost:3000/kms/keys/$KID -H "$H"           # → 410 Gone

# 5) Fraud score for a synthetic transaction
curl -s -X POST http://localhost:3000/fraud/score -H "$H" \
     -H 'Content-Type: application/json' \
     -d '{"transactionId":"adhoc-1","accountId":"demo","amount":50000,"timestamp":"2026-01-01T03:00:00Z"}'
```

Use real IBM hardware (Phase 3.5):

1. Add to `infrastructure/.env`:
   ```env
   IBM_QUANTUM_TOKEN=<your-token>
   IBM_QUANTUM_CRN=<your-crn>
   QUANTUM_BACKEND=ibm
   ```
2. Restart only the quantum service:
   ```bash
   docker compose up -d --no-deps --force-recreate quantum-service
   ```
3. Re-issue the QRNG curl above. Latency rises from ~150 ms (simulator)
   to ~3-30 s (real `ibm_brisbane` queue) and the response includes a
   `job_id` you can verify on https://quantum.ibm.com.

> Pre-rendered BB84 circuit diagrams (with and without an eavesdropper)
> are committed in [`docs/quantum/`](quantum/).

---

## 9. Running the automated test suites

```bash
make test                     # everything below in one go

# Per package
cd shared                    && npm test
cd services/account-service  && npm test && npm run test:coverage
cd services/identity-service && npm test && npm run test:coverage
cd services/ledger-service   && npm test && npm run test:coverage
cd services/api-gateway      && npm test && npm run test:coverage

# Fraud-service (Phase 4)
cd services/fraud-service && pytest -q

# Comparative-analysis re-run (Phase 5.4)
cd services/fraud-service && python src/eval_compare.py
```

All node services hit **≥60% statement coverage** (gate enforced in
`package.json` via `--coverageThreshold`). 89/89 node tests pass on the
current `feat/phase-4-fraud` branch.

---

## 10. Production-mode (HTTPS) execution

Phase 5.2 ships a Caddy reverse proxy with automatic certificates.

```bash
cd infrastructure
docker compose \
   -f docker-compose.yml \
   -f docker-compose.prod.yml up -d --build
```

What changes vs. dev mode:

- Caddy listens on **:443** and **:80** (auto HTTP→HTTPS redirect).
- All service ports are removed from the host; only Caddy is exposed.
- Provide your DNS name in `.env` as `PUBLIC_HOSTNAME=banque.example.com`
  and Caddy will issue a Let's Encrypt cert on first request.
- For local prod-mode testing, set `PUBLIC_HOSTNAME=localhost` and Caddy
  will mint a self-signed cert (browser will warn — that's expected).

---

## 11. Tearing it all down

```bash
cd infrastructure
docker compose down              # stop containers, keep volumes
docker compose down -v           # ALSO wipe DB / Kafka / Redis volumes
```

The Vite frontends are stopped with `Ctrl-C` in their terminals.

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `ECONNREFUSED 127.0.0.1:3000` from frontend | Gateway container not yet healthy | `docker compose ps` — wait until `(healthy)` |
| Login returns 401 with correct password | Refresh token still in Redis with old hash | `docker compose restart redis` |
| Quantum endpoints time out | Compose pulled wrong image or Python deps missing | `docker compose build --no-cache quantum-service` |
| `IBM API token invalid` in logs | Token revoked / wrong CRN | Regenerate at https://quantum.ibm.com/account, update `.env` |
| Coverage gate fails on PR | Added new src/ file with no tests | Either add tests or list the file in `coveragePathIgnorePatterns` |
| Caddy can't get cert | Port 80/443 blocked, or hostname not pointing here | Check DNS A-record + firewall |

---

For the full architectural picture (services, data flow, quantum
internals, comparative results) keep reading
[`README.md`](../README.md).
