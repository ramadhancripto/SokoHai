/* =====================================================================
   test_chat_background.mjs — mandhari ya chat haibadiliki kwenda nyeupe.

   Hitilafu iliyoripotiwa: ukiingia kwenye chat, mandhari ya joto
   (#EFE7DD + madoa laini) inaonekana kwa sekunde moja, kisha inakuwa
   NYEUPE. Chanzo: css/44-chat-compact.css ilikuwa inaandika
   `background-color:#F4F7F6; background-image:none` kwa #chatMessages.

   Kipimo: rangi ya mandhari ya #chatMessages LAZIMA ibaki ile ile ya
   joto katika hali ZOTE (loading → ready → empty), kwenye desktop na simu.
   ===================================================================== */
import { chromium } from 'playwright';

const BASE = process.env.SKH_URL || 'http://localhost:8080/';
const WARM = 'rgb(239, 231, 221)';   // #EFE7DD

const SEED = () => {
  const rows = [{ id: 'cA', participants: ['u1', 'xA'], type: 'direct',
    participantMeta: { xA: { name: 'Dr Kapama', role: 'seller' } },
    lastMessage: { type: 'text', text: 'Habari' }, lastMessageAt: new Date().toISOString(), unread: { u1: 0 } }];
  window.skh.currentUser = { uid: 'u1', email: 'd@e.t', displayName: 'Mimi' };
  window.skh.currentUserData = { displayName: 'Mimi' };
  window.__authResolved = true;
  window.skh.requireAuth = () => true;
  window.skh.getUserCard = async u => u === 'xA'
    ? { exists: () => true, data: () => ({ displayName: 'Dr Kapama', role: 'seller' }) }
    : { exists: () => false, data: () => null };
  window.skh.getDoc = async () => ({ exists: () => false, data: () => null });
  const snapOf = a => ({
    docs: a.map(d => ({ id: d.id, data: () => d })), empty: !a.length, size: a.length,
    exists: () => a.length > 0,
    forEach(f) { a.forEach(d => f({ id: d.id, data: () => d })); }
  });
  window.skh.collection = (db, n) => ({ __skhQuery: { col: n } });
  window.skh.where = (f, o, v) => ({ __skhQuery: { where: f, op: o, val: v } });
  window.skh.limit = n => ({ __skhQuery: { limit: n } });
  window.skh.orderBy = (f, d) => ({ __skhQuery: { orderBy: f } });
  window.skh.query = (c, ...r) => ({ __skhQuery: Object.assign({}, c && c.__skhQuery, ...r.map(x => (x && x.__skhQuery) || {})) });
  window.skh.getDocs = async q => {
    const s = JSON.stringify(q || {});
    return /conversations/.test(s) ? snapOf(rows) : snapOf([]);
  };
  window.skh.onSnapshot = () => () => {};
  return window.openChatList();
};

const readBg = p => p.evaluate(() => {
  const el = document.getElementById('chatMessages');
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { bg: cs.backgroundColor, img: cs.backgroundImage.slice(0, 40), cls: el.className };
});

let pass = 0, fail = 0;
const ok = (n, c, ex) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (ex ? '  → ' + ex : '')); } };

const b = await chromium.launch({ args: ['--no-sandbox'] });
for (const [tag, vp, mob] of [['desktop', { width: 1280, height: 900 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, isMobile: mob, hasTouch: mob });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 110)));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6500);
  const w = await p.$('button:has-text("ENDELEA NDANI")'); if (w) { try { await w.click({ timeout: 1200 }); } catch (e) {} }
  await p.waitForTimeout(700);
  await p.evaluate(`(${SEED.toString()})()`);
  await p.waitForTimeout(2500);
  await p.click('#inboxList [data-uid="xA"]');

  console.log('\n[' + tag + ' ' + vp.width + 'x' + vp.height + ']');
  await p.waitForTimeout(200);
  const loading = await readBg(p);
  ok('mandhari ni ya joto wakati wa kuunganisha', loading && loading.bg === WARM, loading && loading.bg);

  // Ujumbe wa kweli kupitia renderer ya app
  await p.evaluate(() => {
    const now = Date.now();
    try {
      window.skh.chatCore.msgs = [
        { id: 'm1', senderId: 'xA', type: 'text', text: 'Habari daktari, nauliza kuhusu vitanda', createdAt: new Date(now - 240000).toISOString() },
        { id: 'm2', senderId: 'u1', type: 'text', text: 'Karibu sana, vitanda vipo', createdAt: new Date(now - 180000).toISOString() },
        { id: 'm3', senderId: 'xA', type: 'text', text: 'Bei ni shilingi ngapi kwa kitanda kimoja?', createdAt: new Date(now - 60000).toISOString() }
      ];
      window.skhChatRenderStream();
      const el = document.getElementById('chatMessages');
      if (el) el.className = 'ch-ready';
    } catch (e) {}
  });
  await p.waitForTimeout(400);
  const ready = await readBg(p);
  ok('mandhari YA JOTO inabaki baada ya ujumbe kupakiwa', ready && ready.bg === WARM, ready && ready.bg);
  ok('mandhari ina madoa laini (sio rangi tambarare)', !!(ready && /radial-gradient/.test(ready.img)), ready && ready.img);
  ok('hakuna kubadilika kwenda nyeupe', !!(ready && !/rgb\(255, 255, 255\)|rgb\(244, 247, 246\)/.test(ready.bg)), ready && ready.bg);

  const rows = await p.evaluate(() => document.querySelectorAll('#chatMessages .ch-msg').length);
  ok('ujumbe umechorwa juu ya mandhari', rows > 0, 'safu: ' + rows);

  // Muda mrefu: hakuna module nyingine inabadilisha rangi baadaye
  await p.waitForTimeout(3000);
  const later = await readBg(p);
  ok('baada ya sekunde 3 mandhari ni ile ile', later && later.bg === WARM, later && later.bg);

  // Hali tupu (empty) pia ni ya joto
  await p.evaluate(() => {
    try {
      window.skh.chatCore.msgs = [];
      window.skhChatRenderStream();
      const el = document.getElementById('chatMessages');
      if (el) el.className = 'ch-empty';
    } catch (e) {}
  });
  await p.waitForTimeout(300);
  const empty = await readBg(p);
  ok('hali tupu pia ni ya joto', empty && empty.bg === WARM, empty && empty.bg);

  ok('hakuna page error', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}
await b.close();
console.log('\nCHAT BACKGROUND: ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
