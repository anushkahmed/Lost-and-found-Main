// src/config.js — single source of truth for the backend URL
// Set REACT_APP_API_URL in frontend/.env.production (or .env.local) to override.
// Falls back to http://localhost:5000 in dev.

export const API_BASE_URL =
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) ||
  'http://localhost:5000';

// Build a public URL for an upload path stored on the server (e.g. uploads/items/abc.png)
export const fileUrl = (relPath) => {
  if (!relPath) return '';
  if (/^https?:\/\//i.test(relPath)) return relPath;
  const clean = String(relPath).replace(/^\/+/, '');
  return `${API_BASE_URL}/${clean}`;
};
