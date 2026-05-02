// src/pages/AnnouncementsPage.js — Feature 5: Announcements & Broadcasting
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

const PRIORITY_CONFIG = {
  info:      { bg:'#6366f1', label:'📋 Info',      border:'rgba(99,102,241,0.25)',  cardBg:'rgba(99,102,241,0.06)'  },
  broadcast: { bg:'#6366f1', label:'📢 Broadcast', border:'rgba(99,102,241,0.25)',  cardBg:'rgba(99,102,241,0.06)'  },
  urgent:    { bg:'#f59e0b', label:'⚡ Urgent',    border:'rgba(245,158,11,0.35)',   cardBg:'rgba(245,158,11,0.06)'  },
};

const AUDIENCE_OPTIONS = [
  { value:'all',      label:'All Users (Students + Staff)' },
  { value:'students', label:'Students Only' },
  { value:'staff',    label:'Staff Only' },
];

const INITIAL_FORM = { title:'', body:'', priority:'broadcast', audience:'all' };

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const isAdmin = user?.role === 'admin';

  const [announcements,  setAnnouncements]  = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [form,           setForm]           = useState(INITIAL_FORM);
  const [submitting,     setSubmitting]     = useState(false);
  const [msg,            setMsg]            = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  const fetchAnnouncements = async () => {
    try {
      const { data } = await axios.get('/api/announcements');
      // FIX 15: API now returns { announcements, total, ... } — extract the array
      setAnnouncements(data.announcements || data);
    } catch (err) {
      console.error('Announcements fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAnnouncements(); }, []);

  // Live: receive new announcements via Socket.io and prepend
  useEffect(() => {
    if (!socket) return;
    socket.on('announcement:new', (data) => {
      setAnnouncements(prev => [{
        _id:       Date.now().toString(),
        title:     data.title,
        body:      data.message,
        priority:  data.priority,
        audience:  'all',
        createdAt: new Date().toISOString(),
        isLive:    true,
        views:     0,
      }, ...prev]);
    });
    return () => socket.off('announcement:new');
  }, [socket]);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      setMsg('❌ Title and message are required.');
      return;
    }
    setSubmitting(true);
    setMsg('');
    try {
      await axios.post('/api/announcements', form);
      setMsg('✅ Announcement published and broadcast to all users!');
      setForm(INITIAL_FORM);
      fetchAnnouncements();
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Failed to publish'));
    } finally {
      setSubmitting(false);
    }
  };

  const deleteAnnouncement = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await axios.delete(`/api/announcements/${id}`);
      setAnnouncements(prev => prev.filter(a => a._id !== id));
    } catch (err) {
      alert(err.response?.data?.message || 'Delete failed');
    }
  };

  const filtered = announcements.filter(a =>
    !filterPriority || a.priority === filterPriority
  );

  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <div>
          <h1 style={styles.h1}>Announcements & Broadcasting</h1>
          <p style={styles.sub}>
            Admins publish announcements → stored in MongoDB → instantly broadcast via{' '}
            <span style={styles.badge}>Socket.io</span> to all users
          </p>
        </div>
        <div style={styles.liveIndicator}>
          <span style={styles.liveDot} />
          Live broadcast active
        </div>
      </div>

      <div style={styles.layout}>
        {/* ── Left: Announcement Feed ── */}
        <div>
          <div style={styles.filterRow}>
            <span style={{ fontSize:12, color:'#94a3b8' }}>Filter:</span>
            {['', 'info', 'broadcast', 'urgent'].map(p => (
              <button key={p} style={{ ...styles.filterBtn, ...(filterPriority === p ? styles.filterBtnActive : {}) }}
                onClick={() => setFilterPriority(p)}>
                {p ? PRIORITY_CONFIG[p]?.label : 'All'}
              </button>
            ))}
            <span style={{ marginLeft:'auto', fontSize:12, color:'#64748b' }}>
              {filtered.length} announcement{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {loading && <div style={styles.loading}>Loading announcements...</div>}
          {!loading && filtered.length === 0 && (
            <div style={styles.empty}>No announcements yet.</div>
          )}

          {filtered.map(a => {
            const cfg = PRIORITY_CONFIG[a.priority] || PRIORITY_CONFIG.info;
            return (
              <div key={a._id} style={{ ...styles.announceCard, background:cfg.cardBg, borderColor:cfg.border }}>
                <div style={styles.cardTop}>
                  <span style={{ ...styles.priorityBadge, background:cfg.bg }}>
                    {cfg.label}
                    {a.isLive && <span style={styles.livePill}>LIVE</span>}
                  </span>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span style={styles.audiencePill}>
                      👥 {a.audience === 'all' ? 'Everyone' : a.audience}
                    </span>
                    {isAdmin && !a.isLive && (
                      <button style={styles.deleteBtn} onClick={() => deleteAnnouncement(a._id)}>✕</button>
                    )}
                  </div>
                </div>
                <div style={styles.announceTitle}>{a.title}</div>
                <div style={styles.announceBody}>{a.body}</div>
                <div style={styles.announceFoot}>
                  <span>📅 {new Date(a.createdAt).toLocaleDateString()}</span>
                  {a.postedBy?.name && <span>By {a.postedBy.name}</span>}
                  {a.views > 0 && <span>👁 {a.views} views</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Right: Compose Form (admin only) ── */}
        {isAdmin ? (
          <div>
            <div style={styles.composeCard}>
              <div style={styles.composeTitle}>📢 Compose Announcement</div>

              {msg && (
                <div style={{ fontSize:12, color: msg.startsWith('✅') ? '#34d399' : '#f87171', marginBottom:12 }}>
                  {msg}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div style={styles.group}>
                  <label style={styles.label}>Announcement Title *</label>
                  <input name="title" value={form.title} onChange={handleChange}
                    style={styles.input} placeholder="Enter a clear headline..." required />
                </div>

                <div style={styles.group}>
                  <label style={styles.label}>Message Body *</label>
                  <textarea name="body" value={form.body} onChange={handleChange}
                    style={{ ...styles.input, height:100, resize:'vertical' }}
                    placeholder="Write the full announcement message..." required />
                </div>

                <div style={styles.group}>
                  <label style={styles.label}>Priority Level</label>
                  <select name="priority" value={form.priority} onChange={handleChange} style={styles.input}>
                    <option value="info">📋 Info — General update</option>
                    <option value="broadcast">📢 Broadcast — All users</option>
                    <option value="urgent">⚡ Urgent — Push notification</option>
                  </select>
                </div>

                <div style={styles.group}>
                  <label style={styles.label}>Target Audience</label>
                  <select name="audience" value={form.audience} onChange={handleChange} style={styles.input}>
                    {AUDIENCE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {form.title && (
                  <div style={styles.previewBox}>
                    <div style={{ fontSize:10, color:'#64748b', marginBottom:6, textTransform:'uppercase' }}>Preview</div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#e2e8f0' }}>{form.title}</div>
                    {form.body && <div style={{ fontSize:12, color:'#94a3b8', marginTop:4 }}>{form.body.substring(0,80)}...</div>}
                  </div>
                )}

                <button type="submit" style={{ ...styles.btnPrimary, width:'100%' }} disabled={submitting}>
                  {submitting ? '⏳ Publishing...' : '📢 Publish & Broadcast Now'}
                </button>
              </form>

              <div style={styles.flowBox}>
                <div style={{ fontSize:11, color:'#64748b', marginBottom:6 }}>What happens when you publish:</div>
                {[
                  '1. Saved to MongoDB announcements collection',
                  '2. Socket.io emits announcement:new to ALL clients',
                  '3. Every connected user sees it instantly',
                  '4. Toast notification appears in their browser',
                ].map((step, i) => (
                  <div key={i} style={{ fontSize:11, color:'#94a3b8', padding:'3px 0' }}>{step}</div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={styles.composeCard}>
            <div style={{ textAlign:'center', color:'#94a3b8', fontSize:13 }}>
              <div style={{ fontSize:28, marginBottom:8 }}>🔒</div>
              Only admins can post announcements.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page:           { padding:24 },
  topBar:         { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 },
  h1:             { fontSize:19, fontWeight:600, color:'#e2e8f0', marginBottom:4 },
  sub:            { fontSize:13, color:'#94a3b8' },
  badge:          { background:'#262b3d', border:'1px solid rgba(99,102,241,0.3)', color:'#818cf8', padding:'1px 7px', borderRadius:4, fontSize:11 },
  liveIndicator:  { display:'flex', alignItems:'center', gap:5, fontSize:12, color:'#34d399', background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)', padding:'6px 12px', borderRadius:6 },
  liveDot:        { width:6, height:6, borderRadius:'50%', background:'#34d399' },
  layout:         { display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:20 },
  filterRow:      { display:'flex', gap:6, alignItems:'center', marginBottom:14, flexWrap:'wrap' },
  filterBtn:      { background:'#1e2130', border:'1px solid rgba(255,255,255,0.08)', color:'#94a3b8', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' },
  filterBtnActive:{ background:'rgba(99,102,241,0.15)', color:'#818cf8', borderColor:'rgba(99,102,241,0.4)' },
  loading:        { color:'#818cf8', fontSize:13, padding:30, textAlign:'center' },
  empty:          { color:'#94a3b8', fontSize:13, padding:'40px 0', textAlign:'center' },
  announceCard:   { border:'1px solid', borderRadius:12, padding:16, marginBottom:12 },
  cardTop:        { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 },
  priorityBadge:  { display:'inline-flex', alignItems:'center', gap:4, padding:'3px 10px', color:'white', borderRadius:4, fontSize:10, fontWeight:600 },
  livePill:       { background:'rgba(255,255,255,0.2)', padding:'1px 5px', borderRadius:3, fontSize:9, marginLeft:4 },
  audiencePill:   { fontSize:11, color:'#94a3b8', background:'rgba(255,255,255,0.04)', padding:'2px 8px', borderRadius:4, border:'1px solid rgba(255,255,255,0.06)' },
  deleteBtn:      { background:'rgba(239,68,68,0.1)', border:'none', color:'#f87171', borderRadius:5, padding:'3px 7px', cursor:'pointer', fontSize:12 },
  announceTitle:  { fontSize:14, fontWeight:600, color:'#e2e8f0', marginBottom:6 },
  announceBody:   { fontSize:12, color:'#94a3b8', lineHeight:1.7 },
  announceFoot:   { display:'flex', gap:14, marginTop:10, fontSize:11, color:'#64748b' },
  composeCard:    { background:'#1e2130', border:'1px solid rgba(255,255,255,0.08)', borderRadius:14, padding:20 },
  composeTitle:   { fontSize:13, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:16 },
  group:          { marginBottom:14 },
  label:          { display:'block', fontSize:10, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:5 },
  input:          { width:'100%', background:'#262b3d', border:'1px solid rgba(255,255,255,0.08)', borderRadius:7, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none', boxSizing:'border-box' },
  previewBox:     { background:'#262b3d', borderRadius:8, padding:10, marginBottom:14, border:'1px solid rgba(255,255,255,0.06)' },
  btnPrimary:     { background:'#6366f1', color:'white', border:'none', borderRadius:8, padding:11, fontSize:13, fontWeight:500, cursor:'pointer' },
  flowBox:        { marginTop:14, padding:12, background:'#0f1117', borderRadius:8 },
};
