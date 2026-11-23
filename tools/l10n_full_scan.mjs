#!/usr/bin/env node
/* [L10N 2026-11-23] Localization audit (real browser + emulators). For every screen in SCREENS: open it in the OTHER
 * language, switch to TARGET without reloading, then list visible text nodes and placeholders still in the OTHER
 * language. User content, brand / product names and technical identifiers are exempt (EXEMPT, [data-user-content]).
 * Usage: node tools/l10n_full_scan.mjs <en|sw> <out.json> [viewport width]   (ONLY=<regex> limits the screens)
 * Needs: emulators + functions/local-server.js on 5055, SKH_FIREBASE_SDK_DIR=<firebase@10.8.1>. Not part of npm test;
 * the regression checks are tools/test_l10n_live_switch_browser.mjs and tools/test_l10n_roundtrip_layout_browser.mjs. */
import { chromium } from 'playwright'; import { readFileSync, writeFileSync } from 'node:fs';
const TARGET = process.argv[2] || 'en', OUT = process.argv[3] || '/tmp/scan.json', W = +(process.argv[4] || 390);
const OTHER = TARGET === 'en' ? 'sw' : 'en';
const SDK = (process.env.SKH_FIREBASE_SDK_DIR || '').replace(/\/?$/, '/');
const T = Date.now().toString(36), PW = 'Siri-' + T + '-9', EM = 'l10n-' + T + '@example.test';
await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EM, password: PW, returnSecureToken: true }) });
const SW = /\b(na|ya|kwa|wa|za|la|cha|vya|bidhaa|huduma|hakuna|tafuta|ingia|toka|bei|duka|muuzaji|mnunuzi|oda|malipo|usafiri|habari|karibu|chagua|weka|hifadhi|tuma|ongeza|zaidi|yote|zote|sasa|leo|jina|mahali|eneo|maelezo|picha|ujumbe|arifa|mipangilio|akaunti|wasifu|lugha|msaada|kuhusu|sheria|faragha|inapakia|imeshindikana|tazama|angalia|fungua|funga|rudi|endelea|thibitisha|futa|hariri|badilisha|ondoa|lipa|nunua|uza|kikapu|jumla|kiasi|hali|aina|makundi|watu|biashara|mauzo|stoo|ripoti|wateja|mkoa|nchi|simu|barua|huna|una|ni|si|kwenye|hapa|tena|pia|kama|au|mpya|yako|wako|zako|langu|yangu|chako|bado|imeshindwa|imefanikiwa|tafadhali|samahani)\b/i;
const EN = /\b(the|and|your|you|add|save|cancel|search|products?|services?|settings|account|profile|sign in|log ?in|log ?out|delete|edit|send|view|more|all|new|no|not|yet|loading|failed|error|success|please|open|close|back|next|continue|confirm|select|choose|price|seller|buyer|order|orders|payment|cart|messages?|notifications?|help|support|language|privacy|terms|about|location|category|categories|share|follow|report|details?|from|with|for|is|are|this|that|here|there|now|today)\b/;
const EXEMPT = /SokoHai|SokoPay|SokoHuru|Google|WhatsApp|Facebook|YouTube|Vimeo|TZS|TSh|Tsh|M-Pesa|Airtel|Tigo|HaloPesa|Visa|Mastercard|PesaPal|Cloudinary|Firebase|Netlify|OpenStreetMap|POS|SKU|QR|PIN|OTP|ID|URL|PDF|CSV|GPS|LIVE|Live|Chat/;
const SCREENS = [
 ['home', "updateApp('home')"], ['bidhaa', "updateApp('bidhaa')"], ['huduma', "updateApp('services')"], ['usafiri', "updateApp('delivery')"],
 ['category-modal', 'openCategoryModal && openCategoryModal()'], ['search', "(()=>{const i=document.getElementById('searchInput')||document.querySelector('input[type=search]'); if(i){i.value='simu'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',bubbles:true}));}})()"],
 ['product', "(async()=>{const s=await window.skh.getDocs(window.skh.query(window.skh.collection(window.skh.db,'products'),window.skh.limit(1)));s.forEach(d=>window.openProduct(d.id,'products'));})()"],
 ['menu', 'openSidebarMenu()'],
 ['welcome', "(()=>{const m=document.getElementById('welcomeModal'); if(m) m.style.display='flex';})()"],
 ['mode-menu', 'openModeMenu()'], ['advertiser', 'skhOpenAdvertiserDashboard()'], ['adv-billing', 'skhOpenAdvertiserBillingSoon()'],
 ['menu-expanded', "openSidebarMenu(); setTimeout(()=>{document.querySelectorAll('.skh-sec-hidden').forEach(e=>e.classList.remove('skh-sec-hidden'))},200)"],
 ['set-verification', "openSokoHaiAccountSetting('verification')"],
 ['set-digital_identity', "openSokoHaiAccountSetting('digital_identity')"],
 ['set-security', "openSokoHaiAccountSetting('security')"],
 ['set-privacy', "openSokoHaiAccountSetting('privacy')"],
 ['set-permissions', "openSokoHaiAccountSetting('permissions')"],
 ['set-login_sessions', "openSokoHaiAccountSetting('login_sessions')"],
 ['set-connected_devices', "openSokoHaiAccountSetting('connected_devices')"],
 ['set-messages', "openSokoHaiAccountSetting('messages')"],
 ['set-appearance', "openSokoHaiAccountSetting('appearance')"],
 ['set-accessibility', "openSokoHaiAccountSetting('accessibility')"],
 ['set-downloads', "openSokoHaiAccountSetting('downloads')"],
 ['set-backup', "openSokoHaiAccountSetting('backup')"],
 ['set-data_storage', "openSokoHaiAccountSetting('data_storage')"],
 ['set-ai_settings', "openSokoHaiAccountSetting('ai_settings')"],
 ['plus', 'togglePlusMenu()'], ['chat', 'openChatList()'], ['notifications', 'openNotifications()'], ['cart', 'openCart()'],
 ['orders', 'openBuyerOrdersModal()'], ['saved', 'openSavedItems && openSavedItems()'], ['profile', 'openProfile()'], ['settings-legal', "openSokoHaiAccountSetting('legal_center')"],
 ['settings-lang', "openSokoHaiAccountSetting('language')"], ['support', "skhOpenSupport('other')"], ['mysupport', 'skhOpenMySupport()'], ['verify', 'skhOpenIdentityVerification()'], ['recycle', 'skhOpenPersonalRecycle && skhOpenPersonalRecycle()'],
 ['sokopay', 'openSokoPay()'], ['sp-deposit', 'openSokoPay(); setTimeout(()=>openSokoPayDeposit(),300)'], ['sp-escrow', 'skhOpenEscrowCenter()'], ['sp-tokens', 'openSokoPayUnifiedTokenCenter()'], ['sp-orders', 'openSokoPayBuyerOrders()'],
 ['tracking-lookup', 'openTrackingTokenLookup && openTrackingTokenLookup()'], ['ride-request', 'openRideRequestModal && openRideRequestModal()'],
 ['live-hub', "skhLiveHub('live')"], ['live-deals', "skhLiveHub('deals')"], ['live-create', 'skhLiveCreateForm()'], ['kamusi', 'skhOpenKamusi && skhOpenKamusi()'],
 ['seller-home', "switchMode('seller')"], ['bos-overview', "switchDashTab('overview')"], ['bos-myproducts', "switchDashTab('my_products')"], ['bos-inventory', "switchDashTab('inventory')"], ['bos-expenses', "switchDashTab('expenses')"],
 ['bos-staff', "switchDashTab('staff')"], ['bos-finance', "switchDashTab('finance')"], ['bos-insights', "switchDashTab('sales_insights')"], ['bos-demand', "switchDashTab('demand_insights')"], ['bos-analytics', "switchDashTab('analytics')"],
 ['bos-perf', "switchDashTab('product_performance')"], ['bos-compare', "switchDashTab('product_compare')"], ['bos-settings', "switchDashTab('settings')"], ['bos-recycle', "switchDashTab('product_recycle_bin')"], ['pos', "switchDashTab('pos_page')"],
 ['bos-tracking', "switchDashTab('tracking')"], ['bos-bookings', "switchDashTab('bookings')"],
 ['mode-provider', "switchMode('provider')"], ['mode-driver', "switchMode('driver')"], ['mode-agent', "switchMode('agent')"], ['buyer-dashboard', "switchMode('buyer'); window.skhOpenMySokoHai && window.skhOpenMySokoHai('overview')"], ['buyer-saved', "window.skhOpenMySokoHai && window.skhOpenMySokoHai('saved')"], ['buyer-requests', "window.skhOpenMySokoHai && window.skhOpenMySokoHai('requests')"],
 ['form-product', "showForm('sellerForm')"],
 ['form-service', "showForm('serviceForm')"],
 ['form-transport', "showForm('deliveryForm')"],
];
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: W < 600 ? 844 : 900 } });
if (SDK !== '/') await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, rt => rt.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(SDK + rt.request().url().split('/').pop()) }));
await ctx.route(/res\.cloudinary\.com|nominatim|tile\.openstreetmap|arcgisonline/, r => r.abort());
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss().catch(() => {}));
await p.addInitScript((l) => { try { localStorage.setItem('skh_welcomed_v1', '1'); localStorage.setItem('sokohai_language', l); } catch (e) {} }, OTHER);
await p.goto('http://127.0.0.1:5055/'); await p.waitForFunction(() => window.skh && window.skh.__authResolved && window.SokoHaiLMS, null, { timeout: 45000 });
await p.evaluate(async ({ e, pw }) => { await window.skh.signInWithEmailAndPassword(window.skh.auth, e, pw); }, { e: EM, pw: PW }); await p.waitForTimeout(2500);
await p.evaluate(() => { Object.assign(window.skh.currentUserData = window.skh.currentUserData || {}, { shopOwnerUid: window.skh.currentUser.uid, businessId: 'b-' + window.skh.currentUser.uid, storeId: 's1', shopName: 'Duka la Test', stockMode: 'strict', businessSetupComplete: true }); });
const scan = (re) => p.evaluate(({ src, ex }) => { const RE = new RegExp(src, 'i'), EXR = new RegExp(ex); const seen = new Set(), res = [], all = [];
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight * 3 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); const el = n.parentElement; if (!t || t.length < 3 || !el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName) || el.closest('[data-no-i18n],.skh-brand-word,.skh-brand-lockup,.shc-post-brand,.welcome-brand-text,.skh-oc,.skh-huru,.feed-card-box,input,textarea,code,[data-user-content]') || !vis(el) || seen.has(t)) continue;
    seen.add(t); all.push(t); const core = t.replace(EXR, ''); if (RE.test(core)) res.push(t); }
  document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(i => { if (!vis(i)) return; const t = i.getAttribute('placeholder').trim(); if (t && !seen.has(t)) { seen.add(t); all.push(t); if (RE.test(t.replace(EXR, ''))) res.push('[placeholder] ' + t); } });
  return { total: all.length, left: res }; }, { src: re.source, ex: EXEMPT.source });
const out = {};
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
// [L10N 2026-11-23] A screen counts as audited only when it really opened (OPENED). The signed-in profile is
// re-read after sign-in and loses the test business fields, so they are set again before every screen; without that
// switchMode('seller') showed the shop set-up dialog and the 16 Business OS screens were never scanned.
const OPENED = (name) => {
  if (name === 'seller-home') return "!!document.getElementById('dashWorkspace') && document.getElementById('dashWorkspace').offsetParent !== null";
  if (name.startsWith('bos-') || name === 'pos') return "!!document.getElementById('dashWorkspace') && document.getElementById('dashWorkspace').offsetParent !== null && !!window.activeDashboardTab";
  const f = { 'form-product': 'sellerForm', 'form-service': 'serviceForm', 'form-transport': 'deliveryForm' }[name];
  return f ? "(() => { const e = document.getElementById('" + f + "'); return !!e && e.offsetParent !== null; })()" : 'true';
};
for (const [name, js] of SCREENS) { if (ONLY && !ONLY.test(name)) continue;
  try { await p.evaluate('try{closeModals()}catch(e){}'); await p.evaluate(`window.skhSetLang('${OTHER}')`); await p.waitForTimeout(300);
    await p.evaluate(() => { const u = window.skh.currentUser; if (u) Object.assign(window.skh.currentUserData = window.skh.currentUserData || {}, { shopOwnerUid: u.uid, businessId: 'b-' + u.uid, storeId: 's1', shopName: 'Duka la Test', stockMode: 'strict', businessSetupComplete: true }); });
    await p.evaluate(js); } catch (e) {}
  await p.waitForTimeout(1300);
  const opened = await p.evaluate(OPENED(name)).catch(() => false);
  await p.evaluate(`window.skhSetLang('${TARGET}')`); await p.waitForTimeout(1000);
  const r = await scan(TARGET === 'en' ? SW : EN); r.opened = !!opened; out[name] = r;
}
out.__errors = errs.slice(0, 10);
writeFileSync(OUT, JSON.stringify(out, null, 1));
let tot = 0, left = 0; for (const [k, v] of Object.entries(out)) { if (k.startsWith('__')) continue; tot += v.total; left += v.left.length; console.log(k.padEnd(16), String(v.left.length).padStart(3), '/', v.total, v.opened ? '' : 'NOT OPENED'); }
console.log('TOTAL', TARGET, left, '/', tot, 'errors', errs.length, 'not opened', Object.entries(out).filter(([k, v]) => !k.startsWith('__') && !v.opened).map(([k]) => k).join(',') || 0);
await b.close();
