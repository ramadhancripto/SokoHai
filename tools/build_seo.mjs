#!/usr/bin/env node
/**
 * [SEO 2026-11-21] Crawlable public pages + sitemaps, generated at BUILD time (no server, no new service, no cost
 * beyond Firestore reads of public listings — see docs/SEO-SEARCH-SYSTEM.md).
 *
 * Why: the app is a JavaScript single-page app; every URL returned the same index.html (200), /sitemap.xml returned
 * HTML, and listings had no crawlable page of their own. This tool writes plain HTML pages (no scripts except JSON-LD
 * data) for public listings, sellers, categories, category × region, brands, guides and a partners page, plus a
 * sitemap index, a 404 page and robots.txt — into dist/ AFTER tools/build_dist.mjs.
 *
 *   node tools/build_seo.mjs [--out dist] [--offline] [--max 5000] [--now 2026-11-21T00:00:00Z]
 *     data source: Firestore REST (public read rules), project + public web API key from js/app/00-bootstrap.js;
 *     FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 + GCLOUD_PROJECT=demo-... reads the emulator instead (tests).
 *     --offline or a non-production Netlify CONTEXT: static pages + sitemap only (no listing data).
 *
 * Privacy: only an allow-list of public fields is requested (field mask) — no phone, e-mail, exact coordinates,
 * buyer data or private seller records. Honesty: price/availability/condition come from the listing; no ratings or
 * reviews are published in structured data (reviews are not yet tied to verified purchases); no invented stock.
 *
 * [SEO-SAFETY 2026-11-21] Public location = REGION ONLY (country-aware: shared/admin-regions.js). The free-text
 * `location` / `region` fields (legacy listings can hold a street, plot number, landmark or GPS pair) and the normalised
 * `countryCode` / `country` / `adminRegion` / `state` / `county` fields are read only to recognise a first-level region:
 * Tanzania (31 regions) and Kenya (47 counties) are supported; another valid ISO country shows its NAME only; a
 * MISSING or unverifiable country shows NOTHING (no country is assumed); an unrecognised region shows the verified
 * country name only. Not worldwide region support. Coordinate pairs, map links, phone numbers and e-mail
 * addresses (Tanzanian and international formats, tel: / WhatsApp links) are also removed from titles, shop names,
 * description text and attribute values (shared/public-text-privacy.js); valid barcodes, labelled identifiers and
 * amounts after a currency are kept.
 *
 * [SEO-SAFETY 2026-11-21] Data failure:
 *   - production (Netlify CONTEXT=production, or --strict): a failed / incomplete read of products or services FAILS
 *     the build (exit 1, nothing written), so Netlify keeps the previous successful deployment and never publishes
 *     a sitemap without the listings. An empty catalogue read successfully is NOT a failure (source "firestore",
 *     rawListings 0, fetchError null). Optional floor: --min-listings N / SKH_SEO_MIN_LISTINGS=N.
 *   - offline, deploy previews, branch deploys and plain local runs: documented static-only mode (fetchError reported).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { GUIDES, PARTNERS_PAGE } from './seo-content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const E = require('../shared/search-engine.js');
const SP = require('../shared/seo-paths.js');
const CAT = await import('../shared/category-filter-core.mjs');

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i !== -1 ? args[i + 1] : d; };
const OUT = path.resolve(ROOT, arg('--out', 'dist'));
const MAX = Math.max(1, Number(arg('--max', 5000)) || 5000);
const NOW = arg('--now', null) ? new Date(arg('--now')) : new Date();
const TODAY = NOW.toISOString().slice(0, 10);
const site = fs.readFileSync(path.join(ROOT, 'functions/site-domain.js'), 'utf8');
const ORIGIN = /const CANONICAL_ORIGIN = '([^']+)'/.exec(site)[1].replace(/\/+$/, '');
const boot = fs.readFileSync(path.join(ROOT, 'js/app/00-bootstrap.js'), 'utf8');
const API_KEY = /apiKey:\s*"([^"]+)"/.exec(boot)[1];
const PROD_PROJECT = /projectId:\s*"([^"]+)"/.exec(boot)[1];
const EMU = process.env.FIRESTORE_EMULATOR_HOST || '';
const PROJECT = EMU ? (process.env.GCLOUD_PROJECT || 'demo-sokohai') : PROD_PROJECT;
const CONTEXT = process.env.CONTEXT || '';          // Netlify: production | deploy-preview | branch-deploy
const OFFLINE = args.includes('--offline') || (CONTEXT && CONTEXT !== 'production' && !EMU);
const STRICT = !OFFLINE && (CONTEXT === 'production' || args.includes('--strict'));   // [SEO-SAFETY] production must have its data
const MIN_LISTINGS = Math.max(0, Number(arg('--min-listings', process.env.SKH_SEO_MIN_LISTINGS || 0)) || 0);
const FETCH_TIMEOUT_MS = 30000, FETCH_TRIES = 3;
const PER_PAGE = 48, MIN_LIST = 3;

// ------------------------------------------------------------------ helpers
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
const money = (n) => Number(n) > 0 ? 'TSh ' + Math.round(Number(n)).toLocaleString('en-US') : '';
const abs = (p) => ORIGIN + p;
function ts(v) { if (!v) return 0; if (typeof v === 'object' && v.seconds) return v.seconds * 1000; const n = Date.parse(v); return isFinite(n) ? n : 0; }
function isoDay(v) { const t = ts(v); return t ? new Date(t).toISOString().slice(0, 10) : TODAY; }
/** Cloudinary: ask for a resized, auto-format copy (smaller pages); other hosts unchanged. Only https images. */
function img(u, w) {
  u = String(u || ''); if (!/^https:\/\//.test(u)) return '';
  return u.replace(/(res\.cloudinary\.com\/[^/]+\/image\/upload\/)(?!f_auto)/, `$1f_auto,q_auto,c_limit,w_${w}/`);
}
const imagesOf = (d) => [...new Set([].concat(Array.isArray(d.images) ? d.images : [], d.image || [], d.imageUrl || []).map(x => typeof x === 'string' ? x : (x && x.url) || '').filter(u => /^https:\/\//.test(u)))].slice(0, 6);
const catLabel = (id) => { try { return CAT.categoryLabel(id) || ''; } catch (e) { return ''; } };
function write(rel, html) {
  if (!/^(bidhaa|huduma|duka|soko|chapa|mwongozo)\/|^(404\.html|washirika\.html|robots\.txt|sitemap[a-z0-9-]*\.xml)$/.test(rel)) throw new Error('refusing to write ' + rel);
  const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); written.push(rel);
}
const written = [];

// ------------------------------------------------------------------ data
const PUBLIC_FIELDS = ['title', 'name', 'serviceTitle', 'serviceName', 'description', 'price', 'currency', 'category', 'subCategory', 'productTypeLabel',
  'serviceType', 'specialization', 'brand', 'model', 'condition', 'location', 'region', 'image', 'images', 'imageUrl', 'stock', 'availabilityStatus',
  'publicationStatus', 'status', 'archivedAt', 'deletedAt', 'permanentlyDeleted', 'deleted', 'adminHidden', 'moderationStatus', 'isOnline', 'active',
  'salesChannels', 'createdAt', 'updatedAt', 'timestamp', 'userId', 'sellerName', 'storeName', 'businessName', 'ownerName', 'providerName',
  'verified', 'ownerVerified', 'sellerVerified', 'isVerified', 'providerVerified', 'verificationStatus', 'openingStockPending', 'baseUnit', 'unit', 'filters',
  'country', 'countryCode', 'adminRegion', 'state', 'county'];   // [SEO-PRIVACY] normalised location fields (only to recognise a region)
function decode(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue; if ('nullValue' in v) return null; if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)]));
  return null;
}
async function fetchCollection(col) {
  const base = EMU ? `http://${EMU}/v1/projects/${PROJECT}/databases/(default)/documents/${col}` : `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${col}`;
  const mask = PUBLIC_FIELDS.map(f => 'mask.fieldPaths=' + encodeURIComponent(f)).join('&');
  const out = []; let token = '', complete = false;
  for (let page = 0; page < 100 && out.length < MAX; page++) {
    const url = `${base}?pageSize=300&${mask}${token ? '&pageToken=' + encodeURIComponent(token) : ''}${EMU ? '' : '&key=' + API_KEY}`;
    const j = await getPage(url, col);   // no credentials: only what the public read rules allow
    (j.documents || []).forEach(d => { const o = Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, decode(v)])); o.id = d.name.split('/').pop(); o.collectionName = col; out.push(o); });
    token = j.nextPageToken; if (!token) { complete = true; break; }
  }
  // stopped by the page cap with more pages waiting (and not by the configured --max): the read is incomplete
  if (!complete && out.length < MAX) throw new Error(col + ' read incomplete: page limit reached with more data waiting');
  return out.slice(0, MAX);
}
/** One REST page: timeout, retry transient failures (network, 429, 5xx), and insist on a well-formed response. */
async function getPage(url, col) {
  let last = '';
  for (let i = 1; i <= FETCH_TRIES; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (r.ok) {
        const j = await r.json();
        if (!j || typeof j !== 'object' || Array.isArray(j) || ('documents' in j && !Array.isArray(j.documents))) throw new Error('malformed response');
        return j;   // {} = no documents: a legitimately empty collection
      }
      last = 'HTTP ' + r.status + ' ' + (await r.text()).slice(0, 160);
      if (r.status !== 429 && r.status < 500) break;   // 4xx (rules, key, project) will not heal by retrying
    } catch (e) { last = String(e && e.message || e); }
    if (i < FETCH_TRIES) await new Promise(res => setTimeout(res, 500 * i));
  }
  throw new Error(col + ' ' + last);
}
/** Public listing = engine eligibility + marketplace channel + a title + a safe id. */
function publicListing(d) {
  if (!E.eligible(d) || !SP.safeId(d.id)) return false;
  if (Array.isArray(d.salesChannels) && d.salesChannels.length && !d.salesChannels.includes('marketplace')) return false;
  const pub = String(d.publicationStatus || '').toLowerCase(); if (d.collectionName === 'products' && pub && pub !== 'published') return false;
  return !!String(d.title || d.name || d.serviceTitle || d.serviceName || '').trim();
}
const titleOf = (d) => String(d.title || d.name || d.serviceTitle || d.serviceName || '').trim();
const sellerNameOf = (d) => clip(String(d.storeName || d.businessName || d.sellerName || d.providerName || d.ownerName || '').trim(), 60);
// [SEO-SAFETY 2026-11-21] the ONLY location a public page shows: a region name from the fixed list (or nothing)
// [SEO-PRIVACY 2026-11-21 review] country-aware (shared/admin-regions.js): TZ regions and KE counties are recognised;
// another valid country shows its NAME only; an unverifiable country or an unrecognised place shows nothing.
const AR = require('../shared/admin-regions.js');
const locOf = (d) => AR.publicLocation(d);
const regionOf = (d) => { const l = locOf(d); return l && l.region ? l.label : null; };        // region pages / breadcrumbs
const placeOf = (d) => { const l = locOf(d); return l ? l.label : null; };                      // what a page may show
/** Remove what must never be published from free text: GPS pairs, map links, phone numbers, e-mail addresses. */
// [SEO-PRIVACY 2026-11-21 review 2] one shared scrubber (shared/public-text-privacy.js): coordinates, map links, e-mails,
// Tanzanian + international phone numbers, tel:/WhatsApp links — while valid product barcodes, labelled identifiers
// (SKU, IMEI, model…) and amounts after a currency are kept (the previous rule removed every 9-14 digit run).
const PTP = require('../shared/public-text-privacy.js');
const scrubPrivate = (t) => PTP.scrub(t);
const PRIVATE_ATTR = PTP.PRIVATE_ATTR;
const pathOf = (d) => d.collectionName === 'services' ? SP.service(d) : SP.product(d);

// ------------------------------------------------------------------ page shell
const NAV = [['/', 'Fungua SokoHai'], ['/soko/', 'Soko kwa kategoria'], ['/mwongozo/', 'Miongozo'], ['/about.html', 'Kuhusu'], ['/support.html', 'Msaada']];
const FOOT_INFO = [['/about.html', 'About SokoHai'], ['/support.html', 'Help Center'], ['/contact.html', 'Contact & legal requests'], ['/soko/', 'Soko kwa kategoria'], ['/mwongozo/', 'Miongozo ya kununua na kuuza'], ['/washirika.html', 'Washirika na viungo']];
const FOOT_POL = [['/privacy.html', 'Privacy Policy'], ['/terms.html', 'Terms of Service'], ['/cookies.html', 'Cookies & device storage'], ['/refund-policy.html', 'Refunds, cancellations & disputes'], ['/seller-policy.html', 'Seller policy'], ['/community-guidelines.html', 'Community guidelines']];
function shell({ path: p, title, description, h1, kicker, lead, body, crumbs, jsonld, ogImage, ogType, robots, lang }) {
  const canonical = abs(p);
  const ld = [].concat(jsonld || []);
  if (crumbs && crumbs.length) ld.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => Object.assign({ '@type': 'ListItem', position: i + 1, name: c[1] }, c[0] ? { item: abs(c[0]) } : {})) });
  const crumbHtml = crumbs && crumbs.length ? '<nav class="sp-crumbs" aria-label="Breadcrumb"><ol>' + crumbs.map((c, i) => '<li>' + (c[0] && i < crumbs.length - 1 ? '<a href="' + esc(c[0]) + '">' + esc(c[1]) + '</a>' : '<span aria-current="page">' + esc(c[1]) + '</span>') + '</li>').join('') + '</ol></nav>' : '';
  const og = ogImage || abs('/assets/img/sokohai-app-512-v3.png');
  return `<!doctype html>
<html lang="${lang || 'sw'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(clip(description, 158))}">
<meta name="robots" content="${robots || 'index, follow, max-image-preview:large'}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:site_name" content="SokoHai">
<meta property="og:type" content="${ogType || 'website'}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(clip(description, 200))}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(og)}">
<meta property="og:locale" content="sw_TZ">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="/assets/img/sokohai-app-192-v3.png">
<meta name="theme-color" content="#0F7A5C">
<link rel="stylesheet" href="/fonts/inter.css">
<link rel="stylesheet" href="/css/legal-pages.css?v=20261121legal1">
<link rel="stylesheet" href="/css/seo-pages.css?v=20261121seo1">
${ld.map(o => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>').join('\n')}
</head>
<body>
<a class="lp-skip" href="#main">Ruka hadi maudhui</a>
<header class="lp-top"><div class="lp-top-in">
  <a class="lp-brand" href="/soko/" aria-label="SokoHai — soko kwa kategoria"><img src="/assets/img/sokohai-app-192-v3.png" alt="" width="40" height="40"><span class="lp-word"><b>Soko</b><b>Hai</b></span></a>
  <form class="sp-search" action="/" method="get" role="search"><label class="sp-vh" for="spq">Tafuta kwenye SokoHai</label><input id="spq" name="q" type="search" placeholder="Tafuta bidhaa, huduma…" maxlength="100"><button type="submit">Tafuta</button></form>
  <a class="lp-app" href="/">Fungua SokoHai</a>
</div></header>
<div class="lp-hero sp-hero"><div class="lp-hero-in">
  ${crumbHtml}
  ${kicker ? '<span class="lp-kicker">' + esc(kicker) + '</span>' : ''}
  <h1>${esc(h1)}</h1>
  ${lead ? '<p class="lp-lead">' + lead + '</p>' : ''}
</div></div>
<main id="main" class="sp-main">${body}</main>
<footer class="lp-foot"><div class="lp-foot-in">
  <div><b>SokoHai</b><small>Soko la mtandaoni la kununua, kuuza na kugundua · <a href="${ORIGIN}/">${esc(ORIGIN.replace(/^https?:\/\//, ''))}</a><br>Ukurasa huu umetengenezwa kutoka matangazo ya umma tarehe ${TODAY}.</small></div>
  <div><b>Information</b><ul>${FOOT_INFO.map(([h, t]) => '<li><a href="' + h + '">' + esc(t) + '</a></li>').join('')}</ul></div>
  <div><b>Policies</b><ul>${FOOT_POL.map(([h, t]) => '<li><a href="' + h + '">' + esc(t) + '</a></li>').join('')}</ul></div>
</div></footer>
</body>
</html>
`;
}
function card(d) {
  const p = pathOf(d); const im = imagesOf(d)[0]; const reg = placeOf(d);
  return '<li class="sp-card"><a href="' + esc(p) + '">'
    + (im ? '<img src="' + esc(img(im, 400)) + '" alt="' + esc(titleOf(d)) + '" loading="lazy" decoding="async" width="400" height="300">' : '<span class="sp-noimg" aria-hidden="true">SokoHai</span>')
    + '<span class="sp-card-t">' + esc(clip(titleOf(d), 70)) + '</span>'
    + '<span class="sp-card-p">' + esc(money(d.price) || 'Bei kwa makubaliano') + '</span>'
    + (reg ? '<span class="sp-card-l">' + esc(reg) + '</span>' : '')
    + '</a></li>';
}
const grid = (items) => '<ul class="sp-grid">' + items.map(card).join('') + '</ul>';
function itemListLd(items, name) {
  return { '@context': 'https://schema.org', '@type': 'ItemList', name, numberOfItems: items.length,
    itemListElement: items.slice(0, 30).map((d, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(pathOf(d)), name: titleOf(d) })) };
}
function availabilityLd(d) {
  const a = E.availability(d).label;
  if (a === 'in_stock' || a === 'low_stock') return 'https://schema.org/InStock';
  // made to order: Google's accepted availability values have no exact match, so no claim is made
  if (a === 'out_of_stock') return 'https://schema.org/OutOfStock';
  return null;   // stock not confirmed by the seller: no availability claim
}
function conditionLd(d) {
  const c = String(d.condition || '').toLowerCase();
  if (/^(new|mpya)/.test(c)) return 'https://schema.org/NewCondition';
  if (/used|mtumba|imetumika|second/.test(c)) return 'https://schema.org/UsedCondition';
  if (/refurb/.test(c)) return 'https://schema.org/RefurbishedCondition';
  return null;
}
const AVAIL_TEXT = { in_stock: 'Inapatikana', low_stock: 'Zimebaki chache', made_to_order: 'Inatengenezwa kwa oda', out_of_stock: 'Imeisha kwa sasa', stock_unconfirmed: 'Muulize muuzaji kama ipo', available: 'Inapatikana' };

// ------------------------------------------------------------------ builders
// [SEO 2026-11-23] Every page gets its own <title>. Two listings (or two shops) with the same name were identical in
// search results; the first keeps the plain title, the next ones add what tells them apart (shop, then region).
const USED_TITLES = new Set();
function uniqTitle(cands) { const c = cands.filter(Boolean); for (const t of c) if (!USED_TITLES.has(t)) { USED_TITLES.add(t); return t; }
  let i = 2; while (USED_TITLES.has(c[0] + ' (' + i + ')')) i++; const t = c[0] + ' (' + i + ')'; USED_TITLES.add(t); return t; }
function listingPage(d, all, sellers) {
  const p = pathOf(d), t = titleOf(d), isSvc = d.collectionName === 'services';
  const cat = catLabel(d.category), reg = regionOf(d), place = placeOf(d), imgs = imagesOf(d), av = E.availability(d).label;
  const seller = sellers.get(d.userId);
  const crumbs = [['/soko/', 'Soko']];
  if (cat) crumbs.push([SP.category(cat), cat]);
  if (cat && reg && sellersRegionPage.has(SP.category(cat, reg))) crumbs.push([SP.category(cat, reg), reg]);
  crumbs.push([p, clip(t, 60)]);
  const price = money(d.price);
  const descTxt = scrubPrivate(d.description);
  const metaDesc = clip([t, price || '', place || '', descTxt].filter(Boolean).join(' · '), 158);
  const cmp = E.compare(d, all, 8);
  const related = cmp.items.length >= 3 ? cmp.items : all.filter(x => x !== d && x.collectionName === d.collectionName && x.category === d.category && x.userId !== d.userId).slice(0, 8);
  const attrs = [['Chapa', d.brand], ['Modeli', d.model], ['Hali', d.condition], ['Kipimo', d.baseUnit || d.unit], ['Aina', d.subCategory || d.productTypeLabel || d.serviceType || d.specialization]]
    .concat(d.filters && typeof d.filters === 'object' ? Object.entries(d.filters).filter(([k, v]) => typeof v === 'string' && v && k.length < 30 && !PRIVATE_ATTR.test(k)).slice(0, 6) : [])
    .filter(([, v]) => v && String(v).length < 80 && scrubPrivate(v) === String(v).trim());   // [SEO-SAFETY] a value carrying a GPS pair / phone / e-mail is dropped
  const body = '<div class="sp-listing">'
    + '<div class="sp-gallery">' + (imgs.length ? imgs.map((u, i) => '<img src="' + esc(img(u, 800)) + '" alt="' + esc(t + (i ? ' — picha ' + (i + 1) : '')) + '" width="800" height="600"' + (i ? ' loading="lazy"' : ' fetchpriority="high"') + ' decoding="async">').join('') : '<div class="sp-noimg sp-noimg--big" aria-hidden="true">SokoHai</div>') + '</div>'
    + '<div class="sp-info">'
    + '<p class="sp-price">' + esc(price || 'Bei kwa makubaliano') + (isSvc && price ? ' <small>(kuanzia)</small>' : '') + '</p>'
    + (isSvc ? '' : '<p class="sp-avail sp-avail--' + esc(av) + '">' + esc(AVAIL_TEXT[av] || 'Inapatikana') + '</p>')
    + (place ? '<p class="sp-loc">' + (reg ? 'Mkoa' : 'Nchi') + ': ' + esc(place) + '</p>' : '')
    + (seller ? '<p class="sp-seller">Muuzaji: <a href="' + esc(seller.path) + '">' + esc(seller.name) + '</a>' + (seller.verified ? ' <span class="sp-badge">Amethibitishwa</span>' : '') + '</p>' : '')
    + '<p class="sp-cta"><a class="sp-btn" href="/p/' + encodeURIComponent(d.id) + '">Fungua kwenye SokoHai</a><a class="sp-btn sp-btn--ghost" href="/p/' + encodeURIComponent(d.id) + '">Ongea na muuzaji</a></p>'
    + '<p class="sp-note">Malipo hufanyika moja kwa moja kati ya mnunuzi na muuzaji; SokoHai haishikilii pesa kwa sasa. Kagua bidhaa kabla ya kulipa. <a href="/support.html">Ushauri wa usalama</a></p>'
    + '</div></div>'
    + (attrs.length ? '<section class="sp-sec"><h2>Maelezo ya ' + (isSvc ? 'huduma' : 'bidhaa') + '</h2><dl class="sp-attrs">' + attrs.map(([k, v]) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>').join('') + '</dl></section>' : '')
    + (descTxt ? '<section class="sp-sec"><h2>Maelezo kutoka kwa muuzaji</h2><div class="sp-desc">' + esc(clip(descTxt, 3000)).replace(/\n/g, '<br>') + '</div></section>' : '')
    + (cmp.stats ? '<section class="sp-sec"><h2>Linganisha bei kwenye SokoHai</h2><p>Matangazo ' + cmp.stats.count + ' yanayofanana: bei ya chini ' + esc(money(cmp.stats.min)) + ', ya kati ' + esc(money(cmp.stats.median)) + ', ya juu ' + esc(money(cmp.stats.max)) + '. (Kutoka matangazo hai ya SokoHai tarehe ' + TODAY + '.)</p></section>' : '')
    + (related.length ? '<section class="sp-sec"><h2>' + (cmp.items.length >= 3 ? 'Ofa nyingine za bidhaa kama hii' : 'Zinazofanana') + '</h2>' + grid(related) + '</section>' : '');
  const ld = [];
  if (!isSvc && Number(d.price) > 0) {
    const offer = { '@type': 'Offer', url: abs(p), priceCurrency: 'TZS', price: String(Math.round(Number(d.price))) };
    const avl = availabilityLd(d); if (avl) offer.availability = avl;
    const cond = conditionLd(d); if (cond) offer.itemCondition = cond;
    if (seller) offer.seller = { '@type': 'Organization', name: seller.name, url: abs(seller.path) };
    const prod = { '@context': 'https://schema.org', '@type': 'Product', name: clip(t, 150), sku: d.id, url: abs(p), offers: offer };
    if (imgs.length) prod.image = imgs.map(u => img(u, 1200));
    if (descTxt) prod.description = clip(descTxt, 4900);
    if (d.brand) prod.brand = { '@type': 'Brand', name: clip(d.brand, 60) };
    if (cat) prod.category = cat;
    ld.push(prod);
  }
  // [SEO 2026-11-23] a service listing is described as a Service: only fields the listing has (no rating, no area
  // served that the provider did not state); the price is an Offer only when the provider set one
  if (isSvc) {
    const svc = { '@context': 'https://schema.org', '@type': 'Service', name: clip(t, 150), url: abs(p) };
    if (cat) svc.serviceType = cat;
    if (descTxt) svc.description = clip(descTxt, 4900);
    if (imgs.length) svc.image = imgs.map(u => img(u, 1200));
    if (seller) svc.provider = { '@type': 'Organization', name: seller.name, url: abs(seller.path) };
    if (Number(d.price) > 0) svc.offers = { '@type': 'Offer', url: abs(p), priceSpecification: { '@type': 'PriceSpecification', priceCurrency: 'TZS', minPrice: String(Math.round(Number(d.price))) } };   // shown as "kuanzia" (from)
    ld.push(svc);
  }
  const title = uniqTitle([clip(t, 52) + (price ? ' — ' + price : '') + ' | SokoHai',
    seller && seller.name ? clip(t, 40) + ' — ' + clip(seller.name, 24) + ' | SokoHai' : '',
    reg ? clip(t, 40) + ' — ' + reg + (seller && seller.name ? ' · ' + clip(seller.name, 20) : '') + ' | SokoHai' : '']);
  return shell({ path: p, title, description: metaDesc, h1: t, kicker: isSvc ? 'Huduma' : (cat || 'Bidhaa'),
    lead: '', body, crumbs, jsonld: ld, ogImage: imgs[0] ? img(imgs[0], 1200) : null, ogType: isSvc ? 'website' : 'product' });
}
function listPage({ p, title, h1, kicker, lead, items, crumbs, extra, pageNo, pages, baseP }) {
  const pager = pages > 1 ? '<nav class="sp-pager" aria-label="Kurasa">' + Array.from({ length: pages }, (_, i) => {
    const u = i === 0 ? baseP : baseP + 'ukurasa-' + (i + 1) + '/';
    return i + 1 === pageNo ? '<span aria-current="page">' + (i + 1) + '</span>' : '<a href="' + u + '">' + (i + 1) + '</a>';
  }).join('') + '</nav>' : '';
  const body = (extra || '') + grid(items) + pager;
  return shell({ path: p, title: title + (pageNo > 1 ? ' — ukurasa ' + pageNo : ''), description: clip(lead.replace(/<[^>]+>/g, ''), 158), h1, kicker, lead,
    body, crumbs, jsonld: [itemListLd(items, h1)] });
}
function paged(items, baseP, fn, group) {
  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  for (let i = 0; i < pages; i++) {
    const p = i === 0 ? baseP : baseP + 'ukurasa-' + (i + 1) + '/';
    write(p.replace(/^\//, '') + 'index.html', fn(p, items.slice(i * PER_PAGE, (i + 1) * PER_PAGE), i + 1, pages));
    urls.push({ loc: abs(p), lastmod: items.slice(i * PER_PAGE, (i + 1) * PER_PAGE).reduce((m, d) => Math.max(m, ts(d.updatedAt || d.createdAt)), 0), group: group || 'categories' });
  }
}
const urls = [];          // { loc, lastmod(ms|day string), images? }
const sellersRegionPage = new Set();

// ------------------------------------------------------------------ main
let listings = [], source = 'offline', fetchError = null;
if (!OFFLINE) {
  try {
    const [p, s] = await Promise.all([fetchCollection('products'), fetchCollection('services')]);
    listings = p.concat(s); source = EMU ? 'emulator' : 'firestore';
  } catch (e) {
    fetchError = String(e && e.message || e);
    if (STRICT) {   // [SEO-SAFETY] never publish a production sitemap without its listings: fail -> Netlify keeps the last good deploy
      console.error('[seo] FATAL (production): listing data could not be read — build stopped, nothing written. ' + fetchError);
      process.exit(1);
    }
    console.warn('[seo] listing data unavailable — static pages only (non-production run):', fetchError);
  }
}
const raw = listings.length;
listings = listings.filter(publicListing);
// [SEO-PRIVACY 2026-11-21 review] names are public text too: a phone number / e-mail / coordinates typed into a title or a
// shop name is removed before it can reach a page, a URL slug, a sitemap or JSON-LD
for (const d of listings) for (const k of ['title', 'name', 'serviceTitle', 'serviceName', 'storeName', 'businessName', 'sellerName', 'providerName', 'ownerName'])
  if (typeof d[k] === 'string') d[k] = scrubPrivate(d[k]);
if (STRICT && listings.length < MIN_LISTINGS) {   // optional owner-set floor (default 0 = an empty catalogue is valid)
  console.error('[seo] FATAL (production): ' + listings.length + ' public listings, fewer than the required ' + MIN_LISTINGS + ' — build stopped, nothing written.');
  process.exit(1);
}
// one page per listing; duplicates (same seller + title + price) collapse to the best-ranked one
const ranked = E.rank(listings, '', { now: NOW.getTime() }).results.filter(r => !r.sponsored).map(r => r.item);
listings = ranked;

// sellers (public name + listings only)
const sellers = new Map();
listings.forEach(d => {
  if (!d.userId || !SP.safeId(d.userId)) return;
  const s = sellers.get(d.userId) || { uid: d.userId, name: '', items: [], verified: false, regions: {} };
  if (!s.name) s.name = sellerNameOf(d);
  s.items.push(d); if (d.verified === true || d.sellerVerified === true || d.ownerVerified === true || d.isVerified === true || d.providerVerified === true) s.verified = true;   // server-owned flags only
  const r = regionOf(d); if (r) s.regions[r] = (s.regions[r] || 0) + 1;
  sellers.set(d.userId, s);
});
for (const s of sellers.values()) { if (!s.name) s.name = 'Muuzaji wa SokoHai'; s.path = SP.seller(s.name, s.uid); }

// categories and category × region
const byCat = new Map();
listings.filter(d => d.collectionName === 'products' && catLabel(d.category)).forEach(d => { const k = catLabel(d.category); (byCat.get(k) || byCat.set(k, []).get(k)).push(d); });
const byCatRegion = new Map();
for (const [c, items] of byCat) items.forEach(d => { const r = regionOf(d); if (!r) return; const k = c + '|' + r; (byCatRegion.get(k) || byCatRegion.set(k, []).get(k)).push(d); });
for (const [k, items] of byCatRegion) if (items.length >= MIN_LIST) { const [c, r] = k.split('|'); sellersRegionPage.add(SP.category(c, r)); }
const byBrand = new Map();
listings.filter(d => d.brand && d.collectionName === 'products').forEach(d => { const b = String(d.brand).trim(); const k = SP.slugify(b, 40); if (!k) return; const e = byBrand.get(k) || byBrand.set(k, { name: b, items: [] }).get(k); e.items.push(d); });
const services = listings.filter(d => d.collectionName === 'services');

// listing pages
listings.forEach(d => {
  const p = pathOf(d); if (!p) return;
  write(p.replace(/^\//, '') + 'index.html', listingPage(d, listings, sellers));
  urls.push({ loc: abs(p), lastmod: ts(d.updatedAt || d.createdAt), images: imagesOf(d).slice(0, 3).map(u => img(u, 1200)), group: 'listings' });
});
// seller pages
for (const s of sellers.values()) {
  const regs = Object.keys(s.regions).sort((a, b) => s.regions[b] - s.regions[a]);
  const sTitle = uniqTitle([s.name + ' — duka kwenye SokoHai', regs.length ? s.name + ' — duka, ' + regs[0] + ' | SokoHai' : '']);
  paged(s.items, s.path, (p, items, n, pages) => listPage({ p, baseP: s.path, pageNo: n, pages, items, title: sTitle, h1: s.name, kicker: 'Duka',
    lead: esc(s.name) + ' ana matangazo ' + s.items.length + ' hai kwenye SokoHai' + (regs.length ? ', ' + esc(regs.slice(0, 3).join(', ')) : '') + '. Wasiliana kupitia chat ya SokoHai.',
    crumbs: [['/soko/', 'Soko'], [s.path, s.name]], extra: s.verified ? '<p class="sp-badge-line"><span class="sp-badge">Muuzaji amethibitishwa na SokoHai</span></p>' : '' }), 'sellers');
}
// categories
const catEntries = [...byCat.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [c, items] of catEntries) {
  const base = SP.category(c);
  const regs = [...byCatRegion.entries()].filter(([k, v]) => k.startsWith(c + '|') && v.length >= MIN_LIST).map(([k, v]) => [k.split('|')[1], v.length]).sort((a, b) => b[1] - a[1]);
  const extra = regs.length ? '<nav class="sp-chips" aria-label="Kwa mkoa">' + regs.map(([r, n]) => '<a href="' + SP.category(c, r) + '">' + esc(r) + ' <small>' + n + '</small></a>').join('') + '</nav>' : '';
  paged(items, base, (p, its, n, pages) => listPage({ p, baseP: base, pageNo: n, pages, items: its, title: c + ' — nunua na uza mtandaoni | SokoHai', h1: c, kicker: 'Kategoria',
    lead: 'Matangazo ' + items.length + ' hai ya ' + esc(c) + ' kutoka kwa wauzaji wa SokoHai. Linganisha bei na eneo, kisha ongea na muuzaji.', crumbs: [['/soko/', 'Soko'], [base, c]], extra }));
}
for (const [k, items] of byCatRegion) {
  if (items.length < MIN_LIST) continue;
  const [c, r] = k.split('|'); const base = SP.category(c, r);
  paged(items, base, (p, its, n, pages) => listPage({ p, baseP: base, pageNo: n, pages, items: its, title: c + ' ' + r + ' | SokoHai', h1: c + ' — ' + r, kicker: 'Kategoria kwa mkoa',
    lead: 'Matangazo ' + items.length + ' ya ' + esc(c) + ' yaliyo ' + esc(r) + ' kwenye SokoHai.', crumbs: [['/soko/', 'Soko'], [SP.category(c), c], [base, r]] }));
}
const brandEntries = [...byBrand.values()].filter(b => b.items.length >= MIN_LIST).sort((a, b) => b.items.length - a.items.length);
for (const b of brandEntries) {
  const base = SP.brand(b.name);
  paged(b.items, base, (p, its, n, pages) => listPage({ p, baseP: base, pageNo: n, pages, items: its, title: b.name + ' — bidhaa kwenye SokoHai', h1: b.name, kicker: 'Chapa',
    lead: 'Matangazo ' + b.items.length + ' ya bidhaa za ' + esc(b.name) + ' kutoka kwa wauzaji tofauti wa SokoHai. SokoHai si msambazaji rasmi wa chapa hii.', crumbs: [['/soko/', 'Soko'], [base, b.name]] }));
}
// [LOCAL SEO 2026-11-22] region hubs /soko/mkoa/<region>/ — only for a VERIFIED region (countryCode + recognised region,
// shared/admin-regions.js) with at least MIN_LIST public listings, so no empty or near-duplicate city pages are created.
// Links to the category × region pages of that region. Skipped if a category would own the /soko/mkoa/ path.
const byRegion = new Map();
listings.forEach(d => { const r = regionOf(d); if (!r) return; (byRegion.get(r) || byRegion.set(r, []).get(r)).push(d); });
const regionEntries = [...byRegion.entries()].filter(([, v]) => v.length >= MIN_LIST).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
const regionPathFree = ![...byCat.keys()].some(c => SP.slugify(c) === 'mkoa');
if (regionPathFree) for (const [r, items] of regionEntries) {
  const base = SP.region(r); if (!base) continue;
  const nP = items.filter(d => d.collectionName === 'products').length, nS = items.filter(d => d.collectionName === 'services').length;
  const cats = [...byCatRegion.entries()].filter(([k, v]) => k.endsWith('|' + r) && v.length >= MIN_LIST).map(([k, v]) => [k.split('|')[0], v.length]).sort((a, b) => b[1] - a[1]);
  const sellersHere = new Set(items.map(d => d.userId).filter(Boolean)).size;
  const extra = cats.length ? '<nav class="sp-chips" aria-label="Kategoria ' + esc(r) + '">' + cats.map(([c, n]) => '<a href="' + SP.category(c, r) + '">' + esc(c) + ' <small>' + n + '</small></a>').join('') + '</nav>' : '';
  const parts = [nP ? 'bidhaa ' + nP : '', nS ? 'huduma ' + nS : ''].filter(Boolean).join(' na ');
  paged(items, base, (p, its, n, pages) => listPage({ p, baseP: base, pageNo: n, pages, items: its, title: r + ' — nunua na uza bidhaa na huduma | SokoHai', h1: 'Soko la ' + r, kicker: 'Mkoa',
    lead: 'Matangazo ya umma ' + items.length + ' (' + parts + ') kutoka kwa wauzaji ' + sellersHere + ' wa SokoHai walioko ' + esc(r) + '. Linganisha bei, kisha ongea na muuzaji kupitia SokoHai.',
    crumbs: [['/soko/', 'Soko'], [base, r]], extra }));
}
if (services.length >= MIN_LIST) {
  paged(services, '/soko/huduma/', (p, its, n, pages) => listPage({ p, baseP: '/soko/huduma/', pageNo: n, pages, items: its, title: 'Huduma — mafundi na watoa huduma | SokoHai', h1: 'Huduma', kicker: 'Huduma',
    lead: 'Watoa huduma ' + services.length + ' kwenye SokoHai: mafundi, usafi, ubunifu na zaidi.', crumbs: [['/soko/', 'Soko'], ['/soko/huduma/', 'Huduma']] }));
}
// hub /soko/
{
  const recent = listings.slice().sort((a, b) => ts(b.createdAt || b.timestamp) - ts(a.createdAt || a.timestamp)).slice(0, 12);
  const body = (catEntries.length ? '<section class="sp-sec"><h2>Kategoria</h2><ul class="sp-cats">' + catEntries.map(([c, it]) => '<li><a href="' + SP.category(c) + '">' + esc(c) + ' <small>' + it.length + '</small></a></li>').join('')
      + (services.length >= MIN_LIST ? '<li><a href="/soko/huduma/">Huduma <small>' + services.length + '</small></a></li>' : '') + '</ul></section>' : '<p class="sp-empty">Matangazo ya umma yataonekana hapa yakishachapishwa. <a href="/">Fungua SokoHai</a></p>')
    + (regionPathFree && regionEntries.length ? '<section class="sp-sec"><h2>Kwa mkoa</h2><nav class="sp-chips" aria-label="Kwa mkoa">' + regionEntries.map(([r, it]) => '<a href="' + SP.region(r) + '">' + esc(r) + ' <small>' + it.length + '</small></a>').join('') + '</nav></section>' : '')
    + (brandEntries.length ? '<section class="sp-sec"><h2>Chapa</h2><nav class="sp-chips">' + brandEntries.slice(0, 40).map(b => '<a href="' + SP.brand(b.name) + '">' + esc(b.name) + ' <small>' + b.items.length + '</small></a>').join('') + '</nav></section>' : '')
    + (recent.length ? '<section class="sp-sec"><h2>Zilizoongezwa karibuni</h2>' + grid(recent) + '</section>' : '')
    + '<section class="sp-sec"><h2>Miongozo</h2><ul class="sp-cats">' + GUIDES.map(g => '<li><a href="/mwongozo/' + g.slug + '/">' + esc(g.title) + '</a></li>').join('') + '</ul></section>';
  write('soko/index.html', shell({ path: '/soko/', title: 'Soko la SokoHai — bidhaa, huduma na wauzaji', description: 'Vinjari matangazo ya umma ya SokoHai kwa kategoria, eneo na chapa: bidhaa, huduma, usafiri na wauzaji.',
    h1: 'Soko kwa kategoria', kicker: 'SokoHai', lead: 'Matangazo ya umma ya SokoHai yaliyopangwa kwa kategoria, mkoa na chapa.', body, crumbs: [['/soko/', 'Soko']],
    jsonld: recent.length ? [itemListLd(recent, 'Zilizoongezwa karibuni')] : [] }));
  urls.push({ loc: abs('/soko/'), lastmod: TODAY, group: 'pages' });
}
// guides
for (const g of GUIDES) {
  const p = '/mwongozo/' + g.slug + '/';
  const rel = g.query ? E.rank(listings.filter(d => !g.kind || d.collectionName === g.kind), g.query, { now: NOW.getTime() }).results.filter(r => !r.sponsored).map(r => r.item).slice(0, 8) : [];
  const body = '<article class="sp-article">' + g.sections.map(([h, b]) => '<section class="sp-sec"><h2>' + esc(h) + '</h2>' + b + '</section>').join('')
    + (rel.length ? '<section class="sp-sec"><h2>Matangazo yanayohusiana</h2>' + grid(rel) + '</section>' : '') + '</article>';
  write(p.slice(1) + 'index.html', shell({ path: p, title: g.title + ' | SokoHai', description: g.description, h1: g.title, kicker: 'Mwongozo', lead: esc(g.description), body,
    crumbs: [['/mwongozo/', 'Miongozo'], [p, g.title]], ogType: 'article',
    jsonld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.description, inLanguage: 'sw', dateModified: TODAY, author: { '@type': 'Organization', name: 'SokoHai', url: ORIGIN + '/' }, publisher: { '@type': 'Organization', name: 'SokoHai', logo: { '@type': 'ImageObject', url: abs('/assets/img/sokohai-app-512-v3.png') } }, mainEntityOfPage: abs(p) }] }));
  urls.push({ loc: abs(p), lastmod: TODAY, group: 'pages' });
}
write('mwongozo/index.html', shell({ path: '/mwongozo/', title: 'Miongozo ya kununua na kuuza | SokoHai', description: 'Miongozo ya vitendo ya kununua kwa usalama, kuchagua mafundi na kuandaa matangazo bora kwenye SokoHai.',
  h1: 'Miongozo', kicker: 'SokoHai', lead: 'Ushauri wa vitendo kwa wanunuzi na wauzaji.', crumbs: [['/mwongozo/', 'Miongozo']],
  body: '<ul class="sp-guides">' + GUIDES.map(g => '<li><a href="/mwongozo/' + g.slug + '/"><b>' + esc(g.title) + '</b><span>' + esc(g.description) + '</span></a></li>').join('') + '</ul>' }));
urls.push({ loc: abs('/mwongozo/'), lastmod: TODAY, group: 'pages' });
// partners
write('washirika.html', shell({ path: '/washirika.html', title: PARTNERS_PAGE.title + ' | SokoHai', description: PARTNERS_PAGE.description, h1: PARTNERS_PAGE.title, kicker: 'Washirika', lead: esc(PARTNERS_PAGE.description),
  body: '<article class="sp-article">' + PARTNERS_PAGE.sections.map(([h, b]) => '<section class="sp-sec"><h2>' + esc(h) + '</h2>' + b + '</section>').join('') + '</article>' }));
urls.push({ loc: abs('/washirika.html'), lastmod: TODAY, group: 'pages' });
// 404
write('404.html', shell({ path: '/404.html', title: 'Ukurasa haukupatikana | SokoHai', description: 'Ukurasa huu haupo au tangazo limeondolewa.', h1: 'Ukurasa haukupatikana', kicker: '404', robots: 'noindex, follow',
  lead: 'Tangazo hili huenda limeuzwa, limeondolewa au kiungo kimekosewa.', body: '<p class="sp-cta"><a class="sp-btn" href="/">Fungua SokoHai</a><a class="sp-btn sp-btn--ghost" href="/soko/">Vinjari soko</a></p>' }));

// static app + information pages
const STATIC = [['/', TODAY], ['/about.html'], ['/support.html'], ['/contact.html'], ['/privacy.html'], ['/terms.html'], ['/cookies.html'], ['/refund-policy.html'], ['/seller-policy.html'], ['/community-guidelines.html']];
STATIC.forEach(([p]) => urls.push({ loc: abs(p), lastmod: TODAY, group: 'pages' }));

// ------------------------------------------------------------------ sitemaps + robots
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lm = (v) => typeof v === 'string' ? v : (v ? new Date(v).toISOString().slice(0, 10) : TODAY);
function urlset(list) {
  const imgNs = list.some(u => u.images && u.images.length);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"' + (imgNs ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : '') + '>\n'
    + list.map(u => '  <url><loc>' + xmlEsc(u.loc) + '</loc><lastmod>' + lm(u.lastmod) + '</lastmod>' + (u.images || []).map(i => '<image:image><image:loc>' + xmlEsc(i) + '</image:loc></image:image>').join('') + '</url>').join('\n') + '\n</urlset>\n';
}
const seen = new Set(); const uniq = urls.filter(u => !seen.has(u.loc) && seen.add(u.loc));
const groups = { pages: [], listings: [], sellers: [], categories: [] };
uniq.forEach(u => (groups[u.group] || groups.categories).push(u));
const maps = [];
const CHUNK = 40000;
for (const [g, list] of Object.entries(groups)) {
  if (!list.length) continue;
  for (let i = 0; i < list.length; i += CHUNK) {
    const name = 'sitemap-' + g + (list.length > CHUNK ? '-' + (i / CHUNK + 1) : '') + '.xml';
    write(name, urlset(list.slice(i, i + CHUNK))); maps.push(name);
  }
}
write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + maps.map(m => '  <sitemap><loc>' + abs('/' + m) + '</loc><lastmod>' + TODAY + '</lastmod></sitemap>').join('\n') + '\n</sitemapindex>\n');
const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
write('robots.txt', robots);

const report = { source, strict: STRICT, fetchError, rawListings: raw, publicListings: listings.length, sellers: sellers.size, categories: catEntries.length,
  categoryRegions: sellersRegionPage.size, brands: brandEntries.length, guides: GUIDES.length, sitemapUrls: uniq.length, files: written.length, origin: ORIGIN, date: TODAY };
console.log('[seo] ' + JSON.stringify(report));
if (args.includes('--report')) fs.writeFileSync(arg('--report'), JSON.stringify(report, null, 2));
