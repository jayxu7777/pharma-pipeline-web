// Pharma Pipeline — company detail page (md-flat-table style)

const params = new URLSearchParams(location.search);
const slug = (params.get('ticker') || '').toLowerCase().trim();

function esc(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function phaseClass(p) {
  if (!p) return 'p0';
  const s = String(p).toUpperCase();
  if (/PHASE\s*3|PHASE\s*III|^P3|NDA|BLA|MAA|PIVOTAL|REGISTRATIONAL|APPROVED/.test(s)) return 'p3';
  if (/PHASE\s*2\/3|PHASE\s*II\/III|2B\/3/.test(s)) return 'p3';
  if (/PHASE\s*2|PHASE\s*II|^P2/.test(s)) return 'p2';
  if (/PHASE\s*1\/2|PHASE\s*I\/II/.test(s)) return 'p2';
  if (/PHASE\s*1|PHASE\s*I|^P1/.test(s)) return 'p1';
  return 'p0';
}

function normalizePhaseBucket(p) {
  // Mirror build_web.py normalization for header-line counts.
  if (!p) return '';
  const s = String(p).toUpperCase();
  if (/PHASE\s*3|PHASE\s*III|^P3|NDA|BLA|MAA|PIVOTAL|REGISTRATIONAL|APPROVED|FILED/.test(s)) return 'P3';
  if (/PHASE\s*2\/3|PHASE\s*II\/III|2B\/3/.test(s)) return 'P3';
  if (/PHASE\s*2|PHASE\s*II|^P2/.test(s)) return 'P2';
  if (/PHASE\s*1\/2|PHASE\s*I\/II/.test(s)) return 'P2';
  if (/PHASE\s*1|PHASE\s*I|^P1/.test(s)) return 'P1';
  return '';
}

function countPhases(pipeline) {
  let assets = 0, p1 = 0, p2 = 0, p3 = 0;
  for (const a of (pipeline || [])) {
    let active = false;
    for (const ind of (a.indications || [])) {
      const ph = normalizePhaseBucket(ind.highest_phase);
      if (ph === 'P3') { p3++; active = true; }
      else if (ph === 'P2') { p2++; active = true; }
      else if (ph === 'P1') { p1++; active = true; }
    }
    if (active) assets++;
  }
  return { assets, p3, p2, p1 };
}

function nctCell(nct) {
  if (nct == null || nct === '') return '<span class="status">—</span>';
  if (Array.isArray(nct)) {
    if (!nct.length) return '<span class="status">No NCT</span>';
    return nct.map(id =>
      `<a class="nct" href="https://clinicaltrials.gov/study/${esc(id)}" target="_blank" rel="noopener">${esc(id)}</a>`
    ).join('<br>');
  }
  // string fallback (e.g. "Not on public registry")
  return `<span class="status">${esc(nct)}</span>`;
}

function sourceLinks(sources) {
  if (!sources) return '';
  const out = [];
  for (const [k, v] of Object.entries(sources)) {
    if (!v) continue;
    if (typeof v !== 'object') continue;
    if (v.error) {
      out.push(`<span title="${esc(v.error)}">${esc(k)}: <em style="color:var(--warn)">unavailable</em></span>`);
    } else {
      const url = v.primary_url || v.pipeline_page || v.filing_url || v.url || null;
      if (url) {
        out.push(`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(k)}</a>`);
      } else {
        out.push(`<span>${esc(k)}</span>`);
      }
    }
  }
  return out.join(' · ');
}

function renderPipelineFlat(pipeline) {
  // md-style flat table: Asset | Target | Indication | Highest phase | Key NCT | Status
  // Asset and Target use rowspan for multi-indication assets.
  if (!pipeline || !pipeline.length) return '';

  let html = `<table class="pipeline">
    <thead>
      <tr>
        <th style="width:18%">Asset</th>
        <th style="width:14%">Target</th>
        <th style="width:28%">Indication</th>
        <th style="width:9%">Highest phase</th>
        <th style="width:14%">Key NCT</th>
        <th style="width:17%">Status</th>
      </tr>
    </thead>
    <tbody>`;

  for (const asset of pipeline) {
    const inds = asset.indications || [];
    const akaTxt = (asset.aka && asset.aka.length) ? ` <span class="aka">(${asset.aka.map(esc).join(', ')})</span>` : '';
    const modalityLine = asset.modality
      ? `<div class="modality">${esc(asset.modality)}${asset.license_origin ? ' · ' + esc(asset.license_origin) : ''}</div>`
      : '';

    if (!inds.length) {
      html += `<tr class="asset-flat">
        <td><strong>${esc(asset.asset || 'Unnamed')}</strong>${akaTxt}${modalityLine}</td>
        <td>${esc(asset.target || '')}</td>
        <td colspan="4" class="status">No indications listed</td>
      </tr>`;
      continue;
    }

    const span = inds.length;
    inds.forEach((ind, i) => {
      html += `<tr class="asset-flat">`;
      if (i === 0) {
        html += `<td rowspan="${span}"><strong>${esc(asset.asset || 'Unnamed')}</strong>${akaTxt}${modalityLine}</td>`;
        html += `<td rowspan="${span}">${esc(asset.target || '')}</td>`;
      }
      const ph = ind.highest_phase || '';
      const cls = phaseClass(ph);
      const milestones = (ind.key_milestones && ind.key_milestones.length)
        ? `<details class="ms"><summary>milestones (${ind.key_milestones.length})</summary><ul class="milestones">${ind.key_milestones.map(m => `<li>${esc(m)}</li>`).join('')}</ul></details>`
        : '';
      const trialName = ind.trial_name ? `<div class="trial-name">${esc(ind.trial_name)}</div>` : '';
      html += `<td>${esc(ind.indication || '')}${trialName}${milestones}</td>
        <td><span class="pill ${cls}">${esc(ph || '—')}</span></td>
        <td>${nctCell(ind.nct_ids)}</td>
        <td><span class="status">${esc(ind.trial_status || '')}</span></td>
      </tr>`;
    });
  }
  html += '</tbody></table>';
  return html;
}

function commercialOneLiner(cp) {
  if (!cp) return '';
  const lines = cp.lines || cp.products || [];
  if (!lines.length) return '';
  const parts = lines.map(l => {
    const name = l.name || '';
    const ind = l.indication ? ` — ${l.indication}` : '';
    return `${name}${ind}`;
  });
  return `<div class="oneliner"><strong>Commercial:</strong> ${esc(parts.join(' · '))}</div>`;
}

function blockersOneLiner(blockers) {
  if (!blockers || !blockers.length) return '';
  return `<div class="oneliner"><strong>Blockers:</strong> ${esc(blockers.join(' · '))}</div>`;
}

function renderExcluded(items, title) {
  if (!items || !items.length) return '';
  return `<details class="collapsible"><summary>${esc(title)} (${items.length})</summary>
    <ul>${items.map(it => `<li>${esc(typeof it === 'string' ? it : JSON.stringify(it))}</li>`).join('')}</ul>
  </details>`;
}

const TODAY = new Date().toISOString().slice(0, 10);

function milestoneBadge(m) {
  if (!m) return '';
  const cls = `ms-${m.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  return `<span class="ms-badge ${cls}">${esc(m)}</span>`;
}

function renderCatalysts(catalystDoc) {
  if (!catalystDoc) return '';
  const rows = catalystDoc.catalyst_rows || [];
  const sources = catalystDoc.sources_used || [];

  // Sort: future asc, then past desc, then undated
  const annotated = rows.map(r => ({
    ...r,
    _past: r.anticipated_date_iso && r.anticipated_date_iso < TODAY,
    _undated: !r.anticipated_date_iso,
  }));
  annotated.sort((a, b) => {
    if (a._undated !== b._undated) return a._undated ? 1 : -1;
    if (a._past !== b._past) return a._past ? 1 : -1;
    const da = a.anticipated_date_iso || '';
    const db = b.anticipated_date_iso || '';
    if (a._past) return db.localeCompare(da);
    return da.localeCompare(db);
  });

  // Sources block
  let srcHtml = '';
  if (sources.length) {
    const parts = sources.map(s => {
      const label = `${esc(s.form || '')} ${esc(s.filed_date || '')}${s.exhibit ? ' · ' + esc(s.exhibit) : ''}`;
      return s.url
        ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${label}</a>`
        : `<span>${label}</span>`;
    });
    srcHtml = `<div class="cat-sources">Sources: ${parts.join(' · ')}</div>`;
  }

  if (!rows.length) {
    const blockers = (catalystDoc.extractor_notes || {}).blockers || '';
    const note = blockers && blockers !== 'none'
      ? `<p class="narrative"><em>No catalyst rows extracted. ${esc(blockers)}</em></p>`
      : `<p class="narrative"><em>No catalyst rows extracted from latest 8-K filings.</em></p>`;
    return `<div class="section"><h2>Catalysts (from latest 8-K)</h2>${note}${srcHtml}</div>`;
  }

  let html = `<div class="section">
    <h2>Catalysts (from latest 8-K) <span class="muted-count">${rows.length}</span></h2>
    <table class="catalyst-table">
      <thead>
        <tr>
          <th style="width:14%">Date</th>
          <th style="width:22%">Asset</th>
          <th style="width:30%">Indication</th>
          <th style="width:12%">Phase</th>
          <th style="width:12%">Milestone</th>
          <th style="width:10%">Source</th>
        </tr>
      </thead>
      <tbody>`;

  for (const r of annotated) {
    const past = r._past;
    const dateCell = r.anticipated_date_iso
      ? `<span class="cat-date">${esc(r.anticipated_date_iso)}</span>${past ? ' <span class="past-tag">PAST</span>' : ''}`
      : '<span class="status">—</span>';
    const phCls = phaseClass(r.phase);
    const srcLink = r.source_url
      ? `<a href="${esc(r.source_url)}" target="_blank" rel="noopener">8-K</a>`
      : '<span class="status">—</span>';
    const rawTip = r.raw_text ? ` title="${esc(r.raw_text).slice(0, 280)}"` : '';
    html += `<tr class="${past ? 'past-row' : ''}"${rawTip}>
      <td>${dateCell}</td>
      <td><strong>${esc(r.asset || '')}</strong></td>
      <td>${esc(r.indication || '')}</td>
      <td><span class="pill ${phCls}">${esc(r.phase || '—')}</span></td>
      <td>${milestoneBadge(r.milestone_type)}</td>
      <td>${srcLink}</td>
    </tr>`;
  }
  html += `</tbody></table>${srcHtml}</div>`;
  return html;
}

async function fetchCatalysts() {
  try {
    const res = await fetch(`data/catalysts/${slug}.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function init() {
  const root = document.getElementById('root');
  if (!slug) {
    root.innerHTML = '<div class="section"><div class="no-pipeline">Missing ticker parameter. Go back to <a href="index.html">overview</a>.</div></div>';
    return;
  }
  let company;
  try {
    const res = await fetch(`data/companies/${slug}.json`);
    if (!res.ok) throw new Error(res.status);
    company = await res.json();
  } catch (e) {
    root.innerHTML = `<div class="section"><div class="no-pipeline">Company not found: ${esc(slug)}. <a href="index.html">Back to overview</a>.</div></div>`;
    return;
  }
  const catalystDoc = await fetchCatalysts();

  document.title = `${(company.ticker || slug).toUpperCase()} — ${company.issuer_name || ''} · Pharma Pipeline`;

  const counts = countPhases(company.pipeline);
  const pipelineHtml = renderPipelineFlat(company.pipeline);
  const sourcesHtml = sourceLinks(company.sources);

  // Header
  let html = `
    <div class="detail-header">
      <h1>${esc(company.issuer_name || '')}</h1>
      <div class="meta">
        <span class="ticker">${esc((company.ticker || slug).toUpperCase())}</span>
        ${esc(company.exchange || '')} ·
        ${esc(company.region || '')} ·
        snapshot ${esc(company.snapshot_date || '')}
      </div>
      ${sourcesHtml ? `<div class="sources">Sources: ${sourcesHtml}</div>` : ''}
      <div class="counts-line">
        <em>${counts.assets} active asset${counts.assets === 1 ? '' : 's'}
        — ${counts.p3} P3 / ${counts.p2} P2 / ${counts.p1} P1</em>
      </div>
    </div>
  `;

  // Catalysts section (new in v2) — placed above pipeline as it is the most timely info
  const catalystsHtml = renderCatalysts(catalystDoc);
  if (catalystsHtml) html += catalystsHtml;

  // Pipeline body — flat md-style table or italic narrative for empty
  if (pipelineHtml) {
    html += `<div class="section">${pipelineHtml}</div>`;
  } else {
    const reason = company.no_active_clinical_pipeline_reason
      || 'No active P1/P2/P3 pipeline reported.';
    html += `<div class="section"><p class="narrative"><em>${esc(reason)}</em></p></div>`;
  }

  // One-liner extras (commercial / blockers) — md style
  const extras = [
    commercialOneLiner(company.commercial_product),
    blockersOneLiner(company.blockers),
  ].filter(Boolean).join('');
  if (extras) {
    html += `<div class="section extras">${extras}</div>`;
  }

  // Excluded — kept collapsible (not in md but useful for the web)
  const exHtml = [
    renderExcluded(company.excluded_preclinical, 'Excluded — preclinical / IND-pending'),
    renderExcluded(company.excluded_legacy_terminated, 'Excluded — terminated / withdrawn'),
    renderExcluded(company.excluded_partner_owned, 'Excluded — partner-owned'),
  ].filter(Boolean).join('');
  if (exHtml) {
    html += `<div class="section">${exHtml}</div>`;
  }

  root.innerHTML = html;
}

init();
