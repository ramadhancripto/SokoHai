// [UI AUDIT 2026-11-15] Visual + content audit of every main screen, phone and desktop, logged in as a
// buyer and as a seller. Emulator only. For each screen: screenshot + automatic checks:
//   overflowX   page wider than the screen (sideways scroll)
//   offscreen   visible elements sticking out of the right edge
//   clipped     text cut off without an ellipsis (scrollWidth > clientWidth, overflow hidden)
//   junk        "undefined" / "NaN" / "null" / "[object Object]" / "TSh NaN" visible to the user
//   brokenImg   images that failed to load
//   tinyTap     (phone) buttons/links smaller than 32x32 px
//   fonts       distinct font families on screen
// Output: out/ui/<vp>-<screen>.png and out/ui/report.json. AUDIT_VP=390x844,1440x900
const L = require('./lib.cjs'); const { seed, PW } = require('./review-seed.cjs');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'out', 'ui'); fs.mkdirSync(OUT, { recursive: true });
const VPS = (process.env.AUDIT_VP || '390x844,1440x900').split(',').map(s => s.split('x').map(Number));
const ONLY = process.env.AUDIT_ONLY ? process.env.AUDIT_ONLY.split(',') : null;
const ev = (p, fn, a) => p.evaluate(fn, a);

const CHECK = (phone) => {
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < innerHeight; };
  const name = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
  const out = { overflowX: document.documentElement.scrollWidth - innerWidth, offscreen: [], clipped: [], junk: [], brokenImg: [], tinyTap: [], fonts: {} };
  const all = [...document.querySelectorAll('body *')];
  for (const el of all) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.right > innerWidth + 2 && r.width < innerWidth * 3 && cs.position !== 'fixed' && !el.closest('[class*="scroll"],[class*="strip"],[class*="rail"],[class*="carousel"],[class*="slider"],[style*="overflow-x"]')) {
      let p = el.parentElement, scrolls = false; while (p && p !== document.body) { const pc = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(pc.overflowX)) { scrolls = true; break; } p = p.parentElement; }
      if (!scrolls) out.offscreen.push(name(el) + ' right=' + Math.round(r.right));
    }
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join('').trim();
    if (own) {
      out.fonts[cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()] = (out.fonts[cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()] || 0) + 1;
      if (/\b(undefined|NaN|\[object Object\])\b|^null$|TSh\s*NaN|\bnull\b(?=\s*(TSh|·|$))/.test(own)) out.junk.push(name(el) + ': ' + own.slice(0, 60));
      if (el.scrollWidth > el.clientWidth + 2 && /(hidden|clip)/.test(cs.overflowX + cs.overflow) && cs.textOverflow !== 'ellipsis' && el.clientWidth > 0) out.clipped.push(name(el) + ': ' + own.slice(0, 40));
    }
    if (phone && /^(BUTTON|A)$/.test(el.tagName) && (r.width < 32 || r.height < 32) && (el.innerText || el.getAttribute('aria-label') || '').trim() && !el.closest('p,li > p')) out.tinyTap.push(name(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' ' + (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 20));
  }
  for (const img of document.images) if (vis(img) && img.complete && img.naturalWidth === 0 && img.src && !img.src.startsWith('data:')) out.brokenImg.push(img.src.slice(0, 100));
  for (const k of ['offscreen', 'clipped', 'junk', 'brokenImg', 'tinyTap']) { out[k + 'N'] = out[k].length; out[k] = [...new Set(out[k])].slice(0, 12); }
  out.fontCount = Object.keys(out.fonts).length;
  return out;
};

(async () => {
  await seed();
  const juma = (await L.admin.auth().getUserByEmail('juma.review@sokohai.test')).uid;
  await L.db.doc('users/' + juma).set({ businessSetupComplete: true, businessName: 'Juma Electronics', isSeller: true, walletBalance: 250000 }, { merge: true });
  const buyer = (await L.admin.auth().getUserByEmail('buyer.review@sokohai.test')).uid;
  await L.db.doc('users/' + buyer).set({ walletBalance: 500000 }, { merge: true });
  const S0 = await L.open({ width: 390, height: 844 }); await L.login(S0.p, 'juma.review@sokohai.test', PW);
  const live = (await L.call(S0.p, 'liveCreate', { kind: 'live', title: 'Ofa za TV leo', productIds: ['tv55a', 'rice5'] })).data.sessionId;
  await L.call(S0.p, 'liveStart', { sessionId: live }); await S0.b.close();

  const SCREENS = [
    // [name, who, open-fn source, settle ms]
    ['home', 'buyer', () => window.updateApp('home'), 1800],
    ['bidhaa', 'buyer', () => window.updateApp('bidhaa'), 1800],
    ['huduma', 'buyer', () => window.updateApp('services'), 1800],
    ['usafiri', 'buyer', () => window.updateApp('delivery'), 1800],
    ['search', 'buyer', () => { const i = document.getElementById('searchInput'); i.value = 'samsung'; window.handleSearch(); }, 2500],
    ['product', 'buyer', () => window.openProduct('tv55a', 'products'), 2200],
    ['product-wholesale', 'buyer', () => window.openProduct('rice5', 'products'), 2200],
    ['cart', 'buyer', async () => { window.openProduct('tv55a', 'products'); await new Promise(r => setTimeout(r, 1500)); window.addToCart(false); await new Promise(r => setTimeout(r, 800)); window.openCart(); }, 2200],
    ['chat-inbox', 'buyer', () => window.openChatList(), 2200],
    ['notifications', 'buyer', () => window.openNotifications(), 1800],
    ['menu', 'buyer', () => window.openSidebarMenu(), 1500],
    ['profile', 'buyer', () => window.openProfile(), 2000],
    ['orders', 'buyer', () => window.openBuyerOrdersModal(), 2000],
    ['sokopay', 'buyer', () => window.openSokoPay(), 2000],
    ['saved', 'buyer', () => window.openSavedItems(), 1800],
    ['seller-page', 'buyer', (a) => window.openSellerProfile(a.juma, 'Juma Electronics'), 2200],
    ['live-hub', 'buyer', () => window.skhLiveHub(), 2200],
    ['live-room', 'buyer', (a) => window.skhLiveOpen(a.live), 3000],
    ['sell-form', 'seller', () => window.showForm('sellerForm'), 1800],
    ['business-os', 'seller', async () => { window.openModeMenu(); await new Promise(r => setTimeout(r, 900)); document.getElementById('mode-seller').click(); }, 3500],
    ['checkout', 'buyer', async () => { try { localStorage.removeItem('sokohai_smart_cart'); } catch (e) {} window.skh.myCart = []; window.openProduct('rice5', 'products'); await new Promise(r => setTimeout(r, 1500)); window.addToCart(false); await new Promise(r => setTimeout(r, 800)); window.openCart(); await new Promise(r => setTimeout(r, 1200)); window.skhDeliverySetRequired(false); await new Promise(r => setTimeout(r, 500)); window.confirmSmartCartOrder(); }, 3500],
    ['chat-conv', 'buyer', (a) => window.openChatWithUser(a.juma, 'Juma Electronics'), 2800],
    ['delivery-req', 'buyer', () => window.updateApp('delivery'), 1500],
  ];
  const report = {};
  for (const [w, h] of VPS) {
    const vn = w + 'x' + h; const phone = w < 700;
    const pages = {};
    for (const who of ['buyer', 'seller']) {
      const X = await L.open({ width: w, height: h }); await L.login(X.p, who === 'buyer' ? 'buyer.review@sokohai.test' : 'juma.review@sokohai.test', PW);
      await ev(X.p, () => { try { unlockSystem(); closeWelcome(); } catch (e) {} }); pages[who] = X;
    }
    // logged-out home + login
    const G = await L.open({ width: w, height: h }); await ev(G.p, () => { try { unlockSystem(); } catch (e) {} });
    for (const [name, fn] of [['guest-home', null], ['login', () => window.openAuthModal && window.openAuthModal()]]) {
      if (ONLY && !ONLY.includes(name)) continue;
      if (fn) { await G.p.evaluate(`(${fn.toString()})()`); await G.p.waitForTimeout(1200); }
      await G.p.screenshot({ path: path.join(OUT, `${vn}-${name}.png`) });
      report[`${vn} ${name}`] = await ev(G.p, CHECK, phone);
    }
    await G.b.close();
    for (const [name, who, fn, ms] of SCREENS) {
      if (ONLY && !ONLY.includes(name)) continue;
      const p = pages[who].p;
      await ev(p, () => { try { window.closeModals && window.closeModals(true); } catch (e) {} try { window.skhLiveMiniClose && window.skhLiveMiniClose(); } catch (e) {} try { window.skhLiveClose && window.skhLiveClose('lvxHub'); } catch (e) {} });
      await p.waitForTimeout(500);
      try { await p.evaluate(`(${fn.toString()})(${JSON.stringify({ juma, live })})`); } catch (e) { report[`${vn} ${name}`] = { error: String(e.message).slice(0, 200) }; continue; }
      await p.waitForTimeout(ms);
      await p.screenshot({ path: path.join(OUT, `${vn}-${name}.png`) });
      report[`${vn} ${name}`] = await ev(p, CHECK, phone);
    }
    for (const who of ['buyer', 'seller']) { report[`${vn} js-errors ${who}`] = L.realErrs(pages[who].log).slice(0, 15); await pages[who].b.close(); }
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  for (const [k, v] of Object.entries(report)) {
    if (Array.isArray(v)) { console.log(k, v.length); continue; }
    if (v.error) { console.log(k, 'ERROR', v.error); continue; }
    console.log(k.padEnd(28), `ovX=${v.overflowX} off=${v.offscreenN} clip=${v.clippedN} junk=${v.junkN} img=${v.brokenImgN} tap=${v.tinyTapN} fonts=${v.fontCount}`);
  }
  process.exit(0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
