// customer_frontend/src/pages/LoginPage.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import InputField from "../components/ui/InputField";
import bgImage from "../assets/bg.jpg";

export default function LoginPage() {
  const { login, error } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);

  const handleConfirm = async () => {
    if (!username || !password) return;
    setLoading(true);
    const success = await login(username, password);
    setLoading(false);
    if (success) navigate("/dashboard", { replace: true }); // always → dashboard
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleConfirm();
  };

  return (
    <div style={styles.page}>
      <div style={styles.bgImage} />
      <div style={styles.bgOverlay} />

      <div style={styles.card}>
        <div style={styles.blurTop} />
        <div style={styles.blurBottom} />

        <div style={{ position: "relative", zIndex: 1 }}>

          <div style={styles.logoWrap}>
            <div style={styles.logoCircle}>B</div>
            <div>
              <div style={styles.logoName}>Banque</div>
              <div style={styles.logoSub}>My Account</div>
            </div>
          </div>

          <div style={styles.divider} />

          <h1 style={styles.title}>Sign In</h1>
          <p style={styles.subtitle}>Enter your credentials to access your account</p>

          <div style={styles.fields}>
            <InputField
              label="Username or Email"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <InputField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          {error && (
            <div style={styles.errorBox}>
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={loading || !username || !password}
            style={{
              ...styles.btn,
              opacity: loading || !username || !password ? 0.6 : 1,
              cursor: loading || !username || !password ? "not-allowed" : "pointer",
            }}
          >
            {loading ? (
              <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
                <span style={styles.spinner} />
                Signing in…
              </span>
            ) : "Confirm"}
          </button>

          <p style={styles.footerNote}>Protected by 256-bit encryption · Banque © 2026</p>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const styles = {
  page: {
    position:"relative", width:"100vw", minHeight:"100vh",
    display:"flex", alignItems:"center", justifyContent:"center",
    fontFamily:"var(--font-main)", overflow:"hidden",
  },
  bgImage: {
    position:"fixed", inset:0,
    backgroundImage:`url(${bgImage})`,
    backgroundSize:"cover", backgroundPosition:"center", zIndex:0,
  },
  bgOverlay: {
    position:"fixed", inset:0,
    background:"linear-gradient(160deg, rgba(5,15,40,0.72) 0%, rgba(10,22,40,0.85) 100%)",
    zIndex:1,
  },
  card: {
    position:"relative", overflow:"hidden", zIndex:2,
    width:"100%", maxWidth:480, margin:"0 20px",
    background:"rgba(255,255,255,0.03)",
    border:"1px solid rgba(201,168,76,0.20)",
    borderRadius:20,
    boxShadow:`inset 0 1px 0 rgba(255,255,255,0.08), 0 24px 64px rgba(0,0,0,0.50)`,
    padding:"40px 44px 44px",
  },
  blurTop: {
    position:"absolute", inset:0, bottom:"50%",
    backdropFilter:"blur(3px)", WebkitBackdropFilter:"blur(3px)", zIndex:0,
  },
  blurBottom: {
    position:"absolute", inset:0, top:"50%",
    backdropFilter:"blur(5px)", WebkitBackdropFilter:"blur(5px)", zIndex:0,
  },
  logoWrap: { display:"flex", alignItems:"center", gap:14, marginBottom:24 },
  logoCircle: {
    width:42, height:42, borderRadius:"50%",
    background:"linear-gradient(135deg, var(--color-gold), var(--color-gold-light))",
    display:"flex", alignItems:"center", justifyContent:"center",
    fontSize:18, fontWeight:"bold", color:"var(--color-navy)", flexShrink:0,
    boxShadow:"0 4px 14px rgba(201,168,76,0.35)",
  },
  logoName: { color:"var(--color-gold-light)", fontSize:16, fontWeight:600, letterSpacing:2, textTransform:"uppercase", lineHeight:1.2 },
  logoSub:  { color:"rgba(255,255,255,0.35)", fontSize:10, letterSpacing:1.5, textTransform:"uppercase", marginTop:2 },
  divider: {
    height:1,
    background:"linear-gradient(90deg, transparent, rgba(201,168,76,0.30), transparent)",
    marginBottom:28,
  },
  title:    { color:"#fff", fontSize:26, fontWeight:400, letterSpacing:0.5, margin:0 },
  subtitle: { color:"rgba(255,255,255,0.35)", fontSize:12, letterSpacing:0.3, marginBottom:28, marginTop:6 },
  fields:   { display:"flex", flexDirection:"column", gap:18, marginBottom:24 },
  errorBox: {
    display:"flex", alignItems:"center", gap:8,
    background:"rgba(220,38,38,0.10)", border:"1px solid rgba(220,38,38,0.25)",
    borderRadius:10, padding:"11px 14px",
    color:"#fca5a5", fontSize:12, marginBottom:20, letterSpacing:0.2,
  },
  btn: {
    width:"100%", padding:"15px",
    background:"linear-gradient(135deg, #0a1628 0%, #1a3a6b 100%)",
    color:"#e8d48b", border:"1px solid rgba(201,168,76,0.30)",
    borderRadius:10, fontSize:14, fontWeight:600,
    fontFamily:"'Georgia', serif", letterSpacing:1, textTransform:"uppercase",
    transition:"all 0.2s",
  },
  spinner: {
    display:"inline-block", width:14, height:14,
    border:"2px solid rgba(232,212,139,0.3)", borderTopColor:"#e8d48b",
    borderRadius:"50%", animation:"spin 0.7s linear infinite",
  },
  footerNote: { marginTop:20, textAlign:"center", fontSize:10, color:"rgba(255,255,255,0.2)", letterSpacing:0.5 },
};