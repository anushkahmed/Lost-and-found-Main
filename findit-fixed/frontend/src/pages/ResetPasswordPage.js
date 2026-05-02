import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const token = params.get('token') || '';
  const email = params.get('email') || '';
  const valid = useMemo(() => token && email, [token, email]);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [busy, setBusy]         = useState(false);
  const [msg, setMsg]           = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setMsg('❌ Passwords do not match'); return; }
    if (password.length < 6)  { setMsg('❌ Password must be at least 6 characters'); return; }
    setBusy(true); setMsg('');
    try {
      await axios.post('/api/auth/reset-password', { token, email, password });
      setMsg('✅ Password updated. Redirecting to sign-in…');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Reset failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>🔍 FindIt</div>
        <div style={styles.subtitle}>Lost & Found System</div>
        <h2 style={styles.title}>Reset password</h2>

        {!valid ? (
          <div style={{ color: '#f87171', fontSize: 13 }}>
            Invalid reset link. <Link to="/forgot-password" style={{ color: '#818cf8' }}>Request a new one</Link>.
          </div>
        ) : (
          <form onSubmit={submit}>
            <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 14 }}>
              Resetting password for <strong style={{ color: '#e2e8f0' }}>{email}</strong>
            </div>
            <div style={styles.group}>
              <label style={styles.label}>New password</label>
              <input value={password} onChange={(e)=>setPassword(e.target.value)} type="password" required
                style={styles.input} placeholder="At least 6 characters" />
            </div>
            <div style={styles.group}>
              <label style={styles.label}>Confirm password</label>
              <input value={confirm} onChange={(e)=>setConfirm(e.target.value)} type="password" required
                style={styles.input} placeholder="Repeat" />
            </div>
            <button type="submit" disabled={busy} style={styles.btn}>
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}

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

        <p style={styles.link}>
          <Link to="/login" style={{ color: '#818cf8' }}>← Back to sign-in</Link>
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
