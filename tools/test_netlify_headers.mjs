#!/usr/bin/env node
/* [R16] Production headers (netlify.toml) must not block features the app ships:
 * Live seller camera sends audio, chat voice notes and voice search record audio. With
 * `microphone=()` Chromium silently returns a stream WITHOUT an audio track (verified with
 * Playwright: video+audio -> 1 track), so Live had no sound on sokohai.com. */
import fs from 'node:fs';
const toml = fs.readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const t = (n, v) => { if (v) { pass++; console.log('PASS ' + n); } else { fail++; console.error('FAIL ' + n); } };
const pp = (toml.match(/Permissions-Policy\s*=\s*"([^"]*)"/) || [])[1] || '';
t('Permissions-Policy header present', !!pp);
t('camera allowed for the site (Live, scan)', /camera=\(self\)/.test(pp));
t('microphone allowed for the site (Live audio, voice notes, voice search)', /microphone=\(self\)/.test(pp));
t('geolocation allowed for the site (location filter, delivery)', /geolocation=\(self\)/.test(pp));
t('build command keeps the minified + checked build', /command\s*=\s*"node tools\/build_dist\.mjs --minify --check(?: && node tools\/build_seo\.mjs --out dist)?"/.test(toml));
// [SEO 2026-11-21] the SEO pages are generated only AFTER the checked dist build (never instead of it)
t('SEO build runs after the checked dist build', /command\s*=\s*"node tools\/build_dist\.mjs --minify --check && node tools\/build_seo\.mjs --out dist"/.test(toml));
t('publishes dist/ only', /publish\s*=\s*"dist"/.test(toml));
console.log(`\nNETLIFY HEADERS: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
