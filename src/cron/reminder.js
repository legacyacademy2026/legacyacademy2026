const cron = require('node-cron');
const Booking = require('../models/Booking');
const LiveryBooking = require('../models/LiveryBooking');
const { sendReminderEmail, sendEmail } = require('../utils/mailer');
const { sendWhatsApp } = require('../utils/whatsapp');
const { sendSMS } = require('../utils/sms');
const { buildReminderWhatsAppText, buildLiveryStatusEmailHtml, buildLiveryStatusWhatsAppText } = require('../utils/messageTemplates');
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
          await sendReminderEmail(booking);

          try {
            const waText = buildReminderWhatsAppText(booking);
            // ⚠️ TESTING MODE: sends to ADMIN_TEST_PHONE. Switch to booking.phone later for real customers.
            const recipient = process.env.ADMIN_TEST_PHONE || `whatsapp:${booking.phone}`;
            await sendWhatsApp(recipient, waText);
          } catch (waErr) {
            console.log('⚠️ WhatsApp reminder error:', waErr.message);
          }

          try {
            const smsText = buildReminderWhatsAppText(booking);
            // ⚠️ TESTING MODE: sends to ADMIN_TEST_PHONE_SMS. Switch to booking.phone later for real customers.
            const smsRecipient = process.env.ADMIN_TEST_PHONE_SMS || booking.phone;
            await sendSMS(smsRecipient, smsText);
          } catch (smsErr) {
            console.log('⚠️ SMS reminder error:', smsErr.message);
          }

          booking.reminderSent = true;
          await booking.save();
          console.log(`✅ Reminder sent for booking ${booking._id}`);
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
        approvalStatus: 'Approved',
        reminderSent: false
      });

      for (const booking of activeLiveries) {
        if (!booking.endDate) continue;
        const daysUntilExpiry = (new Date(booking.endDate) - now) / (1000 * 60 * 60 * 24);

        if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
          const trackingUrl = `${process.env.PUBLIC_BASE_URL || ''}/livery-track.html?token=${booking.token}`;
          const bodyText = `Your <strong>Full Livery</strong> for <strong>${booking.horseName}</strong> expires in ${Math.ceil(daysUntilExpiry)} day(s). Please renew before it expires to keep your slot.`;
          const statusLine = `⏳ Your livery expires in ${Math.ceil(daysUntilExpiry)} day(s) — renew soon!`;

          try {
            const emailRecipient = process.env.ADMIN_TEST_EMAIL || booking.email;
            await sendEmail(emailRecipient, '🐴 Mervat Academy — Livery Renewal Reminder', buildLiveryStatusEmailHtml({
              name: booking.name, horseName: booking.horseName,
              statusBadge: { bg: '#fff3cd', color: '#8a6d00', text: '⏳ Renewal Reminder' },
              bodyText, trackingUrl, ctaLabel: 'Renew My Livery'
            }));
          } catch (emailErr) {
            console.log('⚠️ Livery reminder email error:', emailErr.message);
          }

          try {
            const waRecipient = process.env.ADMIN_TEST_PHONE || `whatsapp:${booking.phone}`;
            await sendWhatsApp(waRecipient, buildLiveryStatusWhatsAppText({
              name: booking.name, horseName: booking.horseName, statusLine, bodyText, trackingUrl
            }));
          } catch (waErr) {
            console.log('⚠️ Livery reminder WhatsApp error:', waErr.message);
          }

          try {
            const smsRecipient = process.env.ADMIN_TEST_PHONE_SMS || booking.phone;
            await sendSMS(smsRecipient, buildLiveryStatusWhatsAppText({
              name: booking.name, horseName: booking.horseName, statusLine, bodyText, trackingUrl
            }));
          } catch (smsErr) {
            console.log('⚠️ Livery reminder SMS error:', smsErr.message);
          }

          booking.reminderSent = true;
          await booking.save();
          console.log(`✅ Livery renewal reminder sent for booking ${booking._id}`);
        }
      }
    } catch (err) {
      console.log('❌ Livery reminder job error:', err);
    }
  });

  console.log('⏰ Livery renewal reminder system is active (checks every 30 min)');
}

module.exports = { startReminderJob, parseBookingDateTime };