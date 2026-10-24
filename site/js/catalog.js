// How the API's ~90 datasets are grouped in the database browser. Task
// datasets live in the tracker instead; "gear", "cleanup" and the combined
// views (armor, weapon_parts, helmet_mods) duplicate or mix other datasets.

export const GROUPS = [
  { id: 'weapons', label: 'Weapons & ammo', datasets: ['weapons', 'ammo', 'magazines', 'throwables', 'mortar_rounds'] },
  {
    id: 'attachments',
    label: 'Weapon parts',
    datasets: [
      'scopes', 'collimators', 'suppressors', 'muzzle_devices', 'barrels', 'handguards', 'upper_receivers',
      'stocks', 'stock_adapters', 'buffer_tubes', 'pistol_grips', 'foregrips', 'mounts', 'tactical_devices',
      'gas_blocks', 'charging_handle', 'slides', 'front_iron_sights', 'rear_iron_sights', 'auxiliary',
    ],
  },
  {
    id: 'armour',
    label: 'Armour & gear',
    datasets: [
      'vests', 'plate_carriers', 'helmets', 'helmet_mounts', 'night_vision', 'headsets', 'glasses', 'face_cover',
      'rigs', 'backpacks', 'belts', 'containers', 'binoculars', 'items',
    ],
  },
  { id: 'clothing', label: 'Clothing', datasets: ['shirts', 'trousers', 'gloves', 'boots', 'apparel_items'] },
  { id: 'consumables', label: 'Meds & provisions', datasets: ['medical', 'food', 'drinks', 'provisions', 'vices', 'repair_kits'] },
  {
    id: 'loot',
    label: 'Loot',
    datasets: [
      'loot_items', 'task_items', 'valuables', 'jewellery', 'funds', 'electronics', 'household_item',
      'laboratory_supplies', 'workshop_supplies', 'military_equipment', 'military_material', 'tools',
      'intels', 'reading_intel', 'newspapers', 'paper', 'lockboxes',
    ],
  },
  { id: 'keys', label: 'Keys', datasets: ['keys', 'keycards'] },
  { id: 'world', label: 'World', datasets: ['regions', 'vendors', 'factions', 'bosses', 'loot_container', 'loot_containers'] },
  { id: 'other', label: 'Other', datasets: ['squad_strike_missions', 'squad_strike_missions_item', 'upcoming_content', 'removed_content'] },
];

// Datasets whose records are tasks, and open in the task view.
export const TASK_DATASETS = ['tasks', 'main_task', 'side_task', 'hidden_task', 'contract', 'contracts'];

// Loot finder sources.
export const LOOT_DATASETS = GROUPS.find((g) => g.id === 'loot').datasets;

const LABELS = {
  ammo: 'Ammunition',
  apparel_items: 'Apparel',
  auxiliary: 'Auxiliary parts',
  charging_handle: 'Charging handles',
  collimators: 'Red dots & holos',
  containers: 'Storage containers',
  face_cover: 'Face covers',
  funds: 'Credit cards',
  household_item: 'Household items',
  items: 'Tracking tags',
  intels: 'Intel',
  jewellery: 'Jewellery',
  laboratory_supplies: 'Lab supplies',
  loot_container: 'Loot containers',
  loot_containers: 'Loot crates',
  loot_items: 'Loot items',
  military_material: 'Military materials',
  mortar_rounds: 'Mortar rounds',
  night_vision: 'Night vision',
  paper: 'Paper',
  reading_intel: 'Reading intel',
  removed_content: 'Removed content',
  squad_strike_missions: 'Squad Strike missions',
  squad_strike_missions_item: 'Squad Strike items',
  task_items: 'Task items',
  upcoming_content: 'Upcoming content',
  vices: 'Vices',
  main_task: 'Main tasks',
  side_task: 'Side tasks',
  hidden_task: 'Hidden tasks',
  contract: 'Contracts',
  contracts: 'Contracts',
  tasks: 'Tasks',
};

export function datasetLabel(name) {
  if (LABELS[name]) return LABELS[name];
  const s = name.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function groupOf(name) {
  return GROUPS.find((g) => g.datasets.includes(name));
}

// Fields worth showing on a card, in priority order.
export const SUMMARY_FIELDS = [
  'type', 'caliber', 'nij_class', 'protection_rating', 'fire_rate', 'accuracy', 'effect', 'usage', 'slots',
  'grid_size', 'weight', 'sold_by', 'tier', 'locals_type', 'location', 'vendor', 'full_name', 'faction',
];

// Fields never shown in the generic field table.
export const HIDDEN_FIELDS = new Set(['id', 'name', 'image', 'numeric_values']);
