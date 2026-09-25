// Ads auth/visibility E2E — Firebase WEB SDK 10.8.1 against LOCAL emulators + local functions server.
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, updateDoc, deleteDoc, addDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallableFromURL } from 'firebase/functions';
import { buildBasicCreative } from '/home/user/SokoHai-phase1/js/app/creative/basic-ad-creative.js';
import { normalizeCreative } from '/home/user/SokoHai-phase1/js/app/creative/creative-model.js';
// Same pipeline as the Basic Advertisement UI: adCurrentCreative()->buildBasicCreative(form) -> skhPersistBasicCreative -> persistCreativeDraft(normalizeCreative)
const mk = (ownerId, title) => {
  const c = normalizeCreative(buildBasicCreative({ creativeType:'solid_text', headline:title, description:'Punguzo kubwa', ctaText:'Nunua', link:'https://example.com/'+encodeURIComponent(title), timingMode:'auto', durationAuto:true, textShadow:'none' }, null));
  c.ownerId = ownerId; c.status = 'DRAFT'; c.updatedAt = new Date().toISOString(); c.createdAt = c.updatedAt; return c;
};

const BASE = 'http://127.0.0.1:5055';
const results = []; let failures = 0;
const ok = (name, cond, detail = '') => { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!cond) failures++; };
const code = async p => { try { await p; return 'allowed'; } catch (e) { return String(e.code || e.message); } };

// 1) Exactly what the browser receives from the patched local server
const html = await (await fetch(BASE + '/')).text();
const m = /window\.SKH_EMULATOR=(\{.*?\});<\/script>/.exec(html);
const EMU = JSON.parse(m[1]);
console.log('SKH_EMULATOR served to browser:', JSON.stringify(EMU));

// wipe emulator state (emulator-only endpoints)
await fetch(`http://127.0.0.1:${EMU.firestore.port}/emulator/v1/projects/${EMU.projectId}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`${EMU.authUrl}/emulator/v1/projects/${EMU.projectId}/accounts`, { method: 'DELETE' });

// Same config transformation the patched 00-bootstrap performs
const prodConfig = { apiKey: 'AIzaSyB_OQ4TN2ctkAv5EpX8NxrNklGq6T7feR4', authDomain: 'sokonet-3b847.firebaseapp.com', projectId: 'sokonet-3b847', storageBucket: 'sokonet-3b847.appspot.com', appId: '1:950677961118:web:4cd8177bae10dc9f743e8f' };
async function client(label, email) {
  const app = initializeApp(Object.assign({}, prodConfig, { projectId: EMU.projectId, authDomain: EMU.projectId + '.firebaseapp.com', storageBucket: EMU.projectId + '.appspot.com' }), label);
  const auth = getAuth(app); connectAuthEmulator(auth, EMU.authUrl, { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, EMU.firestore.host, EMU.firestore.port);
  const fns = getFunctions(app, 'europe-west1');
  const call = (name, data) => httpsCallableFromURL(fns, BASE + '/__fn/' + name)(data).then(r => r.data);
  let user = null;
  if (email) user = (await createUserWithEmailAndPassword(auth, email, 'secret123')).user;
  return { app, auth, db, call, user, uid: user && user.uid };
}
const A = await client('A', 'rshabansaid@gmail.com');   // admin publisher (Basic Advertisement is admin-only)
const B = await client('B', 'buyer.b@test.local');      // normal second account
const C = await client('C', 'seller.c@test.local');     // non-admin advertiser
const U = await client('U', null);                      // signed-out visitor
const tokA = await A.user.getIdTokenResult();
console.log(`A uid=${A.uid} aud=${JSON.parse(Buffer.from(tokA.token.split('.')[1], 'base64url')).aud}`);
console.log(`B uid=${B.uid}   C uid=${C.uid}`);

const clean = o => o; // no sanitising: identical to browser payload
let throttled = 0;
const deliver0 = (cli, context = {}) => cli.call('adsRequestDelivery', { placement: 'home', slotId: 'home-slot-' + Math.random().toString(36).slice(2), requestId: 'r' + Math.random().toString(36).slice(2), sessionId: 's' + Math.random().toString(36).slice(2), context });
const deliver = async (cli, context) => { const r = await deliver0(cli, context); if ((r.reasonCodes || []).some(c => /THROTTLED|COOLDOWN/.test(c))) throttled++; return r; };
let viewerN = 0; const freshViewer = async () => client('V' + (++viewerN), 'viewer' + viewerN + '.' + Date.now() + '@test.local');
const summary = r => r.status + ':' + (r.campaign ? r.campaign.id.slice(0, 6) : (r.reasonCodes || []).join('|'));

// ---------- AUTH ----------
ok('AUTH unauthenticated creativePublish denied', (await code(U.call('creativePublish', { creativeId: 'x' }))) === 'functions/unauthenticated');

// A saves creative draft exactly like skhPersistCreativeDraft (direct client write, rules enforced)
const ad1Ref = doc(collection(A.db, 'creatives'));
await setDoc(ad1Ref, clean(Object.assign(mk(A.uid, 'Ofa ya Wiki SokoHai'), { status: 'DRAFT' })));
const pub1 = await A.call('creativePublish', { creativeId: ad1Ref.id, publicationType: 'advertisement', action: 'publish' });
ok('AUTH authorized creativePublish (A) succeeds (no 401)', pub1 && pub1.announcementId, JSON.stringify(clean(pub1)).slice(0, 160));
const annId = pub1.announcementId;

// B tries to publish A's creative
ok('AUTH unauthorized user (B) publishing A\'s creative denied', (await code(B.call('creativePublish', { creativeId: ad1Ref.id, publicationType: 'advertisement' }))) === 'functions/permission-denied');

// ---------- DATA ----------
const annSnap = await getDoc(doc(A.db, 'announcements', annId));
const ann = annSnap.data();
console.log('\nannouncements/' + annId + ' fields:', JSON.stringify({ status: ann.status, active: ann.active, archived: ann.archived, moderationStatus: ann.moderationStatus, lifecycleStatus: ann.lifecycleStatus, advertiserId: ann.advertiserId, ownerId: ann.ownerId, creativeId: ann.creativeId, creativeVersion: ann.creativeVersion, publicationId: ann.publicationId, placements: ann.placements, targetRegions: ann.targetRegions, startAt: ann.startAt, endAt: ann.endAt, createdAt: ann.createdAt && ann.createdAt.toDate().toISOString() }));
const dup = await getDocs(query(collection(A.db, 'announcements'), where('creativeId', '==', ad1Ref.id)));
ok('DATA exactly one announcement for the creative', dup.size === 1, 'count=' + dup.size);
const pubs = await getDocs(query(collection(A.db, 'creativePublications'), where('creativeId', '==', ad1Ref.id)));
ok('DATA exactly one creativePublications record', pubs.size === 1, 'count=' + pubs.size);
ok('DATA owner is A (advertiserId)', ann.advertiserId === A.uid);
ok('DATA published/active/not archived/approved', ann.status === 'published' && ann.active === true && ann.archived === false && ann.moderationStatus === 'approved');
const cr = (await getDoc(ad1Ref)).data();
ok('DATA creative marked PUBLISHED v1 by server', cr.status === 'PUBLISHED' && Number(cr.publishedVersion) === 1, `status=${cr.status} publishedVersion=${cr.publishedVersion}`);

// ---------- VISIBILITY ----------
const adminQ = query(collection(A.db, 'announcements'), orderBy('createdAt', 'desc'), limit(50));
ok('VIS A (publisher/admin) sees ad in admin listener query', (await getDocs(adminQ)).docs.some(d => d.id === annId));
const publicQ = db => query(collection(db, 'announcements'), where('status', '==', 'published'), where('archived', '==', false), orderBy('createdAt', 'desc'), limit(50));
ok('VIS B sees ad via normal (non-admin) listener query [09-feed]', (await getDocs(publicQ(B.db))).docs.some(d => d.id === annId));
ok('VIS B direct getDoc announcements/<id> allowed', (await code(getDoc(doc(B.db, 'announcements', annId)))) === 'allowed');
const dB = await deliver(B);
ok('VIS B Home slot: adsRequestDelivery DELIVERED this ad', dB.status === 'DELIVERED' && dB.campaign && dB.campaign.id === annId, `status=${dB.status} campaign=${dB.campaign && dB.campaign.id}`);
const dU = await deliver(U);
ok('VIS signed-out visitor also served (existing public-ad design)', dU.status === 'DELIVERED', 'status=' + dU.status);

// ---------- OWNERSHIP / SECURITY ----------
ok('SEC B cannot update A\'s announcement', (await code(updateDoc(doc(B.db, 'announcements', annId), { headline: 'hijack' }))) === 'permission-denied');
ok('SEC B cannot delete A\'s announcement', (await code(deleteDoc(doc(B.db, 'announcements', annId)))) === 'permission-denied');
ok('SEC B cannot create announcement directly', (await code(addDoc(collection(B.db, 'announcements'), { status: 'published', active: true, advertiserId: A.uid }))) === 'permission-denied');
ok('SEC B cannot read A\'s creative (draft source)', (await code(getDoc(doc(B.db, 'creatives', ad1Ref.id)))) === 'permission-denied');
ok('SEC B cannot edit A\'s creative', (await code(updateDoc(doc(B.db, 'creatives', ad1Ref.id), { title: 'x' }))) === 'permission-denied');
ok('SEC B cannot create creative owned by A', (await code(setDoc(doc(collection(B.db, 'creatives')), { ownerId: A.uid, status: 'DRAFT' }))) === 'permission-denied');
// B tries to replace A's announcement using B's own creative
const bRef = doc(collection(B.db, 'creatives'));
await setDoc(bRef, clean(mk(B.uid, 'B ad')));
ok('SEC B cannot replace A\'s announcement via creativePublish', (await code(B.call('creativePublish', { creativeId: bRef.id, publicationType: 'advertisement', replaceAnnouncementId: annId }))) === 'functions/permission-denied');
const stillOne = await getDocs(query(collection(A.db, 'announcements'), where('advertiserId', '==', A.uid)));
ok('SEC A\'s announcement untouched after attacks', stillOne.size === 1 && (await getDoc(doc(A.db, 'announcements', annId))).data().headline !== 'hijack');

// ---------- DRAFT / PENDING hidden ----------
const cDraft = doc(collection(C.db, 'creatives'));
await setDoc(cDraft, clean(mk(C.uid, 'C draft never published')));
ok('HIDE draft creative unreadable by B', (await code(getDoc(doc(B.db, 'creatives', cDraft.id)))) === 'permission-denied');
const cRef = doc(collection(C.db, 'creatives'));
await setDoc(cRef, clean(mk(C.uid, 'C pending ad')));
const pubC = await C.call('creativePublish', { creativeId: cRef.id, publicationType: 'advertisement' });
const annC = (await getDoc(doc(C.db, 'announcements', pubC.announcementId))).data();
ok('HIDE non-admin publish goes to moderation (status/active)', annC.status === 'moderation_pending' && annC.active === false, `status=${annC.status} active=${annC.active}`);
ok('HIDE B cannot read moderation-pending announcement', (await code(getDoc(doc(B.db, 'announcements', pubC.announcementId)))) === 'permission-denied');
ok('HIDE pending ad absent from B public query', !(await getDocs(publicQ(B.db))).docs.some(d => d.id === pubC.announcementId));
const pViewers = []; throttled = 0; let pendingServed = false; const pLog = []; for (let i = 0; i < 4; i++) { const Vp = await freshViewer(); pViewers.push(Vp); const r = await deliver(Vp); pLog.push(summary(r)); if (r.campaign && r.campaign.id === pubC.announcementId) pendingServed = true; }
console.log('pending-check viewers (1st request each):', pLog.join('  '));
ok('HIDE pending ad never delivered (4 fresh viewers, 1st request each) [0 throttled/cooldown]', !pendingServed && throttled === 0, 'throttled=' + throttled);
ok('HIDE owner C can still see own pending ad', (await code(getDoc(doc(C.db, 'announcements', pubC.announcementId)))) === 'allowed');

// ---------- TARGETING ----------
const tRef = doc(collection(A.db, 'creatives'));
await setDoc(tRef, mk(A.uid, 'Arusha only'));
const pubT = await A.call('creativePublish', { creativeId: tRef.id, publicationType: 'advertisement' });
// Real flow: admin Delivery Settings modal (16-pos-admin-jobs.js:418)
const deliveryPayload = { announcementId: pubT.announcementId, delivery: { campaignType: 'standard', placements: ['home'], targetCategories: '', targetKeywords: '', targetRegions: 'arusha', targetEntityTypes: '', targetEntityIds: '' }, lifecycleAction: 'keep' };
ok('SEC B cannot change delivery/targeting of A\'s campaign', (await code(B.call('adsUpdateCampaignDelivery', deliveryPayload))) === 'functions/permission-denied');
const upd = await A.call('adsUpdateCampaignDelivery', deliveryPayload);
ok('TARGET admin sets targetRegions via adsUpdateCampaignDelivery', upd && upd.ok !== false, JSON.stringify(upd).slice(0, 120));
const annT = (await getDoc(doc(A.db, 'announcements', pubT.announcementId))).data();
console.log('targeted announcement targetRegions =', JSON.stringify(annT.targetRegions));
const Vm = await freshViewer(); throttled = 0; let mwanzaGotT = false; const mLog = []; for (let i = 0; i < 1; i++) { const r = await deliver(Vm, { region: 'mwanza' }); mLog.push(summary(r)); if (r.campaign && r.campaign.id === pubT.announcementId) mwanzaGotT = true; }
console.log('mwanza viewer responses:', mLog.join('  '));
ok('TARGET region=arusha ad NOT delivered to viewer in mwanza [0 throttled/cooldown]', !mwanzaGotT && throttled === 0, 'throttled=' + throttled);
const Va = await freshViewer(); throttled = 0; let arushaGotT = false; const arushaLog = []; for (let i = 0; i < 1; i++) { const r = await deliver(Va, { region: 'arusha' }); arushaLog.push(r.status + ':' + (r.campaign ? (r.campaign.id === pubT.announcementId ? 'TARGETED' : r.campaign.id === annId ? 'general' : r.campaign.id) : (r.reasonCodes || []).join('|'))); if (r.campaign && r.campaign.id === pubT.announcementId) arushaGotT = true; }
console.log('arusha responses:', arushaLog.join('  '));
ok('TARGET region=arusha ad delivered to fresh viewer in arusha (1st request)', arushaGotT, 'throttled=' + throttled);

// ---------- EXPIRED ----------
await updateDoc(doc(A.db, 'announcements', annId), { endAt: new Date(Date.now() - 60000).toISOString() });
const Ve = await freshViewer(); throttled = 0; let expiredServed = false; const eLog = []; for (let i = 0; i < 3; i++) { const r = await deliver(Ve); eLog.push(summary(r)); if (r.campaign && r.campaign.id === annId) expiredServed = true; }
console.log('expired-check viewer responses:', eLog.join('  '));
ok('HIDE expired ad not delivered to viewer [0 throttled/cooldown]', !expiredServed && throttled === 0, 'throttled=' + throttled);

console.log('\n' + results.join('\n'));
console.log(`\n${results.length - failures}/${results.length} passed`);
for (const c of [A, B, C, U, Vm, Va, Ve, ...pViewers]) { try { await signOut(c.auth); } catch (_) {} await deleteApp(c.app); }
process.exit(failures ? 1 : 0);
