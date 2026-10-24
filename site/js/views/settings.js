import { html, mount, toast } from '../ui.js';
import { version, refreshAll } from '../api.js';
import { progress } from '../store.js';
import { encodeProgress, decodeProgress } from '../lib.js';

const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
};

export async function settingsView(ctx) {
  const v = await version().catch(() => null);
  if (!ctx.alive()) return;
  const p = progress.get();
  const nTasks = Object.keys(p.tasks).length;
  const nKeys = Object.keys(p.keys).length;

  mount(ctx.root, html`
    <header class="page-head"><h1>Progress &amp; data</h1></header>

    <section class="panel">
      <h2>Your progress</h2>
      <p>${nTasks} tasks done, ${nKeys} keys ticked. Saved in this browser only.</p>
      <p class="muted small">To move it to another device (or keep a backup), copy this code and paste it into the box below on the other device.</p>
      <div class="code-row">
        <input class="code" id="export-code" readonly value="${encodeProgress(p)}" aria-label="Progress code">
        <button class="btn" type="button" id="copy-code">Copy</button>
      </div>
      <label class="field field-block"><span class="field-label">Paste a progress code</span>
        <textarea id="import-code" rows="3" placeholder="Paste a code from another device"></textarea>
      </label>
      <div class="btn-row">
        <button class="btn" type="button" data-import="merge">Add to my progress</button>
        <button class="btn btn-ghost" type="button" data-import="replace">Replace my progress</button>
      </div>
    </section>

    <section class="panel">
      <h2>Game data</h2>
      ${v ? html`<p>Data last updated <strong>${fmtDate(v.dataVersion)}</strong> (API ${v.implementationVersion}).</p>` : html`<p class="muted">Couldn't reach the data API.</p>`}
      <p class="muted small">Data is cached for offline use and refreshed in the background. Use this if something looks stale.</p>
      <button class="btn" type="button" id="refresh-data">Refresh data now</button>
    </section>

    <section class="panel">
      <h2>Reset</h2>
      <button class="btn btn-danger" type="button" id="reset">Clear all progress</button>
    </section>

    <section class="panel about">
      <h2>About</h2>
      <p>Unofficial fan-made companion for Gray Zone Warfare. Not affiliated with or endorsed by MADFINGER Games.</p>
      <p>Game data from the community <a href="https://gzw-data.dev/" rel="noopener" target="_blank">GZW Data API</a>, which sources it from the <a href="https://gray-zone-warfare.fandom.com/" rel="noopener" target="_blank">Gray Zone Warfare Wiki</a> (images and text CC BY-SA).</p>
    </section>
  `);

  const $ = (s) => ctx.root.querySelector(s);

  $('#copy-code').addEventListener('click', async () => {
    const code = $('#export-code').value;
    try {
      await navigator.clipboard.writeText(code);
      toast('Progress code copied');
    } catch {
      $('#export-code').select();
      toast('Select and copy the code manually');
    }
  });

  ctx.root.querySelectorAll('[data-import]').forEach((b) => b.addEventListener('click', () => {
    let next;
    try {
      next = decodeProgress($('#import-code').value);
    } catch {
      toast("That isn't a valid progress code");
      return;
    }
    if (b.dataset.import === 'replace') {
      if (!confirm('Replace your progress on this device with the pasted code?')) return;
      progress.replace(next);
    } else {
      progress.merge(next);
    }
    toast('Progress imported');
    ctx.rerender();
  }));

  $('#refresh-data').addEventListener('click', async () => {
    await refreshAll();
    toast('Fetching fresh data');
    setTimeout(() => location.reload(), 400);
  });

  $('#reset').addEventListener('click', () => {
    if (!confirm('Clear every ticked task and key on this device? This cannot be undone.')) return;
    progress.reset();
    toast('Progress cleared');
    ctx.rerender();
  });
}
