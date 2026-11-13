// R13-H Group Chat phase 2 E2E (emulator only; demo records, never production evidence).
// Sidebar order + Soko glow, Huduma, Soko approval (rules-enforced), Group Buy, Oda, Mapatano (server
// negotiation engine) + Ofa, Usafirishaji, info panel, admin posting permissions (rules), stickers,
// forward, report, media/document preview.
const { seed, L, PW } = require('./review-seed.cjs');
const OUT = require('path').join(__dirname, 'out', 'r13h-'); require('fs').mkdirSync(require('path').join(__dirname, 'out'), { recursive: true });
const VP = process.env.VP || 'phone';
const vp = VP === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
const shot = (p, n) => p.screenshot({ path: OUT + VP + '-' + n + '.png' });
const ev = (p, fn, a) => p.evaluate(fn, a);
const prep = (p) => ev(p, () => { try { unlockSystem(); closeWelcome(); } catch (e) {} });
// lib.cjs answers prompts with log.promptAnswer — feed it a queue
const answers = (X, list) => { const q = list.slice(); Object.defineProperty(X.log, 'promptAnswer', { get: () => (q.length ? String(q.shift()) : ''), configurable: true }); return () => { delete X.log.promptAnswer; }; };
const tab = async (p, t) => { await p.click('#gsgTabs [data-tab=' + t + ']'); await p.waitForTimeout(400); };
(async () => {
  await seed();
  const uidOf = async (e) => (await L.admin.auth().getUserByEmail(e)).uid;
  const juma = await uidOf('juma.review@sokohai.test'), asha = await uidOf('buyer.review@sokohai.test'), neema = await uidOf('neema.review@sokohai.test'), baraka = await uidOf('baraka.review@sokohai.test');
  const img = (n) => L.BASE + '/assets/img/categories/clean/' + n + '.webp', now = Date.now(), iso = new Date().toISOString();
  const base = { publicationStatus: 'published', availabilityStatus: 'available', createdAt: iso, currency: 'TZS' };
  await L.db.doc('products/mahindi1').set(Object.assign({ userId: juma, sellerName: 'Juma Electronics', title: 'Mahindi Bora gunia 100kg', category: 'CAT-02', price: 75000, stock: 200, unit: 'Gunia', image: img('kilimo'), location: 'Dar es Salaam' }, base));
  await L.db.doc('products/gb1').set(Object.assign({ userId: juma, sellerName: 'Juma Electronics', title: 'Mahindi group buy', category: 'CAT-02', price: 75000, unit: 'Gunia', image: img('kilimo'), saleMode: 'group_buy',
    modeData: { mode: 'group_buy', groupPrice: 68000, targetUsers: 10, joinedUsers: 3, participants: [], endTime: now + 3 * 864e5 } }, base));
  await L.db.doc('products/disc1').set(Object.assign({ userId: neema, sellerName: 'Neema Digital', title: 'Mbolea ya Urea 50kg', category: 'CAT-02', price: 70000, originalPrice: 80000, unit: 'Mfuko', image: img('kilimo') }, base));
  await L.db.doc('services/svc1').set(Object.assign({ userId: neema, ownerName: 'Neema Digital', title: 'Ushauri wa kilimo', description: 'Ushauri wa mbegu na mbolea shambani', category: 'CAT-17', price: 30000, priceUnit: 'kwa siku', image: img('kilimo') }, base));
  await L.db.doc('drivers/dr1').set({ userId: baraka, driverName: 'Baraka Shop', title: 'Canter tani 3', vehicleType: 'Lori', price: 150000, priceUnit: 'kwa safari', location: 'Mwanza', createdAt: iso });
  const S = await L.open(vp); await L.login(S.p, 'juma.review@sokohai.test', PW); await prep(S.p);
  const B = await L.open(vp); await L.login(B.p, 'buyer.review@sokohai.test', PW); await prep(B.p);
  const N = await L.open({ width: 390, height: 844 }); await L.login(N.p, 'neema.review@sokohai.test', PW); await prep(N.p);
  let gid, gid2;
  await L.step('setup: group (app engine) + members; listings shared through the chat', async () => {
    gid = await ev(S.p, async () => (await skhGroupCreate({ name: 'Wakulima & Biashara', description: 'Biashara ya pamoja ya wakulima', groupType: 'PERMANENT_COMMUNITY' })).id);
    for (const P of [B.p, N.p]) L.assert((await ev(P, (g) => skhGroupJoin(g), gid)).active, 'join');
    await L.db.doc('chatGroups/' + gid + '/members/' + baraka).set({ userId: baraka, role: 'member', status: 'active', joinedAt: iso, invitedBy: null, leftAt: null });
    L.assert((await ev(S.p, (g) => skhGroupSendTyped(g, { type: 'product', product: { name: 'Mahindi Bora gunia 100kg', price: '75000', unit: 'Gunia', qty: '200', productId: 'mahindi1', sellerName: 'Juma Electronics', location: 'Dar es Salaam' } }), gid)).ok, 'product');
    L.assert((await ev(N.p, (g) => skhGroupSendTyped(g, { type: 'service', service: { name: 'Ushauri wa kilimo', price: '30000', pricingMode: 'kwa siku', serviceId: 'svc1', providerName: 'Neema Digital' } }), gid)).ok, 'service');
    await L.db.doc('orders/ord1').set({ buyerId: asha, sellerId: juma, productId: 'mahindi1', itemTitle: 'Mahindi Bora gunia 100kg', quantity: 2, totalPrice: 150000, status: 'held', paymentStatus: 'held',
      deliveryStatus: 'in_transit', delivery: { area: 'Kariakoo, Dar es Salaam', method: 'transporter' }, createdAt: iso, sellerName: 'Juma Electronics', buyerName: 'Asha Mnunuzi' });
    gid2 = await ev(B.p, async () => (await skhGroupCreate({ name: 'Kundi la pili', groupType: 'PERMANENT_COMMUNITY' })).id); return gid; });
  await L.step('sidebar: agreed order of 10 sections, Soko has its own soft glow', async () => {
    await ev(B.p, (g) => skhOpenGroupSoga(g), gid); await B.p.waitForSelector('#gsgTabs .gsg-card', { timeout: 20000 }); await B.p.waitForTimeout(2500);
    const r = await ev(B.p, () => ({ tabs: [...document.querySelectorAll('#gsgTabs .gsg-card')].map(b => b.getAttribute('aria-label')),
      glow: getComputedStyle(document.querySelector('#gsgTabs [data-tab=soko]')).boxShadow }));
    L.assert(JSON.stringify(r.tabs) === JSON.stringify(['Mazungumzo', 'Media', 'Bidhaa', 'Huduma', 'Soko', 'Group Buy', 'Oda', 'Mapatano na Ofa', 'Usafirishaji', 'Wanachama']), r.tabs.join('|'));
    L.assert(/rgba\(29, 185, 127/.test(r.glow), 'glow ' + r.glow); await shot(B.p, '01-chat'); return r.tabs.length + ' sections'; });
  await L.step('Huduma: real service record with provider, price, [Tazama huduma] [Jadili]', async () => {
    await tab(B.p, 'services'); await B.p.waitForSelector('#gsgTabServices .gb-card', { timeout: 15000 });
    const t = await ev(B.p, () => document.querySelector('#gsgTabServices .gb-card').textContent);
    L.assert(/Ushauri wa kilimo/.test(t) && /Neema Digital/.test(t) && /TSh 30,000/.test(t) && /Tazama huduma/.test(t) && /Jadili/.test(t), t); await shot(B.p, '02-huduma'); });
  await L.step('Soko rules: member entry is pending-only; cannot self-approve, sponsor, or approve others', async () => {
    const r = await ev(B.p, async (g) => { const s = window.skh, col = s.collection(s.db, 'chatGroups/' + g + '/soko'), me = s.currentUser.uid, now = new Date().toISOString();
      const base = { kind: 'ad', title: 'Natafuta mahindi gunia 50', text: 'Bei nzuri', submittedBy: me, sellerUid: me, sellerName: 'Asha', createdAt: now, sponsored: false, history: [] };
      const out = {}; const tryIt = async (k, d) => { try { await s.addDoc(col, d); out[k] = 'ok'; } catch (e) { out[k] = 'denied'; } };
      await tryIt('pending', Object.assign({}, base, { status: 'pending' }));
      await tryIt('selfApprove', Object.assign({}, base, { status: 'approved', decidedBy: me, expiresAtMs: Date.now() + 1e9 }));
      await tryIt('sponsored', Object.assign({}, base, { status: 'pending', sponsored: true }));
      return out; }, gid);
    L.assert(r.pending === 'ok' && r.selfApprove === 'denied' && r.sponsored === 'denied', JSON.stringify(r));
    const lid = (await L.db.collection('chatGroups/' + gid + '/soko').get()).docs[0].id;
    const r2 = await ev(N.p, async ([g, l]) => { const s = window.skh; try { await s.updateDoc(s.doc(s.db, 'chatGroups/' + g + '/soko/' + l), { status: 'approved', decidedBy: s.currentUser.uid, decidedAt: 'x', expiresAtMs: 1e13 }); return 'ok'; } catch (e) { return 'denied'; } }, [gid, lid]);
    L.assert(r2 === 'denied', 'member approved someone else: ' + r2); return JSON.stringify(r); });
  await L.step('Soko UI: admin approves in "Usimamizi", listing goes live with expiry; suspend hides it', async () => {
    await ev(S.p, (g) => skhOpenGroupSoga(g), gid); await S.p.waitForSelector('#gsgTabs [data-tab=soko]', { timeout: 20000 }); await S.p.waitForTimeout(2500);
    await tab(S.p, 'soko'); await S.p.waitForSelector('#gsgTabSoko .gb-subtabs [data-k=admin]', { timeout: 15000 }); await S.p.click('#gsgTabSoko .gb-subtabs [data-k=admin]');
    await S.p.waitForSelector('[data-gb=soko-decide][data-st=approved]'); await shot(S.p, '03-soko-admin');
    await S.p.click('[data-gb=soko-decide][data-st=approved]'); await S.p.waitForTimeout(1500);
    const d = (await L.db.collection('chatGroups/' + gid + '/soko').get()).docs[0].data();
    L.assert(d.status === 'approved' && d.decidedBy === juma && d.expiresAtMs > Date.now() && d.history.length >= 1, JSON.stringify(d));
    await tab(B.p, 'soko'); await B.p.waitForSelector('#gsgTabSoko .gb-card', { timeout: 15000 }); await shot(B.p, '04-soko');
    const t = await ev(B.p, () => document.querySelector('#gsgTabSoko .gb-card').textContent); L.assert(/Natafuta mahindi/.test(t) && /Tangazo/.test(t) && !/Sponsored/.test(t), t);
    await S.p.click('[data-gb=soko-decide][data-st=suspended]'); await L.answer(S.p, 'Sio la kibiashara'); await S.p.waitForTimeout(1500);
    L.assert((await L.db.collection('chatGroups/' + gid + '/soko').get()).docs[0].data().status === 'suspended', 'suspend');
    const blocked = await ev(S.p, () => /BLOCKED/.test(document.getElementById('gsgTabSoko').textContent)); L.assert(blocked, 'paid slots shown as BLOCKED'); });
  await L.step('Group Buy: target/joined, price, deadline, how-to; chat group-order creation shown as BLOCKED', async () => {
    await tab(B.p, 'groupOrders'); await B.p.waitForSelector('#gsgTabOrders .gb-card', { timeout: 15000 });
    const t = await ev(B.p, () => document.getElementById('gsgTabOrders').textContent);
    L.assert(/3<\/b>|3 \/ 10|3\s*\/\s*10 wamejiunga/.test(t) && /TSh 68,000/.test(t) && /Mwisho wa kujiunga/.test(t) && /Jiunge/.test(t) && /BLOCKED/.test(t), t.slice(0, 400)); await shot(B.p, '05-group-buy'); });
  await L.step('Oda: the group order from the Orders system — role, qty, price, payment, delivery', async () => {
    await tab(B.p, 'orders'); await B.p.waitForSelector('#gsgTabIndiv .gb-card', { timeout: 15000 });
    const t = await ev(B.p, () => document.getElementById('gsgTabIndiv').textContent);
    L.assert(/Unanunua/.test(t) && /TSh 150,000/.test(t) && /idadi 2/.test(t) && /Malipo/.test(t) && /Njiani/.test(t), t.slice(0, 300)); await shot(B.p, '06-oda'); });
  await L.step('Mapatano: buyer proposes a price from the product card (server engine) -> group card; seller accepts', async () => {
    await tab(B.p, 'chat'); await B.p.waitForSelector('#gsgMsgs .gsg-pcard [data-act=gsg-jadili]', { timeout: 15000 });
    await B.p.click('#gsgMsgs .gsg-pcard [data-act=gsg-jadili]'); await B.p.waitForSelector('.gb-pick-o[data-k=nego]'); await B.p.click('.gb-pick-o[data-k=nego]');
    await L.answer(B.p, '50'); await B.p.waitForTimeout(400); await L.answer(B.p, '72000');
    await B.p.waitForFunction(() => document.querySelector('#gsgMsgs .gsg-nego'), null, { timeout: 25000 });
    const n = (await L.db.collection('negotiations').where('buyerId', '==', asha).get()).docs[0]; L.assert(n && n.data().currentUnitPrice === 72000 && n.data().quantity === 50, 'nego');
    await ev(B.p, () => { const m = document.getElementById('gsgMsgs'); m.scrollTop = m.scrollHeight; }); await shot(B.p, '07-mapatano-card');
    await ev(S.p, (g) => skhOpenGroupSoga(g), gid); await S.p.waitForTimeout(2500); await tab(S.p, 'offers');
    await S.p.waitForSelector('#gsgTabOffers [data-gb=nego][data-cmd=ACCEPT_OFFER]', { timeout: 15000 }); await shot(S.p, '08-mapatano-seller');
    await S.p.click('#gsgTabOffers [data-gb=nego][data-cmd=ACCEPT_OFFER]'); await S.p.waitForTimeout(2500);
    const st = (await L.db.doc('negotiations/' + n.id).get()).data().currentState; L.assert(st === 'AGREEMENT', st);
    await ev(B.p, (g) => skhOpenGroupSoga(g), gid); await B.p.waitForFunction(() => { const e = document.querySelector('#gsgMsgs [data-nego-st]'); return e && /Mmekubaliana/.test(e.textContent); }, null, { timeout: 20000 });
    return st; });
  await L.step('Ofa: member listing with a real discount (-12%) and ends/limits', async () => {
    await tab(B.p, 'offers'); await B.p.waitForSelector('#gsgTabOffers .gb-subtabs [data-k=ofa]'); await B.p.click('#gsgTabOffers .gb-subtabs [data-k=ofa]');
    await B.p.waitForSelector('#gsgTabOffers .gb-off', { timeout: 15000 }); const t = await ev(B.p, () => document.getElementById('gsgTabOffers').textContent);
    L.assert(/-13%|-12%/.test(t) && /Mbolea ya Urea/.test(t), t.slice(0, 300)); await shot(B.p, '09-ofa'); });
  await L.step('Usafirishaji: order delivery status + members\' transport providers', async () => {
    await tab(B.p, 'transport'); await B.p.waitForSelector('#gsgTabTransport .gb-row', { timeout: 15000 });
    const t = await ev(B.p, () => document.getElementById('gsgTabTransport').textContent);
    L.assert(/Kariakoo/.test(t) && /Njiani/.test(t) && /Canter tani 3/.test(t) && /Omba usafiri/.test(t), t.slice(0, 300)); await shot(B.p, '10-usafirishaji'); });
  await L.step('Group information panel (desktop right column / header sheet on phone)', async () => {
    await tab(S.p, 'chat');
    if (VP === 'desktop') await S.p.waitForSelector('#gsgSide .gb-panel', { timeout: 15000 });
    else { await S.p.click('.gsg-head-txt[data-act=gsg-panel]'); await S.p.waitForSelector('#gsgPanelBody .gb-panel', { timeout: 15000 }); }
    const t = await ev(S.p, () => (document.querySelector('#gsgSide .gb-panel') || document.querySelector('#gsgPanelBody .gb-panel')).textContent);
    L.assert(/Wakulima & Biashara/.test(t) && /4 wanachama/.test(t) && /Viongozi/.test(t) && /Ruhusa za kundi/.test(t) && /Usimamizi/.test(t), t.slice(0, 300)); await shot(S.p, '11-panel'); });
  await L.step('admin permissions are enforced by RULES: share=admins blocks member product cards; send=admins blocks text', async () => {
    await ev(S.p, () => { document.getElementById('gbRules').value = 'Heshimu wanachama. Bei ziwe wazi.'; document.getElementById('gbShare').value = 'admins'; });
    await S.p.click('[data-gb=settings]'); await S.p.waitForTimeout(1500);
    const g = (await L.db.doc('chatGroups/' + gid).get()).data(); L.assert(g.sharePolicy === 'admins' && /Heshimu/.test(g.rules), JSON.stringify(g.sharePolicy));
    // raw writes: the app also guards on the client, but the point here is the server rule
    const tryN = (fn) => ev(N.p, async ([g2, f]) => { const s = window.skh, me = s.currentUser.uid; const d = f === 'p' ? { type: 'product', product: { name: 'X bidhaa', productId: 'disc1' } } : { text: 'jaribio' };
      try { await s.addDoc(s.collection(s.db, 'conversations/conv_group_' + g2 + '/messages'), Object.assign({ senderId: me, senderUid: me, senderName: 'Neema', at: new Date().toISOString() }, d)); return 'ok'; } catch (e) { return 'denied'; } }, [gid, fn]);
    const p1 = await tryN('p'), t1 = await tryN('t');
    L.assert(p1 === 'denied' && t1 === 'ok', 'share admins: product ' + p1 + ', text ' + t1);
    const okAdmin = await ev(S.p, async (g2) => { try { return (await skhGroupSendTyped(g2, { type: 'product', product: { name: 'Mahindi', productId: 'mahindi1' } })).ok; } catch (e) { return false; } }, gid); L.assert(okAdmin, 'admin may share');
    await L.db.doc('chatGroups/' + gid).update({ sendPolicy: 'admins' }); const t2 = await tryN('t'); L.assert(t2 === 'denied', 'send admins: ' + t2);
    await L.db.doc('chatGroups/' + gid).update({ sendPolicy: 'everyone', sharePolicy: 'everyone' }); return 'product ' + p1 + ' / text ' + t2; });
  await L.step('stickers, image + PDF preview, forward to another group, report', async () => {
    await ev(B.p, (g) => skhOpenGroupSoga(g), gid); await B.p.waitForTimeout(2000);
    await B.p.click('#gsgComposerRow [data-act=gsg-attach]'); await B.p.click('.gsg-plus [data-act=gsg-sticker]'); await B.p.waitForSelector('#gsgStickerPop button');
    await B.p.click('#gsgStickerPop button'); await B.p.waitForSelector('#gsgMsgs .gsg-sticker', { timeout: 15000 });
    await ev(N.p, (g) => skhGroupSendTyped(g, { type: 'image', imageUrl: location.origin + '/assets/img/categories/clean/vyakula.webp' }), gid);
    await ev(N.p, (g) => skhGroupSendTyped(g, { type: 'document', fileName: 'Bei.pdf', fileSize: 9, fileType: 'application/pdf', fileData: 'data:application/pdf;base64,JVBERi0xLjQK' }), gid);
    await B.p.waitForSelector('#gsgMsgs [data-act=gsg-img-view]', { timeout: 15000 }); await B.p.click('#gsgMsgs [data-act=gsg-img-view]'); await B.p.waitForSelector('.gb-viewer img');
    await shot(B.p, '12-image-preview'); await B.p.click('.gb-viewer [data-x]');
    await B.p.waitForSelector('#gsgMsgs [data-act=gsg-doc-view]', { timeout: 15000 }); await B.p.click('#gsgMsgs [data-act=gsg-doc-view]'); await B.p.waitForSelector('.gb-viewer iframe'); await B.p.click('.gb-viewer [data-x]');
    const fw = await ev(B.p, async ([g, g2]) => { const s = window.skh; const q = await s.getDocs(s.collection(s.db, 'conversations/conv_group_' + g + '/messages')); let m = null; q.forEach(d => { const x = d.data(); if (x.type === 'sticker') m = Object.assign({ __id: d.id }, x); });
      const r = await skhGroupSendTyped(g2, { type: 'sticker', sticker: m.sticker }); return r.ok; }, [gid, gid2]);
    L.assert(fw, 'forward (same typed engine)');
    const repP = ev(B.p, async (g) => { const s = window.skh; const q = await s.getDocs(s.collection(s.db, 'conversations/conv_group_' + g + '/messages')); let m = null; q.forEach(d => { const x = d.data(); if (x.type === 'image') m = Object.assign({ __id: d.id }, x); });
      await window.skhGB.report(g, m); return m.__id; }, gid);
    await L.answer(B.p, 'Lugha isiyofaa'); const rep = await repP;
    const rs = await L.db.collection('chatReports').where('messageId', '==', rep).get(); L.assert(rs.size === 1 && rs.docs[0].data().reportedBy === asha, 'report');
    await ev(B.p, () => { const m = document.getElementById('gsgMsgs'); m.scrollTop = m.scrollHeight; }); await B.p.waitForTimeout(500); await shot(B.p, '13-stickers'); });
  const errs = [...L.realErrs(S.log), ...L.realErrs(B.log), ...L.realErrs(N.log)]; console.log('JS errors:', errs.length, errs.slice(0, 6).join('\n'));
  console.log('RESULT', L.results.length - L.failed, 'pass', L.failed, 'fail'); await S.b.close(); await B.b.close(); await N.b.close(); process.exit(L.failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
