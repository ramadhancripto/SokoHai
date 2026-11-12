#!/usr/bin/env node
/* ============================================================
 * LIVE COMMERCE (3D) — liveCreate -> start -> join -> comment ->
 * like -> pin/setProducts -> end; + embed allowlist, host-gating,
 * admin remove, rules (removed-hidden, server-write-only).
 * ========================================================== */
import { createRequire } from 'node:module';
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
let group = '[LV live]';
async function test(name, fn) {
  try { await fn(); results.push({ group, name, ok: true }); console.log('  PASS ' + name); }
  catch (e) { results.push({ group, name, ok: false, err: e && e.message }); console.log('  FAIL ' + name + ': ' + (e && e.message)); }
}
function assert(c, msg) { if (!c) throw new Error('assert: ' + msg); }
function eq(a, b, msg) { if (a !== b) throw new Error('assert: ' + msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
const tok = (uid, extra) => ({ uid, token: Object.assign({ uid, email: uid + '@u.test', email_verified: true }, extra || {}) });
async function call(name, uid, data, extra) {
  try {
    const r = await fns[name].run({ data: data || {}, auth: tok(uid, extra), rawRequest: { headers: {} }, acceptsStreaming: false });
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
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
const DOCS = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
async function restGet(tk, p) {
  const r = await fetch(`${DOCS}/${p}`, { headers: { authorization: 'Bearer ' + tk } });
  return r.status;
}
async function restPatch(tk, p, data) {
  const body = { fields: enc(data).mapValue.fields };
  const r = await fetch(`${DOCS}/${p}`, { method: 'PATCH', headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.status;
}
import fs from 'node:fs';
async function loadRules() {
  const src = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf-8');
  const r = await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: src }] } }) });
  assert(r.ok, 'setSecurityRules: ' + r.status);
}

const H = 'lvHost', B = 'lvBuyer', O = 'lvOther', A = 'lvAdmin';
async function seed() {
  await wipe(); await loadRules();
  await db.doc('users/' + H).set({ fullName: 'Mwenyeji', isSeller: true, businessName: 'Duka la Mwenyeji' });
  await db.doc('users/' + B).set({ fullName: 'Mnunuzi' });
  await db.doc('users/' + O).set({ fullName: 'Mwingine' });
  await db.doc('users/' + A).set({ fullName: 'Admin', role: 'admin' });
  await db.doc('products/lvP1').set({ userId: H, title: 'Kitenge', price: 25000, publicationStatus: 'published' });
  await db.doc('products/lvP2').set({ userId: H, title: 'Kikoi', price: 15000, publicationStatus: 'published' });
  await db.doc('products/lvPA').set({ userId: H, title: 'Mnada Saa', price: 50000, publicationStatus: 'published', saleMode: 'auction', modeData: { mode: 'auction' } });
  await db.doc('products/lvOP').set({ userId: O, title: 'Cha Mwingine', price: 9000, publicationStatus: 'published' });
  await db.doc('products/lvDraft').set({ userId: H, title: 'Rasimu', price: 1000, publicationStatus: 'draft' });
  await db.collection('sellerFollowers').add({ sellerId: H, followerId: B });
}

await seed();

// ---- L1 create + embed allowlist ----
await test('L1 create: muuzaji anatengeneza live; embed huruhusiwa YouTube/Vimeo tu', async () => {
  const r = await call('liveCreate', H, { kind: 'live_commerce', title: 'Mkusanyiko Mpya', productIds: ['lvP1', 'lvP2'], videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  eq(r.ok, true, 'create ok: ' + JSON.stringify(r).slice(0, 200));
  eq(r.data.video.kind, 'embed', 'video kind');
  eq(r.data.video.url, 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'watch->embed normalized');
  const bad = await call('liveCreate', H, { kind: 'live', title: 'Jaribio Baya Sana', videoUrl: 'https://evil.example.com/player' });
  eq(bad.ok, false, 'evil player rejected');
  eq(bad.code, 'invalid-argument', 'evil code');
  const vimeo = await call('liveCreate', H, { kind: 'live', title: 'Vimeo Show Kubwa', videoUrl: 'https://vimeo.com/123456789' });
  eq(vimeo.ok && vimeo.data.video.url, 'https://player.vimeo.com/video/123456789', 'vimeo normalized');
  const none = await call('liveCreate', B, { kind: 'live', title: 'Si Muuzaji Show' });
  eq(none.ok, false, 'non-seller w/o products denied');
  eq(none.code, 'permission-denied', 'non-seller code');
  const other = await call('liveCreate', H, { kind: 'live_commerce', title: 'Bidhaa Ya Mtu', productIds: ['lvOP'] });
  eq(other.ok, false, 'product ya mtu denied');
  const draft = await call('liveCreate', H, { kind: 'live_commerce', title: 'Rasimu Show', productIds: ['lvDraft'] });
  eq(draft.ok, false, 'draft product denied');
  const ak = await call('liveCreate', H, { kind: 'auction', title: 'Mnada Show', productIds: ['lvP1'] });
  eq(ak.ok, false, 'auction kind + non-auction product denied');
  const ak2 = await call('liveCreate', H, { kind: 'auction', title: 'Mnada Show Halisi', productIds: ['lvPA'] });
  eq(ak2.ok, true, 'auction kind + auction product ok: ' + JSON.stringify(ak2).slice(0, 160));
});

// ---- L2 start/join/leave ----
let SID = null;
await test('L2 start/join/leave: host anaanza; viewer count inahesabu mabadiliko tu', async () => {
  const c = await call('liveCreate', H, { kind: 'live_commerce', title: 'Live Ya Kuuza', productIds: ['lvP1'] });
  SID = c.data.sessionId;
  const ns = await call('liveStart', B, { sessionId: SID });
  eq(ns.ok, false, 'non-host start denied');
  const st = await call('liveStart', H, { sessionId: SID });
  eq(st.ok, true, 'host start: ' + JSON.stringify(st).slice(0, 160));
  const st2 = await call('liveStart', H, { sessionId: SID });
  eq(st2.ok, false, 'double start rejected');
  const nq = await db.collection('notifications').where('type', '==', 'live_started').where('userId', '==', B).get();
  eq(nq.empty, false, 'follower notified');
  const j1 = await call('liveJoin', B, { sessionId: SID });
  eq(j1.ok && j1.data.viewerCount, 1, 'join -> 1');
  const j2 = await call('liveJoin', B, { sessionId: SID });
  eq(j2.ok && j2.data.viewerCount, 1, 're-join stays 1');
  const j3 = await call('liveJoin', O, { sessionId: SID });
  eq(j3.ok && j3.data.viewerCount, 2, 'second viewer -> 2');
  const lv = await call('liveLeave', B, { sessionId: SID });
  eq(lv.ok, true, 'leave ok');
  const s = await db.doc('live_sessions/' + SID).get();
  eq(s.data().viewerCount, 1, 'count back to 1');
});

// ---- L3 comments ----
await test('L3 comment: ujumbe unaonekana; duplicate + rate-limit + mute + pre-live zinadhibitiwa', async () => {
  const c1 = await call('liveComment', B, { sessionId: SID, text: 'Habari, bei gani?', clientId: 'c1abc' });
  eq(c1.ok, true, 'comment ok: ' + JSON.stringify(c1).slice(0, 160));
  const dup = await call('liveComment', B, { sessionId: SID, text: 'Habari, bei gani?', clientId: 'c1abc' });
  eq(dup.ok && dup.data.duplicate, true, 'duplicate flagged');
  const fast = await call('liveComment', B, { sessionId: SID, text: 'Haraka sana', clientId: 'c2fast' });
  eq(fast.ok, false, 'rate limited');
  eq(fast.code, 'resource-exhausted', 'rate code');
  const s = await db.doc('live_sessions/' + SID).get();
  eq(s.data().commentCount, 1, 'count counts once');
  const mute = await call('liveModerate', B, { sessionId: SID, action: 'mute', uid: O });
  eq(mute.ok, false, 'non-host moderate denied');
  const mh = await call('liveModerate', H, { sessionId: SID, action: 'mute', uid: O });
  eq(mh.ok, true, 'host mute ok');
  const mc = await call('liveComment', O, { sessionId: SID, text: 'Mimi nimezuiwa', clientId: 'm1' });
  eq(mc.ok, false, 'muted cannot comment');
  const c2 = await call('liveCreate', H, { kind: 'live', title: 'Bado Haijaanza Show' });
  const pre = await call('liveComment', B, { sessionId: c2.data.sessionId, text: 'Mapema', clientId: 'p1' });
  eq(pre.ok, false, 'comment before start denied');
});

// ---- L4 like + remind ----
await test('L4 like/remind: like moja kwa 1.5s; ukumbusho unaweza kuwashwa/kuzimwa', async () => {
  const l1 = await call('liveLike', B, { sessionId: SID });
  eq(l1.ok && l1.data.counted, true, 'like counted');
  const l2 = await call('liveLike', B, { sessionId: SID });
  eq(l2.ok && l2.data.counted, false, 'instant second like not counted');
  const c = await call('liveCreate', H, { kind: 'live', title: 'Show Ijayo Kubwa' });
  const nsid = c.data.sessionId;
  const r1 = await call('liveRemind', B, { sessionId: nsid, on: true });
  eq(r1.ok && r1.data.on, true, 'remind on');
  const r2 = await call('liveRemind', B, { sessionId: nsid, on: false });
  eq(r2.ok && r2.data.on, false, 'remind off');
  const r3 = await call('liveRemind', B, { sessionId: SID, on: true });
  eq(r3.ok, false, 'remind on live (non-scheduled) denied');
});

// ---- L5 pin / setProducts ----
await test('L5 pin/setProducts: host anabadilisha bidhaa; za nje zinakataliwa', async () => {
  const pin = await call('livePin', H, { sessionId: SID, productId: 'lvP1' });
  eq(pin.ok, true, 'pin ok: ' + JSON.stringify(pin).slice(0, 160));
  const pinBad = await call('livePin', H, { sessionId: SID, productId: 'lvP2' });
  eq(pinBad.ok, false, 'pin non-listed denied');
  const set = await call('liveSetProducts', H, { sessionId: SID, productIds: ['lvP1', 'lvP2'] });
  eq(set.ok, true, 'setProducts ok: ' + JSON.stringify(set).slice(0, 160));
  const s = await db.doc('live_sessions/' + SID).get();
  eq(JSON.stringify(s.data().productIds), JSON.stringify(['lvP1', 'lvP2']), 'list replaced');
  const pin2 = await call('livePin', H, { sessionId: SID, productId: 'lvP2' });
  eq(pin2.ok, true, 'pin newly-listed ok');
  const setBad = await call('liveSetProducts', H, { sessionId: SID, productIds: ['lvOP'] });
  eq(setBad.ok, false, 'setProducts ya mtu denied');
  const setStranger = await call('liveSetProducts', O, { sessionId: SID, productIds: ['lvP1'] });
  eq(setStranger.ok, false, 'stranger setProducts denied');
});

// ---- L6 end + admin remove ----
await test('L6 end/remove: host anamaliza (idempotent); admin anaondoa; sababu inahitajika', async () => {
  const e1 = await call('liveEnd', B, { sessionId: SID });
  eq(e1.ok, false, 'non-host end denied');
  const e2 = await call('liveEnd', H, { sessionId: SID });
  eq(e2.ok, true, 'host end');
  const s = await db.doc('live_sessions/' + SID).get();
  eq(s.data().status, 'ended', 'status ended');
  eq(s.data().viewerCount, 0, 'viewers zeroed');
  const e3 = await call('liveEnd', H, { sessionId: SID });
  eq(e3.ok && e3.data.already, true, 'double end idempotent');
  const c = await call('liveCreate', H, { kind: 'live', title: 'Show Ya Kuondolewa' });
  const rsid = c.data.sessionId;
  const rep = await call('liveReport', B, { sessionId: rsid, reason: 'Maudhui mabaya sana hapa' });
  eq(rep.ok, true, 'report ok');
  const rep2 = await call('liveReport', B, { sessionId: rsid, reason: 'Tena maudhui mabaya' });
  eq(rep2.ok && rep2.data.already, true, 'report idempotent');
  const rmBad = await call('adminLiveRemove', B, { sessionId: rsid, reason: 'Sababu ndefu ya kutosha' });
  eq(rmBad.ok, false, 'non-admin remove denied');
  const rmShort = await call('adminLiveRemove', A, { sessionId: rsid, reason: 'fupi' }, { admin: true });
  eq(rmShort.ok, false, 'short reason denied');
  const rm = await call('adminLiveRemove', A, { sessionId: rsid, reason: 'Ukiukaji wa maadili ya jukwaa' }, { admin: true });
  eq(rm.ok, true, 'admin remove: ' + JSON.stringify(rm).slice(0, 160));
  const rs = await db.doc('live_sessions/' + rsid).get();
  eq(rs.data().status, 'removed', 'status removed');
  const jx = await call('liveJoin', B, { sessionId: rsid });
  eq(jx.ok, false, 'join removed denied');
  globalThis.__LV_REMOVED = rsid;
  globalThis.__LV_ENDED = SID;
});

// ---- L7 rules ----
await test('L7 rules: removed imefichwa kwa wanunuzi; maandishi ni ya server tu', async () => {
  const buyer = await idToken('lvrules-buyer@rules.test');
  const host = await idToken('lvrules-host@rules.test');
  // seed sessions owned by these auth uids
  await db.doc('users/' + host.uid).set({ fullName: 'RH', isSeller: true });
  await db.doc('products/lvRH').set({ userId: host.uid, title: 'RH', price: 1, publicationStatus: 'published' });
  const c = await fns.liveCreate.run({ data: { kind: 'live', title: 'Rules Session Show', productIds: ['lvRH'] }, auth: tok(host.uid), rawRequest: { headers: {} }, acceptsStreaming: false });
  const sid = c.sessionId;
  await fns.adminLiveRemove.run({ data: { sessionId: sid, reason: 'Ukiukaji mkubwa sana hapa' }, auth: tok(A, { admin: true }), rawRequest: { headers: {} }, acceptsStreaming: false });
  eq(await restGet(buyer.token, 'live_sessions/' + sid), 403, 'buyer cannot GET removed');
  eq(await restGet(host.token, 'live_sessions/' + sid), 200, 'host can GET own removed');
  eq(await restPatch(buyer.token, 'live_sessions/' + sid, { title: 'HACK' }), 403, 'buyer cannot PATCH session');
  eq(await restPatch(host.token, 'live_sessions/' + sid, { title: 'HACK' }), 403, 'host cannot PATCH session (server-only)');
  const c2 = await fns.liveCreate.run({ data: { kind: 'live', title: 'Wazi Show Kubwa' }, auth: tok(host.uid), rawRequest: { headers: {} }, acceptsStreaming: false });
  eq(await restGet(buyer.token, 'live_sessions/' + c2.sessionId), 200, 'buyer can GET visible session');
  eq(await restGet(buyer.token, 'live_reports/x'), 403, 'buyer cannot read reports');
  // 3E: ukumbusho — kila mtu anasoma safu yake tu
  await fns.liveRemind.run({ data: { sessionId: c2.sessionId, on: true }, auth: tok(buyer.uid), rawRequest: { headers: {} }, acceptsStreaming: false });
  eq(await restGet(buyer.token, 'live_sessions/' + c2.sessionId + '/reminders/' + buyer.uid), 200, 'own reminder readable');
  eq(await restGet(buyer.token, 'live_sessions/' + c2.sessionId + '/reminders/' + host.uid), 403, 'other reminder hidden');
  await fns.liveJoin.run({ data: { sessionId: c2.sessionId }, auth: tok(buyer.uid), rawRequest: { headers: {} }, acceptsStreaming: false });
  eq(await restGet(buyer.token, 'live_sessions/' + c2.sessionId + '/viewers/' + buyer.uid), 200, 'own viewer row readable');
  eq(await restGet(buyer.token, 'live_sessions/' + c2.sessionId + '/viewers/' + host.uid), 403, 'other viewer row hidden');
});

const pass = results.filter(r => r.ok).length, fail = results.filter(r => !r.ok);
console.log(`LIVE COMMERCE: ${pass} passed, ${fail.length} failed`);
for (const f of fail) console.log('  FAIL ' + f.group + ' ' + f.name + ': ' + f.err);
process.exit(fail.length ? 1 : 0);
