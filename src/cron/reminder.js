const cron = require('node-cron');
const Booking = require('../models/Booking');
const { sendReminderEmail } = require('../utils/mailer');
const { sendWhatsApp } = require('../utils/whatsapp');
const { sendSMS } = require('../utils/sms');
const { buildReminderWhatsAppText } = require('../utils/messageTemplates');
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
}

module.exports = { startReminderJob, parseBookingDateTime };