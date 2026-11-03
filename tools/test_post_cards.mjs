/* ============================================================
 * SOKOHAI — POST CARDS (Bidhaa · Huduma · Usafiri) regression
 * Huhakiki mpangilio wa NDANI ya kadi kwenye UI halisi inayotumika:
 * uwiano wa picha, mpangilio wa jina → bei → muuzaji/chombo → eneo,
 * vibandiko vidogo, njia isiyokatwa, na urefu sawa kwenye safu.
 * Endesha: LD_LIBRARY_PATH=... node tools/test_post_cards.mjs
 * ============================================================ */
import { chromium } from 'playwright';

const BASE = 'http://localhost:8080/';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + JSON.stringify(d))); };

const IMG = 'https://res.cloudinary.com/dt7erwy1r/image/upload/w_600,h_600,c_fit,q_auto,f_auto/v1790537313/mlcnvrrceelvethukvwg.jpg';

const SAMPLES = () => {
  const img = 'https://res.cloudinary.com/dt7erwy1r/image/upload/w_600,h_600,c_fit,q_auto,f_auto/v1790537313/mlcnvrrceelvethukvwg.jpg';
  const svc = { id:'t-svc', title:'Ushonaji wa suti maalum (kwa kipimo)', price:45000, pricingModel:'starting', image:img,
    ownerName:'Asha Fashion Tailoring', verified:true, location:'Dar es Salaam — Kinondoni', rating:4.8, reviewCount:34 };
  const svcQuote = { id:'t-svc2', title:'Wiring ya nyumba', price:0, pricingModel:'quotation_required', image:img,
    ownerName:'Fundi Juma Electrical', location:'Kinondoni' };
  const drv = { id:'t-drv', title:'Cargo Transport', price:320000, image:img, ownerName:'Juma Transport Ltd', verified:true,
    pickupRegion:'Dar es Salaam', destinationRegion:'Mbeya', vehicleType:'Lori la Tani 10', rating:4.7, location:'Dar es Salaam' };
  const outCrop = { id:'t-prod', title:'Komputer kipakato', price:300000, image:img, location:'Dodoma', stock:0, imagesArray:[img,img,img] };
  const g = document.getElementById('mainFeed');
  const cols = window.innerWidth < 640 ? 2 : 5;
  const wrap = document.createElement('div');
  wrap.id = 'postCardProbe';
  wrap.style.cssText = 'grid-column:1/-1;display:grid;grid-template-columns:repeat(' + cols + ',minmax(0,1fr));gap:16px;';
  wrap.innerHTML = [
    skh.CommercePostCard(svc, 'services'),
    skh.CommercePostCard(svcQuote, 'services'),
    skh.CommercePostCard(drv, 'drivers'),
    skh.CommercePostCard(outCrop, 'products')
  ].join('');
  g.appendChild(wrap);
};

const b = await chromium.launch();
for (const vp of [{ width: 1280, height: 900, tag: 'desktop' }, { width: 1024, height: 800, tag: 'laptop' }, { width: 390, height: 844, tag: 'mobile' }]) {
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.tag === 'mobile', hasTouch: vp.tag === 'mobile' });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6500);
  const w = await p.$('button:has-text("ENDELEA NDANI")');
  if (w) { try { await w.click({ timeout: 1500 }); } catch (e) {} }
  await p.waitForTimeout(900);
  await p.evaluate(SAMPLES);
  await p.waitForTimeout(900);

  const data = await p.evaluate(() => {
    const R = e => { const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.left), y: Math.round(b.top), bottom: Math.round(b.bottom) }; };
    const read = (card) => {
      const c = R(card);
      const cs = getComputedStyle(card);
      const img = card.querySelector('.feed-img-box');
      const title = card.querySelector('.skh-title');
      const price = card.querySelector('.skh-price');
      const meta = card.querySelector('.skh-meta-row');
      const seller = card.querySelector('.skh-seller-mini');
      const sellerName = card.querySelector('.skh-seller-name');
      const pc = card.querySelector('.skh-photo-count');
      const out = card.querySelector('.skh-out-pill');
      const route = card.querySelector('.skh-route-overlay');
      const roNames = route ? [...route.querySelectorAll('.skh-ro-name')] : [];
      const body = card.querySelector('.skh-body');
      const order = [...body.children].filter(e => e.getBoundingClientRect().height > 0)
        .map(e => (e.className || '').toString());
      return {
        cls: (card.className || '').toString(),
        rect: c, radius: cs.borderTopLeftRadius, border: cs.borderTopWidth, overflow: cs.overflow,
        imgH: img ? R(img).h : 0, imgW: img ? R(img).w : 0,
        titleFs: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
        titleLines: title ? Math.round(title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight)) : 0,
        titleOverflow: title ? title.scrollHeight > title.clientHeight + 2 : false,
        priceFs: price ? parseFloat(getComputedStyle(price).fontSize) : 0,
        priceMuted: price ? price.classList.contains('skh-price--muted') : false,
        priceColor: price ? getComputedStyle(price).color : '',
        priceClipped: price ? price.scrollWidth > price.clientWidth + 1 : false,
        metaFs: meta ? parseFloat(getComputedStyle(meta).fontSize) : 0,
        metaBottomGap: meta ? Math.round(c.bottom - R(meta).bottom) : -1,
        sellerFs: seller ? parseFloat(getComputedStyle(seller).fontSize) : 0,
        sellerNameW: sellerName ? R(sellerName).w : 0,
        sellerNameText: sellerName ? sellerName.textContent.trim() : '',
        pcH: pc ? R(pc).h : 0, outH: out ? R(out).h : 0,
        outW: out ? R(out).w : 0,
        routeH: route ? R(route).h : 0,
        routeTrunc: roNames.length ? roNames.some(n => n.scrollWidth > n.clientWidth + 1) : false,
        routeText: route ? route.textContent.replace(/\s+/g, ' ').trim() : '',
        hOverflow: card.scrollWidth > card.clientWidth + 1,
        order
      };
    };
    const grid = [...document.querySelectorAll('#mainFeed .feed-card-box.skh-card')];
    const probe = [...document.querySelectorAll('#postCardProbe .feed-card-box')].map(read);
    const realRows = {};
    grid.slice(0, 12).forEach(c => { const y = Math.round(c.getBoundingClientRect().top); (realRows[y] = realRows[y] || []).push(Math.round(c.getBoundingClientRect().height)); });
    const rowHeights = Object.values(realRows).map(h => ({ count: h.length, min: Math.min(...h), max: Math.max(...h) }));
    return { probe, real: grid.slice(0, 4).map(read), rowHeights };
  });

  console.log(`\n[${vp.tag} ${vp.width}px]`);
  const [svc, quote, drv, prod] = data.probe;
  const all = [...data.probe, ...data.real];
  ok('kadi zote zina fremu moja (radius 16px, mpaka 1px, overflow hidden)',
     all.every(c => c.radius === '16px' && c.border === '1px' && c.overflow === 'hidden'), all.map(c => [c.radius, c.border, c.overflow]));
  ok('picha imejaza upana wa kadi', all.every(c => c.imgW === c.rect.w - 2), all.map(c => [c.imgW, c.rect.w]));
  ok('picha ina urefu wa kutosha (>=110px)', all.every(c => c.imgH >= 110), all.map(c => c.imgH));
  ok('jina linabaki mistari 2 (halizidi)', all.every(c => c.titleLines <= 2), all.map(c => c.titleLines));
  ok('ukubwa wa jina 11–14px', all.every(c => c.titleFs >= 11 && c.titleFs <= 14), all.map(c => c.titleFs));
  // Bei ya namba (TSh …) ni 13–16.5px; lebo kama "Kadirio linahitajika" ni ndogo kwa makusudi.
  ok('ukubwa wa bei ya namba 13–16.5px',
     all.filter(c => !c.priceMuted).every(c => c.priceFs >= 13 && c.priceFs <= 16.5),
     all.map(c => [c.priceFs, c.priceMuted]));
  ok('bei haikatwi', all.every(c => !c.priceClipped), all.map(c => c.priceClipped));
  ok('bei ni kijani cha SokoHai', all.filter(c => c.priceFs).every(c => /rgb\(14, 107, 82\)/.test(c.priceColor)), all.map(c => c.priceColor));
  ok('mstari wa eneo umefungwa chini (<=14px kutoka mwisho)', all.every(c => c.metaBottomGap >= 0 && c.metaBottomGap <= 14), all.map(c => c.metaBottomGap));
  ok('ukubwa wa eneo 9.5–11px', all.every(c => c.metaFs === 0 || (c.metaFs >= 9.5 && c.metaFs <= 11)), all.map(c => c.metaFs));
  ok('hakuna mlipuko wa upana ndani ya kadi', all.every(c => !c.hOverflow), all.map(c => c.hOverflow));
  ok('kihesabu cha picha ni kidogo (<=20px)', all.every(c => c.pcH === 0 || c.pcH <= 20), all.map(c => c.pcH));
  ok('kibandiko cha "zimeisha" ni kidogo (<=20px, si bloku kubwa)', prod.outH > 0 && prod.outH <= 20 && prod.outW <= 80, [prod.outH, prod.outW]);
  ok('mpangilio wa bidhaa: jina → bei → eneo',
     prod.order[0].includes('skh-title') && prod.order[1].includes('skh-price') && prod.order.some(o => o.includes('skh-meta-row')), prod.order);
  ok('mpangilio wa huduma: jina → bei → muuzaji → eneo',
     svc.order[0].includes('skh-title') && svc.order[1].includes('skh-price')
     && svc.order.findIndex(o => o.includes('skh-seller-row')) < svc.order.findIndex(o => o.includes('skh-meta-row')), svc.order);
  ok('mpangilio wa usafiri: jina → chombo → bei → msafirishaji → eneo',
     drv.order[0].includes('skh-title') && drv.order[1].includes('skh-card-sub')
     && drv.order[2].includes('skh-price') && drv.order[3].includes('skh-seller-row'), drv.order);
  ok('njia ya usafiri haikatwi', !drv.routeTrunc && /Dar es Salaam/.test(drv.routeText) && /Mbeya/.test(drv.routeText), [drv.routeTrunc, drv.routeText]);
  ok('jina la muuzaji linapata nafasi (>= 12 herufi au kamili)', svc.sellerNameW >= 60, [svc.sellerNameW, svc.sellerNameText]);
  ok('huduma bila bei: "Kadirio linahitajika" haikatwi', !quote.priceClipped, quote.priceClipped);
  ok('kadi za safu moja zina urefu sawa (±2px)',
     data.rowHeights.every(r => r.max - r.min <= 2), data.rowHeights);
  await ctx.close();
}
await b.close();
console.log(`\nPOST CARDS: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
