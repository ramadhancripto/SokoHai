/* Muonekano wa ndani ya tangazo: mpangilio, urefu sawa, hakuna kukatwa.
   Inatumia renderer HALISI (skhAdDeliveryController → skhAdvertisementCardHtml). */
import { chromium } from 'playwright';
const b = await chromium.launch();
const results = [];
const check = (n, ok, extra='') => results.push({ n, ok: !!ok, extra });

const IMG = 'https://placehold.co/600x600/d9c2a3/6f4620/png?text=V';
const variants = [
  { key:'full',    brandName:'Duka la Kariakoo', headline:'Set ya vitanda vya mbao — punguzo 20%',
    description:'Vitanda vigumu vya mbao vinavyofaa familia. Ubora wa kudumu kwa miaka mingi.',
    image:IMG, priceTag:'TSh 35,000', link:'#p', ctaLabel:'Tembelea' },
  { key:'noprice', brandName:'SokoHai', headline:'Uza kwa usalama sokoni', image:IMG, link:'#h', ctaLabel:'Anza sasa' },
  { key:'text',    brandName:'Kariakoo Mobile', headline:'Simu mpya, bei ya ofa',
    description:'Punguzo la wiki hii kwa simu zote za 64GB. Idadi ni ndogo.',
    priceTag:'TSh 420,000', link:'#p', ctaLabel:'Tazama Zaidi' }
];

async function probe(viewport, tag) {
  const rows = [];
  for (const v of variants) {
    const ctx = await b.newContext({ viewport, deviceScaleFactor:1 });
    const p = await ctx.newPage();
    const errs=[]; p.on('pageerror', e=>errs.push(String(e.message).slice(0,100)));
    await p.goto('http://localhost:8080/', { waitUntil:'domcontentloaded' });
    await p.waitForTimeout(4500);
    const w = await p.$('button:has-text("ENDELEA NDANI")'); if (w) { try{ await w.click({timeout:1000}); }catch(e){} }
    await p.waitForTimeout(400);
    const data = await p.evaluate(async (ad) => {
      const now = Date.now();
      const full = Object.assign({ id:'AD'+ad.key, advertiserId:'s1', ownerId:'s1',
        status:'published', lifecycleStatus:'active', moderationStatus:'approved', active:true,
        placements:['home'], createdAt:new Date(now-36e5).toISOString(), startAt:now-6e4, endAt:now+864e5 }, ad);
      window.__sokohaiAnnouncementsCache=[full];
      window.skhLocalActiveCampaigns = (pl) => String(pl||'home').toLowerCase()==='home' ? [full] : [];
      window.dispatchEvent(new Event('scroll'));
      await new Promise(r=>setTimeout(r,3800));
      const cell = document.querySelector('#mainFeed > .skh-ad-cell');
      if (!cell) return { none:true };
      try { window.skhAdDeliveryController.refreshSlot(cell.querySelector('[data-skh-ad-slot]'),{force:true}); } catch(e){}
      await new Promise(r=>setTimeout(r,1500));
      const card = cell.querySelector('.skh-ann-card');
      if (!card) return { noCard:true };
      const q = s => card.querySelector(s);
      const rect = el => el ? el.getBoundingClientRect() : null;
      const head = q('.skh-ann-post-head'), media = q('.skh-ann-media') || q('.skh-ann-text-creative');
      const offer = q('.skh-ann-offer'), cta = q('.skh-ann-action');
      const brand = q('.skh-ann-brand-copy b');
      const title = q('.skh-ann-title');
      return {
        cardH: Math.round(rect(card).height), cardW: Math.round(rect(card).width),
        headH: head ? Math.round(rect(head).height) : 0,
        mediaH: media ? Math.round(rect(media).height) : 0,
        brandClipped: brand ? brand.scrollWidth > brand.clientWidth + 1 : null,
        offerClipped: offer ? offer.scrollWidth > offer.clientWidth + 1 : null,
        offerText: offer ? offer.textContent.trim() : null,
        ctaBg: cta ? getComputedStyle(cta).backgroundColor : null,
        ctaH: cta ? Math.round(rect(cta).height) : null,
        titleLines: title ? Math.round(rect(title).height / parseFloat(getComputedStyle(title).lineHeight)) : null,
        footWraps: (function(){ const f=q('.skh-ann-post-actions'); if(!f) return null;
          return Math.round(rect(f).height) > (parseFloat(getComputedStyle(f).paddingTop)+parseFloat(getComputedStyle(f).paddingBottom)+32); })(),
        footerOverflow: (function(){ const f=q('.skh-ann-post-actions'); if(!f) return null;
          return f.scrollWidth > f.clientWidth + 1; })(),
        cardOverflow: card.scrollHeight > card.clientHeight + 1
      };
    }, v);
    rows.push({ key: v.key, errs: errs.length, ...data });
    await ctx.close();
  }
  return { tag, rows };
}

const desktop = await probe({ width:1280, height:900 }, 'desktop');
const mobile  = await probe({ width:390, height:844 }, 'mobile');

const d = Object.fromEntries(desktop.rows.map(r => [r.key, r]));
const m = Object.fromEntries(mobile.rows.map(r => [r.key, r]));

check('desktop: tangazo linaonekana', !!d.full.cardH, JSON.stringify(d.full).slice(0,120));
check('desktop: picha ina urefu thabiti (168px)', d.full.mediaH === 168, 'mediaH=' + d.full.mediaH);
check('desktop: jina la mfanyabiashara halikatwi', d.full.brandClipped === false, 'clipped=' + d.full.brandClipped);
check('desktop: bei haikatwi', d.full.offerClipped === false, 'offer=' + d.full.offerText);
check('desktop: CTA ni kitufe cha kijani', d.full.ctaBg === 'rgb(15, 110, 85)', d.full.ctaBg);
check('desktop: kichwa ni mistari 2 kwa juu', d.full.titleLines === 2, 'lines=' + d.full.titleLines);
check('desktop: mstari wa mwisho hauna kukatwa', d.full.footerOverflow === false);
check('desktop: kadi haizidi urefu wake', d.full.cardOverflow === false);
check('desktop: kadi zilizo na maudhui sawa zina urefu sawa',
      d.full.cardH === d.noprice.cardH, d.full.cardH + ' vs ' + d.noprice.cardH);
check('desktop: tangazo la maandishi halikatwi', d.text.cardOverflow === false && d.text.mediaH >= 168,
      JSON.stringify({ cardOverflow:d.text.cardOverflow, cardH:d.text.cardH, mediaH:d.text.mediaH,
                       footWraps:d.text.footWraps, ctaH:d.text.ctaH, titleLines:d.text.titleLines,
                       offerClipped:d.text.offerClipped }));
check('mobile: bei inapinda, haikatwi', m.full.offerClipped === false, 'offer=' + m.full.offerText);
check('mobile: kitufe kinaonekana kamili', m.full.ctaH >= 26, 'ctaH=' + m.full.ctaH);
check('mobile: kadi haizidi', m.full.cardOverflow === false);
check('hakuna kosa la ukurasa', desktop.rows.concat(mobile.rows).every(r => !r.errs));

let pass = 0;
for (const r of results) { if (r.ok) pass++; console.log((r.ok?'PASS ':'FAIL ') + r.n + (r.ok?'':' :: ' + (r.extra||''))); }
console.log(`\n${pass}/${results.length} passed`);
await b.close();
process.exit(pass === results.length ? 0 : 1);
