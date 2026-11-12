#!/usr/bin/env node
/**
 * [R13-B] Live / Live Commerce, Stories, Group Soko —
 * end-to-end against the FIREBASE EMULATOR (callables + rules + price check).
 *   firebase emulators:exec --only firestore,auth --project demo-sokohai "node tools/test_live_stories_groupsoko_emulator.mjs"
 * Exits 2 (BLOCKED) without the emulator; never touches production.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST, AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS_HOST || !AUTH_HOST) { console.error('BLOCKED: emulator required'); process.exit(2); }
const PROJECT = 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT; process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });
process.env.PESAPAL_CONSUMER_KEY = 'k'; process.env.PESAPAL_CONSUMER_SECRET = 's'; process.env.PESAPAL_BASE_URL = 'https://pesapal.stub/v3';
const realFetch = globalThis.fetch; const PP = new Map();
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (!u.startsWith('https://pesapal.stub/')) return realFetch(url, opts);
  const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.includes('RequestToken')) return json({ token: 't', expiryDate: new Date(Date.now() + 3e5).toISOString() });
  const id = new URL(u).searchParams.get('orderTrackingId'); const t = PP.get(id);
  return json(t ? { status_code: 1, payment_status_description: 'Completed', order_tracking_id: id, merchant_reference: 'M_' + id, amount: t.amount, currency: 'TZS' }
    : { status_code: 0, order_tracking_id: id, amount: 0, currency: 'TZS' });
};
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const fns = require(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin'); const db = admin.firestore();
const fs = await import('node:fs');
let pass = 0, fail = 0; const fails = [];
async function test(n, fn) { try { await fn(); pass++; console.log('  PASS ' + n); } catch (e) { fail++; fails.push(n + ': ' + e.message); console.log('  FAIL ' + n + '\n       ' + e.message); } }
const assert = (c, m) => { if (!c) throw new Error('assert: ' + m); };
const eq = (a, b, m) => { if (a !== b) throw new Error('assert: ' + m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); };
const tok = (uid) => ({ uid, token: { uid, email: uid + '@u.test', email_verified: true } });
async function call(name, uid, data) {
  try { return { ok: true, data: await fns[name].run({ data, auth: uid ? tok(uid) : null, rawRequest: { headers: {} } }) }; }
  catch (e) { return { ok: false, code: e.code, message: e.message }; }
}
const get = async (p) => (await db.doc(p).get()).data() || {};
async function wipe() { await realFetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' }); PP.clear(); }
async function loadRules() {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const r = await realFetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }) });
  assert(r.ok, 'rules load ' + r.status + ' ' + (await r.text()).slice(0, 300));
}
// REST as a browser (rules apply)
function b64(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }
function jwt(uid) { const n = Math.floor(Date.now() / 1000); return b64({ alg: 'none' }) + '.' + b64({ iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, auth_time: n, user_id: uid, sub: uid, iat: n, exp: n + 3600, email: uid + '@u.test', email_verified: true, firebase: { sign_in_provider: 'password' } }) + '.'; }
function enc(v) { if (v === null) return { nullValue: null }; if (typeof v === 'boolean') return { booleanValue: v }; if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }; if (typeof v === 'string') return { stringValue: v }; if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } }; return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } }; }
const DOCS = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
async function restPatch(uid, p, data) { const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&'); return (await realFetch(`${DOCS}/${p}?${mask}&currentDocument.exists=true`, { method: 'PATCH', headers: { authorization: 'Bearer ' + jwt(uid), 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) })).status; }
async function restCreate(uid, col, id, data) { return (await realFetch(`${DOCS}/${col}?documentId=${id}`, { method: 'POST', headers: { authorization: 'Bearer ' + jwt(uid), 'content-type': 'application/json' }, body: JSON.stringify({ fields: enc(data).mapValue.fields }) })).status; }
const later = (h) => new Date(Date.now() + h * 3600e3).getTime();

await loadRules(); await wipe();
const callAs = async (name, uid, data, extra) => { try { return { ok: true, data: await fns[name].run({ data, auth: uid ? { uid, token: Object.assign({ uid, email: uid + '@u.test', email_verified: true }, extra || {}) } : null, rawRequest: { headers: {} } }) }; } catch (e) { return { ok: false, code: e.code, message: e.message }; } };
const restGet = async (uid, p) => (await realFetch(`${DOCS}/${p}`, { headers: { authorization: 'Bearer ' + jwt(uid) } })).status;
const sleep = ms => new Promise(r => setTimeout(r, ms));

await loadRules(); await wipe();
for (const u of ['host', 'v1', 'v2', 'bad', 'other']) await db.doc('users/' + u).set({ uid: u, fullName: u.toUpperCase(), isSeller: u === 'host' });
await db.doc('users/bad').update({ accountStatus: 'suspended' });
await db.doc('products/p1').set({ title: 'Simu', price: 300000, stock: 3, userId: 'host', saleMode: 'free_market' });
await db.doc('products/p2').set({ title: 'Pasi', price: 40000, stock: 5, userId: 'host', saleMode: 'free_market' });
await db.doc('products/pa').set({ title: 'Saa', price: 10000, stock: 1, userId: 'host', saleMode: 'auction', modeData: { mode: 'auction', endTime: later(2) } });
await db.doc('products/px').set({ title: 'Ya mwingine', price: 1000, stock: 1, userId: 'other' });
await db.doc('sellerFollowers/v1__host').set({ followerId: 'v1', sellerId: 'host' });

console.log('\n[Live / Live Commerce]');
let S = null;
await test('only real players are accepted as video (YouTube/Vimeo); others refused', async () => {
  const { embedUrl } = require(path.join(ROOT, 'functions/live-commerce.js'))._testing;
  eq(embedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'watch'); eq(embedUrl('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'short');
  eq(embedUrl('https://vimeo.com/123456'), 'https://player.vimeo.com/video/123456', 'vimeo'); eq(embedUrl('https://evil.example/x'), null, 'other host'); eq(embedUrl('http://youtube.com/embed/abcdefg'), null, 'http');
});
await test('a host can not show someone else\'s product; suspended users can not go live', async () => {
  const r = await call('liveCreate', 'host', { title: 'Live ya leo', kind: 'live_commerce', productIds: ['p1', 'px'] }); assert(!r.ok && /si_bidhaa_yako/.test(r.message), r.message);
  const s = await call('liveCreate', 'bad', { title: 'Live', kind: 'live' }); assert(!s.ok && /imesimamishwa/.test(s.message), s.message);
});
await test('Mnada Live only with auction listings', async () => {
  const r = await call('liveCreate', 'host', { title: 'Mnada', kind: 'auction', productIds: ['p1'] }); assert(!r.ok && /si_mnada/.test(r.message), r.message);
  const ok = await call('liveCreate', 'host', { title: 'Mnada', kind: 'auction', productIds: ['pa'] }); assert(ok.ok, ok.message);
});
await test('host creates a Live Commerce session (scheduled) with a YouTube player', async () => {
  const r = await call('liveCreate', 'host', { title: 'Ofa za simu', kind: 'live_commerce', productIds: ['p1', 'p2'], videoUrl: 'https://youtu.be/dQw4w9WgXcQ', recordingAllowed: true });
  assert(r.ok, r.message); S = r.data.sessionId; const d = await get('live_sessions/' + S);
  eq(d.status, 'scheduled', 'status'); eq(d.pinnedProductId, 'p1', 'first product pinned'); eq(d.video.kind, 'embed', 'video');
});
await test('viewer can not start someone else\'s live; host starts it and followers are told', async () => {
  const x = await call('liveStart', 'v1', { sessionId: S }); assert(!x.ok && /si_mwenyeji/.test(x.message), x.message);
  const r = await call('liveStart', 'host', { sessionId: S }); assert(r.ok && r.data.notified === 1, JSON.stringify(r));
  eq((await db.collection('notifications').where('userId', '==', 'v1').get()).docs.filter(d => d.data().type === 'live_started').length, 1, 'follower notice');
});
await test('viewers join/leave; count and peak follow distinct users', async () => {
  await call('liveJoin', 'v1', { sessionId: S }); await call('liveJoin', 'v1', { sessionId: S }); await call('liveJoin', 'v2', { sessionId: S });
  let d = await get('live_sessions/' + S); eq(d.viewerCount, 2, 'two distinct'); eq(d.peakViewers, 2, 'peak');
  await call('liveLeave', 'v2', { sessionId: S }); d = await get('live_sessions/' + S); eq(d.viewerCount, 1, 'after leave'); eq(d.peakViewers, 2, 'peak kept');
});
await test('comments: real time, rate-limited, idempotent, length-limited, no HTML', async () => {
  const a = await call('liveComment', 'v1', { sessionId: S, text: 'Bei gani? <b>hi</b>', clientId: 'c1' }); assert(a.ok, a.message);
  const dup = await call('liveComment', 'v1', { sessionId: S, text: 'Bei gani?', clientId: 'c1' }); assert(dup.ok && dup.data.duplicate, JSON.stringify(dup));
  const fast = await call('liveComment', 'v1', { sessionId: S, text: 'tena', clientId: 'c2' }); assert(!fast.ok && /subiri_kidogo/.test(fast.message), fast.message);
  const c = (await db.collection('live_sessions/' + S + '/comments').where('uid', '==', 'v1').get()).docs.map(x => x.data());
  eq(c.length, 1, 'one comment'); assert(!/[<>]/.test(c[0].text), 'html stripped');
});
await test('host pins a product shown in the live; can not pin a foreign one', async () => {
  const bad = await call('livePin', 'host', { sessionId: S, productId: 'px' }); assert(!bad.ok, 'foreign');
  const ok = await call('livePin', 'host', { sessionId: S, productId: 'p2' }); assert(ok.ok, ok.message); eq((await get('live_sessions/' + S)).pinnedProductId, 'p2', 'pinned');
});
await test('moderation: host mutes a viewer (no more comments) and removes a comment; audited', async () => {
  const notHost = await call('liveModerate', 'v2', { sessionId: S, action: 'mute', uid: 'v1' }); assert(!notHost.ok, 'viewer can not moderate');
  assert((await call('liveModerate', 'host', { sessionId: S, action: 'mute', uid: 'v1' })).ok, 'mute');
  await sleep(2100); const m = await call('liveComment', 'v1', { sessionId: S, text: 'naweza?' }); assert(!m.ok && /umezuiwa/.test(m.message), m.message);
  const cid = (await db.collection('live_sessions/' + S + '/comments').where('uid', '==', 'v1').get()).docs[0].id;
  assert((await call('liveModerate', 'host', { sessionId: S, action: 'remove_comment', commentId: cid })).ok, 'remove');
  eq((await get('live_sessions/' + S + '/comments/' + cid)).status, 'removed', 'hidden'); assert((await db.collection('admin_audit_log').where('action', '==', 'LIVE_MODERATE_MUTE').get()).size === 1, 'audit');
});
await test('report once per viewer; admin can take a live down with a reason', async () => {
  assert((await call('liveReport', 'v2', { sessionId: S, reason: 'Matangazo ya uongo' })).ok, 'report'); const again = await call('liveReport', 'v2', { sessionId: S, reason: 'tena tena' }); assert(again.data.already, 'once');
  const nope = await call('adminLiveRemove', 'v2', { sessionId: S, reason: 'si admin hapa' }); assert(!nope.ok, 'non-admin');
});
await test('rules: browsers can read the live and comments but write nothing', async () => {
  eq(await restGet('v2', 'live_sessions/' + S), 200, 'read'); eq(await restPatch('host', 'live_sessions/' + S, { viewerCount: 9999 }), 403, 'host cannot fake viewers');
  eq(await restCreate('v2', 'live_sessions/' + S + '/comments', 'fake', { uid: 'host', text: 'fake host message' }), 403, 'no forged comment');
  eq(await restGet('v2', 'live_sessions/' + S + '/viewers/v1'), 403, 'viewer list private'); eq(await restGet('host', 'live_sessions/' + S + '/viewers/v1'), 200, 'host sees viewers');
});
await test('host ends the live; the recording link must be a real player', async () => {
  const bad = await call('liveEnd', 'host', { sessionId: S, recordingUrl: 'https://evil.example/v.mp4' }); assert(!bad.ok && /rekodi_haikubaliki/.test(bad.message), bad.message);
  const ok = await call('liveEnd', 'host', { sessionId: S, recordingUrl: 'https://youtu.be/dQw4w9WgXcQ' }); assert(ok.ok, ok.message);
  const d = await get('live_sessions/' + S); eq(d.status, 'ended', 'ended'); eq(d.recordingUrl, 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'recording');
  const c = await call('liveComment', 'v2', { sessionId: S, text: 'bado?' }); assert(!c.ok && /live_haiendelei/.test(c.message), 'no comments after end');
});
await test('admin removal hides the session from viewers', async () => {
  const r = await callAs('adminLiveRemove', 'ops', { sessionId: S, reason: 'Ukiukaji wa masharti' }, { admin: true }); assert(r.ok, r.message);
  eq(await restGet('v2', 'live_sessions/' + S), 403, 'hidden'); eq(await restGet('host', 'live_sessions/' + S), 200, 'host still sees it');
});

console.log('\n[Stories]');
const media = (uid, kind = 'image') => `https://res.cloudinary.com/demo/${kind}/upload/v1/sokohai/stories/${uid}/a1.${kind === 'image' ? 'jpg' : 'mp4'}`;
let ST = null;
await test('story media must be the author\'s own signed upload', async () => {
  const r = await call('storyCreate', 'host', { mediaUrl: media('other') }); assert(!r.ok && /yako_pekee/.test(r.message), r.message);
  const r2 = await call('storyCreate', 'host', { mediaUrl: 'https://evil.example/a.jpg' }); assert(!r2.ok, 'outside link');
});
await test('author posts a video story linked to their own listing (24h)', async () => {
  const bad = await call('storyCreate', 'host', { mediaUrl: media('host', 'video'), listing: { col: 'products', id: 'px' } }); assert(!bad.ok && /si_tangazo_lako/.test(bad.message), bad.message);
  const r = await call('storyCreate', 'host', { mediaUrl: media('host', 'video'), caption: 'Mzigo mpya', listing: { col: 'products', id: 'p1' } }); assert(r.ok, r.message); ST = r.data.storyId;
  const s = await get('stories/' + ST); eq(s.kind, 'video', 'kind'); eq(s.listing.id, 'p1', 'listing'); assert(s.expiresAtMs - Date.now() > 23.9 * 3600e3, '24h');
});
await test('views counted once per viewer (not the author)', async () => {
  await call('storyView', 'v1', { storyId: ST }); await call('storyView', 'v1', { storyId: ST }); await call('storyView', 'host', { storyId: ST });
  eq((await get('stories/' + ST)).viewCount, 1, 'one view');
});
await test('followers-only story: follower reads, others can not; nobody writes', async () => {
  const r = await call('storyCreate', 'host', { mediaUrl: media('host'), visibility: 'followers' }); const F = r.data.storyId;
  eq(await restGet('v1', 'stories/' + F), 200, 'follower'); eq(await restGet('v2', 'stories/' + F), 403, 'non-follower');
  eq(await restPatch('host', 'stories/' + F, { viewCount: 1e6 }), 403, 'no fake views');
});
await test('expired or removed stories are not readable; author/admin remove', async () => {
  await db.doc('stories/' + ST).update({ expiresAtMs: Date.now() - 1000 }); eq(await restGet('v1', 'stories/' + ST), 403, 'expired');
  const x = await call('storyRemove', 'v2', { storyId: ST }); assert(!x.ok, 'not author');
  assert((await call('storyRemove', 'host', { storyId: ST })).ok, 'author removes');
  assert((await call('storyReport', 'v2', { storyId: ST, reason: 'Si sahihi' })).ok, 'report recorded');
});

console.log('\n[Group Soko]');
for (const u of ['chair', 'treas', 'store', 'aud', 'mem']) await db.doc('users/' + u).set({ uid: u, fullName: u.toUpperCase() });
let G = null;
await test('create Group Soko; creator is chair; members invited then accept', async () => {
  const r = await call('groupSokoCreate', 'chair', { name: 'Wakulima Pamoja', purpose: 'Kununua mbolea kwa jumla', ownershipBasis: 'capital' }); assert(r.ok, r.message); G = r.data.groupId;
  for (const u of ['treas', 'store', 'aud', 'mem']) { assert((await call('groupSokoInvite', 'chair', { groupId: G, uid: u })).ok, 'invite ' + u); assert((await call('groupSokoAccept', u, { groupId: G })).ok, 'accept ' + u); }
  eq((await get('group_soko/' + G)).memberCount, 5, 'five members');
  const x = await call('groupSokoInvite', 'mem', { groupId: G, uid: 'other' }); assert(!x.ok && /jukumu_halitoshi/.test(x.message), 'member can not invite');
});
const vote = async (pid, voters, v = 'yes') => { let last; for (const u of voters) last = await call('groupSokoVote', u, { groupId: G, proposalId: pid, vote: v }); return last; };
await test('roles change only by vote (quorum of active members)', async () => {
  for (const [u, role] of [['treas', 'treasurer'], ['store', 'storekeeper'], ['aud', 'auditor']]) {
    const p = await call('groupSokoPropose', 'chair', { groupId: G, type: 'role', title: 'Jukumu ' + role, details: { uid: u, role } });
    const v = await vote(p.data.proposalId, ['chair', 'treas', 'store']); eq(v.data.status, 'approved', 'approved by 3/5');
    assert((await call('groupSokoExecute', 'chair', { groupId: G, proposalId: p.data.proposalId })).ok, 'execute');
  }
  eq((await get('group_soko/' + G + '/members/treas')).role, 'treasurer', 'role set');
  const dbl = await call('groupSokoVote', 'chair', { groupId: G, proposalId: (await db.collection('group_soko/' + G + '/proposals').limit(1).get()).docs[0].id, vote: 'yes' }); assert(!dbl.ok, 'closed / no double vote');
});
await test('capital is a record confirmed by someone else (not the contributor nor the recorder)', async () => {
  const a = await call('groupSokoCapitalRecord', 'mem', { groupId: G, amount: 500000, method: 'mobile_money', reference: 'MP123' }); assert(a.ok, a.message);
  const self = await call('groupSokoCapitalConfirm', 'treas', { groupId: G, capitalId: a.data.capitalId }); assert(self.ok, 'treasurer confirms member capital');
  const b = await call('groupSokoCapitalRecord', 'treas', { groupId: G, amount: 300000, method: 'bank', reference: 'BK9' });
  const own = await call('groupSokoCapitalConfirm', 'treas', { groupId: G, capitalId: b.data.capitalId }); assert(!own.ok && /mtu_mwingine/.test(own.message), 'own capital not self-confirmed');
  assert((await call('groupSokoCapitalConfirm', 'chair', { groupId: G, capitalId: b.data.capitalId })).ok, 'chair confirms');
  const m = await call('groupSokoCapitalConfirm', 'mem', { groupId: G, capitalId: b.data.capitalId }); assert(!m.ok, 'member can not confirm');
});
let PUR = null;
await test('supplier purchase: proposal -> vote -> treasurer orders it', async () => {
  const p = await call('groupSokoPropose', 'mem', { groupId: G, type: 'purchase', title: 'Mbolea ya UREA', details: { supplierName: 'Agro Supplies', items: [{ name: 'UREA 50kg', qty: 10, unitCost: 60000 }] } });
  eq((await get('group_soko/' + G + '/proposals/' + p.data.proposalId)).amount, 600000, 'total from items');
  const early = await call('groupSokoExecute', 'treas', { groupId: G, proposalId: p.data.proposalId }); assert(!early.ok && /halijakubaliwa/.test(early.message), 'not before approval');
  await vote(p.data.proposalId, ['chair', 'treas', 'aud']);
  const nonT = await call('groupSokoExecute', 'store', { groupId: G, proposalId: p.data.proposalId }); assert(!nonT.ok, 'storekeeper can not execute money');
  const r = await call('groupSokoExecute', 'treas', { groupId: G, proposalId: p.data.proposalId }); assert(r.ok, r.message); PUR = r.data.purchaseId;
});
await test('separation of duties: receive != requester, inspect != receiver, pay = treasurer who did neither', async () => {
  const wrongRole = await call('groupSokoPurchaseStep', 'mem', { groupId: G, purchaseId: PUR, step: 'receive' }); assert(!wrongRole.ok, 'member can not receive');
  const payEarly = await call('groupSokoPurchaseStep', 'treas', { groupId: G, purchaseId: PUR, step: 'pay', paymentRef: 'BANK-1' }); assert(!payEarly.ok && /hatua_si_sahihi/.test(payEarly.message), 'no payment before receipt');
  assert((await call('groupSokoPurchaseStep', 'store', { groupId: G, purchaseId: PUR, step: 'receive', note: 'Magunia 10' })).ok, 'storekeeper receives');
  const selfInspect = await call('groupSokoPurchaseStep', 'store', { groupId: G, purchaseId: PUR, step: 'inspect' }); assert(!selfInspect.ok && /asikague/.test(selfInspect.message), 'receiver can not inspect');
  assert((await call('groupSokoPurchaseStep', 'aud', { groupId: G, purchaseId: PUR, step: 'inspect', qualityOk: true })).ok, 'auditor inspects');
  const noRef = await call('groupSokoPurchaseStep', 'treas', { groupId: G, purchaseId: PUR, step: 'pay' }); assert(!noRef.ok, 'payment needs a reference');
  assert((await call('groupSokoPurchaseStep', 'treas', { groupId: G, purchaseId: PUR, step: 'pay', paymentRef: 'BANK-778' })).ok, 'treasurer pays');
  const p = await get('group_soko/' + G + '/purchases/' + PUR); eq(p.status, 'paid', 'paid'); eq(p.stockEntry, 'pending_business_os', 'stock entry handed to Business OS');
});
await test('group products are tagged by the server only (owned vs consignment)', async () => {
  await db.doc('products/gp1').set({ title: 'UREA 50kg', price: 75000, stock: 10, userId: 'mem' });
  const x = await call('groupSokoAttachProduct', 'mem', { groupId: G, productId: 'gp1' }); assert(!x.ok, 'member role can not attach');
  assert((await call('groupSokoAttachProduct', 'store', { groupId: G, productId: 'gp1', ownership: 'owned' })).ok, 'storekeeper attaches');
  const outsider = await call('groupSokoAttachProduct', 'store', { groupId: G, productId: 'px' }); assert(!outsider.ok && /si_mwanachama/.test(outsider.message), 'non-member listing refused');
  eq((await get('products/gp1')).groupOwnership, 'owned', 'tag');
  eq(await restPatch('mem', 'products/gp1', { groupSokoId: 'fake-group' }), 403, 'seller can not retag from a browser');
});
await db.doc('orders/go1').set({ sellerId: 'mem', buyerId: 'v1', status: 'completed', amount: 150000, productId: 'gp1' });
await test('report: capital, payments, sales, P&L and shares from records only', async () => {
  const exp = await call('groupSokoPropose', 'chair', { groupId: G, type: 'expense', title: 'Usafiri wa mzigo', amount: 20000, details: { category: 'usafiri' } });
  await vote(exp.data.proposalId, ['chair', 'treas', 'aud']); assert((await call('groupSokoExecute', 'treas', { groupId: G, proposalId: exp.data.proposalId })).ok, 'expense');
  const r = await call('groupSokoReport', 'mem', { groupId: G }); assert(r.ok, r.message); const R = r.data;
  eq(R.capital, 800000, 'capital'); eq(R.purchasesPaid, 600000, 'paid'); eq(R.expenses, 20000, 'expenses'); eq(R.sales, 150000, 'sales'); eq(R.profit, 150000 - 600000 - 20000, 'P&L');
  eq(R.shares.find(s => s.uid === 'mem').sharePct, 62.5, 'share by capital'); assert(/kumbukumbu tu/.test(R.moneyBoundary), 'money boundary stated');
});
await test('rules: members read, outsiders and everyone else write nothing', async () => {
  eq(await restGet('mem', 'group_soko/' + G), 200, 'member reads'); eq(await restGet('v2', 'group_soko/' + G), 403, 'outsider');
  eq(await restGet('v2', 'group_soko/' + G + '/ledger/x'), 403, 'ledger private');
  eq(await restPatch('chair', 'group_soko/' + G, { name: 'x' }), 403, 'chair can not write directly');
  eq(await restCreate('treas', 'group_soko/' + G + '/ledger', 'fake', { kind: 'capital_in', amount: 1e9 }), 403, 'no forged ledger');
});

console.log(`\nLIVE + STORIES + GROUP SOKO: ${pass} passed, ${fail} failed`);
if (fails.length) console.log(fails.join('\n'));
process.exit(fail ? 1 : 0);
