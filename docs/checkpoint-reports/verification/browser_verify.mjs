// Real Chromium verification of the emulator wiring (Step 2). Production Firebase endpoints are ABORTED (never contacted).
import { chromium } from '/tmp/fbweb/node_modules/playwright/index.mjs';
import fs from 'fs'; import path from 'path';
const ROOT = '/home/user/SokoHai-phase1';
const PROD_HOST = /^(firestore|identitytoolkit|securetoken|firebaseinstallations|firebase|firebasestorage)\.googleapis\.com$|cloudfunctions\.net$|\.run\.app$|^sokonet-3b847\./;
const isProd = u => { try { return PROD_HOST.test(new URL(u).hostname); } catch (_) { return false; } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const results = []; let fails = 0;
const ok = (n, c, d = '') => { results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); if (!c) fails++; };

async function session(label, url, { mapProdHost = false, forge = false } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const hosts = new Set(); const prodAttempts = []; const consoleInfo = [];
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (isProd(u)) { prodAttempts.push(u.split('?')[0]); return route.abort(); }
    if (mapProdHost && u.startsWith('https://sokohaico.netlify.app')) {
      let p = decodeURIComponent(new URL(u).pathname); if (p === '/' ) p = '/index.html';
      const f = path.join(ROOT, p);
      if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' } });
      return route.fulfill({ status: 404, body: 'nf' });
    }
    try { hosts.add(new URL(u).host); } catch (_) {}
    return route.continue();
  });
  const page = await ctx.newPage();
  if (forge) await page.addInitScript(() => { window.SKH_LOCAL_FUNCTIONS_SERVER = true; window.SKH_EMULATOR = { projectId: 'demo-sokohai', firestore: { host: '127.0.0.1', port: 8085 }, authUrl: 'http://127.0.0.1:9099' }; });
  page.on('console', m => { const t = m.text(); if (/LOCAL EMULATOR|emulator connect/.test(t)) consoleInfo.push(t); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.skh && window.skh.fApp, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const state = await page.evaluate(() => ({
    projectId: skh.fApp.options.projectId, emulator: !!skh.emulator, functionsBaseUrl: skh.functionsBaseUrl || '',
    authEmulator: !!(skh.auth.emulatorConfig), authEmulatorUrl: skh.auth.emulatorConfig ? `${skh.auth.emulatorConfig.protocol}://${skh.auth.emulatorConfig.host}:${skh.auth.emulatorConfig.port}` : '',
    isLocalEnv: skh.isLocalEnv }));
  return { browser, page, hosts, prodAttempts, consoleInfo, state, label };
}

// ---------- (1) Local emulator mode ----------
const L = await session('local', 'http://localhost:5055/');
console.log('LOCAL state:', JSON.stringify(L.state), '\n  console:', L.consoleInfo.join(' | '));
ok('LOCAL project = demo-sokohai', L.state.projectId === 'demo-sokohai');
ok('LOCAL Auth connected to emulator 127.0.0.1:9099', L.state.authEmulator && L.state.authEmulatorUrl === 'http://127.0.0.1:9099', L.state.authEmulatorUrl);
ok('LOCAL functions → local server (/__fn)', L.state.functionsBaseUrl.endsWith('/__fn'), L.state.functionsBaseUrl);
ok('LOCAL console announces LOCAL EMULATOR', L.consoleInfo.some(t => /LOCAL EMULATOR: project demo-sokohai/.test(t)));
// Sign up through the page's own Auth instance, then Firestore + callable through the app's own wrappers
const flow = await L.page.evaluate(async () => {
  const a = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js');
  const cred = await a.createUserWithEmailAndPassword(skh.auth, 'browser.b.' + Date.now() + '@test.local', 'secret123');
  const tok = await cred.user.getIdToken(); const claims = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  let fsRead = 'n/a';
  try { const s = await skh.getDocs(skh.query(skh.collection(skh.db, 'announcements'), skh.where('status', '==', 'published'), skh.where('archived', '==', false), skh.limit(5))); fsRead = 'ok:' + s.size; } catch (e) { fsRead = 'err:' + (e.code || e.message); }
  let call; try { const r = await skh.callFunction('adsRequestDelivery', { placement: 'home', slotId: 'browser-check', requestId: 'r' + Date.now(), sessionId: 's' + Date.now(), context: {} }); call = 'ok:' + JSON.stringify((r && r.data) || r).slice(0, 80); } catch (e) { call = 'err:' + (e.code || e.message); }
  return { uid: cred.user.uid, aud: claims.aud, iss: claims.iss, fsRead, call };
});
await L.page.waitForTimeout(800);
console.log('LOCAL browser flow:', JSON.stringify(flow));
console.log('LOCAL hosts contacted:', [...L.hosts].join(', '));
ok('LOCAL sign-up issued by Auth Emulator token aud=demo-sokohai', flow.aud === 'demo-sokohai', 'iss=' + flow.iss);
ok('LOCAL Firestore query served (emulator)', flow.fsRead.startsWith('ok:'), flow.fsRead);
ok('LOCAL callable through skh.callFunction succeeds (no 401)', flow.call.startsWith('ok:'), flow.call);
ok('LOCAL Firestore traffic went to 127.0.0.1:8085', L.hosts.has('127.0.0.1:8085'));
ok('LOCAL Auth traffic went to 127.0.0.1:9099', L.hosts.has('127.0.0.1:9099'));
ok('LOCAL ZERO attempts to production Firebase endpoints', L.prodAttempts.length === 0, L.prodAttempts.slice(0, 3).join(' '));
await L.browser.close();

// ---------- (2) Production host, unmodified files (Netlify simulation) ----------
const P = await session('prod', 'https://sokohaico.netlify.app/', { mapProdHost: true });
console.log('PROD state:', JSON.stringify(P.state), '\n  prod endpoints attempted (aborted):', [...new Set(P.prodAttempts.map(u => new URL(u).host))].join(', '));
ok('PROD project stays sokonet-3b847', P.state.projectId === 'sokonet-3b847');
ok('PROD emulator OFF, Auth not on emulator', !P.state.emulator && !P.state.authEmulator);
ok('PROD callables keep Cloud wiring (no functionsBaseUrl)', P.state.functionsBaseUrl === '');
ok('PROD page targets production Firebase (aborted by harness)', P.prodAttempts.length > 0);
ok('PROD no traffic to emulator ports', ![...P.hosts].some(h => /:(8085|9099|5055)$/.test(h)));
await P.browser.close();

// ---------- (3) Production host + forged SKH_EMULATOR ----------
const F = await session('forged', 'https://sokohaico.netlify.app/', { mapProdHost: true, forge: true });
console.log('FORGED state:', JSON.stringify(F.state));
ok('FORGED SKH_EMULATOR on production host ignored', F.state.projectId === 'sokonet-3b847' && !F.state.emulator && !F.state.authEmulator);
await F.browser.close();

console.log('\n' + results.join('\n') + `\n\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
