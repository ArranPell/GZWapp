import { html, mount, row, select, searchBox, progressBar, empty, itemHref, taskHref, debounce, fmtCount } from '../ui.js';
import { loadKeys } from '../data.js';
import { progress } from '../store.js';
import { matchesQuery } from '../lib.js';

export function taskChips(tasks) {
  if (!tasks.length) return '';
  return html`<span class="task-chips">${tasks.map((t) => html`<a class="task-chip ${progress.isTaskDone(t.id) ? 'is-done' : ''}" href="${taskHref(t.id)}">${t.name}</a>`)}</span>`;
}

function keyRow(k) {
  const owned = progress.isKeyOwned(k.id);
  return row({
    link: itemHref(k.dataset, k.id),
    image: k.image,
    title: k.name,
    sub: k.usage || 'No location in the data',
    extra: taskChips(k.tasks),
    cls: owned ? 'is-owned' : '',
    trailing: html`<label class="check" title="I have this key">
      <input type="checkbox" data-key="${k.id}" ${owned ? 'checked' : ''} aria-label="Have ${k.name}">
      <span class="check-box" aria-hidden="true"></span>
    </label>`,
  });
}

export async function keysView(ctx) {
  const keys = await loadKeys();
  if (!ctx.alive()) return;

  // Sections: biggest areas first, one-off spots and "Unknown" at the end.
  const counts = new Map();
  keys.forEach((k) => counts.set(k.area, (counts.get(k.area) || 0) + 1));
  const areaOrder = [...counts.keys()].sort((a, b) => {
    const rank = (x) => (x === 'Unknown' ? 2 : counts.get(x) === 1 ? 1 : 0);
    return rank(a) - rank(b) || counts.get(b) - counts.get(a) || a.localeCompare(b);
  });

  const p = ctx.params;
  const f = { q: p.get('q') || '', area: p.get('area') || '', have: p.get('have') || '' };

  mount(ctx.root, html`
    <header class="page-head">
      <h1>Keys</h1>
      <p class="muted" id="key-summary"></p>
      <div id="key-progress"></div>
    </header>
    <form class="toolbar" id="key-filters" onsubmit="return false">
      ${searchBox(f.q, 'Key, door, building…')}
      ${select('area', [['', 'All areas'], ...areaOrder.map((a) => [a, `${a} (${counts.get(a)})`])], f.area, 'Area')}
      ${select('have', [['', 'All keys'], ['missing', "Don't have"], ['owned', 'Have']], f.have, 'Show')}
    </form>
    <p class="muted small">Tick the keys you have. Tasks listed under a key mention it by name.</p>
    <div id="key-list"></div>
  `);

  const $ = (s) => ctx.root.querySelector(s);

  function renderSummary() {
    const owned = keys.filter((k) => progress.isKeyOwned(k.id)).length;
    $('#key-summary').textContent = `You have ${owned} of ${keys.length}`;
    mount($('#key-progress'), progressBar(owned, keys.length));
  }

  function renderList() {
    const rows = keys.filter((k) => {
      if (f.area && k.area !== f.area) return false;
      const owned = progress.isKeyOwned(k.id);
      if (f.have === 'owned' && !owned) return false;
      if (f.have === 'missing' && owned) return false;
      return matchesQuery(k, f.q);
    });
    if (!rows.length) {
      mount($('#key-list'), empty('No keys match these filters.'));
      return;
    }
    mount($('#key-list'), areaOrder
      .map((area) => [area, rows.filter((k) => k.area === area).sort((a, b) => a.name.localeCompare(b.name))])
      .filter(([, list]) => list.length)
      .map(([area, list]) => html`<section class="group">
        <h2 class="group-title">${area} <span class="muted">${fmtCount(list.length, 'key')}</span></h2>
        <ul class="rows">${list.map(keyRow)}</ul>
      </section>`));
  }

  renderSummary();
  renderList();

  const form = $('#key-filters');
  const update = () => {
    const fd = new FormData(form);
    for (const k of ['q', 'area', 'have']) f[k] = fd.get(k) || '';
    ctx.setParams(f);
    renderList();
  };
  form.addEventListener('input', debounce(update, 120));
  form.addEventListener('change', update);

  $('#key-list').addEventListener('change', (e) => {
    const box = e.target.closest('[data-key]');
    if (!box) return;
    progress.setKeyOwned(box.dataset.key, box.checked);
    box.closest('.row').classList.toggle('is-owned', box.checked);
    renderSummary();
  });
}
