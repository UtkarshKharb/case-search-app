const mongoose = require('mongoose');

// One document = one advocate's APPEARANCE on one side of one case (one row of the
// source `advocates` sheet) — not a normalized "advocate" entity. The same
// advocate_name string recurs across many documents/cases (147 of 415 distinct names
// do, in the source data), with no guarantee those rows are the same real person: the
// source's own advocate_id is just a row identifier, and there is no entity resolution.
// Treating advocate_name as a resolvable identity (e.g. "other cases this advocate
// appeared in") is an explicit non-goal for now.
const advocateSchema = new mongoose.Schema({
  case_id: { type: Number, required: true, index: true },
  side: { type: String, required: true, enum: ['petitioner', 'respondent'] },
  advocate_name: { type: String, required: true },
  advocate_kind: { type: String, required: true, enum: ['vakalatnama', 'other', 'party-in-person'] },
  party_represented: { type: String, default: null },
});

module.exports = mongoose.model('Advocate', advocateSchema);
