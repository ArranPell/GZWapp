import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitObjectives, findAreas, taskLocations, keyArea, parseSoldBy, taskMentions,
  fieldLabel, numericField, matchesQuery, encodeProgress, decodeProgress, collapseRepeat,
  parseFactions, applyFaction,
} from '../site/js/lib.js';

test('splitObjectives splits on leading verbs and drops repeats', () => {
  const raw = 'Retrieve the promised phone and report back to Turncoat Locate the phone in Chon village '
    + 'Locate the phone in Chon village Neutralize 5 Turncoat\'s former "friends" in Chon village';
  assert.deepEqual(splitObjectives(raw), [
    'Retrieve the promised phone and report back to Turncoat',
    'Locate the phone in Chon village',
    'Neutralize 5 Turncoat\'s former "friends" in Chon village',
  ]);
});

test('splitObjectives keeps time windows attached and handles empty input', () => {
  assert.deepEqual(splitObjectives('Retrieve the intel from Ban Pa and report back to Artisan (22:00 - 5:00)'), [
    'Retrieve the intel from Ban Pa and report back to Artisan (22:00 - 5:00)',
  ]);
  assert.deepEqual(splitObjectives(null), []);
  assert.deepEqual(splitObjectives(''), []);
});

test('splitObjectives handles "Pick up" and curly quotes', () => {
  assert.deepEqual(splitObjectives('Pick up the package Deliver it to Gunny’s stash Pick up the package'), [
    'Pick up the package',
    "Deliver it to Gunny's stash",
  ]);
});

test('findAreas prefers longer names and keeps order', () => {
  assert.deepEqual(findAreas('Pha Lang Airfield'), ['Pha Lang Airfield']);
  assert.deepEqual(findAreas('Kiu Vongsa , Nam Thaven , Pha Lang'), ['Kiu Vongsa', 'Nam Thaven', 'Pha Lang']);
  assert.deepEqual(
    findAreas("Sawmill Blue Lagoon Hunter's Paradise Ban Pa Pha Lang Airfield YBL-1"),
    ['Sawmill', 'Blue Lagoon', "Hunter's Paradise", 'Ban Pa', 'Pha Lang Airfield', 'YBL-1'],
  );
});

test('findAreas is case-insensitive and normalises aliases', () => {
  assert.deepEqual(findAreas('Fort narith'), ['Fort Narith']);
  assert.deepEqual(findAreas('Ban pa'), ['Ban Pa']);
  assert.deepEqual(findAreas('Lamang'), ['Lamang Island']);
  assert.deepEqual(findAreas('Lamang Island'), ['Lamang Island']);
  assert.deepEqual(findAreas('North of Ban Pa'), ['Ban Pa']);
});

test('findAreas does not match inside other words', () => {
  assert.deepEqual(findAreas('Ban Pan'), []);
  assert.deepEqual(findAreas('Sawmills'), []);
});

test('taskLocations falls back to raw text for unknown places', () => {
  assert.deepEqual(taskLocations({ location: 'Starting town' }), ['Starting Town']);
  assert.deepEqual(taskLocations({ location: 'Fort Narith Midnight Sapphire' }), ['Fort Narith', 'Midnight Sapphire']);
  assert.deepEqual(taskLocations({}), []);
});

test('keyArea reads the usage text, then the name', () => {
  assert.equal(keyArea({ name: 'A102 Key', usage: 'Unlocks door A102 in Fort Narith' }), 'Fort Narith');
  assert.equal(
    keyArea({ name: 'Dongphou Hiking Camp Cottage Key', usage: 'Unlocks door Cottage in the Hiking Camp, west of Pha Lang' }),
    'Pha Lang',
  );
  assert.equal(
    keyArea({ name: 'Hunter’s Paradise Weapon Storage Key', usage: "Unlocks door Weapon Storage in Hunter's Paradise" }),
    "Hunter's Paradise",
  );
  assert.equal(keyArea({ name: 'Ban Pa Shed Key' }), 'Ban Pa');
  assert.equal(keyArea({ name: 'Fanny Paradise Office Key', usage: "Unlocks door manager's office in Fanny Paradise" }), 'Fanny Paradise');
  assert.equal(keyArea({ name: 'Siang Radio Station Room Key', usage: 'Unlocks door Radio Station room in Siang Radio Station.' }), 'Siang Radio Station');
  assert.equal(keyArea({ name: 'PLA Shed' }), 'Unknown');
});

test('parseSoldBy splits vendor and reputation level', () => {
  assert.deepEqual(parseSoldBy('Turncoat R.2'), { vendor: 'Turncoat', rep: 2 });
  assert.deepEqual(parseSoldBy('Lab Rat R.1'), { vendor: 'Lab Rat', rep: 1 });
  assert.deepEqual(parseSoldBy('Handshake'), { vendor: 'Handshake', rep: null });
  assert.equal(parseSoldBy(undefined), null);
});

test('taskMentions links items named in task text on word boundaries', () => {
  const tasks = [
    { id: 'a', name: 'Too Close to the Sun', objectives: 'Retrieve the Flight Recorder and report back' },
    { id: 'b', name: 'Other', briefing: 'Find the flight recorders' },
  ];
  const recorder = { name: 'Flight Recorder' };
  const key = { name: 'Key' };
  const m = taskMentions([recorder, key], tasks);
  assert.deepEqual(m.get(recorder).map((t) => t.id), ['a']);
  assert.equal(m.has(key), false);
});

test('fieldLabel humanises API keys', () => {
  assert.equal(fieldLabel('fire_rate'), 'Fire rate');
  assert.equal(fieldLabel('nij_class'), 'NIJ class');
  assert.equal(fieldLabel('inventory_layout_(x/y)'), 'Inventory layout');
});

test('numericField prefers numeric_values and parses display strings', () => {
  assert.equal(numericField({ weight: '3.553 kg', numeric_values: { weight: { value: 3.553 } } }, 'weight'), 3.553);
  assert.equal(numericField({ buy_price: '$75,452' }, 'buy_price'), 75452);
  assert.equal(numericField({ slots: '20' }, 'slots'), 20);
  assert.equal(numericField({}, 'slots'), null);
});

test('matchesQuery requires every word', () => {
  const r = { name: 'AK-12', caliber: '5.45x39mm', image: 'https://x/ak.png' };
  assert.ok(matchesQuery(r, 'ak 5.45'));
  assert.ok(matchesQuery(r, ''));
  assert.ok(!matchesQuery(r, 'ak 7.62'));
  assert.ok(!matchesQuery(r, 'png'));
});

test('collapseRepeat keeps one copy of a doubled paragraph', () => {
  const once = 'I need your help. Focus on the checkpoint west of Tiger Bay. Good luck.';
  assert.equal(collapseRepeat(`${once} ${once}`), once);
  assert.equal(collapseRepeat(`${once}  ${once}\n`), once);
  assert.equal(collapseRepeat(once), once);
  assert.equal(collapseRepeat('Go. Go.'), 'Go.');
  assert.equal(collapseRepeat(undefined), undefined);
});

test('progress codes round-trip', () => {
  const progress = { tasks: { 'a-shot-in-the-dark': true, 'big-fish': true }, keys: { 'a102-key': true } };
  const code = encodeProgress(progress);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeProgress(code), progress);
  assert.throws(() => decodeProgress('not-a-code'));
});

test('parseFactions reads codes and full names', () => {
  assert.deepEqual(parseFactions('LRI'), ['LRI']);
  assert.deepEqual(parseFactions('Lamang Recovery Initiative'), ['LRI']);
  assert.deepEqual(parseFactions('CSI,LRI').sort(), ['CSI', 'LRI']);
  assert.deepEqual(parseFactions('MSS / CSI').sort(), ['CSI', 'MSS']);
  assert.deepEqual(parseFactions(undefined), []);
  // "Lamang Army Forces" is not the LRI player faction.
  assert.deepEqual(parseFactions('Lamang Army Forces'), []);
});

test('applyFaction hides other factions and localises starter tasks', () => {
  const tasks = [
    { id: 'shared', areas: ['Kiu Vongsa', 'Nam Thaven', 'Pha Lang'], factions: [] },
    { id: 'starter-plus', areas: ['Kiu Vongsa', 'Nam Thaven', 'Pha Lang', 'Tiger Bay'], factions: [] },
    { id: 'csi-only', areas: ['Lamang Island'], factions: ['CSI'] },
    { id: 'lri-only', areas: ['Tiger Bay'], factions: ['LRI'] },
    { id: 'near-town', areas: ['Nam Thaven'], factions: [] },
  ];
  const lri = applyFaction(tasks, 'LRI');
  assert.deepEqual(lri.map((t) => t.id), ['shared', 'starter-plus', 'lri-only', 'near-town']);
  assert.deepEqual(lri[0].areas, ['Pha Lang']);
  assert.deepEqual(lri[1].areas, ['Pha Lang', 'Tiger Bay']);
  assert.deepEqual(lri[3].areas, ['Nam Thaven'], 'a single-town task is left alone');
  assert.deepEqual(applyFaction(tasks, 'CSI')[0].areas, ['Kiu Vongsa']);
  assert.equal(applyFaction(tasks, 'all'), tasks);
  assert.equal(applyFaction(tasks, ''), tasks);
  assert.deepEqual(tasks[0].areas, ['Kiu Vongsa', 'Nam Thaven', 'Pha Lang'], 'input not mutated');
});
