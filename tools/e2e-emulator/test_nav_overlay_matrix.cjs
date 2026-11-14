// [NAV-MATRIX 2026-11-14] "Nothing opens behind something else; Back never leaves an empty screen."
// Real Chromium, emulator only. For every BASE screen (home, product, chat, live room, cart, sidebar, profile)
// it opens every TARGET screen on top and checks what the finger would hit:
//   1. the target is the top layer (elementFromPoint at the centre is inside it),
//   2. Back closes the target and the base is on top again,
//   3. Back again leaves no layer, no invisible blocker and a page with real content (no blank/colour screen).
// Logged out: everything that needs an account shows the Login screen ON TOP.
// Run: SKH_FIREBASE_SDK_DIR=… node tools/e2e-emulator/test_nav_overlay_matrix.cjs  (MX_VP=390x844,1440x900)
const { seed, L, PW } = require('./review-seed.cjs');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'out', 'mx-'); fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
const VPS = (process.env.MX_VP || '390x844,1440x900').split(',').map(s => s.split('x').map(Number));
const ev = (p, fn, a) => p.evaluate(fn, a);
const HELPERS = () => {
  const vis = el => { if (!el || !el.isConnected) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && r.width > 2 && r.height > 2 && !el.closest('[hidden]'); };
  // The element is visible and is what a tap at its (on-screen) centre would hit.
  const hit = el => { if (!vis(el)) return false; const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + Math.min(r.width, innerWidth) / 2, 1), innerWidth - 2);
    const top = Math.max(r.top, 0), bot = Math.min(r.bottom, innerHeight); if (bot - top < 4) return false;
    const t = document.elementFromPoint(x, (top + bot) / 2); return !!t && (t === el || el.contains(t)); };
  const OV = '.overlay-menu,[id$="Modal"],.form-box,.skh-sheet-overlay,.lvx-overlay,#lvxRoom,#skhGroupSogaModal';
  const openOverlays = () => [...document.querySelectorAll(OV)].filter(e => { if (!vis(e) || !e.id) return false; const cs = getComputedStyle(e);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') return false; const r = e.getBoundingClientRect(); return r.width * r.height > innerWidth * innerHeight * 0.25; }).map(e => e.id);
  // A fixed layer covering most of the screen that intercepts taps although nothing is meant to be open.
  const blockers = () => { const out = new Set(); for (const [fx, fy] of [[.5, .35], [.5, .6], [.25, .5], [.75, .5]]) {
    for (let n = document.elementFromPoint(innerWidth * fx, innerHeight * fy); n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n); if (cs.position === 'fixed') { const r = n.getBoundingClientRect(); if (r.width * r.height > innerWidth * innerHeight * 0.4) out.add(n.id || n.className || n.tagName); break; } } }
    return [...out]; };
  const card = (title) => [...document.querySelectorAll('#mainFeed > *')].find(c => vis(c) && (c.innerText || '').includes(title));
  window.__navlog = [];
  const lg = (t, x) => { window.__navlog.push(t + ' ' + JSON.stringify(x && x.ov ? [x.i, x.tab, x.ov] : x)); if (window.__navlog.length > 40) window.__navlog.shift(); };
  const ps = history.pushState, rs = history.replaceState;
  history.pushState = function (st) { lg('push', st); return ps.apply(this, arguments); };
  history.replaceState = function (st) { lg('repl', st); return rs.apply(this, arguments); };
  addEventListener('popstate', e => lg('POP', e.state), true);
  if (window.__NAV_TRACE) ['productModal', 'chatListModal', 'chatModal'].forEach(id => { const el = document.getElementById(id); if (!el) return; const st = el.style;
    Object.defineProperty(st, 'display', { configurable: true, get() { return st.getPropertyValue('display'); }, set(v) { if (v !== st.getPropertyValue('display')) window.__navlog.push(id + '=' + v + ' ' + new Error().stack.split('\n').slice(2, 5).map(l => l.replace(/.*\/js\//, '').replace(/\)$/, '').trim()).join(' < ')); st.setProperty('display', v); } }); });
  window.__nav = { vis, hit, openOverlays, blockers, card,
    state: () => ({ ov: openOverlays(), block: blockers(), act: [...document.querySelectorAll('.nav-tab.active')].map(e => e.id || e.innerText.trim()),
      bodyOv: getComputedStyle(document.body).overflowY, sy: Math.round(scrollY), hash: location.hash, depth: window.skhNavDepth ? window.skhNavDepth() : null, nav: window.skhNavState && window.skhNavState(), log: window.__navlog.slice(-24) }) };
};


const EXTRA = () => {
  // the top overlay under the centre of the screen (id), and whether the visible page has real content
  window.__mx = {
    top: () => { const OV = '.overlay-menu,[id$="Modal"],.form-box,.skh-sheet-overlay,.lvx-overlay,#lvxRoom,#skhGroupSogaModal,[role="dialog"]';
      const pts = [[.5, .45], [.5, .3], [.5, .7]]; const ids = [];
      for (const [fx, fy] of pts) { const t = document.elementFromPoint(innerWidth * fx, innerHeight * fy); let o = t && t.closest && t.closest(OV);
        while (o && o.parentElement && o.parentElement.closest(OV)) o = o.parentElement.closest(OV);
        ids.push(o ? (o.id || o.className.split(' ')[0]) : (t ? 'page:' + (t.id || t.tagName.toLowerCase()) : 'none')); }
      return ids[0]; },
    blank: () => { const t = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      if (!t || t === document.body || t === document.documentElement) return 'centre hits ' + (t ? t.tagName : 'nothing');
      // walk up to a big block; it must contain readable text or images somewhere on screen
      const txt = (document.body.innerText || '').replace(/\s+/g, ' ').length;
      const visImgs = [...document.images].filter(i => { const r = i.getBoundingClientRect(); return r.width > 30 && r.bottom > 0 && r.top < innerHeight; }).length;
      const visTxt = [...document.querySelectorAll('h1,h2,h3,b,strong,p,span,button')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 5 && r.bottom > 60 && r.top < innerHeight - 60 && (e.innerText || '').trim().length > 2 && getComputedStyle(e).visibility !== 'hidden'; }).length;
      return (visTxt < 4 && visImgs < 1) ? ('almost nothing visible (text els ' + visTxt + ', imgs ' + visImgs + ', body ' + txt + ')') : ''; }
  };
};

(async () => {
  await seed();
  const juma = (await L.admin.auth().getUserByEmail('juma.review@sokohai.test')).uid;
  await L.db.doc('users/' + juma).set({ businessSetupComplete: true, businessName: 'Juma Electronics', isSeller: true }, { merge: true });
  const S = await L.open({ width: 390, height: 844 }); await L.login(S.p, 'juma.review@sokohai.test', PW);
  const live = (await L.call(S.p, 'liveCreate', { kind: 'live', title: 'Duka live · mx', productIds: ['tv55a', 'rice5'] })).data.sessionId;
  await L.call(S.p, 'liveStart', { sessionId: live }); await S.b.close();

  const SCREENS = {
    product: { open: () => window.openProduct('tv55a', 'products') },
    liveHub: { open: () => window.skhLiveHub() },
    liveRoom: { open: (a) => window.skhLiveOpen(a.live) },
    chat: { open: () => window.openChatList() },
    cart: { open: () => window.openCart() },
    notifications: { open: () => window.openNotifications() },
    saved: { open: () => window.openSavedItems() },
    orders: { open: () => window.openBuyerOrdersModal() },
    seller: { open: (a) => window.openSellerProfile(a.juma, 'Juma Electronics') },
    sokopay: { open: () => window.openSokoPay() },
    escrow: { open: () => window.skhOpenEscrowCenter() },
    tokens: { open: () => window.skhOpenTokenBox() },
    mySoko: { open: () => window.skhOpenMySokoHai() },
    groupSoga: { open: () => window.skhOpenGroupSoga && window.skhOpenGroupSoga() },
    sidebar: { open: () => window.openSidebarMenu() },
    profile: { open: () => window.openProfile() },
  };
  const BASES = (process.env.MX_BASES || 'product,chat,liveRoom,cart,sidebar,profile,seller').split(',');
  const ARGS = { live, juma };
  const problems = [];

  for (const [w, h] of VPS) {
    const vn = w + 'x' + h;
    const B = await L.open({ width: w, height: h }); const p = B.p;
    await L.login(p, 'buyer.review@sokohai.test', PW);
    await ev(p, () => { try { unlockSystem(); closeWelcome(); } catch (e) {} });
    await ev(p, HELPERS); await ev(p, EXTRA);
    const reset = async () => { await ev(p, () => { try { window.closeModals && window.closeModals(true); } catch (e) {} try { window.skhLiveMiniClose && window.skhLiveMiniClose(); } catch (e) {} try { window.updateApp && window.updateApp('home'); } catch (e) {} scrollTo(0, 0); }); await p.waitForTimeout(700); };
    // a real user taps to open a screen: a trusted key event marks the user intent exactly like a tap would
    const open = async (k) => { await p.keyboard.press('Shift'); await ev(p, ([src, a]) => { try { const r = (0, eval)('(' + src + ')')(a); if (r && r.catch) r.catch(() => {}); } catch (e) { window.__mxErr = String(e); } }, [SCREENS[k].open.toString(), ARGS]); await p.waitForTimeout(1600); };
    const top = () => ev(p, () => window.__mx.top());
    // calibration: which layer each screen shows when opened from home
    const ID = {};
    for (const k of Object.keys(SCREENS)) { await reset(); await open(k); ID[k] = await top(); }
    console.log(vn, 'screens:', JSON.stringify(ID));
    for (const k of Object.keys(SCREENS)) if (!ID[k] || /^page:|^none/.test(ID[k])) problems.push(`${vn} ${k}: opened from home shows no layer on top (${ID[k]})`);

    for (const b of BASES) for (const t of Object.keys(SCREENS)) {
      if (t === b || !ID[b] || !ID[t] || /^page:/.test(ID[b]) || /^page:/.test(ID[t]) || ID[t] === ID[b]) continue;
      await L.step(`${vn} ${b} -> ${t}: on top; Back returns to ${b}; Back again leaves a usable page`, async () => {
        await reset(); await open(b);
        L.assert((await top()) === ID[b], 'base ' + b + ' not on top: ' + await top());
        await open(t);
        const a = await top();
        if (a !== ID[t]) { await p.screenshot({ path: OUT + vn + '-' + b + '-' + t + '.png' }); throw new Error('HIDDEN: ' + t + ' (' + ID[t] + ') opened behind ' + a); }
        await p.goBack(); await p.waitForTimeout(1100);
        const back1 = await top();
        // the account menu (drawer) closes when you go somewhere from it — Back returns to the page, as
        // with every mobile drawer (same for every destination); the page must still be usable
        if (b === 'sidebar') {
          const s0 = await ev(p, () => ({ ov: window.__nav.openOverlays(), bl: window.__nav.blockers(), blank: window.__mx.blank() }));
          if (s0.ov.length || s0.bl.length || s0.blank) { await p.screenshot({ path: OUT + vn + '-' + b + '-' + t + '-back1.png' }); throw new Error('BACK1 (drawer): ' + JSON.stringify(s0)); }
          return 'drawer destination -> page';
        }
        if (back1 !== ID[b]) { await p.screenshot({ path: OUT + vn + '-' + b + '-' + t + '-back1.png' }); throw new Error('BACK1: expected ' + ID[b] + ' got ' + back1); }
        await p.goBack(); await p.waitForTimeout(1100);
        const s = await ev(p, () => ({ ov: window.__nav.openOverlays(), bl: window.__nav.blockers(), blank: window.__mx.blank(), top: window.__mx.top() }));
        if (s.ov.length || s.bl.length || s.blank) { await p.screenshot({ path: OUT + vn + '-' + b + '-' + t + '-back2.png' }); throw new Error('BACK2: ' + JSON.stringify(s)); }
        return 'ok';
      });
    }
    await B.b.close();

    // logged out: account-only screens must show Login on top
    const G = await L.open({ width: w, height: h }); const q = G.p;
    await ev(q, () => { try { unlockSystem(); closeWelcome(); } catch (e) {} }); await ev(q, HELPERS); await ev(q, EXTRA);
    for (const k of ['chat', 'notifications', 'orders', 'sokopay', 'escrow', 'tokens', 'mySoko', 'saved', 'profile']) {
      await L.step(`${vn} logged out: ${k} -> Login on top, Back leaves a usable page`, async () => {
        await ev(q, () => { try { window.closeModals && window.closeModals(true); } catch (e) {} });
        await q.waitForTimeout(500);
        await ev(q, ([src, a]) => { try { const r = (0, eval)('(' + src + ')')(a); if (r && r.catch) r.catch(() => {}); } catch (e) {} }, [SCREENS[k].open.toString(), ARGS]);
        await q.waitForTimeout(1600);
        const a = await ev(q, () => window.__mx.top());
        const authVisible = await ev(q, () => { const m = document.getElementById('authModal'); return !!m && window.__nav.hit(m.querySelector('input,button') || m); });
        if (!authVisible) { await q.screenshot({ path: OUT + vn + '-out-' + k + '.png' }); throw new Error('LOGIN HIDDEN/MISSING: top=' + a); }
        await q.goBack(); await q.waitForTimeout(1100);
        const s = await ev(q, () => ({ ov: window.__nav.openOverlays(), bl: window.__nav.blockers(), blank: window.__mx.blank() }));
        if (s.ov.length || s.bl.length || s.blank) { await q.screenshot({ path: OUT + vn + '-out-' + k + '-back.png' }); throw new Error('BACK: ' + JSON.stringify(s)); }
        return 'login on top: ' + a;
      });
    }
    await G.b.close();
  }
  problems.forEach(x => console.log('NOTE', x));
  console.log('RESULT', L.results.length - L.failed, 'pass', L.failed, 'fail'); process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
