#!/usr/bin/env node
/* [LEGAL 2026-11-21] Static checks for the public information pages (no browser, no network).
 *  - the nine required pages exist, are published (tools/build_dist.mjs allow-list) and share one stylesheet;
 *  - every internal link resolves to a published file, an in-page anchor, or the app's support deep link;
 *  - policies carry version, prepared / revised dates, an effective-date placeholder and the legal-review notice;
 *  - no invented contact details (no e-mail address, phone number or registration number) and no unsupported promise
 *    (escrow protection, guaranteed refunds, "fully encrypted", "never shared", claimed licences);
 *  - the app links to the pages (settings list, auth screen) and no longer shows the old placeholder cards. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  PASS ' + m); };

const POLICIES = ['privacy.html', 'terms.html', 'cookies.html', 'refund-policy.html', 'seller-policy.html', 'community-guidelines.html'];
const INFO = ['about.html', 'support.html', 'contact.html'];
const ALL = [...POLICIES, ...INFO];
const dist = read('tools/build_dist.mjs');
ok(ALL.every(f => fs.existsSync(path.join(ROOT, f))), 'all nine public pages exist at the site root');
ok(ALL.every(f => dist.includes(`'${f}'`)), 'all nine pages are in the publish allow-list (tools/build_dist.mjs)');
const netlify = read('netlify.toml');
ok(!/from\s*=\s*"\/(about|privacy|terms|cookies|refund-policy|seller-policy|community-guidelines|support|contact)\.html"/.test(netlify), 'no redirect rule hides the pages (static files are served before the SPA rewrite)');

const anchorsOf = html => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
for (const f of ALL) {
  const h = read(f);
  ok(/<html lang="en">/.test(h) && /<meta name="viewport"/.test(h) && h.includes('href="/css/legal-pages.css') && h.includes('href="/fonts/inter.css"'), `${f}: language, viewport, shared stylesheet and the app's Inter fonts`);
  ok(h.includes(`<link rel="canonical" href="https://sokohai.com/${f}">`), `${f}: canonical https://sokohai.com/${f}`);
  ok(!/<script\b/i.test(h), `${f}: static page, no scripts (loads signed-out, nothing to break)`);
  // links
  const hrefs = [...h.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  const bad = [];
  for (const u of hrefs) {
    if (/^https:\/\/sokohai\.com\/?/.test(u)) { const p = u.replace(/^https:\/\/sokohai\.com\/?/, ''); if (p && !fs.existsSync(path.join(ROOT, p.split('#')[0]))) bad.push(u); continue; }
    if (/^https?:/.test(u)) { bad.push(u); continue; }                                     // no other external links on these pages
    if (u.startsWith('#')) { if (!anchorsOf(h).has(u.slice(1))) bad.push(u); continue; }
    if (u === '/') continue;
    const m = u.match(/^\/\?support=([a-z]+)$/); if (m) { if (!/^(account|buyer|seller|listing|payments|refunds|delivery|live|security|privacy|technical|feedback|other|mine)$/.test(m[1])) bad.push(u); continue; }
    const [file, frag] = u.replace(/^\//, '').split('#'); const clean = file.split('?')[0];
    if (!fs.existsSync(path.join(ROOT, clean))) { bad.push(u); continue; }
    if (frag && clean.endsWith('.html') && !anchorsOf(read(clean)).has(frag)) bad.push(u);
  }
  ok(!bad.length, `${f}: every link resolves (${hrefs.length} links) ${bad.join(' ')}`);
  ok(ALL.every(o => h.includes(`href="/${o}"`)), `${f}: footer links to all nine pages`);
  // honesty
  const text = h.replace(/<[^>]+>/g, ' ');
  ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/.test(text), `${f}: no e-mail address invented`);
  ok(!/(\+?255|\b0)[67]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/.test(text), `${f}: no phone number invented`);
  ok(!/escrow protect|protected by escrow|guaranteed refund|money-back guarantee|fully encrypted|end-to-end encrypted|never shared|is (licensed|registered|approved) by|PDPC[- ]registered/i.test(text), `${f}: no unsupported promise or claimed licence`);
}
for (const f of POLICIES) {
  const h = read(f);
  ok(/Version <b>1\.0 \(draft\)<\/b>/.test(h) && /Prepared <b>21 November 2026<\/b>/.test(h) && /Last revised <b>21 November 2026<\/b>/.test(h) && /Effective date: <span class="pending">PENDING OWNER CONFIRMATION/.test(h), `${f}: version, prepared/revised dates, effective date pending`);
  ok(h.includes('Draft pending legal review'), `${f}: legal-review notice`);
}
const privacy = read('privacy.html'), terms = read('terms.html'), refund = read('refund-policy.html');
ok(/Personal Data Protection Act, 2022/.test(privacy) && /Personal Data Protection Commission/.test(privacy), 'privacy: names the PDPA 2022 and the PDPC');
for (const p of ['Google Firebase', 'Netlify', 'Cloudinary', 'OpenStreetMap', 'STUN', 'PesaPal']) ok(privacy.includes(p), `privacy: discloses ${p}`);
ok(/approximate/i.test(privacy) && /rounded to about 1 km/.test(privacy), 'privacy: listing location is approximate (matches the app)');
ok(/phone number is not shown publicly/i.test(privacy), 'privacy: phone is private unless the user opts in (matches the app)');
ok(/not a party to sales between users/i.test(terms) && /Not available yet/.test(terms), 'terms: SokoHai is not a party to sales; payment features marked not available');
ok(/cannot refund, reverse or hold/i.test(refund), 'refund policy: no refund promise SokoHai cannot keep');
ok(/sets <b>no cookies<\/b>/.test(read('cookies.html')), 'cookies: states the app sets no cookies (verified: no document.cookie in js/)');
ok(!fs.readdirSync(path.join(ROOT, 'js'), { recursive: true }).filter(f => /\.js$/.test(f)).some(f => /document\.cookie\s*=/.test(read(path.join('js', f)))), 'app code sets no cookies (keeps the cookie page true)');

// app integration
const settings = read('js/app/21-sokopay.js'), printing = read('js/app/22-printing.js'), auth = read('html/04-modal-auth.html');
ok(!/Sheria za matumizi ya SokoHai zitaonekana hapa|Ultimate Pro|Create Support Ticket|Submit Feedback|Submit Rating/.test(printing), 'old placeholder cards and dead buttons are gone from settings');
ok(/help:'\/support\.html'/.test(printing) && /terms:'\/terms\.html'/.test(printing) && /privacy_policy:'\/privacy\.html'/.test(printing) && /about:'\/about\.html'/.test(printing), 'settings open the public pages');
ok(/contact_support:'other'/.test(printing) && /report_problem:'technical'/.test(printing) && /feedback:'feedback'/.test(printing), 'settings open the real support form');
ok((settings.match(/\['(help|contact_support|report_problem|feedback|about|terms|privacy_policy|legal_center)'/g) || []).length === 8 && !/\['(tutorials|rate)'/.test(settings), 'settings list: one entry per destination, no duplicates');
ok(auth.includes('href="/terms.html"') && auth.includes('href="/privacy.html"'), 'auth screen links to Terms and Privacy');
console.log(`\nLEGAL PAGES (static): ${n} passed, 0 failed`);
