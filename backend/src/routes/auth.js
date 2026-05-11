const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const otpService = require('../services/otpService');
const authMiddleware = require('../middleware/auth');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '15m' });
};

const generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, { expiresIn: '7d' });
};

router.post('/register', [
  body('username').trim().escape().isLength({ min: 3 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password } = req.body;

    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({ username, email, password });

    res.status(201).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      token: generateToken(user._id),
      refreshToken: generateRefreshToken(user._id)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account deactivated' });
    }

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      riskSettings: user.riskSettings,
      mt5Account: user.mt5Account,
      token: generateToken(user._id),
      refreshToken: generateRefreshToken(user._id)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const ALLOWED_SETTINGS_FIELDS = [
  'riskSettings.riskPercent',
  'riskSettings.maxTrades',
  'riskSettings.maxSpread'
];

function sanitizeSettingsUpdate(body) {
  const update = {};
  
  if (body.riskSettings && typeof body.riskSettings === 'object') {
    update.riskSettings = {};
    if (typeof body.riskSettings.riskPercent === 'number' && body.riskSettings.riskPercent >= 0 && body.riskSettings.riskPercent <= 100) {
      update.riskSettings.riskPercent = body.riskSettings.riskPercent;
    }
    if (typeof body.riskSettings.maxTrades === 'number' && body.riskSettings.maxTrades >= 0 && body.riskSettings.maxTrades <= 50) {
      update.riskSettings.maxTrades = body.riskSettings.maxTrades;
    }
    if (typeof body.riskSettings.maxSpread === 'number' && body.riskSettings.maxSpread >= 0) {
      update.riskSettings.maxSpread = body.riskSettings.maxSpread;
    }
  }
  
  return update;
}

router.put('/settings', authMiddleware, [
  body('riskSettings').optional().isObject(),
  body('riskSettings.riskPercent').optional().isFloat({ min: 0, max: 100 }),
  body('riskSettings.maxTrades').optional().isInt({ min: 0, max: 50 }),
  body('riskSettings.maxSpread').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Invalid settings values' });
    }

    const update = sanitizeSettingsUpdate(req.body);
    
    if (Object.keys(update).length === 0) {
      const user = await User.findById(req.userId).select('-password');
      return res.json(user);
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: update },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update settings' });
  }
});

router.post('/send-otp', [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }

    const { email } = req.body;
    const result = await otpService.sendOTP(email);

    if (result.success) {
      res.json({ message: 'Verification code sent to your email' });
    } else {
      res.status(429).json({ message: result.error || 'Failed to send verification code' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

router.post('/verify-otp', [
  body('email').isEmail(),
  body('otp').isLength({ min: 6, max: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, otp } = req.body;
    const result = otpService.verifyOTP(email, otp);

    if (result.valid) {
      res.json({ message: 'OTP verified' });
    } else {
      res.status(400).json({ message: result.message });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Trading mode toggle
router.get('/trading-mode', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('tradingMode');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ tradingMode: user.tradingMode });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/trading-mode', authMiddleware, async (req, res) => {
  try {
    const { mode } = req.body;
    if (!['normal', 'aggressive'].includes(mode)) {
      return res.status(400).json({ message: 'Mode must be normal or aggressive' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { tradingMode: mode },
      { new: true }
    ).select('tradingMode');

    if (!user) return res.status(404).json({ message: 'User not found' });

    // Propagate to MT5 bridge
    try {
      const mt5Bridge = require('../services/mt5Bridge');
      await mt5Bridge.setTradingMode(mode);
    } catch (e) {
      // Bridge not critical for response
    }

    // Broadcast to all connected devices
    try {
      const io = req.io;
      if (io) io.to(req.userId.toString()).emit('state_update', { type: 'tradingMode', value: mode });
    } catch (e) {}

    res.json({ tradingMode: user.tradingMode });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Multi-agent voting toggle
router.get('/multi-agent-voting', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('multiAgentVoting');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ enabled: user.multiAgentVoting });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/multi-agent-voting', authMiddleware, async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'enabled must be boolean' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { multiAgentVoting: enabled },
      { new: true }
    ).select('multiAgentVoting');

    if (!user) return res.status(404).json({ message: 'User not found' });

    try {
      const mt5Bridge = require('../services/mt5Bridge');
      await mt5Bridge.setMultiAgentVoting(enabled);
    } catch (e) {}

    // Broadcast to all connected devices
    try {
      const io = req.io;
      if (io) io.to(req.userId.toString()).emit('state_update', { type: 'agentVoting', value: enabled });
    } catch (e) {}

    res.json({ enabled: user.multiAgentVoting });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// EA status toggle
router.get('/ea-status', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('eaActive');
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Calculate today's profit
    const Trade = require('../models/Trade');
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTrades = await Trade.find({
      userId: req.userId,
      exitTime: { $gte: todayStart }
    });
    const todayProfit = todayTrades.reduce((sum, t) => sum + (t.moneyMade || 0), 0);

    res.json({ eaActive: user.eaActive, todayProfit, dailyTarget: 2000 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/ea-status', authMiddleware, async (req, res) => {
  try {
    const { eaActive } = req.body;
    if (typeof eaActive !== 'boolean') {
      return res.status(400).json({ message: 'eaActive must be boolean' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { eaActive },
      { new: true }
    ).select('eaActive');

    if (!user) return res.status(404).json({ message: 'User not found' });

    // Propagate to MT5 bridge
    try {
      const mt5Bridge = require('../services/mt5Bridge');
      await mt5Bridge.setEAStatus(eaActive);
    } catch (e) {}

    // Broadcast to all connected devices
    try {
      const io = req.io;
      if (io) io.to(req.userId.toString()).emit('state_update', { type: 'eaActive', value: eaActive });
    } catch (e) {}

    res.json({ eaActive: user.eaActive });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Connected devices
router.get('/devices', authMiddleware, async (req, res) => {
  try {
    const getConnectedDevices = req.app.get('getConnectedDevices');
    const devices = getConnectedDevices ? getConnectedDevices(req.userId.toString()) : [];
    res.json({ devices });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// EA API Key Management
router.get('/ea-api-key', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('+eaApiKeyHash eaApiKeyLastGenerated');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      hasKey: !!user.eaApiKeyHash,
      lastGenerated: user.eaApiKeyLastGenerated || null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/ea-api-key/generate', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('+eaApiKeyHash');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const newKey = user.generateEAAPIKey();
    await user.save();

    res.json({
      apiKey: newKey,
      lastGenerated: user.eaApiKeyLastGenerated,
      warning: 'Store this key securely - it will not be shown again.'
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate API key' });
  }
});

router.post('/ea-api-key/revoke', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.eaApiKeyHash = undefined;
    user.eaApiKeyLastGenerated = undefined;
    await user.save();

    res.json({ message: 'EA API key revoked successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to revoke API key' });
  }
});

module.exports = router;
