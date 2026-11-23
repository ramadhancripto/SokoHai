#!/usr/bin/env node
/* [L10N 2026-11-23] Live language switch, both directions (real browser + emulators).
 * For each major screen: open it in one language, switch to the other WITHOUT reloading, and check that no visible
 * interface text (text nodes and placeholders) is left in the previous language. User content (listing titles and
 * descriptions, search terms), brand / product names and technical identifiers are exempt. Also checked: the
 * preference survives a reload and navigation, <html lang> follows, an open cart / search panel / Language Center is
 * rebuilt in the new language, a Kiswahili -> English -> Kiswahili round trip restores every text, <option> values do not change when their label is translated, and no screen scrolls
 * sideways at 360 px. */
import { chromium } from 'playwright'; import { readFileSync } from 'node:fs'; import assert from 'node:assert/strict';
const SDK = (process.env.SKH_FIREBASE_SDK_DIR || '').replace(/\/?$/, '/');
const APP = process.env.SKH_APP_URL || 'http://127.0.0.1:5055/';
// Part A (this file): live switch both ways, rebuilt views, <option> values, persistence.
// Part B (test_l10n_roundtrip_layout_browser.mjs): round trip on every screen and the 360 px layout check.
const PART = globalThis.__L10N_PART || 'A';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  PASS ' + m); };
const T = Date.now().toString(36), PW = 'Siri-' + T + '-9', EM = 'l10n-' + T + '@example.test';
await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EM, password: PW, returnSecureToken: true }) });
const SW = /\b(na|ya|kwa|wa|za|la|cha|vya|bidhaa|huduma|hakuna|tafuta|ingia|toka|bei|duka|muuzaji|mnunuzi|oda|malipo|usafiri|habari|karibu|chagua|weka|hifadhi|tuma|ongeza|zaidi|yote|zote|sasa|leo|jina|mahali|eneo|maelezo|picha|ujumbe|arifa|mipangilio|akaunti|wasifu|lugha|msaada|kuhusu|sheria|faragha|inapakia|imeshindikana|tazama|angalia|fungua|funga|rudi|endelea|thibitisha|futa|hariri|badilisha|ondoa|lipa|nunua|uza|kikapu|jumla|kiasi|hali|aina|makundi|watu|biashara|mauzo|stoo|ripoti|wateja|mkoa|nchi|simu|barua|huna|una|ni|si|kwenye|hapa|tena|pia|kama|au|mpya|yako|wako|zako|langu|yangu|chako|bado|imeshindwa|imefanikiwa|tafadhali|samahani)\b/i;
const EN = /\b(the|and|your|you|add|save|cancel|search|products?|services?|settings|account|profile|sign in|log ?in|log ?out|delete|edit|send|view|more|all|new|no|not|yet|loading|failed|error|success|please|open|close|back|next|continue|confirm|select|choose|price|seller|buyer|order|orders|payment|cart|messages?|notifications?|help|support|language|privacy|terms|about|location|category|categories|share|follow|report|details?|from|with|for|is|are|this|that|here|there|now|today)\b/;
const EXEMPT = /SokoHai|SokoPay|SokoHuru|Google|WhatsApp|Facebook|YouTube|Vimeo|TZS|TSh|Tsh|M-Pesa|Airtel|Tigo|HaloPesa|Visa|Mastercard|PesaPal|Cloudinary|Firebase|Netlify|OpenStreetMap|POS|SKU|QR|PIN|OTP|ID|URL|PDF|CSV|GPS|LIVE|Live|Chat/;
const SCREENS = [
 ['home', "updateApp('home')"], ['bidhaa', "updateApp('bidhaa')"], ['huduma', "updateApp('services')"], ['usafiri', "updateApp('delivery')"],
 ['category-modal', 'openCategoryModal && openCategoryModal()'],
 ['search', "(()=>{const i=document.getElementById('searchInput'); if(i){i.value='simu'; i.dispatchEvent(new Event('input',{bubbles:true})); i.focus();}})()"],
 ['product', "(async()=>{const s=await window.skh.getDocs(window.skh.query(window.skh.collection(window.skh.db,'products'),window.skh.limit(1)));s.forEach(d=>window.openProduct(d.id,'products'));})()"],
 ['menu', "openSidebarMenu(); setTimeout(()=>{document.querySelectorAll('.skh-sec-hidden').forEach(e=>e.classList.remove('skh-sec-hidden'))},200)"],
 ['mode-menu', 'openModeMenu()'], ['welcome', "(()=>{const m=document.getElementById('welcomeModal'); if(m) m.style.display='flex';})()"],
 ['plus', 'togglePlusMenu()'], ['chat', 'openChatList()'], ['notifications', 'openNotifications()'], ['cart', 'openCart()'], ['orders', 'openBuyerOrdersModal()'],
 ['profile', 'openProfile()'], ['settings-security', "openSokoHaiAccountSetting('security')"], ['settings-privacy', "openSokoHaiAccountSetting('privacy')"],
 ['settings-legal', "openSokoHaiAccountSetting('legal_center')"], ['language-center', "openSokoHaiAccountSetting('language')"],
 ['support', "skhOpenSupport('other')"], ['sokopay', 'openSokoPay()'], ['sp-tokens', 'openSokoPayUnifiedTokenCenter()'],
 ['tracking-lookup', 'openTrackingTokenLookup && openTrackingTokenLookup()'], ['ride-request', 'openRideRequestModal && openRideRequestModal()'],
 ['live-create', 'skhLiveCreateForm()'], ['kamusi', 'skhOpenKamusi && skhOpenKamusi()'], ['advertiser', 'skhOpenAdvertiserDashboard()'],
];
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
if (SDK !== '/') await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, rt => rt.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(SDK + rt.request().url().split('/').pop()) }));
await ctx.route(/res\.cloudinary\.com|nominatim|tile\.openstreetmap|arcgisonline/, r => r.abort());
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss().catch(() => {}));
await p.addInitScript(() => { try { localStorage.setItem('skh_welcomed_v1', '1'); } catch (e) {} });
await p.goto(APP); await p.waitForFunction(() => window.skh && window.skh.__authResolved && window.SokoHaiLMS, null, { timeout: 45000 });
ok(await p.evaluate(() => window.SokoHaiLMS.lang === 'sw' && document.documentElement.lang === 'sw'), 'a new visitor starts in Kiswahili');
await p.evaluate(async ({ e, pw }) => { await window.skh.signInWithEmailAndPassword(window.skh.auth, e, pw); }, { e: EM, pw: PW }); await p.waitForTimeout(2500);
const scan = (re) => p.evaluate(({ src, ex }) => { const RE = new RegExp(src, 'i'), EXR = new RegExp(ex); const seen = new Set(), res = [], all = [];
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight * 3 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); const el = n.parentElement; if (!t || t.length < 3 || !el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName) || el.closest('[data-no-i18n],.skh-brand-word,.skh-brand-lockup,.shc-post-brand,.welcome-brand-text,.skh-oc,.skh-huru,.feed-card-box,input,textarea,[data-user-content]') || !vis(el) || seen.has(t)) continue;
    seen.add(t); all.push(t); const core = t.replace(EXR, ''); if (RE.test(core)) res.push(t); }
  document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(i => { if (!vis(i)) return; const t = i.getAttribute('placeholder').trim(); if (t && !seen.has(t)) { seen.add(t); all.push(t); if (RE.test(t.replace(EXR, ''))) res.push('[placeholder] ' + t); } });
  return { total: all.length, left: res }; }, { src: re.source, ex: EXEMPT.source });

if (PART === 'A') {
for (const [TARGET, OTHER, RE] of [['en', 'sw', SW], ['sw', 'en', EN]]) {
  const left = []; let total = 0;
  for (const [name, js] of SCREENS) {
    try { await p.evaluate('try{closeModals()}catch(e){}'); await p.evaluate(`window.skhSetLang('${OTHER}')`); await p.waitForTimeout(250); await p.evaluate(js); } catch (e) {}
    await p.waitForTimeout(1200);
    await p.evaluate(`window.skhSetLang('${TARGET}')`); await p.waitForTimeout(900);
    const r = await scan(RE); total += r.total; r.left.forEach(t => left.push(name + ': ' + t));
  }
  ok(left.length === 0, `${OTHER} -> ${TARGET}: no interface text left in ${OTHER === 'sw' ? 'Kiswahili' : 'English'} on ${SCREENS.length} screens (${total} texts checked): ` + JSON.stringify(left.slice(0, 12)));
}
}
if (PART === 'B') {
// round trip: Kiswahili -> English -> Kiswahili gives back exactly the same visible text on every screen
const rt = [];
for (const [name, js] of SCREENS) {
  try { await p.evaluate("try{closeModals()}catch(e){}; window.skhSetLang('sw')"); await p.waitForTimeout(250); await p.evaluate(js); } catch (e) {}
  await p.waitForTimeout(1200); const a = (await scan(/[\s\S]/)).left;
  await p.evaluate("window.skhSetLang('en')"); await p.waitForTimeout(800); await p.evaluate("window.skhSetLang('sw')"); await p.waitForTimeout(900);
  const c = (await scan(/[\s\S]/)).left; const lost = a.filter(t => !c.includes(t)), added = c.filter(t => !a.includes(t));
  if (lost.length || added.length) rt.push(name + ': ' + JSON.stringify({ lost: lost.slice(0, 4), added: added.slice(0, 4) }));
}
ok(rt.length === 0, `Kiswahili -> English -> Kiswahili restores every visible text on ${SCREENS.length} screens: ` + JSON.stringify(rt.slice(0, 10)));
}
if (PART === 'A') {
// an open view is rebuilt: cart summary (count/total), search panel footer, Language Center sentence
await p.evaluate("try{closeModals()}catch(e){}; window.skhSetLang('sw')"); await p.evaluate('openCart()'); await p.waitForTimeout(1200);
await p.evaluate("window.skhSetLang('en')"); await p.waitForTimeout(900);
ok(await p.evaluate(() => { const s = document.querySelector('#cartModal .fcart-head small'); return !!s && !/Bidhaa|Jumla|Inalindwa/.test(s.textContent); }), 'open cart header is rebuilt in English');
await p.evaluate("try{closeModals()}catch(e){}; window.skhSetLang('sw'); window.openSokoHaiLanguageCenter()"); await p.waitForTimeout(800);
await p.evaluate("window.skhSetLang('en')"); await p.waitForTimeout(900);
ok(await p.evaluate(() => /The whole system uses one language at a time/.test(document.getElementById('sokohaiLanguageCenterModal').textContent)), 'open Language Center is rebuilt in English');
// <option> without value keeps its submitted value
await p.evaluate("try{closeModals()}catch(e){}; window.skhSetLang('sw')"); await p.waitForTimeout(900);
await p.evaluate(() => { window.__optProbe = [...document.querySelectorAll('select option')].map(o => [o, o.value, o.textContent.trim()]); });
await p.evaluate("window.skhSetLang('en')"); await p.waitForTimeout(1200);
const optRes = await p.evaluate(() => { const L = window.__optProbe || []; const relabeled = L.filter(([o, v, t]) => o.textContent.trim() !== t);
  return { n: L.length, relabeled: relabeled.length, broken: L.filter(([o, v]) => o.value !== v).map(([o, v]) => v + '->' + o.value).slice(0, 5) }; });
ok(optRes.relabeled > 0 && optRes.broken.length === 0, `switching relabels <option>s without changing their values (${optRes.relabeled}/${optRes.n} relabeled): ` + JSON.stringify(optRes.broken));
// persistence: reload and navigation
await p.evaluate("try{closeModals()}catch(e){}; window.skhSetLang('en')"); await p.reload(); await p.waitForFunction(() => window.SokoHaiLMS && window.skh && window.skh.__authResolved, null, { timeout: 45000 }); await p.waitForTimeout(1500);
ok(await p.evaluate(() => window.SokoHaiLMS.lang === 'en' && document.documentElement.lang === 'en'), 'English survives a reload');
await p.evaluate("updateApp('services')"); await p.waitForTimeout(800); await p.evaluate("updateApp('home')"); await p.waitForTimeout(800);
ok(await p.evaluate(() => window.SokoHaiLMS.lang === 'en' && /Search/i.test(document.getElementById('searchInput').getAttribute('placeholder'))), 'English survives navigation (search placeholder stays English)');
await p.evaluate("window.skhSetLang('sw')"); await p.waitForTimeout(800);
ok(await p.evaluate(() => /Tafuta/.test(document.getElementById('searchInput').getAttribute('placeholder'))), 'switching back restores the Kiswahili placeholder');
}
if (PART === 'B') {
// no sideways scroll at 360 px in either language
await p.setViewportSize({ width: 360, height: 780 }); const wide = [];
for (const L of ['sw', 'en']) for (const [name, js] of SCREENS) {
  try { await p.evaluate(`try{closeModals()}catch(e){}; window.skhSetLang('${L}')`); await p.evaluate(js); } catch (e) {}
  await p.waitForTimeout(700);
  const w = await p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
  if (w > 362) wide.push(L + ':' + name + '=' + w);
}
ok(wide.length === 0, 'no screen scrolls sideways at 360 px in Kiswahili or English: ' + JSON.stringify(wide));
}
ok(errs.length === 0, 'no page errors: ' + JSON.stringify(errs.slice(0, 3)));
console.log(`\nL10N ${PART === 'A' ? 'LIVE SWITCH' : 'ROUND TRIP + LAYOUT'}: ${n} passed, 0 failed`); await b.close();
