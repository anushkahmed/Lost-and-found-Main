import React, { useEffect, useState } from 'react';
import axios from 'axios';

const T = {
  card: '#1e2130',
  border: 'rgba(255,255,255,0.08)',
  text: '#e2e8f0',
  muted: '#94a3b8',
  input: '#262b3d',
  primary: '#6366f1',
  danger: '#f87171',
  success: '#34d399',
};

export default function TwoFactorSection() {
  const [enabled, setEnabled]     = useState(false);
  const [loading, setLoading]     = useState(true);
  const [setupData, setSetupData] = useState(null); // { qr, base32 }
  const [code, setCode]           = useState('');
  const [busy, setBusy]           = useState('');
  const [msg, setMsg]             = useState('');
  const [pwd, setPwd]             = useState('');

  const refresh = async () => {
    try {
      const { data } = await axios.get('/api/2fa/status');
      setEnabled(!!data.twoFactorEnabled);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const startSetup = async () => {
    setBusy('setup'); setMsg('');
    try {
      const { data } = await axios.post('/api/2fa/setup');
      setSetupData(data);
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Setup failed'));
    } finally { setBusy(''); }
  };

  const verify = async () => {
    setBusy('verify'); setMsg('');
    try {
      await axios.post('/api/2fa/verify', { code });
      setSetupData(null); setCode(''); setEnabled(true);
      setMsg('✅ Two-factor authentication enabled');
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Verify failed'));
    } finally { setBusy(''); }
  };

  const disable = async () => {
    if (!pwd) { setMsg('❌ Enter your password to disable'); return; }
    setBusy('disable'); setMsg('');
    try {
      await axios.post('/api/2fa/disable', { password: pwd });
      setEnabled(false); setPwd('');
      setMsg('✅ Two-factor authentication disabled');
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.message || 'Disable failed'));
    } finally { setBusy(''); }
  };

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 13, color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          🔐 Two-factor authentication
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
          background: enabled ? 'rgba(52,211,153,0.18)' : 'rgba(148,163,184,0.18)',
          color: enabled ? T.success : T.muted
        }}>
          {enabled ? 'ENABLED' : 'DISABLED'}
        </span>
      </div>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>
        Add an extra layer of security with a TOTP app like Google Authenticator or Authy.
      </div>

      {msg && (
        <div style={{ fontSize: 12, marginBottom: 10, color: msg.startsWith('✅') ? T.success : T.danger }}>{msg}</div>
      )}

      {loading ? <div style={{ color: T.muted, fontSize: 12 }}>Loading…</div> :
        !enabled && !setupData && (
          <button onClick={startSetup} disabled={busy === 'setup'}
            style={{ background: T.primary, color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {busy === 'setup' ? 'Generating…' : 'Enable 2FA'}
          </button>
        )}

      {setupData && (
        <div>
          <div style={{ fontSize: 12, color: T.text, marginBottom: 8 }}>
            Step 1: Scan this QR code with your authenticator app.
          </div>
          <div style={{ background: '#fff', display: 'inline-block', padding: 8, borderRadius: 8, marginBottom: 10 }}>
            <img alt="2FA QR" src={setupData.qr} style={{ width: 180, height: 180 }} />
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
            Or enter the secret manually: <code style={{ color: T.text }}>{setupData.base32}</code>
          </div>
          <div style={{ fontSize: 12, color: T.text, marginBottom: 8 }}>
            Step 2: Enter the 6-digit code shown in the app.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123 456" inputMode="numeric"
              style={{ flex: 1, background: T.input, border: `1px solid ${T.border}`, color: T.text, padding: '8px 12px', borderRadius: 8, fontSize: 14, letterSpacing: 3 }} />
            <button onClick={verify} disabled={!code || busy === 'verify'}
              style={{ background: T.primary, color: '#fff', border: 'none', padding: '0 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {busy === 'verify' ? 'Verifying…' : 'Verify & Enable'}
            </button>
          </div>
          <button onClick={() => { setSetupData(null); setCode(''); }}
            style={{ marginTop: 10, background: 'transparent', color: T.muted, border: `1px solid ${T.border}`, padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}

      {enabled && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>
            To disable, confirm your password.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Password"
              style={{ flex: 1, background: T.input, border: `1px solid ${T.border}`, color: T.text, padding: '8px 12px', borderRadius: 8, fontSize: 13 }} />
            <button onClick={disable} disabled={busy === 'disable'}
              style={{ background: T.danger, color: '#fff', border: 'none', padding: '0 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {busy === 'disable' ? 'Disabling…' : 'Disable 2FA'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
