// staff_frontend/src/pages/UsersPage.jsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";

const tk = {
  navy: "#0a1628", navyMid: "#1a3a6b", gold: "#c9a84c", goldLight: "#e8d48b",
  cream: "#f5f3ef", creamBorder: "#e8e2d8", creamInput: "#faf8f5", muted: "#aaa",
  green: "#16a34a", greenBg: "rgba(34,197,94,0.08)", greenBorder: "rgba(34,197,94,0.22)",
  red: "#dc2626", redBg: "rgba(239,68,68,0.07)", redBorder: "rgba(239,68,68,0.22)",
  orange: "#d97706", orangeBg: "rgba(217,119,6,0.08)",
};

// ── Mock data (remove when backend ready) ────────────────────────
const MOCK_USERS = [
  { id:"uuid-001", username:"mohamed.benali",  name:"Mohamed Ben Ali",   email:"m.benali@banque.tn",   role:"customer",  createdAt:"12 Jan 2026", status:"active"   },
  { id:"uuid-002", username:"sarra.trabelsi",  name:"Sarra Trabelsi",    email:"s.trabelsi@banque.tn", role:"customer",  createdAt:"15 Jan 2026", status:"active"   },
  { id:"uuid-003", username:"karim.mansouri",  name:"Karim Mansouri",    email:"k.mansouri@banque.tn", role:"customer",  createdAt:"20 Jan 2026", status:"suspended"},
  { id:"uuid-004", username:"leila.sfaxi",     name:"Leila Sfaxi",       email:"l.sfaxi@banque.tn",    role:"customer",  createdAt:"03 Feb 2026", status:"active"   },
  { id:"uuid-005", username:"amine.gharbi",    name:"Amine Gharbi",      email:"a.gharbi@banque.tn",   role:"employee",  createdAt:"01 Dec 2025", status:"active"   },
  { id:"uuid-006", username:"nour.hamdi",      name:"Nour Hamdi",        email:"n.hamdi@banque.tn",    role:"employee",  createdAt:"15 Nov 2025", status:"active"   },
  { id:"uuid-007", username:"khalil.admin",    name:"Khalil Admin",      email:"k.admin@banque.tn",    role:"admin",     createdAt:"01 Oct 2025", status:"active"   },
  { id:"uuid-008", username:"youssef.beji",    name:"Youssef Beji",      email:"y.beji@banque.tn",     role:"customer",  createdAt:"10 Feb 2026", status:"active"   },
  { id:"uuid-009", username:"rania.bouaziz",   name:"Rania Bouaziz",     email:"r.bouaziz@banque.tn",  role:"customer",  createdAt:"18 Feb 2026", status:"active"   },
  { id:"uuid-010", username:"tarek.jendoubi",  name:"Tarek Jendoubi",    email:"t.jendoubi@banque.tn", role:"customer",  createdAt:"22 Feb 2026", status:"suspended"},
];

const ROLE_CFG = {
  customer: { label: "Customer",  bg: "rgba(29,78,216,0.08)",  color: "#1d4ed8", border: "rgba(29,78,216,0.2)"  },
  employee: { label: "Employee",  bg: "rgba(14,78,53,0.08)",   color: "#0f4c35", border: "rgba(14,78,53,0.2)"   },
  admin:    { label: "Admin",     bg: "rgba(201,168,76,0.12)", color: "#92400e", border: "rgba(201,168,76,0.35)" },
};
const STATUS_CFG = {
  active:    { label: "Active",    bg: tk.greenBg,  color: tk.green,  border: tk.greenBorder },
  suspended: { label: "Suspended", bg: tk.redBg,    color: tk.red,    border: tk.redBorder   },
};

const Badge = ({ type, value }) => {
  const cfg = (type === "role" ? ROLE_CFG : STATUS_CFG)[value] || {};
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      {cfg.label}
    </span>
  );
};

const inputBase = {
  padding: "10px 14px", border: `1.5px solid ${tk.creamBorder}`, borderRadius: 9,
  fontSize: 12, color: tk.navy, background: tk.creamInput, outline: "none",
  fontFamily: "'Georgia', serif", boxSizing: "border-box",
};

const UsersPage = () => {
  const navigate = useNavigate();
  const [allUsers,   setAllUsers]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [search,     setSearch]     = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [deleteId,   setDeleteId]   = useState(null);
  const [deleting,   setDeleting]   = useState(false);
  const [deleteError,setDeleteError]= useState(null);

  // Fetch users
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // TODO: replace mock with: const { data } = await api.get("/admin/users");
        await new Promise(r => setTimeout(r, 500));
        setAllUsers(MOCK_USERS);
      } catch (err) {
        setError(err.response?.data?.message ?? "Failed to load users.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Filter
  const filtered = useMemo(() => allUsers.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !search || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
    const matchRole   = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  }), [allUsers, search, roleFilter]);

  // Stats
  const stats = useMemo(() => ({
    total:    allUsers.length,
    customers:allUsers.filter(u => u.role === "customer").length,
    employees:allUsers.filter(u => u.role === "employee").length,
    admins:   allUsers.filter(u => u.role === "admin").length,
    suspended:allUsers.filter(u => u.status === "suspended").length,
  }), [allUsers]);

  const handleDelete = async (id) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/admin/users/${id}`);
      setAllUsers(prev => prev.filter(u => u.id !== id));
      setDeleteId(null);
    } catch (err) {
      setDeleteError(err.response?.data?.message ?? "Failed to delete user.");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320, gap: 16, color: tk.muted }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${tk.creamBorder}`, borderTopColor: tk.gold, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ background: "#fff", borderRadius: 16, padding: "40px 32px", textAlign: "center", border: `1px solid ${tk.redBorder}`, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>⚠️</div>
      <div style={{ fontSize: 14, color: tk.red, fontWeight: 600, marginBottom: 8 }}>Failed to load users</div>
      <div style={{ fontSize: 12, color: tk.muted, marginBottom: 20 }}>{error}</div>
      <button onClick={() => window.location.reload()} style={{ fontSize: 12, color: tk.gold, background: "none", border: `1px solid ${tk.gold}`, borderRadius: 8, padding: "8px 20px", cursor: "pointer" }}>Retry</button>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Georgia', serif", maxWidth: 1100, margin: "0 auto" }}>

      {/* Delete confirm modal */}
      {deleteId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,40,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: "36px 40px", maxWidth: 400, width: "100%", textAlign: "center", boxShadow: "0 24px 64px rgba(0,0,0,0.2)", animation: "fadeIn 0.2s ease" }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: tk.redBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: tk.red, margin: "0 auto 20px" }}>⚠</div>
            <div style={{ fontSize: 16, color: tk.navy, fontWeight: 600, marginBottom: 8 }}>Delete User?</div>
            <div style={{ fontSize: 13, color: tk.muted, marginBottom: 8 }}>
              {allUsers.find(u => u.id === deleteId)?.name}
            </div>
            <div style={{ fontSize: 12, color: tk.muted, marginBottom: 24 }}>This action cannot be undone.</div>
            {deleteError && <div style={{ fontSize: 12, color: tk.red, marginBottom: 16 }}>{deleteError}</div>}
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => { setDeleteId(null); setDeleteError(null); }} style={{ flex: 1, padding: "12px", border: `1.5px solid ${tk.creamBorder}`, borderRadius: 10, background: "transparent", color: "#666", cursor: "pointer", fontFamily: "'Georgia', serif", fontSize: 13 }}>Cancel</button>
              <button onClick={() => handleDelete(deleteId)} disabled={deleting} style={{ flex: 1, padding: "12px", border: "none", borderRadius: 10, background: tk.red, color: "#fff", cursor: deleting ? "not-allowed" : "pointer", fontFamily: "'Georgia', serif", fontSize: 13, fontWeight: 600 }}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <div style={{ width: 4, height: 28, background: tk.gold, borderRadius: 2 }} />
          <h1 style={{ margin: 0, fontSize: 22, color: tk.navy, fontWeight: 400 }}>All Users</h1>
        </div>
        <p style={{ margin: "0 0 0 16px", color: tk.muted, fontSize: 13 }}>Manage system users — customers, employees and admins</p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Users",  value: stats.total,     color: tk.navy,   bg: "#fff"                    },
          { label: "Customers",    value: stats.customers, color: "#1d4ed8", bg: "rgba(29,78,216,0.05)"    },
          { label: "Employees",    value: stats.employees, color: tk.green,  bg: tk.greenBg               },
          { label: "Admins",       value: stats.admins,    color: "#92400e", bg: "rgba(201,168,76,0.08)"   },
          { label: "Suspended",    value: stats.suspended, color: tk.red,    bg: tk.redBg                  },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: "16px 18px", border: `1px solid ${tk.creamBorder}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize: 10, color: tk.muted, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 300, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "18px 22px", marginBottom: 18, border: `1px solid ${tk.creamBorder}`, boxShadow: "0 1px 6px rgba(0,0,0,0.04)", display: "flex", gap: 12, alignItems: "center" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: 1 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: tk.muted, fontSize: 14, pointerEvents: "none" }}>⌕</span>
          <input style={{ ...inputBase, paddingLeft: 32, width: "100%" }} type="text" placeholder="Search by name, email or username…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {/* Role filter */}
        <select style={{ ...inputBase, width: 160 }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="all">All Roles</option>
          <option value="customer">Customers</option>
          <option value="employee">Employees</option>
          <option value="admin">Admins</option>
        </select>
        {/* Reset */}
        {(search || roleFilter !== "all") && (
          <button onClick={() => { setSearch(""); setRoleFilter("all"); }} style={{ padding: "10px 16px", borderRadius: 9, border: `1.5px solid ${tk.creamBorder}`, background: "transparent", color: tk.gold, fontSize: 11, cursor: "pointer", fontFamily: "'Georgia', serif", whiteSpace: "nowrap" }}>
            ✕ Reset
          </button>
        )}
        <div style={{ fontSize: 11, color: tk.muted, whiteSpace: "nowrap" }}>{filtered.length} user{filtered.length !== 1 ? "s" : ""}</div>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: `1px solid ${tk.creamBorder}`, overflow: "hidden" }}>

        {/* Header row */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 120px 100px", gap: 0, padding: "12px 24px", background: tk.creamInput, borderBottom: `1px solid ${tk.creamBorder}` }}>
          {["Name / Username", "Email", "Role", "Status", "Created", "Actions"].map((h, i) => (
            <div key={h} style={{ fontSize: 10, color: tk.muted, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600, textAlign: i === 5 ? "center" : "left" }}>{h}</div>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "56px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 36, color: tk.creamBorder, marginBottom: 12 }}>◈</div>
            <div style={{ fontSize: 13, color: tk.muted }}>No users match your filters</div>
          </div>
        ) : (
          filtered.map((u, i) => (
            <div key={u.id} style={{
              display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 120px 100px",
              alignItems: "center", gap: 0,
              padding: "14px 24px",
              borderBottom: i < filtered.length - 1 ? `1px solid #f5f0e8` : "none",
              transition: "background 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.background = tk.creamInput}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              {/* Name + username */}
              <div>
                <div style={{ fontSize: 13, color: tk.navy, fontWeight: 500 }}>{u.name}</div>
                <div style={{ fontSize: 11, color: tk.muted, marginTop: 2 }}>@{u.username}</div>
              </div>

              {/* Email */}
              <div style={{ fontSize: 12, color: "#555" }}>{u.email}</div>

              {/* Role */}
              <div><Badge type="role" value={u.role} /></div>

              {/* Status */}
              <div><Badge type="status" value={u.status} /></div>

              {/* Created */}
              <div style={{ fontSize: 11, color: tk.muted }}>{u.createdAt}</div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button
                  onClick={() => navigate(`/admin/users/${u.id}/edit`)}
                  title="Edit user"
                  style={{ width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${tk.creamBorder}`, background: "transparent", color: tk.navy, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, transition: "all 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.background = tk.navy; e.currentTarget.style.color = tk.goldLight; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = tk.navy; }}
                >
                  ✎
                </button>
                <button
                  onClick={() => setDeleteId(u.id)}
                  title="Delete user"
                  style={{ width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${tk.redBorder}`, background: "transparent", color: tk.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, transition: "all 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.background = tk.red; e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = tk.red; }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
};

export default UsersPage;