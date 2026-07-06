const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  email:        { type: String, required: true },
  phone:        { type: String, required: true },
  category:     { type: String, required: true },
  subPackage:   { type: String },
  date:         { type: String, required: true },
  startTime:    { type: String, default: '' },
  duration:     { type: Number, default: 0 },
  message:      { type: String },
  status:       { type: String, enum: ['Pending', 'Confirmed', 'Cancelled', 'Completed'], default: 'Pending' },
  price:        { type: Number, default: 0 },
  cancellationStatus: { type: String, enum: ['None', 'Pending', 'Approved', 'Rejected'], default: 'None' },
  packagePurchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'PackagePurchase' },
  paymentStatus: { type: String, enum: ['Unpaid', 'Paid'], default: 'Unpaid' },
  reminderSent: { type: Boolean, default: false },
  createdAt:    { type: Date, default: Date.now }
});

module.exports = mongoose.model('Booking', bookingSchema);