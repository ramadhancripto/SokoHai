/* [2026-11-06] Product details / open marketplace: retail + wholesale tiers, totals,
 * Smart Cart total, image fit, action buttons, back navigation. Emulator only.
 * Seeds two products for the s1 seller (admin SDK): one with wholesalePrice +
 * wholesaleMinQty, one in wholesale mode with tiers 5:22000 / 20:19000. */
const L = require('./lib.cjs'); const { step, assert } = L;
const PW = 'Passw0rd!x';
async function seed() {
  const sellerUid = (await L.admin.auth().getUserByEmail('seller@sokohai.test')).uid;
  const base = { userId: sellerUid, ownerName: 'Juma Muuzaji', sellerName: 'Juma Muuzaji', category: 'Electronics', location: 'Dar es Salaam', description: 'Bidhaa ya majaribio ya bei ya jumla (emulator).', image: L.BASE + '/icon-512.png', images: [L.BASE + '/icon-512.png'], imagesArray: [L.BASE + '/icon-512.png'], isOnline: true, status: 'active', publicationStatus: 'published', availabilityStatus: 'available', createdAt: new Date().toISOString(), baseUnit: 'Piece' };
  await L.db.doc('products/e2e_ws_legacy').set({ ...base, title: 'Sabuni E2E Jumla', price: 1000, stock: 500, wholesalePrice: 800, wholesaleMinQty: 10, hasBulkPackaging: false });
  await L.db.doc('products/e2e_ws_tiers').set({ ...base, title: 'Pasi E2E Tiers', price: 25000, stock: 200, saleMode: 'wholesale', modeData: { mode: 'wholesale', minQty: 5, discountValue: 0, discountType: 'amount', tiers: [{ minQty: 5, price: 22000 }, { minQty: 20, price: 19000 }] } });
  const s2 = await L.authUser('seller2@sokohai.test', PW, 'Asha Muuzaji');
  await L.db.doc('userCards/' + s2).set({ uid: s2, fullName: 'Asha Muuzaji' }, { merge: true });
  await L.db.doc('products/e2e_offer_other').set({ ...base, userId: s2, ownerName: 'Asha Muuzaji', sellerName: 'Asha Muuzaji', title: 'Pasi E2E Tiers', price: 24000, stock: 30, subCategory: 'Pasi', location: 'Arusha' });
  await L.db.doc('products/e2e_ws_tiers').set({ subCategory: 'Pasi' }, { merge: true });
  await L.db.doc('products/e2e_ws_pos').set({ ...base, title: 'Unga E2E POS Jumla', price: 3000, stock: 50, wholesalePrice: 2600, hasBulkPackaging: true, bulkUnit: 'Box' });
}
const money = s => parseInt(String(s || '').replace(/[^0-9]/g, ''), 10) || 0;
async function setQty(p, q) {
  await p.evaluate(q => { const i = document.getElementById('pmQty'); i.value = String(q); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); window.changeQty && window.changeQty(0); }, q);
  await p.waitForTimeout(500);
  return p.evaluate(() => ({ total: document.getElementById('pmTotalPriceCalc').textContent, active: (document.querySelector('#pmWholesaleNote .pm-tier-row.is-active span') || {}).textContent || '' }));
}
(async () => {
  await seed();
  for (const [vn, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1366, height: 800 }]]) {
    const B = await L.open(vp); await L.login(B.p, 'buyer@sokohai.test', PW);
    await step(`26 Product page ${vn}: wholesalePrice + MOQ shows a price table and the right total per quantity`, async () => {
      await B.p.evaluate(() => window.openProduct('e2e_ws_legacy', 'products')); await B.p.waitForTimeout(2200);
      const rows = await B.p.evaluate(() => [...document.querySelectorAll('#pmWholesaleNote .pm-tier-row')].map(r => r.innerText.replace(/\s+/g, ' ')));
      assert(rows.length === 2, 'tier rows: ' + JSON.stringify(rows));
      const a = await setQty(B.p, 3), b = await setQty(B.p, 10), c = await setQty(B.p, 40);
      assert(money(a.total) === 3000 && money(b.total) === 8000 && money(c.total) === 32000, JSON.stringify({ a, b, c }));
      assert(/1–9/.test(a.active) && /10\+/.test(b.active), 'active row ' + a.active + ' / ' + b.active);
      await B.p.screenshot({ path: `${L.SCR}/e2e/pd-${vn}-legacy-ws.png` });
      return rows.join(' | ');
    });
    await step(`27 Product page ${vn}: wholesale mode tiers 1-4 @25,000 / 5-19 @22,000 / 20+ @19,000`, async () => {
      await B.p.evaluate(() => { window.closeModals && window.closeModals(true); window.openProduct('e2e_ws_tiers', 'products'); }); await B.p.waitForTimeout(2200);
      const x = [await setQty(B.p, 2), await setQty(B.p, 5), await setQty(B.p, 20)]; const r = x.map(v => money(v.total));
      assert(JSON.stringify(r) === JSON.stringify([50000, 110000, 380000]), JSON.stringify(r));
      assert(/1–4/.test(x[0].active) && /5–19/.test(x[1].active) && /20\+/.test(x[2].active), 'active rows ' + x.map(v => v.active).join(' / '));
      await B.p.screenshot({ path: `${L.SCR}/e2e/pd-${vn}-tiers.png` });
      return r.join(',');
    });
    await step(`28 Product page ${vn}: POS-only wholesale price (no MOQ) is not advertised to online buyers`, async () => {
      await B.p.evaluate(() => { window.closeModals && window.closeModals(true); window.openProduct('e2e_ws_pos', 'products'); }); await B.p.waitForTimeout(2000);
      const s = await B.p.evaluate(() => { const n = document.getElementById('pmWholesaleNote'); return { hidden: n.hidden, text: n.innerText }; });
      const t = await setQty(B.p, 30);
      assert(s.hidden && money(t.total) === 90000, JSON.stringify({ s, t }));
      return 'ok';
    });
    await step(`29 Product page ${vn}: main image not cropped, actions visible, no horizontal scroll`, async () => {
      await B.p.evaluate(() => { window.closeModals && window.closeModals(true); window.openProduct('e2e_ws_legacy', 'products'); }); await B.p.waitForTimeout(2000);
      const m = await B.p.evaluate(() => {
        const img = document.querySelector('#pmImageSlider img'); const cs = img ? getComputedStyle(img) : null;
        const acts = [...document.querySelectorAll('#pmActionArea button')].filter(b => b.offsetParent).map(b => (b.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 24));
        return { fit: cs && cs.objectFit, acts, sw: document.documentElement.scrollWidth, iw: window.innerWidth, modalSw: (document.getElementById('productModal') || {}).scrollWidth, modalW: (document.getElementById('productModal') || {}).clientWidth };
      });
      assert(m.fit === 'contain', 'object-fit ' + m.fit);
      assert(m.acts.some(a => /Weka Oda/i.test(a)) && m.acts.some(a => /Patana/i.test(a)), 'actions ' + JSON.stringify(m.acts));
      assert(m.sw <= m.iw + 1 && m.modalSw <= m.modalW + 1, 'overflow ' + JSON.stringify(m));
      return m.acts.join(' · ');
    });
    await step(`32 Product page ${vn}: "Linganisha wauzaji" shows the same product from another seller`, async () => {
      await B.p.evaluate(() => { window.closeModals && window.closeModals(true); window.openProduct('e2e_ws_tiers', 'products'); }); await B.p.waitForTimeout(3500);
      const rows = await B.p.evaluate(() => [...document.querySelectorAll('#pmRelatedWrap .pm-offer')].map(r => r.innerText.replace(/\s+/g, ' ').slice(0, 160)));
      assert(rows.length >= 2 && rows.some(r => /Asha/.test(r)) && /Unaiangalia/.test(rows[0]), JSON.stringify(rows));
      return rows.join(' | ');
    });
    if (vn === 'phone') await step('30 Smart Cart: wholesale tier applied by quantity in the cart total', async () => {
      await B.p.evaluate(() => { localStorage.removeItem('sokohai_cart'); window.skh.myCart = []; });
      await B.p.evaluate(() => { window.closeModals && window.closeModals(true); window.openProduct('e2e_ws_tiers', 'products'); }); await B.p.waitForTimeout(2000);
      await setQty(B.p, 20);
      await B.p.evaluate(() => window.addToCart(false)); await B.p.waitForTimeout(600);
      await B.p.evaluate(() => window.openCart()); await B.p.waitForTimeout(2500);
      const txt = await B.p.evaluate(() => (document.querySelector('#cartModal .fcart-line b') || {}).textContent || '');
      assert(money(txt) === 380000, 'cart products total ' + txt);
      return txt;
    });
    const errs = L.realErrs(B.log); await step(`31 Product pages ${vn}: no page errors`, async () => { assert(!errs.length, errs.slice(0, 2).join(' || ')); return 'ok'; });
    await B.b.close();
  }
})();
