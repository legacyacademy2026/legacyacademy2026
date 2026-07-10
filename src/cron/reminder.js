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

// Academy local timezone: Dubai (UTC+4). The server runs in UTC, so we must
// interpret booking times as Dubai time or sessions complete 4 hours late.
const TZ_OFFSET_HOURS = 4;

function parseBookingDateTime(dateStr, timeStr) {
  const [time, period] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  const [y, m, d] = dateStr.split('-').map(Number);
  // Build the true moment: Dubai wall-clock time -> UTC instant
  return new Date(Date.UTC(y, m - 1, d, hours - TZ_OFFSET_HOURS, minutes, 0, 0));
}

// ===== Sweep: auto-complete sessions whose end time has passed =====
// Called on boot, hourly by cron, and lazily when the dashboard loads bookings.
let lastSweepAt = 0;
async function sweepPastSessions(force = false) {
  const now = new Date();
  if (!force && now.getTime() - lastSweepAt < 5 * 60 * 1000) return; // throttle 5 min
  lastSweepAt = now.getTime();
  try {
    const bookingsRouter = require('../routes/booking');
    const activeSessions = await Booking.find({ status: { $in: ['Pending', 'Confirmed'] } });
    for (const b of activeSessions) {
      if (!b.date || !b.startTime || !b.duration) continue; // date-only bookings are manual
      const start = parseBookingDateTime(b.date, b.startTime);
      const end = new Date(start.getTime() + b.duration * 60 * 60 * 1000);
      if (now >= end) {
        await bookingsRouter.applyBookingStatus(b, 'Completed');
        console.log(`✅ Session ${b._id} auto-completed (time passed).`);
      }
    }
  } catch (err) {
    console.log('❌ Session sweep error:', err.message);
  }
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
            waText: buildReminderWhatsAppText(booking),
            adminInfo: {
              subject: '🔔 Session Reminder — Tomorrow',
              headline: 'Session Tomorrow',
              rows: [
                ['Customer', booking.name],
                ['Phone', booking.phone],
                ['Date', booking.date],
                ['Time', booking.startTime || 'Time TBA'],
                ['Service', booking.category + (booking.subPackage ? ' — ' + booking.subPackage : '')]
              ]
            }
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
            subject: '🐴 Legacy Equestrian — Livery Renewal Reminder',
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

      // Auto-expire liveries whose month has ended (frees the slot, notifies both parties)
      const expiredLiveries = await LiveryBooking.find({
        active: true,
        approvalStatus: 'Active',
        endDate: { $lt: now }
      });
      for (const booking of expiredLiveries) {
        booking.approvalStatus = 'Expired';
        booking.active = false; // frees the slot in the dashboard
        await booking.save();
        const trackingUrl = `${process.env.PUBLIC_BASE_URL || ''}/livery-track.html?token=${booking.token}`;
        const bodyText = `Your livery month for <strong>${booking.horseName}</strong> has ended. Thank you! To continue, please contact us to start a new period.`;
        notifyAll({
          customer: { name: booking.name, email: booking.email, phone: booking.phone },
          subject: '🐴 Legacy Equestrian — Livery Period Ended',
          emailHtml: buildLiveryStatusEmailHtml({
            name: booking.name, horseName: booking.horseName,
            statusBadge: { bg: '#efe9db', color: '#6b6560', text: '⌛ Livery Ended' },
            bodyText, trackingUrl, ctaLabel: null
          }),
          waText: buildLiveryStatusWhatsAppText({ name: booking.name, horseName: booking.horseName, statusLine: 'Your livery month has ended ⌛', bodyText: bodyText.replace(/<[^>]+>/g,''), trackingUrl }),
          adminInfo: {
            subject: '🔔 Livery Ended — Slot Freed',
            headline: 'Livery Period Ended',
            rows: [
              ['Customer', booking.name],
              ['Phone', booking.phone],
              ['Horse', booking.horseName],
              ['Slot', `#${booking.slotNumber} (now free)`]
            ]
          }
        });
        console.log(`⌛ Livery ${booking._id} auto-expired, slot ${booking.slotNumber} freed.`);
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
            subject: '🐴 Legacy Equestrian — Your Package Has Expired',
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

      // Auto-unfreeze packages that have reached the 14-day freeze budget
      const packagesRouter = require('../routes/packages');
      const frozen = await PackagePurchase.find({ frozen: true, freezeStartedAt: { $exists: true } });
      for (const pkg of frozen) {
        const frozenDays = (now - new Date(pkg.freezeStartedAt)) / (24 * 60 * 60 * 1000);
        const budgetLeft = 14 - (pkg.freezeDaysUsed || 0);
        if (frozenDays >= budgetLeft) {
          await packagesRouter.applyUnfreeze(pkg, true);
          console.log(`❄️→✅ Package ${pkg._id} auto-unfrozen (14-day budget reached).`);
        }
      }

      // Auto-complete sessions whose end time has passed (no-show / not cancelled -> counts as done)
      // Auto-complete sessions whose end time has passed
      await sweepPastSessions(true);
    } catch (err) {
      console.log('❌ Package expiry/freeze job error:', err);
    }
  });

  console.log('⏰ Package expiry + freeze system is active (checks hourly)');

  // Catch-up sweep immediately on boot (Render free tier sleeps — this makes
  // past sessions complete the moment the server wakes, not an hour later)
  setTimeout(() => sweepPastSessions(true), 5000);
}

module.exports = { startReminderJob, parseBookingDateTime, sweepPastSessions };