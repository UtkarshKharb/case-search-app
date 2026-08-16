const APP_NAME = 'Causa Analytica';
const HOME_PREVIEW_COUNT = 6;
const CNR_PATTERN = /^[A-Za-z0-9]{16}$/;
const THEME_KEY = 'causa-analytica-theme';

const viewRoot = document.getElementById('view-root');
const navWordmark = document.getElementById('nav-wordmark');
const navCasesLink = document.getElementById('nav-cases-link');
const navDashboardLink = document.getElementById('nav-dashboard-link');
const themeToggle = document.getElementById('theme-toggle');

document.title = APP_NAME;
document.getElementById('nav-wordmark-text').textContent = APP_NAME;

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

// disposal_type is a 9-value enum read against the petition itself, not the overall
// matter — colored as a nuance layer on top of the Pending/Disposed status badge.
function disposalTypeClass(type) {
  if (type === 'Allowed') return 'disposal-positive';
  if (type === 'Dismissed') return 'disposal-negative';
  if (type === 'Unclear') return 'disposal-warning';
  return 'disposal-neutral';
}

function skeletonCards(count) {
  return Array.from({ length: count }, () => '<div class="case-card skeleton-card"></div>').join('');
}

// --- theme ----------------------------------------------------------------------

function getPreferredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  if (document.startViewTransition) {
    const transition = document.startViewTransition(() => applyTheme(next));
    transition.finished.catch(() => {}); // transitions can be legitimately skipped/aborted
  } else {
    applyTheme(next);
  }
}

applyTheme(getPreferredTheme());
themeToggle.addEventListener('click', toggleTheme);

// --- case card (shared between home preview and the full browse list) ----------

function renderCaseCards(cases, container) {
  if (cases.length === 0) {
    container.innerHTML = '<p class="empty">No cases loaded yet — run the ingestion script.</p>';
    return;
  }
  container.innerHTML = cases
    .map(
      (c, i) => `
      <button class="case-card" data-cnr="${escapeHtml(c.cnr)}" style="animation-delay:${Math.min(i * 40, 400)}ms">
        <div class="case-card-main">
          <span>${escapeHtml(c.petitioner)} v. ${escapeHtml(c.respondent)}</span>
          <span class="${statusBadgeClass(c.case_status)}">${escapeHtml(c.case_status)}</span>
        </div>
        <div class="case-card-sub">
          <span>${escapeHtml(c.court)}</span>
          <span class="cnr">${escapeHtml(c.cnr)}</span>
        </div>
      </button>`
    )
    .join('');
}

// --- case detail (advocates/hearings rendering) ---------------------------------

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
  if (hearings.length === 0) return '<p class="empty">No hearings on record for this case.</p>';
  // Most recent hearing first — display order only, the API's own ascending sort is untouched.
  const latestFirst = [...hearings].reverse();
  return `<ol class="timeline">${latestFirst
    .map((h, i) => {
      const judges = splitList(h.judges);
      const delay = Math.min(i * 50, 500);
      const markerClass = h.is_disposal_order
        ? 'timeline-marker timeline-marker-disposal'
        : h.hearing_type === 'order'
        ? 'timeline-marker timeline-marker-order'
        : 'timeline-marker timeline-marker-listing';
      return `
        <li class="timeline-item" style="animation-delay:${delay}ms">
          <span class="${markerClass}"></span>
          <div class="timeline-content">
            <div class="timeline-header">
              <strong>${formatDate(h.date)}</strong>
              <span class="badge">${escapeHtml(h.hearing_type)}</span>
              ${h.is_disposal_order ? '<span class="badge badge-disposed">Disposal order</span>' : ''}
            </div>
            ${judges.length ? `<p class="muted">Bench: ${judges.map(escapeHtml).join(', ')}</p>` : ''}
            ${h.summary ? `<p><span class="summary-label">SUMMARY:</span> <em>${escapeHtml(h.summary)}</em></p>` : ''}
            ${h.order_text ? `<details><summary class="order-text-toggle">Full order text</summary><pre>${escapeHtml(h.order_text)}</pre></details>` : ''}
          </div>
        </li>`;
    })
    .join('')}</ol>`;
}

// One matter can have several lower_court entries that don't necessarily form a single
// linear appellate chain (different forums, case numbers, dates) — sorted oldest first,
// with undated entries (order_date can be null in the source) pushed to the end.
function renderLowerCourts(lowerCourts) {
  const sorted = [...lowerCourts].sort((a, b) => {
    if (!a.order_date) return 1;
    if (!b.order_date) return -1;
    return new Date(a.order_date) - new Date(b.order_date);
  });
  return `<ul class="lower-court-list">${sorted
    .map((lc) => {
      const subParts = [lc.state, lc.case_identifier].filter(Boolean).map(escapeHtml);
      return `
        <li class="lower-court-item">
          <div class="lower-court-main">
            <span>${escapeHtml(lc.court)}</span>
            ${lc.level ? `<span class="badge">${escapeHtml(lc.level)}</span>` : ''}
          </div>
          <div class="lower-court-sub">
            <span>${subParts.length ? subParts.join(' · ') : '—'}</span>
            <span>${formatDate(lc.order_date)}</span>
          </div>
        </li>`;
    })
    .join('')}</ul>`;
}

function buildCaseDetailHtml({ matter, advocates, hearings, lowerCourts }) {
  const petitionerAdvocates = advocates.filter((a) => a.side === 'petitioner');
  const respondentAdvocates = advocates.filter((a) => a.side === 'respondent');
  const hasStatusQuirk = matter.case_status === 'Disposed' && matter.disposal_type === 'Pending';

  return `
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
      <dt>Disposal type</dt><dd class="${matter.disposal_type ? disposalTypeClass(matter.disposal_type) : ''}">${matter.disposal_type ? escapeHtml(matter.disposal_type) : '—'}</dd>
      <dt>Disposal date</dt><dd>${formatDate(matter.disposal_date)}</dd>
    </dl>

    ${
      hasStatusQuirk
        ? `<p class="quirk-note">ⓘ This case is marked <strong>Disposed</strong> overall, but its disposal type is "Pending" — a known nuance in the source data: disposal type is read against the petition itself, not necessarily the full matter.</p>`
        : ''
    }

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

    ${
      hearings.length === 0
        ? `<div class="hearings-section"><h3>Hearings (0)</h3>${renderHearings(hearings)}</div>`
        : `<details class="hearings-section">
             <summary class="hearings-toggle">Hearings (${hearings.length})</summary>
             ${renderHearings(hearings)}
           </details>`
    }

    ${
      lowerCourts.length > 0
        ? `<details class="lower-court-section">
             <summary class="hearings-toggle">Lower court history (${lowerCourts.length})</summary>
             ${renderLowerCourts(lowerCourts)}
           </details>`
        : ''
    }
  `;
}

function skeletonDetailHtml() {
  return `
    <div class="case-header">
      <div>
        <div class="skeleton-line skeleton-line-lg"></div>
        <div class="skeleton-line skeleton-line-sm"></div>
      </div>
    </div>
    <div class="skeleton-line skeleton-line-block"></div>
  `;
}

// --- routes -----------------------------------------------------------------

function homeSkeletonHtml() {
  return `
    <section class="hero">
      <h1>Search a case</h1>
      <p class="subtitle">Find a court case by its CNR (Case Number Record)</p>
      <form id="search-form" novalidate>
        <div class="cnr-input-wrap">
          <input id="cnr-input" type="text" placeholder="16-character CNR, e.g. HCBM010003411990" maxlength="16" autocomplete="off" />
          <span id="cnr-counter" class="cnr-counter">0/16</span>
        </div>
        <button type="submit">Search</button>
      </form>
      <p id="search-error" class="error-message" hidden></p>
    </section>
    <section class="featured">
      <h2>Featured cases</h2>
      <p class="hint">See the full list of cases under "All Cases".</p>
      <div id="case-list" class="case-grid">${skeletonCards(HOME_PREVIEW_COUNT)}</div>
    </section>
  `;
}

async function loadHome() {
  const container = document.getElementById('case-list');
  try {
    const cases = await api.listCases();
    renderCaseCards(cases.slice(0, HOME_PREVIEW_COUNT), container);
  } catch (err) {
    container.innerHTML = '<p class="error-message">Could not load cases.</p>';
  }
}

function browseSkeletonHtml() {
  return `
    <section class="browse">
      <h1>All cases</h1>
      <p class="subtitle">Every case in the sampled dataset.</p>
      <div id="case-list" class="case-grid">${skeletonCards(9)}</div>
    </section>
  `;
}

async function loadBrowse() {
  const container = document.getElementById('case-list');
  try {
    const cases = await api.listCases();
    renderCaseCards(cases, container);
  } catch (err) {
    container.innerHTML = '<p class="error-message">Could not load cases.</p>';
  }
}

function detailSkeletonHtml() {
  return `
    <a href="#/" class="back-link">&larr; Back to search</a>
    <div id="case-detail-content" class="case-detail">${skeletonDetailHtml()}</div>
  `;
}

async function loadDetail(cnr) {
  const container = document.getElementById('case-detail-content');
  try {
    const payload = await api.getCaseByCnr(cnr);
    container.innerHTML = buildCaseDetailHtml(payload);
    container.classList.add('content-loaded');
  } catch (err) {
    const message = err.response?.data?.error || 'Something went wrong while loading this case.';
    container.classList.add('content-loaded');
    container.innerHTML = `<p class="error-message">${escapeHtml(message)}</p>`;
  }
}

function dashboardSkeletonHtml() {
  return `
    <section class="dashboard">
      <h1>Analytics dashboard</h1>
      <p class="subtitle">Hearings per matter — filter by advocate, judge, or court.</p>

      <div class="filter-row">
        <label class="filter-label">Advocate
          <select id="filter-advocate" class="filter-select" disabled><option value="">Loading…</option></select>
        </label>
        <label class="filter-label">Judge
          <select id="filter-judge" class="filter-select" disabled><option value="">Loading…</option></select>
        </label>
        <label class="filter-label">Court
          <select id="filter-court" class="filter-select" disabled><option value="">Loading…</option></select>
        </label>
      </div>

      <div class="stat-grid">
        <div class="stat-card"><span class="stat-value" id="stat-cases">—</span><span class="stat-label">Cases shown</span></div>
        <div class="stat-card"><span class="stat-value" id="stat-hearings">—</span><span class="stat-label">Total hearings</span></div>
        <div class="stat-card"><span class="stat-value" id="stat-avg">—</span><span class="stat-label">Avg hearings / case</span></div>
      </div>

      <div class="chart-container">
        <canvas id="dashboard-chart"></canvas>
      </div>
    </section>
  `;
}

// Fills a <select> with an "All" option plus one option per value. Built via DOM
// properties (not innerHTML string interpolation) so values with special characters
// (quotes, angle brackets) can never break out of the markup — .value/.textContent
// assignment isn't HTML parsing, so there's nothing to escape.
function populateSelect(select, values) {
  select.innerHTML = '';
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'All';
  select.appendChild(allOption);
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  select.disabled = false;
}

let dashboardChart = null;

async function loadDashboard() {
  const section = document.querySelector('.dashboard');
  let matters, hearings, advocates;
  try {
    ({ matters, hearings, advocates } = await api.getDashboardData());
  } catch (err) {
    section.innerHTML = '<p class="error-message">Could not load dashboard data.</p>';
    return;
  }

  const hearingsByCase = new Map();
  hearings.forEach((h) => {
    if (!hearingsByCase.has(h.case_id)) hearingsByCase.set(h.case_id, []);
    hearingsByCase.get(h.case_id).push(h);
  });

  const advocatesByCase = new Map();
  advocates.forEach((a) => {
    if (!advocatesByCase.has(a.case_id)) advocatesByCase.set(a.case_id, []);
    advocatesByCase.get(a.case_id).push(a);
  });

  const advocateNames = [...new Set(advocates.map((a) => a.advocate_name))].sort();
  const judgeNames = [...new Set(hearings.flatMap((h) => splitList(h.judges)))].sort();
  const courtNames = [...new Set(matters.map((m) => m.court))].sort();

  const advocateSelect = document.getElementById('filter-advocate');
  const judgeSelect = document.getElementById('filter-judge');
  const courtSelect = document.getElementById('filter-court');
  populateSelect(advocateSelect, advocateNames);
  populateSelect(judgeSelect, judgeNames);
  populateSelect(courtSelect, courtNames);

  function computeFilteredMatters() {
    const advocateFilter = advocateSelect.value;
    const judgeFilter = judgeSelect.value;
    const courtFilter = courtSelect.value;

    // A matter must satisfy every active filter (AND across dimensions) — an empty
    // filter value ("All") always passes.
    return matters.filter((m) => {
      if (courtFilter && m.court !== courtFilter) return false;
      if (advocateFilter) {
        const caseAdvocates = advocatesByCase.get(m.case_id) || [];
        if (!caseAdvocates.some((a) => a.advocate_name === advocateFilter)) return false;
      }
      if (judgeFilter) {
        const caseHearings = hearingsByCase.get(m.case_id) || [];
        if (!caseHearings.some((h) => splitList(h.judges).includes(judgeFilter))) return false;
      }
      return true;
    });
  }

  function render() {
    const filteredMatters = computeFilteredMatters();
    const counts = filteredMatters
      .map((m) => ({ cnr: m.cnr, count: (hearingsByCase.get(m.case_id) || []).length }))
      .sort((a, b) => b.count - a.count);
    const totalHearings = counts.reduce((sum, c) => sum + c.count, 0);
    const avg = counts.length ? (totalHearings / counts.length).toFixed(1) : '0';

    document.getElementById('stat-cases').textContent = filteredMatters.length;
    document.getElementById('stat-hearings').textContent = totalHearings;
    document.getElementById('stat-avg').textContent = avg;

    renderChart(counts);
  }

  function renderChart(counts) {
    const canvas = document.getElementById('dashboard-chart');
    if (!canvas) return; // route may have changed while data was loading
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue('--color-accent').trim();
    const textColor = style.getPropertyValue('--color-muted').trim();
    const gridColor = style.getPropertyValue('--color-border').trim();

    if (dashboardChart) dashboardChart.destroy();
    dashboardChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: counts.map((c) => c.cnr),
        datasets: [{ label: 'Hearings', data: counts.map((c) => c.count), backgroundColor: accent }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor, autoSkip: true, maxRotation: 90, minRotation: 0 }, grid: { color: gridColor } },
          y: { ticks: { color: textColor, precision: 0 }, grid: { color: gridColor }, beginAtZero: true },
        },
      },
    });
  }

  [advocateSelect, judgeSelect, courtSelect].forEach((select) => {
    select.addEventListener('change', render);
  });

  render();
}

function notFoundHtml() {
  return `
    <section class="hero">
      <h1>Page not found</h1>
      <p class="subtitle">That link doesn't match a known page.</p>
      <a href="#/" class="back-link">&larr; Back to search</a>
    </section>
  `;
}

// --- router -----------------------------------------------------------------

function parseRoute(hash) {
  const h = hash || '#/';
  let m = h.match(/^#\/case\/([A-Za-z0-9]{16})$/);
  if (m) return { view: 'detail', cnr: m[1].toUpperCase() };
  if (/^#\/cases\/?$/.test(h)) return { view: 'browse' };
  if (/^#\/dashboard\/?$/.test(h)) return { view: 'dashboard' };
  if (/^#\/?$/.test(h)) return { view: 'home' };
  return { view: 'notfound' };
}

function updateNavActiveState(view) {
  navWordmark.classList.toggle('active', view === 'home');
  navCasesLink.classList.toggle('active', view === 'browse');
  navDashboardLink.classList.toggle('active', view === 'dashboard');
}

let isInitialRoute = true;
async function router() {
  const route = parseRoute(window.location.hash);
  updateNavActiveState(route.view);

  const swapSkeleton = () => {
    if (route.view === 'home') viewRoot.innerHTML = homeSkeletonHtml();
    else if (route.view === 'browse') viewRoot.innerHTML = browseSkeletonHtml();
    else if (route.view === 'detail') viewRoot.innerHTML = detailSkeletonHtml();
    else if (route.view === 'dashboard') viewRoot.innerHTML = dashboardSkeletonHtml();
    else viewRoot.innerHTML = notFoundHtml();
  };

  // Skip the transition on the very first render (nothing meaningful to crossfade
  // from on a cold load) — every subsequent route change still gets one.
  if (!isInitialRoute && document.startViewTransition) {
    const transition = document.startViewTransition(swapSkeleton);
    transition.finished.catch(() => {}); // transitions can be legitimately skipped/aborted
    await transition.updateCallbackDone; // wait for swapSkeleton to actually run before continuing
  } else {
    swapSkeleton();
  }
  isInitialRoute = false;

  if (route.view === 'home') await loadHome();
  else if (route.view === 'browse') await loadBrowse();
  else if (route.view === 'detail') await loadDetail(route.cnr);
  else if (route.view === 'dashboard') await loadDashboard();
}

// --- event delegation (view-root content is replaced on every route change,
// so listeners live on the stable parent instead of being re-bound each time) ---

viewRoot.addEventListener('submit', (event) => {
  if (event.target.id !== 'search-form') return;
  event.preventDefault();

  const input = document.getElementById('cnr-input');
  const errorEl = document.getElementById('search-error');
  const cnr = input.value.trim().toUpperCase();

  if (!CNR_PATTERN.test(cnr)) {
    errorEl.textContent = 'CNR must be exactly 16 alphanumeric characters.';
    errorEl.hidden = false;
    return;
  }
  errorEl.hidden = true;
  window.location.hash = `#/case/${cnr}`;
});

viewRoot.addEventListener('input', (event) => {
  if (event.target.id !== 'cnr-input') return;
  event.target.value = event.target.value.toUpperCase();
  const counter = document.getElementById('cnr-counter');
  if (counter) counter.textContent = `${event.target.value.length}/16`;
});

viewRoot.addEventListener('click', (event) => {
  const card = event.target.closest('[data-cnr]');
  if (!card) return;
  window.location.hash = `#/case/${card.dataset.cnr}`;
});

window.addEventListener('hashchange', router);
router();
