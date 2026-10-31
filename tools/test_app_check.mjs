#!/usr/bin/env node
// [REPAIR 2026-10 M3] App Check: callables refuse requests without an App Check
// token only when APP_CHECK_ENFORCE=true (monitor first, then enforce); HTTP
// endpoints for PesaPal IPN stay reachable; browser starts App Check before
// Firebase services and keeps the site key in public config.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (info ? '\n       ' + info : '')); } };
function probe(enforce) {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'tools/fixtures/app-check-probe.cjs'), enforce, 'adsRequestDelivery', 'walletAdjust', 'creativeTrackEvent'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out.split('\n').find(l => l.startsWith('RESULT ')).slice(7));
}
const on = probe('true'), off = probe('');
ok('enforced: public callable without App Check token is refused (401)', on.adsRequestDelivery.code === 401, JSON.stringify(on.adsRequestDelivery));
ok('enforced: money callable without App Check token is refused (401)', on.walletAdjust.code === 401, JSON.stringify(on.walletAdjust));
ok('enforced: ads/creative no longer opt out of App Check', on.creativeTrackEvent.code === 401, JSON.stringify(on.creativeTrackEvent));
ok('monitor mode: same request reaches the function (validation error, not 401)', off.adsRequestDelivery.code !== 401, JSON.stringify(off.adsRequestDelivery));
const idx = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
ok('PesaPal IPN is an HTTP endpoint (not gated by App Check)', /exports\.pesapalIpn = onRequest\(/.test(idx));
ok('no callable opts out with enforceAppCheck:false', !fs.readdirSync(path.join(ROOT, 'functions')).filter(f => f.endsWith('.js')).some(f => /enforceAppCheck\s*:\s*false/.test(fs.readFileSync(path.join(ROOT, 'functions', f), 'utf8'))));
const boot = fs.readFileSync(path.join(ROOT, 'js/app/00-bootstrap.js'), 'utf8');
const iAC = boot.indexOf('initializeAppCheck(skh.fApp'), iAuth = boot.indexOf('skh.auth = skh.getAuth(');
ok('browser starts App Check right after initializeApp, before Auth/Firestore', iAC > 0 && iAC < iAuth);
ok('App Check is skipped on the local emulator', /acKey && !skh\.emulator/.test(boot));
const cfg = fs.readFileSync(path.join(ROOT, 'js/00-config.js'), 'utf8');
ok('site key is in public config (empty until the Console step)', /APP_CHECK_SITE_KEY:\s*'[^']*'/.test(cfg));
// [PHASE 9] provider + REST calls that bypass the SDK carry the App Check token
ok('provider is reCAPTCHA Enterprise (not v3)', /new ReCaptchaEnterpriseProvider\(acKey\)/.test(boot) && !/ReCaptchaV3Provider/.test(boot));
ok('skhAppCheckHeaders helper uses getToken', /window\.skhAppCheckHeaders = async function/.test(boot) && /await getToken\(skh\.appCheck, false\)/.test(boot));
const ppr = fs.readFileSync(path.join(ROOT, 'js/17-pesapal-return.js'), 'utf8');
ok('offline sign-up REST call sends App Check header', /acHeaders = \(typeof window\.skhAppCheckHeaders/.test(ppr) && /Object\.assign\(\{ 'Content-Type': 'application\/json' \}, acHeaders\)/.test(ppr));
const diag = fs.readFileSync(path.join(ROOT, 'js/app/54-error-core.js'), 'utf8');
ok('admin diagnostics REST call sends App Check header', /fetch\(firestoreUrl, \{ headers: acH \}\)/.test(diag));
const bad = ['js', 'js/app'].flatMap(d => fs.readdirSync(path.join(ROOT, d)).filter(f => f.endsWith('.js')).map(f => path.join(d, f)))
  .filter(f => /fetch\([^)]*(firestore|identitytoolkit|securetoken)\.googleapis\.com/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
ok('no other direct fetch() to Firebase REST APIs', bad.length === 0, bad.join(', '));
console.log(`\nAPP CHECK: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
