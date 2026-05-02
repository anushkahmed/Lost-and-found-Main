// src/pages/LoginPage.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, loginWith2fa } = useAuth();
  const navigate = useNavigate();
  const [form, setForm]       = useState({ email: '', password: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const [step, setStep]                 = useState('credentials'); // 'credentials' | '2fa'
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [code, setCode]                 = useState('');

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(form.email, form.password);
      if (data?.needsTwoFactor) {
        setTwoFactorToken(data.twoFactorToken);
        setStep('2fa');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handle2fa = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginWith2fa(twoFactorToken, code);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Code verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>🔍 FindIt</div>
        <div style={styles.subtitle}>Lost & Found System</div>
        <h2 style={styles.title}>{step === '2fa' ? 'Two-Factor Authentication' : 'Sign In'}</h2>

        {error && <div style={styles.error}>{error}</div>}

        {step === 'credentials' && (
          <form onSubmit={handleSubmit}>
            <div style={styles.group}>
              <label style={styles.label}>Email</label>
              <input
                name="email" type="email" required autoFocus
                value={form.email} onChange={handleChange}
                style={styles.input} placeholder="you@example.com"
              />
            </div>
            <div style={styles.group}>
              <label style={styles.label}>Password</label>
              <input
                name="password" type="password" required
                value={form.password} onChange={handleChange}
                style={styles.input} placeholder="••••••••"
              />
            </div>
            <button type="submit" style={styles.btn} disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

        {step === '2fa' && (
          <form onSubmit={handle2fa}>
            <p style={{ color:'#94a3b8', fontSize:13, marginBottom:14 }}>
              Open your authenticator app and enter the 6-digit code for FindIt.
            </p>
            <div style={styles.group}>
              <label style={styles.label}>Authentication code</label>
              <input
                inputMode="numeric" pattern="[0-9 ]*" required autoFocus
                value={code} onChange={(e)=>setCode(e.target.value)}
                style={{ ...styles.input, letterSpacing:4, fontSize:18, textAlign:'center' }}
                placeholder="123 456" maxLength={9}
              />
            </div>
            <button type="submit" style={styles.btn} disabled={loading}>
              {loading ? 'Verifying...' : 'Verify & Sign In'}
            </button>
            <button type="button"
              style={{ ...styles.btn, background:'transparent', color:'#94a3b8', marginTop:8 }}
              onClick={() => { setStep('credentials'); setCode(''); setTwoFactorToken(''); }}>
              ← Use a different account
            </button>
          </form>
        )}

        <p style={styles.link}>
          Don't have an account? <Link to="/register" style={{ color: '#818cf8' }}>Register</Link>
        </p>
        {step === 'credentials' && (
          <p style={{ ...styles.link, marginTop: 6 }}>
            <Link to="/forgot-password" style={{ color: '#818cf8' }}>Forgot password?</Link>
          </p>
        )}
      </div>
    </div>
  );
}

const styles = {
  page:     { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' },
  card:     { background:'#1e2130', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, padding:'40px 36px', width:'100%', maxWidth:400 },
  logo:     { fontSize:22, fontWeight:700, color:'#818cf8', marginBottom:4 },
  subtitle: { fontSize:12, color:'#94a3b8', marginBottom:24 },
  title:    { fontSize:20, fontWeight:600, color:'#e2e8f0', marginBottom:24 },
  error:    { background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#f87171', borderRadius:8, padding:'10px 14px', fontSize:13, marginBottom:16 },
  group:    { marginBottom:16 },
  label:    { display:'block', fontSize:11, color:'#94a3b8', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:6 },
  input:    { width:'100%', background:'#262b3d', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'10px 14px', color:'#e2e8f0', fontSize:13, boxSizing:'border-box', outline:'none' },
  btn:      { width:'100%', background:'#6366f1', color:'white', border:'none', borderRadius:8, padding:'11px', fontSize:14, fontWeight:500, cursor:'pointer', marginTop:8 },
  link:     { textAlign:'center', marginTop:20, fontSize:13, color:'#94a3b8' }
};
