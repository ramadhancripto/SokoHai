/* ================================================================
 * tools/test_group_chat_rules.mjs — [GROUP STAGE 5 2026-11]
 * Jaribio la RULES HALISI za kikundi dhidi ya Firestore Emulator.
 *
 *   Terminal 1: firebase emulators:start --only firestore,auth --project demo-sokohai
 *   Terminal 2: node tools/test_group_chat_rules.mjs
 *
 * Kila jaribio linatumia mtumiaji HALISI wa Auth emulator (si uid za kubuni),
 * na rules zilizosajiliwa kwenye firestore.rules.
 * ================================================================ */
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, collection, setDoc, getDoc,
  getDocs, updateDoc, addDoc, deleteDoc, query, where, serverTimestamp
} from 'firebase/firestore';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut
} from 'firebase/auth';

const PROJECT = 'demo-sokohai';
const FS_PORT = 8085, AUTH_PORT = 9099;

const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' }, 'group-rules-test');
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', FS_PORT);
const auth = getAuth(app);
connectAuthEmulator(auth, `http://127.0.0.1:${AUTH_PORT}`, { disableWarnings: true });

let pass = 0, fail = 0;
const failures = [];

function ok(name, info) { pass++; console.log('  PASS ' + name + (info ? '  ' + info : '')); }
function no(name, info) { fail++; failures.push(name); console.log('  FAIL ' + name + (info ? '  ' + info : '')); }

function isDenied(e) {
  const code = String((e && e.code) || '');
  const msg = String((e && e.message) || '');
  return code.includes('permission-denied') || msg.includes('Missing or insufficient permissions') || msg.includes('PERMISSION_DENIED');
}

/* expect(fn, 'allow'|'deny', label) */
async function expect(label, mode, fn) {
  try {
    const r = await fn();
    if (mode === 'allow') ok(label);
    else no(label, '(iliruhusiwa, ilitakiwa ikataliwe)');
    return r;
  } catch (e) {
    if (mode === 'deny' && isDenied(e)) { ok(label, '(403 kama inavyotakiwa)'); return null; }
    no(label, '(' + mode + ' lakini: ' + String(e.code || e.message).slice(0, 90) + ')');
    return null;
  }
}

/* ---------------- watumiaji halisi wa Auth ---------------- */
const USERS = {};
async function makeUser(name) {
  const email = `${name}.${Date.now()}@sokohai.test`;
  const pw = 'Test#2026pass';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    USERS[name] = cred.user.uid;
  } catch (e) {
    const cred = await signInWithEmailAndPassword(auth, email, pw);
    USERS[name] = cred.user.uid;
  }
  await signOut(auth);
  return USERS[name];
}
async function as(name) {
  await signOut(auth).catch(() => {});
  const email = USERS[name + '__email'];
  const cred = await signInWithEmailAndPassword(auth, email, 'Test#2026pass');
  return cred.user.uid;
}

/* makeUser lakini ihifadhi email kwa sign-in ya baadaye */
async function makeUser2(name) {
  const email = `${name}.${Date.now()}@sokohai.test`;
  const pw = 'Test#2026pass';
  const cred = await createUserWithEmailAndPassword(auth, email, pw);
  USERS[name] = cred.user.uid;
  USERS[name + '__email'] = email;
  await signOut(auth);
  return cred.user.uid;
}

const nowIso = () => new Date().toISOString();
const gRef = gid => doc(db, 'chatGroups', gid);
const mRef = (gid, u) => doc(db, 'chatGroups', gid, 'members', u);
const iRef = (gid, u) => doc(db, 'chatGroups', gid, 'invitations', u);
const cRef = gid => doc(db, 'conversations', 'conv_group_' + gid);
const msgs = gid => collection(db, 'conversations', 'conv_group_' + gid, 'messages');

function groupDoc(gid, owner, extra) {
  return Object.assign({
    name: 'Kikundi cha Jaribio', description: 'test', groupType: 'PERMANENT_COMMUNITY',
    category: 'general', contextType: 'GENERAL', contextId: null,
    visibility: 'public', joinPolicy: 'open', invitePolicy: 'everyone', sendPolicy: 'everyone',
    status: 'ACTIVE', createdBy: owner, ownerId: owner,
    createdAt: nowIso(), updatedAt: nowIso(), archivedAt: null, memberCount: 1,
    conversationId: 'conv_group_' + gid
  }, extra || {});
}
function memberDoc(gid, u, role, status) {
  return setDoc(mRef(gid, u), {
    userId: u, role: role || 'member', status: status || 'active',
    joinedAt: nowIso(), invitedBy: null, leftAt: null
  });
}

/* ================================================================ */
console.log('\n=== SOKOHAI — GROUP CHAT RULES (Firestore Emulator) ===\n');

const A = 'owner', B = 'member2', C = 'member3', D = 'member4', E = 'member5', X = 'outsider';
for (const n of [A, B, C, D, E, X]) await makeUser2(n);
console.log(`Watumiaji: ${Object.entries(USERS).filter(([k]) => !k.includes('__')).map(([k, v]) => k + '=' + v.slice(0, 6)).join(' ')}\n`);

const GID = 'g_test_' + Date.now().toString(36);
const PRIV = 'g_priv_' + Date.now().toString(36);
const ONE2ONE = 'conv_dm_' + Date.now().toString(36);

/* ---------- 1. CREATE GROUP ---------- */
console.log('[1] Kuunda kikundi');
await as(A);
await expect('1a owner anaunda chatGroups', 'allow', () => setDoc(gRef(GID), groupDoc(GID, USERS[A])));
await expect('1b owner anaandika members/{owner} active', 'allow', () => memberDoc(GID, USERS[A], 'owner', 'active'));
await expect('1c asiye mwanachama hawezi kuunda kikundi kwa jina la mwingine', 'deny',
  () => setDoc(gRef('g_nope_' + Date.now()), groupDoc('x', USERS[B])));

/* ---------- 2. CONVERSATION YA MWANACHAMA 1 ---------- */
console.log('\n[2] Conversation ya kikundi (mwanachama 1)');
await expect('2a owner anaunda conv_group_* (mwanachama 1)', 'allow', () => setDoc(cRef(GID), {
  type: 'group', groupId: GID, name: 'Kikundi cha Jaribio',
  participants: [USERS[A]], createdAt: nowIso(), updatedAt: nowIso(), lastMessageAt: null
}));

/* ---------- 3-5. KUONGEZA WANACHAMA ---------- */
console.log('\n[3-5] Kuongeza wanachama (2, 3, kisha 4 na 5)');
for (const [n, lbl] of [[B, '2b mwanachama wa 2'], [C, '3b mwanachama wa 3']]) {
  const u = USERS[n];
  await as(n);
  await expect(lbl + ' anajiunga mwenyewe (public+open)', 'allow', () => memberDoc(GID, u, 'member', 'active'));
  // sync ya participants (client: syncConvParticipants) — mwanachama mpya hawezi kuandika participants?
}
await as(A);
for (const n of [B, C]) {
  const u = USERS[n];
  const cur = await getDoc(cRef(GID));
  const parts = (cur.data().participants || []).slice();
  if (parts.indexOf(u) < 0) parts.push(u);
  await expect('3c owner anasawazisha participants (+' + n + ')', 'allow',
    () => updateDoc(cRef(GID), { type: 'group', groupId: GID, participants: parts, updatedAt: nowIso() }));
}
await as(A);
await expect('5a owner anaongeza mwanachama 4 (admin path)', 'allow', () => memberDoc(GID, USERS[D], 'member', 'active'));
await expect('5b owner anaongeza mwanachama 5', 'allow', () => memberDoc(GID, USERS[E], 'member', 'active'));
{
  const cur = await getDoc(cRef(GID));
  const parts = (cur.data().participants || []).slice();
  for (const n of [D, E]) if (parts.indexOf(USERS[n]) < 0) parts.push(USERS[n]);
  await expect('5c participants = wanachama 5', 'allow', () => updateDoc(cRef(GID), { participants: parts, updatedAt: nowIso() }));
  const after = await getDoc(cRef(GID));
  (after.data().participants.length === 5) ? ok('5d participants ina wanachama 5', '(' + after.data().participants.length + ')')
    : no('5d participants ina wanachama 5', '(' + after.data().participants.length + ')');
}

/* ---------- 6-7. KUSOMA NA KUTUMA (wanachama wote) ---------- */
console.log('\n[6-7] Wanachama wote active wanasoma na wanatuma');
const sentIds = [];
for (const n of [A, B, C, D, E]) {
  await as(n);
  await expect(`6.${n} anasoma conv`, 'allow', () => getDoc(cRef(GID)));
  const r = await expect(`7.${n} anatuma ujumbe`, 'allow', () => addDoc(msgs(GID), {
    senderId: USERS[n], senderUid: USERS[n], senderName: n, text: 'Habari kutoka ' + n, at: nowIso()
  }));
  if (r) sentIds.push(r.id);
}
{
  await as(C);
  const snap = await getDocs(msgs(GID));
  (snap.size >= 5) ? ok('6f mwanachama anasoma ujumbe wote', '(' + snap.size + ')') : no('6f mwanachama anasoma ujumbe wote', '(' + snap.size + ')');
}

/* ---------- 8. ASIYE MWANACHAMA ---------- */
console.log('\n[8] Asiye mwanachama');
await as(X);
await expect('8a asiye mwanachama hawezi kusoma conv', 'deny', () => getDoc(cRef(GID)));
await expect('8b asiye mwanachama hawezi kusoma meseji', 'deny', () => getDocs(msgs(GID)));
await expect('8c asiye mwanachama hawezi kutuma', 'deny', () => addDoc(msgs(GID), {
  senderId: USERS[X], senderUid: USERS[X], text: 'nje', at: nowIso()
}));
await expect('8d asiye mwanachama hawezi kuandika member doc ya mwingine', 'deny', () => memberDoc(GID, USERS[B], 'member', 'active'));
await expect('8e asiye mwanachama hawezi kujiongeza kwenye participants', 'deny',
  () => updateDoc(cRef(GID), { participants: [USERS[X]] }));

/* ---------- 9. ALIYEONDOLWA ---------- */
console.log('\n[9] Aliyeondolewa / aliyeondoka hana ufikiaji');
await as(A);
await expect('9a owner anamtoa mwanachama 5 (status=left)', 'allow', async () => {
  const m = await getDoc(mRef(GID, USERS[E]));
  return updateDoc(mRef(GID, USERS[E]), Object.assign({}, m.data(), {
    status: 'left', leftAt: nowIso(), removedBy: USERS[A], removedAt: nowIso()
  }));
});
await as(E);
await expect('9b aliyeondolewa hawezi kusoma conv', 'deny', () => getDoc(cRef(GID)));
await expect('9c aliyeondolewa hawezi kusoma meseji', 'deny', () => getDocs(msgs(GID)));
await expect('9d aliyeondolewa hawezi kutuma', 'deny', () => addDoc(msgs(GID), {
  senderId: USERS[E], senderUid: USERS[E], text: 'bado nipo', at: nowIso()
}));
await expect('9e aliyetolewa na admin HAWEZI kujirudisha active (removedBy)', 'deny', async () => {
  const m = await getDoc(mRef(GID, USERS[E]));
  return updateDoc(mRef(GID, USERS[E]), Object.assign({}, m.data(), { status: 'active' }));
});
// mwanachama anayeondoka MWENYEWE anaweza kurejoin kikundi wazi
await as(D);
await expect('9g mwanachama anaondoka mwenyewe (left, removedBy=null)', 'allow', async () => {
  const m = await getDoc(mRef(GID, USERS[D]));
  return updateDoc(mRef(GID, USERS[D]), Object.assign({}, m.data(), { status: 'left', leftAt: nowIso(), removedBy: null }));
});
await expect('9h aliyeondoka mwenyewe anaweza kurejoin (public+open)', 'allow', async () => {
  const m = await getDoc(mRef(GID, USERS[D]));
  return updateDoc(mRef(GID, USERS[D]), Object.assign({}, m.data(), { status: 'active', joinedAt: nowIso(), leftAt: null }));
});
// aliyebaki bado anafanya kazi
await as(B);
await expect('9f wanachama waliobaki wanaendelea kutuma', 'allow', () => addDoc(msgs(GID), {
  senderId: USERS[B], senderUid: USERS[B], text: 'tunaendelea', at: nowIso()
}));

/* ---------- 10-11. MWALIKO ---------- */
console.log('\n[10-11] Mwaliko');
const INVITEE = X;             // outsider
await as(A);
await expect('10a mwanachama anaandika mwaliko (inviteeId)', 'allow', () => setDoc(iRef(GID, USERS[INVITEE]), {
  status: 'pending', groupId: GID, invitedBy: USERS[A], invitedAt: nowIso(),
  inviteeId: USERS[INVITEE], targetUid: USERS[INVITEE], invitedUid: USERS[INVITEE]
}));
await as(INVITEE);
await expect('10b mwalikwa anasoma mwaliko wake', 'allow', () => getDoc(iRef(GID, USERS[INVITEE])));
await as(D);
await expect('11a mtu mwingine HAWEZI kusoma mwaliko wa mwalikwa', 'deny', () => getDoc(iRef(GID, USERS[INVITEE])));
await as(INVITEE);
await expect('10c mwalikwa anakubali → member active', 'allow', () => memberDoc(GID, USERS[INVITEE], 'member', 'active'));
await expect('10d mwalikwa anaweka invitation accepted', 'allow',
  () => updateDoc(iRef(GID, USERS[INVITEE]), { status: 'accepted', respondedAt: nowIso() }));
await expect('10e mwalikwa sasa anasoma conv', 'allow', () => getDoc(cRef(GID)));
await expect('10f mwalikwa sasa anatuma', 'allow', () => addDoc(msgs(GID), {
  senderId: USERS[INVITEE], senderUid: USERS[INVITEE], text: 'asante kwa mwaliko', at: nowIso()
}));

/* ---------- 12-13. KIKUNDI PRIVATE + APPROVAL ---------- */
console.log('\n[12-13] Kikundi private: ombi na idhini');
await as(A);
await expect('12a owner anaunda kikundi private', 'allow', () => setDoc(gRef(PRIV), groupDoc(PRIV, USERS[A], {
  visibility: 'private', joinPolicy: 'request', conversationId: 'conv_group_' + PRIV
})));
await expect('12b owner member active', 'allow', () => memberDoc(PRIV, USERS[A], 'owner', 'active'));
await expect('12b2 conv ya kikundi private inaundwa', 'allow', () => setDoc(cRef(PRIV), {
  type: 'group', groupId: PRIV, name: 'Private', participants: [USERS[A]],
  createdAt: nowIso(), updatedAt: nowIso(), lastMessageAt: null
}));
await expect('12b3 mwanachama wa kawaida anaongezwa (C)', 'allow', () => memberDoc(PRIV, USERS[C], 'member', 'active'));
await as(B);
await expect('12c mtu anaomba kujiunga (status=pending)', 'allow', () => memberDoc(PRIV, USERS[B], 'member', 'pending'));
await expect('12d pending HAWEZI kusoma conv', 'deny', () => getDoc(cRef(PRIV)));
await expect('12e pending HAWEZI kujipa active (self-approval)', 'deny', async () => {
  const m = await getDoc(mRef(PRIV, USERS[B]));
  return updateDoc(mRef(PRIV, USERS[B]), Object.assign({}, m.data(), { status: 'active' }));
});
await expect('12f pending HAWEZI kubadilisha role yake', 'deny', async () => {
  const m = await getDoc(mRef(PRIV, USERS[B]));
  return updateDoc(mRef(PRIV, USERS[B]), Object.assign({}, m.data(), { role: 'admin' }));
});
await as(C);
await expect('13a mwanachama wa kawaida (asiye admin) HAWEZI kuidhinisha', 'deny', async () => {
  const m = await getDoc(mRef(PRIV, USERS[B]));
  return updateDoc(mRef(PRIV, USERS[B]), Object.assign({}, m.data(), { status: 'active', approvedBy: USERS[C] }));
});
await as(A);
await expect('13b owner anaidhinisha (approvedBy)', 'allow', async () => {
  const m = await getDoc(mRef(PRIV, USERS[B]));
  return updateDoc(mRef(PRIV, USERS[B]), Object.assign({}, m.data(), { status: 'active', approvedBy: USERS[A], approvedAt: nowIso() }));
});
await as(B);
await expect('13c aliyeidhinishwa sasa anasoma conv', 'allow', () => getDoc(cRef(PRIV)));

/* ---------- 14. ROLES ZA OWNER/ADMIN ---------- */
console.log('\n[14] Roles: owner / admin / moderator / organizer');
await as(A);
await expect('14a owner anafanya mwanachama kuwa admin', 'allow', async () => {
  const m = await getDoc(mRef(GID, USERS[C]));
  return updateDoc(mRef(GID, USERS[C]), Object.assign({}, m.data(), { role: 'admin' }));
});
await as(C);
await expect('14b admin anaweza kuidhinisha mwanachama mpya', 'allow', async () => {
  const u = USERS[D];
  return updateDoc(mRef(GID, u), Object.assign({}, (await getDoc(mRef(GID, u))).data(), { status: 'active' }));
});
await as(C);
await expect('14c admin HAWEZI kujipa role owner', 'deny', async () => {
  const m = await getDoc(mRef(GID, USERS[C]));
  return updateDoc(mRef(GID, USERS[C]), Object.assign({}, m.data(), { role: 'owner' }));
});
await as(B);
await expect('14d mwanachama wa kawaida HAWEZI kubadilisha role ya mwingine', 'deny', async () => {
  const m = await getDoc(mRef(GID, USERS[D]));
  return updateDoc(mRef(GID, USERS[D]), Object.assign({}, m.data(), { role: 'admin' }));
});
await expect('14e mwanachama HAWEZI kujipatia verifiedBusiness', 'deny', async () => {
  const m = await getDoc(mRef(GID, USERS[B]));
  return updateDoc(mRef(GID, USERS[B]), Object.assign({}, m.data(), { verifiedBusiness: true }));
});
await expect('14f mwanachama HAWEZI kubadilisha jina la kikundi', 'deny', () => updateDoc(gRef(GID), { name: 'Jina Jipya' }));
await as(A);
await expect('14g owner anaweza kubadilisha jina la kikundi', 'allow', () => updateDoc(gRef(GID), { name: 'Jina Jipya', updatedAt: nowIso() }));
await expect('14h owner anabadilisha role kuwa moderator', 'allow', async () => {
  const m = await getDoc(mRef(GID, USERS[D]));
  return updateDoc(mRef(GID, USERS[D]), Object.assign({}, m.data(), { role: 'moderator' }));
});
await expect('14i owner anabadilisha role kuwa organizer', 'allow', async () => {
  const m = await getDoc(mRef(GID, USERS[D]));
  return updateDoc(mRef(GID, USERS[D]), Object.assign({}, m.data(), { role: 'organizer' }));
});
await expect('14j umiliki unaweza kuhamia mwanachama active', 'allow', () => updateDoc(gRef(GID), {
  ownerId: USERS[C], updatedAt: nowIso()
}));
await expect('14k umiliki HAWEZI kuhamia asiye mwanachama', 'deny', () => updateDoc(gRef(GID), {
  ownerId: 'ghost_uid_' + Date.now()
}));

/* ---------- 15. 1:1 CHAT HAIJABADILIKA ---------- */
console.log('\n[15] 1:1 chat (regression)');
await as(A);
await expect('15a 1:1 conv inaundwa (participants 2)', 'allow', () => setDoc(doc(db, 'conversations', ONE2ONE), {
  participants: [USERS[A], USERS[B]], createdAt: nowIso(), updatedAt: nowIso(), lastMessageAt: null
}));
await expect('15b 1:1 conv ya watu 3 inakataliwa', 'deny', () => setDoc(doc(db, 'conversations', ONE2ONE + '_3'), {
  participants: [USERS[A], USERS[B], USERS[C]], createdAt: nowIso(), updatedAt: nowIso()
}));
await as(A);
await expect('15c A anatuma kwenye 1:1', 'allow', () => addDoc(collection(db, 'conversations', ONE2ONE, 'messages'), {
  senderId: USERS[A], text: 'habari', at: nowIso()
}));
await as(B);
await expect('15d B anasoma 1:1', 'allow', () => getDoc(doc(db, 'conversations', ONE2ONE)));
await expect('15e B anasoma meseji za 1:1', 'allow', () => getDocs(collection(db, 'conversations', ONE2ONE, 'messages')));
await expect('15f B anatuma kwenye 1:1', 'allow', () => addDoc(collection(db, 'conversations', ONE2ONE, 'messages'), {
  senderId: USERS[B], text: 'sawa', at: nowIso()
}));
await expect('15g lastReadAt yangu kwenye 1:1', 'allow', () => updateDoc(doc(db, 'conversations', ONE2ONE), {
  lastReadAt: { [USERS[B]]: nowIso() }
}));
await expect('15h B HAWEZI kuandika lastReadAt ya A', 'deny', () => updateDoc(doc(db, 'conversations', ONE2ONE), {
  lastReadAt: { [USERS[A]]: nowIso() }
}));
await expect('15i B HAWEZI kujiongeza mtu wa tatu kwenye 1:1', 'deny', () => updateDoc(doc(db, 'conversations', ONE2ONE), {
  participants: [USERS[A], USERS[B], USERS[C]]
}));
await as(X);
await expect('15j asiyehusika HAWEZI kusoma 1:1', 'deny', () => getDoc(doc(db, 'conversations', ONE2ONE)));
await expect('15k asiyehusika HAWEZI kutuma 1:1', 'deny', () => addDoc(collection(db, 'conversations', ONE2ONE, 'messages'), {
  senderId: USERS[X], text: 'nje', at: nowIso()
}));

/* ---------- ZIADA: usalama wa senderId / participants ---------- */
console.log('\n[16] Usalama wa ziada');
await as(B);
await expect('16a mwanachama HAWEZI kutuma kwa jina la mwingine', 'deny', () => addDoc(msgs(GID), {
  senderId: USERS[A], senderUid: USERS[A], text: 'kujifanya owner', at: nowIso()
}));
await expect('16b mwanachama HAWEZI kutuma ujumbe wa "payment protected"', 'deny', () => addDoc(msgs(GID), {
  senderId: USERS[B], text: 'malipo yamepokelewa', at: nowIso(), eventKind: 'payment_protected'
}));
await expect('16c mwanachama HAWEZI kuandika lastReadAt ya mwenzake', 'deny', () => updateDoc(cRef(GID), {
  lastReadAt: { [USERS[A]]: nowIso() }
}));
await expect('16d mwanachama anaweza kuandika lastReadAt yake', 'allow', () => updateDoc(cRef(GID), {
  lastReadAt: { [USERS[B]]: nowIso() }
}));

/* ---------- 17. PAYLOADS HALISI ZA CLIENT ---------- */
console.log('\n[17] Payloads halisi za client (69-chat-groups.js / 73-group-soga.js)');
await as(B);
// 17a: skhGroupSendMessage — ujumbe + lastMessage + unread ya wengine
await expect('17a send: msg(senderId+senderUid) + lastMessage.senderId + unread(+1 kwa wengine)', 'allow', async () => {
  const msg = await addDoc(msgs(GID), {
    senderId: USERS[B], senderUid: USERS[B], senderName: 'member2', text: 'habari za mchana', at: nowIso(), mentions: []
  });
  const cur = await getDoc(cRef(GID));
  const parts = cur.data().participants || [];
  const unread = Object.assign({}, cur.data().unread || {});
  parts.forEach(p => { if (p !== USERS[B]) unread[p] = (unread[p] || 0) + 1; });
  await updateDoc(cRef(GID), {
    lastMessage: { text: 'habari za mchana', type: 'text', mentions: [], senderId: USERS[B] },
    lastMessageAt: nowIso(), updatedAt: nowIso(), unread: unread
  });
  return msg;
});
// 17b: query ya rate-limit (where senderUid == me)
await expect('17b query where(senderUid==me) ya rate-limit', 'allow',
  () => getDocs(query(msgs(GID), where('senderUid', '==', USERS[B]))));
// 17c: reactions za kikundi (map ya emoji → [uid])
await expect('17c reaction ya kikundi (reactions map)', 'allow', async () => {
  const list = await getDocs(msgs(GID));
  const first = list.docs[0];
  const rxn = Object.assign({}, first.data().reactions || {});
  rxn['\u{1F44D}'] = [USERS[B]];
  return updateDoc(first.ref, { reactions: rxn });
});
// 17d: lastReadAt yangu (renderMsgs)
await expect('17d lastReadAt yangu baada ya kusoma', 'allow',
  () => updateDoc(cRef(GID), { ['lastReadAt.' + USERS[B]]: nowIso() }));
// 17e: syncMemberCount (owner anaandika memberCount)
await as(A);
await expect('17e memberCount sync na owner', 'allow', () => updateDoc(gRef(GID), { memberCount: 7, updatedAt: nowIso() }));
// 17f: avatar ya kikundi (group doc + conv doc)
await expect('17f avatar: group doc', 'allow', () => updateDoc(gRef(GID), { avatar: '\u{1F33E}' }));
await expect('17f2 avatar: conv doc (owner/admin)', 'allow', () => updateDoc(cRef(GID), { avatar: '\u{1F33E}' }));
// 17g: tangazo
await expect('17g tangazo kwenye conv (admin)', 'allow', () => updateDoc(cRef(GID), {
  announcement: { text: 'Mkutano Jumamosi', by: USERS[A], at: nowIso() }
}));
await as(B);
await expect('17h mwanachama wa kawaida HAWEZI kubadilisha tangazo la conv', 'deny',
  () => updateDoc(cRef(GID), { announcement: { text: 'uongo', by: USERS[B] } }));
// 17i: unread yangu → 0
await expect('17i unread yangu inarudi 0', 'allow', () => updateDoc(cRef(GID), {
  unread: Object.assign({}, (async () => ({}))() , {})
}).catch(() => updateDoc(cRef(GID), {
  ['unread.' + USERS[B]]: 0
})));

console.log('\n=== MATOKEO ===');
console.log(`PASS: ${pass}   FAIL: ${fail}`);
if (fail) { console.log('Zilizoshindikana:'); failures.forEach(f => console.log(' - ' + f)); }
await deleteApp(app).catch(() => {});
process.exit(fail ? 1 : 0);
