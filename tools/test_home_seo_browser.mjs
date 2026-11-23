#!/usr/bin/env node
/* [SEO 2026-11-22] Homepage search appearance (Chromium + local server).
 * Why: Google showed checkout/payment dialog text ("Inahitaji Usafirishaji wa Sokohai? … Lipa kwa SokoPay Wallet … Ghairi
 * Malipo") as the SokoHai snippet. The initial HTML carried every modal and almost no visible text about what SokoHai is.
 * Checks: title / description / canonical / Open Graph / Twitter / robots / JSON-LD of the initial HTML; the text a search
 * engine may quote (initial HTML minus data-nosnippet, scripts, styles) has the introduction and none of the dialog
 * phrases; the introduction is visible on Home at phone and desktop width and follows the language switch; the Escrow
 * hero slide is not shown while escrow is switched off; the home meta stays correct after a product is opened and closed.
 * Run: `node functions/local-server.js` (5055) [+ emulators], SKH_FIREBASE_SDK_DIR=<firebase@10.8.1> node tools/test_home_seo_browser.mjs */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const APP = process.env.SKH_APP_URL || 'http://127.0.0.1:5055/';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  PASS ' + m); };
const TITLE = 'SokoHai | The Most Trusted Escrow Marketplace';   // [SEO 2026-11-23] owner-approved title
const DESC = 'Buy and sell products, discover services, arrange transportation and manage your business with greater trust and transparency.';
// [SEO 2026-11-23] global positioning: the site-wide copy names no single country or list of cities
const ONE_COUNTRY = /Tanzania|Dodoma|Dar es Salaam|Arusha|Mwanza/;
const DIALOG = /Inahitaji Usafirishaji|Lipa kwa SokoPay Wallet|Ghairi Malipo|Thibitisha Malipo|Chagua njia ya malipo|Malipo yanawekwa kwenye Escrow/i;

const b = await chromium.launch();
async function page(w, h) {
  const ctx = await b.newContext({ viewport: { width: w, height: h || 860 } });
  if (process.env.SKH_FIREBASE_SDK_DIR) { const sdk = process.env.SKH_FIREBASE_SDK_DIR.replace(/\/?$/, '/'); await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(sdk + r.request().url().split('/').pop()) })); }
  await ctx.route(/res\.cloudinary\.com|nominatim/, r => r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss().catch(() => {}));
  await p.addInitScript(() => { try { localStorage.setItem('skh_welcomed_v1', '1'); localStorage.removeItem('sokohai_language'); } catch (e) {} });
  return { ctx, p, errs };
}

// ---- 1. the initial HTML (what a crawler receives before any script runs)
const raw = await (await fetch(APP)).text();
{ const { ctx, p } = await page(1366);
  await p.goto('about:blank');
  const r = await p.evaluate((html) => {
    const d = new DOMParser().parseFromString(html, 'text/html');
    const meta = (sel) => { const m = d.querySelector(sel); return m ? (m.getAttribute('content') || m.getAttribute('href')) : null; };
    const ld = [...d.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { return JSON.parse(s.textContent); } catch (e) { return { __bad: true }; } });
    const snip = d.body.cloneNode(true);
    snip.querySelectorAll('[data-nosnippet], script, style, template, noscript, svg').forEach(e => e.remove());
    const h1 = [...d.querySelectorAll('h1')].filter(h => !h.closest('[data-nosnippet]')).map(h => h.textContent.trim());
    return { title: d.title, desc: meta('meta[name="description"]'), canon: meta('link[rel="canonical"]'), robots: meta('meta[name="robots"]'),
      ogT: meta('meta[property="og:title"]'), ogD: meta('meta[property="og:description"]'), ogI: meta('meta[property="og:image"]'), ogL: meta('meta[property="og:locale"]'),
      twC: meta('meta[name="twitter:card"]'), twT: meta('meta[name="twitter:title"]'), twD: meta('meta[name="twitter:description"]'), ld, h1,
      snippetText: snip.textContent.replace(/\s+/g, ' ').trim(), nosnippet: d.querySelectorAll('[data-nosnippet]').length,
      dialogsCovered: ['checkoutModal', 'cartModal', 'userPaymentModal', 'authModal', 'productModal', 'plusMenu', 'mainMenu', 'chatModal'].every(id => { const e = d.getElementById(id); return e && !!e.closest('[data-nosnippet]'); }) };
  }, raw);
  ok(r.title === TITLE && r.title.length <= 60, 'title says what SokoHai is, <= 60 characters ("' + r.title + '")');
  ok(r.desc === DESC && !ONE_COUNTRY.test(r.desc + r.title) && r.desc.length >= 120 && r.desc.length <= 160, 'meta description: products, services, transport, businesses; no single-country claim (' + r.desc.length + ' chars)');
  ok(r.canon === 'https://sokohai.com/', 'canonical is the https apex https://sokohai.com/ (www redirects there)');
  ok(/^index, follow/.test(r.robots) && !/noindex/.test(r.robots), 'robots: index, follow (' + r.robots + ')');
  ok(r.ogT === TITLE && r.ogD === DESC && /^https:\/\/sokohai\.com\//.test(r.ogI) && r.ogL === 'sw_TZ', 'Open Graph title, description, absolute image and sw_TZ locale');
  ok(r.twC === 'summary_large_image' && r.twT === TITLE && r.twD === DESC, 'Twitter card title and description');
  const graph = (r.ld.find(x => x['@graph']) || {})['@graph'] || [];
  const org = graph.find(x => x['@type'] === 'Organization'), site = graph.find(x => x['@type'] === 'WebSite');
  ok(!r.ld.some(x => x.__bad) && org && org.name === 'SokoHai' && org.url === 'https://sokohai.com/' && /^https:\/\//.test(org.logo), 'JSON-LD parses: Organization (name, url, logo)');
  ok(site && site.potentialAction && site.potentialAction['@type'] === 'SearchAction' && /\?q=\{search_term_string\}$/.test(site.potentialAction.target.urlTemplate), 'JSON-LD WebSite + SearchAction pointing at /?q= (opened by the existing search, js/app/131)');
  // [SEO 2026-11-23] the owner-approved heading is used word for word (it no longer starts with "SokoHai —"); the brand is
  // still required in the title, Open Graph and JSON-LD checks above and below
  ok(r.h1.length === 1 && r.h1[0] === 'Nunua, Uza na Gundua kwa Urahisi' && !ONE_COUNTRY.test(r.h1[0]) && /SokoHai/.test(r.title), 'exactly one quotable <h1> on the homepage: the approved heading, no single country; the title names SokoHai ("' + r.h1.join(' | ') + '")');
  ok(r.dialogsCovered && r.nosnippet >= 39, 'checkout, cart, payment, sign-in, product, menu and chat dialogs are data-nosnippet (' + r.nosnippet + ' containers)');
  ok(!DIALOG.test(r.snippetText), 'text Google may quote has none of the dialog / payment phrases');
  ok(r.snippetText.includes('Pata bidhaa, huduma na usafiri. Ungana moja kwa moja na wauzaji na watoa huduma') && !/mikoa mingine ya Tanzania/.test(r.snippetText), 'text Google may quote contains the visible introduction');
  { const nav = (/<nav class="skh-home-intro-links"[\s\S]*?<\/nav>/.exec(raw) || [''])[0];
    ok(['/soko/', '/mwongozo/'].every(h => nav.includes('href="' + h + '"')) && /home_intro_products/.test(nav) && /home_intro_services[^>]*updateApp\('services'\)/.test(nav) && /home_intro_transport/.test(nav), 'discovery links: categories, products, services, transport, buying guides (crawlable hrefs)'); }
  await ctx.close(); }

// ---- 2. the running app: visible introduction, language, Escrow slide, meta after a product view
for (const w of [360, 1366]) {
  const { ctx, p, errs } = await page(w);
  await p.goto(APP + '?launchScope=sokohuru'); await p.waitForFunction(() => window.skh && window.skh.__authResolved, null, { timeout: 45000 }).catch(() => {});   // production launch scope (escrow off)
  await p.waitForTimeout(2500);
  await p.evaluate(() => { const a = document.getElementById('authModal'); if (a) a.style.display = 'none'; });
  const v = await p.evaluate(() => { const h = document.getElementById('skhHomeIntroTitle'); const r = h && h.getBoundingClientRect();
    return { vis: !!(h && h.offsetParent !== null && r.height > 0), top: r ? Math.round(r.top + scrollY) : -1, text: h ? h.textContent : '', over: document.documentElement.scrollWidth > innerWidth + 1 }; });
  ok(v.vis && v.top < 400 && !v.over, w + 'px: the introduction is visible near the top of Home, no horizontal overflow (top ' + v.top + 'px)');
  const slides = await p.evaluate(() => ({ escrow: !!document.querySelector('#shcTrack .shc-escrow'), off: !!(window.skhLaunch && !window.skhLaunch.enabled('escrow')),
    slides: document.querySelectorAll('#shcTrack > *').length, dots: document.querySelectorAll('#shcDots button').length }));
  ok(slides.off && !slides.escrow && slides.slides === 3 && slides.dots === 3, w + 'px: escrow is switched off, so the Escrow hero slide and its dot are removed (' + JSON.stringify(slides) + ')');
  if (w === 1366) {
    await p.evaluate(() => window.skhSetLang && window.skhSetLang('en')); await p.waitForTimeout(500);
    const en = await p.evaluate(() => ({ h: document.getElementById('skhHomeIntroTitle').textContent, p: document.querySelector('#skhHomeIntro p').textContent, lang: document.documentElement.lang }));
    ok(en.lang === 'en' && /Buy, Sell & Discover with Confidence/.test(en.h) && /^Discover products, services and transportation/.test(en.p), 'English: the introduction switches at once ("' + en.h + '")');
    await p.evaluate(() => window.skhSetLang && window.skhSetLang('sw')); await p.waitForTimeout(500);
    ok(/Nunua, Uza na Gundua kwa Urahisi/.test(await p.textContent('#skhHomeIntroTitle')), 'Kiswahili: the introduction switches back');
    // after a product view the home meta is restored (before: og:image was emptied and the description reverted to old copy)
    await p.evaluate(() => { window.skhUpdateSeoMeta({ id: 'x1', title: 'Simu ya Majaribio', price: 1000, image: 'https://res.cloudinary.com/demo/x.jpg' }, 'products'); window.skhUpdateSeoMeta(null); });
    const m = await p.evaluate(() => ({ t: document.title, d: document.getElementById('skhMetaDescription').content, i: document.getElementById('skhOgImage').content, tw: document.getElementById('skhTwTitle').content, c: document.getElementById('skhCanonical').href }));
    ok(m.t === TITLE && m.d === DESC && /brand\/sokohai-icon-maskable-512\.png$/.test(m.i) && m.tw === TITLE && new URL(m.c).pathname === '/', 'closing a product restores the home title, description, image and Twitter title');
  }
  await p.screenshot({ path: (process.env.SHOTS || '/tmp') + '/home-seo-' + w + '.png' });
  ok(!errs.length, w + 'px: no JavaScript errors ' + errs.slice(0, 2).join(' | '));
  await ctx.close();
}
await b.close();
console.log(`\nHOME SEO (browser): ${n} passed, 0 failed`);
