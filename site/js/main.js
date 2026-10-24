import { mount, loading, errorState } from './ui.js';
import { homeView } from './views/home.js';
import { dbIndexView, dbListView } from './views/database.js';
import { itemView } from './views/item.js';
import { tasksView, taskView } from './views/tasks.js';
import { keysView } from './views/keys.js';
import { lootView } from './views/loot.js';
import { searchView } from './views/search.js';
import { settingsView } from './views/settings.js';
import { charactersView } from './views/characters.js';
import { vendorsView, vendorView } from './views/vendors.js';
import { characters, progress } from './store.js';

const ROUTES = [
  [/^\/$/, homeView, 'home'],
  [/^\/db$/, dbIndexView, 'db'],
  [/^\/db\/([^/]+)$/, dbListView, 'db'],
  [/^\/item\/([^/]+)\/(.+)$/, itemView, 'db'],
  [/^\/tasks$/, tasksView, 'tasks'],
  [/^\/task\/(.+)$/, taskView, 'tasks'],
  [/^\/keys$/, keysView, 'keys'],
  [/^\/loot$/, lootView, 'loot'],
  [/^\/search$/, searchView, 'search'],
  [/^\/settings$/, settingsView, 'settings'],
  [/^\/characters$/, charactersView, 'characters'],
  [/^\/vendors$/, vendorsView, 'vendors'],
  [/^\/vendor\/([^/]+)$/, vendorView, 'vendors'],
];

const root = document.getElementById('view');
const scrollMemory = new Map();
let renderId = 0;
let cleanup = null;

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = h.split('?');
  return { path: path || '/', params: new URLSearchParams(qs) };
}

async function render() {
  const id = ++renderId;
  const { path } = parseHash();
  let { params } = parseHash();
  const route = ROUTES.find(([re]) => re.test(path));
  if (cleanup) { cleanup(); cleanup = null; }

  document.querySelectorAll('[data-nav]').forEach((a) => {
    a.toggleAttribute('aria-current', !!route && a.dataset.nav === route[2]);
  });

  if (!route) {
    mount(root, errorState(new Error('That page does not exist.'), false));
    return;
  }

  const [re, view] = route;
  const match = path.match(re).slice(1).map(decodeURIComponent);
  const ctx = {
    root,
    params,
    match,
    alive: () => id === renderId,
    // Update the query string without triggering a re-render, so filters
    // survive reloads and the back button without losing input focus.
    setParams(next) {
      const merged = new URLSearchParams(params);
      for (const [k, v] of Object.entries(next)) {
        if (v == null || v === '') merged.delete(k);
        else merged.set(k, v);
      }
      const qs = merged.toString();
      history.replaceState(null, '', `#${path}${qs ? `?${qs}` : ''}`);
      params = merged;
      ctx.params = merged;
    },
    onCleanup(fn) { cleanup = fn; },
    rerender: render,
  };

  mount(root, loading());
  try {
    await view(ctx);
  } catch (err) {
    if (!ctx.alive()) return;
    console.error(err);
    mount(root, errorState(err));
    return;
  }
  if (!ctx.alive()) return;
  const y = scrollMemory.get(location.hash);
  window.scrollTo(0, y || 0);
}

window.addEventListener('hashchange', () => render());

// Top-bar pill shows the active character. Switching character re-renders
// the page; other changes (ticking a task) only refresh the pill.
const pill = document.getElementById('char-pill');
let shownCharacter = characters.active().id;
function updatePill() {
  const c = characters.active();
  pill.textContent = c.name;
  pill.title = `Playing as ${c.name}. Tap to manage characters.`;
}
updatePill();
progress.subscribe(() => {
  updatePill();
  const id = characters.active().id;
  if (id !== shownCharacter) {
    shownCharacter = id;
    if (!location.hash.startsWith('#/characters')) render();
  }
});
window.addEventListener('scroll', () => scrollMemory.set(location.hash, window.scrollY), { passive: true });

root.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="retry"]')) render();
});

document.getElementById('global-search').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = new FormData(e.currentTarget).get('q')?.toString().trim();
  if (q) location.hash = `#/search?q=${encodeURIComponent(q)}`;
  e.currentTarget.querySelector('input').blur();
});

// Broken wiki images collapse to the placeholder style instead of an icon.
document.addEventListener('error', (e) => {
  if (e.target instanceof HTMLImageElement) e.target.classList.add('thumb-broken');
}, true);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // A new release took over: reload once so the page and its cached files
  // match. Filters live in the URL, so nothing is lost.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) {
      reloading = true;
      location.reload();
    }
  });
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker failed', err));
}

render();
