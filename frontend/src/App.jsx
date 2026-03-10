// src/App.jsx
import { AuthProvider } from "./contexts/AuthContext";
import AppRoutes from "./routes/Approutes";

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}