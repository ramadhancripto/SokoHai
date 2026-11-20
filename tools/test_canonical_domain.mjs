#!/usr/bin/env node
/* [R-19 2026-11-20] One canonical public origin across the repository, a complete PesaPal return allow-list,
 * no placeholder domains, and a working one-step switch to https://sokohai.com (dry run in a temp copy). */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f, r = ROOT) => fs.readFileSync(path.join(r, f), 'utf8');
const require = createRequire(import.meta.url);
const KNOWN = /https:\/\/(?:www\.)?(?:sokohai\.com|sokohaicom\.netlify\.app|sokohaimarket\.netlify\.app|sokohai\.example\.com)/g;
function check(r) {
  const site = read('functions/site-domain.js', r);
  const C = /const CANONICAL_ORIGIN = '([^']+)'/.exec(site)[1];
  const prod = JSON.parse(/const PRODUCTION_ORIGINS = (\[[^\]]*\])/.exec(site)[1].replace(/'/g, '"'));
  const head = read('html/00-head.html', r);
  const found = (head.match(KNOWN) || []); assert.ok(found.length >= 8, 'head references'); assert.deepEqual([...new Set(found)], [C], 'head: one origin');
  assert.match(head, new RegExp('<link rel="canonical" id="skhCanonical" href="' + C + '/">'));
  assert.deepEqual([...new Set(read('robots.txt', r).match(KNOWN))], [C], 'robots.txt');
  assert.deepEqual([...new Set(read('.well-known/security.txt', r).match(KNOWN))], [C], 'security.txt');
  assert.match(read('js/00-config.js', r), new RegExp("CANONICAL_ORIGIN: '" + C + "'"));
  const boot = read('js/app/00-bootstrap.js', r); assert.deepEqual([...new Set(boot.match(KNOWN) || [])], [C], 'bootstrap fallback');
  // production hosts in the client config == server production origins
  const hosts = /production:\s*\{[\s\S]*?hosts:\s*(\[[^\]]*\])/.exec(read('js/00-config.js', r))[1];
  assert.deepEqual(JSON.parse(hosts.replace(/'/g, '"')).map(h => 'https://' + h).sort(), prod.slice().sort(), 'client production hosts vs server PRODUCTION_ORIGINS');
  assert.ok(prod.includes(C), 'canonical is a production origin');
  return { C, prod, index: read('index.html', r) };
}
const now = check(ROOT);
assert.equal(now.index.includes('<link rel="canonical" id="skhCanonical" href="' + now.C + '/">'), true, 'index.html rebuilt from html/');
const fnSrc = read('functions/index.js');
assert.doesNotMatch(fnSrc, /sokohai\.example\.com'\)/, 'no placeholder sitemap fallback');
assert.match(fnSrc, /PESAPAL_ALLOWED_RETURN_ORIGINS\s*\n\s*\/\/[^\n]*\n\s*\|\| siteDomain\.PRODUCTION_ORIGINS\.join/, 'PesaPal return origins come from PRODUCTION_ORIGINS');
const sd = require(path.join(ROOT, 'functions', 'site-domain.js'));
for (const o of ['https://sokohai.com', 'https://www.sokohai.com']) assert.ok(sd.PRODUCTION_ORIGINS.includes(o), o + ' allowed as a PesaPal return origin');
// dry run of the switch in a throw-away copy
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-domain-'));
for (const f of ['html', 'tools/build_html.py', 'robots.txt', '.well-known/security.txt', 'functions/site-domain.js', 'js/00-config.js', 'js/app/00-bootstrap.js', 'index.html']) fs.cpSync(path.join(ROOT, f), path.join(tmp, f), { recursive: true });
execFileSync('node', [path.join(ROOT, 'tools', 'set_canonical_domain.mjs'), 'https://sokohai.com', '--root', tmp], { stdio: 'pipe' });
const after = check(tmp);
assert.equal(after.C, 'https://sokohai.com'); assert.ok(after.index.includes('href="https://sokohai.com/"'), 'index rebuilt in the copy');
assert.deepEqual(after.prod, now.prod, 'production origin list unchanged by the switch');
let refused = false; try { execFileSync('node', [path.join(ROOT, 'tools', 'set_canonical_domain.mjs'), 'https://evil.example', '--root', tmp], { stdio: 'pipe' }); } catch (e) { refused = true; }
assert.ok(refused, 'a non-production origin is refused');
console.log(`CANONICAL DOMAIN: one origin (${now.C}) in head/robots/security.txt/config/server; PesaPal allows ${now.prod.length} production origins; switch to https://sokohai.com verified in a temp copy`);
