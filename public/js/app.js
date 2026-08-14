const CNR_PATTERN = /^[A-Za-z0-9]{16}$/;

const searchForm = document.getElementById('search-form');
const cnrInput = document.getElementById('cnr-input');
const searchError = document.getElementById('search-error');
const caseDetail = document.getElementById('case-detail');
const caseListEl = document.getElementById('case-list');

// --- small display helpers ---------------------------------------------------

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Semicolon-separated fields are stored raw (see README) — split here purely for
// display, one entry per line, so the API/DB stay untouched.
function splitList(value) {
  if (!value) return [];
  return value
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

function renderList(items) {
  if (items.length === 0) return '<p class="empty">—</p>';
  return `<ul class="plain-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function statusBadgeClass(status) {
  return status === 'Disposed' ? 'badge badge-disposed' : 'badge badge-pending';
}

// --- error / loading state ----------------------------------------------------

function showSearchError(message) {
  searchError.textContent = message;
  searchError.hidden = false;
}

function clearSearchError() {
  searchError.hidden = true;
  searchError.textContent = '';
}

// --- browse list ---------------------------------------------------------------

async function loadCaseList() {
  try {
    const cases = await api.listCases();
    if (cases.length === 0) {
      caseListEl.innerHTML = '<p class="empty">No cases loaded yet — run the ingestion script.</p>';
      return;
    }
    caseListEl.innerHTML = cases
      .map(
        (c) => `
        <button class="case-row" data-cnr="${escapeHtml(c.cnr)}">
          <div class="case-row-main">
            <span>${escapeHtml(c.petitioner)} v. ${escapeHtml(c.respondent)}</span>
            <span class="${statusBadgeClass(c.case_status)}">${escapeHtml(c.case_status)}</span>
          </div>
          <div class="case-row-sub">
            <span>${escapeHtml(c.court)}</span>
            <span class="cnr">${escapeHtml(c.cnr)}</span>
          </div>
        </button>`
      )
      .join('');

    caseListEl.querySelectorAll('.case-row').forEach((row) => {
      row.addEventListener('click', () => {
        cnrInput.value = row.dataset.cnr;
        searchForCase(row.dataset.cnr);
      });
    });
  } catch (err) {
    caseListEl.innerHTML = '<p class="error-message">Could not load the case list.</p>';
  }
}

// --- case detail rendering -----------------------------------------------------

function renderCaseDetail({ matter, advocates, hearings }) {
  const petitionerAdvocates = advocates.filter((a) => a.side === 'petitioner');
  const respondentAdvocates = advocates.filter((a) => a.side === 'respondent');

  caseDetail.innerHTML = `
    <div class="case-header">
      <div>
        <h2>${escapeHtml(matter.petitioner)} v. ${escapeHtml(matter.respondent)}</h2>
        <p class="cnr-line">${escapeHtml(matter.cnr)}</p>
        <p class="case-subtitle">${escapeHtml(matter.court)} — ${escapeHtml(matter.bench)}</p>
      </div>
      <span class="${statusBadgeClass(matter.case_status)}">${escapeHtml(matter.case_status)}</span>
    </div>

    <dl class="fact-grid">
      <dt>Case type</dt><dd>${escapeHtml(matter.case_type)}</dd>
      <dt>Case category</dt><dd>${matter.case_category ? escapeHtml(matter.case_category) : '—'}</dd>
      <dt>Filing number</dt><dd>${escapeHtml(matter.filing_number)}</dd>
      <dt>Filing date</dt><dd>${formatDate(matter.filing_date)}</dd>
      <dt>Registration number</dt><dd>${matter.registration_number ? escapeHtml(matter.registration_number) : '—'}</dd>
      <dt>Registration date</dt><dd>${formatDate(matter.registration_date)}</dd>
      <dt>Disposal type</dt><dd>${matter.disposal_type ? escapeHtml(matter.disposal_type) : '—'}</dd>
      <dt>Disposal date</dt><dd>${formatDate(matter.disposal_date)}</dd>
    </dl>

    ${
      matter.fera_trace
        ? `<div class="trace-block"><h3>Why this case is in the corpus</h3><p>${escapeHtml(matter.fera_trace)}</p></div>`
        : ''
    }

    <div class="parties-grid">
      <div>
        <h3>Petitioner</h3>
        ${renderList(splitList(matter.petitioner))}
        <h4>Advocates</h4>
        ${renderAdvocateList(petitionerAdvocates)}
      </div>
      <div>
        <h3>Respondent</h3>
        ${renderList(splitList(matter.respondent))}
        <h4>Advocates</h4>
        ${renderAdvocateList(respondentAdvocates)}
      </div>
    </div>

    <div class="hearings-section">
      <h3>Hearings (${hearings.length})</h3>
      ${hearings.length === 0 ? '<p class="empty">No hearings on record for this case.</p>' : renderHearings(hearings)}
    </div>
  `;

  caseDetail.hidden = false;
  caseDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderAdvocateList(advocateRows) {
  if (advocateRows.length === 0) return '<p class="empty">—</p>';
  return `<ul class="plain-list">${advocateRows
    .map((a) => {
      const suffix = a.party_represented ? ` <span class="muted">(for ${escapeHtml(a.party_represented)})</span>` : '';
      return `<li>${escapeHtml(a.advocate_name)} <span class="muted">— ${escapeHtml(a.advocate_kind)}</span>${suffix}</li>`;
    })
    .join('')}</ul>`;
}

function renderHearings(hearings) {
  return `<ol class="hearing-list">${hearings
    .map((h) => {
      const judges = splitList(h.judges);
      return `
        <li class="hearing-item">
          <div class="hearing-item-header">
            <strong>${formatDate(h.date)}</strong>
            <span class="badge">${escapeHtml(h.hearing_type)}</span>
            ${h.is_disposal_order ? '<span class="badge badge-disposed">Disposal order</span>' : ''}
          </div>
          ${judges.length ? `<p class="muted">Bench: ${judges.map(escapeHtml).join(', ')}</p>` : ''}
          ${h.summary ? `<p>${escapeHtml(h.summary)}</p>` : ''}
          ${h.order_text ? `<details><summary>Full order text</summary><pre>${escapeHtml(h.order_text)}</pre></details>` : ''}
        </li>`;
    })
    .join('')}</ol>`;
}

// --- search -------------------------------------------------------------------

async function searchForCase(rawCnr) {
  clearSearchError();
  const cnr = rawCnr.trim();

  if (!CNR_PATTERN.test(cnr)) {
    showSearchError('CNR must be exactly 16 alphanumeric characters.');
    caseDetail.hidden = true;
    return;
  }

  try {
    const payload = await api.getCaseByCnr(cnr);
    renderCaseDetail(payload);
  } catch (err) {
    caseDetail.hidden = true;
    const message = err.response?.data?.error || 'Something went wrong while searching.';
    showSearchError(message);
  }
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  searchForCase(cnrInput.value);
});

loadCaseList();
