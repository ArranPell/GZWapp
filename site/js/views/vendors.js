import { html, mount, row, select, searchBox, empty, img, itemHref, taskHref, debounce, fmtCount, loading } from '../ui.js';
import { dataset } from '../api.js';
import { loadVendorStock, loadTasks } from '../data.js';
import { characters, progress } from '../store.js';
import { datasetLabel } from '../catalog.js';
import { matchesQuery, MAX_REP } from '../lib.js';
import { vendorBadge } from './tasks.js';

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const vendorHref = (name) => `#/vendor/${slug(name)}`;

const REP_OPTIONS = [['', 'Not set'], ...Array.from({ length: MAX_REP }, (_, i) => [String(i + 1), `Rep ${i + 1}`])];

export async function vendorsView(ctx) {
  const vendors = await dataset('vendors');
  if (!ctx.alive()) return;
  mount(ctx.root, html`
    <header class="page-head">
      <h1>Vendors</h1>
      <p class="muted">Who sells what, and at which reputation level. Your rep is per character: ${characters.active().name}.</p>
    </header>
    <ul class="home-tiles" id="vendor-tiles">${vendors.map((v) => html`<li><a class="home-tile vendor-tile" href="${vendorHref(v.name)}">
      ${img(v.image, '', 'vendor-img')}
      <span>
        <span class="home-tile-title">${v.name}</span>
        <span class="muted small">${v.full_name && v.full_name !== 'Unknown' ? v.full_name : ''}</span>
        <span class="muted small" data-count="${v.name}">${progress.repWith(v.name) ? `Your rep: ${progress.repWith(v.name)}` : 'Rep not set'}</span>
      </span>
    </a></li>`)}</ul>
    <div id="stock-note">${loading('Counting stock')}</div>
  `);

  // Item counts are a bonus; the tiles are usable before they arrive.
  try {
    const stock = await loadVendorStock();
    if (!ctx.alive()) return;
    for (const v of vendors) {
      const el = ctx.root.querySelector(`[data-count="${v.name}"]`);
      const n = stock.get(v.name)?.length || 0;
      if (el) el.textContent = `${fmtCount(n, 'item')} · ${progress.repWith(v.name) ? `your rep ${progress.repWith(v.name)}` : 'rep not set'}`;
    }
    mount(ctx.root.querySelector('#stock-note'), html`<p class="muted small">Stock comes from the wiki via the GZW Data API. About 330 items are listed as loot-only or task rewards, and some vendor listings have no rep level or price, so treat this as a guide rather than the full shop.</p>`);
  } catch {
    if (ctx.alive()) ctx.root.querySelector('#stock-note').innerHTML = '';
  }
}

function offerRow(o, myRep, done) {
  const price = o.item.buy_price;
  const sub = [datasetLabel(o.dataset), price, o.item.weight].filter(Boolean).join(' · ');
  const locked = myRep && o.rep && o.rep > myRep;
  const afterTask = o.after && done.byName.get(o.after.toLowerCase());
  return row({
    link: itemHref(o.dataset, o.item.id),
    image: o.item.image,
    title: o.item.name,
    sub,
    cls: locked ? 'is-locked' : '',
    extra: o.after
      ? html`<span class="task-chips"><a class="task-chip ${afterTask && progress.isTaskDone(afterTask.id) ? 'is-done' : ''}" href="${afterTask ? taskHref(afterTask.id) : '#/tasks'}">After ${o.after}</a></span>`
      : '',
    trailing: o.rep ? html`<span class="rep-badge ${locked ? 'is-locked' : ''}" title="${locked ? `Needs rep ${o.rep}` : `Rep ${o.rep}`}">R${o.rep}</span>` : '',
  });
}

export async function vendorView(ctx) {
  const [id] = ctx.match;
  const [vendors, stock, tasks] = await Promise.all([dataset('vendors'), loadVendorStock(), loadTasks()]);
  if (!ctx.alive()) return;
  const v = vendors.find((x) => x.id === id || slug(x.name) === id);
  if (!v) {
    mount(ctx.root, empty('No vendor by that name in the data.'));
    return;
  }
  const offers = stock.get(v.name) || [];
  const cats = [...new Set(offers.map((o) => o.dataset))].sort((a, b) => datasetLabel(a).localeCompare(datasetLabel(b)));
  const p = ctx.params;
  const f = { q: p.get('q') || '', cat: p.get('cat') || '', show: p.get('show') || 'all' };

  mount(ctx.root, html`
    <nav class="crumbs"><a href="#/vendors">← Vendors</a></nav>
    <header class="detail-head">
      ${img(v.image, v.name, 'detail-img vendor-detail-img')}
      <div>
        <h1>${v.name}</h1>
        ${v.full_name && v.full_name !== 'Unknown' ? html`<p class="muted">${v.full_name}</p>` : ''}
        <p>${vendorBadge(v.name)} <span class="muted">${fmtCount(offers.length, 'item')} listed</span></p>
      </div>
    </header>
    <form class="toolbar" id="vendor-filters" onsubmit="return false">
      ${select('rep', REP_OPTIONS, progress.repWith(v.name) ? String(progress.repWith(v.name)) : '', 'Your rep')}
      ${searchBox(f.q, `Search ${v.name}'s stock…`)}
      ${select('cat', [['', 'All categories'], ...cats.map((c) => [c, datasetLabel(c)])], f.cat, 'Category')}
      ${select('show', [['all', 'Everything'], ['now', 'What I can buy now']], f.show, 'Show')}
    </form>
    <p class="result-count muted" id="vendor-count" aria-live="polite"></p>
    <div id="vendor-list"></div>
  `);

  const $ = (s) => ctx.root.querySelector(s);

  function renderList() {
    const myRep = progress.repWith(v.name);
    const rows = offers.filter((o) => {
      if (f.cat && o.dataset !== f.cat) return false;
      // "Now" = rep known and within yours. Unknown-rep items stay out of
      // it rather than being promised.
      if (f.show === 'now' && (!myRep || !o.rep || o.rep > myRep)) return false;
      return matchesQuery(o.item, f.q);
    });
    $('#vendor-count').textContent = f.show === 'now' && !myRep
      ? `Set ${characters.active().name}'s rep with ${v.name} above to see what you can buy.`
      : fmtCount(rows.length, 'item');
    if (!rows.length) {
      mount($('#vendor-list'), f.show === 'now' && !myRep ? '' : empty('Nothing matches.'));
      return;
    }
    const byName = (a, b) => a.item.name.localeCompare(b.item.name);
    const groups = [
      ...Array.from({ length: MAX_REP }, (_, i) => [`Rep ${i + 1}`, rows.filter((o) => o.rep === i + 1 && !o.after)]),
      ['Unlocked by a task', rows.filter((o) => o.after)],
      ['Rep level not listed', rows.filter((o) => !o.rep && !o.after)],
    ].filter(([, list]) => list.length);
    mount($('#vendor-list'), groups.map(([label, list]) => html`<section class="group">
      <h2 class="group-title">${label} <span class="muted">${list.length}</span></h2>
      <ul class="rows">${list.sort(byName).map((o) => offerRow(o, myRep, tasks))}</ul>
    </section>`));
  }

  renderList();

  const form = $('#vendor-filters');
  const update = (e) => {
    const fd = new FormData(form);
    if (e?.target?.name === 'rep') characters.setRep(characters.active().id, v.name, Number(fd.get('rep')) || 0);
    for (const k of ['q', 'cat', 'show']) f[k] = fd.get(k) || '';
    ctx.setParams({ q: f.q, cat: f.cat, show: f.show === 'all' ? '' : f.show });
    renderList();
  };
  form.addEventListener('input', debounce(update, 120));
  form.addEventListener('change', update);
}
