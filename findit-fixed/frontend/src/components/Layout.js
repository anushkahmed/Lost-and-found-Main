// src/components/Layout.js
import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import axios from 'axios';

const T = {
  bg:          '#0f1a0f',
  sidebar:     '#14231a',
  card:        '#1a2e20',
  accent:      '#4a7c6f',
  accentSoft:  'rgba(74,124,111,0.18)',
  accentText:  '#8ab5a0',
  highlight:   '#b8d4c8',
  text:        '#daeee6',
  muted:       '#6b8f7a',
  border:      'rgba(74,124,111,0.22)',
  logoutBg:    'rgba(74,124,111,0.15)',
  logoutBorder:'rgba(138,181,160,0.4)',
  logoutText:  '#8ab5a0',
  badgeBg:     '#3d6b55',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const { socket } = useSocket();
  const { theme, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [toastMsg,    setToastMsg]    = useState('');
  const [isMobile,    setIsMobile]    = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [drawerOpen,  setDrawerOpen]  = useState(false);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Auto-close drawer on route change (mobile)
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const { data } = await axios.get('/api/notifications');
        setUnreadCount(data.filter(n => !n.read).length);
      } catch (e) {}
    };
    const fetchChatUnread = async () => {
      try {
        const { data } = await axios.get('/api/chat/conversations');
        const sum = (data || []).reduce((acc, c) => acc + (Number(c.unreadForMe) || 0), 0);
        setChatUnread(sum);
      } catch (e) {}
    };
    fetchUnread();
    fetchChatUnread();
    const interval = setInterval(fetchUnread, 8000);
    const chatInterval = setInterval(fetchChatUnread, 8000);
    return () => { clearInterval(interval); clearInterval(chatInterval); };
  }, []);

  useEffect(() => {
    if (!socket) return;
    const showToast = (msg) => {
      setToastMsg(msg);
      setUnreadCount(c => c + 1);
      setTimeout(() => setToastMsg(''), 4000);
    };
    socket.on('match:found',      (d) => showToast(`🔗 ${d.message}`));
    socket.on('announcement:new', (d) => showToast(`📢 ${d.title}`));
    socket.on('item:new',         (d) => showToast(`📦 ${d.message}`));
    return () => {
      socket.off('match:found');
      socket.off('announcement:new');
      socket.off('item:new');
    };
  }, [socket]);

  // Admin nav — no Search & Filter
  const adminLinks = [
    { to: '/',              label: 'Dashboard',      icon: '📊' },
    { to: '/profile',       label: 'My Profile',     icon: '👤' },
    { to: '/post',          label: 'Post Item',       icon: '📦' },
    { to: '/matching',      label: 'Matching System', icon: '🔗' },
    { to: '/chat',          label: 'Chat',            icon: '💬', badge: chatUnread },
    { to: '/notifications', label: 'Notifications',   icon: '🔔', badge: unreadCount },
    { to: '/announcements', label: 'Announcements',   icon: '📢' },
    { to: '/leaderboard',     label: 'Leaderboard',   icon: '🏆' },
    { to: '/admin/users',     label: 'Manage Users',  icon: '🛡️' },
    { to: '/admin/categories',label: 'Categories',    icon: '📂' },
    { to: '/admin/abuse',     label: 'Abuse Reports', icon: '🚩' },
    { to: '/admin/analytics', label: 'Analytics',     icon: '📈' },
    { to: '/admin/map',       label: 'Heatmap',       icon: '🗺' },
    { to: '/admin/logs',      label: 'System Logs',   icon: '🖥️' },
  ];

  // Student nav — no Matching System
  const studentLinks = [
    { to: '/',              label: 'Dashboard',      icon: '📊' },
    { to: '/profile',       label: 'My Profile',     icon: '👤' },
    { to: '/post',          label: 'Post Item',       icon: '📦' },
    { to: '/search',        label: 'Search & Filter', icon: '🔍' },
    { to: '/matching',      label: 'Lost & Match',    icon: '🔗' },
    { to: '/chat',          label: 'Chat',            icon: '💬', badge: chatUnread },
    { to: '/notifications', label: 'Notifications',   icon: '🔔', badge: unreadCount },
    { to: '/announcements', label: 'Announcements',   icon: '📢' },
    { to: '/leaderboard',   label: 'Leaderboard',     icon: '🏆' },
  ];

  const navLinks = isAdmin ? adminLinks : studentLinks;

  const sidebarStyle = isMobile
    ? {
        position:'fixed', top:0, left:0, height:'100vh', width:240,
        background:T.sidebar, borderRight:`1px solid ${T.border}`,
        display:'flex', flexDirection:'column', zIndex:1100,
        transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.22s ease',
        boxShadow: drawerOpen ? '0 6px 30px rgba(0,0,0,0.6)' : 'none',
      }
    : { width:224, background:T.sidebar, borderRight:`1px solid ${T.border}`, display:'flex', flexDirection:'column' };

  return (
    <div style={{ display:'flex', height:'100vh', fontFamily:'Segoe UI,sans-serif', background:T.bg, color:T.text }}>
      {isMobile && drawerOpen && (
        <div onClick={() => setDrawerOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1050 }} />
      )}
      <aside style={sidebarStyle}>

        {/* Logo */}
        <div style={{ padding:'22px 18px 16px', borderBottom:`1px solid ${T.border}` }}>
          <div style={{ fontSize:18, fontWeight:800, color:T.highlight }}>🔍 FindIt</div>
          <div style={{ fontSize:11, color:T.muted, marginTop:3 }}>Lost & Found System</div>
          {isAdmin && (
            <div style={{ fontSize:10, color:T.accent, marginTop:4, background:'rgba(74,124,111,0.15)', padding:'2px 8px', borderRadius:4, display:'inline-block' }}>
              ADMIN MODE
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ padding:'10px 8px', flex:1 }}>
          {navLinks.map(link => (
            <NavLink key={link.to} to={link.to} end={link.to === '/'}
              style={({ isActive }) => ({
                display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
                borderRadius:9, cursor:'pointer', fontSize:13, textDecoration:'none',
                marginBottom:3,
                color:      isActive ? T.highlight  : T.muted,
                background: isActive ? T.accentSoft : 'transparent',
                borderLeft: isActive ? `3px solid ${T.accent}` : '3px solid transparent',
              })}>
              <span style={{ fontSize:15, width:18, textAlign:'center' }}>{link.icon}</span>
              {link.label}
              {link.badge > 0 && (
                <span style={{ marginLeft:'auto', background:T.badgeBg, color:T.highlight,
                  fontSize:10, padding:'1px 7px', borderRadius:10, fontWeight:600 }}>
                  {link.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User + Logout */}
        <div style={{ padding:12, borderTop:`1px solid ${T.border}` }}>
          <div style={{ background:T.card, borderRadius:12, padding:12, border:`1px solid ${T.border}` }}>
            <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:12 }}>
              <div style={{ width:32, height:32, borderRadius:'50%',
                background:`linear-gradient(135deg, #4a7c6f, #2d5c45)`,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:13, fontWeight:700, color:T.highlight, flexShrink:0 }}>
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, color:T.text,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {user?.name}
                </div>
                <div style={{ fontSize:10, color:T.accentText, textTransform:'uppercase', letterSpacing:'0.6px', fontWeight:700 }}>
                  {user?.role}
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={toggleTheme} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                style={{ flex:'0 0 auto', background:T.logoutBg, border:`1px solid ${T.logoutBorder}`,
                  color:T.logoutText, borderRadius:8, padding:'8px 10px',
                  fontSize:13, fontWeight:600, cursor:'pointer' }}>
                {theme === 'light' ? '🌙' : '☀'}
              </button>
              <button onClick={() => { logout(); navigate('/login'); }}
                style={{ flex:1, background:T.logoutBg, border:`1px solid ${T.logoutBorder}`,
                  color:T.logoutText, borderRadius:8, padding:'8px 0',
                  fontSize:12, fontWeight:600, cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                🚪 Log Out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex:1, overflow:'auto', background:T.bg, minWidth:0 }}>
        {isMobile && (
          <div style={{
            position:'sticky', top:0, zIndex:900,
            display:'flex', alignItems:'center', gap:10,
            background: T.sidebar, borderBottom: `1px solid ${T.border}`,
            padding:'10px 14px'
          }}>
            <button onClick={() => setDrawerOpen(d => !d)} aria-label="Open menu"
              style={{ background:'transparent', color:T.highlight, border:`1px solid ${T.border}`,
                width:38, height:38, borderRadius:9, cursor:'pointer', fontSize:18, lineHeight:1 }}>
              ☰
            </button>
            <div style={{ fontSize:15, fontWeight:800, color:T.highlight }}>🔍 FindIt</div>
            {(unreadCount + chatUnread) > 0 && (
              <span style={{ marginLeft:'auto', background:T.badgeBg, color:T.highlight,
                fontSize:11, padding:'2px 8px', borderRadius:10, fontWeight:600 }}>
                {unreadCount + chatUnread}
              </span>
            )}
          </div>
        )}
        {toastMsg && (
          <div style={{ position:'fixed', top:16, right:16, zIndex:1000,
            background:T.card, border:`1px solid ${T.accent}`,
            borderRadius:10, padding:'12px 18px', fontSize:13, maxWidth:320,
            boxShadow:'0 4px 20px rgba(0,0,0,0.5)', color:T.text }}>
            {toastMsg}
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}