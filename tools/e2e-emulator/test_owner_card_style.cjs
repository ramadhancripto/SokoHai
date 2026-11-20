// [OWNER CARD STYLE 2026-11-20] Real browser on the emulator: every post type (product, service, transport)
// uses the owner's card: category NAME chip top-left, heart top-right, "Imethibitishwa" bottom-right
// (server trust only), name, then price with the REAL rating on the right. Home shows three rails
// Bidhaa -> Huduma -> Usafiri with "Ona Zote". Pictures are never cropped and never overflow their frame.
const L = require('./lib.cjs'); const { seed, PW } = require('./review-seed.cjs');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
(async () => {
  await seed();
  const sid = (await L.admin.auth().getUserByEmail('juma.review@sokohai.test')).uid;
  const now = Date.now(); const IMG = (f) => L.BASE + '/assets/img/categories/clean/' + f; let b = L.db.batch();
  const P = [['ocp1', 'Mche wa Nyanya', 'CAT-02', 'kilimo.webp', 50000, 4.8, true], ['ocp2', 'Shati la kitenge', 'CAT-07', 'mavazi.webp', 35000, 4.6, true], ['ocp3', 'Kiti cha mbao', 'CAT-09', 'samani.webp', 120000, null, false], ['ocp4', 'Simu janja', 'CAT-12', 'elektroniki.webp', 450000, 4.2, false]];
  P.forEach(([id, t, c, f, pr, r, tr], i) => b.set(L.db.doc('products/' + id), { userId: sid, sellerName: 'Juma', title: t, category: c, price: pr, stock: i === 3 ? 0 : 5, baseUnit: 'Kipande', condition: 'Mpya', location: 'Dar es Salaam', publicationStatus: 'published', availabilityStatus: 'available', isOnline: true, image: IMG(f), imagesArray: [IMG(f)], views: 900 - i, rating: r || null, reviewCount: r ? 12 : 0, trust: tr ? { product_inspection: { status: 'active' } } : {}, createdAt: new Date(now - i * 1000).toISOString() }));
  b.set(L.db.doc('products/ochid'), { userId: sid, title: 'Bidhaa iliyofichwa', category: 'CAT-02', price: 1000, stock: 3, publicationStatus: 'published', availabilityStatus: 'hidden', salesChannels: ['marketplace'], image: IMG('kilimo.webp'), views: 99999, createdAt: new Date().toISOString() });
  [['ocs1', 'Huduma za AC', 'IT & Tech', 'svc-tech.webp', 150000, 4.9, true], ['ocs2', 'Huduma za Usafi', 'Usafi', 'svc-cleaning.webp', 80000, 4.9, true], ['ocs3', 'Upishi wa sherehe', 'Chakula', 'svc-food.webp', 300000, null, false]]
    .forEach(([id, t, c, f, pr, r, v], i) => b.set(L.db.doc('services/' + id), { userId: sid, providerName: 'Fundi Ali', title: t, category: c, price: pr, pricingModel: 'starting', image: IMG(f), rating: r || null, reviewCount: r ? 20 : 0, providerVerified: v, location: 'Dar es Salaam', publicationStatus: 'published', createdAt: new Date(now - i * 1000).toISOString() }));
  [['ocd1', 'Safari ya Taxi', 'Taxi', 'tr-passenger.webp', 120000, 4.6, true], ['ocd2', 'Safari ya Bodaboda', 'Bodaboda', 'tr-product.webp', 20000, 4.6, true], ['ocd3', '', 'Lori', 'tr-cargo.webp', 900000, null, false]]
    .forEach(([id, t, k, f, pr, r, v], i) => b.set(L.db.doc('drivers/' + id), { userId: sid, driverName: 'Musa', title: t, vehicleType: k, price: pr, image: IMG(f), rating: r || null, reviewCount: r ? 9 : 0, verified: v, pickupRegion: 'Dar es Salaam', destinationRegion: 'Morogoro', status: 'active', isOnline: true, createdAt: new Date(now - i * 1000).toISOString() }));
  await b.commit();
  const check = (sel) => (selector) => [...document.querySelectorAll(selector)].filter(c => c.offsetParent).slice(0, 6).map(c => {
    const box = c.querySelector('.skh-oc-img'), im = box && box.querySelector(':scope > img'), r = c.getBoundingClientRect(), br = box.getBoundingClientRect(), ir = im.getBoundingClientRect();
    const q = (s) => c.querySelector(s), rect = (s) => { const e = q(s); return e ? e.getBoundingClientRect() : null; };
    const cat = rect('.skh-oc-img > .skh-badge--category, .skh-oc-img > .skh-badge--transport, .skh-oc-img > .skh-badge--service'), heart = rect('.skh-oc-img > .skh-card-heart'), ver = rect('.skh-oc-img > .skh-verified-pill');
    const price = rect('.skh-oc-price'), rating = rect('.skh-oc-row .skh-rating--card');
    return { title: (q('.skh-oc-title') || {}).textContent, chip: (q('.skh-badge--category, .skh-badge--transport, .skh-badge--service') || {}).textContent,
      chipTopLeft: !!cat && cat.left - br.left < 14 && cat.top - br.top < 14, heartTopRight: !!heart && br.right - heart.right < 14 && heart.top - br.top < 14,
      verified: !!ver, verBottomRight: !ver || (br.right - ver.right < 14 && br.bottom - ver.bottom < 14),
      ratingRight: !rating || (rating.left > price.left && rating.right <= r.right && r.right - rating.right < 16),
      ratingSameLine: !rating || Math.abs((rating.top + rating.bottom) / 2 - (price.top + price.bottom) / 2) < 8,
      rating: rating ? q('.skh-rating--card b').textContent : null, unrated: c.textContent.includes('Bado tathmini'), extra: !!q('.skh-pinloc') || /Kipande|Mpya/.test(c.textContent),
      imgInside: ir.left >= br.left - 1 && ir.right <= br.right + 1 && ir.top >= br.top - 1 && ir.bottom <= br.bottom + 1, fit: getComputedStyle(im).objectFit,
      frame: +(br.width / br.height).toFixed(2), titleOneLine: q('.skh-oc-title').getBoundingClientRect().height < 26 };
  });
  for (const [w, h] of [[360, 760], [390, 844], [1440, 900]]) {
    const vp = w + 'x' + h;
    const B = await L.open({ width: w, height: h }); const p = B.p; await L.login(p, 'buyer.review@sokohai.test', PW);
    await p.evaluate(() => { try { unlockSystem(); closeWelcome(); } catch (e) {} }); await p.waitForTimeout(3500);
    const rails = await p.evaluate(() => ['skhHomePopular', 'skhHomeServices', 'skhHomeTransport'].map(id => { const s = document.getElementById(id); return s ? { id, hidden: s.hidden, title: s.querySelector('.shx-h h2').textContent.trim(), more: (s.querySelector('.shx-h button') || {}).textContent, n: s.querySelectorAll('.skh-oc').length, top: s.getBoundingClientRect().top + scrollY } : { id, missing: true }; }));
    ok(rails.every(r => !r.missing && !r.hidden && r.n > 0 && /Ona Zote/.test(r.more)), `${vp} home has 3 rails with cards + "Ona Zote" ${JSON.stringify(rails.map(r => [r.title, r.n]))}`);
    ok(rails[0].top < rails[1].top && rails[1].top < rails[2].top, `${vp} rails order Bidhaa -> Huduma -> Usafiri`);
    const hiddenShown = await p.evaluate(() => !!document.querySelector('#skhHomePopular [onclick*="ochid"]'));
    ok(!hiddenShown, `${vp} a hidden listing is not in the Bidhaa rail`);
    for (const id of ['skhHomePopular', 'skhHomeServices', 'skhHomeTransport']) {
      await p.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'center' }), id); await p.waitForTimeout(500);
      const cards = await p.evaluate(check(), '#' + id + ' .skh-oc');
      for (const c of cards) ok(c.chip && !/CAT-\d/.test(c.chip) && c.chipTopLeft && c.heartTopRight && c.verBottomRight && c.ratingRight && !c.unrated && !c.extra && c.imgInside && c.fit === 'contain' && c.titleOneLine && Math.abs(c.frame - 1.33) < 0.05,
        `${vp} ${id} card ${JSON.stringify(c)}`);
      if (id === 'skhHomePopular') await p.screenshot({ path: path.join(OUT, `owner-cards-${vp}-home.png`) });
    }
    for (const [tab, col] of [['bidhaa', 'products'], ['services', 'services'], ['delivery', 'drivers']]) {
      await p.evaluate((t) => { window.scrollTo(0, 0); updateApp(t); }, tab); await p.waitForTimeout(3000);
      await p.evaluate(() => { const f = document.querySelector('#feedGrid .skh-oc, .skh-feed .skh-oc, #feedContainer .skh-oc'); f && f.scrollIntoView({ block: 'start' }); }); await p.waitForTimeout(700);
      const cards = await p.evaluate(check(), '#feedGrid .skh-oc, #mainFeed .skh-oc, .feed-grid .skh-oc');
      ok(cards.length > 0, `${vp} ${tab} feed shows owner-style cards (${cards.length})`);
      for (const c of cards) ok(c.chip && !/CAT-\d/.test(c.chip) && c.chipTopLeft && c.heartTopRight && c.verBottomRight && c.ratingRight && !c.unrated && !c.extra && c.imgInside && c.titleOneLine,
        `${vp} ${tab} card ${JSON.stringify(c)}`);
      await p.screenshot({ path: path.join(OUT, `owner-cards-${vp}-${tab}.png`) });
    }
    ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${vp} no sideways scroll`);
    const errs = L.realErrs(B.log); ok(!errs.length, `${vp} no JS errors ${JSON.stringify(errs.slice(0, 3))}`);
    await B.b.close();
  }
  console.log('RESULT ' + (fail ? 'FAIL ' + fail : 'PASS')); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
