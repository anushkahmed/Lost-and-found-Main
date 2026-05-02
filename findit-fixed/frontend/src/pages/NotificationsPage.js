// src/pages/NotificationsPage.js — Feature 4: Notification Alerts
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';

const TYPE_CONFIG = {
  claim:        { icon:'💬', color:'#4ade80', bg:'rgba(74,222,128,0.1)',  label:'Claim'   },
  match:        { icon:'🔗', color:'#60a5fa', bg:'rgba(96,165,250,0.1)',  label:'Match'   },
  status:       { icon:'✅', color:'#34d399', bg:'rgba(52,211,153,0.1)',  label:'Status'  },
  announcement: { icon:'📢', color:'#fbbf24', bg:'rgba(251,191,36,0.1)', label:'Announcement' },
  expiry:       { icon:'⏰', color:'#f97316', bg:'rgba(249,115,22,0.1)', label:'Expiry'  },
};

export default function NotificationsPage() {
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [filter,        setFilter]        = useState('all');

  // Fetch from DB — called on mount AND every 10 seconds as fallback
  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/notifications');
      setNotifications(Array.isArray(data) ? data : data.notifications || []);
    } catch (err) {
      console.error('Notifications fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Poll every 8 seconds as fallback (catches notifications even if socket missed)
  useEffect(() => {
    const interval = setInterval(fetchNotifications, 8000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Real-time socket events — refetch from DB so we always have persisted data
  useEffect(() => {
    if (!socket) return;

    const handleNew = () => {
      // Small delay then refetch so DB has time to save
      setTimeout(fetchNotifications, 500);
    };

    socket.on('item:claim',       handleNew);
    socket.on('match:found',      handleNew);
    socket.on('claim:approved',   handleNew);
    socket.on('claim:rejected',   handleNew);
    socket.on('announcement:new', handleNew);
    socket.on('item:new',         handleNew);

    return () => {
      socket.off('item:claim');
      socket.off('match:found');
      socket.off('claim:approved');
      socket.off('claim:rejected');
      socket.off('announcement:new');
      socket.off('item:new');
    };
  }, [socket, fetchNotifications]);

  const markRead = async (id) => {
    setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
    try { await axios.put(`/api/notifications/${id}/read`); } catch {}
  };

  const markAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try { await axios.put('/api/notifications/read-all'); } catch {}
  };

  const deleteNotif = async (id, e) => {
    e.stopPropagation();
    setNotifications(prev => prev.filter(n => n._id !== id));
    try { await axios.delete(`/api/notifications/${id}`); } catch {}
  };

  const clearAll = async () => {
    if (!window.confirm('Clear all notifications?')) return;
    setNotifications([]);
    try { await axios.delete('/api/notifications/clear-all'); } catch {}
  };

  const filtered = notifications.filter(n => {
    if (filter === 'all')    return true;
    if (filter === 'unread') return !n.read;
    return n.type === filter;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const filterTabs = [
    { key:'all',          label:`All (${notifications.length})` },
    { key:'unread',       label:`Unread (${unreadCount})` },
    { key:'claim',        label:'💬 Claims' },
    { key:'match',        label:'🔗 Matches' },
    { key:'status',       label:'✅ Status Updates' },
    { key:'announcement', label:'📢 Announcements' },
    { key:'expiry',       label:'⏰ Expiry' },
  ];

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.topBar}>
        <div>
          <h1 style={s.h1}>🔔 Notifications</h1>
          <p style={s.sub}>
            Real-time via <span style={s.pill}>Socket.io</span> + saved in <span style={s.pill}>MongoDB</span>
            {' '} · Auto-refreshes every 8s
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <div style={s.live}><span style={s.liveDot}/>Live</div>
          {unreadCount > 0 && (
            <button style={s.btnGhost} onClick={markAllRead}>✓ Mark all read</button>
          )}
          {notifications.length > 0 && (
            <button style={{ ...s.btnGhost, color:'#f87171' }} onClick={clearAll}>🗑 Clear all</button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={s.tabs}>
        {filterTabs.map(t => (
          <button key={t.key}
            style={{ ...s.tab, ...(filter === t.key ? s.tabActive : {}) }}
            onClick={() => setFilter(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div style={s.center}>Loading notifications...</div>}

      {!loading && filtered.length === 0 && (
        <div style={s.center}>
          <div style={{ fontSize:32, marginBottom:8 }}>
            {filter === 'unread' ? '🎉' : '🔕'}
          </div>
          {filter === 'unread'
            ? 'All caught up! No unread notifications.'
            : 'No notifications here yet.'}
          <div style={{ fontSize:12, color:'#6b8f7a', marginTop:8 }}>
            Notifications appear when users submit claims, matches are found, or admins update statuses.
          </div>
        </div>
      )}

      <div style={s.list}>
        {filtered.map(n => {
          const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.status;
          return (
            <div key={n._id}
              style={{ ...s.card, borderLeftColor: n.read ? 'transparent' : cfg.color, opacity: n.read ? 0.75 : 1 }}
              onClick={() => !n.read && markRead(n._id)}>

              <div style={{ ...s.icon, background: cfg.bg }}>{cfg.icon}</div>

              <div style={{ flex:1 }}>
                <div style={s.cardTop}>
                  <div style={s.title}>{n.title}</div>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    {!n.read && <span style={s.unreadDot}/>}
                    <button style={s.deleteBtn} onClick={(e) => deleteNotif(n._id, e)}>✕</button>
                  </div>
                </div>

                {n.message && n.message !== n.title && (
                  <div style={s.msg}>{n.message}</div>
                )}

                <div style={s.meta}>
                  <span style={{ ...s.typePill, color: cfg.color, background: cfg.bg }}>
                    {cfg.label}
                  </span>
                  <span>{timeAgo(n.createdAt)}</span>
                  {!n.read && <span style={{ color:'#4a7c6f', fontSize:10 }}>· Click to mark read</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function timeAgo(dateStr) {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

const s = {
  page:    { padding:24, maxWidth:800 },
  topBar:  { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 },
  h1:      { fontSize:20, fontWeight:700, color:'#daeee6', marginBottom:4 },
  sub:     { fontSize:12, color:'#6b8f7a' },
  pill:    { background:'rgba(74,124,111,0.2)', border:'1px solid rgba(74,124,111,0.4)', color:'#8ab5a0', padding:'1px 7px', borderRadius:4, fontSize:11 },
  live:    { display:'flex', alignItems:'center', gap:5, fontSize:12, color:'#4ade80', background:'rgba(74,222,128,0.08)', border:'1px solid rgba(74,222,128,0.2)', padding:'5px 10px', borderRadius:6 },
  liveDot: { width:6, height:6, borderRadius:'50%', background:'#4ade80' },
  btnGhost:{ background:'rgba(74,124,111,0.15)', color:'#8ab5a0', border:'1px solid rgba(74,124,111,0.3)', borderRadius:7, padding:'7px 14px', fontSize:12, cursor:'pointer' },
  tabs:    { display:'flex', gap:4, marginBottom:16, flexWrap:'wrap' },
  tab:     { background:'rgba(20,35,26,0.8)', border:'1px solid rgba(74,124,111,0.2)', color:'#6b8f7a', borderRadius:6, padding:'6px 12px', fontSize:12, cursor:'pointer' },
  tabActive:{ background:'rgba(74,124,111,0.2)', color:'#b8d4c8', borderColor:'rgba(74,124,111,0.5)' },
  center:  { color:'#6b8f7a', fontSize:13, padding:'50px 0', textAlign:'center' },
  list:    { display:'flex', flexDirection:'column', gap:8 },
  card:    { display:'flex', gap:12, alignItems:'flex-start', padding:14, background:'rgba(20,35,26,0.8)', border:'1px solid rgba(74,124,111,0.15)', borderLeft:'3px solid transparent', borderRadius:10, cursor:'pointer' },
  icon:    { width:38, height:38, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, flexShrink:0 },
  cardTop: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:3 },
  title:   { fontSize:13, fontWeight:600, color:'#daeee6' },
  msg:     { fontSize:12, color:'#8ab5a0', lineHeight:1.6, marginBottom:5 },
  meta:    { display:'flex', gap:8, alignItems:'center', fontSize:11, color:'#4a7c6f' },
  typePill:{ padding:'2px 7px', borderRadius:4, fontSize:10, fontWeight:600 },
  unreadDot:{ width:7, height:7, borderRadius:'50%', background:'#4ade80', flexShrink:0 },
  deleteBtn:{ background:'none', border:'none', color:'#4a7c6f', cursor:'pointer', fontSize:13, padding:'0 2px', lineHeight:1 },
};