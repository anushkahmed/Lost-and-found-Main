// src/pages/AdminLogsPage.js — System logs monitoring for admins
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const T = {
  card: '#1a2e20', border: 'rgba(74,124,111,0.22)', text: '#daeee6',
  muted: '#6b8f7a', accent: '#4a7c6f', high: '#b8d4c8',
  input: '#0f1a0f', success: '#34d399', danger: '#f87171', warn: '#fbbf24',
};

const LEVEL_STYLE = {
  info:  { bg: 'rgba(74,124,111,0.15)', color: T.success, label: 'INFO' },
  warn:  { bg: 'rgba(245,158,11,0.15)', color: T.warn, label: 'WARN' },
  error: { bg: 'rgba(239,68,68,0.15)',  color: T.danger, label: 'ERROR' },
};

export default function AdminLogsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [summary, setSummary] = useState(null);

  const [levelFilter, setLevelFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (levelFilter) params.set('level', levelFilter);
      if (actionFilter) params.set('action', actionFilter);
      const { data } = await axios.get(`/api/admin/logs?${params}`);
      setLogs(data.logs);
      setTotal(data.total);
      setPages(data.pages);
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Failed to load logs'));
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const { data } = await axios.get('/api/admin/logs/summary');
      setSummary(data);
    } catch {}
  };

  useEffect(() => { if (isAdmin) { fetchLogs(); fetchSummary(); } }, [isAdmin, page, levelFilter, actionFilter]);

  const clearOld = async () => {
    setMsg('');
    try {
      const { data } = await axios.delete('/api/admin/logs/clear');
      setMsg('✅ ' + data.message);
      fetchLogs();
      fetchSummary();
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Clear failed'));
    }
  };

  if (!isAdmin) return <div style={{ padding: 24, color: T.muted }}>🔒 Admin only.</div>;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <h2 style={{ color: T.high, fontSize: 22, margin: 0 }}>🖥️ System Logs</h2>
          <p style={{ color: T.muted, fontSize: 13, marginTop: 4 }}>Monitor authentication events, security alerts, and system activity.</p>
        </div>
        <button onClick={clearOld} style={btnDanger}>🗑 Clear logs older than 30 days</button>
      </div>

      {msg && (
        <div style={{
          marginBottom: 14, fontSize: 13, padding: '10px 14px', borderRadius: 10,
          color: msg.startsWith('✅') ? T.success : T.danger,
          background: msg.startsWith('✅') ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${msg.startsWith('✅') ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
        }}>{msg}</div>
      )}

      {/* Summary cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
          <StatCard label="Total logs" value={summary.total} color={T.high} />
          <StatCard label="Errors (24h)" value={summary.last24h.errors} color={T.danger} />
          <StatCard label="Warnings (24h)" value={summary.last24h.warnings} color={T.warn} />
          <StatCard label="Info (24h)" value={summary.last24h.info} color={T.success} />
          <StatCard label="Last 7 days" value={summary.total7d} color={T.accent} />
        </div>
      )}

      {/* Filters */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>Level</label>
            <select value={levelFilter} onChange={e => { setPage(1); setLevelFilter(e.target.value); }} style={inputStyle}>
              <option value="">All</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={labelStyle}>Action</label>
            <input value={actionFilter} onChange={e => { setPage(1); setActionFilter(e.target.value); }}
              style={inputStyle} placeholder="Filter by action (e.g. user_login)..." />
          </div>
          <div style={{ color: T.muted, fontSize: 12 }}>Total: <b style={{ color: T.text }}>{total}</b></div>
        </div>
      </div>

      {/* Logs table */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1.5fr 2fr 120px', padding: '10px 14px', borderBottom: `1px solid ${T.border}`, color: T.muted, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          <div>Level</div><div>Action</div><div>Message</div><div>User / IP</div><div>Time</div>
        </div>

        {loading ? (
          <div style={{ padding: 22, color: T.muted }}>Loading logs...</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 22, color: T.muted }}>No logs found.</div>
        ) : logs.map(log => {
          const ls = LEVEL_STYLE[log.level] || LEVEL_STYLE.info;
          return (
            <div key={log._id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1.5fr 2fr 120px', padding: '10px 14px', borderBottom: `1px solid ${T.border}`, alignItems: 'center', color: T.text, fontSize: 12 }}>
              <div>
                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 800, background: ls.bg, color: ls.color }}>
                  {ls.label}
                </span>
              </div>
              <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 11 }}>{log.action}</div>
              <div style={{ color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.message}</div>
              <div style={{ color: T.muted, fontSize: 11 }}>
                {log.userId ? `${log.userId.name || 'Unknown'} (${log.userId.email || ''})` : '—'}
                {log.ip && <span style={{ marginLeft: 6, color: T.accent }}>IP: {log.ip}</span>}
              </div>
              <div style={{ color: T.muted, fontSize: 11 }}>{new Date(log.createdAt).toLocaleString()}</div>
            </div>
          );
        })}

        {pages > 1 && (
          <div style={{ padding: 12, display: 'flex', justifyContent: 'center', gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={btnPageGhost}>← Prev</button>
            <span style={{ color: T.muted, fontSize: 12, padding: '6px 10px' }}>Page {page} of {pages}</span>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} style={btnPageGhost}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 10, color: '#6b8f7a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 };
const inputStyle = { width: '100%', background: '#0f1a0f', border: '1px solid rgba(74,124,111,0.22)', borderRadius: 9, padding: '8px 11px', color: '#daeee6', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
const btnDanger = { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const btnPageGhost = { background: 'rgba(74,124,111,0.12)', color: '#6b8f7a', border: '1px solid rgba(74,124,111,0.22)', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
