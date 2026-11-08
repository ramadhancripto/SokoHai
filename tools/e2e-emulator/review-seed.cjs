// Real SokoHai app (remediation branch) on the local emulator — review screenshots.
// Demo listings are seeded here (titles end with "· demo"); nothing touches production.
const L = require('./lib.cjs');
const OUT = require('path').join(__dirname, 'out', 'review') + '/';
const PW = 'Passw0rd!x';
const img = n => L.BASE + '/assets/img/categories/' + n + '.webp';
async function seed() {
  await fetch('http://127.0.0.1:8085/emulator/v1/projects/demo-sokohai/databases/(default)/documents', { method: 'DELETE' });
  const buyer = await L.authUser('buyer.review@sokohai.test', PW, 'Asha Mnunuzi');
  const s1 = await L.authUser('juma.review@sokohai.test', PW, 'Juma Electronics');
  const s2 = await L.authUser('neema.review@sokohai.test', PW, 'Neema Digital');
  const s3 = await L.authUser('baraka.review@sokohai.test', PW, 'Baraka Shop');
  for (const [uid, name, region, verified] of [[buyer, 'Asha Mnunuzi', 'Dar es Salaam', false], [s1, 'Juma Electronics', 'Dar es Salaam', true], [s2, 'Neema Digital', 'Arusha', false], [s3, 'Baraka Shop', 'Mwanza', false]]) {
    await L.db.doc('users/' + uid).set({ uid, fullName: name, displayName: name, region, sellerVerified: verified, isVerified: verified, verificationStatus: verified ? 'verified' : 'unverified' }, { merge: true });
    await L.db.doc('userCards/' + uid).set({ uid, fullName: name, region, verificationStatus: verified ? 'verified' : 'unverified' }, { merge: true });
  }
  const now = Date.now(); let i = 0;
  const P = (seller, name, region, o) => L.db.doc('products/' + o.id).set(Object.assign({ userId: seller, ownerName: name, sellerName: name, location: region, region,
    description: 'Tangazo la demo kwa ukaguzi wa muonekano (emulator).', stock: 0, publicationStatus: 'published', availabilityStatus: 'available', isOnline: true,
    createdAt: new Date(now - (i++) * 60000).toISOString(), currency: 'TZS' }, o));
  await P(s1, 'Juma Electronics', 'Dar es Salaam', { id: 'tv55a', title: 'Samsung Smart TV 55 inch · demo', category: 'CAT-11', subCategory: 'TVs & Home Entertainment', price: 1250000, stock: 6, condition: 'Mpya', image: img('elektroniki'), imagesArray: [img('elektroniki')], baseUnit: 'Piece', trust: { product_inspection: { status: 'active', since: '2026-11-01' } } });
  await P(s2, 'Neema Digital', 'Arusha', { id: 'tv55b', title: 'Samsung Smart TV 55" · demo', category: 'CAT-11', subCategory: 'TVs & Home Entertainment', price: 1190000, stock: 3, condition: 'Mpya', image: img('elektroniki'), imagesArray: [img('elektroniki')], baseUnit: 'Piece' });
  await P(s3, 'Baraka Shop', 'Mwanza', { id: 'tv43', title: 'Samsung Smart TV 43 inch · demo', category: 'CAT-11', subCategory: 'TVs & Home Entertainment', price: 780000, stock: 9, condition: 'Mpya', image: img('elektroniki'), imagesArray: [img('elektroniki')], baseUnit: 'Piece' });
  await P(s3, 'Baraka Shop', 'Mwanza', { id: 'tvold', title: 'Samsung TV 55 inch (rekodi ya zamani) · demo', category: 'Electronics & Teknoloji (Tech)', subCategory: 'TVs & Displays', price: 990000, stock: 2, condition: 'Iliyotumika', image: img('elektroniki'), imagesArray: [img('elektroniki')], baseUnit: 'Piece' });
  await P(s1, 'Juma Electronics', 'Dar es Salaam', { id: 'rice5', title: 'Mchele Kyela 5kg · demo', category: 'CAT-01', subCategory: 'Nafaka', price: 16000, stock: 80, image: img('vyakula'), imagesArray: [img('vyakula')], baseUnit: 'Mfuko', saleMode: 'wholesale', modeData: { mode: 'wholesale', tiers: [{ minQty: 10, price: 14500 }] } });
  await P(s2, 'Neema Digital', 'Arusha', { id: 'rice25', title: 'Mchele Kyela 25kg · demo', category: 'CAT-01', subCategory: 'Nafaka', price: 72000, stock: 25, image: img('vyakula'), imagesArray: [img('vyakula')], baseUnit: 'Gunia' });
  await P(s2, 'Neema Digital', 'Arusha', { id: 'mbolea', title: 'Mbolea ya Urea 50kg · demo', category: 'CAT-02', subCategory: 'Mbolea', price: 78000, stock: 30, image: img('kilimo'), imagesArray: [img('kilimo')], baseUnit: 'Mfuko' });
  await P(s3, 'Baraka Shop', 'Mwanza', { id: 'sofa', title: 'Sofa ya Mninga 3 seater · demo', category: 'CAT-09', subCategory: 'Sofa', price: 950000, stock: 2, condition: 'Mpya', image: img('samani'), imagesArray: [img('samani')], baseUnit: 'Seti' });
  return { buyer };
}
module.exports = { seed, L, PW };
