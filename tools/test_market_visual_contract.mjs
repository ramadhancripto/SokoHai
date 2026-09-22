import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const head = read('html/00-head.html');
const sliders = read('html/17-sliders.html');
const ann = read('js/06-announcement.js');
const market = read('js/app/00-bootstrap.js');
const boost = read('js/app/01-market.js');
const css = read('css/33-white-marketplace.css');
let n = 0;
function ok(name, value) { assert.ok(value, name); n += 1; console.log('✅', name); }

ok('white-first stylesheet imeunganishwa', head.includes('css/33-white-marketplace.css'));
ok('sections nne zina hosts tofauti', ['slider1','slider2','slider3','slider4'].every(id => sliders.includes(`id="${id}"`)));
ok('boosted disclosure ipo', /<b>Boosted<\/b>/.test(sliders) && /boost-badge/.test(market));
ok('ranking centralized inatumika na UI', market.includes('buildMarketplaceSections') && market.includes('renderMarketplaceSections'));
ok('search activity halisi inasomwa', market.includes("recommendationEvents") && market.includes("type: 'search'"));
ok('future boosts zina expiry', boost.includes('boostExpiresAt') && boost.includes('boostDays'));
ok('announcement si marquee nzito', !ann.includes('requestAnimationFrame') && !ann.includes('translate3d'));
ok('announcement hutumia records za Firestore cache', ann.includes('__sokohaiAnnouncementsCache') && !ann.includes('normalItems'));
ok('announcement image ni field halisi', /a\.image \|\| a\.imageUrl/.test(ann));
ok('white ni dominant kwenye marketplace surfaces', /background-color:\s*#fff\s*!important/.test(css));
ok('green primary na blue support zimetenganishwa', css.includes('--skh-market-green') && css.includes('--skh-market-blue'));
ok('gold ni boost/premium accent', css.includes('--skh-market-gold') && css.includes('.skh-section-icon--boost'));

console.log(`MARKET VISUAL CONTRACT: ${n} passed, 0 failed`);
