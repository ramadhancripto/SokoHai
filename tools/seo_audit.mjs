#!/usr/bin/env node
/* [SEO 2026-11-23] Audit of the built site (dist/ after build_dist + build_seo). Read-only; prints a JSON report and
 * exits 1 when an error is found. Checks every public HTML page: one <title> (unique), meta description (unique,
 * 50-170 chars), absolute https canonical on the canonical origin, robots meta, exactly one <h1>, alt on every <img>,
 * valid JSON-LD (@type list; Product needs offers.price + priceCurrency, no aggregateRating/review), internal links
 * that resolve to a built page or an SPA route, sitemap URLs that exist and are not noindex, robots.txt rules, and
 * Tanzania-only positioning on site-wide copy (warning).
 *   node tools/seo_audit.mjs [--dir dist] [--json out.json]  */
import fs from 'node:fs'; import path from 'node:path';
const args = process.argv.slice(2); const arg = (k, d) => { const i = args.indexOf(k); return i !== -1 ? args[i + 1] : d; };
const DIR = path.resolve(arg('--dir', 'dist')); const ORIGIN = 'https://sokohai.com';
// SPA_DEEP: app deep links (/p/<id> ...), served by the SPA fallback (200)
const SPA = new Set(['/', '/index.html']); const SPA_DEEP = /^\/(p|s|d|post)\/[^/]+$/; const PRIVATE = /^\/(admin|functions|__fn)\b/;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => { const p = path.join(d, e.name); if (e.isDirectory()) return /^(js|css|assets|fonts|shared|html|node_modules)$/.test(e.name) && d === DIR ? [] : walk(p); return e.name.endsWith('.html') ? [p] : []; });
const pages = walk(DIR).filter(f => !/[\\/](admin)[\\/]/.test(f));
const urlOf = (f) => { let u = '/' + path.relative(DIR, f).split(path.sep).join('/'); return u.replace(/index\.html$/, ''); };
const exists = (u) => { u = u.split('#')[0].split('?')[0]; if (!u || u === '/') return true; const p = path.join(DIR, decodeURIComponent(u)); return fs.existsSync(p) && (fs.statSync(p).isFile() || fs.existsSync(path.join(p, 'index.html'))); };
const err = [], warn = [], titles = new Map(), descs = new Map(), types = {}; let n = 0, imgs = 0, links = 0;
for (const f of pages) {
  const h = fs.readFileSync(f, 'utf8'), u = urlOf(f); n++;
  const g = (re) => (re.exec(h) || [])[1];
  const title = g(/<title>([^<]*)<\/title>/i), desc = g(/<meta name="description" content="([^"]*)"/i), canon = g(/<link rel="canonical"[^>]*href="([^"]+)"/i);
  const robots = g(/<meta name="robots" content="([^"]+)"/i) || '';
  const noindex = /noindex/.test(robots);
  if (noindex) { types.__noindexPages = (types.__noindexPages || 0) + 1; continue; }   // not for search results: only checked for staying out of the sitemap
  if (!title) err.push([u, 'no <title>']); else { (titles.get(title) || titles.set(title, []).get(title)).push(u); if (title.length > 70) warn.push([u, 'title > 70 chars (' + title.length + ')']); }
  if (!desc) err.push([u, 'no meta description']); else { (descs.get(desc) || descs.set(desc, []).get(desc)).push(u); if (desc.length < 50 || desc.length > 170) warn.push([u, 'description length ' + desc.length]); }
  if (!canon) { if (!noindex) err.push([u, 'no canonical']); } else if (!canon.startsWith(ORIGIN + '/')) err.push([u, 'canonical not on ' + ORIGIN + ': ' + canon]);
  const h1 = (h.match(/<h1[\s>]/gi) || []).length; if (!noindex && h1 !== 1) err.push([u, h1 + ' <h1>']);
  for (const m of h.matchAll(/<img\b[^>]*>/gi)) { imgs++; if (!/\balt="/i.test(m[0])) err.push([u, 'img without alt']); }
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1]); } catch (e) { err.push([u, 'invalid JSON-LD']); continue; }
    const items = j['@graph'] || (Array.isArray(j) ? j : [j]);
    for (const it of items) { const t = [].concat(it['@type'] || '?').join('+'); types[t] = (types[t] || 0) + 1;
      if (/Product/.test(t)) { const o = [].concat(it.offers || [])[0]; if (!o || o.price == null || !o.priceCurrency) err.push([u, 'Product without offers.price/priceCurrency']); }
      if (/^Service$/.test(t) && (!it.name || !it.url)) err.push([u, 'Service without name/url']);
      if (it.aggregateRating || it.review) err.push([u, t + ' publishes ratings/reviews']); }
  }
  for (const m of h.matchAll(/<a\b[^>]*href="([^"]+)"/gi)) { const href = m[1]; if (!href.startsWith('/') && !href.startsWith(ORIGIN)) continue; links++;
    const p = href.startsWith(ORIGIN) ? href.slice(ORIGIN.length) || '/' : href; if (SPA.has(p.split('?')[0]) || SPA_DEEP.test(p.split('?')[0]) || PRIVATE.test(p)) continue; if (!exists(p)) err.push([u, 'broken internal link ' + href]); }
  if (!noindex && /Tanzania['’]s online market|soko la mtandaoni la Tanzania/i.test(h)) warn.push([u, 'Tanzania-only positioning']);
}
for (const [t, us] of titles) if (us.length > 1) err.push([us.join(', '), 'duplicate title: ' + t]);
for (const [d, us] of descs) if (us.length > 1) warn.push([us.join(', '), 'duplicate description']);
// sitemap
const sm = []; const readSm = (f) => { const x = fs.readFileSync(path.join(DIR, f), 'utf8'); for (const m of x.matchAll(/<loc>([^<]+)<\/loc>/g)) { if (m[1].endsWith('.xml')) readSm(m[1].slice(ORIGIN.length + 1)); else sm.push(m[1]); } };
if (fs.existsSync(path.join(DIR, 'sitemap.xml'))) readSm('sitemap.xml'); else err.push(['/sitemap.xml', 'missing']);
for (const s of sm) { const p = s.slice(ORIGIN.length) || '/'; if (!s.startsWith(ORIGIN)) err.push([s, 'sitemap URL off-origin']); else if (!exists(p)) err.push([s, 'sitemap URL has no page']); else { const f = p === '/' ? path.join(DIR, 'index.html') : path.join(DIR, p, p.endsWith('/') ? 'index.html' : ''); try { if (/noindex/.test(fs.readFileSync(fs.statSync(f).isDirectory() ? path.join(f, 'index.html') : f, 'utf8').slice(0, 4000))) err.push([s, 'noindex page in sitemap']); } catch (e) {} } }
const robots = fs.existsSync(path.join(DIR, 'robots.txt')) ? fs.readFileSync(path.join(DIR, 'robots.txt'), 'utf8') : '';
if (!/Sitemap: https:\/\/sokohai\.com\/sitemap\.xml/.test(robots)) err.push(['/robots.txt', 'no Sitemap line']);
for (const pub of ['/bidhaa/', '/huduma/', '/duka/', '/soko/', '/mwongozo/']) if (new RegExp('^Disallow: ' + pub.replace(/\//g, '\\/') + '\\s*$', 'm').test(robots)) err.push(['/robots.txt', 'blocks public ' + pub]);
const report = { dir: DIR, pages: n, images: imgs, internalLinks: links, sitemapUrls: sm.length, jsonLdTypes: types, errors: err.length, warnings: warn.length, errorList: err.slice(0, 50), warningList: warn.slice(0, 50) };
const out = arg('--json', null); if (out) fs.writeFileSync(out, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1)); process.exit(err.length ? 1 : 0);
