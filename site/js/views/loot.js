import { html, mount, row, select, searchBox, empty, itemHref, debounce, fmtCount } from '../ui.js';
import { loadLoot, loadMyTasks } from '../data.js';
import { datasetLabel, LOOT_DATASETS } from '../catalog.js';
import { progress } from '../store.js';
import { matchesQuery, numericField } from '../lib.js';
import { taskChips } from './keys.js';

const SORTS = {
  name: ['Name', (a, b) => a.name.localeCompare(b.name)],
  weight: ['Weight (light first)', (a, b) => (numericField(a, 'weight') ?? 1e9) - (numericField(b, 'weight') ?? 1e9)],
  price: ['Sell price (high first)', (a, b) => (numericField(b, 'sell_price') ?? -1) - (numericField(a, 'sell_price') ?? -1)],
};

function lootRow(r, mine) {
  const facts = [datasetLabel(r.dataset), !String(r.weight || '').includes('?') && r.weight, r.grid_size && `${r.grid_size} slots`, r.sell_price && `sells ${r.sell_price}`].filter(Boolean);
  return row({ link: itemHref(r.dataset, r.id), image: r.image, title: r.name, sub: facts.join(' · '), extra: taskChips(r.tasks, mine) });
}

export async function lootView(ctx) {
  const [loot, { byId: mine }] = await Promise.all([loadLoot(), loadMyTasks()]);
  if (!ctx.alive()) return;

  const present = LOOT_DATASETS.filter((d) => loot.some((r) => r.dataset === d));
  const p = ctx.params;
  const f = {
    q: p.get('q') || '',
    cat: p.get('cat') || '',
    tasks: p.get('tasks') || 'open',
    sort: SORTS[p.get('sort')] ? p.get('sort') : 'name',
  };

  mount(ctx.root, html`
    <header class="page-head">
      <h1>Loot</h1>
      <p class="muted">Every lootable item in one list. Items a task names are flagged, so you know what to keep.</p>
    </header>
    <form class="toolbar" id="loot-filters" onsubmit="return false">
      ${searchBox(f.q, 'Item name…')}
      ${select('cat', [['', 'All categories'], ...present.map((d) => [d, datasetLabel(d)])], f.cat, 'Category')}
      ${select('tasks', [['open', 'For my open tasks'], ['any', 'In any task'], ['all', 'All items']], f.tasks, 'Show')}
      ${select('sort', Object.entries(SORTS).map(([k, [label]]) => [k, label]), f.sort, 'Sort')}
    </form>
    <p class="result-count muted" id="loot-count" aria-live="polite"></p>
    <ul class="rows" id="loot-list"></ul>
    <p class="muted small">The API has no list of required hand-ins, so “needed” means the item is named in a task’s briefing or objectives. It will miss items a task calls something else.</p>
  `);

  const $ = (s) => ctx.root.querySelector(s);

  function renderList() {
    const rows = loot
      .filter((r) => {
        if (f.cat && r.dataset !== f.cat) return false;
        if (f.tasks === 'any' && !r.tasks.some((t) => mine.has(t.id))) return false;
        if (f.tasks === 'open' && !r.tasks.some((t) => mine.has(t.id) && !progress.isTaskDone(t.id))) return false;
        return matchesQuery(r, f.q);
      })
      .sort(SORTS[f.sort][1]);
    $('#loot-count').textContent = fmtCount(rows.length, 'item');
    mount($('#loot-list'), rows.length
      ? rows.map((r) => lootRow(r, mine))
      : html`<li>${empty(f.tasks === 'open' ? 'Nothing named in your open tasks matches. Try “All items”.' : 'No items match these filters.')}</li>`);
  }

  renderList();

  const form = $('#loot-filters');
  const update = () => {
    const fd = new FormData(form);
    for (const k of ['q', 'cat', 'tasks', 'sort']) f[k] = fd.get(k) || '';
    ctx.setParams({ q: f.q, cat: f.cat, tasks: f.tasks === 'open' ? '' : f.tasks, sort: f.sort === 'name' ? '' : f.sort });
    renderList();
  };
  form.addEventListener('input', debounce(update, 120));
  form.addEventListener('change', update);
}
