#!/usr/bin/env node
/**
 * [REMEDIATION 2026-11 R9] Trust badges — callable + rules on the Firestore emulator.
 * Four distinct badges (account, supplier, product_inspection, transaction): server
 * issued with evidence, verifier, timestamps and append-only history; suspend /
 * reinstate / revoke by an admin; never writable by a seller (or any browser client).
 *   firebase emulators:exec --only firestore,auth --project demo-sokohai "node tools/test_trust_badges_emulator.mjs"
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) { console.error('BLOCKED: emulators required'); process.exit(2); }
const PROJECT = 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin'); const db = admin.firestore();
const { _internal } = require(path.join(ROOT, 'functions', 'admin-authority.js'));
const { _testing: cards } = require(path.join(ROOT, 'functions', 'user-cards.js'));

let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (i !== undefined ? ' ' + JSON.stringify(i) : '')); } };
const tok = (uid, extra) => ({ uid, token: Object.assign({ uid, email: uid + '@t.test', email_verified: true }, extra || {}) });
const ADMIN = tok('ops', { admin: true });
async function call(auth, data) {
  try { return { ok: true, data: await fns.adminSetTrustBadge.run({ data, auth, rawRequest: { headers: {} } }) }; }
  catch (e) { return { ok: false, code: e.code, message: e.message }; }
}
const get = async p => (await db.doc(p).get()).data() || null;
/* REST as a browser client (rules apply) */
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (uid, extra) => { const now = Math.floor(Date.now() / 1000); return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64(Object.assign({ iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, auth_time: now, user_id: uid, sub: uid, iat: now, exp: now + 3600, email: uid + '@t.test', email_verified: true, firebase: { identities: {}, sign_in_provider: 'password' } }, extra || {})) + '.'; };
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const enc = v => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'string' ? { stringValue: v } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
const rest = async (method, url, t, body) => { const r = await fetch(url, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t } : {}), body: body ? JSON.stringify(body) : undefined }); const tx = await r.text(); return r.ok && !/PERMISSION_DENIED/.test(tx); };
const upd = (t, p, data) => rest('PATCH', `${BASE}/${p}?` + Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&') + '&currentDocument.exists=true', t, { fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) });
const read = (t, p) => rest('GET', `${BASE}/${p}`, t);

await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await db.doc('users/sel').set({ uid: 'sel', fullName: 'Juma', isSeller: true });
await db.doc('users/other').set({ uid: 'other', fullName: 'Mwingine' });
await db.doc('products/p1').set({ userId: 'sel', title: 'Pasi 1200W', price: 45000, stock: 3 });
await db.doc('orders/o_open').set({ buyerId: 'other', sellerId: 'sel', status: 'paid', amount: 1000 });
await db.doc('orders/o_done').set({ buyerId: 'other', sellerId: 'sel', status: 'completed', amount: 1000 });

console.log('\n# Pure transition table');
const T = _internal.trustTransition;
ok('grant from nothing → active; grant twice refused', T(null, 'grant') === 'active' && T('active', 'grant') === null);
ok('suspend only active; reinstate only suspended; revoke active/suspended', T('active', 'suspend') === 'suspended' && T('revoked', 'suspend') === null && T('suspended', 'reinstate') === 'active' && T('active', 'reinstate') === null && T('suspended', 'revoke') === 'revoked' && T(null, 'revoke') === null);
ok('four distinct badges are defined', JSON.stringify(Object.keys(_internal.TRUST_BADGES)) === '["account","supplier","product_inspection","transaction"]');

console.log('\n# Authority');
ok('unauthenticated caller refused', (await call(null, { badge: 'account', targetId: 'sel', action: 'grant', evidenceRef: 'TIN-1', reason: 'hakiki ya nyaraka' })).code === 'unauthenticated');
ok('seller cannot award themselves a badge', (await call(tok('sel'), { badge: 'account', targetId: 'sel', action: 'grant', evidenceRef: 'x', reason: 'mimi mwenyewe' })).code === 'permission-denied');
ok('grant without evidence refused', (await call(ADMIN, { badge: 'account', targetId: 'sel', action: 'grant', reason: 'hakiki ya nyaraka' })).code === 'invalid-argument');
ok('grant without reason refused', (await call(ADMIN, { badge: 'account', targetId: 'sel', action: 'grant', evidenceRef: 'BRELA-123' })).code === 'invalid-argument');
ok('unknown badge refused', (await call(ADMIN, { badge: 'super', targetId: 'sel', action: 'grant', evidenceRef: 'x1x', reason: 'jaribio la aina' })).code === 'invalid-argument');

console.log('\n# Account badge lifecycle');
const g = await call(ADMIN, { badge: 'account', targetType: 'user', targetId: 'sel', action: 'grant', evidenceRef: 'BRELA-123', reason: 'Nyaraka za biashara zimehakikiwa' });
ok('admin grants account badge', g.ok && g.data.status === 'active', g);
const bid = 'account__user__sel';
const b1 = await get('trust_badges/' + bid);
ok('badge record keeps status, evidence, verifier, timestamp, owner', b1 && b1.status === 'active' && b1.evidenceRef === 'BRELA-123' && b1.verifiedBy === 'ops' && !!b1.verifiedAt && b1.ownerUid === 'sel');
ok('target carries only the public projection (no evidence)', (await get('users/sel')).trust.account.status === 'active' && !('evidenceRef' in (await get('users/sel')).trust.account));
ok('second grant refused (no silent overwrite)', (await call(ADMIN, { badge: 'account', targetId: 'sel', action: 'grant', evidenceRef: 'BRELA-999', reason: 'jaribio la pili' })).code === 'failed-precondition');
ok('suspend', (await call(ADMIN, { badge: 'account', targetId: 'sel', action: 'suspend', reason: 'Malalamiko yanachunguzwa' })).data?.status === 'suspended');
ok('reinstate needs new evidence', (await call(ADMIN, { badge: 'account', targetId: 'sel', action: 'reinstate', reason: 'Uchunguzi umekamilika' })).code === 'invalid-argument');
ok('reinstate with evidence', (await call(ADMIN, { badge: 'account', targetId: 'sel', action: 'reinstate', evidenceRef: 'CASE-77', reason: 'Uchunguzi umekamilika' })).data?.status === 'active');
ok('revoke', (await call(ADMIN, { badge: 'account', targetId: 'sel', action: 'revoke', reason: 'Nyaraka zimeghushiwa' })).data?.status === 'revoked');
const hist = await db.collection('trust_badges/' + bid + '/history').get();
ok('append-only history has every step (grant, suspend, reinstate, revoke)', hist.size === 4 && hist.docs.map(d => d.data().action).sort().join() === 'grant,reinstate,revoke,suspend');
const audits = await db.collection('admin_audit_log').where('target.kind', '==', 'account').get();
ok('admin audit log records each action', audits.size === 4);

console.log('\n# Badges are not mixed');
ok('supplier badge granted separately', (await call(ADMIN, { badge: 'supplier', targetId: 'sel', action: 'grant', evidenceRef: 'SUP-1', reason: 'Mzigo wa jumla umehakikiwa' })).data?.status === 'active');
const u = await get('users/sel');
ok('supplier active while account stays revoked', u.trust.supplier.status === 'active' && u.trust.account.status === 'revoked');
ok('account/supplier badge does not mark the seller\'s products as inspected', !((await get('products/p1')).trust));
ok('product inspection granted on the product itself', (await call(ADMIN, { badge: 'product_inspection', targetType: 'product', targetId: 'p1', action: 'grant', evidenceRef: 'INSP-5', reason: 'Bidhaa imekaguliwa ghala' })).data?.status === 'active' && (await get('products/p1')).trust.product_inspection.status === 'active');
ok('product inspection cannot target a user', (await call(ADMIN, { badge: 'product_inspection', targetType: 'user', targetId: 'sel', action: 'grant', evidenceRef: 'x12', reason: 'aina mbaya ya rekodi' })).code === 'invalid-argument');
ok('verified transaction refused for an order that is not completed', (await call(ADMIN, { badge: 'transaction', targetType: 'order', targetId: 'o_open', action: 'grant', evidenceRef: 'ESC-1', reason: 'Muamala umehakikiwa' })).code === 'failed-precondition');
ok('verified transaction on a completed order', (await call(ADMIN, { badge: 'transaction', targetType: 'order', targetId: 'o_done', action: 'grant', evidenceRef: 'ESC-2', reason: 'Escrow imekamilika' })).data?.status === 'active');
const card = cards.buildUserCard(await get('users/sel'), 'sel');
ok('public card shows account/supplier status only', card.trust && card.trust.supplier.status === 'active' && card.trust.account.status === 'revoked' && !JSON.stringify(card).includes('SUP-1'));

console.log('\n# Browser clients (rules)');
const S = jwt('sel'), O = jwt('other'), A = jwt('ops', { admin: true });
ok('seller cannot write trust on own product', !(await upd(S, 'products/p1', { trust: { product_inspection: { status: 'active' } } })));
ok('seller cannot write trust on own profile', !(await upd(S, 'users/sel', { trust: { account: { status: 'active' } } })));
ok('order party cannot write trust on an order', !(await upd(O, 'orders/o_open', { trust: { transaction: { status: 'active' } } })));
ok('admin browser cannot bypass the server either', !(await upd(A, 'products/p1', { trust: { product_inspection: { status: 'revoked' } }, lastChangedBy: 'ops', lastChangedAt: '2026-11-07T00:00:00Z' })));
ok('owner can read own badge record', await read(S, 'trust_badges/' + bid));
ok('another user cannot read the badge record (evidence)', !(await read(O, 'trust_badges/' + bid)));
ok('owner can read own badge history', await rest('POST', `${BASE}/trust_badges/${bid}:runQuery`, S, { structuredQuery: { from: [{ collectionId: 'history' }], limit: 10 } }));
ok('nobody writes badge records from a browser', !(await rest('PATCH', `${BASE}/trust_badges/fake`, A, { fields: { status: enc('active') } })));
ok('seller still edits own product normally', await upd(S, 'products/p1', { price: 44000 }));

console.log(`\nTRUST BADGES (emulator): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
