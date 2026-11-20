/* ============================================================
 * SOKOHAI — Jaribio la KADI ZA DISCOVERY (Bidhaa/Huduma/Usafiri)
 * [OWNER CARD STYLE 2026-11-20 — mfano wa mmiliki] Post ZOTE (bidhaa/huduma/usafiri) zina
 * mtindo mmoja: picha yenye kategoria (juu-kushoto, JINA si code), ♡ (juu-kulia),
 * "Imethibitishwa" (chini-kulia, uthibitisho wa server tu) -> jina -> bei kushoto | ⭐ kulia
 * (tathmini halisi tu). Kipimo/hali/eneo/muuzaji havionekani mbele ya kadi.
 * Hutumia WAJENZI HALISI kutoka 00-bootstrap.js.
 * Endesha:  node tools/test_commerce_cards.mjs
 * ============================================================ */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoryLabel } from '../shared/category-filter-core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

const icons = fs.readFileSync(path.join(ROOT, 'js/18-icons.js'), 'utf8');
const boot = fs.readFileSync(path.join(ROOT, 'js/app/00-bootstrap.js'), 'utf8');
const start = boot.indexOf("// Ikoni ndogo ya SVG (stroke)");
const end = boot.indexOf('skh.renderFeedUI = function');
if (start < 0 || end < 0) { console.error('Alama za kadi hazikupatikana'); process.exit(1); }
const cardCode = boot.slice(start, end).replace(/import[^\n]*\n/g, '');

const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>',
    { url: 'http://localhost/', runScripts: 'dangerously' });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
window.skh = {
    skhEscape: esc, skhJsEsc: esc,
    getOptimizedImageUrl: (u) => u || '',
    categoryLabel // same resolver as 00-bootstrap.js (skh.categoryLabel)
};
window.skhCardIndex = {}; window.skhCardToggle = () => {};
window.skhEngagementState = { liked: {}, saved: {} };
window.openProduct = () => {}; window.openSellerProfile = () => {};
window.SKH_ICONS = {
    like: '<svg viewBox="0 0 24 24" fill="currentColor"></svg>',
    save: '<svg viewBox="0 0 24 24" fill="currentColor"></svg>'
};
window.eval(icons);
window.eval(cardCode);
const skh = window.skh;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n); } };
function render(html) { const d = document.createElement('div'); d.innerHTML = html; return d; }

const RICE = 'https://example.com/rice.jpg';
const product = { id: 'p1', title: 'Mchele Mbeya 25kg', price: 75000, image: RICE, ownerName: 'Mlimani Rice Store', trust: { product_inspection: { status: 'active' } }, location: 'Tabora', stock: 40, imagesArray: [RICE, RICE] };
const service = { id: 's1', title: 'Ushonaji Suti', price: 100000, pricingModel: 'starting', image: 'https://example.com/suit.jpg', ownerName: 'Asha Fashion', providerVerified: true, location: 'Tabora', rating: 4.8, reviewCount: 34 };
const driver = { id: 'd1', title: 'Cargo Transport', price: 20000, image: 'https://example.com/truck.jpg', ownerName: 'Juma Transport', verified: true, pickupRegion: 'Tabora', destinationRegion: 'Pangale', vehicleType: 'Lori la Tani 10', rating: 4.7, reviewCount: 21 };

console.log('\n[1] BIDHAA — mtindo wa mmiliki');
{
    const el = render(skh.CommercePostCard(Object.assign({}, product, { category: 'CAT-01', baseUnit: 'Kg', condition: 'Mpya' }), 'products'));
    const c = el.querySelector('.skh-huru.skh-oc');
    ok('kadi ya bidhaa ina mtindo mmoja (skh-oc)', !!c);
    ok('picha ndiyo kichwa cha kadi', c.children[0].classList.contains('skh-img') && c.children[0].classList.contains('skh-oc-img'));
    ok('jina lipo', c.querySelector('.skh-oc-title').textContent.includes('Mchele Mbeya'));
    ok('bei TSh 75,000 kwenye mstari wa bei', c.querySelector('.skh-oc-row .skh-oc-price').textContent.replace(/\s/g, '').includes('75,000'));
    ok('kategoria juu ya picha ni JINA, si code ya CAT', !!c.querySelector('.skh-img .skh-badge--category') && !/CAT-\d/.test(c.querySelector('.skh-badge--category').textContent));
    ok('♡ juu ya picha (kuhifadhi/kupenda)', !!c.querySelector('.skh-img .skh-card-heart'));
    ok('Imethibitishwa juu ya picha (uthibitisho wa server)', /Imethibitishwa/.test(c.querySelector('.skh-img .skh-verified-pill')?.textContent || ''));
    ok('hakuna cart/Share mbele ya kadi', !c.querySelector('.skh-huru-cart') && !c.querySelector('.skh-act--order') && !c.querySelector('.skh-huru-share'));
    ok('hakuna muuzaji mbele ya kadi', !c.querySelector('.skh-seller-mini') && !c.textContent.includes('Mlimani Rice Store'));
    ok('kipimo/hali/eneo havionekani mbele ya kadi', !c.textContent.includes('Kg') && !c.textContent.includes('Mpya') && !c.querySelector('.skh-pinloc') && !c.textContent.includes('Tabora'));
    ok('hakuna idadi ya stock iliyobuniwa', !c.textContent.includes('Zipo (40)'));
    ok('bila tathmini halisi: hakuna nyota wala "Bado tathmini"', !c.querySelector('.skh-rating') && !c.textContent.includes('Bado tathmini'));
    ok('kufungua kadi kuna openProduct', /openProduct\(\s*'p1'\s*,\s*'products'\s*\)/.test(c.getAttribute('onclick')));
    ok('role/aria kwa ufikivu', c.getAttribute('role') === 'link' && c.getAttribute('tabindex') === '0');
    const rated = render(skh.CommercePostCard(Object.assign({}, product, { rating: 4.8, reviewCount: 26 }), 'products'));
    ok('tathmini ⭐4.8 iko KULIA mwa bei (mstari mmoja), si ndani ya picha',
        rated.querySelector('.skh-oc-row .skh-rating--card b')?.textContent === '4.8' && !rated.querySelector('.skh-img .skh-rating'));
}

console.log('\n[2] HUDUMA — mtindo ule ule');
{
    const el = render(skh.CommercePostCard(Object.assign({}, service, { category: 'Ushonaji' }), 'services'));
    const c = el.querySelector('.skh-card');
    ok('kadi ya huduma', c.classList.contains('skh-card--service') && c.classList.contains('skh-oc'));
    ok('bei inaanzia "Kuanzia"', c.querySelector('.skh-price-prefix')?.textContent.trim() === 'Kuanzia');
    ok('tathmini 4.8 kulia mwa bei', c.querySelector('.skh-oc-row .skh-rating--card b')?.textContent === '4.8');
    ok('kategoria juu ya picha', c.querySelector('.skh-img .skh-badge--category')?.textContent === 'Ushonaji');
    ok('♡ + Imethibitishwa (mtoa amethibitishwa na server)', !!c.querySelector('.skh-img .skh-card-heart') && !!c.querySelector('.skh-img .skh-verified-pill'));
    ok('mtoa huduma / eneo havionekani mbele ya kadi', !c.querySelector('.skh-seller-mini') && !c.querySelector('.skh-pinloc'));
    const noCat = render(skh.CommercePostCard(Object.assign({}, service, { id: 's9' }), 'services'));
    ok('bila kategoria: kibandiko cha aina "Huduma"', !!noCat.querySelector('.skh-img .skh-badge--service'));
}

console.log('\n[3] USAFIRI — mtindo ule ule');
{
    const el = render(skh.CommercePostCard(driver, 'drivers'));
    const c = el.querySelector('.skh-card');
    ok('kadi ya usafiri', c.classList.contains('skh-card--transport') && c.classList.contains('skh-oc'));
    ok('aina ya chombo juu ya picha', (c.querySelector('.skh-img .skh-badge--transport')?.textContent || '').includes('Lori'));
    ok('bei "Kuanzia"', !!c.querySelector('.skh-price-prefix'));
    ok('tathmini 4.7 kulia mwa bei', c.querySelector('.skh-oc-row .skh-rating--card b')?.textContent === '4.7');
    ok('Imethibitishwa kwa msafirishaji aliyethibitishwa', !!c.querySelector('.skh-img .skh-verified-pill'));
    ok('kufungua ni openProduct(d1,drivers)', /openProduct\(\s*'d1'\s*,\s*'drivers'\s*\)/.test(c.getAttribute('onclick')));
    const untitled = render(skh.CommercePostCard(Object.assign({}, driver, { id: 'd2', title: '' }), 'drivers'));
    ok('bila jina: njia Tabora → Pangale inakuwa jina', untitled.querySelector('.skh-oc-title').textContent.includes('Tabora → Pangale'));
}

console.log('\n[4] HALI MAALUMU');
{
    const out = render(skh.CommercePostCard(Object.assign({}, product, { id: 'p2', stock: 0 }), 'products'));
    const oc = out.querySelector('.skh-huru');
    ok('zimeisha: pill + picha kijivu', !!oc.querySelector('.skh-out-pill') && !!oc.querySelector('.skh-img--out'));
    const auc = render(skh.CommercePostCard(Object.assign({}, product, { id: 'p3', saleMode: 'auction', stock: undefined }), 'products'));
    ok('mnada: beji ya mnada juu ya picha', !!auc.querySelector('.skh-img .skh-badge--auction'));
    const noPrice = render(skh.CommercePostCard(Object.assign({}, service, { id: 's2', price: 0, pricingModel: 'negotiable' }), 'services'));
    ok('bila bei: "Maelewano"', noPrice.textContent.includes('Maelewano'));
    const unverified = render(skh.CommercePostCard(Object.assign({}, product, { id: 'p4', trust: undefined }), 'products'));
    ok('bila uthibitisho: hakuna verified pill', !unverified.querySelector('.skh-verified-pill'));
    // [R9] legacy self-set flags are not a badge: only the server-issued product inspection is.
    const selfSet = render(skh.CommercePostCard(Object.assign({}, product, { id: 'p6', trust: undefined, verified: true, ownerVerified: true, verificationStatus: 'verified' }), 'products'));
    ok('R9: verified/ownerVerified ya zamani haionyeshi beji', !selfSet.querySelector('.skh-verified-pill'));
    const suspended = render(skh.CommercePostCard(Object.assign({}, product, { id: 'p7', trust: { product_inspection: { status: 'suspended' } } }), 'products'));
    ok('R9: ukaguzi uliosimamishwa hauonyeshi beji', !suspended.querySelector('.skh-verified-pill'));
    const selfSvc = render(skh.CommercePostCard(Object.assign({}, service, { id: 's7', providerVerified: undefined, verified: true }), 'services'));
    ok('R9: huduma yenye verified ya zamani tu haina tiki', !selfSvc.querySelector('.skh-verified'));
    const noLoc = render(skh.CommercePostCard(Object.assign({}, product, { id: 'p5', location: '' }), 'products'));
    ok('bila eneo: hakuna pinloc (#1 haina safu ya eneo)', !noLoc.querySelector('.skh-pinloc'));
    const noRate = render(skh.CommercePostCard(Object.assign({}, service, { id: 's3', rating: 0, reviewCount: 0 }), 'services'));
    ok('huduma isiyo na tathmini haionyeshi nyota', !noRate.querySelector('.skh-rating'));
}

console.log('\n[5] USAWA WA FAMILIA (aina zote tatu)');
{
    for (const [data, col] of [[product, 'products'], [service, 'services'], [driver, 'drivers']]) {
        const c = render(skh.CommercePostCard(data, col)).querySelector('.skh-oc');
        const body = c.querySelector('.skh-oc-body');
        const rows = [...body.children].map(x => x.className);
        ok(col + ': maelezo = jina -> bei|⭐ (mistari miwili tu)', rows.length === 2 && /skh-huru-r1|skh-oc-title/.test(rows[0]) && rows[1].includes('skh-oc-row'));
        ok(col + ': jina na bei hazishiriki mstari', !!body.querySelector('.skh-oc-title') && !body.firstElementChild.querySelector('.skh-oc-price'));
    }
}

console.log('\n==================================================');
console.log(`COMMERCE CARDS: ${pass} zimepita, ${fail} zimeshindwa`);
if (fail) process.exit(1);
console.log('✅ KADI ZA DISCOVERY SAFI KULINGANA NA REFERENCE');
