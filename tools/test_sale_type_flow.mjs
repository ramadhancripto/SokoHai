/**
 * SokoHai — M1: aina 4 za mauzo ((+) → Bidhaa Sokoni)
 * Endesha: node tools/test_sale_type_flow.mjs
 *
 * KINACHOTHIBITISHWA
 *  1. Kitufe cha Bidhaa Sokoni kinafungua kichaguzi (aina 4 + "Zaidi").
 *  2. Kila aina inafungua `#sellerForm` ILE ILE na kuweka `prodSaleMode` sahihi
 *     + kuita `toggleModeFields()` iliyopo.
 *  3. Wholesale ipo chini ya "Zaidi" na inafanya kazi (saleMode=wholesale).
 *  4. POS/Duka inafungua `businessOSForm` iliyopo.
 *  5. Menyu nyingine za (+) na handlers zake HAZIJABADILIKA (uthibitisho wa HTML).
 *  6. Kichaguzi kinajifunga; Escape inafanya kazi.
 *  7. Fallback: module ikikosekana, kitufe kinafanya kile cha leo (showForm('sellerForm')).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const failures = [];
function t(name, cond, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; failures.push(name); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}

/* ---------- 1. DOM ya kawaida ya app (kipande cha html/09-admin-sell.html) ---------- */
function makeDom({ withChooserScript = true } = {}) {
    const html = `<!DOCTYPE html><html><body>
      <div class="overlay-menu" id="plusMenu" style="display:none">
        <form id="sellerForm" style="display:none">
          <select id="prodSaleMode">
            <option value="free_market" selected>Soko Huru</option>
            <option value="auction">Mnada</option>
            <option value="price_drop">Bei Kushuka</option>
            <option value="wholesale">Jumla</option>
            <option value="group_buy">Group Buy</option>
          </select>
          <div id="dynamicModeFields"></div>
          <div id="mode_auction_fields" style="display:none"><input id="aucEndTime"></div>
          <div id="mode_price_drop_fields" style="display:none"><input id="pdMinPrice"></div>
          <div id="mode_bulk_fields" style="display:none"></div>
          <div id="mode_wholesale_fields" style="display:none"></div>
          <div id="mode_groupbuy_fields" style="display:none"></div>
          <span id="priceLabel"></span>
        </form>
        <form id="businessOSForm" style="display:none"></form>
      </div>
      <div id="mainMenu" style="display:flex">
        <div class="menu-item" data-item="products">BIDHAA SOKONI</div>
        <div class="menu-item" data-item="services">MTOA HUDUMA</div>
        <div class="menu-item" data-item="delivery">USAFIRISHAJI</div>
        <div class="menu-item" data-item="member">SAJILI MWANACHAMA</div>
      </div>
    </body></html>`;

    const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
    const { window } = dom;

    // Stubs za app: zinarekodi kilichoitwa (bila kuiga logic ya ndani).
    const calls = { showForm: [], closeModals: 0, toggleModeFields: 0, toast: [] };
    window.skh = { requireAuth: () => true };
    window.showForm = (id) => {
        calls.showForm.push(id);
        const pm = window.document.getElementById('plusMenu');
        if (pm) pm.style.display = 'flex';
        const f = window.document.getElementById(id);
        if (f) f.style.display = 'block';
    };
    window.closeModals = () => { calls.closeModals++; };
    window.toggleModeFields = () => { calls.toggleModeFields++; };
    window.toast = (msg, type) => { calls.toast.push({ msg, type }); };

    if (withChooserScript) {
        const src = fs.readFileSync(path.join(ROOT, 'js/app/113-sale-type-flow.js'), 'utf8');
        const s = window.document.createElement('script');
        s.textContent = src;
        window.document.body.appendChild(s);
    }
    return { dom, window, doc: window.document, calls };
}

console.log('\n=== M1 · aina 4 za mauzo ===\n');

/* ---------- 2. Kufungua kichaguzi ---------- */
{
    const { window, doc, calls } = makeDom();
    t('module imepakia: skhOpenSaleTypeChooser ipo', typeof window.skhOpenSaleTypeChooser === 'function');
    t('module imepakia: skhSaleFlowChoose ipo', typeof window.skhSaleFlowChoose === 'function');

    window.skhOpenSaleTypeChooser();
    const panel = doc.getElementById('skhSaleTypeChooser');
    t('kichaguzi kinafunguka (#skhSaleTypeChooser)', !!panel);
    t('kichaguzi kina aina 4', panel ? panel.querySelectorAll('.skst-type').length === 4 : false);

    const ids = panel ? [...panel.querySelectorAll('.skst-type')].map((b) => b.dataset.type) : [];
    t('aina ni zile zile za #prodSaleMode',
        JSON.stringify(ids) === JSON.stringify(['free_market', 'auction', 'group_buy', 'price_drop']), ids.join(','));
    t('"Zaidi" ipo (Wholesale + POS)',
        !!panel && !!panel.querySelector('.skst-more') && !!panel.querySelector('[data-type="wholesale"]') && !!panel.querySelector('[data-pos="1"]'));
    t('#plusMenu umefunguliwa (background ile ile)', doc.getElementById('plusMenu').style.display === 'flex');
    t('#mainMenu umefichwa', doc.getElementById('mainMenu').style.display === 'none');
}

/* ---------- 3. Kila aina → sellerForm + saleMode + toggleModeFields ---------- */
for (const mode of ['free_market', 'auction', 'group_buy', 'price_drop', 'wholesale']) {
    const { window, doc, calls } = makeDom();
    window.skhOpenSaleTypeChooser();
    const btn = doc.querySelector(`.skst-type[data-type="${mode}"], .skst-link[data-type="${mode}"]`);
    if (!btn) { t(`aina ${mode}: kitufe kipo`, false); continue; }
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    const sel = doc.getElementById('prodSaleMode');
    t(`aina ${mode} → showForm('sellerForm')`, calls.showForm.includes('sellerForm'), JSON.stringify(calls.showForm));
    t(`aina ${mode} → prodSaleMode="${mode}"`, sel.value === mode, sel.value);
    t(`aina ${mode} → toggleModeFields() imeitwa`, calls.toggleModeFields >= 1);
    t(`aina ${mode} → kichaguzi kimefungwa`, !doc.getElementById('skhSaleTypeChooser'));
}

/* ---------- 4. Panel ya aina sahihi inaonekana (reuse ya toggleModeFields ya app) ---------- */
{
    const { window, doc } = makeDom();
    // toggleModeFields ya kweli kutoka app (kupima uhusiano wa panel -> saleMode)
    const real = fs.readFileSync(path.join(ROOT, 'js/app/05-forms.js'), 'utf8');
    const m = real.match(/window\.toggleModeFields = function\s*\(\)\s*\{[\s\S]*?\n\};/);
    if (m) {
        window.T = (k, d) => d;   // i18n ile ile ya app (fallback = swahili)
        const sc = doc.createElement('script');
        sc.textContent = m[0];
        doc.body.appendChild(sc);
    }
    window.skhOpenSaleTypeChooser();
    doc.querySelector('.skst-type[data-type="auction"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const auc = doc.getElementById('mode_auction_fields');
    t('Mnada → panel ya mnada inaonekana (toggleModeFields ya app)',
        !!auc && auc.style.display === 'block', auc ? auc.style.display : 'hakuna');
    // jsdom haitekelezi innerText -> tunasoma ile property iliyoandikwa na app.
    const lbl = doc.getElementById('priceLabel');
    const lblTxt = (lbl.innerText || '') + '|' + lbl.textContent;
    t('Mnada → lebo ya bei inabadilika', /Starting Bid|Dau la Kuanzia/.test(lblTxt), lblTxt);
}

/* ---------- 5. POS link ---------- */
{
    const { window, doc, calls } = makeDom();
    window.skhOpenSaleTypeChooser();
    doc.querySelector('.skst-link[data-pos="1"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    t('POS → showForm(\'businessOSForm\')', calls.showForm.includes('businessOSForm'), JSON.stringify(calls.showForm));
    t('POS → hakuna kubadilisha prodSaleMode',
        doc.getElementById('prodSaleMode').value === 'free_market', doc.getElementById('prodSaleMode').value);
}

/* ---------- 6. Kufunga + Escape ---------- */
{
    const { window, doc } = makeDom();
    window.skhOpenSaleTypeChooser();
    doc.querySelector('.skst-back').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    t('kitufe cha kurudi kinafunga kichaguzi', !doc.getElementById('skhSaleTypeChooser'));
    t('baada ya kufunga, #mainMenu unarudi', doc.getElementById('mainMenu').style.display !== 'none');

    window.skhOpenSaleTypeChooser();
    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    t('Escape inafunga kichaguzi', !doc.getElementById('skhSaleTypeChooser'));
}

/* ---------- 7. Fallback: module haijapakia ---------- */
{
    const { window, doc, calls } = makeDom({ withChooserScript: false });
    t('fallback: skhOpenSaleTypeChooser haipo', typeof window.skhOpenSaleTypeChooser === 'undefined');
    // Hii ndiyo string iliyo kwenye HTML; tunaipima kwa eval kama browser ingefanya.
    const onclick = "window.skhOpenSaleTypeChooser ? skhOpenSaleTypeChooser() : showForm('sellerForm')";
    const fn = new window.Function('window', 'showForm', 'return (' + onclick + ')');
    fn(window, window.showForm);
    t('fallback: showForm(\'sellerForm\') inaitwa', calls.showForm.includes('sellerForm'), JSON.stringify(calls.showForm));
}

/* ---------- 8. Uthibitisho wa HTML: menyu nyingine hazijabadilika ---------- */
{
    const menu = fs.readFileSync(path.join(ROOT, 'html/15-main-menu.html'), 'utf8');
    t('Bidhaa Sokoni: inatumia kichaguzi (na fallback)',
        /window\.skhOpenSaleTypeChooser \? skhOpenSaleTypeChooser\(\) : showForm\('sellerForm'\)/.test(menu));
    t('Mtoa Huduma: showForm(\'serviceForm\') haijabadilika', /onclick="showForm\('serviceForm'\)"/.test(menu));
    t('Usafirishaji: haijabadilika', /onclick="showForm\('deliveryForm'\)"/.test(menu));
    t('Sajili Mwanachama: haijabadilika', /onclick="skhOpenMemberRegistration\(\)"/.test(menu));
    const items = (menu.match(/class="menu-item/g) || []).length;
    t('menu-item: idadi ile ile (4)', items === 4, String(items));
    t('hakuna menu-item iliyoondolewa', !/disabled/i.test(menu));
}

/* ---------- 9. Uthibitisho wa files zisizohusika ---------- */
{
    const forms = fs.readFileSync(path.join(ROOT, 'js/app/05-forms.js'), 'utf8');
    t('05-forms.js: showForm haijabadilishwa (hakuna skhOpenSaleTypeChooser)', !forms.includes('skhOpenSaleTypeChooser'));
    t('05-forms.js: toggleModeFields ipo (haijaondolewa)', forms.includes('window.toggleModeFields = function'));
    const sell = fs.readFileSync(path.join(ROOT, 'html/09-admin-sell.html'), 'utf8');
    t('09-admin-sell.html: aina 5 za prodSaleMode zote zipo',
        ['free_market', 'auction', 'price_drop', 'wholesale', 'group_buy'].every((m) => sell.includes('value="' + m + '"')));
    const head = fs.readFileSync(path.join(ROOT, 'html/00-head.html'), 'utf8');
    t('CSS 71 imeongezwa (na 70 ipo)', head.includes('css/71-sale-type-flow.css') && head.includes('css/70-product-card.css'));
    const scr = fs.readFileSync(path.join(ROOT, 'html/21-scripts.html'), 'utf8');
    t('JS 113 imeongezwa kabla ya 120', scr.indexOf('113-sale-type-flow') > 0 && scr.indexOf('113-sale-type-flow') < scr.indexOf('120-live-commerce-ui'));
}

console.log(`\n${pass}/${pass + fail} pass` + (fail ? `\nKUSHINDWA: ${failures.join(' | ')}` : ''));
process.exit(fail ? 1 : 0);
