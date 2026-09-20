/* ============================================================
 * SOKOHAI — Jaribio la KADI ZA DISCOVERY (Bidhaa/Huduma/Usafiri)
 * Huhakiki muundo wa teaser: picha shujaa, jina → bei → muuzaji
 * ✓ → eneo, bila Like/Save/vitendo vya social mbele (vipo detail
 * pekee), bila msongamano wa footer/chips za ndani.
 * Hutumia WAJENZI HALISI kutoka 00-bootstrap.js.
 * Endesha:  node tools/test_commerce_cards.mjs
 * ============================================================ */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    getOptimizedImageUrl: (u) => u || ''
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
const product = { id: 'p1', title: 'Mchele Mbeya 25kg', price: 75000, image: RICE, ownerName: 'Mlimani Rice Store', verified: true, location: 'Tabora', stock: 40, imagesArray: [RICE, RICE] };
const service = { id: 's1', title: 'Ushonaji Suti', price: 100000, image: 'https://example.com/suit.jpg', ownerName: 'Asha Fashion', verified: true, location: 'Tabora', rating: 4.8, reviewCount: 34 };
const driver = { id: 'd1', title: 'Cargo Transport', price: 20000, image: 'https://example.com/truck.jpg', ownerName: 'Juma Transport', verified: true, pickupRegion: 'Tabora', destinationRegion: 'Pangale', vehicleType: 'Lori la Tani 10', rating: 4.7, reviewCount: 21 };

console.log('\n[1] BIDHAA — muundo wa teaser');
{
    const el = render(skh.CommercePostCard(product, 'products'));
    const c = el.querySelector('.skh-card');
    ok('kadi ina darasa la bidhaa', c && c.classList.contains('skh-card--product'));
    ok('picha ndiyo kichwa cha kadi', c.children[0].classList.contains('skh-img'));
    // [POLICY 2026-09] Kadi ni TEASER: Like/Save havionekani mbele ya kadi
    // (vipo ndani ya detail/modali pekee, kwa umbo la icons).
    ok('Like HAPO mbele ya kadi', !c.querySelector('.card-eng-like'));
    ok('Save HAPO mbele ya kadi', !c.querySelector('.card-eng-save'));
    ok('hakuna kitufe cha engagement juu ya picha', !c.querySelector('.skh-img .skh-actions'));
    ok('jina lipo', c.querySelector('.skh-title').textContent.includes('Mchele Mbeya'));
    ok('bei ni TSh 75,000', c.querySelector('.skh-price').textContent.replace(/\s/g, '').includes('75,000'));
    ok('bei haina "Kuanzia" kwa bidhaa', !c.querySelector('.skh-price-prefix'));
    ok('duka + tiki vipo', !!c.querySelector('.skh-seller-mini .skh-verified'));
    ok('eneo la pini lipo', c.querySelector('.skh-pinloc').textContent.includes('Tabora'));
    ok('verified pill kwenye picha', !!c.querySelector('.skh-img .skh-verified-pill'));
    ok('hakuna footer ya Imelindwa/CTA', !c.querySelector('.skh-foot'));
    ok('hakuna chips za ndani ya mwili', !c.querySelector('.skh-body .skh-chip-row'));
    ok('hakuna idadi ya stock kwenye teaser', !c.textContent.includes('Zipo (40)'));
    ok('idadi ya picha inaonyeshwa', !!c.querySelector('.skh-photo-count'));
    ok('kufungua kadi kuna openProduct', /openProduct\(\s*'p1'\s*,\s*'products'\s*\)/.test(c.getAttribute('onclick')));
    ok('role/aria kwa ufikivu', c.getAttribute('role') === 'link' && c.getAttribute('tabindex') === '0');
}

console.log('\n[2] HUDUMA — bei "Kuanzia", mtoa + tathmini + eneo');
{
    const el = render(skh.CommercePostCard(service, 'services'));
    const c = el.querySelector('.skh-card');
    ok('kadi ya huduma', c.classList.contains('skh-card--service'));
    ok('bei inaanzia "Kuanzia"', c.querySelector('.skh-price-prefix')?.textContent.trim() === 'Kuanzia');
    ok('tathmini inaonyeshwa', c.querySelector('.skh-rating b')?.textContent === '4.8');
    ok('idadi ya maoni imo', c.textContent.includes('(34)'));
    ok('mtoa huduma + tiki', !!c.querySelector('.skh-seller-mini .skh-verified'));
    ok('eneo lipo', c.querySelector('.skh-pinloc').textContent.includes('Tabora'));
    ok('kibandiko cha aina ya huduma juu ya picha', !!c.querySelector('.skh-img .skh-overlay-chip'));
}

console.log('\n[3] USAFIRI — njia juu ya picha, chombo, bei, msafirishaji');
{
    const el = render(skh.CommercePostCard(driver, 'drivers'));
    const c = el.querySelector('.skh-card');
    ok('kadi ya usafiri', c.classList.contains('skh-card--transport'));
    const ro = c.querySelector('.skh-route-overlay');
    ok('njia Tabora ➜ Pangale juu ya picha', ro && ro.textContent.includes('Tabora') && ro.textContent.includes('Pangale'));
    ok('mshale wa njia ni icon ya SVG (sio emoji)', !!ro.querySelector('.skh-ro-arrow svg') && !ro.textContent.includes('➜'));
    ok('jina la chombo (aina) lipo', c.querySelector('.skh-card-sub')?.textContent.includes('Lori'));
    ok('bei "Kuanzia"', !!c.querySelector('.skh-price-prefix'));
    ok('msafirishaji + tathmini', !!c.querySelector('.skh-seller-mini') && !!c.querySelector('.skh-rating'));
    ok('eneo la mwanzo (pini)', c.querySelector('.skh-pinloc').textContent.includes('Tabora'));
    ok('kufungua ni openProduct(d1,drivers)', /openProduct\(\s*'d1'\s*,\s*'drivers'\s*\)/.test(c.getAttribute('onclick')));
}

console.log('\n[4] HALI MAALUMU');
{
    const out = render(skh.CommercePostCard(Object.assign({}, product, { id: 'p2', stock: 0 }), 'products'));
    const oc = out.querySelector('.skh-card');
    ok('zimeisha: pill + picha kijivu', !!oc.querySelector('.skh-out-pill') && !!oc.querySelector('.skh-img--out'));
    const auc = render(skh.CommercePostCard(Object.assign({}, product, { id: 'p3', saleMode: 'auction', stock: undefined }), 'products'));
    ok('mnada: beji ya mnada juu ya picha', !!auc.querySelector('.skh-img .skh-badge--auction'));
    const noPrice = render(skh.CommercePostCard(Object.assign({}, service, { id: 's2', price: 0 }), 'services'));
    ok('bila bei: "Maelewano"', noPrice.textContent.includes('Maelewano'));
    const unverified = render(skh.CommercePostCard(Object.assign({}, product, { id: 'p4', verified: false }), 'products'));
    ok('bila uthibitisho: hakuna verified pill', !unverified.querySelector('.skh-verified-pill'));
    const noLoc = render(skh.CommercePostCard(Object.assign({}, product, { id: 'p5', location: '' }), 'products'));
    ok('bila eneo: mstari wa eneo haujengwi', !noLoc.querySelector('.skh-pinloc'));
    const noRate = render(skh.CommercePostCard(Object.assign({}, service, { id: 's3', rating: 0, reviewCount: 0 }), 'services'));
    ok('huduma isiyo na tathmini haionyeshi nyota', !noRate.querySelector('.skh-rating'));
}

console.log('\n[5] USAWA WA FAMILIA (aina zote tatu)');
{
    for (const [data, col] of [[product, 'products'], [service, 'services'], [driver, 'drivers']]) {
        const c = render(skh.CommercePostCard(data, col)).querySelector('.skh-card');
        const order = [...c.querySelector('.skh-body').children].map(x => x.className);
        ok(col + ': jina ndiyo kwanza mwilini', order[0].includes('skh-title'));
        // Kwa usafiri, aina ya chombo hutangulia bei; vinginevyo bei yafuata jina.
        const priceIdx = order.findIndex(o => o.includes('skh-price'));
        const expectedPriceIdx = col === 'drivers' && order[1].includes('skh-card-sub') ? 2 : 1;
        ok(col + ': bei iko juu mara tu baada ya jina' + (col === 'drivers' ? '/chombo' : ''), priceIdx === expectedPriceIdx);
        ok(col + ': muuzaji na eneo vipo kwa mpangilio uleule',
            order.some(o => o.includes('skh-seller-row')) && order.some(o => o.includes('skh-meta-row')));
    }
}

console.log('\n==================================================');
console.log(`COMMERCE CARDS: ${pass} zimepita, ${fail} zimeshindwa`);
if (fail) process.exit(1);
console.log('✅ KADI ZA DISCOVERY SAFI KULINGANA NA REFERENCE');
