const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
router.use(requireAdmin); // entire customers API is admin-only
const Customer = require('../models/Customer');
const Booking = require('../models/Booking');
const PackagePurchase = require('../models/PackagePurchase');
const LiveryBooking = require('../models/LiveryBooking');

// Get all customers, sorted alphabetically by name
router.get('/', async (req, res) => {
  try {
    const customers = await Customer.find().sort({ name: 1 });
    res.json(customers);
  } catch (err) {
    res.status(500).json({ message: '❌ Error fetching customers' });
  }
});

// Get one customer + their full history across riding sessions, packages, and livery —
// matched by email OR phone OR name, so records link up even if one detail changed
// over time (e.g. new phone number, same email).
router.get('/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const matchConditions = [{ email: customer.email }];
    if (customer.phone) matchConditions.push({ phone: customer.phone });
    if (customer.name) matchConditions.push({ name: customer.name });

    const [bookings, packages, liveries] = await Promise.all([
      Booking.find({ $or: matchConditions }).sort({ date: -1 }),
      PackagePurchase.find({ $or: matchConditions }).sort({ createdAt: -1 }),
      LiveryBooking.find({ $or: matchConditions }).sort({ createdAt: -1 })
    ]);

    // Build one unified, chronological timeline of every paid/payable event,
    // so the full history survives even years later regardless of which
    // collection it originally came from.
    const timeline = [];

    bookings.forEach(b => {
      timeline.push({
        type: 'Riding Session',
        icon: '🏇',
        date: b.date,
        sortDate: b.date ? new Date(b.date) : b.createdAt,
        label: b.subPackage || b.category,
        horseName: null,
        amount: b.price || 0,
        paymentStatus: b.paymentStatus || (b.price ? 'Unpaid' : 'Not Applicable'),
        status: b.status || 'Pending'
      });
    });

    packages.forEach(p => {
      timeline.push({
        type: 'Training Package',
        icon: '📦',
        date: p.createdAt,
        sortDate: p.createdAt,
        label: `${p.packageType} — ${p.tierLabel}`,
        horseName: null,
        amount: p.price || 0,
        paymentStatus: p.paymentStatus,
        status: p.approvalStatus,
        extra: `${p.sessionsCompleted}/${p.sessionsTotal} sessions completed`
      });
    });

    liveries.forEach(l => {
      // One entry per monthly cycle: the original period plus each renewal,
      // so a customer who has been with us a year shows every month they paid for.
      const totalCycles = 1 + (l.renewalCount || 0);
      for (let cycle = 0; cycle < totalCycles; cycle++) {
        const cycleStart = new Date(l.startDate);
        cycleStart.setMonth(cycleStart.getMonth() - (totalCycles - 1 - cycle));
        const cycleEnd = new Date(cycleStart);
        cycleEnd.setMonth(cycleEnd.getMonth() + 1);

        const isCurrentCycle = cycle === totalCycles - 1;
        timeline.push({
          type: 'Livery (Monthly)',
          icon: '🏠',
          date: cycleStart,
          sortDate: cycleStart,
          label: `Full Livery — Month ${cycle + 1}`,
          horseName: l.horseName,
          amount: l.price || 3000,
          // Only the current/most recent cycle's live payment status is meaningful;
          // earlier cycles were necessarily paid since the renewal happened.
          paymentStatus: isCurrentCycle ? l.paymentStatus : 'Paid',
          status: l.approvalStatus,
          extra: `Period: ${cycleStart.toLocaleDateString()} – ${cycleEnd.toLocaleDateString()}`
        });
      }
    });

    timeline.sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));

    const totalPaid = timeline
      .filter(t => t.paymentStatus === 'Paid')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    res.json({ customer, bookings, packages, liveries, timeline, totalPaid });
  } catch (err) {
    res.status(500).json({ message: '❌ Error fetching customer', error: err.message });
  }
});

// Delete a customer profile (does NOT delete their past bookings)
router.delete('/:id', async (req, res) => {
  try {
    await Customer.findByIdAndDelete(req.params.id);
    res.json({ message: '✅ Customer deleted' });
  } catch (err) {
    res.status(500).json({ message: '❌ Error deleting customer' });
  }
});

// Edit customer info
router.patch('/:id', async (req, res) => {
  try {
    const { name, phone, notes } = req.body;
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { name, phone, notes },
      { new: true }
    );
    res.json({ message: '✅ Customer updated', customer });
  } catch (err) {
    res.status(500).json({ message: '❌ Error updating customer' });
  }
});

module.exports = router;