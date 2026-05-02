import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import TwoFactorSection from '../components/TwoFactorSection';
import { fileUrl } from '../config';

const T = {
  card: '#1e2130',
  border: 'rgba(255,255,255,0.08)',
  text: '#e2e8f0',
  muted: '#94a3b8',
  input: '#262b3d',
  primary: '#6366f1',
  danger: '#f87171',
  success: '#34d399',
};

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [me, setMe] = useState(user);
  const [stats, setStats] = useState({ itemsPosted: 0, claimsMade: 0 });

  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const fetchMe = async () => {
    const { data } = await axios.get('/api/users/me/full');
    setMe(data.user);
    setStats(data.stats);
    setForm({ name: data.user?.name || '', phone: data.user?.phone || '' });
  };

  useEffect(() => { fetchMe().catch(() => {}); }, []);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      await axios.put('/api/users/me', { name: form.name, phone: form.phone });
      setMsg('✅ Profile updated');
      await fetchMe();
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Update failed'));
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async () => {
    if (!avatarFile) return;
    setAvatarUploading(true);
    setMsg('');
    try {
      const fd = new FormData();
      fd.append('avatar', avatarFile);
      await axios.post('/api/users/me/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMsg('✅ Profile picture updated');
      setAvatarFile(null);
      await fetchMe();
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Avatar upload failed'));
    } finally {
      setAvatarUploading(false);
    }
  };

  const deactivate = async () => {
    const ok = window.confirm('Deactivate your account? You will be logged out.');
    if (!ok) return;
    setMsg('');
    try {
      await axios.post('/api/users/me/deactivate');
      logout();
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Deactivate failed'));
    }
  };

  const trust = me?.trustScore ?? 50;
  const trustColor = trust >= 70 ? T.success : trust >= 40 ? '#fbbf24' : T.danger;

  return (
    <div style={{ padding: 24, maxWidth: 840 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ color: T.text, fontSize: 20, fontWeight: 700, marginBottom: 4 }}>My Profile</h1>
        <div style={{ color: T.muted, fontSize: 13 }}>Manage your account details, trust score, and profile picture.</div>
      </div>

      {msg && (
        <div style={{
          marginBottom: 14,
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Profile card */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 14,
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden'
            }}>
              {me?.profilePicture
                ? <img alt="avatar" src={fileUrl(me.profilePicture)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ color: '#818cf8', fontWeight: 800 }}>{(me?.name || 'U').charAt(0).toUpperCase()}</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: T.text, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {me?.name}
                {me?.verifiedBadge && <span style={{ marginLeft: 8, fontSize: 12, color: '#34d399' }}>✔ Verified</span>}
              </div>
              <div style={{ color: T.muted, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me?.email}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{
                  fontSize: 11,
                  background: `${trustColor}22`,
                  border: `1px solid ${trustColor}44`,
                  color: trustColor,
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontWeight: 700
                }}>
                  Trust {trust}/100
                </span>
                <span style={{ fontSize: 11, color: T.muted }}>{me?.role?.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <Stat label="Items posted" value={stats.itemsPosted} />
            <Stat label="Claims made" value={stats.claimsMade} />
          </div>

          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
            <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Profile picture</div>
            <input type="file" accept="image/*" onChange={e => setAvatarFile(e.target.files?.[0] || null)} />
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button onClick={uploadAvatar} disabled={!avatarFile || avatarUploading} style={btnPrimary()}>
                {avatarUploading ? 'Uploading...' : 'Upload'}
              </button>
              <button onClick={() => setAvatarFile(null)} disabled={!avatarFile || avatarUploading} style={btnGhost()}>
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Edit card */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 13, color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
            Edit profile
          </div>

          <form onSubmit={saveProfile}>
            <div style={{ marginBottom: 12 }}>
              <label style={label()}>Full name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={input()} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={label()}>Phone</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={input()} placeholder="Optional" />
            </div>
            <button type="submit" disabled={saving} style={btnPrimary({ width: '100%' })}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </form>

          <div style={{ marginTop: 16, borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.danger, marginBottom: 8 }}>Danger zone</div>
            <button onClick={deactivate} style={btnDanger({ width: '100%' })}>
              Deactivate account
            </button>
            <div style={{ marginTop: 8, fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
              Deactivation immediately blocks API access for your JWT session and logs you out.
            </div>
          </div>
        </div>
      </div>

      <TwoFactorSection />

      {/* Feedback received */}
      <FeedbackSection userId={me?._id} />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: '#262b3d', border: `1px solid ${T.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ color: T.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 700 }}>{label}</div>
      <div style={{ color: T.text, fontSize: 18, fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function label() {
  return { display: 'block', fontSize: 11, color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 };
}

function input() {
  return { width: '100%', background: T.input, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 12px', color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' };
}

function btnPrimary(extra = {}) {
  return { background: T.primary, color: 'white', border: 'none', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', ...extra };
}

function btnGhost(extra = {}) {
  return { background: '#262b3d', color: T.muted, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', ...extra };
}

function btnDanger(extra = {}) {
  return { background: 'rgba(239,68,68,0.12)', color: T.danger, border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 800, cursor: 'pointer', ...extra };
}

function FeedbackSection({ userId }) {
  const [feedbacks, setFeedbacks] = React.useState([]);
  const [avgRating, setAvgRating] = React.useState(0);
  const [total, setTotal] = React.useState(0);

  React.useEffect(() => {
    if (!userId) return;
    axios.get(`/api/feedback/user/${userId}`)
      .then(({ data }) => {
        setFeedbacks(data.feedbacks || []);
        setAvgRating(data.avgRating || 0);
        setTotal(data.total || 0);
      })
      .catch(() => {});
  }, [userId]);

  if (total === 0) return null;

  const stars = (rating) => '⭐'.repeat(rating) + '☆'.repeat(5 - rating);

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>⭐ Feedback Received</div>
        <div style={{ fontSize: 12, color: T.muted }}>
          Average: <strong style={{ color: avgRating >= 4 ? T.success : '#fbbf24' }}>{avgRating}/5</strong> ({total} ratings)
        </div>
      </div>
      {feedbacks.slice(0, 10).map(fb => (
        <div key={fb._id} style={{ background: '#262b3d', border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
              {fb.fromUser?.name || 'Anonymous'}
              {fb.fromUser?.verifiedBadge && <span style={{ color: T.success, marginLeft: 6 }}>✔</span>}
            </div>
            <div style={{ fontSize: 11, color: T.muted }}>{new Date(fb.createdAt).toLocaleDateString()}</div>
          </div>
          <div style={{ fontSize: 13, marginTop: 4 }}>{stars(fb.rating)}</div>
          {fb.comment && <div style={{ fontSize: 12, color: T.muted, marginTop: 4, lineHeight: 1.5 }}>{fb.comment}</div>}
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>For: {fb.itemId?.name || 'Unknown item'} · Type: {fb.type}</div>
        </div>
      ))}
    </div>
  );
}
