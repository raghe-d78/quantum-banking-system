// staff_frontend/src/App.jsx
import { AuthProvider } from "./contexts/AuthContext";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import LoginPage          from "./pages/LoginPage";
import AdminDashboard     from "./components/dashboard/Admin";
import EmployeeDashboard  from "./components/dashboard/EmployeeDashboard";
import ProtectedRoute     from "./components/ProtectedRoute";
import UsersPage from "./pages/UsersPage";
import EditUserPage from "./pages/edituserpage";

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Admin only */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          

          {/* Employee */}
          <Route
            path="/employee"
            element={
              <ProtectedRoute role="employee">
                <EmployeeDashboard />
              </ProtectedRoute>
            }
          />

          {/* Unauthorized */}
          <Route path="/unauthorized" element={
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"Georgia", flexDirection:"column", gap:16, color:"#0a1628" }}>
              <div style={{ fontSize:48 }}>⛔</div>
              <div style={{ fontSize:18, fontWeight:600 }}>Access Denied</div>
              <div style={{ fontSize:13, color:"#aaa" }}>You don't have permission to view this page.</div>
              <a href="/login" style={{ fontSize:13, color:"#c9a84c", marginTop:8 }}>← Back to Login</a>
            </div>
          } />

          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}