/* =====================================================================
   test_calls_webrtc.mjs — simu halisi (WebRTC) kati ya "vifaa" viwili.

   Tabo MBILI za kivinjari kimoja (BroadcastChannel signalling), kamera na
   kipaza sauti vya uongo (fake devices) vya Chromium. Hii inathibitisha
   kwamba injini ya simu inaunganisha watu wawili kikweli — sio UI pekee.

   Matumizi:  source /home/user/pw.sh && node tools/test_calls_webrtc.mjs
   ===================================================================== */
import { chromium } from 'playwright';

const BASE = process.env.SKH_URL || 'http://localhost:8080/';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
}

const SEED = (uid, partner, partnerName, myName) => {
  window.skh.currentUser = { uid, email: uid + '@example.test', displayName: myName };
  window.skh.currentUserData = { displayName: myName, role: 'seller' };
  window.__authResolved = true;
  window.skh.chatCore = Object.assign(window.skh.chatCore || {}, {
    convId: 'c_' + uid, partnerUid: partner, partnerName,
    conv: { id: 'c_' + uid, participants: [uid, partner] }, msgs: []
  });
  const cw = document.getElementById('chatWith'); if (cw) cw.textContent = partnerName;
  const m = document.getElementById('chatModal'); if (m) m.style.display = 'flex';
  const l = document.getElementById('chatListModal'); if (l) l.style.display = 'none';
};

async function boot(ctx, uid, partner, partnerName, myName) {
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', uid, e.message.slice(0, 140)));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6500);
  const w = await p.$('button:has-text("ENDELEA NDANI")');
  if (w) { try { await w.click({ timeout: 1200 }); } catch (e) {} }
  await p.waitForTimeout(800);
  await p.evaluate(`(${SEED.toString()})(${JSON.stringify(uid)}, ${JSON.stringify(partner)}, ${JSON.stringify(partnerName)}, ${JSON.stringify(myName)})`);
  await p.waitForTimeout(600);
  return p;
}

async function waitState(page, want, ms = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await page.evaluate(() => (window.skhCall ? window.skhCall.state() : null));
    if (s && s.state === want) return s;
    await page.waitForTimeout(400);
  }
  return await page.evaluate(() => (window.skhCall ? window.skhCall.state() : null));
}

const b = await chromium.launch({
  args: [
    '--no-sandbox',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required'
  ]
});
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone', 'camera'] });

console.log('\n[1] Vifaa viwili: A (mwigizaji) na B (mpokeaji)');
const A = await boot(ctx, 'userA', 'userB', 'Duka la Kariakoo', 'Duka la Kariakoo');
const B = await boot(ctx, 'userB', 'userA', 'Amina Mwikwabe', 'Amina Mwikwabe');

await A.bringToFront();
console.log('\n[2] A anapiga SIMU YA VIDEO');
await A.evaluate(() => window.skhChatCall('video'));
await A.waitForTimeout(2500);

const incVisible = await B.evaluate(() => {
  const el = document.getElementById('skhCallIncoming');
  return !!el && !el.hidden;
});
ok('B anaona simu inayoingia', incVisible);
const incName = await B.evaluate(() => (document.getElementById('skhCiName') || {}).textContent || '');
ok('jina la mpigaji linaonekana kwa B', incName.indexOf('Duka') !== -1, incName);

await B.screenshot({ path: 'audit-shots/call-incoming-desktop.png' });

const ovA = await A.evaluate(() => {
  const el = document.getElementById('skhCallOverlay');
  return { hidden: el.hidden, video: el.classList.contains('is-video') };
});
ok('A anaona skrini ya simu (video)', ovA.hidden === false && ovA.video === true, JSON.stringify(ovA));

console.log('\n[3] B anakubali');
await B.bringToFront();
await B.evaluate(() => window.skhCall.accept());

const sA = await waitState(A, 'connected');
const sB = await waitState(B, 'connected');
ok('A ameunganishwa (connected)', sA && sA.state === 'connected', JSON.stringify(sA));
ok('B ameunganishwa (connected)', sB && sB.state === 'connected', JSON.stringify(sB));

const media = async (page) => page.evaluate(() => {
  const rv = document.getElementById('skhCallRemote');
  const lv = document.getElementById('skhCallLocal');
  return {
    remoteVideo: rv ? [rv.videoWidth, rv.videoHeight] : null,
    localVideo: lv ? [lv.videoWidth, lv.videoHeight] : null,
    hasRemoteClass: document.getElementById('skhCallOverlay').classList.contains('has-remote-video'),
    status: (document.getElementById('skhCallStatus') || {}).textContent
  };
});
const mA = await media(A), mB = await media(B);
ok('A anapokea video halisi ya B', mA.remoteVideo && mA.remoteVideo[0] > 0, JSON.stringify(mA.remoteVideo));
ok('B anapokea video halisi ya A', mB.remoteVideo && mB.remoteVideo[0] > 0, JSON.stringify(mB.remoteVideo));
ok('video ya mbali inaonekana (full screen)', mA.hasRemoteClass && mB.hasRemoteClass);
ok('muda wa simu unahesabiwa', /^\d+:\d\d$/.test(String(mA.status || '')), mA.status);

await A.waitForTimeout(2200);
await A.bringToFront();
await A.screenshot({ path: 'audit-shots/call-video-desktop.png' });
await B.bringToFront();
await B.screenshot({ path: 'audit-shots/call-video-receiver.png' });

console.log('\n[4] Mkrofoni: kuzima na kuwasha');
await A.evaluate(() => document.getElementById('skhCallMic').click());
const micOff = await A.evaluate(() => document.getElementById('skhCallMic').classList.contains('is-off'));
ok('mkrofoni unazimika', micOff === true);
await A.evaluate(() => document.getElementById('skhCallMic').click());

console.log('\n[5] Kukata simu');
await A.evaluate(() => window.skhCall.hangup('ended'));
const stA = await waitState(A, 'idle', 8000);
const stB = await waitState(B, 'idle', 8000);
ok('A amemaliza simu (hakuna media inayoendelea)', stA && stA.state === 'idle', JSON.stringify(stA));
ok('B amepokea kukatwa', stB && stB.state === 'idle', JSON.stringify(stB));
const camReleased = await A.evaluate(() => {
  const rv = document.getElementById('skhCallRemote');
  return !rv || !rv.srcObject;
});
ok('kamera/mic zimeachiliwa', camReleased === true);

console.log('\n[6] Simu YA SAUTI (bila video)');
await A.evaluate(() => window.skhChatCall('audio'));
await A.waitForTimeout(2200);
const inc2 = await B.evaluate(() => !document.getElementById('skhCallIncoming').hidden);
ok('B anaona simu ya sauti inayoingia', inc2);
const kindB = await B.evaluate(() => (document.getElementById('skhCiKind') || {}).textContent || '');
ok('B anaona aina ya simu (sauti)', /sauti/i.test(kindB), kindB);
await B.evaluate(() => window.skhCall.accept());
const s2A = await waitState(A, 'connected');
ok('simu ya sauti inaunganishwa', s2A && s2A.state === 'connected', JSON.stringify(s2A));
const audioOnly = await A.evaluate(() => {
  const ov = document.getElementById('skhCallOverlay');
  return { video: ov.classList.contains('is-video'), badge: (document.getElementById('skhCallBadge') || {}).textContent };
});
ok('skrini ya sauti haina video (avatar pekee)', audioOnly.video === false && /Sauti/.test(audioOnly.badge || ''), JSON.stringify(audioOnly));
await A.screenshot({ path: 'audit-shots/call-audio-desktop.png' });

await A.evaluate(() => window.skhCall.hangup('ended'));
await A.waitForTimeout(1200);

console.log('\n[7] Kukataa simu');
await A.evaluate(() => window.skhChatCall('audio'));
await A.waitForTimeout(2000);
await B.evaluate(() => window.skhCall.decline());
const decA = await waitState(A, 'idle', 8000);
ok('A anaona simu imekataliwa/imefungwa', decA && decA.state === 'idle', JSON.stringify(decA));

console.log('\n[8] Simu kwenye SIMU (390x844) — picha ya uthibitisho');
await A.setViewportSize({ width: 390, height: 844 });
await B.setViewportSize({ width: 390, height: 844 });
await A.evaluate(() => window.skhChatCall('video'));
await A.waitForTimeout(2400);
await B.screenshot({ path: 'audit-shots/call-incoming-mobile.png' });
await B.evaluate(() => window.skhCall.accept());
const sM = await waitState(A, 'connected');
const sM2 = await waitState(B, 'connected');
ok('simu ya video inaunganishwa kwenye simu', !!sM && sM.state === 'connected' && !!sM2 && sM2.state === 'connected',
   JSON.stringify([sM, sM2]));
await A.waitForTimeout(1500);
await A.screenshot({ path: 'audit-shots/call-video-mobile.png' });
const ctrlFits = await A.evaluate(() => {
  const c = document.querySelector('.skh-call-ctrl');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  const btns = [...c.querySelectorAll('.skh-call-btn')].filter(b => b.getBoundingClientRect().width > 0);
  return { overflow: c.scrollWidth > c.clientWidth + 1, inside: btns.every(x => x.getBoundingClientRect().right <= innerWidth + 1), n: btns.length };
});
ok('vitufe vya simu vinaingia kwenye skrini ya simu', ctrlFits && !ctrlFits.overflow && ctrlFits.inside, JSON.stringify(ctrlFits));
await A.evaluate(() => window.skhCall.hangup('ended'));
await A.waitForTimeout(800);

await ctx.close();
await b.close();
console.log('\nCALLS (WebRTC): ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
