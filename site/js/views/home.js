import { html, mount, progressBar } from '../ui.js';
import { loadMyTasks } from '../data.js';
import { progress } from '../store.js';
import { canInstall, onInstallChange, promptInstall, isStandalone } from '../pwa.js';

export async function homeView(ctx) {
  // The home page should never fail just because the API is slow.
  const tasks = await loadMyTasks().catch(() => null);
  if (!ctx.alive()) return;

  const p = progress.get();
  const done = tasks ? tasks.list.filter((t) => p.tasks[t.id]).length : 0;
  const total = tasks?.list.length || 0;
  const nKeys = Object.keys(p.keys).length;

  mount(ctx.root, html`
    <section class="hero">
      <h1>Field guide</h1>
      <p class="muted">Tasks, keys, loot and gear for Gray Zone Warfare.</p>
    </section>

    <ul class="home-tiles">
      <li><a class="home-tile" href="#/tasks">
        <span class="home-tile-title">Tasks</span>
        <span class="muted">${tasks ? `${done} of ${total} done` : 'Track what you’ve finished'}</span>
        ${tasks ? progressBar(done, total) : ''}
      </a></li>
      <li><a class="home-tile" href="#/keys">
        <span class="home-tile-title">Keys</span>
        <span class="muted">${nKeys ? `${nKeys} in your collection` : 'What each key opens, by area'}</span>
      </a></li>
      <li><a class="home-tile" href="#/loot">
        <span class="home-tile-title">Loot</span>
        <span class="muted">What to keep for your open tasks</span>
      </a></li>
      <li><a class="home-tile" href="#/db">
        <span class="home-tile-title">Database</span>
        <span class="muted">Weapons, ammo, armour, attachments and more</span>
      </a></li>
    </ul>

    <div id="install"></div>
    <p class="home-foot muted small"><a href="#/settings">Progress &amp; data</a> · Unofficial fan site, data from <a href="https://gzw-data.dev/" target="_blank" rel="noopener">GZW Data</a></p>
  `);

  const installEl = ctx.root.querySelector('#install');
  const renderInstall = () => {
    if (isStandalone() || !canInstall()) {
      installEl.innerHTML = '';
      return;
    }
    mount(installEl, html`<section class="panel install">
      <div><strong>Install the app</strong><p class="muted small">Adds it to your home screen and works offline.</p></div>
      <button class="btn" type="button">Install</button>
    </section>`);
    installEl.querySelector('button').addEventListener('click', () => promptInstall());
  };
  renderInstall();
  ctx.onCleanup(onInstallChange(renderInstall));
}
