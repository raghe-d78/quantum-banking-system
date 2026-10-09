// Customer portal shell: sidebar navigation + topbar + routed content.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Icon } from "./ui";
import OverviewPage from "../pages/OverviewPage";
import NewTransactionPage from "../pages/NewTransactionPage";
import TransactionHistory from "../pages/HistoryPage";
import UpdateProfilePage from "../pages/UpdateProfilePage";

const MENU = [
  { key: "overview", icon: "home",    label: "Overview",        group: "Banking", sub: "Balance, quick actions and recent activity" },
  { key: "new",      icon: "send",    label: "New transaction", group: "Banking", sub: "Transfer, pay a bill or a merchant, withdraw" },
  { key: "history",  icon: "clock",   label: "History",         group: "Banking", sub: "Every ledger entry on your account" },
  { key: "profile",  icon: "user",    label: "Profile & security", group: "Account", sub: "Contact details and password" },
];

export default function CustomerDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState("overview");
  const [presetKind, setPresetKind] = useState(null);
  const [wizardNonce, setWizardNonce] = useState(0);

  const displayName = user?.name ?? user?.username ?? "Customer";
  const initials = displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const current = MENU.find(m => m.key === active);

  const go = (key) => {
    if (key.startsWith("detail:")) return navigate(`/transaction/${key.slice(7)}`);
    setActive(key);
  };
  const startAction = (kind) => { setPresetKind(kind); setWizardNonce(n => n + 1); setActive("new"); };
  const handleLogout = () => { logout(); navigate("/login", { replace: true }); };

  return (
    <div className="shell">
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="brand">
          <div className="brand-mark">B</div>
          <div className="brand-text"><div className="brand-name">Banque</div><div className="brand-sub">Customer portal</div></div>
        </div>
        <nav>
          {[...new Set(MENU.map(m => m.group))].map(group => (
            <div key={group}>
              <div className="nav-group">{group}</div>
              {MENU.filter(m => m.group === group).map(m => (
                <button key={m.key} className={`nav-item ${active === m.key ? "active" : ""}`} onClick={() => { if (m.key === "new") setPresetKind(null); setActive(m.key); }} title={m.label}>
                  <span className="ico"><Icon name={m.icon} /></span><span className="label">{m.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="foot">
          <button className="nav-item" onClick={handleLogout} title="Sign out"><span className="ico"><Icon name="logout" /></span><span className="label">Sign out</span></button>
          <button className="nav-item" onClick={() => setCollapsed(c => !c)} title="Collapse"><span className="ico"><Icon name={collapsed ? "chevronR" : "chevronL"} /></span><span className="label">Collapse</span></button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="crumbs"><span>Customer portal</span><Icon name="chevronR" size={14} /><b>{current?.label}</b></div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "right", lineHeight: 1.2 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{displayName}</div>
              <div className="small muted">{user?.email}</div>
            </div>
            <div className="avatar">{initials}</div>
          </div>
        </header>
        <main className="content">
          <div className="page-head">
            <div><h1>{current?.label}</h1><p>{current?.sub}</p></div>
            {active !== "new" && <button className="btn btn-gold" onClick={() => startAction(null)}><Icon name="plus" size={16} /> New transaction</button>}
          </div>
          {active === "overview" && <OverviewPage user={user} onAction={startAction} onNavigate={go} />}
          {active === "new"      && <NewTransactionPage key={wizardNonce} initialKind={presetKind} onDone={go} />}
          {active === "history"  && <TransactionHistory />}
          {active === "profile"  && <UpdateProfilePage />}
        </main>
      </div>
    </div>
  );
}
