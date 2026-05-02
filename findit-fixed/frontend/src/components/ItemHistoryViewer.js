import React, { useEffect, useState } from 'react';
import axios from 'axios';

const ACTION_LABEL = {
  'created':         { label: 'Created',         icon: '📦', color: '#818cf8' },
  'edited':          { label: 'Edited',          icon: '✏️', color: '#94a3b8' },
  'renewed':         { label: 'Renewed',         icon: '🔄', color: '#34d399' },
  'deleted':         { label: 'Deleted',         icon: '🗑',  color: '#f87171' },
  'claim:approved':  { label: 'Claim approved',  icon: '✅', color: '#34d399' },
  'claim:rejected':  { label: 'Claim rejected',  icon: '❌', color: '#f87171' },
};

const labelFor = (action) => {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  if (action.startsWith('status:')) {
    return { label: `Status → ${action.split(':')[1]}`, icon: '🔁', color: '#fbbf24' };
  }
  return { label: action, icon: '•', color: '#94a3b8' };
};

export default function ItemHistoryViewer({ itemId }) {
  const [open, setOpen]       = useState(false);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');

  const load = async () => {
    if (history) return;
    setLoading(true); setErr('');
    try {
      const { data } = await axios.get(`/api/items/${itemId}/history`);
      setHistory(data);
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) load();
  };

  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={toggle}
        style={{
          width: '100%', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.08)',
          color: '#94a3b8', borderRadius: 8, padding: '8px 12px',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
        <span>📜 Item history</span>
        <span style={{ fontSize: 11 }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div style={{
          marginTop: 8, background: 'rgba(0,0,0,0.18)',
          border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
          padding: 12, maxHeight: 280, overflowY: 'auto'
        }}>
          {loading && <div style={{ color: '#94a3b8', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ color: '#f87171', fontSize: 12 }}>{err}</div>}
          {history && history.length === 0 && (
            <div style={{ color: '#94a3b8', fontSize: 12 }}>No history entries yet.</div>
          )}
          {history && history.length > 0 && (
            <div style={{ position: 'relative' }}>
              {history.map((h, i) => {
                const meta = labelFor(h.action);
                return (
                  <div key={h._id || i} style={{ display: 'flex', gap: 10, paddingBottom: 10, position: 'relative' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: `${meta.color}22`, border: `1px solid ${meta.color}55`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, flexShrink: 0
                    }}>{meta.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>
                        {meta.label}
                        {h.fromStatus && h.toStatus && h.fromStatus !== h.toStatus && (
                          <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>
                            ({h.fromStatus} → {h.toStatus})
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {h.changedBy?.name ? `${h.changedBy.name} (${h.changedBy.role})` : 'System'}
                        {' · '}
                        {new Date(h.createdAt).toLocaleString()}
                      </div>
                      {h.meta && Object.keys(h.meta).length > 0 && (
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, fontFamily: 'monospace' }}>
                          {Object.entries(h.meta).slice(0, 3).map(([k, v]) =>
                            `${k}: ${typeof v === 'object' ? JSON.stringify(v).slice(0, 30) : String(v).slice(0, 30)}`
                          ).join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
