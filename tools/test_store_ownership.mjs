// [R-22 2026-11-20] Public seller store: canonical owner field `userId`, legacy `sellerId`-only listings
// merged (read-only, no migration), another seller's product never shown, and archived / draft /
// admin-removed / offline listings hidden from visitors. Real store UI code (29-seller-store.js),
// Firestore-shaped mock that honours the where() field.
import { JSDOM } from 'jsdom'; import fs from 'node:fs'; import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../js/app/29-seller-store.js', import.meta.url), 'utf8').replace(/^import .*?;\s*$/m, '');
async function run(rows, fail = []) {
  const dom = new JSDOM('<div id="sellerProfileModal"><div id="sellerProfileBody"></div></div>', { runScripts: 'outside-only', url: 'https://example.test' }), w = dom.window;
  const snap = xs => ({ size: xs.length, forEach: cb => xs.forEach(x => cb({ id: x.id, data: () => x })) });
  const queries = [];
  w.skh = { db: {}, skhEscape: s => String(s), skhJsEsc: s => String(s), getUserCard: async () => ({ exists: () => true, data: () => ({ storeName: 'Duka la Juma' }) }),
    collection: (db, col) => col, where: (k, op, v) => ({ k, op, v }), limit: n => n, query: (col, ...args) => ({ col, args }),
    getDocs: async q => {
      const w0 = q.args.find(a => a && a.k); queries.push(q.col + ':' + (w0 && w0.k));
      if (fail.includes(q.col + ':' + (w0 && w0.k))) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
      return snap(q.col === 'products' ? rows.filter(r => w0 && r[w0.k] === w0.v) : []);
    } };
  w.eval(source); await w.openSellerProfile('juma', ''); return { w, text: w.document.body.textContent, html: w.document.body.innerHTML, queries };
}
const rows = [
  { id: 'p-canonical', userId: 'juma', title: 'Canonical userId', publicationStatus: 'published', status: 'active' },
  { id: 'p-both', userId: 'juma', sellerId: 'juma', title: 'Both fields', publicationStatus: 'published' },
  { id: 'p-legacy', sellerId: 'juma', title: 'Legacy sellerId only' },
  { id: 'p-foreign', userId: 'asha', sellerId: 'juma', title: 'Foreign userId' },
  { id: 'p-archived', userId: 'juma', title: 'Archived listing', publicationStatus: 'archived', status: 'archived', archivedAt: '2026-11-01' },
  { id: 'p-draft', userId: 'juma', title: 'Draft listing', publicationStatus: 'draft' },
  { id: 'p-removed', userId: 'juma', title: 'Removed by admin', adminHidden: true, moderationStatus: 'removed' },
  { id: 'p-offline', userId: 'juma', title: 'POS only', isOnline: false },
  { id: 'p-legacy-archived', sellerId: 'juma', title: 'Legacy archived', status: 'archived' }
];
let r = await run(rows);
assert.ok(r.queries.includes('products:userId') && r.queries.includes('products:sellerId'), 'both owner fields queried: ' + r.queries);
for (const t of ['Canonical userId', 'Both fields', 'Legacy sellerId only']) assert.match(r.text, new RegExp(t), 'shown: ' + t);
assert.equal((r.html.match(/p-both/g) || []).length > 0, true); assert.equal(r.text.split('Both fields').length - 1, 1, 'a product with both fields is listed once');
for (const t of ['Foreign userId', 'Archived listing', 'Draft listing', 'Removed by admin', 'POS only', 'Legacy archived']) assert.doesNotMatch(r.text, new RegExp(t), 'hidden: ' + t);
// legacy lookup failing must not hide the canonical list
r = await run(rows, ['products:sellerId']);
assert.match(r.text, /Canonical userId/); assert.doesNotMatch(r.text, /Legacy sellerId only/); assert.doesNotMatch(r.text, /Bidhaa hazijapakiwa/);
// canonical query failing is still reported honestly
r = await run(rows, ['products:userId']);
assert.match(r.text, /Bidhaa hazijapakiwa/);
console.log('STORE OWNERSHIP: userId canonical + legacy sellerId merged once, foreign/archived/draft/removed/offline hidden, partial failures handled (mock Firestore)');
