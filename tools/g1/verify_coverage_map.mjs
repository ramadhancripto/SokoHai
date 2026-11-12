#!/usr/bin/env node
/* VERIFY (E) — ramani ya kila functions export -> ushahidi wa test.
 * BEHAVIOR = test inayoiita (.run/call/fns.NAME()/wrapCallable-invoke).
 * TRIGGER  = onDocument/onSchedule/onRequest: K4-type + (ikiwepo) _testing hook.
 * STATIC   = jina limetajwa kwenye K4 pekee (SIO behavior coverage).
 * MENTION  = jina limetajwa mahali pengine bila kuiita.
 * NONE     = halipo kabisa kwenye tools/.
 * (verify_*.mjs za turn hii zimehesabiwa — zimewekewa alama ya [V].)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const idx = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
const staticNames = [...idx.matchAll(/exports\.([A-Za-z0-9_]+)/g)].map(m => m[1]);
const dynNames = [];
for (const m of idx.matchAll(/\['([A-Za-z0-9_',\s]+)'\]\.forEach\(n => \{ exports\[n\]/g)) {
  for (const n of m[1].split(',')) dynNames.push(n.trim().replace(/'/g, ''));
}
const exports_ = [...new Set(staticNames.concat(dynNames))].sort();
console.log('EXPORTS: ' + exports_.length + ' (static=' + new Set(staticNames).size + ' dynamic=' + dynNames.length + ')');

const fnSrcs = {};
for (const f of fs.readdirSync(path.join(ROOT, 'functions')).filter(f => f.endsWith('.js')))
  fnSrcs[f] = fs.readFileSync(path.join(ROOT, 'functions', f), 'utf8');

function defKind(name) {
  // fasili halisi (fuata re-export).
  let body = null;
  for (const [f, t] of Object.entries(fnSrcs)) {
    const i = t.indexOf('exports.' + name + ' =');
    if (i === -1) continue;
    const head = t.slice(i, i + 220);
    const re = new RegExp('exports\\.' + name + '\\s*=\\s*(\\w+)\\.' + name).exec(head);
    if (re && !/ = on/.test(head)) continue; // re-export — endelea kutafuta fasili
    body = t.slice(i, i + 1500);
    break;
  }
  if (!body) {
    for (const t of Object.values(fnSrcs)) {
      const m = t.match(new RegExp('(const|let) ' + name + ' = (on\\w+)'));
      if (m) return m[2];
      if (new RegExp('(const|let|exports\\.)' + name + ' = \\w*[Tt]rigger\\w*\\(').test(t)) return 'onTrigger(factory)';
    }
    return 'UNKNOWN';
  }
  const m = / = (onCall|onRequest|onSchedule|onDocument\w*|onWrite|onCreate|onUpdate|onObject\w*)/.exec(body.slice(0, 220));
  if (m) return m[1];
  if (/ = \w*[Tt]rigger\w*\(/.test(body.slice(0, 220))) return 'onTrigger(factory)';
  return 'OTHER';
}

const testFiles = [];
for (const dir of ['tools', 'tools/g1', 'tools/e2e-emulator']) {
  const dp = path.join(ROOT, dir);
  if (!fs.existsSync(dp)) continue;
  for (const f of fs.readdirSync(dp).filter(f => /\.(mjs|cjs|js)$/.test(f))) {
    if (f === 'verify_coverage_map.mjs') continue;
    testFiles.push({ f: dir + '/' + f, t: fs.readFileSync(path.join(dp, f), 'utf8') });
  }
}
function invokedBy(name) {
  const pats = [
    new RegExp('call\\([\'"`]' + name + '[\'"`]'),
    new RegExp('run\\([\'"`]' + name + '[\'"`]'),
    new RegExp('fns\\.' + name + '\\.run'),
    new RegExp('fns\\[[\'"`]' + name + '[\'"`]]'),
    new RegExp('\\bfns\\.' + name + '\\('),
    new RegExp('testing\\.' + name + '\\b'),
    new RegExp('authority\\.' + name + '\\('),
    new RegExp('engine\\.' + name + '\\('),
    new RegExp('\\b' + name + '\\(\\{ data'),
    new RegExp('wrapCallable\\([\'"`]' + name + '[\'"`]\\)'),
  ];
  return testFiles.filter(({ t }) => pats.some(p => p.test(t))).map(x => x.f);
}
function mentionedBy(name) {
  const p = new RegExp('\\b' + name + '\\b');
  return testFiles.filter(({ t }) => p.test(t)).map(x => x.f);
}
// _testing hooks (trigger/schedule internals zinazojaribiwa moja kwa moja).
const HOOK_TEST = {
  commerceModesSweep: ['sweepAuctions', 'sweepPriceDrops'],
  inventoryReservationSweep: ['sweep'],
  inventoryReconcile: ['reconcile'],
  sitemapXml: ['sitemap'],
  platformStatsHourly: ['platformStats', 'recomputePlatformStats'],
  inventoryOrderCreated: ['inventoryOrderCreated', 'orderCreated'],
  inventoryOrderUpdated: ['inventoryOrderUpdated', 'orderUpdated'],
  adsDeliverySweep: ['adsDelivery', 'sweepDelivery'],
};
function hookBy(name) {
  const hooks = HOOK_TEST[name] || [name];
  return testFiles.filter(({ t }) => hooks.some(h => t.includes(h) && !new RegExp('CALLABLE|NON_CALL|verify_coverage').test(t.slice(0, 200)))).map(x => x.f).slice(0, 4);
}

const rows = [];
for (const name of exports_) {
  if (name.startsWith('_')) { rows.push({ name, kind: defKind(name), cls: 'TEST-HELPER', by: [] }); continue; }
  const kind = defKind(name);
  const inv = invokedBy(name);
  if (inv.length) { rows.push({ name, kind, cls: 'BEHAVIOR', by: inv.slice(0, 4) }); continue; }
  if (/onSchedule|onDocument|onWrite|onCreate|onUpdate|onObject|onTrigger/.test(kind)) {
    const hk = hookBy(name);
    rows.push({ name, kind, cls: hk.length ? 'TRIGGER(+hook)' : 'TRIGGER(type-only)', by: hk });
    continue;
  }
  if (kind === 'onRequest') {
    const hk = hookBy(name).concat(mentionedBy(name).filter(f => !/3k_final|coverage/.test(f)));
    rows.push({ name, kind, cls: hk.length ? 'REQUEST(+test)' : 'REQUEST(type-only)', by: hk.slice(0, 4) });
    continue;
  }
  const men = mentionedBy(name).filter(f => !/test_3k_final_sweep/.test(f));
  const k4 = mentionedBy(name).some(f => /test_3k_final_sweep/.test(f));
  if (men.length) rows.push({ name, kind, cls: 'MENTION-ONLY', by: men.slice(0, 4) });
  else if (k4) rows.push({ name, kind, cls: 'STATIC(K4-only)', by: ['tools/g1/test_3k_final_sweep.mjs'] });
  else rows.push({ name, kind, cls: 'NONE', by: [] });
}
const batterySrc = fs.readFileSync(path.join(ROOT, 'tools', 'g1', 'run_battery.mjs'), 'utf8');
const inBattery = (f) => batterySrc.includes("'" + f + "'");
const tag = (f) => (/^tools\/g1\/verify_/.test(f) ? f + ' [V-new]' : (inBattery(f) ? f + ' [battery]' : f + ' [NOT-IN-BATTERY]'));
for (const r of rows) console.log(`${r.cls.padEnd(15)} ${r.name} [${r.kind}] :: ${r.by.map(tag).join(' | ') || '-'}`);
const sum = {};
for (const r of rows) sum[r.cls] = (sum[r.cls] || 0) + 1;
console.log('\nSUMMARY: ' + JSON.stringify(sum));
