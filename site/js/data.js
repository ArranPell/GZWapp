// Enriched, app-level views of the raw datasets, shared across pages.

import { dataset, datasets } from './api.js';
import { splitObjectives, taskLocations, keyArea, taskMentions, collapseRepeat, applyFaction, parseFactions, LONG_STEP } from './lib.js';
import { prefs } from './store.js';
import { LOOT_DATASETS } from './catalog.js';

let tasksPromise = null;

// All tasks, each with parsed locations, objective steps and kind badges.
// `tasks` is the full list; the per-kind datasets only tell us the kind.
export function loadTasks() {
  if (!tasksPromise) {
    tasksPromise = datasets(['tasks', 'main_task', 'side_task', 'contract', 'hidden_task'])
      .then(([all, main, side, contract, hidden]) => {
        const ids = (rows) => new Set(rows.map((r) => r.id));
        const sets = { main: ids(main), side: ids(side), contract: ids(contract), hidden: ids(hidden) };
        const list = all.map((t) => {
          const parts = splitObjectives(t.objectives);
          const kinds = [];
          if (sets.main.has(t.id) || t.task_type === 'Main Task') kinds.push('Main');
          if (sets.contract.has(t.id) || t.task_type === 'Contract') kinds.push('Contract');
          if (sets.side.has(t.id) || t.task_type === 'Side Task') kinds.push('Side');
          if (sets.hidden.has(t.id) || /^yes$/i.test(t.hidden_task || '')) kinds.push('Hidden');
          return {
            ...t,
            briefing: collapseRepeat(t.briefing),
            areas: taskLocations(t),
            factions: parseFactions(t.faction),
            steps: parts.filter((s) => s.length <= LONG_STEP),
            notes: parts.filter((s) => s.length > LONG_STEP),
            kinds,
          };
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        const byId = new Map(list.map((t) => [t.id, t]));
        const byName = new Map(list.map((t) => [t.name.toLowerCase(), t]));
        return { list, byId, byName };
      })
      .catch((err) => { tasksPromise = null; throw err; });
  }
  return tasksPromise;
}

let keysPromise = null;

export function loadKeys() {
  if (!keysPromise) {
    keysPromise = Promise.all([datasets(['keys', 'keycards']), loadTasks()])
      .then(([[keys, cards], tasks]) => {
        const all = [
          ...keys.map((k) => ({ ...k, dataset: 'keys' })),
          ...cards.map((k) => ({ ...k, dataset: 'keycards' })),
        ]
          // The keys dataset includes a "Keys" category header row.
          .filter((k) => k.name !== 'Keys')
          .map((k) => ({ ...k, area: keyArea(k) }));
        const mentions = taskMentions(all, tasks.list);
        return all.map((k) => ({ ...k, tasks: mentions.get(k) || [] }));
      })
      .catch((err) => { keysPromise = null; throw err; });
  }
  return keysPromise;
}

let lootPromise = null;

export function loadLoot() {
  if (!lootPromise) {
    lootPromise = Promise.all([datasets(LOOT_DATASETS), loadTasks()])
      .then(([groups, tasks]) => {
        // loot_items is a catch-all that repeats most of the specific
        // categories. Merge by name, keeping the specific category.
        const byName = new Map();
        groups.forEach((rows, i) => rows.forEach((r) => {
          const key = r.name.toLowerCase();
          const prev = byName.get(key);
          const rec = { ...r, dataset: LOOT_DATASETS[i] };
          if (!prev) byName.set(key, rec);
          else if (prev.dataset === 'loot_items') byName.set(key, { ...prev, ...rec });
          else byName.set(key, { ...rec, ...prev });
        }));
        const all = [...byName.values()];
        const mentions = taskMentions(all, tasks.list);
        return all.map((r) => ({ ...r, tasks: mentions.get(r) || [] }));
      })
      .catch((err) => { lootPromise = null; throw err; });
  }
  return lootPromise;
}

// Tasks as the player's faction sees them (see applyFaction). `byId` here
// only holds tasks available to that faction.
export async function loadMyTasks() {
  const all = await loadTasks();
  const list = applyFaction(all.list, prefs.faction);
  return { ...all, list, byId: new Map(list.map((t) => [t.id, t])), all: all.list };
}

export async function findRecord(name, id) {
  const rows = await dataset(name);
  return rows.find((r) => r.id === id) || null;
}
