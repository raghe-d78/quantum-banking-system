// customer_frontend/src/pages/TransactionDetail.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../lib/api";

// Theme colors are now in App.css as CSS variables and utility classes

// ─── Backend → view model ─────────────────────────────────────────
// GET /transactions/:id returns the ledger row for the caller's own account:
// { id, transactionId, accountId, type: CREDIT|DEBIT, txType, amount,
//   balanceSnapshot, reference, compensates, createdAt, initiatedBy }
const TX_TYPE_LABEL = { DEPOSIT:"Deposit", WITHDRAW:"Withdrawal", TRANSFER:"Transfer", BILL_PAYMENT:"Bill payment", MERCHANT_PAYMENT:"Purchase", CANCELLATION:"Reversal" };
const toViewModel = (t) => {
  const created = new Date(t.createdAt);
  const type = String(t.type).toLowerCase() === "credit" ? "credit" : "debit";
  const kind = TX_TYPE_LABEL[t.txType] ?? t.txType ?? "Transaction";
  return {
    id: t.id,
    transactionId: t.transactionId,
    date: created.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }),
    time: created.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit", second:"2-digit" }),
    label: t.reference || kind,
    reference: t.transactionId,
    type,
    amount: Number(t.amount),
    balanceSnapshot: Number(t.balanceSnapshot),
    currency: "TND",
    status: t.txType === "CANCELLATION" ? "reversed" : "completed",
    category: kind,
    fromAccount: type === "debit" ? t.accountId : (t.reference || kind),
    toAccount:   type === "debit" ? (t.reference || kind) : t.accountId,
    note: t.reference || "",
    initiatedBy: t.initiatedBy,
    fee: 0,
  };
};

// ─── Helpers ─────────────────────────────────────────────────────
const fmt = (n) => Math.abs(n).toLocaleString("fr-TN", { minimumFractionDigits: 3 });

const STATUS_CFG = {
  completed: { label:"Completed", color:"var(--color-green)", bg:"var(--color-green-bg)", icon:"✓" },
  pending:   { label:"Pending",   color:"#d97706", bg:"rgba(217,119,6,0.10)",  icon:"◐" },
  failed:    { label:"Failed",    color:"var(--color-red)", bg:"var(--color-red-bg)",  icon:"✕" },
  reversed:  { label:"Reversal",  color:"#1d4ed8", bg:"rgba(29,78,216,0.08)", icon:"↺" },
};

const TYPE_CFG = {
  credit: { icon:"↓", iconBg:"var(--color-green-bg)", iconColor:"var(--color-green)", amountColor:"var(--color-green)", sign:"+" },
  debit:  { icon:"↑", iconBg:"var(--color-red-bg)",  iconColor:"var(--color-red)", amountColor:"var(--color-red)", sign:"−" },
};

// ─── Sub-components ───────────────────────────────────────────────
const InfoRow = ({ label, value, mono, highlight }) => (
  <div style={{
    display:"flex", justifyContent:"space-between", alignItems:"flex-start",
    padding:"14px 0", borderBottom:"1px solid var(--color-cream-border)",
  }}>
    <span style={{ fontSize:12, color:"var(--color-muted)", letterSpacing:0.3, flexShrink:0, minWidth:140 }}>
      {label}
    </span>
    <span style={{
      fontSize:13,
      color: highlight ? "var(--color-navy)" : "#333",
      fontWeight: highlight ? 600 : 400,
      fontFamily: mono ? "monospace" : "var(--font-main)",
      letterSpacing: mono ? 0.5 : 0,
      textAlign:"right",
      wordBreak:"break-all",
    }}>
      {value}
    </span>
  </div>
);

const Section = ({ title, children }) => (
  <div style={{
    background:"#fff", borderRadius:14,
    padding:"22px 28px", marginBottom:16,
    boxShadow:"0 2px 12px rgba(0,0,0,0.05)",
    border:"1px solid var(--color-cream-border)",
  }}>
    <div style={{
      fontSize:10, letterSpacing:2, textTransform:"uppercase",
      color:"var(--color-muted)", fontWeight:600, marginBottom:4,
    }}>
      {title}
    </div>
    {children}
  </div>
);

// ─── Main page ────────────────────────────────────────────────────
const TransactionDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tx, setTx]         = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get(`/transactions/${id}`);
        if (!data?.transaction) throw new Error("Transaction not found.");
        setTx(toViewModel(data.transaction));
      } catch (err) {
        setError(err.response?.data?.message ?? err.message ?? "Failed to load transaction.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // ── Loading ────────────────────────────────
  if (loading) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:360, gap:16, color:"var(--color-muted)" }}>
      <div style={{ width:34, height:34, border:"3px solid var(--color-cream-border)", borderTopColor:"var(--color-gold)", borderRadius:"50%", animation:"spin .8s linear infinite" }} />
      <span style={{ fontSize:13, letterSpacing:1 }}>Loading transaction…</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Error ──────────────────────────────────
  if (error) return (
    <div style={{ background:"#fff", borderRadius:16, padding:"48px 32px", textAlign:"center", border:"1px solid #fde8e8", maxWidth:420, margin:"0 auto" }}>
      <div style={{ fontSize:32, marginBottom:12 }}>⚠️</div>
      <div style={{ fontSize:14, color:"var(--color-red)", fontWeight:600, marginBottom:8 }}>{error}</div>
      <button onClick={() => navigate(-1)} style={{ fontSize:12, color:"var(--color-gold)", background:"none", border:"1px solid var(--color-gold)", borderRadius:8, padding:"8px 20px", cursor:"pointer", marginTop:8 }}>
        ← Go back
      </button>
    </div>
  );

  const typeCfg   = TYPE_CFG[tx.type]   ?? TYPE_CFG.debit;
  const statusCfg = STATUS_CFG[tx.status] ?? STATUS_CFG.completed;

  return (
    <div style={{ fontFamily:"var(--font-main)", maxWidth:680, margin:"0 auto" }}>

      {/* ── Back button ── */}
      <button
        onClick={() => navigate(-1)}
        style={{ display:"flex", alignItems:"center", gap:8, background:"none", border:"none", color:"var(--color-muted)", fontSize:12, cursor:"pointer", marginBottom:24, padding:0, letterSpacing:0.3 }}
      >
        ← Back to history
      </button>

      {/* ── Hero card ── */}
      <div style={{
        background:`linear-gradient(135deg, var(--color-navy) 0%, var(--color-navy-mid) 100%)`,
        borderRadius:20, padding:"36px 36px 32px",
        marginBottom:16, boxShadow:"0 8px 32px rgba(10,22,40,0.20)",
        position:"relative", overflow:"hidden",
      }}>
        {/* Decorative circle */}
        <div style={{ position:"absolute", top:-40, right:-40, width:180, height:180, borderRadius:"50%", background:"rgba(255,255,255,0.03)" }} />
        <div style={{ position:"absolute", bottom:-60, right:40, width:120, height:120, borderRadius:"50%", background:"rgba(201,168,76,0.06)" }} />

        <div style={{ position:"relative", zIndex:1 }}>

          {/* Icon + status */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:28 }}>
            <div style={{ width:52, height:52, borderRadius:"50%", background:typeCfg.iconBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, color:typeCfg.iconColor }}>
              {typeCfg.icon}
            </div>
            <span style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"5px 14px", borderRadius:20, background:statusCfg.bg, color:statusCfg.color, fontSize:11, fontWeight:600, letterSpacing:0.8, textTransform:"uppercase" }}>
              <span>{statusCfg.icon}</span>
              {statusCfg.label}
            </span>
          </div>

          {/* Label */}
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", letterSpacing:1.5, textTransform:"uppercase", marginBottom:6 }}>
            {tx.category}
          </div>
          <div style={{ fontSize:20, color:"#fff", fontWeight:400, marginBottom:24, letterSpacing:0.3 }}>
            {tx.label}
          </div>

          {/* Amount */}
          <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
            <span style={{ fontSize:42, fontWeight:300, color:typeCfg.amountColor, letterSpacing:-1 }}>
              {typeCfg.sign}{fmt(tx.amount)}
            </span>
            <span style={{ fontSize:14, color:"rgba(255,255,255,0.4)", letterSpacing:1 }}>
              {tx.currency}
            </span>
          </div>

          {/* Date + time */}
          <div style={{ marginTop:16, fontSize:12, color:"rgba(255,255,255,0.35)", letterSpacing:0.5 }}>
            {tx.date} {tx.time !== "00:00:00" ? `· ${tx.time}` : ""}
          </div>
        </div>
      </div>

      {/* ── Transaction details ── */}
      <Section title="Transaction Details">
        <InfoRow label="Reference"      value={tx.reference}  mono highlight />
        <InfoRow label="Date"           value={tx.date} />
        <InfoRow label="Time"           value={tx.time !== "00:00:00" ? tx.time : "—"} />
        <InfoRow label="Type"           value={tx.type.charAt(0).toUpperCase() + tx.type.slice(1)} />
        <InfoRow label="Category"       value={tx.category} />
        <InfoRow label="Status"         value={statusCfg.label} />
        {tx.fee > 0 && (
          <InfoRow label="Transaction Fee" value={`${fmt(tx.fee)} ${tx.currency}`} />
        )}
        {tx.note && (
          <InfoRow label="Note" value={tx.note} />
        )}
      </Section>

      {/* ── Account info ── */}
      <Section title="Account Information">
        <InfoRow label="From" value={tx.fromAccount} mono={tx.fromAccount?.startsWith("TN")} />
        <InfoRow label="To"   value={tx.toAccount}   mono={tx.toAccount?.startsWith("TN")}  />
      </Section>

      {/* ── Actions ── */}
      <div style={{ display:"flex", gap:12, marginTop:4 }}>
        <button
          onClick={() => window.print()}
          style={{
            flex:1, padding:"13px", borderRadius:12,
            border:"1.5px solid var(--color-cream-border)",
            background:"#fff", color:"var(--color-navy)",
            fontSize:12, fontFamily:"var(--font-main)",
            cursor:"pointer", letterSpacing:0.5,
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
          }}
        >
          ⊟ Print Receipt
        </button>
        <button
          onClick={() => {
            const text = `Transaction: ${tx.label}\nRef: ${tx.reference}\nAmount: ${typeCfg.sign}${fmt(tx.amount)} ${tx.currency}\nDate: ${tx.date}\nStatus: ${statusCfg.label}`;
            navigator.clipboard?.writeText(text);
          }}
          style={{
            flex:1, padding:"13px", borderRadius:12,
            border:"1.5px solid var(--color-cream-border)",
            background:"#fff", color:"var(--color-navy)",
            fontSize:12, fontFamily:"var(--font-main)",
            cursor:"pointer", letterSpacing:0.5,
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
          }}
        >
          ⊞ Copy Details
        </button>
      </div>

    </div>
  );
};

export default TransactionDetail;