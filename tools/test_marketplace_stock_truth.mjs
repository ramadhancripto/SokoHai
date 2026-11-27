/**
 * tools/test_marketplace_stock_truth.mjs
 * PART 3 — MARKETPLACE CORE · "stock truth" contract
 *
 * Chanzo cha kasoro: `Number(data.stock)` inarudisha 0 kwa `''` na `null`, kwa hiyo
 * bidhaa ambayo muuzaji hakuweka stock ilionyeshwa "Zimeisha", picha ikawa greyscale,
 * na chips za upatikanaji zikafichwa. Pia cart iliruhusu kuagiza zaidi ya stock.
 *
 * Hii test inakagua TABIA halisi ya helpers (hazijakopiwa; zinasomwa kutoka faili
 * zilizopo na kuendeshwa), pamoja na kwamba sehemu za zamani zimeunganishwa kwenye
 * chanzo kimoja na kwamba data ya zamani (bila `stock`) bado inafanya kazi.
 *
 * Endesha: node tools/test_marketplace_stock_truth.mjs
 */
import fs from 'node:fs';

let passed = 0, failed = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; fails.push(name); console.log(`  FAIL  ${name}${extra ? ' → ' + extra : ''}`); }
}
function t(name, fn) {
  try { fn(); } catch (e) { failed++; fails.push(name); console.log(`  FAIL  ${name} → ${e.message}`); }
}

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const bootstrap = read('js/app/00-bootstrap.js');
const cart = read('js/app/23-smart-cart.js');
const checkout = read('js/app/43-delivery-choice.js');
const showcase = read('js/app/39-showcase-logic.js');
const builder = read('js/app/06-product-builder.js');

/* ---------- extraction ya functions halisi (brace matching, si regex ya ndani) ---------- */
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

// mazingira ya kutosha kwa helpers (hakuna DOM inayohitajika)
const sandbox = { skh: {}, window: {}, document: { getElementById: () => null } };
sandbox.window = sandbox;
sandbox.skhTF = (k, fb) => fb;
const load = code => new Function('skh', 'window', 'skhTF', code)(sandbox.skh, sandbox, sandbox.skhTF);

load([
  sliceFn(bootstrap, 'skh.stockNumber = function'),
  sliceFn(bootstrap, 'skh.stockOutStatus = function'),
  sliceFn(bootstrap, 'skh.isSoldOut = function'),
  sliceFn(bootstrap, 'skh.cardOutPill = function'),
  sliceFn(bootstrap, 'skh.cardImageClass = function'),
  sliceFn(bootstrap, 'skh.cardStockChip = function'),
  sliceFn(bootstrap, 'skh.cardAvail = function'),
  sliceFn(bootstrap, 'skh.smartCartStockLimit = function'),
  sliceFn(bootstrap, 'skh.smartCartQty = function'),
  sliceFn(bootstrap, 'skh.smartCartPrice = function'),
  sliceFn(bootstrap, 'skh.smartCartSellerId = function'),
  sliceFn(cart, 'window.skhClampCartQty=function'),
  sliceFn(cart, 'window.skhCartStockCheck=function'),
  sliceFn(cart, 'window.skhCartStockMessage=function')
].join('\n'));

const skh = sandbox.skh;

console.log('\n§1 skh.stockNumber — "haijulikani" vs "imeisha"');
t('empty string = haijulikani (null), SI 0', () => ok("stockNumber({stock:''}) === null", skh.stockNumber({ stock: '' }) === null, String(skh.stockNumber({ stock: '' }))));
t('whitespace = haijulikani', () => ok("'   ' -> null", skh.stockNumber({ stock: '   ' }) === null));
t('null = haijulikani', () => ok('stock:null -> null', skh.stockNumber({ stock: null }) === null));
t('undefined / hakuna field = haijulikani', () => ok('{} -> null', skh.stockNumber({}) === null));
t('0 halisi = 0', () => ok('stock:0 -> 0', skh.stockNumber({ stock: 0 }) === 0));
t("'0' = 0", () => ok("stock:'0' -> 0", skh.stockNumber({ stock: '0' }) === 0));
t('namba halisi', () => ok('7 -> 7 / "12" -> 12', skh.stockNumber({ stock: 7 }) === 7 && skh.stockNumber({ stock: '12' }) === 12));
t('haiwezi kusomeka = haijulikani', () => ok("'abc' -> null", skh.stockNumber({ stock: 'abc' }) === null));
t('boolean si stock', () => ok('true -> null', skh.stockNumber({ stock: true }) === null));
t('namba yenye koma', () => ok("'1,200' -> 1200", skh.stockNumber({ stock: '1,200' }) === 1200));

console.log('\n§2 skh.isSoldOut — stock halisi kwanza, kisha status iliyoandikwa');
t('stock empty SI imeisha (kasoro iliyorekebishwa)', () => ok("isSoldOut({stock:''}) === false", skh.isSoldOut({ stock: '' }) === false));
t('stock null SI imeisha', () => ok('isSoldOut({stock:null}) === false', skh.isSoldOut({ stock: null }) === false));
t('bidhaa bila stock field SI imeisha', () => ok('isSoldOut({}) === false', skh.isSoldOut({}) === false));
t('stock 0 ni imeisha', () => ok('isSoldOut({stock:0}) === true', skh.isSoldOut({ stock: 0 }) === true));
t("stock '0' ni imeisha", () => ok("isSoldOut({stock:'0'}) === true", skh.isSoldOut({ stock: '0' }) === true));
t('stock 3 haijaimarika', () => ok('isSoldOut({stock:3}) === false', skh.isSoldOut({ stock: 3 }) === false));
t('status out_of_stock bila stock = imeisha', () => ok('availabilityStatus', skh.isSoldOut({ availabilityStatus: 'out_of_stock' }) === true));
t('status in_stock si imeisha', () => ok('availabilityStatus in_stock', skh.isSoldOut({ availabilityStatus: 'in_stock' }) === false));
t('stock 4 inashinda status out_of_stock (data halisi ya stock)', () => ok('stock precedence', skh.isSoldOut({ stock: 4, availabilityStatus: 'out_of_stock' }) === false));

console.log('\n§3 Kadi: pill / greyscale / chips');
t('cardOutPill haionyeshi "Zimeisha" kwa stock isiyojulikana', () => ok("cardOutPill({stock:''}) === ''", skh.cardOutPill({ stock: '' }, 'products') === ''));
t('cardOutPill inaonyesha "Zimeisha" kwa stock 0', () => ok('stock:0 -> pill', /Zimeisha/.test(skh.cardOutPill({ stock: 0 }, 'products'))));
t('cardOutPill haigusi huduma/usafiri', () => ok('colName!=products', skh.cardOutPill({ stock: 0 }, 'services') === ''));
t('cardImageClass haipige greyscale stock isiyojulikana', () => ok("'' -> no skh-img--out", skh.cardImageClass({ stock: '' }, 'products') === ''));
t('cardImageClass greyscale kwa stock 0', () => ok('0 -> skh-img--out', skh.cardImageClass({ stock: 0 }, 'products') === ' skh-img--out'));
t('cardStockChip: bila stock hakuna chip (haibuni)', () => ok("'' -> ''", skh.cardStockChip({ stock: '' }) === ''));
t('cardStockChip: 0 -> Zimeisha', () => ok('out', /skh-stock-chip--out/.test(skh.cardStockChip({ stock: 0 }))));
t('cardStockChip: 3 -> Stock ndogo', () => ok('low', /skh-stock-chip--low/.test(skh.cardStockChip({ stock: 3 }))));
t('cardStockChip: 9 -> Inapatikana', () => ok('in', /skh-stock-chip--in/.test(skh.cardStockChip({ stock: 9 }))));
t('cardAvail: stock isiyojulikana haitoi lebo', () => ok("'' -> ''", skh.cardAvail({ stock: '' }, 'products') === ''));
t('cardAvail: 0 -> Zimeisha', () => ok('out', /Zimeisha/.test(skh.cardAvail({ stock: 0 }, 'products'))));
t('cardAvail: 3 -> Zimebaki 3', () => ok('low count', /Zimebaki 3/.test(skh.cardAvail({ stock: 3 }, 'products'))));
t('cardAvail: 9 -> Zipo (9)', () => ok('in count', /Zipo \(9\)/.test(skh.cardAvail({ stock: 9 }, 'products'))));

console.log('\n§4 skh.smartCartStockLimit — kikomo cha mstari wa cart');
t('stock isiyojulikana -> null (hakuna kikomo cha kubuni)', () => ok("'' -> null", skh.smartCartStockLimit({ stock: '' }) === null));
t('bila field -> null', () => ok('{} -> null', skh.smartCartStockLimit({}) === null));
t('stock 0 -> 0', () => ok('0 -> 0', skh.smartCartStockLimit({ stock: 0 }) === 0));
t('stock 5 -> 5', () => ok('5 -> 5', skh.smartCartStockLimit({ stock: 5 }) === 5));
t('variant iliyochaguliwa inachukua kipaumbele', () => ok('variant stock 2', skh.smartCartStockLimit({ stock: 9, chosenVariant: { stock: 2 } }) === 2));
t('status out_of_stock -> 0', () => ok('status -> 0', skh.smartCartStockLimit({ availabilityStatus: 'out_of_stock' }) === 0));

console.log('\n§5 skhClampCartQty — 1 <= qty <= stock');
const clamp = sandbox.window.skhClampCartQty;
t('qty 10 kwa stock 3 inashushwa hadi 3', () => ok('clamp', clamp({ stock: 3 }, 10) === 3));
t('qty 0 inarudi 1', () => ok('min 1', clamp({ stock: 3 }, 0) === 1));
t('qty isiyo namba inarudi 1', () => ok("'abc' -> 1", clamp({ stock: 3 }, 'abc') === 1));
t('stock isiyojulikana hairuhusu kikomo cha kubuni', () => ok('999 -> 999', clamp({ stock: '' }, 999) === 999));
t('qty ndani ya stock haibadilishwi', () => ok('2 -> 2', clamp({ stock: 5 }, 2) === 2));

console.log('\n§6 skhCartStockCheck — zuio kabla ya oda');
const check = sandbox.window.skhCartStockCheck;
const msg = sandbox.window.skhCartStockMessage;
t('cart ya zamani (bila stock) haizuiwi — backward compatible', () => ok('hakuna matatizo', check([{ title: 'A', qty: 4 }, { title: 'B', qty: 9, stock: null }]).length === 0));
t('qty 5 kwa stock 3 -> tatizo moja lenye namba halisi', () => {
  const p = check([{ title: 'Sukari', qty: 5, stock: 3 }]);
  ok('tatizo 1', p.length === 1);
  ok('want=5 have=3', p[0] && p[0].want === 5 && p[0].have === 3, JSON.stringify(p[0]));
});
t('stock 0 -> have 0 (imeisha)', () => {
  const p = check([{ title: 'Mafuta', qty: 2, stock: 0 }]);
  ok('have=0', p.length === 1 && p[0].have === 0);
});
t('qty ndani ya stock haizuiwi', () => ok('2/3 ok', check([{ title: 'C', qty: 2, stock: 3 }]).length === 0));
t('mchanganyiko: hurudisha matatizo pekee', () => {
  const p = check([{ title: 'C', qty: 2, stock: 3 }, { title: 'D', qty: 7, stock: 4 }, { title: 'E', qty: 1 }]);
  ok('1 tatizo (D)', p.length === 1 && p[0].title === 'D');
});
t('ujumbe ni wa kweli: jina + wingi + zilizopo', () => {
  const m = msg(check([{ title: 'Sukari', qty: 5, stock: 3 }]));
  ok('ina jina', m.includes('Sukari'));
  ok('ina "unaomba 5"', /unaomba 5/.test(m));
  ok('ina "zilizopo 3"', /zilizopo 3/.test(m));
});
t('ujumbe wa stock 0 unatamka imeisha', () => ok('imeisha (stock 0)', /imeisha \(stock 0\)/.test(msg(check([{ title: 'Mafuta', qty: 1, stock: 0 }])))));
t('hakuna matatizo -> ujumbe tupu', () => ok("''", msg([]) === '' && msg(null) === ''));

console.log('\n§7 Wiring: sehemu zote zinatumia chanzo kimoja');
t('00-bootstrap.js haina tena Number(data.stock) kwenye CODE (maoni hayana maana)', () => {
  const code = bootstrap.split('\n').filter(l => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  const hits = (code.match(/Number\(\s*data\.stock\s*\)/g) || []).length;
  ok('0 hits kwenye code', hits === 0, String(hits));
});
t('00-bootstrap ina skh.stockNumber / isSoldOut', () => ok('helpers', bootstrap.includes('skh.stockNumber = function') && bootstrap.includes('skh.isSoldOut = function')));
t('00-bootstrap ina skh.smartCartStockLimit karibu na smartCartQty', () => ok('limit helper', bootstrap.includes('skh.smartCartStockLimit = function')));
t('23-smart-cart inatumia kikomo kwenye addToCart (njia 2)', () => ok('2 matumizi', (cart.match(/skh\.smartCartStockLimit\(/g) || []).length >= 4, String((cart.match(/skh\.smartCartStockLimit\(/g) || []).length)));
t('23-smart-cart ina skhCartStockCheck/Message', () => ok('check helper', cart.includes('window.skhCartStockCheck=function') && cart.includes('window.skhCartStockMessage=function')));
t('23-smart-cart: "+" inazimwa kwenye kikomo', () => ok('disabled plus', /disabled title="Upeo wa stock umefikiwa"/.test(cart)));
t('43-delivery-choice inakagua stock kwenye mapitio NA kwenye uthibitisho', () => ok('2 call sites', (checkout.match(/window\.skhCartStockCheck\(/g) || []).length === 2, String((checkout.match(/window\.skhCartStockCheck\(/g) || []).length)));
t('39-showcase-logic haiadhibu stock isiyojulikana kama 0', () => ok('rawStock guard', showcase.includes('rawStock') && !/const stock = Number\(it\.stock\);\s*\n\s*if \(Number\.isFinite\(stock\)\)/.test(showcase)));
t('06-product-builder bado inatofautisha stock tupu (hakuna regression)', () => ok("matched.stock !== ''", builder.includes("matched.stock !== ''")));

console.log('\n§8 Hakuna uharibifu wa maandishi ya kadi / brand');
t('kadi bado 85/15 na picha contain (css)', () => {
  const css = read('css/70-product-card.css') + read('js/app/00-bootstrap.js');
  ok('skh-huru ipo', css.includes('skh-huru'));
  ok('SokoHuruCard haijaondolewa', bootstrap.includes('skh.SokoHuruCard = function'));
});
t('stock haijaongezwa kwenye uso wa kadi ya bidhaa (uamuzi wa mmiliki 2026-11-20)', () => {
  const card = sliceFn(bootstrap, 'skh.SokoHuruCard = function');
  ok('hakuna stockChip kwenye uso wa kadi', !/cardStockChip\s*\(/.test(card.replace(/cardOutPill[\s\S]*?cardOutPill/g, '')) || !/stockChip/.test(card));
});

console.log('\n§9 Ukurasa wa bidhaa: hali (condition) na upatikanaji');
const logic = await import('../js/app/39-showcase-logic.js');
t('psConditionLabel inatafsiri thamani zilizohifadhiwa', () => {
  ok("new -> Mpya", logic.psConditionLabel({ condition: 'new' }) === 'Mpya');
  ok("USED -> Imetumika (case-insensitive)", logic.psConditionLabel({ condition: 'USED' }) === 'Imetumika');
  ok("refurbished -> Imekarabatiwa", logic.psConditionLabel({ condition: 'refurbished' }) === 'Imekarabatiwa');
});
t('psConditionLabel haibuni kitu', () => {
  ok('not_applicable -> tupu', logic.psConditionLabel({ condition: 'not_applicable' }) === '');
  ok('hakuna field -> tupu', logic.psConditionLabel({}) === '' && logic.psConditionLabel(null) === '');
  ok('thamani isiyojulikana -> tupu', logic.psConditionLabel({ condition: 'brand_new_thing' }) === '');
});
t('psAvailability: stock tupu = haijulikani (haionyeshi "Zimeisha")', () => {
  const a = logic.psAvailability({ stock: '' }, 'products');
  ok('kind != out', a.kind !== 'out', JSON.stringify(a));
  ok('hakuna lebo ya Zimeisha', !/Zimeisha/.test(a.label || ''));
});
t('psAvailability: stock 0 bado ni Zimeisha', () => ok('out', logic.psAvailability({ stock: 0 }, 'products').kind === 'out'));
t('chip ya hali imepachikwa kwenye ukurasa wa bidhaa', () => {
  const sc = read('js/app/39-product-showcase.js');
  ok('psConditionLabel inatumika', sc.includes('psConditionLabel(p)'));
  ok('col === PS_PRODUCT pekee', /if \(col === PS_PRODUCT\) \{\s*\n\s*var condLbl/.test(sc));
  ok('class pm-avail--cond', sc.includes('pm-avail--cond'));
  ok('css ya chip ipo', read('css/18-product-showcase.css').includes('.pm-avail--cond'));
});

console.log(`\nMarketplace stock truth: ${passed} passed, ${failed} failed`);
if (failed) { console.log('Zilizoshindwa:\n - ' + fails.join('\n - ')); process.exit(1); }
