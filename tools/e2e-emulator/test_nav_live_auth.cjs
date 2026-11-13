// [NAV-LIVE/AUTH 2026-11-14] Regression: (1) Live opens ON TOP immediately from every entry and Back
// walks back through Live; (2) a logged-out tap on Chat shows Login at once (no chat behind it), a
// cancelled login leaves the public page, a successful login continues to the inbox.
// Real Chromium, real taps, emulator only. NAV_VP=390x844,1440x900 to choose sizes.
const { seed, L, PW } = require('./review-seed.cjs');
const OUT = require('path').join(__dirname, 'out', 'navla-');
const VPS = (process.env.NAV_VP || '390x844,360x800,768x1024,1440x900').split(',').map(s => s.split('x').map(Number));
const ev = (p, fn, a) => p.evaluate(fn, a);
const H = () => {
  const vis = el => { if (!el || !el.isConnected || el.hidden) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 2 && r.height > 2; };
  // `el` is visible AND is what a tap in the middle of the screen hits (nothing covers it)
  const top = el => { if (!vis(el)) return false; const t = document.elementFromPoint(innerWidth / 2, innerHeight * 0.45); return !!t && (t === el || el.contains(t)); };
  const blockers = () => { const out = new Set(); for (const [fx, fy] of [[.5, .35], [.5, .6]]) { for (let n = document.elementFromPoint(innerWidth * fx, innerHeight * fy); n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.position === 'fixed') { const r = n.getBoundingClientRect(); if (r.width * r.height > innerWidth * innerHeight * 0.4) out.add(n.id || String(n.className)); break; } } } return [...out]; };
  if (!window.__laRej) { window.__laRej = []; addEventListener('unhandledrejection', e => { const r = e.reason || {}; window.__laRej.push(String(r.code || '') + ' ' + String(r.message || r).slice(0, 160) + ' ' + String(r.stack || '').split('\n').slice(1, 3).join(' | ').replace(/https?:\/\/[^/]+/g, '')); }); }
  window.__la = { vis, top, blockers, id: i => document.getElementById(i),
    st: () => ({ ov: window.skhNavState && window.skhNavState().ov, block: blockers(), room: vis(document.getElementById('lvxRoom')), hub: vis(document.getElementById('lvxHub')), mini: !!document.getElementById('lvxMini'), pm: vis(document.getElementById('productModal')), auth: vis(document.getElementById('authModal')), inbox: vis(document.getElementById('chatListModal')) }) };
};

(async () => {
  await seed();
  const juma = (await L.admin.auth().getUserByEmail('juma.review@sokohai.test')).uid;
  await L.db.doc('users/' + juma).set({ businessSetupComplete: true, businessName: 'Juma Electronics', isSeller: true }, { merge: true });
  const now = Date.now(), img = L.BASE + '/assets/img/categories/elektroniki.webp';
  await L.db.doc('products/aucnav').set({ userId: juma, ownerName: 'Juma Electronics', sellerName: 'Juma Electronics', title: 'Simu A54 mnada · nav', category: 'CAT-11', price: 300000, stock: 1, publicationStatus: 'published', availabilityStatus: 'available', isOnline: true, image: img, imagesArray: [img], saleMode: 'auction', modeData: { mode: 'auction', startTime: now - 60000, endTime: now + 7200000, minIncrement: 5000 }, createdAt: new Date().toISOString(), currency: 'TZS' });
  const S = await L.open({ width: 390, height: 844 }); await L.login(S.p, 'juma.review@sokohai.test', PW);
  const sid = (await L.call(S.p, 'liveCreate', { kind: 'live', title: 'Duka live · navla', productIds: ['tv55a'] })).data.sessionId;
  if (!(await L.call(S.p, 'liveStart', { sessionId: sid })).ok) throw new Error('setup: liveStart');
  await S.b.close();

  for (const [w, h] of VPS) {
    const vn = w + 'x' + h;
    // ---------------- logged-out Chat ----------------
    const A = await L.open({ width: w, height: h }); const a = A.p;
    await ev(a, () => { try { unlockSystem(); } catch (e) {} }); await ev(a, H);
    const ast = () => ev(a, () => window.__la.st());
    const step = (name, page, fn) => L.step(name, async () => { try { return await fn(); } catch (e) { try { await page.screenshot({ path: OUT + name.replace(/\W+/g, '_').slice(0, 50) + '.png' }); } catch (x) {} throw e; } });
    await step(`${vn} C1 logged-out tap on Chat: Login is on top at once, no chat behind it`, a, async () => {
      await a.click('.nav-tab[onclick*="openChatList"]');
      L.assert(await a.waitForFunction(() => window.__la.top(window.__la.id('authModal')), null, { timeout: 4000 }).then(() => true, () => false), 'login not on top ' + JSON.stringify(await ast()));
      await a.waitForTimeout(1500);
      const s = await ast(); L.assert(s.auth && !s.inbox, 'chat UI rendered for a logged-out user ' + JSON.stringify(s));
      L.assert(await ev(a, () => window.__la.top(window.__la.id('authModal'))), 'login covered later ' + JSON.stringify(s));
      return JSON.stringify(s.ov);
    });
    await step(`${vn} C2 cancelled login returns to the public page (Back, then the form's own close button)`, a, async () => {
      await a.goBack(); await a.waitForTimeout(900);
      let s = await ast(); L.assert(!s.auth && !s.inbox && !s.block.length, 'Back did not leave login cleanly ' + JSON.stringify(s));
      await a.click('.nav-tab[onclick*="openChatList"]'); await a.waitForTimeout(1200);
      await a.click('#authModal button[onclick="closeModals()"]'); await a.waitForTimeout(4500);   // > the 4 s intent window
      s = await ast(); L.assert(!s.auth && !s.inbox && !s.block.length, 'close left a layer ' + JSON.stringify(s));
      L.assert(await ev(a, () => !window.skh.__authIntent), 'cancelled intent kept');
      return 'page';
    });
    await step(`${vn} C3 login from the Chat prompt continues straight to the inbox`, a, async () => {
      await a.click('.nav-tab[onclick*="openChatList"]');
      await a.waitForSelector('#loginEmail', { state: 'visible', timeout: 5000 });
      await a.fill('#loginEmail', 'buyer.review@sokohai.test'); await a.fill('#loginPass', PW);
      await a.locator('#authModal button[type="submit"]').first().click();
      L.assert(await a.waitForFunction(() => window.__la.top(window.__la.id('chatListModal')), null, { timeout: 15000 }).then(() => true, () => false), 'inbox not opened after login ' + JSON.stringify(await ast()));
      const s = await ast(); L.assert(!s.auth, 'login still visible ' + JSON.stringify(s));
      await a.goBack(); await a.waitForTimeout(900);
      const s2 = await ast(); L.assert(!s2.inbox && !s2.auth && !s2.block.length, 'Back from inbox ' + JSON.stringify(s2));
      return 'login -> inbox -> Back -> page';
    });
    await step(`${vn} C4 logged-out account menu: login continues to the menu`, a, async () => {
      // the app's own logout (confirm dialog -> listeners cancelled -> reload)
      await ev(a, () => { window.doLogout(); }); await L.answer(a, null, 8000);
      await a.waitForLoadState('domcontentloaded'); await a.waitForFunction(() => window.skh && window.skh.auth && window.skh.__authResolved && !window.skh.currentUser, null, { timeout: 30000 });
      await a.waitForTimeout(2500); await ev(a, H);
      await ev(a, () => window.openSidebarMenu()); await a.waitForSelector('#loginEmail', { state: 'visible', timeout: 5000 });
      await a.fill('#loginEmail', 'buyer.review@sokohai.test'); await a.fill('#loginPass', PW);
      await a.locator('#authModal button[type="submit"]').first().click();
      L.assert(await a.waitForFunction(() => window.__la.top(window.__la.id('sidebarMenuModal')), null, { timeout: 15000 }).then(() => true, () => false), 'menu not opened after login ' + JSON.stringify(await ast()));
      return 'login -> account menu';
    });
    const ea = L.realErrs(A.log).map(x => 'A: ' + x).concat((await ev(a, () => window.__laRej || [])).map(r => 'REJECTION(logged-out page) ' + r)); await A.b.close();

    // ---------------- Live ----------------
    const B = await L.open({ width: w, height: h }); const p = B.p;
    await L.login(p, 'buyer.review@sokohai.test', PW); await ev(p, () => { try { unlockSystem(); } catch (e) {} }); await ev(p, H);
    const st = () => ev(p, () => window.__la.st());
    const isTop = (id, ms) => p.waitForFunction((i) => window.__la.top(window.__la.id(i)), id, { timeout: ms || 8000 }).then(() => true, () => false);
    await step(`${vn} L1 Home Live entry opens Live on top; Back walks back to Home`, p, async () => {
      const hub = await ev(p, () => { const b = document.querySelector('button[data-skh-live-entry]'); return !!(b && b.offsetParent); });
      if (hub) {
        await p.click('button[data-skh-live-entry]');
        L.assert(await isTop('lvxHub'), 'hub ' + JSON.stringify(await st()));
        await p.locator('#lvxHubGrid .lvh-cta').first().click();
        L.assert(await isTop('lvxRoom'), 'room not on top from the hub ' + JSON.stringify(await st()));
        await p.goBack(); await p.waitForTimeout(900); L.assert(await isTop('lvxHub', 3000), 'Back -> hub ' + JSON.stringify(await st()));
      } else {   // phones: the "Live Mnada" card on Home -> product -> INGIA KWENYE MNADA
        await p.locator('.skh-huru', { hasText: 'mnada' }).first().click();
        L.assert(await isTop('productModal'), 'auction product ' + JSON.stringify(await st()));
        await p.locator('#productModal .skh-auction-room-btn').first().click();
        L.assert(await isTop('lvxRoom'), 'room not on top from the product ' + JSON.stringify(await st()));
        await p.goBack(); await p.waitForTimeout(900); L.assert(await isTop('productModal', 3000), 'Back -> product ' + JSON.stringify(await st()));
      }
      await p.goBack(); await p.waitForTimeout(900);
      const s = await st(); L.assert(!s.room && !s.hub && !s.pm && !s.block.length && !s.mini, 'Back -> Home ' + JSON.stringify(s));
      return hub ? 'Home -> hub -> room -> hub -> Home' : 'Home -> card -> product -> room -> product -> Home';
    });
    await step(`${vn} L2 Live from a product page that is already open (Bidhaa): room on top, Back -> product`, p, async () => {
      await p.click('#navTabBidhaa'); await p.waitForTimeout(1500);
      await p.locator('#mainFeed > *', { hasText: 'mnada · nav' }).first().click();
      L.assert(await isTop('productModal'), 'product');
      await p.locator('#productModal .skh-auction-room-btn').first().click();
      L.assert(await isTop('lvxRoom'), 'room behind the product ' + JSON.stringify(await st()));
      await p.goBack(); await p.waitForTimeout(900);
      L.assert(await isTop('productModal', 3000), 'Back -> product ' + JSON.stringify(await st()));
      await p.goBack(); await p.waitForTimeout(900);
      const s = await st(); L.assert(!s.pm && !s.room && !s.block.length, 'Back -> Bidhaa ' + JSON.stringify(s));
      L.assert(await ev(p, () => document.getElementById('navTabBidhaa').classList.contains('active')), 'tab');
      return 'Bidhaa -> product -> room -> product -> Bidhaa';
    });
    await step(`${vn} L3 Live opened while the chat inbox is open (live story or session link): room on top`, p, async () => {
      await p.click('.nav-tab[onclick*="openChatList"]'); L.assert(await isTop('chatListModal'), 'inbox');
      const story = await p.$('#chatListModal [onclick*="skhLiveOpen"]');
      if (story && await story.isVisible()) await story.click(); else await ev(p, (s) => window.skhLiveOpen(s), sid);
      L.assert(await isTop('lvxRoom'), 'room behind the inbox ' + JSON.stringify(await st()));
      await p.goBack(); await p.waitForTimeout(900);
      L.assert(await isTop('chatListModal', 3000), 'Back -> inbox ' + JSON.stringify(await st()));
      await p.goBack(); await p.waitForTimeout(900);
      const s = await st(); L.assert(!s.inbox && !s.room && !s.block.length, 'Back -> page ' + JSON.stringify(s));
      return story ? 'inbox story' : 'session link (no story rendered)';
    });
    await step(`${vn} L4 mini-player: minimise keeps the session, "Rudi" restores the full room; product from the room -> X -> room`, p, async () => {
      await p.click('#navTabHome'); await p.waitForTimeout(800);
      await p.locator('.skh-huru', { hasText: 'mnada' }).first().click(); await isTop('productModal');
      await p.locator('#productModal .skh-auction-room-btn').first().click(); L.assert(await isTop('lvxRoom'), 'room');
      await p.goBack(); await p.waitForTimeout(700); await p.goBack(); await p.waitForTimeout(700);
      await ev(p, (s) => window.skhLiveOpen(s), sid);
      L.assert(await isTop('lvxRoom'), 'room from link ' + JSON.stringify(await st()));
      await p.waitForTimeout(1200);
      await p.click('#lvxRoom button[aria-label="Punguza"]'); await p.waitForTimeout(700);
      let s = await st(); L.assert(s.mini && !s.room && !s.block.length, 'minimise ' + JSON.stringify(s));
      await p.click('#lvxMini button[aria-label="Rudi"], #lvxMini button:has-text("Rudi")'); await p.waitForTimeout(800);
      L.assert(await isTop('lvxRoom', 3000), 'Rudi did not restore the room ' + JSON.stringify(await st()));
      await ev(p, () => window.skhLiveOpenProduct('tv55a')); L.assert(await isTop('productModal'), 'product over room');
      await p.click('#productModal .pm-close'); await p.waitForTimeout(800);
      s = await st(); L.assert(s.room && !s.mini && !s.pm, 'X did not return to the full room ' + JSON.stringify(s));
      await ev(p, () => window.skhLiveClose('lvxRoom')); await p.waitForTimeout(700);
      s = await st(); L.assert(!s.room && !s.mini && !s.block.length, 'leave room ' + JSON.stringify(s));
      return 'mini <-> room, product over room';
    });
    await step(`${vn} L5 account menu "Live sasa" (the phone entry) from Huduma: hub on top, room on top, Back -> hub -> Huduma`, p, async () => {
      await p.click('#navTabHuduma'); await p.waitForTimeout(1000);
      await ev(p, () => window.openSidebarMenu()); L.assert(await isTop('sidebarMenuModal'), 'menu');
      await p.locator('#sidebarMenuModal .skh-menu-live-row').first().click();
      L.assert(await isTop('lvxHub'), 'hub behind something ' + JSON.stringify(await st()));
      await p.locator('#lvxHubGrid .lvh-cta').first().click();
      L.assert(await isTop('lvxRoom'), 'room behind the hub ' + JSON.stringify(await st()));
      await p.goBack(); await p.waitForTimeout(900); L.assert(await isTop('lvxHub', 3000), 'Back -> hub ' + JSON.stringify(await st()));
      await p.goBack(); await p.waitForTimeout(900);
      const s = await st(); L.assert(!s.hub && !s.room && !s.block.length && await ev(p, () => document.getElementById('navTabHuduma').classList.contains('active')), 'Back -> Huduma ' + JSON.stringify(s));
      return 'Huduma -> menu -> hub -> room -> hub -> Huduma';
    });
    await step(`${vn} L6 no JavaScript errors (logged-out + Live walks)`, p, async () => {
      const rej = await ev(p, () => window.__laRej || []);
      const e = ea.concat(L.realErrs(B.log)).concat(rej.map(r => 'REJECTION ' + r)); L.assert(!e.length, e.slice(0, 4).join(' || ')); return '0 errors'; });
    await B.b.close();
  }
  console.log(`\nNAV-LIVE-AUTH ${L.results.filter(r => r.ok).length}/${L.results.length} passed`);
  process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
