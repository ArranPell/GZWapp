import { html, mount, select, toast, progressBar } from '../ui.js';
import { loadTasks } from '../data.js';
import { characters, MAX_CHARACTERS } from '../store.js';
import { applyFaction, FACTIONS, VENDORS, MAX_REP } from '../lib.js';

const FACTION_OPTIONS = [
  ['', 'Not set'],
  ...Object.entries(FACTIONS).map(([code, f]) => [code, `${code} (${f.start})`]),
  ['all', 'All factions'],
];
const REP_OPTIONS = [['', '–'], ...Array.from({ length: MAX_REP }, (_, i) => [String(i + 1), `R${i + 1}`])];

function card(c, active, allTasks) {
  const mine = allTasks ? applyFaction(allTasks, c.faction) : null;
  const done = mine ? mine.filter((t) => c.tasks[t.id]).length : Object.keys(c.tasks).length;
  const nKeys = Object.keys(c.keys).length;
  return html`<section class="panel char-card ${active ? 'is-active' : ''}" data-char="${c.id}">
    <div class="char-head">
      <label class="field field-grow"><span class="field-label">Name</span>
        <input type="text" name="name" value="${c.name}" maxlength="40" autocomplete="off">
      </label>
      ${active
        ? html`<span class="badge badge-main char-active">Active</span>`
        : html`<button class="btn" type="button" data-act="switch">Switch to</button>`}
    </div>
    <p class="muted small">${mine ? `${done} of ${mine.length} tasks done` : `${done} tasks done`} · ${nKeys} keys</p>
    ${mine ? progressBar(done, mine.length) : ''}
    <div class="char-fields">
      ${select('faction', FACTION_OPTIONS, c.faction, 'Faction')}
    </div>
    <fieldset class="rep-grid">
      <legend class="field-label">Vendor reputation</legend>
      ${VENDORS.map((v) => select(`rep:${v}`, REP_OPTIONS, c.rep[v] ? String(c.rep[v]) : '', v))}
    </fieldset>
    ${characters.list().length > 1 ? html`<button class="btn btn-danger btn-small" type="button" data-act="delete">Delete character</button>` : ''}
  </section>`;
}

export async function charactersView(ctx) {
  const tasks = await loadTasks().catch(() => null);
  if (!ctx.alive()) return;

  // Handlers live on this wrapper, not ctx.root, which outlives the page.
  mount(ctx.root, html`<div id="chars"></div>`);
  const root = ctx.root.querySelector('#chars');

  const render = () => {
    const list = characters.list();
    const activeId = characters.active().id;
    mount(root, html`
      <header class="page-head">
        <h1>Characters</h1>
        <p class="muted">Up to ${MAX_CHARACTERS}, like the game. Each keeps its own tasks, keys, faction and vendor rep. The one marked Active is what the rest of the app shows.</p>
      </header>
      ${list.map((c) => card(c, c.id === activeId, tasks?.list))}
      ${list.length < MAX_CHARACTERS
        ? html`<button class="btn" type="button" data-act="add">Add character</button>`
        : html`<p class="muted small">That's the game's limit of ${MAX_CHARACTERS}.</p>`}
    `);
  };
  render();

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('[data-char]')?.dataset.char;
    if (btn.dataset.act === 'add') {
      const c = characters.add(`Character ${characters.list().length + 1}`);
      if (c) toast(`Added and switched to ${c.name}`);
      render();
    } else if (btn.dataset.act === 'switch') {
      characters.switchTo(id);
      toast(`Switched to ${characters.active().name}`);
      render();
    } else if (btn.dataset.act === 'delete') {
      const c = characters.list().find((x) => x.id === id);
      if (!confirm(`Delete ${c.name} and all of its progress? This cannot be undone.`)) return;
      characters.remove(id);
      render();
    }
  });

  root.addEventListener('change', (e) => {
    const el = e.target;
    const id = el.closest('[data-char]')?.dataset.char;
    if (!id) return;
    if (el.name === 'name') characters.rename(id, el.value);
    else if (el.name === 'faction') characters.setFaction(id, el.value);
    else if (el.name.startsWith('rep:')) characters.setRep(id, el.name.slice(4), Number(el.value) || 0);
    else return;
    render();
  });
}
