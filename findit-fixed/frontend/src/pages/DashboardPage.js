// src/pages/DashboardPage.js
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

const STATUS_BADGE = {
  found:    { bg:'rgba(16,185,129,0.15)',  color:'#34d399', label:'Found'    },
  claimed:  { bg:'rgba(245,158,11,0.15)',  color:'#fbbf24', label:'Claimed'  },
  returned: { bg:'rgba(99,102,241,0.15)',  color:'#818cf8', label:'Returned' },
  expired:  { bg:'rgba(239,68,68,0.15)',   color:'#f87171', label:'Expired'  },
};

const CATEGORY_ICON = {
  Electronics:'📱', Clothing:'👕', Documents:'📄',
  Accessories:'👓', Keys:'🔑', Bags:'🎒', Other:'📦'
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();

  const [stats,       setStats]       = useState({ total:0, returned:0, pending:0, matches:0 });
  const [trustScore,  setTrustScore]  = useState(null);
  const [hvPending,   setHvPending]   = useState(0);
  const [expiringCount, setExpiringCount] = useState(0);
  const [recentItems, setRecentItems] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading,     setLoading]     = useState(true);

  const fetchAll = async () => {
    try {
      // Fetch recent found items
      const itemsRes = await axios.get('/api/items?limit=6');
      setRecentItems(itemsRes.data.items);

      // Derive stats from live data
      const total    = itemsRes.data.total;
      const returned = itemsRes.data.items.filter(i => i.status === 'returned').length;
      const pending  = itemsRes.data.items.filter(i => i.status === 'claimed').length;

      // High-value pending (admin only; uses last 6 items as a quick signal)
      const hv = (itemsRes.data.items || []).filter(i => i.isHighValue && i.highValueApproved === false).length;
      setHvPending(hv);

      // Expiring soon count — items that expire within 7 days
      const now = Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      const expiring = (itemsRes.data.items || []).filter(i => {
        if (!i.expiresAt || i.status !== 'found') return false;
        const diff = new Date(i.expiresAt).getTime() - now;
        return diff > 0 && diff <= sevenDays;
      }).length;
      setExpiringCount(expiring);

      // Fetch matches count
      let matchCount = 0;
      try {
        const matchRes = await axios.get('/api/matches');
        matchCount = matchRes.data.filter(m => m.status === 'pending').length;
      } catch {}

      setStats({ total, returned, pending, matches: matchCount });

      // Fetch my trust score (persisted profile)
      try {
        const meRes = await axios.get('/api/users/me/full');
        setTrustScore(meRes.data?.user?.trustScore ?? null);
      } catch {}

      // Fetch latest announcements
      const annRes = await axios.get('/api/announcements');
      setAnnouncements((annRes.data.announcements || annRes.data).slice(0, 2));
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // Live update when new item posted via socket
  useEffect(() => {
    if (!socket) return;
    socket.on('item:new', () => fetchAll());
    return () => socket.off('item:new');
  }, [socket]);

  if (loading) return <LoadingSpinner />;

  const statCards = [
    { value: stats.total,   label: 'Total Items Posted',  color: '#818cf8', pct: Math.min(100, stats.total) },
    { value: stats.returned,label: 'Items Returned',       color: '#34d399', pct: stats.total ? Math.round(stats.returned/stats.total*100) : 0 },
    { value: stats.pending, label: 'Pending Claims',       color: '#fbbf24', pct: stats.total ? Math.round(stats.pending/stats.total*100) : 0 },
    { value: stats.matches, label: 'Active Matches',       color: '#f87171', pct: Math.min(100, stats.matches * 5) },
  ];

  const trustCard = trustScore !== null
    ? { value: trustScore, label: 'Your Trust Score', color: trustScore >= 70 ? '#34d399' : '#fbbf24', pct: trustScore }
    : null;

  const hvCard = user?.role === 'admin'
    ? { value: hvPending, label: 'High-value Pending', color: '#fbbf24', pct: Math.min(100, hvPending * 20) }
    : null;

  const expiryCard = expiringCount > 0
    ? { value: expiringCount, label: 'Expiring Soon (7d)', color: '#f97316', pct: Math.min(100, expiringCount * 15) }
    : null;

  const allCards = [
    ...(trustCard ? [trustCard] : []),
    ...(hvCard ? [hvCard] : []),
    ...(expiryCard ? [expiryCard] : []),
    ...statCards,
  ].slice(0, 6);

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.h1}>Welcome back, {user?.name?.split(' ')[0]} 👋</h1>
          <p style={styles.sub}>Here's what's happening in the system today.</p>
        </div>
        <button style={styles.btnPrimary} onClick={() => navigate('/post')}>+ Post Found Item</button>
      </div>

      {/* Stat Cards */}
      <div style={styles.statsGrid}>
        {allCards.map((s, i) => (
          <div key={i} style={styles.statCard}>
            <div style={{ fontSize:28, fontWeight:700, color:s.color }}>{s.value}</div>
            <div style={styles.statLabel}>{s.label}</div>
            <div style={styles.progressTrack}>
              <div style={{ ...styles.progressFill, width:`${s.pct}%`, background:s.color }} />
            </div>
          </div>
        ))}
      </div>

      <div style={styles.twoCol}>
        {/* Recent Items */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardTitle}>Recent Found Items</span>
            <button style={styles.btnGhost} onClick={() => navigate('/search')}>View All →</button>
          </div>
          {recentItems.length === 0
            ? <EmptyState msg="No items posted yet." />
            : (
              <div style={styles.itemsGrid}>
                {recentItems.map(item => (
                  <div key={item._id} style={styles.itemCard} onClick={() => navigate('/search')}>
                    <div style={{ ...styles.itemImg, background:'rgba(99,102,241,0.08)' }}>
                      {CATEGORY_ICON[item.category] || '📦'}
                    </div>
                    <div style={styles.itemBody}>
                      <div style={styles.itemName}>{item.name}</div>
                      <div style={styles.itemMeta}>
                        📍 {item.foundLocation}<br />
                        📅 {new Date(item.date).toLocaleDateString()}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                        <StatusBadge status={item.status} />
                        {(() => {
                          if (!item.expiresAt || item.status !== 'found') return null;
                          const d = Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / (1000*60*60*24));
                          if (d > 0 && d <= 7) return <span style={{ fontSize:9, color:'#f97316', fontWeight:600 }}>⏰ {d}d</span>;
                          return null;
                        })()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>

        {/* Latest Announcements */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardTitle}>Latest Announcements</span>
            <button style={styles.btnGhost} onClick={() => navigate('/announcements')}>View All →</button>
          </div>
          {announcements.length === 0
            ? <EmptyState msg="No announcements yet." />
            : announcements.map(a => (
              <div key={a._id} style={styles.announceCard}>
                <PriorityBadge priority={a.priority} />
                <div style={styles.announceTitle}>{a.title}</div>
                <div style={styles.announceBody}>{a.body.substring(0, 120)}{a.body.length > 120 ? '...' : ''}</div>
                <div style={styles.announceMeta}>
                  📅 {new Date(a.createdAt).toLocaleDateString()} · By {a.postedBy?.name}
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.found;
  return (
    <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:4, fontSize:10, fontWeight:600, textTransform:'uppercase', background:s.bg, color:s.color, marginTop:6 }}>
      {s.label}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const map = {
    info:      { bg:'#6366f1', label:'📋 Info' },
    broadcast: { bg:'#6366f1', label:'📢 Broadcast' },
    urgent:    { bg:'#f59e0b', label:'⚡ Urgent' },
  };
  const p = map[priority] || map.info;
  return <span style={{ display:'inline-block', background:p.bg, color:'white', borderRadius:4, fontSize:10, fontWeight:600, padding:'3px 8px', marginBottom:6 }}>{p.label}</span>;
}

function EmptyState({ msg }) {
  return <div style={{ padding:'30px', textAlign:'center', color:'#94a3b8', fontSize:13 }}>{msg}</div>;
}

function LoadingSpinner() {
  return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:200, color:'#818cf8', fontSize:14 }}>Loading dashboard...</div>;
}

const styles = {
  page:         { padding:24 },
  header:       { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 },
  h1:           { fontSize:20, fontWeight:600, color:'#e2e8f0', marginBottom:4 },
  sub:          { fontSize:13, color:'#94a3b8' },
  btnPrimary:   { background:'#6366f1', color:'white', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:500, cursor:'pointer' },
  btnGhost:     { background:'#262b3d', color:'#94a3b8', border:'1px solid rgba(255,255,255,0.08)', borderRadius:7, padding:'5px 12px', fontSize:12, cursor:'pointer' },
  statsGrid:    { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:24 },
  statCard:     { background:'#1e2130', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, padding:'14px 16px' },
  statLabel:    { fontSize:11, color:'#94a3b8', marginTop:4 },
  progressTrack:{ height:4, background:'#2d3348', borderRadius:2, overflow:'hidden', marginTop:10 },
  progressFill: { height:'100%', borderRadius:2, transition:'width 0.6s ease' },
  twoCol:       { display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 },
  card:         { background:'#1e2130', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:16 },
  cardHeader:   { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 },
  cardTitle:    { fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.5px' },
  itemsGrid:    { display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 },
  itemCard:     { background:'#1e2130', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, overflow:'hidden', cursor:'pointer' },
  itemImg:      { height:70, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 },
  itemBody:     { padding:'10px 12px' },
  itemName:     { fontSize:12, fontWeight:600, marginBottom:4, color:'#e2e8f0' },
  itemMeta:     { fontSize:10, color:'#94a3b8', lineHeight:1.6 },
  announceCard: { background:'rgba(99,102,241,0.06)', border:'1px solid rgba(99,102,241,0.2)', borderRadius:10, padding:14, marginBottom:10 },
  announceTitle:{ fontSize:13, fontWeight:600, marginBottom:5, color:'#e2e8f0' },
  announceBody: { fontSize:12, color:'#94a3b8', lineHeight:1.6 },
  announceMeta: { fontSize:10, color:'#64748b', marginTop:8 },
};
