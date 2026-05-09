const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'ZAR' },
  method: { type: String, enum: ['bank_transfer', 'card', 'crypto', 'other'], default: 'bank_transfer' },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
  transactionId: { type: String },
  note: { type: String },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

depositSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Deposit', depositSchema);