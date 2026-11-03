import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Accounts (see auth.js on the server). The sign-in token lives in localStorage
// under "zatla_token"; on load it is sent to /api/auth/me, which says who it
// belongs to. `user` is { id, email, role, createdAt } or null. The Studio is
// still open to everyone: nothing here is required to use it, and the rest of
// the shape (isAuthenticated, authChecked, ...) is what its components already read.
import { apiUrl } from '@/lib/api';

export const TOKEN_KEY = 'zatla_token';

// Where to send a visitor after logging in: the ?redirect= they were bounced
// with, but only a path on this site (never another address).
export const redirectTarget = (search) => {
  const r = new URLSearchParams(search).get('redirect') || '';
  return r.startsWith('/') && !r.startsWith('//') && !r.startsWith('/\\') ? r : '/';
};

// localStorage can be blocked or throw (private windows, cleared site data).
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
const setStoredToken = (t) => { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* the session just won't survive a reload */ } };

const AuthContext = createContext({
  user: null,
  token: '',
  isAuthenticated: false,
  isLoadingAuth: false,
  isLoadingPublicSettings: false,
  appPublicSettings: null,
  authError: null,
  authChecked: true,
  login: () => {},
  logout: async () => {},
  navigateToLogin: () => {},
  checkUserAuth: async () => {},
  checkAppState: async () => {},
});

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(getToken);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(!getToken());

  // Who does the stored token belong to? A 401 means it's expired or was
  // cancelled, so it is dropped; any other failure (offline, server down) keeps
  // it, so a hiccup doesn't sign anyone out.
  const checkUserAuth = useCallback(async () => {
    const t = getToken();
    if (!t) { setToken(''); setUser(null); setAuthChecked(true); return; }
    try {
      const res = await fetch(apiUrl('/api/auth/me'), { headers: { Authorization: `Bearer ${t}` } });
      if (res.status === 401) { setStoredToken(''); setToken(''); setUser(null); }
      else {
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.user) setUser(data.user);
      }
    } catch { /* offline: keep the token, try again next load */ }
    setAuthChecked(true);
  }, []);

  useEffect(() => { checkUserAuth(); }, [checkUserAuth]);

  // After /login or /register succeeds: keep the token and the user it returned.
  const login = useCallback((newToken, newUser) => {
    setStoredToken(newToken);
    setToken(newToken);
    setUser(newUser || null);
    setAuthChecked(true);
  }, []);

  // Clears the token first, so the visitor is signed out here even if the
  // server can't be reached; /logout then cancels the token server-side.
  const logout = useCallback(async () => {
    const t = getToken();
    setStoredToken('');
    setToken('');
    setUser(null);
    if (!t) return;
    try { await fetch(apiUrl('/api/auth/logout'), { method: 'POST', headers: { Authorization: `Bearer ${t}` } }); } catch { /* already signed out here */ }
  }, []);

  const value = useMemo(() => ({
    user,
    token,
    isAuthenticated: !!user,
    isLoadingAuth: !authChecked,
    isLoadingPublicSettings: false,
    appPublicSettings: null,
    authError: null,
    authChecked,
    login,
    logout,
    navigateToLogin: () => window.location.assign('/login'),
    checkUserAuth,
    checkAppState: async () => {},
  }), [user, token, authChecked, login, logout, checkUserAuth]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
