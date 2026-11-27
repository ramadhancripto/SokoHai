#!/usr/bin/env node
/* [PART 2 SECURITY 2026-11-24] Client-side security regressions found on the real app:
 *   C1  admin UI gate must match firestore.rules::isAdmin() — claims first, and the
 *       owner-email fallback only when the Firebase token says email_verified === true.
 *   C2  group-buy wallet credit (escrow) must not report ok:true when the server
 *       refused the walletBalance / wallet_ledger write (wallet is server-write-only).
 *       [MODULE 1 2026-11-27, owner decision] the browser no longer ATTEMPTS money writes at
 *       all (A2/A3/A5 double-credit risk). ok:true only when the SERVER already wrote the
 *       ledger row (already:true). The 'feature preserved' cases below now model exactly that.
 *   C3  private documents (identity/kyc/verification/...) must never reach the public
 *       unsigned Cloudinary preset — including the server's explicit {mode:'unsigned'}.
 * Every assertion runs the REAL shipping code, extracted from the shipped file, so a
 * future edit that re-weakens any guard turns this test red.
 */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, v) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + n + (c ? '' : ' -> ' + JSON.stringify(v))); };
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ---------- helpers: pull a function body out of a shipped file by brace matching ---------- */
function extractFn(src, startMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error('marker not found: ' + startMarker);
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  throw new Error('unbalanced braces for: ' + startMarker);
}

/* ============================ C1 — admin gate parity ============================ */
console.log('C1  admin UI gate (claims + email_verified fallback)');
{
  const boot = read('js/app/00-bootstrap.js');
  const fallbackSrc = extractFn(boot, 'skh.isAdminEmailFallback = function isAdminEmailFallback(user) {');
  const adminSrc = extractFn(boot, 'skh.isAdminUser = function isAdminUser(user) {');
  // The two helpers reference `skh` and `window` only; drive them with a fake environment.
  const buildEnv = (cfg, claims, user) => {
    const w = { SOKOHAI_CONFIG: cfg || {}, SOKOHAI_CLAIMS: claims || {} };
    const skh = { currentUser: user || null, MY_ADMIN_EMAIL: 'owner@example.com' };
    // eslint-disable-next-line no-new-func
    new Function('skh', 'window', fallbackSrc + '\n' + adminSrc)(skh, w);
    return { skh: Object.assign(skh, {}), w, call: (u) => skh.isAdminUser(u === undefined ? undefined : u) };
  };

  // claims always win, no e-mail needed
  { const e = buildEnv({}, { isAdmin: true }, null); ok('claims.isAdmin === true -> admin', e.call() === true, e.call()); }
  { const e = buildEnv({}, { role: 'admin' }, null); ok("claims.role === 'admin' -> admin", e.call() === true, e.call()); }
  { const e = buildEnv({}, { superAdmin: true }, null); ok('claims.superAdmin === true -> admin', e.call() === true, e.call()); }
  // no claims, no fallback flag -> not admin
  { const e = buildEnv({ ADMIN_EMAIL_FALLBACK: false }, {}, { email: 'owner@example.com', emailVerified: true }); ok('fallback flag off -> not admin', e.call() === false, e.call()); }
  // fallback requires a VERIFIED address (this is the regression C1 fixes)
  { const e = buildEnv({ ADMIN_EMAIL_FALLBACK: true }, {}, { email: 'owner@example.com', emailVerified: true }); ok('owner email + emailVerified true -> admin fallback works', e.call() === true, e.call()); }
  { const e = buildEnv({ ADMIN_EMAIL_FALLBACK: true }, {}, { email: 'owner@example.com', emailVerified: false }); ok('owner email + emailVerified FALSE -> denied (matches firestore.rules)', e.call() === false, e.call()); }
  { const e = buildEnv({ ADMIN_EMAIL_FALLBACK: true }, {}, { email: 'owner@example.com' }); ok('owner email + emailVerified missing -> denied', e.call() === false, e.call()); }
  { const e = buildEnv({ ADMIN_EMAIL_FALLBACK: true }, {}, { email: 'stranger@example.com', emailVerified: true }); ok('other verified email -> denied', e.call() === false, e.call()); }
  { const e = buildEnv({ ADMIN_EMAIL_FALLBACK: true }, {}, null); ok('no user -> denied', e.call() === false, e.call()); }
  { const e = buildEnv({ ADMIN_EMAIL_FALLBACK: true }, {}, { email: 'OWNER@Example.com', emailVerified: true }); ok('fallback compare is case-insensitive', e.call() === true, e.call()); }
  // email_verified must also be respected when a *different* user object is passed (server-side truth)
  { const e = buildEnv({ ADMIN_EMAIL_FALLBACK: true }, { isAdmin: false }, { email: 'a@b.c', emailVerified: true }); ok('explicit non-admin claim does not leak the owner fallback', e.call({ email: 'owner@example.com', emailVerified: false }) === false, e.call({ email: 'owner@example.com', emailVerified: false })); }
}
{
  // Any file that still consults the owner e-mail must ALSO require a verified token.
  // (Bootstrap owns the canonical helper; the ads delivery controller keeps a defensive
  //  copy so it stays correct when the bootstrap import is stubbed or stale.)
  const offenders = [];
  const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach((d) => {
    const rel = dir + '/' + d.name;
    if (d.isDirectory()) return walk(rel);
    if (!d.name.endsWith('.js')) return;
    const src = read(rel);
    if (!/MY_ADMIN_EMAIL/.test(src)) return;
    if (rel === 'js/app/00-bootstrap.js') return;                       // canonical helper
    // a use is safe only if the same file demands email_verified before trusting the e-mail
    if (!/emailVerified\s*(?:!==|===)\s*true/.test(src)) offenders.push(rel);
  });
  walk('js');
  ok('every owner-e-mail fallback requires a verified token', offenders.length === 0, offenders);
  ok('ads delivery controller keeps its guarded parity copy', /emailVerified\s*!==\s*true/.test(read('js/app/96-ad-delivery-controller.js')), 'missing');
}
{
  // every gate that used to compare the email now routes through the shared helper
  const gates = [
    ['js/app/01-market.js', /skh\.isAdminUser\(/],
    ['js/app/09-feed-announcements.js', /skh\.isAdminUser\(/],
    ['js/app/16-pos-admin-jobs.js', /skh\.isAdminUser\(/],
    ['js/app/96-ad-delivery-controller.js', /skh\.isAdminUser\(/],
    ['js/app/101-marketplace-ads-studio.js', /isAdminUser\(/]
  ];
  for (const [file, re] of gates) {
    const src = read(file);
    ok(`${file} uses the shared admin helper`, re.test(src), 'missing');
  }
  // the 3 POS admin-job gates + the feed gates must all be covered, not just one
  ok('16-pos-admin-jobs.js: all 3 admin gates migrated', (read('js/app/16-pos-admin-jobs.js').match(/skh\.isAdminUser\(/g) || []).length === 3, (read('js/app/16-pos-admin-jobs.js').match(/skh\.isAdminUser\(/g) || []).length);
  ok('09-feed-announcements.js: both feed gates migrated', (read('js/app/09-feed-announcements.js').match(/skh\.isAdminUser\(/g) || []).length === 2, (read('js/app/09-feed-announcements.js').match(/skh\.isAdminUser\(/g) || []).length);
}

/* ==================== C2 — wallet movement contract (balance AND ledger) ==================== */
console.log('C2  group-buy wallet movement: the browser never writes money; only a server movement counts');

const WALLET_SRC = read('js/app/69-chat-groups.js');
const gcoFnSrc = extractFn(WALLET_SRC, 'async function gcoWalletAdd(uid2, delta, kind, orderDocId, note, meta) {');
const ACTION_SRC = extractFn(WALLET_SRC, 'window.skhGChildOrderAction = async function (orderDocId, action, extra) {');

/* mode: 'both' | 'balance-only' | 'ledger-only' | 'none'  (which writes the server accepts) */
function walletEnv({ mode = 'both', ledgerExists = false, balance = 1000, attempts = null } = {}) {
  const writes = [];
  const deny = () => { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; return Promise.reject(e); };
  const accept = (kind) => mode === 'both' || mode === kind + '-only';
  const db = {
    getDocs: async () => ({ empty: !ledgerExists, forEach() {} }),
    getDoc: async () => ({ exists: () => true, data: () => ({ walletBalance: balance }) }),
    updateDoc: async (ref, data) => { writes.push(['update', ref, data]); return accept('balance') ? {} : deny(); },
    setDoc: async (ref, data) => { writes.push(['set', ref, data]); return accept('balance') ? {} : deny(); },
    addDoc: async (ref, data) => { writes.push(['add', ref, data]); return accept('ledger') ? {} : deny(); }
  };
  const w = { skhWalletFailures: [], skhWalletAttempts: attempts || {}, console: { warn() {}, error() {}, log() {} } };
  const skh = {
    db, doc: (d, ...p) => ({ path: p.join('/') }), collection: (d, ...p) => ({ path: p.join('/') }),
    query: () => ({}), where: () => ({}), limit: () => ({}),
    getDocs: db.getDocs, getDoc: db.getDoc, updateDoc: db.updateDoc, setDoc: db.setDoc, addDoc: db.addDoc,
    currentUserData: {}
  };
  w.skh = skh;
  const fn = new Function('skh', 'window', 'uid', 'nowIso', 'console',
    gcoFnSrc + '\nreturn gcoWalletAdd;')(skh, w, () => 'u1', () => '2026-11-24T00:00:00.000Z', w.console);
  return { fn, writes, w, skh };
}

// 1. every write would be accepted -> the browser still writes nothing
{ for (const mode of ['both', 'balance-only', 'ledger-only', 'none']) {
    const e = walletEnv({ mode });
    const r = await e.fn('u1', 500, 'escrow_release', 'O1' + mode, 'n', {});
    ok(`mode ${mode} -> ok:false / server_required / not partial`, r.ok === false && r.reason === 'server_required' && r.partial === false && r.needsServer === true, r);
    ok(`mode ${mode} -> zero writes attempted`, e.writes.length === 0, e.writes);
    ok(`mode ${mode} -> local mirror NOT updated`, e.skh.currentUserData.walletBalance === undefined, e.skh.currentUserData);
    ok(`mode ${mode} -> recorded in skhWalletFailures as server_required`, e.w.skhWalletFailures.length === 1 && e.w.skhWalletFailures[0].reason === 'server_required', e.w.skhWalletFailures);
    ok(`mode ${mode} -> no attempt marker (nothing half-done)`, Object.keys(e.w.skhWalletAttempts).length === 0, e.w.skhWalletAttempts); } }

// 5. idempotency: the SERVER already moved the money (ledger row) -> already, no write
{ const e = walletEnv({ mode: 'both', ledgerExists: true });
  const r = await e.fn('u1', 500, 'escrow_release', 'O5', 'n', {});
  ok('server movement exists -> already:true, no new writes', r.ok === true && r.already === true && e.writes.length === 0, { r, writes: e.writes }); }

// 6. a remembered partial (from an older build in this tab) is still refused
{ const attempts = { 'u1|escrow_release|O6': { balanceWritten: true, ledgerWritten: false } };
  const e = walletEnv({ mode: 'both', attempts });
  const r = await e.fn('u1', 500, 'escrow_release', 'O6', 'n', {});
  ok('old partial marker -> refused, needs_reconciliation', r.ok === false && r.reason === 'needs_reconciliation' && r.needsServer === true, r);
  ok('old partial marker -> no writes attempted', e.writes.length === 0, e.writes); }

// 7. call sites must not continue when the movement did not complete
function actionEnv({ walletMode = 'both', feeMode = null, order = {}, balance = 100000, serverDone = false, feeServerDone = serverDone } = {}) {
  const writes = [];
  const deny = () => { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; return Promise.reject(e); };
  const orderRef = { path: 'orders/' + (order.id || 'ORD1') };
  const skh = {
    db: {}, doc: (d, ...p) => ({ path: p.join('/') }), collection: (d, ...p) => ({ path: p.join('/') }),
    query: () => ({}), where: () => ({}), limit: () => ({}),
    getDoc: async () => ({ exists: () => true, data: () => ({ walletBalance: balance }) }),
    getDocs: async () => ({ empty: true, forEach() {} }),
    updateDoc: async (ref, data) => { writes.push([ref.path, data]); return {}; },
    addDoc: async (ref, data) => { writes.push([ref.path, data]); return {}; },
    setDoc: async () => ({}), getUserCard: async () => ({ exists: () => false }),
    currentUserData: {}
  };
  const w = { skh, skhWalletFailures: [], skhWalletAttempts: {}, console: { warn() {}, error() {}, log() {} } };
  const inner = walletEnv({ mode: walletMode, balance, ledgerExists: serverDone });   // the REAL gcoWalletAdd
  const walletStub = async (uid2, delta, kind, orderDocId, note, meta) => {
    if (feeMode && kind === 'escrow_fee') {                        // different politeness for the fee leg
      const e2 = walletEnv({ mode: feeMode, balance, ledgerExists: feeServerDone });
      return e2.fn(uid2, delta, kind, orderDocId, note, meta);
    }
    return inner.fn(uid2, delta, kind, orderDocId, note, meta);
  };
  const d = Object.assign({
    kind: 'GROUP_CHILD_ORDER', status: 'payment_pending', groupId: 'g1', humanId: 'H-1',
    buyerId: 'u1', sellerId: 'seller1', amount: 20000, escrowStatus: 'held', id: 'ORD1'
  }, order);
  skh.doc = (db, ...p) => {
    const path = p.join('/');
    if (path.indexOf('orders/') === 0) return { path, exists: () => true, data: () => d };
    return { path };
  };
  skh.getDoc = async (ref) => {
    const path = String((ref && ref.path) || '');
    if (path.indexOf('users/') === 0) return { exists: () => true, data: () => ({ walletBalance: balance }) };
    if (path.indexOf('chatGroups/') === 0) return { exists: () => true, data: () => ({}) };
    return { exists: () => true, data: () => d };
  };
  // the shipped helper that turns a failed movement into the honest action result
  const failFnSrc = extractFn(WALLET_SRC, 'function gcoWalletFail(code, r) {');
  const fn = new Function('skh', 'window', 'uid', 'nowIso', 'goActiveMember', 'canOrganize', 'GCO_FEE', 'gcoWalletAdd', 'gcoWalletFail', 'logEvent',
    ACTION_SRC + '\nreturn window.skhGChildOrderAction;')(
    skh, w, () => 'u1', () => '2026-11-24T00:00:00.000Z',
    async () => ({ role: 'admin' }), () => true, 0.015, walletStub,
    new Function('return ' + failFnSrc)(), async () => {});
  return { fn, writes, orderRef, d };
}

// pay: movement fails -> order must NOT become 'secured'
{ const e = actionEnv({ walletMode: 'none', order: { status: 'payment_pending', escrowStatus: null } });
  const r = await e.fn('ORD1', 'pay', {});
  ok('pay with refused wallet -> ok:false hold_failed', r.ok === false && r.reason === 'hold_failed', r);
  ok('pay with refused wallet -> order NOT marked secured/held', !e.writes.some(([p, d2]) => p.indexOf('orders/') === 0 && d2 && (d2.status === 'secured' || d2.escrowStatus === 'held')), e.writes); }
// pay: even if every write were allowed, the browser does not take the money itself
{ const e = actionEnv({ walletMode: 'both', order: { status: 'payment_pending', escrowStatus: null } });
  const r = await e.fn('ORD1', 'pay', {});
  ok('pay without a server movement -> ok:false hold_failed / server_required', r.ok === false && r.reason === 'hold_failed', r);
  ok('pay without a server movement -> order untouched', !e.writes.some(([p]) => p.indexOf('orders/') === 0), e.writes); }
// pay: the server already held the money -> the order state follows (feature preserved)
{ const e = actionEnv({ walletMode: 'both', serverDone: true, order: { status: 'payment_pending', escrowStatus: null } });
  const r = await e.fn('ORD1', 'pay', {});
  ok('pay after the server movement -> marks secured/held (feature preserved)', r.ok === true && e.writes.some(([p, d2]) => p.indexOf('orders/') === 0 && d2 && d2.escrowStatus === 'held'), { r, writes: e.writes.map(x => x[0]) }); }
// confirm_received: release ok but fee fails -> NOT released
{ const e = actionEnv({ walletMode: 'both', serverDone: true, feeServerDone: false, feeMode: 'none', order: { status: 'delivered', escrowStatus: 'held' } });
  const r = await e.fn('ORD1', 'confirm_received', {});
  ok('release done by server + fee not done -> ok:false fee_failed (partial settlement not claimed)', r.ok === false && r.reason === 'fee_failed', r);
  ok('release ok + fee fails -> order NOT marked released', !e.writes.some(([p, d2]) => p.indexOf('orders/') === 0 && d2 && (d2.escrowStatus === 'released' || d2.paymentStatus === 'released')), e.writes); }
// confirm_received: everything completes
{ const e = actionEnv({ walletMode: 'both', serverDone: true, order: { status: 'delivered', escrowStatus: 'held' } });
  const r = await e.fn('ORD1', 'confirm_received', {});
  ok('release + fee done by the server -> order marked released', r.ok === true && e.writes.some(([p, d2]) => p.indexOf('orders/') === 0 && d2 && d2.escrowStatus === 'released'), r); }
// reject_order: refund fails -> not rejected/refunded
{ const e = actionEnv({ walletMode: 'none', order: { status: 'secured', escrowStatus: 'held', sellerId: 'u1', buyerId: 'buyer1' } });
  const r = await e.fn('ORD1', 'reject_order', {});
  ok('refund fails -> ok:false refund_failed', r.ok === false && r.reason === 'refund_failed', r);
  ok('refund fails -> order NOT marked refunded', !e.writes.some(([p, d2]) => p.indexOf('orders/') === 0 && d2 && d2.escrowStatus === 'refunded'), e.writes); }

/* ==================== C2b — settlement must not lie about paying ==================== */
console.log('C2b group-order settlement only completes when every movement completed');
{
  const src74 = read('js/app/74-group-order-system.js');
  const settleSrc = extractFn(src74, 'async function settlementRelease(gid, goid, packageId) {');
  const autoSrc = extractFn(src74, 'async function autoReleaseCheck(gid, goid) {');
  const deny = () => { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; return Promise.reject(e); };
  /* mode: 'both' | 'balance-only' | 'ledger-only' | 'none' applied to users/* movements */
  const settleEnv = ({ mode = 'both', shipment = null } = {}) => {
    const writes = [];
    const isUsers = (p) => p.indexOf('users/') === 0;
    const skh = {
      db: {},
      doc: (db, ...p) => ({ path: p.join('/') }),
      collection: (db, ...p) => ({ path: p.join('/') }),
      getDoc: async (ref) => {
        const p = String((ref && ref.path) || '');
        if (p.indexOf('packages') !== -1) return { exists: () => true, data: () => Object.assign({ qty: 2, shipmentId: shipment ? 'sh1' : null }, {}) };
        if (p.indexOf('shipments') !== -1) return { exists: () => true, data: () => shipment || {} };
        if (p.indexOf('packages') === -1 && /groupOrders\/[^/]+$/.test(p)) return { exists: () => true, data: () => ({ targetPrice: 10000, organizerId: 'seller1', productSnapshot: { sellerId: 'seller1' } }) };
        return { exists: () => true, data: () => ({ walletBalance: 0 }) };
      },
      updateDoc: async (ref, data) => {
        const p = String((ref && ref.path) || ''); writes.push([p, data]);
        if (isUsers(p) && !(mode === 'both' || mode === 'balance-only')) return deny();
        return {};
      },
      setDoc: async (ref, data) => { writes.push([String((ref && ref.path) || ''), data]); return {}; },
      addDoc: async (ref, data) => {
        const p = String((ref && ref.path) || ''); writes.push([p, data]);
        if (p === 'wallet_ledger' && !(mode === 'both' || mode === 'ledger-only')) return deny();
        return {};
      }
    };
    const warns = [];
    const win = { console: { warn: (...a) => warns.push(a.join(' ')), log() {} } };
    const fn = new Function('skh', 'window', 'nowIso', 'uid', 'goRef', 'logAudit', 'console',
      settleSrc + '\nreturn settlementRelease;')(
      skh, win, () => '2026-11-24T00:00:00.000Z', () => 'u1',
      (gid, goid) => ({ path: 'chatGroups/' + gid + '/groupOrders/' + goid }), async () => {}, win.console);
    return { fn, writes, warns };
  };
  const markedReleased = (writes) => writes.some(([p, d]) => p.indexOf('packages') !== -1 && d && d.settlementReleased === true);

  /* [MODULE 1 2026-11-27] whatever the server would accept, the browser settlement writes no money
   * and never marks a package settled; the server (or a reconciliation) owns settlement. */
  for (const mode of ['both', 'balance-only', 'ledger-only', 'none']) {
    const e = settleEnv({ mode, shipment: { transporterId: 'tr1', transportFee: 2000 } }); const r = await e.fn('g1', 'go1', 'pkg-' + mode);
    ok(`settlement mode ${mode} -> ok:false server_required`, r.ok === false && r.reason === 'server_required', r);
    ok(`settlement mode ${mode} -> no seller/transporter balance write, no wallet_ledger row`, !e.writes.some(([p]) => p.indexOf('users/') === 0 || p === 'wallet_ledger'), e.writes.map(w => w[0]));
    ok(`settlement mode ${mode} -> package stays PENDING`, !markedReleased(e.writes), e.writes.map(w => w[0])); }
  /* --- auto-release must not count a partial settlement --- */
  const autoEnv = (settleResult) => {
    const writes = [];
    const skh = {
      db: {}, doc: (db, ...p) => ({ path: p.join('/') }), collection: (db, ...p) => ({ path: p.join('/') }),
      getDocs: async () => ({ forEach: (cb) => cb({ id: 'pkg1', data: () => ({ packageId: 'pkg1', status: 'DELIVERED', participantId: 'buyer1', confirmationDeadline: new Date(Date.now() - 60000).toISOString() }) }) }),
      getDoc: async () => ({ exists: () => false }),
      updateDoc: async (ref, data) => { writes.push([String((ref && ref.path) || ''), data]); return {}; }
    };
    const win = { console: { warn() {}, log() {} } };
    const fn = new Function('skh', 'window', 'nowIso', 'uid', 'pkgCol', 'PACKAGE_STATUS', 'DELIVERY_STATUS', 'PARTICIPANT_STATE',
      'ensureParticipantDoc', 'settlementRelease', 'logAudit', 'console',
      autoSrc + '\nreturn autoReleaseCheck;')(
      skh, win, () => '2026-11-24T00:00:00.000Z', () => 'u1',
      () => ({}), { DELIVERED: 'DELIVERED', CONFIRMED: 'CONFIRMED' }, { AUTO_RELEASED: 'AUTO_RELEASED' }, { COMPLETED: 'COMPLETED' },
      async () => {}, async () => settleResult, async () => {}, win.console);
    return { fn, writes };
  };
  { const e = autoEnv({ ok: false, reason: 'partial_write', partial: true, needsReconciliation: true });
    const r = await e.fn('g1', 'go1');
    ok('auto-release: partial settlement -> count stays 0', r.released.length === 0 && r.count === 0, r);
    ok('auto-release: partial settlement -> no releaseTransactionId written', !e.writes.some(([p, d]) => p.indexOf('packages') !== -1 && d && d.releaseTransactionId), e.writes.map(w => w[0]));
    ok('auto-release: partial settlement -> participant NOT marked COMPLETED', !e.writes.some(([p, d]) => p.indexOf('participants') !== -1 && d && d.state === 'COMPLETED'), e.writes.map(w => w[0])); }
  { const e = autoEnv({ ok: true });
    const r = await e.fn('g1', 'go1');
    ok('auto-release: completed settlement -> counted and marked (feature preserved)', r.released.length === 1 && e.writes.some(([p, d]) => p.indexOf('packages') !== -1 && d && d.releaseTransactionId), { r, writes: e.writes.map(w => w[0]) }); }
}

/* ============================ C3 — private documents never public ============================ */
console.log('C3  private document uploads require a signed upload');
{
  const env = ({ user, sign, folder }) => {
    const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://sokohai.example/' });
    const w = dom.window; const posted = [];
    w.fetch = async (url, o) => { const f = {}; for (const [k, v] of o.body.entries()) if (typeof v === 'string') f[k] = v; posted.push({ url, f }); return { json: async () => ({ secure_url: 'https://res.cloudinary.com/x/image/upload/ok.jpg' }) }; };
    const u = user ? { uid: 'u1', getIdToken: async () => 't' } : null;
    w.skh = { currentUser: u, wrapCallable: () => async () => { const r = sign(); if (r instanceof Error) throw r; return { data: r }; } };
    w.eval(fs.readFileSync(path.join(ROOT, 'js/11-uploads.js'), 'utf8'));
    w.skhCompressImageFile = async (f) => f;
    return { w, posted };
  };
  const err = (code) => Object.assign(new Error(code), { code: 'functions/' + code });
  const file = (w) => new w.File(['x'], 'p.jpg', { type: 'image/jpeg' });
  for (const f of ['identity', 'kyc', 'verification', 'documents', 'Identity']) {
    const e = env({ user: true, sign: () => ({ ok: true, mode: 'unsigned' }), folder: f });
    const r = await e.w.skhUploadFromFile(file(e.w), { folder: f });
    ok(`server says unsigned + folder "${f}" -> refused, nothing uploaded`, !r && e.posted.length === 0 && e.w.skhUploadLastError.code === 'signed_upload_required', { r, p: e.posted, le: e.w.skhUploadLastError });
  }
  { const e = env({ user: true, sign: () => err('unavailable') });
    const r = await e.w.skhUploadFromFile(file(e.w), { folder: 'kyc' });
    ok('private folder + signing unreachable -> refused', !r && e.posted.length === 0, e.posted); }
  { const e = env({ user: true, sign: () => ({ ok: true, mode: 'signed', cloudName: 'c', apiKey: 'k', timestamp: 1, signature: 's', folder: 'sokohai/identity/u1', uploadPreset: 'p', type: 'authenticated' }) });
    const r = await e.w.skhUploadFromFile(file(e.w), { folder: 'identity' });
    ok('identity + real signed upload still works (feature preserved)', !!r && e.posted[0].f.signature === 's' && e.posted[0].f.type === 'authenticated', e.posted); }
  /* path variations must not slip past the sensitive-folder gate (explicit list) */
  for (const f of ['identity/photos', 'sokohai/identity', 'Identity/', ' identity ', 'kyc/docs', 'IDENTITY\\scan',
                   '%69dentity', 'sokohai/kyc/2026', 'private', 'documents/id', 'nida']) {
    const e = env({ user: true, sign: () => ({ ok: true, mode: 'unsigned' }), folder: f });
    const r = await e.w.skhUploadFromFile(file(e.w), { folder: f });
    ok(`path variation "${f}" -> refused, nothing uploaded`, !r && e.posted.length === 0 && e.w.skhUploadLastError.code === 'signed_upload_required', { f, r, le: e.w.skhUploadLastError });
  }
  /* ordinary folders must keep working (products / avatars / ads) */
  for (const f of ['products', 'sokohai/products/u1', 'avatars', 'ads/creative', 'uploads/market']) {
    const e = env({ user: true, sign: () => ({ ok: true, mode: 'unsigned' }), folder: f });
    const r = await e.w.skhUploadFromFile(file(e.w), { folder: f });
    ok(`ordinary folder "${f}" still uploads (no regression)`, !!r && e.posted.length === 1, { f, posted: e.posted.length });
  }
  /* the normaliser itself, called directly */
  { const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://sokohai.example/' });
    const w = dom.window; w.skh = { currentUser: null }; w.eval(fs.readFileSync(path.join(ROOT, 'js/11-uploads.js'), 'utf8'));
    const cases = [['identity', true], ['KYC', true], ['a/b/Identity/c', true], ['', false], ['products', false], ['sokohai/products', false], ['identityx', false], ['kyc-products', false]];
    const bad = cases.filter(([input, want]) => w.skhUploadIsSensitiveFolder(input) !== want);
    ok('skhUploadIsSensitiveFolder normalises paths correctly (segment match, not prefix)', bad.length === 0, bad); }

  { const e = env({ user: true, sign: () => ({ ok: true, mode: 'unsigned' }) });
    const r = await e.w.skhUploadFromFile(file(e.w), { folder: 'products' });
    ok('ordinary folder keeps transition-mode unsigned upload (no regression)', !!r && e.posted[0].f.upload_preset === 'Sokohai_preset', e.posted); }
  { const e = env({ user: true, sign: () => ({ ok: true, mode: 'unsigned' }) });
    const r = await e.w.skhUploadFromFile(file(e.w), {});
    ok('no folder at all -> unchanged behaviour', !!r && e.posted.length === 1, e.posted); }
}

console.log(`\nCLIENT SECURITY PART 2: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
