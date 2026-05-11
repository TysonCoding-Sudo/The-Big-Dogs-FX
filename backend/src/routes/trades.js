const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const Trade = require('../models/Trade');
const authMiddleware = require('../middleware/auth');
const eaAuthMiddleware = require('../middleware/eaAuth');

const sanitizeTradeInput = (input) => {
  const type = (input.type || '').toUpperCase();
  const validTypes = ['BUY', 'SELL'];
  
  return {
    ticket: parseInt(input.ticket) || 0,
    symbol: (input.symbol || '').toUpperCase().substring(0, 20),
    type: validTypes.includes(type) ? type : 'BUY',
    lotSize: Math.max(0, parseFloat(input.lotSize) || 0),
    entryPrice: Math.max(0, parseFloat(input.entryPrice) || 0),
    exitPrice: input.exitPrice ? Math.max(0, parseFloat(input.exitPrice)) : null,
    pips: parseInt(input.pips) || 0,
    moneyMade: parseFloat(input.moneyMade) || 0,
    sl: input.sl ? Math.max(0, parseFloat(input.sl)) : null,
    tp: input.tp ? Math.max(0, parseFloat(input.tp)) : null,
    status: (input.status || 'open').toLowerCase() === 'closed' ? 'closed' : 'open',
    entryTime: input.entryTime ? new Date(input.entryTime) : new Date(),
    exitTime: input.exitTime ? new Date(input.exitTime) : null,
    resultReason: input.resultReason ? String(input.resultReason).substring(0, 200) : null,
    adaptiveMode: input.adaptiveMode === 'aggressive' ? 'aggressive' : 'normal',
    confidenceScore: Math.min(100, Math.max(0, parseInt(input.confidenceScore) || 0)),
    zoneType: ['supply', 'demand'].includes(input.zoneType) ? input.zoneType : null,
    pattern: input.pattern ? String(input.pattern).substring(0, 100) : null,
    marketConditions: {
      session: input.session ? String(input.session).substring(0, 50) : null,
      impulsive: false,
      fvgPresent: false,
      candleType: null
    }
  };
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

// Get journal - last 7 days or by month/year
router.get('/journal', authMiddleware, async (req, res) => {
  try {
    let dateFilter;
    if (req.query.month && req.query.year) {
      const year = parseInt(req.query.year);
      const month = parseInt(req.query.month) - 1;
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 1);
      dateFilter = { $gte: start, $lt: end };
    } else {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      dateFilter = { $gte: sevenDaysAgo };
    }

    const trades = await Trade.find({
      userId: req.userId,
      entryTime: dateFilter
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
      lotSize: t.lotSize,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      pips: t.pips || 0,
      moneyMade: t.moneyMade || 0,
      session: t.marketConditions?.session || '--',
      candleType: t.marketConditions?.candleType || '--',
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
      agentVotingEnabled: t.agentVotingEnabled,
      riskUsed: t.riskUsed,
      patternMatched: t.patternMatched,
      confidenceScore: t.confidenceScore,
      zoneType: t.zoneType,
      pattern: t.pattern,
      source: t.source || 'ea'
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

// EA trade report endpoint (called via WebRequest from MT5)
router.post('/report', eaAuthMiddleware, [
  body('ticket').isInt({ min: 1 }),
  body('symbol').trim().isLength({ min: 1, max: 20 }),
  body('type').isIn(['BUY', 'SELL', 'buy', 'sell']),
  body('lotSize').optional().isFloat({ min: 0 }),
  body('entryPrice').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Invalid trade data', errors: errors.array() });
    }

    const userId = req.userId;
    
    if (!userId && req.usesGlobalKey) {
      return res.status(400).json({ 
        message: 'Global EA key requires userId in request body. Please use per-user EA API keys instead.' 
      });
    }

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const tradeData = sanitizeTradeInput(req.body);

    const existingTrade = await Trade.findOne({ ticket: tradeData.ticket, userId });

    let trade;
    if (existingTrade) {
      delete tradeData.source; // preserve original source (e.g. 'manual')
      trade = await Trade.findOneAndUpdate(
        { ticket: tradeData.ticket, userId },
        { $set: tradeData },
        { new: true, runValidators: true }
      );
    } else {
      tradeData.source = 'ea';
      tradeData.userId = userId;
      trade = await Trade.create(tradeData);
    }

    const io = req.io;
    if (io && userId) {
      io.to(userId.toString()).emit('trade_update', trade);
      console.log(`Trade broadcast to user: ${userId}, ticket: ${tradeData.ticket}`);
    }

    res.json({ success: true, trade: { _id: trade._id, ticket: trade.ticket, symbol: trade.symbol } });
  } catch (error) {
    console.error('Trade report error:', error);
    res.status(500).json({ message: 'Failed to process trade report' });
  }
});

// Manual trade entry (via web app)
router.post('/manual', authMiddleware, [
  body('symbol').trim().isLength({ min: 1, max: 20 }),
  body('type').isIn(['BUY', 'SELL', 'buy', 'sell']),
  body('lotSize').optional().isFloat({ min: 0 }),
  body('entryPrice').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Invalid trade data', errors: errors.array() });
    }

    const tradeData = sanitizeTradeInput(req.body);
    tradeData.ticket = -(Date.now() % 1000000);
    tradeData.source = 'manual';
    tradeData.status = 'open';
    tradeData.userId = req.userId;

    const trade = await Trade.create(tradeData);

    const io = req.io;
    if (io && req.userId) {
      io.to(req.userId.toString()).emit('trade_update', trade);
    }

    res.status(201).json({ success: true, trade: { _id: trade._id, ticket: trade.ticket, symbol: trade.symbol } });
  } catch (error) {
    console.error('Manual trade error:', error);
    res.status(500).json({ message: 'Failed to create manual trade' });
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