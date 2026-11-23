#!/usr/bin/env node
/* [I18N 2026-11-23] Deep-module language test: signs in on the emulator, switches to English and opens SokoPay (wallet,
 * deposit, escrow, tokens, orders), Business OS (overview, stock, expenses, staff, finance, insights, analytics, settings,
 * performance, recycle bin), POS, Live (hub, deals, create), identity verification, support and the activity recycle bin.
 * Every visible system text must be free of common Swahili words (user content and product cards are excluded).
 * Needs: emulator (auth 9099, firestore 8085) + node functions/local-server.js --static (5055). */
import { chromium } from 'playwright'; import { readFileSync } from 'node:fs';
const SDK = (process.env.SKH_FIREBASE_SDK_DIR || '').replace(/\/?$/, '/');
const T = Date.now().toString(36), PW = 'Siri-' + T + '-9', EM = 'lang-' + T + '@example.test';
await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EM, password: PW, returnSecureToken: true }) });
const SW = /\b(na|ya|kwa|wa|za|la|cha|vya|bidhaa|huduma|hakuna|tafuta|ingia|toka|bei|soko|duka|muuzaji|mnunuzi|oda|malipo|usafiri|habari|karibu|chagua|weka|hifadhi|tuma|ongeza|zaidi|yote|zote|sasa|leo|jina|mahali|eneo|maelezo|picha|ujumbe|arifa|mipangilio|akaunti|wasifu|lugha|msaada|kuhusu|sheria|faragha|inapakia|imeshindikana|tazama|angalia|fungua|funga|rudi|endelea|thibitisha|futa|hariri|badilisha|ondoa|lipa|nunua|uza|kikapu|jumla|kiasi|hali|aina|kategoria|makundi|watu|biashara|mauzo|stoo|ripoti|mwenendo|wateja|mawakala|mkoa|nchi|simu|barua)\b/i;
const SCREENS = [
 ['sokopay', 'openSokoPay()'], ['sp-deposit', 'openSokoPay(); setTimeout(()=>openSokoPayDeposit(),300)'], ['sp-escrow', 'skhOpenEscrowCenter && skhOpenEscrowCenter()'], ['sp-tokens', 'openSokoPayUnifiedTokenCenter && openSokoPayUnifiedTokenCenter()'], ['sp-orders', 'openSokoPayBuyerOrders && openSokoPayBuyerOrders()'],
 ['bos-overview', "switchMode('seller'); setTimeout(()=>switchDashTab('overview'),400)"], ['bos-inventory', "switchDashTab('inventory')"], ['bos-expenses', "switchDashTab('expenses')"], ['bos-staff', "switchDashTab('staff')"], ['bos-finance', "switchDashTab('finance')"], ['bos-insights', "switchDashTab('sales_insights')"], ['bos-analytics', "switchDashTab('analytics')"], ['bos-settings', "switchDashTab('settings')"], ['bos-perf', "switchDashTab('product_performance')"], ['bos-recycle', "switchDashTab('product_recycle_bin')"],
 ['pos', "switchDashTab('pos_page')"],
 ['live-hub', "switchMode('buyer'); skhLiveHub('live')"], ['live-deals', "skhLiveHub('deals')"], ['live-create', 'skhLiveCreateForm && skhLiveCreateForm()'],
 ['verify', 'skhOpenIdentityVerification && skhOpenIdentityVerification()'], ['mysupport', 'skhOpenMySupport && skhOpenMySupport()'], ['recycle', 'skhOpenPersonalRecycle && skhOpenPersonalRecycle()']];
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
if (SDK !== '/') await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, rt => rt.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(SDK + rt.request().url().split('/').pop()) }));
await ctx.route(/res\.cloudinary\.com|nominatim/, r => r.abort());
const p = await ctx.newPage(); p.on('dialog', d => d.dismiss().catch(() => {}));
await p.addInitScript(() => { try { localStorage.setItem('skh_welcomed_v1', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:5055/'); await p.waitForFunction(() => window.skh && window.skh.__authResolved, null, { timeout: 45000 });
await p.evaluate(async ({ e, pw }) => { await window.skh.signInWithEmailAndPassword(window.skh.auth, e, pw); }, { e: EM, pw: PW }); await p.waitForTimeout(2500);
await p.evaluate(() => { Object.assign(window.skh.currentUserData = window.skh.currentUserData || {}, { shopOwnerUid: window.skh.currentUser.uid, businessId: 'b-' + window.skh.currentUser.uid, storeId: 's1', shopName: 'Duka la Test', stockMode: 'strict', businessSetupComplete: true, role: 'seller', accountType: 'business' }); });
await p.evaluate(() => window.skhSetLang('en')); await p.waitForTimeout(1200);
const out = {}; let tot = 0, swt = 0;
for (const [name, js] of SCREENS) {
  try { await p.evaluate('try{closeModals()}catch(e){}'); await p.evaluate(js); } catch (e) {}
  await p.waitForTimeout(1500);
  const texts = await p.evaluate(() => { const seen = new Set(), res = []; const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight * 3 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); const el = n.parentElement; if (!t || t.length < 3 || !el || ['SCRIPT', 'STYLE'].includes(el.tagName) || el.closest('[data-no-i18n],.skh-brand-word,.skh-brand-lockup,.shc-post-brand,.welcome-brand-text,.skh-oc,.skh-huru,.feed-card-box,input,textarea') || !vis(el) || seen.has(t)) continue; seen.add(t); res.push(t); } return res; });
  const sw = texts.filter(t => SW.test(t)); 
  out[name] = { total: texts.length, swahili: sw.length, sample: sw.slice(0, 60) }; tot += texts.length; swt += sw.length;
}
let n = 0, bad = 0;
for (const [k, v] of Object.entries(out)) { const pass = v.total > 0 && v.swahili === 0; console.log((pass ? '  PASS ' : '  FAIL ') + k + ': ' + v.total + ' texts, Swahili left ' + v.swahili + (v.swahili ? ' ' + JSON.stringify(v.sample.slice(0, 3)) : '')); pass ? n++ : bad++; }
console.log('\nLANGUAGE MODULES (browser + emulator): ' + n + ' passed, ' + bad + ' failed');
await b.close(); process.exit(bad ? 1 : 0);
