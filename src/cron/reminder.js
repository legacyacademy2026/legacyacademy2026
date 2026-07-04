const cron = require('node-cron');
const Booking = require('../models/Booking');
const LiveryBooking = require('../models/LiveryBooking');
const PackagePurchase = require('../models/PackagePurchase');
const { sendReminderEmail, sendEmail } = require('../utils/mailer');
const { sendWhatsApp } = require('../utils/whatsapp');
const { sendSMS } = require('../utils/sms');
const { buildReminderWhatsAppText, buildLiveryStatusEmailHtml, buildLiveryStatusWhatsAppText, buildStatusUpdateEmailHtml, buildStatusUpdateWhatsAppText } = require('../utils/messageTemplates');
const { notifyAll } = require('../utils/notifier');
require('dotenv').config();

function parseBookingDateTime(dateStr, timeStr) {
  const [time, period] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  const dt = new Date(dateStr);
  dt.setHours(hours, minutes, 0, 0);
  return dt;
}

function startReminderJob() {
  cron.schedule('*/30 * * * *', async () => {
    try {
      const now = new Date();
      const pendingBookings = await Booking.find({ reminderSent: false });

      for (const booking of pendingBookings) {
        const bookingTime = parseBookingDateTime(booking.date, booking.startTime);
        const hoursUntil = (bookingTime - now) / (1000 * 60 * 60);

        if (hoursUntil <= 24 && hoursUntil > 23) {
          const { buildReminderEmailHtml } = require('../utils/messageTemplates');
          notifyAll({
            customer: { name: booking.name, email: booking.email, phone: booking.phone },
            subject: '🐴 Reminder: Your session is tomorrow!',
            emailHtml: buildReminderEmailHtml(booking),
            waText: buildReminderWhatsAppText(booking)
          });

          booking.reminderSent = true;
          await booking.save();
          console.log(`✅ 24h reminder sent (customer + admin) for booking ${booking._id}`);
        }
      }
    } catch (err) {
      console.log('❌ Reminder job error:', err);
    }
  });

  console.log('⏰ Reminder system is active (checks every 30 min)');

  // ===== Livery renewal reminders (1 week before expiry) =====
  cron.schedule('*/30 * * * *', async () => {
    try {
      const now = new Date();
      const activeLiveries = await LiveryBooking.find({
        active: true,
        approvalStatus: 'Active',
        reminderSent: false
      });

      for (const booking of activeLiveries) {
        if (!booking.endDate) continue;
        const daysUntilExpiry = (new Date(booking.endDate) - now) / (1000 * 60 * 60 * 24);

        if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
          const trackingUrl = `${process.env.PUBLIC_BASE_URL || ''}/livery-track.html?token=${booking.token}`;
          const bodyText = `Your <strong>Full Livery</strong> for <strong>${booking.horseName}</strong> expires in ${Math.ceil(daysUntilExpiry)} day(s). Please renew before it expires to keep your slot.`;
          const statusLine = `⏳ Your livery expires in ${Math.ceil(daysUntilExpiry)} day(s) — renew soon!`;

          notifyAll({
            customer: { name: booking.name, email: booking.email, phone: booking.phone },
            subject: '🐴 Legacy Équestre — Livery Renewal Reminder',
            emailHtml: buildLiveryStatusEmailHtml({
              name: booking.name, horseName: booking.horseName,
              statusBadge: { bg: '#fff3cd', color: '#8a6d00', text: '⏳ Renewal Reminder' },
              bodyText, trackingUrl, ctaLabel: 'Renew My Livery'
            }),
            waText: buildLiveryStatusWhatsAppText({ name: booking.name, horseName: booking.horseName, statusLine, bodyText, trackingUrl })
          });

          booking.reminderSent = true;
          await booking.save();
          console.log(`✅ Livery renewal reminder sent (customer + admin) for booking ${booking._id}`);
        }
      }
    } catch (err) {
      console.log('❌ Livery reminder job error:', err);
    }
  });

  console.log('⏰ Livery renewal reminder system is active (checks every 30 min)');

  // ===== Package 2-month expiry + backfill (runs hourly, catches up after sleep) =====
  cron.schedule('15 * * * *', async () => {
    try {
      const now = new Date();

      // Backfill: approved packages missing an expiresAt get one (approvedAt or createdAt + 2 months)
      const missing = await PackagePurchase.find({ approvalStatus: 'Approved', expiresAt: { $exists: false } });
      for (const p of missing) {
        const base = p.approvedAt || p.createdAt || now;
        const exp = new Date(base);
        exp.setMonth(exp.getMonth() + 2);
        if (!p.approvedAt) p.approvedAt = base;
        p.expiresAt = exp;
        await p.save();
        console.log(`🗓️  Backfilled expiry for package ${p._id} -> ${exp.toISOString().slice(0,10)}`);
      }

      // Expire: approved, not yet finished/expired, past expiresAt. Keep the record.
      const toExpire = await PackagePurchase.find({
        approvalStatus: 'Approved',
        expired: { $ne: true },
        finished: { $ne: true },
        frozen: { $ne: true },
        expiresAt: { $lt: now }
      });

      for (const pkg of toExpire) {
        pkg.expired = true;
        pkg.finished = true; // no more sessions can be booked; record is retained
        await pkg.save();

        const used = pkg.sessionsCompleted || 0;
        const total = pkg.sessionsTotal || 0;
        const forfeited = Math.max(0, total - used);
        const bodyText = `Your <strong>${pkg.packageType} — ${pkg.tierLabel}</strong> package has reached the end of its 2-month validity and has now expired. ` +
          `You completed <strong>${used} of ${total}</strong> session(s).` +
          (forfeited > 0 ? ` ${forfeited} unused session(s) have expired and are non-refundable, as per our terms.` : '');

        try {
          notifyAll({
            customer: { name: pkg.name, email: pkg.email, phone: pkg.phone },
            subject: '🐴 Legacy Équestre — Your Package Has Expired',
            emailHtml: buildStatusUpdateEmailHtml({
              name: pkg.name, title: pkg.title,
              statusBadge: { bg: '#efe9db', color: '#6b6560', text: '⌛ Package Expired' },
              bodyText, trackingUrl: null
            }),
            waText: buildStatusUpdateWhatsAppText({
              name: pkg.name, title: pkg.title,
              statusLine: 'Your package has expired ⌛',
              bodyText: bodyText.replace(/<[^>]+>/g, '')
            })
          });
        } catch (e) { console.log('⚠️ Expiry notify error:', e.message); }

        console.log(`⌛ Package ${pkg._id} expired (kept in records).`);
      }
    } catch (err) {
      console.log('❌ Package expiry job error:', err);
    }
  });

  console.log('⏰ Package expiry system is active (checks hourly)');
}

module.exports = { startReminderJob, parseBookingDateTime };