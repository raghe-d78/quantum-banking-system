import { useState, useEffect, useMemo } from "react";
import api from "../lib/api";

// ─── Design tokens ────────────────────────────────────────────────
const tk = {
  navy:        "#0a1628",
  navyMid:     "#1a3a6b",
  gold:        "#c9a84c",
  goldLight:   "#e8d48b",
  cream:       "#f5f3ef",
  creamBorder: "#e8e2d8",
  creamInput:  "#faf8f5",
  muted:       "#aaa",
  green:       "#16a34a",
  greenBg:     "rgba(34,197,94,0.08)",
  greenBorder: "rgba(34,197,94,0.22)",
  red:         "#dc2626",
  redBg:       "rgba(239,68,68,0.07)",
  redBorder:   "rgba(239,68,68,0.22)",
};

const PAGE_SIZE       = 10;
const INITIAL_FILTERS = { search: "", type: "all", dateFrom: "", dateTo: "" };

// ─── Helpers ──────────────────────────────────────────────────────
// Backend returns CREDIT / DEBIT (uppercase) — normalize here once
const normalizeType = (t) => (t ?? "").toUpperCase() === "CREDIT" ? "credit" : "debit";

const fmt = (n) =>
  Math.abs(parseFloat(n) || 0).toLocaleString("fr-TN", { minimumFractionDigits: 3 });

const fmtDate = (raw) => {
  if (!raw) return "—";
  try {
    return new Date(raw).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return raw; }
};

const fmtDateLong = (raw) => {
  if (!raw) return "—";
  try {
    return new Date(raw).toLocaleDateString("en-GB", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
  } catch { return raw; }
};

const fmtTime = (raw) => {
  if (!raw) return "";
  try {
    return new Date(raw).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
};

const TYPE_CFG = {
  credit: {
    icon: "↓", iconBg: "rgba(34,197,94,0.12)", iconColor: "#16a34a",
    amountColor: "#16a34a", sign: "+",
    badgeBg: "rgba(34,197,94,0.09)", badgeColor: "#16a34a", badgeLabel: "Credit",
    gradientFrom: "#16a34a",
  },
  debit: {
    icon: "↑", iconBg: "rgba(239,68,68,0.10)", iconColor: "#dc2626",
    amountColor: "#dc2626", sign: "−",
    badgeBg: "rgba(239,68,68,0.08)", badgeColor: "#dc2626", badgeLabel: "Debit",
    gradientFrom: "#dc2626",
  },
};

// ─── Export helpers ───────────────────────────────────────────────
const exportCSV = (transactions) => {
  const headers = ["ID", "Date", "Reference", "Type", "Amount", "Balance After", "Currency"];
  const rows    = transactions.map((tx) => {
    const type = normalizeType(tx.type);
    return [
      tx.id,
      fmtDate(tx.created_at),
      tx.reference ?? "",
      type.charAt(0).toUpperCase() + type.slice(1),
      (type === "credit" ? "+" : "-") + parseFloat(tx.amount).toFixed(3),
      tx.balance_snapshot ? parseFloat(tx.balance_snapshot).toFixed(3) : "",
      "TND",
    ];
  });
  const csv  = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `transactions_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const exportPDF = (transactions) => {
  const rows = transactions.map((tx) => {
    const type     = normalizeType(tx.type);
    const isCredit = type === "credit";
    return `
      <tr>
        <td>${fmtDate(tx.created_at)}</td>
        <td>${tx.reference ?? "—"}</td>
        <td class="${type}">${isCredit ? "Credit" : "Debit"}</td>
        <td style="text-align:right" class="${type}">
          ${isCredit ? "+" : "−"}${fmt(tx.amount)} TND
        </td>
        <td style="text-align:right;color:#555">${tx.balance_snapshot ? fmt(tx.balance_snapshot) + " TND" : "—"}</td>
      </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <title>Transaction Statement</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Georgia,serif;padding:40px;color:#0a1628;font-size:12px}
      .header{display:flex;justify-content:space-between;margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #c9a84c}
      .bank{font-size:20px;font-weight:bold;letter-spacing:2px;text-transform:uppercase}
      .sub{font-size:10px;color:#aaa;letter-spacing:2px;text-transform:uppercase;margin-top:4px}
      table{width:100%;border-collapse:collapse}
      th{padding:10px 12px;background:#f5f3ef;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#aaa;border-bottom:2px solid #e8e2d8;text-align:left}
      td{padding:10px 12px;border-bottom:1px solid #f0ebe2}
      .credit{color:#16a34a;font-weight:600}
      .debit{color:#dc2626;font-weight:600}
      .footer{margin-top:28px;padding-top:12px;border-top:1px solid #e8e2d8;font-size:10px;color:#aaa;display:flex;justify-content:space-between}
    </style></head><body>
    <div class="header">
      <div><div class="bank">Banque</div><div class="sub">Transaction Statement</div></div>
      <div style="text-align:right">
        <div style="font-size:13px;font-weight:bold">Account Statement</div>
        <div style="font-size:11px;color:#aaa;margin-top:4px">Exported on ${fmtDateLong(new Date())}</div>
        <div style="font-size:11px;color:#aaa;margin-top:2px">${transactions.length} transaction${transactions.length !== 1 ? "s" : ""}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Reference</th><th>Type</th><th style="text-align:right">Amount</th><th style="text-align:right">Balance After</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:24px">No transactions</td></tr>'}</tbody>
    </table>
    <div class="footer"><span>Banque · Confidential</span><span>${fmtDateLong(new Date())}</span></div>
    </body></html>`;

  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); win.print(); }
};

// ─── Transaction Detail Modal ─────────────────────────────────────
const TransactionModal = ({ tx, onClose }) => {
  const type     = normalizeType(tx.type);
  const cfg      = TYPE_CFG[type];
  const isCredit = type === "credit";

  return (
    <div
      style={{ position:"fixed", inset:0, background:"rgba(10,22,40,0.60)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 }}
      onClick={onClose}
    >
      <div
        style={{ background:"#fff", borderRadius:20, maxWidth:480, width:"100%", overflow:"hidden", boxShadow:"0 24px 64px rgba(0,0,0,0.25)", animation:"modalIn 0.25s ease" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Hero banner */}
        <div style={{ background:`linear-gradient(135deg, ${tk.navy} 0%, ${tk.navyMid} 100%)`, padding:"28px 32px 24px", position:"relative", overflow:"hidden" }}>
          {/* Decorative circles */}
          <div style={{ position:"absolute", top:-30, right:-30, width:120, height:120, borderRadius:"50%", background:"rgba(255,255,255,0.04)" }} />
          <div style={{ position:"absolute", bottom:-20, right:60, width:80, height:80, borderRadius:"50%", background:"rgba(201,168,76,0.07)" }} />

          {/* Close */}
          <button onClick={onClose} style={{ position:"absolute", top:14, right:16, background:"rgba(255,255,255,0.1)", border:"none", color:"rgba(255,255,255,0.7)", width:28, height:28, borderRadius:"50%", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>

          <div style={{ display:"flex", alignItems:"flex-start", gap:16, position:"relative", zIndex:1 }}>
            <div style={{ width:52, height:52, borderRadius:"50%", background:cfg.iconBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, color:cfg.iconColor, flexShrink:0 }}>
              {cfg.icon}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", letterSpacing:1.5, textTransform:"uppercase", marginBottom:4 }}>
                {cfg.badgeLabel}
              </div>
              <div style={{ fontSize:14, color:"#fff", marginBottom:12, wordBreak:"break-all" }}>
                {tx.reference ?? "Transaction"}
              </div>
              <div style={{ fontSize:36, fontWeight:300, color:cfg.amountColor, letterSpacing:-1 }}>
                {cfg.sign}{fmt(tx.amount)}
              </div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.3)", marginTop:4, letterSpacing:1 }}>TND</div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div style={{ padding:"24px 32px" }}>
          {[
            { label:"Transaction ID",  value:tx.id,                                    mono:true   },
            { label:"Date",            value:fmtDateLong(tx.created_at)                             },
            { label:"Time",            value:fmtTime(tx.created_at)                                 },
            { label:"Type",            value:cfg.badgeLabel,        color:cfg.badgeColor            },
            { label:"Balance After",   value:tx.balance_snapshot ? fmt(tx.balance_snapshot)+" TND" : "—" },
            { label:"Initiated By",    value:tx.performed_by ? "Staff" : "Customer"                 },
          ].map(({ label, value, color, mono }) => (
            <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 0", borderBottom:`1px solid ${tk.creamBorder}` }}>
              <span style={{ fontSize:11, color:tk.muted, textTransform:"uppercase", letterSpacing:0.5 }}>{label}</span>
              <span style={{
                fontSize: mono ? 10 : 13,
                color: color || tk.navy,
                fontWeight: 500,
                fontFamily: mono ? "monospace" : "'Georgia', serif",
                wordBreak: "break-all", textAlign:"right", maxWidth:280,
              }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ padding:"16px 32px 28px", display:"flex", gap:10 }}>
          {/* Export this transaction CSV */}
          <button onClick={() => exportCSV([tx])} style={{
            flex:1, padding:"12px", borderRadius:10,
            border:`1.5px solid ${tk.creamBorder}`,
            background:"transparent", color:tk.navy,
            fontSize:12, fontFamily:"'Georgia', serif",
            cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
          }}>
            ⊞ Export CSV
          </button>

          {/* Export this transaction PDF */}
          <button onClick={() => exportPDF([tx])} style={{
            flex:1, padding:"12px", borderRadius:10,
            border:`1.5px solid ${tk.creamBorder}`,
            background:"transparent", color:tk.navy,
            fontSize:12, fontFamily:"'Georgia', serif",
            cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
          }}>
            ⊟ Print / PDF
          </button>

          {/* Close */}
          <button onClick={onClose} style={{
            flex:1, padding:"12px", borderRadius:10, border:"none",
            background:`linear-gradient(135deg, ${tk.navy}, ${tk.navyMid})`,
            color:tk.goldLight, fontSize:12, fontFamily:"'Georgia', serif",
            fontWeight:600, cursor:"pointer",
          }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────
const TransactionHistory = () => {
  const [allTx,       setAllTx]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error,       setError]       = useState(null);
  const [filters,     setFilters]     = useState(INITIAL_FILTERS);
  const [visibleCount,setVisibleCount]= useState(PAGE_SIZE);
  const [exportOpen,  setExportOpen]  = useState(false);
  const [selectedTx,  setSelectedTx]  = useState(null);

  // Fetch
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get("/transactions");
        const transactions = Array.isArray(data) ? data : (data?.transactions ?? []);
        setAllTx(transactions);
      } catch (err) {
        setError(err.response?.data?.message ?? err.message ?? "Failed to load transactions.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Filter — uses backend field names (created_at, reference, type uppercase)
  const filtered = useMemo(() => allTx.filter((tx) => {
    const type = normalizeType(tx.type);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!(tx.reference ?? "").toLowerCase().includes(q)) return false;
    }
    if (filters.type !== "all" && type !== filters.type) return false;
    if (filters.dateFrom) {
      const d = new Date(tx.created_at);
      if (d < new Date(filters.dateFrom)) return false;
    }
    if (filters.dateTo) {
      const d  = new Date(tx.created_at);
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59);
      if (d > to) return false;
    }
    return true;
  }), [allTx, filters]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filters]);

  const stats = useMemo(() => {
    const credits = allTx.filter(tx => normalizeType(tx.type) === "credit");
    const debits  = allTx.filter(tx => normalizeType(tx.type) === "debit");
    const sum     = arr => arr.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);
    return { count: allTx.length, totalIn: fmt(sum(credits)), totalOut: fmt(sum(debits)) };
  }, [allTx]);

  const visible    = filtered.slice(0, visibleCount);
  const hasMore    = visibleCount < filtered.length;
  const hasFilters = filters.search || filters.type !== "all" || filters.dateFrom || filters.dateTo;

  const handleLoadMore = () => {
    setLoadingMore(true);
    setTimeout(() => { setVisibleCount(v => v + PAGE_SIZE); setLoadingMore(false); }, 350);
  };

  // ── Loading ──────────────────────────────────
  if (loading) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:320, gap:16, color:tk.muted }}>
      <div style={{ width:34, height:34, border:`3px solid ${tk.creamBorder}`, borderTopColor:tk.gold, borderRadius:"50%", animation:"spin .8s linear infinite" }} />
      <span style={{ fontSize:13, letterSpacing:1 }}>Loading transactions…</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Error ────────────────────────────────────
  if (error) return (
    <div style={{ background:"#fff", borderRadius:16, padding:"40px 32px", textAlign:"center", border:`1px solid ${tk.redBorder}`, maxWidth:480, margin:"0 auto" }}>
      <div style={{ fontSize:28, marginBottom:12 }}>⚠️</div>
      <div style={{ fontSize:14, color:tk.red, fontWeight:600, marginBottom:8 }}>Unable to load transactions</div>
      <div style={{ fontSize:12, color:tk.muted, marginBottom:24 }}>{error}</div>
      <button onClick={() => window.location.reload()} style={{ fontSize:12, color:tk.gold, background:"none", border:`1px solid ${tk.gold}`, borderRadius:8, padding:"8px 20px", cursor:"pointer" }}>Retry</button>
    </div>
  );

  return (
    <div style={{ fontFamily:"'Georgia', serif", maxWidth:940, margin:"0 auto" }}>

      {/* Detail modal */}
      {selectedTx && <TransactionModal tx={selectedTx} onClose={() => setSelectedTx(null)} />}

      {/* ── Summary cards ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:24 }}>
        {[
          { label:"Total Transactions", value:stats.count,    unit:"operations", color:tk.navy,   bg:"#fff"              },
          { label:"Total Credits",      value:stats.totalIn,  unit:"TND",        color:tk.green,  bg:tk.greenBg          },
          { label:"Total Debits",       value:stats.totalOut, unit:"TND",        color:tk.red,    bg:tk.redBg            },
        ].map(s => (
          <div key={s.label} style={{ background:s.bg, borderRadius:14, padding:"18px 22px", border:`1px solid ${tk.creamBorder}`, boxShadow:"0 1px 6px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize:10, color:tk.muted, letterSpacing:1.5, textTransform:"uppercase", fontWeight:600, marginBottom:8 }}>{s.label}</div>
            <div style={{ fontSize:22, fontWeight:400, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:10, color:"#ccc", marginTop:4, letterSpacing:1 }}>{s.unit}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:11, letterSpacing:2, textTransform:"uppercase", color:tk.muted, fontWeight:600 }}>Transaction History</div>

        {/* Export dropdown */}
        <div style={{ position:"relative" }}>
          <button onClick={() => setExportOpen(!exportOpen)} disabled={filtered.length === 0}
            style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 18px", border:`1.5px solid ${tk.creamBorder}`, borderRadius:10, background:"#fff", color: filtered.length === 0 ? "#ccc" : tk.navy, fontSize:12, cursor: filtered.length === 0 ? "not-allowed" : "pointer", fontFamily:"'Georgia', serif", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
            <span>↧</span> Export All <span style={{ fontSize:9, color:tk.muted }}>▾</span>
          </button>
          {exportOpen && (
            <>
              <div style={{ position:"fixed", inset:0, zIndex:9 }} onClick={() => setExportOpen(false)} />
              <div style={{ position:"absolute", top:"calc(100% + 8px)", right:0, background:"#fff", border:`1px solid ${tk.creamBorder}`, borderRadius:12, boxShadow:"0 8px 28px rgba(0,0,0,0.12)", zIndex:10, overflow:"hidden", minWidth:170 }}>
                {[
                  { label:"Export as CSV", icon:"⊞", action:() => { exportCSV(filtered); setExportOpen(false); } },
                  { label:"Print / PDF",   icon:"⊟", action:() => { exportPDF(filtered); setExportOpen(false); } },
                ].map(item => (
                  <button key={item.label} onClick={item.action}
                    style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"13px 18px", border:"none", background:"transparent", color:tk.navy, fontSize:12, cursor:"pointer", fontFamily:"'Georgia', serif", textAlign:"left", borderBottom:`1px solid ${tk.creamInput}` }}
                    onMouseEnter={e => e.currentTarget.style.background = tk.creamInput}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <span style={{ color:tk.gold, fontSize:14 }}>{item.icon}</span>{item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ background:"#fff", borderRadius:14, padding:"20px 24px", boxShadow:"0 2px 12px rgba(0,0,0,0.06)", border:`1px solid ${tk.creamBorder}`, marginBottom:20 }}>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr auto", gap:12, alignItems:"end" }}>
          {/* Search */}
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            <label style={{ fontSize:10, color:tk.muted, letterSpacing:1.2, textTransform:"uppercase", fontWeight:600 }}>Search</label>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:tk.muted, fontSize:13, pointerEvents:"none" }}>⌕</span>
              <input style={{ padding:"10px 14px 10px 32px", border:`1.5px solid ${tk.creamBorder}`, borderRadius:9, fontSize:12, color:tk.navy, background:tk.creamInput, outline:"none", fontFamily:"'Georgia', serif", width:"100%", boxSizing:"border-box" }}
                type="text" placeholder="Search by reference…" value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
            </div>
          </div>
          {/* Type */}
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            <label style={{ fontSize:10, color:tk.muted, letterSpacing:1.2, textTransform:"uppercase", fontWeight:600 }}>Type</label>
            <select style={{ padding:"10px 14px", border:`1.5px solid ${tk.creamBorder}`, borderRadius:9, fontSize:12, color:tk.navy, background:tk.creamInput, outline:"none", fontFamily:"'Georgia', serif" }}
              value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
              <option value="all">All Types</option>
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
          </div>
          {/* Date from */}
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            <label style={{ fontSize:10, color:tk.muted, letterSpacing:1.2, textTransform:"uppercase", fontWeight:600 }}>From</label>
            <input style={{ padding:"10px 14px", border:`1.5px solid ${tk.creamBorder}`, borderRadius:9, fontSize:12, color:tk.navy, background:tk.creamInput, outline:"none", fontFamily:"'Georgia', serif" }}
              type="date" value={filters.dateFrom}
              onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
          </div>
          {/* Date to */}
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            <label style={{ fontSize:10, color:tk.muted, letterSpacing:1.2, textTransform:"uppercase", fontWeight:600 }}>To</label>
            <input style={{ padding:"10px 14px", border:`1.5px solid ${tk.creamBorder}`, borderRadius:9, fontSize:12, color:tk.navy, background:tk.creamInput, outline:"none", fontFamily:"'Georgia', serif" }}
              type="date" value={filters.dateTo} min={filters.dateFrom || undefined}
              onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
          </div>
          {/* Reset */}
          <button onClick={() => { setFilters(INITIAL_FILTERS); setVisibleCount(PAGE_SIZE); }} disabled={!hasFilters}
            style={{ padding:"10px 16px", borderRadius:9, border:`1.5px solid ${tk.creamBorder}`, background:"transparent", color: hasFilters ? tk.gold : "#ccc", fontSize:11, cursor: hasFilters ? "pointer" : "not-allowed", fontFamily:"'Georgia', serif", whiteSpace:"nowrap" }}>
            ✕ Reset
          </button>
        </div>
        <div style={{ marginTop:14, fontSize:11, color:tk.muted }}>
          {filtered.length === 0 ? "No transactions match your filters"
            : `${filtered.length} transaction${filtered.length > 1 ? "s" : ""} found`}
          {hasFilters && <span style={{ marginLeft:8, color:tk.gold }}>· Filters active</span>}
        </div>
      </div>

      {/* ── Table ── */}
      {filtered.length === 0 ? (
        <div style={{ background:"#fff", borderRadius:16, padding:"64px 32px", textAlign:"center", boxShadow:"0 2px 12px rgba(0,0,0,0.06)", border:`1px solid ${tk.creamBorder}` }}>
          <div style={{ fontSize:40, marginBottom:16, color:tk.creamBorder }}>⇄</div>
          <div style={{ fontSize:14, color:tk.muted }}>No transactions found</div>
          <div style={{ fontSize:12, color:"#ccc", marginTop:6 }}>Try adjusting your filters</div>
        </div>
      ) : (
        <div style={{ background:"#fff", borderRadius:16, boxShadow:"0 2px 12px rgba(0,0,0,0.06)", border:`1px solid ${tk.creamBorder}`, overflow:"hidden" }}>

          {/* Table header */}
          <div style={{ display:"grid", gridTemplateColumns:"52px 1fr 150px 100px 140px", gap:16, padding:"13px 24px", background:tk.creamInput, borderBottom:`1px solid #ede8df` }}>
            {["", "Reference / Date", "Transaction ID", "Type", "Amount"].map((h, i) => (
              <div key={i} style={{ fontSize:10, color:tk.muted, letterSpacing:1.5, textTransform:"uppercase", fontWeight:600, textAlign: i===4 ? "right" : "left" }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          {visible.map((tx, i) => {
            const type = normalizeType(tx.type);
            const cfg  = TYPE_CFG[type];
            return (
              <div key={tx.id}
                style={{ display:"grid", gridTemplateColumns:"52px 1fr 150px 100px 140px", alignItems:"center", gap:16, padding:"15px 24px", borderBottom: i < visible.length-1 || hasMore ? `1px solid #f5f0e8` : "none", transition:"background .15s", cursor:"pointer" }}
                onClick={() => setSelectedTx(tx)}
                onMouseEnter={e => e.currentTarget.style.background = tk.creamInput}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                {/* Icon */}
                <div style={{ width:42, height:42, borderRadius:"50%", background:cfg.iconBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:cfg.iconColor }}>
                  {cfg.icon}
                </div>

                {/* Reference + date */}
                <div>
                  <div style={{ fontSize:13, color:tk.navy, fontWeight:500, marginBottom:3 }}>
                    {tx.reference ?? "—"}
                  </div>
                  <div style={{ fontSize:11, color:"#bbb" }}>{fmtDate(tx.created_at)}</div>
                </div>

                {/* ID */}
                <div style={{ fontSize:10, color:tk.muted, fontFamily:"monospace", letterSpacing:0.3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {tx.id}
                </div>

                {/* Badge */}
                <div>
                  <span style={{ display:"inline-block", padding:"3px 10px", borderRadius:20, fontSize:10, fontWeight:700, letterSpacing:0.8, textTransform:"uppercase", background:cfg.badgeBg, color:cfg.badgeColor }}>
                    {cfg.badgeLabel}
                  </span>
                </div>

                {/* Amount */}
                <div style={{ fontSize:14, fontWeight:600, color:cfg.amountColor, textAlign:"right" }}>
                  {cfg.sign}{fmt(tx.amount)} <span style={{ fontSize:10, fontWeight:400, color:"#bbb" }}>TND</span>
                </div>
              </div>
            );
          })}

          {/* Load more */}
          {hasMore && (
            <div style={{ padding:"18px 24px", borderTop:`1px solid #f5f0e8`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:12, color:tk.muted }}>Showing {visible.length} of {filtered.length}</span>
              <button onClick={handleLoadMore} disabled={loadingMore}
                style={{ padding:"10px 24px", border:`1.5px solid ${tk.creamBorder}`, borderRadius:9, background:"transparent", color: loadingMore ? "#ccc" : tk.gold, fontSize:12, cursor: loadingMore ? "not-allowed" : "pointer", fontFamily:"'Georgia', serif", display:"flex", alignItems:"center", gap:8 }}>
                {loadingMore ? "Loading…" : `Load more ↓ (${filtered.length - visible.length} remaining)`}
              </button>
            </div>
          )}
          {!hasMore && (
            <div style={{ padding:"14px 24px", borderTop:`1px solid #f5f0e8`, textAlign:"center", fontSize:11, color:"#ccc", letterSpacing:0.5 }}>
              All {filtered.length} transactions displayed
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes modalIn { from { opacity:0; transform:scale(0.96) translateY(12px); } to { opacity:1; transform:scale(1) translateY(0); } }
      `}</style>
    </div>
  );
};

export default TransactionHistory;

