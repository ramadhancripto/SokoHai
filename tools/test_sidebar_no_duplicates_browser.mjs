#!/usr/bin/env node
/* [NAV 2026-11-23] The account side menu shows each destination once: one profile entry ("Akaunti Yangu"), one
 * notifications entry, one wallet / payment-methods entry, no repeated action, and no rows added again when the menu is
 * reopened or the language changes. Needs the emulators + local server on 5055 (SKH_FIREBASE_SDK_DIR as the other tests). */
import { chromium } from 'playwright'; import { readFileSync } from 'node:fs'; import assert from 'node:assert/strict';
const SDK = (process.env.SKH_FIREBASE_SDK_DIR || '').replace(/\/?$/, '/');
const T = Date.now().toString(36), PW = 'Siri-' + T + '-9', EM = 'sidebar-' + T + '@example.test';
await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EM, password: PW, returnSecureToken: true }) });
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  PASS ' + m); };
const b = await chromium.launch();
for (const W of [390, 1366]) {
  const ctx = await b.newContext({ viewport: { width: W, height: 900 } });
  if (SDK !== '/') await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, rt => rt.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(SDK + rt.request().url().split('/').pop()) }));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.setItem('skh_welcomed_v1', '1'); } catch (e) {} });
  await p.goto('http://127.0.0.1:5055/'); await p.waitForFunction(() => window.skh && window.skh.__authResolved, null, { timeout: 45000 });
  await p.evaluate(async ({ e, pw }) => { await window.skh.signInWithEmailAndPassword(window.skh.auth, e, pw); }, { e: EM, pw: PW }); await p.waitForTimeout(2500);
  for (let k = 0; k < 3; k++) {
    await p.evaluate('try{closeModals()}catch(e){}');
    if (k) await p.evaluate("window.skhSetLang(window.SokoHaiLMS.lang === 'sw' ? 'en' : 'sw')");
    await p.waitForTimeout(400); await p.evaluate('openSidebarMenu()'); await p.waitForTimeout(1200);
  }
  const r = await p.evaluate(() => { const m = document.getElementById('sidebarMenuModal');
    const rows = [...m.querySelectorAll('.skh-menu-item')]; const on = rows.map(e => e.getAttribute('onclick') || '').filter(Boolean);
    const count = re => on.filter(x => re.test(x)).length;
    return { rows: rows.length, dupActions: on.filter((x, i) => on.indexOf(x) !== i), account: m.querySelectorAll('.skh-menu-account-row').length,
      lang: m.querySelectorAll('.skh-menu-lang-row').length, profileSetting: count(/openSokoHaiAccountSetting\('profile'\)/),
      notif: count(/skhSidebarGo\('notifications'\)|openSokoHaiAccountSetting\('notifications'\)/), pay: count(/skhSidebarGo\('wallet'\)|openSokoHaiAccountSetting\('payment_methods'\)/),
      emptySecs: [...m.querySelectorAll('.skh-menu-sec')].filter(s => !s.querySelector('.skh-menu-item')).length,
      // [NAV 2026-11-24] destinations that the permanent navigation already has must not be repeated in the drawer
      navDupes: on.filter(x => /skhSidebarGo\('(feed_all|feed_products|feed_services|feed_drivers|inbox|notifications)'\)|openSokoHaiAccountSetting\('language'\)/.test(x)),
      secTitles: [...m.querySelectorAll('.skh-menu-sec-h span:first-child')].map(e => e.textContent.trim()),
      bell: !!document.querySelector('[onclick*="openNotifications"]:not(#sidebarMenuModal *)'),
      chat: !!document.querySelector('.nav-tab[onclick*="openChatList"]'),
      tabs: ['navTabHome', 'navTabBidhaa', 'navTabHuduma', 'navTabDelivery'].every(id => document.getElementById(id)) }; });
  ok(r.dupActions.length === 0, W + 'px: no action appears twice in the side menu after reopening and switching language: ' + JSON.stringify(r.dupActions));
  ok(r.account === 1 && r.profileSetting === 0, W + 'px: exactly one profile entry ("Akaunti Yangu"), not repeated under the Account section');
  ok(r.lang === 1, W + 'px: one language row');
  ok(r.notif === 0 && r.bell, W + 'px: notifications: one entry, the header bell (not repeated in the drawer)');
  ok(r.navDupes.length === 0 && r.chat && r.tabs, W + 'px: Home / Products / Services / Transport / Chat live in the main navigation only, the Language Center in the "Lugha" row only: ' + JSON.stringify(r.navDupes));
  ok(!r.secTitles.some(t => /^(AKAUNTI|ACCOUNT|SOKO KUU|MAIN MARKET)$/i.test(t)), W + 'px: no section repeats the "Akaunti Yangu" row or the main navigation: ' + JSON.stringify(r.secTitles));
  ok(r.pay === 1, W + 'px: one wallet / payment-methods entry');
  ok(r.emptySecs === 0 && r.rows > 25, W + 'px: no empty section; the other entries are still there (' + r.rows + ' rows)');
  ok(await p.evaluate(() => typeof window.openSokoHaiAccountSetting === 'function' && window.sokohaiAccountMenuItems.flatMap(s => s.items).some(i => i[0] === 'payment_methods')), W + 'px: the removed rows stay reachable through openSokoHaiAccountSetting(key)');
  ok(errs.length === 0, W + 'px: no page errors ' + errs.slice(0, 2).join(' | '));
  await ctx.close();
}
await b.close();
console.log(`SIDEBAR NO DUPLICATES (browser): ${n} passed, 0 failed`);
