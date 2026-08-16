const express = require('express');
const Matter = require('../models/Matter');
const Advocate = require('../models/Advocate');
const Hearing = require('../models/Hearing');
const LowerCourt = require('../models/LowerCourt');

const router = express.Router();

const CNR_PATTERN = /^[A-Z0-9]{16}$/;

// GET /api/cases — lightweight browse list (demo/testing convenience, not in the
// literal spec) so the UI has something clickable without knowing a CNR by heart.
router.get('/cases', async (req, res, next) => {
  try {
    const matters = await Matter.find({}, 'case_id cnr petitioner respondent court case_status')
      .sort({ court: 1, cnr: 1 })
      .lean();
    res.json(matters);
  } catch (err) {
    next(err);
  }
});

// GET /api/cases/:cnr — the core search workflow: look up a case by its CNR and
// return everything needed to display it (matter + advocates + hearings).
router.get('/cases/:cnr', async (req, res, next) => {
  console.log(`GET /api/cases/${req.params.cnr}`);
  try {
    const cnr = req.params.cnr.trim().toUpperCase();
    if (!CNR_PATTERN.test(cnr)) {
      return res.status(400).json({ error: 'CNR must be exactly 16 alphanumeric characters.' });
    }

    const matter = await Matter.findOne({ cnr }).lean();
    console.log(`Found matter: ${matter ? matter.case_id : 'none'}`);
    if (!matter) {
      return res.status(404).json({ error: `No case found for CNR ${cnr}.` });
    }

    const [advocates, hearings, lowerCourts] = await Promise.all([
      Advocate.find({ case_id: matter.case_id }).lean(),
      Hearing.find({ case_id: matter.case_id }).sort({ date: 1 }).lean(),
      LowerCourt.find({ case_id: matter.case_id }).lean(),
    ]);

    res.json({ matter, advocates, hearings, lowerCourts });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard — everything the analytics dashboard needs in one shot. The
// dataset is small (a few hundred documents total), so filtering/aggregation is done
// client-side rather than adding a new query per filter combination.
router.get('/dashboard', async (req, res, next) => {
  try {
    const [matters, hearings, advocates] = await Promise.all([
      Matter.find({}, 'case_id cnr court case_status').lean(),
      Hearing.find({}, 'case_id date judges hearing_type is_disposal_order').lean(),
      Advocate.find({}, 'case_id side advocate_name').lean(),
    ]);

    res.json({ matters, hearings, advocates });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
