/* =====================================================================
   test_chat_gestures.mjs — kusogeza, swipe, action sheet (Task L 2026-11)

   Kinapima ndani ya chat (desktop + simu):
   1. Scroll: ujumbe mpya ukiwa juu HAUARUSHI chini; pill ya "Ujumbe mpya"
      inaonekana; bofya → inarudi chini.
   2. Swipe KULIA kwenye ujumbe (wa mwenzake NA wangu) → reply chip.
   3. Swipe KUSHOTO → action sheet ya ujumbe huo (si skrini nzima).
   4. Long-press (touch) · right-click (desktop) · kitufe ⋯ → sheet ile ile.
   5. Ruhusa: "Hariri" inaonekana kwa ujumbe WANGU tu; "Futa" pia.
   6. Kuvuta wima hakutrigger swipe.
   ===================================================================== */
import { chromium } from 'playwright';

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
  const mk = (i, mine, text) => ({ id: 'm' + i, senderId: mine ? 'u1' : 'xA', senderName: mine ? 'Mimi' : 'Dr Kapama',
    type: 'text', text: text, createdAt: new Date(now - (30 - i) * 60000).toISOString() });
  const MSGS = [];
  for (let i = 1; i <= 24; i++) MSGS.push(mk(i, i % 3 === 0, 'Ujumbe wa jaribio namba ' + i + ' — maudhui ya kutosha kujaza safu'));
  window.__MSGS = MSGS;
  const snapOf = a => ({ docs: a.map(d => ({ id: d.id, data: () => d })), empty: !a.length, size: a.length,
    exists: () => a.length > 0, forEach(f) { a.forEach(d => f({ id: d.id, data: () => d })); } });
  window.skh.collection = (db, n) => ({ __skhQuery: { col: n } });
  window.skh.where = (f, o, v) => ({ __skhQuery: { where: f, op: o, val: v } });
  window.skh.limit = n => ({ __skhQuery: { limit: n } });
  window.skh.orderBy = (f, d) => ({ __skhQuery: { orderBy: f } });
  window.skh.query = (c, ...r) => ({ __skhQuery: Object.assign({}, c && c.__skhQuery, ...r.map(x => (x && x.__skhQuery) || {})) });
  window.skh.getDocs = async q => {
    const s = JSON.stringify(q || {});
    return /conversations/.test(s) ? snapOf([conv]) : snapOf([]);
  };
  window.skh.onSnapshot = (q, cb) => {
    const s = JSON.stringify(q || {});
    if (/messages/.test(s)) setTimeout(() => cb(snapOf(window.__MSGS)), 60);
    else if (/conversations/.test(s)) setTimeout(() => cb({ exists: () => true, data: () => conv, forEach() {} }), 40);
    return () => {};
  };
  window.skh.updateDoc = async () => ({});
  window.skh.setDoc = async () => ({});
  return window.openChatList();
};

let pass = 0, fail = 0;
const ok = (n, c, ex) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (ex ? '  → ' + ex : '')); } };

// swipe ya touch kupitia CDP (inagusa gesture halisi ya kifaa)
async function touchDrag(p, sel, dx, dy) {
  const box = await p.locator(sel).first().boundingBox();
  if (!box) return false;
  const x0 = box.x + box.width / 2, y0 = box.y + box.height / 2;
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x0 + (dx * i) / steps, y: y0 + (dy * i) / steps }]
    });
    await p.waitForTimeout(12);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return true;
}

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
  await p.waitForSelector('#chatMessages .ch-msg', { timeout: 12000 });
  await p.waitForTimeout(1200);

  console.log('\n[' + tag + ' ' + vp.width + 'x' + vp.height + ']');

  // ---------- 1. SCROLL ----------
  await p.waitForTimeout(700);
  const opened = await p.evaluate(() => {
    const el = document.getElementById('chatMessages');
    return { atBottom: (el.scrollHeight - el.scrollTop - el.clientHeight) < 90, rows: el.querySelectorAll('.ch-msg').length };
  });
  ok('chat inafungua kwenye ujumbe wa MWISHO', opened.atBottom, 'bottomDelta>0');
  ok('ujumbe wote umechorwa', opened.rows >= 20, 'rows: ' + opened.rows);

  // sogeza juu
  await p.evaluate(() => { const el = document.getElementById('chatMessages'); el.scrollTop = 300; });
  await p.waitForTimeout(1200);
  const pillUp = await p.evaluate(() => {
    const d = document.querySelector('#skhChatPills .skh-pill--down');
    return { visible: !!(d && !d.hidden) };
  });
  ok('ukiwa juu: kitufe cha "rudi chini" kinaonekana', pillUp.visible);

  // ujumbe mpya ukifika ukiwa juu — HAUARUSHI chini
  const before = await p.evaluate(() => {
    const el = document.getElementById('chatMessages');
    const ref = el.querySelectorAll('.ch-msg')[2];
    const box = el.getBoundingClientRect();
    return { top: el.scrollTop, refOffset: ref ? (ref.getBoundingClientRect().top - box.top) : 0 };
  });
  await p.evaluate(() => {
    window.__MSGS = window.__MSGS.concat([{ id: 'mNEW', senderId: 'xA', senderName: 'Dr Kapama', type: 'text',
      text: 'Ujumbe MPYA umefika wakati ukiwa juu', createdAt: new Date().toISOString() }]);
    const core = window.skh.chatCore;
    core.msgs = window.__MSGS;
    window.skhChatRenderStream();
  });
  await p.waitForTimeout(700);
  const afterNew = await p.evaluate(() => {
    const el = document.getElementById('chatMessages');
    const nw = document.querySelector('#skhChatPills .skh-pill--new');
    const ref = el.querySelectorAll('.ch-msg')[2];
    const box = el.getBoundingClientRect();
    return { top: el.scrollTop, refOffset: ref ? (ref.getBoundingClientRect().top - box.top) : 0,
             atBottom: (el.scrollHeight - el.scrollTop - el.clientHeight) < 10,
             newPill: !!(nw && !nw.hidden), text: nw ? nw.textContent : '' };
  });
  ok('ujumbe mpya HAUARUSHI chini (maudhui yanayosomwa yanabaki mahali)',
     !afterNew.atBottom && Math.abs(afterNew.refOffset - before.refOffset) < 12,
     'ref ' + before.refOffset.toFixed(0) + ' → ' + afterNew.refOffset.toFixed(0) + ', atBottom=' + afterNew.atBottom);
  ok('pill ya "Ujumbe mpya" inaonekana', afterNew.newPill, afterNew.text);

  await p.click('#skhChatPills .skh-pill--new');
  await p.waitForTimeout(900);
  const backDown = await p.evaluate(() => {
    const el = document.getElementById('chatMessages');
    return { atBottom: (el.scrollHeight - el.scrollTop - el.clientHeight) < 12,
             newPill: !document.querySelector('#skhChatPills .skh-pill--new').hidden };
  });
  ok('bofya pill → inarudi kwenye ujumbe wa mwisho', backDown.atBottom);
  ok('pill inafichwa baada ya kurudi chini', !backDown.newPill);

  // ---------- 2. SWIPE KULIA = JIBU ----------
  const incoming = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#chatMessages .ch-msg[data-mine="0"]')];
    return rows.length ? rows[rows.length - 2].getAttribute('data-msgid') : null;
  });
  if (mob) {
    await touchDrag(p, `#chatMessages [data-msgid="${incoming}"]`, 90, 2);
  } else {
    const box = await p.locator(`#chatMessages [data-msgid="${incoming}"] .chat-bubble`).first().boundingBox();
    await p.mouse.move(box.x + 30, box.y + box.height / 2);
    await p.mouse.down();
    for (let i = 1; i <= 8; i++) { await p.mouse.move(box.x + 30 + i * 12, box.y + box.height / 2); await p.waitForTimeout(12); }
    await p.mouse.up();
  }
  await p.waitForTimeout(600);
  const replyChip = await p.evaluate(() => {
    const c = document.getElementById('chatReplyChip');
    return { shown: !!(c && c.style.display !== 'none' && c.textContent.trim()), text: c ? c.textContent.trim().slice(0, 60) : '' };
  });
  ok('swipe KULIA kwenye ujumbe wa mwenzake → reply chip', replyChip.shown, replyChip.text);
  ok('reply chip inamtaja aliyetuma', /Dr Kapama/.test(replyChip.text), replyChip.text);

  // ghairi
  await p.evaluate(() => window.skhChatCancelReply());
  await p.waitForTimeout(300);
  const chipGone = await p.evaluate(() => {
    const c = document.getElementById('chatReplyChip');
    return !(c && c.style.display !== 'none' && c.textContent.trim());
  });
  ok('reply inaweza kuGHARIRIWA kabla ya kutuma', chipGone);

  // ujumbe WANGU pia
  const mine = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#chatMessages .ch-msg[data-mine="1"]')];
    return rows.length ? rows[rows.length - 1].getAttribute('data-msgid') : null;
  });
  if (mob) await touchDrag(p, `#chatMessages [data-msgid="${mine}"]`, 90, 2);
  else {
    const box2 = await p.locator(`#chatMessages [data-msgid="${mine}"] .chat-bubble`).first().boundingBox();
    await p.mouse.move(box2.x + box2.width - 20, box2.y + box2.height / 2);
    await p.mouse.down();
    for (let i = 1; i <= 8; i++) { await p.mouse.move(box2.x + box2.width - 20 + i * 12, box2.y + box2.height / 2); await p.waitForTimeout(12); }
    await p.mouse.up();
  }
  await p.waitForTimeout(600);
  ok('swipe KULIA kwenye ujumbe WANGU pia inajibu', await p.evaluate(() => {
    const c = document.getElementById('chatReplyChip');
    return !!(c && c.style.display !== 'none' && c.textContent.trim());
  }));
  await p.evaluate(() => window.skhChatCancelReply());
  await p.waitForTimeout(200);

  // ---------- 3. SWIPE KUSHOTO = ACTION SHEET ----------
  if (mob) await touchDrag(p, `#chatMessages [data-msgid="${incoming}"]`, -90, 2);
  else {
    const box3 = await p.locator(`#chatMessages [data-msgid="${incoming}"] .chat-bubble`).first().boundingBox();
    await p.mouse.move(box3.x + box3.width - 20, box3.y + box3.height / 2);
    await p.mouse.down();
    for (let i = 1; i <= 8; i++) { await p.mouse.move(box3.x + box3.width - 20 - i * 12, box3.y + box3.height / 2); await p.waitForTimeout(12); }
    await p.mouse.up();
  }
  await p.waitForTimeout(700);
  const sheet = await p.evaluate(() => {
    const s = document.getElementById('skhMsgSheet');
    const items = [...document.querySelectorAll('#skhSheetList .skh-sheet-item')].map(b => b.textContent.trim());
    return { open: !!(s && !s.hidden && s.classList.contains('is-open')), items,
             reactions: document.querySelectorAll('#skhSheetReact button').length };
  });
  ok('swipe KUSHOTO → action sheet inafunguka', sheet.open);
  ok('sheet ina vitendo (Jibu/Nakili/Sambaza/Shiriki)', sheet.items.some(x => /Jibu/.test(x)) && sheet.items.some(x => /Nakili/.test(x)) && sheet.items.some(x => /Shiriki/.test(x)), sheet.items.join(' | '));
  ok('sheet ina reactions za haraka', sheet.reactions >= 4, 'reactions: ' + sheet.reactions);
  ok('"Hariri" HAIONEKANI kwenye ujumbe wa mwenzake', !sheet.items.some(x => /Hariri/.test(x)));
  ok('"Futa" HAIONEKANI kwenye ujumbe wa mwenzake', !sheet.items.some(x => /^Futa/.test(x)));
  await p.evaluate(() => window.skhChatActionsClose());
  await p.waitForTimeout(300);

  // ---------- 4. LONG-PRESS / RIGHT-CLICK / ⋯ ----------
  if (mob) {
    const box4 = await p.locator(`#chatMessages [data-msgid="${mine}"] .chat-bubble`).first().boundingBox();
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box4.x + 30, y: box4.y + box4.height / 2 }] });
    await p.waitForTimeout(750);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await p.click(`#chatMessages [data-msgid="${mine}"] .chat-bubble`, { button: 'right' });
  }
  await p.waitForTimeout(600);
  const byPress = await p.evaluate(() => {
    const s = document.getElementById('skhMsgSheet');
    const items = [...document.querySelectorAll('#skhSheetList .skh-sheet-item')].map(b => b.textContent.trim());
    return { open: !!(s && !s.hidden), items };
  });
  ok(mob ? 'long-press → action sheet' : 'right-click → action sheet', byPress.open);
  ok('ujumbe WANGU una "Hariri" na "Futa"', byPress.items.some(x => /Hariri/.test(x)) && byPress.items.some(x => /Futa/.test(x)), byPress.items.join(' | '));
  await p.evaluate(() => window.skhChatActionsClose());
  await p.waitForTimeout(300);

  // kitufe ⋯ (njia isiyo ya gestures)
  // Kwenye simu safu ya vitendo hufichwa — gusa ujumbe ili ijitokeze (bila gesture).
  if (mob) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const tb = await p.locator(`#chatMessages [data-msgid="${mine}"] .chat-bubble`).first().boundingBox();
      await p.touchscreen.tap(tb.x + 30, tb.y + tb.height / 2);
      await p.waitForTimeout(400);
      const shown = await p.evaluate((id) => {
        const row = document.querySelector('#chatMessages [data-msgid="' + id + '"] .ch-actions');
        return !!(row && row.offsetParent !== null && row.getBoundingClientRect().height > 0);
      }, mine);
      if (shown) break;
    }
  }
  const moreBtn = await p.locator(`#chatMessages [data-msgid="${mine}"] .ch-more-btn`).first();
  const hasMore = await moreBtn.count();
  if (hasMore) {
    await moreBtn.click({ force: true });
    await p.waitForTimeout(600);
    ok('kitufe ⋯ (bila gesture) → action sheet', await p.evaluate(() => {
      const s = document.getElementById('skhMsgSheet');
      return !!(s && !s.hidden);
    }));
    await p.evaluate(() => window.skhChatActionsClose());
    await p.waitForTimeout(250);
  } else {
    ok('kitufe ⋯ (bila gesture) → action sheet', false, 'ch-more-btn haipo');
  }

  // ---------- 5. KUVUTA WIMA HAKUTRIGGER ----------
  const targetV = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#chatMessages .ch-msg')];
    return rows[Math.max(0, rows.length - 4)].getAttribute('data-msgid');
  });
  const chipBefore = await p.evaluate(() => {
    const c = document.getElementById('chatReplyChip');
    return !!(c && c.style.display !== 'none' && c.textContent.trim());
  });
  if (mob) await touchDrag(p, `#chatMessages [data-msgid="${targetV}"]`, 6, -160);
  else {
    const box5 = await p.locator(`#chatMessages [data-msgid="${targetV}"] .chat-bubble`).first().boundingBox();
    await p.mouse.move(box5.x + 20, box5.y + box5.height / 2);
    await p.mouse.down();
    for (let i = 1; i <= 6; i++) { await p.mouse.move(box5.x + 20, box5.y + box5.height / 2 - i * 20); await p.waitForTimeout(12); }
    await p.mouse.up();
  }
  await p.waitForTimeout(500);
  const chipAfter = await p.evaluate(() => {
    const c = document.getElementById('chatReplyChip');
    const s = document.getElementById('skhMsgSheet');
    return { chip: !!(c && c.style.display !== 'none' && c.textContent.trim()), sheet: !!(s && !s.hidden) };
  });
  ok('kuvuta WIMA hakutrigger swipe/reply', chipBefore === chipAfter.chip && !chipAfter.sheet);

  // ---------- 6. Ruhusa: hariri ujumbe wa mwenzake ----------
  const guard = await p.evaluate(async () => {
    let threw = false;
    try { await window.skhChatEdit('m1'); } catch (e) { threw = true; }
    const st = window.skh.chatCore && window.skh.chatCore.editingMessage;
    return { editing: !!st, threw };
  });
  ok('skhChatEdit HAICHUKUI ujumbe wa mwenzake (ruhusa)', !guard.editing);

  ok('hakuna page error', errs.length === 0, errs.slice(0, 2).join(' | '));
  if (tag === 'mobile') await p.screenshot({ path: 'audit-shots/chat-gestures-mobile.png' });
  await ctx.close();
}
await b.close();
console.log('\nCHAT GESTURES: ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
