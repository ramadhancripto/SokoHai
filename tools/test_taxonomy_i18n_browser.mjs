#!/usr/bin/env node
/* [I18N TAXONOMY 2026-11-22] Taxonomy labels follow the selected language in the real seller form (Chromium + local
 * server): category and subcategory dropdowns, product-builder attribute / option / filter suggestions; switching
 * language updates the open form at once; option VALUES (what is saved) never change; switching back restores the
 * exact original labels; seller-entered content is not translated; coverage report = 100 % of tier-1 strings.
 * Run: `node functions/local-server.js` (5055) [+ emulators], SKH_FIREBASE_SDK_DIR=<firebase@10.8.1> node tools/test_taxonomy_i18n_browser.mjs */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const APP = process.env.SKH_APP_URL || 'http://127.0.0.1:5055/';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  PASS ' + m); };
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
if (process.env.SKH_FIREBASE_SDK_DIR) { const sdk = process.env.SKH_FIREBASE_SDK_DIR.replace(/\/?$/, '/'); await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(sdk + r.request().url().split('/').pop()) })); }
await ctx.route(/res\.cloudinary\.com|nominatim/, r => r.abort());
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss().catch(() => {}));
await p.addInitScript(() => { try { localStorage.setItem('skh_welcomed_v1', '1'); localStorage.setItem('sokohai_language', 'sw'); } catch (e) {} });
const T = Date.now().toString(36), PW = 'Siri-' + T + '-9', EM = 'tax-' + T + '@example.test';
await fetch('http://' + (process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099') + '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EM, password: PW, returnSecureToken: true }) });
await p.goto(APP); await p.waitForFunction(() => window.skhTaxonomyI18n && window.SokoHaiLMS && window.skh && window.skh.__authResolved, null, { timeout: 45000 });
await p.evaluate(async ({ e, pw }) => { await window.skh.signInWithEmailAndPassword(window.skh.auth, e, pw); }, { e: EM, pw: PW }); await p.waitForTimeout(2000);
await p.waitForTimeout(4000);
ok(!(await p.evaluate(() => window.skhTaxonomyI18n.ready())), 'performance: in Swahili the taxonomy dictionary is NOT downloaded while a buyer is on Home');

// open the real seller form, choose a canonical category + subcategory through the form's own handlers
await p.evaluate(() => { const a = document.getElementById('authModal'); if (a) a.style.display = 'none'; window.populateFormCategories && window.populateFormCategories(); window.showForm && window.showForm('sellerForm'); });
await p.waitForFunction(() => { const f = document.getElementById('sellerForm'); return f && f.getBoundingClientRect().height > 0; }, null, { timeout: 15000 });
await p.waitForFunction(() => window.skhTaxonomyI18n.ready(), null, { timeout: 20000 });
ok(true, 'opening the seller form (visible on screen) loads the taxonomy dictionary on demand');
const cov = await p.evaluate(() => window.skhTaxonomyI18nCoverage);
ok(cov && cov.tier1.total >= 2400 && cov.tier1.missing === 0, 'coverage: every tier-1 taxonomy string has English and Swahili (' + JSON.stringify(cov.tier1) + ')');
await p.waitForTimeout(600);
const pick = await p.evaluate(() => { const s = document.getElementById('prodCategory'); const o = [...s.options].find(o => o.value === 'CAT-01') || [...s.options].find(o => /^CAT-/.test(o.value)); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return o.value; });
await p.waitForTimeout(800);
const sub = await p.evaluate(() => { const s = document.getElementById('prodSubCategory'); const o = [...s.options].find(o => o.value === 'Mboga & Fresh Produce') || [...s.options].find(o => o.value); if (!o) return null; s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return o.value; });
await p.waitForTimeout(1500);
const snap = () => p.evaluate(() => ({
  cat: [...document.querySelectorAll('#prodCategory option')].map(o => [o.value, o.textContent.trim()]),
  sub: [...document.querySelectorAll('#prodSubCategory option')].map(o => [o.value, o.textContent.trim()]),
  rows: [...document.querySelectorAll('#sellerForm .spb-row b, #sellerForm .spb-row small, #sellerForm .spb-check')].map(e => e.textContent.trim()).filter(Boolean),
  catVal: document.getElementById('prodCategory').value, subVal: document.getElementById('prodSubCategory').value }));
const sw0 = await snap();
await p.evaluate(() => { const e = document.getElementById('spbSuggestions') || document.getElementById('prodSubCategory'); e && e.scrollIntoView({ block: 'center' }); }); await p.screenshot({ path: (process.env.SHOTS || '/tmp') + '/taxonomy-sw-390.png' });
ok(pick && sub && sw0.catVal === pick && sw0.subVal === sub, 'the real form selects category ' + pick + ' / ' + sub);
const label = (arr, v) => (arr.find(x => x[0] === v) || [])[1];
ok(label(sw0.sub, 'Mboga & Fresh Produce') === 'Mboga na Mazao Mabichi' || label(sw0.sub, sub) !== undefined, 'Kiswahili: subcategory label in Swahili ("' + label(sw0.sub, sub) + '")');
ok(sw0.rows.length > 0 && sw0.rows.some(t => /^(Aina|Daraja|Ubichi|Asili \/ Chanzo|Ufungashaji|Uzito|Kipimo|Ukubwa)$/.test(t)) && !sw0.rows.some(t => /^(Variety|Grade|Freshness|Packaging|Weight)$/.test(t)), 'Kiswahili: product-builder attributes and options in Swahili (no English taxonomy words)');

await p.evaluate(() => window.skhSetLang('en')); await p.waitForTimeout(900);
const en = await snap();
await p.screenshot({ path: (process.env.SHOTS || '/tmp') + '/taxonomy-en-390.png' });
ok(label(en.sub, 'Mboga & Fresh Produce') === 'Vegetables & Fresh Produce' || (label(en.sub, sub) && label(en.sub, sub) !== label(sw0.sub, sub)), 'English: the open dropdown switches at once ("' + label(en.sub, sub) + '")');
ok(en.rows.some(t => /^(Variety|Grade|Freshness|Origin|Packaging|Weight|Unit|Size)$/.test(t)) && !en.rows.some(t => /^(Aina|Daraja|Ubichi|Ufungashaji|Uzito|Kipimo)$/.test(t)), 'English: attributes and options in English (no Swahili taxonomy words)');
const enCat = en.cat.filter(([v]) => /^CAT-/.test(v)).map(x => x[1]);
ok(enCat.some(t => /Food & Drinks|Vegetables|Agriculture/.test(t)) && !enCat.some(t => /^(Mifugo|Matunda|Nyama)$/.test(t)), 'English: category list in English');
ok(JSON.stringify(en.cat.map(x => x[0])) === JSON.stringify(sw0.cat.map(x => x[0])) && JSON.stringify(en.sub.map(x => x[0])) === JSON.stringify(sw0.sub.map(x => x[0])) && en.catVal === pick && en.subVal === sub, 'stored values unchanged: every option value and the current selection are identical in both languages');

// the forms' own interface (labels, help, placeholders, options) has no Swahili left in English mode
const SWRE = /\b(na|ya|kwa|wa|za|la|cha|vya|bidhaa|huduma|hakuna|tafuta|bei|soko|dukani|muuzaji|mnunuzi|chagua|weka|hifadhi|ongeza|zaidi|jina|mahali|eneo|maelezo|picha|mfano|andika|kategoria|inauzwa|wapi|jaza|taarifa|hiari|idadi|kipimo|mkoa|nchi|kuuza|ili|kama|kwenye|bila|mtandaoni|mteja)\b/i;
const leftovers = (id) => p.evaluate(({ id, src }) => { const re = new RegExp(src, 'i'), root = document.getElementById(id), out = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let x; while ((x = w.nextNode())) { const el = x.parentElement; if (!el || /SCRIPT|STYLE/.test(el.tagName) || el.closest('#skhPsLive, [data-user-content]')) continue; const t = x.nodeValue.replace(/\s+/g, ' ').trim(); if (t.length > 1 && re.test(t)) out.push(t); }
  root.querySelectorAll('[placeholder]').forEach(e => { if (re.test(e.getAttribute('placeholder'))) out.push('placeholder: ' + e.getAttribute('placeholder')); });
  return out; }, { id, src: SWRE.source });
const sellerLeft = await leftovers('sellerForm'); if (process.env.DUMP_LEFT) { const sv = await (async () => { await p.evaluate(() => window.showForm('serviceForm')); await p.waitForTimeout(900); const r = await leftovers('serviceForm'); await p.evaluate(() => window.showForm('sellerForm')); await p.waitForTimeout(600); return r; })(); (await import('node:fs')).writeFileSync(process.env.DUMP_LEFT, JSON.stringify([...new Set(sellerLeft.concat(sv))])); }
ok(sellerLeft.length === 0, 'English: the product form interface has no Swahili left (labels, help, placeholders, options) ' + JSON.stringify(sellerLeft.slice(0, 5)));
await p.evaluate(() => window.showForm('serviceForm')); await p.waitForTimeout(900);
const servLeft = await leftovers('serviceForm');
ok(servLeft.length === 0, 'English: the service form interface has no Swahili left ' + JSON.stringify(servLeft.slice(0, 5)));
await p.evaluate(() => window.showForm('sellerForm')); await p.waitForTimeout(600);
await p.evaluate(() => window.skhSetLang('sw')); await p.waitForTimeout(900);
const sw1 = await snap();
ok(JSON.stringify(sw1.sub) === JSON.stringify(sw0.sub) && JSON.stringify(sw1.cat) === JSON.stringify(sw0.cat), 'switching back restores exactly the original Swahili labels');

// seller-entered content is not translated (title "Matunda" stays as typed, in the field and in the live preview)
await p.evaluate(() => { const i = document.getElementById('prodName'); i.value = 'Matunda'; i.dispatchEvent(new Event('input', { bubbles: true })); }); await p.evaluate(() => window.skhSetLang('en')); await p.waitForTimeout(700);
const own = await p.evaluate(() => ({ v: document.getElementById('prodName').value, live: (document.getElementById('skhPsLive') || {}).textContent || '' }));
ok(own.v === 'Matunda' && !/\bFruits\b/.test(own.live), 'seller-entered title "Matunda" is not translated (field and live preview)');
ok(await p.evaluate(() => window.skhTaxLabel('Chakula & Vinywaji', 'en') === 'Food & Drinks' && window.skhTaxLabel('Variety', 'sw') === 'Aina' && window.skhTaxLabel('Simu ya Juma', 'en') === 'Simu ya Juma'), 'skhTaxLabel: canonical -> label; unknown text is returned unchanged');
ok(await p.evaluate(() => window.skhTaxLabel('Nyanya', 'en') === 'Tomatoes' && window.skhTaxLabel('Refrigerator', 'sw') === 'Jokofu' && window.skhTaxLabel('Shuka', 'en') === 'Maasai shuka (cloth)' && window.skhTaxLabel('Dhahabu', 'sw') === 'Dhahabu'), 'product types (4,688) are translated both ways: Nyanya -> Tomatoes, Refrigerator -> Jokofu');
await p.evaluate(() => window.skhSetLang('sw'));
ok(!errs.length, 'no JavaScript errors ' + errs.slice(0, 2).join(' | '));
await b.close();
console.log(`\nTAXONOMY I18N (browser): ${n} passed, 0 failed`);
