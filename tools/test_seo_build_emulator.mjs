#!/usr/bin/env node
/* [SEO 2026-11-21] tools/build_seo.mjs against the Firestore emulator (public read rules, no credentials).
 * Seeds public, draft, removed, hidden, out-of-stock and unconfirmed-stock listings — some carrying private fields —
 * builds the site into a temp folder and checks: indexation (only public listings get pages), privacy (no phone,
 * e-mail or exact coordinates), canonical URLs, unique titles/descriptions, sitemap validity (XML parser) and coverage,
 * robots.txt, structured data (Product/Offer/BreadcrumbList/ItemList per Google's documented required properties,
 * truthful availability, no invented ratings), thin-content guards, mobile viewport, and that a data failure or the
 * offline mode still produces the static pages + sitemap. Also checks netlify.toml 404 routing order.
 * Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 GCLOUD_PROJECT=demo-sokohai node tools/test_seo_build_emulator.mjs */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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
    sp1: P('sp1', { title: 'Samsung Galaxy A15 128GB', brand: 'Samsung', price: 350000, category: 'CAT-12', location: 'Kariakoo, Dar es Salaam', userId: 'sellerA', sellerName: 'Duka la Neema', condition: 'Mpya', verified: true,
      phone: '0712345678', sellerPhone: '+255712345678', userEmail: 'neema@example.test', coords: { lat: -6.817265, lon: 39.276419 } }),
    sp2: P('sp2', { title: 'Samsung Galaxy S21 Ultra', brand: 'Samsung', price: 1150000, category: 'CAT-12', location: 'Sinza, Dar es Salaam', userId: 'sellerA', sellerName: 'Duka la Neema', condition: 'Imetumika' }),
    sp3: P('sp3', { title: 'Samsung Galaxy A05s', brand: 'Samsung', price: 260000, category: 'CAT-12', location: 'Dar es Salaam', userId: 'sellerB', sellerName: 'Simu Center Posta', stock: 0, availabilityStatus: 'out_of_stock' }),
    sp4: P('sp4', { title: 'Tecno Spark 20', brand: 'Tecno', price: 280000, category: 'CAT-12', location: 'Mwanza', userId: 'sellerB', sellerName: 'Simu Center Posta', stock: 0, openingStockPending: true }),
    sp5: P('sp5', { title: 'Viatu vya Nike Air Max', brand: 'Nike', price: 0, category: 'CAT-07', location: 'Arusha', userId: 'sellerC', storeName: 'Viatu Bora' }),
    sp6: P('sp6', { title: 'Samsung Galaxy A15 128GB', brand: 'Samsung', price: 350000, category: 'CAT-12', location: 'Dar es Salaam', userId: 'sellerA', sellerName: 'Duka la Neema' }),   // duplicate of sp1
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
ok(fs.existsSync(path.join(FAIL, 'sitemap.xml')) && JSON.parse(fs.readFileSync(path.join(FAIL, '.report.json'))).fetchError, 'data source down: build still succeeds with static pages (deploy never broken)');
const ctxPrev = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-seo-prev-'));
run(ctxPrev, [], { CONTEXT: 'deploy-preview', FIRESTORE_EMULATOR_HOST: '' });
ok(!fs.existsSync(path.join(ctxPrev, 'bidhaa')) && fs.existsSync(path.join(ctxPrev, 'sitemap.xml')), 'Netlify deploy previews do not read production listing data');

// ---- hosting rules
const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
ok(/command = "node tools\/build_dist\.mjs --minify --check && node tools\/build_seo\.mjs --out dist"/.test(toml), 'Netlify build runs the SEO build after the dist build');
const spa = toml.indexOf('from = "/*"');
ok(['bidhaa', 'huduma', 'duka', 'soko', 'chapa', 'mwongozo'].every(s => { const i = toml.indexOf('from = "/' + s + '/*"'); return i !== -1 && i < spa && /to = "\/404\.html"\s+status = 404/.test(toml.slice(i, i + 80)); }), 'missing public pages return a real 404 (rules before the SPA rewrite, not forced)');
for (const d of [OUT, OFF, FAIL, ctxPrev]) fs.rmSync(d, { recursive: true, force: true });
console.log(`\nSEO BUILD (emulator): ${n} passed, 0 failed`);
