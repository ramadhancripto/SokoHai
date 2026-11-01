/**
 * Bottom nav slide behaviour — verified on the real build (dist via dev_server).
 * Reads computed transform, so it proves what the browser actually paints.
 */
import { chromium } from 'playwright';
const R = { checks: [], errors: [] };
const check = (n, ok, d) => R.checks.push({ n, ok: !!ok, d });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', e => R.errors.push(String(e.message).slice(0, 160)));
await p.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(6000);
const gate = p.locator('button:has-text("ENDELEA NDANI")').first();
if (await gate.count()) { await gate.click().catch(() => {}); }
await p.waitForTimeout(2000);

const state = () => p.evaluate(() => {
  const w = document.querySelector('.bottom-area-wrapper');
  if (!w) return { missing: true };
  const cs = getComputedStyle(w);
  const r = w.getBoundingClientRect();
  return {
    hidden: w.classList.contains('nav-slide-hidden'),
    transform: cs.transform,
    transition: cs.transitionDuration,
    top: Math.round(r.top),
    viewport: window.innerHeight,
    y: Math.round(window.scrollY),
    maxY: Math.round(document.documentElement.scrollHeight - window.innerHeight),
    navVisible: r.top < window.innerHeight - 20
  };
});

const top = await state();
check('nav sits at the bottom on load', !top.missing && !top.hidden && top.navVisible, JSON.stringify(top));
check('slide transition is declared (not a jump)', /0\.22s|220ms/.test(top.transition || ''), top.transition);

// scroll DOWN in steps, like a thumb
await p.evaluate(async () => {
  for (let i = 0; i < 12; i++) {
    window.scrollBy(0, 90);
    await new Promise(r => setTimeout(r, 60));
  }
  await new Promise(r => setTimeout(r, 320));
});
const down = await state();
check('scrolling down hides the nav', down.hidden === true && !down.navVisible, JSON.stringify(down));
check('hidden nav is fully off-screen (no half pill left)', down.hidden && down.top >= down.viewport - 4, `top=${down.top} vh=${down.viewport}`);

// scroll UP a little → must come back
await p.evaluate(async () => {
  for (let i = 0; i < 4; i++) {
    window.scrollBy(0, -80);
    await new Promise(r => setTimeout(r, 60));
  }
  await new Promise(r => setTimeout(r, 320));
});
const up = await state();
check('scrolling up brings the nav back', up.hidden === false && up.navVisible, JSON.stringify(up));
const restored = await p.evaluate(() => {
  const w = document.querySelector('.bottom-area-wrapper');
  const r = w.getBoundingClientRect();
  const nav = document.querySelector('.bottom-nav-main').getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight, navH: Math.round(nav.height), transform: getComputedStyle(w).transform };
});
check('restored nav is back at the bottom edge (identity transform)',
  (restored.transform === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(restored.transform)) && Math.abs(restored.bottom - restored.vh) <= 2,
  JSON.stringify(restored));

// tapping still works once restored
const tap = await p.evaluate(async () => {
  const tab = document.querySelector('#navTabBidhaa');
  if (!tab) return { skipped: true };
  tab.click();
  await new Promise(r => setTimeout(r, 1200));
  return { active: document.querySelector('#navTabBidhaa').classList.contains('active') };
});
check('restored nav is tappable again', tap.skipped || tap.active, JSON.stringify(tap));

// never hides near the top
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(400);
const nearTop = await state();
check('nav is always visible at the top of the page', nearTop.hidden === false && nearTop.navVisible, JSON.stringify(nearTop));

// at the very end of the page the nav must be reachable
await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await p.waitForTimeout(300);
await p.evaluate(() => window.dispatchEvent(new Event('scroll')));
await p.waitForTimeout(400);
const bottomState = await state();
check('nav returns at the end of the page (nothing gets trapped)', bottomState.hidden === false && bottomState.navVisible, JSON.stringify(bottomState));

// no layout shift: body padding unchanged, no horizontal overflow
const layout = await p.evaluate(() => ({
  pad: getComputedStyle(document.body).paddingBottom,
  overflowX: document.documentElement.scrollWidth - window.innerWidth,
  navHeight: Math.round(document.querySelector('.bottom-nav-main').getBoundingClientRect().height)
}));
check('no horizontal overflow introduced', layout.overflowX <= 0, JSON.stringify(layout));
check('body keeps its reserved space for the bar (no jump)', parseInt(layout.pad, 10) >= 60, JSON.stringify(layout));

// desktop must stay unaffected (nav already hidden by the 1025px rule)
const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const dp = await deskCtx.newPage();
await dp.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await dp.waitForTimeout(5000);
const desk = await dp.evaluate(() => {
  const w = document.querySelector('.bottom-area-wrapper');
  return { display: getComputedStyle(w.querySelector('.bottom-nav-main')).display, hidden: w.classList.contains('nav-slide-hidden') };
});
check('desktop keeps its own behaviour (strip stays hidden)', desk.display === 'none', JSON.stringify(desk));
await deskCtx.close();

await ctx.close();
await browser.close();
const failed = R.checks.filter(c => !c.ok);
console.log(`${R.checks.length - failed.length}/${R.checks.length} checks passed`);
failed.forEach(f => console.log('  FAIL:', f.n, '→', f.d));
if (R.errors.length) console.log('page errors:', R.errors.slice(0, 5));
process.exit(failed.length ? 1 : 0);
