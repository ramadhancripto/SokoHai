/**
 * tools/test_service_editing_part4b.mjs
 * PART 4 FOLLOW-UP — KUHARIRI HUDUMA ILIYOPO (K-7) + umiliki wa uchapishaji.
 *
 * Test hii inaendesha KODI HALISI:
 *  - mantiki safi kutoka js/app/39-service-edit-core.js (import halisi),
 *  - kazi halisi za fomu (`updateHubCategories`, `updateHubSubcategories`,
 *    `generateHubServiceFilters`, `skhServiceEditOpen`) zilizosomwa kutoka
 *    js/app/19-roles.js na kuendeshwa ndani ya jsdom juu ya MARKUP HALISI
 *    wa html/10-form-agent.html.
 *
 * Endesha: node tools/test_service_editing_part4b.mjs
 */
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import * as core from '../js/app/39-service-edit-core.js';

let passed = 0, failed = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; fails.push(name); console.log(`  FAIL  ${name}${extra !== undefined ? ' → ' + extra : ''}`); }
}
function t(name, fn) {
  try { fn(); } catch (e) { failed++; fails.push(name); console.log(`  FAIL  ${name} → ${e.message}`); }
}
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const roles = read('js/app/19-roles.js').replace(/\r\n/g, '\n');
const hub = read('js/app/16-pos-admin-jobs.js');
const formHtml = read('html/10-form-agent.html');

/* ---------- extraction ya kazi halisi (brace matching) ---------- */
function sliceFn(src, header) {
  const i = src.indexOf(header);
  if (i === -1) throw new Error('haipo: ' + header);
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
  }
  throw new Error('haijafungwa: ' + header);
}

/* ============================ §1 mantiki safi ============================ */
console.log('\n§1 serviceEditSnapshot — kujaza sehemu zote zilizohifadhiwa');
const savedDoc = {
  id: 'svc1',
  title: 'Umeme wa Nyumba',
  groupType: 'physical',
  category: 'Umeme',
  subCategory: 'Installation',
  price: 120000,
  pricingModel: 'per_job',
  availabilityStatus: 'available_today',
  travelAvailable: true,
  negotiationAllowed: false,
  description: 'Tunafanya wiring kamili.',
  location: 'Kimara, DSM',
  countryCode: 'TZ',
  region: 'Dar es Salaam',
  image: 'https://cdn.example/x.jpg',
  filters: { 'Ukubwa wa nyumba': '3 bedrooms', 'Aina ya waya': '2.5mm' },
  userId: 'u1',
  createdAt: '2026-01-01T00:00:00.000Z',
  status: 'active',
  publicationStatus: 'published'
};
const snap = core.serviceEditSnapshot(savedDoc);
t('sehemu zote za fomu zinajazwa', () => {
  ok('title', snap.title === 'Umeme wa Nyumba');
  ok('groupType', snap.groupType === 'physical');
  ok('category', snap.category === 'Umeme');
  ok('subCategory', snap.subCategory === 'Installation');
  ok('price', snap.price === '120000');
  ok('pricingModel', snap.pricingModel === 'per_job');
  ok('availabilityStatus', snap.availabilityStatus === 'available_today');
  ok('travelAvailable', snap.travelAvailable === true);
  ok('negotiationAllowed=false imehifadhiwa', snap.negotiationAllowed === false);
  ok('description', snap.description === 'Tunafanya wiring kamili.');
  ok('location', snap.location === 'Kimara, DSM');
  ok('countryCode/region', snap.countryCode === 'TZ' && snap.region === 'Dar es Salaam');
  ok('image', snap.image === 'https://cdn.example/x.jpg');
});
t('vigezo vya taxonomy vinajazwa', () => {
  ok('filters 2', Object.keys(snap.filters).length === 2);
  ok('thamani halisi', snap.filters['Ukubwa wa nyumba'] === '3 bedrooms' && snap.filters['Aina ya waya'] === '2.5mm');
});
t('data ya zamani inasomwa kwa upole', () => {
  const legacy = core.serviceEditSnapshot({ id: 'l1', title: 'Fundi', section: 'online', priceType: 'hourly', price: '5000' });
  ok("section -> groupType", legacy.groupType === 'online');
  ok("priceType -> pricingModel", legacy.pricingModel === 'hourly');
  ok("price string -> '5000'", legacy.price === '5000');
  ok('negotiationAllowed default ON', legacy.negotiationAllowed === true);
});
t('hakuna kubuni: hati tupu inatoa thamani tupu', () => {
  const e = core.serviceEditSnapshot({ id: 'x' });
  ok('price tupu', e.price === '');
  ok('filters tupu', Object.keys(e.filters).length === 0);
  ok('countryCode tupu', e.countryCode === '');
});
t('hali ya uchapishaji inasomwa kwa maonyesho pekee', () => {
  ok('published', core.serviceEditSnapshot({ id: 'x', status: 'active' }).publicationLabel === 'published');
  ok('draft = suspended', core.serviceEditSnapshot({ id: 'x', status: 'draft' }).publicationLabel === 'suspended');
  ok('suspended', core.serviceEditSnapshot({ id: 'x', publicationStatus: 'suspended' }).publicationLabel === 'suspended');
});

/* ============================ §2 patch ============================ */
console.log('\n§2 buildServiceUpdate — update kwenye hati ILE ILE');
const now = '2026-11-24T10:00:00.000Z';
const built = core.buildServiceUpdate(core.serviceEditSnapshot(savedDoc), savedDoc, now);
t('patch inajengwa', () => ok('ok', built.ok === true && !!built.patch));
t('HAIWEZI kubadilisha hali ya uchapishaji / umiliki / tarehe', () => {
  ok('hakuna status', !('status' in built.patch));
  ok('hakuna publicationStatus', !('publicationStatus' in built.patch));
  ok('hakuna userId', !('userId' in built.patch));
  ok('hakuna createdAt', !('createdAt' in built.patch));
  ok('hakuna id', !('id' in built.patch));
  ok('ina updatedAt', built.patch.updatedAt === now);
});
t('hali ya draft/imesimamishwa inabaki baada ya kuunganisha patch', () => {
  const draftDoc = Object.assign({}, savedDoc, { status: 'draft', publicationStatus: 'draft' });
  const b = core.buildServiceUpdate(core.serviceEditSnapshot(draftDoc), draftDoc, now);
  const merged = Object.assign({}, draftDoc, b.patch);
  ok('status bado draft', merged.status === 'draft');
  ok('publicationStatus bado draft', merged.publicationStatus === 'draft');
  const susp = Object.assign({}, savedDoc, { status: 'suspended' });
  const b2 = core.buildServiceUpdate(core.serviceEditSnapshot(susp), susp, now);
  ok('suspended inabaki', Object.assign({}, susp, b2.patch).status === 'suspended');
});
t('picha ya zamani haiondolewi kimya kimya', () => {
  const b = core.buildServiceUpdate(Object.assign(core.serviceEditSnapshot(savedDoc), { image: '' }), savedDoc, now);
  ok('image ya zamani inabaki', b.patch.image === 'https://cdn.example/x.jpg');
  const b2 = core.buildServiceUpdate(Object.assign(core.serviceEditSnapshot(savedDoc), { image: 'https://cdn.example/new.jpg' }), savedDoc, now);
  ok('picha mpya inachukua nafasi', b2.patch.image === 'https://cdn.example/new.jpg');
});
t('nchi/mkoa halisi inabaki', () => {
  const noC = Object.assign(core.serviceEditSnapshot(savedDoc), { countryCode: '', region: '' });
  const b = core.buildServiceUpdate(noC, savedDoc, now);
  ok('countryCode ya zamani inabaki', b.patch.countryCode === 'TZ' && b.patch.region === 'Dar es Salaam');
});

/* ============================ §3 validation ============================ */
console.log('\n§3 validateServiceUpdate — sehemu za lazima');
t('huduma kamili inapita', () => ok('0 errors', core.validateServiceUpdate(core.serviceEditSnapshot(savedDoc)).length === 0));
t('sehemu tupu zinakamatwa', () => {
  const bad = Object.assign(core.serviceEditSnapshot(savedDoc), { title: ' ', category: '', subCategory: '', description: '', location: '' });
  const errs = core.validateServiceUpdate(bad);
  ['title', 'category', 'subCategory', 'description', 'location'].forEach(k => ok(k, errs.includes(k)));
});
t('bei inahitajika isipokuwa makadirio/inajadiliwa', () => {
  const noPrice = Object.assign(core.serviceEditSnapshot(savedDoc), { price: '', pricingModel: 'fixed' });
  ok('fixed inahitaji bei', core.validateServiceUpdate(noPrice).includes('price'));
  ok('quotation_required hairuhusiwi kuzuiwa', !core.validateServiceUpdate(Object.assign({}, noPrice, { pricingModel: 'quotation_required' })).includes('price'));
  ok('negotiable hairuhusiwi kuzuiwa', !core.validateServiceUpdate(Object.assign({}, noPrice, { pricingModel: 'negotiable' })).includes('price'));
});
t('kundi lisilo halali linakamatwa', () => ok('groupType', core.validateServiceUpdate(Object.assign(core.serviceEditSnapshot(savedDoc), { groupType: 'unknown' })).includes('groupType')));
t('build inakataa ikiwa kuna makosa (hakuna patch)', () => {
  const b = core.buildServiceUpdate(Object.assign(core.serviceEditSnapshot(savedDoc), { title: '' }), savedDoc, now);
  ok('ok:false', b.ok === false && b.patch === null);
});

/* ============================ §4 umiliki ============================ */
console.log('\n§4 serviceEditGuard — mmiliki pekee');
t('mmiliki anaruhusiwa', () => ok('ok', core.serviceEditGuard(savedDoc, 'u1').ok === true));
t('mtoa huduma mwingine haruhusiwi', () => {
  const g = core.serviceEditGuard(savedDoc, 'u2');
  ok('forbidden', g.ok === false && g.error === 'forbidden');
});
t('hati isiyo na mmiliki hairuhusiwi', () => ok('no_owner', core.serviceEditGuard({ id: 'x' }, 'u1').error === 'no_owner'));
t('bila kuingia haruhusiwi', () => ok('auth', core.serviceEditGuard(savedDoc, '').error === 'auth'));
t('hati isiyopo', () => ok('missing', core.serviceEditGuard(null, 'u1').error === 'missing'));

/* ============================ §5 double submit ============================ */
console.log('\n§5 serviceSubmitGate — kutuma mara mbili');
t('hali tupu inapita', () => ok('not blocked', core.serviceSubmitGate({}, 1000).blocked === false));
t('wakiwa busy inazuiwa', () => ok('busy', core.serviceSubmitGate({ busy: true }, 1000).blocked === true && core.serviceSubmitGate({ busy: true }, 1000).reason === 'busy'));
t('mafanikio ya karibuni yanazuiwa', () => {
  const st = { lastOkAt: 1000 };
  ok('ndani ya dirisha', core.serviceSubmitGate(st, 1500).blocked === true);
  ok('baada ya dirisha', core.serviceSubmitGate(st, 9000).blocked === false);
});

/* ============================ §6 makosa ya update ============================ */
console.log('\n§6 serviceUpdateErrorText — taarifa za kweli');
t('permission-denied', () => ok('ruhusa', /Hauna ruhusa/.test(core.serviceUpdateErrorText({ code: 'permission-denied' }))));
t('not-found', () => ok('haipo', /haipo tena/.test(core.serviceUpdateErrorText({ code: 'not-found' }))));
t('mtandao', () => ok('HAYAKUHIFADHIWA', /HAYAKUHIFADHIWA/.test(core.serviceUpdateErrorText({ code: 'unavailable' }))));
t('kosa lingine linaonyesha chanzo', () => ok('message', /Imeshindwa kuhifadhi mabadiliko/.test(core.serviceUpdateErrorText({ message: 'boom' }))));

/* ============================ §7 hydration kwenye fomu HALISI (jsdom) ============================ */
console.log('\n§7 Hydration kwenye markup HALISI wa html/10-form-agent.html');

const dom = new JSDOM('<!doctype html><html><body>' + formHtml + '</body></html>', { url: 'http://localhost/' });
const { window } = dom;
const doc = window.document;

// taxonomy halisi ya kutosha kwa kundi physical
const taxo = {
  physical: {
    'Umeme': {
      'Installation': { filters: ['Ukubwa wa nyumba', 'Aina ya waya'] },
      'Repair': { filters: ['Aina ya hitilafu'] }
    },
    'Plumbing': { 'Mabomba': { filters: [] } }
  },
  online: { 'Design': { 'Logo': { filters: ['Mtindo'] } } }
};

const alerts = [];
const created = [];
const skhStub = {
  serviceDataMap: taxo,
  currentUser: { uid: 'u1' },
  requireAuth: () => true,
  db: {},
  doc: (db, col, id) => ({ col, id }),
  getDoc: async () => ({ exists: () => true, data: () => savedDoc }),
  updateDoc: async (ref, patch) => { created.push({ ref, patch }); },
  saveData: async () => { throw new Error('saveData HAIPASWI kuitwa kwenye uhariri'); },
  _feedCache: { clear() {} }
};

window.skh = skhStub;
window.showForm = () => {};
window.alert = m => alerts.push(String(m));
window.closeModals = () => {};
window.skhRefreshHomeListings = async () => {};
window.loadHubDetailedMyServices = async () => {};
window.uploadImage = async () => '';
Object.assign(window, { Event: window.Event });

// endesha kazi HALISI kutoka 19-roles.js ndani ya window ya jsdom
const realCode = [
  sliceFn(roles, 'window.updateHubCategories = function'),
  sliceFn(roles, 'window.updateHubSubcategories = function'),
  sliceFn(roles, 'window.generateHubServiceFilters = function'),
  'const SERVICE_EDIT = { id: null, doc: null, busy: false, lastOkAt: 0, original: null };',
  'window.__skhServiceEditState = SERVICE_EDIT;',
  sliceFn(roles, 'function svcEl(id)'),
  sliceFn(roles, 'function svcSet(id, value)'),
  sliceFn(roles, 'function svcCheck(id, on)'),
  sliceFn(roles, 'function svcFormShell()'),
  sliceFn(roles, 'function svcSetFormMode(on, title)'),
  sliceFn(roles, 'window.skhServiceEditCancel = function'),
  sliceFn(roles, 'window.skhServiceEditOpen = async function')
].join('\n');

new Function('window', 'document', 'skh', 'Event', 'serviceEditGuard', 'serviceEditSnapshot', 'alert', realCode)(
  window, doc, skhStub, window.Event, core.serviceEditGuard, core.serviceEditSnapshot, window.alert
);

const $ = id => doc.getElementById(id);

await window.skhServiceEditOpen('svc1');

t('sehemu rahisi zimejazwa', () => {
  ok('title', $('servHubTitle').value === 'Umeme wa Nyumba');
  ok('price', $('servHubPrice').value === '120000');
  ok('pricingModel', $('servPricingModel').value === 'per_job');
  ok('availability', $('servAvailability').value === 'available_today');
  ok('description', $('servHubDesc').value === 'Tunafanya wiring kamili.');
  ok('location', $('servHubLocation').value === 'Kimara, DSM');
  ok('travelAvailable', $('servTravelAvailable').checked === true);
  ok('negotiationAllowed=false', $('servNegoAllowed').checked === false);
});
t('mnyororo wa taxonomy umejengwa kwa mpangilio sahihi', () => {
  ok('groupType', $('servGroupType').value === 'physical');
  const cats = Array.from($('servHubCategory').options).map(o => o.value);
  ok('kategoria za kundi zimejazwa', cats.includes('Umeme') && cats.includes('Plumbing'), cats.join(','));
  ok('kategoria iliyohifadhiwa imechaguliwa', $('servHubCategory').value === 'Umeme');
  const subs = Array.from($('servHubSubCategory').options).map(o => o.value);
  ok('aina ndogo zimejazwa', subs.includes('Installation') && subs.includes('Repair'), subs.join(','));
  ok('aina ndogo iliyohifadhiwa imechaguliwa', $('servHubSubCategory').value === 'Installation');
});
t('vigezo vya taxonomy vimejazwa kutoka hati', () => {
  ok('sanduku la vigezo linaonekana', $('hubServiceFiltersBox').style.display === 'block');
  const inputs = Array.from(doc.querySelectorAll('#hubServiceFiltersArea .hub-service-filter-input'));
  ok('vigezo 2', inputs.length === 2, String(inputs.length));
  const byKey = {};
  inputs.forEach(i => { byKey[i.getAttribute('data-filter')] = i.value; });
  ok('thamani ya kigezo 1', byKey['Ukubwa wa nyumba'] === '3 bedrooms', JSON.stringify(byKey));
  ok('thamani ya kigezo 2', byKey['Aina ya waya'] === '2.5mm', JSON.stringify(byKey));
});
t('fomu inaonyesha hali ya uhariri (bila kuunda mpya)', () => {
  ok('kichwa "Hariri Huduma"', /Hariri Huduma/.test(doc.querySelector('#serviceForm h3').innerHTML));
  ok('kitufe "HIFADHI MABADILIKO"', /HIFADHI MABADILIKO/.test($('btnSubmitHubService').innerHTML));
  ok('taarifa ya uhariri', !!$('serviceEditNote') && /haitabadilika/.test($('serviceEditNote').textContent));
  ok('hali ya uhariri imewekwa', window.__skhServiceEditState.id === 'svc1');
});
t('kuanzisha huduma mpya kunatolewa hali ya uhariri', () => {
  window.skhServiceEditCancel();
  ok('id imetolewa', window.__skhServiceEditState.id === null);
  ok('kichwa kimerudishwa', /Sajili Huduma Mpya/.test(doc.querySelector('#serviceForm h3').innerHTML));
  ok('taarifa imeondolewa', !$('serviceEditNote'));
  ok('fomu imesafishwa', $('servHubTitle').value === '');
});
async function asyncTest(name, fn) {
  try { await fn(); } catch (e) { failed++; fails.push(name); console.log(`  FAIL  ${name} → ${e.message}`); }
}
await asyncTest('mtoa huduma mwingine hawezi kufungua uhariri', async () => {
  const before = alerts.length;
  skhStub.getDoc = async () => ({ exists: () => true, data: () => savedDoc });   // userId = u1
  skhStub.currentUser = { uid: 'u2' };
  await window.skhServiceEditOpen('svc1');
  ok('amezuiwa', alerts.slice(before).some(a => /si yako/.test(a)), JSON.stringify(alerts.slice(before)));
  ok('hali ya uhariri haijawekwa', window.__skhServiceEditState.id === null);
  skhStub.currentUser = { uid: 'u1' };
});
await asyncTest('huduma isiyopo inatoa taarifa ya kweli', async () => {
  const before = alerts.length;
  skhStub.getDoc = async () => ({ exists: () => false, data: () => ({}) });
  await window.skhServiceEditOpen('gone');
  ok('haipo tena', alerts.slice(before).some(a => /haipo tena/.test(a)), JSON.stringify(alerts.slice(before)));
  ok('hali ya uhariri haijawekwa', window.__skhServiceEditState.id === null);
});

/* ============================ §8 wiring ya submit ============================ */
console.log('\n§8 Wiring: update, si kuunda pili');
t('tawi la uhariri linatumia updateDoc (si saveData/addDoc)', () => {
  const iEdit = roles.indexOf("if (SERVICE_EDIT.id) {\n            const built = buildServiceUpdate(");
  ok('tawi lipo', iEdit !== -1);
  const block = roles.slice(iEdit, iEdit + 900);
  ok('updateDoc', block.includes('skh.updateDoc(skh.doc(skh.db, \'services\', SERVICE_EDIT.id)'));
  ok('hakuna addDoc/saveData humo', !/addDoc|saveData/.test(block));
  ok('inafunga kwa hati ile ile (id ya uhariri)', block.includes('SERVICE_EDIT.id'));
});
t('hakuna hati mpya inayoundwa wakati wa uhariri', () => {
  ok('buildServiceUpdate haitoi id', !('id' in built.patch));
  ok('saveData iko kwenye tawi la kuunda tu', roles.indexOf("await skh.saveData('services'") > roles.indexOf('if (SERVICE_EDIT.id) {\n            const built = buildServiceUpdate('));
});
t('kizuizi cha kutuma mara mbili kimewekwa', () => {
  ok('serviceSubmitGate inatumika', roles.includes('if (serviceSubmitGate(SERVICE_EDIT, Date.now()).blocked) return;'));
  ok('busy inawekwa/inaachiliwa', roles.includes('SERVICE_EDIT.busy = true;') && roles.includes('SERVICE_EDIT.busy = false;'));
  ok('kitufe kinazimwa', roles.includes('btn.disabled = true;'));
});
t('makosa ya update yanaripotiwa kwa ukweli', () => ok('serviceUpdateErrorText', roles.includes('serviceUpdateErrorText(e)')));
t('mafanikio yanathibitisha status haijabadilishwa', () => ok('ujumbe', /haijabadilishwa/.test(roles)));
t('orodha ya Huduma Zangu ina kitufe cha Hariri', () => ok('Hariri', hub.includes('skhServiceEditOpen') && hub.includes('>Hariri</button>')));
t('"Ongeza Huduma" inatolewa hali ya uhariri kwanza', () => ok('skhServiceFormNew', hub.includes('(window.skhServiceFormNew || showForm)')));
t('hakuna fomu ya pili ya huduma', () => {
  const forms = (formHtml.match(/id="serviceForm"/g) || []).length;
  ok('fomu moja tu', forms === 1);
  ok('hakuna serviceEditForm', !fs.readFileSync(new URL('../html/10-form-agent.html', import.meta.url), 'utf8').includes('serviceEditForm'));
});

/* ============================ §9 umiliki wa uchapishaji ============================ */
console.log('\n§9 skhSetServicePublication — mmiliki pekee, hali zinabaki sahihi');
const pubAlerts = [];
const writes = [];
const pubStub = {
  currentUser: { uid: 'u1' },
  db: {},
  doc: (db, col, id) => ({ col, id }),
  getDoc: async () => ({ exists: () => true, data: () => ({ userId: 'u1', status: 'active', title: 'X' }) }),
  updateDoc: async (ref, patch) => { writes.push({ ref, patch }); },
  _feedCache: { clear() {} }
};
const pubWin = { skh: pubStub, skhConfirm: async () => true, alert: m => pubAlerts.push(String(m)), loadHubDetailedMyServices: async () => {} };
pubWin.window = pubWin;
new Function('window', 'skh', 'alert', sliceFn(hub, 'window.skhSetServicePublication = async function'))(pubWin, pubStub, pubWin.alert);
const setPub = pubWin.skhSetServicePublication;

await asyncTest('mmiliki anasimamisha: patch ina sehemu 3 pekee', async () => {
  writes.length = 0;
  await setPub('svc1', 'draft');
  ok('write moja', writes.length === 1, String(writes.length));
  const keys = Object.keys(writes[0].patch).sort().join(',');
  ok('sehemu: publicationStatus,status,updatedAt', keys === 'publicationStatus,status,updatedAt', keys);
  ok("draft", writes[0].patch.publicationStatus === 'draft' && writes[0].patch.status === 'draft');
});
await asyncTest('mmiliki anachapisha tena', async () => {
  writes.length = 0;
  await setPub('svc1', 'published');
  ok("published -> status active", writes[0].patch.publicationStatus === 'published' && writes[0].patch.status === 'active');
});
await asyncTest('mtoa huduma MWINGINE hawezi kubadilisha', async () => {
  writes.length = 0;
  pubStub.currentUser = { uid: 'u2' };
  const before = pubAlerts.length;
  await setPub('svc1', 'draft');
  ok('hakuna write', writes.length === 0);
  ok('taarifa ya kweli', pubAlerts.slice(before).some(a => /si yako/.test(a)), JSON.stringify(pubAlerts.slice(before)));
  pubStub.currentUser = { uid: 'u1' };
});
await asyncTest('hati isiyo na mmiliki haibadilishwi', async () => {
  writes.length = 0;
  const oldGet = pubStub.getDoc;
  pubStub.getDoc = async () => ({ exists: () => true, data: () => ({ title: 'legacy' }) });
  const before = pubAlerts.length;
  await setPub('svcLegacy', 'draft');
  ok('hakuna write', writes.length === 0);
  ok('haina mmiliki', pubAlerts.slice(before).some(a => /haina mmiliki/.test(a)));
  pubStub.getDoc = oldGet;
});
await asyncTest('hati isiyopo haibadilishwi', async () => {
  writes.length = 0;
  const oldGet = pubStub.getDoc;
  pubStub.getDoc = async () => ({ exists: () => false, data: () => ({}) });
  const before = pubAlerts.length;
  await setPub('gone', 'draft');
  ok('hakuna write', writes.length === 0);
  ok('haipo tena', pubAlerts.slice(before).some(a => /haipo tena/.test(a)));
  pubStub.getDoc = oldGet;
});
await asyncTest('kuandika kushindwa kunaripotiwa (hakuna kudai mafanikio)', async () => {
  writes.length = 0;
  const oldUpd = pubStub.updateDoc;
  pubStub.updateDoc = async () => { throw new Error('permission-denied'); };
  const before = pubAlerts.length;
  await setPub('svc1', 'draft');
  ok('taarifa ya kosa', pubAlerts.slice(before).some(a => /Imeshindwa kubadili hali/.test(a) && /permission-denied/.test(a)), JSON.stringify(pubAlerts.slice(before)));
  pubStub.updateDoc = oldUpd;
});
await asyncTest('kughairi confirmation hakuandiki', async () => {
  writes.length = 0;
  pubWin.skhConfirm = async () => false;
  await setPub('svc1', 'draft');
  ok('hakuna write', writes.length === 0);
  pubWin.skhConfirm = async () => true;
});
t('kuhariri hakuandiki publicationStatus/status', () => {
  ok('buildServiceUpdate haina status', !('status' in built.patch) && !('publicationStatus' in built.patch));
  const branch = roles.slice(roles.indexOf('if (SERVICE_EDIT.id) {'), roles.indexOf('const docId = await skh.saveData'));
  ok('tawi la uhariri halina publicationStatus/status', !/publicationStatus\s*:/.test(branch) && !/\bstatus\s*:/.test(branch));
});
t('hali zilizopo (draft/published/suspended) zinabaki', () => {
  ['draft', 'published', 'suspended', 'active'].forEach(st => {
    const d = Object.assign({}, savedDoc, { status: st, publicationStatus: st });
    const b = core.buildServiceUpdate(core.serviceEditSnapshot(d), d, now);
    const merged = Object.assign({}, d, b.patch);
    ok(`status ${st} haijabadilika`, merged.status === st && merged.publicationStatus === st);
  });
});

console.log(`\nService editing (PART 4 follow-up): ${passed} passed, ${failed} failed`);
if (failed) { console.log('Zilizoshindwa:\n - ' + fails.join('\n - ')); process.exit(1); }
