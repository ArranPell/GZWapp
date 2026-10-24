import { html, mount, select, searchBox, empty, img, itemHref, debounce, fmtCount } from '../ui.js';
import { dataset, version } from '../api.js';
import { GROUPS, SUMMARY_FIELDS, HIDDEN_FIELDS, datasetLabel, groupOf } from '../catalog.js';
import { matchesQuery, numericField, parseSoldBy, fieldLabel } from '../lib.js';

export async function dbIndexView(ctx) {
  const v = await version().catch(() => null);
  if (!ctx.alive()) return;
  const counts = v?.snapshot?.datasets || {};

  mount(ctx.root, html`
    <header class="page-head">
      <h1>Database</h1>
      <p class="muted">Everything the community data API knows about, by category.</p>
    </header>
    ${GROUPS.map((g) => html`<section class="group">
      <h2 class="group-title">${g.label}</h2>
      <ul class="tiles">${g.datasets.map((d) => html`<li><a class="tile" href="#/db/${d}">
        <span class="tile-title">${datasetLabel(d)}</span>
        ${counts[d] != null ? html`<span class="tile-count muted">${counts[d]}</span>` : ''}
      </a></li>`)}</ul>
    </section>`)}
  `);
}

const LONG_TEXT = 60;

// Columns for table view: fields most records have, short enough to scan.
function tableColumns(rows) {
  const stats = new Map();
  for (const r of rows) {
    for (const [k, val] of Object.entries(r)) {
      if (HIDDEN_FIELDS.has(k) || typeof val !== 'string') continue;
      const s = stats.get(k) || { n: 0, len: 0 };
      s.n += 1;
      s.len += val.length;
      stats.set(k, s);
    }
  }
  return [...stats.entries()]
    .filter(([, s]) => s.n >= rows.length * 0.4 && s.len / s.n <= LONG_TEXT)
    .sort(([a], [b]) => {
      const ia = SUMMARY_FIELDS.indexOf(a);
      const ib = SUMMARY_FIELDS.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .map(([k]) => k)
    .slice(0, 8);
}

function numericKeys(rows) {
  const keys = new Set();
  for (const r of rows) {
    Object.keys(r.numeric_values || {}).forEach((k) => keys.add(k));
    for (const k of ['buy_price', 'sell_price', 'slots']) if (r[k]) keys.add(k);
  }
  return [...keys];
}

function card(name, r) {
  const facts = SUMMARY_FIELDS.filter((k) => r[k] && String(r[k]).length <= LONG_TEXT).slice(0, 3);
  return html`<li><a class="card" href="${itemHref(name, r.id)}">
    ${img(r.image, '', 'card-img')}
    <span class="card-body">
      <span class="card-title">${r.name}</span>
      ${facts.map((k) => html`<span class="card-fact"><span class="muted">${fieldLabel(k)}</span> ${r[k]}</span>`)}
    </span>
  </a></li>`;
}

function table(name, rows, cols) {
  return html`<div class="table-wrap"><table class="data-table">
    <thead><tr><th scope="col">Name</th>${cols.map((c) => html`<th scope="col">${fieldLabel(c)}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr>
      <th scope="row"><a href="${itemHref(name, r.id)}">${img(r.image, '', 'thumb thumb-sm')}<span>${r.name}</span></a></th>
      ${cols.map((c) => html`<td>${r[c] ?? ''}</td>`)}
    </tr>`)}</tbody>
  </table></div>`;
}

export async function dbListView(ctx) {
  const [name] = ctx.match;
  const rows = await dataset(name);
  if (!ctx.alive()) return;

  const types = [...new Set(rows.map((r) => r.type).filter(Boolean))].sort();
  const vendors = [...new Set(rows.map((r) => parseSoldBy(r.sold_by)?.vendor).filter(Boolean))].sort();
  const nums = numericKeys(rows);
  const sortOptions = [['name', 'Name A–Z'], ...nums.flatMap((k) => [[`${k}:desc`, `${fieldLabel(k)} ↓ high first`], [`${k}:asc`, `${fieldLabel(k)} ↑ low first`]])];
  const cols = tableColumns(rows);
  const group = groupOf(name);

  const p = ctx.params;
  const f = {
    q: p.get('q') || '',
    type: p.get('type') || '',
    vendor: p.get('vendor') || '',
    sort: sortOptions.some(([v]) => v === p.get('sort')) ? p.get('sort') : 'name',
    view: p.get('view') === 'table' ? 'table' : 'cards',
  };

  mount(ctx.root, html`
    <nav class="crumbs"><a href="#/db">← ${group ? group.label : 'Database'}</a></nav>
    <header class="page-head page-head-row">
      <h1>${datasetLabel(name)}</h1>
      <div class="segmented" role="group" aria-label="Layout">
        <button type="button" data-view="cards" aria-pressed="${String(f.view === 'cards')}">Cards</button>
        <button type="button" data-view="table" aria-pressed="${String(f.view === 'table')}">Compare</button>
      </div>
    </header>
    <form class="toolbar" id="db-filters" onsubmit="return false">
      ${searchBox(f.q, `Search ${datasetLabel(name).toLowerCase()}…`)}
      ${types.length > 1 ? select('type', [['', 'All types'], ...types.map((t) => [t, t])], f.type, 'Type') : ''}
      ${vendors.length > 1 ? select('vendor', [['', 'Any vendor'], ...vendors.map((v) => [v, v])], f.vendor, 'Sold by') : ''}
      ${select('sort', sortOptions, f.sort, 'Sort')}
    </form>
    <p class="result-count muted" id="db-count" aria-live="polite"></p>
    <div id="db-list"></div>
  `);

  const $ = (s) => ctx.root.querySelector(s);

  function renderList() {
    const [key, dir] = f.sort.split(':');
    const filtered = rows
      .filter((r) => (!f.type || r.type === f.type)
        && (!f.vendor || parseSoldBy(r.sold_by)?.vendor === f.vendor)
        && matchesQuery(r, f.q))
      .sort((a, b) => {
        if (key === 'name') return a.name.localeCompare(b.name);
        const va = numericField(a, key);
        const vb = numericField(b, key);
        if (va == null) return vb == null ? 0 : 1; // blanks last either way
        if (vb == null) return -1;
        return dir === 'asc' ? va - vb : vb - va;
      });
    $('#db-count').textContent = fmtCount(filtered.length, 'item');
    if (!filtered.length) mount($('#db-list'), empty('Nothing matches.'));
    else if (f.view === 'table') mount($('#db-list'), table(name, filtered, cols));
    else mount($('#db-list'), html`<ul class="cards">${filtered.map((r) => card(name, r))}</ul>`);
  }

  renderList();

  const form = $('#db-filters');
  const update = () => {
    const fd = new FormData(form);
    for (const k of ['q', 'type', 'vendor', 'sort']) f[k] = fd.get(k) || '';
    ctx.setParams({ q: f.q, type: f.type, vendor: f.vendor, sort: f.sort === 'name' ? '' : f.sort });
    renderList();
  };
  form.addEventListener('input', debounce(update, 120));
  form.addEventListener('change', update);

  ctx.root.querySelector('.segmented').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    f.view = b.dataset.view;
    ctx.setParams({ view: f.view === 'table' ? 'table' : '' });
    ctx.root.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderList();
  });
}
