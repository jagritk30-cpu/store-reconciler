const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const stream = require('stream');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const Reconciliation = require('../models/Reconciliation');

const router = express.Router();

// Store files in memory (buffer), max 10MB each
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(csv)$/i)) {
      return cb(new Error('Only CSV files are allowed'));
    }
    cb(null, true);
  }
});

/**
 * Parse a CSV Buffer into an array of row objects.
 * csv-parser streams require a Readable; we convert Buffer → Readable.
 */
function parseCSV(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const readable = stream.Readable.from(buffer.toString('utf-8'));
    readable
      .pipe(csv({ mapHeaders: ({ header }) => header.trim() }))
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function normalizeRef(ref) {
  return ref ? ref.trim().toUpperCase() : '';
}

function safeFloat(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

// POST /api/upload
router.post(
  '/',
  authMiddleware,
  upload.fields([
    { name: 'orders', maxCount: 1 },
    { name: 'payments', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      if (!req.files || !req.files.orders || !req.files.payments) {
        return res.status(400).json({ error: 'Both "orders" and "payments" CSV files are required.' });
      }

      const userId = req.user.userId;
      const uploadId = uuidv4();

      // Clear previous data for this user
      await Promise.all([
        Order.deleteMany({ userId }),
        Payment.deleteMany({ userId }),
        Reconciliation.deleteMany({ userId })
      ]);

      // Parse both CSVs
      const [ordersRaw, paymentsRaw] = await Promise.all([
        parseCSV(req.files.orders[0].buffer),
        parseCSV(req.files.payments[0].buffer)
      ]);

      if (ordersRaw.length === 0) {
        return res.status(400).json({ error: 'Orders CSV is empty.' });
      }
      if (paymentsRaw.length === 0) {
        return res.status(400).json({ error: 'Payments CSV is empty.' });
      }

      // Transform orders
      const orders = ordersRaw.map((row) => ({
        userId,
        uploadId,
        order_id:       row.order_id?.trim() || null,
        order_date:     row.order_date?.trim() || null,
        customer_email: row.customer_email?.trim() || null,
        currency:       row.currency?.trim() || null,
        gross_amount:   safeFloat(row.gross_amount),
        discount:       safeFloat(row.discount),
        net_amount:     safeFloat(row.net_amount),
        status:         row.status?.trim() || null
      }));

      // Transform payments — normalize the order_reference for matching
      const payments = paymentsRaw.map((row) => {
        const rawRef = row.order_reference || '';
        const normRef = normalizeRef(rawRef);
        const isDirty = rawRef !== normRef; // any change happened during normalization
        return {
          userId,
          uploadId,
          transaction_ref:            row.transaction_ref?.trim() || null,
          processed_at:               row.processed_at?.trim() || null,
          order_reference:            rawRef,
          order_reference_normalized: normRef,
          _isDirtyRef:                isDirty,
          currency:                   row.currency?.trim() || null,
          amount:                     safeFloat(row.amount),
          fee:                        safeFloat(row.fee),
          net_settled:                safeFloat(row.net_settled),
          type:                       row.type?.trim() || null,
          status:                     row.status?.trim() || null
        };
      });

      // Bulk insert
      await Promise.all([
        Order.insertMany(orders),
        Payment.insertMany(payments)
      ]);

      res.json({
        success: true,
        uploadId,
        counts: { orders: orders.length, payments: payments.length }
      });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: 'Upload failed: ' + err.message });
    }
  }
);

module.exports = router;
