// customer_frontend/src/pages/TransactionDetail.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../lib/api";

// Theme colors are now in App.css as CSS variables and utility classes

// ─── Mock data (remove when backend is ready) ────────────────────
const MOCK_TRANSACTIONS = [
  { id:1,  date:"20 Mar 2026", time:"09:14:32", label:"Salary — STEG",               reference:"SAL-2026-03", type:"credit",  amount:3200.000, currency:"TND", status:"completed", category:"Income",      fromAccount:"STEG Payroll",                 toAccount:"TN59 1000 6035 1835 9847 8831", note:"Monthly salary — March 2026",        fee:0.000 },
  { id:2,  date:"19 Mar 2026", time:"14:22:10", label:"Carrefour Market",             reference:"POS-884421",  type:"debit",   amount:87.500,   currency:"TND", status:"completed", category:"Shopping",    fromAccount:"TN59 1000 6035 1835 9847 8831", toAccount:"Carrefour Market — Tunis",      note:"",                                   fee:0.000 },
  { id:3,  date:"18 Mar 2026", time:"00:00:00", label:"Netflix Subscription",         reference:"NET-0031",    type:"debit",   amount:29.990,   currency:"TND", status:"completed", category:"Subscription", fromAccount:"TN59 1000 6035 1835 9847 8831", toAccount:"Netflix International",         note:"Monthly plan — auto renewal",        fee:0.000 },
  { id:4,  date:"17 Mar 2026", time:"11:05:47", label:"Transfer — Sarra Ben Ali",     reference:"TRF-20093",   type:"credit",  amount:500.000,  currency:"TND", status:"completed", category:"Transfer",    fromAccount:"Sarra Ben Ali",                toAccount:"TN59 1000 6035 1835 9847 8831", note:"Shared expenses",                    fee:0.000 },
  { id:5,  date:"15 Mar 2026", time:"08:33:00", label:"Topnet Internet Bill",         reference:"BILL-9921",   type:"debit",   amount:59.000,   currency:"TND", status:"completed", category:"Bill",        fromAccount:"TN59 1000 6035 1835 9847 8831", toAccount:"Topnet",                        note:"Contract #TN-88421",                 fee:0.000 },
  { id:6,  date:"14 Mar 2026", time:"16:45:12", label:"ATM Withdrawal — Tunis",       reference:"ATM-00441",   type:"debit",   amount:200.000,  currency:"TND", status:"completed", category:"Withdrawal",  fromAccount:"TN59 1000 6035 1835 9847 8831", toAccount:"ATM — Avenue Habib Bourguiba",  note:"",                                   fee:1.000 },
  { id:7,  date:"12 Mar 2026", time:"18:02:55", label:"Freelance Payment — Aziz",     reference:"FRL-5512",    type:"credit",  amount:1800.000, currency:"TND", status:"completed", category:"Income",      fromAccount:"Aziz Khalil",                  toAccount:"TN59 1000 6035 1835 9847 8831", note:"Web project milestone #2",           fee:0.000 },
  { id:8,  date:"10 Mar 2026", time:"10:00:00", label:"Rent — Appartement Lac",       reference:"RENT-0301",   type:"debit",   amount:850.000,  currency:"TND", status:"completed", category:"Housing",     fromAccount:"TN59 1000 6035 1835 9847 8831", toAccount:"Propriétaire — Appartement Lac", note:"March 2026 rent",                   fee:0.000 },
  { id:9,  date:"09 Mar 2026", time:"07:15:00", label:"SONEDE Water Bill",            reference:"BILL-7743",   type:"debit",   amount:32.500,   currency:"TND", status:"completed", category:"Bill",        fromAccount:"TN59 1000 6035 1835 9847 8831", toAccount:"SONEDE",                        note:"Contract #SND-44219",                fee:0.000 },
  { id:10, date:"08 Mar 2026", time:"13:28:44", label:"Ooredoo Recharge",             reference:"RCH-2281",    type:"debit",   amount:20.000,   currency:"TND", status:"completed", category:"Telecom",     fromAccount:"TN59 1000 6035 1835 9847 8831", toAccount:"Ooredoo — +216 55 123 456",     note:"",                                   fee:0.000 },
];

// ─── Helpers ─────────────────────────────────────────────────────
const fmt = (n) => Math.abs(n).toLocaleString("fr-TN", { minimumFractionDigits: 3 });

const STATUS_CFG = {
  completed: { label:"Completed", color:"var(--color-green)", bg:"var(--color-green-bg)", icon:"✓" },
  pending:   { label:"Pending",   color:"#d97706", bg:"rgba(217,119,6,0.10)",  icon:"◐" },
  failed:    { label:"Failed",    color:"var(--color-red)", bg:"var(--color-red-bg)",  icon:"✕" },
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
        // TODO: replace mock with: const { data } = await api.get(`/transactions/${id}`);
        await new Promise((res) => setTimeout(res, 400));
        const found = MOCK_TRANSACTIONS.find((t) => String(t.id) === String(id));
        if (!found) throw new Error("Transaction not found.");
        setTx(found);
      } catch (err) {
        setError(err.message ?? "Failed to load transaction.");
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