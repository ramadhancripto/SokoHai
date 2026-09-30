import assert from 'node:assert/strict';import fs from 'node:fs';import data from '../shared/canonical-taxonomy-data.js';import projection from '../shared/product-taxonomy-browser.mjs';import {getProductSuggestions,getSellerCategoryOptions,getSellerSubcategories} from '../shared/product-taxonomy-bridge.mjs';
let count=0;for(const [id,leaves] of Object.entries(projection.productLeaves))for(const leaf of leaves){count++;assert.ok(getSellerCategoryOptions().some(x=>x.value===id));assert.ok(getSellerSubcategories(id).includes(leaf));const schema=getProductSuggestions(id,leaf);for(const f of schema.filters)assert.ok(schema.attributes.includes(f));const exact=data.PRODUCT_TYPE_DEFINITIONS[id]?.[leaf];if(!exact&&!schema.profileId){assert.deepEqual(schema.options,{});assert.deepEqual(schema.attributes,[]);assert.deepEqual(schema.features,[]);assert.equal(schema.variantRule.mode,'UNSPECIFIED');}}
assert.equal(count,743);for(const leaf of ['Mizizi & Viazi','Nyama','Mayai']){const d=data.PRODUCT_TYPE_DEFINITIONS['CAT-01'][leaf],s=getProductSuggestions('CAT-01',leaf);assert.equal(d.status,'PARTIAL');assert.deepEqual(s.attributes,d.attributes);assert.deepEqual(s.options,{});assert.deepEqual(s.suggestedUnits,[]);assert.equal(s.variantRule.mode,'UNSPECIFIED');}
// Everything above is the COMMITTED-SOURCE contract and must always run.
console.log('PASS committed-source contract: all 743 canonical routes, filter references, inherited-defaults quarantine, three scoped food amendments');
// The queue cross-check needs docs/taxonomy/mission/execution-queue.json, which is
// REQUIRED LOCAL INPUT deliberately excluded from Git by the payload policy. Its absence
// is reported explicitly and never silently treated as a pass.
const queuePath='docs/taxonomy/mission/execution-queue.json';
if(!fs.existsSync(queuePath)){
 console.log('SKIPPED local-input cross-check — '+queuePath+' not present (gitignored by payload policy; restore locally to run).');
 console.log('STATUS: PARTIAL — committed-source contract PASS; candidate-evidence honesty cross-check NOT RUN.');
}else{
 const q=JSON.parse(fs.readFileSync(queuePath));assert.equal(q.length,count);assert.equal(new Set(q.map(x=>x.categoryId+'/'+x.leaf)).size,count);assert.ok(q.every(x=>x.exhaustiveReview===false),'retrieval must never masquerade as exhausted research');
 console.log('PASS local-input cross-check: queue covers all 743 leaves, candidate evidence honesty');
 console.log('STATUS: FULL — committed-source contract PASS; local-input cross-check PASS.');
}
