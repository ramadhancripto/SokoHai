/**
 * SokoHai — test ya preview: preview/proposals/sales-flow-m1-m6.html
 * Inathibitisha interactivity ya onyesho (tabs, chooser, copy/convert, filters,
 * ukumbusho, mini player) kwa jsdom. Hii ni test ya PREVIEW pekee — haigusi app.
 * Endesha: node tools/test_preview_sales_flow_m1_m6.mjs
 */
import fs from 'fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync(new URL('../preview/proposals/sales-flow-m1-m6.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;
const q = (s) => doc.querySelector(s);
const qa = (s) => [...doc.querySelectorAll(s)];
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

const errors = [];
window.addEventListener("error", e => errors.push(e.message));
const results = [];
const t = (name, cond) => results.push([cond ? 'PASS' : 'FAIL', name]);

// 1. tabs
const tabGroup = q('.tabs');
const mGroup = qa('[data-tab="m-group"]')[0];
click(mGroup);
t('tab · m-group imechaguliwa', mGroup.getAttribute('aria-selected') === 'true');
t('tab · panel m-group imefunguka', q('[data-panel="m-group"]').classList.contains('on'));
t('tab · panel m-auction imefungwa', !q('[data-panel="m-auction"]').classList.contains('on'));

const stDrop = q('[data-tab="st-drop"]');
click(stDrop);
t('tab · studio price_drop imefunguka', q('[data-panel="st-drop"]').classList.contains('on'));
t('tab · studio auction imefungwa', !q('[data-panel="st-auction"]').classList.contains('on'));
t('tab · studio group imefungwa', !q('[data-panel="st-group"]').classList.contains('on'));

// 2. chooser
const auctionCard = q('.choice[data-type="auction"]');
click(auctionCard);
t('chooser · kadi ya Mnada imechaguliwa', auctionCard.classList.contains('on'));
t('chooser · SokoHuru haijachaguliwa', !q('.choice[data-type="free_market"]').classList.contains('on'));
t('chooser · maelezo yanabadilika', q('#pickState').textContent.includes('Mnada'));

click(q('.choice[data-type="group_buy"]'));
t('chooser · Group Buy inachaguliwa', q('#pickState').textContent.includes('Group Buy'));

// 3. copy vs convert
click(q('.pt[data-copy="copy"]'));
t('copy · radio imechaguliwa', q('.pt[data-copy="copy"]').classList.contains('on'));
t('copy · stock = 0 imeonyeshwa', q('#copyList').textContent.includes('0'));
t('copy · asili haiguswi', /Haiguswi/.test(q('#copyList').textContent));
click(q('.pt[data-copy="convert"]'));
t('convert · stock inabaki', q('#copyList').textContent.includes('200 Gunia'));

// 4. activity filters
const cards = qa('.act[data-kind]');
t('filters · kadi 3 zipo', cards.length === 3);
click(q('#actFilters .chip[data-filter="auction"]'));
const visible = cards.filter(c => c.style.display !== 'none');
t('filters · Mnada pekee unaonekana', visible.length === 1 && visible[0].dataset.kind === 'auction');
click(q('#actFilters .chip[data-filter="all"]'));
t('filters · Zote zinaonekana', cards.filter(c => c.style.display !== 'none').length === 3);

// 5. bell toggle
const bell = q('.bell[data-bell="1"]');
click(bell);
t('reminder · imezimwa', bell.getAttribute('data-bell') === '0');
t('reminder · maandishi yamebadilika', bell.textContent.includes('Nihabarishe'));
click(bell);
t('reminder · imewashwa tena', bell.getAttribute('data-bell') === '1' && bell.textContent.toLowerCase().includes('umewekwa'));

// 6. mini player: X menu, hide, restore, close
const mini = q('#miniDemo'), xmenu = q('#xmenu'), chip = q('#restoreChip');
click(q('#miniX'));
t('mini · X inafungua chaguo 2', xmenu.classList.contains('on'));
t('mini · chaguo 2 zinaeleweka', xmenu.textContent.includes('Ficha') && xmenu.textContent.includes('Ondoka'));
click(q('#hideBtn'));
t('mini · Ficha inaficha UI', mini.style.display === 'none');
t('mini · chip ya kurejesha inaonekana', chip.style.display === 'inline-flex');
click(chip);
t('mini · Rejesha inarudisha mini', mini.style.display === '' && chip.style.display === 'none');
click(q('#miniX')); click(q('#closeBtn'));
t('mini · Funga inaondoa mini', mini.style.display === 'none' && chip.style.display === 'none');
t('mini · taarifa ya kufungwa', doc.body.textContent.includes('leaveRoom'));

// 7. hakuna JS error
t('hakuna error ya console', errors.length === 0);

const fails = results.filter(r => r[0] === 'FAIL');
results.forEach(([st, name]) => console.log(`  ${st === 'PASS' ? '✓' : '✗'} ${name}`));
console.log(`\n${results.length - fails.length}/${results.length} pass`);
process.exit(fails.length ? 1 : 0);
