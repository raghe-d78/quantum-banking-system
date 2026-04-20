// customer_frontend/src/pages/UpdateProfilePage.jsx
import { useState, useEffect } from "react";
import api from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

const tk = {
  navy: "#0a1628", navyMid: "#1a3a6b", gold: "#c9a84c", goldLight: "#e8d48b",
  cream: "#f5f3ef", creamBorder: "#e8e2d8", creamInput: "#faf8f5", muted: "#aaa",
  green: "#16a34a", greenBg: "rgba(34,197,94,0.08)", greenBorder: "rgba(34,197,94,0.22)",
  red: "#dc2626", redBg: "rgba(239,68,68,0.07)", redBorder: "rgba(239,68,68,0.22)",
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

const Section = ({ title, children }) => (
  <div style={{ background: "#fff", borderRadius: 16, padding: "28px 32px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: `1px solid ${tk.creamBorder}`, marginBottom: 20 }}>
    <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: tk.muted, fontWeight: 600, marginBottom: 20, paddingBottom: 12, borderBottom: `1px solid ${tk.creamBorder}` }}>
      {title}
    </div>
    {children}
  </div>
);

const UpdateProfilePage = () => {
  const { user, logout } = useAuth();

  const [profile, setProfile] = useState({ name: "", email: "", phone: "", address: "" });
  const [password, setPassword] = useState({ current: "", newPass: "", confirm: "" });
  const [loadingProfile,  setLoadingProfile]  = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [loadingFetch,    setLoadingFetch]    = useState(true);
  const [profileSuccess,  setProfileSuccess]  = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [profileError,    setProfileError]    = useState(null);
  const [passwordError,   setPasswordError]   = useState(null);

  // Load current profile
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/auth/me");
        setProfile({
          name:    data.user.name    ?? "",
          email:   data.user.email   ?? "",
          phone:   data.user.phone   ?? "",
          address: data.user.address ?? "",
        });
      } catch {
        // Fallback to stored user
        setProfile({
          name:    user?.name    ?? "",
          email:   user?.email   ?? "",
          phone:   "",
          address: "",
        });
      } finally {
        setLoadingFetch(false);
      }
    })();
  }, []);

  const handleProfileUpdate = async () => {
    setProfileError(null);
    setProfileSuccess(false);
    if (!profile.name || !profile.email) { setProfileError("Name and email are required."); return; }
    try {
      setLoadingProfile(true);
      await api.put("/auth/me", { name: profile.name, email: profile.email, phone: profile.phone, address: profile.address });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 4000);
    } catch (err) {
      setProfileError(err.response?.data?.message ?? "Failed to update profile.");
    } finally {
      setLoadingProfile(false);
    }
  };

  const handlePasswordUpdate = async () => {
    setPasswordError(null);
    setPasswordSuccess(false);
    if (!password.current || !password.newPass || !password.confirm) { setPasswordError("All password fields are required."); return; }
    if (password.newPass !== password.confirm) { setPasswordError("New passwords do not match."); return; }
    if (password.newPass.length < 8) { setPasswordError("New password must be at least 8 characters."); return; }
    try {
      setLoadingPassword(true);
      await api.put("/auth/password", { currentPassword: password.current, newPassword: password.newPass });
      setPasswordSuccess(true);
      setPassword({ current: "", newPass: "", confirm: "" });
      setTimeout(() => setPasswordSuccess(false), 4000);
    } catch (err) {
      setPasswordError(err.response?.data?.message ?? "Failed to update password.");
    } finally {
      setLoadingPassword(false);
    }
  };

  const initials = profile.name ? profile.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?";

  if (loadingFetch) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, gap: 16, color: tk.muted }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${tk.creamBorder}`, borderTopColor: tk.gold, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Georgia', serif", maxWidth: 700, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <div style={{ width: 4, height: 28, background: tk.gold, borderRadius: 2 }} />
          <h1 style={{ margin: 0, fontSize: 22, color: tk.navy, fontWeight: 400 }}>My Profile</h1>
        </div>
        <p style={{ margin: "0 0 0 16px", color: tk.muted, fontSize: 13 }}>Manage your personal information and security settings</p>
      </div>

      {/* Avatar card */}
      <div style={{ background: `linear-gradient(135deg, ${tk.navy}, ${tk.navyMid})`, borderRadius: 16, padding: "28px 32px", marginBottom: 20, display: "flex", alignItems: "center", gap: 20, boxShadow: "0 8px 32px rgba(10,22,40,0.2)" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: `linear-gradient(135deg, ${tk.gold}, ${tk.goldLight})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, color: tk.navy, flexShrink: 0 }}>
          {initials}
        </div>
        <div>
          <div style={{ color: tk.goldLight, fontSize: 18, fontWeight: 400, marginBottom: 4 }}>{profile.name || "—"}</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{profile.email || "—"}</div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 4, letterSpacing: 1 }}>Customer · Tunis</div>
        </div>
      </div>

      {/* ── Personal Information ── */}
      <Section title="Personal Information">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Full Name</label>
            <input style={inputStyle} type="text" value={profile.name}
              onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
              placeholder="Your full name" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Email Address</label>
            <input style={inputStyle} type="email" value={profile.email}
              onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
              placeholder="your@email.com" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Phone Number</label>
            <input style={inputStyle} type="tel" value={profile.phone}
              onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
              placeholder="+216 XX XXX XXX" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Address</label>
            <input style={inputStyle} type="text" value={profile.address}
              onChange={e => setProfile(p => ({ ...p, address: e.target.value }))}
              placeholder="City, Country" />
          </div>
        </div>

        {profileError && (
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, background: tk.redBg, border: `1px solid ${tk.redBorder}`, borderRadius: 10, padding: "11px 14px", color: tk.red, fontSize: 12 }}>
            <span>⚠</span><span>{profileError}</span>
          </div>
        )}
        {profileSuccess && (
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, background: tk.greenBg, border: `1px solid ${tk.greenBorder}`, borderRadius: 10, padding: "11px 14px", color: tk.green, fontSize: 12, animation: "fadeIn 0.3s ease" }}>
            <span>✓</span><span>Profile updated successfully.</span>
          </div>
        )}

        <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={handleProfileUpdate} disabled={loadingProfile} style={{
            padding: "12px 32px", border: "none", borderRadius: 10,
            background: loadingProfile ? "#ccc" : `linear-gradient(135deg, ${tk.navy}, ${tk.navyMid})`,
            color: tk.goldLight, cursor: loadingProfile ? "not-allowed" : "pointer",
            fontSize: 13, fontFamily: "'Georgia', serif", fontWeight: 600,
            letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 10,
          }}>
            {loadingProfile
              ? <><span style={{ width: 13, height: 13, border: "2px solid rgba(232,212,139,0.3)", borderTopColor: tk.goldLight, borderRadius: "50%", animation: "spin .7s linear infinite", display: "inline-block" }} />Saving…</>
              : "Save Changes"}
          </button>
        </div>
      </Section>

      {/* ── Change Password ── */}
      <Section title="Change Password">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Current Password</label>
            <input style={inputStyle} type="password" value={password.current}
              onChange={e => setPassword(p => ({ ...p, current: e.target.value }))}
              placeholder="••••••••" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={labelStyle}>New Password</label>
              <input style={inputStyle} type="password" value={password.newPass}
                onChange={e => setPassword(p => ({ ...p, newPass: e.target.value }))}
                placeholder="Min. 8 characters" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={labelStyle}>Confirm New Password</label>
              <input style={{
                ...inputStyle,
                borderColor: password.confirm && password.newPass !== password.confirm ? tk.red + "80" : tk.creamBorder
              }} type="password" value={password.confirm}
                onChange={e => setPassword(p => ({ ...p, confirm: e.target.value }))}
                placeholder="Repeat new password" />
            </div>
          </div>

          {/* Strength indicator */}
          {password.newPass && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 4, flex: 1 }}>
                {[1,2,3,4].map(i => (
                  <div key={i} style={{
                    height: 4, flex: 1, borderRadius: 2,
                    background: password.newPass.length >= i * 2
                      ? (password.newPass.length >= 8 ? tk.green : tk.gold)
                      : tk.creamBorder,
                    transition: "background 0.3s",
                  }} />
                ))}
              </div>
              <span style={{ fontSize: 11, color: password.newPass.length >= 8 ? tk.green : tk.muted }}>
                {password.newPass.length < 4 ? "Weak" : password.newPass.length < 8 ? "Fair" : "Strong"}
              </span>
            </div>
          )}
        </div>

        {passwordError && (
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, background: tk.redBg, border: `1px solid ${tk.redBorder}`, borderRadius: 10, padding: "11px 14px", color: tk.red, fontSize: 12 }}>
            <span>⚠</span><span>{passwordError}</span>
          </div>
        )}
        {passwordSuccess && (
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, background: tk.greenBg, border: `1px solid ${tk.greenBorder}`, borderRadius: 10, padding: "11px 14px", color: tk.green, fontSize: 12, animation: "fadeIn 0.3s ease" }}>
            <span>✓</span><span>Password updated successfully.</span>
          </div>
        )}

        <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={handlePasswordUpdate} disabled={loadingPassword} style={{
            padding: "12px 32px", border: "none", borderRadius: 10,
            background: loadingPassword ? "#ccc" : `linear-gradient(135deg, ${tk.navy}, ${tk.navyMid})`,
            color: tk.goldLight, cursor: loadingPassword ? "not-allowed" : "pointer",
            fontSize: 13, fontFamily: "'Georgia', serif", fontWeight: 600,
            letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 10,
          }}>
            {loadingPassword
              ? <><span style={{ width: 13, height: 13, border: "2px solid rgba(232,212,139,0.3)", borderTopColor: tk.goldLight, borderRadius: "50%", animation: "spin .7s linear infinite", display: "inline-block" }} />Updating…</>
              : "Update Password"}
          </button>
        </div>
      </Section>

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes fadeIn  { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </div>
  );
};

export default UpdateProfilePage;