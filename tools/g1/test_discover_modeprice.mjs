#!/usr/bin/env node
/* ============================================================
 * DISCOVER CARDS (3G / G-G1) — kadi za Discover/Search zinaonyesha
 * bei ya MODE (dau la juu / bei live / bei ya kundi), si base price.
 * modePrice() halisi kutoka 75-discover-engine.js + skhModesCompute
 * halisi kutoka 07-product.js (zote zime-extract kwa brace-scan).
 * ========================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const results = [];
let group = '[DC dprice]';
async function test(name, fn) {
  try { await fn(); results.push({ group, name, ok: true }); console.log('  PASS ' + name); }
  catch (e) { results.push({ group, name, ok: false, err: e && e.message }); console.log('  FAIL ' + name + ': ' + (e && e.message)); }
}
function assert(c, msg) { if (!c) throw new Error('assert: ' + msg); }
function braceFn(src, sig) {
  const i = src.indexOf(sig);
  if (i === -1) throw new Error('sig missing: ' + sig);
  let b = src.indexOf('{', i + sig.length), d = 0, instr = null, esc = false, j = b;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (instr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === instr) instr = null; continue; }
    if (ch === '"' || ch === "'") { instr = ch; continue; }
    if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; }
  }
  return src.slice(i, j + 1);
}

// skhModesCompute halisi (07) — inahitaji window tu
const s07 = fs.readFileSync(path.join(ROOT, 'js/app/07-product.js'), 'utf-8');
const computeSrc = braceFn(s07, 'window.skhModesCompute = function (p)');
const window = {};
// eslint-disable-next-line no-eval
eval(computeSrc.replace('window.skhModesCompute = ', 'window.skhModesCompute = '));

// modePrice halisi (75) — inahitaji window + T2
const s75 = fs.readFileSync(path.join(ROOT, 'js/app/75-discover-engine.js'), 'utf-8');
const mpSrc = braceFn(s75, 'function modePrice(l)');
const T2 = (sw) => sw;
// eslint-disable-next-line no-eval
const modePrice = eval('(' + mpSrc.replace('function modePrice(l)', 'function (l)') + ')');

const now = Date.now();
await test('G1 mnada: kadi inaonyesha dau la juu + idadi ya zabuni', async () => {
  const r = modePrice({ price: 50000, saleMode: 'auction', modeData: { currentBid: 175000, totalBids: 12, endTime: now + 3600000 } });
  assert(r.text === 'TSh 175,000', 'text=' + r.text);
  assert(r.tag.indexOf('Zabuni ya juu') !== -1 && r.tag.indexOf('12') !== -1, 'tag=' + r.tag);
});
await test('G2 bei kushuka: kadi inaonyesha bei live; ikiisha inaashiria', async () => {
  const live = modePrice({ price: 100000, saleMode: 'price_drop', modeData: { startTime: now - 300000, endTime: now + 3600000, intervalMs: 60000, dropAmount: 5000, minPrice: 60000 } });
  assert(live.text === 'TSh 75,000', 'live=' + live.text);
  assert(live.tag.indexOf('Bei ya sasa') !== -1, 'tag=' + live.tag);
  const ended = modePrice({ price: 100000, saleMode: 'price_drop', modeData: { startTime: now - 7200000, endTime: now - 1000, intervalMs: 60000, dropAmount: 5000, minPrice: 60000 } });
  assert(ended.tag.indexOf('imekwisha') !== -1, 'ended tag=' + ended.tag);
});
await test('G3 group: kadi inaonyesha bei ya kundi + waliojiunga', async () => {
  const r = modePrice({ price: 20000, saleMode: 'group_buy', modeData: { joinedUsers: 6, targetPeople: 10, discountValue: 1000, discountType: 'amount' } });
  assert(r.text === 'TSh 15,000', 'group=' + r.text);
  assert(r.tag.indexOf('6/10') !== -1, 'tag=' + r.tag);
});
await test('G4 kawaida: free_market/wholesale/discover_only hazibadiliki', async () => {
  for (const m of ['free_market', 'wholesale', 'discover_only']) {
    const r = modePrice({ price: 25000, saleMode: m, modeData: {} });
    assert(r.text === 'TSh 25,000' && r.tag === '', m + '=' + JSON.stringify(r));
  }
  const neg = modePrice({ price: null, saleMode: 'free_market' });
  assert(neg.text === 'Bei ya Maelewano', 'neg=' + neg.text);
});
await test('G5 ustahimilivu: skhModesCompute ikikosekana, base price inaonyeshwa', async () => {
  const keep = window.skhModesCompute;
  delete window.skhModesCompute;
  try {
    const r = modePrice({ price: 50000, saleMode: 'auction', modeData: { currentBid: 99999 } });
    assert(r.text === 'TSh 50,000', 'fallback=' + r.text);
  } finally { window.skhModesCompute = keep; }
});

const pass = results.filter(r => r.ok).length, fail = results.filter(r => !r.ok);
console.log(`DISCOVER MODE-PRICE: ${pass} passed, ${fail.length} failed`);
for (const f of fail) console.log('  FAIL ' + f.group + ' ' + f.name + ': ' + f.err);
process.exit(fail.length ? 1 : 0);
