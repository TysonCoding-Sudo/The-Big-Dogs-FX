const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

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
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false
  },
  mt5Account: {
    login: String,
    server: String,
    password: String
  },
  riskSettings: {
    riskPercent: { type: Number, default: 2, min: 0, max: 100 },
    maxTrades: { type: Number, default: 3, min: 0, max: 50 },
    maxSpread: { type: Number, default: 300, min: 0 }
  },
  isActive: { type: Boolean, default: true },
  tradingMode: { type: String, enum: ['normal', 'aggressive'], default: 'normal' },
  multiAgentVoting: { type: Boolean, default: false },
  eaActive: { type: Boolean, default: false },
  eaApiKeyHash: { type: String, select: false },
  eaApiKeyLastGenerated: { type: Date },
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date },
  lastLoginIp: { type: String }
}, {
  timestamps: true
});

function generateEAAPIKey() {
  return 'BDFX-' + crypto.randomBytes(24).toString('hex');
}

function hashAPIKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  
  if (this.isModified('mt5Account.password') && this.mt5Account.password) {
    const parts = this.mt5Account.password.split(':');
    if (parts.length === 1) {
      this.mt5Account.password = encryptMt5Password(this.mt5Account.password);
    }
  }
  
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

function getEncryptionKey() {
  const key = process.env.MT5_ENCRYPT_KEY || 'fallback-key-change-me-please-32bytes';
  return crypto.createHash('sha256').update(key).digest();
}

function encryptMt5Password(plaintext) {
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag().toString('base64');
  
  return `enc:${iv.toString('base64')}:${authTag}:${encrypted}`;
}

function decryptMt5Password(encryptedStr) {
  const parts = encryptedStr.split(':');
  if (parts[0] !== 'enc' || parts.length < 4) {
    return encryptedStr;
  }
  
  try {
    const iv = Buffer.from(parts[1], 'base64');
    const authTag = Buffer.from(parts[2], 'base64');
    const encrypted = parts[3];
    const key = getEncryptionKey();
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (e) {
    console.error('Decryption failed:', e.message);
    return null;
  }
}

userSchema.methods.decryptMt5Password = function() {
  if (!this.mt5Account?.password) return null;
  return decryptMt5Password(this.mt5Account.password);
};

userSchema.methods.generateEAAPIKey = function() {
  const key = generateEAAPIKey();
  this.eaApiKeyHash = hashAPIKey(key);
  this.eaApiKeyLastGenerated = new Date();
  return key;
};

userSchema.methods.verifyEAAPIKey = function(candidateKey) {
  if (!this.eaApiKeyHash) return false;
  const candidateHash = hashAPIKey(candidateKey);
  return candidateHash === this.eaApiKeyHash;
};

userSchema.statics.findByEAAPIKey = async function(apiKey) {
  const hash = hashAPIKey(apiKey);
  return await this.findOne({ eaApiKeyHash: hash }).select('+eaApiKeyHash');
};

userSchema.statics.generateAPIKeyHash = function(key) {
  return hashAPIKey(key);
};

module.exports = mongoose.model('User', userSchema);
