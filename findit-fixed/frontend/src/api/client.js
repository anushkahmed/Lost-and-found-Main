// src/api/client.js
//
// Installs global axios interceptors so EVERY request in the app
// automatically:
//   1. carries the in-memory access token as `Authorization: Bearer …`
//   2. sends cookies (`withCredentials: true`) so the refresh-token
//      cookie reaches /api/auth/refresh
//   3. on a 401, calls /api/auth/refresh exactly once (de-duped across
//      concurrent requests), updates the access token, and retries the
//      original request
//
// Imported once in src/index.js. Every existing `axios.get(...)` /
// `axios.post(...)` call in the app is automatically authenticated.

import axios from 'axios';
import { API_BASE_URL } from '../config';
import { getAccessToken, setAccessToken } from './tokenStore';

axios.defaults.baseURL = API_BASE_URL;
axios.defaults.withCredentials = true;

// ── Request: attach access token ────────────────────────────────
axios.interceptors.request.use((config) => {
  const t = getAccessToken();
  if (t) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${t}`;
  }
  return config;
});

// ── Response: refresh-on-401 (deduped) + retry once ─────────────
let refreshPromise = null;

const SAFE_PATHS = [
  '/api/auth/refresh',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/2fa/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
];

axios.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const original = error?.config || {};
    const status = error?.response?.status;
    const url = (original.url || '').toString();

    const isAuthEndpoint = SAFE_PATHS.some((p) => url.includes(p));
    const shouldTryRefresh =
      status === 401 &&
      !original._retry &&
      !isAuthEndpoint;

    if (!shouldTryRefresh) return Promise.reject(error);

    original._retry = true;
    try {
      if (!refreshPromise) {
        refreshPromise = axios
          .post('/api/auth/refresh')
          .finally(() => { refreshPromise = null; });
      }
      const refreshResp = await refreshPromise;
      const next = refreshResp?.data?.token;
      if (!next) throw new Error('refresh failed');
      setAccessToken(next);

      // Retry original with the new bearer (request interceptor adds it).
      return axios(original);
    } catch (e) {
      setAccessToken('');
      // We only force-redirect on a hard auth failure when the user is
      // trying to use a protected page; the AuthContext renders <Navigate
      // to="/login"/> on its own when `user` becomes null, but a hard
      // bounce is friendlier when the page never re-renders.
      if (typeof window !== 'undefined' &&
          !window.location.pathname.startsWith('/login') &&
          !window.location.pathname.startsWith('/register') &&
          !window.location.pathname.startsWith('/forgot-password') &&
          !window.location.pathname.startsWith('/reset-password')) {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
  }
);

export default axios;
