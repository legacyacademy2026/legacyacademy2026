const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const PackagePurchase = require('../models/PackagePurchase');
const Customer = require('../models/Customer');
const Booking = require('../models/Booking');
const ClosedDay = require('../models/ClosedDay');
const { sendEmail } = require('../utils/mailer');
const { sendWhatsApp } = require('../utils/whatsapp');
const { sendSMS } = require('../utils/sms');
const { notifyAll, actionUrl, ADMIN_ACTION_KEY } = require('../utils/notifier');
const { actionPage, confirmPage } = require('../utils/actionPage');
const {
  buildPackageEmailHtml, buildPackageWhatsAppText,
  buildStatusUpdateEmailHtml, buildStatusUpdateWhatsAppText
} = require('../utils/messageTemplates');

function timeToMinutes(timeStr) {
  const [time, period] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function notifyPackage(pkg, { statusBadge, bodyText, detailsHtml, ctaLabel, statusLine, includeLink = true }) {
  const trackingUrl = includeLink ? `${process.env.PUBLIC_BASE_URL || ''}/track.html?token=${pkg.token}` : null;
  const data = { name: pkg.name, title: pkg.title, statusBadge, bodyText, detailsHtml, trackingUrl, ctaLabel };
  notifyAll({
    customer: { name: pkg.name, email: pkg.email, phone: pkg.phone },
    subject: '🐴 Legacy Equestrian — Update on Your Package',
    emailHtml: buildStatusUpdateEmailHtml(data),
    waText: buildStatusUpdateWhatsAppText({ name: pkg.name, title: pkg.title, statusLine, bodyText, trackingUrl })
  });
}

router.post('/', async (req, res) => {
  try {
    // Prevent clients from forging server-managed fields — notably approvalStatus
    // and paymentStatus (which would let someone skip admin approval / mark as paid).
    ['approvalStatus','paymentStatus','sessionsBooked','sessionsCompleted','finished','approvedAt','expiresAt','expired','frozen','freezeRequested','freezeStartedAt','freezeDaysUsed','refundRequested','refundStatus','token','createdAt'].forEach(k => delete req.body[k]);
    const pkg = new PackagePurchase(req.body);
    await pkg.save();

    await Customer.findOneAndUpdate(
      { email: pkg.email },
      { name: pkg.name, phone: pkg.phone, email: pkg.email },
      { upsert: true, setDefaultsOnInsert: true }
    );

    const trackingUrl = `${req.protocol}://${req.get('host')}/track.html?token=${pkg.token}`;

    res.status(201).json({ message: '✅ Package request submitted', token: pkg.token });

    const templateData = {
      title: pkg.title, name: pkg.name, packageType: pkg.packageType,
      tierLabel: pkg.tierLabel, price: pkg.price, trackingUrl
    };

    const emailHtml = buildPackageEmailHtml(templateData);
    const waText = buildPackageWhatsAppText(templateData);
    notifyAll({
      customer: { name: pkg.name, email: pkg.email, phone: pkg.phone },
      subject: '🐴 Your Legacy Equestrian Package Request',
      emailHtml,
      waText,
      adminInfo: {
        subject: '🔔 New Package Request — Approval Needed',
        headline: 'New Package Request',
        rows: [
          ['Customer', `${pkg.title ? pkg.title + ' ' : ''}${pkg.name}`],
          ['Phone', pkg.phone],
          ['Email', pkg.email],
          ['Package', pkg.packageType],
          ['Tier', pkg.tierLabel],
          ['Price', `AED ${pkg.price}`],
          ['Payment', pkg.paymentMethod || '-'],
          ...(pkg.requestedSessions && pkg.requestedSessions.length ? [['Sessions', pkg.requestedSessions.map((s, i) => `#${i+1}: ${s.date} at ${s.startTime}`).join(', ')]] : [])
        ]
      },
      adminActions: [
        { label: '✅ Approve', url: actionUrl(`/api/packages/${pkg._id}/approve`), color: '#1e7e34' },
        { label: '❌ Not Approve', url: actionUrl(`/api/packages/${pkg._id}/reject`), color: '#a71d2a' }
      ]
    });
  } catch (err) {
    res.status(500).json({ message: '❌ Error submitting package request', error: err.message });
  }
});

router.get('/track/:token', async (req, res) => {
  try {
    const pkg = await PackagePurchase.findOne({ token: req.params.token });
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    res.json(pkg);
  } catch (err) {
    res.status(500).json({ message: '❌ Error fetching package' });
  }
});

router.get('/:id/sessions', async (req, res) => {
  try {
    const pkg = await PackagePurchase.findById(req.params.id);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    const isAdmin = (req.headers['x-admin-key'] || req.query.key) === ADMIN_ACTION_KEY;
    if (!isAdmin && (req.query.token || '') !== pkg.token) return res.status(403).json({ message: 'Unauthorized' });
    const sessions = await Booking.find({ packagePurchaseId: req.params.id }).sort({ date: 1 });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ message: '❌ Error fetching sessions' });
  }
});

router.post('/:id/book-session', async (req, res) => {
  try {
    const pkg = await PackagePurchase.findById(req.params.id);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    const isAdmin = (req.headers['x-admin-key'] || req.query.key) === ADMIN_ACTION_KEY;
    if (!isAdmin && (req.body.token || '') !== pkg.token) return res.status(403).json({ message: 'Unauthorized' });
    if (pkg.approvalStatus !== 'Approved') {
      return res.status(403).json({ message: '❌ This package is not yet approved.' });
    }
    if (pkg.finished) {
      return res.status(403).json({ message: '❌ This package has been finished.' });
    }
    if (pkg.expired || (pkg.expiresAt && new Date() > new Date(pkg.expiresAt))) {
      return res.status(403).json({ message: '❌ This package has expired. Unused sessions are no longer available.' });
    }
    if (pkg.frozen) {
      return res.status(403).json({ message: '❄️ This package is currently frozen. Please unfreeze it before booking sessions.' });
    }
    const remaining = pkg.sessionsTotal - pkg.sessionsBooked;
    if (remaining <= 0) {
      return res.status(403).json({ message: '❌ No remaining sessions to book.' });
    }

    const { date, startTime } = req.body;
    const duration = (pkg.sessionDuration || 45) / 60;

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

    const sameDayBookings = await Booking.find({ date, status: { $nin: ['Cancelled', 'Completed'] } });
    const conflict = sameDayBookings.find(b => {
      if (!b.startTime || typeof b.duration !== 'number') return false;
      const bStart = timeToMinutes(b.startTime);
      const bEnd = bStart + b.duration * 60;
      return newStart < bEnd && bStart < newEnd;
    });

    if (conflict) {
      return res.status(409).json({ message: `❌ That time overlaps with an existing booking at ${conflict.startTime}.` });
    }

    const booking = new Booking({
      name: pkg.name,
      email: pkg.email,
      phone: pkg.phone,
      category: 'Riding Packages',
      subPackage: `${pkg.packageType} — ${pkg.tierLabel} (Session)`,
      date, startTime,
      duration,
      price: 0,
      packagePurchaseId: pkg._id
    });
    await booking.save();

    pkg.sessionsBooked += 1;
    await pkg.save();

    res.status(201).json({ message: '✅ Session booked!', booking });

    // Alert admin with one-click confirm/decline (customer already saw on-screen confirmation)
    notifyAll({
      customer: { name: pkg.name, email: pkg.email, phone: pkg.phone },
      subject: '🐴 New Session Booked',
      adminInfo: {
        subject: '🔔 New Session Booked — Confirm?',
        headline: 'New Session Booked',
        rows: [
          ['Customer', `${pkg.title ? pkg.title + ' ' : ''}${pkg.name}`],
          ['Phone', pkg.phone],
          ['Date', date],
          ['Time', startTime],
          ['Package', `${pkg.packageType} — ${pkg.tierLabel}`]
        ]
      },
      adminActions: [
        { label: '✅ Confirm', url: actionUrl(`/api/bookings/${booking._id}/confirm`), color: '#1e7e34' },
        { label: '❌ Decline', url: actionUrl(`/api/bookings/${booking._id}/decline`), color: '#a71d2a' }
      ],
      toCustomer: false
    });
  } catch (err) {
    res.status(500).json({ message: '❌ Error booking session', error: err.message });
  }
});

const FREEZE_MAX_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function freezeDaysLeft(pkg) {
  return Math.max(0, FREEZE_MAX_DAYS - (pkg.freezeDaysUsed || 0));
}

async function applyFreeze(pkg) {
  pkg.frozen = true;
  pkg.freezeRequested = false;
  pkg.freezeStartedAt = new Date();
  await pkg.save();
  notifyPackage(pkg, {
    statusBadge: { bg: '#e4ecf2', color: '#2f5975', text: '❄️ Package Frozen' },
    bodyText: `Your <strong>${pkg.packageType} — ${pkg.tierLabel}</strong> package has been frozen. Your remaining sessions and validity are safe. You have up to <strong>${Math.floor(freezeDaysLeft(pkg))} day(s)</strong> of freeze remaining. Booking will resume once the package is unfrozen.`,
    statusLine: 'Your package is now frozen ❄️',
    ctaLabel: 'View My Package'
  });
}

// Ends a freeze: extends expiry by the frozen duration (capped to the 14-day budget), resumes booking.
async function applyUnfreeze(pkg, auto = false) {
  if (!pkg.frozen || !pkg.freezeStartedAt) { pkg.frozen = false; pkg.freezeStartedAt = null; await pkg.save(); return; }
  const now = new Date();
  const frozenMs = now - new Date(pkg.freezeStartedAt);
  const budgetLeftMs = freezeDaysLeft(pkg) * DAY_MS;
  const effMs = Math.max(0, Math.min(frozenMs, budgetLeftMs));

  // Frozen packages are skipped by the expiry cron, so expiresAt is intact — just push it forward.
  if (pkg.expiresAt) pkg.expiresAt = new Date(new Date(pkg.expiresAt).getTime() + effMs);
  pkg.freezeDaysUsed = Math.min(FREEZE_MAX_DAYS, (pkg.freezeDaysUsed || 0) + effMs / DAY_MS);
  pkg.frozen = false;
  pkg.freezeStartedAt = null;
  await pkg.save();

  const newExpiry = pkg.expiresAt ? new Date(pkg.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
  notifyPackage(pkg, {
    statusBadge: { bg: '#d4edda', color: '#1e7e34', text: '✅ Package Reactivated' },
    bodyText: `${auto ? 'Your freeze period has ended.' : 'Your package has been unfrozen.'} Your <strong>${pkg.packageType} — ${pkg.tierLabel}</strong> package is active again and you can book your remaining sessions. New validity: <strong>${newExpiry}</strong>.`,
    statusLine: auto ? 'Your freeze period has ended — package reactivated ✅' : 'Your package is active again ✅',
    ctaLabel: 'Book My Sessions'
  });
}

// ===== Customer requests a freeze =====
router.post('/:id/request-freeze', async (req, res) => {
  try {
    const pkg = await PackagePurchase.findById(req.params.id);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    if (pkg.approvalStatus !== 'Approved' || pkg.finished || pkg.expired) {
      return res.status(403).json({ message: '❌ Only active packages can be frozen.' });
    }
    if (pkg.frozen) return res.status(400).json({ message: '❄️ This package is already frozen.' });
    if (pkg.freezeRequested) return res.status(400).json({ message: '⏳ A freeze request is already pending admin approval.' });
    if (freezeDaysLeft(pkg) <= 0) return res.status(403).json({ message: '❌ You have used your full 14-day freeze allowance for this package.' });

    pkg.freezeRequested = true;
    await pkg.save();

    // Alert admin with one-click Approve Freeze
    notifyAll({
      customer: { name: pkg.name, email: pkg.email, phone: pkg.phone },
      subject: '🐴 Freeze Request',
      adminInfo: {
        subject: '🔔 Freeze Request — Approve?',
        headline: 'Freeze Requested',
        rows: [
          ['Customer', `${pkg.title ? pkg.title + ' ' : ''}${pkg.name}`],
          ['Phone', pkg.phone],
          ['Package', `${pkg.packageType} — ${pkg.tierLabel}`],
          ['Freeze days left', `${Math.floor(freezeDaysLeft(pkg))} of 14`]
        ]
      },
      adminActions: [{ label: '❄️ Approve Freeze', url: actionUrl(`/api/packages/${pkg._id}/freeze`), color: '#2f5975' }],
      toCustomer: false
    });

    res.json({ message: '✅ Freeze request submitted! Our team will review it shortly.' });
  } catch (err) {
    res.status(500).json({ message: '❌ Error requesting freeze' });
  }
});

// ===== Admin approves freeze (one-click link) =====
router.get('/:id/freeze', async (req, res) => {
  if (req.query.key !== ADMIN_ACTION_KEY) return res.status(403).send(actionPage({ ok: false, title: 'Unauthorized', message: 'Invalid or missing security key.' }));
  try {
    const pkg = await PackagePurchase.findById(req.params.id);
    if (!pkg) return res.status(404).send(actionPage({ ok: false, title: 'Not Found', message: 'This package no longer exists.' }));
    if (pkg.frozen) return res.send(actionPage({ ok: true, title: 'Already Frozen', message: `${pkg.name}'s package is already frozen.` }));
    if (freezeDaysLeft(pkg) <= 0) return res.send(actionPage({ ok: false, title: 'No Freeze Days Left', message: `${pkg.name} has used the full 14-day freeze allowance.` }));
    res.send(confirmPage({
      title: 'Approve this freeze?',
      message: `${pkg.name} — ${pkg.packageType} (${pkg.tierLabel}). ${Math.floor(freezeDaysLeft(pkg))} freeze-day(s) left. Click below to freeze and pause the validity.`,
      actionUrl: `/api/packages/${pkg._id}/freeze?key=${encodeURIComponent(req.query.key)}&ui=1`,
      buttonLabel: '❄️ Confirm Freeze', color: '#2f5975', icon: '❄️'
    }));
  } catch (err) {
    res.status(500).send(actionPage({ ok: false, title: 'Error', message: 'Something went wrong. Please use the dashboard.' }));
  }
});

// ===== Admin freeze from dashboard (JSON) OR one-click confirm (HTML, ?ui=1) =====
router.post('/:id/freeze', async (req, res) => {
  const uiMode = req.query.ui === '1';
  if (uiMode && req.query.key !== ADMIN_ACTION_KEY) return res.status(403).send(actionPage({ ok: false, title: 'Unauthorized', message: 'Invalid or missing security key.' }));
  try {
    const pkg = await PackagePurchase.findById(req.params.id);
    if (!pkg) return uiMode ? res.status(404).send(actionPage({ ok: false, title: 'Not Found', message: 'This package no longer exists.' })) : res.status(404).json({ message: 'Package not found' });
    if (pkg.frozen) return uiMode ? res.send(actionPage({ ok: true, title: 'Already Frozen', message: `${pkg.name}'s package is already frozen.` })) : res.status(400).json({ message: 'Already frozen.' });
    if (freezeDaysLeft(pkg) <= 0) return uiMode ? res.send(actionPage({ ok: false, title: 'No Freeze Days Left', message: `${pkg.name} has used the full 14-day allowance.` })) : res.status(403).json({ message: '❌ Full 14-day freeze allowance used.' });
    await applyFreeze(pkg);
    return uiMode
      ? res.send(actionPage({ ok: true, title: 'Package Frozen', message: `${pkg.name}'s package is now frozen and moved to the Frozen tab. The customer has been notified.` }))
      : res.json({ message: '❄️ Package frozen.', package: pkg });
  } catch (err) {
    return uiMode ? res.status(500).send(actionPage({ ok: false, title: 'Error', message: 'Something went wrong.' })) : res.status(500).json({ message: '❌ Error freezing package' });
  }
});

router.post('/:id/unfreeze', requireAdmin, async (req, res) => {
  try {
    const pkg = await PackagePurchase.findById(req.params.id);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    if (!pkg.frozen) return res.status(400).json({ message: 'This package is not frozen.' });
    await applyUnfreeze(pkg, false);
    res.json({ message: '✅ Package unfrozen and back in active bookings.', package: pkg });
  } catch (err) {
    res.status(500).json({ message: '❌ Error unfreezing package' });
  }
});

router.post('/:id/request-refund', async (req, res) => {
  try {
    const pkg = await PackagePurchase.findById(req.params.id);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });

    pkg.refundRequested = true;
    pkg.refundStatus = 'Pending';
    await pkg.save();

    res.json({ message: '✅ Your cancellation/refund request has been submitted. Admin will review it shortly.' });
  } catch (err) {
    res.status(500).json({ message: '❌ Error submitting request' });
  }
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    const packages = await PackagePurchase.find().sort({ createdAt: -1 });
    res.json(packages);
  } catch (err) {
    res.status(500).json({ message: '❌ Error fetching packages' });
  }
});

async function applyPackageApproval(pkg) {
  const now = new Date();
  const exp = new Date(now);
  exp.setMonth(exp.getMonth() + 2);
  pkg.approvalStatus = 'Approved';
  pkg.approvedAt = now;
  pkg.expiresAt = exp;
  pkg.expired = false;
  await pkg.save();

  // Auto-book ALL requested sessions
  let bookedCount = 0;
  let skippedSlots = [];
  if (pkg.requestedSessions && pkg.requestedSessions.length) {
    const Booking = require('../models/Booking');
    const durationHours = (pkg.sessionDuration || 45) / 60;

    for (const sess of pkg.requestedSessions) {
      try {
        // Check if slot is still available
        const sameDayBookings = await Booking.find({
          date: sess.date,
          status: { $nin: ['Cancelled', 'Completed'] }
        });
        const newStart = timeToMinutes(sess.startTime);
        const newEnd = newStart + (pkg.sessionDuration || 45);
        const conflict = sameDayBookings.find(b => {
          if (!b.startTime || !b.duration) return false;
          const bStart = timeToMinutes(b.startTime);
          const bEnd = bStart + b.duration * 60;
          return newStart < bEnd && bStart < newEnd;
        });

        if (conflict) {
          skippedSlots.push(`${sess.date} at ${sess.startTime}`);
          continue;
        }

        const booking = new Booking({
          name: pkg.name, email: pkg.email, phone: pkg.phone, title: pkg.title,
          category: 'Riding Packages', subPackage: pkg.packageType,
          date: sess.date, startTime: sess.startTime,
          duration: durationHours, price: 0,
          packagePurchaseId: pkg._id, status: 'Confirmed'
        });
        await booking.save();
        bookedCount++;
      } catch (err) {
        console.log(`⚠️ Could not book session ${sess.date} ${sess.startTime}:`, err.message);
        skippedSlots.push(`${sess.date} at ${sess.startTime}`);
      }
    }

    pkg.sessionsBooked = bookedCount;
    await pkg.save();
    console.log(`✅ Auto-booked ${bookedCount}/${pkg.requestedSessions.length} sessions for ${pkg.name}`);
  }

  let sessionDetails = '';
  if (bookedCount > 0) {
    sessionDetails = `<br><br><strong>${bookedCount} session(s) confirmed</strong> and added to the calendar.`;
  }
  if (skippedSlots.length > 0) {
    sessionDetails += `<br>⚠️ ${skippedSlots.length} slot(s) were already taken (${skippedSlots.join('; ')}). Please choose replacement times using the link below.`;
  }

  notifyPackage(pkg, {
    statusBadge: { bg: '#d4edda', color: '#1e7e34', text: '✅ Package Approved' },
    bodyText: `Great news! Your <strong>${pkg.packageType} — ${pkg.tierLabel}</strong> package has been approved.${sessionDetails}${pkg.sessionsBooked < pkg.sessionsTotal ? ' Book your remaining sessions using the link below.' : ''}`,
    statusLine: `Your package has been approved! ✅ ${bookedCount} session(s) confirmed.`,
    ctaLabel: pkg.sessionsBooked < pkg.sessionsTotal ? 'Book Remaining Sessions' : 'View My Sessions'
  });
}

async function applyPackageRejection(pkg) {
  pkg.approvalStatus = 'Rejected';
  await pkg.save();
  notifyPackage(pkg, {
    statusBadge: { bg: '#f8d7da', color: '#a71d2a', text: '❌ Request Not Approved' },
    bodyText: `We're sorry, but we're unable to approve your <strong>${pkg.packageType} — ${pkg.tierLabel}</strong> request at this time. Please contact us directly so we can assist you further.`,
    statusLine: 'Your package request was not approved.',
    includeLink: false
  });
}

// ===== One-click admin action links (from email / WhatsApp, no login) =====
router.get('/:id/approve', async (req, res) => {
  if (req.query.key !== ADMIN_ACTION_KEY) return res.status(403).send(actionPage({ ok: false, title: 'Unauthorized', message: 'Invalid or missing security key.' }));
  try {
    const pkg = await PackagePurchase.findById(req.params.id);
    if (!pkg) return res.status(404).send(actionPage({ ok: false, title: 'Not Found', message: 'This package no longer exists.' }));
    if (pkg.approvalStatus === 'Approved') return res.send(actionPage({ ok: true, title: 'Already Approved', message: `${pkg.name}'s ${pkg.packageType} — ${pkg.tierLabel} package is already approved.` }));
    res.send(confirmPage({
      title: 'Approve this package?',
      message: `${pkg.name} — ${pkg.packageType} (${pkg.tierLabel}), AED ${pkg.price}. Click below to approve and notify the customer.`,
      actionUrl: `/api/packages/${pkg._id}/approve?key=${encodeURIComponent(req.query.key)}`,
      buttonLabel: '✅ Confirm Approval', color: '#1e7e34', icon: '📦'
    }));
  } catch (err) {
    res.status(500).send(actionPage({ ok: false, title: 'Error', message: 'Something went wrong. Please use the dashboard.' }));
  }
});

router.post('/:id/approve', async (req, res) => {
  if (req.query.key !== ADMIN_ACTION_KEY) return res.status(403).send(actionPage({ ok: false, title: 'Unauthorized', message: 'Invalid or missing security key.' }));
  try {
    const pkg = await PackagePurchase.findById(req.params.id);
    if (!pkg) return res.status(404).send(actionPage({ ok: false, title: 'Not Found', message: 'This package no longer exists.' }));
    if (pkg.approvalStatus === 'Approved') return res.send(actionPage({ ok: true, title: 'Already Approved', message: `${pkg.name}'s package is already approved.` }));
    await applyPackageApproval(pkg);
    res.send(actionPage({ ok: true, title: 'Package Approved', message: `${pkg.name}'s ${pkg.packageType} — ${pkg.tierLabel} package is now approved. The customer has been notified and can book sessions.` }));
  } catch (err) {
    res.status(500).send(actionPage({ ok: false, title: 'Error', message: 'Something went wrong. Please use the dashboard.' }));
  }
});

router.get('/:id/reject', async (req, res) => {
  if (req.query.key !== ADMIN_ACTION_KEY) return res.status(403).send(actionPage({ ok: false, title: 'Unauthorized', message: 'Invalid or missing security key.' }));
  try {
    const pkg = await PackagePurchase.findById(req.params.id);
    if (!pkg) return res.status(404).send(actionPage({ ok: false, title: 'Not Found', message: 'This package no longer exists.' }));
    if (pkg.approvalStatus === 'Rejected') return res.send(actionPage({ ok: true, title: 'Already Rejected', message: `This request was already rejected.` }));
    res.send(confirmPage({
      title: 'Reject this request?',
      message: `${pkg.name} — ${pkg.packageType} (${pkg.tierLabel}). Click below to reject and notify the customer.`,
      actionUrl: `/api/packages/${pkg._id}/reject?key=${encodeURIComponent(req.query.key)}`,
      buttonLabel: '❌ Confirm Rejection', color: '#a71d2a', icon: '📦'
    }));
  } catch (err) {
    res.status(500).send(actionPage({ ok: false, title: 'Error', message: 'Something went wrong. Please use the dashboard.' }));
  }
});

// ===== Admin removes a single requested session date =====
router.post('/:id/remove-session', requireAdmin, async (req, res) => {
  try {
    const { sessionIndex } = req.body;
    const pkg = await PackagePurchase.findById(req.params.id);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    if (!pkg.requestedSessions || sessionIndex < 0 || sessionIndex >= pkg.requestedSessions.length) {
      return res.status(400).json({ message: 'Invalid session index' });
    }

    const removed = pkg.requestedSessions[sessionIndex];
    pkg.requestedSessions.splice(sessionIndex, 1);
    await pkg.save();

    // Notify customer: this date was not approved, pick another
    const trackingUrl = `${process.env.PUBLIC_BASE_URL || ''}/track.html?token=${pkg.token}`;
    notifyAll({
      customer: { name: pkg.name, email: pkg.email, phone: pkg.phone },
      subject: '🐴 Session Date Update — Legacy Equestrian',
      emailHtml: buildStatusUpdateEmailHtml({
        name: pkg.name, title: pkg.title,
        statusBadge: { bg: '#fff3cd', color: '#8a6d00', text: '📅 Date Not Available' },
        bodyText: `Your requested session on <strong>${removed.date} at ${removed.startTime}</strong> could not be approved. Please select a replacement date using the link below.`,
        trackingUrl,
        ctaLabel: 'Choose Another Date'
      }),
      waText: `📅 Session update: Your requested time on ${removed.date} at ${removed.startTime} is not available. Please pick another date:\n${trackingUrl}`,
      adminInfo: {
        subject: '📋 Session Date Removed',
        headline: 'Session Date Removed',
        rows: [
          ['Customer', pkg.name],
          ['Removed', `${removed.date} at ${removed.startTime}`],
          ['Remaining', `${pkg.requestedSessions.length} sessions`]
        ]
      }
    });

    res.json({ message: '✅ Session removed. Customer notified.', package: pkg });
  } catch (err) {
    res.status(500).json({ message: '❌ Error removing session' });
  }
});

router.post('/:id/reject', async (req, res) => {
  if (req.query.key !== ADMIN_ACTION_KEY) return res.status(403).send(actionPage({ ok: false, title: 'Unauthorized', message: 'Invalid or missing security key.' }));
  try {
    const pkg = await PackagePurchase.findById(req.params.id);
    if (!pkg) return res.status(404).send(actionPage({ ok: false, title: 'Not Found', message: 'This package no longer exists.' }));
    if (pkg.approvalStatus === 'Rejected') return res.send(actionPage({ ok: true, title: 'Already Rejected', message: `This request was already rejected.` }));
    await applyPackageRejection(pkg);
    res.send(actionPage({ ok: true, title: 'Request Rejected', message: `${pkg.name}'s request has been rejected and the customer has been notified.` }));
  } catch (err) {
    res.status(500).send(actionPage({ ok: false, title: 'Error', message: 'Something went wrong. Please use the dashboard.' }));
  }
});

router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const before = await PackagePurchase.findById(req.params.id);
    if (!before) return res.status(404).json({ message: 'Package not found' });

    const pkg = await PackagePurchase.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ message: '✅ Package updated', package: pkg });

    // Package approved
    if (req.body.approvalStatus === 'Approved' && before.approvalStatus !== 'Approved') {
      await applyPackageApproval(pkg);
    }

    // Package rejected
    if (req.body.approvalStatus === 'Rejected' && before.approvalStatus !== 'Rejected') {
      await applyPackageRejection(pkg);
    }

    // Payment confirmed
    if (req.body.paymentStatus === 'Paid' && before.paymentStatus !== 'Paid') {
      notifyPackage(pkg, {
        statusBadge: { bg: '#d4edda', color: '#1e7e34', text: '💰 Payment Received' },
        bodyText: `We've received your payment of <strong>AED ${pkg.price}</strong> for your ${pkg.packageType} — ${pkg.tierLabel} package. Thank you!`,
        statusLine: 'Payment received — thank you! 💰',
        ctaLabel: 'View My Package'
      });
    }
  } catch (err) {
    res.status(500).json({ message: '❌ Error updating package' });
  }
});

// ===== Admin permanently deletes a package (keeps the customer profile) =====
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const pkg = await PackagePurchase.findById(req.params.id);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    // Remove the package's session bookings too (customer record in Customers is kept)
    await Booking.deleteMany({ packagePurchaseId: pkg._id });
    await PackagePurchase.findByIdAndDelete(req.params.id);
    res.json({ message: '🗑️ Package and its sessions deleted. Customer profile kept.' });
  } catch (err) {
    res.status(500).json({ message: '❌ Error deleting package' });
  }
});

router.applyFreeze = applyFreeze;
router.applyUnfreeze = applyUnfreeze;
router.freezeDaysLeft = freezeDaysLeft;
module.exports = router;