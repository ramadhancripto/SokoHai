// [NAV SWEEP 2026-11-14] Owner report: "screens open BEHIND the current page" (Live behind product
// details, Login behind Chat) and "Back sometimes leaves a blue/empty screen until you tap".
// This sweep walks EVERY account-menu entry and EVERY action button inside product details, and checks:
//   T  the screen that was asked for is what a tap in the middle hits (nothing covers it), and it is
//      not an empty layer;
//   B  Back closes it and leaves a usable page: no leftover overlay/backdrop over the page, body
//      scrolls, nothing empty on top.
// Real Chromium, emulator only. SWEEP_VP=390x844 (default) or 1440x900.
const { seed, L, PW } = require('./review-seed.cjs');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, 'out', 'sweep-'); fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
const [W, H] = (process.env.SWEEP_VP || '390x844').split('x').map(Number);
const ev = (p, fn, a) => p.evaluate(fn, a);

// probe helpers installed in the page
const PROBE = () => {
  const vis = (el) => { if (!el || !el.isConnected) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && r.width > 2 && r.height > 2; };
  const floating = (el) => { const cs = getComputedStyle(el); return (cs.position === 'fixed' || cs.position === 'absolute') && (parseInt(cs.zIndex, 10) || 0) >= 50; };
  // the outermost floating layer (with an id) under a screen point
  const layerAt = (fx, fy) => {
    let best = null;
    for (let n = document.elementFromPoint(innerWidth * fx, innerHeight * fy); n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (n.id && floating(n) && vis(n)) best = n;
    }
    return best;
  };
  const textOf = (el) => (el ? (el.innerText || '').replace(/\s+/g, ' ').trim() : '');
  window.__sw = {
    // what the user sees in the middle of the screen
    top: () => { const l = layerAt(0.5, 0.45); return l ? { id: l.id, text: textOf(l).slice(0, 60), len: textOf(l).length, img: !!l.querySelector('img,video,canvas,svg') } : { id: null, text: '', len: 0 }; },
    // floating layers covering the page at several points (backdrops included)
    covers: () => { const s = new Set(); for (const [x, y] of [[.5, .3], [.5, .55], [.5, .8], [.15, .5], [.85, .5]]) { const l = layerAt(x, y); if (l) s.add(l.id); } return [...s]; },
    // an empty layer = a floating layer at the centre whose visible content at that point is nothing
    blank: () => {
      const t = document.elementFromPoint(innerWidth / 2, innerHeight * 0.45); const l = layerAt(0.5, 0.45);
      if (!l) return false;
      if (textOf(l).length > 3 || l.querySelector('img,video,canvas,input,button')) return false;
      return { id: l.id, bg: getComputedStyle(l).backgroundColor, hit: t && (t.id || t.className) };
    },
    bodyScroll: () => getComputedStyle(document.body).overflow !== 'hidden' && getComputedStyle(document.documentElement).overflow !== 'hidden',
    state: () => (window.skhNavState ? window.skhNavState() : null)
  };
};

(async () => {
  await seed();
  const juma = (await L.admin.auth().getUserByEmail('juma.review@sokohai.test')).uid;
  await L.db.doc('users/' + juma).set({ businessSetupComplete: true, businessName: 'Juma Electronics', isSeller: true }, { merge: true });
  const now = Date.now();
  await L.db.doc('products/aucSw').set({ userId: juma, ownerName: 'Juma Electronics', sellerName: 'Juma Electronics', title: 'Simu A54 mnada · sweep', category: 'CAT-11', price: 300000, stock: 1,
    publicationStatus: 'published', availabilityStatus: 'available', saleMode: 'auction', modeData: { mode: 'auction', endTime: now + 3 * 3600e3, startTime: now - 60e3, currentBid: 300000, minIncrement: 5000 }, createdAt: new Date().toISOString() });
  const S = await L.open({ width: 390, height: 844 }); await L.login(S.p, 'juma.review@sokohai.test', PW);
  const sid = (await L.call(S.p, 'liveCreate', { kind: 'live', title: 'Sweep live', productIds: ['tv55a'] })).data.sessionId;
  await L.call(S.p, 'liveStart', { sessionId: sid }); await S.b.close();

  const B = await L.open({ width: W, height: H }); const p = B.p;
  await L.login(p, 'buyer.review@sokohai.test', PW);
  const fresh = async (lang) => {
    await ev(p, (l) => { try { localStorage.setItem('sokohai_lang', l); } catch (e) {} }, lang || 'sw');
    await p.goto(L.BASE + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.skh && window.skh.currentUserData && window.skh.currentUserData.uid, null, { timeout: 30000 });
    await p.waitForTimeout(1800); await ev(p, () => { try { unlockSystem(); closeWelcome(); } catch (e) {} });
    // the "Lugha" entry switches the language and it is remembered; every check starts in the asked language
    await ev(p, (l) => { const cur = (window.SokoHaiLMS && window.SokoHaiLMS.lang) || 'sw'; if (cur !== l && window.skhSetLang) window.skhSetLang(l); }, lang || 'sw');
    await ev(p, PROBE); await p.waitForTimeout(600);
  };
  const look = () => ev(p, () => ({ top: window.__sw.top(), covers: window.__sw.covers(), blank: window.__sw.blank(), scroll: window.__sw.bodyScroll() }));
  const findings = [];
  const shot = async (n) => { try { await p.screenshot({ path: OUT + W + '-' + n.replace(/\W+/g, '_').slice(0, 60) + '.png' }); } catch (e) {} };

  // ---- 1. account-menu entries from the page ----
  await fresh();
  await ev(p, () => window.openSidebarMenu()); await p.waitForTimeout(1200);
  const menu = await ev(p, () => Array.from(document.querySelectorAll('#sidebarMenuModal .skh-menu-item')).filter(e => e.offsetParent && !e.classList.contains('skh-logout'))
    .map(e => (e.innerText || '').trim().split('\n')[0]).filter(Boolean));
  for (const label of menu) {
    await L.step(`${W} menu "${label}": opens on top, not empty; Back leaves a usable page`, async () => {
      await fresh(); await ev(p, () => window.openSidebarMenu()); await p.waitForTimeout(1000);
      await ev(p, () => document.querySelectorAll('#sidebarMenuModal .skh-menu-sec-h').forEach((h) => { const n = h.nextElementSibling; if (n && n.classList.contains('skh-sec-hidden')) h.click(); }));
      const it = p.locator('#sidebarMenuModal .skh-menu-item').filter({ hasText: label }).first();
      if (!(await it.count())) { const r = await ev(p, () => Array.from(document.querySelectorAll('#sidebarMenuModal .skh-menu-item')).map((e) => e.innerText.trim().split('\n')[0]).join(' | ')); throw new Error('menu entry missing on 2nd open: ' + r.slice(0, 300)); }
      await it.click({ timeout: 8000 }); await p.waitForTimeout(2200);
      const a = await look();
      if (a.top.id === 'sidebarMenuModal') { const r = await ev(p, () => document.querySelector('#sidebarMenuModal').innerText.slice(0, 80)); if (!/Lugha|Language/i.test(label)) { await shot('menu-' + label); throw new Error('menu still on top after tapping (destination behind it?) ' + JSON.stringify(a) + ' ' + r); } }
      if (a.blank) { await shot('menu-blank-' + label); throw new Error('empty layer on top ' + JSON.stringify(a.blank)); }
      // Back until no layer is left (max 3), then the page must be usable
      let b; for (let i = 0; i < 3; i++) { await p.goBack().catch(() => {}); await p.waitForTimeout(900); b = await look(); if (!b.covers.length) break; }
      if (b.covers.length || b.blank || !b.scroll) { await shot('menu-back-' + label); throw new Error('after Back: ' + JSON.stringify(b)); }
      return (a.top.id || 'page') + ' -> page';
    });
  }

  // ---- 1b. the menu text must not grow each time it is shown (English: "Bidhaa (Product) (Product)...") ----
  await L.step(`${W} English menu shown 3 times: labels stay the same (language sweep is idempotent)`, async () => {
    await fresh('en'); const texts = [];
    for (let i = 0; i < 3; i++) { await ev(p, () => window.openSidebarMenu()); await p.waitForTimeout(1200); texts.push(await ev(p, () => document.getElementById('sidebarMenuModal').innerText.replace(/\s+/g, ' '))); await ev(p, () => window.closeModals()); await p.waitForTimeout(600); }
    L.assert(!/\(Product\)\s*\(Product\)/.test(texts.join(' ')), 'label grows: ' + (texts[2].match(/[^|]{0,30}\(Product\)[^|]{0,40}/) || [''])[0]);
    L.assert(texts[0] === texts[2], 'menu text changed between openings');
    await fresh('sw'); return 'stable';
  });

  // ---- 2. every action inside product details (normal product + auction product) ----
  for (const pid of ['tv55a', 'aucSw']) {
    await fresh();
    await ev(p, (id) => window.openProduct(id, 'products'), pid);
    await p.waitForFunction((id) => window.skh.currentOpenProduct && window.skh.currentOpenProduct.id === id, pid, { timeout: 20000 }); await p.waitForTimeout(1500);
    const acts = await ev(p, () => {
      const m = document.getElementById('productModal'); const seen = new Set(); const out = [];
      m.querySelectorAll('button,[onclick],a[href^="#"]').forEach((e) => {
        if (!e.offsetParent) return; const oc = e.getAttribute('onclick') || '';
        const t = (e.innerText || e.getAttribute('aria-label') || e.title || '').trim().split('\n')[0].slice(0, 40);
        if (/closeModals|skhNavBack|history\.back|close|Funga|share|copy|zoom|gallery|qty|Qty|\+|−|-1|\bminus\b|plus|like|save|wish|toggle|tab|slide|img|thumb/i.test(oc + ' ' + t + ' ' + e.className)) return;
        if (!t || seen.has(t)) return; seen.add(t); out.push(t);
      });
      return out.slice(0, 18);
    });
    for (const label of acts) {
      await L.step(`${W} product ${pid} -> "${label}": the new screen is on top (not behind details); Back returns`, async () => {
        await fresh(); await ev(p, (id) => window.openProduct(id, 'products'), pid);
        await p.waitForFunction((id) => window.skh.currentOpenProduct && window.skh.currentOpenProduct.id === id, pid, { timeout: 20000 }); await p.waitForTimeout(1200);
        const before = await look();
        await p.locator('#productModal :is(button,[onclick])', { hasText: label }).first().click({ timeout: 5000 }).catch(async () => { await p.locator(`#productModal [aria-label="${label}"]`).first().click({ timeout: 3000 }); });
        await p.waitForTimeout(2200);
        const a = await look();
        await L.answer(p, null, 600).catch(() => {}); // close an app confirm if one was asked (counted as "on top")
        // if a NEW layer appeared it must be the top one; same productModal on top while another layer opened = behind
        const opened = a.covers.filter((x) => !before.covers.includes(x));
        if (opened.length && a.top.id === 'productModal') { await shot(`pm-${pid}-${label}`); throw new Error('opened BEHIND details: ' + JSON.stringify({ opened, top: a.top })); }
        if (a.blank) { await shot(`pm-blank-${pid}-${label}`); throw new Error('empty layer on top ' + JSON.stringify(a.blank)); }
        let b; for (let i = 0; i < 4; i++) { await p.goBack().catch(() => {}); await p.waitForTimeout(900); b = await look(); if (!b.covers.length) break; }
        if (b.covers.length || b.blank || !b.scroll) { await shot(`pm-back-${pid}-${label}`); throw new Error('after Back: ' + JSON.stringify(b)); }
        return (opened.join('+') || a.top.id || 'same page') + ' -> page';
      });
    }
  }

  // ---- 3. global screens opened while details are open (links, notifications, chat) ----
  const globals = [['chat inbox', () => window.openChatList()], ['Live hub', () => window.skhLiveHub()], ['Live room', (s) => window.skhLiveOpen(s)],
    ['cart', () => window.openCart()], ['notifications', () => window.openNotifications && window.openNotifications()], ['account menu', () => window.openSidebarMenu()]];
  for (const [name, fn] of globals) {
    await L.step(`${W} details open -> ${name}: on top; Back -> details -> page`, async () => {
      await fresh(); await ev(p, (id) => window.openProduct(id, 'products'), 'tv55a');
      await p.waitForFunction(() => window.skh.currentOpenProduct && window.skh.currentOpenProduct.id === 'tv55a', null, { timeout: 20000 }); await p.waitForTimeout(1000);
      await p.evaluate(`(${fn.toString()})(${JSON.stringify(sid)})`); await p.waitForTimeout(2200);
      const a = await look();
      if (a.top.id === 'productModal' || !a.top.id) { await shot('glob-' + name); throw new Error('not on top: ' + JSON.stringify(a)); }
      if (a.blank) throw new Error('empty ' + JSON.stringify(a.blank));
      let b; for (let i = 0; i < 4; i++) { await p.goBack().catch(() => {}); await p.waitForTimeout(900); b = await look(); if (!b.covers.length) break; }
      if (b.covers.length || b.blank || !b.scroll) { await shot('glob-back-' + name); throw new Error('after Back: ' + JSON.stringify(b)); }
      return a.top.id;
    });
  }

  const errs = L.realErrs(B.log); console.log('JS errors:', errs.length, errs.slice(0, 6).join('\n'));
  console.log(`SWEEP ${W}x${H}: ${L.results.length - L.failed}/${L.results.length} passed`);
  await B.b.close(); process.exit(L.failed ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
