/**
 * SokoHai — NAME-FALLBACK 2026-11-09: bidhaa 38 zina `name` bila `title` (audit A).
 * Endesha: node tools/test_product_name_fallback.mjs
 *
 * KINACHOTHIBITISHWA:
 *  1. psTitle: title -> name -> itemTitle -> cargoName -> defaults (unit, moja kwa moja).
 *  2. Wenye title: matokeo NI title (name haifikiki) — 93 hawabadiliki.
 *  3. Wasio na chochote: defaults za awali ('Bidhaa'/'Huduma'/'Tangazo') — hakuna uongo.
 *  4. Mkataba wa code: 07 (SEO 1072 + attach 1153) na 123 (ptitle + sehemu 4) vina name.
 *  5. Rails (auction/price_drop/services/drivers) HAZIKUGUSWA.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { psTitle } from '../js/app/39-showcase-logic.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function t(name, cond, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; failures.push(name); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}

/* ---------- 1-3. psTitle moja kwa moja ---------- */
{
    t('psTitle: title inashinda', psTitle({ title: 'T' }) === 'T');
    t('psTitle: name inafuata title', psTitle({ name: 'N' }) === 'N');
    t('psTitle: title+name -> title (93 hawabadiliki)', psTitle({ title: 'T', name: 'N' }) === 'T');
    t('psTitle: title tupu + name -> name', psTitle({ title: '', name: 'N' }) === 'N');
    t('psTitle: itemTitle', psTitle({ itemTitle: 'I' }) === 'I');
    t('psTitle: cargoName', psTitle({ cargoName: 'C' }) === 'C');
    t('psTitle: tupu -> Bidhaa (default ya awali)', psTitle({}) === 'Bidhaa');
    t('psTitle: null -> Tangazo (default ya awali)', psTitle(null) === 'Tangazo');
    t('psTitle: services default haijabadilika', psTitle({}, 'services') === 'Huduma');
    t('psTitle: drivers default haijabadilika', psTitle({}, 'drivers') === 'Safari/Usafiri');
    t('psTitle: driverName/company bado zinafanya kazi', psTitle({ driverName: 'D' }) === 'D' && psTitle({ company: 'C' }) === 'C');
}

/* ---------- 4. Mkataba wa code ---------- */
{
    const p07 = read('js/app/07-product.js');
    t('07 SEO (1072): title -> name -> itemTitle',
        p07.includes('(p.title || p.name || p.itemTitle)'));
    t('07 attach (1153): title -> name -> itemTitle -> cargoName',
        p07.includes('|| p.title || p.name || p.itemTitle || p.cargoName || defTitle;'));
    const h123 = read('js/app/123-home-layout.js');
    t('123: ptitle helper ipo', h123.includes('const ptitle = (o) =>'));
    t('123: ptitle mpangilio sahihi', h123.includes('(o.title || o.name || o.itemTitle || o.cargoName)'));
    t('123: save param inatumia ptitle', h123.includes("title:'${esc(String(ptitle(p)).replace(/'/g, ''))}'"));
    t('123: img alt inatumia ptitle', h123.includes('alt="${esc(ptitle(p))}"'));
    t('123: card title inatumia ptitle', h123.includes('<b class="shp-t">${esc(short(ptitle(p), 40))}</b>'));
    t('123: updates Bidhaa card inatumia ptitle', h123.includes("t: ptitle(prod),"));
    const logic = read('js/app/39-showcase-logic.js');
    t('39-logic: psTitle chain kamili',
        logic.includes("(p.title || p.name || p.itemTitle || p.cargoName || p.driverName || p.company || '')"));
}

/* ---------- 5. Rails hazikuguswa ---------- */
{
    const h123 = read('js/app/123-home-layout.js');
    t('123: Mnada rail bado t: a.title (haijabadilika)', h123.includes('t: a.title,'));
    t('123: Ofa rail bado t: o.title (haijabadilika)', h123.includes('t: o.title,'));
    t('123: Huduma rail haijabadilika', h123.includes('t: svc.title,'));
    t('123: Usafiri rail haijabadilika', h123.includes("t: d.title || d.vehicleType || 'Usafiri'"));
}

/* ---------- 6. Follow-up: feed card + search haystack (00-bootstrap) ---------- */
{
    const bs = read('js/app/00-bootstrap.js');
    t('feed: card title ina data.name baada ya data.title',
        bs.includes("|| data.title || data.name) || skhTF('card_product_def', 'Bidhaa')"));
    const hay = "(data.title || data.name || data.driverName || data.company || '')";
    t('search: haystack ina data.name', bs.includes(hay));
    t('search: mpangilio title -> name -> driverName -> company',
        bs.indexOf('data.title || data.name || data.driverName') !== -1);
    t('feed: fallback ya awali (Bidhaa) imehifadhiwa',
        bs.includes("skhTF('card_product_def', 'Bidhaa')"));
    t('feed: services card haijabadilika (nje ya scope)',
        bs.includes("|| data.title) || skhTF('card_service_def', 'Huduma')"));
    t('feed: drivers card haijabadilika (nje ya scope)',
        bs.includes("hasRoute && !data.title ?"));
}

console.log(`\nPRODUCT NAME FALLBACK: ${pass} passed, ${fail} failed`);
if (fail) console.log('KUSHINDWA: ' + failures.join(' | '));
process.exit(fail ? 1 : 0);
