require('dotenv').config();
const { sendEmail } = require('./mailer');
const { sendWhatsApp } = require('./whatsapp');

// Admin (your client) contact — override in Render env when handing over.
// Defaults to the developer's contact for testing.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'legacyequestrian2026@gmail.com';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '+971561681156';
// Secret guarding one-click admin action links. Change via env when handing over.
const ADMIN_ACTION_KEY = process.env.ADMIN_ACTION_KEY || 'legacy-secret-2026';
const BASE_URL = process.env.PUBLIC_BASE_URL || '';

function log(tag) { return (e) => console.log(`⚠️ ${tag}:`, e.message); }

// Build a one-click action URL guarded by the secret key
function actionUrl(path) {
  return `${BASE_URL}${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(ADMIN_ACTION_KEY)}`;
}

function adminActionButtons(actions) {
  if (!actions || !actions.length) return '';
  return `<div style="text-align:center; margin:6px 0 14px;">` +
    actions.map(a => `<a href="${a.url}" style="display:inline-block; margin:6px 6px; background:${a.color || '#1a1a1a'}; color:#fff; text-decoration:none; padding:12px 26px; border-radius:6px; font-size:13px; font-weight:600; letter-spacing:0.5px;">${a.label}</a>`).join('') +
    `</div>`;
}

function adminActionLines(actions) {
  if (!actions || !actions.length) return '';
  return '\n\n' + actions.map(a => `${a.label}: ${a.url}`).join('\n');
}

// Prepend a small admin banner to the customer email HTML (fallback path)
function adminWrap(name, phone, email, html) {
  const banner = `<div style="background:#2c2420;color:#f0ece0;padding:12px 18px;font-family:Helvetica,Arial,sans-serif;font-size:13px;">
    📋 <strong>ADMIN COPY</strong> — Customer: ${name || '-'} • ${phone || '-'} • ${email || '-'}
  </div>`;
  return banner + (html || '');
}

// Clean admin-focused email: customer + details table + action buttons
function buildAdminEmail(headline, rows, actions) {
  const T = { cream:'#f0ece0', card:'#fff', soft:'#f5f2e8', brown:'#2c2420', border:'#e5ddcf', light:'#6b6560' };
  const rowsHtml = (rows || []).map(r =>
    `<tr>
       <td style="padding:8px 0; color:${T.light}; font-size:13px; width:38%;">${r[0]}</td>
       <td style="padding:8px 0; color:${T.brown}; font-size:14px; font-weight:600;">${r[1] || '-'}</td>
     </tr>`).join('');
  return `
  <div style="font-family:Helvetica,Arial,sans-serif; background:${T.cream}; padding:24px 0;">
    <div style="max-width:520px; margin:0 auto; background:${T.card}; border-radius:14px; overflow:hidden; border:1px solid ${T.border};">
      <div style="background:${T.brown}; padding:20px 26px;">
        <div style="color:${T.cream}; font-size:12px; letter-spacing:2px; text-transform:uppercase;">📋 Admin Notification</div>
        <div style="color:#fff; font-family:Georgia,serif; font-size:20px; margin-top:4px;">${headline}</div>
      </div>
      <div style="padding:24px 26px;">
        <table style="width:100%; border-collapse:collapse;">${rowsHtml}</table>
        ${adminActionButtons(actions)}
        ${actions && actions.length ? `<p style="text-align:center; color:${T.light}; font-size:12px; margin-top:4px;">Tap a button above — no login required.</p>` : ''}
      </div>
      <div style="background:${T.soft}; padding:14px; text-align:center; border-top:1px solid ${T.border};">
        <p style="color:${T.light}; font-size:12px; margin:0;">Legacy — Admin</p>
      </div>
    </div>
  </div>`;
}

function buildAdminWa(headline, rows, actions) {
  const lines = (rows || []).map(r => `• ${r[0]}: ${r[1] || '-'}`).join('\n');
  return `📋 *ADMIN — ${headline}*\n\n${lines}${adminActionLines(actions)}`;
}

/**
 * Send an event to the CUSTOMER and an admin copy to the ADMIN,
 * on both Email and WhatsApp. Never throws (all sends are caught).
 *
 * @param {Object}  opts
 * @param {Object}  opts.customer   { name, email, phone }
 * @param {string}  opts.subject    email subject (customer)
 * @param {string}  opts.emailHtml  email HTML (customer)
 * @param {string}  opts.waText     WhatsApp text (customer)
 * @param {boolean} opts.toCustomer default true — send to the customer
 * @param {boolean} opts.toAdmin    default true — send an admin copy
 */
async function notifyAll({ customer = {}, subject, emailHtml, waText, adminActions = null, adminInfo = null, toCustomer = true, toAdmin = true }) {
  const name = customer.name || 'Customer';
  const phone = customer.phone || '';
  const email = customer.email || '';
  const jobs = [];

  if (toCustomer) {
    if (email) jobs.push(sendEmail(email, subject, emailHtml).catch(log('customer email')));
    if (phone) jobs.push(sendWhatsApp(`whatsapp:${phone}`, waText).catch(log('customer whatsapp')));
  }
  if (toAdmin) {
    let adminSubject, adminEmailHtml, adminWaText;
    if (adminInfo) {
      adminSubject = adminInfo.subject || `🔔 [Admin] ${adminInfo.headline}`;
      adminEmailHtml = buildAdminEmail(adminInfo.headline, adminInfo.rows, adminActions);
      adminWaText = buildAdminWa(adminInfo.headline, adminInfo.rows, adminActions);
    } else {
      adminSubject = `📋 [Admin] ${subject}`;
      adminEmailHtml = adminWrap(name, phone, email, adminActionButtons(adminActions) + (emailHtml || ''));
      adminWaText = `📋 *ADMIN COPY*\nCustomer: ${name} (${phone})\n\n${waText}${adminActionLines(adminActions)}`;
    }
    if (ADMIN_EMAIL) jobs.push(sendEmail(ADMIN_EMAIL, adminSubject, adminEmailHtml).catch(log('admin email')));
    if (ADMIN_PHONE) jobs.push(sendWhatsApp(`whatsapp:${ADMIN_PHONE}`, adminWaText).catch(log('admin whatsapp')));
  }

  await Promise.allSettled(jobs);
}

module.exports = { notifyAll, actionUrl, ADMIN_EMAIL, ADMIN_PHONE, ADMIN_ACTION_KEY };
