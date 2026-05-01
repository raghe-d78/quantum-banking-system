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
# Gateway
curl -s http://localhost:3000/healthz

# Direct service probes (optional)
curl -s http://localhost:3001/health
curl -s http://localhost:3005/health
curl -s http://localhost:3007/health

# Quantum smoke test (returns 8 random bits from the QRNG circuit)
curl -s http://localhost:3000/quantum/qrng?n=8
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
`http://localhost:3000`. If you change ports, edit `src/api.js` in each
frontend.

---

## 5. Create your first users

The seed file ships **one** account out of the box:

| Email             | Password   | Role  | Created by                 |
| ----------------- | ---------- | ----- | -------------------------- |
| `admin@banque.tn` | `admin123` | admin | `services/identity-service/src/reco.js` |

To (re-)seed it on a fresh DB:

```bash
docker compose exec identity-service node src/reco.js
```

Then log into the **staff** UI as `admin@banque.tn / admin123` and use
**Admin → Register Staff** to create:

- One **employee** account (e.g. `teller1@banque.tn`) for the staff UI
- One **customer** account (e.g. `alice@example.com`) for the customer UI

> Tip: the registration form auto-creates the linked CockroachDB row in
> the `users` table _and_ in `accounts` (initial balance: 0).

---

## 6. Customer journey (UI walkthrough)

URL: **`http://localhost:5173`**

| Step | Page | Action | What to verify |
|------|------|--------|----------------|
| 1 | `/login` | Log in as `alice@example.com` | Redirects to `/dashboard` |
| 2 | `/dashboard` | Read balance, recent activity | Card shows TND balance |
| 3 | `/deposit` | _(staff-only — disabled here)_ | Customers can't self-deposit |
| 4 | `/transfer` | Send TND to another account | Wizard step 1 → confirm step 2 → success step 3 |
| 5 | `/history` | Filter by date range, click a row | Detail page shows ledger entry + audit hash |
| 6 | `/history` | Click **Export CSV** / **Export PDF** | File downloads via `/accounts/:id/export` |
| 7 | `/profile` | Update phone / address | Diff visible immediately |
| 8 | `/balance` | Quick balance widget | Matches dashboard |
| 9 | top-right menu | Logout | Refresh token revoked in Redis |

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
| 1 | `/login` | Log in as `admin@banque.tn` | Lands on `/admin` |
| 2 | `/admin` | Browse user list with filters | Pagination + role/status chips |
| 3 | `/admin/users/:id` | Edit user, suspend / reactivate | Status pill updates live |
| 4 | `/admin/register` | Create a new staff member | Returns 201 + temp password |
| 5 | `/staff/deposit` | Deposit TND into a customer account | Balance increases, ledger row appears |
| 6 | `/staff/withdraw` | Withdraw TND for a customer | Outbox event published |
| 7 | `/staff/transactions` | See _all_ tenant transactions | Click row → detail + cancel button |
| 8 | `/staff/transactions/:id` | Click **Cancel** on a posted transfer | Compensating ledger entry created |
| 9 | `/staff/alerts` | **Phase 4 fraud alerts dashboard** | Real-time fraud scores from `fraud-service` |
| 10 | `/staff/alerts` | Click an alert → trace to transaction | Audit hash + quantum signature shown |

---

## 8. Quantum & fraud features in action

Manual probes, useful for demos:

```bash
# 1) QRNG — quantum random bytes (Hadamard + measurement)
curl -s 'http://localhost:3000/quantum/qrng?n=32'

# 2) BB84 — quantum key distribution session
curl -X POST http://localhost:3000/quantum/bb84/start \
     -H 'Content-Type: application/json' \
     -d '{"key_length": 64}'

# 3) Sign a transaction (post-quantum Dilithium)
curl -X POST http://localhost:3000/kms/sign \
     -H 'Content-Type: application/json' \
     -d '{"payload":"hello"}'

# 4) Fraud score for a synthetic transaction
curl -X POST http://localhost:3000/fraud/score \
     -H 'Content-Type: application/json' \
     -d '{"amount": 50000, "channel":"transfer", "hour": 3}'
```

Use real IBM hardware (Phase 3.5):

1. Add to `infrastructure/.env`:
   ```env
   IBM_QUANTUM_TOKEN=<your-token>
   IBM_QUANTUM_INSTANCE=<your-crn>
   QRNG_BACKEND=ibm
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
# Per-service unit + API tests + coverage (see README §9 for the table)
cd services/identity-service && npm test && npm run test:coverage
cd services/account-service  && npm test && npm run test:coverage
cd services/ledger-service   && npm test && npm run test:coverage
cd services/api-gateway      && npm test && npm run test:coverage

# Quantum-service (pytest)
cd services/quantum-service && pytest -q

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
