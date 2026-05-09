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

// Get all trades (legacy)
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

// Get trade stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const trades = await Trade.find({ userId: req.userId, status: 'closed' });
    
    const total = trades.length;
    const wins = trades.filter(t => (t.pips || 0) > 0).length;
    const losses = trades.filter(t => (t.pips || 0) <= 0).length;
    const totalPips = trades.reduce((sum, t) => sum + (t.pips || 0), 0);
    const totalMoney = trades.reduce((sum, t) => sum + (t.moneyMade || 0), 0);
    const winRate = trades.length > 0 ? (wins / trades.length * 100).toFixed(1) : 0;

    res.json({ total, wins, losses, totalPips, totalMoney, winRate });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get journal - last 7 days trades
router.get('/journal', authMiddleware, async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const trades = await Trade.find({
      userId: req.userId,
      entryTime: { $gte: sevenDaysAgo }
    }).sort({ entryTime: -1 });

    // Calculate totals
    const wins = trades.filter(t => (t.pips || 0) > 0).length;
    const losses = trades.filter(t => (t.pips || 0) <= 0).length;
    const totalPips = trades.reduce((sum, t) => sum + (t.pips || 0), 0);
    const totalMoney = trades.reduce((sum, t) => sum + (t.moneyMade || 0), 0);
    const winRate = trades.length > 0 ? (wins / trades.length * 100).toFixed(1) : 0;

    // Determine mode based on total pips
    const mode = totalPips >= 1000 ? 'aggressive' : 'normal';

    // Transform trades for journal view
    const journalTrades = trades.map(t => ({
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      symbol: t.symbol,
      type: t.type,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      pips: t.pips || 0,
      moneyMade: t.moneyMade || 0,
      conditions: [
        { name: 'Impulsive', fulfilled: t.marketConditions?.impulsive || false },
        { name: 'FVG Present', fulfilled: t.marketConditions?.fvgPresent || false },
        { name: 'HTF Trend', fulfilled: t.marketConditions?.htfTrend || false },
        { name: 'Volume Spike', fulfilled: t.marketConditions?.volumeSpike || false }
      ],
      resultReason: t.resultReason || (t.pips > 0 ? 'Take Profit Hit' : 'Stop Loss Hit'),
      learning: t.learning,
      conditionsMet: t.conditionsMet,
      adaptiveMode: t.adaptiveMode,
      riskUsed: t.riskUsed
    }));

    res.json({
      trades: journalTrades,
      totalMoney,
      totalPips,
      mode,
      wins,
      losses,
      winRate
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get performance stats
router.get('/performance', authMiddleware, async (req, res) => {
  try {
    const trades = await Trade.find({ userId: req.userId, status: 'closed' });

    const bySymbol = {};
    const bySession = {};
    const byCondition = {};

    trades.forEach(t => {
      // By symbol
      if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { wins: 0, losses: 0, pips: 0 };
      if ((t.pips || 0) > 0) bySymbol[t.symbol].wins++;
      else bySymbol[t.symbol].losses++;
      bySymbol[t.symbol].pips += (t.pips || 0);

      // By session
      if (t.marketConditions?.session) {
        if (!bySession[t.marketConditions.session]) bySession[t.marketConditions.session] = { wins: 0, losses: 0 };
        if ((t.pips || 0) > 0) bySession[t.marketConditions.session].wins++;
        else bySession[t.marketConditions.session].losses++;
      }

      // By conditions
      if (t.marketConditions?.impulsive) {
        if (!byCondition['Impulsive']) byCondition['Impulsive'] = { wins: 0, losses: 0 };
        if ((t.pips || 0) > 0) byCondition['Impulsive'].wins++;
        else byCondition['Impulsive'].losses++;
      }
    });

    // Best and worst trades
    const sortedByPips = [...trades].sort((a, b) => (b.pips || 0) - (a.pips || 0));
    const bestTrade = sortedByPips[0];
    const worstTrade = sortedByPips[sortedByPips.length - 1];

    // Calculate adaptive mode info
    const totalPips = trades.reduce((sum, t) => sum + (t.pips || 0), 0);
    const aggressiveTrades = trades.filter(t => t.adaptiveMode === 'aggressive').length;

    res.json({
      totalTrades: trades.length,
      totalPips,
      bySymbol,
      bySession,
      byCondition,
      bestTrade: bestTrade ? { symbol: bestTrade.symbol, pips: bestTrade.pips, date: bestTrade.entryTime } : null,
      worstTrade: worstTrade ? { symbol: worstTrade.symbol, pips: worstTrade.pips, date: worstTrade.entryTime } : null,
      aggressiveModeTrades: aggressiveTrades,
      currentMode: totalPips >= 1000 ? 'aggressive' : 'normal'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Close trade
router.post('/close/:ticket', authMiddleware, async (req, res) => {
  try {
    const trade = await Trade.findOneAndUpdate(
      { ticket: req.params.ticket, userId: req.userId },
      { status: 'closed', exitTime: new Date(), closedAt: Date.now() },
      { new: true }
    );
    
    if (!trade) return res.status(404).json({ message: 'Trade not found' });
    
    res.json(trade);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;