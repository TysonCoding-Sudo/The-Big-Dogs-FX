const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ticket: { type: Number, required: true },
  symbol: { type: String, required: true },
  type: { type: String, enum: ['BUY', 'SELL'], required: true },
  lotSize: { type: Number, required: true },
  entryPrice: { type: Number, required: true },
  exitPrice: { type: Number },
  
  source: { type: String, enum: ['manual', 'ea'], default: 'ea' },
  
  // Pips and Money
  pips: { type: Number, default: 0 },
  moneyMade: { type: Number, default: 0 },
  
  // Entry/Exit Times
  entryTime: { type: Date, default: Date.now },
  exitTime: { type: Date },
  
  // SL/TP
  sl: Number,
  tp: Number,
  status: { type: String, enum: ['open', 'closed', 'partial'], default: 'open' },
  
  // Journal Details
  marketConditions: {
    impulsive: { type: Boolean, default: false },
    fvgPresent: { type: Boolean, default: false },
    candleType: { type: String },
    session: { type: String },
    htfTrend: { type: String }
  },
  
  // Conditions met
  conditionsMet: { type: Boolean, default: false },
  
  // Result reason
  resultReason: { type: String },
  
  // Adaptive mode
  adaptiveMode: { type: String, enum: ['normal', 'aggressive'], default: 'normal' },
  
  // Risk used
  riskUsed: { type: Number, default: 2 },
  
  // Learning data
  learning: { type: String },
  
  // Pattern matched
  patternMatched: { type: String },
  
  // Confidence score
  confidenceScore: { type: Number, default: 0 },
  
  // Original zone type
  zoneType: { type: String, enum: ['supply', 'demand'] },
  pattern: { type: String },
  
  // Timestamps
  closedAt: Number,
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Index for efficient queries
tradeSchema.index({ userId: 1, createdAt: -1 });
tradeSchema.index({ userId: 1, entryTime: -1 });

module.exports = mongoose.model('Trade', tradeSchema);