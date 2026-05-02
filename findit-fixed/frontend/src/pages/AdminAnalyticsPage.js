import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts';

const T = {
  bg:     '#0f1a0f',
  card:   '#1a2e20',
  border: 'rgba(74,124,111,0.22)',
  text:   '#daeee6',
  muted:  '#6b8f7a',
  accent: '#4a7c6f',
  high:   '#b8d4c8',
  primary:'#6366f1',
};

const COLORS = ['#4a7c6f', '#8ab5a0', '#b8d4c8', '#3d6b55', '#6366f1', '#f59e0b', '#f87171', '#34d399'];

export default function AdminAnalyticsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [downloading, setDownloading] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const { data } = await axios.get('/api/admin/analytics');
        setData(data);
      } catch (err) {
        setMsg('❌ ' + (err.response?.data?.message || 'Failed to load analytics'));
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin]);

  const download = async (format) => {
    setDownloading(format);
    try {
      const res = await axios.get(`/api/admin/report?format=${format}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `lostfound-report-${Date.now()}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setMsg('❌ Download failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setDownloading('');
    }
  };

  if (!isAdmin) return <div style={{ padding: '2rem', color: T.text }}>Admin only.</div>;
  if (loading) return <div style={{ padding: '2rem', color: T.text }}>Loading analytics…</div>;
  if (!data) return <div style={{ padding: '2rem', color: T.text }}>{msg || 'No data'}</div>;

  const { summary, monthlyItems, byCategory, byStatus, topUsers } = data;

  const Card = ({ children, style }) => (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
      padding: 16, color: T.text, ...style
    }}>{children}</div>
  );

  const Stat = ({ label, value, accent }) => (
    <Card>
      <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent || T.high, marginTop: 6 }}>{value}</div>
    </Card>
  );

  return (
    <div style={{ padding: '24px 28px', color: T.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h2 style={{ margin: 0, color: T.high, fontSize: 22 }}>📈 Analytics & Reports</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => download('csv')} disabled={!!downloading}
            style={btnStyle(downloading === 'csv')}>
            {downloading === 'csv' ? 'Preparing…' : '⬇ CSV'}
          </button>
          <button onClick={() => download('pdf')} disabled={!!downloading}
            style={btnStyle(downloading === 'pdf')}>
            {downloading === 'pdf' ? 'Preparing…' : '⬇ PDF'}
          </button>
        </div>
      </div>

      {msg && <div style={{ marginBottom: 12, color: '#f87171' }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 18 }}>
        <Stat label="Total items" value={summary.totalItems} />
        <Stat label="Active items" value={summary.activeItems} />
        <Stat label="Returned" value={summary.returnedItems} accent="#34d399" />
        <Stat label="Recovery rate" value={`${summary.recoveryRate}%`} accent="#34d399" />
        <Stat label="Total claims" value={summary.totalClaims} />
        <Stat label="Approved claims" value={summary.approvedClaims} accent="#34d399" />
        <Stat label="Rejected claims" value={summary.rejectedClaims} accent="#f87171" />
        <Stat label="High-value pending" value={summary.highValuePending} accent="#f59e0b" />
        <Stat label="Total users" value={summary.totalUsers} />
        <Stat label="Active users (30d)" value={summary.active30d} />
        <Stat label="Open abuse reports" value={summary.openAbuse} accent="#f87171" />
        <Stat label="Announcements" value={summary.totalAnnouncements} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card>
          <h3 style={{ marginTop: 0, color: T.high, fontSize: 15 }}>Items posted by month (last 12)</h3>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={monthlyItems}>
                <CartesianGrid stroke={T.border} strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke={T.muted} fontSize={11} />
                <YAxis stroke={T.muted} fontSize={11} />
                <Tooltip contentStyle={{ background: T.card, border: `1px solid ${T.border}`, color: T.text }} />
                <Legend wrapperStyle={{ color: T.text, fontSize: 12 }} />
                <Line type="monotone" dataKey="posted"   stroke="#8ab5a0" strokeWidth={2} />
                <Line type="monotone" dataKey="returned" stroke="#34d399" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 style={{ marginTop: 0, color: T.high, fontSize: 15 }}>By status</h3>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byStatus} dataKey="count" nameKey="status" outerRadius={90} label
                  isAnimationActive={false}>
                  {byStatus.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: T.card, border: `1px solid ${T.border}`, color: T.text }} />
                <Legend wrapperStyle={{ color: T.text, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <h3 style={{ marginTop: 0, color: T.high, fontSize: 15 }}>Items by category</h3>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={byCategory}>
                <CartesianGrid stroke={T.border} strokeDasharray="3 3" />
                <XAxis dataKey="category" stroke={T.muted} fontSize={11} />
                <YAxis stroke={T.muted} fontSize={11} />
                <Tooltip contentStyle={{ background: T.card, border: `1px solid ${T.border}`, color: T.text }} />
                <Bar dataKey="count" fill="#4a7c6f" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 style={{ marginTop: 0, color: T.high, fontSize: 15 }}>🏆 Trust score leaderboard</h3>
          <div style={{ overflowY: 'auto', maxHeight: 280 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: T.muted, textAlign: 'left', borderBottom: `1px solid ${T.border}` }}>
                  <th style={{ padding: '6px 4px' }}>#</th>
                  <th style={{ padding: '6px 4px' }}>Name</th>
                  <th style={{ padding: '6px 4px' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {(topUsers || []).map((u, i) => (
                  <tr key={u._id} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: '6px 4px', color: T.muted }}>{i + 1}</td>
                    <td style={{ padding: '6px 4px' }}>
                      {u.name} {u.verifiedBadge && <span title="Verified" style={{ color: '#34d399' }}>✓</span>}
                      <div style={{ fontSize: 11, color: T.muted }}>{u.email}</div>
                    </td>
                    <td style={{ padding: '6px 4px', fontWeight: 700, color: T.high }}>{u.trustScore}</td>
                  </tr>
                ))}
                {(!topUsers || topUsers.length === 0) && (
                  <tr><td colSpan={3} style={{ padding: 12, color: T.muted }}>No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function btnStyle(busy) {
  return {
    background: busy ? '#26594b' : '#4a7c6f',
    color: '#daeee6',
    border: '1px solid rgba(138,181,160,0.4)',
    padding: '8px 16px',
    borderRadius: 8,
    cursor: busy ? 'wait' : 'pointer',
    fontSize: 13,
    fontWeight: 600,
  };
}
