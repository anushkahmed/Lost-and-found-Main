// src/context/AuthContext.js
//
// Phase B: the access token lives ONLY in memory (tokenStore module).
// The refresh token is an httpOnly + Secure + SameSite=Strict cookie
// that we never touch from JS — the browser sends it to /api/auth/refresh
// automatically.
//
// Boot sequence:
//   1. AuthProvider mounts.
//   2. We POST /api/auth/refresh — if the refresh cookie is valid, the
//      server returns a fresh access token and the user identity. We
//      drop them in memory and render the app as logged-in.
//   3. If /refresh returns 401, the user is logged-out and we render
//      the login screen.

import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';
import { setAccessToken, clearAccessToken } from '../api/tokenStore';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  const persistUser = useCallback((data) => {
    if (data && data.token) setAccessToken(data.token);
    setUser({
      _id: data._id,
      name: data.name,
      email: data.email,
      role: data.role,
    });
  }, []);

  // Boot: try silent refresh from the httpOnly cookie.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.post('/api/auth/refresh');
        if (cancelled) return;
        persistUser(data);
      } catch {
        if (cancelled) return;
        clearAccessToken();
        setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [persistUser]);

  const login = async (email, password) => {
    const { data } = await axios.post('/api/auth/login', { email, password });
    if (data?.needsTwoFactor) return data; // caller handles 2FA step
    persistUser(data);
    return data;
  };

  const loginWith2fa = async (twoFactorToken, code) => {
    const { data } = await axios.post('/api/auth/2fa/login', { twoFactorToken, code });
    persistUser(data);
    return data;
  };

  const register = async (name, email, password, phone) => {
    const { data } = await axios.post('/api/auth/register', { name, email, password, phone });
    persistUser(data);
    return data;
  };

  const logout = useCallback(async () => {
    try { await axios.post('/api/auth/logout'); } catch { /* network/expired token — fine */ }
    clearAccessToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, loginWith2fa, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
