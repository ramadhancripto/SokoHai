#!/usr/bin/env node
/* [I18N 2026-11-22] Language integrity (Chromium + local server):
 *  1. missing translations — every key the code asks for (data-i18n, data-i18n-placeholder, skhTF('k'), LMS.t('k'),
 *     window.t('k') in html/ and js/) exists in BOTH English and Swahili in the one LMS dictionary;
 *  2. fallback — an unknown key gives the caller's fallback (skhTF) and never undefined / "null";
 *  3. language mixing after switching — Swahili -> English -> Swahili returns every visible text on the main screens
 *     to exactly what it was (before 2026-11-22 the phrase sweep doubled a leading quote and the banner stayed English).
 * Run: `node functions/local-server.js` (5055), SKH_FIREBASE_SDK_DIR=<firebase@10.8.1> node tools/test_i18n_integrity_browser.mjs */
import { chromium } from 'playwright';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const APP = process.env.SKH_APP_URL || 'http://127.0.0.1:5055/';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  PASS ' + m); };

const files = []; const walk = (d) => { for (const f of readdirSync(d)) { const q = path.join(d, f); if (statSync(q).isDirectory()) walk(q); else if (/\.(js|html)$/.test(f)) files.push(q); } };
walk(path.join(ROOT, 'html')); walk(path.join(ROOT, 'js'));
const RES = [/data-i18n(?:-placeholder|-aria|-title|-alt)?=\\?["']([A-Za-z0-9_.-]+)\\?["']/g, /skhTF\(\s*['"]([A-Za-z0-9_.-]+)['"]/g, /\bLMS\.t\(\s*['"]([A-Za-z0-9_.-]+)['"]/g, /window\.t\(\s*['"]([A-Za-z0-9_.-]+)['"]/g, /SokoHaiLMS\.t\(\s*['"]([A-Za-z0-9_.-]+)['"]/g];
const keys = new Map(); for (const f of files) { const s = readFileSync(f, 'utf8'); for (const re of RES) for (const m of s.matchAll(re)) if (!keys.has(m[1])) keys.set(m[1], path.relative(ROOT, f)); }

const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
if (process.env.SKH_FIREBASE_SDK_DIR) { const sdk = process.env.SKH_FIREBASE_SDK_DIR.replace(/\/?$/, '/'); await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(sdk + r.request().url().split('/').pop()) })); }
await ctx.route(/res\.cloudinary\.com|nominatim/, r => r.abort());
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss().catch(() => {}));
await p.addInitScript(() => { try { localStorage.setItem('skh_welcomed_v1', '1'); localStorage.setItem('sokohai_language', 'sw'); } catch (e) {} });
await p.goto(APP); await p.waitForFunction(() => window.SokoHaiLMS && Object.keys(window.SokoHaiLMS.dict.en).length > 1000, null, { timeout: 45000 }); await p.waitForTimeout(2500);

// 1. missing translations
const miss = await p.evaluate((ks) => { const d = window.SokoHaiLMS.dict; return ks.filter(([k]) => !d.en[k] || !d.sw[k]); }, [...keys.entries()]);
ok(keys.size >= 100 && miss.length === 0, 'every key referenced by the code (' + keys.size + ') has English and Swahili ' + JSON.stringify(miss.slice(0, 8)));
const empty = await p.evaluate(() => { const d = window.SokoHaiLMS.dict; return Object.keys(d.en).filter(k => !String(d.en[k]).trim() || !String(d.sw[k] || '').trim()).slice(0, 8); });
ok(empty.length === 0, 'no dictionary entry is empty in either language ' + JSON.stringify(empty));
const raw = await p.evaluate(() => { const L = window.SokoHaiLMS; const bad = []; for (const lg of ['en', 'sw']) { L.lang = lg; Object.keys(L.dict.en).slice(0, 4000).forEach(k => { const t = L.t(k); if (t === k && /_/.test(k)) bad.push(lg + ':' + k); }); } L.lang = 'sw'; return bad.slice(0, 8); });
ok(raw.length === 0, 'no translation shows its raw key ' + JSON.stringify(raw));

// 2. fallback
const fb = await p.evaluate(() => [window.skhTF('zz_missing_key_test', 'Fallback ya majaribio'), String(window.SokoHaiLMS.t('zz_missing_key_test'))]);
ok(fb[0] === 'Fallback ya majaribio' && fb[1] !== 'undefined' && fb[1] !== 'null', 'unknown key: the caller\'s fallback is shown (never undefined / null)');

// 3. round trip on the main screens
const SCREENS = [['home', "updateApp('home')"], ['bidhaa', "updateApp('bidhaa')"], ['huduma', "updateApp('services')"], ['usafiri', "updateApp('delivery')"], ['menu', 'openSidebarMenu()'], ['cart', 'openCart()']];
const texts = () => p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let x;
  while ((x = w.nextNode())) { const el = x.parentElement; const t = x.nodeValue.replace(/\s+/g, ' ').trim(); if (!t || !el || /SCRIPT|STYLE/.test(el.tagName)) continue;
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el); if (r.width && r.height && s.visibility !== 'hidden' && s.display !== 'none' && r.top < innerHeight * 3 && !/\d{1,2}:\d{2}|sekunde|dakika|ago|zilizopita/i.test(t)) out.push(t); }
  return out; });
for (const [name, js] of SCREENS) {
  try { await p.evaluate('try{closeModals()}catch(e){}'); await p.evaluate(js); } catch (e) {}
  await p.waitForTimeout(1500);
  const sw0 = await texts();
  await p.evaluate(() => window.skhSetLang('en')); await p.waitForTimeout(900);
  const en = await texts();
  await p.evaluate(() => window.skhSetLang('sw')); await p.waitForTimeout(900);
  const sw1 = await texts();
  const a = new Set(sw0), c = new Set(sw1);
  const lost = [...a].filter(t => !c.has(t)), added = [...c].filter(t => !a.has(t));
  ok(lost.length === 0 && added.length === 0, name + ': Swahili -> English -> Swahili restores every visible text (' + sw0.length + ' texts; changed in English: ' + en.filter(t => !a.has(t)).length + ') ' + JSON.stringify({ lost: lost.slice(0, 4), added: added.slice(0, 4) }));
}
ok(!errs.length, 'no JavaScript errors ' + errs.slice(0, 2).join(' | '));
await b.close();
console.log(`\nI18N INTEGRITY (browser): ${n} passed, 0 failed`);
