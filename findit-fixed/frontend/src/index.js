// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './theme.css';
import './api/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

// PWA service worker — registered only in production builds (CRA serves SW from /service-worker.js)
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}
