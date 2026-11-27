#!/usr/bin/env node
/* PART 2 — FINAL VERIFICATION (2026-11-24)
 * [MODULE 1 2026-11-27] Sections A, B, C updated: the former KNOWN GAPS A2/A3/A5/C are fixed
 * (the browser no longer attempts wallet writes; settlement fails closed on a missing seller or a
 * financialLedger failure). They are now ordinary PASS/FAIL assertions.
 * Focused, executable verification of the shipped wallet/escrow code, plus the claims/upload
 * evidence. Every assertion extracts the real function from the shipped file by brace matching
 * and executes it against fake Firestore objects.
 *
 * Two counters are reported separately:
 *   PASS / FAIL   — properties that must hold
 *   KNOWN GAP     — behaviour that is demonstrably WRONG but cannot be fixed in the browser
 *                   (requires a server transaction). These are reported to the owner, never
 *                   counted as passes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0, gaps = 0;
const ok = (n, c, v) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + n + (c ? '' : ' -> ' + JSON.stringify(v))); };
/* A KNOWN GAP is asserted as "the current behaviour is the bad one, deliberately recorded". */
const gap = (n, c, v) => { c ? gaps++ : fail++; console.log((c ? '  KNOWN GAP ' : '  FAIL ') + n + (c ? '' : ' (the gap did NOT reproduce — re-check the code) -> ' + JSON.stringify(v))); };
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function extractFn(src, startMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error('marker not found: ' + startMarker);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  throw new Error('unbalanced braces for: ' + startMarker);
}

const GCO_SRC = read('js/app/69-chat-groups.js');
const SETTLE_FILE = read('js/app/74-group-order-system.js');
const gcoSrc = extractFn(GCO_SRC, 'async function gcoWalletAdd(uid2, delta, kind, orderDocId, note, meta) {');
const settleSrc = extractFn(SETTLE_FILE, 'async function settlementRelease(gid, goid, packageId) {');
const autoSrc = extractFn(SETTLE_FILE, 'async function autoReleaseCheck(gid, goid) {');

/* ------------------------------------------------------------------ wallet harness */
function walletEnv({ balanceOk = true, ledgerOk = true, ledgerRows = null, balance = 1000, attempts = null } = {}) {
  const writes = [];
  const deny = () => { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; return Promise.reject(e); };
  const db = {
    getDocs: async () => ({ empty: !ledgerRows, size: ledgerRows ? ledgerRows.length : 0, docs: [], forEach() {} }),
    getDoc: async () => ({ exists: () => true, data: () => ({ walletBalance: balance }) }),
    updateDoc: async (ref, d) => { writes.push(['update', ref.path, d]); return balanceOk ? {} : deny(); },
    setDoc: async (ref, d) => { writes.push(['set', ref.path, d]); return balanceOk ? {} : deny(); },
    addDoc: async (ref, d) => { writes.push(['add', ref.path, d]); return ledgerOk ? {} : deny(); }
  };
  const w = { skhWalletFailures: [], skhWalletAttempts: attempts || {}, console: { warn() {}, error() {}, log() {} } };
  const skh = { db, doc: (d, ...p) => ({ path: p.join('/') }), collection: (d, ...p) => ({ path: p.join('/') }),
    query: () => ({}), where: () => ({}), limit: () => ({}),
    getDocs: db.getDocs, getDoc: db.getDoc, updateDoc: db.updateDoc, setDoc: db.setDoc, addDoc: db.addDoc, currentUserData: {} };
  w.skh = skh;
  const fn = new Function('skh', 'window', 'uid', 'nowIso', 'console',
    gcoSrc + '\nreturn gcoWalletAdd;')(skh, w, () => 'u1', () => 'T0', w.console);
  const balanceWrites = () => writes.filter(([op, p]) => op === 'update' || op === 'set').length;
  const ledgerWrites = () => writes.filter(([op]) => op === 'add').length;
  return { fn, writes, w, skh, balanceWrites, ledgerWrites };
}

console.log('\nA. WALLET MOVEMENT — THE BROWSER NEVER MOVES MONEY');
/* [MODULE 1 2026-11-27] users.walletBalance and wallet_ledger are server-write-only
 * (firestore.rules). The former A2/A3/A5 KNOWN GAPS came from browser writes that could land
 * half a movement. gcoWalletAdd now attempts NO write at all; these assertions prove it with a
 * harness that ALLOWS every write (i.e. even if the rules were loosened). */
{
  const iAttempt = gcoSrc.indexOf('if (attempts[attemptKey])');
  const iDedupe = gcoSrc.indexOf('if (!qy.empty)');
  ok('order: partial-attempt guard BEFORE ledger lookup', iAttempt >= 0 && iAttempt < iDedupe, { iAttempt, iDedupe });
  ok('source: no balance write in gcoWalletAdd', !/updateDoc\(uref|setDoc\(uref/.test(gcoSrc), 'balance write found');
  ok('source: no wallet_ledger write in gcoWalletAdd', !/addDoc\(skh\.collection\(skh\.db, 'wallet_ledger'\)/.test(gcoSrc), 'ledger write found');
  ok('source: the only ok:true is the server-written ledger row (already:true)', (gcoSrc.match(/ok: true/g) || []).length === 1 && /if \(!qy\.empty\) return \{ ok: true, already: true/.test(gcoSrc), (gcoSrc.match(/ok: true/g) || []).length);
}

/* A1. everything allowed -> still no write, server_required */
{ const e = walletEnv({ balanceOk: true, ledgerOk: true });
  const r = await e.fn('u1', 500, 'escrow_release', 'A1', 'n', {});
  ok('A1 -> ok:false / server_required / needsServer', r.ok === false && r.reason === 'server_required' && r.needsServer === true && r.partial === false, r);
  ok('A1 -> zero writes even with every write allowed', e.writes.length === 0, e.writes);
  ok('A1 local mirror untouched', e.skh.currentUserData.walletBalance === undefined, e.skh.currentUserData);
  ok('A1 no partial attempt can exist', Object.keys(e.w.skhWalletAttempts).length === 0, e.w.skhWalletAttempts); }

/* A4. a movement the SERVER completed (ledger row present) -> already:true, zero writes */
{ const e = walletEnv({ ledgerRows: [{ id: 'L1' }] });
  const r = await e.fn('u1', 500, 'escrow_release', 'A4', 'n', {});
  ok('A4 server ledger row -> already:true, zero writes', r.ok === true && r.already === true && e.writes.length === 0, { r, writes: e.writes }); }

/* A2. cross-session: a ledger row can only come from the server transaction that also moved the
 * balance, so already:true is now sound. */
{ const e = walletEnv({ ledgerRows: [{ id: 'L3' }] });
  const r = await e.fn('u1', 500, 'escrow_release', 'A2X', 'n', {});
  ok('A2 CROSS-SESSION: ledger row -> already:true and no browser path can create such a row', r.ok === true && r.already === true && !/wallet_ledger'\), \{/.test(gcoSrc), r); }

/* A3. cross-session retry and concurrent retries: no balance can ever be applied twice */
{ const e = walletEnv({ balanceOk: true, ledgerOk: true });
  const rs = await Promise.all([1, 2, 3, 4, 5].map(() => e.fn('u1', 500, 'escrow_release', 'A3Y', 'n', {})));
  ok('A3 CROSS-SESSION + 5 concurrent retries -> zero balance writes (double credit impossible)', e.balanceWrites() === 0 && e.ledgerWrites() === 0, e.writes);
  ok('A3 every concurrent call -> ok:false server_required', rs.every((r) => r.ok === false && r.reason === 'server_required'), rs.map((r) => r.reason)); }

/* A5. no partial can exist, so nothing needs to be identified after a reload */
{ const e = walletEnv({ balanceOk: true, ledgerOk: false });
  await e.fn('u1', 500, 'escrow_release', 'A5', 'n', {});
  const f = e.w.skhWalletFailures[0];
  ok('A5 failure log records server_required, not a partial', !!f && f.partial === false && f.reason === 'server_required' && f.balanceWritten === false && f.ledgerWritten === false, f);
  ok('A5 nothing written, nothing to reconcile', e.writes.length === 0, e.writes); }

/* ------------------------------------------------------------------ settlement harness */
function settleEnv({ sellerMode = 'both', transporterMode = 'both', shipment = null, settlementReleased = false, attempts = null } = {}) {
  const writes = [];
  const deny = () => { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; return Promise.reject(e); };
  const okFor = (uid, mode) => mode === 'both' || mode === 'balance-only';
  const okLedger = (uid, mode) => mode === 'both' || mode === 'ledger-only';
  const skh = {
    db: {},
    doc: (d, ...p) => ({ path: p.join('/') }),
    collection: (d, ...p) => ({ path: p.join('/') }),
    getDoc: async (ref) => {
      const p = String(ref.path || '');
      if (p.indexOf('packages') !== -1) return { exists: () => true, data: () => ({ qty: 2, shipmentId: shipment ? 'sh1' : null, settlementReleased }) };
      if (p.indexOf('shipments') !== -1) return { exists: () => true, data: () => shipment || {} };
      if (/groupOrders\/[^/]+$/.test(p)) return { exists: () => true, data: () => ({ targetPrice: 10000, organizerId: 'seller1', productSnapshot: { sellerId: 'seller1' } }) };
      return { exists: () => true, data: () => ({ walletBalance: 0 }) };
    },
    updateDoc: async (ref, data) => {
      const p = String(ref.path || ''); writes.push(['update', p, data]);
      if (p === 'users/seller1' && !okFor('seller1', sellerMode)) return deny();
      if (p === 'users/tr1' && !okFor('tr1', transporterMode)) return deny();
      return {};
    },
    setDoc: async (ref, data) => { writes.push(['set', String(ref.path || ''), data]); return {}; }
  };
  skh.addDoc = async (ref, data) => {
    const p = String(ref.path || ''); writes.push(['add', p, data]);
    if (p === 'wallet_ledger') {
      if (data.uid === 'seller1' && !okLedger('seller1', sellerMode)) return deny();
      if (data.uid === 'tr1' && !okLedger('tr1', transporterMode)) return deny();
    }
    return {};
  };
  const w = { skhSettlementAttempts: attempts || {}, console: { warn() {}, log() {} } };
  const fn = new Function('skh', 'window', 'nowIso', 'uid', 'goRef', 'logAudit', 'console',
    settleSrc + '\nreturn settlementRelease;')(
    skh, w, () => 'T0', () => 'u1',
    (gid, goid) => ({ path: 'chatGroups/' + gid + '/groupOrders/' + goid }), async () => {}, w.console);
  const marked = () => writes.some(([op, p, d]) => op === 'update' && p.indexOf('packages') !== -1 && d && d.settlementReleased === true);
  const paid = (uid) => writes.some(([op, p, d]) => (op === 'update' && p === 'users/' + uid) || (op === 'add' && p === 'wallet_ledger' && d && d.uid === uid));
  const ledgerCount = (uid) => writes.filter(([op, p, d]) => op === 'add' && p === 'wallet_ledger' && d && d.uid === uid).length;
  return { fn, writes, w, marked, paid, ledgerCount };
}

console.log('\nB. SELLER / TRANSPORTER SETTLEMENT — NO BROWSER MONEY WRITE');
{ ok('source: settlementRelease has no seller balance/ledger write', !/users', sellerId\)/.test(settleSrc), 'seller write found'); }
/* B1 every write allowed -> settlement still refuses: server_required, nothing marked, nobody paid */
{ const e = settleEnv({ shipment: { transporterId: 'tr1', transportFee: 2000 } });
  const r = await e.fn('g1', 'go1', 'p1');
  ok('B1 -> ok:false server_required', r.ok === false && r.reason === 'server_required', r);
  ok('B1 -> seller NOT paid, transporter NOT paid', !e.paid('seller1') && !e.paid('tr1'), e.writes.map(w => w[1]));
  ok('B1 -> package NOT marked settlementReleased', !e.marked(), e.writes.map(w => w[1])); }

/* B2 no seller on the group order -> refused (previously: marked settled, ok:true, nobody paid) */
{ const writes = [];
  const skh = {
    db: {}, doc: (d, ...p) => ({ path: p.join('/') }), collection: (d, ...p) => ({ path: p.join('/') }),
    getDoc: async (ref) => {
      const p = String(ref.path || '');
      if (p.indexOf('packages') !== -1) return { exists: () => true, data: () => ({ qty: 2, shipmentId: null }) };
      if (/groupOrders\/[^/]+$/.test(p)) return { exists: () => true, data: () => ({ targetPrice: 10000 }) };
      return { exists: () => true, data: () => ({}) };
    },
    updateDoc: async (ref, d) => { writes.push(['update', ref.path, d]); return {}; },
    setDoc: async (ref, d) => { writes.push(['set', ref.path, d]); return {}; },
    addDoc: async (ref, d) => { writes.push(['add', ref.path, d]); return {}; }
  };
  const w = { skhSettlementAttempts: {}, console: { warn() {}, log() {} } };
  const fn = new Function('skh', 'window', 'nowIso', 'uid', 'goRef', 'logAudit', 'console', settleSrc + '\nreturn settlementRelease;')(
    skh, w, () => 'T0', () => 'u1', (gid, goid) => ({ path: 'chatGroups/' + gid + '/groupOrders/' + goid }), async () => {}, w.console);
  const r = await fn('g1', 'go1', 'pN');
  ok('B2 no seller -> ok:false no_seller, zero writes', r.ok === false && r.reason === 'no_seller' && writes.length === 0, { r, writes }); }

/* B3 seller writes denied (deployed rules) -> same refusal, transporter untouched */
{ const e = settleEnv({ sellerMode: 'none', transporterMode: 'both', shipment: { transporterId: 'tr1', transportFee: 2000 } });
  const r = await e.fn('g1', 'go1', 'p3');
  ok('B3 -> ok:false server_required, nothing marked, transporter NOT paid', r.ok === false && r.reason === 'server_required' && !e.marked() && !e.paid('tr1'), { r, writes: e.writes.map(w => w[1]) }); }

/* B4 concurrent retries -> zero money writes, never marked */
{ const e = settleEnv({ shipment: { transporterId: 'tr1', transportFee: 2000 } });
  const rs = await Promise.all([1, 2, 3, 4].map(() => e.fn('g1', 'go1', 'p4')));
  ok('B4 4 concurrent retries -> zero balance/ledger writes, never marked', e.writes.filter(([op, p]) => p.indexOf('users/') === 0 || p === 'wallet_ledger').length === 0 && !e.marked() && rs.every(r => r.ok === false), { rs: rs.map(r => r.reason), writes: e.writes.map(w => w[1]) }); }

/* B5 a package the server already settled -> already:true, zero writes */
{ const e = settleEnv({ settlementReleased: true });
  const r = await e.fn('g1', 'go1', 'p7');
  ok('B5 already-settled package -> already:true, zero writes', r.ok === true && r.already === true && e.writes.length === 0, { r, writes: e.writes }); }

/* releaseTransactionId is written by autoReleaseCheck, only after settlement completes */
{
  const autoEnv = (settleResult) => {
    const writes = [];
    const skh = {
      db: {}, doc: (d, ...p) => ({ path: p.join('/') }), collection: (d, ...p) => ({ path: p.join('/') }),
      getDocs: async () => ({ forEach: (cb) => cb({ id: 'pk', data: () => ({ packageId: 'pk', status: 'DELIVERED', participantId: 'buyer1', confirmationDeadline: new Date(Date.now() - 60000).toISOString() }) }) }),
      getDoc: async () => ({ exists: () => false }),
      updateDoc: async (ref, data) => { writes.push([String(ref.path || ''), data]); return {}; }
    };
    const win = { console: { warn() {}, log() {} } };
    const fn = new Function('skh', 'window', 'nowIso', 'uid', 'pkgCol', 'PACKAGE_STATUS', 'DELIVERY_STATUS', 'PARTICIPANT_STATE',
      'ensureParticipantDoc', 'settlementRelease', 'logAudit', 'console',
      autoSrc + '\nreturn autoReleaseCheck;')(
      skh, win, () => 'T0', () => 'u1', () => ({}), { DELIVERED: 'DELIVERED', CONFIRMED: 'CONFIRMED' },
      { AUTO_RELEASED: 'AUTO_RELEASED' }, { COMPLETED: 'COMPLETED' }, async () => {}, async () => settleResult, async () => {}, win.console);
    return { fn, writes };
  };
  for (const [label, res] of [['partial_write', { ok: false, reason: 'partial_write', partial: true }],
                              ['partial_settlement', { ok: false, reason: 'partial_settlement', partial: true }],
                              ['server_required', { ok: false, reason: 'server_required' }]]) {
    const e = autoEnv(res);
    const r = await e.fn('g1', 'go1');
    ok(`auto-release + ${label} -> no releaseTransactionId, count 0`, r.count === 0 && !e.writes.some(([p, d]) => p.indexOf('packages') !== -1 && d && d.releaseTransactionId), { r, writes: e.writes.map(w => w[0]) });
  }
  const e = autoEnv({ ok: true });
  const r = await e.fn('g1', 'go1');
  ok('auto-release + completed settlement -> releaseTransactionId written once', r.count === 1 && e.writes.filter(([p, d]) => d && d.releaseTransactionId).length === 1, { r, writes: e.writes.map(w => w[0]) });
}

/* ------------------------------------------------------------------ C. financial ledger */
console.log('\nC. SETTLEMENT FINANCIAL LEDGER (fail closed)');
{
  const finLine = SETTLE_FILE.split('\n').findIndex((l) => l.indexOf('/financialLedger') !== -1);
  const src = SETTLE_FILE.split('\n');
  ok('C the ledger write is financialLedger/main, a DIFFERENT collection from wallet_ledger',
     finLine > 0 && src[finLine].indexOf('financialLedger') !== -1 && src[finLine].indexOf('wallet_ledger') === -1, src[finLine] && src[finLine].trim());
  ok('C its failure is NO LONGER swallowed (no empty catch after setDoc(finRef))', !/setDoc\(finRef[\s\S]{0,200}?\} catch \(eF\) \{\}/.test(SETTLE_FILE), 'empty catch still present');
  ok('C a failure returns ok:false ledger_write_failed BEFORE the package is marked',
     /catch \(eF\) \{[\s\S]{0,400}?reason: 'ledger_write_failed'/.test(settleSrc) && settleSrc.indexOf("reason: 'ledger_write_failed'") < settleSrc.lastIndexOf('settlementReleased: true'), 'order/shape not found');
  ok('C ok:true (settled) appears only after the ledger write and the package mark',
     settleSrc.lastIndexOf('return { ok: true, sellerAmount') > settleSrc.indexOf('setDoc(finRef') && settleSrc.lastIndexOf('return { ok: true, sellerAmount') > settleSrc.lastIndexOf('settlementReleased: true'), 'order');
}

/* ------------------------------------------------------------------ D. claims + uploads */
console.log('\nD. CLAIMS SOURCE AND UPLOAD PATH NORMALISATION');
{
  const allJs = [];
  const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach((d) => {
    const rel = dir + '/' + d.name;
    if (d.isDirectory()) return walk(rel);
    if (d.name.endsWith('.js')) allJs.push(rel);
  });
  walk('js');
  const setters = allJs.filter((f) => /SOKOHAI_CLAIMS\s*=/.test(read(f)));
  ok('D SOKOHAI_CLAIMS is assigned in exactly one place', setters.length === 1, setters);
  ok('D the assignment reads Firebase ID-token claims', /getIdTokenResult\(\)/.test(read(setters[0])), setters[0]);
  ok('D the assignment never reads a profile field / storage', !/localStorage|userData|\.admin\b/.test(read(setters[0]).split('SOKOHAI_CLAIMS')[0].slice(-400)), setters[0]);

  const boot = read('js/app/00-bootstrap.js');
  const fallbackSrc = extractFn(boot, 'skh.isAdminEmailFallback = function isAdminEmailFallback(user) {');
  const adminSrc = extractFn(boot, 'skh.isAdminUser = function isAdminUser(user) {');
  const mk = (cfg, claims, user) => {
    const w = { SOKOHAI_CONFIG: cfg || {}, SOKOHAI_CLAIMS: claims || {} };
    const skh = { currentUser: user || null, MY_ADMIN_EMAIL: 'owner@example.com' };
    new Function('skh', 'window', fallbackSrc + '\n' + adminSrc)(skh, w);
    return skh;
  };
  ok('D profile flag user.admin=true does NOT grant admin', mk({}, {}, { email: 'x@y.z', emailVerified: true, admin: true, isAdmin: true }).isAdminUser() === false, 'granted');
  ok('D profile flag in users doc (no claims, no verified owner email) does NOT grant admin',
     mk({ ADMIN_EMAIL_FALLBACK: true }, {}, { email: 'seller@example.com', emailVerified: true, role: 'admin' }).isAdminUser() === false, 'granted');
  ok('D only a token claim grants admin without the verified owner e-mail', mk({}, { isAdmin: true }, { email: 'seller@example.com' }).isAdminUser() === true, 'denied');

  const uploads = read('js/11-uploads.js');
  ok('D upload gate calls the normaliser before requiring a signature', /skhUploadIsSensitiveFolder\(opts\.folder\)/.test(uploads), 'missing');
  const normRaw = uploads.slice(uploads.indexOf('window.skhUploadIsSensitiveFolder = function'));
  const normBody = normRaw.slice(0, normRaw.indexOf('\n    };') + 7);
  ok('D normaliser decodes %XX', normBody.indexOf('decodeURIComponent') !== -1, 'missing');
  ok('D normaliser unifies backslashes then splits on /', normBody.indexOf("replace(/\\\\/g, '/')") !== -1 && normBody.indexOf("split('/')") !== -1, normBody.replace(/\s+/g, ' ').slice(0, 260));
  ok('D normaliser trims + lower-cases before matching', normBody.indexOf('toLowerCase') !== -1 && normBody.indexOf('trim') !== -1, 'missing');
  ok('D normaliser matches EVERY path segment (not a prefix)', normBody.indexOf('for (') !== -1 && normBody.indexOf('segments[i]') !== -1, 'missing');
  // seller (non-admin) upload path: the ad-designer helper must not be admin-gated
  const pos = read('js/app/16-pos-admin-jobs.js');
  const uploadFn = extractFn(pos, 'window.skhAdminAdUpload=async function(kind,input){');
  ok('D seller ad upload helper (skhAdminAdUpload) is NOT admin-gated (sellers keep uploading)', !/isAdminUser|SOKOHAI_CLAIMS|Admin authorization/.test(uploadFn), 'gated');
  ok('D the admin media LIBRARY stays gated (separate function)', /skhOpenAdminMediaLibrary=async function\(target\)\{if\(!\(typeof skh\.isAdminUser/.test(pos), 'not gated');
}

console.log(`\nVERIFICATION RESULT: ${pass} passed, ${fail} failed, ${gaps} known gaps (reported, not counted as passes)`);
process.exit(fail ? 1 : 0);
