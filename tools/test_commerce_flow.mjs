/* ============================================================
   SOKOHAI â€” Jaribio la MTIRIRIKO WA COMMERCE (Huduma/Usafiri + Comments)
   Huhakiki (jsdom):
   1. Vifungo vya detail vya HUDUMA/USAFIRI hufungua injini ya majadiliano
      (skhNegoFormOpen), si mifumo ya zamani (requests/direct-hire).
   2. Comments ni PANEL iliyofungwa kwa chaguo-msingi; icon/kichwa hufungua.
   Endesha: node tools/test_commerce_flow.mjs
   ============================================================ */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'http://localhost/', runScripts: 'dangerously' });
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;

Object.defineProperty(globalThis, 'navigator', {
    value: window.navigator,
    configurable: true,
    writable: true
});

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const skh = {
    db: {},
    currentUser: { uid: 'buyer1', displayName: 'Asha', email: 'a@x.co' },
    skhEscape: esc, skhJsEsc: esc,
    requireAuth: () => true,
    currentOpenProduct: null,
    collection: () => ({}), doc: () => ({}), query: () => ({}),
    where: () => ({}), orderBy: () => ({}), limit: () => ({}),
    onSnapshot: () => () => {},
    getDocs: async () => ({ forEach() {} }),
    getDoc: async () => ({ exists: false, data: () => ({}) }),
    setDoc: async () => {}, addDoc: async () => ({}), updateDoc: async () => {},
    httpsCallable: () => null
};
window.skh = skh;
globalThis.alert = window.alert = () => {};
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

async function loadApp(rel, tmpName) {
    let src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
        .replace("import { skh } from './00-bootstrap.js';", 'const skh = window.skh;');
    const tmp = path.join(ROOT, 'js/app', tmpName);
    fs.writeFileSync(tmp, src);
    await import(pathToFileURL(tmp).href);
    fs.unlinkSync(tmp);
}

// Markup ya modali ya bidhaa (kama html/05-modals-market.html)
window.document.body.innerHTML =
    '<div id="productModal"><div class="pm-sheet">'
    + '<div class="maoni-layer" id="maoniLayer" hidden><div class="maoni-scrim"></div>'
    + '<aside role="dialog"><h3 id="maoniTitle">Maoni</h3><div class="maoni-body" id="maoniSheetBody"></div></aside></div>'
    + '</div></div>';

await loadApp('js/app/39-product-showcase.js', '_tmp_showcase.mjs');
await loadApp('js/app/35-comments.js', '_tmp_comments.mjs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  âœ… ' + n); } else { fail++; console.log('  âŒ ' + n); } };

console.log('\n[1] HUDUMA â€” kitufe cha detail hufungua negotiation (si requests)');
{
    let opened = null, legacy = 0;
    window.skhNegoFormOpen = (o) => { opened = o; };
    window.openActionModal = () => { legacy++; };
    skh.currentOpenProduct = { id: 'srv1', collectionName: 'services', userId: 'prov1', title: 'Ushonaji' };
    window.skhPsOfferService();
    ok('skhNegoFormOpen imeitwa', !!opened);
    ok('aina ni service', opened && opened.type === 'service');
    ok('entity ni huduma iliyofunguliwa', opened && opened.entity && opened.entity.id === 'srv1');
    ok('mfumo wa zamani (requests) HAUKUITWA', legacy === 0);
}

console.log('\n[2] USAFIRI â€” kitufe cha detail hufungua negotiation (si direct-hire)');
{
    let opened = null, legacy = 0;
    window.skhNegoFormOpen = (o) => { opened = o; };
    window.openDirectHire = () => { legacy++; };
    skh.currentOpenProduct = { id: 'drv1', collectionName: 'ride_requests', userId: 'tr1', driverName: 'Juma Transport', vehicleType: 'Lori' };
    window.skhPsOfferTransport();
    ok('skhNegoFormOpen imeitwa', !!opened);
    ok('aina ni transport', opened && opened.type === 'transport');
    ok('entity ni safari iliyofunguliwa', opened && opened.entity && opened.entity.id === 'drv1');
    ok('direct-hire wa zamani HAUKUITWA', legacy === 0);
}

console.log('\n[3] MAONI â€” sheet hufunguka juu ya tangazo (si chini ya ukurasa)');
{
    const p = { id: 'p1', userId: 's1', title: 'Bidhaa' };
    skh.currentOpenProduct = p;
    await window.skhCommentsOpen(p);
    const root = window.document.getElementById('skhCommentsRoot');
    const layer = window.document.getElementById('maoniLayer');
    ok('root ya maoni imeundwa ndani ya sheet', !!root && root.parentElement.id === 'maoniSheetBody');
    ok('sheet imefichwa kabla ya kufunguliwa', layer.hidden === true);
    // Fungua
    await window.skhOpenMaoni();
    await new Promise(r => setTimeout(r, 30));
    ok('baada ya kufungua, layer haina hidden', layer.hidden === false);
    ok('baada ya kufungua, class is-open imewekwa', layer.classList.contains('is-open'));
    ok('composer waandaliwa ndani ya sheet', !!window.document.getElementById('skhCommentInput'));
    // Funga tena
    window.skhCloseMaoni();
    ok('kufunga kunaondoa is-open', !layer.classList.contains('is-open'));
    await new Promise(r => setTimeout(r, 260));
    ok('kufunga kunarudisha hidden', layer.hidden === true);
}

console.log('\n[4] MAONI â€” skhHeroComments na toggle huelekeza kwenye sheet');
{
    const layer = window.document.getElementById('maoniLayer');
    // skhHeroComments (kutoka 39) hupasua sheet
    await window.skhHeroComments();
    await new Promise(r => setTimeout(r, 30));
    ok('skhHeroComments hufungua sheet', layer.hidden === false && layer.classList.contains('is-open'));
    window.skhCloseMaoni();
    await new Promise(r => setTimeout(r, 260));
    // Toggle ya zamani nayo inafanya kazi kama alias
    window.skhCommentsToggle(true);
    await new Promise(r => setTimeout(r, 30));
    ok('skhCommentsToggle(true) hufungua sheet', layer.hidden === false);
    window.skhCommentsToggle(false);
    ok('skhCommentsToggle(false) hufunga sheet', !layer.classList.contains('is-open'));
}

console.log('\n==================================================');
console.log(`COMMERCE FLOW: ${pass} zimepita, ${fail} zimeshindwa`);
if (fail) process.exit(1);
console.log('âœ… HUDUMA/USAFIRI KUPITIA NEGOTIATION + COMMENTS PANEL SAHIHI');

