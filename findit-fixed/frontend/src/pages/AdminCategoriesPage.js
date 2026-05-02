// src/pages/AdminCategoriesPage.js — Admin category management
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const T = {
  card: '#1a2e20', border: 'rgba(74,124,111,0.22)', text: '#daeee6',
  muted: '#6b8f7a', accent: '#4a7c6f', high: '#b8d4c8',
  input: '#0f1a0f', success: '#34d399', danger: '#f87171',
};

export default function AdminCategoriesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // New category form
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📦');
  const [newDesc, setNewDesc] = useState('');

  // Edit state
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const fetchCategories = async () => {
    try {
      const { data } = await axios.get('/api/categories?all=true');
      setCategories(data);
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Failed to load categories'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAdmin) fetchCategories(); }, [isAdmin]);

  const addCategory = async (e) => {
    e.preventDefault();
    setMsg('');
    if (!newName.trim()) return setMsg('❌ Name is required');
    try {
      await axios.post('/api/categories', { name: newName.trim(), icon: newIcon, description: newDesc });
      setNewName(''); setNewIcon('📦'); setNewDesc('');
      setMsg('✅ Category added');
      fetchCategories();
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Failed to add'));
    }
  };

  const startEdit = (cat) => {
    setEditId(cat._id);
    setEditName(cat.name);
    setEditIcon(cat.icon);
    setEditDesc(cat.description || '');
  };

  const saveEdit = async () => {
    setMsg('');
    try {
      await axios.put(`/api/categories/${editId}`, { name: editName, icon: editIcon, description: editDesc });
      setEditId(null);
      setMsg('✅ Category updated');
      fetchCategories();
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Update failed'));
    }
  };

  const toggleActive = async (cat) => {
    setMsg('');
    try {
      await axios.put(`/api/categories/${cat._id}`, { active: !cat.active });
      setMsg(`✅ ${cat.name} ${cat.active ? 'deactivated' : 'activated'}`);
      fetchCategories();
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Toggle failed'));
    }
  };

  const deleteCategory = async (cat) => {
    if (!window.confirm(`Delete "${cat.name}"? Items using this category will keep their value, but it won't appear in new forms.`)) return;
    setMsg('');
    try {
      await axios.delete(`/api/categories/${cat._id}`);
      setMsg('✅ Category deleted');
      fetchCategories();
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Delete failed'));
    }
  };

  if (!isAdmin) return <div style={{ padding: 24, color: T.muted }}>🔒 Admin only.</div>;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900 }}>
      <h2 style={{ color: T.high, fontSize: 22, marginBottom: 4 }}>📂 Category Management</h2>
      <p style={{ color: T.muted, fontSize: 13, marginBottom: 18 }}>Add, edit, or deactivate item categories. Changes apply to all item and lost report forms.</p>

      {msg && (
        <div style={{
          marginBottom: 14, fontSize: 13, padding: '10px 14px', borderRadius: 10,
          color: msg.startsWith('✅') ? T.success : T.danger,
          background: msg.startsWith('✅') ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${msg.startsWith('✅') ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
        }}>{msg}</div>
      )}

      {/* Add new category form */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.high, marginBottom: 12 }}>➕ Add New Category</div>
        <form onSubmit={addCategory} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '0 0 60px' }}>
            <label style={labelStyle}>Icon</label>
            <input value={newIcon} onChange={e => setNewIcon(e.target.value)} style={inputStyle} maxLength={4} />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={labelStyle}>Name</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} style={inputStyle} placeholder="e.g. Water Bottles" />
          </div>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label style={labelStyle}>Description</label>
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} style={inputStyle} placeholder="Optional description..." />
          </div>
          <button type="submit" style={btnPrimary}>Add</button>
        </form>
      </div>

      {/* Categories list */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '50px 1.5fr 2fr 0.6fr 1.2fr', padding: '10px 14px', borderBottom: `1px solid ${T.border}`, color: T.muted, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          <div>Icon</div><div>Name</div><div>Description</div><div>Status</div><div>Actions</div>
        </div>

        {loading ? (
          <div style={{ padding: 22, color: T.muted }}>Loading categories...</div>
        ) : categories.length === 0 ? (
          <div style={{ padding: 22, color: T.muted }}>No categories found. Add one above.</div>
        ) : categories.map(cat => (
          <div key={cat._id} style={{ display: 'grid', gridTemplateColumns: '50px 1.5fr 2fr 0.6fr 1.2fr', padding: '12px 14px', borderBottom: `1px solid ${T.border}`, alignItems: 'center', color: T.text, opacity: cat.active ? 1 : 0.5 }}>
            {editId === cat._id ? (
              <>
                <input value={editIcon} onChange={e => setEditIcon(e.target.value)} style={{ ...inputStyle, width: 40 }} maxLength={4} />
                <input value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} />
                <input value={editDesc} onChange={e => setEditDesc(e.target.value)} style={inputStyle} />
                <div />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={saveEdit} style={btnSmall}>Save</button>
                  <button onClick={() => setEditId(null)} style={btnSmallGhost}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 22 }}>{cat.icon}</div>
                <div style={{ fontWeight: 700 }}>{cat.name}</div>
                <div style={{ fontSize: 12, color: T.muted }}>{cat.description || '—'}</div>
                <div style={{ fontSize: 11, fontWeight: 800, color: cat.active ? T.success : T.danger }}>
                  {cat.active ? 'Active' : 'Inactive'}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => startEdit(cat)} style={btnSmallGhost}>Edit</button>
                  <button onClick={() => toggleActive(cat)} style={{ ...btnSmallGhost, color: cat.active ? '#fbbf24' : T.success }}>
                    {cat.active ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => deleteCategory(cat)} style={{ ...btnSmallGhost, color: T.danger }}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 10, color: '#6b8f7a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 };
const inputStyle = { width: '100%', background: '#0f1a0f', border: '1px solid rgba(74,124,111,0.22)', borderRadius: 9, padding: '8px 11px', color: '#daeee6', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
const btnPrimary = { background: '#4a7c6f', color: '#daeee6', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const btnSmall = { background: '#4a7c6f', color: '#daeee6', border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const btnSmallGhost = { background: 'rgba(74,124,111,0.12)', color: '#6b8f7a', border: '1px solid rgba(74,124,111,0.22)', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
