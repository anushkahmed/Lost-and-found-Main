// src/pages/RegisterPage.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm]     = useState({ name: '', email: '', password: '', phone: '' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (form.password.length < 10) {
      setError('Password must be at least 10 characters (include uppercase, lowercase & a digit).');
      return;
    }
    setLoading(true);
    try {
      await register(form.name, form.email, form.password, form.phone);
      navigate('/');
    } catch (err) {
      const d = err.response?.data;
      const msg = d?.issues?.length
        ? d.issues.map(i => i.message).join('. ')
        : d?.message || 'Registration failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>🔍 FindIt</div>
        <div style={styles.subtitle}>Lost & Found System</div>
        <h2 style={styles.title}>Create Account</h2>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          {[
            { name:'name',     label:'Full Name',    type:'text',     placeholder:'John Doe' },
            { name:'email',    label:'Email',         type:'email',    placeholder:'you@example.com' },
            { name:'password', label:'Password',      type:'password', placeholder:'Min 10 chars, upper+lower+digit' },
            { name:'phone',    label:'Phone (optional)', type:'text',  placeholder:'+880 1234 567890' },
          ].map(f => (
            <div key={f.name} style={styles.group}>
              <label style={styles.label}>{f.label}</label>
              <input
                name={f.name} type={f.type} required={f.name !== 'phone'}
                value={form[f.name]} onChange={handleChange}
                style={styles.input} placeholder={f.placeholder}
              />
            </div>
          ))}
          <button type="submit" style={styles.btn} disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p style={styles.link}>
          Already have an account? <Link to="/login" style={{ color:'#818cf8' }}>Sign in</Link>
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
  title:    { fontSize:20, fontWeight:600, color:'#e2e8f0', marginBottom:24 },
  error:    { background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#f87171', borderRadius:8, padding:'10px 14px', fontSize:13, marginBottom:16 },
  group:    { marginBottom:16 },
  label:    { display:'block', fontSize:11, color:'#94a3b8', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:6 },
  input:    { width:'100%', background:'#262b3d', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'10px 14px', color:'#e2e8f0', fontSize:13, boxSizing:'border-box', outline:'none' },
  btn:      { width:'100%', background:'#6366f1', color:'white', border:'none', borderRadius:8, padding:'11px', fontSize:14, fontWeight:500, cursor:'pointer', marginTop:8 },
  link:     { textAlign:'center', marginTop:20, fontSize:13, color:'#94a3b8' }
};
