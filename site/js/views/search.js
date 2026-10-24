import { html, mount, row, empty, itemHref, taskHref, fmtCount } from '../ui.js';
import { search } from '../api.js';
import { datasetLabel, TASK_DATASETS, GROUPS } from '../catalog.js';

// Datasets the browser shows, plus tasks. Search hits in junk/combined
// datasets (gear, cleanup, armor…) are dropped as duplicates.
const SHOWN = new Set([...GROUPS.flatMap((g) => g.datasets), ...TASK_DATASETS]);

export async function searchView(ctx) {
  const q = (ctx.params.get('q') || '').trim();
  const input = document.querySelector('#global-search input');
  if (input && input.value !== q) input.value = q;

  if (!q) {
    mount(ctx.root, html`<header class="page-head"><h1>Search</h1></header>${empty('Type in the search box above to search every item, key and task.')}`);
    return;
  }

  const results = await search(q, 20);
  if (!ctx.alive()) return;

  // Tasks appear in several task datasets; show each once, under Tasks.
  const seenTasks = new Set();
  const groups = Object.entries(results)
    .filter(([d, rows]) => SHOWN.has(d) && rows.length)
    .map(([d, rows]) => {
      if (!TASK_DATASETS.includes(d)) return [d, rows];
      return ['tasks', rows.filter((r) => !seenTasks.has(r.id) && seenTasks.add(r.id))];
    })
    .reduce((acc, [d, rows]) => {
      const existing = acc.find(([x]) => x === d);
      if (existing) existing[1].push(...rows);
      else if (rows.length) acc.push([d, rows]);
      return acc;
    }, [])
    .sort(([a], [b]) => (a === 'tasks' ? -1 : b === 'tasks' ? 1 : 0));

  const total = groups.reduce((n, [, rows]) => n + rows.length, 0);

  mount(ctx.root, html`
    <header class="page-head">
      <h1>Results for “${q}”</h1>
      <p class="muted">${fmtCount(total, 'match', 'matches')}</p>
    </header>
    ${total ? groups.map(([d, rows]) => html`<section class="group">
      <h2 class="group-title">${datasetLabel(d)} <span class="muted">${rows.length}</span></h2>
      <ul class="rows">${rows.map((r) => row({
        link: d === 'tasks' ? taskHref(r.id) : itemHref(d, r.id),
        image: r.image,
        title: r.name,
        sub: [r.type, r.vendor, r.location, r.usage, r.caliber].filter(Boolean).join(' · '),
      }))}</ul>
    </section>`) : empty('No matches. Try a shorter or different word.')}
  `);
}
