const mongoose = require('mongoose');

// One document = one case/matter record. `case_id` and `cnr` are both unique and map
// 1:1 (verified against the source data: no cnr is shared by more than one case_id).
const DISPOSAL_TYPES = [
  'Allowed',
  'Dismissed',
  'Partly Allowed',
  'Withdrawn',
  'Settled',
  'Remanded or Transferred',
  'Closed without Adjudication',
  'Unclear',
  'Pending',
];

const matterSchema = new mongoose.Schema({
  case_id: { type: Number, required: true, unique: true, index: true },
  court: { type: String, required: true },
  bench: { type: String, required: true },
  filing_number: { type: String, required: true },
  registration_number: { type: String, default: null },
  cnr: { type: String, required: true, unique: true, index: true, minlength: 16, maxlength: 16 },
  filing_date: { type: Date, default: null },
  registration_date: { type: Date, default: null },
  case_type: { type: String, required: true },
  case_category: { type: String, default: null },
  // Raw semicolon-separated string, not split — see plan's "list fields" decision.
  petitioner: { type: String, required: true },
  respondent: { type: String, required: true },
  case_status: { type: String, required: true, enum: ['Pending', 'Disposed'] },
  disposal_type: { type: String, default: null, enum: [...DISPOSAL_TYPES, null] },
  disposal_date: { type: Date, default: null },
  fera_trace: { type: String, default: null },
});

module.exports = mongoose.model('Matter', matterSchema);
