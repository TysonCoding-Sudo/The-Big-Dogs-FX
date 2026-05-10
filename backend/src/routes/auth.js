const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const otpService = require('../services/otpService');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

router.post('/register', [
  body('username').trim().isLength({ min: 3 }),
  body('email').isEmail(),
  body('password').isLength({ min: 6 })
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
      token: generateToken(user._id)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/login', [
  body('email').isEmail(),
  body('password').exists()
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
      token: generateToken(user._id)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user);
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findByIdAndUpdate(
      decoded.id,
      { $set: req.body },
      { new: true }
    ).select('-password');

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/send-otp', [
  body('email').isEmail(),
  body('otp').isLength({ min: 6, max: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, otp } = req.body;
    const result = await otpService.sendOTP(email, otp);

    if (result.success) {
      res.json({ message: 'OTP sent successfully' });
    } else {
      res.status(500).json({ message: 'Failed to send OTP' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
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
router.get('/trading-mode', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('tradingMode');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ tradingMode: user.tradingMode });
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

router.post('/trading-mode', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { mode } = req.body;
    if (!['normal', 'aggressive'].includes(mode)) {
      return res.status(400).json({ message: 'Mode must be normal or aggressive' });
    }

    const user = await User.findByIdAndUpdate(
      decoded.id,
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

    res.json({ tradingMode: user.tradingMode });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Multi-agent voting toggle
router.get('/multi-agent-voting', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('multiAgentVoting');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ enabled: user.multiAgentVoting });
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

router.post('/multi-agent-voting', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'enabled must be boolean' });
    }

    const user = await User.findByIdAndUpdate(
      decoded.id,
      { multiAgentVoting: enabled },
      { new: true }
    ).select('multiAgentVoting');

    if (!user) return res.status(404).json({ message: 'User not found' });

    try {
      const mt5Bridge = require('../services/mt5Bridge');
      await mt5Bridge.setMultiAgentVoting(enabled);
    } catch (e) {}

    res.json({ enabled: user.multiAgentVoting });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
