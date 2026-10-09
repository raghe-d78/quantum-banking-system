// services/ledger-service/src/app.js — read-side API over the append-only ledger.
const express = require("express");
const Decimal = require("decimal.js");
const { authenticate, requireStaff } = require("/shared/auth");
const { errorHandler, E } = require("/shared/errors");
const log  = require("/shared/logger")("ledger-service");
const repo = require("./Ledger.repository");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get("/health", (_req, res) => res.json({ status: "ledger-service running" }));
app.get("/ready", wrap(async (_req, res) => { await repo.ping(); res.json({ status: "ready" }); }));

app.use(authenticate, requireStaff);

app.get("/ledger/accounts/:id/entries", wrap(async (req, res) => {
  const entries = await repo.findByAccountId(req.params.id, req.query);
  res.json({ entries, count: entries.length });
}));

app.get("/ledger/accounts/:id/reconcile", wrap(async (req, res) => {
  const r = await repo.reconcile(req.params.id);
  if (!r || r.cached_balance === null) throw E.notFound("Account not found");
  const ledger = new Decimal(r.ledger_balance || 0);
  const cached = new Decimal(r.cached_balance);
  const drift  = cached.minus(ledger);
  const snapshotOk = r.last_snapshot === null || new Decimal(r.last_snapshot).equals(ledger);
  res.json({
    accountId: req.params.id, entries: r.entries,
    ledgerBalance: ledger.toFixed(4), cachedBalance: cached.toFixed(4), lastSnapshot: r.last_snapshot,
    drift: drift.toFixed(4), consistent: drift.isZero() && snapshotOk,
  });
}));

app.get("/ledger/transactions/:txId", wrap(async (req, res) => {
  const entries = await repo.findByTransactionId(req.params.txId);
  if (!entries.length) throw E.notFound("Transaction not found");
  const debit  = entries.filter(e => e.type === "DEBIT").reduce((s, e) => s.plus(e.amount), new Decimal(0));
  const credit = entries.filter(e => e.type === "CREDIT").reduce((s, e) => s.plus(e.amount), new Decimal(0));
  res.json({ transactionId: req.params.txId, entries, balanced: entries.length === 1 || debit.equals(credit) });
}));

app.get("/ledger/entries/:id", wrap(async (req, res) => {
  const entry = await repo.findById(req.params.id);
  if (!entry) throw E.notFound("Entry not found");
  res.json({ entry });
}));

app.use((_req, res) => res.status(404).json({ ok: false, code: "NOT_FOUND", message: "Route not found" }));
app.use(errorHandler(log));

module.exports = app;
