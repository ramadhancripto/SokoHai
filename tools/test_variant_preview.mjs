/* SOKOHAI — VARIANT PREVIEW regression
   1) picha za chaguo zinaonekana (thumbnails, contain, hazikatwi)
   2) "Mtazamo wa mnunuzi" (chips + picha + bei + stock)
   3) kubonyeza chip kubadilisha picha ya preview                                */
import { chromium } from 'playwright';

const BASE = 'http://localhost:8080/';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + JSON.stringify(d))); };

const svg = (fill) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#fff"/><rect x="150" y="120" width="300" height="380" rx="30" fill="${fill}"/></svg>`);
const RED = svg('#B4442F'), BLUE = svg('#3B7EA8');

const b = await chromium.launch();
for (const vp of [{ width: 1280, height: 1000, tag: 'desktop' }, { width: 390, height: 844, tag: 'mobile', m: true }]) {
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.m, hasTouch: !!vp.m, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(7000);
  const w = await p.$('button:has-text("ENDELEA NDANI")');
  if (w) { try { await w.click({ timeout: 1500 }); } catch (e) {} }
  await p.waitForTimeout(700);
  await p.evaluate(() => {
    const pm = document.getElementById('plusMenu'); if (pm) pm.style.display = 'flex';
    const f = document.getElementById('sellerForm'); if (f) f.style.display = 'block';
    if (window.toggleProductFormFields) window.toggleProductFormFields();
    const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } };
    set('prodName', 'T-shirt ya pamba');
    set('prodPrice', '25000');
    set('prodStock', '12');
    set('prodBaseUnit', 'Piece');
    // [test double] uploader halisi inahitaji mtandao/auth — tunarudisha data-URI
    window.skhUploadPicked = async () => window.__nextUpload || [];
  });
  await p.evaluate(([red, blue]) => { window.__VP_RED = red; window.__VP_BLUE = blue; }, [RED, BLUE]);

  console.log(`\n[${vp.tag}]`);

  // ── 1. ongeza chaguo halisi kupitia UI (Rangi: Nyeusi, Nyeupe · image)
  await p.evaluate(() => document.getElementById('spbAddOption').click());
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('spbEditName', 'Rangi');
    set('spbEditValue', 'Nyeusi, Nyeupe');
    set('spbEditSelector', 'image');
  });
  await p.evaluate(() => document.getElementById('spbEditorSave').click());
  await p.waitForTimeout(500);

  const afterOption = await p.evaluate(() => ({
    cards: document.querySelectorAll('#spbOptions .spb-card').length,
    values: document.querySelectorAll('#spbOptions .spb-value').length,
    attach: document.querySelectorAll('#spbOptions [data-spb="attach"]').length
  }));
  ok('chaguo "Rangi" linaongezwa (values 2)', afterOption.cards === 1 && afterOption.values === 2, afterOption);
  ok('kila value ina kitufe cha kuongeza picha', afterOption.attach === 2, afterOption);

  // ── 2. ongeza picha kwenye value ya kwanza na ya pili (kupitia kitufe halisi)
  // headless haina file chooser: tunazuia click ya input na kuweka faili kwa mkono
  await p.evaluate(() => {
    const orig = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file') { window.__lastFileInput = this; return; }
      return orig.call(this);
    };
  });
  const attachTo = async (index, url) => {
    await p.evaluate((u) => { window.__nextUpload = [u]; }, url);
    await p.evaluate((i) => {
      const b = document.querySelectorAll('#spbOptions [data-spb="attach"]')[i];
      if (b) b.click();
    }, index);
    await p.waitForTimeout(250);
    await p.evaluate(() => {
      const el = window.__lastFileInput;
      if (!el) return;
      const dt = new DataTransfer();
      dt.items.add(new File(['picha'], 'p.png', { type: 'image/png' }));
      el.files = dt.files;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await p.waitForTimeout(900);
  };
  await attachTo(0, RED);
  await attachTo(1, BLUE);

  const media = await p.evaluate(() => {
    const imgs = [...document.querySelectorAll('#spbOptions .spb-media img')];
    const t = imgs[0];
    return {
      count: imgs.length,
      fit: t ? getComputedStyle(t).objectFit : '',
      w: t ? Math.round(t.getBoundingClientRect().width) : 0,
      src: t ? t.getAttribute('src').slice(0, 22) : ''
    };
  });
  ok('picha za chaguo zinaonekana kama thumbnails (2)', media.count === 2, media);
  ok('thumbnail inatumia object-fit:contain', media.fit === 'contain', media);
  ok('thumbnail ina ukubwa wa kadi (≥56px)', media.w >= 56, media);

  // ── 3. mtazamo wa mnunuzi
  const vpState = await p.evaluate(() => {
    const host = document.getElementById('spbBuyerPreview');
    const chips = [...document.querySelectorAll('#spbBuyerPreview .skh-vp-chip')];
    const img = document.querySelector('#spbBuyerPreview .skh-vp-imgbox img');
    return {
      hidden: host ? host.hidden : true,
      chips: chips.length,
      labels: chips.map(c => c.textContent.trim()),
      pressed: chips.map(c => c.getAttribute('aria-pressed')),
      chipImg: chips.filter(c => !!c.querySelector('img')).length,
      imgSrc: img ? img.getAttribute('src') : '',
      fit: img ? getComputedStyle(img).objectFit : '',
      price: (document.querySelector('.skh-vp-price') || {}).textContent,
      stock: [...document.querySelectorAll('.skh-vp-tag')].map(t => t.textContent.trim()),
      name: (document.querySelector('.skh-vp-name') || {}).textContent
    };
  });
  ok('"Mtazamo wa mnunuzi" unaonekana', vpState.hidden === false, vpState);
  ok('chips za chaguo zinaonyeshwa (2)', vpState.chips === 2, vpState.labels);
  ok('chip ya kwanza imechaguliwa', vpState.pressed[0] === 'true' && vpState.pressed[1] === 'false', vpState.pressed);
  ok('chips zenye picha zinaonyesha thumbnail', vpState.chipImg === 2, vpState.chipImg);
  ok('preview inaonyesha picha ya chaguo (contain)', vpState.fit === 'contain' && vpState.imgSrc.startsWith('data:image/svg'), vpState);
  ok('preview inaonyesha bei TSh 25,000', /TSh\s*25,000/.test((vpState.price || '').replace(/\s+/g, ' ')), vpState.price);
  ok('preview inaonyesha stock (Ipo · 12)', vpState.stock.some(t => /Ipo\s*·\s*12/.test(t)), vpState.stock);
  ok('preview inaonyesha jina la bidhaa', /T-shirt ya pamba/.test(vpState.name || ''), vpState.name);

  // ── 4. kubonyeza chip ya pili kunabadilisha picha
  const before = vpState.imgSrc;
  const redMarker = decodeURIComponent(RED).indexOf('%23B4442F') >= 0 || RED.indexOf('B4442F') >= 0;
  await p.evaluate(() => {
    const chips = [...document.querySelectorAll('#spbBuyerPreview .skh-vp-chip')];
    chips[chips.length - 1].click();
  });
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => {
    const chips = [...document.querySelectorAll('#spbBuyerPreview .skh-vp-chip')];
    const img = document.querySelector('#spbBuyerPreview .skh-vp-imgbox img');
    return {
      pressed: chips.map(c => c.getAttribute('aria-pressed')),
      note: (document.querySelector('.skh-vp-note') || {}).textContent,
      imgSrc: img ? img.getAttribute('src') : ''
    };
  });
  ok('picha ya preview inabadilika chip ikibonyezwa', after.imgSrc && after.imgSrc !== before, [before.slice(0, 40), after.imgSrc.slice(0, 40)]);
  ok('picha mpya ni ya chaguo la pili (bluu)', after.imgSrc.indexOf('3B7EA8') >= 0, after.imgSrc.slice(0, 80));
  ok('kubonyeza chip kunahamisha uteuzi', after.pressed[0] === 'false' && after.pressed[1] === 'true', after.pressed);
  ok('maelezo yanaonyesha mchanganyiko uliochaguliwa', /Rangi:/.test(after.note || ''), after.note);

  ok('hakuna page error', errs.length === 0, errs.slice(0, 3));

  // screenshots
  await p.evaluate(() => {
    const el = document.getElementById('spbBuyerPreview');
    if (el) el.scrollIntoView({ block: 'center' });
  });
  await p.waitForTimeout(400);
  await p.screenshot({ path: `audit-shots/variant-preview-${vp.tag}.png` });
  await ctx.close();
}
await b.close();
console.log(`\nVARIANT PREVIEW: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
