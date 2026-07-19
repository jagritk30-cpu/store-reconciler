const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  uploadId:       { type: String, required: true },
  order_id:       { type: String },
  order_date:     { type: String },
  customer_email: { type: String, default: null },
  currency:       { type: String },
  gross_amount:   { type: Number, default: 0 },
  discount:       { type: Number, default: 0 },
  net_amount:     { type: Number, default: 0 },
  status:         { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
