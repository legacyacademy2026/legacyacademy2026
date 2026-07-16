const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ===== Admin login (server-side password check) =====
// Verifies the admin password against the ADMIN_PASSWORD env var and, on success,
// returns the admin token the dashboard sends on every protected API call.
// Set ADMIN_PASSWORD in your environment to a strong value (the default below is a
// fallback only and should NOT be relied on in production).
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Legacy2026';
const ADMIN_TOKEN = process.env.ADMIN_ACTION_KEY || 'legacy-secret-2026';
app.post('/api/admin/login', (req, res) => {
  const password = req.body && req.body.password;
  if (password && password === ADMIN_PASSWORD) {
    return res.json({ token: ADMIN_TOKEN });
  }
  return res.status(401).json({ message: 'Invalid password' });
});

// Routes
const bookingRoutes = require('./src/routes/booking');
app.use('/api/bookings', bookingRoutes);

const closedDaysRoutes = require('./src/routes/closedDays');
app.use('/api/closed-days', closedDaysRoutes);

const customerRoutes = require('./src/routes/customers');
app.use('/api/customers', customerRoutes);

const packageRoutes = require('./src/routes/packages');
app.use('/api/packages', packageRoutes);

const liveryRoutes = require('./src/routes/livery');
app.use('/api/livery', liveryRoutes);

// Connect to Database
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Database connected!');
    // Start scheduled jobs (reminders, package expiry, auto-unfreeze, session auto-complete)
    const { startReminderJob } = require('./src/cron/reminder');
    startReminderJob();
    console.log('✅ Scheduled jobs started');
  })
  .catch((err) => console.log('❌ DB Error:', err));

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});