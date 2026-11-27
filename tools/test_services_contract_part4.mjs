/**
 * tools/test_services_contract_part4.mjs
 * PART 4 — SERVICES SYSTEM contract.
 *
 * Kasoro kuu zilizorekebishwa (na zinazozuiwa kurudi):
 *  1) Fomu halisi ya kuchapisha huduma huhifadhi `groupType` (physical/online/food/rental),
 *     lakini kadi na ukurasa wa huduma zilisoma `section` pekee -> mode/upatikanaji wa
 *     huduma mpya hazikuonekana.
 *  2) Hakuna njia ya mtoa huduma kusimamisha/kuchapisha huduma (bidhaa zilikuwa na hiyo),
 *     na hakuna kichujio cha mwisho: huduma iliyosimamishwa ingeonekana sokoni.
 *
 * Endesha: node tools/test_services_contract_part4.mjs
 */
import fs from 'node:fs';

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
const bootstrap = read('js/app/00-bootstrap.js');
const hub = read('js/app/16-pos-admin-jobs.js');
const product = read('js/app/07-product.js');
const chatFeed = read('js/app/106-chat-discovery-feed.js');
const smartSearch = read('js/23-smart-search.js');
const i18n = read('js/app/32-i18n.js');
const formHtml = read('html/10-form-agent.html');

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

/* ---------- sandbox kwa helpers za bootstrap ---------- */
const sandbox = { skh: {}, window: {} };
sandbox.window = sandbox;
sandbox.skhTF = (k, fb) => fb;
const load = code => new Function('skh', 'window', 'skhTF', 'SKH_PIN_SVG', code)(sandbox.skh, sandbox, sandbox.skhTF, '');
sandbox.skh.cardIcon = () => '';
sandbox.skh.skhEscape = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
load([
  sliceFn(bootstrap, 'skh.serviceMode = function'),
  sliceFn(bootstrap, 'skh.serviceEligible = function'),
  sliceFn(bootstrap, 'skh.cardServiceInfoRow = function'),
  sliceFn(bootstrap, 'skh.listingTrust = function')
].join('\n'));

const skh = sandbox.skh;

console.log('\n§1 skh.serviceMode — groupType (fomu ya sasa) na section (data ya zamani)');
t('groupType online/physical zinatambulika', () => {
  ok("groupType:'online'", skh.serviceMode({ groupType: 'online' }) === 'online');
  ok("groupType:'physical'", skh.serviceMode({ groupType: 'physical' }) === 'physical');
});
t('section (data ya zamani) inaendelea kufanya kazi', () => {
  ok("section:'online'", skh.serviceMode({ section: 'online' }) === 'online');
  ok("section:'physical'", skh.serviceMode({ section: 'physical' }) === 'physical');
});
t('section inashinda groupType ikiwa zote zipo', () => ok('section precedence', skh.serviceMode({ section: 'physical', groupType: 'online' }) === 'physical'));
t('groupType nyingine hazibuniwi', () => {
  ok("'food' -> ''", skh.serviceMode({ groupType: 'food' }) === '');
  ok("'rental' -> ''", skh.serviceMode({ groupType: 'rental' }) === '');
  ok('hakuna field -> \'\'', skh.serviceMode({}) === '' && skh.serviceMode(null) === '');
});
t('online:true inabaki kama fallback', () => ok('online:true', skh.serviceMode({ online: true }) === 'online'));
t('case/nafasi hazizuii', () => ok("' ONLINE '", skh.serviceMode({ groupType: ' ONLINE ' }) === 'online'));

console.log('\n§2 skh.serviceEligible — huduma inaonekana sokoni?');
t('hati za zamani (bila status) zinaonekana', () => ok('{} -> true', skh.serviceEligible({}) === true));
t("'active' na 'published' zinaonekana", () => ok('active/published', skh.serviceEligible({ status: 'active' }) === true && skh.serviceEligible({ status: 'published' }) === true));
t('zilizosimamishwa hazionekani', () => {
  ['draft', 'suspended', 'archived', 'inactive', 'deleted', 'blocked', 'rejected', 'removed'].forEach(s => ok(`status:${s} -> false`, skh.serviceEligible({ status: s }) === false));
});
t('publicationStatus inaheshimiwa', () => ok("publicationStatus:'draft'", skh.serviceEligible({ publicationStatus: 'draft' }) === false));
t('alama za uondoaji zinatosha', () => {
  ok('deleted:true', skh.serviceEligible({ deleted: true }) === false);
  ok('archived:true', skh.serviceEligible({ archived: true }) === false);
  ok('adminHidden:true', skh.serviceEligible({ adminHidden: true }) === false);
  ok('suspendedAt', skh.serviceEligible({ suspendedAt: '2026-01-01' }) === false);
});
t('hakuna data -> haionekani', () => ok('null -> false', skh.serviceEligible(null) === false));
t('UPATIKANAJI wa huduma HAUSIKI eligibility (maana tofauti)', () => {
  // availabilityStatus ya huduma ni available/available_today/appointment_required —
  // si hali ya uchapishaji. Isizui huduma kuonekana.
  ok("appointment_required -> true", skh.serviceEligible({ status: 'active', availabilityStatus: 'appointment_required' }) === true);
  ok("available_today -> true", skh.serviceEligible({ status: 'active', availabilityStatus: 'available_today' }) === true);
});
t('productEligible HAITUMIKI kwa huduma (channels/saleMode zingefuta zote)', () => {
  ok('serviceEligible ni tofauti', bootstrap.includes('skh.serviceEligible = function') && !/skh\.serviceEligible *= *skh\.productEligible/.test(bootstrap));
});

console.log('\n§3 Kadi ya huduma: eneo + mode (data halisi)');
t('cardServiceInfoRow inaonyesha eneo na mode kwa groupType', () => {
  const html = skh.cardServiceInfoRow({ groupType: 'online', location: 'Mikocheni, DSM' });
  ok('ina eneo', html.includes('Mikocheni, DSM'), html.slice(0, 120));
  ok('ina "Mtandaoni"', html.includes('Mtandaoni'), html.slice(0, 200));
});
t('cardServiceInfoRow: physical -> "Ana kwa ana"', () => {
  const html = skh.cardServiceInfoRow({ groupType: 'physical', location: 'Kimara' });
  ok('ina "Ana kwa ana"', html.includes('Ana kwa ana'));
});
t('cardServiceInfoRow: hakuna data -> haina kitu', () => ok("'' ", skh.cardServiceInfoRow({}) === ''));
t('cardServiceInfoRow haibuni mode isiyojulikana', () => {
  const html = skh.cardServiceInfoRow({ groupType: 'food', location: 'Kariakoo' });
  ok('hakuna Mtandaoni/Ana kwa ana', !/Mtandaoni|Ana kwa ana/.test(html), html);
  ok('lakini eneo lipo', html.includes('Kariakoo'));
});
t('ServicePostCard inatumia cardServiceInfoRow', () => ok('wiring', /skh\.ServicePostCard = function[\s\S]{0,900}cardServiceInfoRow\(data\)/.test(bootstrap)));
t('kadi ya huduma ina darasa lake (haichanganywi na bidhaa)', () => ok('skh-card--service', bootstrap.includes('skh-card--service')));

console.log('\n§4 Verification: provider asiyethibitishwa haonyeshwi kama amethibitishwa');
t('services: providerVerified!==true haitoi beji ya provider', () => {
  skh.trustActive = () => false;
  ok('hakuna trust', skh.listingTrust({}, 'services') === '');
  ok('providerVerified:false -> hakuna', skh.listingTrust({ providerVerified: false }, 'services') === '');
});
t('services: providerVerified===true inatoa beji ya provider', () => ok("'provider'", skh.listingTrust({ providerVerified: true }, 'services') === 'provider'));
t('trust ya akaunti inatumika tu ikiwa iko hai', () => {
  skh.trustActive = (d, k) => k === 'account';
  ok("'account'", skh.listingTrust({}, 'services') === 'account');
  skh.trustActive = () => false;
});

console.log('\n§5 Provider: kusimamisha / kuchapisha huduma');
t('skhSetServicePublication ipo na inakataa hali isiyojulikana', () => {
  ok('imefungwa', hub.includes('window.skhSetServicePublication = async function'));
  ok("inaruhusu draft/published pekee", /if \(\['draft', 'published'\]\.indexOf\(state\) === -1\) return;/.test(hub));
});
t('sehemu na maana za status ni zile za bidhaa', () => {
  ok('publicationStatus + status patch', /publicationStatus: state, status: state === 'published' \? 'active' : state/.test(hub));
  ok('bidhaa zinatumia thamani zile zile', /publicationStatus: state, status: state === 'published' \? 'active' : state, updatedAt/.test(read('js/app/30-seller-products.js')));
});
t('mmiliki pekee anaweza kubadilisha (ukaguzi wa client; rules pia zinalinda)', () => {
  // [PART 4 FOLLOW-UP] ukaguzi umeboreshwa: mmiliki PEKEE, na hati isiyo na mmiliki inakataliwa.
  ok('ownership check ipo', /owner !== me/.test(hub) && /var me = skh\.currentUser && skh\.currentUser\.uid/.test(hub));
  ok('hati isiyo na mmiliki inakataliwa', /Huduma hii haina mmiliki aliyesajiliwa/.test(hub));
  ok('haitumii admin gate', !/isAdmin/.test(hub.slice(hub.indexOf('window.skhSetServicePublication'), hub.indexOf('window.skhSetServicePublication') + 1200)));
});
t('orodha ya Huduma Zangu ina vitendo: Angalia / Chapisha-Simamisha / Futa', () => {
  const block = hub.slice(hub.indexOf('loadHubDetailedMyServices'), hub.indexOf('window.loadHubDetailedClients'));
  ok('Angalia', block.includes('>Angalia</button>'));
  ok('toggle', block.includes('skhSetServicePublication'));
  ok('Futa ipo bado', block.includes('>Futa</button>'));
  ok('beji ya Imezimwa', block.includes('Imezimwa'));
});

console.log('\n§6 Kuchujwa kwa huduma zilizosimamishwa (uso wa mnunuzi)');
t('feed ya Huduma inachuja', () => ok('paint filter', /if \(collectionToFetch === 'services'\) rows = rows\.filter\(skh\.serviceEligible\)/.test(bootstrap)));
t('ukurasa wa nyumbani (all) unachuja huduma', () => ok('all feed', /d\.collectionName === 'services' \? skh\.serviceEligible\(d\)/.test(bootstrap)));
t('utafutaji wa katalogi unachuja huduma', () => ok('catalog search', /col === 'services' && typeof skh\.serviceEligible === 'function' && !skh\.serviceEligible\(it\)/.test(bootstrap)));
t('gundua/gumzo unachuja huduma', () => ok('chat discovery', chatFeed.includes("cols[i] === 'services'") && chatFeed.includes('serviceEligible')));
t('utafutaji wa haraka (23-smart-search) unachuja huduma', () => ok('smart search', smartSearch.includes("kind === 'services'") && smartSearch.includes('serviceEligible')));
t('kiungo cha zamani cha huduma iliyosimamishwa hakionyeshi kitu kwa mteja', () => {
  ok('guard ipo', product.includes("colName === 'services' && typeof skh.serviceEligible === 'function'"));
  ok('mmiliki anaona (preview)', /isOwnerViewS/.test(product) && /found\.userId === meUidS/.test(product));
});
t('ujumbe wa "haipatikani" upo katika lugha zote mbili', () => {
  const line = (i18n.split('\n').find(l => l.includes('ps_unavailable:')) || '');
  ok('key ipo', !!line);
  ok('Kiingereza', /no longer available/i.test(line));
  ok('Kiswahili', /haipatikani tena/i.test(line));
});

console.log('\n§7 Fomu ya huduma: bei na upatikanaji zinakusanywa (hakuna kubuni)');
t('fomu ina pricingModel, availability na travel', () => {
  ok('servPricingModel', formHtml.includes('id="servPricingModel"'));
  ok('servAvailability', formHtml.includes('id="servAvailability"'));
  ok('makadirio/inajadiliwa hazihitaji bei', formHtml.includes('quotation_required') && formHtml.includes('negotiable'));
});
t('submitSokohaiService inahifadhi fields halisi', () => {
  const roles = read('js/app/19-roles.js');
  ok('pricingModel', roles.includes('pricingModel: (document.getElementById(\'servPricingModel\')'));
  ok('availabilityStatus', /availabilityStatus: \(document\.getElementById\('servAvailability'\)/.test(roles));
  ok('groupType', roles.includes('groupType: grp,'));
});
t('bei inahitajika isipokuwa makadirio/inajadiliwa', () => {
  const roles = read('js/app/19-roles.js');
  ok('validation ipo', /priceRequired && price <= 0/.test(roles));
});

console.log('\n§8 Regression: tabia ya bei ya huduma haijabadilika');
const logic = await import('../js/app/39-showcase-logic.js');
t('psServicePriceLabel: fixed/hourly/quotation/legacy', () => {
  ok('fixed -> bei kamili', logic.psServicePriceLabel({ pricingModel: 'fixed', price: 50000 }) === 'TSh 50,000');
  ok('hourly -> Kwa saa', logic.psServicePriceLabel({ pricingModel: 'hourly', price: 5000 }) === 'Kwa saa TSh 5,000');
  ok('quotation_required', logic.psServicePriceLabel({ pricingModel: 'quotation_required' }) === 'Kadirio linahitajika');
  ok('legacy (bila model) -> Kuanzia', logic.psServicePriceLabel({ price: 7000 }) === 'Kuanzia TSh 7,000');
  ok('bila bei -> Maelewano', logic.psServicePriceLabel({}) === 'Maelewano');
});
t('psAvailability: online kwa groupType (kasoro iliyorekebishwa)', () => {
  ok('groupType online -> mtandaoni', logic.psAvailability({ groupType: 'online' }, 'services').label === 'Inapatikana mtandaoni');
  ok('section online bado', logic.psAvailability({ section: 'online' }, 'services').label === 'Inapatikana mtandaoni');
  ok('available_today', logic.psAvailability({ availabilityStatus: 'available_today' }, 'services').label === 'Inapatikana leo');
  ok('appointment_required', logic.psAvailability({ availabilityStatus: 'appointment_required' }, 'services').label === 'Miadi inahitajika');
  ok('hakuna data -> hakuna lebo', logic.psAvailability({}, 'services').label === '');
});
t('psSpecRows: mstari wa Mpangilio hutoka kwenye mode halisi', () => {
  const online = logic.psSpecRows({ groupType: 'online', category: 'Umeme' }, 'services');
  const phys = logic.psSpecRows({ groupType: 'physical', category: 'Umeme' }, 'services');
  const food = logic.psSpecRows({ groupType: 'food' }, 'services');
  ok('online -> Mtandaoni', online.some(r => r && r.value === 'Mtandaoni'));
  ok('physical -> Ana kwa ana', phys.some(r => r && r.value === 'Ana kwa ana'));
  ok('food -> hakuna mstari wa mpangilio', !food.some(r => r && r.value === 'Mtandaoni'));
});
t('bidhaa haziguswi na mabadiliko haya', () => {
  ok('productEligible bado inatumika', bootstrap.includes('rows.filter(skh.productEligible)'));
  ok('productEligible haijaunganishwa na serviceEligible', !/skh\.productEligible = skh\.serviceEligible/.test(bootstrap));
});

console.log('\n§9 Maombi ya huduma: hakuna ombi kwa huduma isiyopo');
t('skhNegoFormOpen inakagua eligibility KABLA ya kuunda mazungumzo', () => {
  const f = read('js/app/38-negotiation-form.js');
  const iGuard = f.indexOf('serviceEligible');
  const iConv = f.indexOf('var c = await ensureContextConversation(type, baseEntity);');
  ok('guard ipo', iGuard !== -1);
  ok('guard inakuja kabla ya mazungumzo', iGuard !== -1 && iConv !== -1 && iGuard < iConv, `${iGuard} vs ${iConv}`);
  ok('inarudisha service_unavailable', f.includes("error: 'service_unavailable'"));
  ok('haigusi product/transport', /if \(type === NF_TYPES\.SERVICE && /.test(f));
});
t('fomu ya ombi ina lock ya kutuma (hakuna maombi rudufu)', () => {
  const f = read('js/app/38-negotiation-form.js');
  ok('state.sending', f.includes('if (!state || state.sending || state.phase === \'SUCCESS\') return;'));
  ok('kitufe kinazimwa', f.includes("btn.disabled = true; btn.classList.add('is-loading')"));
});
t('bei/idadi/kwa huduma zinahitajika kabla ya kutuma', () => {
  const f = read('js/app/38-nego-form-logic.js');
  ok('scope required', /key: 'scope'[\s\S]{0,200}required: true/.test(f));
  ok('quantity required', /key: 'quantity'[\s\S]{0,220}required: true/.test(f));
  ok('unitPrice required', /key: 'unitPrice'[\s\S]{0,200}required: true/.test(f));
});

console.log('\n§10 Sehemu za huduma (tabs) zinaendelea kuchuja kwa section || groupType');
t('chujio cha feed kinasoma section na groupType', () => {
  ok('section || groupType', /const sec = \(\(data\.section \|\| data\.groupType\) \|\| ''\)\.toLowerCase\(\)/.test(bootstrap));
  ok('linalinganishwa na activeServiceSection', /sec === String\(skh\.activeServiceSection\)\.toLowerCase\(\)/.test(bootstrap));
});
t('tabs za huduma zina handlers halisi', () => {
  const topnav = read('html/16-topnav.html');
  ok('setServiceSection ipo', topnav.includes('setServiceSection('));
  ok('handler imefungwa', read('js/app/08-app-state.js').includes('window.setServiceSection = function'));
});

console.log(`\nServices contract (PART 4): ${passed} passed, ${failed} failed`);
if (failed) { console.log('Zilizoshindwa:\n - ' + fails.join('\n - ')); process.exit(1); }
