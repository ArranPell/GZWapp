// Client for the community GZW Data API (https://gzw-data.dev/docs/).
// Whole datasets come from /export in one request each; the service worker
// keeps a copy so the app works offline and stays under the rate limit.

export const API_BASE = 'https://gzw-data.dev/api/v1';
export const API_CACHE = 'gzw-api-v1';

const memo = new Map();

async function getJSON(path) {
  let res;
  try {
    res = await fetch(API_BASE + path);
  } catch {
    throw new Error('Network error reaching gzw-data.dev');
  }
  if (res.status === 429) throw new Error('The data API is rate limiting requests. Wait a minute and try again.');
  if (!res.ok) throw new Error(`The data API returned ${res.status}`);
  return res.json();
}

function cached(key, load) {
  if (!memo.has(key)) {
    memo.set(key, load().catch((err) => { memo.delete(key); throw err; }));
  }
  return memo.get(key);
}

export function dataset(name) {
  return cached(`ds:${name}`, () => getJSON(`/export/${encodeURIComponent(name)}?limit=500`).then((j) => j.data || []));
}

export const datasets = (names) => Promise.all(names.map(dataset));

export function version() {
  return cached('version', () => getJSON('/version').then((j) => j.data));
}

// Cross-dataset search. Returns { [dataset]: record[] }.
export async function search(q, limit = 20) {
  const j = await getJSON(`/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  return j.data?.results || {};
}

export async function refreshAll() {
  memo.clear();
  if ('caches' in window) await caches.delete(API_CACHE);
}
