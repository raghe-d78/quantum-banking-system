
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
    if (success) navigate("/dashboard", { replace: true });
  };

  // Allow submitting with Enter key
  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleConfirm();
  };

  return (
    <div style={styles.page}>
      <div style={styles.bgImage} />
      <div className="blur-gradient" />

      <div style={styles.card}>
        <div style={styles.blurTop} />
        <div style={styles.blurBottom} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <h1 style={styles.title}>Sign In</h1>
          <div style={styles.divider} />

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

          {error && <p style={styles.error}>{error}</p>}

          <button
            style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "Signing in…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    position: "relative",
    width: "100vw",
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "Helvetica",
    overflow: "hidden",
  },
  bgImage: {
    position: "fixed",
    inset: 0,
    backgroundImage: `url(${bgImage})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    zIndex: 0,
  },
  card: {
    position: "relative",
    overflow: "hidden",
    zIndex: 2,
    width: "100%",
    maxWidth: 560,
    margin: "0 16px",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(108,108,108,0.50)",
    borderRadius: 18,
    boxShadow: `
      inset 0 4px 24px rgba(255,255,255,0.06),
      inset 0 1px 0px rgba(255,255,255,0.10),
      0 20px 60px rgba(0,0,0,0.4)
    `,
    padding: "40px 48px 44px",
  },
  blurTop: {
    position: "absolute", inset: 0, bottom: "45%",
    backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(4px)", zIndex: 0,
  },
  blurBottom: {
    position: "absolute", inset: 0, top: "45%",
    backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(6px)", zIndex: 0,
  },
  title: {
    color: "#fff", fontSize: 36, fontWeight: 700,
    textAlign: "center", marginBottom: 20,
  },
  divider: {
    height: 1, background: "rgba(255,255,255,0.2)", marginBottom: 32,
  },
  fields: {
    display: "flex", flexDirection: "column", gap: 20, marginBottom: 32,
  },
  error: {
    color: "#f87171", fontSize: 13, textAlign: "center", marginBottom: 12,
  },
  btn: {
    width: "100%", padding: "15px",
    background: "#1C398E", color: "#FFFFFF",
    border: "none", borderRadius: 8,
    fontSize: 17, fontWeight: 600,
    cursor: "pointer", fontFamily: "Roboto, sans-serif",
    transition: "background 0.2s",
  },
};