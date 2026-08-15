const mongoose = require('mongoose');

// One document = one forum in a case's procedural history below the deciding court —
// not 1:1 with Matter. Most sampled matters have none at all (absence is the normal
// case, not an edge case); one has as many as 14. Multiple entries for the same case
// don't necessarily form a single linear appellate chain — they can be different forums,
// different case numbers, different dates, representing distinct procedural threads.
const lowerCourtSchema = new mongoose.Schema({
  case_id: { type: Number, required: true, index: true },
  court: { type: String, required: true },
  state: { type: String, default: null },
  case_identifier: { type: String, default: null },
  order_date: { type: Date, default: null },
  level: { type: String, default: null, enum: ['L1', 'L2', null] },
});

module.exports = mongoose.model('LowerCourt', lowerCourtSchema);
