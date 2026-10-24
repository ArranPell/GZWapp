// Guards for the parts of the site that break silently: a file missing from
// the offline precache, or a manifest icon that doesn't exist.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const site = new URL('../site/', import.meta.url).pathname;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const sw = readFileSync(join(site, 'sw.js'), 'utf8');
const precached = new Set([...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]));

test('every JS and CSS file is precached for offline use', () => {
  const files = walk(site)
    .map((p) => relative(site, p))
    .filter((p) => /\.(js|css)$/.test(p) && p !== 'sw.js');
  const missing = files.filter((f) => !precached.has(f));
  assert.deepEqual(missing, [], `Add these to SHELL_FILES in sw.js: ${missing.join(', ')}`);
});

test('every precached file exists', () => {
  const absent = [...precached].filter((f) => f && !existsSync(join(site, f)));
  assert.deepEqual(absent, []);
});

test('manifest icons exist', () => {
  const manifest = JSON.parse(readFileSync(join(site, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) assert.ok(existsSync(join(site, icon.src)), icon.src);
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
});

test('the deploy workflow can stamp the service worker version', () => {
  assert.match(sw, /^const VERSION = 'dev';$/m);
});
