# Changelog

All notable changes to the Quantum Banking System are documented in this file.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — 2026-05-01

### Fixed

- **account-service: routes used the wrong account repository.**
  `services/account-service/src/routes.js` imported `./account.repository`
  (legacy file referencing a non-existent `balance` column) instead of the
  correct `./repositories/account.repository` (which uses `cached_balance` per
  the actual schema). Staff account lookups now hit the correct repository.

- **account-service: legacy `account.repository.js` rewritten as a shim.**
  The legacy file at `services/account-service/src/account.repository.js`
  previously contained duplicated/divergent logic against the wrong column
  (`balance` instead of `cached_balance`). It is now a thin re-export of
  `./repositories/account.repository`, so anything still importing the old
  path (e.g. `tests/api/account.test.js`,
  `tests/unit/account.service.test.js`) continues to work but no longer
  exercises buggy SQL.

- **account-service: `transaction.service.js` queried a non-existent column.**
  The `initiatedBy` filter generated `AND performed_by IS [NOT] NULL`
  against `ledger_entries`, which has no `performed_by` column — every
  filtered query would have thrown. The filter is now applied in JS after
  fetch, using a derived `initiatedBy` field (heuristic: non-transfer
  CREDITs ⇒ "Staff"; everything else ⇒ "Customer"). The SQL `SELECT` no
  longer references the phantom column.

- **account-service: `formatTx` now exposes `initiatedBy`.**
  `Export.service.js` (CSV + PDF) referenced `tx.initiatedBy` which was
  always `undefined`, producing literal `"undefined"` cells in CSV exports
  and the PDF table. The formatter now sets it; exports also fall back to
  `"—"` defensively.

- **account-service: stop importing `pg.Pool` ad‑hoc inside
  `transaction.service.js`.** The list query used
  `require("../../../shared/db")("ledger_db").query(...)`, which created a
  brand-new pool on every request (connection leak). It now reuses the
  pool already exported by `repositories/ledger.repository.js`.

- **identity-service: missing `/admin/users/lookup/:value` endpoint.**
  `account-service`'s `resolveStaffLookup` posts to
  `GET /admin/users/lookup/:value` to resolve a username/email/UUID to a
  user, but identity-service never defined that route — every
  non-direct-accountId staff lookup silently returned `null`. The route is
  now implemented (UUID-aware), reachable via `requireStaff`, and reuses
  `userService.getUser` so the response shape matches `GET /admin/users/:id`.

### Removed

- **identity-service: deleted `src/reco.js`.** A throwaway dev script that
  hard-coded a localhost CockroachDB connection string and reset the admin
  password on import. Out of place in a service `src/` directory and a
  footgun if accidentally `require`d.

### Cleanup required (manual — could not be performed automatically)

The following items were identified but the runtime in this session does not
permit deleting binary files via the available tools. Please remove them
locally:

```
git rm customer_frontend/src/pages/,mf.pdf
git rm customer_frontend/src/pages/fjfjjff.pdf
```

Both are stray PDFs accidentally checked into the React `pages/` directory.

### Known issues / deferred (intentionally not patched to preserve workflow)

- **`JWT_SECRET` is hard-coded in `infrastructure/docker-compose.yml`.**
  Should be sourced from an `.env` file or secret manager. Left as-is to
  avoid breaking `make up` / `make dev` for current contributors. Suggested
  follow-up: introduce `infrastructure/.env.example` and reference it from
  compose with `${JWT_SECRET}`.

- **`shared/db` is imported via the absolute path `/shared/db`** in
  `account-service` and `ledger-service`. This works inside Docker because
  the Dockerfiles `COPY shared ../shared` (placing it at `/shared`) but
  fails when running the services directly with `node` outside a container
  (e.g. local debugging). Consolidating on relative paths
  (`../../../shared/db`) requires aligning all three Dockerfiles to put
  `shared` at `/app/shared`; deferred to avoid touching deployment.

- **`ledger-service` is effectively a stub.** It exposes only `GET /` and
  does not own ledger writes — `account-service` writes ledger entries
  directly through `repositories/ledger.repository.js` against `ledger_db`.
  Re-architecting that boundary is a bigger change than this changelog
  covers.

- **`shared/money.js` (`Money` class) is unused.** Services compute balances
  with raw `Number(...)`, losing the decimal-precision guarantees the class
  was designed to provide. Migration to `Money` should be a dedicated PR
  with full test coverage of deposit/withdraw/transfer rounding behavior.

- **Typo `ProectedRoute.jsx`** (should be `ProtectedRoute`) in
  `customer_frontend/src/components/`. Renaming requires updating imports;
  staff_frontend already spells it correctly.

### Notes

No database migrations are required. No environment-variable changes are
required. All HTTP routes the frontends call retain their existing paths,
methods, and response shapes; the new `/admin/users/lookup/:value` endpoint
is purely additive.
