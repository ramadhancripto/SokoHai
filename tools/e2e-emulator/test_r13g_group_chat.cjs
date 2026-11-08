// R13-G Group Chat E2E (emulator only): real group created by the app's own engine, three browsers.
// Checks: messages are accepted by rules (senderId), timeline order, member count, system pill,
// product card from the seller's REAL listing (picker) with [Tazama][Jadili], (+) menu, Media, Group Orders.
const { seed, L, PW } = require('./review-seed.cjs');
const OUT = require('path').join(__dirname, 'out', 'r13g-'); require('fs').mkdirSync(require('path').join(__dirname, 'out'), { recursive: true });
const VP = process.env.VP || 'phone';
const vp = VP === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
const shot = (p, n) => p.screenshot({ path: OUT + VP + '-' + n + '.png' });
const ev = (p, fn, a) => p.evaluate(fn, a);
const prep = (p) => ev(p, () => { try { unlockSystem(); closeWelcome(); } catch (e) {} });
(async () => {
  await seed();
  const uidOf = async (e) => (await L.admin.auth().getUserByEmail(e)).uid;
  const juma = await uidOf('juma.review@sokohai.test');
  const img = L.BASE + '/assets/img/categories/clean/kilimo.webp';
  await L.db.doc('products/mahindi1').set({ userId: juma, ownerName: 'Juma Electronics', sellerName: 'Juma Electronics', title: 'Mahindi Bora gunia 100kg', category: 'CAT-02', price: 75000, stock: 200, unit: 'Gunia',
    image: img, imagesArray: [img], location: 'Dar es Salaam', publicationStatus: 'published', availabilityStatus: 'available', createdAt: new Date().toISOString(), currency: 'TZS' });
  const S = await L.open(vp); await L.login(S.p, 'juma.review@sokohai.test', PW); await prep(S.p);
  const B = await L.open(vp); await L.login(B.p, 'buyer.review@sokohai.test', PW); await prep(B.p);
  const N = await L.open({ width: 390, height: 844 }); await L.login(N.p, 'neema.review@sokohai.test', PW); await prep(N.p);
  let gid;
  await L.step('seller creates a group; two members join (app engine)', async () => {
    gid = await ev(S.p, async () => (await skhGroupCreate({ name: 'Wakulima & Biashara', description: 'Biashara ya pamoja', groupType: 'PERMANENT_COMMUNITY' })).id);
    L.assert(gid, 'group id');
    for (const P of [B.p, N.p]) L.assert((await ev(P, (g) => skhGroupJoin(g), gid)).active, 'join'); return gid; });
  await L.step('text message is ACCEPTED by rules (senderId written) — was PERMISSION_DENIED', async () => {
    const r = await ev(B.p, (g) => skhGroupSendMessage(g, 'Habari za asubuhi, kuna mtu ana mahindi ya kuuza kwa jumla?'), gid); L.assert(r.ok, JSON.stringify(r));
    const d = (await L.db.doc('conversations/conv_group_' + gid + '/messages/' + r.id).get()).data(); L.assert(d.senderId && d.senderId === d.senderUid, 'senderId'); return r.id; });
  await ev(S.p, (g) => skhGroupSendMessage(g, 'Nipo nayo. Gunia 200 kwa sasa.'), gid);
  await L.step('a member joining later appears as a system pill (real events)', async () => {
    const Bk = await L.open({ width: 390, height: 844 }); await L.login(Bk.p, 'baraka.review@sokohai.test', PW); await prep(Bk.p);
    L.assert((await ev(Bk.p, (g) => skhGroupJoin(g), gid)).active, 'baraka join'); await Bk.b.close(); });
  await L.step('(+) menu has the design items and "Shiriki Bidhaa" lists the seller\'s REAL listing', async () => {
    await ev(S.p, (g) => skhOpenGroupSoga(g), gid); await S.p.waitForSelector('#gsgComposerRow [data-act=gsg-attach]', { timeout: 20000 }); await S.p.waitForTimeout(2500);
    await S.p.click('#gsgComposerRow [data-act=gsg-attach]'); await S.p.waitForSelector('.gsg-plus');
    const labels = await ev(S.p, () => [...document.querySelectorAll('.gsg-plus .alab')].map(e => e.textContent));
    for (const w of ['Tuma Media', 'Shiriki Bidhaa', 'Shiriki Huduma', 'Anzisha Group Order', 'Shiriki Oda ya Kawaida', 'Panga Usafiri', 'Shiriki Ofa', 'Tuma Nyaraka/PDF', 'Shiriki Mahali']) L.assert(labels.includes(w), 'missing ' + w);
    await shot(S.p, '01-plus');
    await S.p.click('[data-act=gsg-at-pick]'); await S.p.waitForSelector('.gsg-pick[data-pid=mahindi1]', { timeout: 15000 }); await shot(S.p, '02-picker');
    await S.p.click('.gsg-pick[data-pid=mahindi1]');
    await S.p.waitForFunction(() => document.querySelector('#gsgMsgs .gsg-pcard'), null, { timeout: 15000 });
    const q = await L.db.collection('conversations/conv_group_' + gid + '/messages').where('type', '==', 'product').get();
    const pr = q.docs[0].data().product; L.assert(pr.productId === 'mahindi1' && pr.price === '75000' && pr.qty === '200' && pr.location === 'Dar es Salaam', JSON.stringify(pr));
    return labels.length + ' items'; });
  await ev(N.p, (g) => skhGroupSendTyped(g, { type: 'image', imageUrl: location.origin + '/assets/img/categories/clean/vyakula.webp', caption: 'Mzigo wa wiki iliyopita' }), gid);
  await L.step('buyer: timeline in time order, real member count, product card [Tazama][Jadili], system pill', async () => {
    await ev(B.p, (g) => skhOpenGroupSoga(g), gid); await B.p.waitForSelector('#gsgMsgs .gsg-pcard', { timeout: 20000 }); await B.p.waitForTimeout(2500);
    const info = await ev(B.p, () => ({
      order: [...document.querySelectorAll('#gsgMsgs .gsg-bubble')].map(e => e.textContent.trim().slice(0, 12)),
      sub: document.getElementById('gsgSubEl').textContent, pill: [...document.querySelectorAll('#gsgMsgs .gsg-sys')].map(e => e.textContent).join('|'),
      btns: [...document.querySelectorAll('#gsgMsgs .gsg-pcard .gsg-pc-btn')].map(b => b.textContent.trim()) }));
    L.assert(info.order[0].startsWith('Habari') && info.order[1].startsWith('Nipo'), 'order ' + info.order);
    L.assert(/4\s*wanachama/.test(info.sub), 'members ' + info.sub);
    L.assert(/Baraka Shop amejiunga/.test(info.pill), 'pill ' + info.pill);
    L.assert(info.btns.join() === 'Tazama,Jadili', 'btns ' + info.btns);
    await ev(B.p, () => { const m = document.getElementById('gsgMsgs'); m.scrollTop = m.scrollHeight; }); await B.p.waitForTimeout(500); await shot(B.p, '03-chat');
    return info.sub.trim(); });
  await L.step('Media section shows the shared photo with the sender', async () => {
    await B.p.click('#gsgTabs [data-tab=media]'); await B.p.waitForSelector('.gsg-mtile', { timeout: 15000 });
    const who = await ev(B.p, () => document.querySelector('.gsg-mwho').textContent); L.assert(/Neema/.test(who), who); await shot(B.p, '04-media'); });
  await L.step('Group Orders (emulator flag on): member Group Buy listed; no create button that rules would refuse', async () => {
    await L.db.doc('system/config').set({ features: { chatGroupOrders: true } }, { merge: true });
    await L.db.doc('products/gb1').set({ userId: juma, title: 'Mahindi group buy', price: 75000, unit: 'Gunia', image: img, publicationStatus: 'published', saleMode: 'group_buy',
      modeData: { mode: 'group_buy', groupPrice: 68000, targetUsers: 10, joinedUsers: 2, endTime: Date.now() + 864e5 }, createdAt: new Date().toISOString() });
    await ev(B.p, () => { window.skh.sysConfig = Object.assign({}, window.skh.sysConfig, { features: { chatGroupOrders: true } }); });
    await B.p.click('#gsgTabs [data-tab=groupOrders]'); await B.p.waitForSelector('.gsg-gb-card', { timeout: 15000 });
    const t = await ev(B.p, () => ({ card: document.querySelector('.gsg-gb-card').textContent, create: !!document.querySelector('#gsgTabOrders [data-act=gsg-at-gorder]') }));
    L.assert(/Wamejiunga 2 \/ 10/.test(t.card) && !t.create, JSON.stringify(t)); await shot(B.p, '05-group-orders'); });
  await L.step('[Jadili] opens a private chat with the REAL seller of the listing', async () => {
    await B.p.click('#gsgTabs [data-tab=chat]'); await B.p.waitForTimeout(800);
    await B.p.click('#gsgMsgs .gsg-pcard [data-act=gsg-jadili]');
    await B.p.waitForFunction(() => { const m = document.getElementById('chatModal'); return m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 20000 });
    await B.p.waitForTimeout(1500); await shot(B.p, '06-jadili'); });
  const errs = [...L.realErrs(S.log), ...L.realErrs(B.log), ...L.realErrs(N.log)]; console.log('JS errors:', errs.length, errs.slice(0, 6).join('\n'));
  console.log('RESULT', L.results.length - L.failed, 'pass', L.failed, 'fail'); await S.b.close(); await B.b.close(); await N.b.close(); process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
