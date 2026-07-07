const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Customer = require('../models/Customer');
const ClosedDay = require('../models/ClosedDay');
const PackagePurchase = require('../models/PackagePurchase');
const { sendEmail, sendReminderEmail } = require('../utils/mailer');
const { sendWhatsApp } = require('../utils/whatsapp');
const { sendSMS } = require('../utils/sms');
const { buildStatusUpdateEmailHtml, buildStatusUpdateWhatsAppText } = require('../utils/messageTemplates');
const { notifyAll, actionUrl, ADMIN_ACTION_KEY } = require('../utils/notifier');
const { actionPage, confirmPage } = require('../utils/actionPage');

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
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
    const isDateOnly = !startTime || !duration; // e.g. Horse Training: date only

    const closedInfo = await ClosedDay.findOne({ date });
    if (closedInfo?.type === 'Holiday') {
      return res.status(409).json({ message: '❌ The academy is closed on this date.' });
    }

    if (!isDateOnly) {
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
        if (!b.startTime || typeof b.duration !== 'number' || !b.duration) return false;
        const bStart = timeToMinutes(b.startTime);
        const bEnd = bStart + b.duration * 60;
        return newStart < bEnd && bStart < newEnd;
      });

      if (conflict) {
        return res.status(409).json({
          message: `❌ That time overlaps with an existing booking at ${conflict.startTime}. Please choose another time.`
        });
      }
    }

    const booking = new Booking(req.body);
    await booking.save();

    await Customer.findOneAndUpdate(
      { email: booking.email },
      { name: booking.name, phone: booking.phone, email: booking.email },
      { upsert: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ message: '✅ Booking saved successfully!' });

    // Notify customer + admin that the booking was received
    const detailsLine = `${booking.category}${booking.subPackage ? ' — ' + booking.subPackage : ''} on <strong>${booking.date || ''}${booking.startTime ? ' at ' + booking.startTime : ''}</strong>`;
    notifyAll({
      customer: { name: booking.name, email: booking.email, phone: booking.phone },
      subject: '🐴 Legacy Équestre — Booking Received',
      emailHtml: buildStatusUpdateEmailHtml({
        name: booking.name, title: booking.title,
        statusBadge: { bg: '#e6ede0', color: '#4a5c39', text: '📩 Booking Received' },
        bodyText: `Thank you! We've received your booking request for ${detailsLine}. Our team will confirm it shortly.`,
        trackingUrl: null
      }),
      waText: buildStatusUpdateWhatsAppText({
        name: booking.name, title: booking.title,
        statusLine: 'We received your booking request 📩',
        bodyText: `${booking.category}${booking.subPackage ? ' — ' + booking.subPackage : ''}${booking.date ? '\n📅 ' + booking.date : ''}${booking.startTime ? '\n🕐 ' + booking.startTime : ''}\n\nOur team will confirm it shortly.`
      }),
      adminInfo: {
        subject: '🔔 New Booking Received',
        headline: 'New Booking',
        rows: [
          ['Customer', `${booking.title ? booking.title + ' ' : ''}${booking.name}`],
          ['Phone', booking.phone],
          ['Email', booking.email],
          ['Service', booking.category + (booking.subPackage ? ' — ' + booking.subPackage : '')],
          ['Date', booking.date || '-'],
          ...(booking.startTime ? [['Time', booking.startTime]] : []),
          ...(booking.message ? [['Message', booking.message]] : [])
        ]
      }
    });
  } catch (err) {
    res.status(500).json({ message: '❌ Error saving booking', error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    // Lazily complete past sessions so the dashboard is always up to date,
    // even right after the server wakes from sleep (throttled inside).
    try { await require('../cron/reminder').sweepPastSessions(); } catch (e) { /* non-fatal */ }
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

async function applyBookingStatus(booking, status, opts = {}) {
  const previousStatus = booking.status;
  if (previousStatus === status) return;
  booking.status = status;
  await booking.save();

  if (!booking.packagePurchaseId) return;
  const pkg = await PackagePurchase.findById(booking.packagePurchaseId);
  if (!pkg) return;

  let notifyData = null;
  if (status === 'Cancelled' && previousStatus !== 'Cancelled') {
    pkg.sessionsBooked = Math.max(0, pkg.sessionsBooked - 1);
    const reasonLine = opts.reason ? `<br><br><strong>Reason:</strong> ${opts.reason}` : '';
    notifyData = {
      statusBadge: { bg: '#f8d7da', color: '#a71d2a', text: '❌ Session Cancelled' },
      bodyText: `We're sorry — your session on <strong>${booking.date}${booking.startTime ? ' at ' + booking.startTime : ''}</strong> has been cancelled by the academy.${reasonLine}<br><br>Your session has been <strong>returned to your package</strong> — please choose another day using the link below.`,
      statusLine: `Your session was cancelled${opts.reason ? ' — ' + opts.reason : ''}. Your session is returned — please pick another date.`,
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
    notifyAll({
      customer: { name: pkg.name, email: pkg.email, phone: pkg.phone },
      subject: '🐴 Legacy Équestre — Update on Your Session',
      emailHtml: buildStatusUpdateEmailHtml({ name: pkg.name, title: pkg.title, trackingUrl, ...notifyData }),
      waText: buildStatusUpdateWhatsAppText({ name: pkg.name, title: pkg.title, trackingUrl, statusLine: notifyData.statusLine, bodyText: notifyData.bodyText })
    });
  }
}

// One-click admin session actions — GET shows a confirm page, POST executes
// (prevents email/WhatsApp link scanners from auto-triggering the action).
const BOOKING_ACTIONS = {
  confirm:  { status: 'Confirmed', title: 'Session Confirmed', verb: 'confirmed', q: 'Confirm this session?', btn: '✅ Confirm Session', color: '#1e7e34' },
  decline:  { status: 'Cancelled', title: 'Session Declined', verb: 'declined', q: 'Decline this session?', btn: '❌ Confirm Decline', color: '#a71d2a' },
  complete: { status: 'Completed', title: 'Session Completed', verb: 'marked completed', q: 'Mark this session complete?', btn: '🎉 Confirm Complete', color: '#5c3d1a' }
};

async function showBookingConfirm(req, res, action) {
  const cfg = BOOKING_ACTIONS[action];
  if (req.query.key !== ADMIN_ACTION_KEY) return res.status(403).send(actionPage({ ok: false, title: 'Unauthorized', message: 'Invalid or missing security key.' }));
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).send(actionPage({ ok: false, title: 'Not Found', message: 'This session no longer exists.' }));
    res.send(confirmPage({
      title: cfg.q,
      message: `${booking.name}'s session — ${booking.date}${booking.startTime ? ' at ' + booking.startTime : ''}. Click below to ${cfg.verb === 'marked completed' ? 'mark it complete' : cfg.verb} and notify the customer.`,
      actionUrl: `/api/bookings/${booking._id}/${action}?key=${encodeURIComponent(req.query.key)}`,
      buttonLabel: cfg.btn, color: cfg.color, icon: '📅'
    }));
  } catch (err) {
    res.status(500).send(actionPage({ ok: false, title: 'Error', message: 'Something went wrong. Please use the dashboard.' }));
  }
}

async function execBookingAction(req, res, action) {
  const cfg = BOOKING_ACTIONS[action];
  if (req.query.key !== ADMIN_ACTION_KEY) return res.status(403).send(actionPage({ ok: false, title: 'Unauthorized', message: 'Invalid or missing security key.' }));
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).send(actionPage({ ok: false, title: 'Not Found', message: 'This session no longer exists.' }));
    await applyBookingStatus(booking, cfg.status);
    res.send(actionPage({ ok: true, title: cfg.title, message: `${booking.name}'s session on ${booking.date}${booking.startTime ? ' at ' + booking.startTime : ''} has been ${cfg.verb}. The customer has been notified.` }));
  } catch (err) {
    res.status(500).send(actionPage({ ok: false, title: 'Error', message: 'Something went wrong. Please use the dashboard.' }));
  }
}

router.get('/:id/confirm',  (req, res) => showBookingConfirm(req, res, 'confirm'));
router.post('/:id/confirm', (req, res) => execBookingAction(req, res, 'confirm'));
router.get('/:id/decline',  (req, res) => showBookingConfirm(req, res, 'decline'));
router.post('/:id/decline', (req, res) => execBookingAction(req, res, 'decline'));
router.get('/:id/complete',  (req, res) => showBookingConfirm(req, res, 'complete'));
router.post('/:id/complete', (req, res) => execBookingAction(req, res, 'complete'));

router.patch('/:id/status', async (req, res) => {
  try {
    const { status, reason } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    await applyBookingStatus(booking, status, { reason });
    res.json({ message: '✅ Status updated', booking });
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

router.applyBookingStatus = applyBookingStatus;
module.exports = router;