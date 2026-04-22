// src/pages/BalancePage.jsx
import { useState, useEffect } from "react";
import api from "../lib/api";

const BalancePage = () => {
  const [accountData, setAccountData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get("/balance");
      setAccountData(data);
    } catch (err) {
      setError(
        err.response?.data?.message ?? err.message ?? "Failed to load account data."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const fmt = (n) => Math.abs(n).toLocaleString("fr-TN", { minimumFractionDigits: 3 });

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 320, gap: 16, color: "var(--color-muted)" }}>
      <div style={{ width: 36, height: 36, border: "3px solid var(--color-cream-border)", borderTopColor: "var(--color-gold)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <span style={{ fontSize: 13, letterSpacing: 1 }}>Loading account data…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ background: "#fff", borderRadius: 16, padding: "40px 32px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #fde8e8", textAlign: "center", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>⚠️</div>
      <div style={{ fontSize: 14, color: "var(--color-red)", fontWeight: 600, marginBottom: 8 }}>Unable to load account data</div>
      <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 24 }}>{error}</div>
      <button onClick={load} style={{ fontSize: 12, color: "var(--color-gold)", background: "none", border: "1px solid var(--color-gold)", borderRadius: 8, padding: "8px 20px", cursor: "pointer" }}>
        Retry
      </button>
    </div>
  );

  return (
    <div style={{ fontFamily: "var(--font-main)", maxWidth: 820, margin: "0 auto" }}>

      {/* Balance Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 32 }}>
        {[
          { label: "Total Balance",     value: accountData.cached_balance,   highlight: true  },
          { label: "Available Balance", value: accountData.available, highlight: false },
          { label: "Pending",           value: accountData.pending,   highlight: false },
        ].map((card) => (
          <div key={card.label} style={{
            background: card.highlight ? "linear-gradient(135deg, var(--color-navy) 0%, var(--color-navy-mid) 100%)" : "#fff",
            borderRadius: 16, padding: "28px 24px",
            boxShadow: card.highlight ? "0 8px 32px rgba(10,22,40,0.25)" : "0 2px 12px rgba(0,0,0,0.06)",
            border: card.highlight ? "none" : "1px solid var(--color-cream-border)",
          }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12, color: card.highlight ? "rgba(232,212,139,0.7)" : "var(--color-muted)", fontWeight: 600 }}>{card.label}</div>
            <div style={{ fontSize: 26, fontWeight: 400, color: card.highlight ? "var(--color-gold-light)" : "var(--color-navy)" }}>{fmt(card.value)}</div>
            <div style={{ fontSize: 11, color: card.highlight ? "rgba(255,255,255,0.35)" : "#ccc", marginTop: 6, letterSpacing: 1 }}>{accountData.currency}</div>
          </div>
        ))}
      </div>

      {/* Account Info */}
      <div style={{ background: "#fff", borderRadius: 16, padding: "24px 28px", marginBottom: 28, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid var(--color-cream-border)" }}>
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--color-muted)", fontWeight: 600, marginBottom: 16 }}>Account Details</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            ["Account Holder", accountData.owner],
            ["Account Type",   accountData.accountType],
            ["IBAN",           accountData.accountNumber],
            ["Currency",       accountData.currency],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--color-muted)", letterSpacing: 0.8, textTransform: "uppercase" }}>{k}</span>
              <span style={{ fontSize: 13, color: "var(--color-navy)", fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      
      
    </div>
  );
};

export default BalancePage;