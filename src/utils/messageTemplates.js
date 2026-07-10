require('dotenv').config();

// ===================================================================
//  LEGACY ÉCOLE ÉQUESTRE — shared email theme (cream / brown / olive)
//  Email-safe fonts: Georgia (serif, echoes Cormorant) + Helvetica body
// ===================================================================
const T = {
  cream:  '#f0ece0',
  card:   '#ffffff',
  soft:   '#f5f2e8',
  brown:  '#2c2420',
  brownMid:'#4a3f38',
  brownLt:'#6b6560',
  olive:  '#6b7a5a',
  btn:    '#1a1a1a',
  border: '#e5ddcf'
};

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Shared shell: header band + body + footer, in the Legacy palette
function emailShell(innerHtml) {
  return `
    <div style="font-family: Helvetica, Arial, sans-serif; background:${T.cream}; padding:24px 0;">
      <div style="max-width:560px; margin:0 auto; background:${T.card}; border-radius:14px; overflow:hidden; border:1px solid ${T.border};">
        <div style="background:${T.brown}; padding:30px; text-align:center;">
          <div style="font-family:Georgia,'Times New Roman',serif; color:${T.cream}; font-size:26px; letter-spacing:3px;">LEGACY</div>
          <div style="color:${T.olive}; font-size:11px; letter-spacing:4px; text-transform:uppercase; margin-top:4px;">Equestrian Academy</div>
        </div>
        <div style="padding:32px 34px;">
          ${innerHtml}
        </div>
        <div style="background:${T.soft}; padding:18px; text-align:center; border-top:1px solid ${T.border};">
          <p style="color:${T.brownLt}; font-size:12px; margin:0;">© 2026 Legacy Equestrian${process.env.ACADEMY_PHONE ? ' • ' + process.env.ACADEMY_PHONE : ''}${process.env.ACADEMY_EMAIL ? ' • ' + process.env.ACADEMY_EMAIL : ''}</p>
        </div>
      </div>
    </div>`;
}

function infoBox(rows) {
  return `<div style="background:${T.soft}; border-left:4px solid ${T.olive}; border-radius:8px; padding:16px 20px; margin:20px 0;">
    ${rows.map(r => `<p style="margin:4px 0; color:${T.brown}; font-size:14px;"><strong>${r[0]}:</strong> ${r[1]}</p>`).join('')}
  </div>`;
}

function ctaButton(url, label) {
  return `<div style="text-align:center; margin:28px 0;">
    <a href="${url}" style="background:${T.btn}; color:#fff; padding:14px 34px; border-radius:6px; text-decoration:none; font-weight:600; font-size:13px; letter-spacing:1px; text-transform:uppercase; display:inline-block;">${label}</a>
  </div>`;
}

function noteBox(text) {
  return `<p style="font-size:13px; color:${T.brownLt}; background:${T.soft}; padding:12px 16px; border-radius:8px; margin-top:20px;">${text}</p>`;
}

// ======= LIVERY REQUEST CONFIRMATION =======
function buildLiveryRequestEmailHtml({ name, horseName, trackingUrl }) {
  const greeting = getTimeGreeting();
  return emailShell(`
    <p style="font-size:16px; color:${T.brown};">${greeting}, ${name},</p>
    <p style="font-size:15px; color:${T.brownMid}; line-height:1.7;">Thank you for requesting <strong>Full Livery</strong> for <strong>${horseName}</strong>. Your request is now with our team for review.</p>
    ${infoBox([['Package','Full Livery'],['Horse',horseName],['Monthly Rate','AED 2,500']])}
    <p style="font-size:15px; color:${T.brownMid};">Once approved, your livery period begins and you can track your horse's daily care log using the link below.</p>
    ${ctaButton(trackingUrl, 'Track My Livery Request')}
  `);
}

function buildLiveryRequestWhatsAppText({ name, horseName, trackingUrl }) {
  const greeting = getTimeGreeting();
  return `Hi ${name} 👋

${greeting}! Thank you for requesting *Full Livery* for *${horseName}* at *Legacy Equestrian*.

🏠 Package: Full Livery
💰 Monthly Rate: AED 2,500

Your request is now with our team for review. Once approved, your livery period will begin.

Track your request: ${trackingUrl}`;
}

// ======= LIVERY STATUS UPDATE =======
function buildLiveryStatusEmailHtml({ name, horseName, statusBadge, bodyText, trackingUrl, ctaLabel }) {
  const greeting = getTimeGreeting();
  return emailShell(`
    <p style="font-size:16px; color:${T.brown};">${greeting}, ${name},</p>
    <div style="display:inline-block; background:${statusBadge.bg}; color:${statusBadge.color}; padding:6px 16px; border-radius:20px; font-size:13px; font-weight:600; margin-bottom:14px;">${statusBadge.text}</div>
    <p style="font-size:15px; color:${T.brownMid}; line-height:1.7;">${bodyText}</p>
    ${trackingUrl ? ctaButton(trackingUrl, ctaLabel || 'View My Livery') : ''}
  `);
}

function buildLiveryStatusWhatsAppText({ name, horseName, statusLine, bodyText, trackingUrl }) {
  return `Hi ${name} 👋

${statusLine}

${bodyText.replace(/<[^>]+>/g, '')}

${trackingUrl ? trackingUrl : ''}`;
}

// ======= PACKAGE PURCHASE CONFIRMATION =======
function buildPackageEmailHtml({ title, name, packageType, tierLabel, price, trackingUrl }) {
  const greeting = getTimeGreeting();
  return emailShell(`
    <p style="font-size:16px; color:${T.brown};">${greeting}, ${title ? title + ' ' : ''}${name},</p>
    <p style="font-size:15px; color:${T.brownMid}; line-height:1.7;">Thank you for choosing <strong>Legacy Equestrian</strong> — we're delighted to welcome you and look forward to making your riding journey unforgettable.</p>
    ${infoBox([['Package',packageType],['Tier',tierLabel],['Price','AED ' + price]])}
    <p style="font-size:15px; color:${T.brownMid};">Your request is now with our team for approval. Once approved, you can book your sessions directly using the link below.</p>
    ${ctaButton(trackingUrl, 'Track My Package')}
    ${noteBox('📌 Please note: sessions must be cancelled at least <strong>24 hours in advance</strong>.')}
  `);
}

function buildPackageWhatsAppText({ title, name, packageType, tierLabel, price, trackingUrl }) {
  const greeting = getTimeGreeting();
  return `Hi ${title ? title + ' ' : ''}${name} 👋

${greeting}! Thank you for choosing *Legacy Equestrian* 🐴

Your package request has been received:
📦 ${packageType} — ${tierLabel}
💰 AED ${price}

Track your sessions & progress here:
${trackingUrl}

📌 Please note: sessions must be cancelled at least *24 hours* in advance.

See you soon! 🐎`;
}

// ======= 24-HOUR SESSION REMINDER =======
function buildReminderEmailHtml(booking) {
  const greeting = getTimeGreeting();
  return emailShell(`
    <p style="font-size:16px; color:${T.brown};">${greeting}, ${booking.name},</p>
    <p style="font-size:15px; color:${T.brownMid}; line-height:1.7;">This is a friendly reminder that your session is coming up <strong>tomorrow</strong>. We can't wait to see you. 🐎</p>
    ${infoBox([
      ['Service', booking.category],
      ...(booking.subPackage ? [['Package', booking.subPackage]] : []),
      ['Date', booking.date],
      ['Time', booking.startTime]
    ])}
    ${noteBox('⏱️ Please arrive <strong>15 minutes early</strong>. Need to cancel? Let us know at least <strong>24 hours in advance</strong> — otherwise the session will be marked as completed.')}
  `);
}

function buildReminderWhatsAppText(booking) {
  const greeting = getTimeGreeting();
  return `Hi ${booking.name} 👋

${greeting}! ⏰ Reminder: your session at *Legacy Equestrian* is coming up tomorrow.

📅 Date: ${booking.date}
🕐 Time: ${booking.startTime}
🏇 Service: ${booking.category}
${booking.subPackage ? `📦 ${booking.subPackage}` : ''}

⏱️ Please arrive *15 minutes early*.
📌 Need to cancel? Let us know at least *24 hours* in advance — otherwise the session will be marked as completed.

See you soon! 🐎`;
}

// ======= GENERIC STATUS UPDATE =======
function buildStatusUpdateEmailHtml({ name, title, statusBadge, bodyText, detailsHtml, trackingUrl, ctaLabel }) {
  const greeting = getTimeGreeting();
  return emailShell(`
    <p style="font-size:16px; color:${T.brown};">${greeting}, ${title ? title + ' ' : ''}${name},</p>
    ${statusBadge ? `<div style="display:inline-block; background:${statusBadge.bg}; color:${statusBadge.color}; padding:8px 18px; border-radius:50px; font-weight:600; font-size:14px; margin-bottom:16px;">${statusBadge.text}</div>` : ''}
    <p style="font-size:15px; color:${T.brownMid}; line-height:1.7;">${bodyText}</p>
    ${detailsHtml || ''}
    ${trackingUrl ? ctaButton(trackingUrl, ctaLabel || 'View My Package') : ''}
    ${noteBox('📌 Sessions can be cancelled at least <strong>24 hours in advance</strong>. Questions? Our team is here to help.')}
  `);
}

function buildStatusUpdateWhatsAppText({ name, title, statusLine, bodyText, trackingUrl }) {
  const greeting = getTimeGreeting();
  return `Hi ${title ? title + ' ' : ''}${name} 👋

${greeting}! ${statusLine}

${bodyText}
${trackingUrl ? `\n🔗 ${trackingUrl}` : ''}

— Legacy Equestrian 🐴`;
}

module.exports = {
  getTimeGreeting,
  buildPackageEmailHtml,
  buildPackageWhatsAppText,
  buildReminderEmailHtml,
  buildReminderWhatsAppText,
  buildStatusUpdateEmailHtml,
  buildStatusUpdateWhatsAppText,
  buildLiveryRequestEmailHtml,
  buildLiveryRequestWhatsAppText,
  buildLiveryStatusEmailHtml,
  buildLiveryStatusWhatsAppText
};
