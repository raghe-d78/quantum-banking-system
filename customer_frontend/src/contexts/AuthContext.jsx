// customer_frontend/src/contexts/AuthContext.jsx
import { createContext, useContext, useState } from "react";
import api from "../lib/api";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [error, setError] = useState(null);

 const login = async (username, password) => {
  setError(null);

  try {
    const { data } = await api.post("/auth/customer/login", {
      username,
      password,
    });

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    setUser(data.user);
    return true;

  } catch (err) {
    setError(
      err.response?.data?.message ??
      "Invalid credentials. Please try again."
    );
    return false;
  }
};

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}