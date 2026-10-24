// Tiny HTML templating: values are escaped unless wrapped in raw() or produced
// by another html`` call. Arrays are joined.

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const raw = (s) => new Raw(String(s));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function render(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Raw(out);
}

export function mount(el, content) {
  el.innerHTML = render(content);
}

// Wiki images refuse requests that carry a third-party referrer, hence
// no-referrer (also set site-wide in index.html).
export function img(src, alt = '', cls = 'thumb') {
  if (!src) return html`<div class="${cls} thumb-empty" aria-hidden="true"></div>`;
  return html`<img class="${cls}" src="${src}" alt="${alt}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
}

// List row: thumbnail, linked title, subtitle, optional extras (which may
// hold their own links, so the row itself is not one big <a>) and a trailing
// control such as a checkbox.
export function row({ link, image, title, sub, extra = '', trailing = '', cls = '' }) {
  return html`<li class="row ${cls}">
    <a class="row-img" href="${link}" tabindex="-1" aria-hidden="true">${img(image, '')}</a>
    <div class="row-text">
      <a class="row-title" href="${link}">${title}</a>
      ${sub ? html`<span class="row-sub muted">${sub}</span>` : ''}
      ${extra}
    </div>
    ${trailing}
  </li>`;
}

export const loading =(label = 'Loading') => html`<div class="state"><div class="spinner" aria-hidden="true"></div><p>${label}…</p></div>`;

export function errorState(err, retry = true) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return html`<div class="state state-error">
    <p><strong>${offline ? "You're offline" : "Couldn't load the data"}</strong></p>
    <p class="muted">${offline ? 'This page has not been cached yet. Connect once and it will work offline after.' : err?.message || String(err)}</p>
    ${retry ? html`<button class="btn" data-action="retry">Try again</button>` : ''}
  </div>`;
}

export const empty = (msg) => html`<div class="state"><p class="muted">${msg}</p></div>`;

export function href(path, params) {
  const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString() : '';
  return `#${path}${qs ? `?${qs}` : ''}`;
}

export const itemHref = (dataset, id) => `#/item/${encodeURIComponent(dataset)}/${encodeURIComponent(id)}`;
export const taskHref = (id) => `#/task/${encodeURIComponent(id)}`;

export function select(name, options, value, label) {
  return html`<label class="field"><span class="field-label">${label}</span>
    <select name="${name}">${options.map(([v, text]) => html`<option value="${v}" ${v === value ? raw('selected') : ''}>${text}</option>`)}</select>
  </label>`;
}

export function searchBox(value, placeholder = 'Filter') {
  return html`<label class="field field-grow"><span class="field-label">Search</span>
    <input type="search" name="q" value="${value || ''}" placeholder="${placeholder}" autocomplete="off" enterkeyhint="search">
  </label>`;
}

export function progressBar(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return html`<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
    <div class="progress-fill" style="width:${pct}%"></div>
  </div>`;
}

export function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.classList.add('toast-out'), 2200);
  setTimeout(() => el.remove(), 2600);
}

export function debounce(fn, ms = 150) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const fmtCount = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
