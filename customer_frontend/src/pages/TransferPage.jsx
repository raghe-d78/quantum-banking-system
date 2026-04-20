// customer_frontend/src/pages/TransferPage.jsx
import { useState } from "react";
import api from "../lib/api";

const tk = {
  navy: "#0a1628", navyMid: "#1a3a6b", gold: "#c9a84c", goldLight: "#e8d48b",
  cream: "#f5f3ef", creamBorder: "#e8e2d8", creamInput: "#faf8f5", muted: "#aaa",
  green: "#16a34a", greenBg: "rgba(34,197,94,0.08)", greenBorder: "rgba(34,197,94,0.22)",
  red: "#dc2626", redBg: "rgba(239,68,68,0.07)", redBorder: "rgba(239,68,68,0.22)",
  blue: "#1d4ed8", blueBg: "rgba(29,78,216,0.06)", blueBorder: "rgba(29,78,216,0.2)",
};

const inputStyle = {
  padding: "12px 16px", border: `1.5px solid ${tk.creamBorder}`, borderRadius: 10,
  fontSize: 13, color: tk.navy, background: tk.creamInput, outline: "none",
  fontFamily: "'Georgia', serif", width: "100%", boxSizing: "border-box",
  transition: "border-color 0.2s",
};
const labelStyle = {
  fontSize: 11, color: tk.muted, letterSpacing: 1,
  textTransform: "uppercase", fontWeight: 600, marginBottom: 6, display: "block",
};
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ── Steps ─────────────────────────────────────────────────────────
const Step = ({ num, label, status, detail, isLast }) => {
  const S = {
    idle:    { bg: tk.cream,    border: tk.creamBorder, color: tk.muted,  icon: String(num), line: tk.creamBorder },
    loading: { bg: "#fdf8ed",   border: tk.gold,        color: tk.gold,   icon: "spin",      line: tk.creamBorder },
    success: { bg: tk.greenBg,  border: tk.greenBorder, color: tk.green,  icon: "✓",         line: tk.green       },
    error:   { bg: tk.redBg,    border: tk.redBorder,   color: tk.red,    icon: "✕",         line: tk.creamBorder },
  }[status] || {};
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: S.bg, border: `2px solid ${S.border}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.3s" }}>
          {S.icon === "spin"
            ? <span style={{ width: 11, height: 11, border: `2px solid ${tk.gold}33`, borderTopColor: tk.gold, borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
            : <span style={{ fontSize: 11, color: S.color, fontWeight: 700 }}>{S.icon}</span>}
        </div>
        {!isLast && <div style={{ width: 2, flex: 1, minHeight: 14, background: S.line, transition: "background 0.4s", marginTop: 2 }} />}
      </div>
      <div style={{ paddingBottom: isLast ? 0 : 14, flex: 1, paddingTop: 4 }}>
        <div style={{ fontSize: 12, color: status === "idle" ? tk.muted : S.color, fontWeight: status !== "idle" ? 600 : 400, marginBottom: detail ? 5 : 0, transition: "color 0.3s" }}>{label}</div>
        {detail && (
          <div style={{ fontSize: 11, color: S.color, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 7, padding: "7px 10px", lineHeight: 1.5, animation: "fadeIn 0.3s ease", wordBreak: "break-all" }}>
            {detail}
          </div>
        )}
      </div>
    </div>
  );
};

const STEP_LABELS = ["Verify recipient account", "Validate balance", "Execute transfer", "Confirmation"];
const initSteps = () => STEP_LABELS.map(l => ({ label: l, status: "idle", detail: null }));

// ── SuccessCard ───────────────────────────────────────────────────
const SuccessCard = ({ amount, recipient, reference, onReset }) => (
  <div style={{ background: "#fff", borderRadius: 16, padding: "36px 32px", border: `1px solid ${tk.greenBorder}`, boxShadow: "0 4px 20px rgba(22,163,74,0.08)", animation: "fadeIn 0.4s ease", textAlign: "center" }}>
    <div style={{ width: 64, height: 64, borderRadius: "50%", margin: "0 auto 20px", background: tk.greenBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: tk.green }}>⇄</div>
    <div style={{ fontSize: 17, color: tk.navy, fontWeight: 600, marginBottom: 4 }}>Transfer Successful</div>
    <div style={{ fontSize: 30, fontWeight: 300, color: tk.green, margin: "12px 0 4px" }}>
      −{parseFloat(amount).toLocaleString("fr-TN", { minimumFractionDigits: 3 })}
    </div>
    <div style={{ fontSize: 11, color: tk.muted, letterSpacing: 1, marginBottom: 24 }}>TND</div>
    <div style={{ background: tk.cream, borderRadius: 10, padding: "16px 18px", textAlign: "left", marginBottom: 20 }}>
      {[["Recipient", recipient], ["Reference", reference], ["Status", "Completed"]].map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${tk.creamBorder}` }}>
          <span style={{ fontSize: 10, color: tk.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>{k}</span>
          <span style={{ fontSize: 12, color: k === "Status" ? tk.green : tk.navy, fontWeight: 600 }}>{v}</span>
        </div>
      ))}
    </div>
    <button onClick={onReset} style={{ width: "100%", padding: "12px", background: `linear-gradient(135deg, ${tk.navy}, ${tk.navyMid})`, color: tk.goldLight, border: "none", borderRadius: 9, fontSize: 13, fontFamily: "'Georgia', serif", fontWeight: 600, cursor: "pointer" }}>
      New Transfer
    </button>
  </div>
);

// ── TransferPage ──────────────────────────────────────────────────
const TransferPage = () => {
  const [form, setForm] = useState({
    recipientIban: "", recipientName: "", amount: "", note: "",
    transferType: "instant",
  });
  const [steps,       setSteps]       = useState(initSteps());
  const [flowVisible, setFlowVisible] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [result,      setResult]      = useState(null);
  const [error,       setError]       = useState(null);
  const [verified,    setVerified]    = useState(false);
  const [verifying,   setVerifying]   = useState(false);

  const setStep = (i, patch) => setSteps(p => p.map((s, idx) => idx === i ? { ...s, ...patch } : s));

  const handleVerify = async () => {
    if (!form.recipientIban) return;
    setVerifying(true);
    try {
      const { data } = await api.get(`/accounts/lookup?iban=${form.recipientIban}`);
      setForm(f => ({ ...f, recipientName: data.name ?? data.username ?? "Account verified" }));
      setVerified(true);
    } catch {
      setVerified(false);
      setForm(f => ({ ...f, recipientName: "" }));
      setError("Recipient account not found.");
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!form.recipientIban) { setError("Recipient IBAN is required."); return; }
    const parsed = parseFloat(form.amount);
    if (!form.amount || isNaN(parsed) || parsed <= 0) { setError("Enter a valid amount."); return; }

    setLoading(true);
    setFlowVisible(true);
    setResult(null);
    setSteps(initSteps());

    // Step 0 — Verify recipient
    setStep(0, { status: "loading", detail: "Looking up recipient account…" });
    await delay(400);
    setStep(0, { status: "success", detail: `Recipient verified: ${form.recipientName || form.recipientIban}` });

    // Step 1 — Validate balance
    setStep(1, { status: "loading", detail: "Checking available balance…" });
    let ref;
    try {
      const { data } = await api.post("/transfer", {
        recipientIban: form.recipientIban,
        amount:        parsed.toFixed(4),
        transferType:  form.transferType,
        note:          form.note || null,
      });
      ref = data.reference ?? `TRF-${Date.now()}`;
      setStep(1, { status: "success", detail: "Balance sufficient" });
      setStep(2, { status: "success", detail: `Transfer executed · Ref: ${ref}` });
      setStep(3, { status: "success", detail: "Confirmed. Funds sent successfully." });
      setResult({ amount: form.amount, recipient: form.recipientName || form.recipientIban, reference: ref });
      setForm({ recipientIban: "", recipientName: "", amount: "", note: "", transferType: "instant" });
      setVerified(false);
    } catch (err) {
      const msg = err.response?.data?.message ?? "Transfer failed.";
      if (msg.toLowerCase().includes("balance") || msg.toLowerCase().includes("funds")) {
        setStep(1, { status: "error", detail: `✕ ${msg}` });
        setStep(2, { status: "error", detail: "Transfer aborted — insufficient funds." });
        setStep(3, { status: "error", detail: "No funds transferred." });
      } else {
        setStep(1, { status: "success", detail: "Balance sufficient" });
        setStep(2, { status: "error", detail: `✕ ${msg}` });
        setStep(3, { status: "error", detail: "Transfer failed." });
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setSteps(initSteps()); setFlowVisible(false); setResult(null); setError(null); setVerified(false); setForm({ recipientIban: "", recipientName: "", amount: "", note: "", transferType: "instant" }); };

  return (
    <div style={{ fontFamily: "'Georgia', serif", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <div style={{ width: 4, height: 28, background: tk.blue, borderRadius: 2 }} />
          <h1 style={{ margin: 0, fontSize: 22, color: tk.navy, fontWeight: 400 }}>Transfer Funds</h1>
        </div>
        <p style={{ margin: "0 0 0 16px", color: tk.muted, fontSize: 13 }}>Send money to another account securely</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, alignItems: "start" }}>

        {/* Form or Success */}
        {!result ? (
          <div style={{ background: "#fff", borderRadius: 16, padding: 32, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: `1px solid ${tk.creamBorder}` }}>

            {/* Recipient IBAN */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Recipient IBAN</label>
              <div style={{ display: "flex", gap: 10 }}>
                <input style={{ ...inputStyle, flex: 1, borderColor: verified ? tk.green + "80" : tk.creamBorder }}
                  type="text" placeholder="TN59 1000 XXXX XXXX XXXX XXXX"
                  value={form.recipientIban}
                  onChange={e => { setForm(f => ({ ...f, recipientIban: e.target.value })); setVerified(false); setError(null); }}
                />
                <button onClick={handleVerify} disabled={!form.recipientIban || verifying} style={{
                  padding: "12px 18px", borderRadius: 10, border: `1.5px solid ${tk.creamBorder}`,
                  background: form.recipientIban ? tk.navy : tk.creamInput,
                  color: form.recipientIban ? tk.goldLight : tk.muted,
                  fontFamily: "'Georgia', serif", fontSize: 12, cursor: form.recipientIban ? "pointer" : "not-allowed",
                  letterSpacing: 0.5, transition: "all 0.2s", whiteSpace: "nowrap",
                }}>
                  {verifying ? "…" : "Verify ↵"}
                </button>
              </div>
              {verified && form.recipientName && (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: tk.greenBg, border: `1px solid ${tk.greenBorder}`, borderRadius: 8 }}>
                  <span style={{ color: tk.green }}>✓</span>
                  <span style={{ fontSize: 13, color: tk.navy, fontWeight: 600 }}>{form.recipientName}</span>
                  <span style={{ fontSize: 11, color: tk.muted, marginLeft: "auto" }}>Account verified</span>
                </div>
              )}
            </div>

            {/* Amount */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Amount (TND)</label>
              <div style={{ position: "relative" }}>
                <input style={{ ...inputStyle, paddingRight: 60, fontSize: 18 }}
                  type="number" min="0" step="0.001" placeholder="0.000"
                  value={form.amount}
                  onChange={e => { setForm(f => ({ ...f, amount: e.target.value })); setError(null); }}
                />
                <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: tk.muted, letterSpacing: 1, pointerEvents: "none" }}>TND</span>
              </div>
            </div>

            {/* Transfer type */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Transfer Type</label>
              <div style={{ display: "flex", gap: 10 }}>
                {[
                  { value: "instant",   label: "Instant",   desc: "Processed immediately" },
                  { value: "standard",  label: "Standard",  desc: "1–2 business days" },
                ].map(t => (
                  <button key={t.value} type="button" onClick={() => setForm(f => ({ ...f, transferType: t.value }))} style={{
                    flex: 1, padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                    border: form.transferType === t.value ? `2px solid ${tk.blue}` : `1.5px solid ${tk.creamBorder}`,
                    background: form.transferType === t.value ? tk.blueBg : tk.creamInput,
                    textAlign: "left", fontFamily: "'Georgia', serif", transition: "all 0.15s",
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: form.transferType === t.value ? tk.blue : tk.navy }}>{t.label}</div>
                    <div style={{ fontSize: 10, color: tk.muted, marginTop: 2 }}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Note */}
            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Reference / Note (optional)</label>
              <input style={{ ...inputStyle, fontSize: 13 }} type="text" placeholder="e.g. Rent — April 2026" value={form.note} maxLength={80} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>

            {/* Info */}
            <div style={{ background: tk.blueBg, border: `1px solid ${tk.blueBorder}`, borderRadius: 10, padding: "12px 16px", display: "flex", gap: 10, marginBottom: 24 }}>
              <span style={{ color: tk.blue, fontSize: 14, flexShrink: 0 }}>⇄</span>
              <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6 }}>
                Instant transfers are processed within seconds. Standard transfers may take 1–2 business days. No fees for TND transfers within the same bank.
              </div>
            </div>

            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: tk.redBg, border: `1px solid ${tk.redBorder}`, borderRadius: 10, padding: "11px 14px", color: tk.red, fontSize: 12, marginBottom: 20 }}>
                <span>⚠</span><span>{error}</span>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={handleSubmit} disabled={loading || !form.amount || !form.recipientIban} style={{
                padding: "13px 36px", border: "none", borderRadius: 10,
                background: loading || !form.amount || !form.recipientIban ? "#e8e2d8" : `linear-gradient(135deg, ${tk.navy}, ${tk.navyMid})`,
                color: loading || !form.amount || !form.recipientIban ? tk.muted : tk.goldLight,
                cursor: loading || !form.amount || !form.recipientIban ? "not-allowed" : "pointer",
                fontSize: 13, fontFamily: "'Georgia', serif", fontWeight: 600, letterSpacing: 0.5,
                display: "flex", alignItems: "center", gap: 10, transition: "all 0.2s",
              }}>
                {loading
                  ? <><span style={{ width: 14, height: 14, border: "2px solid rgba(232,212,139,0.3)", borderTopColor: tk.goldLight, borderRadius: "50%", animation: "spin .7s linear infinite", display: "inline-block" }} />Processing…</>
                  : <><span>⇄</span> Confirm Transfer</>}
              </button>
            </div>
          </div>
        ) : (
          <SuccessCard amount={result.amount} recipient={result.recipient} reference={result.reference} onReset={reset} />
        )}

        {/* Flow Panel */}
        <div style={{ background: "#fff", borderRadius: 14, padding: "22px 20px", border: `1px solid ${tk.creamBorder}`, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: tk.muted, fontWeight: 600, marginBottom: 20 }}>Transfer Flow</div>
          {steps.map((s, i) => (
            <Step key={i} num={i + 1} label={s.label} status={s.status} detail={s.detail} isLast={i === steps.length - 1} />
          ))}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
};
export default TransferPage;