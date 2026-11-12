/** PHASE 1 G4 — canonical order builder/validator conformance (pure unit, no emulator).
 * window.skhOrderChecks (js/app/04-orders-escrow.js) is the client-side mirror
 * of firestore.rules orders. This suite evals the REAL file and proves the
 * mirror accepts/rejects exactly what the rules accept/reject at creation.
 */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${name}${c ? '' : ' :: ' + extra}`); };

const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'https://x.test/' });
const g = dom.window;
const skh = { db: {}, auth: {}, currentUser: null, onAuthStateChanged: () => () => {} };
g.skh = skh;
const src = fs.readFileSync(new URL('../../js/app/04-orders-escrow.js', import.meta.url), 'utf8')
  .split('\n').filter((l) => !l.startsWith('import ') && !l.startsWith('export ')).join('\n');
const runner = new dom.window.Function('window', 'document', 'navigator', 'skh', 'setTimeout', 'clearTimeout',
  `${src}\n;return window.skhOrderChecks;`);
const C = runner(g, g.document, g.navigator, skh, setTimeout, clearTimeout);
ok(C && typeof C.newOrderError === 'function', 'G4 skhOrderChecks loaded from real 04');

// Rules ground truth: parse the create-status allow-list from firestore.rules
const rules = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const m = rules.match(/request\.resource\.data\.get\('status', 'payment_pending'\) in \[([^\]]+)\]/);
const rulesStatuses = m ? m[1].split(',').map((s) => s.trim().replace(/['"]/g, '')) : [];
ok(rulesStatuses.length >= 5, 'G4 rules create-status list parsed', JSON.stringify(rulesStatuses));

const ME = 'buyer1', SELL = 'seller1';
const validOrder = () => ({ buyerId: ME, sellerId: SELL, amount: 5000, status: 'payment_pending' });

// --- newOrderError (10) ---
ok(C.newOrderError(validOrder(), ME) === null, 'G4 new: valid -> null');
ok(typeof C.newOrderError(validOrder(), null) === 'string', 'G4 new: no uid rejected');
ok(typeof C.newOrderError({ ...validOrder(), buyerId: 'x' }, ME) === 'string', 'G4 new: buyerId mismatch rejected');
ok(typeof C.newOrderError({ ...validOrder(), buyerId: null }, ME) === 'string', 'G4 new: buyerId missing rejected');
ok(typeof C.newOrderError({ ...validOrder(), sellerId: '' }, ME) === 'string', 'G4 new: sellerId missing rejected');
ok(typeof C.newOrderError({ ...validOrder(), sellerId: ME }, ME) === 'string', 'G4 new: self-sell rejected');
ok(typeof C.newOrderError({ ...validOrder(), amount: 0 }, ME) === 'string', 'G4 new: zero amount rejected');
ok(typeof C.newOrderError({ ...validOrder(), amount: -5 }, ME) === 'string', 'G4 new: negative amount rejected');
ok(typeof C.newOrderError({ ...validOrder(), amount: 'x' }, ME) === 'string', 'G4 new: NaN amount rejected');
ok(C.newOrderError({ buyerId: ME, sellerId: SELL, amount: 5 }, ME) === null, 'G4 new: missing status defaults valid');

// --- serviceOrderError (8) ---
const validSvc = () => ({ sellerId: ME, buyerId: 'cust1', amount: 3000, itemId: 'req1' });
ok(C.serviceOrderError(validSvc(), ME) === null, 'G4 svc: valid -> null');
ok(typeof C.serviceOrderError(validSvc(), null) === 'string', 'G4 svc: no uid rejected');
ok(typeof C.serviceOrderError({ ...validSvc(), sellerId: 'x' }, ME) === 'string', 'G4 svc: non-provider rejected');
ok(typeof C.serviceOrderError({ ...validSvc(), buyerId: '' }, ME) === 'string', 'G4 svc: buyer missing rejected');
ok(typeof C.serviceOrderError({ ...validSvc(), buyerId: ME }, ME) === 'string', 'G4 svc: self-buyer rejected');
ok(typeof C.serviceOrderError({ ...validSvc(), amount: 0 }, ME) === 'string', 'G4 svc: zero amount rejected');
ok(typeof C.serviceOrderError({ ...validSvc(), itemId: '' }, ME) === 'string', 'G4 svc: itemId missing rejected');
ok(typeof C.serviceOrderError({ ...validSvc(), amount: 'bad' }, ME) === 'string', 'G4 svc: NaN amount rejected');

// --- shipError (8) ---
const validShip = () => ({ sellerId: ME, status: 'held', paymentVerified: true });
ok(C.shipError(validShip(), ME) === null, 'G4 ship: valid -> null');
ok(typeof C.shipError(validShip(), null) === 'string', 'G4 ship: no uid rejected');
ok(typeof C.shipError(null, ME) === 'string', 'G4 ship: no order rejected');
ok(typeof C.shipError(validShip(), 'stranger') === 'string', 'G4 ship: non-party rejected');
ok(typeof C.shipError({ ...validShip(), status: 'payment_pending' }, ME) === 'string', 'G4 ship: unpaid status rejected');
ok(typeof C.shipError({ ...validShip(), paymentVerified: false }, ME) === 'string', 'G4 ship: unverified rejected');
ok(typeof C.shipError({ ...validShip(), paymentVerified: 'yes' }, ME) === 'string', 'G4 ship: truthy-non-true rejected');
ok(C.shipError({ providerId: ME, status: 'held', paymentVerified: true }, ME) === null, 'G4 ship: provider party valid');

// --- rules parity (4) ---
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
ok(sameSet([...C.CREATE_STATUSES].sort(), [...rulesStatuses].sort()), 'G4 parity: CREATE_STATUSES == rules allow-list', JSON.stringify(C.CREATE_STATUSES));
for (const st of rulesStatuses) {
  if (C.newOrderError({ ...validOrder(), status: st }, ME) !== null) { ok(false, 'G4 parity: accepts rules status ' + st); break; }
}
ok(rulesStatuses.every((st) => C.newOrderError({ ...validOrder(), status: st }, ME) === null), 'G4 parity: all rules statuses accepted');
ok(['held', 'completed', 'paid', 'shipped', 'disputed'].every((st) => typeof C.newOrderError({ ...validOrder(), status: st }, ME) === 'string'), 'G4 parity: money states rejected at create');
ok(C.CREATE_STATUSES.includes('payment_pending'), 'G4 parity: payment_pending is the default');

console.log(`\nPHASE1 CONFORMANCE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
