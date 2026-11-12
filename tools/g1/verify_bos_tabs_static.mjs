#!/usr/bin/env node
/* VERIFY (F-static) — kila tab 20: handler ipo? data source? scope?
 * empty-state? mock-data? (static, auditable — sehemu ya 1 ya F.) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const t10 = fs.readFileSync(path.join(ROOT, 'js', 'app', '10-dashboard-tabs.js'), 'utf8');
const t30 = fs.readFileSync(path.join(ROOT, 'js', 'app', '30-seller-products.js'), 'utf8');

const TABS10 = ['overview', 'bookings', 'trips', 'cargo', 'tracking', 'finance', 'fleet', 'drivers', 'analytics', 'product_analytics', 'inventory', 'expenses', 'staff', 'settings'];
const SELLERMAP = { my_products: 'skhRenderMyProducts', product_performance: 'skhRenderProductPerformance', sales_insights: 'skhRenderSalesInsights', demand_insights: 'skhRenderDemandInsights', product_compare: 'skhRenderCompareProducts' };

function slice10(tab) {
  const marks = [...t10.matchAll(/(?:if|else if) \(tab === '([a-z_]+)'\) \{/g)].map(m => ({ tab: m[1], i: m.index }));
  const hits = marks.filter(m => m.tab === tab);
  if (!hits.length) return null;
  // chukua tawi LOTE (driver shell + loader halisi) — unganisha
  let out = '';
  for (const me of hits) {
    const next = marks.filter(m => m.i > me.i).sort((a, b) => a.i - b.i)[0];
    out += '\n' + t10.slice(me.i, next ? next.i : me.i + 9000);
  }
  return out;
}
function sliceFn(src, fname) {
  const i = src.indexOf('window.' + fname + ' =');
  if (i === -1) return null;
  return src.slice(i, i + 14000);
}
function analyze(slice) {
  if (!slice) return { handler: false };
  const cols = [...new Set([...slice.matchAll(/collection\(\s*skh\.db\s*,\s*["']([A-Za-z_]+)["']/g)].map(m => m[1]))];
  const dataReads = [...new Set([...slice.matchAll(/\bdata\.([A-Za-z_]+)/g)].map(m => m[1]))];
  const liveQ = /skh\.(getDocs|getDoc|onSnapshot)\(/.test(slice);
  const callable = [...new Set([...slice.matchAll(/httpsCallable\(\s*skh\.functions\s*,\s*["']([A-Za-z_]+)["']/g)].map(m => m[1]))];
  const scope = /shopOwnerUid|shopOwnerId|ownerUid|currentUser\.uid|requireAuth/.test(slice);
  const empty = /Hakuna|hakuna|empty|SKH_NA|skhTableEmpty|tupu|Hamna|bado/i.test(slice);
  const err = /catch|Imeshindikana|hitilafu|error/i.test(slice);
  const mock = /mock_|sampleData|fakeData|lorem|demo-[a-z]+-data/i.test(slice);
  return { handler: true, cols, dataReads, liveQ, callable, scope, empty, err, mock };
}
const row = (tab, where, a) => console.log(`${tab} | ${a.handler ? where : 'MISSING'} | data:[${(a.dataReads || []).join(',') || '-'}] liveQ:${a.liveQ ? 'Y' : '-'} fn:[${(a.callable || []).join(',') || '-'}] cols:[${(a.cols || []).join(',') || '-'}] | ${a.empty ? 'EMPTY-Y' : 'EMPTY-n'} | ${a.err ? 'ERR-Y' : 'ERR-n'} | ${a.mock ? 'MOCK-SUSPECT' : 'mock-ok'}`);
console.log('TAB | WHERE | SOURCES | EMPTY | ERR | MOCK');
for (const tab of TABS10) row(tab, '10-dash', analyze(slice10(tab)));
for (const [tab, fn] of Object.entries(SELLERMAP)) {
  const s = sliceFn(t30, fn) || sliceFn(t10, fn);
  row(tab, (s && t30.includes('window.' + fn)) ? '30-seller' : '10-dash', analyze(s));
}
// pos_page
const p112 = path.join(ROOT, 'js', 'app', '112-business-os-pos-page.js');
const t112 = fs.existsSync(p112) ? fs.readFileSync(p112, 'utf8') : '';
const pa = analyze(t112 || null);
console.log(`pos_page | 112-pos-page(${t112 ? t112.split('\n').length : 0} lines) | ${(pa.cols || []).join(',') || '-'} | ${pa.scope ? 'Y' : 'n'} | ${pa.empty ? 'Y' : 'n'} | ${pa.err ? 'Y' : 'n'} | ${pa.mock ? 'SUSPECT' : 'ok'}`);
// unknown-tab fallback
console.log('unknown-tab fallback: ' + (t10.includes('skhTabNotFoundHtml') ? 'skhTabNotFoundHtml PRESENT' : 'MISSING'));
// switchDashTab routing
const sw = t10.slice(t10.indexOf('window.switchDashTab'), t10.indexOf('window.switchDashTab') + 900).replace(/\n/g, ' ');
console.log('switchDashTab: ' + sw.slice(0, 400));
