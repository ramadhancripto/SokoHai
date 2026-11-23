#!/usr/bin/env node
/* [SEO 2026-11-21] tools/build_seo.mjs against the Firestore emulator (public read rules, no credentials).
 * Seeds public, draft, removed, hidden, out-of-stock and unconfirmed-stock listings — some carrying private fields —
 * builds the site into a temp folder and checks: indexation (only public listings get pages), privacy (no phone,
 * e-mail or exact coordinates), canonical URLs, unique titles/descriptions, sitemap validity (XML parser) and coverage,
 * robots.txt, structured data (Product/Offer/BreadcrumbList/ItemList per Google's documented required properties,
 * truthful availability, no invented ratings), thin-content guards, mobile viewport, and that a data failure or the
 * offline mode still produces the static pages + sitemap. Also checks netlify.toml 404 routing order.
 * [SEO-SAFETY 2026-11-21] + legacy listings with precise locations (street, plot, GPS pairs, map links, GPS in
 * attributes) publish only a region name or nothing; a production build (CONTEXT=production / --strict) FAILS on a data
 * read failure (unreachable, rules refusal) and writes nothing, while a legitimately empty catalogue still builds.
 * Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 GCLOUD_PROJECT=demo-sokohai node tools/test_seo_build_emulator.mjs */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.FIRESTORE_EMULATOR_HOST; if (!HOST) { console.error('BLOCKED: FIRESTORE_EMULATOR_HOST required'); process.exit(2); }
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-sokohai';
const require = createRequire(path.join(ROOT, 'functions', 'index.js'));
const admin = require('firebase-admin'); if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT }); const db = admin.firestore();
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  PASS ' + m); };

// fresh data: wipe the emulator's products/services so only this test's listings exist
await fetch(`http://${HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
await fetch(`http://${HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}:securityRules`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }) });
const IMG = (k) => 'https://res.cloudinary.com/demo/image/upload/v1/' + k + '.jpg';
const P = (id, o) => Object.assign({ publicationStatus: 'published', availabilityStatus: 'available', salesChannels: ['marketplace'], isOnline: true, stock: 4,
  createdAt: '2026-11-1' + (id.length % 9) + 'T10:00:00.000Z', updatedAt: '2026-11-20T10:00:00.000Z', images: [IMG(id + 'a'), IMG(id + 'b')],
  description: 'Bidhaa halisi yenye ubora mzuri. Ipo tayari kwa mnunuzi; maelezo zaidi kwenye chat ya SokoHai.' }, o);
const seed = {
  products: {
    sp1: P('sp1', { title: 'Samsung Galaxy A15 128GB', brand: 'Samsung', price: 350000, category: 'CAT-12', countryCode: 'TZ', location: 'Kariakoo, Dar es Salaam', userId: 'sellerA', sellerName: 'Duka la Neema', condition: 'Mpya', verified: true,
      phone: '0712345678', sellerPhone: '+255712345678', userEmail: 'neema@example.test', coords: { lat: -6.817265, lon: 39.276419 } }),
    sp2: P('sp2', { title: 'Samsung Galaxy S21 Ultra', brand: 'Samsung', price: 1150000, category: 'CAT-12', countryCode: 'TZ', location: 'Sinza, Dar es Salaam', userId: 'sellerA', sellerName: 'Duka la Neema', condition: 'Imetumika' }),
    sp3: P('sp3', { title: 'Samsung Galaxy A05s', brand: 'Samsung', price: 260000, category: 'CAT-12', countryCode: 'TZ', location: 'Dar es Salaam', userId: 'sellerB', sellerName: 'Simu Center Posta', stock: 0, availabilityStatus: 'out_of_stock' }),
    sp4: P('sp4', { title: 'Tecno Spark 20', brand: 'Tecno', price: 280000, category: 'CAT-12', location: 'Mwanza', userId: 'sellerB', sellerName: 'Simu Center Posta', stock: 0, openingStockPending: true }),
    sp5: P('sp5', { title: 'Viatu vya Nike Air Max', brand: 'Nike', price: 0, category: 'CAT-07', location: 'Arusha', userId: 'sellerC', storeName: 'Viatu Bora' }),
    sp6: P('sp6', { title: 'Samsung Galaxy A15 128GB', brand: 'Samsung', price: 350000, category: 'CAT-12', countryCode: 'TZ', location: 'Dar es Salaam', userId: 'sellerA', sellerName: 'Duka la Neema' }),   // duplicate of sp1
    sp7: P('sp7', { title: 'Friji ya LG <script>alert(1)</script> lita 260', price: 950000, category: 'CAT-11', location: 'Dodoma', userId: 'sellerD', sellerName: 'Baridi & Co' }),
    draft1: P('draft1', { title: 'Rasimu ya simu', price: 1000, category: 'CAT-12', publicationStatus: 'draft', userId: 'sellerA' }),
    rem1: P('rem1', { title: 'Tangazo lililoondolewa', price: 1000, category: 'CAT-12', moderationStatus: 'removed', userId: 'sellerA' }),
    hid1: P('hid1', { title: 'Tangazo lililofichwa', price: 1000, category: 'CAT-12', availabilityStatus: 'hidden', userId: 'sellerA' }),
    arc1: P('arc1', { title: 'Tangazo lililohifadhiwa', price: 1000, category: 'CAT-12', archivedAt: '2026-11-01', userId: 'sellerA' }),
    pos1: P('pos1', { title: 'Bidhaa ya duka tu (POS)', price: 1000, category: 'CAT-12', salesChannels: ['pos'], userId: 'sellerA' }),
    'bad id!': P('bad', { title: 'Kitambulisho kibaya', price: 1000, category: 'CAT-12', userId: 'sellerA' })
  },
  services: {
    sv1: P('sv1', { title: 'Fundi umeme wa nyumba', price: 30000, location: 'Dar es Salaam', userId: 'sellerE', providerName: 'Juma Electric', serviceType: 'Umeme' }),
    sv2: P('sv2', { title: 'Fundi bomba Arusha', price: 25000, location: 'Arusha', userId: 'sellerF', providerName: 'Maji Safi' }),
    sv3: P('sv3', { title: 'Usafi wa ofisi', price: 50000, location: 'Dodoma', userId: 'sellerG', providerName: 'Safi Kabisa' })
  }
};
for (const [col, docs] of Object.entries(seed)) for (const [id, d] of Object.entries(docs)) await db.collection(col).doc(id).set(d);

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-seo-'));
const run = (out, extra = [], env = {}) => execFileSync(process.execPath, [path.join(ROOT, 'tools/build_seo.mjs'), '--out', out, '--now', '2026-11-21T12:00:00Z', '--report', path.join(out, '.report.json'), ...extra],
  { env: Object.assign({}, process.env, env), stdio: 'pipe' }).toString();
run(OUT);
const rep = JSON.parse(fs.readFileSync(path.join(OUT, '.report.json'), 'utf8'));
const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (!e.name.startsWith('.')) files.push(path.relative(OUT, f)); } })(OUT);
const html = files.filter(f => f.endsWith('.html'));
const read = (f) => fs.readFileSync(path.join(OUT, f), 'utf8');
const all = html.map(read).join('\n');
console.log('    report: ' + JSON.stringify(rep));

// ---- indexation
ok(rep.source === 'emulator' && rep.publicListings === 9, 'only public listings become pages: 9 of ' + rep.rawListings + ' (draft, removed, hidden, archived, POS-only, unsafe id and a duplicate excluded)');
const prodPages = files.filter(f => f.startsWith('bidhaa/')), svcPages = files.filter(f => f.startsWith('huduma/'));
ok(prodPages.length === 6 && svcPages.length === 3, 'product pages 6 + service pages 3');
ok(!/Rasimu ya simu|lililoondolewa|lililofichwa|lililohifadhiwa|duka tu \(POS\)|Kitambulisho kibaya/.test(all), 'no page or link mentions a non-public listing');
ok(prodPages.some(f => /^bidhaa\/samsung-galaxy-a15-128gb-sp[16]\/index\.html$/.test(f)) && !(prodPages.includes('bidhaa/samsung-galaxy-a15-128gb-sp1/index.html') && prodPages.includes('bidhaa/samsung-galaxy-a15-128gb-sp6/index.html')), 'descriptive URL /bidhaa/<slug>-<id>/ and duplicates collapse to one page');

// ---- privacy
ok(!/0712345678|255712345678|neema@example\.test|-6\.817265|39\.276419|"coords"|userEmail|sellerPhone/.test(all), 'no phone, e-mail or exact coordinates in any page (field mask + allow-list)');
ok(!/sellerA|sellerB|sellerE/.test(all.replace(/\/duka\/[a-z0-9-]+-seller[A-Z]\//g, '')), 'seller uid appears only inside the public shop URL');

// ---- canonical + titles
const canon = (h) => (/<link rel="canonical" href="([^"]+)">/.exec(h) || [])[1];
const titleOf = (h) => (/<title>([^<]*)<\/title>/.exec(h) || [])[1];
const unesc = (s) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const descOf = (h) => unesc((/<meta name="description" content="([^"]*)">/.exec(h) || [])[1]);
const pageUrl = (f) => 'https://sokohai.com/' + f.replace(/index\.html$/, '');
const indexable = html.filter(f => f !== '404.html');
ok(indexable.every(f => canon(read(f)) === pageUrl(f)), 'every page has a self-referencing https://sokohai.com canonical');
ok(new Set(indexable.map(f => titleOf(read(f)))).size === indexable.length, 'titles are unique (' + indexable.length + ' pages)');
ok(indexable.every(f => { const d = descOf(read(f)); return d && d.length >= 30 && d.length <= 160; }), 'meta descriptions present, 30–160 characters');
ok(indexable.every(f => /<meta name="robots" content="index, follow/.test(read(f))) && /<meta name="robots" content="noindex, follow">/.test(read('404.html')), 'public pages index,follow; 404 page noindex');
ok(html.every(f => /<meta name="viewport" content="width=device-width, initial-scale=1/.test(read(f)) && /<html lang="sw">/.test(read(f))), 'mobile viewport + lang="sw" on every page');
ok(html.every(f => /<meta property="og:title"/.test(read(f)) && /<meta property="og:image" content="https:\/\//.test(read(f)) && /twitter:card/.test(read(f))), 'Open Graph + Twitter preview tags');
ok(!html.some(f => /<script(?![^>]*type="application\/ld\+json")/i.test(read(f))), 'no executable scripts (only JSON-LD data)');
ok(!/<script>alert\(1\)<\/script>/.test(all) && /Friji ya LG &lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(all), 'listing text is HTML-escaped (no injection)');
ok(html.filter(f => f.startsWith('bidhaa/')).every(f => /<img [^>]*alt="[^"]+"[^>]*width="\d+" height="\d+"/.test(read(f))), 'images have alt text and dimensions (no layout shift)');
ok(/f_auto,q_auto,c_limit,w_800\//.test(all), 'Cloudinary images requested resized + auto-format');

// ---- structured data
const lds = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const AVAIL = /^https:\/\/schema\.org\/(InStock|OutOfStock|BackOrder|Discontinued|InStoreOnly|LimitedAvailability|OnlineOnly|PreOrder|PreSale|SoldOut)$/;
let products = 0, crumbs = 0, lists = 0;
for (const f of html) {
  for (const o of lds(read(f))) {
    assert.equal(o['@context'], 'https://schema.org');
    if (o['@type'] === 'Product') {
      products++;
      assert.ok(o.name && o.offers && /^\d+(\.\d+)?$/.test(o.offers.price) && o.offers.priceCurrency === 'TZS', f + ' Product name/offers.price/priceCurrency');
      assert.ok(!o.offers.availability || AVAIL.test(o.offers.availability), f + ' availability value');
      assert.ok(!('aggregateRating' in o) && !('review' in o), f + ' no ratings published');
      assert.ok(Array.isArray(o.image) && o.image.every(u => /^https:\/\//.test(u)), f + ' images absolute https');
      assert.equal(o.offers.url, pageUrl(f));
    }
    if (o['@type'] === 'BreadcrumbList') {
      crumbs++;
      o.itemListElement.forEach((it, i) => { assert.equal(it.position, i + 1); assert.ok(it.name); if (i < o.itemListElement.length - 1) assert.ok(/^https:\/\/sokohai\.com\//.test(it.item), f + ' crumb item'); });
    }
    if (o['@type'] === 'ItemList') { lists++; o.itemListElement.forEach((it, i) => { assert.equal(it.position, i + 1); assert.ok(files.includes(it.url.replace('https://sokohai.com/', '') + 'index.html'), 'ItemList url ' + it.url); }); }
  }
}
ok(products === 5, 'Product JSON-LD on the 5 priced products (the price-0 listing gets none) — required: name + offers.price, priceCurrency TZS');
ok(crumbs >= indexable.length - 1 && lists >= 3, 'BreadcrumbList on every page (positions 1..n, item URLs) + ItemList on list pages, all URLs resolve');
const ldOf = (id) => lds(read(prodPages.find(f => f.includes('-' + id + '/')))).find(o => o['@type'] === 'Product');
ok(ldOf('sp3').offers.availability === 'https://schema.org/OutOfStock', 'out-of-stock listing → OutOfStock');
ok(!('availability' in ldOf('sp4').offers), 'stock not confirmed by the seller → no availability claimed');
ok(ldOf('sp2').offers.availability === 'https://schema.org/InStock' && ldOf('sp2').offers.itemCondition === 'https://schema.org/UsedCondition', 'in stock → InStock; "Imetumika" → UsedCondition');
ok(ldOf('sp2').brand && ldOf('sp2').brand.name === 'Samsung' && ldOf('sp2').offers.seller.name === 'Duka la Neema', 'brand + seller name (public listing fields only)');

// ---- thin-content guards + hubs
ok(files.includes('soko/simu-na-mawasiliano/index.html') && files.includes('soko/simu-na-mawasiliano/dar-es-salaam/index.html'), 'category page + category × region page (3+ listings)');
ok(!files.some(f => /^soko\/[^/]+\/(mwanza|arusha|dodoma)\//.test(f)), 'no region page with fewer than 3 listings');
// [LOCAL SEO 2026-11-22] region hubs: only a VERIFIED region (countryCode + recognised region) with 3+ public listings
{ const hub = files.includes('soko/mkoa/dar-es-salaam/index.html') ? read('soko/mkoa/dar-es-salaam/index.html') : '';
  ok(hub && /<h1[^>]*>Soko la Dar es Salaam<\/h1>/.test(hub) && /Matangazo ya umma 3 \(bidhaa 3\)/.test(hub) && /href="\/soko\/simu-na-mawasiliano\/dar-es-salaam\/"/.test(hub),
    'region hub /soko/mkoa/dar-es-salaam/: real counts, links to the category × region page');
  ok(!files.some(f => /^soko\/mkoa\/(mwanza|arusha|dodoma)\//.test(f)), 'no region hub for a region without 3 verified listings (Dodoma/Arusha/Mwanza fixtures have no countryCode)');
  ok(/<title>Dar es Salaam — nunua na uza bidhaa na huduma \| SokoHai<\/title>/.test(hub) && canon(hub) === 'https://sokohai.com/soko/mkoa/dar-es-salaam/', 'region hub: own title + self canonical');
  ok(/href="\/soko\/mkoa\/dar-es-salaam\/"/.test(read('soko/index.html')), 'the /soko/ hub links to the region hub'); }
ok(files.includes('chapa/samsung/index.html') && !files.includes('chapa/nike/index.html'), 'brand page only with 3+ listings (Samsung yes, Nike no)');
ok(files.includes('soko/huduma/index.html') && files.some(f => f.startsWith('duka/duka-la-neema-sellerA/')), 'services hub + public seller page');
ok(/Muuzaji amethibitishwa/.test(read(files.find(f => f.startsWith('duka/duka-la-neema-sellerA/')))), 'verified badge only from the server-owned flag');
ok(['soko/index.html', 'mwongozo/index.html', 'washirika.html', '404.html'].every(f => files.includes(f)) && files.filter(f => f.startsWith('mwongozo/')).length === 4, 'hub, 3 guides + index, partners page and 404 page');
ok(/Linganisha bei|Ofa nyingine|Zinazofanana/.test(read(prodPages.find(f => f.includes('-sp2/')))), 'listing pages link to related listings (internal links)');
ok(!/escrow (protect|ulinzi)|ulinzi wa escrow|guaranteed|dhamana ya kurudishiwa/i.test(all), 'no unsupported payment / refund promises');

// ---- sitemaps + robots
const xmlFiles = files.filter(f => f.endsWith('.xml'));
for (const f of xmlFiles) execFileSync('python3', ['-c', 'import sys,xml.etree.ElementTree as E; E.parse(sys.argv[1])', path.join(OUT, f)]);
ok(xmlFiles.includes('sitemap.xml') && xmlFiles.length >= 4, 'sitemap index + child sitemaps are well-formed XML (' + xmlFiles.join(', ') + ')');
const idx = read('sitemap.xml'); const children = [...idx.matchAll(/<loc>https:\/\/sokohai\.com\/([^<]+)<\/loc>/g)].map(m => m[1]);
ok(/<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(idx) && children.every(c => files.includes(c)), 'index lists only existing child sitemaps');
const locs = children.flatMap(c => [...read(c).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
ok(locs.every(l => /^https:\/\/sokohai\.com\//.test(l)) && new Set(locs).size === locs.length, 'all sitemap URLs on https://sokohai.com, no duplicates (' + locs.length + ')');
const STATIC_OK = ['', 'about.html', 'support.html', 'contact.html', 'privacy.html', 'terms.html', 'cookies.html', 'refund-policy.html', 'seller-policy.html', 'community-guidelines.html'];
ok(locs.every(l => { const r = l.replace('https://sokohai.com/', ''); return STATIC_OK.includes(r) || files.includes(r.endsWith('.html') ? r : r + 'index.html'); }), 'every sitemap URL is a page that exists');
ok(indexable.every(f => locs.includes(pageUrl(f))), 'every indexable page is in a sitemap');
ok(!locs.some(l => /404|\/p\/|\?/.test(l)), 'no 404, app deep link or query URL in sitemaps');
ok(/<image:image><image:loc>https:\/\/res\.cloudinary\.com/.test(read('sitemap-listings.xml')) && [...read('sitemap-listings.xml').matchAll(/<lastmod>(\d{4}-\d\d-\d\d)<\/lastmod>/g)].length === 9, 'listing sitemap has lastmod + image entries');
const robots = read('robots.txt');
ok(/^Sitemap: https:\/\/sokohai\.com\/sitemap\.xml$/m.test(robots) && /^Allow: \/$/m.test(robots) && !/^Disallow: \/\s*$/m.test(robots), 'robots.txt: allows crawling, points at the sitemap index');

// ---- failure + offline modes still produce the static site
const OFF = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-seo-off-'));
run(OFF, ['--offline']);
ok(fs.existsSync(path.join(OFF, 'sitemap.xml')) && fs.existsSync(path.join(OFF, 'soko/index.html')) && !fs.existsSync(path.join(OFF, 'bidhaa')), 'offline / deploy-preview mode: static pages + sitemap, no listing data');
const FAIL = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-seo-fail-'));
const out = run(FAIL, [], { FIRESTORE_EMULATOR_HOST: '127.0.0.1:9' });
ok(fs.existsSync(path.join(FAIL, 'sitemap.xml')) && JSON.parse(fs.readFileSync(path.join(FAIL, '.report.json'))).fetchError, 'non-production run (no Netlify CONTEXT): data source down -> static pages only, failure reported');
const ctxPrev = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-seo-prev-'));
run(ctxPrev, [], { CONTEXT: 'deploy-preview', FIRESTORE_EMULATOR_HOST: '' });
ok(!fs.existsSync(path.join(ctxPrev, 'bidhaa')) && fs.existsSync(path.join(ctxPrev, 'sitemap.xml')), 'Netlify deploy previews do not read production listing data');

// ---- [SEO-SAFETY] legacy listings with precise location data (separate emulator project: the counts above stay exact)
const LEG = 'demo-sokohai-legacy', EMPTY = 'demo-sokohai-empty', DENIED = 'demo-sokohai-denied';
const loadRules = (proj, content) => fetch(`http://${HOST}/emulator/v1/projects/${proj}:securityRules`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content } ] } }) });
for (const proj of [LEG, EMPTY]) { await fetch(`http://${HOST}/emulator/v1/projects/${proj}/databases/(default)/documents`, { method: 'DELETE' }); await loadRules(proj, rules); }
await fetch(`http://${HOST}/emulator/v1/projects/${DENIED}/databases/(default)/documents`, { method: 'DELETE' });
await loadRules(DENIED, "rules_version = '2';\nservice cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }");
const ldb = admin.initializeApp({ projectId: LEG }, 'legacy').firestore();
const SECRET = ['Mtaa wa Uhuru', 'Nyumba Na. 12', 'Plot 45', 'Block B', 'karibu na Shell', 'Kiwanja 7', '-6.81234', '39.27891', '-6.792412', '39.208345', '6°48', 'maps.app.goo.gl', 'google.com/maps', '0754111222', '255754111222', 'mmiliki@example.test', '-6.8123'];
await ldb.collection('products').doc('leg1').set(P('leg1', { title: 'Jiko la gesi Legacy Moja', price: 120000, category: 'CAT-11', userId: 'legSeller1', sellerName: 'Duka Legacy', countryCode: 'TZ',
  location: 'Mtaa wa Uhuru, Nyumba Na. 12, Kariakoo (-6.81234, 39.27891)', region: 'Ilala, Mtaa wa Uhuru', coords: { lat: -6.81234, lon: 39.27891 }, latitude: -6.81234, longitude: 39.27891,
  filters: { rangi: 'Nyeusi', location: 'Kiwanja 7, Mtaa wa Uhuru', gps: '-6.81234,39.27891', ukubwa: 'Plates 2 -6.8123 39.2789' },
  description: 'Jiko zuri. Nipo -6.81234, 39.27891 (6°48\'44"S). Ramani: https://maps.app.goo.gl/AbC123 au https://www.google.com/maps/@-6.81,39.27,17z. Piga 0754 111 222 au +255754111222, mmiliki@example.test' }));
await ldb.collection('products').doc('leg2').set(P('leg2', { title: 'Meza ya mbao Legacy Mbili', price: 80000, category: 'CAT-09', userId: 'legSeller2', sellerName: 'Fundi Legacy',
  location: 'Plot 45 Block B, karibu na Shell', coords: { lat: -6.792412, lon: 39.208345 } }));
await ldb.collection('services').doc('leg3').set(P('leg3', { title: 'Fundi bomba Legacy Tatu', price: 20000, userId: 'legSeller3', providerName: 'Bomba Legacy', location: '-6.792412, 39.208345' }));
const LOUT = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-seo-leg-'));
run(LOUT, [], { GCLOUD_PROJECT: LEG });
const lrep = JSON.parse(fs.readFileSync(path.join(LOUT, '.report.json'), 'utf8'));
const lfiles = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (!e.name.startsWith('.')) lfiles.push(path.relative(LOUT, f)); } })(LOUT);
const lall = lfiles.map(f => fs.readFileSync(path.join(LOUT, f), 'utf8')).join('\n');
const lpage = (id) => fs.readFileSync(path.join(LOUT, lfiles.find(f => f.includes('-' + id + '/'))), 'utf8');
ok(lrep.publicListings === 3 && lfiles.some(f => f.includes('-leg1/')) && lfiles.some(f => f.includes('-leg2/')) && lfiles.some(f => f.includes('-leg3/')), 'legacy listings with precise locations still get their public page (discovery kept)');
ok(SECRET.every(x => !lall.includes(x)), 'no street, house / plot number, landmark, GPS pair, map link, phone or e-mail from legacy data in any page, sitemap or JSON-LD');
ok(/<p class="sp-loc">Mkoa: Dar es Salaam<\/p>/.test(lpage('leg1')) && /sp-card-l">Dar es Salaam</.test(lall), 'a recognisable legacy location is reduced to its region only ("Dar es Salaam")');
ok(!/sp-loc/.test(lpage('leg2')) && !/sp-loc/.test(lpage('leg3')), 'no recognisable region (address-only or GPS-only) -> no location at all on the page');
ok(/Nyeusi/.test(lpage('leg1')) && !/<dt>(location|gps|ukubwa)<\/dt>/.test(lpage('leg1')), 'attributes: harmless ones kept, location / GPS keys and values carrying coordinates dropped');
ok(/Jiko zuri\./.test(lpage('leg1')), 'description kept, only the private parts removed');
ok(/Mkoa: Dar es Salaam/.test(lpage('leg1')), 'Tanzania (countryCode TZ verified) keeps regional discovery');
const lseller = fs.readFileSync(path.join(LOUT, lfiles.find(f => f.startsWith('duka/duka-legacy-legSeller1/'))), 'utf8');
ok(/Dar es Salaam/.test(lseller) && !/Kariakoo|Uhuru/.test(lseller), 'seller page keeps regional discovery (region name only)');

// ---- [SEO-PRIVACY 2026-11-21 review] international listings: country-aware regions, international phone numbers
const INTL = 'demo-sokohai-intl';
await fetch(`http://${HOST}/emulator/v1/projects/${INTL}/databases/(default)/documents`, { method: 'DELETE' }); await loadRules(INTL, rules);
const idb = admin.initializeApp({ projectId: INTL }, 'intl').firestore();
const AR = createRequire(path.join(ROOT, 'tools', 'x.mjs'))('../shared/admin-regions.js');
const ISECRET = ['Moi Avenue', 'Hilton', '+254 712 345 678', '0712 345 678', '254712345678', '+254 700 000 111', 'Allen Avenue', 'Ikeja', '+234 803 123 4567', '0803 123 4567',
  '1 Ocean Drive', 'Westlands', '+44 20 7946 0958', '+1 (415) 555-0132', '555-0132', 'wa.me', 'tel:'];
await idb.collection('products').doc('int1').set(P('int1', { title: 'Sofa Nairobi Intl Moja', price: 45000, category: 'CAT-09', userId: 'intSeller1', sellerName: 'Nairobi Furniture',
  countryCode: 'KE', location: 'Moi Avenue 22, Nairobi CBD, near Hilton', filters: { color: 'Black', contact: '+254 700 000 111' },
  description: 'Good sofa. Call +254 712 345 678 or 0712 345 678, WhatsApp wa.me/254712345678. Bei TSh 1 500 000 haijumuishi usafiri.' }));
await idb.collection('products').doc('int2').set(P('int2', { title: 'Generator Lagos Intl Mbili', price: 900000, category: 'CAT-34', userId: 'intSeller2', sellerName: 'Lagos Power',
  countryCode: 'NG', location: '12 Allen Avenue, Ikeja, Lagos', description: 'Ring +234 803 123 4567 / 0803 123 4567 tel:+2348031234567' }));
await idb.collection('products').doc('int3').set(P('int3', { title: 'Kiti Atlantis Intl Tatu', price: 15000, category: 'CAT-09', userId: 'intSeller3', sellerName: 'Atlantis',
  country: 'Atlantis', location: '1 Ocean Drive' }));
await idb.collection('products').doc('int4').set(P('int4', { title: 'Meza ya mbao Intl Nne', price: 30000, category: 'CAT-09', userId: 'intSeller4', sellerName: 'Meza Shop',
  location: 'Westlands, Nairobi' }));
await idb.collection('products').doc('int5').set(P('int5', { title: 'Laptop Dell Intl Tano +44 20 7946 0958', price: 700000, category: 'CAT-13', userId: 'intSeller5', sellerName: 'UK Seller',
  countryCode: 'US', region: 'California', description: 'Call +1 (415) 555-0132' }));
await idb.collection('products').doc('int6').set(P('int6', { title: 'Baiskeli Intl Sita', price: 120000, category: 'CAT-14', userId: 'intSeller6', sellerName: 'Rift Bikes',
  country: 'Kenya', region: 'Uasin Gishu', location: 'Eldoret, next to the bus stage' }));
await idb.collection('products').doc('int7').set(P('int7', { title: 'Taa Intl Saba', price: 9000, category: 'CAT-09', userId: 'intSeller7', sellerName: 'Taa Shop', location: 'Kariakoo, Dar es Salaam' }));
await idb.collection('products').doc('int8').set(P('int8', { title: 'Kabati Intl Nane', price: 90000, category: 'CAT-09', userId: 'intSeller8', sellerName: 'Kabati Shop', country: 'TZA-ish', region: 'Mwanza' }));
await idb.collection('products').doc('int9').set(P('int9', { title: 'Godoro Intl Tisa', price: 150000, category: 'CAT-09', userId: 'intSeller9', sellerName: 'Godoro Shop', countryCode: 'TZ', location: 'Plot 9, Mtaa wa Jamhuri' }));
// [SEO-PRIVACY review 2] phone numbers vs barcodes / identifiers in public text
await idb.collection('products').doc('int10').set(P('int10', { title: 'Maziwa Intl Kumi', price: 3500, category: 'CAT-01', userId: 'intSeller10', sellerName: 'Maziwa Shop', countryCode: 'TZ', region: 'Arusha',
  filters: { barcode: '5901234123457', imei: '356938035643809', whatsapp: '0712 345 678' },
  description: 'Barcode 5901234123457, EAN 4006381333931, SKU MZ-2026-001, IMEI 356938035643809, Serial 9876543210, 6201234567893. Bei TSh 1 500 000 kwa katoni. Simu 0754 999 888, +44 20 7946 0958, 00 256 772 123 456, nipigie 712345678, tel:+255754999888, https://wa.me/255754999888, https://api.whatsapp.com/send?phone=255754999888' }));
const IOUT = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-seo-intl-'));
run(IOUT, [], { GCLOUD_PROJECT: INTL });
const ifiles = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (!e.name.startsWith('.')) ifiles.push(path.relative(IOUT, f)); } })(IOUT);
const iall = ifiles.map(f => fs.readFileSync(path.join(IOUT, f), 'utf8')).join('\n');
const ipage = (id) => fs.readFileSync(path.join(IOUT, ifiles.find(f => f.includes('-' + id + '/'))), 'utf8');
ok(['int1', 'int2', 'int3', 'int4', 'int5', 'int6', 'int7', 'int8', 'int9', 'int10'].every(id => ifiles.some(f => f.includes('-' + id + '/'))), 'international listings still get their public pages');
ok(ISECRET.every(x => !iall.includes(x)), 'no international address, landmark, phone number (+CC, 00CC, local formats), WhatsApp or tel: link in any page, sitemap or JSON-LD');
ok(/<p class="sp-loc">Mkoa: Nairobi, Kenya<\/p>/.test(ipage('int1')), 'Kenya (supported): street address reduced to the county ("Nairobi, Kenya")');
ok(/<p class="sp-loc">Mkoa: Uasin Gishu, Kenya<\/p>/.test(ipage('int6')) && !/Eldoret|bus stage/.test(ipage('int6')), 'Kenya: country NAME + normalised region field used; the free text is not shown');
ok(/<p class="sp-loc">Nchi: Nigeria<\/p>/.test(ipage('int2')), 'unsupported but valid country (NG): country name only, never the raw address');
ok(new RegExp('<p class="sp-loc">Nchi: ' + AR.countryName('US') + '</p>').test(ipage('int5')) && !/California/.test(ipage('int5')), 'US: no region list yet -> country only (region not claimed)');
ok(!/sp-loc/.test(ipage('int3')), 'unverifiable country ("Atlantis") -> no location at all');
ok(!/sp-loc/.test(ipage('int4')), 'no country and no Tanzanian region ("Westlands, Nairobi") -> hidden, not guessed');
ok(!/sp-loc/.test(ipage('int7')) && !/Kariakoo|Dar es Salaam/.test(ipage('int7')), 'no country field: Tanzania is NOT assumed, even for a recognisable Tanzanian place ("Kariakoo, Dar es Salaam")');
ok(!/sp-loc/.test(ipage('int8')) && !/Mwanza/.test(ipage('int8')), 'unverifiable country text ("TZA-ish") + a region field: nothing shown');
ok(/<p class="sp-loc">Nchi: Tanzania<\/p>/.test(ipage('int9')) && !/Plot 9|Mtaa/.test(ipage('int9')), 'verified Tanzania but only a street address: country name only');
ok(/<h1[^>]*>Laptop Dell Intl Tano<\/h1>/.test(ipage('int5')), 'a phone number typed into a title is removed from the title, URL and JSON-LD');
ok(/<dt>color<\/dt>/i.test(ipage('int1')) && !/<dt>contact<\/dt>/i.test(ipage('int1')), 'attributes: contact keys dropped, harmless ones kept');
ok(/TSh 1 500 000/.test(ipage('int1')) && /Good sofa\./.test(ipage('int1')), 'amounts written after a currency are kept (not mistaken for phone numbers)');
const BARCODES = ['5901234123457', '4006381333931', 'MZ-2026-001', '356938035643809', '9876543210', '6201234567893', 'TSh 1 500 000'];
const PHONES = ['0754 999 888', '+44 20 7946 0958', '256 772 123 456', '712345678', 'tel:', 'wa.me', 'api.whatsapp.com', '255754999888', '0712 345 678'];
const p10 = ipage('int10');
ok(BARCODES.every(x => p10.includes(x)), 'valid barcodes (EAN-13), labelled identifiers (SKU, IMEI, serial) and amounts are KEPT in public text');
ok(PHONES.every(x => !p10.includes(x)), 'phone numbers (local, +CC, 00CC, "nipigie …"), tel: and WhatsApp links are removed from the same text');
ok(/<dt>barcode<\/dt>/i.test(p10) && /<dt>imei<\/dt>/i.test(p10) && !/<dt>whatsapp<\/dt>/i.test(p10), 'attributes: barcode / IMEI kept, WhatsApp contact attribute dropped');
fs.rmSync(IOUT, { recursive: true, force: true });

// ---- [SEO-SAFETY] production failure handling
const runStatus = (out, extra = [], env = {}) => spawnSync(process.execPath, [path.join(ROOT, 'tools/build_seo.mjs'), '--out', out, '--now', '2026-11-21T12:00:00Z', '--report', path.join(out, '.report.json'), ...extra],
  { env: Object.assign({}, process.env, env), encoding: 'utf8' });
const emptyDir = (d) => fs.readdirSync(d).length === 0;
const P1 = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-seo-p1-'));
let r1 = runStatus(P1, [], { CONTEXT: 'production', FIRESTORE_EMULATOR_HOST: '127.0.0.1:9' });
ok(r1.status === 1 && /FATAL \(production\)/.test(r1.stderr) && emptyDir(P1), 'production: data source unreachable -> build FAILS (exit 1) and writes nothing (Netlify keeps the last good deploy)');
const P2 = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-seo-p2-'));
let r2 = runStatus(P2, [], { CONTEXT: 'production', GCLOUD_PROJECT: DENIED });
ok(r2.status === 1 && /HTTP 403/.test(r2.stderr) && emptyDir(P2), 'production: read refused (HTTP 403) is a failure, never mistaken for an empty catalogue');
const P3 = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-seo-p3-'));
let r3 = runStatus(P3, [], { CONTEXT: 'production', GCLOUD_PROJECT: EMPTY });
const rep3 = r3.status === 0 ? JSON.parse(fs.readFileSync(path.join(P3, '.report.json'), 'utf8')) : {};
ok(r3.status === 0 && rep3.strict === true && rep3.source === 'emulator' && rep3.fetchError === null && rep3.rawListings === 0 && fs.existsSync(path.join(P3, 'sitemap.xml')) && !fs.existsSync(path.join(P3, 'sitemap-listings.xml')),
  'production: a legitimately EMPTY catalogue builds (read succeeded, 0 listings, no error) — distinguishable from a failure');
const P4 = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-seo-p4-'));
let r4 = runStatus(P4, ['--min-listings', '1'], { CONTEXT: 'production', GCLOUD_PROJECT: EMPTY });
ok(r4.status === 1 && /fewer than the required 1/.test(r4.stderr) && emptyDir(P4), 'production: optional --min-listings floor stops a build with too few listings');
const P5 = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-seo-p5-'));
let r5 = runStatus(P5, ['--strict'], { FIRESTORE_EMULATOR_HOST: '127.0.0.1:9' });
ok(r5.status === 1 && emptyDir(P5), '--strict gives the same protection outside Netlify');
const P6 = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-seo-p6-'));
let r6 = runStatus(P6, [], { CONTEXT: 'production' });
const rep6 = r6.status === 0 ? JSON.parse(fs.readFileSync(path.join(P6, '.report.json'), 'utf8')) : {};
ok(r6.status === 0 && rep6.strict === true && rep6.publicListings === 9 && fs.existsSync(path.join(P6, 'sitemap-listings.xml')), 'production with healthy data: full build (9 public listings, listing sitemap)');
const P7 = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-seo-p7-'));
let r7 = runStatus(P7, [], { CONTEXT: 'branch-deploy', FIRESTORE_EMULATOR_HOST: '' });
ok(r7.status === 0 && fs.existsSync(path.join(P7, 'sitemap.xml')) && !fs.existsSync(path.join(P7, 'bidhaa')), 'branch deploys keep the documented static-only mode');
for (const d of [LOUT, P1, P2, P3, P4, P5, P6, P7]) fs.rmSync(d, { recursive: true, force: true });

// ---- hosting rules
const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
ok(/command = "node tools\/build_dist\.mjs --minify --check && node tools\/build_seo\.mjs --out dist"/.test(toml), 'Netlify build runs the SEO build after the dist build');
const spa = toml.indexOf('from = "/*"');
ok(['bidhaa', 'huduma', 'duka', 'soko', 'chapa', 'mwongozo'].every(s => { const i = toml.indexOf('from = "/' + s + '/*"'); return i !== -1 && i < spa && /to = "\/404\.html"\s+status = 404/.test(toml.slice(i, i + 80)); }), 'missing public pages return a real 404 (rules before the SPA rewrite, not forced)');
for (const d of [OUT, OFF, FAIL, ctxPrev]) fs.rmSync(d, { recursive: true, force: true });
console.log(`\nSEO BUILD (emulator): ${n} passed, 0 failed`);
