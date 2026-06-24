const express = require('express');
const router = express.Router();
const PackagePurchase = require('../models/PackagePurchase');
const Customer = require('../models/Customer');
const Booking = require('../models/Booking');
const ClosedDay = require('../models/ClosedDay');
const { sendEmail } = require('../utils/mailer');
const { sendWhatsApp } = require('../utils/whatsapp');
const { buildPackageEmailHtml, buildPackageWhatsAppText } = require('../utils/messageTemplates');

function timeToMinutes(timeStr) {
  const [time, period] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

router.post('/', async (req, res) => {
  try {
    const pkg = new PackagePurchase(req.body);
    await pkg.save();

    await Customer.findOneAndUpdate(
      { email: pkg.email },
      { name: pkg.name, phone: pkg.phone, email: pkg.email },
      { upsert: true, setDefaultsOnInsert: true }
    );

    const trackingUrl = `${req.protocol}://${req.get('host')}/track.html?token=${pkg.token}`;

    const templateData = {
      title: pkg.title, name: pkg.name, packageType: pkg.packageType,
      tierLabel: pkg.tierLabel, price: pkg.price, trackingUrl
    };

    try {
      const emailHtml = buildPackageEmailHtml(templateData);
      const emailRecipient = process.env.ADMIN_TEST_EMAIL || pkg.email;
      await sendEmail(emailRecipient, '🐴 Your Mervat Academy Package Request', emailHtml);
    } catch (emailErr) {
      console.log('⚠️ Email notification error (package still saved):', emailErr.message);
    }

    try {
      const waText = buildPackageWhatsAppText(templateData);
      const waRecipient = process.env.ADMIN_TEST_PHONE || `whatsapp:${pkg.phone}`;
      await sendWhatsApp(waRecipient, waText);
    } catch (waErr) {
      console.log('⚠️ WhatsApp notification error (package still saved):', waErr.message);
    }

    res.status(201).json({ message: '✅ Package request submitted', token: pkg.token });
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
    if (pkg.approvalStatus !== 'Approved') {
      return res.status(403).json({ message: '❌ This package is not yet approved.' });
    }
    if (pkg.finished) {
      return res.status(403).json({ message: '❌ This package has been finished.' });
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

    const sameDayBookings = await Booking.find({ date });
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
  } catch (err) {
    res.status(500).json({ message: '❌ Error booking session', error: err.message });
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

router.get('/', async (req, res) => {
  try {
    const packages = await PackagePurchase.find().sort({ createdAt: -1 });
    res.json(packages);
  } catch (err) {
    res.status(500).json({ message: '❌ Error fetching packages' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const pkg = await PackagePurchase.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ message: '✅ Package updated', package: pkg });
  } catch (err) {
    res.status(500).json({ message: '❌ Error updating package' });
  }
});

module.exports = router;