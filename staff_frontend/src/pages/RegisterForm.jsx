// staff_frontend/src/pages/RegisterForm.jsx
import { useState } from "react";
import api from "../lib/api";

const RegisterForm = () => {
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState(false);
  const [error,    setError]    = useState(null);
  const [formData, setFormData] = useState({
    username: "",
    email:    "",
    name:     "",
    password: "",
    role:     "customer",
  });

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async () => {
    setError(null);
    if (!formData.username || !formData.email || !formData.name || !formData.password) {
      setError("All fields are required.");
      return;
    }
    try {
      setLoading(true);
      await api.post("/admin/users", formData);
      setSuccess(true);
      setFormData({ username: "", email: "", name: "", password: "", role: "customer" });
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setSuccess(false);
      setError(err.response?.data?.message ?? "Failed to create user.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    padding: "11px 14px", border: "1.5px solid #e8e2d8", borderRadius: 8,
    fontSize: 13, color: "#0a1628", background: "#faf8f5", outline: "none",
    fontFamily: "'Georgia', serif", width: "100%", boxSizing: "border-box",
  };
  const labelStyle = {
    fontSize: 11, color: "#888", letterSpacing: 1,
    textTransform: "uppercase", fontWeight: 600,
  };

  const generatePassword = () => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{};:,.<>?";
  const password = Array.from({ length: 12 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
  setFormData((prev) => ({ ...prev, password }));
};

  if (success) return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 48, textAlign: "center", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✦</div>
      <div style={{ fontSize: 18, color: "#0a1628", fontWeight: 600, marginBottom: 8 }}>
        User Created Successfully
      </div>
      <div style={{ color: "#888", fontSize: 13 }}>
        {formData.role === "customer"
          ? "A bank account has been automatically created for this customer."
          : "Staff account created successfully."}
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Georgia', serif", maxWidth: 760, margin: "0 auto" }}>

      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <div style={{ width: 4, height: 28, background: "#c9a84c", borderRadius: 2 }} />
          <h1 style={{ margin: 0, fontSize: 22, color: "#0a1628", fontWeight: 400 }}>
            New User Registration
          </h1>
        </div>
        <p style={{ margin: "0 0 0 16px", color: "#888", fontSize: 13 }}>
          Fill in all fields to create a new user account
        </p>
      </div>

      <div style={{ background: "#fff", borderRadius: 16, padding: 36, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #e8e2d8" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Username</label>
            <input style={inputStyle} type="text" name="username"
              value={formData.username} onChange={handleChange}
              placeholder="e.g. mohamed.benali" />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Full Name</label>
            <input style={inputStyle} type="text" name="name"
              value={formData.name} onChange={handleChange}
              placeholder="e.g. Mohamed Ben Ali" />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Email Address</label>
            <input style={inputStyle} type="email" name="email"
              value={formData.email} onChange={handleChange}
              placeholder="client@email.com" />
          </div>

<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
  <label style={labelStyle}>Password</label>
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <input
      style={{ ...inputStyle, flex: 1, margin: 0 }}
      type="password"
      name="password"
      value={formData.password}
      onChange={handleChange}
      placeholder="••••••••"
    />
    <button
      type="button"
      onClick={generatePassword}
      style={{
        padding: "11px 14px",
        borderRadius: 10,
        border: "1.5px solid #e8e2d8",
        background: "#fff",
        color: "#0a1628",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
        minWidth: 110,
      }}
    >
      Generate
    </button>
  </div>
</div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Address</label>
            <input style={inputStyle} type="text" name="address"
              value={formData.address} onChange={handleChange}
              placeholder="e.g. 123 Main Street" />
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>phone number</label>
            <input style={inputStyle} type="text" name="phone"
              value={formData.phone} onChange={handleChange}
              placeholder="e.g. 23 456 790" />
          </div>

          {/* Role selector */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Role</label>
            <div style={{ display: "flex", gap: 12 }}>
              {[
                { value: "customer",  label: "Customer",  desc: "Bank account created automatically", icon: "◈" },
                { value: "employee",  label: "Employee",  desc: "Bank staff — access to staff portal", icon: "◉" },
                // { value: "admin",     label: "Admin",     desc: "Full access to admin dashboard",      icon: "✦" },
              ].map((r) => (
                <button key={r.value} type="button"
                  onClick={() => setFormData({ ...formData, role: r.value })}
                  style={{
                    flex: 1, padding: "14px 16px", borderRadius: 10, cursor: "pointer",
                    border: formData.role === r.value ? "2px solid #c9a84c" : "1.5px solid #e8e2d8",
                    background: formData.role === r.value ? "rgba(201,168,76,0.08)" : "#faf8f5",
                    textAlign: "left", fontFamily: "'Georgia', serif", transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 16, color: "#c9a84c", marginBottom: 6 }}>{r.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0a1628", marginBottom: 3 }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: "#aaa" }}>{r.desc}</div>
                </button>
              ))}
            </div>
          </div>

        </div>

        {error && (
          <div style={{ marginTop: 20, padding: "11px 14px", borderRadius: 10, background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.20)", color: "#dc2626", fontSize: 12, display: "flex", gap: 8 }}>
            <span>⚠</span><span>{error}</span>
          </div>
        )}

        <div style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid #f0ebe2", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={handleSubmit} disabled={loading}
            style={{
              padding: "13px 36px", border: "none", borderRadius: 10,
              background: loading ? "#ccc" : "linear-gradient(135deg, #0a1628, #1a3a6b)",
              color: "#e8d48b", cursor: loading ? "not-allowed" : "pointer",
              fontSize: 13, fontFamily: "'Georgia', serif", fontWeight: 600,
              letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 10,
            }}
          >
            {loading ? (
              <>
                <span style={{ width: 14, height: 14, border: "2px solid rgba(232,212,139,0.3)", borderTopColor: "#e8d48b", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                Creating…
              </>
            ) : "✦ Create User"}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default RegisterForm;