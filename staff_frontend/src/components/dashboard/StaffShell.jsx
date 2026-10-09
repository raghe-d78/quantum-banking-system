// Shared staff portal shell (admin + employee): sidebar, topbar, page head.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Icon } from "../ui";

export default function StaffShell({ menu, initial, portal, render }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState(initial);
  const current = menu.find(m => m.key === active);
  const displayName = user?.name ?? user?.username ?? "Staff";
  const initials = displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const handleLogout = () => { logout(); navigate("/login", { replace: true }); };

  return (
    <div className="shell">
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="brand">
          <div className="brand-mark">B</div>
          <div className="brand-text"><div className="brand-name">Banque</div><div className="brand-sub">{portal}</div></div>
        </div>
        <nav>
          {[...new Set(menu.map(m => m.group))].map(group => (
            <div key={group}>
              <div className="nav-group">{group}</div>
              {menu.filter(m => m.group === group).map(m => (
                <button key={m.key} className={`nav-item ${active === m.key ? "active" : ""}`} onClick={() => setActive(m.key)} title={m.label}>
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
          <div className="crumbs"><span>{portal}</span><Icon name="chevronR" size={14} /><b>{current?.label}</b></div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "right", lineHeight: 1.2 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{displayName}</div>
              <div className="small muted" style={{ textTransform: "capitalize" }}>{user?.role}</div>
            </div>
            <div className="avatar">{initials}</div>
          </div>
        </header>
        <main className="content" style={{ maxWidth: 1180 }}>
          <div className="page-head"><div><h1>{current?.label}</h1><p>{current?.sub}</p></div></div>
          {render(active) ?? (
            <div className="empty"><div className="big"><Icon name="zap" size={34} /></div><div style={{ fontWeight: 600, color: "var(--ink-700)" }}>{current?.label} — coming soon</div></div>
          )}
        </main>
      </div>
    </div>
  );
}
