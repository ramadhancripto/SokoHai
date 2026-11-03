/* =====================================================================
   test_chat_reply_ui.mjs — Task K (2026-11)

   Kinapima yale yaliyoripotiwa kwenye chat:
   1. DP safi + aikoni ya MTU kama hakuna picha — hakuna buluu (#00509d).
   2. Rangi za mfumo: video call / biashara / kadi ya ofa si buluu.
   3. Reply: kile kilichojibiwa ni kitufe — bofya → unarukia ujumbe halisi
      nao unakolezwa (flash), hata stream ikichorwa upya.
   4. Bidhaa iliyoambatanishwa inaondolewa kwa kitufe kikubwa cha ✕.
   ===================================================================== */
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.SKH_URL || 'http://localhost:8080/';

const SEED = () => {
  const conv = { id: 'cA', participants: ['u1', 'xA'], type: 'direct',
    participantMeta: { xA: { name: 'Dr Kapama', role: 'seller' } },
    lastMessage: { type: 'text', text: 'Habari' }, lastMessageAt: new Date().toISOString(), unread: { u1: 0 } };
  window.skh.currentUser = { uid: 'u1', email: 'd@e.t', displayName: 'Mimi' };
  window.skh.currentUserData = { displayName: 'Mimi' };
  window.__authResolved = true;
  window.skh.requireAuth = () => true;
  window.skh.getUserCard = async u => u === 'xA'
    ? { exists: () => true, data: () => ({ displayName: 'Dr Kapama', role: 'seller' }) }
    : { exists: () => false, data: () => null };
  window.skh.getDoc = async () => ({ exists: () => false, data: () => null });
  const now = Date.now();
  const MSGS = [
    { id: 'm1', senderId: 'xA', senderName: 'Dr Kapama', type: 'text', text: 'Bei ni TSh 185,000 kwa kitanda kimoja', createdAt: new Date(now - 300000).toISOString() },
    { id: 'm2', senderId: 'xA', senderName: 'Dr Kapama', type: 'text', text: 'Tuna vitanda vya mbao na vyuma pia', createdAt: new Date(now - 240000).toISOString() },
    { id: 'm3', senderId: 'u1', senderName: 'Mimi', type: 'text', text: 'Sawa, nitakuja kesho asubuhi', replyToId: 'm1', createdAt: new Date(now - 60000).toISOString() }
  ];
  const snapOf = a => ({ docs: a.map(d => ({ id: d.id, data: () => d })), empty: !a.length, size: a.length,
    exists: () => a.length > 0, forEach(f) { a.forEach(d => f({ id: d.id, data: () => d })); } });
  window.skh.collection = (db, n) => ({ __skhQuery: { col: n } });
  window.skh.where = (f, o, v) => ({ __skhQuery: { where: f, op: o, val: v } });
  window.skh.limit = n => ({ __skhQuery: { limit: n } });
  window.skh.orderBy = (f, d) => ({ __skhQuery: { orderBy: f } });
  window.skh.query = (c, ...r) => ({ __skhQuery: Object.assign({}, c && c.__skhQuery, ...r.map(x => (x && x.__skhQuery) || {})) });
  window.skh.getDocs = async q => {
    const s = JSON.stringify(q || {});
    if (/products/.test(s)) return snapOf([{ id: 'p1', userId: 'xA', title: 'Kitanda cha mbao', price: 185000, sellerName: 'Dr Kapama' }]);
    if (/conversations/.test(s)) return snapOf([conv]);
    return snapOf([]);
  };
  window.skh.onSnapshot = (q, cb) => {
    const s = JSON.stringify(q || {});
    if (/messages/.test(s)) setTimeout(() => cb(snapOf(MSGS)), 50);
    else if (/conversations/.test(s)) setTimeout(() => cb({ exists: () => true, data: () => conv, forEach() {} }), 40);
    return () => {};
  };
  return window.openChatList();
};

let pass = 0, fail = 0;
const ok = (n, c, ex) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (ex ? '  → ' + ex : '')); } };

// ---- 0. Ukaguzi wa msimbo: quote ya vikundi/group-order pia inaruka ----
const gsg = fs.readFileSync('js/app/73-group-soga.js', 'utf8');
ok('group order: quote ina data-quote-id + skhChatJumpToMessage',
  /data-quote-id/.test(gsg) && /skhChatJumpToMessage/.test(gsg));
ok('group order: hakuna buluu #1268A8 kwenye quote/avatari',
  !/gsg-quote[\s\S]{0,300}1268A8/.test(gsg));

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
  await p.waitForTimeout(2600);
  await p.evaluate(() => {
    window.skh.activeChatProduct = { id: 'p1', userId: 'xA', title: 'Kitanda cha mbao', price: 185000 };
    if (window.skhRenderAttachedProduct) window.skhRenderAttachedProduct();
  });
  await p.waitForTimeout(500);

  console.log('\n[' + tag + ' ' + vp.width + 'x' + vp.height + ']');

  // 1. DP
  const av = await p.evaluate(() => {
    const img = document.querySelector('#chatHeaderAvatar img');
    if (!img) return null;
    const src = decodeURIComponent(img.src);
    return { isSvg: /^data:image\/svg/.test(img.src), blue: /00509d|0ea5e9|1268A8/i.test(src),
             person: /<circle/.test(src) && /<path/.test(src), letter: /<text/.test(src) };
  });
  ok('DP ipo na ni aikoni (sio picha)', !!(av && av.isSvg), av && 'svg=' + av.isSvg);
  ok('DP haina buluu (#00509d/#0ea5e9)', !!(av && !av.blue));
  ok('DP ni aikoni ya MTU (hakuna herufi)', !!(av && av.person && !av.letter));

  // 2. Rangi za mfumo
  const colors = await p.evaluate(() => {
    const vid = document.getElementById('chatVideoCallBtn');
    return { video: vid ? getComputedStyle(vid).color : 'none' };
  });
  ok('video call ni kijani cha mfumo', colors.video === 'rgb(15, 126, 103)', colors.video);

  // 3. Reply
  await p.waitForSelector('#chatMessages .ch-quote', { timeout: 10000 });
  const q = await p.evaluate(() => {
    const el = document.querySelector('#chatMessages .ch-quote');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      clickable: !!el.getAttribute('onclick'),
      role: el.getAttribute('role'),
      by: (el.querySelector('.ch-quote-by') || {}).textContent || '',
      tx: (el.querySelector('.ch-quote-tx') || {}).textContent || '',
      borderColor: cs.borderLeftColor,
      bg: cs.backgroundColor
    };
  });
  ok('quote ya jibu ipo', !!q);
  ok('quote ni kitufe (role=button + onclick)', !!(q && q.clickable && q.role === 'button'));
  ok('quote ina jina la aliyetuma', !!(q && /Dr Kapama/.test(q.by)), q && q.by);
  ok('quote ina muhtasari wa ujumbe', !!(q && q.tx.length > 5), q && q.tx.slice(0, 30));
  ok('quote ni kijani (sio buluu)', !!(q && /24, 169, 130|15, 126, 103/.test(q.borderColor)),
     q && (q.borderColor + ' | bg ' + q.bg));

  // 4. Bofya → rukia ujumbe halisi
  await p.evaluate(() => { const el = document.getElementById('chatMessages'); el.scrollTop = el.scrollHeight; });
  await p.waitForTimeout(250);
  await p.click('#chatMessages .ch-quote');
  await p.waitForTimeout(250);
  const jumpEarly = await p.evaluate(() => {
    const fl = document.querySelector('#chatMessages .ch-msg--flash');
    return fl ? fl.getAttribute('data-msgid') : null;
  });
  await p.waitForTimeout(800);
  const jumpLate = await p.evaluate(() => {
    const fl = document.querySelector('#chatMessages .ch-msg--flash');
    const el = document.querySelector('#chatMessages [data-msgid="m1"]');
    if (!el) return { id: null, visible: null };
    const r = el.getBoundingClientRect();
    return { id: fl ? fl.getAttribute('data-msgid') : null, visible: r.top >= 0 && r.bottom <= window.innerHeight };
  });
  ok('bofya quote → ujumbe unakolezwa papo hapo', jumpEarly === 'm1', String(jumpEarly));
  ok('kikolezo kinadumu (stream haikiondoi)', jumpLate.id === 'm1', String(jumpLate.id));
  ok('ujumbe uliorukiwa unaonekana skrini', jumpLate.visible === true, String(jumpLate.visible));

  // 5. Kuondoa bidhaa iliyoambatanishwa
  const rm = await p.evaluate(() => {
    const btn = document.querySelector('.chat-attached .ca-remove');
    const strip = document.getElementById('chatAttachedProduct');
    return { hasBtn: !!btn, w: btn ? btn.getBoundingClientRect().width : 0,
             h: btn ? btn.getBoundingClientRect().height : 0,
             stripShown: strip ? getComputedStyle(strip).display !== 'none' : false };
  });
  ok('strip ya bidhaa inaonekana', rm.stripShown);
  ok('kitufe cha kuondoa ni kikubwa cha kutosha (≥30px)', rm.hasBtn && rm.w >= 30 && rm.h >= 30, rm.w + 'x' + rm.h);
  await p.click('.chat-attached .ca-remove');
  await p.waitForTimeout(600);
  const after = await p.evaluate(() => ({
    stripHidden: getComputedStyle(document.getElementById('chatAttachedProduct')).display === 'none',
    cleared: !window.skh.activeChatProduct,
    toast: !!document.querySelector('[class*="toast"]')
  }));
  ok('bidhaa imeondolewa (strip inafichwa)', after.stripHidden);
  ok('hali ya kiambatisho imesafishwa', after.cleared);
  ok('mtumiaji anapata uthibitisho (toast)', after.toast);

  // 5b. Kadi kubwa ya muktadha ("Bidhaa … Toa Ofa") inaondolewa
  await p.evaluate(() => { window.skh.activeChatProduct = { id:'p1', userId:'xA', title:'Kitanda cha mbao', price:185000 }; if (window.skhRenderAttachedProduct) window.skhRenderAttachedProduct(); if (window.skhChatRefreshNegoCard) window.skhChatRefreshNegoCard(); });
  await p.waitForTimeout(700);
  const card = await p.evaluate(() => {
    const c = document.querySelector('#chatContextBar .ch-startnego, .ch-startnego');
    const x = document.querySelector('.ch-startnego .ch-sn-x');
    const cta = document.querySelector('.ch-startnego .ch-sn-btn');
    return { shown: !!(c && c.offsetParent !== null), hasX: !!x,
             ctaColor: cta ? getComputedStyle(cta).backgroundColor : 'none' };
  });
  ok('kadi ya ofa inaonekana', card.shown);
  ok('kadi ya ofa ina kitufe cha kuondoa (✕)', card.hasX);
  ok('kitufe cha ofa ni kijani (sio buluu)', /24, 169, 130/.test(card.ctaColor), card.ctaColor);
  if (card.hasX) {
    await p.click('.ch-startnego .ch-sn-x');
    await p.waitForTimeout(600);
    const gone = await p.evaluate(() => {
      if (window.skhChatRefreshNegoCard) window.skhChatRefreshNegoCard();
      const c = document.querySelector('.ch-startnego');
      return !(c && c.offsetParent !== null);
    });
    ok('kadi imeondolewa na hairejei baada ya re-render', gone);
  }

  // 6. Hakuna mlipuko wa upana
  const ovf = await p.evaluate(() => {
    const el = document.getElementById('chatMessages');
    return el.scrollWidth - el.clientWidth;
  });
  ok('hakuna mlipuko wa upana', ovf <= 1, 'overflow: ' + ovf);

  ok('hakuna page error', errs.length === 0, errs.slice(0, 2).join(' | '));
  if (tag === 'mobile') await p.screenshot({ path: 'audit-shots/chat-reply-ui-mobile.png' });
  else await p.screenshot({ path: 'audit-shots/chat-reply-ui-desktop.png' });
  await ctx.close();
}
await b.close();
console.log('\nCHAT REPLY UI: ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
