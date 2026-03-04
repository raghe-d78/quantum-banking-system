import { createContext, useContext, useState } from "react";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  const login = async (username, password) => {
    setError(null);
    // Replace this block with your real API call
    if (username && password) {
      setUser({ username });
      return true;
    } else {
      setError("Invalid credentials.");
      return false;
    }
  };

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook for easy consumption
export function useAuth() {
  return useContext(AuthContext);
}