require('dotenv').config();
const { sendEmail } = require('./mailer');
const { sendWhatsApp } = require('./whatsapp');

// Admin (your client) contact — override in Render env when handing over.
// Defaults to the developer's contact for testing.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'janakaantha@gmail.com';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '+971585953807';

function log(tag) { return (e) => console.log(`⚠️ ${tag}:`, e.message); }

// Prepend a small admin banner to the customer email HTML for the admin copy
function adminWrap(name, phone, email, html) {
  const banner = `<div style="background:#2c2420;color:#f0ece0;padding:12px 18px;font-family:Helvetica,Arial,sans-serif;font-size:13px;">
    📋 <strong>ADMIN COPY</strong> — Customer: ${name || '-'} • ${phone || '-'} • ${email || '-'}
  </div>`;
  return banner + (html || '');
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
async function notifyAll({ customer = {}, subject, emailHtml, waText, toCustomer = true, toAdmin = true }) {
  const name = customer.name || 'Customer';
  const phone = customer.phone || '';
  const email = customer.email || '';
  const jobs = [];

  if (toCustomer) {
    if (email) jobs.push(sendEmail(email, subject, emailHtml).catch(log('customer email')));
    if (phone) jobs.push(sendWhatsApp(`whatsapp:${phone}`, waText).catch(log('customer whatsapp')));
  }
  if (toAdmin) {
    if (ADMIN_EMAIL) jobs.push(sendEmail(ADMIN_EMAIL, `📋 [Admin] ${subject}`, adminWrap(name, phone, email, emailHtml)).catch(log('admin email')));
    if (ADMIN_PHONE) jobs.push(sendWhatsApp(`whatsapp:${ADMIN_PHONE}`, `📋 *ADMIN COPY*\nCustomer: ${name} (${phone})\n\n${waText}`).catch(log('admin whatsapp')));
  }

  await Promise.allSettled(jobs);
}

module.exports = { notifyAll, ADMIN_EMAIL, ADMIN_PHONE };
