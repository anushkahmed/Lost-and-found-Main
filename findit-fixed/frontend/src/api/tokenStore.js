// src/api/tokenStore.js
//
// Module-level holder for the short-lived access token (15-min JWT).
// Lives ONLY in JavaScript memory — never localStorage, never a cookie
// readable by JS. The refresh token is in an httpOnly cookie that the
// browser sends to /api/auth/refresh; we never see or read it.
//
// On a hard refresh, this variable resets to '' and the AuthContext calls
// /api/auth/refresh during boot to get a new access token from the cookie.

let accessToken = '';
const subscribers = new Set();

export const getAccessToken = () => accessToken;

export const setAccessToken = (next) => {
  accessToken = (typeof next === 'string') ? next : '';
  for (const cb of subscribers) {
    try { cb(accessToken); } catch { /* ignore subscriber errors */ }
  }
};

export const clearAccessToken = () => setAccessToken('');

// Optional: subscribe so other modules (e.g. SocketContext) can react.
// Returns an unsubscribe function.
export const onAccessTokenChange = (cb) => {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
};
