import { html, mount, select, searchBox, progressBar, empty, img, itemHref, taskHref, href, debounce, fmtCount } from '../ui.js';
import { loadTasks, loadKeys, loadLoot } from '../data.js';
import { progress } from '../store.js';
import { matchesQuery } from '../lib.js';

const KINDS = ['Main', 'Side', 'Contract', 'Hidden'];
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const vendorBadge = (v) => html`<span class="vendor vendor-${slug(v)}">${v}</span>`;
const kindBadges = (kinds) => kinds.map((k) => html`<span class="badge badge-${slug(k)}">${k}</span>`);

function check(t) {
  return html`<label class="check" title="Mark as done">
    <input type="checkbox" data-task="${t.id}" ${progress.isTaskDone(t.id) ? 'checked' : ''} aria-label="${t.name} done">
    <span class="check-box" aria-hidden="true"></span>
  </label>`;
}

function taskBody(t, byName) {
  const alt = t.alternate && byName.get(t.alternate.toLowerCase());
  return html`
    ${t.briefing ? html`<p class="briefing">${t.briefing}</p>` : ''}
    ${t.steps.length ? html`<ol class="steps">${t.steps.map((s) => html`<li>${s}</li>`)}</ol>` : html`<p class="muted">No objectives listed in the data.</p>`}
    ${t.notes.length ? html`<details class="notes"><summary>Walkthrough notes from the wiki</summary>${t.notes.map((n) => html`<p>${n}</p>`)}</details>` : ''}
    ${t.alternate ? html`<p class="alt">Branching choice with ${alt ? html`<a href="${taskHref(alt.id)}">${alt.name}</a>${progress.isTaskDone(alt.id) ? ' (you did that one)' : ''}` : t.alternate}. Doing one usually rules out the other.</p>` : ''}
  `;
}

function taskRow(t) {
  const done = progress.isTaskDone(t.id);
  return html`<li class="task ${done ? 'is-done' : ''}" data-id="${t.id}">
    <div class="task-head">
      ${check(t)}
      <button class="task-toggle" type="button" aria-expanded="false">
        <span class="task-name">${t.name}</span>
        <span class="task-meta">${vendorBadge(t.vendor)}${t.areas.length ? html`<span class="muted">${t.areas.join(' · ')}</span>` : ''}${kindBadges(t.kinds)}</span>
      </button>
    </div>
    <div class="task-body" hidden></div>
  </li>`;
}

export async function tasksView(ctx) {
  const { list, byId, byName } = await loadTasks();
  if (!ctx.alive()) return;

  const vendors = [...new Set(list.map((t) => t.vendor).filter(Boolean))].sort();
  const areas = [...new Set(list.flatMap((t) => t.areas))].sort();
  const p = ctx.params;
  const f = {
    q: p.get('q') || '',
    vendor: p.get('vendor') || '',
    area: p.get('area') || '',
    kind: p.get('kind') || '',
    status: p.get('status') || 'open',
  };

  mount(ctx.root, html`
    <header class="page-head">
      <h1>Tasks</h1>
      <p class="muted" id="task-summary"></p>
      <div id="task-progress"></div>
    </header>
    <div class="chips" id="vendor-chips" role="group" aria-label="Vendor"></div>
    <form class="toolbar" id="task-filters" onsubmit="return false">
      ${searchBox(f.q, 'Task, objective, place…')}
      ${select('area', [['', 'All areas'], ...areas.map((a) => [a, a])], f.area, 'Area')}
      ${select('kind', [['', 'All types'], ...KINDS.map((k) => [k, k])], f.kind, 'Type')}
      ${select('status', [['open', 'To do'], ['done', 'Done'], ['all', 'All']], f.status, 'Status')}
    </form>
    <p class="result-count muted" id="task-count" aria-live="polite"></p>
    <ul class="task-list" id="task-list"></ul>
  `);

  const $ = (id) => ctx.root.querySelector(id);

  function renderSummary() {
    const done = list.filter((t) => progress.isTaskDone(t.id)).length;
    $('#task-summary').textContent = `${done} of ${list.length} done`;
    mount($('#task-progress'), progressBar(done, list.length));
    mount($('#vendor-chips'), html`
      <button type="button" class="chip" data-vendor="" aria-pressed="${String(!f.vendor)}">All</button>
      ${vendors.map((v) => {
        const mine = list.filter((t) => t.vendor === v);
        const d = mine.filter((t) => progress.isTaskDone(t.id)).length;
        return html`<button type="button" class="chip" data-vendor="${v}" aria-pressed="${String(f.vendor === v)}">${v} <span class="chip-count">${d}/${mine.length}</span></button>`;
      })}
    `);
  }

  function renderList() {
    const rows = list.filter((t) => {
      if (f.vendor && t.vendor !== f.vendor) return false;
      if (f.area && !t.areas.includes(f.area)) return false;
      if (f.kind && !t.kinds.includes(f.kind)) return false;
      const done = progress.isTaskDone(t.id);
      if (f.status === 'open' && done) return false;
      if (f.status === 'done' && !done) return false;
      return matchesQuery(t, f.q);
    });
    $('#task-count').textContent = fmtCount(rows.length, 'task');
    mount($('#task-list'), rows.length ? rows.map(taskRow) : html`<li>${empty(f.status === 'open' && !f.q ? 'Nothing left to do here. Nice work.' : 'No tasks match these filters.')}</li>`);
  }

  renderSummary();
  renderList();

  const form = $('#task-filters');
  const update = () => {
    const fd = new FormData(form);
    for (const k of ['q', 'area', 'kind', 'status']) f[k] = fd.get(k) || '';
    ctx.setParams({ q: f.q, area: f.area, kind: f.kind, status: f.status === 'open' ? '' : f.status });
    renderList();
  };
  form.addEventListener('input', debounce(update, 120));
  form.addEventListener('change', update);

  $('#vendor-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-vendor]');
    if (!chip) return;
    f.vendor = chip.dataset.vendor;
    ctx.setParams({ vendor: f.vendor });
    renderSummary();
    renderList();
  });

  const listEl = $('#task-list');
  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.task-toggle');
    if (!btn) return;
    const li = btn.closest('.task');
    const body = li.querySelector('.task-body');
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', open);
    if (open && !body.childElementCount) {
      mount(body, html`${taskBody(byId.get(li.dataset.id), byName)}<a class="more" href="${taskHref(li.dataset.id)}">Task page →</a>`);
    }
    body.hidden = !open;
  });

  // Ticking a task updates counts but leaves the row in place until the
  // filters change, so it doesn't jump out from under your thumb.
  listEl.addEventListener('change', (e) => {
    const box = e.target.closest('[data-task]');
    if (!box) return;
    progress.setTaskDone(box.dataset.task, box.checked);
    box.closest('.task').classList.toggle('is-done', box.checked);
    renderSummary();
  });
}

export async function taskView(ctx) {
  const [id] = ctx.match;
  const { byId, byName } = await loadTasks();
  if (!ctx.alive()) return;
  const t = byId.get(id);
  if (!t) {
    mount(ctx.root, empty('That task is not in the current data.'));
    return;
  }

  mount(ctx.root, html`
    <nav class="crumbs"><a href="${href('/tasks', { vendor: t.vendor })}">← ${t.vendor} tasks</a></nav>
    <article class="detail">
      <header class="detail-head">
        ${img(t.image, '', 'detail-img detail-img-wide')}
        <div>
          <h1>${t.name}</h1>
          <p class="task-meta">${vendorBadge(t.vendor)}${t.areas.length ? html`<span class="muted">${t.areas.join(' · ')}</span>` : ''}${kindBadges(t.kinds)}</p>
          <label class="check check-labelled">
            <input type="checkbox" data-task="${t.id}" ${progress.isTaskDone(t.id) ? 'checked' : ''}>
            <span class="check-box" aria-hidden="true"></span> Done
          </label>
        </div>
      </header>
      <section class="detail-section">${taskBody(t, byName)}</section>
      <section class="detail-section" id="task-mentions"><h2>Keys &amp; items named in this task</h2><p class="muted">Checking…</p></section>
    </article>
  `);

  ctx.root.querySelector('[data-task]').addEventListener('change', (e) => {
    progress.setTaskDone(t.id, e.target.checked);
  });

  // Reverse lookup is optional extra: load it after the page is up.
  try {
    const [keys, loot] = await Promise.all([loadKeys(), loadLoot()]);
    if (!ctx.alive()) return;
    const hits = [...keys, ...loot].filter((r) => r.tasks.some((x) => x.id === t.id));
    mount(ctx.root.querySelector('#task-mentions'), html`
      <h2>Keys &amp; items named in this task</h2>
      ${hits.length
        ? html`<ul class="mini-list">${hits.map((r) => html`<li><a href="${itemHref(r.dataset, r.id)}">${img(r.image, '', 'thumb thumb-sm')}<span>${r.name}</span></a></li>`)}</ul>`
        : html`<p class="muted">None found. The data only links items a task mentions by exact name.</p>`}
    `);
  } catch {
    if (ctx.alive()) ctx.root.querySelector('#task-mentions').remove();
  }
}
