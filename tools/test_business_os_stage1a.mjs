#!/usr/bin/env node
/* Stage 1A contract: Business OS shell + authoritative overview.
   - Hakuna tab/action iliyoondolewa kutoka cockpit ya awali.
   - Shell inatumia handlers zilezile (switchDashTab, openStockTransferModal, ...).
   - Overview haitengenezi namba: chanzo ni posReports/sales/products; faida inaonyeshwa
     kama "haipatikani" kwa sababu rekodi ya mauzo haina gharama.
   - Markup ya awali ipo kama fallback (ADD, NEVER REMOVE). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BUSINESS_OS_NAV, BUSINESS_OS_ACTIONS, BUSINESS_OS_EXIT, allTabs, allActions, groupOfTab } from '../shared/business-os-nav-model.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const nav = read('shared/business-os-nav-model.mjs');
const shell = read('js/app/110-business-os-shell.js');
const overview = read('js/app/111-business-os-overview.js');
const css = read('css/52-business-os-shell.css');
const dash = read('js/app/03-dashboard.js');
const tabs = read('js/app/10-dashboard-tabs.js');
const head = read('html/00-head.html');
const scripts = read('html/21-scripts.html');
const index = read('index.html');

let passed = 0;
const fails = [];
const ok = (cond, name, extra) => cond ? passed++ : fails.push(name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : ''));

/* ---------- 1. Hakuna tab iliyoondolewa ---------- */
const LEGACY_TABS = ['overview', 'my_products', 'product_analytics', 'product_performance',
  'sales_insights', 'demand_insights', 'product_compare', 'inventory', 'expenses', 'staff', 'settings'];
const tabsInModel = allTabs();
LEGACY_TABS.forEach(t => ok(tabsInModel.includes(t), 'tab ipo kwenye model: ' + t));
ok(new Set(tabsInModel).size === tabsInModel.length, 'hakuna tab rudufu');
/* Stage 3: muundo wa moduli 9 unaongeza tabs zilizokuwepo nyuma ya vitufe
   (bookings, trips, tracking, drivers, fleet, cargo, finance, analytics).
   11 za awali + 8 = 19; hakuna iliyoondolewa. */
ok(tabsInModel.length === 20, 'tabs 20 = 11 za awali + 8 zilizokuwa nyuma ya vitufe + pos_page', { model: tabsInModel.length, legacy: LEGACY_TABS.length });

/* ---------- 2. Vitendo vya awali havijapotea ---------- */
const actions = allActions();
['openStockTransferModal', 'skhOpenAdminControlCenter', 'skhOpenKamusi', 'openPos', 'switchModeBuyer']
  .forEach(a => ok(actions.includes(a), 'action ipo: ' + a));
ok(BUSINESS_OS_EXIT.action === 'switchModeBuyer', 'Rudi Soko Kuu ipo');
ok(groupOfTab('inventory') === 'stock', 'inventory iko chini ya Stoo & Usafirishaji');
ok(groupOfTab('expenses') === 'finance', 'Leja Kuu iko chini ya Fedha & Hasibu');
ok(groupOfTab('staff') === 'people', 'Staff & Payroll iko chini ya Rasilimali Watu');

/* ---------- 3. Shell inatumia handlers zilizopo (hakuna beji tupu) ---------- */
ok(/window\.switchDashTab\(' \+ item\.tab/.test(shell) || /switchDashTab\(\\'' \+ item\.tab/.test(shell), 'tab buttons zinaita switchDashTab');
['openStockTransferModal', 'skhOpenAdminControlCenter', 'skhOpenKamusi', 'showForm', 'switchMode']
  .forEach(fn => ok(shell.includes(fn), 'shell inatumia ' + fn));
ok(/id="btnTab_' \+ item\.tab/.test(shell), 'kila tab ina id btnTab_<tab> (switchDashTab active state)');
ok(/side-menu-link/.test(shell), 'class side-menu-link imehifadhiwa');
ok(/ct-sidebar/.test(shell) && /id="dashWorkspace"/.test(shell), 'containers za awali zimehifadhiwa');
ok(/ct-menu-toggle-btn/.test(shell), 'kitufe cha menyu (simu) kipo');
ok(/ctHeaderNotifBadge/.test(shell) && /openNotifications/.test(shell), 'taarifa (notifications) zinafanya kazi');
ok(/openChatList/.test(shell), 'gumzo (chat) linafanya kazi');
ok(/skhBOSToggleGroup/.test(shell) && /aria-expanded/.test(shell), 'vikundi vinakunjwa kwa ARIA');
ok(/skhBOSFilterNav/.test(shell), 'tafuta moduli inafanya kazi');
ok(/COLLAPSE_KEY/.test(shell) && /localStorage/.test(shell), 'hali ya vikundi huhifadhiwa kifaa');

/* ---------- 3b. Accordion (kimoja wazi) + skroli ya menyu ---------- */
ok(/OPEN_KEY/.test(shell) && /resolveOpenGroup/.test(shell), 'accordion: kikundi kimoja huhifadhiwa kifaa');
ok(/function applyOpenGroup[\s\S]{0,400}is-collapsed/.test(shell), 'accordion: kikundi kimoja hufungwa kingine kifungukapo');
ok(!/classList\.toggle\('is-collapsed'\)/.test(shell), 'accordion: hakuna kubadilisha vikundi bila kuheshimu kimoja');
ok(/function toggleGroup[\s\S]{0,1400}applyOpenGroup\(willOpen \? id : null\)/.test(shell), 'kichwa cha kikundi hufungua/kufunga sub-buttons');
ok(/syncActive[\s\S]{0,900}applyOpenGroup\(groupId\)/.test(shell), 'kikundi cha ukurasa active hufunguka kiotomatiki');
ok(!/data-bos-group-toggle="[^"]*"[^>]*switchDashTab/.test(shell), 'kichwa cha kikundi HAKINA navigation');
ok(/window\.skhBOSScrollNav|skhBOSScrollNav = scrollNav/.test(shell), 'kitufe cha ishara ya scroll kipo');
ok(/function updateScrollHint[\s\S]{0,600}has-more-below/.test(shell), 'ishara ya scroll inahesabiwa kutoka scrollTop');
ok(/bosNavScrollHint/.test(shell) && /bos-nav-scroll-wrap/.test(shell), 'DOM: wrap + ishara ya scroll vipo');
ok(/skhBOSToggleGroup\(\\'' \+ group\.id \+ '\\', event\)/.test(shell), 'kichwa cha kikundi kinapokea `event` (drawer ya simu haifungwi)');
ok(/function toggleGroup\(id, ev\)[\s\S]{0,600}stopPropagation/.test(shell), 'toggleGroup inazuia tukio kufika kwenye listener ya 18-cockpit');
ok(/function scrollNav\(dir, ev\)[\s\S]{0,300}stopPropagation/.test(shell), 'ishara ya scroll haifungi drawer');
ok(/@media \(max-height: 620px\)/.test(css), 'CSS: vifaa vya urefu mdogo (landscape) vinashughulikiwa');
ok(/\.bos-nav-group-btn\s*\{[^}]*min-height: 44px/.test(css), 'CSS: kichwa cha kikundi kina eneo la kugusa >= 44px kwenye simu');
ok(/min-height: 0/.test(css), 'CSS: min-height:0 (flex haikati maudhui)');
ok(/\.bos-nav-scroll\s*\{[^}]*overflow-y:\s*auto/.test(css), 'CSS: eneo la menyu linaskroli');
ok(/\.bos-nav-scroll\s*\{[^}]*min-height:\s*0/.test(css), 'CSS: scroller anakubali kusinyaa ndani ya 100vh');
ok(/\.bos-nav-scroll::-webkit-scrollbar/.test(css), 'CSS: scrollbar inayoonekana');
ok(/\.bos-nav-scroll-wrap\s*\{[^}]*min-height:\s*0/.test(css), 'CSS: wrap ina min-height:0');
ok(/\.has-more-below \.bos-nav-scroll-hint/.test(css), 'CSS: ishara inaonekana tu inapohitajika');
ok(/overflow: hidden/.test(css), 'CSS: simu — sidebar haiskroli mara mbili');
ok(!/#0F172A|#0f172a/.test(shell + css), 'hakuna background nyeusi (#0F172A) kwenye shell/css');

/* ---------- 4. Overview: vyanzo rasmi, hakuna namba za kubuni ---------- */
ok(/wrapCallable\('posReports'\)/.test(overview), 'overview inatumia posReports (server)');
ok(/'sales'/.test(overview), 'mauzo ya hivi karibuni kutoka collection sales');
ok(/dashboardCachedData[\s\S]{0,120}prodSnap/.test(overview), 'stoo kutoka products (cache ya dashibodi)');
ok(/purchase_orders|poSnap/.test(overview), 'oda za manunuzi kutoka purchase_orders');
ok(/posOfflineQueue/.test(overview), 'foleni ya POS offline inahesabiwa');
ok(/Haipatikani kwa uhakika/.test(overview), 'faida inaonyeshwa kama haipatikani');
ok(/gharama ya bidhaa/.test(overview), 'sababu ya faida kutopatikana imeelezwa');
ok(!/Math\.random/.test(overview) && !/Math\.random/.test(shell), 'hakuna Math.random kwenye modules mpya');
ok(!/3,568|3568|45000000/.test(overview), 'hakuna namba za kubuni zilizohamishwa');
ok(/bos-empty/.test(overview), 'empty states zipo');
ok(/bos-error/.test(overview) && /Jaribu tena/.test(overview), 'error state + retry zipo');
ok(/bos-skel/.test(overview), 'loading skeleton ipo');
ok(/shopOwnerUid|ownerUid/.test(overview), 'data ni ya mmiliki wa duka (scope sahihi)');

/* ---------- 5. Markup/rendering ya awali imehifadhiwa (fallback) ---------- */
/* [ULINZI 2026-11-03] renderShell inaitwa ndani ya try/catch; ikivunjika
   dashboard inarudi kwenye markup ya awali badala ya kuonyesha kosa jekundu. */
ok(/typeof window\.skhBOS\.renderShell === 'function'/.test(dash), '03-dashboard inatumia shell mpya');
ok(/try \{ __bosShellHtml = window\.skhBOS\.renderShell\(\); \}/.test(dash), 'renderShell imezungukwa na try/catch (ulinzi wa cache)');
ok(/container\.innerHTML = __bosShellHtml \|\|/.test(dash), 'fallback ya markup ya awali inatumika shell ikivunjika');
ok(/control-tower-wrapper" style="display: flex; min-height: 100vh/.test(dash), 'markup ya awali ya cockpit ipo kama fallback');
ok(/btnTab_settings/.test(dash) && /btnTab_product_compare/.test(dash), 'vitufe vya awali bado vipo kwenye fallback');
ok(/skhBusinessOverview[\s\S]{0,120}render\(ws\)/.test(tabs), '10-dashboard-tabs inaita overview mpya');
ok(/initControlTowerCharts\(data\)/.test(tabs), 'renderer ya awali (charts/tables) ipo kama fallback');

/* ---------- 6. Usajili kwenye build ---------- */
ok(/52-business-os-shell\.css/.test(head) && /52-business-os-shell\.css/.test(index), 'CSS imesajiliwa (html + index)');
ok(/110-business-os-shell\.js/.test(scripts) && /111-business-os-overview\.js/.test(scripts), 'modules zimesajiliwa kwenye scripts');
ok(/52-business-os-shell\.css/.test(index), 'index.html imejengwa upya');

/* ---------- 7. CSS: tokens + breakpoints ---------- */
ok(/#18A982|--bos-green/.test(css), 'rangi ya brand #18A982 inatumika');
ok(/@media \(max-width: 900px\)/.test(css), 'breakpoint ya tablet ipo');
ok(/@media \(max-width: 480px\)/.test(css), 'breakpoint ya simu ipo');
ok(/prefers-reduced-motion/.test(css), 'prefers-reduced-motion inaheshimiwa');
ok(/focus-visible/.test(css), 'focus states zipo (accessibility)');

if (fails.length) {
  console.log('BUSINESS OS STAGE 1A: ' + passed + ' passed, ' + fails.length + ' FAILED');
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('BUSINESS OS STAGE 1A: ' + passed + ' passed, 0 failed');
