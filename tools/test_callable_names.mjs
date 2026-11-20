#!/usr/bin/env node
/* [R-21 2026-11-20] Every Cloud Function the browser calls by name is exported by functions/index.js, and every
 * client call targets the deployed region (europe-west1). A wrong name answers "not found" exactly like an
 * undeployed function, which is how haipayReleaseLink (renamed sokopayReleaseLink) broke SokoPay release. */
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const exported = new Set(Object.keys(require(path.join(ROOT, 'functions', 'index.js'))));
// Optional features whose client already falls back when the function is absent (documented, not 404 defects):
const OPTIONAL = { translateContent: 'machine translation (65-content-l10n.js falls back to the original text)',
  offlineMemberCustomToken: 'custom-token impersonation is intentionally NOT on the server; 62-missing-features.js falls back to assisted mode' };
const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) files.push(p); } })(path.join(ROOT, 'js'));
const CALL = /(?:wrapCallable|cfCallable|callFunction|skhCallable|httpsCallable)\(\s*(?:[A-Za-z_.]+(?:\([^()]*\))?\s*,\s*)?['"]([A-Za-z0-9_]+)['"]/g;
const called = new Map(); const regions = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8'); let m;
  while ((m = CALL.exec(src))) { if (!called.has(m[1])) called.set(m[1], path.relative(ROOT, f)); }
  for (const r of src.matchAll(/getFunctions\([^)]*?['"]([a-z]+-[a-z]+\d)['"]\)|\.functions\(['"]([a-z]+-[a-z]+\d)['"]\)/g)) regions.add(r[1] || r[2]);
}
// callServer('skhCustodyServerX') resolves window functions registered from wrapCallable(<real name>) in 00-bootstrap.js
const missing = [...called].filter(([n]) => !exported.has(n) && !OPTIONAL[n] && !/^skhCustodyServer/.test(n) && n !== 'jina');
assert.deepEqual(missing, [], 'client calls functions that are not exported: ' + JSON.stringify(missing));
assert.deepEqual([...regions], ['europe-west1'], 'client regions');
const fnRegions = new Set(); for (const f of fs.readdirSync(path.join(ROOT, 'functions')).filter(x => x.endsWith('.js'))) for (const r of fs.readFileSync(path.join(ROOT, 'functions', f), 'utf8').matchAll(/const REGION = '([^']+)'/g)) fnRegions.add(r[1]);
assert.deepEqual([...fnRegions], ['europe-west1'], 'server regions');
assert.ok(exported.has('sokopayReleaseLink') && !called.has('haipayReleaseLink'), 'SokoPay release uses the exported name');
console.log(`CALLABLE NAMES: ${called.size} client function names checked against ${exported.size} exports; region europe-west1 on both sides; optional: ${Object.keys(OPTIONAL).join(', ')}`);
