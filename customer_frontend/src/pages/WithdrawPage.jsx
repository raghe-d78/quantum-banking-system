// customer_frontend/src/pages/WithdrawPage.jsx
// Customer withdraws money from their own account
import { useState } from "react";
import api from "../lib/api";

const tk = {
  navy: "#0a1628", navyMid: "#1a3a6b", gold: "#c9a84c", goldLight: "#e8d48b",
  cream: "#f5f3ef", creamBorder: "#e8e2d8", creamInput: "#faf8f5", muted: "#aaa",
  red: "#dc2626", redBg: "rgba(239,68,68,0.07)", redBorder: "rgba(239,68,68,0.22)",
  orange: "#d97706", orangeBg: "rgba(217,119,6,0.08)", orangeBorder: "rgba(217,119,6,0.25)",
};

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];

const inputStyle = {
  padding:"12px 16px", border:`1.5px solid ${tk.creamBorder}`, borderRadius:10,
  fontSize:14, color:tk.navy, background:tk.creamInput, outline:"none",
  fontFamily:"'Georgia', serif", width:"100%", boxSizing:"border-box", transition:"border-color 0.2s",
};

const labelStyle = {
  fontSize:11, color:tk.muted, letterSpacing:1.2,
  textTransform:"uppercase", fontWeight:600, marginBottom:6, display:"block",
};

const SuccessModal = ({ amount, onClose }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(10,22,40,0.55)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:20 }}>
    <div style={{ background:"#fff", borderRadius:20, padding:"48px 40px", maxWidth:400, width:"100%", textAlign:"center", boxShadow:"0 24px 64px rgba(0,0,0,0.20)", animation:"slideUp 0.25s ease" }}>
      <style>{`@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
      <div style={{ width:72, height:72, borderRadius:"50%", margin:"0 auto 24px", background:tk.redBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:30, color:tk.red }}>↑</div>
      <div style={{ fontSize:13, color:tk.muted, letterSpacing:1, marginBottom:8, textTransform:"uppercase" }}>Withdrawal Successful</div>
      <div style={{ fontSize:34, fontWeight:300, color:tk.red, marginBottom:4 }}>
        −{parseFloat(amount).toLocaleString("fr-TN", { minimumFractionDigits:3 })}
      </div>
      <div style={{ fontSize:12, color:tk.muted, marginBottom:32, letterSpacing:1 }}>TND</div>
      <button onClick={onClose} style={{ width:"100%", padding:"14px", background:`linear-gradient(135deg, ${tk.navy}, ${tk.navyMid})`, color:tk.goldLight, border:"none", borderRadius:10, fontSize:13, fontFamily:"'Georgia', serif", fontWeight:600, cursor:"pointer" }}>
        Done
      </button>
    </div>
  </div>
);

const WithdrawPage = () => {
  const [amount,  setAmount]  = useState("");
  const [note,    setNote]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setError("Please enter a valid amount greater than 0.");
      return;
    }
    try {
      setLoading(true);
      await api.post("/customer/withdraw", {
        amount: parsed.toFixed(4),
        note:   note || null,
      });
      setSuccess(true);
    } catch (err) {
      // Handle insufficient funds specifically
      const msg = err.response?.data?.message ?? "Withdrawal failed. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSuccess(false);
    setAmount("");
    setNote("");
  };

  return (
    <div style={{ fontFamily:"'Georgia', serif", maxWidth:560, margin:"0 auto" }}>
      {success && <SuccessModal amount={amount} onClose={handleClose} />}

      {/* Header */}
      <div style={{ marginBottom:28 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:4 }}>
          <div style={{ width:4, height:28, background:tk.red, borderRadius:2 }} />
          <h1 style={{ margin:0, fontSize:22, color:tk.navy, fontWeight:400 }}>Withdraw Funds</h1>
        </div>
        <p style={{ margin:"0 0 0 16px", color:tk.muted, fontSize:13 }}>
          Withdraw money from your available balance
        </p>
      </div>

      {/* Card */}
      <div style={{ background:"#fff", borderRadius:16, padding:"32px", boxShadow:"0 2px 16px rgba(0,0,0,0.07)", border:`1px solid ${tk.creamBorder}` }}>

        {/* Quick amounts */}
        <div style={{ marginBottom:20 }}>
          <label style={labelStyle}>Quick Amount (TND)</label>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8 }}>
            {QUICK_AMOUNTS.map(v => (
              <button key={v} onClick={() => { setAmount(String(v)); setError(null); }} style={{
                padding:"10px 0", borderRadius:9,
                border: amount === String(v) ? `2px solid ${tk.red}` : `1.5px solid ${tk.creamBorder}`,
                background: amount === String(v) ? tk.redBg : tk.creamInput,
                color: amount === String(v) ? tk.red : "#555",
                fontFamily:"'Georgia', serif", fontSize:13,
                fontWeight: amount === String(v) ? 700 : 400,
                cursor:"pointer", transition:"all 0.15s",
              }}>{v}</button>
            ))}
          </div>
        </div>

        {/* Amount input */}
        <div style={{ marginBottom:20 }}>
          <label style={labelStyle}>Amount (TND)</label>
          <div style={{ position:"relative" }}>
            <input
              style={{ ...inputStyle, paddingRight:60, fontSize:18, borderColor: amount ? tk.red+"80" : tk.creamBorder }}
              type="number" min="0" step="0.001" placeholder="0.000"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(null); }}
            />
            <span style={{ position:"absolute", right:16, top:"50%", transform:"translateY(-50%)", fontSize:12, color:tk.muted, letterSpacing:1, pointerEvents:"none" }}>TND</span>
          </div>
        </div>

        {/* Note */}
        <div style={{ marginBottom:24 }}>
          <label style={labelStyle}>Note (optional)</label>
          <input style={{ ...inputStyle, fontSize:13 }} type="text"
            placeholder="e.g. Personal use" value={note} maxLength={80}
            onChange={(e) => setNote(e.target.value)} />
        </div>

        {/* Warning box */}
        <div style={{ background:tk.orangeBg, border:`1px solid ${tk.orangeBorder}`, borderRadius:10, padding:"12px 16px", display:"flex", gap:10, alignItems:"flex-start", marginBottom:24 }}>
          <span style={{ color:tk.orange, fontSize:14, marginTop:1, flexShrink:0 }}>⚠</span>
          <div style={{ fontSize:12, color:"#555", lineHeight:1.6 }}>
            Withdrawals are limited to your available balance. If your request exceeds your balance, it will be automatically declined.
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ display:"flex", alignItems:"center", gap:8, background:tk.redBg, border:`1px solid ${tk.redBorder}`, borderRadius:10, padding:"11px 14px", color:tk.red, fontSize:12, marginBottom:20 }}>
            <span>⚠</span><span>{error}</span>
          </div>
        )}

        {/* Submit */}
        <button onClick={handleSubmit} disabled={loading || !amount} style={{
          width:"100%", padding:"15px",
          background: loading || !amount ? "#e8e2d8" : `linear-gradient(135deg, ${tk.navy}, ${tk.navyMid})`,
          color: loading || !amount ? tk.muted : tk.goldLight,
          border:"none", borderRadius:12, fontSize:14, fontFamily:"'Georgia', serif",
          fontWeight:600, letterSpacing:0.5,
          cursor: loading || !amount ? "not-allowed" : "pointer",
          transition:"all 0.2s", display:"flex", alignItems:"center", justifyContent:"center", gap:10,
        }}>
          {loading ? (
            <><span style={{ width:14, height:14, border:"2px solid rgba(232,212,139,0.3)", borderTopColor:tk.goldLight, borderRadius:"50%", animation:"spin 0.7s linear infinite", display:"inline-block" }} />Processing…</>
          ) : <><span style={{ fontSize:16 }}>↑</span> Confirm Withdrawal</>}
        </button>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default WithdrawPage;