// src/pages/SearchPage.js — Feature 2: Search & Filter
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import OwnershipQuestionsForm from '../components/OwnershipQuestionsForm';
import ItemHistoryViewer from '../components/ItemHistoryViewer';
import { useAuth } from '../context/AuthContext';
import { fileUrl } from '../config';

// Categories loaded dynamically from /api/categories
const STATUSES   = ['', 'found', 'claimed', 'returned', 'expired'];
const COLOURS    = ['', 'Black', 'White', 'Blue', 'Red', 'Green', 'Yellow', 'Brown', 'Grey', 'Silver'];

const CATEGORY_ICON = {
  Electronics:'📱', Clothing:'👕', Documents:'📄',
  Accessories:'👓', Keys:'🔑', Bags:'🎒', Other:'📦'
};
const STATUS_STYLE = {
  found:    { bg:'rgba(16,185,129,0.15)',  color:'#34d399' },
  claimed:  { bg:'rgba(245,158,11,0.15)',  color:'#fbbf24' },
  returned: { bg:'rgba(99,102,241,0.15)',  color:'#818cf8' },
  expired:  { bg:'rgba(239,68,68,0.15)',   color:'#f87171' },
};

export default function SearchPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items,    setItems]    = useState([]);
  const [total,    setTotal]    = useState(0);
  const [pages,    setPages]    = useState(1);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [categories, setCategories] = useState([]);

  // Filter state — all dynamic, no hardcoded values
  const [filters, setFilters] = useState({
    search: '', category: '', colour: '', location: '', date: '', status: ''
  });
  const [geo, setGeo] = useState({ enabled: false, lat: null, lng: null, radius: 5, msg: '' });

  // Modal for item detail
  const [selected, setSelected] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [claimDesc, setClaimDesc] = useState('');
  const [claimMsg,  setClaimMsg]  = useState('');
  const [claimAnswers, setClaimAnswers] = useState([]);
  const [renewing, setRenewing] = useState(false);

  // Feedback state
  const [fbRating, setFbRating] = useState(5);
  const [fbComment, setFbComment] = useState('');
  const [fbGiven, setFbGiven] = useState(false);
  const [fbMsg, setFbMsg] = useState('');

  useEffect(() => {
    axios.get('/api/categories').then(res => setCategories(res.data)).catch(() => {});
  }, []);

  const fetchItems = useCallback(async (currentPage = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: currentPage, limit: 9 });
      Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
      if (geo.enabled && geo.lat != null && geo.lng != null) {
        params.append('lat', String(geo.lat));
        params.append('lng', String(geo.lng));
        params.append('radius', String(geo.radius));
      }

      const { data } = await axios.get(`/api/items?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages);
      setPage(currentPage);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, geo]);

  useEffect(() => {
    const timeout = setTimeout(() => fetchItems(1), 400);
    return () => clearTimeout(timeout);
  }, [filters, geo]);

  const enableNearMe = () => {
    if (!navigator.geolocation) {
      setGeo(g => ({ ...g, msg: 'Geolocation not available' }));
      return;
    }
    setGeo(g => ({ ...g, msg: 'Getting location…' }));
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ enabled: true, lat: pos.coords.latitude, lng: pos.coords.longitude, radius: 5, msg: '' }),
      (err) => setGeo(g => ({ ...g, enabled: false, msg: 'Location denied: ' + err.message }))
    );
  };
  const disableNearMe = () => setGeo({ enabled: false, lat: null, lng: null, radius: 5, msg: '' });

  const handleFilter = e => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const clearFilters = () => {
    setFilters({ search:'', category:'', colour:'', location:'', date:'', status:'' });
  };

  const submitClaim = async () => {
    if (!claimDesc.trim()) return;
    setClaiming(true);
    try {
      const answersPayload = (claimAnswers || [])
        .filter(a => a && a.question)
        .map(a => ({ question: a.question, answer: (a.answer || '').trim() }));
      await axios.post('/api/claims', { itemId: selected._id, description: claimDesc, answers: answersPayload });
      setClaimMsg('✅ Claim submitted! The admin will review it.');
      setClaimDesc('');
      setClaimAnswers([]);
    } catch (err) {
      setClaimMsg('❌ ' + (err.response?.data?.message || 'Failed to submit claim'));
    } finally {
      setClaiming(false);
    }
  };

  const renewItem = async (itemId) => {
    setRenewing(true);
    try {
      const { data } = await axios.put(`/api/items/${itemId}/renew`);
      setSelected(data.item);
      setClaimMsg('✅ Listing renewed for 30 more days!');
      fetchItems(page);
    } catch (err) {
      setClaimMsg('❌ ' + (err.response?.data?.message || 'Renewal failed'));
    } finally {
      setRenewing(false);
    }
  };

  // Calculate days until expiry
  const daysUntilExpiry = (expiresAt) => {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.topBar}>
        <div>
          <h1 style={styles.h1}>Search & Filter Items</h1>
          <p style={styles.sub}>
            Querying <strong style={{ color:'#818cf8' }}>{total}</strong> items from MongoDB
            {' '}<code style={styles.code}>GET /api/items?{Object.entries(filters).filter(([,v])=>v).map(([k,v])=>`${k}=${v}`).join('&') || '...'}</code>
          </p>
        </div>
      </div>

      {/* ── Filter Panel ── */}
      <div style={styles.filterPanel}>
        {/* Text search */}
        <div style={styles.searchRow}>
          <input
            name="search" value={filters.search} onChange={handleFilter}
            style={{ ...styles.input, flex:1 }}
            placeholder="🔍  Search by name, description, location..."
          />
          <button style={styles.btnGhost} onClick={clearFilters}>✕ Clear</button>
        </div>

        {/* Dropdown filters */}
        <div style={styles.filterRow}>
          {[
            { name:'category', label:'Category', options: ['', ...categories.map(c => c.name)] },
            { name:'colour',   label:'Colour',   options: COLOURS    },
            { name:'status',   label:'Status',   options: STATUSES   },
          ].map(f => (
            <div key={f.name} style={styles.filterGroup}>
              <label style={styles.filterLabel}>{f.label}</label>
              <select name={f.name} value={filters[f.name]} onChange={handleFilter} style={styles.select}>
                {f.options.map(o => (
                  <option key={o} value={o}>{o || `All ${f.label}s`}</option>
                ))}
              </select>
            </div>
          ))}

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Location</label>
            <input name="location" value={filters.location} onChange={handleFilter}
              style={styles.select} placeholder="e.g. Library" />
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Date</label>
            <input name="date" type="date" value={filters.date} onChange={handleFilter}
              style={styles.select} />
          </div>
        </div>

        {/* Geo / Near me */}
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {!geo.enabled ? (
            <button onClick={enableNearMe}
              style={{ background: '#262b3d', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.08)', padding: '7px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
              📍 Search near me
            </button>
          ) : (
            <>
              <span style={{ fontSize: 12, color: '#34d399' }}>
                📍 Near me: {geo.lat?.toFixed(4)}, {geo.lng?.toFixed(4)}
              </span>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                Radius: <strong style={{ color: '#e2e8f0' }}>{geo.radius} km</strong>
                <input type="range" min={1} max={25} step={1} value={geo.radius}
                  onChange={(e) => setGeo(g => ({ ...g, radius: Number(e.target.value) }))}
                  style={{ width: 140 }} />
              </label>
              <button onClick={disableNearMe}
                style={{ background: 'transparent', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)', padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
                Clear
              </button>
            </>
          )}
          {geo.msg && <span style={{ fontSize: 12, color: '#f87171' }}>{geo.msg}</span>}
        </div>
      </div>

      {/* ── Results ── */}
      {loading
        ? <div style={styles.loading}>Searching MongoDB...</div>
        : items.length === 0
          ? <div style={styles.empty}>No items found matching your filters.</div>
          : (
            <div style={styles.itemsGrid}>
              {items.map(item => (
                <div key={item._id} style={styles.itemCard} onClick={() => {
                  setSelected(item);
                  setClaimMsg('');
                  setClaimAnswers((item.ownershipQuestions || []).map(q => ({ question: q.question, answer: '' })));
                }}>
                  <div style={{ ...styles.itemImg, background:'rgba(99,102,241,0.07)' }}>
                    {CATEGORY_ICON[item.category] || '📦'}
                  </div>
                  <div style={styles.itemBody}>
                    <div style={styles.itemName}>{item.name}</div>
                    <div style={styles.itemMeta}>
                      📂 {item.category}
                      {item.colour && <> · 🎨 {item.colour}</>}<br />
                      📍 {item.foundLocation}<br />
                      📅 {new Date(item.date).toLocaleDateString()}
                    </div>
                    {(item.isHighValue && item.highValueApproved !== false) && (
                      <div style={{ fontSize:10, color:'#fbbf24', marginTop:6, fontWeight:600 }}>
                        ⚡ High-value
                      </div>
                    )}
                    <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                      <StatusBadge status={item.status} />
                      {(() => {
                        const d = daysUntilExpiry(item.expiresAt);
                        if (d !== null && d <= 7 && d > 0) return <span style={{ fontSize:9, color:'#fbbf24', fontWeight:600 }}>⏰ {d}d left</span>;
                        return null;
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
      }

      {/* Pagination */}
      {pages > 1 && (
        <div style={styles.pagination}>
          {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
            <button key={p} style={{ ...styles.pageBtn, ...(p === page ? styles.pageBtnActive : {}) }}
              onClick={() => fetchItems(p)}>{p}</button>
          ))}
        </div>
      )}

      {/* ── Item Detail Modal ── */}
      {selected && (
        <div style={styles.overlay} onClick={() => setSelected(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={{ fontSize:32 }}>{CATEGORY_ICON[selected.category] || '📦'}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:16, fontWeight:600 }}>{selected.name}</div>
                <StatusBadge status={selected.status} />
              </div>
              <button onClick={() => setSelected(null)} style={styles.closeBtn}>✕</button>
            </div>

            <div style={styles.modalGrid}>
              {[
                ['Category',    selected.category],
                ['Colour',      selected.colour || '—'],
                ['Brand',       selected.brand  || '—'],
                ['Found at',    selected.foundLocation],
                ['Date found',  new Date(selected.date).toLocaleDateString()],
                ['Stored at',   selected.storageLocation || 'Security Office'],
                ['Posted by',   selected.postedBy?.name || '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={styles.detailLabel}>{label}</div>
                  <div style={styles.detailValue}>{value}</div>
                </div>
              ))}
            </div>

            {/* ── Expiry status bar ── */}
            {(() => {
              const days = daysUntilExpiry(selected.expiresAt);
              const isOwner = selected.postedBy?._id === user?._id;
              const canRenew = isOwner || user?.role === 'admin';
              if (selected.status === 'expired' || selected.status === 'archived') {
                return (
                  <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#f87171', marginBottom:4 }}>
                      ⚠️ This listing has {selected.status === 'archived' ? 'been archived' : 'expired'}
                    </div>
                    <div style={{ fontSize:12, color:'#94a3b8' }}>
                      {canRenew ? 'You can renew it to make it active again for 30 more days.' : 'The poster can renew it from their dashboard.'}
                    </div>
                    {canRenew && (
                      <button onClick={() => renewItem(selected._id)} disabled={renewing}
                        style={{ ...styles.btnPrimary, marginTop:10, background:'#10b981', width:'100%' }}>
                        {renewing ? '🔄 Renewing...' : '🔄 Renew Listing (+30 days)'}
                      </button>
                    )}
                  </div>
                );
              }
              if (days !== null && days <= 7 && days > 0) {
                return (
                  <div style={{ background:'rgba(251,191,36,0.1)', border:'1px solid rgba(251,191,36,0.3)', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#fbbf24', marginBottom:4 }}>
                      ⏰ Expires in {days} day{days !== 1 ? 's' : ''}
                    </div>
                    <div style={{ fontSize:12, color:'#94a3b8' }}>This listing will auto-expire if not claimed or renewed.</div>
                    {canRenew && (
                      <button onClick={() => renewItem(selected._id)} disabled={renewing}
                        style={{ ...styles.btnPrimary, marginTop:10, background:'#f59e0b', width:'100%' }}>
                        {renewing ? '🔄 Renewing...' : '🔄 Renew Listing (+30 days)'}
                      </button>
                    )}
                  </div>
                );
              }
              if (days !== null && days > 0) {
                return (
                  <div style={{ fontSize:11, color:'#64748b', marginBottom:10 }}>
                    ⏱️ Listing expires in {days} day{days !== 1 ? 's' : ''} ({new Date(selected.expiresAt).toLocaleDateString()})
                    {selected.renewedAt && <span> · Last renewed {new Date(selected.renewedAt).toLocaleDateString()}</span>}
                  </div>
                );
              }
              return null;
            })()}

            {selected.description && (
              <div style={styles.descBox}>
                <div style={styles.detailLabel}>Description</div>
                <div style={{ fontSize:13, color:'#cbd5e1', lineHeight:1.6, marginTop:4 }}>{selected.description}</div>
              </div>
            )}

            {/* Show uploaded images if any */}
            {selected.images && selected.images.length > 0 && (
              <div style={{ marginTop:12 }}>
                <div style={styles.detailLabel}>Photos</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:6 }}>
                  {selected.images.map((img, i) => (
                    <img key={i} src={fileUrl(img)} alt={`item-${i}`}
                      style={{ width:80, height:80, objectFit:'cover', borderRadius:8,
                        border:'1px solid rgba(255,255,255,0.1)' }} />
                  ))}
                </div>
              </div>
            )}

            {/* Claim form — only show if status is "found" */}
            {selected.status === 'found' && (
              <div style={styles.claimSection}>
                <div style={styles.detailLabel}>Submit a Claim</div>
                <textarea
                  value={claimDesc} onChange={e => setClaimDesc(e.target.value)}
                  style={{ ...styles.input, marginTop:8, height:70, resize:'vertical' }}
                  placeholder="Describe proof of ownership (contents, serial number, distinguishing marks...)"
                />

                {Array.isArray(selected.ownershipQuestions) && selected.ownershipQuestions.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={styles.detailLabel}>Ownership questions</div>
                    <div style={{ marginTop: 8 }}>
                      <OwnershipQuestionsForm
                        mode="answer"
                        questions={claimAnswers}
                        onChange={setClaimAnswers}
                        editable
                      />
                    </div>
                  </div>
                )}

                {claimMsg && <div style={{ fontSize:12, marginTop:6, color: claimMsg.startsWith('✅') ? '#34d399' : '#f87171' }}>{claimMsg}</div>}
                <button style={{ ...styles.btnPrimary, marginTop:10, width:'100%' }}
                  onClick={submitClaim} disabled={claiming}>
                  {claiming ? 'Submitting...' : '📨 Submit Claim'}
                </button>

                {selected.postedBy?._id && (
                  <button
                    style={{ ...styles.btnGhost, marginTop: 8, width: '100%' }}
                    onClick={async () => {
                      try {
                        await axios.post('/api/chat/conversations', { recipientId: selected.postedBy._id, itemId: selected._id });
                        navigate('/chat');
                      } catch (e) {
                        setClaimMsg('❌ Unable to open chat');
                      }
                    }}
                  >
                    💬 Message poster
                  </button>
                )}

                <button
                  style={{ ...styles.btnGhost, marginTop: 8, width: '100%', borderColor: 'rgba(248,113,113,0.45)', color: '#f87171' }}
                  onClick={async () => {
                    const reason = window.prompt('Reason? (fake / scam / inappropriate / spam / other)', 'fake');
                    if (!reason) return;
                    const details = window.prompt('Optional details:', '') || '';
                    try {
                      await axios.post('/api/abuse', {
                        targetType: 'item', targetItemId: selected._id, reason: reason.trim().toLowerCase(), details
                      });
                      setClaimMsg('✅ Report submitted to admins');
                    } catch (e) {
                      setClaimMsg('❌ ' + (e.response?.data?.message || 'Report failed'));
                    }
                  }}
                >
                  🚩 Report listing
                </button>

                {(user?.role === 'admin' || selected.postedBy?._id === user?._id) && (
                  <ItemHistoryViewer itemId={selected._id} />
                )}
              </div>
            )}

            {/* Feedback section — only for returned items */}
            {selected.status === 'returned' && (
              <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:16, marginTop:12 }}>
                <div style={styles.detailLabel}>⭐ Rate this experience</div>
                {fbGiven ? (
                  <div style={{ fontSize:12, color:'#34d399', marginTop:8 }}>✅ You already gave feedback for this item.</div>
                ) : (
                  <div style={{ marginTop:8 }}>
                    <div style={{ display:'flex', gap:4, marginBottom:8 }}>
                      {[1,2,3,4,5].map(star => (
                        <span key={star} onClick={() => setFbRating(star)}
                          style={{ fontSize:22, cursor:'pointer', opacity: star <= fbRating ? 1 : 0.3 }}>⭐</span>
                      ))}
                    </div>
                    <input value={fbComment} onChange={e => setFbComment(e.target.value)}
                      style={{ ...styles.input, marginBottom:8 }}
                      placeholder="Optional comment..." maxLength={500} />
                    {fbMsg && <div style={{ fontSize:12, marginBottom:6, color: fbMsg.startsWith('✅') ? '#34d399' : '#f87171' }}>{fbMsg}</div>}
                    <button style={{ ...styles.btnPrimary, width:'100%' }}
                      onClick={async () => {
                        setFbMsg('');
                        const toUser = selected.postedBy?._id === user?._id
                          ? null  // poster can't rate themselves
                          : selected.postedBy?._id;
                        if (!toUser) { setFbMsg('❌ Cannot rate yourself'); return; }
                        try {
                          await axios.post('/api/feedback', {
                            itemId: selected._id, toUser, rating: fbRating,
                            comment: fbComment, type: 'finder'
                          });
                          setFbMsg('✅ Thank you for your feedback!');
                          setFbGiven(true);
                        } catch (err) {
                          setFbMsg('❌ ' + (err.response?.data?.message || 'Failed'));
                        }
                      }}>Submit Feedback</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.found;
  return (
    <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:4, fontSize:10,
      fontWeight:600, textTransform:'uppercase', background:s.bg, color:s.color, marginTop:6 }}>
      {status}
    </span>
  );
}

const styles = {
  page:        { padding:24 },
  topBar:      { marginBottom:16 },
  h1:          { fontSize:19, fontWeight:600, color:'#e2e8f0', marginBottom:4 },
  sub:         { fontSize:12, color:'#94a3b8' },
  code:        { background:'#262b3d', padding:'2px 6px', borderRadius:4, fontSize:11, color:'#818cf8' },
  filterPanel: { background:'#1e2130', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:16, marginBottom:20 },
  searchRow:   { display:'flex', gap:10, marginBottom:12 },
  filterRow:   { display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' },
  filterGroup: { display:'flex', flexDirection:'column', gap:4 },
  filterLabel: { fontSize:10, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.4px' },
  input:       { background:'#262b3d', border:'1px solid rgba(255,255,255,0.08)', borderRadius:7, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none', width:'100%', boxSizing:'border-box' },
  select:      { background:'#262b3d', border:'1px solid rgba(255,255,255,0.08)', borderRadius:7, padding:'7px 10px', color:'#e2e8f0', fontSize:12, outline:'none' },
  btnGhost:    { background:'#262b3d', color:'#94a3b8', border:'1px solid rgba(255,255,255,0.08)', borderRadius:7, padding:'9px 14px', fontSize:12, cursor:'pointer', whiteSpace:'nowrap' },
  loading:     { textAlign:'center', color:'#818cf8', padding:40, fontSize:14 },
  empty:       { textAlign:'center', color:'#94a3b8', padding:60, fontSize:14 },
  itemsGrid:   { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 },
  itemCard:    { background:'#1e2130', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, overflow:'hidden', cursor:'pointer', transition:'border-color 0.15s' },
  itemImg:     { height:90, display:'flex', alignItems:'center', justifyContent:'center', fontSize:32 },
  itemBody:    { padding:'12px 14px' },
  itemName:    { fontSize:13, fontWeight:600, color:'#e2e8f0', marginBottom:4 },
  itemMeta:    { fontSize:11, color:'#94a3b8', lineHeight:1.7 },
  pagination:  { display:'flex', gap:6, marginTop:20, justifyContent:'center' },
  pageBtn:     { background:'#262b3d', border:'1px solid rgba(255,255,255,0.08)', color:'#94a3b8', borderRadius:6, padding:'6px 12px', cursor:'pointer', fontSize:13 },
  pageBtnActive:{ background:'#6366f1', color:'white', borderColor:'#6366f1' },
  // Modal
  overlay:     { position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 },
  modal:       { background:'#1e2130', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, padding:24, width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto' },
  modalHeader: { display:'flex', gap:14, alignItems:'flex-start', marginBottom:20 },
  modalGrid:   { display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 },
  detailLabel: { fontSize:10, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.4px' },
  detailValue: { fontSize:13, color:'#e2e8f0', marginTop:3 },
  descBox:     { background:'#262b3d', borderRadius:8, padding:12, marginBottom:16 },
  claimSection:{ borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:16, marginTop:4 },
  btnPrimary:  { background:'#6366f1', color:'white', border:'none', borderRadius:8, padding:10, fontSize:13, fontWeight:500, cursor:'pointer' },
  btnGhost:    { background:'#262b3d', color:'#94a3b8', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:10, fontSize:13, fontWeight:500, cursor:'pointer' },
  closeBtn:    { background:'none', border:'none', color:'#94a3b8', fontSize:18, cursor:'pointer', padding:4 },
};
