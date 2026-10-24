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

// "Turncoat R.2" -> { vendor: "Turncoat", rep: 2 }
export function parseSoldBy(soldBy) {
  if (!soldBy) return null;
  const m = String(soldBy).trim().match(/^(.*?)\s*R\.?\s*(\d+)$/i);
  return m ? { vendor: m[1].trim(), rep: Number(m[2]) } : { vendor: String(soldBy).trim(), rep: null };
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

// Progress codes: a compact, copy-pasteable string for moving progress
// between devices. base64url(JSON) so it survives chat apps.
export function encodeProgress(progress) {
  const payload = JSON.stringify({ v: 1, t: Object.keys(progress.tasks || {}), k: Object.keys(progress.keys || {}) });
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
  if (data?.v !== 1 || !Array.isArray(data.t) || !Array.isArray(data.k)) throw new Error('Not a progress code');
  const toMap = (ids) => Object.fromEntries(ids.filter((id) => typeof id === 'string').map((id) => [id, true]));
  return { tasks: toMap(data.t), keys: toMap(data.k) };
}
