// [HARDENING 2026-11-16] Firebase environment isolation in a REAL browser.
// The local server (localhost:5055) is reached under other host names with Chromium's
// --host-resolver-rules, so the page sees location.hostname = sokohai.com, a Netlify deploy
// preview, the staging site, an unknown copy... EVERY request to Google/Firebase is ABORTED inside
// the browser and only recorded: nothing ever reaches production (or any real project).
// Checks: production host -> production config; deploy previews / unknown hosts / unconfigured staging
// -> "Environment not configured" and NO Firebase traffic at all; configured staging -> only the
// staging project is addressed (never sokonet-3b847).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const SDK = process.env.SKH_FIREBASE_SDK_DIR ? process.env.SKH_FIREBASE_SDK_DIR.replace(/\/?$/, '/') : null;
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.ENV_TEST_PORT || 5055); // ENV_TEST_PORT: e.g. a static server of the minified dist/ build
const HOSTS = ['sokohai.com', 'www.sokohai.com', 'sokohaicom.netlify.app', 'deploy-preview-7--sokohaicom.netlify.app', 'main--sokohaimarket.netlify.app',
  'sokohai-staging.netlify.app', 'deploy-preview-3--sokohai-staging.netlify.app', 'copy-of-sokohai.example'];
const STAGING = { apiKey: 'AIzaStagingKeyForTestsOnly000000000000', authDomain: 'sokohai-staging.firebaseapp.com', projectId: 'sokohai-staging', storageBucket: 'sokohai-staging.appspot.com', appId: '1:111:web:staging' };
const PROD_KEY = /apiKey:\s*"([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, 'js', 'app', '00-bootstrap.js'), 'utf8'))[1];
let pass = 0, fail = 0;
const ok = (c, m) => { if (!c) throw new Error(m); };
async function step(n, f) { try { const r = await f(); pass++; console.log('PASS ' + n + (r ? ' — ' + r : '')); } catch (e) { fail++; console.log('FAIL ' + n + ' — ' + String(e && e.message).slice(0, 400)); } }

(async () => {
  const b = await chromium.launch({ args: ['--host-resolver-rules=' + HOSTS.map(h => 'MAP ' + h + ' 127.0.0.1').join(', ')] });
  async function visit(host, { stagingConfigured = false } = {}) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const outbound = [], errors = [];
    p.on('pageerror', e => errors.push(String(e.message)));
    if (SDK) await p.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(SDK + r.request().url().split('/').pop()) }));
    if (stagingConfigured) await p.route(/\/js\/00-config\.js/, async r => {
      const body = fs.readFileSync(path.join(process.env.ENV_TEST_DIR || ROOT, 'js', '00-config.js'), 'utf8').replace(/firebase:\s*null\b/, 'firebase: ' + JSON.stringify(STAGING));
      r.fulfill({ status: 200, contentType: 'application/javascript', body });
    });
    await p.route(/^https?:\/\//, r => {
      const u = new URL(r.request().url());
      if (u.port === String(PORT) && HOSTS.concat('localhost').includes(u.hostname)) return r.fallback();
      if (SDK && u.href.includes('gstatic.com/firebasejs/10.8.1/')) return r.fallback();
      outbound.push(u.href); r.abort();
    });
    await p.goto(`http://${host}:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(4000);
    const st = await p.evaluate(() => ({ env: document.documentElement.getAttribute('data-skh-env'), blocked: !!document.getElementById('skhEnvBlocked'), text: (document.getElementById('skhEnvBlocked') || {}).innerText || '', info: window.SKH_ENV_BLOCKED || null, header: !!document.querySelector('.sticky-top-section') && getComputedStyle(document.querySelector('.sticky-top-section')).display !== 'none' }));
    await ctx.close();
    const fb = outbound.filter(u => /googleapis\.com|firebaseio\.com|firebaseapp\.com|cloudfunctions\.net|firebase\.googleapis|identitytoolkit|securetoken/.test(u));
    return Object.assign(st, { outbound, fb, errors });
  }
  const noProd = (v) => v.outbound.filter(u => u.includes('sokonet-3b847') || u.includes(PROD_KEY));

  for (const h of ['sokohai.com', 'www.sokohai.com', 'sokohaicom.netlify.app']) {
    await step(`production host ${h}: production project selected (all Google traffic aborted in the browser)`, async () => {
      const v = await visit(h);
      ok(v.env === 'production' && !v.blocked, JSON.stringify(v).slice(0, 300));
      ok(v.fb.every(u => !/sokohai-staging/.test(u)), 'staging addressed from production');
      return 'env=' + v.env + ', ' + v.fb.length + ' Firebase requests attempted and aborted, 0 delivered';
    });
  }
  for (const h of ['deploy-preview-7--sokohaicom.netlify.app', 'main--sokohaimarket.netlify.app', 'copy-of-sokohai.example']) {
    await step(`${h}: "Environment not configured", Firebase never started, ZERO Firebase requests`, async () => {
      const v = await visit(h);
      ok(v.blocked && /Environment not configured/.test(v.text) && v.info && v.info.reason === 'unknown-host', JSON.stringify(v).slice(0, 300));
      ok(v.fb.length === 0, 'Firebase traffic: ' + v.fb.slice(0, 3).join(' | '));
      ok(!v.env, 'env attribute set');
      return 'reason=' + v.info.reason;
    });
  }
  for (const h of ['sokohai-staging.netlify.app', 'deploy-preview-3--sokohai-staging.netlify.app']) {
    await step(`${h} before staging is configured: blocked (never falls back to production)`, async () => {
      const v = await visit(h);
      ok(v.blocked && v.info.reason === 'staging-not-configured' && v.fb.length === 0, JSON.stringify(v).slice(0, 300));
      return 'reason=' + v.info.reason;
    });
    await step(`${h} with a staging config: only the staging project is addressed`, async () => {
      const v = await visit(h, { stagingConfigured: true });
      ok(v.env === 'staging' && !v.blocked, JSON.stringify(v).slice(0, 300));
      ok(noProd(v).length === 0, 'production addressed: ' + noProd(v).slice(0, 3).join(' | '));
      return v.fb.length + ' Firebase requests attempted (aborted), none to sokonet-3b847';
    });
  }
  await b.close();
  console.log(`RESULT ${pass} pass ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
