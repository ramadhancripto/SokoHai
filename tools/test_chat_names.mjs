/* =====================================================================
   test_chat_names.mjs — jina HALISI la mwenzako kwenye kichwa cha chat.

   Hitilafu iliyoripotiwa: ndani ya chat, kichwa kinaonyesha "Mawasiliano"
   badala ya jina la mtu uliyegusa (mf. "Dr Kapama").

   Kila kesi hupimwa kwenye desktop NA simu:
   A) conversation ikiwa na jina kwenye participantMeta
   B) participantMeta tupu + userCards ipo
   C) participantMeta tupu NA userCards tupu (production isiyojazwa) — jina
      linapatikana kutoka tangazo la mtu (products)
   D) row ya ORDER (ilikuwa haipitishi jina kabisa)
   E) jina la jumla ("Mawasiliano") kwenye data — lisiaminiwe
   F) inbox: safu zinaonyesha majina halisi, sio "Mawasiliano" zote

   Matumizi:  source /home/user/pw.sh && node tools/test_chat_names.mjs
   ===================================================================== */
import { chromium } from 'playwright';

const BASE = process.env.SKH_URL || 'http://localhost:8080/';

const SEED = () => {
  const now = Date.now();
  const mk = (id, other, metaObj, extra) => Object.assign({
    id, participants: ['u1', other], type: 'direct', participantMeta: metaObj,
    lastMessage: { type: 'text', text: 'Habari' },
    lastMessageAt: new Date(now - 60000).toISOString(), unread: { u1: 0 }
  }, extra || {});

  const rows = [
    mk('cA', 'xA', { xA: { name: 'Dr Kapama', photo: '', verified: true, role: 'seller' } }),
    mk('cB', 'xB', {}),                                        // userCards itatoa jina
    mk('cC', 'xC', {}),                                        // userCards TUPU -> products
    mk('cD', 'xD', { xD: { name: 'Bi Mushi', role: 'seller' } }, { related: { orderId: 'ORD7788', title: 'Vitanda', status: 'pending' } }),
    mk('cE', 'xE', { xE: { name: 'Mawasiliano', role: 'seller' } })   // jina la jumla kwenye data
  ];

  window.skh.currentUser = { uid: 'u1', email: 'demo@example.test', displayName: 'Mimi' };
  window.skh.currentUserData = { displayName: 'Mimi', role: 'seller' };
  window.__authResolved = true;
  window.skh.requireAuth = () => true;

  // userCards: xA na xB wana kadi; xC, xD, xE HAWANA (kadi hazijajazwa)
  const CARDS = { xA: 'Dr Kapama', xB: 'Neema Charles' };
  window.skh.getUserCard = async (uid) => {
    const name = CARDS[uid];
    if (!name) return { exists: () => false, data: () => null };
    return { exists: () => true, data: () => ({ displayName: name, role: 'seller', photoURL: '' }) };
  };
  window.skh.getDoc = async () => ({ exists: () => false, data: () => null });

  // products: mmiliki wa xC ni "Dr Kapama Mwenyewe"? (tumia jina tofauti ili kuthibitisha chanzo)
  const PRODUCTS = {
    xC: { userId: 'xC', sellerName: 'Juma Mwansasu', title: 'Kiti cha mbao' },
    xD: { userId: 'xD', sellerName: 'Bi Mushi', title: 'Kitanda' },
    xE: { userId: 'xE', ownerName: 'Halima Said', title: 'Sofa' }
  };
  const snapOf = arr => ({
    docs: arr.map(d => ({ id: d.id, data: () => d })), empty: !arr.length, size: arr.length,
    forEach(f) { arr.forEach(d => f({ id: d.id, data: () => d })); }
  });
  window.skh.getDocs = async (q) => {
    // Tumia query kujua collection + where value
    const desc = (q && (q.__skhQuery || q._query)) || {};
    const s = JSON.stringify(q || {});
    if (/products/.test(s)) {
      const hit = Object.keys(PRODUCTS).filter(k => s.indexOf('"' + k + '"') !== -1).map(k => PRODUCTS[k]);
      return snapOf(hit);
    }
    if (/conversations/.test(s)) return snapOf(rows);
    return snapOf([]);
  };
  // query() na collection()/where() za mtihani: hifadhi maelezo kwenye object
  window.skh.collection = (db, name) => ({ __skhQuery: { col: name } });
  window.skh.where = (field, op, val) => ({ __skhQuery: { where: field, op, val } });
  window.skh.limit = (n) => ({ __skhQuery: { limit: n } });
  window.skh.query = (col, ...rest) => {
    const merged = Object.assign({}, col && col.__skhQuery, ...rest.map(r => (r && r.__skhQuery) || {}));
    return { __skhQuery: merged };
  };
  window.skh.onSnapshot = () => () => {};
  return window.openChatList();
};

const H = () => ({
  header: (document.getElementById('chatWith') || {}).textContent || '',
  sub: (document.getElementById('chatSub') || {}).textContent || '',
  core: (window.skh.chatCore && window.skh.chatCore.partnerName) || null
});

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};

const EXPECT = { xA: 'Dr Kapama', xB: 'Neema Charles', xC: 'Juma Mwansasu', xD: 'Bi Mushi', xE: 'Halima Said' };

const b = await chromium.launch({ args: ['--no-sandbox'] });
for (const [tag, vp, mob] of [['desktop', { width: 1280, height: 900 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, isMobile: mob, hasTouch: mob });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 120)));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6500);
  const w = await p.$('button:has-text("ENDELEA NDANI")'); if (w) { try { await w.click({ timeout: 1200 }); } catch (e) {} }
  await p.waitForTimeout(800);
  await p.evaluate(`(${SEED.toString()})()`);
  await p.waitForTimeout(3200);   // ruhusu ujazaji wa majina chinichini

  console.log('\n[' + tag + ' ' + vp.width + 'x' + vp.height + ']');

  // F) inbox yote
  const inboxNames = await p.evaluate(() => [...document.querySelectorAll('#inboxList [data-uid]')]
    .map(r => ({ uid: r.getAttribute('data-uid'), text: (r.textContent || '').replace(/\s+/g, ' ').trim() })));
  ok('inbox inaonyesha majina halisi (hakuna "Mawasiliano")',
    inboxNames.every(r => !/Mawasiliano/i.test(r.text)),
    inboxNames.map(r => r.uid + ':' + r.text.slice(0, 22)).join(' | '));

  for (const uid of Object.keys(EXPECT)) {
    const row = await p.$(`#inboxList [data-uid="${uid}"]`);
    if (!row) { ok('row ya ' + uid + ' ipo', false); continue; }
    await row.click();
    await p.waitForTimeout(2600);
    const h = await p.evaluate(H);
    ok('kichwa = "' + EXPECT[uid] + '" (' + uid + ')',
      h.header.trim() === EXPECT[uid], 'kimepatikana: "' + h.header.trim() + '"');
    ok('jina la chatCore ni halisi (' + uid + ')',
      String(h.core || '').trim() === EXPECT[uid], 'chatCore: "' + h.core + '"');
    if (uid === 'xA') {
      ok('mstari mdogo unaonyesha nafasi (Muuzaji)', /Muuzaji/i.test(h.sub), 'sub: "' + h.sub + '"');
    }
    await p.click('#chatBackBtn');
    await p.waitForTimeout(1400);
  }

  ok('hakuna page error', errs.length === 0, errs.slice(0, 3).join(' | '));
  if (tag === 'mobile') await p.screenshot({ path: 'audit-shots/chat-name-mobile.png' });
  await ctx.close();
}
await b.close();
console.log('\nCHAT NAMES: ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
