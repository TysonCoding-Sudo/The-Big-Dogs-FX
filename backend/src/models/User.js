const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const CryptoJS = require('crypto-js');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  mt5Account: {
    login: String,
    server: String,
    password: String
  },
  riskSettings: {
    riskPercent: { type: Number, default: 2 },
    maxTrades: { type: Number, default: 3 },
    maxSpread: { type: Number, default: 300 }
  },
  isActive: { type: Boolean, default: true },
  tradingMode: { type: String, enum: ['normal', 'aggressive'], default: 'normal' },
  multiAgentVoting: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  if (this.isModified('mt5Account.password') && this.mt5Account.password) {
    const parts = this.mt5Account.password.split(':');
    if (parts.length === 1) {
      this.mt5Account.password = 'enc:' + CryptoJS.AES.encrypt(this.mt5Account.password, process.env.MT5_ENCRYPT_KEY).toString();
    }
  }
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.decryptMt5Password = function() {
  if (!this.mt5Account?.password) return null;
  const parts = this.mt5Account.password.split(':');
  if (parts[0] === 'enc') {
    const bytes = CryptoJS.AES.decrypt(parts[1], process.env.MT5_ENCRYPT_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  }
  return this.mt5Account.password;
};

module.exports = mongoose.model('User', userSchema);
