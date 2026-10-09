// services/account-service/src/Export.service.js — CSV + print-ready HTML statement.
const txService = require("./transaction.service")

const EXPORT_LIMIT = 100 // page size cap in transaction.service; export pages through it
const MAX_EXPORT_ROWS = Number(process.env.EXPORT_MAX_ROWS || 10000)

const esc = (v) => String(v ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;")

// Prevent CSV formula injection in spreadsheet clients.
const csvCell = (v) => {
  let s = String(v ?? "")
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return `"${s.replace(/"/g, '""')}"`
}

async function fetchAll(userId, filters) {
  const out = []
  for (let offset = 0; offset < MAX_EXPORT_ROWS; offset += EXPORT_LIMIT) {
    const page = await txService.listTransactions(userId, { ...filters, limit: EXPORT_LIMIT, offset })
    out.push(...page)
    if (page.length < EXPORT_LIMIT) break
  }
  return out
}

exports.exportCSV = async (userId, filters) => {
  const transactions = await fetchAll(userId, filters)
  const headers = ["ID", "Transaction", "Date", "Type", "Kind", "Amount", "Currency", "Balance Snapshot", "Reference", "Initiated By"]
  const rows = transactions.map(tx => [
    tx.id, tx.transactionId, tx.date, tx.type, tx.txType, tx.amount.toFixed(4), "TND",
    tx.balanceSnapshot.toFixed(4), tx.reference ?? "", tx.initiatedBy ?? "",
  ])
  const csv = [headers, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n")
  return Buffer.from("﻿" + csv, "utf-8")
}

exports.exportPDF = async (userId, filters, userInfo = {}) => {
  const transactions = await fetchAll(userId, filters)
  const fmt = (n) => parseFloat(n).toLocaleString("fr-TN", { minimumFractionDigits: 3 })
  const exportDate = new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })

  const rows = transactions.map(tx => `
    <tr>
      <td>${esc(tx.date)}</td>
      <td>${esc(tx.reference ?? "—")}</td>
      <td class="${tx.type === "CREDIT" ? "credit" : "debit"}">${esc(tx.type)}</td>
      <td style="text-align:right;" class="${tx.type === "CREDIT" ? "credit" : "debit"}">
        ${tx.type === "CREDIT" ? "+" : "−"}${fmt(tx.amount)} TND
      </td>
      <td style="text-align:right;">${fmt(tx.balanceSnapshot)} TND</td>
      <td>${esc(tx.initiatedBy ?? "—")}</td>
    </tr>`).join("")

  const totalCredit = transactions.filter(t => t.type === "CREDIT").reduce((s, t) => s + t.amount, 0)
  const totalDebit  = transactions.filter(t => t.type === "DEBIT").reduce((s, t) => s + t.amount, 0)

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Transaction Statement</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Georgia, serif; padding: 40px; color: #0a1628; font-size: 12px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; border-bottom:2px solid #c9a84c; padding-bottom:20px; }
  .bank-name { font-size:22px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; }
  .bank-sub, .doc-date { font-size:10px; color:#aaa; letter-spacing:2px; text-transform:uppercase; margin-top:4px; }
  .doc-title { font-size:14px; font-weight:bold; text-align:right; }
  .account-info { background:#f5f3ef; border-radius:8px; padding:16px 20px; margin-bottom:24px; display:flex; gap:40px; }
  .info-item label { font-size:9px; color:#aaa; text-transform:uppercase; letter-spacing:1px; display:block; margin-bottom:3px; }
  .info-item span { font-size:12px; font-weight:bold; }
  .summary { display:flex; gap:16px; margin-bottom:24px; }
  .summary-card { flex:1; padding:14px 16px; border-radius:8px; }
  .summary-card.total { background:#0a1628; color:#e8d48b; }
  .summary-card.credit { background:rgba(22,163,74,0.08); border:1px solid rgba(22,163,74,0.2); }
  .summary-card.debit { background:rgba(220,38,38,0.07); border:1px solid rgba(220,38,38,0.15); }
  .summary-card .label { font-size:9px; letter-spacing:1.5px; text-transform:uppercase; opacity:0.7; margin-bottom:6px; }
  .summary-card .value { font-size:18px; font-weight:300; }
  .credit { color:#16a34a; font-weight:600; } .debit { color:#dc2626; font-weight:600; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  thead th { text-align:left; padding:10px 12px; background:#f5f3ef; font-size:9px; letter-spacing:1.5px; text-transform:uppercase; color:#aaa; border-bottom:2px solid #e8e2d8; }
  tbody td { padding:10px 12px; border-bottom:1px solid #f0ebe2; }
  .footer { margin-top:32px; padding-top:16px; border-top:1px solid #e8e2d8; display:flex; justify-content:space-between; font-size:10px; color:#aaa; }
</style></head>
<body>
  <div class="header">
    <div><div class="bank-name">Banque</div><div class="bank-sub">Transaction Statement</div></div>
    <div><div class="doc-title">Account Statement</div><div class="doc-date">Exported on ${esc(exportDate)}</div></div>
  </div>
  <div class="account-info">
    <div class="info-item"><label>Account Holder</label><span>${esc(userInfo.name ?? "—")}</span></div>
    <div class="info-item"><label>Email</label><span>${esc(userInfo.email ?? "—")}</span></div>
    <div class="info-item"><label>Transactions</label><span>${transactions.length}</span></div>
    <div class="info-item"><label>Period</label><span>${esc(filters.dateFrom ?? "All")} → ${esc(filters.dateTo ?? "Now")}</span></div>
  </div>
  <div class="summary">
    <div class="summary-card total"><div class="label">Total Transactions</div><div class="value" style="color:#e8d48b;">${transactions.length}</div></div>
    <div class="summary-card credit"><div class="label">Total Credits</div><div class="value credit">+${fmt(totalCredit)} TND</div></div>
    <div class="summary-card debit"><div class="label">Total Debits</div><div class="value debit">−${fmt(totalDebit)} TND</div></div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Reference</th><th>Type</th><th style="text-align:right;">Amount</th><th style="text-align:right;">Balance</th><th>Source</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:24px;">No transactions found</td></tr>'}</tbody>
  </table>
  <div class="footer"><span>Banque · Confidential Document</span><span>${esc(exportDate)}</span></div>
</body></html>`
}
