/* Mwonekano wa matangazo: nafasi ya juu ya feed, badges (dashboard/chat),
   na sehemu ya idhini ya admin. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:1440,height:950} })).newPage();
const errs=[]; p.on('pageerror', e=>errs.push(String(e.message).slice(0,140)));
const dialogs=[]; p.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
await p.goto('http://localhost:8080/', { waitUntil:'domcontentloaded' });
await p.waitForTimeout(5000);
const w = await p.$('button:has-text("ENDELEA NDANI")'); if (w) { try{ await w.click({timeout:1500}); }catch(e){} }
await p.waitForTimeout(600);

const results = [];
const check = (n, ok, extra='') => results.push({ n, ok: !!ok, extra });

const out = await p.evaluate(async () => {
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  const now = Date.now();
  const ad = {
    id:'AD1', headline:'Ofa ya vitanda — punguzo 20%', text:'Vitanda vya mbao kuanzia TSh 35,000.',
    advertiserId:'seller1', ownerId:'seller1',
    status:'published', lifecycleStatus:'active', moderationStatus:'approved', active:true,
    placements:['home','dashboard','chat'],
    image:'https://placehold.co/120x120/0f6e55/fff?text=V',
    createdAt:new Date().toISOString(), startAt: now - 60000, endAt: now + 86400000
  };
  const adBadge = Object.assign({}, ad, { id:'AD2', headline:'Huduma ya usafiri — punguzo leo', placements:['dashboard','chat'] });
  window.__sokohaiAnnouncementsCache = [ad, adBadge];

  /* --- 1. feed: tangazo liwe la KWANZA --- */
  const feed = document.getElementById('mainFeed');
  const info = { feedFound: !!feed, childCount: feed ? feed.children.length : 0 };
  if (feed) {
    // chochea ukaguzi wa ads-marketplace
    window.dispatchEvent(new Event('scroll'));
    await sleep(1200);
    try { if (window.skhAdsMarketplace && window.skhAdsMarketplace.scan) window.skhAdsMarketplace.scan(); } catch(e) {}
    await sleep(2500);
    const cell = feed.querySelector(':scope > .skh-ad-cell');
    info.hasCell = !!cell;
    info.cellIndex = cell ? Array.prototype.indexOf.call(feed.children, cell) : -1;
    info.cellHasCard = !!(cell && cell.querySelector('.skh-ann-card'));
  }

  /* --- 2. badges: dashboard + chat --- */
  /* Delivery ni lazy (IntersectionObserver): host lazima ionekane skrinini. */
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:0;left:0;width:700px;z-index:99998;background:#fff;padding:8px;';
  host.innerHTML = '<div id="dashWrap"><div id="dashWorkspace">dashibodi</div></div>'
    + '<div id="chatWrap"><div id="chatList">mazungumzo</div></div>';
  document.body.appendChild(host);
  document.dispatchEvent(new Event('sokohai:dashboardRendered'));
  await sleep(1500);
  try { window.skhAdBadges.scan(); } catch(e) {}
  await sleep(3500);
  const badgeDash = document.querySelector('.skh-ad-badge[data-skh-ad-slot="dashboard"]');
  const badgeChat = document.querySelector('.skh-ad-badge[data-skh-ad-slot="chat"]');
  const badges = {
    dashboard: !!badgeDash, chat: !!badgeChat,
    dashboardFirst: !!(document.getElementById('dashWrap').children[0] &&
        document.getElementById('dashWrap').children[0].querySelector('.skh-ad-badge')),
    chatFirst: !!(document.getElementById('chatWrap').children[0] &&
        document.getElementById('chatWrap').children[0].querySelector('.skh-ad-badge')),
    filled: !!(badgeDash && badgeDash.querySelector('.skh-ann-card')),
    hasClose: !!(document.querySelector('.skh-ad-badge-close')),
    protectedSkipped: (function(){
      const wrap = document.createElement('div');
      wrap.id = 'secWrap';
      wrap.innerHTML = '<div data-skh-ad-protected="true"><div id="chatUsersList">x</div></div>';
      document.body.appendChild(wrap);
      try { window.skhAdBadges.scan(); } catch(e) {}
      return !wrap.querySelector('.skh-ad-badge');
    })()
  };

  /* --- 3. idhini: admin anaona nav + anaidhinisha --- */
  const calls = [];
  window.SOKOHAI_CLAIMS = { isAdmin: true };
  window.skh.callFunction = async (name, data) => {
    calls.push({ name, data });
    if (name === 'creativeModerationQueue') return { data:{ ok:true, items:[
      { creativeId:'C1', headline:'Ofa ya vitanda', type:'product', submittedAt:new Date().toISOString() }
    ] } };
    if (name === 'creativeModerate') return { data:{ ok:true } };
    return { data:{ ok:true } };
  };
  window.skh.currentUser = { uid:'admin1', email:'admin@example.test', displayName:'Admin' };
  window.skhOpenMarketplaceAdsStudio();
  await sleep(1500);
  const navBtn = document.querySelector('#masRoot [data-mas-nav="moderation"]');
  if (navBtn) { navBtn.click(); await sleep(1800); }
  const queueRow = document.querySelector('#masRoot .mas-row.mod');
  const approve = document.querySelector('#masRoot [data-mas-act="moderate-approve"]');
  const mod = {
    navVisible: !!navBtn,
    rowShown: !!queueRow,
    rowText: queueRow ? queueRow.textContent.slice(0,60) : '',
    hasApprove: !!approve,
    hasReject: !!document.querySelector('#masRoot [data-mas-act="moderate-reject"]'),
    queueError: (document.querySelector('#masRoot .mas-alert.error')||{}).textContent || ''
  };
  if (approve) { approve.click(); await sleep(1500); }
  mod.moderateCall = calls.filter(c=>c.name==='creativeModerate').map(c=>c.data);
  mod.successNotice = (document.querySelector('#masRoot .mas-alert.ok')||{}).textContent || '';

  /* --- 4. asiye admin haoni sehemu ya idhini --- */
  window.SOKOHAI_CLAIMS = { isAdmin: false };
  window.skh.currentUser = { uid:'u1', email:'seller@example.test' };
  const ov = document.querySelector('#masRoot [data-mas-nav="overview"]');
  if (ov) { ov.click(); await sleep(900); }
  const sellerNav = !!document.querySelector('#masRoot [data-mas-nav="moderation"]');
  return { info, badges, mod, sellerSeesModeration: sellerNav };
});

check('feed: gridi imepatikana', out.info.feedFound === true);
check('feed: tangazo linaonekana kwenye gridi', out.info.hasCell === true, JSON.stringify(out.info));
check('feed: liko nafasi ya KWANZA (index 0)', out.info.cellIndex === 0, 'index='+out.info.cellIndex);
check('feed: kadi ya tangazo imechorwa', out.info.cellHasCard === true);
check('badge: dashboard imepachikwa', out.badges.dashboard === true);
check('badge: chat imepachikwa', out.badges.chat === true);
check('badge: dashboard iko juu ya maudhui', out.badges.dashboardFirst === true);
check('badge: chat iko juu ya mazungumzo', out.badges.chatFirst === true);
check('badge: kadi imejazwa na tangazo halisi', out.badges.filled === true);
check('badge: ina kitufe cha kufunga', out.badges.hasClose === true);
check('badge: haipachikwi kwenye eneo lilindwa', out.badges.protectedSkipped === true);
check('idhini: admin anaona sehemu ya Idhini', out.mod.navVisible === true);
check('idhini: foleni inaonyesha tangazo linalosubiri', out.mod.rowShown === true, out.mod.rowText);
check('idhini: kuna vitufe vya Idhinisha na Kataa', out.mod.hasApprove && out.mod.hasReject);
check('idhini: kuidhinisha kunaita creativeModerate', (out.mod.moderateCall[0]||{}).decision === 'approve', JSON.stringify(out.mod.moderateCall));
check('idhini: taarifa ya mafanikio inaonekana', /imeidhinishwa/i.test(out.mod.successNotice), out.mod.successNotice);
check('usiri: mfanyabiashara haoni sehemu ya Idhini', out.sellerSeesModeration === false);
check('hakuna kosa la ukurasa', errs.length === 0, JSON.stringify(errs.slice(0,2)));

let pass = 0;
for (const r of results) { if (r.ok) pass++; console.log((r.ok?'PASS ':'FAIL ') + r.n + (r.ok?'':' :: '+(r.extra||''))); }
console.log(`\n${pass}/${results.length} passed`);
await b.close();
process.exit(pass === results.length ? 0 : 1);
