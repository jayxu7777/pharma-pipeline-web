// Pharma Pipeline — catalysts (v3: monthly aggregate)

const fmt = (n) => n.toLocaleString('en-US');
const TODAY = new Date().toISOString().slice(0, 10);
const TODAY_MONTH = TODAY.slice(0, 7);
const TOP_N_PER_MONTH = 10;

function esc(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Milestone normalization ---------------------------------------------
// Map the raw long-tail of milestone_type strings into a small bucket set.
const MS_RESULT  = new Set(['topline', 'interim', 'data_update', 'presentation']);
const MS_REG     = new Set(['PDUFA', 'approval', 'BLA', 'NDA', 'MAA', 'sNDA',
                            'CHMP_opinion', 'CHMP_recommendation', 'submission',
                            '510k_clearance', '510(k) clearance', '510(k)',
                            'fast_track', 'fast_track_designation',
                            'orphan_drug_designation', 'breakthrough',
                            'breakthrough designation', 'breakthrough_device_designation',
                            'designation', 'NDA submission', 'NDA acceptance',
                            'NDA/MAA submission', 'MAA/BLA', 'sBLA',
                            'submission_accepted', 'approval_pathway']);
const MS_PROGRESS = new Set(['initiation', 'IND', 'IND/CTA', 'IND_submission',
                             'IND_clearance', 'IND/FIH', 'FPI', 'LPI',
                             'enrollment_complete', 'enrollment', 'enrollment_update',
                             'enrollment_initiation', 'enrollment_50pct',
                             'initiation_planned', 'initiation/FPI']);

function msBucket(mt) {
  if (!mt) return 'other';
  if (MS_RESULT.has(mt)) return 'result';
  if (MS_REG.has(mt)) return 'regulatory';
  if (MS_PROGRESS.has(mt)) return 'progress';
  const s = mt.toLowerCase();
  if (/topline|interim|data\s*update|read.?out|presentation|poster/.test(s)) return 'result';
  if (/pdufa|approval|bla|\bnda\b|\bmaa\b|chmp|510\(?k\)?|fast.?track|orphan|breakthrough|designation|submission|filed|filing/.test(s)) return 'regulatory';
  if (/initiation|enrollment|\bind\b|\bfpi\b|\blpi\b|dosing|first.?patient/.test(s)) return 'progress';
  return 'other';
}

// Priority for sorting within a month (higher = more important)
const MS_PRIORITY = {
  'PDUFA': 100, 'approval': 95, 'BLA': 80, 'NDA': 80, 'MAA': 75, 'sNDA': 75,
  'topline': 90, 'interim': 85, 'data_update': 70, 'presentation': 60,
  'CHMP_opinion': 78, 'submission': 55, '510k_clearance': 70,
};
function msPriority(mt) {
  if (!mt) return 0;
  if (MS_PRIORITY[mt] != null) return MS_PRIORITY[mt];
  const b = msBucket(mt);
  if (b === 'regulatory') return 50;
  if (b === 'result') return 65;
  if (b === 'progress') return 20;
  return 10;
}

// Short label for crowded badges (e.g. raw freetext milestone_type)
function msLabel(mt) {
  if (!mt) return 'other';
  if (mt.length <= 22) return mt;
  return mt.slice(0, 20) + '…';
}

// --- Phase pill ----------------------------------------------------------
function phaseClass(p) {
  if (!p) return 'p0';
  const s = String(p).toUpperCase();
  if (/PHASE\s*3|PHASE\s*III|^P3|NDA|BLA|MAA|PIVOTAL|REGISTRATIONAL|APPROVED|PDUFA/.test(s)) return 'p3';
  if (/PHASE\s*2\/3|PHASE\s*II\/III|2B\/3/.test(s)) return 'p3';
  if (/PHASE\s*2|PHASE\s*II|^P2/.test(s)) return 'p2';
  if (/PHASE\s*1\/2|PHASE\s*I\/II/.test(s)) return 'p2';
  if (/PHASE\s*1|PHASE\s*I|^P1/.test(s)) return 'p1';
  return 'p0';
}

// --- Date display --------------------------------------------------------
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m,10)-1]} ${y}`;
}

function dateCell(r) {
  const iso = r.anticipated_date_iso;
  if (!iso) return '<span class="status">—</span>';
  const past = iso < TODAY;
  return `<span class="cat-date${past ? ' past' : ''}">${esc(iso)}</span>`;
}

// --- Window filter -------------------------------------------------------
function inWindow(iso, win) {
  if (win === 'all') return true;
  if (!iso) return false; // monthly view: undated rows skipped unless 'all'
  if (win === 'past') return iso < TODAY;
  if (win === 'future') return iso >= TODAY;
  const months = parseInt(win, 10);
  if (Number.isNaN(months)) return true;
  if (iso < TODAY) return false;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() + months);
  return iso <= cutoff.toISOString().slice(0, 10);
}

// --- State ---------------------------------------------------------------
let allRows = [];
let state = {
  window: 'future',
  preset: 'readouts',  // readouts | regulatory | all
  kind: '',
  q: '',
  expanded: new Set(), // months whose extra rows are revealed
};

function isTrialReadout(mt) {
  if (!mt) return false;
  if (MS_RESULT.has(mt)) return true;
  const s = mt.toLowerCase();
  return /topline|top-?line|read.?out|interim|data\s*update|data_update|presentation|poster/.test(s);
}

function presetAllows(mt) {
  if (state.preset === 'all') return true;
  if (state.preset === 'readouts') return isTrialReadout(mt);
  if (state.preset === 'regulatory') return msBucket(mt) === 'regulatory';
  return true;
}

function applyFilters() {
  const q = state.q.trim().toLowerCase();
  return allRows.filter(r => {
    if (!inWindow(r.anticipated_date_iso, state.window)) return false;
    if (!presetAllows(r.milestone_type)) return false;
    if (state.kind && r.kind !== state.kind) return false;
    if (q) {
      const hay = [r.ticker, r.issuer, r.asset, r.indication, r.milestone_type, r.phase]
        .join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// --- Render --------------------------------------------------------------
function rowHTML(r) {
  const past = r.anticipated_date_iso && r.anticipated_date_iso < TODAY;
  const bucket = msBucket(r.milestone_type);
  const tickerHref = `company.html?ticker=${encodeURIComponent(r.slug)}`;
  const src = r.source_url
    ? `<a class="src-link" href="${esc(r.source_url)}" target="_blank" rel="noopener" title="8-K Ex-99.1">8-K</a>`
    : '';
  return `<tr class="cat-row${past ? ' past-row' : ''}">
    <td class="c-date">${dateCell(r)}</td>
    <td class="c-ticker"><a class="ticker-link" href="${tickerHref}">${esc(r.ticker || r.slug.toUpperCase())}</a></td>
    <td class="c-asset">${esc(r.asset || '')}</td>
    <td class="c-indic">${esc(r.indication || '')}</td>
    <td class="c-phase"><span class="pill ${phaseClass(r.phase)}">${esc(r.phase || '—')}</span></td>
    <td class="c-ms"><span class="ms-badge ms-${bucket}" title="${esc(r.milestone_type || '')}">${esc(msLabel(r.milestone_type || 'other'))}</span></td>
    <td class="c-src">${src}</td>
  </tr>`;
}

function monthCardHTML(ym, rows) {
  // Aggregate counts
  const counts = { result: 0, regulatory: 0, progress: 0, other: 0 };
  for (const r of rows) counts[msBucket(r.milestone_type)] += 1;

  // Sort rows: priority desc, then date asc, then ticker
  rows.sort((a, b) => {
    const pd = msPriority(b.milestone_type) - msPriority(a.milestone_type);
    if (pd !== 0) return pd;
    if (a.anticipated_date_iso !== b.anticipated_date_iso) {
      return (a.anticipated_date_iso || '') < (b.anticipated_date_iso || '') ? -1 : 1;
    }
    return (a.ticker || '').localeCompare(b.ticker || '');
  });

  const expanded = state.expanded.has(ym);
  const top = expanded ? rows : rows.slice(0, TOP_N_PER_MONTH);
  const hidden = rows.length - top.length;

  const isPastMonth = ym < TODAY_MONTH;
  const isCurrent = ym === TODAY_MONTH;

  const summary = [
    counts.result    ? `<span class="ms-badge ms-result">${counts.result} result</span>` : '',
    counts.regulatory? `<span class="ms-badge ms-regulatory">${counts.regulatory} regulatory</span>` : '',
    counts.progress  ? `<span class="ms-badge ms-progress">${counts.progress} progress</span>` : '',
    counts.other     ? `<span class="ms-badge ms-other">${counts.other} other</span>` : '',
  ].filter(Boolean).join(' ');

  const expander = hidden > 0
    ? `<button class="expand-btn" data-month="${esc(ym)}">Show ${hidden} more →</button>`
    : (expanded && rows.length > TOP_N_PER_MONTH
        ? `<button class="expand-btn" data-month="${esc(ym)}">Collapse</button>`
        : '');

  return `<section class="month-card${isPastMonth ? ' past' : ''}${isCurrent ? ' current' : ''}">
    <header class="month-head">
      <div class="month-title">
        <h2>${esc(monthLabel(ym))}</h2>
        <span class="month-count">${rows.length} catalyst${rows.length === 1 ? '' : 's'}</span>
      </div>
      <div class="month-summary">${summary}</div>
    </header>
    <table class="cat-table">
      <thead><tr>
        <th class="c-date">Date</th>
        <th class="c-ticker">Ticker</th>
        <th class="c-asset">Asset</th>
        <th class="c-indic">Indication</th>
        <th class="c-phase">Phase</th>
        <th class="c-ms">Milestone</th>
        <th class="c-src">Src</th>
      </tr></thead>
      <tbody>${top.map(rowHTML).join('')}</tbody>
    </table>
    ${expander}
  </section>`;
}

function render() {
  const filtered = applyFilters();

  // Group by YYYY-MM
  const byMonth = new Map();
  for (const r of filtered) {
    const ym = (r.anticipated_date_iso || '').slice(0, 7);
    if (!ym) continue;
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym).push(r);
  }

  // Sort months: for window=past show desc, otherwise asc
  const months = [...byMonth.keys()].sort();
  if (state.window === 'past') months.reverse();

  // Stats
  let nResult = 0, nReg = 0;
  for (const r of filtered) {
    if (isTrialReadout(r.milestone_type)) nResult++;
    else if (msBucket(r.milestone_type) === 'regulatory') nReg++;
  }
  const companies = new Set(filtered.map(r => r.slug)).size;
  document.getElementById('stat-companies').textContent = fmt(companies);
  document.getElementById('stat-shown').textContent = fmt(filtered.length);
  document.getElementById('stat-months').textContent = fmt(months.length);
  document.getElementById('stat-results').textContent = fmt(nResult);
  document.getElementById('stat-reg').textContent = fmt(nReg);

  const wrap = document.getElementById('months');
  if (months.length === 0) {
    wrap.innerHTML = `<div class="no-pipeline">No catalysts match the current filters.</div>`;
    return;
  }
  wrap.innerHTML = months.map(ym => monthCardHTML(ym, byMonth.get(ym))).join('');

  // Wire expand buttons
  wrap.querySelectorAll('.expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.month;
      if (state.expanded.has(m)) state.expanded.delete(m);
      else state.expanded.add(m);
      render();
    });
  });
}

// --- Init ----------------------------------------------------------------
async function init() {
  let data;
  try {
    const res = await fetch('data/catalysts_index.json');
    data = await res.json();
  } catch (err) {
    document.getElementById('months').innerHTML =
      `<div class="no-pipeline">Failed to load catalysts: ${esc(err.message)}</div>`;
    return;
  }
  allRows = data.rows || [];
  document.getElementById('snapshot-date').textContent = data.snapshot_date || '—';

  document.getElementById('f-window').addEventListener('change', (e) => {
    state.window = e.target.value;
    state.expanded.clear();
    render();
  });
  document.getElementById('f-preset').addEventListener('change', (e) => {
    state.preset = e.target.value;
    state.expanded.clear();
    render();
  });
  document.getElementById('f-kind').addEventListener('change', (e) => {
    state.kind = e.target.value;
    state.expanded.clear();
    render();
  });
  document.getElementById('q').addEventListener('input', (e) => {
    state.q = e.target.value;
    render();
  });
  document.getElementById('reset-btn').addEventListener('click', () => {
    state = { window: 'future', preset: 'readouts', kind: '', q: '', expanded: new Set() };
    document.getElementById('f-window').value = 'future';
    document.getElementById('f-preset').value = 'readouts';
    document.getElementById('f-kind').value = '';
    document.getElementById('q').value = '';
    render();
  });

  render();
}

init();
