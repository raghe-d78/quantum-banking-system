// src/pages/CreateTransaction.jsx
import { useState } from "react";
import api from "../lib/api";

// ── Transaction type config ───────────────────────────────────────────────
const TYPES = [
  {
    key: "transfer",
    icon: "⇄",
    label: "Transfer",
    description: "Send to another account",
    color: "#1a3a6b",
    accent: "#4a7fc1",
  },
  {
    key: "payment",
    icon: "◈",
    label: "Payment",
    description: "Pay a bill or service",
    color: "#1a4a2e",
    accent: "#4a9c6e",
  },
  {
    key: "purchase",
    icon: "▭",
    label: "Purchase",
    description: "Merchant / online purchase",
    color: "#4a1a2e",
    accent: "#9c4a6e",
  },
  {
    key: "deposit",
    icon: "↓",
    label: "Deposit",
    description: "Add funds to your account",
    color: "#1a3a1a",
    accent: "#5a9c3a",
  },
  {
    key: "withdrawal",
    icon: "↑",
    label: "Withdrawal",
    description: "Withdraw cash",
    color: "#3a1a0a",
    accent: "#c9a84c",
  },
];

// ── Field definitions per type ────────────────────────────────────────────
const FIELDS = {
  transfer: [
    { name: "recipientIban",  label: "Recipient IBAN",    type: "text",   placeholder: "TN59 XXXX XXXX XXXX XXXX XXXX" },
    { name: "recipientName",  label: "Recipient Name",    type: "text",   placeholder: "Full name" },
    { name: "amount",         label: "Amount (TND)",      type: "number", placeholder: "0.000" },
    { name: "description",    label: "Description",       type: "text",   placeholder: "Optional note" },
  ],
  payment: [
    { name: "billerCode",     label: "Biller Code",       type: "text",   placeholder: "e.g. STEG-001" },
    { name: "billerName",     label: "Biller Name",       type: "text",   placeholder: "e.g. STEG, Topnet…" },
    { name: "referenceNumber",label: "Reference Number",  type: "text",   placeholder: "Invoice / contract ref." },
    { name: "amount",         label: "Amount (TND)",      type: "number", placeholder: "0.000" },
  ],
  purchase: [
    { name: "merchantName",   label: "Merchant Name",     type: "text",   placeholder: "e.g. Carrefour" },
    { name: "merchantId",     label: "Merchant ID",       type: "text",   placeholder: "Optional" },
    { name: "amount",         label: "Amount (TND)",      type: "number", placeholder: "0.000" },
    { name: "description",    label: "Description",       type: "text",   placeholder: "Purchase details" },
  ],
  deposit: [
    { name: "sourceType",     label: "Source",            type: "select",
      options: [{ v: "cash", l: "Cash" }, { v: "cheque", l: "Cheque" }, { v: "transfer", l: "Bank Transfer" }] },
    { name: "amount",         label: "Amount (TND)",      type: "number", placeholder: "0.000" },
    { name: "reference",      label: "Reference",         type: "text",   placeholder: "Cheque no. / ref." },
    { name: "description",    label: "Note",              type: "text",   placeholder: "Optional" },
  ],
  withdrawal: [
    { name: "withdrawalType", label: "Method",            type: "select",
      options: [{ v: "atm", l: "ATM" }, { v: "counter", l: "Counter" }] },
    { name: "amount",         label: "Amount (TND)",      type: "number", placeholder: "0.000" },
    { name: "description",    label: "Note",              type: "text",   placeholder: "Optional" },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────
const fmt = (n) =>
  Number(n).toLocaleString("fr-TN", { minimumFractionDigits: 3 });

const emptyForm = () => ({
  recipientIban: "", recipientName: "", amount: "",
  description: "", billerCode: "", billerName: "",
  referenceNumber: "", merchantName: "", merchantId: "",
  sourceType: "cash", reference: "", withdrawalType: "atm",
  merchantId2: "",
});

// ── Component ─────────────────────────────────────────────────────────────
const CreateTransaction = () => {
  const [selectedType, setSelectedType] = useState(null);
  const [formData, setFormData]         = useState(emptyForm());
  const [step, setStep]                 = useState("select"); // "select" | "form" | "confirm" | "success" | "error"
  const [loading, setLoading]           = useState(false);
  const [apiError, setApiError]         = useState(null);
  const [txResult, setTxResult]         = useState(null);

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const selectType = (type) => {
    setSelectedType(type);
    setFormData(emptyForm());
    setApiError(null);
    setStep("form");
  };

  const goConfirm = () => {
    if (!formData.amount || Number(formData.amount) <= 0) {
      setApiError("Please enter a valid amount.");
      return;
    }
    setApiError(null);
    setStep("confirm");
  };

  const handleSubmit = async () => {
    setLoading(true);
    setApiError(null);
    try {
      const payload = {
        type: selectedType.key,
        ...formData,
        amount: parseFloat(formData.amount),
      };
      const { data } = await api.post("/transactions", payload);
      setTxResult(data);
      setStep("success");
    } catch (err) {
      setApiError(
        err.response?.data?.message ?? err.message ?? "Transaction failed. Please try again."
      );
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setSelectedType(null);
    setFormData(emptyForm());
    setApiError(null);
    setTxResult(null);
    setStep("select");
  };

  const type = selectedType;
  const fields = type ? FIELDS[type.key] : [];

  // ── Summary rows for confirm screen ────────────────────────────────────
  const summaryRows = () => {
    if (!type) return [];
    return fields
      .filter((f) => formData[f.name])
      .map((f) => {
        let val = formData[f.name];
        if (f.type === "select") {
          val = f.options?.find((o) => o.v === val)?.l ?? val;
        }
        if (f.name === "amount") val = `${fmt(val)} TND`;
        return [f.label, val];
      });
  };

  // ── Shared styles ──────────────────────────────────────────────────────
  const inputStyle = {
    padding: "11px 14px", border: "1.5px solid #e8e2d8", borderRadius: 8,
    fontSize: 13, color: "#0a1628", background: "#faf8f5", outline: "none",
    fontFamily: "inherit", width: "100%", boxSizing: "border-box",
    transition: "border-color 0.2s",
  };
  const labelStyle = {
    fontSize: 11, color: "#888", letterSpacing: 1,
    textTransform: "uppercase", fontWeight: 600,
  };
  const primaryBtn = (bg = "#0a1628", color = "#e8d48b") => ({
    padding: "12px 28px", border: "none", borderRadius: 8,
    background: bg, color, cursor: "pointer", fontSize: 13,
    fontFamily: "inherit", fontWeight: 600, letterSpacing: 0.5,
    transition: "opacity 0.2s", opacity: loading ? 0.6 : 1,
  });
  const ghostBtn = {
    padding: "12px 24px", border: "1.5px solid #e8e2d8", borderRadius: 8,
    background: "transparent", color: "#666", cursor: "pointer",
    fontFamily: "inherit", fontSize: 13,
  };

  return (
    <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", maxWidth: 820, margin: "0 auto" }}>

      {/* ── STEP: SELECT TYPE ── */}
      {step === "select" && (
        <>
          <div style={{ marginBottom: 28 }}>
            <p style={{ color: "#aaa", fontSize: 13, margin: 0 }}>
              Choose the type of transaction you want to perform.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
            {TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => selectType(t)}
                style={{
                  background: "#fff",
                  border: "1.5px solid #e8e2d8",
                  borderRadius: 16,
                  padding: "28px 24px",
                  cursor: "pointer",
                  textAlign: "left",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                  transition: "all 0.2s",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#c9a84c";
                  e.currentTarget.style.boxShadow = "0 6px 24px rgba(201,168,76,0.15)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#e8e2d8";
                  e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.04)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 12, marginBottom: 16,
                  background: `linear-gradient(135deg, ${t.color}, ${t.accent})`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, color: "#fff",
                }}>
                  {t.icon}
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#0a1628", marginBottom: 4 }}>
                  {t.label}
                </div>
                <div style={{ fontSize: 12, color: "#aaa" }}>{t.description}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── STEP: FORM ── */}
      {step === "form" && type && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 36, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #e8e2d8" }}>
          {/* Type badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid #f0ebe2" }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: `linear-gradient(135deg, ${type.color}, ${type.accent})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, color: "#fff", flexShrink: 0,
            }}>
              {type.icon}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#0a1628" }}>{type.label}</div>
              <div style={{ fontSize: 12, color: "#aaa" }}>{type.description}</div>
            </div>
          </div>

          {/* Fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
            {fields.map((field) => (
              <div
                key={field.name}
                style={{ display: "flex", flexDirection: "column", gap: 6,
                  gridColumn: field.name === "description" || field.name === "recipientIban" ? "1/-1" : "auto"
                }}
              >
                <label style={labelStyle}>{field.label}</label>
                {field.type === "select" ? (
                  <select
                    name={field.name}
                    value={formData[field.name]}
                    onChange={handleChange}
                    style={inputStyle}
                  >
                    {field.options.map((o) => (
                      <option key={o.v} value={o.v}>{o.l}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type}
                    name={field.name}
                    value={formData[field.name]}
                    onChange={handleChange}
                    placeholder={field.placeholder}
                    style={inputStyle}
                    min={field.type === "number" ? "0" : undefined}
                    step={field.type === "number" ? "0.001" : undefined}
                  />
                )}
              </div>
            ))}
          </div>

          {apiError && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#dc2626" }}>
              {apiError}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button style={ghostBtn} onClick={reset}>← Back</button>
            <button style={primaryBtn()} onClick={goConfirm}>
              Review Transaction →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: CONFIRM ── */}
      {step === "confirm" && type && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 36, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #e8e2d8" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%", margin: "0 auto 16px",
              background: `linear-gradient(135deg, ${type.color}, ${type.accent})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, color: "#fff",
            }}>
              {type.icon}
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#0a1628", marginBottom: 4 }}>
              Confirm {type.label}
            </div>
            <div style={{ fontSize: 12, color: "#aaa" }}>Please review the details before confirming</div>
          </div>

          {/* Summary */}
          <div style={{ background: "#faf8f5", borderRadius: 12, padding: 24, marginBottom: 28 }}>
            {summaryRows().map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #ede8df" }}>
                <span style={{ fontSize: 12, color: "#888", letterSpacing: 0.5 }}>{k}</span>
                <span style={{ fontSize: 13, color: "#0a1628", fontWeight: 600, maxWidth: "60%", textAlign: "right" }}>{v}</span>
              </div>
            ))}
            {/* Highlight amount */}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0 0" }}>
              <span style={{ fontSize: 13, color: "#0a1628", fontWeight: 700, letterSpacing: 0.5 }}>Total Amount</span>
              <span style={{ fontSize: 18, color: "#0a1628", fontWeight: 700 }}>
                {fmt(formData.amount)} <span style={{ fontSize: 12, color: "#aaa" }}>TND</span>
              </span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <button style={ghostBtn} onClick={() => setStep("form")}>← Edit</button>
            <button
              style={{ ...primaryBtn("linear-gradient(135deg, #c9a84c, #e8d48b)", "#0a1628"), flex: 1, maxWidth: 260 }}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "Processing…" : `✦ Confirm ${type.label}`}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: SUCCESS ── */}
      {step === "success" && (
        <div style={{ background: "#fff", borderRadius: 16, padding: "56px 36px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #e8e2d8", textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%", margin: "0 auto 20px",
            background: "linear-gradient(135deg, #1a4a2e, #4a9c6e)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, color: "#fff",
          }}>✓</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#0a1628", marginBottom: 8 }}>
            Transaction Successful
          </div>
          <div style={{ fontSize: 13, color: "#aaa", marginBottom: 32 }}>
            Your {type?.label?.toLowerCase()} of{" "}
            <strong style={{ color: "#0a1628" }}>{fmt(formData.amount)} TND</strong>{" "}
            has been processed.
          </div>
          {txResult?.transactionId && (
            <div style={{ background: "#faf8f5", borderRadius: 8, padding: "10px 20px", display: "inline-block", marginBottom: 32, fontSize: 12, color: "#888" }}>
              Reference: <strong style={{ color: "#0a1628" }}>{txResult.transactionId}</strong>
            </div>
          )}
          <div>
            <button style={primaryBtn()} onClick={reset}>
              + New Transaction
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: ERROR ── */}
      {step === "error" && (
        <div style={{ background: "#fff", borderRadius: 16, padding: "56px 36px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #fde8e8", textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%", margin: "0 auto 20px",
            background: "linear-gradient(135deg, #7f1d1d, #dc2626)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, color: "#fff",
          }}>⚠</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#0a1628", marginBottom: 8 }}>
            Transaction Failed
          </div>
          <div style={{ fontSize: 13, color: "#dc2626", marginBottom: 32 }}>{apiError}</div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button style={ghostBtn} onClick={() => setStep("confirm")}>← Try Again</button>
            <button style={primaryBtn()} onClick={reset}>Start Over</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateTransaction;