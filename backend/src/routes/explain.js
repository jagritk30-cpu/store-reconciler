const express = require('express');
const authMiddleware = require('../middleware/auth');
const Reconciliation = require('../models/Reconciliation');
const { explainDiscrepancy, explainSummary } = require('../services/llm');

const router = express.Router();

// POST /api/explain/single — explain one discrepancy by index
router.post('/single', authMiddleware, async (req, res) => {
  try {
    const { discrepancyIndex } = req.body;

    if (discrepancyIndex === undefined || discrepancyIndex === null) {
      return res.status(400).json({ error: 'discrepancyIndex is required.' });
    }

    const rec = await Reconciliation.findOne({ userId: req.user.userId }).lean();
    if (!rec) {
      return res.status(404).json({ error: 'No reconciliation results found.' });
    }

    const discrepancy = rec.discrepancies[discrepancyIndex];
    if (!discrepancy) {
      return res.status(404).json({ error: 'Discrepancy not found at that index.' });
    }

    const explanation = await explainDiscrepancy(discrepancy);
    res.json(explanation);
  } catch (err) {
    console.error('Explain single error:', err);
    res.status(500).json({ error: 'Failed to generate explanation.' });
  }
});

// POST /api/explain/summary — explain the full reconciliation batch
router.post('/summary', authMiddleware, async (req, res) => {
  try {
    const rec = await Reconciliation.findOne({ userId: req.user.userId }).lean();
    if (!rec) {
      return res.status(404).json({ error: 'No reconciliation results found.' });
    }

    const explanation = await explainSummary(rec.discrepancies, rec.summary);
    res.json(explanation);
  } catch (err) {
    console.error('Explain summary error:', err);
    res.status(500).json({ error: 'Failed to generate summary explanation.' });
  }
});

module.exports = router;
