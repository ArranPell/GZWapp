// Player progress, kept in localStorage on this device only.

const KEY = 'gzw.progress.v1';
const listeners = new Set();

function load() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    return { tasks: p?.tasks || {}, keys: p?.keys || {} };
  } catch {
    return { tasks: {}, keys: {} };
  }
}

let state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private browsing or storage full: progress lasts for this session only.
  }
  listeners.forEach((fn) => fn(state));
}

function setFlag(bucket, id, on) {
  if (on) state[bucket][id] = true;
  else delete state[bucket][id];
  save();
}

export const progress = {
  get: () => state,
  isTaskDone: (id) => !!state.tasks[id],
  setTaskDone: (id, on) => setFlag('tasks', id, on),
  isKeyOwned: (id) => !!state.keys[id],
  setKeyOwned: (id, on) => setFlag('keys', id, on),
  replace(next) {
    state = { tasks: { ...next.tasks }, keys: { ...next.keys } };
    save();
  },
  merge(next) {
    state = { tasks: { ...state.tasks, ...next.tasks }, keys: { ...state.keys, ...next.keys } };
    save();
  },
  reset() {
    state = { tasks: {}, keys: {} };
    save();
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

// Another tab changed progress: pick it up.
window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    state = load();
    listeners.forEach((fn) => fn(state));
  }
});

// Preferences: currently just the player's faction. '' = not chosen yet,
// 'all' = show every faction's tasks, otherwise a code from FACTIONS.
const PREFS_KEY = 'gzw.prefs.v1';

function loadPrefs() {
  try {
    return { faction: '', ...JSON.parse(localStorage.getItem(PREFS_KEY)) };
  } catch {
    return { faction: '' };
  }
}

let prefState = loadPrefs();

export const prefs = {
  get faction() { return prefState.faction; },
  setFaction(code) {
    prefState = { ...prefState, faction: code };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefState));
    } catch {
      // Not persisted; still applies for this session.
    }
  },
};
