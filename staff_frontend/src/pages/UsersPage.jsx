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

const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
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

  // Edit modal state
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", username: "", email: "", phone: "", address: "", role: "customer", status: "active", password: "" });
  const [editErrors, setEditErrors] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editServerError, setEditServerError] = useState(null);

  // Fetch users
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get("/admin/users");
        await new Promise(r => setTimeout(r, 500));
        setAllUsers(data.users);
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

  const openEdit = (user) => {
    setEditUser(user);
    setEditForm({
      name: user.name || "",
      username: user.username || "",
      email: user.email || "",
      phone: user.phone || "",
      address: user.address || "",
      role: user.role || "customer",
      status: user.status || "active",
      password: "",
    });
    setEditErrors({});
    setEditServerError(null);
  };

  const closeEdit = () => {
    setEditUser(null);
    setEditForm({ name: "", username: "", email: "", phone: "", address: "", role: "customer", status: "active", password: "" });
    setEditErrors({});
    setEditServerError(null);
  };

  const validateEdit = () => {
    const errs = {};
    if (!editForm.name.trim()) errs.name = "Name is required.";
    if (!editForm.username.trim()) errs.username = "Username is required.";
    if (!editForm.email.trim()) errs.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email)) errs.email = "Invalid email format.";
    if (editForm.phone && !/^[+]?[\d\s\-()]{0,30}$/.test(editForm.phone)) errs.phone = "Invalid phone number.";
    if (editForm.password && editForm.password.length < 6) errs.password = "Password must be at least 6 characters.";
    setEditErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!validateEdit()) return;
    setEditSaving(true);
    setEditServerError(null);
    try {
      const payload = {
        name: editForm.name.trim(),
        username: editForm.username.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim() || null,
        address: editForm.address.trim() || null,
        role: editForm.role,
        status: editForm.status,
      };
      if (editForm.password.trim()) {
        payload.password = editForm.password;
      }
      await api.put(`/admin/users/${editUser.id}`, payload);
      setAllUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, ...payload, updatedAt: new Date().toISOString() } : u));
      closeEdit();
    } catch (err) {
      setEditServerError(err.response?.data?.message ?? "Failed to update user.");
    } finally {
      setEditSaving(false);
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

      {/* Edit User Modal */}
      {editUser && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,40,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: "32px 36px", maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)", animation: "fadeIn 0.2s ease" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 4, height: 24, background: tk.gold, borderRadius: 2 }} />
                <div style={{ fontSize: 18, color: tk.navy, fontWeight: 400 }}>Edit User</div>
              </div>
              <button onClick={closeEdit} style={{ background: "none", border: "none", fontSize: 18, color: tk.muted, cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>

            {editServerError && (
              <div style={{ background: tk.redBg, border: `1px solid ${tk.redBorder}`, borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 12, color: tk.red }}>
                {editServerError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 18px" }}>
              {/* Name */}
              <div style={{ gridColumn: "span 1" }}>
                <label style={{ display: "block", fontSize: 11, color: tk.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Name <span style={{ color: tk.red }}>*</span></label>
                <input
                  style={{ ...inputBase, width: "100%", borderColor: editErrors.name ? tk.red : tk.creamBorder }}
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                />
                {editErrors.name && <div style={{ fontSize: 11, color: tk.red, marginTop: 4 }}>{editErrors.name}</div>}
              </div>

              {/* Username */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: tk.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Username <span style={{ color: tk.red }}>*</span></label>
                <input
                  style={{ ...inputBase, width: "100%", borderColor: editErrors.username ? tk.red : tk.creamBorder }}
                  value={editForm.username}
                  onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))}
                />
                {editErrors.username && <div style={{ fontSize: 11, color: tk.red, marginTop: 4 }}>{editErrors.username}</div>}
              </div>

              {/* Email */}
              <div style={{ gridColumn: "span 1" }}>
                <label style={{ display: "block", fontSize: 11, color: tk.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Email <span style={{ color: tk.red }}>*</span></label>
                <input
                  type="email"
                  style={{ ...inputBase, width: "100%", borderColor: editErrors.email ? tk.red : tk.creamBorder }}
                  value={editForm.email}
                  onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                />
                {editErrors.email && <div style={{ fontSize: 11, color: tk.red, marginTop: 4 }}>{editErrors.email}</div>}
              </div>

              {/* Phone */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: tk.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Phone</label>
                <input
                  style={{ ...inputBase, width: "100%", borderColor: editErrors.phone ? tk.red : tk.creamBorder }}
                  value={editForm.phone}
                  onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                />
                {editErrors.phone && <div style={{ fontSize: 11, color: tk.red, marginTop: 4 }}>{editErrors.phone}</div>}
              </div>

              {/* Address */}
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: 11, color: tk.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Address</label>
                <input
                  style={{ ...inputBase, width: "100%" }}
                  value={editForm.address}
                  onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                />
              </div>

              {/* Role */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: tk.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Role <span style={{ color: tk.red }}>*</span></label>
                <select
                  style={{ ...inputBase, width: "100%" }}
                  value={editForm.role}
                  onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                >
                  <option value="customer">Customer</option>
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label style={{ display: "block", fontSize: 11, color: tk.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Status <span style={{ color: tk.red }}>*</span></label>
                <select
                  style={{ ...inputBase, width: "100%" }}
                  value={editForm.status}
                  onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              {/* Password */}
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: 11, color: tk.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>New Password <span style={{ color: tk.muted }}>(leave blank to keep current)</span></label>
                <input
                  type="password"
                  style={{ ...inputBase, width: "100%", borderColor: editErrors.password ? tk.red : tk.creamBorder }}
                  value={editForm.password}
                  onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Enter new password…"
                />
                {editErrors.password && <div style={{ fontSize: 11, color: tk.red, marginTop: 4 }}>{editErrors.password}</div>}
              </div>

              {/* Buttons */}
              <div style={{ gridColumn: "span 2", display: "flex", gap: 12, marginTop: 8 }}>
                <button type="button" onClick={closeEdit} style={{ flex: 1, padding: "12px", border: `1.5px solid ${tk.creamBorder}`, borderRadius: 10, background: "transparent", color: "#666", cursor: "pointer", fontFamily: "'Georgia', serif", fontSize: 13 }}>Cancel</button>
                <button type="submit" disabled={editSaving} style={{ flex: 1, padding: "12px", border: "none", borderRadius: 10, background: tk.gold, color: tk.navy, cursor: editSaving ? "not-allowed" : "pointer", fontFamily: "'Georgia', serif", fontSize: 13, fontWeight: 600 }}>
                  {editSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
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
        <div style={{ position: "relative", flex: 1 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: tk.muted, fontSize: 14, pointerEvents: "none" }}>⌕</span>
          <input style={{ ...inputBase, paddingLeft: 32, width: "100%" }} type="text" placeholder="Search by name, email or username…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select style={{ ...inputBase, width: 160 }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="all">All Roles</option>
          <option value="customer">Customers</option>
          <option value="employee">Employees</option>
          <option value="admin">Admins</option>
        </select>
        {(search || roleFilter !== "all") && (
          <button onClick={() => { setSearch(""); setRoleFilter("all"); }} style={{ padding: "10px 16px", borderRadius: 9, border: `1.5px solid ${tk.creamBorder}`, background: "transparent", color: tk.gold, fontSize: 11, cursor: "pointer", fontFamily: "'Georgia', serif", whiteSpace: "nowrap" }}>
            ✕ Reset
          </button>
        )}
        <div style={{ fontSize: 11, color: tk.muted, whiteSpace: "nowrap" }}>{filtered.length} user{filtered.length !== 1 ? "s" : ""}</div>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: `1px solid ${tk.creamBorder}`, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 120px 100px", gap: 0, padding: "12px 24px", background: tk.creamInput, borderBottom: `1px solid ${tk.creamBorder}` }}>
          {["Name / Username", "Email", "Role", "Status", "Created", "Actions"].map((h) => (
            <div key={h} style={{ fontSize: 10, color: tk.muted, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>{h}</div>
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
              <div>
                <div style={{ fontSize: 13, color: tk.navy, fontWeight: 500 }}>{u.name}</div>
                <div style={{ fontSize: 11, color: tk.muted, marginTop: 2 }}>@{u.username}</div>
              </div>
              <div style={{ fontSize: 12, color: "#555" }}>{u.email}</div>
              <div><Badge type="role" value={u.role} /></div>
              <div><Badge type="status" value={u.status} /></div>
              <div style={{ fontSize: 11, color: tk.muted }}>{formatDate(u.created_at || u.createdAt)}</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button
                  onClick={() => openEdit(u)}
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

      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default UsersPage;
