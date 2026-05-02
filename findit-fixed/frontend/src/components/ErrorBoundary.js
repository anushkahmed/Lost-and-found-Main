// src/components/ErrorBoundary.js
//
// Catches uncaught render errors so a single broken component does not
// blank out the whole app. In production we never display the raw error
// to the user (it can leak details about the codebase); we just show a
// friendly recovery card and log to the console for browser-devtools
// debugging.
//
// If you wire up Sentry or another browser monitor, hook it in
// componentDidCatch — see the comment block below.
import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('UI ErrorBoundary caught:', error, info?.componentStack);
    // ── Optional Sentry hook ──────────────────────────────────────
    // if (window.Sentry) {
    //   window.Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    // }
  }

  handleReload = () => {
    this.setState({ hasError: false });
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          padding: '2rem',
          textAlign: 'center',
          maxWidth: 480,
          margin: '60px auto',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          background: '#fff',
          boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
        <p style={{ color: '#6b7280', lineHeight: 1.5 }}>
          The page hit an unexpected error. Reloading usually fixes it. If it
          keeps happening, please contact a campus admin.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          style={{
            marginTop: 12,
            padding: '10px 18px',
            background: '#2563eb',
            color: '#fff',
            border: 0,
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Reload home
        </button>
      </div>
    );
  }
}
