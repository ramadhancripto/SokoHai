// Real served HTML/CSS + real card builder, isolated sample data only (no Firebase writes).
// Requires the local static preview on port 4173, or set NATURAL_GRID_URL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.NATURAL_GRID_URL || 'http://127.0.0.1:4173/';
const boot = fs.readFileSync(new URL('../js/app/00-bootstrap.js', import.meta.url), 'utf8');
const start = boot.indexOf('// Ikoni ndogo ya SVG (stroke)');
const end = boot.indexOf('skh.renderFeedUI = function');
assert.ok(start >= 0 && end > start);
const cardCode = boot.slice(start, end).replace(/import[^\n]*\n/g, '');
const browser = await chromium.launch();
const svg = (w, h, color, text) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${color}"/><rect x="5" y="5" width="${w-10}" height="${h-10}" fill="none" stroke="white" stroke-width="8"/><text x="50%" y="50%" fill="white" text-anchor="middle" dominant-baseline="middle" font-size="32">${text}</text></svg>`);
const imgs = [svg(200, 400, '#187e65', 'PORTRAIT'), svg(400, 200, '#275e83', 'LANDSCAPE'), svg(300, 300, '#aa7e26', 'SQUARE'), svg(200, 400, '#9a5874', 'PORTRAIT 2'), svg(400, 200, '#466c48', 'LANDSCAPE 2'), svg(300, 300, '#84629c', 'SQUARE 2')];

for (const width of [320, 390, 768, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Keep actual markup and stylesheet links served by the preview. Disable unrelated
  // app boot/auth so that the fixture cannot access real services.
  await page.route(base, async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    await route.fulfill({ response, body: html });
  });
  await page.goto(base, { waitUntil: 'load' });
  await page.evaluate(({cardCode, imgs}) => {
    document.body.innerHTML = '<main style="padding:12px;max-width:1360px;margin:auto"><p style="font:600 13px system-ui">TEST ONLY · Sample portrait / landscape / square · no real listings</p><div id="mainFeed" class="feed-grid"></div><div class="item-slider" id="testRail"></div><section id="skhHomePopular"><div class="shp-row"><article class="shp-card"><div class="shp-img"><img id="popularImage"></div></article></div></section></main>';
    const escape = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    window.skh = { skhEscape: escape, skhJsEsc: escape, getOptimizedImageUrl: u => u || '' };
    window.skhEngagementState = { liked: {}, saved: {} }; window.skhCardIndex = {}; window.SKH_ICONS = {};
    window.eval(cardCode);
    const rows = imgs.map((image, i) => ({ id:'test'+i, title:'Bidhaa '+(i+1), image, price:12500, baseUnit:'Kg', stock:4, location:'Dar es Salaam', rating:4.8, reviewCount:4, trust:{ product_inspection:{ status:'active' } } }));
    const feed = document.getElementById('mainFeed');
    feed.innerHTML = rows.map(x => skh.SokoHuruCard(x,'products')).join('') + '<div class="skh-lazy" data-skh-lazy="1" style="grid-column:1/-1">Inapakia zaidi</div>';
    skh.setupAdaptiveFeed(feed);
    document.getElementById('testRail').innerHTML = '<div class="skh-market-slide-card">'+skh.SokoHuruCard(rows[0],'products')+'</div>';
    document.getElementById('popularImage').src = imgs[1];
  }, {cardCode, imgs});
  await page.waitForFunction(() => [...document.querySelectorAll('#mainFeed img')].every(i => i.complete && i.naturalWidth > 0));
  await page.waitForFunction(() => [...document.querySelectorAll('#mainFeed > *')].every(e => e.style.getPropertyValue('--wf-y')));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const r = await page.evaluate(() => {
    const feed = document.querySelector('#mainFeed');
    const cards = [...feed.querySelectorAll(':scope > .skh-huru')];
    const box = e => { const x = e.getBoundingClientRect(); return {x:x.x,y:x.y,w:x.width,h:x.height,right:x.right,bottom:x.bottom}; };
    const imageData = img => ({ natural:[img.naturalWidth,img.naturalHeight], box:box(img), parent:box(img.parentElement), fit:getComputedStyle(img).objectFit, padding:getComputedStyle(img).padding, position:getComputedStyle(img).position });
    return { width:document.documentElement.scrollWidth, viewport:innerWidth, grid:getComputedStyle(feed).display, gap:parseFloat(getComputedStyle(feed).rowGap), feed:box(feed), cards:cards.map(c => ({box:box(c),img:imageData(c.querySelector('img')),text:c.innerText, rating:!!c.querySelector('.skh-huru-price-row .skh-rating'), verified:!!c.querySelector('.skh-img .skh-verified-pill'), cart:!!c.querySelector('.skh-huru-cart, .skh-act--order')})), rail:imageData(document.querySelector('#testRail img')), popular:imageData(document.getElementById('popularImage')), lazy:box(feed.querySelector('.skh-lazy')) };
  });
  assert.equal(r.width, r.viewport, `horizontal overflow at ${width}`);
  assert.equal(r.grid, 'block'); assert.equal(r.cards.length, 6);
  // Each card goes to the shortest lane in DOM order, not an aligned grid row.
  const laneX = [...new Set(r.cards.map(c => Math.round(c.box.x * 10) / 10))].sort((a,b)=>a-b);
  assert.ok(laneX.length >= 2, `expected multiple lanes at ${width}`);
  const lanes = laneX.map(() => r.feed.y);
  for (const c of r.cards) {
    let shortest = lanes.indexOf(Math.min(...lanes));
    const actualLane = laneX.findIndex(x => Math.abs(x-c.box.x)<1);
    assert.equal(actualLane, shortest, `not shortest lane at ${width}`);
    assert.ok(Math.abs(c.box.y-lanes[shortest]) < 2, `bad vertical gap at ${width}`);
    lanes[shortest] = c.box.y + Math.round(c.box.h) + r.gap;
  }
  for (const c of r.cards) {
    assert.ok(Math.abs(c.img.box.w / c.img.box.h - c.img.natural[0] / c.img.natural[1]) < 0.002, `distorted ${width}: ${JSON.stringify(c.img)}`);
    assert.ok(Math.abs(c.img.box.w - c.img.parent.w) < 1 && Math.abs(c.img.box.h - c.img.parent.h) < 1, 'image frame clips image');
    assert.equal(c.img.fit, 'contain'); assert.equal(c.img.padding, '0px');
    assert.match(c.text, /Bidhaa/); assert.match(c.text, /12,500/); assert.match(c.text, /Kg/); assert.match(c.text, /Inapatikana/); assert.match(c.text, /Dar/);
    assert.ok(c.rating && c.verified && !c.cart);
    assert.ok(c.box.bottom <= r.lazy.y + 1, 'lazy sentinel must follow all cards');
  }
  for (const x of [r.rail, r.popular]) assert.ok(Math.abs(x.box.w/x.box.h-x.natural[0]/x.natural[1]) < 0.002 && x.fit === 'contain' && x.position === 'static', 'rail image distorted');
  for (let i=0;i<r.cards.length;i++) for (let j=i+1;j<r.cards.length;j++) {
    const a=r.cards[i].box,b=r.cards[j].box;
    assert.ok(a.right <= b.x+.5 || b.right <= a.x+.5 || a.bottom <= b.y+.5 || b.bottom <= a.y+.5, `overlap ${width}: ${i},${j}`);
  }
  assert.deepEqual(errors, []);
  if (width === 390) await page.screenshot({ path:'/home/user/SokoHai-natural-grid-test.png', fullPage:true });
  // A listing inserted after render must receive a waterfall position too.
  await page.evaluate(() => { const ad=document.createElement('div');ad.className='test-dynamic-item';ad.textContent='Test ad slot';ad.style.minHeight='120px';document.getElementById('mainFeed').insertBefore(ad, document.querySelector('.skh-lazy')); });
  await page.waitForFunction(() => !!document.querySelector('.test-dynamic-item').style.getPropertyValue('--wf-y'));
  await page.evaluate(() => { const ad=document.createElement('div');ad.className='skh-ad-cell';ad.style.setProperty('display','flex','important');ad.style.minHeight='100px';ad.textContent='TEST AD'; document.getElementById('mainFeed').insertBefore(ad, document.querySelector('.skh-lazy')); });
  await page.waitForFunction(() => !!document.querySelector('#mainFeed > .skh-ad-cell').style.getPropertyValue('--wf-y'));
  if (width === 390) {
    // Resize an existing feed and change a loaded image: positions must be recomputed.
    const oldWidth = await page.locator('#mainFeed > .skh-huru').first().evaluate(e => e.getBoundingClientRect().width);
    await page.setViewportSize({ width: 768, height: 900 });
    await page.waitForFunction(old => Math.abs(document.querySelector('#mainFeed > .skh-huru').getBoundingClientRect().width - old) > 5, oldWidth);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const updated = await page.locator('#mainFeed').evaluate(e => e.style.getPropertyValue('--wf-height')); 
    await page.evaluate(src => { document.querySelector('#mainFeed > .skh-huru img').src = src; }, imgs[1]);
    await page.waitForFunction(old => document.querySelector('#mainFeed').style.getPropertyValue('--wf-height') !== old, updated);
    const res = await page.locator('#mainFeed > .skh-huru img').first().evaluate(i => ({ w:i.getBoundingClientRect().width,h:i.getBoundingClientRect().height,nw:i.naturalWidth,nh:i.naturalHeight }));
    assert.ok(Math.abs(res.w/res.h-res.nw/res.nh)<0.002, 'dynamic image ratio');
  }
  console.log(`PASS ${width}px: natural portrait/landscape/square, mixed feed, no overlap, rail, sentinel, dynamic item/ad`);
  await page.close();
}
await browser.close();
