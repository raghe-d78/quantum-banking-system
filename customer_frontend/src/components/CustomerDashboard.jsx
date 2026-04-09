// src/components/CustomerDashboard.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import BalancePage from "../pages/BalancePage";
import WithdrawPage from "../pages/WithdrawPage";
import TransactionHistory from "../pages/HistoryPage";
const CustomerDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed]   = useState(false);
  const [activeMenu, setActiveMenu] = useState("balance");

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  // Display name: prefer full name, fall back to username
  const displayName = user?.name ?? user?.username ?? "User";
  const initials    = displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const menuItems = [
    { key: "balance",     icon: "◈", label: "My Balance",  group: "Account"  },
    { key: "transfer",    icon: "⇄", label: "Transfer",    group: "Account"  },
    { key: "cards",       icon: "▭", label: "My Cards",    group: "Account"  },
    { key: "loans",       icon: "◐", label: "My Loans",    group: "Services" },
    { key: "investments", icon: "▦", label: "Investments", group: "Services" },
    { key: "support",     icon: "◎", label: "Support",     group: "Help"     },
    { key: "settings",    icon: "⚙", label: "Settings",    group: "Help"     },
    { key:"withdraw", icon:"↑", label:"Withdraw", group:"Account" },
    { key:"History", icon:"🔄", label:"History", group:"Account" },

  ];

  const groups = [...new Set(menuItems.map(i => i.group))];

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Georgia', 'Times New Roman', serif", background: "#f5f3ef" }}>

      {/* ── Sidebar ── */}
      <div style={{
        width: collapsed ? 64 : 240,
        transition: "width 0.3s cubic-bezier(0.4,0,0.2,1)",
        background: "linear-gradient(180deg, #0a1628 0%, #0d2045 50%, #091535 100%)",
        display: "flex", flexDirection: "column", position: "relative", flexShrink: 0,
        boxShadow: "4px 0 24px rgba(0,0,0,0.3)",
      }}>

        {/* Logo */}
        <div style={{ padding: collapsed ? "24px 14px" : "28px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg, #c9a84c, #e8d48b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: "bold", color: "#0a1628" }}>B</div>
          {!collapsed && (
            <div>
              <div style={{ color: "#e8d48b", fontSize: 15, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase" }}>Banque</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>My Account</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "16px 0", overflowY: "auto" }}>
          {groups.map(group => (
            <div key={group} style={{ marginBottom: 8 }}>
              {!collapsed && (
                <div style={{ padding: "8px 24px 4px", fontSize: 9, letterSpacing: 2.5, color: "rgba(255,255,255,0.25)", textTransform: "uppercase" }}>
                  {group}
                </div>
              )}
              {menuItems.filter(i => i.group === group).map(item => (
                <button key={item.key} onClick={() => setActiveMenu(item.key)} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12,
                  padding: collapsed ? "12px 0" : "11px 24px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  background: activeMenu === item.key ? "rgba(201,168,76,0.15)" : "transparent",
                  border: "none",
                  borderLeft: activeMenu === item.key ? "3px solid #c9a84c" : "3px solid transparent",
                  color: activeMenu === item.key ? "#e8d48b" : "rgba(255,255,255,0.5)",
                  cursor: "pointer", fontSize: 13, transition: "all 0.2s", letterSpacing: 0.3,
                }}>
                  <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <button onClick={() => setCollapsed(!collapsed)} style={{
          background: "rgba(255,255,255,0.05)", border: "none", borderTop: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.4)", padding: "14px", cursor: "pointer", fontSize: 14,
          display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start",
          gap: 12, paddingLeft: collapsed ? 0 : 24,
        }}>
          <span style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform 0.3s" }}>◀</span>
          {!collapsed && <span style={{ fontSize: 11, letterSpacing: 1 }}>Collapse</span>}
        </button>
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <header style={{
          background: "#fff", borderBottom: "1px solid #e8e2d8",
          padding: "0 32px", height: 64, display: "flex", alignItems: "center",
          justifyContent: "space-between", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#999", fontSize: 12 }}>My Account</span>
            <span style={{ color: "#ccc" }}>›</span>
            <span style={{ color: "#0a1628", fontSize: 12, fontWeight: 600 }}>
              {menuItems.find(i => i.key === activeMenu)?.label}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#0a1628" }}>{displayName}</div>
              <div style={{ fontSize: 10, color: "#999", letterSpacing: 0.5 }}>Client · Tunis</div>
            </div>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #c9a84c, #e8d48b)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0a1628", fontSize: 13, fontWeight: 700 }}>
              {initials}
            </div>
            {/* Logout */}
            <button onClick={handleLogout} title="Sign out" style={{
              background: "none", border: "1px solid #e8e2d8", borderRadius: 8,
              color: "#aaa", fontSize: 11, padding: "6px 12px", cursor: "pointer",
              letterSpacing: 0.5, transition: "all 0.2s",
            }}>
              Sign out
            </button>
          </div>
        </header>

        {/* Content */}
        <main style={{ flex: 1, overflow: "auto", padding: "32px" }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <div style={{ width: 4, height: 24, background: "#c9a84c", borderRadius: 2 }} />
              <h1 style={{ margin: 0, fontSize: 20, color: "#0a1628", fontWeight: 400, letterSpacing: 0.5 }}>
                {menuItems.find(i => i.key === activeMenu)?.label}
              </h1>
            </div>
            <p style={{ margin: "0 0 0 16px", color: "#aaa", fontSize: 12, letterSpacing: 0.3 }}>
              {new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>

          {activeMenu === "balance" && <BalancePage />}
          {activeMenu === "withdraw" && <WithdrawPage />}
          {activeMenu === "History" && <TransactionHistory />}

          {activeMenu !== "balance" && activeMenu !== "withdraw" && activeMenu !== "History" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "55vh", flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 52, color: "#e8e2d8" }}>{menuItems.find(i => i.key === activeMenu)?.icon}</div>
              <div style={{ color: "#aaa", fontSize: 14, letterSpacing: 1 }}>
                {menuItems.find(i => i.key === activeMenu)?.label} — Coming Soon
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default CustomerDashboard;