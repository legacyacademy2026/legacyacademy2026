const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const ClosedDay = require('../models/ClosedDay');

router.get('/', async (req, res) => {
  try {
    const days = await ClosedDay.find();
    res.json(days);
  } catch (err) {
    res.status(500).json({ message: '❌ Error fetching closed days' });
  }
});

router.get('/:date', async (req, res) => {
  try {
    const day = await ClosedDay.findOne({ date: req.params.date });
    res.json(day || null);
  } catch (err) {
    res.status(500).json({ message: '❌ Error checking date' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { date, type, closeTime, reason } = req.body;
    const day = await ClosedDay.findOneAndUpdate(
      { date },
      { date, type, closeTime, reason },
      { upsert: true, new: true }
    );
    res.json({ message: '✅ Saved', day });
  } catch (err) {
    res.status(500).json({ message: '❌ Error saving closed day' });
  }
});

router.delete('/:date', requireAdmin, async (req, res) => {
  try {
    await ClosedDay.deleteOne({ date: req.params.date });
    res.json({ message: '✅ Removed' });
  } catch (err) {
    res.status(500).json({ message: '❌ Error removing closed day' });
  }
});

module.exports = router;