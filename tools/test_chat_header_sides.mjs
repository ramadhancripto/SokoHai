/* ============================================================
 * SOKOHAI â€” Jaribio la TOP BAR ya chat + pande za kadi za
 * biashara (jsdom).
 *  - Top bar nyembamba: kitufe KIMOJA cha kurudi (mshale), jina tu,
 *    menyu ya nukta tatu (Nyamazisha/Hifadhi/Zuia/Ripoti).
 *  - "anaandikaâ€¦" huonekana kwa maandishi madogo tu wakati wa kuandika.
 *  - Matukio ya negotiation hufuata upande wa aliyetenda (kijani kulia
 *    kwa mimi, buluu kushoto kwa mwenzangu) + jina/nafasi; ukumbusho wa
 *    maandishi wa mfumo husalia katikati.
 * Endesha:  node tools/test_chat_header_sides.mjs
 * ============================================================ */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

// Pakia sehemu halisi ya HTML ya modali za chat (header + composer).
const fragment = fs.readFileSync(path.join(ROOT, 'html/06-modals-social.html'), 'utf8');
const dom = new JSDOM('<!doctype html><html><body>' + fragment + '</body></html>',
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

const setDocs = {};
const convDocCbs = [];

const skh = {
    db: {}, fApp: {},
    currentUser: { uid: 'buyer1', displayName: 'Asha', email: 'a@x.co' },
    skhEscape: esc, skhJsEsc: esc,
    requireAuth: () => true,
    chatCore: null, negoCurrent: null, negoOrder: null,
    myCart: [], functionsDown: false,
    icon: (n) => `<svg data-icon="${n}"></svg>`,
    toast: () => {}, T: (k, f) => f,
    collection: (db, p) => ({ _path: p }),
    doc: (db, c, id) => ({ _col: c, _id: id }),
    query: () => ({}), where: () => ({}), orderBy: () => ({}), limit: () => ({}),
    onSnapshot: (ref, cb) => {
        if (ref && ref._col === 'conversations') convDocCbs.push(cb);
        return () => {};
    },
    getDocs: async () => ({ empty: true, forEach() {}, docs: [] }),
    getDoc: async (ref) => {
        if (ref._col === 'chatBlocks' && setDocs[ref._col + '/' + ref._id]) {
            return { exists: () => true, data: () => setDocs[ref._col + '/' + ref._id] };
        }
        return { exists: () => false, data: () => ({}) };
    },
    setDoc: async (ref, data) => { setDocs[ref._col + '/' + ref._id] = data; },
    addDoc: async () => ({ id: 'newdoc' }),
    updateDoc: async () => {}, deleteDoc: async () => {},
    wrapCallable: null, httpsCallable: null, getFunctions: () => ({})
};
window.skh = skh;
globalThis.alert = window.alert = () => {};
globalThis.confirm = window.confirm = () => true;
globalThis.customPrompt = window.customPrompt = (t, h, cb) => cb && cb('tahadhari ya maudhui');
globalThis.closeModals = window.closeModals = () => {};
globalThis.renderChatStream = window.renderChatStream = () => {};
window.skhNavIcon = (name) => `<svg data-ic="${name}"></svg>`;

async function loadApp(rel, outName) {
    let src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
        .replace("import { skh } from './00-bootstrap.js';", 'const skh = window.skh;');
    const tmp = path.join(ROOT, 'js/app', outName);
    fs.writeFileSync(tmp, src);
    await import(pathToFileURL(tmp).href + '?t=' + Date.now() + Math.random());
    fs.unlinkSync(tmp);
}
await loadApp('js/app/37-negotiation.js', '_tmp_eng.mjs');
await loadApp('js/app/34-chat-core.js', '_tmp_chat.mjs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  âœ… ' + n); } else { fail++; console.log('  âŒ ' + n); } };
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

console.log('\n[1] Muundo wa TOP BAR (header nyembamba)');
{
    const bar = $('.chat-head-bar');
    ok('header ipo', !!bar);
    const back = $('#chatBackBtn');
    ok('kitufe cha kurudi (mshale) kipo', !!back);
    ok('kina SVG ya mshale', !!back.querySelector('svg'));
    // Hakuna kitufe cha pili cha kufunga (âœ•) ndani ya header.
    const closeBtns = $$('.chat-head-bar button').filter(b => /closeModals/.test(b.getAttribute('onclick') || ''));
    ok('hakuna kitufe cha pili cha âœ•/closeModals', closeBtns.length === 0);
    const navBtns = [$('#chatBackBtn'), $('#chatSearchBtn'), $('#chatMenuBtn')].filter(Boolean);
    ok('vitufe vya navigation ni vitatu (rudi + search + menyu)', navBtns.length === 3);
    ok('jina lipo (#chatWith)', !!$('#chatWith'));
    ok('sub ya kichwa imeanza tupu (jina tu)', ($('#chatSub') || {}).textContent === '');
    ok('kitufe cha menyu ya dots tatu kipo', !!$('#chatMenuBtn'));
    const menu = $('#chatHeadMenu');
    ok('menyu imefichwa mwanzoni', !!menu && menu.hidden);
    ['chatMenuMute', 'chatMenuArchive', 'chatMenuBlock', 'chatMenuReport'].forEach(function (id) {
        ok('kipengele cha menyu: ' + id, !!document.getElementById(id));
    });
    // Hakuna emoji za kawaida ndani ya header
    ok('header haina emoji', !/[\u{1F300}-\u{1FAFF}]/u.test(bar.textContent));
}

console.log('\n[2] Fungua mazungumzo â€” jina + menyu inafanya kazi');
{
    await window.skhChatOpen('seller1', 'Duka la Mbeya', { email: 's@x.co' });
    ok('jina la mwenzako limeandikwa', $('#chatWith').textContent === 'Duka la Mbeya');
    const menu = $('#chatHeadMenu');
    $('#chatMenuBtn').click();
    ok('kubofya dots tatu kunafungua menyu', menu.hidden === false);
    // Icons za SVG kwenye vipengele
    ok('kila kipengele kina SVG', $$('#chatHeadMenu .ch-hm-ic').every(ic => !!ic.querySelector('svg')));
    // Kubofya kando kuifunge
    document.body.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    ok('kubofya nje kunafunga menyu', menu.hidden === true);
    // Zuia kupitia menyu â†’ lebo yabadilika
    $('#chatMenuBtn').click();
    $('#chatMenuBlock').click();
    await new Promise(r => setTimeout(r, 60));
    ok('kubofya Zuia kunaandika chatBlock', !!setDocs['chatBlocks/buyer1__seller1']);
    ok('lebo yageuka "Ondoa Mzuio"', /Ondoa Mzuio/i.test($('#chatMenuBlockLbl').textContent));
}

console.log('\n[3] Kiashiria cha "anaandikaâ€¦" kwa maandishi madogo tu');
{
    const sub = $('#chatSub');
    // Piga callback ya conversation snapshot na typing ya hivi karibuni.
    const typingSnap = { exists: () => true, data: () => ({ typing: { uid: 'seller1', at: new Date().toISOString() } }) };
    convDocCbs.forEach(cb => { try { cb(typingSnap); } catch (e) {} });
    ok('sub inaonyesha anaandika', sub.textContent.indexOf('anaandika') !== -1);
    const idleSnap = { exists: () => true, data: () => ({ typing: null }) };
    convDocCbs.forEach(cb => { try { cb(idleSnap); } catch (e) {} });
    ok('sub inarudi tupu asipoandika', sub.textContent.trim() === '');
}

console.log('\n[4] Kadi za negotiation zinafuata UPANDE wa aliyetenda');
{
    function negoMsg(id, sender, state, actor) {
        return {
            id: id, senderId: sender, system: true, type: 'negotiation',
            negotiationId: 'nego_' + id,
            negotiationSnapshot: {
                negotiationId: 'nego_' + id, commerceType: 'product', currentState: state,
                productTitle: 'Mchele 25kg', buyerId: 'buyer1', sellerId: 'seller1',
                quantity: 2, currentUnitPrice: 70000, currentTotal: 140000,
                lastActorId: actor, version: 1, history: [{ actorId: actor }]
            },
            createdAt: new Date().toISOString(), readBy: []
        };
    }
    function textSys(id) {
        return { id: id, senderId: 'system', system: true, type: 'text', text: 'Muda wa ofa umeongezwa.', createdAt: new Date().toISOString() };
    }
    skh.chatCore = {
        convId: 'c1', partnerUid: 'seller1', partnerName: 'Duka la Mbeya',
        conv: {}, msgs: [
            negoMsg('m1', 'buyer1', 'OFFER_SENT', 'buyer1'),
            negoMsg('m2', 'seller1', 'COUNTER_OFFER', 'seller1'),
            textSys('m3')
        ]
    };
    skh.negoCurrent = null;
    window.skhChatRenderStream();
    const events = $$('.ch-msg-event');
    ok('matukio mawili ya kadi yamepakwa upande', events.length === 2);
    const mine = document.querySelector('.ch-msg-event[data-mine="1"]');
    const theirs = document.querySelector('.ch-msg-event[data-mine="0"]');
    ok('ofa yangu upande wa kulia (data-mine=1)', !!mine);
    ok('counter ya muuzaji upande wa kushoto (data-mine=0)', !!theirs);
    ok('kadi yangu ina bango la kijani na "Wewe"', mine && mine.querySelector('.ch-event-card .ch-nego-event') && /Wewe/.test(mine.querySelector('.ch-event-cap').textContent));
    ok('kadi yao ina jina la duka na nafasi Muuzaji', theirs && /Duka la Mbeya/.test(theirs.querySelector('.ch-event-cap').textContent) && /Muuzaji/.test(theirs.querySelector('.ch-event-cap').textContent));
    // Ukumbusho wa maandishi wa mfumo husalia katikati
    const centered = $$('.ch-msg-system');
    ok('ukumbusho wa maandishi wa mfumo umesalia katikati', centered.length >= 1);
}

console.log('\nMATOKEO: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);

