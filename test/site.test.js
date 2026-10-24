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

// A missing export kills the whole app at load time, and the unit tests
// never import the DOM-bound view modules, so check every import statically.
test('every named import resolves to an export', () => {
  const files = walk(site).filter((p) => p.endsWith('.js') && !p.endsWith('sw.js'));
  const exportsOf = new Map(files.map((f) => {
    const src = readFileSync(f, 'utf8');
    const names = new Set([
      ...[...src.matchAll(/^export (?:async )?(?:function|const|let|class) (\w+)/gm)].map((m) => m[1]),
      ...[...src.matchAll(/^export \{([^}]+)\}/gm)].flatMap((m) => m[1].split(',').map((n) => n.trim().split(/\s+as\s+/).pop())),
    ]);
    return [f, names];
  }));
  const problems = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/^import \{([^}]+)\} from '([^']+)';/gm)) {
      const target = join(f, '..', m[2]);
      if (!exportsOf.has(target)) { problems.push(`${relative(site, f)}: ${m[2]} not found`); continue; }
      for (const name of m[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
        if (!exportsOf.get(target).has(name)) problems.push(`${relative(site, f)}: ${name} is not exported by ${m[2]}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
