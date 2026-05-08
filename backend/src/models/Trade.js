const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ticket: { type: Number, required: true },
  symbol: { type: String, required: true },
  type: { type: String, enum: ['BUY', 'SELL'], required: true },
  lotSize: { type: Number, required: true },
  openPrice: { type: Number, required: true },
  sl: Number,
  tp: Number,
  status: { type: String, enum: ['open', 'closed', 'partial'], default: 'open' },
  pnl: Number,
  zoneType: { type: String, enum: ['supply', 'demand'] },
  pattern: { type: String },
  closedAt: Number,
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

module.exports = mongoose.model('Trade', tradeSchema);
