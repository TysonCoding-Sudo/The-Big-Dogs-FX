const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Trade = require('../models/Trade');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

router.get('/', authMiddleware, async (req, res) => {
  try {
    const trades = await Trade.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(trades);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const trades = await Trade.find({ userId: req.userId });
    
    const total = trades.length;
    const open = trades.filter(t => t.status === 'open').length;
    const closed = trades.filter(t => t.status === 'closed');
    const wins = closed.filter(t => t.pnl > 0).length;
    const losses = closed.filter(t => t.pnl <= 0).length;
    const totalPnl = closed.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winRate = closed.length > 0 ? (wins / closed.length * 100).toFixed(1) : 0;

    res.json({ total, open, wins, losses, totalPnl, winRate });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/close/:ticket', authMiddleware, async (req, res) => {
  try {
    const trade = await Trade.findOneAndUpdate(
      { ticket: req.params.ticket, userId: req.userId },
      { status: 'closed', closedAt: Date.now() },
      { new: true }
    );
    
    if (!trade) return res.status(404).json({ message: 'Trade not found' });
    
    res.json(trade);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
