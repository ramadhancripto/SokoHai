#!/usr/bin/env node
/* [I18N 2026-11-21] One language preference for the whole app (real browser + emulators):
 * switching to English updates every visited screen (Home, products, services, transport, chat, menu, notifications,
 * cart, SokoPay, profile, settings, support, seller tools, orders, post menu, live, product page); user content
 * (product titles) stays as written; no raw translation keys; dialogs follow the language; the choice survives a
 * reload; switching back restores Swahili. Swahili leftovers are detected with a word list (heuristic, reported). */
import { chromium } from 'playwright'; import { readFileSync } from 'node:fs'; import assert from 'node:assert/strict';
const SDK = (process.env.SKH_FIREBASE_SDK_DIR || '').replace(/\/?$/, '/');
const APP = process.env.SKH_APP_URL || 'http://127.0.0.1:5055/';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  PASS ' + m); };
const T = Date.now().toString(36), PW = 'Siri-' + T + '-9', EM = 'lang-' + T + '@example.test';
await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EM, password: PW, returnSecureToken: true }) });
const SW = /\b(na|ya|kwa|wa|za|la|cha|vya|bidhaa|huduma|hakuna|tafuta|ingia|toka|bei|soko|duka|muuzaji|mnunuzi|oda|malipo|usafiri|habari|karibu|chagua|weka|hifadhi|tuma|ongeza|zaidi|yote|zote|sasa|leo|jina|mahali|eneo|maelezo|picha|ujumbe|arifa|mipangilio|akaunti|wasifu|lugha|msaada|kuhusu|sheria|faragha|inapakia|imeshindikana|tazama|angalia|fungua|funga|rudi|endelea|thibitisha|futa|hariri|badilisha|ondoa|lipa|nunua|uza|kikapu|jumla|kiasi|hali|aina|kategoria|makundi|watu|biashara|mauzo|stoo|ripoti|mwenendo|wateja|mawakala|mkoa|nchi|simu|barua)\b/i;
const SCREENS = [['home', "updateApp('home')"], ['bidhaa', "updateApp('bidhaa')"], ['huduma', "updateApp('services')"], ['usafiri', "updateApp('delivery')"], ['chat', 'openChatList()'], ['menu', 'openSidebarMenu()'],
  ['notifications', 'openNotifications()'], ['cart', 'openCart()'], ['sokopay', 'openSokoPay()'], ['profile', 'openProfile()'], ['settings', "openSokoHaiAccountSetting('legal_center')"], ['support', "skhOpenSupport('other')"], ['seller', "switchMode('seller')"], ['orders', 'openBuyerOrdersModal()'], ['plus', 'togglePlusMenu()'], ['live', "skhLiveHub('live')"], ['product', "(async()=>{const s=await window.skh.getDocs(window.skh.query(window.skh.collection(window.skh.db,'products'),window.skh.limit(1)));s.forEach(d=>window.openProduct(d.id,'products'));})()"], ['mytools', "switchMode('seller'); setTimeout(()=>{ try{ window.skhRenderMyProducts && window.skhRenderMyProducts(); }catch(e){} }, 300)"]];
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
if (SDK !== '/') await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, rt => rt.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(SDK + rt.request().url().split('/').pop()) }));
await ctx.route(/res\.cloudinary\.com|nominatim/, r => r.abort());
const p = await ctx.newPage(); p.on('dialog', d => d.dismiss().catch(() => {}));
await p.addInitScript(() => { try { localStorage.setItem('skh_welcomed_v1', '1'); } catch (e) {} });
await p.goto(APP); await p.waitForFunction(() => window.skh && window.skh.__authResolved, null, { timeout: 45000 });
await p.evaluate(async ({ e, pw }) => { await window.skh.signInWithEmailAndPassword(window.skh.auth, e, pw); }, { e: EM, pw: PW }); await p.waitForTimeout(2500);
await p.evaluate(() => window.skhSetLang('en')); await p.waitForTimeout(1200);
const out = {}; let tot = 0, swt = 0;
for (const [name, js] of SCREENS) {
  try { await p.evaluate('try{closeModals()}catch(e){}'); await p.evaluate(js); } catch (e) {}
  await p.waitForTimeout(1500);
  const texts = await p.evaluate(() => { const seen = new Set(), res = []; const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight * 3 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); const el = n.parentElement; if (!t || t.length < 3 || !el || ['SCRIPT', 'STYLE'].includes(el.tagName) || el.closest('[data-no-i18n],.skh-brand-word,.skh-brand-lockup,.shc-post-brand,.welcome-brand-text,.skh-oc,.skh-huru,.feed-card-box,input,textarea') || !vis(el) || seen.has(t)) continue; seen.add(t); res.push(t); } return res; });
  const sw = texts.filter(t => SW.test(t));
  out[name] = { total: texts.length, swahili: sw.length, sample: sw.slice(0, 25) }; tot += texts.length; swt += sw.length;
}
const ALLOWED = /^(Group Soko|SokoHai|SokoPay|SokoCart)$/;   // product names (brand features)
const left = Object.entries(out).flatMap(([k, v]) => v.sample.filter(t => !ALLOWED.test(t)).map(t => k + ': ' + t));
for (const [k, v] of Object.entries(out)) console.log('    ' + k.padEnd(14), String(v.swahili).padStart(3), '/', v.total);
const userContent = await p.evaluate(() => (window.skh.cachedItems || []).map(x => x.title).filter(Boolean));
const realLeft = left.filter(l => !userContent.some(t => l.endsWith(': ' + t)));
ok(realLeft.length <= 2, 'English: at most 2 Swahili interface strings left on ' + Object.keys(out).length + ' screens (' + swt + '/' + tot + ' incl. user content): ' + JSON.stringify(realLeft));
const rawKeys = await p.evaluate(() => (document.body.innerText.match(/\b(ui3b?_\d+|[a-z]{2,}_[a-z]+_[a-z_]+)\b/g) || []).filter(k => !/^(skh|sp|pm)_/.test(k)).slice(0, 5));
ok(!rawKeys.length, 'no raw translation keys visible: ' + JSON.stringify(rawKeys));
await p.evaluate(() => { try { closeModals(); } catch (e) {} });
await p.reload(); await p.waitForFunction(() => window.skh && window.skh.__authResolved && window.SokoHaiLMS, null, { timeout: 45000 }); await p.waitForTimeout(1500);
ok(await p.evaluate(() => window.SokoHaiLMS.lang === 'en' && localStorage.getItem('sokohai_language') === 'en' && document.documentElement.lang === 'en'), 'the choice survives a reload (one key: sokohai_language; <html lang="en">)');
const dlg = []; p.on('dialog', d => dlg.push(d.message()));
const alertTxt = await p.evaluate(async () => { window.alert('Bidhaa hii haipatikani tena sokoni.'); await new Promise(r => setTimeout(r, 300)); const m = document.getElementById('skhAlertMsg'); const t = m ? m.textContent : ''; const b = document.getElementById('skhAlertBtn'); if (b) b.click(); return t; });
ok(/no longer available/i.test(alertTxt + ' ' + dlg.join(' ')), 'dialogs follow the language ("' + (alertTxt || dlg.join(' ')).slice(0, 60) + '")');
await p.evaluate(() => window.skhSetLang('sw')); await p.waitForTimeout(1200);
await p.evaluate(() => window.updateApp && window.updateApp('home')); await p.waitForTimeout(1200);
ok(await p.evaluate(() => /Nyumbani|Bidhaa|Huduma/.test(document.body.innerText) && localStorage.getItem('sokohai_language') === 'sw'), 'switching back restores Swahili');
await b.close();
console.log(`\nLANGUAGE SWITCH (browser + emulator): ${n} passed, 0 failed`);
