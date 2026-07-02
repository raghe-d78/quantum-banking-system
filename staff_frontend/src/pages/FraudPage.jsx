// staff_frontend/src/pages/FraudPage.jsx
// Phase 4.5 — staff fraud dashboard. Three views share one component:
//   view="notifications" → open alerts feed (auto-refresh)
//   view="transactions"  → all alerts + cancel action
//   view="stats"         → KPIs + model info
import { useState, useEffect, useMemo, useCallback } from "react";
import api from "../lib/api";

const tk = {
  navy: "#0a1628", navyMid: "#1a3a6b", gold: "#c9a84c", goldLight: "#e8d48b",
  cream: "#f5f3ef", creamBorder: "#e8e2d8", creamInput: "#faf8f5", muted: "#aaa",
  green: "#16a34a", greenBg: "rgba(34,197,94,0.08)", greenBorder: "rgba(34,197,94,0.22)",
  red: "#dc2626", redBg: "rgba(239,68,68,0.07)", redBorder: "rgba(239,68,68,0.22)",
  orange: "#d97706", orangeBg: "rgba(217,119,6,0.08)", orangeBorder: "rgba(217,119,6,0.25)",
  blue: "#1d4ed8", blueBg: "rgba(29,78,216,0.07)", blueBorder: "rgba(29,78,216,0.22)",
};

const RISK_CFG = {
  Low:      { bg: tk.greenBg,  color: tk.green,  border: tk.greenBorder },
  Medium:   { bg: tk.blueBg,   color: tk.blue,   border: tk.blueBorder },
  High:     { bg: tk.orangeBg, color: tk.orange, border: tk.orangeBorder },
  Critical: { bg: tk.redBg,    color: tk.red,    border: tk.redBorder },
};
const STATUS_CFG = {
  OPEN:      { label: "Open",      bg: tk.redBg,    color: tk.red,    border: tk.redBorder   },
  CANCELLED: { label: "Cancelled", bg: tk.greenBg,  color: tk.green,  border: tk.greenBorder },
  REVIEWED:  { label: "Reviewed",  bg: tk.blueBg,   color: tk.blue,   border: tk.blueBorder  },
};

const Pill = ({ cfg, children }) => (
  <span style={{
    display: "inline-block", padding: "3px 10px", borderRadius: 20,
    fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
    background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
  }}>{children}</span>
);

const fmtDate = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const shortId = (s) => (s ? s.slice(0, 8) + "…" : "—");

// ── data hooks ───────────────────────────────────────────────────
function useAlerts(limit, refreshMs) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await api.get(`/fraud/alerts?limit=${limit}`);
      setAlerts(res.data?.alerts ?? []);
      setError(null);
    } catch (e) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchAlerts();
    if (!refreshMs) return undefined;
    const id = setInterval(fetchAlerts, refreshMs);
    return () => clearInterval(id);
  }, [fetchAlerts, refreshMs]);

  return { alerts, loading, error, reload: fetchAlerts };
}

function useStats(refreshMs) {
  const [stats, setStats] = useState(null);
  const [model, setModel] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([
        api.get("/fraud/stats"),
        api.get("/fraud/model-info"),
      ]);
      setStats(s.data); setModel(m.data); setError(null);
    } catch (e) {
      setError(e.response?.data?.error ?? e.message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    if (!refreshMs) return undefined;
    const id = setInterval(reload, refreshMs);
    return () => clearInterval(id);
  }, [reload, refreshMs]);

  return { stats, model, error, reload };
}

// ── views ────────────────────────────────────────────────────────
function NotificationsView() {
  const { alerts, loading, error, reload } = useAlerts(50, 10_000);
  const open = useMemo(() => alerts.filter(a => a.status === "OPEN"), [alerts]);

  return (
    <div>
      <Header title="Open Fraud Alerts" subtitle={`${open.length} unresolved · auto-refresh every 10 s`} onReload={reload} />
      {error && <ErrorBanner msg={error} />}
      {loading ? <Empty msg="Loading alerts…" /> : open.length === 0 ? <Empty msg="No open alerts." icon="✓" /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {open.map(a => (
            <div key={a.transactionId} style={{
              background: "#fff", border: `1px solid ${tk.creamBorder}`, borderLeft: `4px solid ${RISK_CFG[a.riskLevel]?.color || tk.muted}`,
              borderRadius: 8, padding: "16px 20px", display: "grid",
              gridTemplateColumns: "120px 1fr 1fr 140px 110px", gap: 16, alignItems: "center",
            }}>
              <Pill cfg={RISK_CFG[a.riskLevel] || RISK_CFG.Medium}>{a.riskLevel}</Pill>
              <div>
                <div style={{ fontSize: 11, color: tk.muted, marginBottom: 2 }}>Transaction</div>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: tk.navy }}>{a.transactionId}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: tk.muted, marginBottom: 2 }}>Account</div>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: tk.navy }}>{shortId(a.accountId)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: tk.muted, marginBottom: 2 }}>Score</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: RISK_CFG[a.riskLevel]?.color || tk.navy }}>
                  {Number(a.decisionScore).toFixed(3)}
                </div>
              </div>
              <div style={{ fontSize: 11, color: tk.muted, textAlign: "right" }}>{fmtDate(a.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TransactionsView() {
  const { alerts, loading, error, reload } = useAlerts(200, 30_000);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

  const filtered = useMemo(() => {
    if (filter === "all") return alerts;
    return alerts.filter(a => a.riskLevel === filter || a.status === filter);
  }, [alerts, filter]);

  const cancel = async (txId) => {
    const reason = window.prompt("Cancellation reason (visible in audit log):");
    if (!reason) return;
    setBusy(txId);
    try {
      await api.post(`/admin/transactions/${txId}/cancel`, { reason });
      setToast({ kind: "ok", msg: `Transaction ${shortId(txId)} cancelled. Compensating ledger entries written.` });
      await reload();
    } catch (e) {
      const code = e.response?.status;
      const msg  = e.response?.data?.error?.message ?? e.response?.data?.error ?? e.message;
      setToast({ kind: "err", msg: `Cancel failed (${code}): ${msg}` });
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 6000);
    }
  };

  return (
    <div>
      <Header title="Fraud Transactions" subtitle={`${filtered.length} of ${alerts.length}`} onReload={reload}>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={inputStyle}>
          <option value="all">All risks</option>
          <option value="Critical">Critical only</option>
          <option value="High">High only</option>
          <option value="Medium">Medium only</option>
          <option value="OPEN">Open only</option>
          <option value="CANCELLED">Cancelled only</option>
        </select>
      </Header>

      {toast && (
        <div style={{
          marginBottom: 16, padding: "12px 16px", borderRadius: 8, fontSize: 13,
          background: toast.kind === "ok" ? tk.greenBg : tk.redBg,
          color:      toast.kind === "ok" ? tk.green  : tk.red,
          border: `1px solid ${toast.kind === "ok" ? tk.greenBorder : tk.redBorder}`,
        }}>{toast.msg}</div>
      )}

      {error && <ErrorBanner msg={error} />}
      {loading ? <Empty msg="Loading transactions…" /> : filtered.length === 0 ? <Empty msg="No transactions match this filter." /> : (
        <div style={{ background: "#fff", border: `1px solid ${tk.creamBorder}`, borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: tk.cream, borderBottom: `1px solid ${tk.creamBorder}` }}>
                {["Risk", "Status", "Transaction", "Account", "Score", "Detected", "Action"].map(h => (
                  <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: tk.muted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.transactionId} style={{ borderBottom: `1px solid ${tk.creamBorder}` }}>
                  <td style={td}><Pill cfg={RISK_CFG[a.riskLevel] || RISK_CFG.Medium}>{a.riskLevel}</Pill></td>
                  <td style={td}><Pill cfg={STATUS_CFG[a.status] || STATUS_CFG.OPEN}>{(STATUS_CFG[a.status] || {}).label || a.status}</Pill></td>
                  <td style={{ ...td, fontFamily: "monospace" }}>{a.transactionId}</td>
                  <td style={{ ...td, fontFamily: "monospace" }}>{shortId(a.accountId)}</td>
                  <td style={{ ...td, fontWeight: 700, color: RISK_CFG[a.riskLevel]?.color || tk.navy }}>{Number(a.decisionScore).toFixed(3)}</td>
                  <td style={{ ...td, color: tk.muted }}>{fmtDate(a.createdAt)}</td>
                  <td style={td}>
                    {a.status === "OPEN" ? (
                      <button
                        onClick={() => cancel(a.transactionId)}
                        disabled={busy === a.transactionId}
                        style={{
                          padding: "6px 14px", fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
                          background: busy === a.transactionId ? tk.muted : tk.red, color: "#fff",
                          border: "none", borderRadius: 6, cursor: busy === a.transactionId ? "wait" : "pointer",
                          fontFamily: "'Georgia', serif",
                        }}
                      >{busy === a.transactionId ? "Cancelling…" : "Cancel"}</button>
                    ) : <span style={{ fontSize: 11, color: tk.muted }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatsView() {
  const { stats, model, error, reload } = useStats(15_000);

  const kpis = stats ? [
    { label: "Total scored",  value: stats.totalScored, color: tk.navy },
    { label: "Open alerts",   value: stats.openAlerts,  color: tk.red },
    { label: "Critical",      value: stats.critical,    color: tk.red },
    { label: "High",          value: stats.high,        color: tk.orange },
    { label: "Medium",        value: stats.medium,      color: tk.blue },
    { label: "Low",           value: stats.low,         color: tk.green },
  ] : [];

  return (
    <div>
      <Header title="Fraud Statistics" subtitle="Live model and pipeline metrics · refresh every 15 s" onReload={reload} />
      {error && <ErrorBanner msg={error} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: "#fff", border: `1px solid ${tk.creamBorder}`, borderRadius: 8, padding: 18 }}>
            <div style={{ fontSize: 11, color: tk.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: k.color }}>{k.value ?? "—"}</div>
          </div>
        ))}
      </div>

      {stats && (
        <div style={{ background: "#fff", border: `1px solid ${tk.creamBorder}`, borderRadius: 8, padding: 20, marginBottom: 16 }}>
          <h3 style={sectionTitle}>Kafka consumer</h3>
          <KV label="Processed events" value={stats.consumerProcessed ?? "—"} />
          <KV label="Alerts raised"    value={stats.consumerAlerts ?? "—"} />
          <KV label="Last error"       value={stats.consumerLastError || "none"} mono={!!stats.consumerLastError} />
        </div>
      )}

      {model && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <ModelCard title="Classical baseline" m={model.baseline} />
          <ModelCard title="Quantum classifier (VQC)" m={model.quantum} />
        </div>
      )}
      {model && (
        <div style={{ marginTop: 12, fontSize: 11, color: tk.muted }}>
          Feature schema version: <span style={{ fontFamily: "monospace", color: tk.navy }}>{model.featureSchemaVersion}</span>
        </div>
      )}
    </div>
  );
}

// ── small primitives ─────────────────────────────────────────────
const td = { padding: "12px 14px", color: tk.navy };
const inputStyle = {
  padding: "8px 12px", border: `1.5px solid ${tk.creamBorder}`, borderRadius: 8,
  fontSize: 12, color: tk.navy, background: tk.creamInput, outline: "none",
  fontFamily: "'Georgia', serif",
};
const sectionTitle = { margin: "0 0 12px", fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: tk.muted };

const Header = ({ title, subtitle, onReload, children }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
    <div>
      <div style={{ fontSize: 18, color: tk.navy, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 12, color: tk.muted, marginTop: 4 }}>{subtitle}</div>
    </div>
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      {children}
      <button onClick={onReload} style={{
        padding: "8px 16px", fontSize: 12, background: tk.navy, color: tk.goldLight,
        border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "'Georgia', serif",
      }}>↻ Refresh</button>
    </div>
  </div>
);
const ErrorBanner = ({ msg }) => (
  <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 8, fontSize: 13,
                background: tk.redBg, color: tk.red, border: `1px solid ${tk.redBorder}` }}>
    {msg}
  </div>
);
const Empty = ({ msg, icon = "—" }) => (
  <div style={{ padding: 60, textAlign: "center", color: tk.muted, background: "#fff", border: `1px solid ${tk.creamBorder}`, borderRadius: 8 }}>
    <div style={{ fontSize: 32, marginBottom: 8, color: tk.creamBorder }}>{icon}</div>
    <div style={{ fontSize: 13 }}>{msg}</div>
  </div>
);
const KV = ({ label, value, mono }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${tk.creamBorder}`, fontSize: 12 }}>
    <span style={{ color: tk.muted }}>{label}</span>
    <span style={{ color: tk.navy, fontFamily: mono ? "monospace" : "inherit" }}>{String(value)}</span>
  </div>
);
const ModelCard = ({ title, m }) => (
  <div style={{ background: "#fff", border: `1px solid ${tk.creamBorder}`, borderRadius: 8, padding: 20 }}>
    <h3 style={sectionTitle}>{title}</h3>
    {m ? (
      <>
        <KV label="Version" value={m.version || "—"} />
        {typeof m.precision === "number" && <KV label="Precision" value={m.precision.toFixed(3)} />}
        {typeof m.recall    === "number" && <KV label="Recall"    value={m.recall.toFixed(3)} />}
        {typeof m.f1        === "number" && <KV label="F1"        value={m.f1.toFixed(3)} />}
        {typeof m.roc_auc   === "number" && <KV label="ROC AUC"   value={m.roc_auc.toFixed(3)} />}
        {m.trainedAt && <KV label="Trained at" value={fmtDate(m.trainedAt)} />}
      </>
    ) : <div style={{ fontSize: 12, color: tk.muted }}>No metadata available.</div>}
  </div>
);

// ── default export ───────────────────────────────────────────────
export default function FraudPage({ view = "notifications" }) {
  if (view === "transactions") return <TransactionsView />;
  if (view === "stats")        return <StatsView />;
  return <NotificationsView />;
}
