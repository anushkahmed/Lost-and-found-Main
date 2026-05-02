import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { fileUrl } from '../config';

const T = {
  card: '#1e2130',
  border: 'rgba(255,255,255,0.08)',
  text: '#e2e8f0',
  muted: '#94a3b8',
  input: '#262b3d',
  primary: '#6366f1',
  success: '#34d399',
  danger: '#f87171',
};

export default function AdminUsersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [filters, setFilters] = useState({ search: '', role: '', active: '' });

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: '20' });
    Object.entries(filters).forEach(([k, v]) => { if (v !== '') p.set(k, v); });
    return p.toString();
  }, [filters, page]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/users?${query}`);
      setUsers(data.users);
      setTotal(data.total);
      setPages(data.pages);
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Failed to load users'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAdmin) fetchUsers(); }, [query, isAdmin]);

  const setRole = async (id, role) => {
    setMsg('');
    try {
      await axios.put(`/api/users/${id}/role`, { role });
      setUsers(prev => prev.map(u => u._id === id ? { ...u, role } : u));
      setMsg('✅ Role updated');
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Role update failed'));
    }
  };

  const setStatus = async (id, active) => {
    setMsg('');
    try {
      await axios.put(`/api/users/${id}/status`, { active });
      setUsers(prev => prev.map(u => u._id === id ? { ...u, active } : u));
      setMsg('✅ Status updated');
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Status update failed'));
    }
  };

  const setVerify = async (id, verifiedBadge) => {
    setMsg('');
    try {
      await axios.put(`/api/users/${id}/verify`, { verifiedBadge });
      setUsers(prev => prev.map(u => u._id === id ? { ...u, verifiedBadge } : u));
      setMsg('✅ Verified badge updated');
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Verify update failed'));
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, color: T.muted }}>
          🔒 Admin access only.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <h1 style={{ color: T.text, fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Admin — Manage Users</h1>
          <div style={{ color: T.muted, fontSize: 13 }}>View users, change roles, activate/deactivate accounts, and grant verified badges.</div>
        </div>
        <div style={{ color: T.muted, fontSize: 12, marginTop: 6 }}>Total: <b style={{ color: T.text }}>{total}</b></div>
      </div>

      {msg && (
        <div style={{
          marginBottom: 12,
          fontSize: 13,
          color: msg.startsWith('✅') ? T.success : T.danger,
          background: msg.startsWith('✅') ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${msg.startsWith('✅') ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
          borderRadius: 10,
          padding: '10px 12px'
        }}>
          {msg}
        </div>
      )}

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={label()}>Search</label>
            <input
              value={filters.search}
              onChange={e => { setPage(1); setFilters({ ...filters, search: e.target.value }); }}
              style={input()}
              placeholder="Name or email..."
            />
          </div>
          <div>
            <label style={label()}>Role</label>
            <select value={filters.role} onChange={e => { setPage(1); setFilters({ ...filters, role: e.target.value }); }} style={input()}>
              <option value="">All</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label style={label()}>Active</label>
            <select value={filters.active} onChange={e => { setPage(1); setFilters({ ...filters, active: e.target.value }); }} style={input()}>
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Deactivated</option>
            </select>
          </div>
          <button onClick={fetchUsers} style={btnPrimary()} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.2fr 0.8fr 0.8fr 0.8fr 1fr', padding: '10px 12px', borderBottom: `1px solid ${T.border}`, color: T.muted, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          <div>User</div>
          <div>Email</div>
          <div>Trust</div>
          <div>Role</div>
          <div>Active</div>
          <div>Actions</div>
        </div>

        {loading ? (
          <div style={{ padding: 22, color: T.muted }}>Loading users...</div>
        ) : users.length === 0 ? (
          <div style={{ padding: 22, color: T.muted }}>No users found.</div>
        ) : users.map(u => (
          <div key={u._id} style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.2fr 0.8fr 0.8fr 0.8fr 1fr', padding: '12px 12px', borderBottom: `1px solid ${T.border}`, alignItems: 'center', color: T.text }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.2)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#818cf8' }}>
                {u.profilePicture ? <img alt="avatar" src={fileUrl(u.profilePicture)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (u.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.name} {u.verifiedBadge && <span style={{ color: T.success, fontSize: 12 }}>✔</span>}
                </div>
                <div style={{ color: T.muted, fontSize: 11 }}>id: {u._id.slice(0, 8)}…</div>
              </div>
            </div>

            <div style={{ color: T.muted, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>

            <div style={{ fontWeight: 900 }}>
              <span style={{
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 11,
                border: `1px solid ${(u.trustScore || 0) >= 70 ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)'}`,
                background: (u.trustScore || 0) >= 70 ? 'rgba(16,185,129,0.10)' : 'rgba(245,158,11,0.10)',
                color: (u.trustScore || 0) >= 70 ? T.success : '#fbbf24'
              }}>
                {u.trustScore ?? 50}
              </span>
            </div>

            <div style={{ color: T.muted, fontSize: 12 }}>{u.role}</div>
            <div style={{ color: u.active === false ? T.danger : T.success, fontSize: 12, fontWeight: 800 }}>{u.active === false ? 'No' : 'Yes'}</div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
              <button onClick={() => setRole(u._id, u.role === 'admin' ? 'user' : 'admin')} style={btnGhostSmall()}>
                {u.role === 'admin' ? 'Make user' : 'Make admin'}
              </button>
              <button onClick={() => setStatus(u._id, !(u.active === false))} style={btnGhostSmall({ color: u.active === false ? T.success : T.danger })}>
                {u.active === false ? 'Activate' : 'Deactivate'}
              </button>
              <button onClick={() => setVerify(u._id, !u.verifiedBadge)} style={btnGhostSmall({ color: u.verifiedBadge ? T.danger : T.success })}>
                {u.verifiedBadge ? 'Unverify' : 'Verify'}
              </button>
            </div>
          </div>
        ))}

        {pages > 1 && (
          <div style={{ padding: 12, display: 'flex', justifyContent: 'center', gap: 8 }}>
            {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)} style={p === page ? btnPrimarySmall() : btnGhostSmall()}>
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function label() {
  return { display: 'block', fontSize: 10, color: T.muted, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 };
}

function input() {
  return { width: '100%', background: T.input, border: `1px solid ${T.border}`, borderRadius: 10, padding: '9px 12px', color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' };
}

function btnPrimary(extra = {}) {
  return { background: T.primary, color: 'white', border: 'none', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 800, cursor: 'pointer', ...extra };
}

function btnPrimarySmall(extra = {}) {
  return { background: T.primary, color: 'white', border: 'none', borderRadius: 10, padding: '6px 10px', fontSize: 12, fontWeight: 900, cursor: 'pointer', ...extra };
}

function btnGhostSmall(extra = {}) {
  return { background: '#262b3d', color: T.muted, border: `1px solid ${T.border}`, borderRadius: 10, padding: '6px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer', ...extra };
}

