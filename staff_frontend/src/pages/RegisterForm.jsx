import { useState } from "react";

const RegisterForm = () => {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    dob: "", nationalId: "", accountType: "checking",
    address: "", city: "", postalCode: "", country: "TN",
    initialDeposit: "", currency: "TND", employmentStatus: "employed",
    monthlyIncome: "", password: "", confirmPassword: "",
  });

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = () => {
    setSubmitted(true);
    setTimeout(() => { setSubmitted(false); setStep(1); }, 3000);
  };

  const totalSteps = 3;

  const inputStyle = {
    padding: "11px 14px", border: "1.5px solid #e8e2d8", borderRadius: 8,
    fontSize: 13, color: "#0a1628", background: "#faf8f5", outline: "none",
    fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  };

  const labelStyle = {
    fontSize: 11, color: "#888", letterSpacing: 1,
    textTransform: "uppercase", fontWeight: 600,
  };

  return (
    <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", background: "#f5f3ef", minHeight: "100vh", padding: "40px 20px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 4, height: 28, background: "#c9a84c", borderRadius: 2 }} />
            <h1 style={{ margin: 0, fontSize: 22, color: "#0a1628", fontWeight: 400, letterSpacing: 0.5 }}>
              New Account Registration
            </h1>
          </div>
          <p style={{ margin: "0 0 0 16px", color: "#888", fontSize: 13, letterSpacing: 0.3 }}>
            Complete all sections to open a new client account
          </p>
        </div>

        {/* Steps indicator */}
        <div style={{
          display: "flex", alignItems: "center", marginBottom: 36,
          background: "#fff", borderRadius: 12, padding: "20px 28px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)"
        }}>
          {["Personal Info", "Account Details", "Confirmation"].map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", flex: i < 2 ? 1 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                  background: step > i + 1 ? "#0a1628" : step === i + 1 ? "#c9a84c" : "#e8e2d8",
                  color: step > i + 1 ? "#e8d48b" : step === i + 1 ? "#0a1628" : "#aaa",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700,
                }}>
                  {step > i + 1 ? "✓" : i + 1}
                </div>
                <span style={{
                  fontSize: 12, whiteSpace: "nowrap",
                  color: step === i + 1 ? "#0a1628" : "#aaa",
                  fontWeight: step === i + 1 ? 600 : 400,
                }}>{s}</span>
              </div>
              {i < 2 && (
                <div style={{ flex: 1, height: 1, background: step > i + 1 ? "#c9a84c" : "#e8e2d8", margin: "0 16px" }} />
              )}
            </div>
          ))}
        </div>

        {/* Success State */}
        {submitted ? (
          <div style={{ background: "#fff", borderRadius: 16, padding: 48, textAlign: "center", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✦</div>
            <div style={{ fontSize: 18, color: "#0a1628", fontWeight: 600, marginBottom: 8 }}>Account Created Successfully</div>
            <div style={{ color: "#888", fontSize: 13 }}>Client file has been submitted for review.</div>
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 16, padding: 36, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>

            {/* STEP 1 — Personal Info */}
            {step === 1 && (
              <>
                <h3 style={{ margin: "0 0 24px", fontSize: 14, color: "#0a1628", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600, borderBottom: "1px solid #f0ebe2", paddingBottom: 12 }}>
                  Personal Information
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  {[
                    { label: "First Name",     name: "firstName",  type: "text",  placeholder: "Mohamed" },
                    { label: "Last Name",      name: "lastName",   type: "text",  placeholder: "Ben Ali" },
                    { label: "Email Address",  name: "email",      type: "email", placeholder: "client@email.com" },
                    { label: "Phone Number",   name: "phone",      type: "tel",   placeholder: "+216 XX XXX XXX" },
                    { label: "Date of Birth",  name: "dob",        type: "date" },
                    { label: "National ID / CIN", name: "nationalId", type: "text", placeholder: "XXXXXXXX" },
                  ].map(field => (
                    <div key={field.name} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={labelStyle}>{field.label}</label>
                      <input
                        type={field.type} name={field.name}
                        value={formData[field.name]} onChange={handleChange}
                        placeholder={field.placeholder} style={inputStyle}
                      />
                    </div>
                  ))}
                  <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={labelStyle}>Address</label>
                    <input
                      type="text" name="address" value={formData.address}
                      onChange={handleChange} placeholder="Rue, Numéro, Ville"
                      style={inputStyle}
                    />
                  </div>
                </div>
              </>
            )}

            {/* STEP 2 — Account Details */}
            {step === 2 && (
              <>
                <h3 style={{ margin: "0 0 24px", fontSize: 14, color: "#0a1628", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600, borderBottom: "1px solid #f0ebe2", paddingBottom: 12 }}>
                  Account Details
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  {[
                    {
                      label: "Account Type", name: "accountType", type: "select",
                      options: [{ v: "checking", l: "Checking Account" }, { v: "savings", l: "Savings Account" }, { v: "business", l: "Business Account" }]
                    },
                    {
                      label: "Currency", name: "currency", type: "select",
                      options: [{ v: "TND", l: "TND — Tunisian Dinar" }, { v: "EUR", l: "EUR — Euro" }, { v: "USD", l: "USD — US Dollar" }]
                    },
                    {
                      label: "Employment Status", name: "employmentStatus", type: "select",
                      options: [{ v: "employed", l: "Employed" }, { v: "self-employed", l: "Self-Employed" }, { v: "student", l: "Student" }, { v: "retired", l: "Retired" }]
                    },
                    { label: "Monthly Income (TND)", name: "monthlyIncome",  type: "number", placeholder: "0.000" },
                    { label: "Initial Deposit (TND)", name: "initialDeposit", type: "number", placeholder: "0.000" },
                  ].map(field => (
                    <div key={field.name} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={labelStyle}>{field.label}</label>
                      {field.type === "select" ? (
                        <select name={field.name} value={formData[field.name]} onChange={handleChange} style={inputStyle}>
                          {field.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                      ) : (
                        <input type={field.type} name={field.name} value={formData[field.name]} onChange={handleChange} placeholder={field.placeholder} style={inputStyle} />
                      )}
                    </div>
                  ))}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={labelStyle}>Password</label>
                    <input type="password" name="password" value={formData.password} onChange={handleChange} placeholder="••••••••" style={inputStyle} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={labelStyle}>Confirm Password</label>
                    <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} placeholder="••••••••" style={inputStyle} />
                  </div>
                </div>
              </>
            )}

            {/* STEP 3 — Confirmation */}
            {step === 3 && (
              <>
                <h3 style={{ margin: "0 0 24px", fontSize: 14, color: "#0a1628", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600, borderBottom: "1px solid #f0ebe2", paddingBottom: 12 }}>
                  Confirmation & Review
                </h3>
                <div style={{ background: "#faf8f5", borderRadius: 12, padding: 24, marginBottom: 24 }}>
                  {[
                    ["Full Name",       `${formData.firstName} ${formData.lastName}`],
                    ["Email",           formData.email || "—"],
                    ["Phone",           formData.phone || "—"],
                    ["National ID",     formData.nationalId || "—"],
                    ["Account Type",    formData.accountType],
                    ["Currency",        formData.currency],
                    ["Initial Deposit", formData.initialDeposit ? `${formData.initialDeposit} ${formData.currency}` : "—"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #ede8df" }}>
                      <span style={{ fontSize: 12, color: "#888", letterSpacing: 0.5 }}>{k}</span>
                      <span style={{ fontSize: 13, color: "#0a1628", fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                </div>
                <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
                  <input type="checkbox" style={{ marginTop: 2 }} />
                  <span style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>
                    I confirm that all the information provided is accurate and I agree to the bank's terms and conditions for account opening.
                  </span>
                </label>
              </>
            )}

            {/* Navigation Buttons */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 24, borderTop: "1px solid #f0ebe2" }}>
              <button
                onClick={() => step > 1 && setStep(step - 1)}
                style={{
                  padding: "11px 24px", border: "1.5px solid #e8e2d8", borderRadius: 8,
                  background: "transparent", color: "#666", fontFamily: "inherit",
                  cursor: step > 1 ? "pointer" : "not-allowed", fontSize: 13,
                  opacity: step > 1 ? 1 : 0.4,
                }}
              >← Previous</button>

              {step < totalSteps ? (
                <button
                  onClick={() => setStep(step + 1)}
                  style={{
                    padding: "11px 28px", border: "none", borderRadius: 8,
                    background: "linear-gradient(135deg, #0a1628, #1a3a6b)",
                    color: "#e8d48b", cursor: "pointer", fontSize: 13,
                    fontFamily: "inherit", fontWeight: 600, letterSpacing: 0.5,
                  }}
                >Continue →</button>
              ) : (
                <button
                  onClick={handleSubmit}
                  style={{
                    padding: "11px 28px", border: "none", borderRadius: 8,
                    background: "linear-gradient(135deg, #c9a84c, #e8d48b)",
                    color: "#0a1628", cursor: "pointer", fontSize: 13,
                    fontFamily: "inherit", fontWeight: 700, letterSpacing: 0.5,
                  }}
                >✦ Open Account</button>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default RegisterForm;