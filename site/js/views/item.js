import { html, mount, empty, img, taskHref, href, fmtCount } from '../ui.js';
import { findRecord, loadMyTasks, loadKeys } from '../data.js';
import { datasetLabel, groupOf, HIDDEN_FIELDS, TASK_DATASETS } from '../catalog.js';
import { fieldLabel, taskMentions, keyArea } from '../lib.js';
import { progress } from '../store.js';
import { vendorBadge } from './tasks.js';

const LONG_FIELD = 120;

// "5.45x39mm BP (7N22) 5.45x39mm BS (7N24) ..." -> one entry per round.
function splitAmmo(text, caliber) {
  if (!caliber || !text.includes(caliber)) return [text];
  const esc = caliber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.split(new RegExp(`\\s+(?=${esc})`)).map((s) => s.trim()).filter(Boolean);
}

function fieldValue(r, k) {
  if (k === 'accepted_ammunition') {
    const rounds = splitAmmo(r[k], r.caliber);
    if (rounds.length > 1) return html`<ul class="plain-list">${rounds.map((x) => html`<li>${x}</li>`)}</ul>`;
  }
  return r[k];
}

function taskLinks(tasks) {
  return html`<ul class="mini-list">${tasks.map((t) => html`<li class="${progress.isTaskDone(t.id) ? 'is-done' : ''}">
    <a href="${taskHref(t.id)}"><span>${t.name}</span> ${vendorBadge(t.vendor)}</a>
  </li>`)}</ul>`;
}

export async function itemView(ctx) {
  const [name, id] = ctx.match;
  if (TASK_DATASETS.includes(name)) {
    location.replace(taskHref(id));
    return;
  }
  const r = await findRecord(name, id);
  if (!ctx.alive()) return;
  if (!r) {
    mount(ctx.root, empty('That item is not in the current data.'));
    return;
  }

  const group = groupOf(name);
  const fields = Object.keys(r).filter((k) => !HIDDEN_FIELDS.has(k) && r[k] != null && r[k] !== '');
  const short = fields.filter((k) => typeof r[k] !== 'string' || r[k].length <= LONG_FIELD || k === 'accepted_ammunition');
  const long = fields.filter((k) => !short.includes(k));
  const isKey = name === 'keys' || name === 'keycards';

  mount(ctx.root, html`
    <nav class="crumbs"><a href="#/db/${name}">← ${datasetLabel(name)}</a>${group ? html` <span class="muted">in ${group.label}</span>` : ''}</nav>
    <article class="detail">
      <header class="detail-head">
        ${img(r.image, r.name, 'detail-img')}
        <div>
          <h1>${r.name}</h1>
          ${isKey ? html`<p class="muted">${keyArea(r)}</p>
            <label class="check check-labelled">
              <input type="checkbox" data-key="${r.id}" ${progress.isKeyOwned(r.id) ? 'checked' : ''}>
              <span class="check-box" aria-hidden="true"></span> I have this key
            </label>` : ''}
        </div>
      </header>
      ${short.length ? html`<dl class="facts">${short.map((k) => html`<div><dt>${fieldLabel(k)}</dt><dd>${fieldValue(r, k)}</dd></div>`)}</dl>` : ''}
      ${long.map((k) => html`<section class="detail-section"><h2>${fieldLabel(k)}</h2><p>${r[k]}</p></section>`)}
      <div id="related"></div>
    </article>
  `);

  ctx.root.querySelector('[data-key]')?.addEventListener('change', (e) => progress.setKeyOwned(r.id, e.target.checked));

  // Cross-references load after the page is up; they are a bonus, not a blocker.
  try {
    const { list } = await loadMyTasks();
    if (!ctx.alive()) return;
    const sections = [];

    if (name === 'regions') {
      const here = list.filter((t) => t.areas.includes(r.name));
      const keys = (await loadKeys()).filter((k) => k.area === r.name);
      if (!ctx.alive()) return;
      sections.push(html`<section class="detail-section"><h2>Tasks here <span class="muted">${here.length}</span></h2>
        ${here.length ? html`<p><a href="${href('/tasks', { area: r.name, status: 'all' })}">Open in task tracker →</a></p>${taskLinks(here)}` : html`<p class="muted">None.</p>`}</section>`);
      sections.push(html`<section class="detail-section"><h2>Keys here <span class="muted">${keys.length}</span></h2>
        ${keys.length ? html`<p><a href="${href('/keys', { area: r.name })}">Open in keys →</a></p>` : html`<p class="muted">None.</p>`}</section>`);
    } else if (name === 'vendors') {
      const theirs = list.filter((t) => t.vendor === r.name);
      const done = theirs.filter((t) => progress.isTaskDone(t.id)).length;
      sections.push(html`<section class="detail-section"><h2>Tasks</h2>
        <p>${done} of ${fmtCount(theirs.length, 'task')} done. <a href="${href('/tasks', { vendor: r.name })}">Open in task tracker →</a></p></section>`);
    } else {
      const hits = taskMentions([r], list).get(r) || [];
      if (hits.length) {
        sections.push(html`<section class="detail-section"><h2>Named in tasks</h2>${taskLinks(hits)}</section>`);
      }
    }
    mount(ctx.root.querySelector('#related'), sections);
  } catch {
    // Related data failed; the item itself is already on screen.
  }
}
