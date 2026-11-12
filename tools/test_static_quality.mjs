/**
 * SokoHai — 85%-PUSH: ubora tuli (SEO + ufikivu + headers + CI).
 * Endesha: node tools/test_static_quality.mjs
 *
 * KINACHOTHIBITISHWA (static pekee — hakuna browser, hakuna mtandao):
 *  SEO: canonical absolute, favicon halisi, manifest imeunganishwa,
 *       JSON-LD (Organization+WebSite), robots.txt bila <DOMAIN>,
 *       theme-color, preconnect (gstatic + firestore).
 *  A11Y: aria-label kwenye inputs 3, hakuna button tupu, hakuna img bila alt,
 *        contrast >= 4.5:1 kwenye rangi 2 zilizorekebishwa.
 *  SEC/OPS: HSTS + build --minify kwenye netlify.toml, headers 5 kwenye
 *        firebase.json, CI workflow ipo na inaita majaribio + build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function t(name, cond, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; failures.push(name); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}

/* ---------- msaidizi: contrast ratio (WCAG) ---------- */
function lum(hex) {
    const c = hex.replace('#', '');
    const f = (i) => {
        const v = parseInt(c.slice(i, i + 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(0) + 0.7152 * f(2) + 0.0722 * f(4);
}
function ratio(a, b) {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* ---------- SEO ---------- */
{
    const head = read('html/00-head.html');
    t('SEO: canonical ni absolute https',
        /<link rel="canonical"[^>]*href="https:\/\/[^"]+"/.test(head));
    t('SEO: favicon si data:, (brand mark)',
        head.includes('rel="icon" type="image/png" href="assets/sokohai-s-mark.png"'));
    t('SEO: manifest imeunganishwa kwenye <head>',
        head.includes('<link rel="manifest" href="sokohai-manifest.json">'));
    t('SEO: theme-color ipo', head.includes('name="theme-color"'));
    t('SEO: apple-touch-icon ipo', head.includes('rel="apple-touch-icon"'));
    let ldOk = false, ldTypes = '';
    const m = head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (m) {
        try {
            const ld = JSON.parse(m[1]);
            const types = (ld['@graph'] || []).map((g) => g['@type']);
            ldTypes = types.join(',');
            ldOk = types.includes('Organization') && types.includes('WebSite');
        } catch (e) { ldTypes = 'JSON imevunjika'; }
    }
    t('SEO: JSON-LD ina Organization + WebSite', ldOk, ldTypes);
    t('SEO: preconnect gstatic', head.includes('rel="preconnect" href="https://www.gstatic.com"'));
    t('SEO: preconnect firestore', head.includes('rel="preconnect" href="https://firestore.googleapis.com"'));

    const robots = read('robots.txt');
    t('SEO: robots.txt haina <DOMAIN>', !robots.includes('<DOMAIN>'));
    t('SEO: robots.txt ina Sitemap halisi',
        robots.includes('Sitemap: https://sokohaicom.netlify.app/sitemap.xml'));

    const manifest = JSON.parse(read('sokohai-manifest.json'));
    t('SEO: manifest icons zipo kwenye repo',
        (manifest.icons || []).every((ic) => fs.existsSync(path.join(ROOT, ic.src))));
}

/* ---------- A11Y ---------- */
{
    const topnav = read('html/16-topnav.html');
    t('A11Y: searchInput ina aria-label', /id="searchInput"[^>]*aria-label=|aria-label=[^>]*id="searchInput"/.test(topnav) ||
        (topnav.includes('id="searchInput"') && /<input[^>]*id="searchInput"[^>]*>/.test(topnav) && /<input[^>]*id="searchInput"[^>]*aria-label="[^"]+"/.test(topnav)));
    t('A11Y: regionFilterSelect ina aria-label',
        /<select[^>]*id="regionFilterSelect"[^>]*aria-label="[^"]+"/.test(topnav));
    const vd = read('js/app/71-visual-dictionary.js');
    t('A11Y: skhKQ ina aria-label', vd.includes("id=\"skhKQ\"") && vd.includes('aria-label='));

    // Hakuna button tupu (bila maandishi, aria-label, title, au data-i18n).
    let emptyBtn = 0;
    let imgNoAlt = 0;
    for (const f of fs.readdirSync(path.join(ROOT, 'html')).filter((f) => f.endsWith('.html'))) {
        const s = read('html/' + f);
        for (const m of s.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
            const text = m[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
            if (!text && !/aria-label=|aria-labelledby=|title=|data-i18n=/.test(m[1])) emptyBtn++;
        }
        for (const m of s.matchAll(/<img\b([^>]*)>/gi)) {
            if (!/\balt=/.test(m[1])) imgNoAlt++;
        }
    }
    t('A11Y: hakuna <button> tupu (html/)', emptyBtn === 0, emptyBtn + ' zimebaki');
    t('A11Y: hakuna <img> bila alt (html/)', imgNoAlt === 0, imgNoAlt + ' zimebaki');

    // Contrast: .cps-more hutumia green-dark; .shc-pill bg #0A6B3E.
    const cps = read('css/58-category-photo-strip.css');
    const tokens = read('css/00-tokens.css');
    const dark = (tokens.match(/--sokohai-green-dark:\s*(#[0-9A-Fa-f]{6})/) || [])[1] || '';
    t('A11Y: .cps-more hutumia green-dark (siyo green)',
        cps.includes('color: var(--sokohai-green-dark)'));
    t('A11Y: contrast green-dark/nyeupe >= 4.5',
        dark && ratio(dark, '#FFFFFF') >= 4.5, dark + ' = ' + (dark ? ratio(dark, '#FFFFFF').toFixed(2) : '?'));
    const hl = read('css/66-home-layout.css');
    const pill = (hl.match(/\.shc-pill\s*\{[^}]*background:\s*(#[0-9A-Fa-f]{6})/) || [])[1] || '';
    t('A11Y: contrast nyeupe/pill-bg >= 4.5',
        pill && ratio('#FFFFFF', pill) >= 4.5, pill + ' = ' + (pill ? ratio('#FFFFFF', pill).toFixed(2) : '?'));
}

/* ---------- SEC / OPS ---------- */
{
    const netlify = read('netlify.toml');
    t('SEC: netlify.toml ina HSTS', netlify.includes('Strict-Transport-Security'));
    t('SEC: netlify.toml build ina --minify --check',
        netlify.includes('build_dist.mjs --minify --check'));
    for (const h of ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy']) {
        t('SEC: netlify.toml ina ' + h, netlify.includes(h));
    }
    const sec = read('.well-known/security.txt');
    t('SEC: security.txt ina Contact', /^Contact: https?:\/\//m.test(sec));
    t('SEC: security.txt ina Expires', /^Expires: 20\d\d-/m.test(sec));
    t('SEC: build_dist inanakili security.txt', read('tools/build_dist.mjs').includes('.well-known/security.txt'));

    const fb = JSON.parse(read('firebase.json'));
    const allH = (fb.hosting.headers || []).flatMap((h) => (h.headers || []).map((x) => x.key));
    t('SEC: firebase.json headers >= 5', allH.length >= 5, allH.length + ' headers');
    t('SEC: firebase.json ina HSTS', allH.includes('Strict-Transport-Security'));

    const ci = read('.github/workflows/ci.yml');
    t('OPS: CI inaita npm test', ci.includes('npm test'));
    t('OPS: CI inaita build_dist --minify --check', ci.includes('build_dist.mjs --minify --check'));
    t('OPS: CI inaita build_html.py check', ci.includes('build_html.py check'));
    t('OPS: dependabot.yml ipo', fs.existsSync(path.join(ROOT, '.github/dependabot.yml')));

    const pkg = JSON.parse(read('package.json'));
    t('OPS: acorn kwenye dependencies (build ya Netlify)', !!(pkg.dependencies || {}).acorn);
    const lock = JSON.parse(read('package-lock.json'));
    t('OPS: lockfile ina acorn', !!(lock.packages || {})['node_modules/acorn']);
}

console.log(`\nSTATIC QUALITY (SEO+A11Y+SEC+OPS): ${pass} passed, ${fail} failed`);
if (fail) console.log('KUSHINDWA: ' + failures.join(' | '));
process.exit(fail ? 1 : 0);
