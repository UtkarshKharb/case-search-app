require('dotenv').config();
const path = require('path');
const ExcelJS = require('exceljs');
const { connectDB, disconnectDB } = require('../config/db');
const Matter = require('../models/Matter');
const Advocate = require('../models/Advocate');
const Hearing = require('../models/Hearing');

const SOURCE_FILE = path.join(__dirname, '..', 'SE_AsyncTask_FERA.xlsx');
const SAMPLE_SIZE = 100;
const SAMPLE_SEED = 42; // fixed so `populate` samples the same ~100 matters every run

// --- xlsx reading -----------------------------------------------------------

async function readSheet(workbook, sheetName) {
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) {
    throw new Error(`Sheet "${sheetName}" not found in ${SOURCE_FILE}`);
  }

  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cell.value;
  });

  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const obj = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (key) obj[key] = normalizeCellValue(cell.value);
    });
    rows.push(obj);
  });
  return rows;
}

function normalizeCellValue(value) {
  if (value === undefined || value === null || value === '') return null;
  // exceljs represents rich text / hyperlink cells as objects; every field we read is
  // plain text/number/date/boolean, so a plain object here means something unexpected.
  if (typeof value === 'object' && !(value instanceof Date)) {
    if ('text' in value) return value.text;
    if ('result' in value) return value.result;
    return null;
  }
  return value;
}

// --- stratified sampling -----------------------------------------------------

// mulberry32: tiny seeded PRNG (public-domain algorithm), used instead of Math.random()
// so `populate` samples the same ~100 matters on every run.
function mulberry32(seed) {
  let state = seed;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(array, seed) {
  const random = mulberry32(seed);
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Samples ~SAMPLE_SIZE matters, preserving the observed Pending/Disposed ratio.
function stratifiedSample(matters) {
  const pending = matters.filter((m) => m.case_status === 'Pending');
  const disposed = matters.filter((m) => m.case_status === 'Disposed');

  const pendingCount = Math.round((pending.length / matters.length) * SAMPLE_SIZE);
  const disposedCount = SAMPLE_SIZE - pendingCount;

  const sampledPending = seededShuffle(pending, SAMPLE_SEED).slice(0, pendingCount);
  const sampledDisposed = seededShuffle(disposed, SAMPLE_SEED + 1).slice(0, disposedCount);

  console.log(
    `Sampled ${sampledPending.length} Pending + ${sampledDisposed.length} Disposed ` +
      `(source ratio ${pending.length}:${disposed.length}, ` +
      `total ${matters.length})`
  );

  return [...sampledPending, ...sampledDisposed];
}

// --- drain --------------------------------------------------------------------

async function drain() {
  const results = await Promise.all([
    Matter.deleteMany({}),
    Advocate.deleteMany({}),
    Hearing.deleteMany({}),
  ]);
  const [matters, advocates, hearings] = results;
  console.log(
    `Drained: ${matters.deletedCount} matters, ${advocates.deletedCount} advocates, ` +
      `${hearings.deletedCount} hearings`
  );
}

// --- populate -------------------------------------------------------------------

async function populate() {
  await drain();

  console.log(`Reading ${SOURCE_FILE} ...`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(SOURCE_FILE);

  const allMatters = await readSheet(workbook, 'matters');
  const allAdvocates = await readSheet(workbook, 'advocates');
  const allHearings = await readSheet(workbook, 'hearings');

  const sampledMatters = stratifiedSample(allMatters);
  const sampledCaseIds = new Set(sampledMatters.map((m) => m.case_id));

  const sampledAdvocates = allAdvocates.filter((a) => sampledCaseIds.has(a.case_id));
  const sampledHearings = allHearings.filter((h) => sampledCaseIds.has(h.case_id));

  await Matter.insertMany(sampledMatters.map(toMatterDoc));
  await Advocate.insertMany(sampledAdvocates.map(toAdvocateDoc));
  await Hearing.insertMany(sampledHearings.map(toHearingDoc));

  console.log(
    `Inserted: ${sampledMatters.length} matters, ${sampledAdvocates.length} advocates, ` +
      `${sampledHearings.length} hearings`
  );
}

function toMatterDoc(row) {
  return {
    case_id: row.case_id,
    court: row.court,
    bench: row.bench,
    filing_number: row.filing_number,
    registration_number: row.registration_number,
    cnr: row.cnr,
    filing_date: row.filing_date,
    registration_date: row.registration_date,
    case_type: row.case_type,
    case_category: row.case_category,
    petitioner: row.petitioner,
    respondent: row.respondent,
    case_status: row.case_status,
    disposal_type: row.disposal_type,
    disposal_date: row.disposal_date,
    fera_trace: row.fera_trace,
  };
}

function toAdvocateDoc(row) {
  return {
    case_id: row.case_id,
    side: row.side,
    advocate_name: row.advocate_name,
    advocate_kind: row.advocate_kind,
    party_represented: row.party_represented,
  };
}

function toHearingDoc(row) {
  return {
    case_id: row.case_id,
    date: row.date,
    judges: row.judges,
    hearing_type: row.hearing_type,
    is_disposal_order: Boolean(row.is_disposal_order),
    pet_arguing_counsel: row.pet_arguing_counsel,
    res_arguing_counsel: row.res_arguing_counsel,
    summary: row.summary,
    order_text: row.order_text,
  };
}

// --- CLI entry point --------------------------------------------------------------

async function main() {
  const mode = process.argv[2];
  if (mode !== 'populate' && mode !== 'drain') {
    console.error('Usage: node scripts/ingest.js <populate|drain>');
    process.exit(1);
  }

  await connectDB();
  try {
    if (mode === 'populate') await populate();
    else await drain();
  } finally {
    await disconnectDB();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
