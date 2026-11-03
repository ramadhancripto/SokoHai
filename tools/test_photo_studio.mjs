/* SOKOHAI — PICHA STUDIO regression (sehemu ya kupakia bidhaa)
   Huhakiki: dropzone, hero 1:1 contain (picha haikatwi), thumbnails,
   weka-kuu, ondoa, live market preview, na hint chip. */
import { chromium } from 'playwright';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const BASE = 'http://localhost:8080/';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + JSON.stringify(d))); };

// PNG halisi za uwiano tofauti (zimetengenezwa kwa zlib)
function png(w, h, rgb) {
  const zlib = require('node:zlib');
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const off = y * (w * 3 + 1);
    raw[off] = 0;
    for (let x = 0; x < w; x++) {
      raw[off + 1 + x * 3] = rgb[0];
      raw[off + 2 + x * 3] = rgb[1];
      raw[off + 3 + x * 3] = rgb[2];
    }
  }
  const crcT = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcT[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const cb = Buffer.alloc(4); cb.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, cb]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}


// Picha yenye background NYEUPE na "bidhaa" katikati (kwa mtihani wa background removal)
function pngProduct(w, h, bg, fg) {
  const zlib = require('node:zlib');
  const raw = Buffer.alloc((w * 3 + 1) * h);
  const x0 = Math.round(w * 0.3), x1 = Math.round(w * 0.7);
  const y0 = Math.round(h * 0.22), y1 = Math.round(h * 0.78);
  for (let y = 0; y < h; y++) {
    const off = y * (w * 3 + 1);
    raw[off] = 0;
    for (let x = 0; x < w; x++) {
      const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
      const c = inside ? fg : bg;
      raw[off + 1 + x * 3] = c[0];
      raw[off + 2 + x * 3] = c[1];
      raw[off + 3 + x * 3] = c[2];
    }
  }
  const crcT = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcT[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const cb = Buffer.alloc(4); cb.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, cb]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ]);
}

const b = await chromium.launch();
for (const vp of [{ width: 1280, height: 900, tag: 'desktop' }, { width: 390, height: 844, tag: 'mobile', m: true }]) {
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.m, hasTouch: !!vp.m, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(7000);
  const w = await p.$('button:has-text("ENDELEA NDANI")');
  if (w) { try { await w.click({ timeout: 1500 }); } catch (e) {} }
  await p.waitForTimeout(800);

  // showForm inahitaji auth; tunafungua fomu moja kwa moja kwa ajili ya mtihani
  await p.evaluate(() => {
    const pm = document.getElementById('plusMenu'); if (pm) pm.style.display = 'flex';
    const f = document.getElementById('sellerForm'); if (f) f.style.display = 'block';
    if (window.toggleProductFormFields) window.toggleProductFormFields();
  });
  await p.waitForTimeout(900);
  console.log(`\n[${vp.tag}]`);

  const formOpen = await p.evaluate(() => {
    const f = document.getElementById('sellerForm');
    return f ? getComputedStyle(f).display !== 'none' : false;
  });
  ok('fomu ya kuweka bidhaa inafunguka', formOpen, formOpen);

  const drop = await p.$('#skhPsDrop');
  ok('dropzone ipo', !!drop, !!drop);

  // picha 3: ndefu (1:2.6), mraba (1:1), pana (2.3:1)
  await p.setInputFiles('#prodImage', [
    { name: 'chupa-ndefu.png', mimeType: 'image/png', buffer: png(300, 780, [14, 107, 82]) },
    { name: 'mraba.png', mimeType: 'image/png', buffer: png(900, 900, [59, 126, 168]) },
    { name: 'pana.png', mimeType: 'image/png', buffer: png(920, 400, [212, 80, 44]) },
    { name: 'bidhaa-bg-nyeupe.png', mimeType: 'image/png', buffer: pngProduct(800, 800, [255, 255, 255], [14, 107, 82]) }
  ]);
  await p.waitForTimeout(1200);

  const st = await p.evaluate(() => {
    const hero = document.querySelector('#prodImagePreviews .skh-ps-hero');
    const heroImg = hero ? hero.querySelector('img') : null;
    const thumbs = [...document.querySelectorAll('#prodImagePreviews .skh-ps-thumb')];
    const lp = document.querySelector('#skhPsLive .skh-lp-card');
    const lpImg = lp ? lp.querySelector('.skh-lp-imgbox img') : null;
    const hs = hero ? getComputedStyle(hero) : null;
    return {
      heroRatio: hero ? (hero.getBoundingClientRect().width / hero.getBoundingClientRect().height).toFixed(2) : 0,
      heroFit: heroImg ? getComputedStyle(heroImg).objectFit : '',
      heroBg: hero ? getComputedStyle(hero).backgroundColor : '',
      heroSrc: heroImg ? (heroImg.src || '').slice(0, 12) : '',
      heroTag: hero ? (hero.querySelector('.ps-tag') || {}).textContent : '',
      thumbs: thumbs.length,
      thumbFit: thumbs[0] ? getComputedStyle(thumbs[0].querySelector('img')).objectFit : '',
      thumbMain: thumbs[0] ? !!thumbs[0].querySelector('.ps-main') : false,
      chips: [...document.querySelectorAll('#prodImagePreviews .skh-ps-chip')].map(c => c.textContent.trim()),
      note: !!document.querySelector('#prodImagePreviews .skh-ps-note'),
      hasLive: !!lp,
      liveFit: lpImg ? getComputedStyle(lpImg).objectFit : '',
      liveRatio: lp ? (lp.querySelector('.skh-lp-imgbox').getBoundingClientRect().width / lp.querySelector('.skh-lp-imgbox').getBoundingClientRect().height).toFixed(2) : 0,
      hint: (document.getElementById('prodImageCount') || {}).textContent,
      tools: [...document.querySelectorAll('#prodImagePreviews .skh-ps-tool')].map(t => t.textContent.trim()),
      dropCompact: document.getElementById('skhPsDrop').classList.contains('is-compact')
    };
  });

  ok('hero ni mraba 1:1', st.heroRatio === '1.00', st.heroRatio);
  ok('hero inatumia object-fit:contain (picha haikatwi)', st.heroFit === 'contain', st.heroFit);
  ok('hero background nyepesi #F7FAF9', st.heroBg === 'rgb(247, 250, 249)', st.heroBg);
  ok('hero inaonyesha picha halisi', st.heroSrc === 'blob:http://', st.heroSrc);
  ok('hero ina kibandiko "Picha kuu"', /Picha kuu/i.test(st.heroTag || ''), st.heroTag);
  ok('thumbnails zote 4 zimechorwa', st.thumbs === 4, st.thumbs);
  ok('thumbnail inatumia contain', st.thumbFit === 'contain', st.thumbFit);
  ok('thumbnail ya kwanza ina alama KUU', st.thumbMain === true, st.thumbMain);
  ok('chips zinaonyesha azimio halisi', st.chips.some(c => /\d+ × \d+ px/.test(c)), st.chips);
  ok('onyo la uwiano linaonekana kwa picha ndefu', st.note === true, st.note);
  ok('live preview ya soko ipo', st.hasLive === true, st.hasLive);
  ok('live preview inatumia contain + 1:1', st.liveFit === 'contain' && st.liveRatio === '1.00', [st.liveFit, st.liveRatio]);
  ok('hint chip inasoma "Picha 4/6"', /Picha 4\/6/.test(st.hint || ''), st.hint);
  ok('dropzone imekuwa compact', st.dropCompact === true, st.dropCompact);
  ok('kuna kitufe "Ondoa picha hii"', st.tools.some(t => /Ondoa/i.test(t)), st.tools);

  // weka picha ya 2 kama kuu
  await p.evaluate(() => document.querySelectorAll('#prodImagePreviews .skh-ps-thumb')[1].click());
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    const b2 = [...document.querySelectorAll('#prodImagePreviews .skh-ps-tool')].find(t => /Weka kama picha kuu/i.test(t.textContent));
    if (b2) b2.click();
  });
  await p.waitForTimeout(400);
  const afterMain = await p.evaluate(() => {
    const t = [...document.querySelectorAll('#prodImagePreviews .skh-ps-thumb')];
    const hero = document.querySelector('#prodImagePreviews .skh-ps-hero img');
    return { firstHasMain: !!t[0].querySelector('.ps-main'), activeIsFirst: t[0].getAttribute('aria-current'), heroW: hero ? hero.naturalWidth : 0 };
  });
  ok('"Weka kama picha kuu" inahamisha picha mbele', afterMain.firstHasMain && afterMain.heroW === 900, afterMain);

  // ondoa picha
  await p.evaluate(() => {
    const b3 = [...document.querySelectorAll('#prodImagePreviews .skh-ps-tool')].find(t => /Ondoa picha hii/i.test(t.textContent));
    if (b3) b3.click();
  });
  await p.waitForTimeout(400);
  const afterRemove = await p.evaluate(() => ({
    thumbs: document.querySelectorAll('#prodImagePreviews .skh-ps-thumb').length,
    hint: document.getElementById('prodImageCount').textContent
  }));
  ok('kuondoa picha kunapunguza strip', afterRemove.thumbs === 3, afterRemove);
  ok('hint inasasishwa baada ya kuondoa', /Picha 3\/6/.test(afterRemove.hint), afterRemove.hint);

  // live preview inafuata fomu
  await p.fill('#prodName', 'Chupa ya maji 1.5L');
  await p.fill('#prodPrice', '3500');
  await p.selectOption('#prodBaseUnit', 'Bottle');
  await p.fill('#prodLocation', 'Kariakoo, Dar es Salaam');
  await p.waitForTimeout(500);
  const live = await p.evaluate(() => ({
    name: (document.querySelector('.skh-lp-name') || {}).textContent,
    price: (document.querySelector('.skh-lp-price') || {}).textContent,
    unit: (document.querySelector('.skh-lp-unit') || {}).textContent,
    loc: (document.querySelector('.skh-lp-meta span') || {}).textContent
  }));
  ok('live preview inaonyesha jina la bidhaa', /Chupa ya maji 1.5L/.test(live.name || ''), live.name);
  ok('live preview inaonyesha bei (TSh 3,500)', /TSh\s*3,500/.test((live.price || '').replace(/\s+/g, ' ')), live.price);
  ok('live preview inaonyesha kipimo (kwa chupa)', /kwa chupa/.test(live.unit || ''), live.unit);
  ok('live preview inaonyesha eneo', /Kariakoo/.test(live.loc || ''), live.loc);

  // API ya nyuma haijavunjika
  const api = await p.evaluate(() => ({
    files: typeof window.skhPhotoPickerFiles === 'function' ? window.skhPhotoPickerFiles('prodImage').length : -1,
    reset: typeof window.skhPhotoPickerReset === 'function',
    picked: typeof window.skhUploadPicked === 'function'
  }));
  ok('skhPhotoPickerFiles("prodImage") inarudisha picha 3', api.files === 3, api.files);
  ok('API ya upload ipo (reset + picked)', api.reset && api.picked, api);


  // ── REKEBISHA PICHA (background removal) ────────────────────────────────
  // chagua picha ya mwisho (background nyeupe + bidhaa katikati)
  await p.evaluate(() => {
    const t = document.querySelectorAll('#prodImagePreviews .skh-ps-thumb');
    t[t.length - 1].click();
  });
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    const b4 = [...document.querySelectorAll('#prodImagePreviews .skh-ps-tool')].find(t => /Rekebisha/i.test(t.textContent));
    if (b4) b4.click();
  });
  await p.waitForTimeout(900);
  ok('modal ya "Rekebisha picha" inafunguka', await p.evaluate(() => !!document.querySelector('.skh-ps-editor')), true);
  ok('modal ina canvas ya preview', await p.evaluate(() => { const c = document.querySelector('#psEdCanvas'); return !!c && c.width > 0; }), true);

  // ondoa background
  await p.evaluate(() => document.querySelector('.skh-ps-editor [data-ed="rmbg"]').click());
  await p.waitForTimeout(1400);
  const bgRes = await p.evaluate(() => {
    const c = document.querySelector('#psEdCanvas');
    const ctx = c.getContext('2d');
    const corner = ctx.getImageData(2, 2, 1, 1).data;
    const mid = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
    return { cornerA: corner[3], midA: mid[3], w: c.width, h: c.height,
             cornerRGB: [corner[0], corner[1], corner[2]] };
  });
  ok('background imeondolewa (kona ni uwazi)', bgRes.cornerA === 0, bgRes);
  ok('bidhaa imebaki (katikati haijafutwa)', bgRes.midA > 200, bgRes);
  ok('pembeni zimepunguzwa (trim)', bgRes.w < 800 || bgRes.h < 800, bgRes);

  // zungusha
  const beforeRot = await p.evaluate(() => { const c = document.querySelector('#psEdCanvas'); return [c.width, c.height]; });
  await p.evaluate(() => document.querySelector('.skh-ps-editor [data-ed="rotr"]').click());
  await p.waitForTimeout(500);
  const afterRot = await p.evaluate(() => { const c = document.querySelector('#psEdCanvas'); return [c.width, c.height]; });
  ok('kuzungusha kunabadilisha upana/urefu', afterRot[0] === beforeRot[1] && afterRot[1] === beforeRot[0], [beforeRot, afterRot]);
  // rudisha sawa kwa mtihani wa mwisho
  await p.evaluate(() => document.querySelector('.skh-ps-editor [data-ed="rotl"]').click());
  await p.waitForTimeout(400);

  // tumia
  await p.evaluate(() => document.querySelector('.skh-ps-editor [data-ed="apply"]').click());
  await p.waitForTimeout(1200);
  const applied = await p.evaluate(() => {
    const items = window.skhPhotoPickerFiles('prodImage');
    const hero = document.querySelector('#prodImagePreviews .skh-ps-hero img');
    const chips = [...document.querySelectorAll('#prodImagePreviews .skh-ps-chip')].map(c => c.textContent.trim());
    return {
      modalGone: !document.querySelector('.skh-ps-editor'),
      files: items.length,
      editedName: items[items.length - 1] ? items[items.length - 1].name : '',
      heroSrc: hero ? hero.src.slice(0, 5) : '',
      chips,
      hasRestore: [...document.querySelectorAll('#prodImagePreviews .skh-ps-tool')].some(t => /Rudisha picha halisi/i.test(t.textContent))
    };
  });
  ok('modal inafungwa baada ya "Tumia picha hii"', applied.modalGone === true, applied);
  ok('picha iliyohaririwa inatumika kwa upload (-nobg.png)', /-nobg\.png$/.test(applied.editedName), applied.editedName);
  ok('chip "Imehaririwa" inaonekana', applied.chips.some(c => /Imehaririwa/.test(c)), applied.chips);
  ok('kitufe "Rudisha picha halisi" kipo', applied.hasRestore === true, applied);

  // rudisha picha halisi
  await p.evaluate(() => {
    const b5 = [...document.querySelectorAll('#prodImagePreviews .skh-ps-tool')].find(t => /Rudisha picha halisi/i.test(t.textContent));
    if (b5) b5.click();
  });
  await p.waitForTimeout(500);
  const restored = await p.evaluate(() => ({
    name: (function (a) { return (a[a.length - 1] || {}).name; })(window.skhPhotoPickerFiles('prodImage')),
    chips: [...document.querySelectorAll('#prodImagePreviews .skh-ps-chip')].map(c => c.textContent.trim())
  }));
  ok('"Rudisha picha halisi" inarudisha faili la awali', restored.name === 'bidhaa-bg-nyeupe.png', restored);
  ok('chip "Imehaririwa" inaondolewa', !restored.chips.some(c => /Imehaririwa/.test(c)), restored.chips);

  ok('hakuna page error', errs.length === 0, errs.slice(0, 3));

  await p.screenshot({ path: `audit-shots/photo-studio-${vp.tag}.png`, fullPage: false });
  await ctx.close();
}
await b.close();
console.log(`\nPICHA STUDIO: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
