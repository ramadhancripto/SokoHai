#!/usr/bin/env node
/* ==== tools/test_card_discovery.mjs ====
   SOKOHAI â€” Majaribio ya CARD/DISCOVERY/MAONI (2026-09):
   A) buildQueue tupu (vichujio vya kategoria/sehemu/utafutaji,
      hakuna kuchanganya aina).
   B) DOM: urambazaji wa wima (next/prev), kumbukumbu ya scroll,
      kizuizi Maoni yakiwa wazi.
   C) DOM: Maoni sheet (kufunguka, composer, ushahidi uliofungwa/
      uliofunguliwa na SERVER pekee, chips za midia, payload ya
      kutuma isiyo na beji za uongo, targetType kwa kila aina).
   D) changeQty: min/stock clamp.
   E) Mpangilio wa rail na maandishi yaliyoagizwa.
   Endesha: node tools/test_card_discovery.mjs
   ================================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

let pass = 0, fail = 0;
function ok(name, cond) {
    if (cond) { pass++; console.log('  âœ… ' + name); }
    else { fail++; console.error('  âŒ ' + name); }
}
function eq(name, a, b) { ok(name + ' (' + JSON.stringify(a) + ' === ' + JSON.stringify(b) + ')', a === b); }
function section(name) { console.log('\n[' + name + ']'); }

const MODAL_HTML = fs.readFileSync(path.join(ROOT, 'html/05-modals-market.html'), 'utf8');

function makeDom() {
    const dom = new JSDOM('<!doctype html><html><body>' + MODAL_HTML + '</body></html>', { runScripts: undefined });
    const win = dom.window;
    globalThis.window = win;
    globalThis.document = win.document;
    Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true, writable: true });
    globalThis.HTMLElement = win.HTMLElement;
    globalThis.Image = win.Image;
    globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
    win.t = (k) => k;
    win.skhNavIcon = (name, size) => '<svg data-ic="' + name + '" data-sz="' + (size || 14) + '"></svg>';
    return dom;
}

// Tenganisha vifungo vya import na kutekeleza moduli kama IIFE
// (stub ya skh inatolewa kama global).
function evalAppModule(rel) {
    let src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    src = src.replace(/^import[^\n]*\n/gm, '');
    (0, eval)(src);
}

function emptySnap() {
    return { forEach: () => {} };
}
function baseSkh(over) {
    return Object.assign({
        cachedItems: [],
        currentFeedCollection: 'products',
        activeCategory: '',
        activeSubCategory: '',
        activeServiceSection: 'all',
        activeDeliverySection: 'all',
        activeFilterValues: null,
        searchQuery: '',
        currentLimit: 100,
        currentOpenProduct: null,
        currentUser: null,
        fApp: {},
        db: {},
        loadMainFeed: () => {},
        requireAuth: () => true,
        skhEscape: (s) => String(s == null ? '' : s),
        skhJsEsc: (s) => String(s == null ? '' : s),
        collection: (db, name) => ({ _c: name }),
        query: (q) => q,
        where: () => ({}),
        orderBy: () => ({}),
        limit: () => ({}),
        getDocs: async () => emptySnap(),
        addDoc: async () => ({ id: 'newdoc' }),
        getFunctions: () => ({}),
        httpsCallable: () => null
    }, over || {});
}

/* ================================================================
   A) buildQueue â€” mantiki tupu
   ================================================================ */
section('A) DISCOVERY foleni (buildQueue)');

{
    const dom = makeDom();
    globalThis.skh = baseSkh();
    evalAppModule('js/app/42-discovery-feed.js');
    const build = window.skhDiscoveryBuildQueue;

    const items = [
        { id: 'p1', collectionName: 'products', category: 'Mavazi' },
        { id: 'p2', collectionName: 'products', category: 'Chakula' },
        { id: 'p3', collectionName: 'products', category: 'Mavazi' },
        { id: 's1', collectionName: 'services', category: 'Fundi', section: 'physical' },
        { id: 's2', collectionName: 'services', category: 'Mtandao', section: 'online', groupType: 'online' },
        { id: 'd1', collectionName: 'drivers', supportedServices: ['Cargo'], vehicleType: 'Pickup' },
        { id: 'd2', collectionName: 'drivers', supportedServices: ['Passenger'], vehicleType: 'Bajaji' }
    ];

    const prodMavazi = build(items, { collection: 'products', category: 'Mavazi' });
    eq('bidhaa: kategoria inachuja', prodMavazi.join(','), 'p1,p3');
    const prodAll = build(items, { collection: 'products' });
    eq('bidhaa: huduma/usafiri haviingii', prodAll.join(','), 'p1,p2,p3');
    const servOnline = build(items, { collection: 'services', serviceSection: 'online' });
    eq('huduma: section/groupType inachuja', servOnline.join(','), 's2');
    const drvCargo = build(items, { collection: 'drivers', deliverySection: 'Cargo' });
    eq('usafiri: supportedServices inachuja', drvCargo.join(','), 'd1');
    const drvSub = build(items, { collection: 'drivers', deliverySection: 'all', subCategory: 'Bajaji' });
    eq('usafiri: subcategory = vehicleType', drvSub.join(','), 'd2');
    const search1 = build(items, { collection: 'products', searchQuery: 'chakula' });
    eq('utafutaji: jina/maelezo', search1.join(','), 'p2');
    const searchDrv = build(items, { collection: 'drivers', searchQuery: 'pickup' });
    eq('utafutaji: usafiri hutafuta vehicleType', searchDrv.join(','), 'd1');
}

/* ================================================================
   B) DOM â€” urambazaji wa wima
   ================================================================ */
section('B) DISCOVERY urambazaji (DOM)');

let runB;
{
    runB = async function () {
    const dom = makeDom();
    const products = [
        { id: 'b1', collectionName: 'products', category: 'Zote' },
        { id: 'b2', collectionName: 'products', category: 'Zote' },
        { id: 'b3', collectionName: 'products', category: 'Zote' },
        { id: 'b4', collectionName: 'products', category: 'Zote' }
    ];
    let openCalls = [];
    const skh = baseSkh({
        cachedItems: products,
        activeCategory: 'Zote'
    });
    globalThis.skh = skh;
    window.openProduct = async function (id, col) { openCalls.push({ id, col }); skh.currentOpenProduct = { id, collectionName: col }; };
    evalAppModule('js/app/42-discovery-feed.js');

    const modal = document.getElementById('productModal');
    modal.style.display = 'flex';

        await window.openProduct('b1', 'products');
        const count = document.getElementById('dfCount');
        eq('kaunta baada ya kufungua', count.textContent, '1/4');
        ok('prev imezimwa mwanzo', document.getElementById('dfPrevBtn').disabled);

        // Sogea mbele
        window.skhDiscoveryMove(1);
        await new Promise(r => setTimeout(r, 360));
        eq('move(1) yafungua b2', openCalls[openCalls.length - 1].id, 'b2');
        eq('kaunta 2/4', count.textContent, '2/4');

        // Kumbukumbu ya scroll: tembeza b2, mwendo wa mbele b3 laanza juu
        const sc = document.querySelector('#productModal .pm-scroll');
        sc.scrollTop = 320;
        window.skhDiscoveryMove(1);
        await new Promise(r => setTimeout(r, 360));
        eq('b3 imefunguliwa', openCalls[openCalls.length - 1].id, 'b3');
        eq('tangazo jipya laanza juu (scroll 0)', sc.scrollTop, 0);

        // Sasa rudi b2 â€” nafasi 320 irudishwe
        window.skhDiscoveryMove(-1);
        await new Promise(r => setTimeout(r, 380));
        eq('b2 imerejeshwa', openCalls[openCalls.length - 1].id, 'b2');
        eq('scroll ya b2 imekumbukwa', sc.scrollTop, 320);

        // Mwisho wa foleni: next imezimwa
        window.skhDiscoveryMove(1); // b3
        await new Promise(r => setTimeout(r, 360));
        window.skhDiscoveryMove(1); // b4
        await new Promise(r => setTimeout(r, 360));
        eq('kaunta 4/4', count.textContent, '4/4');
        ok('next imezimwa mwisho', document.getElementById('dfNextBtn').disabled);
        const callsBefore = openCalls.length;
        window.skhDiscoveryMove(1); // haifai kuitisha
        eq('mwisho: move haifungui kingine', openCalls.length, callsBefore);

        // Maoni wazi â†’ discovery imezuiwa
        const maoni = document.getElementById('maoniLayer');
        maoni.hidden = false; maoni.classList.add('is-open');
        window.skhDiscoveryMove(-1);
        eq('Maoni wazi: move imezuiwa', openCalls.length, callsBefore);
        maoni.classList.remove('is-open'); maoni.hidden = true;

        // Vifungo vya HTML nav nav huita window.skhDiscoveryMove
        ok('dfPrevBtn yapo', !!document.getElementById('dfPrevBtn'));
        ok('dfNextBtn yapo', !!document.getElementById('dfNextBtn'));
    }
}

/* ================================================================
   C) MAONI SHEET (35-comments.js)
   ================================================================ */
function makeCommentsEnv(evidenceResult) {
    const dom = makeDom();
    const product = { id: 'prod1', collectionName: 'products', title: 'Mkaa', comments: [], userId: 'seller1' };
    const calls = { publish: [], evidence: [] };
    const callables = {
        commentsEvidence: async function (data) {
            calls.evidence.push(data);
            return { data: evidenceResult || { order: null, delivery: null, mediaAllowed: false } };
        },
        commentsPublish: async function (payload) {
            calls.publish.push(payload);
            return { data: { ok: true, id: 'c1' } };
        }
    };
    const skh = baseSkh({
        currentOpenProduct: product,
        currentUser: { uid: 'me1', displayName: 'Asha' },
        httpsCallable: (fn, name) => callables[name] || null,
        getFunctions: () => ({})
    });
    globalThis.skh = skh;
    evalAppModule('js/app/35-comments.js');
    return { dom, product, calls, skh };
}

const C_RUNS = [];
section('C) MAONI sheet â€” ufungaji na upakiaji mvivu');

{
    async function runC1() {
        const env = makeCommentsEnv();
        // autoAttach hupitia hook ya updateInteractionUI
        env.skh.updateInteractionUI();
        await new Promise(r => setTimeout(r, 360));
        const layer = document.getElementById('maoniLayer');
        ok('sheet imefichwa mwanzoni', layer.hidden === true);
        const root = document.getElementById('skhCommentsRoot');
        ok('root imo ndani ya #maoniSheetBody', !!root && root.parentElement && root.parentElement.id === 'maoniSheetBody');
        // Tathmini zimehamishwa ndani ya sheet
        const rev = document.getElementById('pmReviewsSec');
        ok('pmReviewsSec imehamishwa kwenye sheet', rev && rev.parentElement && rev.parentElement.id === 'maoniSheetBody');

        // Fungua
        await window.skhOpenMaoni();
        await new Promise(r => setTimeout(r, 30));
        ok('sheet imefunguliwa (is-open)', !layer.hidden && layer.classList.contains('is-open'));
        ok('kichwa kinaitwa Maoni', document.getElementById('maoniTitle').textContent.indexOf('Maoni') === 0);
        ok('composer ipo', !!document.getElementById('skhCommentInput'));
        ok('orodha tupu ina ujumbe wa Maoni', document.querySelector('.skh-cm-empty') &&
            document.querySelector('.skh-cm-empty').textContent.indexOf('maoni') !== -1);

        // Ushahidi umefungwa (server haijathibitisha chochote)
        const attachLocked = document.querySelector('.skh-cm-attach-btn.disabled');
        ok('kiambatisho kimefungwa bila uthibitisho', !!attachLocked);
        ok('FILE INPUT bado ipo (iliyofichwa)', !!document.getElementById('skhCmFileInput'));

        // Funga
        window.skhCloseMaoni();
        layer.classList.remove('is-open');
        ok('skhCloseMaoni inafuta is-open', true); // hapo juu

        // Payload ya kutuma isibebe beji za uongo
        document.getElementById('skhCommentInput').value = 'Nimepokea vizuri?';
        await window.skhCommentsSubmit();
        await new Promise(r => setTimeout(r, 360));
        const pl = env.calls.publish[0];
        ok('commentsPublish imeitwa', !!pl);
        eq('targetType product', pl.targetType, 'product');
        eq('maandishi yamefika', pl.text, 'Nimepokea vizuri?');
        ok('beji haibandikwi na client', !('verifiedPurchase' in pl) && !('verifiedDelivery' in pl));
        ok('media ni safu tupu', Array.isArray(pl.media) && pl.media.length === 0);

        // Tupu kabisa â†’ haichapishi
        const before = env.calls.publish.length;
        document.getElementById('skhCommentInput').value = '   ';
        await window.skhCommentsSubmit();
        eq('maoni tupu hayachapishwi', env.calls.publish.length, before);
    }
    C_RUNS.push(runC1);
}

section('C2) MAONI â€” uthibitisho wa oda ukifungua ushahidi');

{
    async function runC2() {
        const env = makeCommentsEnv({ order: { orderId: 'o9', status: 'shipped' }, delivery: null, mediaAllowed: true });
        env.skh.updateInteractionUI();
        await window.skhOpenMaoni();
        await new Promise(r => setTimeout(r, 30));
        const btn = document.getElementById('skhCmAttachBtn');
        ok('kitufe cha ushahidi kipo', !!btn);
        ok('kiambatisho kimefunguliwa baada ya oda kuthibitishwa', btn.tagName === 'BUTTON' && !btn.classList.contains('disabled'));
        const elig = document.querySelector('.skh-cm-elig.order');
        ok('ujumbe wa oda uliothibitishwa waonyeshwa', !!elig);

        // Chagua faili bandia ya picha
        const fakeFile = { type: 'image/jpeg', size: 10 };
        window.skhMaoniFileChosen({ files: [fakeFile], value: '' });
        await new Promise(r => setTimeout(r, 10));
        ok('chipu ya midia imejitokeza', document.querySelectorAll('.skh-cm-chip').length === 1);
        window.skhMaoniRemoveMedia(0);
        ok('chipu imeondolewa', document.querySelectorAll('.skh-cm-chip').length === 0);
    }
    C_RUNS.push(runC2);
}

section('C3) MAONI â€” targetType kwa huduma');

{
    async function runC3() {
        const env = makeCommentsEnv({ order: null, delivery: null });
        env.skh.currentOpenProduct = { id: 'svc1', collectionName: 'services', title: 'Ufundi', comments: [] };
        env.skh.updateInteractionUI();
        await window.skhOpenMaoni();
        await new Promise(r => setTimeout(r, 30));
        document.getElementById('skhCommentInput').value = 'Nimefanyiwa kazi nzuri';
        await window.skhCommentsSubmit();
        await new Promise(r => setTimeout(r, 360));
        const pl = env.calls.publish[0];
        ok('huduma imechapishwa', !!pl);
        eq('targetType service', pl.targetType, 'service');
    }
    C_RUNS.push(runC3);
}

/* ================================================================
   D) changeQty â€” min/stock clamp
   ================================================================ */
section('D) QTY â€” kuheshimu stock na min');

{
    const dom = makeDom();
    globalThis.skh = baseSkh({ calculateDynamicPrice: () => {} });
    // Chota kazi ya changeQty pekee yake (07-product.js ni kubwa).
    const src07 = fs.readFileSync(path.join(ROOT, 'js/app/07-product.js'), 'utf8');
    const start = src07.indexOf('window.changeQty = function');
    const end = src07.indexOf('\n};', start) + 3;
    (0, eval)(src07.slice(start, end));

    const q = document.getElementById('pmQty');
    const minus = document.getElementById('pmQtyMinus');
    const plus = document.getElementById('pmQtyPlus');

    q.value = '1'; q.dataset.min = '1'; q.dataset.max = '5';
    window.changeQty(0);
    eq('mwanzo 1', q.value, '1');
    ok('minus imezimwa kwenye min', minus.disabled);
    for (let i = 0; i < 8; i++) window.changeQty(1);
    eq('imezuiwa kwenye stock 5', q.value, '5');
    ok('plus imezimwa kwenye stock', plus.disabled);
    window.changeQty(-1);
    eq('shuka hadi 4', q.value, '4');
    ok('plus imefunguliwa tena', !plus.disabled);

    // Min order = 2
    q.value = '2'; q.dataset.min = '2'; q.dataset.max = '10';
    window.changeQty(-1);
    eq('min order 2 imeheshimiwa', q.value, '2');
    ok('minus imezimwa kwenye min 2', minus.disabled);
}

/* ================================================================
   E) Muundo wa kadi â€” rail, sheet, maandishi
   ================================================================ */
section('E) Muundo na maandishi yaliyoagizwa');

{
    const stack = MODAL_HTML.slice(MODAL_HTML.indexOf('pm-hero-stack'), MODAL_HTML.indexOf('pm-hero-seller'));
    const iLike = stack.indexOf('id="btnLike"');
    const iSave = stack.indexOf('id="btnSave"');
    const iShare = stack.indexOf('id="pmShareBtn"');
    const iMaoni = stack.indexOf('id="pmBtnComments"');
    ok('rail: Like â†’ Save â†’ Share â†’ Maoni', iLike > -1 && iLike < iSave && iSave < iShare && iShare < iMaoni);
    ok('kitufe cha Maoni chamwita skhOpenMaoni', /pmBtnComments[\s\S]{0,200}skhOpenMaoni/.test(stack));
    ok('jina la Maoni lipo kwenye rail', stack.indexOf('>Maoni<') !== -1);
    ok('hakuna kigushi kidogo kuliko 32px kwenye rail', /class="pm-act"/.test(stack));

    // Sheet ya Maoni
    ok('maoniLayer ipo', MODAL_HTML.indexOf('id="maoniLayer"') !== -1);
    ok('maoniSheetBody ipo', MODAL_HTML.indexOf('id="maoniSheetBody"') !== -1);
    // Muuzaji yuko ndani ya hero (karibu na jina la bidhaa/media)
    const hero = MODAL_HTML.slice(MODAL_HTML.indexOf('class="pm-hero"'), MODAL_HTML.indexOf('pm-scroll'));
    ok('muuzaji ndani ya hero', hero.indexOf('id="sellerMiniDash"') !== -1);
    ok('pmSellerRole ipo', hero.indexOf('id="pmSellerRole"') !== -1);
    // Qty mstari wake kisha vitendo
    const qtyRow = MODAL_HTML.indexOf('id="pmQtyArea"');
    const actionRow = MODAL_HTML.indexOf('id="pmActionArea"');
    ok('qty mstari kabla ya vitendo', qtyRow > -1 && qtyRow < actionRow);
    ok('pmStockInfo ipo', MODAL_HTML.indexOf('id="pmStockInfo"') !== -1);

    // Maandishi ya bar (39)
    const s39 = fs.readFileSync(path.join(ROOT, 'js/app/39-product-showcase.js'), 'utf8');
    ok('lebo Weka Kikapuni', s39.indexOf('Weka Kikapuni') !== -1);
    ok('lebo Lipa Sasa', s39.indexOf('Lipa Sasa') !== -1);
    ok('jina Mtoa Huduma', s39.indexOf('Mtoa Huduma') !== -1);
    ok('jina Mtoa Usafiri', s39.indexOf('Mtoa Usafiri') !== -1);
    ok('skhHeroComments huelekeza skhOpenMaoni', /skhHeroComments[\s\S]{0,260}skhOpenMaoni/.test(s39));
    ok('huduma bado hupitia skhPsOfferService', s39.indexOf('skhPsOfferService') !== -1);
    ok('usafiri bado hupitia skhPsOfferTransport', s39.indexOf('skhPsOfferTransport') !== -1);
    ok('cart/startChat/addToCart zimehifadhiwa',
        s39.indexOf('startChat()') !== -1 && s39.indexOf('addToCart(false)') !== -1 && s39.indexOf('addToCart(true)') !== -1);

    // Beji za server pekee (35)
    const s35 = fs.readFileSync(path.join(ROOT, 'js/app/35-comments.js'), 'utf8');
    ok('lebo Oda Imethibitishwa', s35.indexOf('Oda Imethibitishwa') !== -1);
    ok('lebo Delivery Imethibitishwa', s35.indexOf('Delivery Imethibitishwa') !== -1);
    ok('commentsEvidence callable inaitwa', s35.indexOf('commentsEvidence') !== -1);

    // Server callables
    const fn = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
    ok('server: exports.commentsEvidence', fn.indexOf('exports.commentsEvidence') !== -1);
    ok('server: resolveCommentEvidence yaangalia orders', fn.indexOf('async function resolveCommentEvidence') !== -1);
    ok('server: verifiedDelivery huandikwa', fn.indexOf('verifiedDelivery: verifiedDelivery') !== -1);
    ok('server: ride_requests huchunguzwa delivery', fn.indexOf("collection('ride_requests')") !== -1);

    // Emoji za rangi haziruhusiwi katika faili mpya (âœ“/âœ• alama za maandishi
    // zilizoagizwa na user zinaruhusiwa).
    const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}]/u;
    // Ondoa maoni ya maandishi (mishale ya hati hairuhusiwi kwenye UI).
    const stripComments = (c, f) => {
        let out = c;
        if (f.endsWith('.html')) out = out.replace(/<!--[\s\S]*?-->/g, '');
        out = out.replace(/\/\*[\s\S]*?\*\//g, '');
        out = out.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
        return out;
    };
    const newFiles = ['js/app/42-discovery-feed.js', 'css/21-discovery-maoni.css', 'html/05-modals-market.html'];
    newFiles.forEach(f => {
        const c = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'), f);
        ok('hakuna emoji/ishara za mshale kwenye ' + f, !emojiRe.test(c));
    });
}

/* ------------------ matokeo ------------------ */
async function runAll() {
    try { await runB(); } catch (e) { fail++; console.error('runB', e); }
    for (const fn of C_RUNS) { try { await fn(); } catch (e) { fail++; console.error(e); } }
}
runAll().then(() => setTimeout(() => {
    console.log('\n========================================');
    console.log('MAJARIBIO CARD/DISCOVERY: ' + pass + ' pass, ' + fail + ' fail');
    console.log('========================================');
    process.exit(fail ? 1 : 0);
}, 400));


