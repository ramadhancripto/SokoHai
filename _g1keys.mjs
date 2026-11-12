// _g1keys.mjs (scratch) — PII field-name probe (KEYS ONLY, no values).
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
await p.goto('http://127.0.0.1:8080/index.html', { waitUntil: 'load' });
await p.waitForFunction(() => window.skh && window.skh.db, null, { timeout: 30000 });
await p.waitForTimeout(1500);
const R = await p.evaluate(async () => {
  const skh = window.skh;
  const out = {};
  const keysOf = async (col, extra) => {
    try {
      let q = skh.query(skh.collection(skh.db, col), skh.limit(3));
      const s = await skh.getDocs(q);
      const keys = new Set();
      s.forEach((d) => Object.keys(d.data() || {}).forEach((k) => keys.add(k)));
      return [...keys].sort().join(',');
    } catch (e) { return 'DENIED:' + (e.code || '?'); }
  };
  out.products = await keysOf('products');
  out.drivers = await keysOf('drivers');
  out.services = await keysOf('services');
  out.userCards = await keysOf('userCards');
  out.publicProfiles = await keysOf('publicProfiles');
  out.comments = await keysOf('comments');
  out.orders = await keysOf('orders');
  return out;
});
for (const [k, v] of Object.entries(R)) console.log(k + ' :: ' + v);
await b.close();
console.log('DONE');
