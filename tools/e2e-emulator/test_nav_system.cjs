// [NAV 2026-11-13] Navigation system — real Chromium, real taps, emulator only.
// For every viewport (390x844, 360x800, 768x1024, 1440x900) it walks examples A–J of the
// navigation audit and checks what the user SEES: the destination is visible AND is the element
// under the finger (elementFromPoint), the right tab is active, no second page/overlay stays open,
// no invisible layer blocks taps, the page scrolls, Back/Forward follow the real history.
// Run: SKH_FIREBASE_SDK_DIR=… node tools/e2e-emulator/test_nav_system.cjs   (NAV_VP=390x844 for one size,
//      NAV_TRACE=1 to log who shows/hides product/chat overlays into the failure dumps in out/)
const { seed, L, PW } = require('./review-seed.cjs');
const OUT = require('path').join(__dirname, 'out', 'nav-');
const VPS = (process.env.NAV_VP || '390x844,360x800,768x1024,1440x900').split(',').map(s => s.split('x').map(Number));
const ev = (p, fn, a) => p.evaluate(fn, a);

// Installed in the page: what is on screen right now.
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

(async () => {
  await seed();
  const juma = (await L.admin.auth().getUserByEmail('juma.review@sokohai.test')).uid;
  await L.db.doc('users/' + juma).set({ businessSetupComplete: true, businessName: 'Juma Electronics', isSeller: true }, { merge: true });
  // Provider registers a real service through the Huduma Hub form (same path as test_r16_service_journey).
  const S = await L.open({ width: 390, height: 844 }); await L.login(S.p, 'juma.review@sokohai.test', PW);
  await ev(S.p, () => { try { unlockSystem(); closeWelcome(); } catch (e) {} });
  const SVC = 'Fundi Bomba wa Haraka · nav';
  await ev(S.p, () => window.showForm('serviceForm')); await S.p.waitForTimeout(700);
  await S.p.selectOption('#servGroupType', 'physical'); await S.p.waitForTimeout(400);
  const cat = await ev(S.p, () => { const o = [...document.getElementById('servHubCategory').options].find(o => o.value); return o && o.value; });
  await S.p.selectOption('#servHubCategory', cat); await S.p.waitForTimeout(400);
  const sub = await ev(S.p, () => { const o = [...document.getElementById('servHubSubCategory').options].find(o => o.value); return o && o.value; });
  await S.p.selectOption('#servHubSubCategory', sub);
  await S.p.fill('#servHubTitle', SVC); await S.p.fill('#servHubPrice', '45000');
  await S.p.fill('#servHubDesc', 'Kurekebisha mabomba yanayovuja.'); await S.p.fill('#servHubLocation', 'Dar es Salaam');
  await ev(S.p, () => window.submitSokohaiService()); await S.p.waitForTimeout(3000);
  const svcQ = await L.db.collection('services').where('userId', '==', juma).get();
  if (svcQ.size < 1) throw new Error('setup: service not created');
  const live = (await L.call(S.p, 'liveCreate', { kind: 'live', title: 'Duka live · nav', productIds: ['tv55a', 'rice5'] })).data.sessionId;
  if (!(await L.call(S.p, 'liveStart', { sessionId: live })).ok) throw new Error('setup: liveStart');
  await S.b.close();

  for (const [w, h] of VPS) {
    const vn = w + 'x' + h;
    const B = await L.open({ width: w, height: h }); const p = B.p;
    await L.login(p, 'buyer.review@sokohai.test', PW);
    if (process.env.NAV_TRACE) await ev(p, () => { window.__NAV_TRACE = 1; });
    await ev(p, HELPERS);
    const st = () => ev(p, () => window.__nav.state());
    const waitHit = (fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 6000 }).then(() => true, () => false);
    const noLayer = async (why) => { const s = await st(); L.assert(!s.ov.length && !s.block.length, why + ': layer left open ' + JSON.stringify(s)); return s; };
    // Tap like a finger: fails (with the culprit) if something else covers the target.
    const tap = async (sel) => {
      // the bottom bar hides while scrolling down (by design) — a small scroll up brings it back, as a thumb would
      if (/navTab|nav-tab/.test(sel) && !(await ev(p, (q) => window.__nav.hit(document.querySelector(q)), sel))) { await p.mouse.move(w / 2, h / 2); await p.mouse.wheel(0, -120); await p.waitForTimeout(450); }
      const who = await ev(p, (q) => { const el = document.querySelector(q); if (!el) return 'missing ' + q; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (t && (t === el || el.contains(t))) return '';
        const path = []; for (let n = t; n && path.length < 5; n = n.parentElement) path.push(n.id ? '#' + n.id : n.tagName.toLowerCase() + '.' + String(n.className || '').split(' ')[0]); return 'covered by ' + path.join('<'); }, sel);
      L.assert(!who, sel + ' ' + who);
      await p.click(sel, { timeout: 5000 });
    };
    const fresh = async () => { await ev(p, () => { window.closeModals && window.closeModals(true); try { window.skhLiveMiniClose && document.getElementById('lvxMini') && window.skhLiveMiniClose(); } catch (e) {} scrollTo(0, 0); }); await p.waitForTimeout(600); };
    const scrolls = async () => { const a = await ev(p, () => { scrollTo(0, 0); return document.scrollingElement.scrollHeight > innerHeight + 50; });
      if (!a) return true;
      const lock = await ev(p, () => [getComputedStyle(document.body).overflowY, getComputedStyle(document.documentElement).overflowY].includes('hidden'));
      if (lock) return false;
      for (const fy of [0.5, 0.75]) { await p.mouse.move(w / 2, h * fy); await p.mouse.wheel(0, 500); await p.waitForTimeout(400); if ((await ev(p, () => scrollY)) > 0) return true; }
      return false; };

    const step = (name, fn) => L.step(name, async () => { try { return await fn(); } catch (e) {
      try { require('fs').writeFileSync(OUT + name.replace(/\W+/g, '_').slice(0, 60) + '.json', JSON.stringify({ err: e.message, st: await st() }, null, 1)); await p.screenshot({ path: OUT + name.replace(/\W+/g, '_').slice(0, 60) + '.png' }); } catch (e2) {}
      throw e; } });
    await step(`${vn} 0 first visit: welcome card closes with its own button and leaves nothing behind`, async () => {
      const shown = await waitHit(() => window.__nav.hit(document.getElementById('welcomeModal')), null, 4000);
      if (shown) { await p.click('#welcomeModal button[data-i18n="onboard_cta"]'); await p.waitForTimeout(500); }
      await noLayer('after welcome');
      return shown ? 'welcome shown + closed' : 'welcome not shown';
    });

    await step(`${vn} A Home -> Huduma: services page visible at once, tab active, nothing on top`, async () => {
      await tap('#navTabHuduma');
      // rendered at once; on short screens it may sit below the fold, so bring it up like a thumb would
      const ok = await waitHit((t) => { const c = window.__nav.card(t); if (!c) return false; if (!window.__nav.hit(c)) c.scrollIntoView({ block: 'center' }); return window.__nav.hit(c); }, SVC, 8000);
      const s = await st();
      L.assert(ok, 'service card not visible/tappable ' + JSON.stringify(s));
      L.assert(s.act.includes('navTabHuduma') && !s.act.includes('navTabHome'), 'active ' + s.act);
      L.assert(await ev(p, () => window.__nav.vis(document.getElementById('serviceModesNav')) && !window.__nav.vis(document.getElementById('marketModesNav'))), 'sub-nav');
      await noLayer('Huduma');
      await p.screenshot({ path: OUT + vn + '-A-huduma.png' });
      return 'tab ' + s.act.join(',');
    });

    await step(`${vn} B Bidhaa -> product -> Back: product closes, list and scroll position kept`, async () => {
      await tap('#navTabBidhaa');
      L.assert(await waitHit(() => !!window.__nav.card('Sofa ya Mninga'), null, 8000), 'product list');
      const sy = await ev(p, () => { const c = window.__nav.card('Sofa ya Mninga'); c.scrollIntoView({ block: 'center' }); return Math.round(scrollY); });
      await p.waitForTimeout(500);
      const sy0 = await ev(p, () => Math.round(scrollY));
      await p.click('#mainFeed > *:has-text("Sofa ya Mninga")');
      L.assert(await waitHit(() => window.__nav.hit(document.getElementById('productModal')) && /Sofa/.test((document.getElementById('pmTitle') || {}).textContent || ''), null, 8000), 'product page not visible ' + JSON.stringify(await st()));
      const syOpen = await ev(p, () => Math.round(scrollY));   // the list position behind the product page
      await p.goBack(); await p.waitForTimeout(900);
      const s = await st();
      L.assert(!(await ev(p, () => window.__nav.vis(document.getElementById('productModal')))), 'product still open after Back');
      await noLayer('after Back');
      L.assert(s.sy > 200 && Math.abs(s.sy - sy0) <= 120, 'scroll ' + sy0 + '/' + syOpen + ' -> ' + s.sy);
      L.assert(s.act.includes('navTabBidhaa'), 'tab after Back ' + s.act);
      L.assert(await ev(p, () => window.__nav.hit(window.__nav.card('Sofa ya Mninga'))), 'card not tappable after Back');
      return 'scroll ' + sy0 + '/' + syOpen + ' -> ' + s.sy;
    });

    await step(`${vn} C cart -> checkout -> close: checkout shows alone, closing leaves the page usable`, async () => {
      await ev(p, () => { try { localStorage.removeItem('sokohai_smart_cart'); } catch (e) {} window.skh.myCart = []; window.skh.smartCartSave && window.skh.smartCartSave(); });
      await tap('#navTabBidhaa'); await p.waitForTimeout(1200);
      await p.click('#mainFeed > *:has-text("Mbolea ya Urea")');
      L.assert(await waitHit(() => [...document.querySelectorAll('#pmActionArea button')].some(b => window.__nav.vis(b) && /^weka oda$/i.test(b.getAttribute('aria-label') || '')), null, 8000), 'order button');
      await p.click('#pmActionArea button[aria-label="Weka oda" i]'); await p.waitForTimeout(1500);
      L.assert(await ev(p, () => window.skh.smartCartItems().length) === 1, 'cart count');
      await fresh();
      await tap('#skhCartBtn');
      L.assert(await waitHit(() => window.__nav.hit(document.getElementById('cartModal')), null, 6000), 'cart not visible ' + JSON.stringify(await st()));
      await ev(p, () => window.skhDeliverySetRequired(false)); await p.waitForTimeout(400);
      await p.locator('#cartModal button', { hasText: /Kulipa/ }).first().click();
      await L.answer(p, null, 8000);
      L.assert(await waitHit(() => window.__nav.hit(document.getElementById('checkoutModal')) && !window.__nav.vis(document.getElementById('cartModal')), null, 15000), 'checkout not visible alone ' + JSON.stringify(await st()));
      await p.click('#checkoutModal button[onclick="closeModals()"]'); await p.waitForTimeout(700);
      L.assert(await waitHit(() => window.__nav.hit(document.getElementById('cartModal')) && !window.__nav.vis(document.getElementById('checkoutModal')), null, 4000), 'closing checkout did not return to the cart ' + JSON.stringify(await st()));
      await p.click('#cartModal button[onclick*="closeModals"]'); await p.waitForTimeout(600);
      await noLayer('after checkout + cart close');
      L.assert(await scrolls(), 'page does not scroll after checkout');
      await p.goBack(); await p.waitForTimeout(800);
      // Back walks to the previous real page (here the product the order came from) — never the closed checkout, never an empty layer
      const s2 = await st(); L.assert(!s2.ov.includes('checkoutModal') && s2.block.every(b => s2.ov.includes(b)), 'Back resurrected checkout / empty layer ' + JSON.stringify(s2));
      return 'cart -> checkout -> cart (order prepared, cart emptied by design) -> page';
    });

    await step(`${vn} D SokoPay: opens, tabs switch, close leaves no empty backdrop`, async () => {
      await fresh();
      await ev(p, () => window.openSokoPay());
      L.assert(await waitHit(() => window.__nav.hit(document.getElementById('spOverviewArea') || document.getElementById('sokopayForm')), null, 6000), 'SokoPay not visible ' + JSON.stringify(await st()));
      await p.click('#spBtn_pay').catch(() => ev(p, () => window.toggleSokoPayTab('pay')));
      await p.waitForTimeout(400);
      const tab = await ev(p, () => document.getElementById('spBtn_pay').classList.contains('active'));
      L.assert(tab, 'SokoPay tab did not switch');
      await p.goBack(); await p.waitForTimeout(800);
      await noLayer('after SokoPay Back');
      L.assert(await scrolls(), 'page does not scroll after SokoPay');
      return 'overview -> pay tab -> Back -> page';
    });

    await step(`${vn} E chat list -> conversation -> Back -> list -> Back -> page`, async () => {
      await fresh();
      // a real conversation first (typed + Enter), so the inbox has a row to tap
      await ev(p, (u) => window.openChatWithUser(u, 'Juma Electronics'), juma);
      await p.waitForSelector('#chatInput', { state: 'visible', timeout: 8000 });
      await p.fill('#chatInput', 'Habari, bado unayo mbolea? (nav)'); await p.press('#chatInput', 'Enter'); await p.waitForTimeout(2000);
      await ev(p, () => window.closeModals(true)); await p.waitForTimeout(400);
      await tap('.nav-tab[onclick*="openChatList"]');
      L.assert(await waitHit(() => window.__nav.hit(document.getElementById('chatListModal')), null, 6000), 'chat list ' + JSON.stringify(await st()));
      const row = p.locator('#chatListModal .ch-person-row[data-uid="' + juma + '"]').first();
      await row.waitFor({ state: 'visible', timeout: 8000 });
      await row.click();
      L.assert(await waitHit(() => window.__nav.hit(document.getElementById('chatModal')) && !window.__nav.hit(document.getElementById('chatListModal')), null, 8000), 'conversation ' + JSON.stringify(await st()));
      await p.goBack(); await p.waitForTimeout(800);
      L.assert(await waitHit(() => window.__nav.hit(document.getElementById('chatListModal')) && !window.__nav.vis(document.getElementById('chatModal')), null, 4000), 'Back did not return to the list ' + JSON.stringify(await st()));
      await p.goBack(); await p.waitForTimeout(800);
      await noLayer('after chat');
      L.assert(await scrolls(), 'page does not scroll after chat');
      return 'list -> chat -> list -> page';
    });

    await step(`${vn} F Huduma category -> service page -> request form -> Back twice`, async () => {
      await fresh();
      await tap('#navTabHuduma');
      L.assert(await waitHit((t) => !!window.__nav.card(t), SVC, 8000), 'service list');
      await p.click('#mainFeed > *:has-text("' + SVC + '")');
      L.assert(await waitHit(() => window.__nav.hit(document.getElementById('productModal')), null, 8000), 'service page ' + JSON.stringify(await st()));
      const reqBtn = p.locator('#productModal button', { hasText: /Agiza Huduma/i }).first();
      await reqBtn.waitFor({ state: 'visible', timeout: 8000 });
      // the button must be SEEN, not just present: its label colour must differ from what is behind it
      const op = await reqBtn.evaluate(b => { const bg = (el) => { for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
        const lbl = b.querySelector('.pm-bar-lbl') || b; return { fg: getComputedStyle(lbl).color, bg: bg(b), dis: b.disabled }; });
      L.assert(op.fg !== op.bg && !op.dis, 'request button invisible (label colour = background) ' + JSON.stringify(op));
      await reqBtn.click();
      const FORM = () => ['nfShell', 'actionRequestModal'].map(i => document.getElementById(i)).find(e => window.__nav.hit(e));
      L.assert(await waitHit(FORM, null, 8000), 'request form ' + JSON.stringify(await st()));
      const formId = await ev(p, () => { const e = ['nfShell', 'actionRequestModal'].map(i => document.getElementById(i)).find(e => window.__nav.hit(e)); return e.id; });
      await p.goBack(); await p.waitForTimeout(800);
      L.assert(await waitHit((f) => window.__nav.hit(document.getElementById('productModal')) && !window.__nav.vis(document.getElementById(f)), formId, 4000), 'Back did not return to the service page from ' + formId + ' ' + JSON.stringify(await st()));
      await p.goBack(); await p.waitForTimeout(800);
      await noLayer('after service');
      const s = await st(); L.assert(s.act.includes('navTabHuduma'), 'tab ' + s.act);
      return 'list -> page -> ' + formId + ' -> page -> list';
    });

    await step(`${vn} G Live: product from the room opens on top, closing it returns to the same live room`, async () => {
      await fresh();
      await ev(p, (s) => window.skhLiveOpen(s), live);
      L.assert(await waitHit(() => window.__nav.vis(document.getElementById('lvxRoom')), null, 10000), 'live room');
      await p.waitForTimeout(1500);
      await ev(p, () => window.skhLiveOpenProduct('rice5'));
      L.assert(await waitHit(() => window.__nav.hit(document.getElementById('productModal')), null, 8000), 'product over live ' + JSON.stringify(await st()));
      await p.click('#productModal .pm-close');
      await p.waitForTimeout(900);
      const r = await ev(p, () => ({ room: window.__nav.vis(document.getElementById('lvxRoom')), mini: window.__nav.vis(document.getElementById('lvxMini')), pm: window.__nav.vis(document.getElementById('productModal')) }));
      L.assert(!r.pm && (r.room || r.mini), 'live session lost ' + JSON.stringify(r));
      L.assert(r.room, 'room not restored (only mini player) ' + JSON.stringify(r));
      await ev(p, () => window.skhLiveClose && window.skhLiveClose('lvxRoom')); await p.waitForTimeout(800);
      await ev(p, () => { const m = document.getElementById('lvxMini'); if (m && window.skhLiveMiniClose) window.skhLiveMiniClose(); });
      await p.waitForTimeout(500);
      await noLayer('after live');
      return JSON.stringify(r);
    });

    await step(`${vn} H drawer -> modal from drawer -> close: no invisible layer, page scrolls`, async () => {
      await fresh();
      await ev(p, () => window.openSidebarMenu());
      L.assert(await waitHit(() => window.__nav.hit(document.getElementById('sidebarMenuModal')), null, 6000), 'drawer');
      await ev(p, () => window.openSokoPay());
      L.assert(await waitHit(() => window.__nav.hit(document.getElementById('spOverviewArea') || document.getElementById('sokopayForm')), null, 6000), 'modal from drawer');
      await p.keyboard.press('Escape'); await p.waitForTimeout(700);
      const s = await st();
      L.assert(!(await ev(p, () => window.__nav.vis(document.getElementById('sokopayForm')))), 'Esc did not close the modal');
      // one Esc closes one layer: the page behind is either the drawer (step back) or the page — never an empty backdrop
      L.assert(!s.block.filter(b => b !== 'sidebarMenuModal').length && s.ov.every(id => id === 'sidebarMenuModal'), 'blocking ' + JSON.stringify(s));
      if (s.ov.length) { await p.keyboard.press('Escape'); await p.waitForTimeout(600); }
      await noLayer('after drawer');
      L.assert(await scrolls(), 'page does not scroll after drawer + modal');
      return 'after first Esc: ' + (s.ov.join(',') || 'page');
    });

    await step(`${vn} I rapid taps: only the last destination is shown, with its own content`, async () => {
      await fresh();
      for (const sel of ['#navTabHome', '#navTabBidhaa', '#navTabHuduma', '#navTabDelivery', '#navTabBidhaa', '#navTabHuduma']) { await p.click(sel, { noWaitAfter: true, timeout: 3000 }); await p.waitForTimeout(40); }
      L.assert(await waitHit((t) => { const c = window.__nav.card(t); if (!c) return false; if (!window.__nav.hit(c)) c.scrollIntoView({ block: 'center' }); return window.__nav.hit(c); }, SVC, 8000), 'Huduma not visible ' + JSON.stringify(await st()));
      await p.waitForTimeout(2500);   // late answers of the earlier tabs must not repaint the grid
      const s = await st();
      L.assert(s.act.length === 1 && s.act[0] === 'navTabHuduma', 'active ' + s.act);
      await noLayer('after rapid taps');
      const grid = await ev(p, () => [...document.querySelectorAll('#mainFeed > *')].filter(c => window.__nav.vis(c)).map(c => c.innerText.slice(0, 40)));
      L.assert(!grid.some(t => /Sofa ya Mninga|Mbolea ya Urea|Samsung/.test(t)), 'products painted into the Huduma page ' + JSON.stringify(grid.slice(0, 6)));
      L.assert(await ev(p, () => window.__nav.vis(document.getElementById('serviceModesNav')) && !window.__nav.vis(document.getElementById('marketModesNav')) && !window.__nav.vis(document.getElementById('deliveryModesNav'))), 'sub-nav');
      // ...and ending on Chat: the inbox is the only thing on top of Huduma
      for (const sel of ['#navTabBidhaa', '#navTabHuduma', '.nav-tab[onclick*="openChatList"]']) { await p.click(sel, { noWaitAfter: true, timeout: 3000 }); await p.waitForTimeout(40); }
      L.assert(await waitHit(() => window.__nav.hit(document.getElementById('chatListModal')), null, 6000), 'chat inbox ' + JSON.stringify(await st()));
      await p.waitForTimeout(1200);
      const s2 = await st(); L.assert(s2.ov.length === 1 && s2.ov[0] === 'chatListModal', 'more than one page open ' + JSON.stringify(s2.ov));
      await p.goBack(); await p.waitForTimeout(900);
      const s3 = await st(); L.assert(!s3.ov.length && s3.act.includes('navTabHuduma'), 'Back from inbox ' + JSON.stringify(s3));
      return 'Huduma only (' + grid.length + ' cards); inbox alone; Back -> Huduma';
    });

    await step(`${vn} J Back/Forward follow the real history (tabs + product)`, async () => {
      await fresh();
      const at = async () => ev(p, () => ({ tab: (document.querySelector('.nav-tab.active') || {}).id, pm: window.__nav.hit(document.getElementById('productModal')), ov: window.__nav.openOverlays(), block: window.__nav.blockers() }));
      const seq = []; const go = async (dir) => { if (dir < 0) await p.goBack(); else await p.goForward(); await p.waitForTimeout(1000); const a = await at(); seq.push((dir < 0 ? 'back:' : 'fwd:') + a.tab + (a.pm ? '+product' : '')); return a; };
      await tap('#navTabHome'); await p.waitForTimeout(700);
      await tap('#navTabBidhaa'); await p.waitForTimeout(1200);
      await p.click('#mainFeed > *:has-text("Mbolea ya Urea")');
      L.assert(await waitHit(() => window.__nav.hit(document.getElementById('productModal')), null, 8000), 'product');
      let a = await go(-1); L.assert(a.tab === 'navTabBidhaa' && !a.pm && !a.ov.length, 'Back from product ' + JSON.stringify(a));
      a = await go(1); L.assert(a.tab === 'navTabBidhaa' && a.pm, 'Forward should show the product again ' + JSON.stringify(a));
      a = await go(-1); L.assert(a.tab === 'navTabBidhaa' && !a.pm && !a.ov.length, 'Back again ' + JSON.stringify(a));
      await tap('#navTabHuduma'); await p.waitForTimeout(1000);
      a = await go(-1); L.assert(a.tab === 'navTabBidhaa' && !a.ov.length, 'Back from Huduma -> Bidhaa ' + JSON.stringify(a));
      a = await go(-1); L.assert(a.tab === 'navTabHome' && !a.ov.length, 'Back -> Home ' + JSON.stringify(a));
      a = await go(1); L.assert(a.tab === 'navTabBidhaa' && !a.ov.length, 'Forward -> Bidhaa ' + JSON.stringify(a));
      a = await go(1); L.assert(a.tab === 'navTabHuduma' && !a.ov.length && !a.block.length, 'Forward -> Huduma ' + JSON.stringify(a));
      return seq.join(' ');
    });

    await step(`${vn} K keyboard: nav tabs reachable and activated with Enter; Esc closes one layer`, async () => {
      await fresh();
      const r = await ev(p, () => [...document.querySelectorAll('#navTabHome,#navTabBidhaa,#navTabHuduma,#navTabDelivery')].map(t => ({ id: t.id, tab: t.tabIndex, role: t.getAttribute('role'), name: (t.getAttribute('aria-label') || t.innerText || '').trim() })));
      L.assert(r.every(x => x.tab >= 0 && x.role && x.name), 'nav tabs not keyboard/AT reachable ' + JSON.stringify(r));
      await p.focus('#navTabBidhaa'); await p.keyboard.press('Enter'); await p.waitForTimeout(900);
      L.assert(await ev(p, () => document.getElementById('navTabBidhaa').classList.contains('active')), 'Enter did not activate Bidhaa');
      await ev(p, () => { window.openProduct('tv55a', 'products'); }); await p.waitForTimeout(1500);
      await p.click('#pmActionArea button[aria-label="Muumbe muuzaji kwa chat" i], #pmActionArea button[aria-label="Chat na muuzaji" i]');
      L.assert(await waitHit(() => window.__nav.hit(document.getElementById('chatModal')), null, 8000), 'chat from product ' + JSON.stringify(await st()));
      await p.keyboard.press('Escape'); await p.waitForTimeout(700);
      const a = await ev(p, () => ({ chat: window.__nav.vis(document.getElementById('chatModal')), pm: window.__nav.hit(document.getElementById('productModal')) }));
      L.assert(!a.chat && a.pm, 'one Esc should close the chat and show the product again ' + JSON.stringify(a));
      await p.keyboard.press('Escape'); await p.waitForTimeout(700);
      await noLayer('after Esc x2');
      return JSON.stringify(r.map(x => x.role));
    });

    await step(`${vn} M Business OS: mode menu -> shop dashboard -> Back -> market -> Forward -> dashboard -> "Rudi Soko"`, async () => {
      const S2 = await L.open({ width: w, height: h }); const q = S2.p;
      try {
        await L.login(q, 'juma.review@sokohai.test', PW);
        await ev(q, () => { try { unlockSystem(); } catch (e) {} });
        await ev(q, HELPERS);
        const view = () => ev(q, () => ({ dash: window.__nav.vis(document.getElementById('dashboardViews')), buyer: window.__nav.vis(document.getElementById('buyerView')), ov: window.__nav.openOverlays(), block: window.__nav.blockers(), bos: !!document.getElementById('bosSidebar') }));
        await q.click('#navTabBidhaa'); await q.waitForTimeout(800);
        await ev(q, () => window.openModeMenu());
        L.assert(await q.waitForFunction(() => window.__nav.hit(document.getElementById('modeMenuModal')), null, { timeout: 6000 }).then(() => true, () => false), 'mode menu');
        await q.click('#mode-seller');
        L.assert(await q.waitForFunction(() => window.__nav.vis(document.getElementById('dashboardViews')) && !window.__nav.vis(document.getElementById('buyerView')) && !window.__nav.openOverlays().length, null, { timeout: 12000 }).then(() => true, () => false), 'dashboard not shown alone ' + JSON.stringify(await view()));
        await q.waitForTimeout(1200);
        await q.goBack(); await q.waitForTimeout(1200);
        let v = await view(); L.assert(v.buyer && !v.dash && !v.ov.length && !v.block.length, 'Back did not return to the market ' + JSON.stringify(v));
        const tab = await ev(q, () => (document.querySelector('.nav-tab.active') || {}).id); L.assert(tab === 'navTabBidhaa', 'tab after Back ' + tab);
        await q.goForward(); await q.waitForTimeout(2000);
        v = await view(); L.assert(v.dash && !v.buyer && !v.ov.length, 'Forward did not return to the dashboard ' + JSON.stringify(v));
        await ev(q, () => window.switchMode('buyer')); await q.waitForTimeout(1200);
        v = await view(); L.assert(v.buyer && !v.dash && !v.ov.length && !v.block.length, '"Rudi Soko" ' + JSON.stringify(v));
        const e = L.realErrs(S2.log); L.assert(!e.length, e.slice(0, 3).join(' || '));
        return 'market <-> dashboard via history, bos=' + v.bos;
      } finally { await S2.b.close(); }
    });

    await step(`${vn} L no JavaScript errors during the walk`, async () => {
      const e = L.realErrs(B.log); L.assert(!e.length, e.slice(0, 5).join(' || ')); return '0 errors'; });
    await p.screenshot({ path: OUT + vn + '-end.png' });
    await B.b.close();
  }
  console.log(`\nNAV ${L.results.filter(r => r.ok).length}/${L.results.length} passed`);
  process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
