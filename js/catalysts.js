// Pharma Pipeline — catalysts table (v2)

const fmt = (n) => n.toLocaleString('en-US');
const TODAY = new Date().toISOString().slice(0, 10);

function esc(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

function milestoneBadge(m) {
  if (!m) return '';
  const cls = `ms-${m.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  return `<span class="ms-badge ${cls}">${esc(m)}</span>`;
}

function dateDisplay(iso, precision, past) {
  if (!iso) return '<span class="status">—</span>';
  let label = iso;
  if (precision === 'year' && /^\d{4}$/.test(iso)) label = iso;
  else if (precision === 'half') label = iso;            // already like "2026-H2"
  else if (precision === 'quarter') label = iso;         // e.g. "2026-Q3"
  const badge = past ? ' <span class="past-tag">PAST</span>' : '';
  return `<span class="cat-date">${esc(label)}</span>${badge}`;
}

function tickerLink(slug, ticker) {
  return `<a class="ticker-link" href="company.html?ticker=${encodeURIComponent(slug)}">${esc(ticker || slug.toUpperCase())}</a>`;
}

function sourceLink(url) {
  if (!url) return '';
  return `<a href="${esc(url)}" target="_blank" rel="noopener" title="8-K exhibit">8-K</a>`;
}

let table;
let allRows = [];
let activeFilters = {
  q: '',
  window: 'future',
  milestones: new Set(),
  phases: new Set(),
  kinds: new Set(),
};

function inWindow(iso, win) {
  if (win === 'all') return true;
  if (!iso) return win === 'all';
  if (win === 'past') return iso < TODAY;
  if (win === 'future') return iso >= TODAY;
  const months = parseInt(win, 10);
  if (Number.isNaN(months)) return true;
  if (iso < TODAY) return false;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() + months);
  return iso <= cutoff.toISOString().slice(0, 10);
}

function phaseBucket(p) {
  const s = String(p || '').toUpperCase();
  if (/PHASE\s*3|^P3|PIVOTAL|REGISTRATIONAL/.test(s)) return 'P3';
  if (/PHASE\s*2|^P2/.test(s)) return 'P2';
  if (/PHASE\s*1|^P1/.test(s)) return 'P1';
  if (/NDA|BLA|MAA|PDUFA|APPROV|FILED/.test(s)) return 'Regulatory';
  return 'Other';
}

function applyFilters() {
  const q = activeFilters.q.trim().toLowerCase();
  const filtered = allRows.filter(r => {
    if (!inWindow(r.anticipated_date_iso, activeFilters.window)) return false;
    if (activeFilters.milestones.size && !activeFilters.milestones.has(r.milestone_type || 'other')) return false;
    if (activeFilters.phases.size && !activeFilters.phases.has(phaseBucket(r.phase))) return false;
    if (activeFilters.kinds.size && !activeFilters.kinds.has(r.kind)) return false;
    if (q) {
      const hay = [r.ticker, r.issuer, r.asset, r.indication, r.milestone_type, r.phase]
        .join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  table.replaceData(filtered);
  document.getElementById('result-count').textContent =
    `${fmt(filtered.length)} of ${fmt(allRows.length)} catalysts`;
}

function buildCheckboxFacet(container, counts, store) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  container.innerHTML = sorted.map(([v, c]) =>
    `<label><input type="checkbox" data-value="${esc(v)}"> ${esc(v)} <span class="count">${c}</span></label>`
  ).join('');
  container.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', () => {
      const v = inp.dataset.value;
      if (inp.checked) store.add(v); else store.delete(v);
      applyFilters();
    });
  });
}

async function init() {
  const res = await fetch('data/catalysts_index.json');
  const data = await res.json();
  allRows = data.rows;

  document.getElementById('stat-companies').textContent = fmt(data.totals.companies);
  document.getElementById('stat-rows').textContent = fmt(data.totals.rows);
  document.getElementById('stat-future').textContent = fmt(data.totals.future);
  document.getElementById('stat-past').textContent = fmt(data.totals.past);
  document.getElementById('stat-undated').textContent = fmt(data.totals.undated);
  document.getElementById('snapshot-date').textContent = data.snapshot_date;

  // Build milestone facet from the data itself
  const milestoneCounts = {};
  const phaseCounts = {};
  for (const r of allRows) {
    const mt = r.milestone_type || 'other';
    milestoneCounts[mt] = (milestoneCounts[mt] || 0) + 1;
    const pb = phaseBucket(r.phase);
    phaseCounts[pb] = (phaseCounts[pb] || 0) + 1;
  }
  buildCheckboxFacet(document.getElementById('f-milestone-list'), milestoneCounts, activeFilters.milestones);
  buildCheckboxFacet(document.getElementById('f-phase-list'), phaseCounts, activeFilters.phases);

  document.querySelectorAll('.f-kind').forEach(inp => {
    inp.addEventListener('change', () => {
      if (inp.checked) activeFilters.kinds.add(inp.value);
      else activeFilters.kinds.delete(inp.value);
      applyFilters();
    });
  });
  document.getElementById('f-window').addEventListener('change', (e) => {
    activeFilters.window = e.target.value;
    applyFilters();
  });
  document.getElementById('q').addEventListener('input', (e) => {
    activeFilters.q = e.target.value;
    applyFilters();
  });
  document.getElementById('reset-btn').addEventListener('click', () => {
    activeFilters = { q: '', window: 'future', milestones: new Set(), phases: new Set(), kinds: new Set() };
    document.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = false);
    document.getElementById('q').value = '';
    document.getElementById('f-window').value = 'future';
    applyFilters();
  });

  table = new Tabulator('#grid', {
    data: allRows,
    layout: 'fitColumns',
    pagination: true,
    paginationSize: 50,
    paginationSizeSelector: [25, 50, 100, 200],
    height: '70vh',
    initialSort: [
      { column: 'anticipated_date_iso', dir: 'asc' },
      { column: 'ticker', dir: 'asc' },
    ],
    columns: [
      {
        title: 'Date', field: 'anticipated_date_iso', width: 130, headerSort: true,
        formatter: (cell) => {
          const r = cell.getRow().getData();
          const iso = cell.getValue();
          const past = iso && iso < TODAY;
          return dateDisplay(iso, r.date_precision, past);
        },
      },
      {
        title: 'Ticker', field: 'ticker', width: 90, headerSort: true,
        formatter: (cell) => tickerLink(cell.getRow().getData().slug, cell.getValue()),
      },
      { title: 'Asset', field: 'asset', minWidth: 160, headerSort: true,
        formatter: (cell) => `<span class="cat-asset">${esc(cell.getValue() || '')}</span>` },
      { title: 'Indication', field: 'indication', minWidth: 200, headerSort: true,
        formatter: (cell) => esc(cell.getValue() || '') },
      {
        title: 'Phase', field: 'phase', width: 110, headerSort: true,
        formatter: (cell) => {
          const p = cell.getValue() || '';
          const cls = phaseClass(p);
          return `<span class="pill ${cls}">${esc(p || '—')}</span>`;
        },
      },
      {
        title: 'Milestone', field: 'milestone_type', width: 130, headerSort: true,
        formatter: (cell) => milestoneBadge(cell.getValue() || ''),
      },
      {
        title: 'Src', field: 'source_url', width: 60, headerSort: false, hozAlign: 'center',
        formatter: (cell) => sourceLink(cell.getValue()),
      },
    ],
  });

  table.on('tableBuilt', () => applyFilters());
}

init().catch(err => {
  document.getElementById('grid').innerHTML =
    `<div class="no-pipeline">Failed to load catalysts: ${err.message}</div>`;
});
