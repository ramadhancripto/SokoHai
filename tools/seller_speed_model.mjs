#!/usr/bin/env node
// [UX 2026-10-31] Seller speed model: counts the actions needed to finish real business
// examples with the seller form BEFORE and AFTER the UX change. Field counts come from
// tools/measure_seller_form.mjs (real DOM); the action times are a stated, simple model
// (not a user study): type a field 6 s, choose in a dropdown 3 s, click 1 s, add a photo 8 s.
//   node tools/seller_speed_model.mjs <before.json> <after.json> [out.json]
import fs from 'node:fs';
const [beforeFile, afterFile, out] = process.argv.slice(2);
const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterFile, 'utf8'));
const T = { type: 6, choose: 3, click: 1, photo: 8 };
const secs = a => a.type * T.type + a.choose * T.choose + a.click * T.click + a.photo * T.photo;
const steps = a => a.type + a.choose + a.click + a.photo;
const req = (m, mode) => m['mobile:' + mode].requiredEmptyIds;

// Required fields the seller must fill (measured), split into "type" vs "choose".
function base(m, mode, { storeAddress = false, search = false } = {}) {
  const ids = req(m, mode).filter(id => !(storeAddress && id === 'prodLocation'));
  const a = { type: 0, choose: 0, click: 0, photo: 0 };
  ids.forEach(id => { if (id === 'prodCategory') { if (search) { a.type += 1; a.click += 1; } else { a.choose += 2; } } else a.type += 1; });
  return a;
}
const add = (a, b) => ({ type: a.type + (b.type || 0), choose: a.choose + (b.choose || 0), click: a.click + (b.click || 0), photo: a.photo + (b.photo || 0) });

const scenarios = [
  ['duka_dogo', 'Duka dogo la rejareja (hybrid, bidhaa rahisi, picha 1)', 'hybrid', { photo: 1, click: 1 }, {}],
  ['jumla', 'Duka la jumla (offline, pakiti + bei ya jumla)', 'offline_only', { click: 1, choose: 1, type: 2 }, {}],
  ['online_only', 'Online-only seller (picha 2)', 'online_only', { photo: 2, click: 1 }, {}],
  ['offline_only', 'Offline-only (POS tu)', 'offline_only', { click: 1 }, {}],
  ['hybrid', 'Hybrid (POS + soko, picha 1)', 'hybrid', { photo: 1, click: 1 }, {}],
  ['manage_only', 'Kusimamia tu (stoo pekee)', 'manage_only', { click: 1 }, {}]
];
const rows = scenarios.map(([id, label, mode, extra]) => {
  const b = add(add(base(before, mode), extra), { choose: 1 }); // before: seller always picks the sales mode
  const aNoProfile = add(base(after, mode, { search: true }), extra); // after: mode defaults from the business
  const aProfile = add(base(after, mode, { search: true, storeAddress: true }), extra);
  return { id, label, mode, before: { steps: steps(b), seconds: secs(b) }, after: { steps: steps(aNoProfile), seconds: secs(aNoProfile) }, afterWithStoreAddress: { steps: steps(aProfile), seconds: secs(aProfile) } };
});
// Many variants: 3 colours x 4 sizes = 12 variants, each needs price + stock (+ enable click).
{
  const n = 12;
  const variantsBefore = { type: 2 + 2 * n, click: 3 + n, choose: 0, photo: 0 }; // 2 selectors (+values), generate, enable each, price+stock each
  const variantsAfter = { type: 2 + 2, click: 3 + n + 1, choose: 0, photo: 0 }; // same selectors, enable each, ONE price+stock, apply
  const b = add(add(add(base(before, 'hybrid'), { photo: 1, click: 1, choose: 1 }), variantsBefore), {});
  const a = add(add(base(after, 'hybrid', { search: true }), { photo: 1, click: 2 }), variantsAfter); // +1 click to open the variants group
  rows.push({ id: 'variants_12', label: 'Bidhaa yenye variants 12 (rangi 3 × saizi 4), bei/stock moja kwa zote', mode: 'hybrid', before: { steps: steps(b), seconds: secs(b) }, after: { steps: steps(a), seconds: secs(a) }, afterWithStoreAddress: { steps: steps(a) - 1, seconds: secs(a) - T.type } });
}
// Second similar product: before = whole form again; after = "Nakili" + new name + stock (+ photo if online).
{
  const b = add(base(before, 'hybrid'), { photo: 1, click: 1, choose: 1 });
  const a = { type: 2, choose: 0, click: 2, photo: 1 };
  rows.push({ id: 'second_similar', label: 'Bidhaa ya pili inayofanana (Nakili)', mode: 'hybrid', before: { steps: steps(b), seconds: secs(b) }, after: { steps: steps(a), seconds: secs(a) }, afterWithStoreAddress: { steps: steps(a), seconds: secs(a) } });
}
rows.push({ id: 'service', label: 'Muuzaji wa huduma (fomu ya huduma)', mode: 'service', before: null, after: null, afterWithStoreAddress: null,
  note: 'Fomu ya huduma (html/10-form-agent.html: fields 12, required 7) haijabadilishwa katika kazi hii; haijapimwa upya.' });

const form = Object.fromEntries(Object.keys(after).map(k => [k, { before: { visibleFields: before[k].visibleFields, mustFill: before[k].requiredEmpty, heightPx: before[k].pageHeight }, after: { visibleFields: after[k].visibleFields, mustFill: after[k].requiredEmpty, heightPx: after[k].pageHeight } }]));
const result = { model: T, note: 'Makadirio ya muda kwa modeli rahisi (si utafiti wa watumiaji). Hesabu za fields zimepimwa kwenye DOM halisi.', form, scenarios: rows };
console.log(JSON.stringify(result, null, 1));
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
