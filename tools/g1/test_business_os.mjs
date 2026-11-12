#!/usr/bin/env node
/* ============================================================
 * BUSINESS OS (3J / J-J1) — businessEnsureContext + mialiko ya
 * wafanyakazi (invite -> accept -> remove) + rules + UI-static.
 * Kabla ya J-J1: mmiliki hakuweza kuonboard staff mwenyewe
 * (shop_staff text-only; shopOwnerUid admin-or-self tu) — POS ya
 * watu wengi ilikuwa admin-gated. Baada: kodi ya mwaliko.
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

const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin');
const db = admin.firestore();

const results = [];
let group = '[BOS]';
async function test(name, fn) {
  try { await fn(); results.push({ group, name, ok: true }); console.log('  PASS ' + name); }
  catch (e) { results.push({ group, name, ok: false, err: e && e.message }); console.log('  FAIL ' + name + ': ' + (e && e.message)); }
}
function assert(c, msg) { if (!c) throw new Error('assert: ' + msg); }
function eq(a, b, msg) { if (a !== b) throw new Error('assert: ' + msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
const tok = (uid, extra) => ({ uid, token: Object.assign({ uid, email: uid + '@u.test', email_verified: true }, extra || {}) });
async function call(name, uid, data, extra) {
  try {
    const r = await fns[name].run({ data: data || {}, auth: uid ? tok(uid, extra) : undefined, rawRequest: { headers: {} }, acceptsStreaming: false });
    return { ok: true, data: r };
  } catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
async function wipe() {
  const r = await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert(r.ok, 'wipe');
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}
async function idToken(email) {
  const r = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true })
  });
  const j = await r.json();
  assert(j.idToken, 'signUp: ' + JSON.stringify(j).slice(0, 150));
  return { token: j.idToken, uid: j.localId };
}
function enc(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
const DOCS = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
async function restGet(tk, docPath) {
  const h = tk ? { authorization: 'Bearer ' + tk } : {};
  const r = await fetch(`${DOCS}/${docPath}`, { headers: h });
  return r.status;
}
async function restPost(tk, col, id, data) {
  const r = await fetch(`${DOCS}/${col}?documentId=${id}`, { method: 'POST', headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  return r.status;
}
async function restPatch(tk, docPath, data) {
  const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await fetch(`${DOCS}/${docPath}?${mask}&currentDocument.exists=true`, { method: 'PATCH', headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
  return r.status;
}

const O = 'bosOwner1', S = 'bosStaff1', R = 'bosStranger1';
await wipe();

/* ---------- B1: businessEnsureContext ---------- */
group = '[BOS B1 ensure-context]';
await test('B1.1 unauth inakataliwa (unauthenticated)', async () => {
  for (const fn of ['businessEnsureContext', 'staffInviteCreate', 'staffInviteAccept', 'staffInviteRevoke', 'staffRemove']) {
    const r = await call(fn, null, {});
    eq(r.ok, false, fn);
    eq(r.code, 'unauthenticated', fn + ' code');
  }
});
await test('B1.2 ensure-context inaunda business/store za mmiliki (personal)', async () => {
  await db.doc('users/' + O).set({ email: 'o@u.test' });
  const r = await call('businessEnsureContext', O, { shopId: 'shop-x' });
  eq(r.ok, true, JSON.stringify(r));
  eq(r.data && r.data.ok, true, 'ok');
  eq(r.data && r.data.ownerUid, O, 'ownerUid');
  const b = (await db.doc('businesses/business_' + O).get()).data();
  assert(b && b.ownerUid === O, 'business doc');
  const u = (await db.doc('users/' + O).get()).data();
  eq(u.shopOwnerUid, undefined, 'haigusii shopOwnerUid (stamping ni onboarding/J-J1)');
});
await test('B1.3 scope ya staff inatoka kwenye shopOwnerUid stamp (si ensure-context)', async () => {
  await db.doc('users/' + S).set({ shopOwnerUid: O });
  const r = await call('businessEnsureContext', S, { shopId: 'shop-x' });
  eq(r.ok, true, JSON.stringify(r));
  eq(r.data && r.data.ownerUid, S, 'personal context (documented)');
  const u = (await db.doc('users/' + S).get()).data();
  eq(u.shopOwnerUid, O, 'stamp ya duka haijaguswa');
});

/* ---------- B2: invite lifecycle ---------- */
group = '[BOS B2 invite]';
let rowA, inviteA, inviteB;
await test('B2.1 unda safu ya staff (owner, kupitia Admin kama seed)', async () => {
  const ref = await db.collection('shop_staff').add({ shopOwnerId: O, name: 'Juma', role: 'Cashier', shopId: 'shop-x', createdAt: 't' });
  rowA = ref.id;
  assert(rowA, 'row id');
});
await test('B2.2 owner anaunda mwaliko wenye safu -> code', async () => {
  const r = await call('staffInviteCreate', O, { role: 'Cashier', staffRowId: rowA });
  eq(r.ok, true, JSON.stringify(r));
  inviteA = r.data;
  assert(/^[A-Z2-9]{6}$/.test(inviteA.code), 'code format: ' + inviteA.code);
  eq(inviteA.role, 'Cashier', 'role');
});
await test('B2.3 mgeni hawezi kuunda mwaliko kwa safu ya mtu', async () => {
  const r = await call('staffInviteCreate', R, { role: 'Cashier', staffRowId: rowA });
  eq(r.ok, false, 'blocked');
  eq(r.code, 'permission-denied', r.code);
});
await test('B2.4 role batili inakataliwa', async () => {
  const r = await call('staffInviteCreate', O, { role: 'Hacker' });
  eq(r.ok, false, 'blocked'); eq(r.code, 'invalid-argument', r.code);
});
await test('B2.5 accept: kodi ya uongo -> not-found', async () => {
  const r = await call('staffInviteAccept', S, { code: 'ZZZZZZ' });
  eq(r.ok, false, 'blocked'); eq(r.code, 'not-found', r.code);
});
await test('B2.6 accept: mmiliki hawezi kukubali mwaliko wake', async () => {
  const r = await call('staffInviteAccept', O, { code: inviteA.code });
  eq(r.ok, false, 'blocked'); eq(r.code, 'failed-precondition', r.code);
});
await test('B2.7 accept: staff anakubali -> stamp + row link + accepted', async () => {
  const r = await call('staffInviteAccept', S, { code: inviteA.code.toLowerCase() });
  eq(r.ok, true, JSON.stringify(r));
  eq(r.data.shopOwnerId, O, 'owner');
  const u = (await db.doc('users/' + S).get()).data();
  eq(u.shopOwnerUid, O, 'stamp'); eq(u.staffRole, 'Cashier', 'role');
  const row = (await db.doc('shop_staff/' + rowA).get()).data();
  eq(row.userId, S, 'row.userId'); eq(row.status, 'active', 'row status');
  const inv = (await db.doc('staff_invites/' + inviteA.inviteId).get()).data();
  eq(inv.status, 'accepted', 'status'); eq(inv.acceptedBy, S, 'acceptedBy');
});
await test('B2.8 accept mara 2 -> not-found (single-use)', async () => {
  const r = await call('staffInviteAccept', R, { code: inviteA.code });
  eq(r.ok, false, 'blocked'); eq(r.code, 'not-found', r.code);
});
await test('B2.8b safu inayokaliwa na aliyeunganishwa haiwezi kualikwa (anti-hijack)', async () => {
  const r = await call('staffInviteCreate', O, { role: 'Cashier', staffRowId: rowA });
  eq(r.ok, false, 'blocked'); eq(r.code, 'failed-precondition', r.code);
});
await test('B2.9 staff kwenye duka A hawezi kujiunga na duka B', async () => {
  const c = await call('staffInviteCreate', R, { role: 'Cashier' });
  eq(c.ok, true, JSON.stringify(c));
  inviteB = c.data;
  const r = await call('staffInviteAccept', S, { code: inviteB.code });
  eq(r.ok, false, 'blocked'); eq(r.code, 'failed-precondition', JSON.stringify(r));
});
await test('B2.10 mwaliko ulioisha muda unakataliwa', async () => {
  await db.doc('staff_invites/' + inviteB.inviteId).update({ expiresAt: '2020-01-01T00:00:00.000Z' });
  const r = await call('staffInviteAccept', 'bosStaff2', { code: inviteB.code });
  eq(r.ok, false, 'blocked'); eq(r.code, 'deadline-exceeded', r.code);
});
await test('B2.11 accept bila safu -> safu mpya inaundwa na server', async () => {
  const c = await call('staffInviteCreate', O, { role: 'Storekeeper', staffName: 'Asha' });
  eq(c.ok, true, JSON.stringify(c));
  const r = await call('staffInviteAccept', 'bosStaff3', { code: c.data.code });
  eq(r.ok, true, JSON.stringify(r));
  const rows = await db.collection('shop_staff').where('userId', '==', 'bosStaff3').get();
  eq(rows.size, 1, 'auto row');
  eq(rows.docs[0].data().shopOwnerId, O, 'row owner');
});
await test('B2.12 revoke: mgeni hawezi; owner anaweza; kodi iliyobatilishwa haifanyi', async () => {
  const c = await call('staffInviteCreate', O, { role: 'Manager' });
  const rv1 = await call('staffInviteRevoke', R, { inviteId: c.data.inviteId });
  eq(rv1.ok, false, 'stranger blocked'); eq(rv1.code, 'permission-denied', rv1.code);
  const rv2 = await call('staffInviteRevoke', O, { inviteId: c.data.inviteId });
  eq(rv2.ok, true, JSON.stringify(rv2));
  const a = await call('staffInviteAccept', 'bosStaff4', { code: c.data.code });
  eq(a.ok, false, 'revoked unusable'); eq(a.code, 'not-found', a.code);
});
await test('B2.13 staffRemove: mgeni hawezi; owner anaondoa -> stamp-futwa + rows inactive', async () => {
  const n1 = await call('staffRemove', R, { staffUid: S });
  eq(n1.ok, false, 'stranger blocked'); eq(n1.code, 'not-found', n1.code);
  const n2 = await call('staffRemove', O, { staffUid: S });
  eq(n2.ok, true, JSON.stringify(n2));
  eq(n2.data.rows, 1, 'rows');
  const u = (await db.doc('users/' + S).get()).data();
  eq(u.shopOwnerUid, S, 'stamp cleared to self');
  eq(u.staffRole, null, 'role cleared');
  const row = (await db.doc('shop_staff/' + rowA).get()).data();
  eq(row.status, 'inactive', 'row inactive');
});
await test('B2.14 staff aliyeondolewa anaweza kujiunga tena', async () => {
  const c = await call('staffInviteCreate', O, { role: 'Cashier', staffRowId: rowA });
  eq(c.ok, true, JSON.stringify(c));
  const r = await call('staffInviteAccept', S, { code: c.data.code });
  eq(r.ok, true, JSON.stringify(r));
});

/* ---------- B3: rules ---------- */
group = '[BOS B3 rules]';
await test('B3.1 staff_invites: owner GET 200; mgeni 403; anon 403', async () => {
  const ow = await idToken('bosown@u.test');
  const st = await idToken('bosstf@u.test');
  const c = await call('staffInviteCreate', O, { role: 'Cashier' });
  const id = c.data.inviteId;
  // owner wa invite ni O (callable-uid), si akaunti za Auth — tumia Admin kusoma? LA:
  // haki ya rules inatokana na request.auth.uid; O hana token. Unda invite ya ow.uid:
  const c2 = await call('staffInviteCreate', ow.uid, { role: 'Cashier' });
  eq(await restGet(ow.token, 'staff_invites/' + c2.data.inviteId), 200, 'owner reads');
  eq(await restGet(st.token, 'staff_invites/' + c2.data.inviteId), 403, 'stranger denied');
  eq(await restGet(null, 'staff_invites/' + c2.data.inviteId), 403, 'anon denied');
  void id;
});
await test('B3.2 staff_invites: client write zote 403 (server-only)', async () => {
  const ow = await idToken('bosown2@u.test');
  const c = await call('staffInviteCreate', ow.uid, { role: 'Cashier' });
  eq(await restPatch(ow.token, 'staff_invites/' + c.data.inviteId, { status: 'accepted' }), 403, 'owner patch denied');
  eq(await restPost(ow.token, 'staff_invites', 'bosfake1', { shopOwnerId: ow.uid }), 403, 'client create denied');
});
await test('B3.3 users.shopOwnerUid: kujipangia duka la mtu 403 (kinga ya kupanda mamlaka)', async () => {
  const a = await idToken('bosatk@u.test');
  const b = await idToken('bosvic@u.test');
  await db.doc('users/' + a.uid).set({ shopOwnerUid: a.uid });
  eq(await restPatch(a.token, 'users/' + a.uid, { shopOwnerUid: b.uid }), 403, 'escalation denied');
  eq(await restPatch(a.token, 'users/' + a.uid, { shopOwnerUid: a.uid }), 200, 'self-stamp allowed');
});

/* ---------- B4: UI static ---------- */
group = '[BOS B4 ui]';
await test('B4.1 mode menu ina kiingilio cha Mfanyakazi wa Duka', async () => {
  const h = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(h.includes('mode-staffjoin'), 'menu item');
  assert(h.includes('skhJoinShopWithCode'), 'join handler');
});
await test('B4.2 staff tab ina kadi ya mwaliko + Akaunti col', async () => {
  const t = fs.readFileSync(path.join(ROOT, 'js', 'app', '10-dashboard-tabs.js'), 'utf8');
  for (const s of ['staffInviteCard', 'staffInviteRow', 'staffInviteRole', 'skhStaffInviteCreate', 'skhStaffInvitesPaint', 'skhStaffRemove', 'Akaunti']) assert(t.includes(s), s);
});
await test('B4.3 handlers zipo 15-pos-sales.js', async () => {
  const t = fs.readFileSync(path.join(ROOT, 'js', 'app', '15-pos-sales.js'), 'utf8');
  for (const s of ['skhStaffInviteCreate', 'skhStaffInvitesPaint', 'skhStaffInviteRevoke', 'skhStaffRemove', 'skhJoinShopWithCode', 'staffInviteAccept']) assert(t.includes(s), s);
});
await test('B4.4 indexes: staff_invites (shopOwnerId+status) na (code+status)', async () => {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'firestore.indexes.json'), 'utf8'));
  const has = (a, b) => d.indexes.some(i => i.collectionGroup === 'staff_invites' && i.fields.some(f => f.fieldPath === a) && i.fields.some(f => f.fieldPath === b));
  assert(has('shopOwnerId', 'status'), 'owner+status');
  assert(has('code', 'status'), 'code+status');
});

const fails = results.filter(r => !r.ok);
console.log(`\n[BOS] ${results.length - fails.length}/${results.length} passed`);
if (fails.length) { process.exitCode = 1; }
