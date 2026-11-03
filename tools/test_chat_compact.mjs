/* Regression: chat inbox compact + readable (not oversized) conversation cards.
   Run: LD_LIBRARY_PATH=... node tools/test_chat_compact.mjs                       */
import { chromium } from 'playwright';
const BASE = 'http://localhost:8080/';
let pass = 0, fail = 0;
const ok  = (n, c, d) => { c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + JSON.stringify(d))); };

const seedSrc = (() => {
  const fn = () => {
    const now = Date.now();
    const conv = (id, name, role, lastText, minsAgo, unread, extra) => Object.assign({
      id, participants:['u1','x'+id], participantMeta:{ ['x'+id]:{ name, photo:'', verified: role==='seller', role } },
      lastMessage:{ type:'text', text:lastText }, lastMessageAt:new Date(now - minsAgo*60000).toISOString(),
      unread:{ u1: unread }, type:'direct'
    }, extra || {});
    const rows = [
      conv('c1','Duka la Kariakoo','seller','Naweza kukupa TSh 32,000 kwa hiyo set', 3, 2),
      conv('c2','Amina Mwikwabe','user','Sawa, nitakuja kesho asubuhi kuchukua', 25, 0),
      conv('c3','Kariakoo Mobile','seller','Bei ya mwisho ni TSh 400,000.', 120, 0),
      conv('c4','Usafiri wa Haraka','delivery','Nipo Kariakoo, nakuja kuchukua mzigo', 300, 1),
      Object.assign(conv('c5','Wanunuzi wa Jumla','group','Tunahitaji vitanda 20', 600, 0), { type:'group', name:'Wanunuzi wa Jumla', participants:['u1','a','b'], participantMeta:{} })
    ];
    window.skh.currentUser = { uid:'u1', email:'demo@example.test', displayName:'Demo Seller' };
    window.skh.currentUserData = { displayName:'Demo Seller', role:'seller' };
    window.__authResolved = true;
    const snapOf = (arr) => ({ docs: arr.map(d => ({ id:d.id, data:()=>d })), empty:arr.length===0, size:arr.length,
      forEach(fn2){ arr.forEach(d => fn2({ id:d.id, data:()=>d })); } });
    window.skh.getDocs = async () => snapOf(rows);
    return window.openChatList();
  };
  return fn.toString();
})();

const openInbox = async (p) => {
  return p.evaluate(async (src) => {
    const f = new Function('return (' + src + ')')();
    await f();
    await new Promise(r => setTimeout(r, 2600));
    return true;
  }, seedSrc);
};

const b = await chromium.launch();
for (const vp of [{ width: 1280, height: 900, tag: 'desktop' }, { width: 390, height: 844, tag: 'mobile' }]) {
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.tag === 'mobile', isMobile: vp.tag === 'mobile' });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4600);
  await openInbox(p);

  /* ---------------- INBOX ---------------- */
  const inbox = await p.evaluate(() => {
    const shell = document.querySelector('#chatListModal .ch-inbox-shell');
    const rows = [...document.querySelectorAll('#inboxList .ch-contact')];
    const r0 = rows[0];
    const rcs = r0 ? getComputedStyle(r0) : null;
    const av = r0 && r0.querySelector('.ch-identity-avatar, .ch-cc-avatar');
    const nb = r0 && r0.querySelector('.ch-name-block');
    const msg = r0 && r0.querySelector('.ch-cc-msg');
    const chips = document.getElementById('inboxChips');
    const nm = r0 && r0.querySelector('.ch-name-block, .ch-cc-msg');
    return {
      shellW: shell ? Math.round(shell.getBoundingClientRect().width) : 0,
      shellH: shell ? Math.round(shell.getBoundingClientRect().height) : 0,
      vh: window.innerHeight,
      rows: rows.length,
      rowH: r0 ? Math.round(r0.getBoundingClientRect().height) : 0,
      radius: rcs && rcs.borderTopLeftRadius,
      borderW: rcs && rcs.borderTopWidth,
      shadow: rcs && rcs.boxShadow,
      marginBottom: rcs && rcs.marginBottom,
      avW: av ? Math.round(av.getBoundingClientRect().width) : 0,
      nameFs: nb ? parseFloat(getComputedStyle(nb).fontSize) : 0,
      msgFs: msg ? parseFloat(getComputedStyle(msg).fontSize) : 0,
      msgClipped: msg ? msg.scrollWidth > msg.clientWidth + 1 : false,
      chipsOverflow: chips ? chips.scrollWidth > chips.clientWidth : false,
      chipsAllVisible: (() => {
        if (!chips) return false;
        const cr = chips.getBoundingClientRect();
        return [...chips.querySelectorAll('.ch-tab')].every(t => {
          const r = t.getBoundingClientRect();
          return r.left >= cr.left - 1 && r.right <= cr.right + 1;
        });
      })(),
      rowW: r0 ? Math.round(r0.getBoundingClientRect().width) : 0,
      namePill: nb ? getComputedStyle(nb).borderTopWidth + '/' + getComputedStyle(nb).backgroundColor : '',
      listScrolls: (() => { const l = document.getElementById('inboxList'); return l ? getComputedStyle(l).overflowY : ''; })()
    };
  });
  console.log(`\n[${vp.tag}] INBOX ` + JSON.stringify(inbox));
  ok(`inbox row height compact (<=64)`, inbox.rowH > 0 && inbox.rowH <= 64, inbox);
  ok(`inbox rows are flat rows (no card shadow/radius)`,
     (inbox.shadow === 'none' || inbox.shadow === '') && inbox.marginBottom === '0px', inbox);
  ok(`inbox name is plain text (no pill frame)`, inbox.namePill.startsWith('0px'), inbox);
  ok(`inbox avatar <= 44px`, inbox.avW > 0 && inbox.avW <= 44, inbox);
  ok(`inbox name font readable 13-15px`, inbox.nameFs >= 13 && inbox.nameFs <= 15, inbox);
  ok(`inbox preview font readable 11.5-13px`, inbox.msgFs >= 11.5 && inbox.msgFs <= 13, inbox);
  // Chips zote zinaonekana, au mstari unateleza — hakuna kinachokatika "ghafla".
  ok(`inbox chips zote zinaonekana au zinapita kwa kuteleza`,
     inbox.chipsOverflow || inbox.chipsAllVisible, inbox);
  // [FULLSCREEN 2026-11-02] Inbox ni ukurasa kamili — huchukua skrini yote.
  ok(`inbox page covers the whole viewport`, inbox.shellH >= inbox.vh - 2, inbox);
  // Ukurasa ni skrini yote, lakini safu ya maudhui inabaki inayosomeka.
  if (vp.tag === 'desktop') ok(`desktop inbox content column stays readable (<=960)`, inbox.rowW > 0 && inbox.rowW <= 960, inbox);
  ok(`inbox list scrolls internally`, /auto|scroll/.test(inbox.listScrolls), inbox);

  /* ---------------- CONVERSATION ---------------- */
  await p.evaluate(() => {
    document.getElementById('chatListModal').style.display = 'none';
    const m = document.getElementById('chatModal'); m.style.display = 'flex'; m.classList.add('open');
    const t = (x) => new Date(Date.now() - x * 60000).toISOString();
    window.skh.chatCore = Object.assign(window.skh.chatCore || {}, {
      convId: 'c1', partnerUid: 'x1', conv: { id: 'c1', participants: ['u1', 'x1'] },
      msgs: [
        { id:'m1', type:'text', text:'Habari, hii set bado ipo?', senderId:'u1', createdAt:t(9) },
        { id:'m2', type:'text', text:'Ndiyo ipo. Bei ni TSh 45,000 kwa set kamili.', senderId:'x1', createdAt:t(8) },
        { id:'m3', type:'product', senderId:'x1', createdAt:t(7),
          productSnapshot:{ title:'Set ya vitanda vya mbao', price:45000, sellerId:'x1' } },
        { id:'m4', type:'text', text:'Naweza kupata kwa TSh 38,000?', senderId:'u1', createdAt:t(6) },
        { id:'m5', type:'offer', senderId:'u1', createdAt:t(5),
          offer:{ productTitle:'Set ya vitanda vya mbao', qty:1, price:38000, originalPrice:45000, status:'pending' } },
        { id:'m6', type:'text', text:'Sawa, TSh 40,000 na nitakuletea hadi kwako.', senderId:'x1', createdAt:t(4) }
      ]
    });
    window.skhChatRenderStream();
  });
  await p.waitForTimeout(900);
  const convo = await p.evaluate(() => {
    const box = document.getElementById('chatMessages');
    const cs = getComputedStyle(box);
    const bub = box.querySelector('.chat-bubble');
    const bcs = bub ? getComputedStyle(bub) : null;
    const card = box.querySelector('.ch-card') || box.querySelector('.ch-offer-msg');
    const cardCs = card ? getComputedStyle(card) : null;
    const acts = [...box.querySelectorAll('.ch-actions')];
    const btn = box.querySelector('.ch-nego-btn') || box.querySelector('.ch-offer-msg-actions button');
    const btnCs = btn ? getComputedStyle(btn) : null;
    const row = box.querySelector('.ch-msg');
    const rcs = row ? getComputedStyle(row) : null;
    return {
      bubFs: bub ? parseFloat(bcs.fontSize) : 0,
      bubPad: bub ? bcs.padding : '',
      bubW: bub ? Math.round(bub.getBoundingClientRect().width) : 0,
      bubPct: bub ? Math.round(bub.getBoundingClientRect().width / box.clientWidth * 100) : 0,
      cardH: card ? Math.round(card.getBoundingClientRect().height) : 0,
      cardW: card ? Math.round(card.getBoundingClientRect().width) : 0,
      cardPct: card ? Math.round(card.getBoundingClientRect().width / box.clientWidth * 100) : 0,
      cardShadow: cardCs && cardCs.boxShadow,
      btnH: btn ? Math.round(btn.getBoundingClientRect().height) : 0,
      btnFs: btn ? parseFloat(btnCs.fontSize) : 0,
      msgRowMaxW: row ? Math.round(row.getBoundingClientRect().width) : 0,
      boxW: box.clientWidth,
      actionsVisible: acts.filter(a => a.offsetParent !== null && a.getBoundingClientRect().height > 2).length,
      actionsTotal: acts.length,
      avatarInCard: !!box.querySelector('.ch-card img')
    };
  });
  console.log(`[${vp.tag}] CONVO ` + JSON.stringify(convo));
  ok(`bubble text readable 13.5-15px`, convo.bubFs >= 13.5 && convo.bubFs <= 15, convo);
  ok(`bubble width <= 80% of stream`, convo.bubPct <= 80, convo);
  ok(`message rows stay in a readable column (<=820px)`, convo.msgRowMaxW <= 820, convo);
  ok(`conversation card compact (<=150px tall)`, convo.cardH > 0 && convo.cardH <= 150, convo);
  ok(`conversation card not oversized (<=88% width)`, convo.cardPct <= 88, convo);
  ok(`conversation card has no heavy shadow`, convo.cardShadow === 'none' || convo.cardShadow === '', convo);
  ok(`in-card action buttons compact 26-32px`, convo.btnH >= 26 && convo.btnH <= 32, convo);
  ok(`in-card action font >= 11px`, convo.btnFs >= 11, convo);
  if (vp.tag === 'mobile') ok(`mobile: per-message action bars hidden by default`, convo.actionsVisible === 0, convo);
  if (vp.tag === 'desktop') ok(`desktop: per-message action bars hidden until hover`, convo.actionsVisible <= 1, convo);

  await ctx.close();
}
await b.close();
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
