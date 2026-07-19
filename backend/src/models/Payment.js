const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId:                    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  uploadId:                  { type: String, required: true },
  transaction_ref:           { type: String },
  processed_at:              { type: String },
  order_reference:           { type: String },          // raw value from CSV
  order_reference_normalized:{ type: String },          // trimmed + uppercased
  _isDirtyRef:               { type: Boolean, default: false }, // true if normalization changed it
  currency:                  { type: String },
  amount:                    { type: Number, default: 0 },
  fee:                       { type: Number, default: 0 },
  net_settled:               { type: Number, default: 0 },
  type:                      { type: String },          // 'charge' | 'refund'
  status:                    { type: String }           // 'settled' | 'pending' | ...
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
