const mongoose = require('mongoose');

const reconciliationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  uploadId: { type: String, required: true },
  status: { type: String, enum: ['pending', 'complete', 'error'], default: 'pending' },
  summary: {
    totalOrders:          { type: Number },
    totalPayments:        { type: Number },
    cleanMatches:         { type: Number },
    totalReconciled:      { type: Number },
    totalInDispute:       { type: Number },
    moneyAtRisk:          { type: Number },
    discrepancyBreakdown: { type: mongoose.Schema.Types.Mixed }
  },
  discrepancies: [mongoose.Schema.Types.Mixed]
}, { timestamps: true });

module.exports = mongoose.model('Reconciliation', reconciliationSchema);
