// Pharma Pipeline — company detail page

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
  if (s.includes('3') || s.includes('III') || s.includes('NDA') || s.includes('BLA') || s.includes('PIVOTAL') || s.includes('REGISTRATIONAL')) return 'p3';
  if (s.includes('2') || s.includes('II')) return 'p2';
  if (s.includes('1') || s.includes('I')) return 'p1';
  return 'p0';
}

function nctLinks(nct) {
  if (!nct) return '';
  if (Array.isArray(nct)) {
    if (!nct.length) return '<span class="status">No NCT</span>';
    return nct.map(id => `<a class="nct" href="https://clinicaltrials.gov/study/${esc(id)}" target="_blank" rel="noopener">${esc(id)}</a>`).join(', ');
  }
  return `<span class="status">${esc(nct)}</span>`;
}

function sourceLinks(sources) {
  if (!sources) return '';
  const out = [];
  for (const [k, v] of Object.entries(sources)) {
    if (!v) continue;
    if (typeof v === 'object') {
      if (v.error) {
        out.push(`<span title="${esc(v.error)}">${k}: <em style="color:var(--warn)">unavailable</em></span>`);
      } else {
        const url = v.primary_url || v.pipeline_page || v.filing_url || v.url || null;
        if (url) {
          out.push(`<a href="${esc(url)}" target="_blank" rel="noopener">${k}</a>`);
        } else {
          out.push(`<span>${k}</span>`);
        }
      }
    }
  }
  return out.join(' · ');
}

function renderPipeline(pipeline) {
  if (!pipeline || !pipeline.length) return null;
  let html = `<table class="pipeline">
    <thead>
      <tr>
        <th style="width:18%">Asset</th>
        <th style="width:22%">Indication</th>
        <th style="width:8%">Phase</th>
        <th style="width:18%">Trial</th>
        <th style="width:14%">NCT</th>
        <th style="width:10%">Status</th>
        <th>Sponsor</th>
      </tr>
    </thead>
    <tbody>`;
  for (const asset of pipeline) {
    const inds = asset.indications || [];
    const colspan = 7;
    const akaTxt = (asset.aka && asset.aka.length) ? ` (${asset.aka.join(', ')})` : '';
    html += `<tr class="asset-row"><td colspan="${colspan}">
      ${esc(asset.asset || 'Unnamed asset')}${esc(akaTxt)}
      ${asset.modality ? `<span class="modality">${esc(asset.modality)}${asset.target ? ' · ' + esc(asset.target) : ''}${asset.license_origin ? ' · ' + esc(asset.license_origin) : ''}</span>` : ''}
    </td></tr>`;
    if (!inds.length) {
      html += `<tr><td></td><td colspan="${colspan - 1}" class="status">No indications listed</td></tr>`;
      continue;
    }
    for (const ind of inds) {
      const ph = ind.highest_phase || '';
      const cls = phaseClass(ph);
      const milestones = (ind.key_milestones && ind.key_milestones.length)
        ? `<ul class="milestones">${ind.key_milestones.map(m => `<li>${esc(m)}</li>`).join('')}</ul>`
        : '';
      html += `<tr>
        <td></td>
        <td>${esc(ind.indication || '')}${milestones}</td>
        <td><span class="pill ${cls}">${esc(ph || '—')}</span></td>
        <td>${esc(ind.trial_name || '')}${ind.trial_design ? `<div class="status">${esc(ind.trial_design)}</div>` : ''}</td>
        <td>${nctLinks(ind.nct_ids)}</td>
        <td><span class="status">${esc(ind.trial_status || '')}</span></td>
        <td>${esc(ind.lead_sponsor || '')}</td>
      </tr>`;
    }
  }
  html += '</tbody></table>';
  return html;
}

function renderCommercial(cp) {
  if (!cp) return null;
  const lines = cp.lines || cp.products || [];
  if (!lines.length) return null;
  let html = `<table class="pipeline"><thead><tr>
    <th style="width:25%">Product</th>
    <th style="width:20%">Modality</th>
    <th style="width:30%">Regulatory status</th>
    <th>Indication</th>
  </tr></thead><tbody>`;
  for (const line of lines) {
    html += `<tr>
      <td><strong>${esc(line.name || '')}</strong></td>
      <td>${esc(line.modality || '')}</td>
      <td>${esc(line.regulatory_status || '')}</td>
      <td>${esc(line.indication || '')}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  return html;
}

function renderExcluded(items, title) {
  if (!items || !items.length) return '';
  return `<details class="collapsible"><summary>${esc(title)} (${items.length})</summary>
    <ul>${items.map(it => `<li>${esc(typeof it === 'string' ? it : JSON.stringify(it))}</li>`).join('')}</ul>
  </details>`;
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

  document.title = `${company.ticker || slug.toUpperCase()} — ${company.issuer_name || ''} · Pharma Pipeline`;

  const sourcesHtml = sourceLinks(company.sources);
  const pipelineHtml = renderPipeline(company.pipeline);
  const commercialHtml = renderCommercial(company.commercial_product);

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
    </div>
  `;

  html += `<div class="section">
    <h2>Active P1/P2/P3 Pipeline</h2>
    ${pipelineHtml || `<div class="no-pipeline">${esc(company.no_active_clinical_pipeline_reason || 'No active P1/P2/P3 pipeline reported.')}</div>`}
  </div>`;

  if (commercialHtml) {
    html += `<div class="section">
      <h2>Commercial Products</h2>
      ${commercialHtml}
    </div>`;
  }

  const exHtml = [
    renderExcluded(company.excluded_preclinical, 'Excluded — preclinical / IND-pending'),
    renderExcluded(company.excluded_legacy_terminated, 'Excluded — terminated / withdrawn'),
    renderExcluded(company.excluded_partner_owned, 'Excluded — partner-owned'),
  ].filter(Boolean).join('');
  if (exHtml) {
    html += `<div class="section"><h2>Excluded</h2>${exHtml}</div>`;
  }

  if (company.blockers && company.blockers.length) {
    html += `<div class="section"><h2>Data caveats</h2>
      <ul style="margin:0;padding-left:18px;color:var(--text-muted);font-size:13px">
        ${company.blockers.map(b => `<li>${esc(b)}</li>`).join('')}
      </ul>
    </div>`;
  }

  root.innerHTML = html;
}

init();
