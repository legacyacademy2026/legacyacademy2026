const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Customer = require('../models/Customer');
const ClosedDay = require('../models/ClosedDay');
const PackagePurchase = require('../models/PackagePurchase');
const { sendEmail, sendReminderEmail } = require('../utils/mailer');
const { sendWhatsApp } = require('../utils/whatsapp');
const { buildStatusUpdateEmailHtml, buildStatusUpdateWhatsAppText } = require('../utils/messageTemplates');

function timeToMinutes(timeStr) {
  const [time, period] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function parseBookingDateTime(dateStr, timeStr) {
  const minutes = timeToMinutes(timeStr);
  const dt = new Date(dateStr);
  dt.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return dt;
}

router.get('/availability', async (req, res) => {
  try {
    const { date } = req.query;
    const bookings = await Booking.find({ date }).select('startTime duration');
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ message: '❌ Error checking availability' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { date, startTime, duration } = req.body;

    const closedInfo = await ClosedDay.findOne({ date });
    if (closedInfo?.type === 'Holiday') {
      return res.status(409).json({ message: '❌ The academy is closed on this date.' });
    }

    const newStart = timeToMinutes(startTime);
    const newEnd = newStart + duration * 60;

    if (closedInfo?.type === 'HalfDay' && closedInfo.closeTime) {
      const closeMinutes = timeToMinutes(closedInfo.closeTime);
      if (newEnd > closeMinutes) {
        return res.status(409).json({ message: `❌ The academy closes early (${closedInfo.closeTime}) on this date.` });
      }
    }

    const sameDayBookings = await Booking.find({ date });
    const conflict = sameDayBookings.find(b => {
      if (!b.startTime || typeof b.duration !== 'number') return false;
      const bStart = timeToMinutes(b.startTime);
      const bEnd = bStart + b.duration * 60;
      return newStart < bEnd && bStart < newEnd;
    });

    if (conflict) {
      return res.status(409).json({
        message: `❌ That time overlaps with an existing booking at ${conflict.startTime}. Please choose another time.`
      });
    }

    const booking = new Booking(req.body);
    await booking.save();

    await Customer.findOneAndUpdate(
      { email: booking.email },
      { name: booking.name, phone: booking.phone, email: booking.email },
      { upsert: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ message: '✅ Booking saved successfully!' });
  } catch (err) {
    res.status(500).json({ message: '❌ Error saving booking', error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: '❌ Error fetching bookings' });
  }
});

// Customer requests to cancel a session — 24-hour rule enforced server-side
router.post('/:id/request-cancellation', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.cancellationStatus === 'Pending') {
      return res.status(400).json({ message: 'A cancellation request is already pending for this session.' });
    }

    const sessionTime = parseBookingDateTime(booking.date, booking.startTime);
    const hoursUntil = (sessionTime - new Date()) / (1000 * 60 * 60);

    if (hoursUntil < 24) {
      return res.status(403).json({ message: '❌ Cancellations must be made at least 24 hours before the session.' });
    }

    booking.cancellationStatus = 'Pending';
    await booking.save();
    res.json({ message: '✅ Cancellation request submitted. Awaiting admin approval.' });
  } catch (err) {
    res.status(500).json({ message: '❌ Error requesting cancellation' });
  }
});

// Admin approves or rejects a cancellation request
router.patch('/:id/cancellation', async (req, res) => {
  try {
    const { decision } = req.body; // 'Approved' or 'Rejected'
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    booking.cancellationStatus = decision;

    if (decision === 'Approved') {
      booking.status = 'Cancelled';
      if (booking.packagePurchaseId) {
        const pkg = await PackagePurchase.findById(booking.packagePurchaseId);
        if (pkg && pkg.sessionsBooked > 0) {
          pkg.sessionsBooked -= 1;
          await pkg.save();
        }
      }
    }

    await booking.save();
    res.json({ message: `✅ Cancellation ${decision.toLowerCase()}` });
  } catch (err) {
    res.status(500).json({ message: '❌ Error updating cancellation' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { date, startTime, duration } = req.body;

    if (date && startTime && duration) {
      const newStart = timeToMinutes(startTime);
      const newEnd = newStart + duration * 60;

      const sameDayBookings = await Booking.find({ date, _id: { $ne: req.params.id } });
      const conflict = sameDayBookings.find(b => {
        if (!b.startTime || typeof b.duration !== 'number') return false;
        const bStart = timeToMinutes(b.startTime);
        const bEnd = bStart + b.duration * 60;
        return newStart < bEnd && bStart < newEnd;
      });

      if (conflict) {
        return res.status(409).json({
          message: `❌ That time overlaps with an existing booking at ${conflict.startTime}.`
        });
      }
    }

    const booking = await Booking.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json({ message: '✅ Booking updated', booking });
  } catch (err) {
    res.status(500).json({ message: '❌ Error updating booking', error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await Booking.findByIdAndDelete(req.params.id);
    res.json({ message: '✅ Booking deleted' });
  } catch (err) {
    res.status(500).json({ message: '❌ Error deleting booking' });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const previousStatus = booking.status;
    booking.status = status;
    await booking.save();

    res.json({ message: '✅ Status updated', booking });

    if (booking.packagePurchaseId) {
      const pkg = await PackagePurchase.findById(booking.packagePurchaseId);
      if (pkg) {
        let notifyData = null;

        if (status === 'Cancelled' && previousStatus !== 'Cancelled') {
          pkg.sessionsBooked = Math.max(0, pkg.sessionsBooked - 1);
          notifyData = {
            statusBadge: { bg: '#f8d7da', color: '#a71d2a', text: '❌ Session Not Approved' },
            bodyText: `Your session on <strong>${booking.date} at ${booking.startTime}</strong> could not be confirmed. Please select another date using the link below.`,
            statusLine: 'Your session was declined — please pick another date.',
            ctaLabel: 'Choose Another Date'
          };
        }
        if (status === 'Confirmed' && previousStatus !== 'Confirmed') {
          notifyData = {
            statusBadge: { bg: '#d4edda', color: '#1e7e34', text: '✅ Session Confirmed' },
            bodyText: `Your session on <strong>${booking.date} at ${booking.startTime}</strong> has been confirmed. We look forward to seeing you!`,
            statusLine: 'Your session has been confirmed! ✅'
          };
        }
        if (status === 'Completed' && previousStatus !== 'Completed') {
          pkg.sessionsCompleted = Math.min(pkg.sessionsTotal, pkg.sessionsCompleted + 1);
          if (pkg.sessionsCompleted >= pkg.sessionsTotal) pkg.finished = true;
          const pending = pkg.sessionsTotal - pkg.sessionsCompleted;
          notifyData = {
            statusBadge: { bg: '#e0c89a', color: '#5c3d1a', text: '🎉 Session Completed' },
            bodyText: `Great work! Your session on <strong>${booking.date}</strong> has been marked as completed. You have <strong>${pending}</strong> session(s) remaining in your package.`,
            statusLine: 'Your session is complete! 🎉'
          };
        }

        await pkg.save();

        if (notifyData) {
          const trackingUrl = `${process.env.PUBLIC_BASE_URL || ''}/track.html?token=${pkg.token}`;
          const emailRecipient = process.env.ADMIN_TEST_EMAIL || pkg.email;
          sendEmail(emailRecipient, '🐴 Mervat Academy — Update on Your Session', buildStatusUpdateEmailHtml({
            name: pkg.name, title: pkg.title, trackingUrl, ...notifyData
          })).catch(err => console.log('⚠️ Email notification error:', err.message));

          const waRecipient = process.env.ADMIN_TEST_PHONE || `whatsapp:${pkg.phone}`;
          sendWhatsApp(waRecipient, buildStatusUpdateWhatsAppText({
            name: pkg.name, title: pkg.title, trackingUrl, statusLine: notifyData.statusLine, bodyText: notifyData.bodyText
          })).catch(err => console.log('⚠️ WhatsApp notification error:', err.message));
        }
      }
    }
  } catch (err) {
    res.status(500).json({ message: '❌ Error updating status' });
  }
});

router.patch('/:id/payment', async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    const booking = await Booking.findByIdAndUpdate(req.params.id, { paymentStatus }, { new: true });
    res.json({ message: '✅ Payment status updated', booking });
  } catch (err) {
    res.status(500).json({ message: '❌ Error updating payment status' });
  }
});

router.post('/:id/send-reminder', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    await sendReminderEmail(booking);
    res.json({ message: '✅ Reminder email sent manually' });
  } catch (err) {
    res.status(500).json({ message: '❌ Error sending reminder', error: err.message });
  }
});

module.exports = router;