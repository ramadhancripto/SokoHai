/* tools/test_group_business_rules.mjs — [R13-H 2026-11]
 * Firestore emulator rules for Group Chat phase 2:
 *   - posting permissions (sendPolicy / sharePolicy / announcement) enforced on the server
 *   - Soko la kundi: pending-only submissions, admin-only decisions, no self-sponsoring,
 *     allowed categories, members-only, withdraw by submitter, no deletes
 * Real Auth-emulator users; FIRESTORE 8085 / AUTH 9099; project demo-sokohai. */
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, collection, setDoc, updateDoc, addDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
const app = initializeApp({ projectId: 'demo-sokohai', apiKey: 'fake-api-key' }, 'gb-rules');
const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8085);
const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
let pass = 0, fail = 0; const bad = [];
const denied = (e) => /permission-denied|PERMISSION_DENIED|insufficient permissions/i.test(String((e && (e.code || '')) + ' ' + (e && e.message)));
async function expect(label, mode, fn) {
  try { const r = await fn(); if (mode === 'allow') { pass++; console.log('  PASS ' + label); } else { fail++; bad.push(label); console.log('  FAIL ' + label + ' (allowed)'); } return r; }
  catch (e) { if (mode === 'deny' && denied(e)) { pass++; console.log('  PASS ' + label + ' (denied)'); } else { fail++; bad.push(label); console.log('  FAIL ' + label + ' ' + String(e.code || e.message).slice(0, 90)); } return null; }
}
const U = {}, PW = 'Test#2026pass';
async function mk(n) { const email = n + '.' + Date.now() + '@sokohai.test'; const c = await createUserWithEmailAndPassword(auth, email, PW); U[n] = c.user.uid; U[n + '@'] = email; await signOut(auth); }
async function as(n) { await signOut(auth).catch(() => {}); await signInWithEmailAndPassword(auth, U[n + '@'], PW); }
const now = () => new Date().toISOString();
for (const n of ['owner', 'admin', 'mem', 'other', 'out']) await mk(n);
const GID = 'gb_' + Date.now(), CONV = 'conv_group_' + GID;
await as('owner');
await setDoc(doc(db, 'chatGroups', GID), { name: 'Kikundi', groupType: 'PERMANENT_COMMUNITY', visibility: 'public', joinPolicy: 'open', invitePolicy: 'everyone', sendPolicy: 'everyone', status: 'ACTIVE', createdBy: U.owner, ownerId: U.owner, createdAt: now(), conversationId: CONV });
await setDoc(doc(db, 'chatGroups', GID, 'members', U.owner), { userId: U.owner, role: 'owner', status: 'active', joinedAt: now() });
for (const [n, r] of [['admin', 'admin'], ['mem', 'member'], ['other', 'member']]) await setDoc(doc(db, 'chatGroups', GID, 'members', U[n]), { userId: U[n], role: r, status: 'active', joinedAt: now() });
await setDoc(doc(db, 'conversations', CONV), { type: 'group', groupId: GID, participants: [U.owner], createdAt: now() });
const msg = (n, extra) => addDoc(collection(db, 'conversations', CONV, 'messages'), Object.assign({ senderId: U[n], senderUid: U[n], senderName: n, at: now(), text: 'habari' }, extra || {}));
const soko = () => collection(db, 'chatGroups', GID, 'soko');
const entry = (n, extra) => Object.assign({ kind: 'product', title: 'Mahindi gunia', category: 'CAT-02', submittedBy: U[n], sellerUid: U[n], sellerName: n, status: 'pending', sponsored: false, createdAt: now(), history: [] }, extra || {});

console.log('--- posting permissions ---');
await as('mem'); await expect('member posts text (sendPolicy everyone)', 'allow', () => msg('mem'));
await expect('member shares a product card (sharePolicy everyone)', 'allow', () => msg('mem', { type: 'product', product: { name: 'X' } }));
await expect('member cannot post an announcement', 'deny', () => msg('mem', { type: 'announcement', text: 'tangazo' }));
await as('owner'); await updateDoc(doc(db, 'chatGroups', GID), { sharePolicy: 'admins' });
await as('mem'); await expect('sharePolicy admins: member product card denied', 'deny', () => msg('mem', { type: 'product', product: { name: 'X' } }));
await expect('sharePolicy admins: member service card denied', 'deny', () => msg('mem', { type: 'service', service: { name: 'Y' } }));
await expect('sharePolicy admins: member text still allowed', 'allow', () => msg('mem'));
await as('admin'); await expect('sharePolicy admins: admin may share', 'allow', () => msg('admin', { type: 'product', product: { name: 'X' } }));
await as('owner'); await updateDoc(doc(db, 'chatGroups', GID), { sendPolicy: 'admins', sharePolicy: 'everyone' });
await as('mem'); await expect('sendPolicy admins: member text denied', 'deny', () => msg('mem'));
await as('owner'); await expect('sendPolicy admins: owner may post + announce', 'allow', () => msg('owner', { type: 'announcement', text: 'Mkutano' }));
await updateDoc(doc(db, 'chatGroups', GID), { sendPolicy: 'everyone' });
await as('out'); await expect('non-member cannot post', 'deny', () => msg('out'));
await as('mem'); await expect('member cannot change the group policy', 'deny', () => updateDoc(doc(db, 'chatGroups', GID), { sendPolicy: 'everyone', sharePolicy: 'everyone' }));

console.log('--- Soko la kundi ---');
await as('mem'); const p1 = await expect('member submits a pending entry', 'allow', () => addDoc(soko(), entry('mem')));
await expect('member cannot self-approve', 'deny', () => addDoc(soko(), entry('mem', { status: 'approved', decidedBy: U.mem, expiresAtMs: Date.now() + 1e9 })));
await expect('member cannot mark sponsored', 'deny', () => addDoc(soko(), entry('mem', { sponsored: true })));
await expect('pending entry cannot carry decision fields', 'deny', () => addDoc(soko(), entry('mem', { decidedBy: U.mem })));
await expect('submittedBy must be me', 'deny', () => addDoc(soko(), entry('mem', { submittedBy: U.other })));
await expect('kind must be known', 'deny', () => addDoc(soko(), entry('mem', { kind: 'loan' })));
await as('other'); await expect('another member cannot approve it', 'deny', () => updateDoc(p1, { status: 'approved', decidedBy: U.other, decidedAt: now(), expiresAtMs: Date.now() + 1e9 }));
await as('mem'); await expect('submitter cannot approve own entry', 'deny', () => updateDoc(p1, { status: 'approved', decidedBy: U.mem, decidedAt: now() }));
await as('admin'); await expect('admin approves with expiry', 'allow', () => updateDoc(p1, { status: 'approved', decidedBy: U.admin, decidedAt: now(), expiresAtMs: Date.now() + 14 * 864e5, history: [{ status: 'approved' }], updatedAt: now() }));
await expect('admin cannot edit the listing content', 'deny', () => updateDoc(p1, { title: 'Imebadilishwa', status: 'approved', decidedBy: U.admin }));
await expect('admin cannot add sponsored', 'deny', () => updateDoc(p1, { sponsored: true, status: 'approved', decidedBy: U.admin }));
await expect('admin suspends', 'allow', () => updateDoc(p1, { status: 'suspended', decidedBy: U.admin, decidedAt: now(), note: 'x', updatedAt: now() }));
await as('owner'); await expect('owner creates directly approved', 'allow', () => addDoc(soko(), entry('owner', { status: 'approved', decidedBy: U.owner, decidedAt: now(), expiresAtMs: Date.now() + 1e9 })));
await as('mem'); const p2 = await expect('member submits second entry', 'allow', () => addDoc(soko(), entry('mem', { title: 'Mbolea' })));
await expect('submitter withdraws pending entry', 'allow', () => updateDoc(p2, { status: 'withdrawn', updatedAt: now(), history: [] }));
await expect('nobody deletes Soko history', 'deny', () => deleteDoc(p2));
await as('out'); await expect('non-member cannot read Soko', 'deny', () => getDoc(p1));
await expect('non-member cannot submit', 'deny', () => addDoc(soko(), entry('out')));
await as('owner'); await updateDoc(doc(db, 'chatGroups', GID), { soko: { allowedCategories: ['CAT-11'], membersOnly: true, durationDays: 7 } });
await as('mem'); await expect('allowed categories: CAT-02 refused', 'deny', () => addDoc(soko(), entry('mem')));
await expect('allowed categories: CAT-11 accepted', 'allow', () => addDoc(soko(), entry('mem', { category: 'CAT-11' })));
await expect('ads are not category-bound', 'allow', () => addDoc(soko(), entry('mem', { kind: 'ad', category: '' })));
await expect('members-only: outside seller refused', 'deny', () => addDoc(soko(), entry('mem', { category: 'CAT-11', sellerUid: U.out })));

console.log('\nGROUP BUSINESS RULES: ' + pass + ' passed, ' + fail + ' failed'); if (fail) bad.forEach(b => console.log(' - ' + b));
await deleteApp(app).catch(() => {}); process.exit(fail ? 1 : 0);
