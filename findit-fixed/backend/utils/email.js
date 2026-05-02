// utils/email.js — graceful nodemailer wrapper
// If SMTP_HOST/USER/PASS are NOT configured, sendEmail becomes a no-op so the
// rest of the system keeps working in dev. In production set the env vars to enable.
const nodemailer = require('nodemailer');

let transporter = null;
let warned = false;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    if (!warned) {
      console.log('ℹ  Email disabled (set SMTP_HOST/USER/PASS to enable).');
      warned = true;
    }
    return null;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: String(SMTP_SECURE).toLowerCase() === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

/**
 * sendEmail({ to, subject, text, html })
 * Returns Promise<{ ok, info? , skipped? }>. Never throws.
 */
async function sendEmail({ to, subject, text, html }) {
  if (!to || !subject || (!text && !html)) {
    return { ok: false, error: 'missing fields' };
  }
  const t = getTransporter();
  if (!t) return { ok: false, skipped: true };
  try {
    const info = await t.sendMail({
      from: process.env.SMTP_FROM || `"FindIt" <${process.env.SMTP_USER}>`,
      to, subject, text, html
    });
    return { ok: true, info };
  } catch (err) {
    console.error('✉ email send failed:', err.message);
    return { ok: false, error: err.message };
  }
}

const wrap = (title, body) => `
<div style="font-family:Segoe UI,Arial,sans-serif;background:#f4f6f8;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e1e5ec">
    <div style="background:#1a2e20;color:#daeee6;padding:18px 22px;font-weight:700">🔍 FindIt — Lost & Found</div>
    <div style="padding:22px;color:#1e2130;font-size:14px;line-height:1.6">
      <h2 style="margin:0 0 12px 0;font-size:17px;color:#1a2e20">${title}</h2>
      ${body}
    </div>
    <div style="padding:14px 22px;color:#94a3b8;font-size:11px;background:#fafbfc;border-top:1px solid #eef1f5">
      You received this because you have an account on FindIt Campus Portal.
    </div>
  </div>
</div>`;

module.exports = { sendEmail, wrap };
