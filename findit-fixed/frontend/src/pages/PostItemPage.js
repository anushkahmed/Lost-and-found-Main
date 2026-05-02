// src/pages/PostItemPage.js — Feature 1: Post Found Items
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import OwnershipQuestionsForm from '../components/OwnershipQuestionsForm';
import MapPicker from '../components/MapPicker';

const INITIAL_FORM = {
  name: '', category: '', colour: '', brand: '',
  description: '', foundLocation: '', storageLocation: '', date: ''
};

export default function PostItemPage() {
  const navigate = useNavigate();
  const [form,    setForm]    = useState(INITIAL_FORM);
  const [isHighValue, setIsHighValue] = useState(false);
  const [ownershipQuestions, setOwnershipQuestions] = useState([]);
  const [coords, setCoords] = useState(null);
  const [images,  setImages]  = useState([]);
  const [preview, setPreview] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error,   setError]   = useState('');
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    axios.get('/api/categories').then(res => setCategories(res.data)).catch(() => {});
  }, []);

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleImageChange = e => {
    const files = Array.from(e.target.files);
    setImages(files);
    // Show image previews
    const previews = files.map(f => URL.createObjectURL(f));
    setPreview(previews);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validate required fields
    if (!form.name || !form.category || !form.foundLocation || !form.date) {
      setError('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    try {
      // Use FormData to send both text fields and image files
      const formData = new FormData();
      Object.entries(form).forEach(([key, val]) => formData.append(key, val));
      formData.append('isHighValue', String(isHighValue));
      formData.append('ownershipQuestions', JSON.stringify(ownershipQuestions));
      if (coords && coords.lat != null && coords.lng != null) {
        formData.append('lat', String(coords.lat));
        formData.append('lng', String(coords.lng));
      }
      images.forEach(img => formData.append('images', img));

      await axios.post('/api/items', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setSuccess('Item posted successfully! It is now visible to all users.');
      setForm(INITIAL_FORM);
      setIsHighValue(false);
      setOwnershipQuestions([]);
      setImages([]);
      setPreview([]);

      // Redirect to search after 2s
      setTimeout(() => navigate('/search'), 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to post item.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <div>
          <h1 style={styles.h1}>Post a Found Item</h1>
          <p style={styles.sub}>Fill in details so the owner can find it — <code style={styles.code}>POST /api/items → MongoDB</code></p>
        </div>
      </div>

      <div style={styles.formWrap}>
        {success && <div style={styles.successBox}>✅ {success}</div>}
        {error   && <div style={styles.errorBox}>❌ {error}</div>}

        <form onSubmit={handleSubmit}>
          {/* ── Section 1: Item Details ── */}
          <SectionTitle>Item Details</SectionTitle>
          <div style={styles.grid2}>
            <Field label="Item Name *" required>
              <input name="name" value={form.name} onChange={handleChange}
                style={styles.input} placeholder="e.g. Blue Backpack" required />
            </Field>

            <Field label="Category *" required>
              <select name="category" value={form.category} onChange={handleChange} style={styles.input} required>
                <option value="">Select category...</option>
                {categories.map(c => <option key={c._id || c.name} value={c.name}>{c.icon || '📦'} {c.name}</option>)}
              </select>
            </Field>

            <Field label="Colour">
              <input name="colour" value={form.colour} onChange={handleChange}
                style={styles.input} placeholder="e.g. Dark Blue" />
            </Field>

            <Field label="Brand / Model">
              <input name="brand" value={form.brand} onChange={handleChange}
                style={styles.input} placeholder="e.g. Nike, Samsung" />
            </Field>

            <Field label="Description" fullWidth>
              <textarea name="description" value={form.description} onChange={handleChange}
                style={{ ...styles.input, height:80, resize:'vertical' }}
                placeholder="Describe distinguishing features, serial numbers, contents..." />
            </Field>
          </div>

          {/* ── Section 2: Location & Date ── */}
          <SectionTitle>Location & Date</SectionTitle>
          <div style={styles.grid2}>
            <Field label="Found Location *">
              <input name="foundLocation" value={form.foundLocation} onChange={handleChange}
                style={styles.input} placeholder="e.g. Library 3rd Floor" required />
            </Field>

            <Field label="Date Found *">
              <input name="date" type="date" value={form.date} onChange={handleChange}
                style={styles.input} required />
            </Field>

            <Field label="Storage Location">
              <input name="storageLocation" value={form.storageLocation} onChange={handleChange}
                style={styles.input} placeholder="e.g. Security Office, Room 101" />
            </Field>
          </div>

          {/* ── Pin drop ── */}
          <SectionTitle>📍 Pin location on map (optional)</SectionTitle>
          <MapPicker value={coords} onChange={setCoords} />

          {/* ── Section 3: Photos ── */}
          <SectionTitle>Photos (optional, max 5)</SectionTitle>
          <label style={styles.uploadArea}>
            <input type="file" accept="image/*" multiple onChange={handleImageChange}
              style={{ display:'none' }} />
            <div style={{ fontSize:28, marginBottom:8 }}>📷</div>
            <div style={{ fontWeight:500, marginBottom:4, fontSize:13 }}>Click to upload photos</div>
            <div style={{ fontSize:11, color:'#64748b' }}>JPEG, PNG, WebP — max 5MB each</div>
          </label>

          {/* Image previews */}
          {preview.length > 0 && (
            <div style={styles.previewRow}>
              {preview.map((src, i) => (
                <img key={i} src={src} alt={`preview-${i}`}
                  style={{ width:70, height:70, objectFit:'cover', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)' }} />
              ))}
            </div>
          )}

          {/* ── Section 4: Verification & priority ── */}
          <SectionTitle>Verification & Priority</SectionTitle>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div style={{ background:'#262b3d', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, padding:12 }}>
              <div style={{ fontSize:11, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.4px', fontWeight:600, marginBottom:8 }}>
                High-value item
              </div>
              <label style={{ display:'flex', gap:10, alignItems:'center', cursor:'pointer', color:'#e2e8f0', fontSize:13 }}>
                <input type="checkbox" checked={isHighValue} onChange={e => setIsHighValue(e.target.checked)} />
                Mark as high-value (requires admin approval)
              </label>
              <div style={{ fontSize:11, color:'#64748b', marginTop:8, lineHeight:1.5 }}>
                High-value listings are prioritized and may require stronger verification before return.
              </div>
            </div>
            <div style={{ background:'#262b3d', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, padding:12 }}>
              <div style={{ fontSize:11, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.4px', fontWeight:600, marginBottom:8 }}>
                Ownership questions
              </div>
              <OwnershipQuestionsForm
                questions={ownershipQuestions}
                onChange={setOwnershipQuestions}
                editable
                mode="edit"
              />
            </div>
          </div>

          {/* ── Submit ── */}
          <div style={styles.btnRow}>
            <button type="submit" style={styles.btnPrimary} disabled={loading}>
              {loading ? '⏳ Submitting...' : '✓ Submit to Database'}
            </button>
            <button type="button" style={styles.btnGhost}
              onClick={() => { setForm(INITIAL_FORM); setImages([]); setPreview([]); setIsHighValue(false); setOwnershipQuestions([]); setCoords(null); }}>
              Clear Form
            </button>
          </div>

          {/* MongoDB schema hint */}
          <div style={styles.schemaHint}>
            <strong style={{ color:'#818cf8' }}>MongoDB document saved:</strong>{' '}
            <span style={{ color:'#64748b' }}>
              {'{ name, category, colour, brand, description, foundLocation, storageLocation, date, images[], status:"found", postedBy:userId, createdAt }'}
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Small helper components ─── */
function SectionTitle({ children }) {
  return (
    <div style={{ fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase',
      letterSpacing:'0.5px', margin:'20px 0 10px', paddingBottom:6,
      borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
      {children}
    </div>
  );
}

function Field({ label, children, fullWidth }) {
  return (
    <div style={{ gridColumn: fullWidth ? '1 / -1' : undefined, display:'flex', flexDirection:'column', gap:5 }}>
      <label style={{ fontSize:11, color:'#94a3b8', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.4px' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const styles = {
  page:       { padding:24 },
  topBar:     { marginBottom:20 },
  h1:         { fontSize:19, fontWeight:600, color:'#e2e8f0', marginBottom:4 },
  sub:        { fontSize:13, color:'#94a3b8' },
  code:       { background:'#262b3d', padding:'2px 6px', borderRadius:4, fontSize:11, color:'#818cf8' },
  formWrap:   { background:'#1e2130', border:'1px solid rgba(255,255,255,0.08)', borderRadius:14, padding:24, maxWidth:700 },
  successBox: { background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.3)', color:'#34d399', borderRadius:8, padding:'10px 14px', fontSize:13, marginBottom:16 },
  errorBox:   { background:'rgba(239,68,68,0.1)',  border:'1px solid rgba(239,68,68,0.3)',  color:'#f87171', borderRadius:8, padding:'10px 14px', fontSize:13, marginBottom:16 },
  grid2:      { display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 },
  input:      { background:'#262b3d', border:'1px solid rgba(255,255,255,0.08)', borderRadius:7, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none', width:'100%', boxSizing:'border-box' },
  uploadArea: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', border:'2px dashed rgba(255,255,255,0.1)', borderRadius:10, padding:'28px', textAlign:'center', color:'#94a3b8', cursor:'pointer' },
  previewRow: { display:'flex', gap:10, marginTop:12, flexWrap:'wrap' },
  btnRow:     { display:'flex', gap:10, marginTop:20 },
  btnPrimary: { flex:1, background:'#6366f1', color:'white', border:'none', borderRadius:8, padding:11, fontSize:14, fontWeight:500, cursor:'pointer' },
  btnGhost:   { background:'#262b3d', color:'#94a3b8', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'11px 18px', fontSize:13, cursor:'pointer' },
  schemaHint: { marginTop:12, padding:'10px 14px', background:'#262b3d', borderRadius:7, fontSize:11 },
};
