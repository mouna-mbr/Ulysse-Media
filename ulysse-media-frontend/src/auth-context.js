import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authRequest, request } from './api';

const AuthContext = createContext(null);
const STORAGE_KEY = 'ulysse_auth';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      setLoading(false);
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(saved);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      setLoading(false);
      return;
    }

    if (!parsed?.token) {
      localStorage.removeItem(STORAGE_KEY);
      setLoading(false);
      return;
    }

    setToken(parsed.token);

    authRequest('/auth/me', parsed.token)
      .then((result) => setUser(result.user))
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const result = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    setToken(result.token);
    setUser(result.user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: result.token }));
    return result.user;
  };

  const registerClient = async (payload) => {
    const result = await request('/auth/register-client', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    setToken(result.token);
    setUser(result.user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: result.token }));
    return result.user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const value = useMemo(
    () => ({ token, user, loading, login, registerClient, logout }),
    [token, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
