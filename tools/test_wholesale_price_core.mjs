#!/usr/bin/env node
/* [2026-11-06] Wholesale / quantity-tier pricing: one shared formula.
 *  - server modeUnitPrice (functions/pricing-core.js) must equal the frozen legacy
 *    implementation for every mode (no behaviour change for money);
 *  - the browser helpers (product page, Smart Cart) use the same core;
 *  - illustrative seller tiers 1-4 @25,000 / 5-19 @22,000 / 20+ @19,000. */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const core = require('../shared/wholesale-price-core.js');
const server = require('../functions/pricing-core.js');
const legacy = require('./fixtures/pricing-core-legacy-20261106.cjs');
let pass = 0, fail = 0;
const ok = (name, c, info) => { if (c) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, info || ''); } };

const P = { price: 25000, saleMode: 'wholesale', modeData: { tiers: [{ minQty: 5, price: 22000 }, { minQty: 20, price: 19000 }] } };
ok('1-4 units pay retail 25,000', [1, 2, 4].every(q => core.unitPriceForQty(P, q) === 25000));
ok('5-19 units pay 22,000', [5, 10, 19].every(q => core.unitPriceForQty(P, q) === 22000));
ok('20+ units pay 19,000', [20, 99].every(q => core.unitPriceForQty(P, q) === 19000));
ok('price table rows', JSON.stringify(core.priceTable(P)) === JSON.stringify([{ from: 1, to: 4, price: 25000, retail: true }, { from: 5, to: 19, price: 22000, retail: false }, { from: 20, to: null, price: 19000, retail: false }]), JSON.stringify(core.priceTable(P)));
ok('wholesalePrice without wholesaleMinQty never applies online (POS price only)', core.unitPriceForQty({ price: 1000, wholesalePrice: 800 }, 500) === 1000 && core.tiersOf({ price: 1000, wholesalePrice: 800 }).length === 0);
ok('wholesalePrice with wholesaleMinQty applies from MOQ', core.unitPriceForQty({ price: 1000, wholesalePrice: 800, wholesaleMinQty: 10 }, 9) === 1000 && core.unitPriceForQty({ price: 1000, wholesalePrice: 800, wholesaleMinQty: 10 }, 10) === 800);
ok('variant price is the retail starting point', core.unitPriceForQty({ price: 1000, wholesalePrice: 800, wholesaleMinQty: 10 }, 2, 1200) === 1200);
ok('validateTiers flags rising price / not-increasing qty / not below retail', (() => { const i = core.validateTiers(25000, [{ minQty: 5, price: 22000 }, { minQty: 5, price: 23000 }, { minQty: 30, price: 26000 }]).map(x => x.code); return i.includes('MIN_QTY_NOT_INCREASING') && i.includes('PRICE_RISES') && i.includes('NOT_BELOW_RETAIL'); })());
ok('validateTiers accepts a good ladder', core.validateTiers(25000, [{ minQty: 5, price: 22000 }, { minQty: 20, price: 19000 }]).length === 0);

// Parity: random products across all modes, many quantities.
let seed = 7; const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
const modes = ['', 'wholesale', 'group_buy', 'price_drop', 'auction', 'free_market'];
let diffs = [];
for (let i = 0; i < 3000; i++) {
  const p = { price: 500 + rnd(50000), saleMode: modes[rnd(modes.length)], modeData: {} };
  if (rnd(2)) p.modeData.tiers = Array.from({ length: rnd(4) }, () => ({ minQty: rnd(30), price: rnd(60000) }));
  if (rnd(3) === 0) { p.modeData.minQty = rnd(20); p.modeData.discountValue = rnd(40); p.modeData.discountType = rnd(2) ? 'percent' : 'amount'; }
  if (rnd(2)) p.wholesalePrice = rnd(50000);
  if (rnd(2)) p.wholesaleMinQty = rnd(25);
  if (p.saleMode === 'group_buy') { p.modeData.joinedUsers = rnd(10); p.modeData.discountValue = rnd(30); }
  if (p.saleMode === 'price_drop') { p.modeData.startTime = 1; p.modeData.dropAmount = rnd(100); p.modeData.minPrice = rnd(500); }
  const q = 1 + rnd(40);
  const a = server.modeUnitPrice(p, q, 'u1', 1e12), b = legacy.modeUnitPrice(p, q, 'u1', 1e12);
  if (a !== b) diffs.push({ p, q, a, b });
}
ok('server modeUnitPrice identical to legacy implementation (3,000 random cases)', diffs.length === 0, JSON.stringify(diffs.slice(0, 2)));
ok('server uses the shared core (no second formula)', fs.readFileSync(new URL('../functions/pricing-core.js', import.meta.url), 'utf8').includes("require('./shared/wholesale-price-core')"));
ok('functions/shared copy is in sync', fs.readFileSync(new URL('../functions/shared/wholesale-price-core.js', import.meta.url), 'utf8') === fs.readFileSync(new URL('../shared/wholesale-price-core.js', import.meta.url), 'utf8'));
console.log(`\nWHOLESALE PRICE CORE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
