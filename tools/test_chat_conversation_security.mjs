#!/usr/bin/env node
/* ============================================================
 * CHAT CONVERSATION SECURITY — STAGE 1 (2026-11)
 *
 * Hujaribu firestore.rules kwa `conversations/{convId}` kama KIVINJARI
 * halisi (Firestore REST + Auth emulator ID token) — si Admin SDK.
 *
 * Lengo: kuthibitisha kwamba participant mmoja HAWEZI kubadilisha
 *   • unread ya mwenzake,
 *   • lastMessage (preview ya uongo),
 *   • related (muktadha wa bidhaa) kwa njia isiyoruhusiwa,
 *   • typing ya mwenzake,
 *   • participants / createdAt / createdBy / participantMeta / type,
 * NA kwamba mitiririko halisi ya Chat (kutuma, markRead, delivered,
 * pin/mute/archive, drafts, related ya bidhaa, merge/migrate, kufuta
 * kwangu) INAENDELEA kufanya kazi — kwa MASHIRIKA YOTE MAMBOLE.
 *
 * Endesha (haigusi production):
 *   firebase emulators:exec --only firestore,auth --project demo-sokohai \
 *     "node tools/test_chat_conversation_security.mjs"
 *
 * Bila FIRESTORE_EMULATOR_HOST + FIREBASE_AUTH_EMULATOR_HOST script
 * inakataa kuendesha (BLOCKED). Hakuna dependency mpya.
 * ========================================================== */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS_HOST || !AUTH_HOST) {
  console.error('BLOCKED: FIRESTORE_EMULATOR_HOST na FIREBASE_AUTH_EMULATOR_HOST zinahitajika.\n' +
    '  Endesha: firebase emulators:exec --only firestore,auth --project demo-sokohai \\\n' +
    '    "node tools/test_chat_conversation_security.mjs"');
  process.exit(2);
}
const PROJECT = 'demo-sokohai';
process.env.GCLOUD_PROJECT = PROJECT;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT, storageBucket: PROJECT + '.appspot.com' });

const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();

/* ---------- Firestore REST (rules, kama kivinjari) ---------- */
const DOCS = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

async function idToken(uid) {
  const email = uid + '@chatrules.test';
  const post = (method) => fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:${method}?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true })
  }).then(r => r.json());
  // Idempotent: akaunti ya emulator inadumu kati ya runs (wipe ni Firestore tu).
  let j = await post('signUp');
  if (!j.idToken && j.error && j.error.message === 'EMAIL_EXISTS') j = await post('signInWithPassword');
  assert(j.idToken, 'auth emulator token: ' + JSON.stringify(j).slice(0, 200));
  return { token: j.idToken, uid: j.localId };
}

function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}

/* PATCH yenye updateMask — kama `updateDoc()` ya SDK (field-level).
   Inarudisha status: 200 = imeruhusiwa, 403 = imekataliwa. */
async function restPatch(tk, docPath, data) {
  const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await fetch(`${DOCS}/${docPath}?${mask}&currentDocument.exists=true`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: enc(data).mapValue.fields })
  });
  return r.status;
}

async function restPatchNested(tk, docPath, patch) {
  // patch = { 'unread.<uid>': value, 'related.productId': value, ... }
  const mask = Object.keys(patch).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const fields = {};
  for (const [k, v] of Object.entries(patch)) {
    const parts = k.split('.');
    let cur = fields;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = cur[parts[i]] || { mapValue: { fields: {} } };
      cur = cur[parts[i]].mapValue.fields;
    }
    cur[parts[parts.length - 1]] = enc(v);
  }
  const r = await fetch(`${DOCS}/${docPath}?${mask}&currentDocument.exists=true`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  return r.status;
}

async function restCreate(tk, col, id, data) {
  const r = await fetch(`${DOCS}/${col}?documentId=${id}`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: enc(data).mapValue.fields })
  });
  return r.status;
}

async function restRead(tk, docPath) {
  const r = await fetch(`${DOCS}/${docPath}`, { headers: { authorization: 'Bearer ' + tk } });
  return r.status;
}

/* SKH_RULES_FILE inaruhusu kupima ruleset mbadala (mfano wa kabla ya
   hardening) bila kubadilisha faili la repo — hutumika kuthibitisha
   kwamba udhaifu ulikuwa HALISI kabla ya Stage 1. */
const RULES_PATH = process.env.SKH_RULES_FILE || path.join(ROOT, 'firestore.rules');

async function loadRules() {
  const rules = fs.readFileSync(RULES_PATH, 'utf8');
  console.log('Rules: ' + RULES_PATH);
  const r = await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } })
  });
  assert(r.ok, 'rules load: ' + r.status + ' ' + (await r.text()).slice(0, 400));
  const j = await r.json().catch(() => ({}));
  const issues = (j && j.issues) || [];
  assert.equal(issues.length, 0, 'rules zina issues: ' + JSON.stringify(issues).slice(0, 400));
}

async function wipe() {
  await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}

/* ---------- ripoti ---------- */
let PASS = 0, FAIL = 0;
const failures = [];
function check(group, name, condition, extra) {
  if (condition) { PASS++; console.log('  ✅ ' + name); }
  else {
    FAIL++; failures.push(group + ' → ' + name);
    console.log('  ❌ ' + name + (extra ? '  [' + extra + ']' : ''));
  }
}

const ISO = () => new Date().toISOString();

/* Conversation ya 1:1 — schema ILEILE inayotumiwa na js/app/34-chat-core.js */
function convDoc(a, b, extra) {
  const unread = {}; unread[a] = 0; unread[b] = 0;
  return Object.assign({
    type: 'direct',
    participants: [a, b].sort(),
    participantMeta: {
      [a]: { uid: a, name: 'Buyer', photo: '', role: 'user', verified: false },
      [b]: { uid: b, name: 'Seller', photo: '', role: 'user', verified: false }
    },
    related: null,
    lastMessage: null,
    lastMessageAt: null,
    unread: unread,
    lastReadAt: {},
    typing: null,
    createdAt: ISO(),
    updatedAt: ISO(),
    status: 'active'
  }, extra || {});
}

async function seedConv(id, data) {
  await db.doc('conversations/' + id).set(data);
}

async function main() {
  await loadRules();

  const A = await idToken('buyerA');   // mnunuzi
  const B = await idToken('sellerB');  // muuzaji
  const C = await idToken('outsiderC');
  const uA = A.uid, uB = B.uid, uC = C.uid;

  console.log('\n==========================================================');
  console.log(' CHAT CONVERSATION SECURITY — STAGE 1');
  console.log('==========================================================');

  /* ============================================================
   * G1. MITIRIRIKO HALALI — mshirika A (mnunuzi)
   * ========================================================== */
  console.log('\n[G1] Mitiririko halali — A (mnunuzi)');
  {
    await wipe();
    await seedConv('conv_g1', convDoc(uA, uB));

    // (1) markRead: unread yangu → 0, lastReadAt yangu (kama 34-chat-core.js:1646)
    const mr = await restPatch(A.token, 'conversations/conv_g1', {
      unread: { [uA]: 0, [uB]: 0 },
      lastReadAt: { [uA]: ISO() }
    });
    check('G1', 'markRead: unread yangu → 0 + lastReadAt yangu', mr === 200, 'status=' + mr);

    // (2) deliveredAt yangu (34-chat-core.js:1898)
    const dl = await restPatch(A.token, 'conversations/conv_g1', { deliveredAt: { [uA]: ISO() } });
    check('G1', 'deliveredAt ya uid yangu', dl === 200, 'status=' + dl);

    // (3) pinned / muted / archived / drafts — herufi zangu tu
    check('G1', 'pinned ya uid yangu', (await restPatch(A.token, 'conversations/conv_g1', { pinned: { [uA]: true } })) === 200);
    check('G1', 'muted ya uid yangu', (await restPatch(A.token, 'conversations/conv_g1', { muted: { [uA]: true } })) === 200);
    check('G1', 'archived ya uid yangu', (await restPatch(A.token, 'conversations/conv_g1', { archived: { [uA]: true } })) === 200);
    check('G1', 'drafts ya uid yangu', (await restPatch(A.token, 'conversations/conv_g1', { drafts: { [uA]: { text: 'habari', updatedAt: ISO() } } })) === 200);
    check('G1', 'drafts ya uid yangu kufutwa (deleteField)', (await restPatch(A.token, 'conversations/conv_g1', { drafts: {} })) === 200);

    // (4) typing yangu (34-chat-core.js:3106/3108)
    check('G1', 'typing yangu {uid: mimi}', (await restPatch(A.token, 'conversations/conv_g1', { typing: { uid: uA, at: ISO() } })) === 200);
    check('G1', 'typing kufutwa (null)', (await restPatch(A.token, 'conversations/conv_g1', { typing: null })) === 200);

    // (5) kufuta kwangu (deletedForUser yangu + deletedAt) — 34-chat-core.js:3733
    check('G1', 'deletedForUser yangu → true + deletedAt',
      (await restPatch(A.token, 'conversations/conv_g1', { deletedForUser: { [uA]: true }, deletedAt: ISO() })) === 200);

    // (6) merge/migrate (34-chat-core.js:2563 / 2597)
    check('G1', 'mergedInto (merge ya conversation)', (await restPatch(A.token, 'conversations/conv_g1', { mergedInto: 'conv_base' })) === 200);
    check('G1', 'migratedLegacy = true', (await restPatch(A.token, 'conversations/conv_g1', { migratedLegacy: true })) === 200);

    // (7) status halali (state transition inayoruhusiwa)
    check('G1', "status 'active' → 'archived'", (await restPatch(A.token, 'conversations/conv_g1', { status: 'archived' })) === 200);
    check('G1', "status 'archived' → 'active'", (await restPatch(A.token, 'conversations/conv_g1', { status: 'active' })) === 200);
  }

  /* ============================================================
   * G2. KUTUMA UJUMBE — metaPatch HALISI ya 34-chat-core.js:687-695
   *     (pamoja na related ya bidhaa = product-linked chat)
   * ========================================================== */
  console.log('\n[G2] Kutuma ujumbe + related ya bidhaa (product-linked chat)');
  {
    await wipe();
    await seedConv('conv_g2', convDoc(uA, uB));

    // metaPatch kamili ya client (A = mnunuzi anamtumia B = muuzaji)
    const now = ISO();
    const sendPatch = {
      lastMessage: { text: 'Bidhaa: Simu ya mkononi', senderId: uA, at: now, type: 'product' },
      lastMessageAt: now,
      updatedAt: now,
      unread: { [uA]: 0, [uB]: 1 },
      deletedForUser: { [uA]: false, [uB]: false },
      drafts: {},
      related: {
        productId: 'prod_1', productCollection: 'products', productTitle: 'Simu ya mkononi',
        productPrice: 250000, productImage: 'https://x/i.jpg', productSaleMode: 'free_market',
        sellerId: uB, buyerId: uA
      }
    };
    const s1 = await restPatch(A.token, 'conversations/conv_g2', sendPatch);
    check('G2', 'kutuma: lastMessage + unread.mwenzangu +1 + related ya bidhaa', s1 === 200, 'status=' + s1);

    // ujumbe wenyewe kwenye subcollection
    const msgStatus = await restCreate(A.token, 'conversations/conv_g2/messages', 'msg_1', {
      senderId: uA, text: 'Habari, hii bidhaa ipo?', createdAt: now, type: 'text'
    });
    check('G2', 'ujumbe (messages subcollection) unaandikwa', msgStatus === 200, 'status=' + msgStatus);

    // commercePatch ya mwendo (34-chat-core.js:5718)
    const s2 = await restPatchNested(A.token, 'conversations/conv_g2', { 'related.commerce': { kind: 'negotiation', id: 'nego_1' } });
    check('G2', 'related.commerce (negotiation link)', s2 === 200, 'status=' + s2);

    // scrub: kufuta keys za related zisizo za jozi hii (34-chat-core.js:2242)
    const s3 = await restPatchNested(A.token, 'conversations/conv_g2', { 'related.productSaleMode': null });
    check('G2', 'scrub: kufuta key ya related', s3 === 200, 'status=' + s3);
  }

  /* ============================================================
   * G3. MITIRIRIKO HALALI — mshirika B (muuzaji), kwa UHURU
   * ========================================================== */
  console.log('\n[G3] Mitiririko halali — B (muuzaji), kwa uhuru wake');
  {
    await wipe();
    await seedConv('conv_g3', convDoc(uA, uB));

    const now = ISO();
    // B anajibu: lastMessage ya B + unread ya A +1
    const s1 = await restPatch(B.token, 'conversations/conv_g3', {
      lastMessage: { text: 'Ndiyo ipo', senderId: uB, at: now, type: 'text' },
      lastMessageAt: now, updatedAt: now,
      unread: { [uA]: 1, [uB]: 0 }
    });
    check('G3', 'B kutuma: lastMessage yake + unread.A +1', s1 === 200, 'status=' + s1);

    // B markRead
    const s2 = await restPatch(B.token, 'conversations/conv_g3', { unread: { [uA]: 1, [uB]: 0 }, lastReadAt: { [uB]: ISO() } });
    check('G3', 'B markRead: unread yake → 0', s2 === 200, 'status=' + s2);

    check('G3', 'B pinned yake', (await restPatch(B.token, 'conversations/conv_g3', { pinned: { [uB]: true } })) === 200);
    check('G3', 'B archived yake', (await restPatch(B.token, 'conversations/conv_g3', { archived: { [uB]: true } })) === 200);
    check('G3', 'B deliveredAt yake', (await restPatch(B.token, 'conversations/conv_g3', { deliveredAt: { [uB]: ISO() } })) === 200);
    check('G3', 'B typing yake', (await restPatch(B.token, 'conversations/conv_g3', { typing: { uid: uB, at: ISO() } })) === 200);

    // B anaweza kufungua product-linked chat (related kamili)
    const s3 = await restPatch(B.token, 'conversations/conv_g3', {
      related: { productId: 'prod_2', productTitle: 'Kiti', productPrice: 45000, sellerId: uA, buyerId: uB }
    });
    check('G3', 'B related ya bidhaa (muktadha halali)', s3 === 200, 'status=' + s3);
  }

  /* ============================================================
   * G4. UNAPOKATALIWA — unread ya MTU MWINGINE
   * ========================================================== */
  console.log('\n[G4] IMEKATALIWA — kugusa unread ya mwenzake');
  {
    await wipe();
    await seedConv('conv_g4', convDoc(uA, uB, { unread: { [uA]: 3, [uB]: 2 } }));

    // B anajaribu kusafisha beji ya A
    check('G4', 'B: unread.A → 0 (kufuta beji ya mwenzake)',
      (await restPatch(B.token, 'conversations/conv_g4', { unread: { [uA]: 0, [uB]: 2 } })) === 403);
    // B anajaribu kuongeza beji ya A bila ujumbe
    check('G4', 'B: unread.A → 99 (beji ya uongo)',
      (await restPatch(B.token, 'conversations/conv_g4', { unread: { [uA]: 99, [uB]: 2 } })) === 403);
    // B anajaribu kuongeza beji yake mwenyewe
    check('G4', 'B: unread.B 2 → 5 (kujiongezea beji)',
      (await restPatch(B.token, 'conversations/conv_g4', { unread: { [uA]: 3, [uB]: 5 } })) === 403);
    // A naye (mashirika yote mawili) hawezi kugusa ya B
    check('G4', 'A: unread.B → 0 (mashirika yote yanajaribiwа)',
      (await restPatch(A.token, 'conversations/conv_g4', { unread: { [uA]: 3, [uB]: 0 } })) === 403);
    // +2 badala ya +1 hata ikiwa na lastMessage halali
    check('G4', 'B: unread.A +2 (si +1) pamoja na lastMessage yake',
      (await restPatch(B.token, 'conversations/conv_g4', {
        lastMessage: { text: 'x', senderId: uB, at: ISO() }, lastMessageAt: ISO(),
        unread: { [uA]: 5, [uB]: 2 }
      })) === 403);
  }

  /* ============================================================
   * G5. IMEKATALIWA — lastMessage ya uongo
   * ========================================================== */
  console.log('\n[G5] IMEKATALIWA — lastMessage / inbox preview ya uongo');
  {
    await wipe();
    await seedConv('conv_g5', convDoc(uA, uB));

    // B anajaribu kuandika preview kwa niaba ya A
    check('G5', 'B: lastMessage yenye senderId = A (kujifanya A)',
      (await restPatch(B.token, 'conversations/conv_g5', {
        lastMessage: { text: 'Nimelipa', senderId: uA, at: ISO(), type: 'text' }, lastMessageAt: ISO()
      })) === 403);

    // B preview bila senderId kabisa
    check('G5', 'B: lastMessage bila senderId',
      (await restPatch(B.token, 'conversations/conv_g5', {
        lastMessage: { text: 'Ujumbe wa uongo' }, lastMessageAt: ISO()
      })) === 403);

    // keys zisizo halali ndani ya lastMessage
    check('G5', 'B: lastMessage yenye key isiyoruhusiwa',
      (await restPatch(B.token, 'conversations/conv_g5', {
        lastMessage: { text: 'x', senderId: uB, at: ISO(), protected: true }, lastMessageAt: ISO()
      })) === 403);

    // kufuta lastMessage iliyopo
    await db.doc('conversations/conv_g5').update({ lastMessage: { text: 'halali', senderId: uB, at: ISO(), type: 'text' }, lastMessageAt: ISO() });
    check('G5', 'B: lastMessage → null (kufuta preview)',
      (await restPatch(B.token, 'conversations/conv_g5', { lastMessage: null })) === 403);
  }

  /* ============================================================
   * G6. IMEKATALIWA — related (bidhaa) isiyoruhusiwa
   * ========================================================== */
  console.log('\n[G6] IMEKATALIWA — related / muktadha wa bidhaa');
  {
    await wipe();
    await seedConv('conv_g6', convDoc(uA, uB, {
      related: { productId: 'prod_1', productTitle: 'Simu', sellerId: uB, buyerId: uA }
    }));

    // kupeleka sellerId kwa MTU ASIYE mshirika
    check('G6', 'B: related.sellerId → mtu wa tatu (asiye mshirika)',
      (await restPatchNested(B.token, 'conversations/conv_g6', { 'related.sellerId': uC })) === 403);

    // kubadilisha umiliki uliokwishawekwa
    check('G6', 'B: related.buyerId kubadilishwa (umiliki uliokwishawekwa)',
      (await restPatchNested(B.token, 'conversations/conv_g6', { 'related.buyerId': uB })) === 403);

    // key isiyoruhusiwa
    check('G6', 'B: related key isiyoruhusiwa',
      (await restPatchNested(B.token, 'conversations/conv_g6', { 'related.malicious': 'x' })) === 403);

    // kufuta related yote (badala ya keys)
    check('G6', 'B: related → null (kufuta muktadha wote)',
      (await restPatch(B.token, 'conversations/conv_g6', { related: null })) === 403);
  }

  /* ============================================================
   * G7. IMEKATALIWA — utambulisho, schema na fields zisizojulikana
   * ========================================================== */
  console.log('\n[G7] IMEKATALIWA — utambulisho, schema, fields zisizojulikana');
  {
    await wipe();
    await seedConv('conv_g7', convDoc(uA, uB));

    check('G7', 'A: kubadilisha participants',
      (await restPatch(A.token, 'conversations/conv_g7', { participants: [uA, uC].sort() })) === 403);
    check('G7', 'A: kubadilisha createdAt',
      (await restPatch(A.token, 'conversations/conv_g7', { createdAt: '2000-01-01T00:00:00.000Z' })) === 403);
    check('G7', 'A: kubadilisha createdBy',
      (await restPatch(A.token, 'conversations/conv_g7', { createdBy: uC })) === 403);
    check('G7', 'A: kubadilisha participantMeta',
      (await restPatch(A.token, 'conversations/conv_g7', { participantMeta: { [uA]: { uid: uA, name: 'Jina la uongo' } } })) === 403);
    check('G7', 'A: kubadilisha type',
      (await restPatch(A.token, 'conversations/conv_g7', { type: 'group' })) === 403);
    check('G7', 'A: field isiyojulikana (haipo kwenye schema)',
      (await restPatch(A.token, 'conversations/conv_g7', { hacked: true })) === 403);
    check('G7', "A: status isiyoruhusiwa ('deleted')",
      (await restPatch(A.token, 'conversations/conv_g7', { status: 'deleted' })) === 403);
    check('G7', 'A: typing ya MWENZANGU (kujifanya B anaandika)',
      (await restPatch(A.token, 'conversations/conv_g7', { typing: { uid: uB, at: ISO() } })) === 403);
    check('G7', "A: pinned ya MWENZANGU (kufunga kwa niaba ya B)",
      (await restPatch(A.token, 'conversations/conv_g7', { pinned: { [uA]: true, [uB]: true } })) === 403);
    check('G7', 'A: archived ya MWENZANGU',
      (await restPatch(A.token, 'conversations/conv_g7', { archived: { [uA]: false, [uB]: true } })) === 403);
    check('G7', "A: deletedForUser.B → true (kumfichia mwenzake)",
      (await restPatch(A.token, 'conversations/conv_g7', { deletedForUser: { [uA]: false, [uB]: true } })) === 403);
  }

  /* ============================================================
   * G8. MTU ASIYE MSHIRIKA
   * ========================================================== */
  console.log('\n[G8] IMEKATALIWA — mtu asiye mshirika (C)');
  {
    await wipe();
    await seedConv('conv_g8', convDoc(uA, uB));

    check('G8', 'C: kusoma conversation', (await restRead(C.token, 'conversations/conv_g8')) === 403);
    check('G8', 'C: kuandika unread yake (kujiongeza)',
      (await restPatch(C.token, 'conversations/conv_g8', { unread: { [uC]: 1 } })) === 403);
    check('G8', 'C: kuandika lastMessage',
      (await restPatch(C.token, 'conversations/conv_g8', {
        lastMessage: { text: 'x', senderId: uC, at: ISO() }, lastMessageAt: ISO()
      })) === 403);
    check('G8', 'C: kuandika related',
      (await restPatch(C.token, 'conversations/conv_g8', { related: { productId: 'p' } })) === 403);
  }

  /* ============================================================
   * G9. Hali isiyobadilika: create ya group (kama ilivyokuwa)
   * ========================================================== */
  console.log('\n[G9] Hali ya kikundi (haijabadilishwa na Stage 1)');
  {
    await wipe();
    // 69-chat-groups.js:98 huunda conv ya kikundi na participants: [uid] mmoja.
    const gCreate = await restCreate(A.token, 'conversations', 'conv_group_g1', {
      type: 'group', groupId: 'g1', name: 'Kikundi', participants: [uA],
      createdAt: ISO(), updatedAt: ISO(), lastMessageAt: null
    });
    check('G9', 'create ya conv ya kikundi inakataliwa (kama ilivyokuwa kabla ya Stage 1)', gCreate === 403, 'status=' + gCreate);
  }

  /* ============================================================
   * G10. Messages subcollection — haijabadilishwa
   * ========================================================== */
  console.log('\n[G10] Messages subcollection (hakuna regression)');
  {
    await wipe();
    await seedConv('conv_g10', convDoc(uA, uB));

    check('G10', 'A: kutuma ujumbe', (await restCreate(A.token, 'conversations/conv_g10/messages', 'm1', {
      senderId: uA, text: 'habari', createdAt: ISO(), type: 'text'
    })) === 200);

    check('G10', 'B: kujifanya A kutuma ujumbe (senderId = A)', (await restCreate(B.token, 'conversations/conv_g10/messages', 'm2', {
      senderId: uA, text: 'uongo', createdAt: ISO(), type: 'text'
    })) === 403);

    check('G10', 'A: kuhariri ujumbe wake', (await restPatch(A.token, 'conversations/conv_g10/messages/m1', {
      text: 'habari (imehaririwa)', editedAt: ISO()
    })) === 200);

    check('G10', 'B: kuhariri ujumbe wa A', (await restPatch(B.token, 'conversations/conv_g10/messages/m1', {
      text: 'uongo'
    })) === 403);

    check('G10', 'B: kuweka readBy yake kwenye ujumbe wa A', (await restPatch(B.token, 'conversations/conv_g10/messages/m1', {
      readBy: [uB]
    })) === 200);
  }

  /* ============================================================
   * MUHTASARI
   * ========================================================== */
  console.log('\n==========================================================');
  console.log(` CHAT CONVERSATION SECURITY: ${PASS} passed, ${FAIL} failed`);
  if (FAIL) { console.log(' Zilizoshindwa:'); failures.forEach(f => console.log('  - ' + f)); }
  console.log('==========================================================');
  process.exit(FAIL ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e && e.stack || e); process.exit(1); });
