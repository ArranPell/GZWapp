import { html, raw, mount, select, searchBox, progressBar, empty, img, itemHref, taskHref, href, debounce, fmtCount } from '../ui.js';
import { loadTasks, loadMyTasks, loadKeys, loadLoot } from '../data.js';
import { progress, prefs, characters } from '../store.js';
import { matchesQuery, applyFaction, groupByRegion, parseFilters, filterParams, FACTIONS } from '../lib.js';
import { loadGuide, wikiPage } from '../wiki.js';

const KINDS = ['Main', 'Side', 'Contract', 'Hidden'];
// URL filters; see parseFilters. Vendor comes from the chips, not the form.
const FILTERS = { q: '', vendor: '', area: '', kind: '', status: ['open', 'done', 'all'] };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const vendorBadge = (v) => html`<span class="vendor vendor-${slug(v)}">${v}</span>`;
const isHidden = (t) => t.kinds.includes('Hidden');
const kindBadges = (t) => [
  ...t.kinds.map((k) => (k === 'Hidden'
    ? html`<span class="badge badge-hidden" title="Not in your task log until you set it off in the world">◆ Hidden</span>`
    : html`<span class="badge badge-${slug(k)}">${k}</span>`)),
  t.factions.length ? html`<span class="badge badge-faction">${t.factions.join(' / ')} only</span>` : '',
];

// Asked once on the Tasks page; also changeable under Progress & data.
export function factionPicker() {
  return html`<section class="panel faction-pick">
    <h2>Which faction do you play?</h2>
    <p class="muted small">Shared starter tasks then show in your own starting town, and other factions' exclusive tasks are hidden.</p>
    <div class="btn-row">
      ${Object.entries(FACTIONS).map(([code, f]) => html`<button class="btn" type="button" data-faction="${code}" title="${f.name}">${code} <span class="btn-sub">${f.start}</span></button>`)}
      <button class="btn btn-ghost" type="button" data-faction="all">All factions</button>
    </div>
  </section>`;
}

function check(t) {
  return html`<label class="check" title="Mark as done">
    <input type="checkbox" data-task="${t.id}" ${progress.isTaskDone(t.id) ? 'checked' : ''} aria-label="${t.name} done">
    <span class="check-box" aria-hidden="true"></span>
  </label>`;
}

function taskBody(t, byName) {
  const alt = t.alternate && byName.get(t.alternate.toLowerCase());
  return html`
    ${isHidden(t) ? html`<p class="hidden-note"><strong>Hidden task.</strong> It won't be in your log until you set it off in the world.<span class="hidden-trigger"></span></p>` : ''}
    ${t.briefing ? html`<p class="briefing">${t.briefing}</p>` : ''}
    ${t.steps.length ? html`<ol class="steps">${t.steps.map((s) => html`<li>${s}</li>`)}</ol>` : html`<p class="muted">No objectives listed in the data.</p>`}
    ${t.notes.length ? html`<details class="notes"><summary>Walkthrough notes from the wiki</summary>${t.notes.map((n) => html`<p>${n}</p>`)}</details>` : ''}
    ${t.alternate ? html`<p class="alt">Branching choice with ${alt ? html`<a href="${taskHref(alt.id)}">${alt.name}</a>${progress.isTaskDone(alt.id) ? ' (you did that one)' : ''}` : t.alternate}. Doing one usually rules out the other.</p>` : ''}
    <section class="guide" aria-live="polite"><p class="muted small">Loading the wiki guide…</p></section>
  `;
}

// The wiki's Guide section, loaded after the task body is on screen. When
// it arrives it replaces the API's shorter walkthrough notes.
export async function fillGuide(scope, t) {
  const el = scope.querySelector('.guide');
  if (!el) return;
  const page = wikiPage(t.name);
  let g;
  try {
    g = await loadGuide(t.name);
  } catch {
    if (el.isConnected) mount(el, html`<p class="muted small">Couldn't reach the wiki for a guide. <a href="${page}" target="_blank" rel="noopener noreferrer">Open the wiki page</a></p>`);
    return;
  }
  if (!el.isConnected) return;
  if (!g?.html) {
    mount(el, html`<p class="muted small">The wiki has no guide for this task yet. <a href="${g?.url || page}" target="_blank" rel="noopener noreferrer">Wiki page</a></p>`);
    return;
  }
  scope.querySelector('.notes')?.remove();
  const trig = scope.querySelector('.hidden-trigger');
  if (trig && g.trigger) mount(trig, html` <strong>How it starts:</strong> ${g.trigger}`);
  mount(el, html`
    <h2 class="guide-title">Where to go</h2>
    <div class="guide-body">${raw(g.html)}</div>
    <p class="muted small guide-credit">Guide from the <a href="${g.url}" target="_blank" rel="noopener noreferrer">Gray Zone Warfare Wiki</a> (CC BY-SA). Tap a picture for full size.</p>
  `);
}

function taskRow(t) {
  const done = progress.isTaskDone(t.id);
  return html`<li class="task ${done ? 'is-done' : ''} ${isHidden(t) ? 'is-hidden-task' : ''}" data-id="${t.id}">
    <div class="task-head">
      ${check(t)}
      <button class="task-toggle" type="button" aria-expanded="false">
        <span class="task-name">${t.name}</span>
        <span class="task-meta">${vendorBadge(t.vendor)}${t.areas.length ? html`<span class="muted">${t.areas.join(' · ')}</span>` : ''}${kindBadges(t)}</span>
      </button>
    </div>
    <div class="task-body" hidden></div>
  </li>`;
}

export async function tasksView(ctx) {
  const { list, byId, byName } = await loadMyTasks();
  if (!ctx.alive()) return;
  const faction = FACTIONS[prefs.faction];

  const vendors = [...new Set(list.map((t) => t.vendor).filter(Boolean))].sort();
  const areas = [...new Set(list.flatMap((t) => t.areas))].sort();
  const f = parseFilters(FILTERS, ctx.params);

  mount(ctx.root, html`
    <header class="page-head">
      <h1>Tasks</h1>
      <p class="muted small">${characters.active().name}${faction ? ` · ${prefs.faction}, starting in ${faction.start}` : ''} · <a href="#/characters">change</a></p>
      <p class="muted" id="task-summary"></p>
      <div id="task-progress"></div>
    </header>
    ${prefs.faction ? '' : factionPicker()}
    <div class="chips" id="vendor-chips" role="group" aria-label="Vendor"></div>
    <form class="toolbar" id="task-filters" onsubmit="return false">
      ${searchBox(f.q, 'Task, objective, place…')}
      ${select('area', [['', 'All areas'], ...areas.map((a) => [a, a])], f.area, 'Area')}
      ${select('kind', [['', 'All types'], ...KINDS.map((k) => [k, k])], f.kind, 'Type')}
      ${select('status', [['open', 'To do'], ['done', 'Done'], ['all', 'All']], f.status, 'Status')}
    </form>
    <p class="result-count muted" id="task-count" aria-live="polite"></p>
    <div id="task-list"></div>
  `);

  const $ = (id) => ctx.root.querySelector(id);

  ctx.root.querySelector('.faction-pick')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-faction]');
    if (!b) return;
    prefs.setFaction(b.dataset.faction);
    ctx.rerender();
  });

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
    if (!rows.length) {
      mount($('#task-list'), empty(f.status === 'open' && !f.q ? 'Nothing left to do here. Nice work.' : 'No tasks match these filters.'));
      return;
    }
    mount($('#task-list'), groupByRegion(rows, faction?.start).map(([area, tasks]) => html`
      <section class="task-group">
        <h2 class="task-group-head">${area} <span class="muted">${tasks.length}</span></h2>
        <ul class="task-list">${tasks.map(taskRow)}</ul>
      </section>`));
  }

  renderSummary();
  renderList();

  const form = $('#task-filters');
  const update = () => {
    Object.assign(f, parseFilters(FILTERS, new FormData(form), f));
    ctx.setParams(filterParams(FILTERS, f));
    renderList();
  };
  form.addEventListener('input', debounce(update, 120));
  form.addEventListener('change', update);

  $('#vendor-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-vendor]');
    if (!chip) return;
    f.vendor = chip.dataset.vendor;
    ctx.setParams(filterParams(FILTERS, f));
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
      const t = byId.get(li.dataset.id);
      mount(body, html`${taskBody(t, byName)}<a class="more" href="${taskHref(li.dataset.id)}">Task page →</a>`);
      fillGuide(body, t);
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
  const raw = byId.get(id);
  if (!raw) {
    mount(ctx.root, empty('That task is not in the current data.'));
    return;
  }
  // Show it as the player's faction sees it, or say why it isn't theirs.
  const mine = applyFaction([raw], prefs.faction)[0];
  const t = mine || raw;

  mount(ctx.root, html`
    <nav class="crumbs"><a href="${href('/tasks', { vendor: t.vendor })}">← ${t.vendor} tasks</a></nav>
    <article class="detail">
      <header class="detail-head">
        ${img(t.image, '', 'detail-img detail-img-wide')}
        <div>
          <h1>${t.name}</h1>
          <p class="task-meta">${vendorBadge(t.vendor)}${t.areas.length ? html`<span class="muted">${t.areas.join(' · ')}</span>` : ''}${kindBadges(t)}</p>
          ${mine ? '' : html`<p class="alt">Not available to ${prefs.faction}: this is a ${t.factions.join(' / ')} task.</p>`}
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
  fillGuide(ctx.root.querySelector('.detail-section'), t);

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
