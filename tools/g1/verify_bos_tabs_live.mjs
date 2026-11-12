#!/usr/bin/env node
/* VERIFY (F-live) — seed emulator + tembea tab 20 kupitia switchDashTab.
 * Inahitaji: emulators (8085/9099) + local-server emulator-mode kwenye 5055.
 * Matokeo: kila tab — content ilichorwa? JS errors? data halisi inaonekana? */
import { chromium } from 'playwright';

const BASE = process.env.SKH_BASE || 'http://127.0.0.1:5055';
const EMAIL = 'f-live@example.com', PASS = 'F-live-2026x';
const TABS = ['overview', 'bookings', 'trips', 'cargo', 'tracking', 'finance', 'fleet', 'drivers', 'analytics', 'product_analytics', 'inventory', 'expenses', 'staff', 'settings', 'my_products', 'product_performance', 'sales_insights', 'demand_insights', 'product_compare', 'pos_page'];

const j = (r) => r.json().catch(() => ({}));
async function main() {
  // 1. hakikisha user + sign in (auth emulator REST)
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASS, returnSecureToken: true }) });
  const si = await j(await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASS, returnSecureToken: true }) }));
  if (!si.idToken) throw new Error('sign-in failed: ' + JSON.stringify(si).slice(0, 200));
  const uid = si.localId;
  // 2. seed firestore (REST, admin — hakuna sheria kwenye emulator REST ya 8085 bila token? tumia token)
  const H = { 'content-type': 'application/json', authorization: 'Bearer ' + si.idToken };
  const P = 'http://127.0.0.1:8085/v1/projects/demo-sokohai-g1/databases/(default)/documents';
  const put = (path, fields) => fetch(P + '/' + path, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) });
  const S = (v) => ({ stringValue: String(v) }), N = (v) => ({ doubleValue: Number(v) });
  await put('users/' + uid, { role: S('seller'), shopOwnerUid: S(uid), displayName: S('F Live Seller') });
  const B = (v) => ({ booleanValue: !!v });
  await put('products/F-LIVE-1', { userId: S(uid), title: S('F-Live Chipa Kuku'), price: N(5000), stock: N(0), openingStockPending: B(true), reservedStock: N(0), status: S('active') });
  await put('products/F-LIVE-2', { userId: S(uid), title: S('F-Live Mchele 5kg'), price: N(14000), stock: N(0), openingStockPending: B(true), reservedStock: N(0), status: S('active') });
  await put('shop_ledger/F-LIVE-L1', { shopOwnerId: S(uid), type: S('income_online'), amount: N(5000), profit: N(1500), customerName: S('Mteja F') });
  await put('shop_staff/F-LIVE-S1', { shopOwnerId: S(uid), name: S('Mw_pb F'), role: S('cashier') });
  console.log('seed OK uid=' + uid);
  // 3. browser
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e && e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 160)); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push('HTTP' + r.status() + ': ' + r.url().slice(0, 130)); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!(window.skh && window.skh.auth), { timeout: 60000 });
  const emu = await page.evaluate(() => !!window.SKH_EMULATOR);
  console.log('SKH_EMULATOR injected: ' + emu);
  // sign in kupitia SDK ya app yenyewe
  await page.evaluate(async ({ e, p }) => {
    const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js').catch(() => ({}));
    if (window.skh && window.skh.signIn) return window.skh.signIn(e, p);
    throw new Error('no skh.signIn helper');
  }, { e: EMAIL, p: PASS }).catch((e) => console.log('signin-via-app: ' + e.message));
  // jaribio 2: SDK halisi ya app (modular)
  await page.evaluate(async ({ e, p }) => {
    await window.skh.signInWithEmailAndPassword(window.skh.auth, e, p);
  }, { e: EMAIL, p: PASS }).catch((e) => console.log('signin-via-sdk FAIL: ' + e.message));
  await page.waitForFunction(() => !!(window.skh && window.skh.currentUser), { timeout: 30000 }).catch(() => console.log('WARN: currentUser haikuonekana'));
  await page.evaluate(async () => {
    if (window.skh) window.skh.currentMode = 'seller';
    if (typeof window.loadAndRenderDashboard === 'function') await window.loadAndRenderDashboard();
  }).catch((e) => console.log('dashboard-load: ' + e.message));
  await page.waitForFunction(() => !!document.querySelector('#richDashboardContainer .side-menu-link, #richDashboardContainer'), { timeout: 30000 }).catch(() => console.log('WARN: dashboard shell haikuonekana'));
  const who = await page.evaluate(() => (window.skh && window.skh.currentUser && window.skh.currentUser.uid) || 'NONE');
  console.log('signed-in uid: ' + who);
  // 4. tembea tabs
  for (const tab of TABS) {
    const before = errors.length;
    const r = await page.evaluate(async (t) => {
      try {
        if (typeof window.switchDashTab !== 'function') return { ok: false, why: 'no-switchDashTab' };
        window.switchDashTab(t);
        await new Promise((r) => setTimeout(r, 1500));
        const ws = document.getElementById('richDashboardContainer') || document.body;
        const txt = (ws.innerText || '').replace(/\s+/g, ' ');
        const markers = {
          my_products: ['F-Live Chipa', 'F-Live Mchele'], product_analytics: ['F-Live', 'BIDHAA ZOTE'],
          inventory: ['F-Live'], staff: ['Mw_pb F'], expenses: ['5,000', 'Mteja F'],
          overview: ['TZS', '5,000']
        }[t] || [];
        const found = markers.filter((m) => txt.includes(m));
        return { ok: txt.trim().length > 20, len: txt.trim().length, sample: txt.slice(0, 90), markers: markers.length ? found.join('|') + '/' + markers.join('|') : '-' };
      } catch (e) { return { ok: false, why: String(e && e.message).slice(0, 120) }; }
    }, tab);
    const newErrs = errors.length - before;
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${tab} len=${r.len || 0} newErrs=${newErrs} seed=[${r.markers || '-'}] :: ${(r.sample || r.why || '').slice(0, 80)}`);
  }
  console.log('--- unique errors (' + errors.length + ') ---');
  [...new Set(errors)].slice(0, 15).forEach((e) => console.log(' * ' + e));
  await browser.close();
}
main().catch((e) => { console.error('FATAL: ' + e.message); process.exit(1); });
