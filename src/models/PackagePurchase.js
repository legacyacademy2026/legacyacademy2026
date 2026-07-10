const mongoose = require('mongoose');
const crypto = require('crypto');

const packagePurchaseSchema = new mongoose.Schema({
  title:           { type: String, enum: ['Mr', 'Mrs', 'Ms', ''], default: '' },
  name:            { type: String, required: true },
  email:           { type: String, required: true },
  phone:           { type: String, required: true },
  packageType:     { type: String, required: true },
  tierLabel:       { type: String, required: true },
  price:           { type: Number, required: true },
  validity:        { type: String },
  freeze:          { type: String },
  paymentMethod:   { type: String, enum: ['Cash', 'Card'], required: true },
  requestedSessions: [{
    date:      { type: String },
    startTime: { type: String }
  }],
  paymentStatus:   { type: String, enum: ['Unpaid', 'Paid'], default: 'Unpaid' },
  approvalStatus:  { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  sessionsTotal:     { type: Number, required: true },
  sessionDuration:   { type: Number, default: 45 },
  sessionsBooked:    { type: Number, default: 0 },
  sessionsCompleted: { type: Number, default: 0 },
  finished:        { type: Boolean, default: false },
  approvedAt:      { type: Date },
  expiresAt:       { type: Date },
  expired:         { type: Boolean, default: false },
  freezeRequested: { type: Boolean, default: false },
  frozen:          { type: Boolean, default: false },
  freezeStartedAt: { type: Date },
  freezeDaysUsed:  { type: Number, default: 0 },
  refundRequested: { type: Boolean, default: false },
  refundStatus:    { type: String, enum: ['Not Applicable', 'Pending', 'Refunded'], default: 'Not Applicable' },
  token:           { type: String, unique: true },
  createdAt:       { type: Date, default: Date.now }
});

packagePurchaseSchema.pre('save', function() {
  if (!this.token) {
    this.token = crypto.randomBytes(12).toString('hex');
  }
});

module.exports = mongoose.model('PackagePurchase', packagePurchaseSchema);