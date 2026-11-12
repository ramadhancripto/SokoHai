#!/usr/bin/env node
/* ============================================================
 * PHASE 10 — Uaminifu wa soko: auction/group (server-validated),
 * modeData lockdown (rules), comments author-bound.
 * ========================================================== */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS_HOST || !AUTH_HOST) { console.error('BLOCKED: emulators zinahitajika.'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai-g1';
process.env.GCLOUD_PROJECT = PROJECT;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT, storageBucket: PROJECT + '.appspot.com' });
process.env.ADMIN_EMAILS = 'admin@sokohai.test';

const require = createRequire(path.join(ROOT, 'functions', 'commerce-modes.js'));
require(path.join(ROOT, 'functions', 'index.js')); // initializeApp
const cm = require(path.join(ROOT, 'functions', 'commerce-modes.js'));
const admin = require('firebase-admin');
const db = admin.firestore();

const results = [];
let group = '';
async function test(name, fn) {
  try { await fn(); results.push({ group, name, ok: true }); console.log('  PASS ' + name); }
  catch (e) { results.push({ group, name, ok: false, err: e && e.message }); console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 3).join('\n       ')); }
}
function assert(c, msg) { if (!c) throw new Error('assert: ' + msg); }
function eq(a, b, msg) { if (a !== b) throw new Error('assert: ' + msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
const tok = (uid) => ({ uid, token: { uid, email: uid + '@u.test', email_verified: true } });
async function call(fn, uid, data) {
  try {
    const r = await cm[fn].run({ data: data || {}, auth: tok(uid), rawRequest: { headers: {} }, acceptsStreaming: false });
    return { ok: true, data: r };
  } catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
async function wipe() {
  const r = await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert(r.ok, 'wipe');
}
async function idToken(uid) {
  const r = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: uid + '@rules.test', password: 'secret123', returnSecureToken: true })
  });
  const j = await r.json();
  assert(j.idToken, 'signUp: ' + JSON.stringify(j).slice(0, 200));
  return { token: j.idToken, uid: j.localId };
}
function enc(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
const DOCS = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
async function restPatch(tk, docPath, data) {
  const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await fetch(`${DOCS}/${docPath}?${mask}&currentDocument.exists=true`, { method: 'PATCH', headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  return r.status;
}
async function restCreate(tk, col, id, data) {
  const r = await fetch(`${DOCS}/${col}?documentId=${id}`, { method: 'POST', headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  return r.status;
}
async function loadRules() {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const r = await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } })
  });
  assert(r.ok, 'rules load: ' + r.status);
}
const getd = async (p) => (await db.doc(p).get()).data();

async function main() {
  group = 'M10 server'; console.log('\n[' + group + ']');
  await wipe();
  await loadRules();
  const now = Date.now();
  await db.doc('products/auc1').set({ userId: 's10', title: 'Mnada', price: 10000, stock: 1, saleMode: 'auction', modeData: { endTime: now + 3600e3, totalBids: 0 } });
  await db.doc('products/grp1').set({ userId: 's10', title: 'Group', price: 5000, stock: 10, saleMode: 'group_buy', modeData: { targetPeople: 3, joinedUsers: 1, participants: [] } });

  await test('M1 muuzaji hawezi ku-bid mnada wake (shill blocked)', async () => {
    const r = await call('auctionPlaceBid', 's10', { productId: 'auc1', amount: 20000 });
    eq(r.ok, false, 'rejected'); assert(/tangazo_lako/.test(r.message || ''), 'code: ' + r.message);
  });

  await test('M2 dau lazima liwe >= minNext (increment)', async () => {
    const r1 = await call('auctionPlaceBid', 'b10a', { productId: 'auc1', amount: 10001 });
    eq(r1.ok, false, 'chini ya minNext rejected');
    const r2 = await call('auctionPlaceBid', 'b10a', { productId: 'auc1', amount: 10500, clientBidId: 'BID1' });
    assert(r2.ok, 'bid ok: ' + JSON.stringify(r2).slice(0, 200));
    eq((await getd('products/auc1')).modeData.maxBidder, 'b10a', 'maxBidder');
    const r3 = await call('auctionPlaceBid', 'b10a', { productId: 'auc1', amount: 10500, clientBidId: 'BID1' });
    assert(r3.ok && r3.data.duplicate === true, 'duplicate clientBidId = same result');
    eq((await getd('products/auc1')).modeData.totalBids, 1, 'bado dau 1');
  });

  await test('M3 group: muuzaji hawezi kujiunga; join mara mbili = idempotent', async () => {
    const r0 = await call('groupBuyJoin', 's10', { productId: 'grp1' });
    eq(r0.ok, false, 'seller rejected');
    const r1 = await call('groupBuyJoin', 'g10a', { productId: 'grp1' });
    assert(r1.ok, 'join ok'); eq(r1.data.joined, 2, 'joined 2');
    const r2 = await call('groupBuyJoin', 'g10a', { productId: 'grp1' });
    assert(r2.ok && r2.data.already === true, 'already:true');
    eq((await getd('products/grp1')).modeData.joinedUsers, 2, 'count stable');
  });

  group = 'M10 rules'; console.log('\n[' + group + ']');
  await test('M4 modeData inalock baada ya ushiriki (seller hawezi ku-reset)', async () => {
    const S = await idToken('m10seller');
    await db.doc('products/m6').set({ userId: S.uid, title: 'XX', price: 1000, stock: 1, saleMode: 'auction', modeData: { endTime: now + 9999, totalBids: 1, currentBid: 1500, maxBidder: 'wahi' } });
    eq(await restPatch(S.token, 'products/m6', { modeData: { endTime: now + 9999, totalBids: 0 } }), 403, 'reset winner denied');
    eq(await restPatch(S.token, 'products/m6', { title: 'XX2' }), 200, 'control: title edit ok');
    await db.doc('products/m7').set({ userId: S.uid, title: 'YY', price: 1000, stock: 1, saleMode: 'auction', modeData: { endTime: now + 9999, totalBids: 0 } });
    eq(await restPatch(S.token, 'products/m7', { modeData: { endTime: now + 8888, totalBids: 0 } }), 200, 'control: pre-bid edit ok');
  });

  await test('M5 comments: author-only edit; kama si author 403', async () => {
    const A = await idToken('m10author'), B = await idToken('m10other');
    eq(await restCreate(A.token, 'comments', 'c10', { targetType: 'product', targetId: 'p1', authorId: A.uid, authorName: 'A', text: 'nzuri' }), 200, 'create');
    eq(await restPatch(B.token, 'comments/c10', { text: 'hacked' }), 403, 'non-author edit denied');
    eq(await restPatch(A.token, 'comments/c10', { text: 'nzuri sana' }), 200, 'author edit ok');
    eq(await restPatch(A.token, 'comments/c10', { likeCount: 99 }), 403, 'like jump denied');
  });

  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log('\nPHASE10 MARKET: ' + pass + ' passed, ' + fail + ' failed');
  for (const r of results.filter(x => !x.ok)) console.log('  FAIL [' + r.group + '] ' + r.name + ': ' + r.err);
  await admin.app().delete().catch(() => {});
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
