// Pharma Pipeline — overview page

const fmt = (n) => n.toLocaleString('en-US');

function pill(value, klass) {
  if (!value) return '<span class="pill p0">0</span>';
  return `<span class="pill ${klass}">${value}</span>`;
}

function areasHtml(areas) {
  if (!areas || !areas.length) return '<span class="pill muted">—</span>';
  return areas.map(a => `<span class="area-tag">${a}</span>`).join('');
}

function tickerLink(slug, ticker) {
  return `<a class="ticker-link" href="company.html?ticker=${encodeURIComponent(slug)}">${ticker || slug.toUpperCase()}</a>`;
}

let table;
let rows = [];
let activeFilters = {
  q: '',
  kinds: new Set(),
  hasPipeline: true,   // default ON: hide the 625 companies with no active pipeline
  phase: '',
  exchanges: new Set(),
  areas: new Set(),
};

function applyFilters() {
  const q = activeFilters.q.trim().toLowerCase();
  const filtered = rows.filter(r => {
    if (activeFilters.kinds.size && !activeFilters.kinds.has(r.kind)) return false;
    if (activeFilters.hasPipeline && !r.has_pipeline) return false;
    if (activeFilters.phase === 'p3' && r.p3 < 1) return false;
    if (activeFilters.phase === 'p2' && r.p2 < 1) return false;
    if (activeFilters.phase === 'p1' && r.p1 < 1) return false;
    if (activeFilters.exchanges.size && !activeFilters.exchanges.has(r.exchange || '—')) return false;
    if (activeFilters.areas.size) {
      const ok = r.areas && r.areas.some(a => activeFilters.areas.has(a));
      if (!ok) return false;
    }
    if (q) {
      const hay = [
        r.ticker, r.issuer, r.exchange, r.region,
        (r.areas || []).join(' '),
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  table.replaceData(filtered);
  document.getElementById('result-count').textContent =
    `${fmt(filtered.length)} of ${fmt(rows.length)} companies`;
}

function buildFacet(rowsForFacet, key, container, store) {
  const counts = {};
  for (const r of rowsForFacet) {
    const v = r[key] || '—';
    counts[v] = (counts[v] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  container.innerHTML = sorted.map(([v, c]) =>
    `<label><input type="checkbox" data-value="${v.replace(/"/g, '&quot;')}"> ${v} <span class="count">${c}</span></label>`
  ).join('');
  container.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', () => {
      const v = inp.dataset.value;
      if (inp.checked) store.add(v); else store.delete(v);
      applyFilters();
    });
  });
}

function buildAreaFacet(rowsForFacet, container, store) {
  const counts = {};
  for (const r of rowsForFacet) {
    for (const a of (r.areas || [])) counts[a] = (counts[a] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  container.innerHTML = sorted.map(([v, c]) =>
    `<label><input type="checkbox" data-value="${v.replace(/"/g, '&quot;')}"> ${v} <span class="count">${c}</span></label>`
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
  const res = await fetch('data/index.json');
  const data = await res.json();
  rows = data.rows;

  // Hero stats
  document.getElementById('stat-companies').textContent = fmt(data.totals.companies);
  document.getElementById('stat-with-pipeline').textContent = fmt(data.totals.with_pipeline);
  document.getElementById('stat-assets').textContent = fmt(data.totals.assets);
  document.getElementById('stat-p3').textContent = fmt(data.totals.p3);
  document.getElementById('stat-p2').textContent = fmt(data.totals.p2);
  document.getElementById('stat-p1').textContent = fmt(data.totals.p1);
  document.getElementById('snapshot-date').textContent = data.snapshot_date;

  // Bucket counts
  const kindCounts = { core_biopharma: 0, adjacent: 0 };
  for (const r of rows) kindCounts[r.kind] = (kindCounts[r.kind] || 0) + 1;
  document.getElementById('cnt-kind-core_biopharma').textContent = fmt(kindCounts.core_biopharma);
  document.getElementById('cnt-kind-adjacent').textContent = fmt(kindCounts.adjacent);

  // Build facets
  buildFacet(rows, 'exchange', document.getElementById('f-exchange-list'), activeFilters.exchanges);
  buildAreaFacet(rows, document.getElementById('f-area-list'), activeFilters.areas);

  // Bucket checkbox handlers
  document.querySelectorAll('.f-kind').forEach(inp => {
    inp.addEventListener('change', () => {
      if (inp.checked) activeFilters.kinds.add(inp.value);
      else activeFilters.kinds.delete(inp.value);
      applyFilters();
    });
  });

  document.getElementById('f-has-pipeline').addEventListener('change', (e) => {
    activeFilters.hasPipeline = e.target.checked;
    applyFilters();
  });
  document.getElementById('f-phase').addEventListener('change', (e) => {
    activeFilters.phase = e.target.value;
    applyFilters();
  });
  document.getElementById('q').addEventListener('input', (e) => {
    activeFilters.q = e.target.value;
    applyFilters();
  });
  document.getElementById('reset-btn').addEventListener('click', () => {
    activeFilters = { q: '', kinds: new Set(), hasPipeline: true, phase: '', exchanges: new Set(), areas: new Set() };
    document.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = false);
    document.getElementById('f-has-pipeline').checked = true;
    document.getElementById('q').value = '';
    document.getElementById('f-phase').value = '';
    applyFilters();
  });

  // Build the main table
  table = new Tabulator('#grid', {
    data: rows,
    layout: 'fitColumns',
    pagination: true,
    paginationSize: 50,
    paginationSizeSelector: [25, 50, 100, 200],
    height: '70vh',
    rowClick: (e, row) => {
      // Ignore clicks that landed on a real <a> (so the existing ticker
      // link / sources link / etc. behave normally — including middle/cmd-click).
      if (e.target.closest('a')) return;
      const slug = row.getData().slug;
      // Cmd / Ctrl / middle-click → open in new tab
      if (e.metaKey || e.ctrlKey) {
        window.open(`company.html?ticker=${encodeURIComponent(slug)}`, '_blank');
      } else {
        location.href = `company.html?ticker=${encodeURIComponent(slug)}`;
      }
    },
    initialSort: [
      { column: 'p3', dir: 'desc' },
      { column: 'p2', dir: 'desc' },
      { column: 'ticker', dir: 'asc' },
    ],
    columns: [
      {
        title: 'Ticker', field: 'ticker', width: 100, headerSort: true,
        formatter: (cell) => tickerLink(cell.getRow().getData().slug, cell.getValue()),
      },
      { title: 'Issuer', field: 'issuer', minWidth: 220, headerSort: true },
      { title: 'Exch', field: 'exchange', width: 90, headerSort: true },
      { title: 'Region', field: 'region', width: 80, headerSort: true },
      {
        title: 'Bucket', field: 'kind', width: 110, headerSort: true,
        formatter: (cell) => cell.getValue() === 'core_biopharma'
          ? '<span class="pill" style="background:var(--navy-700);color:#fff">Bio</span>'
          : '<span class="pill muted">Adjacent</span>',
      },
      {
        title: 'Areas', field: 'areas', minWidth: 220, headerSort: false,
        formatter: (cell) => areasHtml(cell.getValue()),
      },
      {
        title: 'Assets', field: 'assets', width: 80, hozAlign: 'right', headerSort: true,
        formatter: (cell) => `<span class="mono">${cell.getValue()}</span>`,
      },
      {
        title: 'P3', field: 'p3', width: 70, hozAlign: 'right', headerSort: true,
        formatter: (cell) => pill(cell.getValue(), 'p3'),
      },
      {
        title: 'P2', field: 'p2', width: 70, hozAlign: 'right', headerSort: true,
        formatter: (cell) => pill(cell.getValue(), 'p2'),
      },
      {
        title: 'P1', field: 'p1', width: 70, hozAlign: 'right', headerSort: true,
        formatter: (cell) => pill(cell.getValue(), 'p1'),
      },
    ],
  });

  // Apply the default filter (hasPipeline=true) once the table is built.
  table.on('tableBuilt', () => applyFilters());
}

init().catch(err => {
  document.getElementById('grid').innerHTML =
    `<div class="no-pipeline">Failed to load data: ${err.message}</div>`;
});
