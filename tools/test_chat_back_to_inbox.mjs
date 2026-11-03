/* =====================================================================
   test_chat_back_to_inbox.mjs — "Rudi" kutoka mazungumzo kwenda INBOX.

   Inashughulikia hitilafu iliyoripotiwa: ndani ya chat, kubonyeza RUDI
   kunashindwa kwenda vizuri (chat inafufuka / inbox haionekani).

   Kila kipimo huthibitishwa kwenye desktop NA simu:
   1) fungua chat -> RUDI -> inbox inaonekana, chat imefungwa
   2) safu za inbox zinaonekana (si tupu, si "Inapakia..." ya milele)
   3) MBIO: RUDI inabonyezwa kabla chat haijakamilika kupakia — chat
      isifufuke baada ya kurudi (hii ilikuwa sababu kuu ya hitilafu)
   4) mizunguko 3 ya fungua/kurudi — hali inabaki thabiti
   5) popover (emoji/biashara) iliyofunguliwa inafungwa na RUDI
   6) hakuna page error

   Matumizi:  source /home/user/pw.sh && node tools/test_chat_back_to_inbox.mjs
   ===================================================================== */
import { chromium } from 'playwright';

const BASE = process.env.SKH_URL || 'http://localhost:8080/';

const SEED = () => {
  const now = Date.now();
  const rows = [
    { id: 'c1', participants: ['u1', 'x1'], type: 'direct',
      participantMeta: { x1: { name: 'Duka la Kariakoo', photo: '', verified: true, role: 'seller' } },
      lastMessage: { type: 'text', text: 'Naweza kukupa TSh 32,000' }, lastMessageAt: new Date(now - 3 * 60000).toISOString(), unread: { u1: 2 } },
    { id: 'c2', participants: ['u1', 'x2'], type: 'direct',
      participantMeta: { x2: { name: 'Amina Mwikwabe', photo: '', verified: false, role: 'user' } },
      lastMessage: { type: 'text', text: 'Sawa, nitakuja kesho' }, lastMessageAt: new Date(now - 25 * 60000).toISOString(), unread: { u1: 0 } },
    { id: 'c3', participants: ['u1', 'x3'], type: 'direct',
      participantMeta: { x3: { name: 'Kariakoo Mobile', photo: '', verified: true, role: 'seller' } },
      lastMessage: { type: 'text', text: 'Bei ya mwisho ni TSh 400,000.' }, lastMessageAt: new Date(now - 120 * 60000).toISOString(), unread: { u1: 0 } }
  ];
  window.skh.currentUser = { uid: 'u1', email: 'demo@example.test', displayName: 'Demo' };
  window.skh.currentUserData = { displayName: 'Demo', role: 'seller' };
  window.__authResolved = true;
  window.skh.requireAuth = () => true;
  const snapOf = a => ({
    docs: a.map(d => ({ id: d.id, data: () => d })), empty: !a.length, size: a.length,
    forEach(fn) { a.forEach(d => fn({ id: d.id, data: () => d })); }
  });
  window.skh.getDocs = async () => snapOf(rows);
  window.skh.getDoc = async () => ({ exists: () => false, data: () => null });
  window.skh.onSnapshot = () => () => {};
  return window.openChatList();
};

const STATE = () => {
  const vis = id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; };
  const list = document.getElementById('inboxList');
  const txt = list ? (list.textContent || '').replace(/\s+/g, ' ').trim() : '';
  return {
    inboxVisible: vis('chatListModal'),
    chatVisible: vis('chatModal'),
    rows: list ? list.querySelectorAll('[data-uid]').length : 0,
    loading: /Inapakia mazungumzo/i.test(txt),
    empty: !txt,
    popovers: ['chEmojiPop', 'chTradePop', 'chPlusMenu'].filter(id => {
      const e = document.getElementById(id); return e && !e.hidden && getComputedStyle(e).display !== 'none';
    }),
    twoPane: !!document.querySelector('.chat-card.chat-two-pane')
  };
};

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};

const b = await chromium.launch({ args: ['--no-sandbox'] });
const VIEWPORTS = [
  ['desktop', { width: 1280, height: 900 }, false],
  ['laptop', { width: 1024, height: 800 }, false],
  ['mobile', { width: 390, height: 844 }, true]
];

for (const [tag, vp, mob] of VIEWPORTS) {
  const ctx = await b.newContext({ viewport: vp, isMobile: mob, hasTouch: mob });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 120)));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/MIME type of "text\/html"/.test(t)) return; // module ya hiari (haipo kwenye repo)
    errs.push('CONSOLE ' + t.slice(0, 120));
  });

  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6500);
  const w = await p.$('button:has-text("ENDELEA NDANI")');
  if (w) { try { await w.click({ timeout: 1200 }); } catch (e) {} }
  await p.waitForTimeout(900);
  await p.evaluate(`(${SEED.toString()})()`);
  await p.waitForTimeout(2000);

  console.log('\n[' + tag + ' ' + vp.width + 'x' + vp.height + ']');
  const s0 = await p.evaluate(STATE);
  ok('inbox inafunguka na safu zinaonekana', s0.inboxVisible && s0.rows > 0, JSON.stringify(s0));

  // 1 + 2) fungua -> RUDI
  await p.click('#inboxList [data-uid]', { timeout: 5000 });
  await p.waitForTimeout(2500);
  const s1 = await p.evaluate(STATE);
  ok('chat inafunguka', s1.chatVisible === true, JSON.stringify(s1));
  await p.click('#chatBackBtn', { timeout: 5000 });
  await p.waitForTimeout(2200);
  const s2 = await p.evaluate(STATE);
  ok('RUDI: inbox inaonekana', s2.inboxVisible === true, JSON.stringify(s2));
  ok('RUDI: chat imefungwa', s2.chatVisible === false, JSON.stringify(s2));
  ok('RUDI: safu za inbox zinaonekana', s2.rows > 0, 'safu=' + s2.rows);
  ok('RUDI: inbox haiko kwenye "Inapakia..."', s2.loading === false && s2.empty === false, JSON.stringify(s2));

  // 3) MBIO — RUDI kabla chat haijamaliza kupakia
  await p.click('#inboxList [data-uid]', { timeout: 5000 });
  await p.waitForTimeout(60);              // bado inapakia
  await p.click('#chatBackBtn', { timeout: 5000 });
  await p.waitForTimeout(3200);            // subiri attach ya zamani ikamilike
  const s3 = await p.evaluate(STATE);
  ok('MBIO: chat haifufuki baada ya kurudi', s3.chatVisible === false, JSON.stringify(s3));
  ok('MBIO: inbox inabaki wazi', s3.inboxVisible === true && s3.rows > 0, JSON.stringify(s3));

  // 4) mizunguko 3
  let stable = true, detail = '';
  for (let i = 0; i < 3; i++) {
    await p.click('#inboxList [data-uid]', { timeout: 5000 });
    await p.waitForTimeout(1400);
    await p.click('#chatBackBtn', { timeout: 5000 });
    await p.waitForTimeout(1200);
    const s = await p.evaluate(STATE);
    if (!(s.inboxVisible && !s.chatVisible && s.rows > 0)) { stable = false; detail = 'mzunguko ' + (i + 1) + ': ' + JSON.stringify(s); break; }
  }
  ok('mizunguko 3 ya fungua/kurudi inabaki thabiti', stable, detail);

  // 5) popover inafungwa na RUDI
  await p.click('#inboxList [data-uid]', { timeout: 5000 });
  await p.waitForTimeout(2000);
  await p.evaluate(() => window.skhChatToggleEmoji && window.skhChatToggleEmoji());
  await p.waitForTimeout(300);
  const popBefore = (await p.evaluate(STATE)).popovers.length;
  await p.click('#chatBackBtn', { timeout: 5000 });
  await p.waitForTimeout(1600);
  const s5 = await p.evaluate(STATE);
  ok('popover ya emoji ilifungwa na RUDI', popBefore > 0 && s5.popovers.length === 0, 'kabla=' + popBefore + ' baada=' + JSON.stringify(s5.popovers));

  // 6) errors
  ok('hakuna page error', errs.length === 0, errs.slice(0, 3).join(' | '));

  if (tag !== 'laptop') await p.screenshot({ path: `audit-shots/back-inbox-${tag}.png` });
  await ctx.close();
}

await b.close();
console.log('\nCHAT BACK TO INBOX: ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
