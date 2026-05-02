import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { fileUrl } from '../config';

const T = {
  bg:     '#0f1a0f',
  card:   '#1a2e20',
  border: 'rgba(74,124,111,0.22)',
  text:   '#daeee6',
  muted:  '#6b8f7a',
  high:   '#b8d4c8',
  accent: '#4a7c6f',
  gold:   '#fbbf24',
  silver: '#cbd5e1',
  bronze: '#d97706',
};

export default function LeaderboardPage() {
  const [metric, setMetric] = useState('points');
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg]       = useState('');

  useEffect(() => {
    setLoading(true);
    axios.get(`/api/leaderboard?metric=${metric}&limit=25`)
      .then(({ data }) => setData(data))
      .catch(err => setMsg('❌ ' + (err.response?.data?.message || 'Failed to load')))
      .finally(() => setLoading(false));
  }, [metric]);

  const medalFor = (rank) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

  return (
    <div style={{ padding: '24px 28px', color: T.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, color: T.high, fontSize: 22 }}>🏆 Reputation Leaderboard</h2>
          <div style={{ color: T.muted, fontSize: 13, marginTop: 4 }}>
            Top campus users — earn points by posting found items and helping return belongings.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 4 }}>
          {[
            { key: 'points', label: 'Reward points' },
            { key: 'trust',  label: 'Trust score' },
          ].map(opt => (
            <button key={opt.key} onClick={() => setMetric(opt.key)}
              style={{
                background: metric === opt.key ? T.accent : 'transparent',
                color: metric === opt.key ? T.high : T.muted,
                border: 'none', padding: '6px 14px', borderRadius: 7,
                fontSize: 12, fontWeight: 600, cursor: 'pointer'
              }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {msg && <div style={{ color: '#f87171', marginBottom: 12 }}>{msg}</div>}

      {data?.me && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(74,124,111,0.25), rgba(74,124,111,0.05))',
          border: `1px solid ${T.accent}`, borderRadius: 12, padding: 14, marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 14
        }}>
          <div style={{ fontSize: 28 }}>{medalFor(data.me.rank)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: T.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Your rank</div>
            <div style={{ color: T.high, fontSize: 16, fontWeight: 700, marginTop: 2 }}>
              {data.me.name} {data.me.verifiedBadge && <span style={{ color: '#34d399' }}>✓</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: T.high, fontSize: 22, fontWeight: 800 }}>{data.me.score}</div>
            <div style={{ color: T.muted, fontSize: 11 }}>{metric === 'points' ? 'points' : 'trust'}</div>
          </div>
        </div>
      )}

      {loading && <div style={{ color: T.muted }}>Loading…</div>}

      {data && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(74,124,111,0.12)', color: T.muted, textAlign: 'left' }}>
                <th style={{ padding: '10px 14px', width: 70 }}>Rank</th>
                <th style={{ padding: '10px 14px' }}>User</th>
                <th style={{ padding: '10px 14px', width: 100, textAlign: 'right' }}>
                  {metric === 'points' ? 'Points' : 'Trust'}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.users.map(u => (
                <tr key={u._id} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: u.rank <= 3 ? T.gold : T.muted, fontSize: 16 }}>
                    {medalFor(u.rank)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', overflow: 'hidden',
                        background: 'rgba(99,102,241,0.15)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0
                      }}>
                        {u.profilePicture
                          ? <img alt="" src={fileUrl(u.profilePicture)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ color: '#818cf8', fontWeight: 700, fontSize: 13 }}>{(u.name || 'U').charAt(0).toUpperCase()}</span>}
                      </div>
                      <div>
                        <div style={{ color: T.text, fontWeight: 600 }}>
                          {u.name}
                          {u.verifiedBadge && <span style={{ color: '#34d399', marginLeft: 6 }} title="Verified">✓</span>}
                          {u.role === 'admin' && (
                            <span style={{ marginLeft: 8, fontSize: 10, color: T.accent, background: 'rgba(74,124,111,0.18)', padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase', fontWeight: 700 }}>
                              Admin
                            </span>
                          )}
                        </div>
                        {u.email && <div style={{ color: T.muted, fontSize: 11 }}>{u.email}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: T.high, fontSize: 16 }}>
                    {u.score}
                  </td>
                </tr>
              ))}
              {data.users.length === 0 && (
                <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center', color: T.muted }}>No data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
