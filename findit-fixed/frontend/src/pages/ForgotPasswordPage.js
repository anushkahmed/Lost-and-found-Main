import React, { useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('');
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState('');
  const [devUrl, setDevUrl]   = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(''); setDevUrl('');
    try {
      const { data } = await axios.post('/api/auth/forgot-password', { email });
      setMsg(data.message || 'If an account exists, a reset link has been sent.');
      if (data.devResetUrl) setDevUrl(data.devResetUrl);
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Request failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>🔍 FindIt</div>
        <div style={styles.subtitle}>Lost & Found System</div>
        <h2 style={styles.title}>Forgot password</h2>

        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
          Enter your email and we'll send a reset link.
        </p>

        <form onSubmit={submit}>
          <div style={styles.group}>
            <label style={styles.label}>Email</label>
            <input value={email} onChange={(e)=>setEmail(e.target.value)} type="email" required
              style={styles.input} placeholder="you@example.com" />
          </div>
          <button type="submit" disabled={busy} style={styles.btn}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        {msg && (
          <div style={{
            marginTop: 16, padding: '10px 12px', borderRadius: 8, fontSize: 13,
            background: msg.startsWith('❌') ? 'rgba(239,68,68,0.1)' : 'rgba(52,211,153,0.1)',
            color: msg.startsWith('❌') ? '#f87171' : '#34d399',
            border: `1px solid ${msg.startsWith('❌') ? 'rgba(239,68,68,0.3)' : 'rgba(52,211,153,0.3)'}`,
          }}>
            {msg}
          </div>
        )}

        {devUrl && (
          <div style={{
            marginTop: 12, padding: '10px 12px', borderRadius: 8, fontSize: 11,
            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
            color: '#cbd5e1', wordBreak: 'break-all'
          }}>
            <div style={{ marginBottom: 6, color: '#818cf8', fontWeight: 700 }}>DEV MODE — open this link to reset:</div>
            <a href={devUrl} style={{ color: '#818cf8' }}>{devUrl}</a>
          </div>
        )}

        <p style={styles.link}>
          Remember your password? <Link to="/login" style={{ color: '#818cf8' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page:     { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' },
  card:     { background:'#1e2130', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, padding:'40px 36px', width:'100%', maxWidth:420 },
  logo:     { fontSize:22, fontWeight:700, color:'#818cf8', marginBottom:4 },
  subtitle: { fontSize:12, color:'#94a3b8', marginBottom:24 },
  title:    { fontSize:20, fontWeight:600, color:'#e2e8f0', marginBottom:8 },
  group:    { marginBottom:16 },
  label:    { display:'block', fontSize:11, color:'#94a3b8', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:6 },
  input:    { width:'100%', background:'#262b3d', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'10px 14px', color:'#e2e8f0', fontSize:13, boxSizing:'border-box', outline:'none' },
  btn:      { width:'100%', background:'#6366f1', color:'white', border:'none', borderRadius:8, padding:'11px', fontSize:14, fontWeight:500, cursor:'pointer', marginTop:8 },
  link:     { textAlign:'center', marginTop:20, fontSize:13, color:'#94a3b8' }
};
