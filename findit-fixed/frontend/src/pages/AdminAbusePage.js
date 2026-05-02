import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const T = {
  card:   '#1a2e20',
  border: 'rgba(74,124,111,0.22)',
  text:   '#daeee6',
  muted:  '#6b8f7a',
  high:   '#b8d4c8',
  danger: '#f87171',
  ok:     '#34d399',
  accent: '#4a7c6f',
};

export default function AdminAbusePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [reports, setReports] = useState([]);
  const [filter, setFilter]   = useState('open');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg]         = useState('');
  const [acting, setActing]   = useState({});

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/abuse?status=${filter}`);
      setReports(data);
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Failed to load reports'));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { if (isAdmin) fetchReports(); }, [fetchReports, isAdmin]);

  const resolve = async (id, status) => {
    setActing(a => ({ ...a, [id]: status }));
    setMsg('');
    try {
      const note = window.prompt(`Optional resolution note (${status})?`, '');
      if (note === null) { setActing(a => ({ ...a, [id]: null })); return; }
      await axios.put(`/api/abuse/${id}`, { status, resolutionNote: note });
      setMsg(`✅ Report marked ${status}`);
      fetchReports();
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Action failed'));
    } finally {
      setActing(a => ({ ...a, [id]: null }));
    }
  };

  if (!isAdmin) return <div style={{ padding: '2rem', color: T.text }}>Admin only.</div>;

  return (
    <div style={{ padding: '24px 28px', color: T.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h2 style={{ margin: 0, color: T.high, fontSize: 22 }}>🚩 Abuse Reports</h2>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          style={{ background: '#262b3d', color: T.text, border: `1px solid ${T.border}`, padding: '8px 12px', borderRadius: 8 }}>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
          <option value="all">All</option>
        </select>
      </div>

      {msg && <div style={{ marginBottom: 12, color: msg.startsWith('✅') ? T.ok : T.danger }}>{msg}</div>}

      {loading ? <div style={{ color: T.muted }}>Loading…</div> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {reports.length === 0 && (
            <div style={{ color: T.muted, padding: 20, textAlign: 'center', background: T.card, border: `1px solid ${T.border}`, borderRadius: 12 }}>
              No reports found for filter "{filter}".
            </div>
          )}
          {reports.map(r => (
            <div key={r._id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                      background: r.status === 'open' ? 'rgba(248,113,113,0.18)' : 'rgba(74,124,111,0.18)',
                      color: r.status === 'open' ? T.danger : T.muted,
                      textTransform: 'uppercase', letterSpacing: 0.5
                    }}>{r.status}</span>
                    <span style={{ fontSize: 12, color: T.muted }}>
                      {new Date(r.createdAt).toLocaleString()}
                    </span>
                    <span style={{ fontSize: 12, color: T.high, fontWeight: 600 }}>
                      Reason: {r.reason}
                    </span>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <strong style={{ color: T.high }}>Reported by:</strong>{' '}
                    <span style={{ color: T.text }}>
                      {r.reporterId?.name || 'Unknown'} ({r.reporterId?.email || '—'})
                    </span>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <strong style={{ color: T.high }}>Target:</strong>{' '}
                    {r.targetType === 'item' ? (
                      r.targetItemId ? (
                        <span>📦 Item: <strong>{r.targetItemId.name}</strong> ({r.targetItemId.status})</span>
                      ) : <span style={{ color: T.muted }}>Item deleted</span>
                    ) : (
                      r.targetUserId ? (
                        <span>👤 User: <strong>{r.targetUserId.name}</strong> ({r.targetUserId.email})</span>
                      ) : <span style={{ color: T.muted }}>User deleted</span>
                    )}
                  </div>
                  {r.details && (
                    <div style={{ marginTop: 8, padding: 10, background: 'rgba(0,0,0,0.18)', borderRadius: 8, fontSize: 13, color: T.text }}>
                      "{r.details}"
                    </div>
                  )}
                  {r.resolutionNote && (
                    <div style={{ marginTop: 6, fontSize: 12, color: T.muted }}>
                      Resolution note: {r.resolutionNote}
                    </div>
                  )}
                </div>
                {r.status === 'open' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button onClick={() => resolve(r._id, 'resolved')} disabled={!!acting[r._id]}
                      style={{ background: T.ok, color: '#0f1a0f', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      {acting[r._id] === 'resolved' ? '…' : 'Resolve'}
                    </button>
                    <button onClick={() => resolve(r._id, 'dismissed')} disabled={!!acting[r._id]}
                      style={{ background: 'transparent', color: T.muted, border: `1px solid ${T.border}`, padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {acting[r._id] === 'dismissed' ? '…' : 'Dismiss'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
