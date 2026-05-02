import React from 'react';

export default function OwnershipQuestionsForm({ questions, onChange, editable = true, mode = 'edit' }) {
  const qs = Array.isArray(questions) ? questions : [];

  if (mode === 'answer') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {qs.length === 0 ? (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>No ownership questions for this item.</div>
        ) : qs.map((q, idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>
              Q{idx + 1}: {q.question}
            </div>
            <input
              disabled={!editable}
              value={q.answer || ''}
              onChange={e => {
                const next = qs.map((x, i) => i === idx ? { ...x, answer: e.target.value } : x);
                onChange?.(next);
              }}
              style={{
                background: '#262b3d',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                padding: '9px 12px',
                color: '#e2e8f0',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
              placeholder="Type your answer..."
            />
          </div>
        ))}
      </div>
    );
  }

  // mode === 'edit'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
        Add questions that only the real owner can answer (e.g., serial number, unique marks, wallpaper photo).
      </div>
      {qs.map((q, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            disabled={!editable}
            value={q.question || ''}
            onChange={e => {
              const next = qs.map((x, i) => i === idx ? { ...x, question: e.target.value } : x);
              onChange?.(next);
            }}
            style={{
              flex: 1,
              background: '#262b3d',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding: '9px 12px',
              color: '#e2e8f0',
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box',
            }}
            placeholder="e.g. What’s engraved on the back?"
          />
          {editable && (
            <button
              type="button"
              onClick={() => onChange?.(qs.filter((_, i) => i !== idx))}
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: '#f87171',
                borderRadius: 8,
                padding: '9px 10px',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {editable && (
        <button
          type="button"
          onClick={() => onChange?.([...qs, { question: '' }])}
          style={{
            background: 'rgba(99,102,241,0.12)',
            border: '1px solid rgba(99,102,241,0.25)',
            color: '#818cf8',
            borderRadius: 8,
            padding: '9px 12px',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 700,
            width: 'fit-content',
          }}
        >
          + Add question
        </button>
      )}
    </div>
  );
}

