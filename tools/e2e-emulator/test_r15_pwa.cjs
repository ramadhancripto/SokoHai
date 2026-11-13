// [R15] PWA / offline — real Chromium against the local server. On dev hosts the service worker is
// off unless localStorage skh_pwa_test = '1', so this test opts in. Proves: manifest is valid and its
// icons exist with the declared sizes, the SW registers and controls the page, offline reload still
// opens the app shell from cache, an uncached navigation offline gets offline.html, money/auth/API
// URLs are never cached, and a new SW version waits until the user accepts the update.
// NOT proof of install prompts on real phones (check on Android Chrome / iOS Safari, see report).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = 'http://localhost:5055';
const OUT = path.join(__dirname, 'out', 'r15-pwa-'); fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
const SDK = process.env.SKH_FIREBASE_SDK_DIR ? process.env.SKH_FIREBASE_SDK_DIR.replace(/\/?$/, '/') : null;
const results = []; let failed = 0;
async function step(n, fn) { try { const r = await fn(); results.push(n); console.log('PASS', n, r ? '— ' + r : ''); } catch (e) { failed++; console.log('FAIL', n, '—', e.message); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
function pngSize(buf) { return buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20); }
(async () => {
  const b = await chromium.launch();
  const vp = process.env.VP === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
  const ctx = await b.newContext({ viewport: vp });
  if (SDK) await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(SDK + r.request().url().split('/').pop()) }));
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => { if (r.request().url().includes('gstatic.com/firebasejs/10.8.1/')) return r.fallback(); r.abort(); });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await step('manifest: name, start_url, standalone, 192 + 512 PNG icons that really have those sizes', async () => {
    const m = await (await fetch(BASE + '/sokohai-manifest.json')).json();
    assert(m.name && m.short_name && m.start_url && m.display === 'standalone', JSON.stringify(m).slice(0, 200));
    const sizes = [];
    for (const ic of m.icons) { const buf = Buffer.from(await (await fetch(BASE + '/' + ic.src.replace(/^\.\//, ''))).arrayBuffer()); assert(pngSize(buf) === ic.sizes, ic.src + ' ' + pngSize(buf) + ' != ' + ic.sizes); sizes.push(ic.sizes); }
    assert(sizes.includes('192x192') && sizes.includes('512x512'), sizes.join()); return sizes.join(', '); });
  await step('dev host without opt-in: no service worker (fresh files while developing)', async () => {
    await p.goto(BASE + '/', { waitUntil: 'load' }); await p.waitForTimeout(2500);
    const n = await p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length); assert(n === 0, 'regs ' + n); });
  await step('opt-in: SW registers, activates and controls the page; shell is precached', async () => {
    await p.evaluate(() => localStorage.setItem('skh_pwa_test', '1'));
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => navigator.serviceWorker.controller || (window.__skhSwReg && window.__skhSwReg.active), null, { timeout: 30000 });
    await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
    await p.evaluate(() => { window.__skhNoReload = 1; });
    await p.waitForTimeout(4000);
    assert(await p.evaluate(() => window.__skhNoReload === 1).catch(() => false), 'first install reloaded the page');
    const keys = await p.evaluate(async () => { const out = []; for (const k of await caches.keys()) { const c = await caches.open(k); (await c.keys()).forEach(r => out.push(new URL(r.url).pathname)); } return out; });
    for (const need of ['/index.html', '/offline.html', '/sokohai-manifest.json']) assert(keys.includes(need), need + ' missing; ' + keys.slice(0, 20).join(' '));
    return keys.length + ' cached'; });
  await step('nothing sensitive is cached (auth, tokens, functions, PesaPal, wallet, checkout)', async () => {
    await p.evaluate(() => Promise.all(['/__fn/x', '/api/pay', '/pesapal/ipn', '/wallet/x', '/checkout/x', '/auth/x?token=1'].map(u => fetch(u).catch(() => null))));
    await p.waitForTimeout(800);
    const bad = await p.evaluate(async () => { const out = []; for (const k of await caches.keys()) { const c = await caches.open(k); (await c.keys()).forEach(r => { if (/__fn|\/api\/|pesapal|token|auth|checkout|wallet/i.test(r.url)) out.push(r.url); }); } return out; });
    assert(bad.length === 0, bad.join(' ')); });
  await step('offline: reload opens the SokoHai shell from cache (no browser error page)', async () => {
    await ctx.setOffline(true);
    await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await p.waitForTimeout(3000);
    const t = await p.title(); const hasShell = await p.evaluate(() => !!document.querySelector('#authModal, header, .app-header, #app, body > *'));
    assert(/SokoHai/i.test(t) && hasShell, 'title=' + t); await p.screenshot({ path: OUT + 'offline-shell.png' }); return 'title=' + t; });
  await step('offline with no cached shell: offline.html (Swahili, retry button)', async () => {
    await p.evaluate(async () => { for (const k of await caches.keys()) { const c = await caches.open(k); await c.delete('/index.html'); await c.delete('/'); for (const r of await c.keys()) if (new URL(r.url).pathname === '/' || /index\.html/.test(r.url)) await c.delete(r); } });
    await p.goto(BASE + '/some/page', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await p.waitForTimeout(1500);
    const txt = await p.evaluate(() => document.body.innerText);
    assert(/Jaribu tena/i.test(txt), txt.slice(0, 200)); await p.screenshot({ path: OUT + 'offline-page.png' }); return txt.split('\n')[0].slice(0, 60); });
  await step('back online: the app loads normally again', async () => {
    await ctx.setOffline(false); await p.waitForTimeout(2500); // offline.html reloads itself on 'online'
    await p.goto(BASE + '/', { waitUntil: 'load' }).catch(async () => { await p.waitForTimeout(1500); await p.goto(BASE + '/', { waitUntil: 'load' }); });
    await p.waitForFunction(() => window.skh && window.skh.auth, null, { timeout: 45000 }); });
  await step('update: a new SW version waits; the \"Pakia upya\" bar appears; tapping it (SKIP_WAITING) activates it and reloads once', async () => {
    // the browser fetches SW scripts itself (not routable), so a new version is written to disk on the
    // LOCAL test checkout for this step only and the original is restored right after
    const swPath = path.join(__dirname, '..', '..', 'sokohai-sw.js'); const swSrc = fs.readFileSync(swPath, 'utf8');
    fs.writeFileSync(swPath, swSrc + '\n// r15-e2e-update ' + Date.now() + '\n');
    try {
    await p.evaluate(() => window.__skhSwReg.update());
    await p.waitForFunction(() => window.__skhSwReg && window.__skhSwReg.waiting, null, { timeout: 30000 });
    const kept = await p.evaluate(() => { window.__skhMark = 1; return !!navigator.serviceWorker.controller; }); assert(kept, 'old SW still controls until accepted');
    await p.waitForSelector('#skhUpdateBar #skhUpdateGo', { timeout: 15000 }); await p.screenshot({ path: OUT + 'update-bar.png' });
    await p.waitForTimeout(2000);
    { const w = await p.evaluate(() => !!window.__skhSwReg.waiting && window.__skhMark === 1); assert(w, 'activated before the user accepted'); }
    await p.click('#skhUpdateGo');
    let st = {}; const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      await p.waitForTimeout(1000);
      st = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { waiting: !!(r && r.waiting), active: !!(r && r.active), reloaded: window.__skhMark !== 1 }; }).catch(() => ({}));
      if (st.active && !st.waiting && st.reloaded) break;
    }
    assert(st.active && !st.waiting, JSON.stringify(st));
    assert(await p.evaluate(() => window.__skhMark !== 1), 'page did not reload after accepting the update'); return JSON.stringify(st);
    } finally { fs.writeFileSync(swPath, swSrc); } });
  await p.evaluate(async () => { localStorage.removeItem('skh_pwa_test'); for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); }).catch(() => {});
  console.log('JS errors:', errs.length, errs.slice(0, 5).join('\n'));
  console.log('RESULT', results.length, 'pass', failed, 'fail'); await b.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
