// [UI 2026-11-16] Upau wa juu unabaki (logo + search) ukishuka na unarudi wote ukivuta juu; kadi za bidhaa: picha ~82%, picha kamili (contain), haitoki nje ya kisanduku; jina halikatwi hadi herufi 1. Picha za majaribio ni SVG (data:) za maumbo 4 — hakuna faili za ziada.
const L = require('./lib.cjs'); const { seed, PW } = require('./review-seed.cjs');
(async () => {
  await seed();
  const now = Date.now(); let b = L.db.batch();
  const sid = (await L.admin.auth().getUserByEmail('juma.review@sokohai.test')).uid;
  const shapes = ['portrait', 'landscape', 'square', 'tall'];
  const DIM = { portrait: [600, 900], landscape: [1200, 450], square: [800, 800], tall: [400, 1200] };
  const pic = (k) => { const [w, h] = DIM[k]; return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#1f7a5c"/><rect x="8" y="8" width="${w - 16}" height="${h - 16}" fill="none" stroke="#fff" stroke-width="6"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 8}" fill="#f2c94c"/><text x="${w / 2}" y="40" font-size="32" text-anchor="middle" fill="#fff">${k}</text></svg>`); };
  for (let i = 0; i < 40; i++) { const img = pic(shapes[i % 4]); b.set(L.db.doc('products/ui16_' + i), { userId: sid, sellerName: 'Juma', title: 'Kiatu cha ngozi halisi ukubwa ' + i + ' ' + shapes[i % 4], category: 'CAT-09', price: 15000 + i * 1000, stock: i % 7 ? 3 : 0, publicationStatus: 'published', availabilityStatus: 'available', image: img, imagesArray: [img], views: 500 - i, createdAt: new Date(now - i * 1000).toISOString() }); }
  await b.commit();
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  for (const [w, h] of [[360, 760], [390, 844], [1440, 900]]) {
    const B = await L.open({ width: w, height: h }); const p = B.p; await L.login(p, 'buyer.review@sokohai.test', PW);
    await p.evaluate(() => { try { unlockSystem(); closeWelcome(); } catch (e) {} }); await p.waitForTimeout(2500);
    const hdr = () => p.evaluate(() => { const s = document.querySelector('.sticky-top-section'); const n = s.querySelector('.top-nav-row'); const q = document.getElementById('topSearchRow'); const r = n.getBoundingClientRect(); const rq = q.getBoundingClientRect(); return { sy: Math.round(scrollY), navTop: Math.round(r.top), navBot: Math.round(r.bottom), srchBot: Math.round(rq.bottom), hidden: s.classList.contains('skh-hdr-hide'), pos: getComputedStyle(s).position, ovx: document.documentElement.scrollWidth - innerWidth }; });
    const vp = w + 'x' + h;
    let s0 = await hdr(); ok(s0.navTop >= 0 && !s0.hidden && s0.pos === 'sticky', `${vp} start nav visible ${JSON.stringify(s0)}`);
    for (const y of [600, 1500, 3000]) { await p.mouse.wheel(0, 300); await p.waitForTimeout(150); await p.mouse.wheel(0, y - await p.evaluate(() => scrollY)); await p.waitForTimeout(600); const s = await hdr(); ok(s.navTop >= -1 && s.navTop < 40 && s.sy > 300, `${vp} down${y} logo+search still on screen ${JSON.stringify(s)}`); }
    await p.screenshot({ path: `out/ui16-${vp}-scrolled.png` });
    await p.mouse.wheel(0, -200); await p.waitForTimeout(600); const su = await hdr(); ok(!su.hidden && su.navTop >= 0, `${vp} up -> full header back ${JSON.stringify(su)}`);
    await p.screenshot({ path: `out/ui16-${vp}-up.png` });
    // cards in the feed
    await p.evaluate(() => scrollTo(0, 0)); await p.click('#navTabBidhaa'); await p.waitForTimeout(2500);
    const cards = await p.evaluate(() => [...document.querySelectorAll('.skh-huru')].filter(c => c.offsetParent).slice(0, 8).map(c => { const r = c.getBoundingClientRect(); const box = c.querySelector('.feed-img-box'); const br = box.getBoundingClientRect(); const im = box.querySelector(':scope > img'); const ir = im.getBoundingClientRect(); const nm = c.querySelector('.skh-huru-name'); const nat = im.naturalWidth / im.naturalHeight; const boxAr = ir.width / ir.height; const shownW = nat > boxAr ? ir.width : ir.height * nat; const shownH = nat > boxAr ? ir.width / nat : ir.height; return { src: (decodeURIComponent(im.src).match(/>(portrait|landscape|square|tall)</) || [, im.src.split('/').pop().slice(0, 30)])[1], card: [Math.round(r.width), Math.round(r.height)], imgPct: Math.round(br.height / r.height * 100), inside: ir.left >= br.left - 1 && ir.right <= br.right + 1 && ir.top >= br.top - 1 && ir.bottom <= br.bottom + 1, fit: getComputedStyle(im).objectFit, shown: [Math.round(shownW), Math.round(shownH)], nameW: Math.round(nm.getBoundingClientRect().width), nameTxt: nm.textContent.slice(0, 20), nameEllipsis: getComputedStyle(nm).textOverflow }; }));
    for (const c of cards) ok(c.imgPct >= 78 && c.imgPct <= 86 && c.inside && c.fit === 'contain' && c.nameW > c.card[0] * 0.7, `${vp} feed ${JSON.stringify(c)}`);
    await p.screenshot({ path: `out/ui16-${vp}-bidhaa.png` });
    // home rail
    await p.click('#navTabHome'); await p.waitForTimeout(2500);
    const rail = await p.evaluate(() => [...document.querySelectorAll('.shp-card')].slice(0, 4).map(c => { const r = c.getBoundingClientRect(); const box = c.querySelector('.shp-img'); const br = box.getBoundingClientRect(); const im = box.querySelector('img'); const ir = im.getBoundingClientRect(); return { src: (decodeURIComponent(im.src).match(/>(portrait|landscape|square|tall)</) || [, im.src.split('/').pop().slice(0, 30)])[1], card: [Math.round(r.width), Math.round(r.height)], imgPct: Math.round(br.height / r.height * 100), inside: ir.top >= br.top - 1 && ir.bottom <= br.bottom + 1 && ir.left >= br.left - 1 && ir.right <= br.right + 1 }; }));
    for (const c of rail) ok(c.inside && c.imgPct >= 70, `${vp} home-rail ${JSON.stringify(c)}`);
    const shp = await p.$('.shp-row'); if (shp) { await shp.scrollIntoViewIfNeeded(); await p.waitForTimeout(500); await p.screenshot({ path: `out/ui16-${vp}-home.png` }); }
    ok((await hdr()).ovx <= 0, `${vp} no sideways scroll`);
    // after a modal + back the header is still sticky and visible
    await p.evaluate(() => window.openProduct('ui16_0', 'products')); await p.waitForTimeout(1500); await p.goBack(); await p.waitForTimeout(1200);
    await p.mouse.wheel(0, 1200); await p.waitForTimeout(600); await p.mouse.wheel(0, -150); await p.waitForTimeout(600);
    const sb = await hdr(); ok(sb.navTop >= 0 && sb.pos === 'sticky', `${vp} after product+back header ok ${JSON.stringify(sb)}`);
    console.log(vp, 'js errors', JSON.stringify(L.realErrs(B.log).slice(0, 5)));
    await B.b.close();
  }
  console.log('RESULT ' + (fail ? 'FAIL ' + fail : 'PASS')); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
