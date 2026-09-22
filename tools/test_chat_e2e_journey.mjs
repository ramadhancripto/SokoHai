/* ============================================================
 * SOKOHAI — E2E JOURNEY: inbox → open → send → negotiate →
 * counter → accept → group create → group send (jsdom +
 * in-memory Firestore mock). Moduli HALISI: 37, 34, 38, 69, 39.
 * Endesha: node tools/test_chat_e2e_journey.mjs
 * ============================================================ */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

// --- DOM: fragment halisi ya chat modals ---
const fragment = fs.readFileSync(path.join(ROOT, 'html/06-modals-social.html'), 'utf8');
const dom = new JSDOM('<!doctype html><html><head></head><body>' + fragment + '</body></html>',
  { url: 'http://localhost/', runScripts: 'dangerously' });
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.navigator = window.navigator;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tick = (n = 5) => new Promise((r) => { const f = () => (n-- <= 0 ? r() : setTimeout(f, 0)); f(); });

// --- In-memory Firestore ---
const store = new Map(); // fullPath -> data
let autoId = 0;
const nid = () => 'mockid' + (++autoId) + Date.now().toString(36);
const samePath = (a, b) => a === b;
function getNested(o, p) {
  return String(p).split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
}
function setNested(o, p, v) {
  const ks = String(p).split('.');
  let t = o;
  for (let i = 0; i < ks.length - 1; i++) { if (typeof t[ks[i]] !== 'object' || t[ks[i]] === null) t[ks[i]] = {}; t = t[ks[i]]; }
  if (v && v._skhDel) delete t[ks[ks.length - 1]]; else t[ks[ks.length - 1]] = v;
}
function matchWhere(data, w) {
  const v = getNested(data, w[0]);
  if (w[1] === '==') return v === w[2];
  if (w[1] === 'array-contains') return Array.isArray(v) && v.includes(w[2]);
  if (w[1] === 'in') return Array.isArray(w[2]) && w[2].includes(v);
  if (w[1] === '>=') return v >= w[2];
  if (w[1] === '<=') return v <= w[2];
  return true;
}
function snapFor(colPath, q) {
  let docs = [];
  for (const [p, d] of store.entries()) {
    if (!p.startsWith(colPath + '/')) continue;
    if (p.slice(colPath.length + 1).includes('/')) continue; // direct children only
    docs.push({ id: p.split('/').pop(), _d: d });
  }
  const ws = (q && q._w) || [];
  docs = docs.filter((x) => ws.every((w) => matchWhere(x._d, w)));
  for (const ob of ((q && q._ob) || [])) {
    docs.sort((a, b) => {
      const av = getNested(a._d, ob[0]), bv = getNested(b._d, ob[0]);
      if (av == bv) return 0;
      const c = av > bv ? 1 : -1;
      return ob[1] === 'desc' ? -c : c;
    });
  }
  if (q && q._lim != null) docs = docs.slice(0, q._lim);
  const out = docs.map((x) => ({ id: x.id, exists: () => true, data: () => JSON.parse(JSON.stringify(x._d)) }));
  out.forEach = Array.prototype.forEach.bind(out);
  return { docs: out, size: out.length, empty: out.length === 0, forEach: (fn) => out.forEach(fn) };
}
const listeners = [];
// Firestore semantics: listener fires ONLY when ITS data actually changes.
function docSnap(p) {
  const d = store.get(p);
  return d === undefined ? { exists: () => false, data: () => null, id: p.split('/').pop() }
    : { exists: () => true, id: p.split('/').pop(), data: () => JSON.parse(JSON.stringify(d)) };
}
function snapKeyDoc(p) { const d = store.get(p); return d === undefined ? '∅' : JSON.stringify(d); }
function snapKeyQuery(path, q) {
  const s = snapFor(path, q);
  return JSON.stringify(s.docs.map((d) => [d.id, d.data()]));
}
function fireListeners(changedPath) {
  for (const L of listeners) {
    try {
      if (L.isDoc) {
        if (L.path !== changedPath) continue;
        const k = snapKeyDoc(L.path);
        if (k === L.last) continue;
        L.last = k;
        L.cb(docSnap(L.path));
      } else {
        // query listener: refire only if a doc in/near its collection changed AND result differs
        if (!changedPath.startsWith(L.path + '/')) continue;
        const k = snapKeyQuery(L.path, L.q);
        if (k === L.last) continue;
        L.last = k;
        L.cb(snapFor(L.path, L.q));
      }
    } catch (e) {}
  }
}
const skh = {
  db: {}, fApp: {},
  currentUser: { uid: 'buyer_1', displayName: 'Buyer', email: 'b@t.co' },
  currentUserData: { fullName: 'Buyer One' },
  requireAuth: () => !!(skh.currentUser && skh.currentUser.uid),
  localStorage: window.localStorage, sessionStorage: window.sessionStorage,
  skhEscape: esc, skhJsEsc: esc,
  T: (k, f) => f,
  collection: (db, ...segs) => ({ _path: segs.join('/') }),
  doc: (db, ...segs) => ({ _path: segs.join('/') }),
  query: (col, ...cs) => {
    const q = { _col: col, _w: [], _ob: [], _lim: null };
    for (const c of cs) {
      if (c && c._w) q._w.push(c._w);
      else if (c && c._ob) q._ob.push(c._ob);
      else if (c && c._lim != null) q._lim = c._lim;
    }
    return q;
  },
  where: (f, op, v) => ({ _w: [f, op, v] }),
  orderBy: (f, d) => ({ _ob: [f, d] }),
  limit: (n) => ({ _lim: n }),
  getDocs: async (q) => snapFor(q._col._path, q),
  getDoc: async (ref) => {
    const d = store.get(ref._path);
    return d === undefined
      ? { exists: () => false, data: () => null, id: ref._path.split('/').pop() }
      : { exists: () => true, id: ref._path.split('/').pop(), data: () => JSON.parse(JSON.stringify(d)) };
  },
  addDoc: async (col, data) => {
    const id = nid();
    const p = col._path + '/' + id;
    store.set(p, JSON.parse(JSON.stringify(data)));
    fireListeners(p);
    return { id };
  },
  setDoc: async (ref, data, opts) => {
    const prev = store.get(ref._path) || {};
    const cp = JSON.parse(JSON.stringify(data));
    store.set(ref._path, (opts && opts.merge) ? Object.assign({}, prev, cp) : cp);
    fireListeners(ref._path);
  },
  updateDoc: async (ref, patch) => {
    const prev = JSON.parse(JSON.stringify(store.get(ref._path) || {}));
    for (const [k, v] of Object.entries(patch)) {
      if (v && v._skhArrUnion) {
        const arr = getNested(prev, k) || [];
        arr.push(v._skhArrUnion);
        setNested(prev, k, arr);
      } else setNested(prev, k, v);
    }
    store.set(ref._path, prev);
    fireListeners(ref._path);
  },
  deleteDoc: async (ref) => { store.delete(ref._path); fireListeners(ref._path); },
  runTransaction: async (db, fn) => {
    const tx = {
      get: (ref) => skh.getDoc(ref),
      update: (ref, patch) => skh.updateDoc(ref, patch),
      set: (ref, data) => skh.setDoc(ref, data),
    };
    return fn(tx);
  },
  deleteField: () => ({ _skhDel: true }),
  arrayUnion: (v) => ({ _skhArrUnion: v }),
  serverTimestamp: () => new Date().toISOString(),
  onSnapshot: (refOrQ, cb) => {
    const isDoc = !!(refOrQ._path && !refOrQ._col);
    const L = isDoc ? { isDoc: true, path: refOrQ._path, cb }
      : { isDoc: false, path: refOrQ._col._path, q: refOrQ, cb };
    L.last = L.isDoc ? snapKeyDoc(L.path) : snapKeyQuery(L.path, L.q);
    listeners.push(L);
    try { if (L.isDoc) cb(docSnap(L.path)); else cb(snapFor(L.path, L.q)); } catch (e) {}
    return () => { const i = listeners.indexOf(L); if (i >= 0) listeners.splice(i, 1); };
  },
  wrapCallable: null, httpsCallable: null, getFunctions: () => ({}),
};
window.skh = skh;
window.T = (k, f) => f;
window.skhToast = () => {};
window.sokohaiToast = () => {};
window.skhNavIcon = (n) => `<svg data-ic="${n}"></svg>`;
window.alert = () => {};
globalThis.alert = window.alert;
window.confirm = () => true;
globalThis.confirm = window.confirm;
window.customPrompt = (t, h, cb) => cb && cb('');
window.closeModals = () => {};
window.skhChatTogglePlusMenu = () => {};
skh._noChatThrottle = true;

async function loadApp(rel, outName, logicRewrite) {
  const SRC = process.env.E2E_SRC || ROOT;
  let src = fs.readFileSync(path.join(SRC, rel), 'utf8')
    .replace("import { skh } from './00-bootstrap.js';", 'const skh = window.skh;')
    .replace("import { skh as _skh } from './00-bootstrap.js';", 'const _skh = window.skh;');
  if (logicRewrite) {
    for (const [from, to] of logicRewrite) src = src.split(from).join(to);
  }
  const tmp = path.join(ROOT, 'js/app', outName);
  fs.writeFileSync(tmp, src);
  await import('file://' + tmp + '?t=' + Date.now() + Math.random());
  fs.unlinkSync(tmp);
}
const logicURL = (f) => 'file://' + path.join(ROOT, 'js/app', f);
await loadApp('js/app/37-negotiation.js', '_tmp_e2e_eng.mjs');
await loadApp('js/app/34-chat-core.js', '_tmp_e2e_chat.mjs');
await loadApp('js/app/38-negotiation-form.js', '_tmp_e2e_form.mjs', [['./38-nego-form-logic.js', logicURL('38-nego-form-logic.js')]]);
await loadApp('js/app/69-chat-groups.js', '_tmp_e2e_grp.mjs');
await loadApp('js/app/39-product-showcase.js', '_tmp_e2e_ps.mjs', [['./39-showcase-logic.js', logicURL('39-showcase-logic.js')]]);
// Meneja halisi wa LIFO lazima ajue dynamic negotiation shell.
await import('file://' + path.join(ROOT, 'js/94-modal-stack.js') + '?t=' + Date.now());

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n); } };
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const msgsIn = (convId) => [...store.entries()].filter(([p]) => p.startsWith(`conversations/${convId}/messages/`));

console.log('\n[J1] INBOX tupu + reload');
{
  await window.skhChatReloadInbox();
  await tick();
  ok('inbox list ipo', !!$('#inboxList'));
}

console.log('\n[J2] Fungua chat kutoka bidhaa (startChat → conv + ujumbe wa bidhaa)');
let convId = null;
{
  // Safari halisi: mtumiaji yuko kwenye ukurasa wa bidhaa → startChat (34) → skhChatOpen.
  skh.currentOpenProduct = { id: 'p_101', title: 'Kiatu cha Ngozi', price: 45000, image: 'http://img/x.jpg', userId: 'seller_2', collectionName: 'products', ownerName: 'Shoe Shop', userEmail: 's@t.co' };
  skh.activeChatProduct = null;
  await window.startChat();
  await tick(10);
  convId = skh.chatCore && skh.chatCore.convId;
  ok('convId imeundwa', !!convId);
  ok('conv doc ipo store', convId && store.has('conversations/' + convId));
  const cm = $('#chatModal');
  ok('chatModal inaonekana', !!cm && cm.style.display !== 'none');
  ok('jina la partner limeandikwa', ($('#chatWith') || {}).textContent === 'Shoe Shop');
  // startChat hai-tumi auto — hu-prefill input + huweka context (mtumiaji hubonyeza send).
  ok('input ime-prefill na salamu ya bidhaa', /nimevutiwa na bidhaa hii: Kiatu/.test(($('#chatInput') || {}).value || ''));
  ok('context ya bidhaa imewekwa', !!(skh.activeChatProduct && skh.activeChatProduct.id === 'p_101'));
  // Mtumiaji hutuma salamu → inakuwa ujumbe wa type=product wenye snapshot.
  const p2 = window.sendMessage();
  await p2; await tick(10);
  const ms = convId ? msgsIn(convId) : [];
  ok('salamu iliyotumwa ni type=product + snapshot', ms.some(([pp, d]) => d.type === 'product' && d.productSnapshot && d.productSnapshot.title === 'Kiatu cha Ngozi'));
}

console.log('\n[J3] Tuma ujumbe — optimistic + reconcile bila duplicate');
{
  const before = msgsIn(convId).length;
  $('#chatInput').value = 'Hujambo, bado inapatikana?';
  const p = window.sendMessage();
  const instant = ($('#chatMessages') || {}).textContent || '';
  ok('bubble ya papo hapo (optimistic)', instant.includes('Hujambo, bado inapatikana?'));
  await p; await tick(10);
  const after = msgsIn(convId);
  const mine = after.filter(([pp, d]) => d.text === 'Hujambo, bado inapatikana?');
  ok('ujumbe mmoja tu umehifadhiwa (hakuna dup)', mine.length === 1);
  ok('hakuna bubble iliyokwama pending/failed', !/Jaribu Tena/.test(($('#chatMessages') || {}).textContent || ''));
}

console.log('\n[J4] Toa Ofa kutoka chat — fomu inafunguka NDANI ya chat');
let negoId = null;
{
  // Rudia conflict halisi: repair layer iliinua Chat juu ya z-index ya form.
  // jsdom haipakii CSS ya index, hivyo weka properties zilezile hapa.
  $('#chatModal').style.position = 'fixed';
  $('#chatModal').style.setProperty('z-index', '100010', 'important');
  const nfCss = document.createElement('style');
  nfCss.textContent = '.nf-shell{position:fixed;z-index:9000}';
  document.head.appendChild(nfCss);
  window.skhChatStartNego('product');
  await tick(10);
  ok('fomu (nfShell) imefunguka', !!$('#nfShell'));
  ok('chatModal bado wazi (fomu ndani ya chat)', ($('#chatModal') || {}).style.display !== 'none');
  ok('fomu iko JUU ya Chat iliyoinuliwa', Number(window.getComputedStyle($('#nfShell')).zIndex) > Number(window.getComputedStyle($('#chatModal')).zIndex));
  ok('product ina quantity na proposed price', !!$('#nf_quantity') && !!$('#nf_unitPrice'));
  ok('product HAINA schema ya service/transport', !$('#nf_scope') && !$('#nf_fee') && !$('#nf_pickupDate'));
  // Jaza fields zote required kwa heuristics
  $$('#nfShell [data-k]').forEach((el) => {
    const k = (el.getAttribute('data-k') || '').toLowerCase();
    const tag = el.tagName;
    if (tag === 'SELECT') { if (el.options.length > 1) el.selectedIndex = 1; }
    else if (tag === 'TEXTAREA') { el.value = 'Maelezo ya test E2E'; }
    else if (tag === 'INPUT') {
      if (/price|bei|total/.test(k)) el.value = '40000';
      else if (/qty|quantity|idadi|deadlineqty/.test(k)) el.value = '2';
      else if (/date/.test(k)) el.value = '2026-10-01';
      else if (/time/.test(k)) el.value = '10:00';
      else el.value = 'TestE2E';
    }
  });
  $$('#nfShell .nf-chip').forEach((c, i) => { if (i === 0) c.click(); });
  const before = [...store.keys()].filter((k) => k.startsWith('negotiations/')).length;
  $('#nfSendBtn').click();
  await tick(30);
  const negos = [...store.entries()].filter(([p]) => p.startsWith('negotiations/'));
  ok('negotiation imeundwa', negos.length === before + 1);
  if (negos.length) {
    negoId = negos[negos.length - 1][0].split('/').pop();
    const nd = negos[negos.length - 1][1];
    ok('version=1 + OFFER_SENT + buyer sahihi', nd.version === 1 && nd.currentState === 'OFFER_SENT' && nd.buyerId === 'buyer_1');
    ok('fomu imefungwa baada ya kutuma', !$('#nfShell'));
    const nmsgs = msgsIn(convId).filter(([pp, d]) => d.type === 'negotiation');
    ok('ujumbe wa negotiation umeingia chat', nmsgs.length >= 1);
  }
}

console.log('\n[J5] Muuzaji: counter → mnunuzi: accept (native path, bila functions)');
{
  skh.currentUser = { uid: 'seller_2', displayName: 'Shoe Shop', email: 's@t.co' };
  // Fungua counter modal kupitia amri (inahitaji data zaidi → modal)
  await window.skhNegoCommand('COUNTER_OFFER', { negotiationId: negoId, _direct: true, price: 42000, quantity: 2 });
  await tick(20);
  const nd1 = store.get('negotiations/' + negoId) || {};
  ok('counter: COUNTER_OFFER + version 2', nd1.currentState === 'COUNTER_OFFER' && nd1.version === 2);
  skh.currentUser = { uid: 'buyer_1', displayName: 'Buyer', email: 'b@t.co' };
  await window.skhNegoCommand('ACCEPT_OFFER', { negotiationId: negoId, _direct: true });
  await tick(20);
  const nd2 = store.get('negotiations/' + negoId) || {};
  ok('accept: AGREEMENT + version 3', nd2.currentState === 'AGREEMENT' && nd2.version === 3);
}

console.log('\n[J6] Group: create → send → order');
let gidE2E = null;
{
  skh.currentUser = { uid: 'buyer_1', displayName: 'Buyer', email: 'b@t.co' };
  const g = await window.skhGroupCreate({ name: 'Kikundi Test E2E' });
  gidE2E = g && g.id;
  await tick(5);
  ok('group imeundwa', !!(g && g.id));
  const gid = g && g.id;
  ok('chatGroups doc ipo', gid && store.has('chatGroups/' + gid));
  ok('conv_group_ doc ipo (inbox row)', gid && store.has('conversations/conv_group_' + gid));
  ok('member (owner) doc ipo', gid && store.has(`chatGroups/${gid}/members/buyer_1`));
  await window.skhGroupSendMessage(gid, 'Habari kikundi');
  await tick(5);
  const gm = msgsIn('conv_group_' + gid);
  ok('ujumbe wa group umetumwa', gm.length >= 1 && gm.some(([pp, d]) => d.text === 'Habari kikundi'));
}

console.log('\n[J7] Group order: create → join');
{
  const r = await window.skhGroupOrderCreate(gidE2E, {
    productName: 'Mchele Basmati', targetQty: 10, myQty: 2, targetPrice: 3500,
    deadline: '2026-12-31', deliveryMethod: 'shared', deliveryArea: 'Tegeta',
  });
  ok('group order imeundwa', !!(r && r.ok && r.id));
  const goid = r && r.id;
  ok('groupOrders doc ipo', goid && store.has(`chatGroups/${gidE2E}/groupOrders/${goid}`));
  skh.currentUser = { uid: 'seller_2', displayName: 'Shop', email: 's@t.co' };
  await skh.setDoc(skh.doc(skh.db, `chatGroups/${gidE2E}/members`, 'seller_2'),
    { userId: 'seller_2', role: 'member', status: 'active', joinedAt: new Date().toISOString() });
  const j = await window.skhGroupOrderJoin(gidE2E, goid, 3);
  ok('mwanachama amejiunga na order', !!(j && j.ok));
  skh.currentUser = { uid: 'buyer_1', displayName: 'Buyer', email: 'b@t.co' };
}

console.log('\n[J8] 39: skhChatNegotiate — await open halisi + fomu ndani ya chat (NEGO-FIX)');
{
  // Historia ya conversation hiyo hiyo ina service mpya zaidi; isiibe product flow.
  await skh.setDoc(skh.doc(skh.db, 'negotiations', 'nego_old_service'), {
    negotiationId: 'nego_old_service', conversationId: convId, commerceType: 'service',
    serviceId: 'svc_old', productId: 'svc_old', sellerId: 'seller_2', buyerId: 'buyer_1',
    currentState: 'OFFER_SENT', currentUnitPrice: 99999, updatedAt: '2099-01-01T00:00:00.000Z'
  });
  skh.currentOpenProduct = { id: 'p_101', title: 'Kiatu cha Ngozi', price: 45000, userId: 'seller_2', collectionName: 'products', ownerName: 'Shoe Shop', userEmail: 's@t.co' };
  await window.skhChatNegotiate('product');
  await tick(10);
  ok('fomu imefunguka kupitia negotiate', !!$('#nfShell'));
  ok('chat bado wazi (hakuna fomu ya Home)', ($('#chatModal') || {}).style.display !== 'none');
  ok('muktadha umefungwa kwa product ya sasa', skh.chatCore.activeCommerce && skh.chatCore.activeCommerce.kind === 'product' && skh.chatCore.activeCommerce.id === 'p_101');
  ok('service ya zamani haijachanganywa na product', !skh.negoCurrent || (skh.negoCurrent.commerceType || 'product') === 'product');
  ok('negotiation haijazi/halazimishi greeting ya kawaida', ($('#chatInput') || {}).value === '');
  ok('Toa Ofa inaonyesha price + quantity, si service/transport', !!$('#nf_quantity') && !!$('#nf_unitPrice') && !$('#nf_scope') && !$('#nf_fee'));
  // In-flight guard: wito wa pili mara moja haurudii
  const shells = $$('#nfShell').length;
  await window.skhChatNegotiate('product');
  await tick(5);
  ok('double-call hairudii fomu', $$('#nfShell').length === shells);
}

console.log('\n[J9] Conversation create failure — fail-closed, si listener/send bandia');
{
  const realTx = skh.runTransaction;
  const beforeListeners = listeners.length;
  skh.runTransaction = async () => { throw Object.assign(new Error('Missing or insufficient permissions'), { code: 'permission-denied' }); };
  const out = await window.skhChatOpen('seller_denied', 'Denied Seller', {});
  await tick(5);
  ok('open inarudisha null permission ikikataa create', out === null);
  ok('state ni ERROR, si CONNECTING milele', skh.chatCore && skh.chatCore.state === 'ERROR');
  ok('parent conversation bandia haikuundwa', !store.has('conversations/conv_buyer_1_seller_denied'));
  ok('message listener mpya haikuunganishwa', listeners.length <= beforeListeners && !listeners.some((L) => String(L.path || '').includes('seller_denied')));
  skh.runTransaction = realTx;
}

console.log('\n[J10] Switch partner — old realtime callback haiwezi kuvuja');
{
  await window.skhChatOpen('seller_3', 'Seller Three', {});
  await tick(8);
  const newConv = skh.chatCore && skh.chatCore.convId;
  ok('partner mpya ana canonical conversation yake', newConv === 'conv_buyer_1_seller_3');
  const oldPath = `conversations/${convId}/messages/late_old`;
  store.set(oldPath, { senderId: 'seller_2', type: 'text', text: 'OLD CONVERSATION LEAK', createdAt: new Date().toISOString() });
  fireListeners(oldPath);
  await tick(5);
  const activeTexts = (skh.chatCore.msgs || []).map((m) => m.text || '');
  ok('ujumbe wa conversation ya zamani haujaingia partner mpya', !activeTexts.includes('OLD CONVERSATION LEAK'));
  ok('listener hai imefungwa kwa conversation mpya', skh.chatCore.convId === newConv && skh.chatCore.partnerUid === 'seller_3');
}

console.log(`\nMATOKEO E2E: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
