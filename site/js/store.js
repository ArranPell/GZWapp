// Characters and their progress, kept in localStorage on this device only.
// The game allows up to 4 characters; each has its own name, faction,
// finished tasks, owned keys and vendor reputation.
//
// `progress` and `prefs` act on the active character, so pages don't need
// to know characters exist.

export const MAX_CHARACTERS = 4;

const KEY = 'gzw.characters.v1';
const LEGACY_PROGRESS = 'gzw.progress.v1';
const LEGACY_PREFS = 'gzw.prefs.v1';
const listeners = new Set();

const newId = () => Math.random().toString(36).slice(2, 10);

function blank(name, extra = {}) {
  return { id: newId(), name, faction: '', tasks: {}, keys: {}, rep: {}, ...extra };
}

function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function clean(c, i) {
  return {
    id: typeof c?.id === 'string' ? c.id : newId(),
    name: typeof c?.name === 'string' && c.name.trim() ? c.name.trim().slice(0, 40) : `Character ${i + 1}`,
    faction: typeof c?.faction === 'string' ? c.faction : '',
    tasks: c?.tasks && typeof c.tasks === 'object' ? c.tasks : {},
    keys: c?.keys && typeof c.keys === 'object' ? c.keys : {},
    rep: c?.rep && typeof c.rep === 'object' ? c.rep : {},
  };
}

function load() {
  const saved = readJSON(KEY);
  if (Array.isArray(saved?.list) && saved.list.length) {
    const list = saved.list.slice(0, MAX_CHARACTERS).map(clean);
    const active = list.some((c) => c.id === saved.active) ? saved.active : list[0].id;
    return { active, list };
  }
  // First run after the characters update: progress and faction from the
  // single-profile version become character 1.
  const old = readJSON(LEGACY_PROGRESS);
  const prefs = readJSON(LEGACY_PREFS);
  const first = blank('Character 1', {
    tasks: old?.tasks || {},
    keys: old?.keys || {},
    faction: prefs?.faction || '',
  });
  return { active: first.id, list: [first] };
}

let state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private browsing or storage full: changes last for this session only.
  }
  listeners.forEach((fn) => fn(state));
}

const current = () => state.list.find((c) => c.id === state.active);

function update(id, patch) {
  state = { ...state, list: state.list.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
  save();
}

function setFlag(bucket, id, on) {
  const c = current();
  const next = { ...c[bucket] };
  if (on) next[id] = true;
  else delete next[id];
  update(c.id, { [bucket]: next });
}

export const characters = {
  list: () => state.list,
  active: current,
  switchTo(id) {
    if (id === state.active || !state.list.some((c) => c.id === id)) return;
    state = { ...state, active: id };
    save();
  },
  add(name) {
    if (state.list.length >= MAX_CHARACTERS) return null;
    const c = blank(name?.trim() || `Character ${state.list.length + 1}`);
    state = { active: c.id, list: [...state.list, c] };
    save();
    return c;
  },
  rename(id, name) {
    if (name.trim()) update(id, { name: name.trim().slice(0, 40) });
  },
  setFaction(id, faction) { update(id, { faction }); },
  setRep(id, vendor, level) {
    const c = state.list.find((x) => x.id === id);
    const rep = { ...c.rep };
    if (level) rep[vendor] = level;
    else delete rep[vendor];
    update(id, { rep });
  },
  remove(id) {
    if (state.list.length <= 1) return;
    const list = state.list.filter((c) => c.id !== id);
    state = { active: state.active === id ? list[0].id : state.active, list };
    save();
  },
};

export const progress = {
  get: () => current(),
  isTaskDone: (id) => !!current().tasks[id],
  setTaskDone: (id, on) => setFlag('tasks', id, on),
  isKeyOwned: (id) => !!current().keys[id],
  setKeyOwned: (id, on) => setFlag('keys', id, on),
  repWith: (vendor) => current().rep[vendor] || 0,
  // Imports apply to the active character. Name, faction and rep come
  // along when the code carries them and replace=true or they're unset.
  replace(next) {
    const c = current();
    update(c.id, {
      tasks: { ...next.tasks },
      keys: { ...next.keys },
      rep: { ...(next.rep || {}) },
      faction: next.faction || c.faction,
      name: next.name || c.name,
    });
  },
  merge(next) {
    const c = current();
    // Rep only goes up in game, so the higher level wins.
    const rep = { ...c.rep };
    for (const [v, level] of Object.entries(next.rep || {})) rep[v] = Math.max(rep[v] || 0, level);
    update(c.id, {
      tasks: { ...c.tasks, ...next.tasks },
      keys: { ...c.keys, ...next.keys },
      rep,
      faction: c.faction || next.faction || '',
    });
  },
  reset() {
    update(current().id, { tasks: {}, keys: {}, rep: {} });
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

// '' = not chosen yet, 'all' = every faction's tasks, else a FACTIONS code.
export const prefs = {
  get faction() { return current().faction; },
  setFaction(code) { update(current().id, { faction: code }); },
};

// Another tab changed something: pick it up.
window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    state = load();
    listeners.forEach((fn) => fn(state));
  }
});
