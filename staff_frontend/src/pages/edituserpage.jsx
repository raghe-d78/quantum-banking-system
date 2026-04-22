// staff_frontend/src/pages/EditUserPage.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../lib/api";

const tk = {
  navy: "#0a1628", navyMid: "#1a3a6b", gold: "#c9a84c", goldLight: "#e8d48b",
  cream: "#f5f3ef", creamBorder: "#e8e2d8", creamInput: "#faf8f5", muted: "#aaa",
  green: "#16a34a", greenBg: "rgba(34,197,94,0.08)", greenBorder: "rgba(34,197,94,0.22)",
  red: "#dc2626", redBg: "rgba(239,68,68,0.07)", redBorder: "rgba(239,68,68,0.22)",
  orange: "#d97706",
};

// ── Mock data ─────────────────────────────────────────────────────
const MOCK_USERS = {
  "uuid-001": { id:"uuid-001", username:"mohamed.benali",  name:"Mohamed Ben Ali",  email:"m.benali@banque.tn",   role:"customer",  status:"active",    phone:"+216 22 111 222", address:"Tunis Centre" },
  "uuid-002": { id:"uuid-002", username:"sarra.trabelsi",  name:"Sarra Trabelsi",   email:"s.trabelsi@banque.tn", role:"customer",  status:"active",    phone:"+216 55 333 444", address:"Lac, Tunis"    },
  "uuid-003": { id:"uuid-003", username:"karim.mansouri",  name:"Karim Mansouri",   email:"k.mansouri@banque.tn", role:"customer",  status:"suspended", phone:"+216 98 555 666", address:"Ariana"        },
  "uuid-004": { id:"uuid-004", username:"leila.sfaxi",     name:"Leila Sfaxi",      email:"l.sfaxi@banque.tn",    role:"customer",  status:"active",    phone:"",                address:""              },
  "uuid-005": { id:"uuid-005", username:"amine.gharbi",    name:"Amine Gharbi",     email:"a.gharbi@banque.tn",   role:"employee",  status:"active",    phone:"+216 25 777 888", address:"Sousse"        },
  "uuid-006": { id:"uuid-006", username:"nour.hamdi",      name:"Nour Hamdi",       email:"n.hamdi@banque.tn",    role:"employee",  status:"active",    phone:"",                address:""              },
  "uuid-007": { id:"uuid-007", username:"khalil.admin",    name:"Khalil Admin",     email:"k.admin@banque.tn",    role:"admin",     status:"active",    phone:"+216 71 000 001", address:"Tunis"         },
  "uuid-008": { id:"uuid-008", username:"youssef.beji",    name:"Youssef Beji",     email:"y.beji@banque.tn",     role:"customer",  status:"active",    phone:"",                address:""              },
  "uuid-009": { id:"uuid-009", username:"rania.bouaziz",   name:"Rania Bouaziz",    email:"r.bouaziz@banque.tn",  role:"customer",  status:"active",    phone:"",                address:""              },
  "uuid-010": { id:"uuid-010", username:"tarek.jendoubi",  name:"Tarek Jendoubi",   email:"t.jendoubi@banque.tn", role:"customer",  status:"suspended", phone:"",                address:""              },
};

const inputStyle = {
  padding: "12px 16px", border: `1.5px solid ${tk.creamBorder}`, borderRadius: 10,
  fontSize: 13, color: tk.navy, background: tk.creamInput, outline: "none",
  fontFamily: "'Georgia', serif", width: "100%", boxSizing: "border-box", transition: "border-color 0.2s",
};
const labelStyle = {
  fontSize: 11, color: tk.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 6, display: "block",
};

const Section = ({ title, children }) => (
  <div style={{ background: "#fff", borderRadius: 16, padding: "26px 30px", marginBottom: 18, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: `1px solid ${tk.creamBorder}` }}>
    <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: tk.muted, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: `1px solid ${tk.creamBorder}` }}>
      {title}
    </div>
    {children}
  </div>
);

const EditUserPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [original,  setOriginal]  = useState(null);
  const [form,      setForm]      = useState({ name:"", email:"", username:"", phone:"", address:"", role:"customer", status:"active" });
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [success,   setSuccess]   = useState(false);
  const [error,     setError]     = useState(null);
  const [hasChanged,setHasChanged]= useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // TODO: replace mock with: const { data } = await api.get(`/admin/users/${id}`);
        await new Promise(r => setTimeout(r, 400));
        const user = MOCK_USERS[id];
        if (!user) throw new Error("User not found.");
        setOriginal(user);
        setForm({ name: user.name, email: user.email, username: user.username, phone: user.phone || "", address: user.address || "", role: user.role, status: user.status });
      } catch (err) {
        setError(err.message ?? "Failed to load user.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Track changes
  useEffect(() => {
    if (!original) return;
    const changed = Object.keys(form).some(k => form[k] !== (original[k] ?? ""));
    setHasChanged(changed);
  }, [form, original]);

  const handleSave = async () => {
    setError(null);
    if (!form.name || !form.email) { setError("Name and email are required."); return; }
    try {
      setSaving(true);
      await api.put(`/admin/users/${id}`, form);
      setOriginal({ ...original, ...form });
      setSuccess(true);
      setHasChanged(false);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err.response?.data?.message ?? "Failed to update user.");
    } finally {
      setSaving(false);
    }
  };

  const initials = form.name ? form.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?";

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320, gap: 16, color: tk.muted }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${tk.creamBorder}`, borderTopColor: tk.gold, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error && !original) return (
    <div style={{ background: "#fff", borderRadius: 16, padding: "40px 32px", textAlign: "center", border: `1px solid ${tk.redBorder}`, maxWidth: 420, margin: "0 auto" }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>⚠️</div>
      <div style={{ fontSize: 14, color: tk.red, fontWeight: 600, marginBottom: 8 }}>{error}</div>
      <button onClick={() => navigate(-1)} style={{ fontSize: 12, color: tk.gold, background: "none", border: `1px solid ${tk.gold}`, borderRadius: 8, padding: "8px 20px", cursor: "pointer" }}>← Back</button>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Georgia', serif", maxWidth: 720, margin: "0 auto" }}>

      {/* Back + Header */}
      <button onClick={() => navigate(-1)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: tk.muted, fontSize: 12, cursor: "pointer", marginBottom: 20, padding: 0, letterSpacing: 0.3 }}>
        ← Back to Users
      </button>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <div style={{ width: 4, height: 28, background: tk.gold, borderRadius: 2 }} />
          <h1 style={{ margin: 0, fontSize: 22, color: tk.navy, fontWeight: 400 }}>Edit User</h1>
        </div>
        <p style={{ margin: "0 0 0 16px", color: tk.muted, fontSize: 13 }}>Modify the user's information and account settings</p>
      </div>

      {/* User avatar card */}
      <div style={{ background: `linear-gradient(135deg, ${tk.navy}, ${tk.navyMid})`, borderRadius: 16, padding: "22px 28px", marginBottom: 20, display: "flex", alignItems: "center", gap: 18, boxShadow: "0 6px 24px rgba(10,22,40,0.18)" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: `linear-gradient(135deg, ${tk.gold}, ${tk.goldLight})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: tk.navy, flexShrink: 0 }}>
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: tk.goldLight, fontSize: 16, fontWeight: 400, marginBottom: 3 }}>{form.name || "—"}</div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>ID: {id}</div>
        </div>
        {hasChanged && (
          <div style={{ fontSize: 11, color: tk.gold, background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 8, padding: "5px 12px", letterSpacing: 0.5 }}>
            Unsaved changes
          </div>
        )}
      </div>

      {/* ── Personal Information ── */}
      <Section title="Personal Information">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Full Name *</label>
            <input style={inputStyle} type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Username</label>
            <input style={{ ...inputStyle, background: "#f0ede8", color: tk.muted }} type="text" value={form.username} readOnly title="Username cannot be changed" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Email Address *</label>
            <input style={inputStyle} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@banque.tn" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Phone Number</label>
            <input style={inputStyle} type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+216 XX XXX XXX" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Address</label>
            <input style={inputStyle} type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="City, Country" />
          </div>
        </div>
      </Section>

      {/* ── Account Settings ── */}
      <Section title="Account Settings">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* Role */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Role</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { value: "customer",  label: "Customer",  desc: "Bank account holder",    icon: "◈", color: "#1d4ed8" },
                { value: "employee",  label: "Employee",  desc: "Staff portal access",    icon: "◉", color: tk.green  },
                { value: "admin",     label: "Admin",     desc: "Full admin access",      icon: "✦", color: tk.gold   },
              ].map(r => (
                <button key={r.value} type="button" onClick={() => setForm(f => ({ ...f, role: r.value }))} style={{
                  padding: "11px 14px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                  border: form.role === r.value ? `2px solid ${r.color}` : `1.5px solid ${tk.creamBorder}`,
                  background: form.role === r.value ? `${r.color}12` : tk.creamInput,
                  fontFamily: "'Georgia', serif", transition: "all 0.15s",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <span style={{ fontSize: 14, color: r.color }}>{r.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: tk.navy }}>{r.label}</div>
                    <div style={{ fontSize: 10, color: tk.muted }}>{r.desc}</div>
                  </div>
                  {form.role === r.value && <span style={{ marginLeft: "auto", fontSize: 12, color: r.color }}>✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Account Status</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { value: "active",    label: "Active",    desc: "Account fully operational",         icon: "✓", color: tk.green  },
                { value: "suspended", label: "Suspended", desc: "Account suspended — no operations", icon: "⊘", color: tk.red    },
              ].map(s => (
                <button key={s.value} type="button" onClick={() => setForm(f => ({ ...f, status: s.value }))} style={{
                  padding: "11px 14px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                  border: form.status === s.value ? `2px solid ${s.color}` : `1.5px solid ${tk.creamBorder}`,
                  background: form.status === s.value ? `${s.color}12` : tk.creamInput,
                  fontFamily: "'Georgia', serif", transition: "all 0.15s",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <span style={{ fontSize: 16, color: s.color }}>{s.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: tk.navy }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: tk.muted }}>{s.desc}</div>
                  </div>
                  {form.status === s.value && <span style={{ marginLeft: "auto", fontSize: 12, color: s.color }}>✓</span>}
                </button>
              ))}
            </div>

            {/* Suspension warning */}
            {form.status === "suspended" && original?.status === "active" && (
              <div style={{ marginTop: 8, display: "flex", gap: 8, background: tk.redBg, border: `1px solid ${tk.redBorder}`, borderRadius: 8, padding: "10px 12px" }}>
                <span style={{ color: tk.red, flexShrink: 0 }}>⚠</span>
                <div style={{ fontSize: 11, color: tk.red, lineHeight: 1.5 }}>Suspending this account will block all operations immediately.</div>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Feedback */}
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: tk.redBg, border: `1px solid ${tk.redBorder}`, borderRadius: 10, padding: "12px 16px", color: tk.red, fontSize: 12, marginBottom: 16 }}>
          <span>⚠</span><span>{error}</span>
        </div>
      )}
      {success && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: tk.greenBg, border: `1px solid ${tk.greenBorder}`, borderRadius: 10, padding: "12px 16px", color: tk.green, fontSize: 12, marginBottom: 16, animation: "fadeIn 0.3s ease" }}>
          <span>✓</span><span>User updated successfully.</span>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0" }}>
        <button onClick={() => navigate(-1)} style={{ padding: "12px 24px", border: `1.5px solid ${tk.creamBorder}`, borderRadius: 10, background: "transparent", color: "#666", cursor: "pointer", fontFamily: "'Georgia', serif", fontSize: 13 }}>
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving || !hasChanged} style={{
          padding: "13px 36px", border: "none", borderRadius: 10,
          background: saving || !hasChanged ? "#e8e2d8" : `linear-gradient(135deg, ${tk.navy}, ${tk.navyMid})`,
          color: saving || !hasChanged ? tk.muted : tk.goldLight,
          cursor: saving || !hasChanged ? "not-allowed" : "pointer",
          fontSize: 13, fontFamily: "'Georgia', serif", fontWeight: 600,
          letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 10, transition: "all 0.2s",
        }}>
          {saving
            ? <><span style={{ width: 13, height: 13, border: "2px solid rgba(232,212,139,0.3)", borderTopColor: tk.goldLight, borderRadius: "50%", animation: "spin .7s linear infinite", display: "inline-block" }} />Saving…</>
            : "Save Changes"}
        </button>
      </div>

      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </div>
  );
};

export default EditUserPage;