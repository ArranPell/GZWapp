// Pure helpers for cleaning up the API's data. No DOM access here, so the
// test suite can import this module directly under Node.

// Regions from /regions plus a few sub-areas the data mentions on their own.
export const AREAS = [
  'Ban Pa', 'Blue Lagoon', 'Fort Narith', "Hunter's Paradise", 'Kiu Vongsa',
  'Midnight Sapphire', 'Nam Thaven', 'Pha Lang', 'Pha Lang Airfield', 'Sawmill',
  'Tiger Bay', 'YBL-1', 'Lamang Island',
];

// Alternate spellings that should collapse onto a canonical area.
const AREA_ALIASES = {
  lamang: 'Lamang Island',
};

// Objectives arrive as one run-on string. Each step starts with a capitalised
// imperative verb, which is what we split on.
const OBJECTIVE_VERBS = [
  'Access', 'Acquire', 'Ascertain', 'Bring', 'Buy', 'Check', 'Clear', 'Collect',
  'Confirm', 'Defend', 'Deliver', 'Destroy', 'Detonate', 'Disable', 'Drop',
  'Eliminate', 'Ensure', 'Equip', 'Escort', 'Explore', 'Extract', 'Find', 'Gather',
  'Go', 'Hack', 'Hand', 'Hide', 'Hunt', 'Identify', 'Inspect', 'Install',
  'Investigate', 'Kill', 'Listen', 'Locate', 'Loot', 'Mark', 'Meet', 'Neutralise',
  'Neutralize', 'Obtain', 'Photograph', 'Pick', 'Place', 'Plant', 'Purchase', 'Read',
  'Reach', 'Recover', 'Report', 'Rescue', 'Retrieve', 'Return', 'Sabotage', 'Scout',
  'Search', 'Secure', 'Sell', 'Speak', 'Stash', 'Survey', 'Survive', 'Tag', 'Take',
  'Talk', 'Transfer', 'Turn', 'Upload', 'Use', 'Verify', 'Visit',
];
const OBJECTIVE_SPLIT = new RegExp(`\\s+(?=(?:${OBJECTIVE_VERBS.join('|')})\\b)`);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normQuotes = (s) => s.replace(/[’‘`]/g, "'");

export function splitObjectives(text) {
  if (!text) return [];
  const seen = new Set();
  const steps = [];
  for (let part of normQuotes(text).split(OBJECTIVE_SPLIT)) {
    part = part.trim().replace(/\.$/, '');
    const key = part.toLowerCase();
    if (!part || seen.has(key)) continue;
    seen.add(key);
    steps.push(part);
  }
  return steps;
}

// About 50 briefings arrive as the same paragraph twice. Keep one copy.
export function collapseRepeat(text) {
  if (!text) return text;
  const s = text.replace(/\s+/g, ' ').trim();
  const mid = Math.floor(s.length / 2);
  for (let k = mid - 3; k <= mid + 3; k += 1) {
    if (k > 0 && k < s.length && s.slice(0, k).trim() === s.slice(k).trim()) return s.slice(0, k).trim();
  }
  return s;
}

const AREA_MATCHERS = [
  ...AREAS.map((a) => [a, a]),
  ...Object.entries(AREA_ALIASES),
]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([needle, area]) => [new RegExp(`(^|[^\\w'])${escapeRe(needle)}(?![\\w])`, 'i'), area]);

// Every known area named in `text`, in the order they appear. Longest names
// win, so "Pha Lang Airfield" is not also counted as "Pha Lang".
export function findAreas(text) {
  if (!text) return [];
  let rest = normQuotes(text);
  const found = [];
  for (const [re, area] of AREA_MATCHERS) {
    let m;
    while ((m = re.exec(rest))) {
      const start = m.index + m[1].length;
      const end = m.index + m[0].length;
      found.push([start, area]);
      rest = rest.slice(0, start) + ' '.repeat(end - start) + rest.slice(end);
    }
  }
  return [...new Set(found.sort((a, b) => a[0] - b[0]).map(([, area]) => area))];
}

const titleCase = (s) => s.replace(/\b([a-z])/g, (c) => c.toUpperCase());

// Task locations are free text with mixed separators and casing.
export function taskLocations(task) {
  const loc = task?.location?.trim();
  if (!loc) return [];
  const areas = findAreas(loc);
  if (areas.length) return areas;
  return loc.split(',').map((s) => titleCase(s.trim())).filter(Boolean);
}

// Player factions and their starter towns. Each faction runs the same
// starter tasks in its own town, so the API stores those tasks once with all
// three towns as the location.
export const FACTIONS = {
  LRI: { name: 'Lamang Recovery Initiative', match: 'LRI|Lamang Recovery', start: 'Pha Lang' },
  CSI: { name: 'Crimson Shield International', match: 'CSI|Crimson Shield', start: 'Kiu Vongsa' },
  MSS: { name: 'Mithras Security Systems', match: 'MSS|Mithras', start: 'Nam Thaven' },
};
const STARTER_TOWNS = Object.values(FACTIONS).map((f) => f.start);

// The task "faction" field is free text: "LRI", "CSI,LRI", "MSS / CSI",
// "Lamang Recovery Initiative". Returns faction codes; [] means everyone.
export function parseFactions(text) {
  if (!text) return [];
  const found = new Set();
  for (const [code, f] of Object.entries(FACTIONS)) {
    if (new RegExp(`\\b(${f.match})\\b`, 'i').test(text)) found.add(code);
  }
  return [...found];
}

// Tasks as one faction sees them: other factions' exclusives removed and the
// shared starter tasks placed in this faction's town. A falsy or 'all'
// faction returns the list unchanged.
export function applyFaction(tasks, faction) {
  const f = FACTIONS[faction];
  if (!f) return tasks;
  return tasks
    .filter((t) => !t.factions?.length || t.factions.includes(faction))
    .map((t) => {
      const starters = t.areas.filter((a) => STARTER_TOWNS.includes(a));
      if (starters.length < 2) return t;
      return { ...t, areas: [f.start, ...t.areas.filter((a) => !STARTER_TOWNS.includes(a))] };
    });
}

// Keys outside the main regions still name their spot ("...in Fanny
// Paradise"), so that phrase becomes the group rather than "Unknown".
export function keyArea(key) {
  const known = findAreas(key.usage)[0] || findAreas(key.name)[0];
  if (known) return known;
  const m = normQuotes(key.usage || '').match(/\b(?:in|at) (?:the )?([^,.]+?)(?: region)?\.?$/i);
  return m ? titleCase(m[1].trim()) : 'Unknown';
}

// Some objectives carry whole pasted wiki walkthroughs. Past this length a
// "step" is shown as notes rather than a checklist line.
export const LONG_STEP = 160;

export const VENDORS = ['Artisan', 'Banshee', 'Gunny', 'Handshake', 'Lab Rat', 'Turncoat', 'Vulture'];
export const MAX_REP = 4;

// A few tasks arrive without a vendor field, but their objectives still say
// who to report to ("…and report back to Turncoat").
const REPORT_TO_RE = new RegExp(`\\b(?:report(?:\\s+back)?|deliver(?:\\s+it)?|bring(?:\\s+it)?|hand(?:\\s+it)?(?:\\s+in)?)\\s+(?:\\S+\\s+){0,6}?to\\s+(${VENDORS.join('|')})\\b`, 'i');

export function taskVendor(task) {
  if (task?.vendor) return task.vendor;
  const m = normQuotes(`${task?.objectives || ''} ${task?.briefing || ''}`).match(REPORT_TO_RE);
  return m ? VENDORS.find((v) => v.toLowerCase() === m[1].toLowerCase()) : '';
}

// The sold_by field has ~77 spellings: "Turncoat R.2", "Artisan R3",
// "Gunny L3", "Handshake Rank 4", "Lab Rat LL2", "Gunny level 4",
// "Gunny R.2 and Banshee R.3", "Turncoat after Like a Boss - …", "R.??".
// Returns one offer per vendor named: { vendor, rep (number or null),
// after (unlocking task or null) }. Loot-only, rewards and "???" give [].
const OFFER_RE = new RegExp(
  `\\b(${VENDORS.join('|')})\\b(?:\\s*(?:R|Rank|Lv|LL|L|level)\\.?\\s*(\\d|\\?+))?(?:\\s+after\\s+(.+?)\\s*$)?`,
  'gi',
);

export function parseOffers(soldBy) {
  if (!soldBy) return [];
  const offers = [];
  for (const m of String(soldBy).matchAll(OFFER_RE)) {
    const vendor = VENDORS.find((v) => v.toLowerCase() === m[1].toLowerCase());
    if (offers.some((o) => o.vendor === vendor)) continue;
    const rep = m[2] && /^\d$/.test(m[2]) ? Number(m[2]) : null;
    offers.push({ vendor, rep: rep >= 1 && rep <= MAX_REP ? rep : null, after: m[3] || null });
  }
  return offers;
}

// Wiki guides for hidden tasks usually say how the task starts ("To trigger
// this task you will need to…"). Returns that sentence, or ''.
const TRIGGER_RE = /\b(?:trigger(?:s|ed)?|to (?:start|unlock|begin|activate|get) (?:this|the) (?:task|quest|mission)|(?:task|quest) (?:starts|begins|is started|is unlocked))\b/i;

export function findTrigger(text) {
  if (!text) return '';
  const sentences = String(text).split(/\s*\n\s*|(?<=[.!?])\s+(?=[A-Z])/);
  return sentences.map((s) => s.replace(/\s+/g, ' ').trim()).find((s) => TRIGGER_RE.test(s)) || '';
}

// Guide sections run to the end of the page on the wiki, often with their
// own level-2 headings ("Step 1", "Required Items"). These end it.
export const GUIDE_STOP = new Set(['trivia', 'gallery', 'references', 'videos', 'video', 'history', 'changelog', 'change log', 'see also', 'navigation', 'patch history']);

// Task list sections: one per region, the player's starting town first,
// then A–Z, with tasks that name no region last. Tasks spanning regions sit
// under the first one named.
export const NO_REGION = 'Anywhere / not stated';

export function groupByRegion(tasks, first = '') {
  const groups = new Map();
  for (const t of tasks) {
    const area = t.areas?.[0] || NO_REGION;
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area).push(t);
  }
  const rank = (a) => (a === first ? 0 : a === NO_REGION ? 2 : 1);
  return [...groups].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

// Names too generic to link on their own without flooding every task.
const GENERIC_NAMES = new Set(['key', 'intel', 'phone', 'laptop', 'documents', 'notes', 'map']);

// Which tasks mention each item by name in their briefing or objectives.
// Returns Map<item, task[]>. The API has no structured link, so this is text
// matching and will miss items a task refers to by a different name.
export function taskMentions(items, tasks) {
  const haystacks = tasks.map((t) => normQuotes(`${t.name} ${t.briefing || ''} ${t.objectives || ''}`).toLowerCase());
  const out = new Map();
  for (const item of items) {
    const name = normQuotes(item.name || '').toLowerCase().trim();
    if (name.length < 4 || GENERIC_NAMES.has(name)) continue;
    const re = new RegExp(`(^|[^\\w])${escapeRe(name)}(?![\\w])`);
    const hits = tasks.filter((_, i) => re.test(haystacks[i]));
    if (hits.length) out.set(item, hits);
  }
  return out;
}

const LABEL_OVERRIDES = {
  nij_class: 'NIJ class',
  lz_callsign: 'LZ callsign',
  'inventory_layout_(x/y)': 'Inventory layout',
  sold_by: 'Sold by',
  grid_size: 'Grid size',
  requirements_text: 'Requirements',
  outcome_text: 'Outcome',
  rewards_text: 'Rewards',
};

export function fieldLabel(key) {
  if (LABEL_OVERRIDES[key]) return LABEL_OVERRIDES[key];
  const s = key.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Numeric value for sorting: prefer the API's parsed numeric_values, fall
// back to the leading number in the display string ("$75,452", "20").
export function numericField(record, key) {
  const nv = record?.numeric_values?.[key];
  if (nv && typeof nv.value === 'number') return nv.value;
  const raw = record?.[key];
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return null;
  const m = raw.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function searchText(record) {
  return normQuotes(
    Object.entries(record)
      .filter(([k, v]) => typeof v === 'string' && k !== 'image' && k !== 'id')
      .map(([, v]) => v)
      .join(' '),
  ).toLowerCase();
}

export function matchesQuery(record, query) {
  const q = normQuotes(query || '').toLowerCase().trim();
  if (!q) return true;
  const text = searchText(record);
  return q.split(/\s+/).every((word) => text.includes(word));
}

// Progress codes: a compact, copy-pasteable string for moving one
// character between devices. base64url(JSON) so it survives chat apps.
// v2 adds name, faction and vendor rep; v1 codes (tasks and keys only)
// still import.
export function encodeProgress(c) {
  const payload = JSON.stringify({
    v: 2,
    n: c.name || undefined,
    f: c.faction || undefined,
    t: Object.keys(c.tasks || {}),
    k: Object.keys(c.keys || {}),
    r: c.rep && Object.keys(c.rep).length ? c.rep : undefined,
  });
  const b64 = typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(payload)))
    : Buffer.from(payload, 'utf8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeProgress(code) {
  const b64 = String(code).trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const json = typeof atob === 'function'
    ? decodeURIComponent(escape(atob(padded)))
    : Buffer.from(padded, 'base64').toString('utf8');
  const data = JSON.parse(json);
  if (![1, 2].includes(data?.v) || !Array.isArray(data.t) || !Array.isArray(data.k)) throw new Error('Not a progress code');
  const toMap = (ids) => Object.fromEntries(ids.filter((id) => typeof id === 'string').map((id) => [id, true]));
  const rep = {};
  for (const [vendor, level] of Object.entries(data.r || {})) {
    if (VENDORS.includes(vendor) && Number.isInteger(level) && level >= 1 && level <= MAX_REP) rep[vendor] = level;
  }
  return {
    name: typeof data.n === 'string' ? data.n.slice(0, 40) : '',
    faction: typeof data.f === 'string' && (FACTIONS[data.f] || data.f === 'all') ? data.f : '',
    tasks: toMap(data.t),
    keys: toMap(data.k),
    rep,
  };
}

// A cached async load: idle → pending → resolved, or back to idle if it
// fails so the next call retries. Calls with the same key share one promise.
// clear() forgets everything (used by "Refresh data").
export function memoize(load) {
  const memo = new Map();
  const fn = (key) => {
    if (!memo.has(key)) {
      memo.set(key, Promise.resolve().then(() => load(key)).catch((err) => {
        memo.delete(key);
        throw err;
      }));
    }
    return memo.get(key);
  };
  fn.clear = () => memo.clear();
  return fn;
}

// Page filters live in the URL so they survive reloads and the back button.
// A schema maps each filter to its default: a string means free text with
// that default; an array lists the allowed values, first one the default.
//
// parseFilters reads a URLSearchParams or FormData. Keys the source doesn't
// have keep their value from `prev` (so a form without the vendor chips
// doesn't reset the vendor). Values outside an array's list fall back to the
// default, so the page and its dropdowns always agree.
const filterDefault = (spec) => (Array.isArray(spec) ? spec[0] : spec);

export function parseFilters(schema, source, prev = {}) {
  const out = {};
  for (const [k, spec] of Object.entries(schema)) {
    if (!source.has(k)) {
      out[k] = prev[k] ?? filterDefault(spec);
      continue;
    }
    const v = String(source.get(k) ?? '');
    out[k] = Array.isArray(spec) && !spec.includes(v) ? spec[0] : v;
  }
  return out;
}

// The query-string form of a filter state: defaults become '' so they drop
// out of the URL, keeping links short.
export function filterParams(schema, f) {
  return Object.fromEntries(Object.entries(schema).map(([k, spec]) => [k, f[k] === filterDefault(spec) ? '' : f[k]]));
}
