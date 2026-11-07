#!/usr/bin/env node
/**
 * SokoHai — LOCAL EMULATOR demo data (accounts + listings) for hands-on review.
 * Refuses to run unless both Firebase emulators are set; never touches production.
 * Every listing title ends with "· demo". Re-running is safe (same ids are overwritten).
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *   GCLOUD_PROJECT=demo-sokohai node tools/local-demo-seed.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('REFUSED: local emulator only (set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST).');
  process.exit(2);
}
const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-sokohai' });
const auth = admin.auth(), db = admin.firestore();
const PW = process.env.SEED_PASSWORD || 'SokoHai-Local-2026';
const BASE = process.env.SKH_LOCAL_BASE || 'http://localhost:5055';
const img = n => BASE + '/assets/img/categories/' + n + '.webp';

const ACCOUNTS = [
  { key: 'admin', email: 'admin@sokohai.test', name: 'SokoHai Admin', claims: { admin: true }, profile: { userRole: 'admin', isAdmin: true } },
  { key: 'juma', email: 'juma@sokohai.test', name: 'Juma Electronics', region: 'Dar es Salaam', verified: true,
    profile: { userRole: 'seller', isSeller: true, sellerType: 'permanent', shopName: 'Juma Electronics', businessName: 'Juma Electronics', businessSetupComplete: true } },
  { key: 'neema', email: 'neema@sokohai.test', name: 'Neema Digital', region: 'Arusha',
    profile: { userRole: 'seller', isSeller: true, sellerType: 'permanent', shopName: 'Neema Digital', businessName: 'Neema Digital', businessSetupComplete: true } },
  { key: 'baraka', email: 'baraka@sokohai.test', name: 'Baraka Shop', region: 'Mwanza',
    profile: { userRole: 'seller', isSeller: true, sellerType: 'permanent', shopName: 'Baraka Shop', businessName: 'Baraka Shop', businessSetupComplete: true } },
  { key: 'asha', email: 'asha@sokohai.test', name: 'Asha Mnunuzi', region: 'Dar es Salaam', profile: { userRole: 'buyer', isBuyer: true } },
  { key: 'wakala', email: 'wakala@sokohai.test', name: 'Wakala Aliyeidhinishwa', region: 'Dar es Salaam',
    profile: { userRole: 'agent', isAgent: true, isApprovedAgent: true, agentApprovedBy: 'local-demo-seed', agentCode: 'LOCAL-AGENT-001' } },
  { key: 'dereva', email: 'dereva@sokohai.test', name: 'Dereva Bila Idhini', region: 'Dar es Salaam',
    profile: { userRole: 'driver', isDriver: true, vehicleType: 'Bodaboda' } }
];

const uid = {};
for (const a of ACCOUNTS) {
  let u;
  try { u = await auth.getUserByEmail(a.email); await auth.updateUser(u.uid, { password: PW }); }
  catch (e) { u = await auth.createUser({ email: a.email, password: PW, displayName: a.name, emailVerified: true }); }
  if (a.claims) await auth.setCustomUserClaims(u.uid, a.claims);
  uid[a.key] = u.uid;
  await db.doc('users/' + u.uid).set(Object.assign({ uid: u.uid, email: a.email, fullName: a.name, displayName: a.name, region: a.region || '',
    sellerVerified: !!a.verified, isVerified: !!a.verified, verificationStatus: a.verified ? 'verified' : 'unverified' }, a.profile), { merge: true });
  await db.doc('userCards/' + u.uid).set({ uid: u.uid, fullName: a.name, region: a.region || '', verificationStatus: a.verified ? 'verified' : 'unverified' }, { merge: true });
}
if (uid.wakala) await db.doc('agents/' + uid.wakala).set({ userId: uid.wakala, status: 'approved', location: 'Dar es Salaam', name: 'Wakala Aliyeidhinishwa' }, { merge: true });

const now = Date.now(); let i = 0;
const P = (who, o) => {
  const a = ACCOUNTS.find(x => x.key === who);
  return db.doc('products/' + o.id).set(Object.assign({ userId: uid[who], ownerName: a.name, sellerName: a.name, location: a.region, region: a.region,
    description: 'Tangazo la demo kwa majaribio ya ndani (emulator).', publicationStatus: 'published', availabilityStatus: 'available', isOnline: true,
    currency: 'TZS', createdAt: new Date(now - (i++) * 60000).toISOString() }, o));
};
const tv = 'TVs & Home Entertainment';
await P('juma', { id: 'demo_tv55_juma', title: 'Samsung Smart TV 55 inch · demo', category: 'CAT-11', subCategory: tv, price: 1250000, stock: 6, condition: 'Mpya', baseUnit: 'Piece', image: img('elektroniki'), imagesArray: [img('elektroniki')] });
await P('neema', { id: 'demo_tv55_neema', title: 'Samsung Smart TV 55" · demo', category: 'CAT-11', subCategory: tv, price: 1190000, stock: 3, condition: 'Mpya', baseUnit: 'Piece', image: img('elektroniki'), imagesArray: [img('elektroniki')] });
await P('baraka', { id: 'demo_tv43_baraka', title: 'Samsung Smart TV 43 inch · demo', category: 'CAT-11', subCategory: tv, price: 780000, stock: 9, condition: 'Mpya', baseUnit: 'Piece', image: img('elektroniki'), imagesArray: [img('elektroniki')] });
await P('baraka', { id: 'demo_tv_legacy', title: 'Samsung TV 55 inch (rekodi ya zamani) · demo', category: 'Electronics & Teknoloji (Tech)', subCategory: 'TVs & Displays', price: 990000, stock: 2, condition: 'Iliyotumika', baseUnit: 'Piece', image: img('elektroniki'), imagesArray: [img('elektroniki')] });
await P('juma', { id: 'demo_rice5', title: 'Mchele Kyela 5kg · demo', category: 'CAT-01', subCategory: 'Nafaka', price: 16000, stock: 80, baseUnit: 'Mfuko', saleMode: 'wholesale', modeData: { mode: 'wholesale', tiers: [{ minQty: 10, price: 14500 }] }, image: img('vyakula'), imagesArray: [img('vyakula')] });
await P('neema', { id: 'demo_rice25', title: 'Mchele Kyela 25kg · demo', category: 'CAT-01', subCategory: 'Nafaka', price: 72000, stock: 25, baseUnit: 'Gunia', image: img('vyakula'), imagesArray: [img('vyakula')] });
await P('neema', { id: 'demo_urea50', title: 'Mbolea ya Urea 50kg · demo', category: 'CAT-02', subCategory: 'Mbolea', price: 78000, stock: 30, baseUnit: 'Mfuko', image: img('kilimo'), imagesArray: [img('kilimo')] });
await P('baraka', { id: 'demo_sofa3', title: 'Sofa ya Mninga 3 seater · demo', category: 'CAT-09', subCategory: 'Sofa', price: 950000, stock: 2, condition: 'Mpya', baseUnit: 'Seti', image: img('samani'), imagesArray: [img('samani')] });
await P('juma', { id: 'demo_shati', title: 'Shati la Pamba · demo', category: 'CAT-07', subCategory: 'Mashati', price: 25000, stock: 40, condition: 'Mpya', baseUnit: 'Piece', image: img('mavazi'), imagesArray: [img('mavazi')] });
await db.doc('services/demo_fundi_bomba').set({ userId: uid.baraka, ownerName: 'Baraka Shop', title: 'Fundi Bomba · demo', price: 20000, pricingModel: 'fixed',
  category: 'Home & Personal', subCategory: 'Plumbing', location: 'Mwanza', description: 'Huduma ya demo (emulator).', createdAt: new Date().toISOString() });
await db.doc('ride_requests/demo_open_ride').set({ customerId: uid.asha, status: 'searching', reqCategory: 'Cargo', vehicleType: 'Bodaboda',
  fromLocation: 'Kariakoo', toLocation: 'Mbezi', cargoName: 'Mzigo wa demo', fare: 5000, createdAt: new Date().toISOString() });
await db.doc('ride_requests/demo_open_ride/private/contact').set({ customerId: uid.asha, customerName: 'Asha Mnunuzi', customerPhone: '0700000000' });

// [R13-B] Mnada Live, Bei Kushuka Live, Live Commerce na Hali — data ya demo (emulator tu).
await P('juma', { id: 'demo_auction_simu', title: 'Simu Samsung A54 (mnada) · demo', category: 'CAT-12', subCategory: 'Smartphones', price: 300000, stock: 1, condition: 'Iliyotumika', baseUnit: 'Piece', image: img('elektroniki'), imagesArray: [img('elektroniki')],
  saleMode: 'auction', modeData: { mode: 'auction', startTime: now - 60000, endTime: now + 6 * 3600000, minIncrement: 5000, currentBid: 300000, totalBids: 0 } });
await P('juma', { id: 'demo_pricedrop_spika', title: 'Spika JBL (bei kushuka) · demo', category: 'CAT-11', subCategory: 'Audio', price: 200000, stock: 5, condition: 'Mpya', baseUnit: 'Piece', image: img('elektroniki'), imagesArray: [img('elektroniki')],
  saleMode: 'price_drop', modeData: { mode: 'price_drop', startTime: now - 10 * 60000, intervalMs: 300000, dropAmount: 2000, minPrice: 150000, endTime: now + 6 * 3600000, maxPerBuyer: 2 } });
const iso = new Date().toISOString();
await db.doc('live_sessions/demo_live_tv').set({ hostUid: uid.juma, hostName: 'Juma Electronics', title: 'Ofa za TV na spika leo · demo', description: 'Live ya demo (emulator).', kind: 'live', status: 'live',
  scheduledAt: null, startedAt: iso, endedAt: null, productIds: ['demo_tv55_juma', 'demo_pricedrop_spika'].filter(Boolean), pinnedProductId: 'demo_pricedrop_spika', video: null,
  viewerCount: 0, peakViewers: 0, commentCount: 0, mutedUids: [], recordingAllowed: false, recordingUrl: null, createdAt: iso, updatedAt: iso });
await db.doc('live_sessions/demo_live_mnada').set({ hostUid: uid.juma, hostName: 'Juma Electronics', title: 'Mnada wa simu · demo', description: '', kind: 'auction', status: 'live',
  scheduledAt: null, startedAt: iso, endedAt: null, productIds: ['demo_auction_simu'], pinnedProductId: 'demo_auction_simu', video: null,
  viewerCount: 0, peakViewers: 0, commentCount: 0, mutedUids: [], recordingAllowed: false, recordingUrl: null, createdAt: iso, updatedAt: iso });
await db.doc('stories/demo_hali_juma').set({ authorUid: uid.juma, authorName: 'Juma Electronics', kind: 'image', mediaUrl: img('elektroniki'), caption: 'Mzigo mpya umefika dukani · demo',
  listing: { col: 'products', id: 'demo_pricedrop_spika', title: 'Spika JBL (bei kushuka) · demo', price: 200000 }, visibility: 'public', status: 'active', viewCount: 0,
  createdAt: iso, expiresAt: new Date(now + 24 * 3600000).toISOString(), expiresAtMs: now + 24 * 3600000 });

console.log('\nSokoHai LOCAL DEMO DATA tayari (emulator tu).');
console.log('Nenosiri la akaunti zote:', PW);
ACCOUNTS.forEach(a => console.log('  ' + a.email.padEnd(24) + ' — ' + a.name));
