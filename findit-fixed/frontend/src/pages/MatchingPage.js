// src/pages/MatchingPage.js — Feature 3: Matching System
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function MatchingPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [matches,    setMatches]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [running,    setRunning]    = useState(false);
  const [runResult,  setRunResult]  = useState('');

  // Lost report form state
  const [reportForm, setReportForm] = useState({
    name: '', category: '', colour: '', description: '', lostLocation: '', date: ''
  });
  const [reportMsg,  setReportMsg]  = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState([]);

  const fetchMatches = async () => {
    try {
      const { data } = await axios.get('/api/matches');
      setMatches(data);
    } catch (err) {
      console.error('Matches fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
    axios.get('/api/categories').then(res => setCategories(res.data)).catch(() => {});
  }, []);

  // Admin: trigger the matching algorithm
  const runMatching = async () => {
    setRunning(true);
    setRunResult('');
    try {
      const { data } = await axios.post('/api/matches/run');
      setRunResult(`✅ ${data.message}`);
      fetchMatches();
    } catch (err) {
      setRunResult('❌ ' + (err.response?.data?.message || 'Failed to run matching'));
    } finally {
      setRunning(false);
    }
  };

  // Admin: confirm or reject a match
  const updateMatch = async (matchId, status) => {
    try {
      await axios.put(`/api/matches/${matchId}`, { status });
      fetchMatches();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update match');
    }
  };

  // User: submit a lost report
  const submitLostReport = async e => {
    e.preventDefault();
    setSubmitting(true);
    setReportMsg('');
    try {
      await axios.post('/api/matches/report-lost', reportForm);
      setReportMsg('✅ Lost report submitted! The system will look for matches.');
      setReportForm({ name:'', category:'', colour:'', description:'', lostLocation:'', date:'' });
    } catch (err) {
      setReportMsg('❌ ' + (err.response?.data?.message || 'Failed to submit report'));
    } finally {
      setSubmitting(false);
    }
  };

  const scoreColor = score =>
    score >= 80 ? '#34d399' : score >= 60 ? '#fbbf24' : '#f87171';

  const pendingMatches   = matches.filter(m => m.status === 'pending');
  const confirmedMatches = matches.filter(m => m.status === 'confirmed');

  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <div>
          <h1 style={styles.h1}>Matching System</h1>
          <p style={styles.sub}>Algorithm compares lost reports vs found items using category, colour, location & date</p>
        </div>
        {isAdmin && (
          <button style={styles.btnPrimary} onClick={runMatching} disabled={running}>
            {running ? '⏳ Running...' : '🔗 Run Matching Algorithm'}
          </button>
        )}
      </div>

      {runResult && (
        <div style={{ ...styles.infoBox, color: runResult.startsWith('✅') ? '#34d399' : '#f87171' }}>
          {runResult}
        </div>
      )}

      {/* Stats row */}
      <div style={styles.statsRow}>
        {[
          { label:'Total Matches',     value: matches.length,         color:'#818cf8' },
          { label:'Pending Review',    value: pendingMatches.length,   color:'#fbbf24' },
          { label:'Confirmed',         value: confirmedMatches.length, color:'#34d399' },
          { label:'Rejected',          value: matches.filter(m=>m.status==='rejected').length, color:'#f87171' },
        ].map(s => (
          <div key={s.label} style={styles.statCard}>
            <div style={{ fontSize:26, fontWeight:700, color:s.color }}>{s.value}</div>
            <div style={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={styles.twoCol}>
        {/* ── Matches List ── */}
        <div>
          <SectionTitle>
            Pending Matches{pendingMatches.length > 0 && <span style={styles.badge}>{pendingMatches.length}</span>}
          </SectionTitle>

          {loading && <Spinner />}
          {!loading && pendingMatches.length === 0 && (
            <EmptyState msg="No pending matches. Run the algorithm to find new matches." />
          )}

          {pendingMatches.map(m => (
            <MatchCard key={m._id} match={m} isAdmin={isAdmin} onUpdate={updateMatch} scoreColor={scoreColor} />
          ))}

          {confirmedMatches.length > 0 && (
            <>
              <SectionTitle style={{ marginTop:20 }}>Confirmed Matches</SectionTitle>
              {confirmedMatches.map(m => (
                <MatchCard key={m._id} match={m} isAdmin={isAdmin} onUpdate={updateMatch} scoreColor={scoreColor} confirmed />
              ))}
            </>
          )}
        </div>

        {/* ── Report Lost Item form ── */}
        <div>
          <SectionTitle>Report a Lost Item</SectionTitle>
          <div style={styles.card}>
            <p style={{ fontSize:12, color:'#94a3b8', marginBottom:14, lineHeight:1.6 }}>
              Submit a report and the system will automatically check for matching found items.
            </p>

            {reportMsg && (
              <div style={{ fontSize:12, color: reportMsg.startsWith('✅') ? '#34d399' : '#f87171', marginBottom:12 }}>
                {reportMsg}
              </div>
            )}

            <form onSubmit={submitLostReport}>
              {[
                { name:'name', label:'Item Name *', type:'text', placeholder:'e.g. My Black Wallet', required:true },
                { name:'colour', label:'Colour', type:'text', placeholder:'e.g. Black' },
                { name:'lostLocation', label:'Where did you lose it? *', type:'text', placeholder:'e.g. Cafeteria', required:true },
                { name:'date', label:'Date Lost *', type:'date', required:true },
              ].map(f => (
                <div key={f.name} style={styles.group}>
                  <label style={styles.label}>{f.label}</label>
                  <input
                    name={f.name} type={f.type} required={f.required}
                    value={reportForm[f.name]} placeholder={f.placeholder}
                    onChange={e => setReportForm({ ...reportForm, [e.target.name]: e.target.value })}
                    style={styles.input}
                  />
                </div>
              ))}

              <div style={styles.group}>
                <label style={styles.label}>Category *</label>
                <select name="category" required value={reportForm.category}
                  onChange={e => setReportForm({ ...reportForm, category: e.target.value })}
                  style={styles.input}>
                  <option value="">Select...</option>
                  {categories.map(c => <option key={c._id || c.name} value={c.name}>{c.icon || '📦'} {c.name}</option>)}
                </select>
              </div>

              <div style={styles.group}>
                <label style={styles.label}>Description</label>
                <textarea name="description" value={reportForm.description}
                  onChange={e => setReportForm({ ...reportForm, description: e.target.value })}
                  style={{ ...styles.input, height:60, resize:'vertical' }}
                  placeholder="Any identifiable details..." />
              </div>

              <button type="submit" style={{ ...styles.btnPrimary, width:'100%' }} disabled={submitting}>
                {submitting ? 'Submitting...' : '📋 Submit Lost Report'}
              </button>
            </form>
          </div>

          {/* Algorithm explanation */}
          <div style={styles.algoBox}>
            <div style={styles.algoTitle}>How the matching works</div>
            {[
              { label:'Category match',   pts:'40 pts', color:'#818cf8' },
              { label:'Colour match',     pts:'25 pts', color:'#34d399' },
              { label:'Location overlap', pts:'20 pts', color:'#fbbf24' },
              { label:'Date proximity',   pts:'15 pts', color:'#f87171' },
            ].map(a => (
              <div key={a.label} style={styles.algoRow}>
                <span style={{ fontSize:12 }}>{a.label}</span>
                <span style={{ fontSize:11, background:`${a.color}22`, color:a.color, padding:'2px 8px', borderRadius:4 }}>{a.pts}</span>
              </div>
            ))}
            <div style={{ fontSize:11, color:'#64748b', marginTop:8 }}>Matches scoring 60+ are shown for review</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Match Card ── */
function MatchCard({ match, isAdmin, onUpdate, scoreColor, confirmed }) {
  const score = match.score;
  return (
    <div style={{ background:'#1e2130', border:`1px solid ${confirmed ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.08)'}`, borderRadius:10, padding:14, marginBottom:10 }}>
      <div style={{ display:'flex', gap:10, alignItems:'center' }}>
        {/* Lost side */}
        <div style={{ flex:1, background:'rgba(239,68,68,0.06)', borderRadius:8, padding:10 }}>
          <div style={{ fontSize:10, color:'#f87171', fontWeight:600, marginBottom:4 }}>🔴 LOST</div>
          <div style={{ fontSize:13, fontWeight:600, color:'#e2e8f0' }}>{match.lostReport?.name || 'Unknown'}</div>
          <div style={styles.tagRow}>
            {[match.lostReport?.category, match.lostReport?.colour, match.lostReport?.lostLocation].filter(Boolean).map((t,i) => (
              <span key={i} style={styles.tag}>{t}</span>
            ))}
          </div>
        </div>

        {/* Score */}
        <div style={{ textAlign:'center', minWidth:52 }}>
          <div style={{ width:48, height:48, borderRadius:'50%', border:`2px solid ${scoreColor(score)}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:scoreColor(score), background:`${scoreColor(score)}15`, margin:'0 auto' }}>
            {score}%
          </div>
          <div style={{ fontSize:9, color:'#64748b', marginTop:3, textTransform:'uppercase' }}>match</div>
        </div>

        {/* Found side */}
        <div style={{ flex:1, background:'rgba(16,185,129,0.06)', borderRadius:8, padding:10 }}>
          <div style={{ fontSize:10, color:'#34d399', fontWeight:600, marginBottom:4 }}>🟢 FOUND</div>
          <div style={{ fontSize:13, fontWeight:600, color:'#e2e8f0' }}>{match.foundItem?.name || 'Unknown'}</div>
          <div style={styles.tagRow}>
            {[match.foundItem?.category, match.foundItem?.colour, match.foundItem?.foundLocation].filter(Boolean).map((t,i) => (
              <span key={i} style={styles.tag}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Admin actions */}
      {isAdmin && !confirmed && (
        <div style={{ display:'flex', gap:8, marginTop:10 }}>
          <button style={styles.btnConfirm} onClick={() => onUpdate(match._id, 'confirmed')}>✓ Confirm Match</button>
          <button style={styles.btnReject}  onClick={() => onUpdate(match._id, 'rejected')}>✕ Reject</button>
        </div>
      )}
      {confirmed && (
        <div style={{ marginTop:8, fontSize:11, color:'#34d399' }}>✅ Confirmed match</div>
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  return <div style={{ fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:12, paddingBottom:6, borderBottom:'1px solid rgba(255,255,255,0.06)' }}>{children}</div>;
}
function Spinner() {
  return <div style={{ color:'#818cf8', fontSize:13, padding:20 }}>Loading matches...</div>;
}
function EmptyState({ msg }) {
  return <div style={{ color:'#94a3b8', fontSize:13, padding:'30px 0' }}>{msg}</div>;
}

const styles = {
  page:      { padding:24 },
  topBar:    { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 },
  h1:        { fontSize:19, fontWeight:600, color:'#e2e8f0', marginBottom:4 },
  sub:       { fontSize:13, color:'#94a3b8' },
  btnPrimary:{ background:'#6366f1', color:'white', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:500, cursor:'pointer' },
  infoBox:   { background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)', borderRadius:8, padding:'10px 14px', fontSize:12, marginBottom:16 },
  statsRow:  { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 },
  statCard:  { background:'#1e2130', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, padding:'12px 14px' },
  statLabel: { fontSize:11, color:'#94a3b8', marginTop:4 },
  badge:     { background:'#6366f1', color:'white', fontSize:10, padding:'1px 6px', borderRadius:8, marginLeft:6 },
  twoCol:    { display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:20 },
  card:      { background:'#1e2130', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:16, marginBottom:14 },
  tagRow:    { display:'flex', gap:4, flexWrap:'wrap', marginTop:6 },
  tag:       { background:'rgba(99,102,241,0.12)', color:'#818cf8', padding:'1px 6px', borderRadius:3, fontSize:10 },
  btnConfirm:{ background:'rgba(16,185,129,0.1)', color:'#34d399', border:'1px solid rgba(16,185,129,0.3)', borderRadius:6, padding:'5px 12px', fontSize:12, cursor:'pointer' },
  btnReject: { background:'rgba(239,68,68,0.08)', color:'#f87171', border:'1px solid rgba(239,68,68,0.2)', borderRadius:6, padding:'5px 12px', fontSize:12, cursor:'pointer' },
  group:     { marginBottom:12 },
  label:     { display:'block', fontSize:10, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:5 },
  input:     { width:'100%', background:'#262b3d', border:'1px solid rgba(255,255,255,0.08)', borderRadius:7, padding:'8px 12px', color:'#e2e8f0', fontSize:13, outline:'none', boxSizing:'border-box' },
  algoBox:   { background:'#1e2130', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:14 },
  algoTitle: { fontSize:12, fontWeight:600, color:'#94a3b8', marginBottom:10 },
  algoRow:   { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 },
};
