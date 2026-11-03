/* =====================================================================
   test_chat_nego_cards.mjs — kadi za majadiliano (Ofa/Counter/Agreement)
   ndani ya chat: ziwe BALANCED (upana sawa pande zote, fremu moja, hakuna
   kubana UI, vitufe vinaingia ndani ya kadi).

   Matumizi:  source /home/user/pw.sh && node tools/test_chat_nego_cards.mjs
   ===================================================================== */
import { chromium } from 'playwright';

const BASE = process.env.SKH_URL || 'http://localhost:8080/';

const SEED = () => {
  window.skh.currentUser = { uid: 'u1', email: 'demo@example.test', displayName: 'Demo' };
  window.skh.currentUserData = { displayName: 'Demo', role: 'buyer' };
  window.__authResolved = true;
  const l = document.getElementById('chatListModal'); if (l) l.style.display = 'none';
  const m = document.getElementById('chatModal'); m.style.display = 'flex';
  const t = x => new Date(Date.now() - x * 60000).toISOString();
  const base = {
    negotiationId: 'n1', version: 2, commerceType: 'product', productId: 'p1',
    productTitle: 'Set ya vitanda vya mbao (Kariakoo)', buyerId: 'u1', sellerId: 'x1',
    quantity: 3, currentUnitPrice: 38000, currentTotal: 114000,
    createdAt: t(9), updatedAt: t(2)
  };
  window.skh.chatCore = Object.assign(window.skh.chatCore || {}, {
    convId: 'c1', partnerUid: 'x1', conv: { id: 'c1', participants: ['u1', 'x1'] },
    msgs: [
      { id: 'm1', type: 'text', text: 'Habari, hii set bado ipo?', senderId: 'u1', createdAt: t(9) },
      { id: 'm2', type: 'offer', senderId: 'u1', createdAt: t(8), offerId: 'o1',
        offerSnapshot: { productTitle: 'Set ya vitanda vya mbao (Kariakoo)', quantity: 3, proposedPrice: 38000, currentPrice: 45000, status: 'pending' } },
      { id: 'm3', type: 'negotiation', senderId: 'x1', createdAt: t(6), negotiationId: 'n1',
        negotiationSnapshot: Object.assign({}, base, { currentState: 'COUNTER_OFFER', waitingForUserId: 'u1' }) },
      { id: 'm4', type: 'negotiation', senderId: 'u1', createdAt: t(4), negotiationId: 'n2',
        negotiationSnapshot: Object.assign({}, base, { negotiationId: 'n2', currentState: 'AGREEMENT', waitingForUserId: 'u1' }) }
    ]
  });
  window.skhChatRenderStream();
};

const MEASURE = () => {
  const col = document.getElementById('chatMessages').getBoundingClientRect();
  const rows = [];
  document.querySelectorAll('#chatMessages .ch-msg').forEach(msg => {
    const card = msg.querySelector('.ch-nego-event') || msg.querySelector('.ch-offer-msg');
    if (!card) return;
    const bub = msg.querySelector('.chat-bubble');
    const cs = getComputedStyle(bub);
    const r = card.getBoundingClientRect();
    const btns = [...card.querySelectorAll('.ch-nego-btn, .ch-offer-msg-actions button')];
    const terms = [...card.querySelectorAll('.ch-nego-term, .ch-offer-term')];
    rows.push({
      kind: card.className.indexOf('ch-nego-event') >= 0 ? 'nego' : 'offer',
      mine: msg.getAttribute('data-mine'),
      w: Math.round(r.width), h: Math.round(r.height),
      left: Math.round(r.left), right: Math.round(r.right),
      colW: Math.round(col.width), colL: Math.round(col.left), colR: Math.round(col.right),
      bubBg: cs.backgroundColor, bubBorder: cs.borderTopColor, bubPad: cs.paddingLeft,
      btnCount: btns.length,
      btnOverflow: btns.some(b => {
        const br = b.getBoundingClientRect();
        return br.right > r.right + 1 || br.left < r.left - 1 || br.bottom > r.bottom + 1;
      }),
      terms: terms.length,
      totalTileWide: (() => {
        const tot = card.querySelector('.ch-nego-term.is-total, .ch-offer-term.is-total');
        if (!tot) return true;
        return tot.getBoundingClientRect().width > r.width * 0.75;
      })(),
      hasStrike: !!card.querySelector('.ch-offer-was'),
      text: (card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70)
    });
  });
  return { rows, vw: innerWidth, vh: innerHeight };
};

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
}

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
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6500);
  const w = await p.$('button:has-text("ENDELEA NDANI")');
  if (w) { try { await w.click({ timeout: 1200 }); } catch (e) {} }
  await p.waitForTimeout(1000);
  await p.evaluate(`(${SEED.toString()})()`);
  await p.waitForTimeout(1000);
  const { rows } = await p.evaluate(`(${MEASURE.toString()})()`);

  console.log('\n[' + tag + ' ' + vp.width + 'x' + vp.height + '] kadi ' + rows.length);
  ok('kadi zote za majadiliano zimechorwa', rows.length === 3, 'zimepatikana ' + rows.length);
  ok('hakuna page error', errs.length === 0, errs[0]);

  const nego = rows.filter(r => r.kind === 'nego');
  const offer = rows.filter(r => r.kind === 'offer');

  // 1. Upana sawa pande zote (mtumaji na mpokeaji)
  const widths = nego.map(r => r.w);
  ok('kadi za negotiation zina upana sawa pande zote',
    Math.max(...widths) - Math.min(...widths) <= 2, 'upana: ' + widths.join('/'));

  // 2. Si kubwa kupita kiasi
  const cap = mob ? vp.width - 12 : 424;
  ok('upana wa kadi hauzidi ' + cap + 'px',
    rows.every(r => r.w <= cap), rows.map(r => r.w).join('/'));

  // 3. Urefu wa kadi unadhibitiwa (hakuna kadi ndefu inayobana)
  const maxH = mob ? 360 : 300;
  ok('urefu wa kadi ≤ ' + maxH + 'px', rows.every(r => r.h <= maxH), rows.map(r => r.h).join('/'));

  // 4. Fremu MOJA: bubble yenye kadi haina rangi/wima/padding
  ok('bubble yenye kadi haina fremu ya pili',
    rows.every(r => /rgba\(0, 0, 0, 0\)|transparent/.test(r.bubBg) && parseFloat(r.bubPad) === 0),
    rows.map(r => r.bubBg + '|' + r.bubPad).join(' , '));

  // 5. Kadi haigopi nje ya safu ya mazungumzo
  ok('kadi haivuki safu ya mazungumzo',
    rows.every(r => r.left >= r.colL - 1 && r.right <= r.colR + 1),
    rows.map(r => r.left + '-' + r.right + ' vs ' + r.colL + '-' + r.colR).join(' ; '));

  // 6. Vitufe vinaingia ndani ya kadi (hakuna kubana/kukatwa)
  ok('vitufe vinaingia ndani ya kadi', rows.every(r => !r.btnOverflow),
    rows.filter(r => r.btnOverflow).map(r => r.kind + ' ' + r.btnCount).join(', '));

  // 7. Masharti yamepangwa kama vigae (2 kwa mstari) + jumla ina mstari wake
  ok('masharti ni vigae na jumla ina mstari wake', rows.every(r => r.terms >= 2 && r.totalTileWide),
    rows.map(r => r.terms + '|' + r.totalTileWide).join(' '));

  // 8. Kadi ya ofa inaonyesha bei ya awali (ilikuwa) kama maandishi madogo
  ok('ofa inaonyesha bei ya awali', offer.length === 1 && offer[0].hasStrike);

  // 9. Hakuna mlipuko wa upana kwenye ukurasa
  const hOv = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok('hakuna mlipuko wa upana (horizontal overflow)', !hOv);

  if (tag === 'desktop' || tag === 'mobile') {
    await p.screenshot({ path: `audit-shots/nego-${tag}.png` });
  }
  await ctx.close();
}

await b.close();
console.log('\nNEGO CHAT CARDS: ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
