
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";

// Theme colors and inputBase are now in App.css as CSS variables and utility classes

const PAGE_SIZE = 10;

const INITIAL_FILTERS = { search: "", type: "all", dateFrom: "", dateTo: "" };


const fmt = (n) => Math.abs(n).toLocaleString("fr-TN", { minimumFractionDigits: 3 });

const parseDate = (str) => {
  if (!str) return null;
  const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
  const [day, mon, year] = str.split(" ");
  return new Date(Number(year), months[mon], Number(day));
};

const TYPE_CFG = {
  credit: { icon:"↓", iconBg:"rgba(34,197,94,0.10)", iconColor:"#16a34a", amountColor:"#16a34a", sign:"+", badgeBg:"rgba(34,197,94,0.08)", badgeColor:"#16a34a", badgeLabel:"Credit" },
  debit:  { icon:"↑", iconBg:"rgba(239,68,68,0.08)",  iconColor:"#dc2626", amountColor:"#dc2626", sign:"−", badgeBg:"rgba(239,68,68,0.07)",  badgeColor:"#dc2626", badgeLabel:"Debit"  },
};


const exportCSV = (transactions) => {
  const headers = ["ID","Date","Label","Reference","Type","Amount","Currency"];
  const rows = transactions.map((tx) => [
    tx.id, tx.date, `"${tx.label}"`, tx.reference ?? "", tx.type,
    Math.abs(tx.amount).toFixed(3), tx.currency ?? "TND",
  ]);
  const csv  = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `transactions_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const exportPDF = (transactions) => {
  const rows = transactions.map((tx) => `
    <tr>
      <td>${tx.date}</td>
      <td>${tx.label}</td>
      <td>${tx.reference ?? "—"}</td>
      <td style="color:${tx.type === "credit" ? "#16a34a" : "#dc2626"}">${tx.type === "credit" ? "Credit" : "Debit"}</td>
      <td style="text-align:right;color:${tx.type === "credit" ? "#16a34a" : "#dc2626"};font-weight:600">
        ${tx.type === "credit" ? "+" : "−"}${fmt(tx.amount)} ${tx.currency ?? "TND"}
      </td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Transaction History</title>
    <style>
      body{font-family:Georgia,serif;padding:40px;color:#0a1628}
      h1{font-size:20px;font-weight:400;letter-spacing:1px;margin-bottom:4px}
      p{font-size:12px;color:#888;margin-bottom:28px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{text-align:left;padding:10px 12px;background:#f5f3ef;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#aaa;border-bottom:2px solid #e8e2d8}
      td{padding:11px 12px;border-bottom:1px solid #f0ebe2}
      tr:last-child td{border-bottom:none}
      td:last-child{text-align:right}
    </style></head><body>
    <h1>Transaction History</h1>
    <p>Exported on ${new Date().toLocaleDateString("en-GB",{weekday:"long",year:"numeric",month:"long",day:"numeric"})} · ${transactions.length} transactions</p>
    <table><thead><tr><th>Date</th><th>Description</th><th>Reference</th><th>Type</th><th>Amount</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.print();
};

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────
const TransactionHistory = () => {
  const [allTx, setAllTx]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [error, setError]               = useState(null);
  const [filters, setFilters]           = useState(INITIAL_FILTERS);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [exportOpen, setExportOpen]     = useState(false);
  const navigate = useNavigate();

  // ── Fetch ──────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get("/transactions");
        setAllTx(data);
      } catch (err) {
        setError(err.response?.data?.message ?? err.message ?? "Failed to load transactions.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Filter ─────────────────────────────────
  const filtered = useMemo(() => allTx.filter((tx) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!tx.label?.toLowerCase().includes(q) && !tx.reference?.toLowerCase().includes(q)) return false;
    }
    if (filters.type !== "all" && tx.type !== filters.type) return false;
    if (filters.dateFrom) {
      const d = parseDate(tx.date), from = new Date(filters.dateFrom);
      if (d && d < from) return false;
    }
    if (filters.dateTo) {
      const d = parseDate(tx.date), to = new Date(filters.dateTo);
      to.setHours(23, 59, 59);
      if (d && d > to) return false;
    }
    return true;
  }), [allTx, filters]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filters]);

  // ── Stats ──────────────────────────────────
  const stats = useMemo(() => {
    const credits = allTx.filter(tx => tx.type === "credit");
    const debits  = allTx.filter(tx => tx.type === "debit");
    const sum     = (arr) => arr.reduce((acc, tx) => acc + Math.abs(tx.amount), 0);
    return {
      count:    allTx.length,
      totalIn:  fmt(sum(credits)),
      totalOut: fmt(sum(debits)),
    };
  }, [allTx]);

  const visible  = filtered.slice(0, visibleCount);
  const hasMore  = visibleCount < filtered.length;
  const hasFilters = filters.search || filters.type !== "all" || filters.dateFrom || filters.dateTo;

  const handleLoadMore = () => {
    setLoadingMore(true);
    setTimeout(() => { setVisibleCount(v => v + PAGE_SIZE); setLoadingMore(false); }, 350);
  };

  // ── Loading ────────────────────────────────
  if (loading) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:320, gap:16, color:"var(--color-muted)" }}>
      <div style={{ width:34, height:34, border:"3px solid var(--color-cream-border)", borderTopColor:"var(--color-gold)", borderRadius:"50%", animation:"spin .8s linear infinite" }} />
      <span style={{ fontSize:13, letterSpacing:1 }}>Loading transactions…</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Error ──────────────────────────────────
  if (error) return (
    <div style={{ background:"#fff", borderRadius:16, padding:"40px 32px", textAlign:"center", border:"1px solid #fde8e8", maxWidth:480, margin:"0 auto" }}>
      <div style={{ fontSize:28, marginBottom:12 }}>⚠️</div>
      <div style={{ fontSize:14, color:"var(--color-red)", fontWeight:600, marginBottom:8 }}>Unable to load transactions</div>
      <div style={{ fontSize:12, color:"var(--color-muted)", marginBottom:24 }}>{error}</div>
      <button onClick={() => window.location.reload()} style={{ fontSize:12, color:"var(--color-gold)", background:"none", border:"1px solid var(--color-gold)", borderRadius:8, padding:"8px 20px", cursor:"pointer" }}>
        Retry
      </button>
    </div>
  );

  return (
    <div style={{ fontFamily:"var(--font-main)", maxWidth:940, margin:"0 auto" }}>

      {/* ── Summary cards ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:24 }}>
        {[
          { label:"Total Transactions", value:stats.count,    unit:"operations", color:"var(--color-navy)",  bg:"#fff"              },
          { label:"Total Credits",      value:stats.totalIn,  unit:"TND",        color:"var(--color-green)", bg:"var(--color-green-bg)" },
          { label:"Total Debits",       value:stats.totalOut, unit:"TND",        color:"var(--color-red)",   bg:"var(--color-red-bg)" },
        ].map((s) => (
          <div key={s.label} style={{ background:s.bg, borderRadius:14, padding:"18px 22px", border:"1px solid var(--color-cream-border)", boxShadow:"0 1px 6px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize:10, color:"var(--color-muted)", letterSpacing:1.5, textTransform:"uppercase", fontWeight:600, marginBottom:8 }}>{s.label}</div>
            <div style={{ fontSize:22, fontWeight:400, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:10, color:"#ccc", marginTop:4, letterSpacing:1 }}>{s.unit}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:11, letterSpacing:2, textTransform:"uppercase", color:"var(--color-muted)", fontWeight:600 }}>
          Transaction History
        </div>

        {/* Export dropdown */}
        <div style={{ position:"relative" }}>
          <button
            onClick={() => setExportOpen(!exportOpen)}
            disabled={filtered.length === 0}
            style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 18px", border:"1.5px solid var(--color-cream-border)", borderRadius:10, background:"#fff", color: filtered.length === 0 ? "#ccc" : "var(--color-navy)", fontSize:12, cursor: filtered.length === 0 ? "not-allowed" : "pointer", fontFamily:"var(--font-main)", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}
          >
            <span>↧</span> Export <span style={{ fontSize:9, color:t.muted }}>▾</span>
          </button>
          {exportOpen && (
            <>
              <div style={{ position:"fixed", inset:0, zIndex:9 }} onClick={() => setExportOpen(false)} />
              <div style={{ position:"absolute", top:"calc(100% + 8px)", right:0, background:"#fff", border:"1px solid var(--color-cream-border)", borderRadius:12, boxShadow:"0 8px 28px rgba(0,0,0,0.12)", zIndex:10, overflow:"hidden", minWidth:160 }}>
                {[
                  { label:"Export as CSV", icon:"⊞", action:() => { exportCSV(filtered); setExportOpen(false); } },
                  { label:"Export as PDF", icon:"⊟", action:() => { exportPDF(filtered); setExportOpen(false); } },
                ].map((item) => (
                  <button key={item.label} onClick={item.action}
                    style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"13px 18px", border:"none", background:"transparent", color:"var(--color-navy)", fontSize:12, cursor:"pointer", fontFamily:"var(--font-main)", textAlign:"left", borderBottom:"1px solid var(--color-cream-input)" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-cream-input)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <span style={{ color:t.gold, fontSize:14 }}>{item.icon}</span>{item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ background:"#fff", borderRadius:14, padding:"20px 24px", boxShadow:"0 2px 12px rgba(0,0,0,0.06)", border:`1px solid ${t.creamBorder}`, marginBottom:20 }}>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr auto", gap:12, alignItems:"end" }}>

          {/* Search */}
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            <label style={{ fontSize:10, color:t.muted, letterSpacing:1.2, textTransform:"uppercase", fontWeight:600 }}>Search</label>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:t.muted, fontSize:13, pointerEvents:"none" }}>⌕</span>
              <input className="input-base" style={{ paddingLeft:30 }} type="text" placeholder="Label, reference…" value={filters.search}
                onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))} />
            </div>
          </div>

          {/* Type */}
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            <label style={{ fontSize:10, color:t.muted, letterSpacing:1.2, textTransform:"uppercase", fontWeight:600 }}>Type</label>
            <select className="input-base" value={filters.type} onChange={(e) => setFilters(f => ({ ...f, type: e.target.value }))}>
              <option value="all">All Types</option>
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
          </div>

          {/* Date from */}
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            <label style={{ fontSize:10, color:t.muted, letterSpacing:1.2, textTransform:"uppercase", fontWeight:600 }}>From</label>
            <input className="input-base" type="date" value={filters.dateFrom}
              onChange={(e) => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
          </div>

          {/* Date to */}
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            <label style={{ fontSize:10, color:t.muted, letterSpacing:1.2, textTransform:"uppercase", fontWeight:600 }}>To</label>
            <input className="input-base" type="date" value={filters.dateTo} min={filters.dateFrom || undefined}
              onChange={(e) => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
          </div>

          {/* Reset */}
          <button onClick={() => { setFilters(INITIAL_FILTERS); setVisibleCount(PAGE_SIZE); }} disabled={!hasFilters}
            style={{ padding:"10px 16px", borderRadius:9, border:"1.5px solid var(--color-cream-border)", background:"transparent", color: hasFilters ? "var(--color-gold)" : "#ccc", fontSize:11, cursor: hasFilters ? "pointer" : "not-allowed", fontFamily:"var(--font-main)", whiteSpace:"nowrap" }}>
            ✕ Reset
          </button>
        </div>

        {/* Result count */}
        <div style={{ marginTop:14, fontSize:11, color:"var(--color-muted)" }}>
          {filtered.length === 0
            ? "No transactions match your filters"
            : `${filtered.length} transaction${filtered.length > 1 ? "s" : ""} found`}
          {hasFilters && <span style={{ marginLeft:8, color:t.gold }}>· Filters active</span>}
        </div>
      </div>

      {/* ── Table ── */}
      {filtered.length === 0 ? (
        <div style={{ background:"#fff", borderRadius:16, padding:"64px 32px", textAlign:"center", boxShadow:"0 2px 12px rgba(0,0,0,0.06)", border:"1px solid var(--color-cream-border)" }}>
          <div style={{ fontSize:40, marginBottom:16, color:"var(--color-cream-border)" }}>⇄</div>
          <div style={{ fontSize:14, color:"var(--color-muted)" }}>No transactions found</div>
          <div style={{ fontSize:12, color:"#ccc", marginTop:6 }}>Try adjusting your filters</div>
        </div>
      ) : (
        <div style={{ background:"#fff", borderRadius:16, boxShadow:"0 2px 12px rgba(0,0,0,0.06)", border:"1px solid var(--color-cream-border)", overflow:"hidden" }}>

          {/* Table header */}
          <div style={{ display:"grid", gridTemplateColumns:"48px 1fr 130px 100px 130px", gap:16, padding:"12px 24px", background:"var(--color-cream-input)", borderBottom:"1px solid #ede8df" }}>
            {["", "Description", "Reference", "Type", "Amount"].map((h, i) => (
              <div key={i} style={{ fontSize:10, color:"var(--color-muted)", letterSpacing:1.5, textTransform:"uppercase", fontWeight:600, textAlign: i === 4 ? "right" : "left" }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          {visible.map((tx, i) => {
            const cfg = TYPE_CFG[tx.type] ?? TYPE_CFG.debit;
            return (
              <div
                key={tx.id}
                style={{ display:"grid", gridTemplateColumns:"48px 1fr 130px 100px 130px", alignItems:"center", gap:16, padding:"16px 24px", borderBottom: i < visible.length - 1 || hasMore ? "1px solid var(--color-cream-input)" : "none", transition:"background .15s", cursor:"pointer" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-cream-input)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                onClick={() => navigate(`/transaction/${tx.id}`)}
                tabIndex={0}
                role="button"
                aria-label={`View details for transaction ${tx.id}`}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") navigate(`/transaction/${tx.id}`); }}
              >
                {/* Icon */}
                <div style={{ width:40, height:40, borderRadius:"50%", background:cfg.iconBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color:cfg.iconColor }}>
                  {cfg.icon}
                </div>

                {/* Label + date */}
                <div>
                  <div style={{ fontSize:13, color:"var(--color-navy)", fontWeight:500, marginBottom:3 }}>{tx.label}</div>
                  <div style={{ fontSize:11, color:"#bbb" }}>{tx.date}</div>
                </div>

                {/* Reference */}
                <div style={{ fontSize:11, color:"var(--color-muted)", fontFamily:"monospace", letterSpacing:0.3 }}>{tx.reference ?? "—"}</div>

                {/* Badge */}
                <div>
                  <span style={{ display:"inline-block", padding:"3px 10px", borderRadius:20, fontSize:10, fontWeight:600, letterSpacing:.8, textTransform:"uppercase", background:cfg.badgeBg, color:cfg.badgeColor }}>
                    {cfg.badgeLabel}
                  </span>
                </div>

                {/* Amount */}
                <div style={{ fontSize:14, fontWeight:600, color:cfg.amountColor, textAlign:"right" }}>
                  {cfg.sign}{fmt(tx.amount)} <span style={{ fontSize:10, fontWeight:400, color:"#bbb" }}>{tx.currency ?? "TND"}</span>
                </div>
              </div>
            );
          })}

          {/* Load more */}
          {hasMore && (
            <div style={{ padding:"20px 24px", borderTop:"1px solid var(--color-cream-input)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:12, color:"var(--color-muted)" }}>Showing {visible.length} of {filtered.length}</span>
              <button onClick={handleLoadMore} disabled={loadingMore}
                style={{ padding:"10px 24px", border:"1.5px solid var(--color-cream-border)", borderRadius:9, background:"transparent", color: loadingMore ? "#ccc" : "var(--color-gold)", fontSize:12, cursor: loadingMore ? "not-allowed" : "pointer", fontFamily:"var(--font-main)", display:"flex", alignItems:"center", gap:8 }}>
                {loadingMore ? "Loading…" : `Load more  ↓  (${filtered.length - visible.length} remaining)`}
              </button>
            </div>
          )}

          {/* All loaded */}
          {!hasMore && (
            <div style={{ padding:"14px 24px", borderTop:"1px solid var(--color-cream-input)", textAlign:"center", fontSize:11, color:"#ccc", letterSpacing:.5 }}>
              All {filtered.length} transactions displayed
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;