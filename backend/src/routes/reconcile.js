const express = require('express');
const authMiddleware = require('../middleware/auth');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const Reconciliation = require('../models/Reconciliation');
const { reconcile } = require('../services/reconciler');

const router = express.Router();

// POST /api/reconcile — run the reconciliation engine
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [orders, payments] = await Promise.all([
      Order.find({ userId }).lean(),
      Payment.find({ userId }).lean()
    ]);

    if (orders.length === 0) {
      return res.status(400).json({ error: 'No data found. Please upload your CSV files first.' });
    }

    const result = reconcile(orders, payments);

    // Upsert reconciliation result (one per user, overwrite on re-run)
    const rec = await Reconciliation.findOneAndUpdate(
      { userId },
      {
        userId,
        uploadId: orders[0].uploadId,
        status: 'complete',
        summary: result.summary,
        discrepancies: result.discrepancies
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      summary: result.summary,
      reconciliationId: rec._id
    });
  } catch (err) {
    console.error('Reconcile error:', err);
    res.status(500).json({ error: 'Reconciliation failed: ' + err.message });
  }
});

// GET /api/reconcile/results — fetch stored results + discrepancies
router.get('/results', authMiddleware, async (req, res) => {
  try {
    const rec = await Reconciliation.findOne({ userId: req.user.userId }).lean();
    if (!rec) {
      return res.status(404).json({ error: 'No reconciliation results found. Please run reconciliation first.' });
    }
    res.json(rec);
  } catch (err) {
    console.error('Results fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch results.' });
  }
});

module.exports = router;
