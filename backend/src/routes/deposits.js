const express = require('express');
const router = express.Router();
const Deposit = require('../models/Deposit');
const authMiddleware = require('../middleware/auth');

// Get all deposits
router.get('/', authMiddleware, async (req, res) => {
  try {
    const deposits = await Deposit.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(30);
    res.json(deposits);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get deposits from last 7 days
router.get('/recent', authMiddleware, async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const deposits = await Deposit.find({
      userId: req.userId,
      createdAt: { $gte: sevenDaysAgo }
    }).sort({ createdAt: -1 });

    const totalDeposited = deposits.reduce((sum, d) => sum + d.amount, 0);

    res.json({
      deposits,
      totalDeposited,
      count: deposits.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add new deposit
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { amount, method, note } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    const deposit = await Deposit.create({
      userId: req.userId,
      amount,
      method: method || 'bank_transfer',
      note: note || 'Initial deposit',
      status: 'completed',
      transactionId: `DEP_${Date.now()}`
    });

    res.status(201).json(deposit);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get total deposited
router.get('/total', authMiddleware, async (req, res) => {
  try {
    const deposits = await Deposit.find({ userId: req.userId, status: 'completed' });
    const total = deposits.reduce((sum, d) => sum + d.amount, 0);

    res.json({
      total,
      deposits: deposits.length,
      firstDeposit: deposits.length > 0 ? deposits[deposits.length - 1].createdAt : null,
      lastDeposit: deposits.length > 0 ? deposits[0].createdAt : null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;