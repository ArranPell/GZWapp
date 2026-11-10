// Client for the community GZW Data API (https://gzw-data.dev/docs/).
// Whole datasets come from /export in one request each; the service worker
// keeps a copy so the app works offline and stays under the rate limit.

import { memoize } from './lib.js';

export const API_BASE = 'https://gzw-data.dev/api/v1';
export const API_CACHE = 'gzw-api-v1';

// The API allows 100 requests a minute per IP. Pages like Vendors pull
// dozens of datasets, so keep at most a few requests in flight.
const MAX_IN_FLIGHT = 6;
let inFlight = 0;
const waiting = [];

async function limited(fn) {
  // A finishing request hands its slot straight to the next in line, so a
  // new caller can't slip in between and exceed the cap.
  if (inFlight >= MAX_IN_FLIGHT) await new Promise((resolve) => waiting.push(resolve));
  else inFlight += 1;
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else inFlight -= 1;
  }
}

// The body is read inside the limited section so a slot stays taken until
// the download has actually finished.
function getJSON(path) {
  return limited(async () => {
    let res;
    try {
      res = await fetch(API_BASE + path);
    } catch {
      throw new Error('Network error reaching gzw-data.dev');
    }
    if (res.status === 429) throw new Error('The data API is rate limiting requests. Wait a minute and try again.');
    if (!res.ok) throw new Error(`The data API returned ${res.status}`);
    return res.json();
  });
}

export const dataset = memoize((name) => getJSON(`/export/${encodeURIComponent(name)}?limit=500`).then((j) => j.data || []));

export const datasets = (names) => Promise.all(names.map(dataset));

export const version = memoize(() => getJSON('/version').then((j) => j.data));

// Cross-dataset search. Returns { [dataset]: record[] }.
export async function search(q, limit = 20) {
  const j = await getJSON(`/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  return j.data?.results || {};
}

export async function refreshAll() {
  dataset.clear();
  version.clear();
  if ('caches' in window) await caches.delete(API_CACHE);
}
