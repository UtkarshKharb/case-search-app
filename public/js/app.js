const APP_NAME = 'Causa Analytica';
const HOME_PREVIEW_COUNT = 6;
const CNR_PATTERN = /^[A-Za-z0-9]{16}$/;
const THEME_KEY = 'causa-analytica-theme';

const viewRoot = document.getElementById('view-root');
const navWordmark = document.getElementById('nav-wordmark');
const navCasesLink = document.getElementById('nav-cases-link');
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
  return `<ol class="timeline">${hearings
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
            ${h.summary ? `<p>${escapeHtml(h.summary)}</p>` : ''}
            ${h.order_text ? `<details><summary>Full order text</summary><pre>${escapeHtml(h.order_text)}</pre></details>` : ''}
          </div>
        </li>`;
    })
    .join('')}</ol>`;
}

function buildCaseDetailHtml({ matter, advocates, hearings }) {
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

    <div class="hearings-section">
      <h3>Hearings (${hearings.length})</h3>
      ${renderHearings(hearings)}
    </div>
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
      <p class="hint">A preview of the sampled dataset — see the full list under "All Cases".</p>
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
  if (/^#\/?$/.test(h)) return { view: 'home' };
  return { view: 'notfound' };
}

function updateNavActiveState(view) {
  navWordmark.classList.toggle('active', view === 'home');
  navCasesLink.classList.toggle('active', view === 'browse');
}

let isInitialRoute = true;
async function router() {
  const route = parseRoute(window.location.hash);
  updateNavActiveState(route.view);

  const swapSkeleton = () => {
    if (route.view === 'home') viewRoot.innerHTML = homeSkeletonHtml();
    else if (route.view === 'browse') viewRoot.innerHTML = browseSkeletonHtml();
    else if (route.view === 'detail') viewRoot.innerHTML = detailSkeletonHtml();
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
