const mongoose = require('mongoose');

// One document = one hearing event (a listing or an order) on one case's timeline —
// one row of the source `hearings` sheet. A case can have zero of these; do not assume
// at least one exists.
const hearingSchema = new mongoose.Schema({
  case_id: { type: Number, required: true, index: true },
  date: { type: Date, required: true },
  // Raw semicolon-separated strings, not split — see plan's "list fields" decision.
  judges: { type: String, default: null },
  hearing_type: { type: String, required: true, enum: ['listing', 'order'] },
  is_disposal_order: { type: Boolean, required: true },
  pet_arguing_counsel: { type: String, default: null },
  res_arguing_counsel: { type: String, default: null },
  summary: { type: String, default: null },
  order_text: { type: String, default: null },
});

module.exports = mongoose.model('Hearing', hearingSchema);
