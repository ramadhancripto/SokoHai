import assert from 'node:assert/strict';
import { normalizeProductUploadData, resolveVariantImages } from '../shared/product-upload-data-core.mjs';
import { psVariantGroups, psResolveStructuredVariant, psOptionValueAvailable, psSpecRows } from '../js/app/39-showcase-logic.js';

// Representative persisted product fixtures: simple, fashion, electronics,
// agriculture, livestock/custom and an incomplete-taxonomy fallback product.
const fixtures = [
  { name:'simple', title:'Rice 25kg', category:'Food', images:['rice.jpg'], attributes:[{name:'Weight',value:'25kg',type:'measurement',filterable:true}] },
  { name:'fashion', options:[{name:'Color',selectorType:'color',values:[{value:'Black',images:['black.jpg']},{value:'White'}]},{name:'Size',selectorType:'button',values:['S','M','L']}], variantsStructured:[{variantId:'blk-m',options:{Color:'Black',Size:'M'},price:25000,stock:10,status:'ACTIVE',available:true,images:[]} ] },
  { name:'electronics', options:[{name:'Storage',selectorType:'dropdown',values:['128GB','256GB']},{name:'RAM',selectorType:'button',values:['8GB','16GB']}], variantsStructured:[{variantId:'p1',options:{Storage:'128GB',RAM:'8GB'},price:100,stock:2,status:'ACTIVE',available:true,sku:'P1',unitId:'piece'}] },
  { name:'custom', category:'CAT-04', attributes:[{name:'Horn type',value:'Long',type:'text'}], options:[{name:'Grade',selectorType:'text',values:['A','B']}], features:[{name:'Healthy',value:true}], additionalInfo:[{name:'Seller note',value:'Custom'}] }
];
for (const fixture of fixtures) {
  const p = { ...fixture, ...normalizeProductUploadData(fixture) };
  assert.ok(p.title || p.options || p.attributes, fixture.name);
  if (fixture.options) assert.ok(psVariantGroups(p,'products').length, fixture.name+' options');
  if (fixture.variantsStructured) assert.ok(psResolveStructuredVariant(p, fixture.variantsStructured[0].options), fixture.name+' variant resolve');
  assert.ok(psSpecRows(p,'products').every(row => row.value !== ''), fixture.name+' empty suppression');
}
const p = { options:[{name:'Color',values:[{value:'Black'},{value:'Blue'}]},{name:'Size',values:['M','L']}], variantsStructured:[{variantId:'black-m',options:{Color:'Black',Size:'M'},status:'ACTIVE',available:true}] };
assert.equal(psOptionValueAvailable(p,{Color:'Blue'},'Size','L'), false);
assert.equal(psResolveStructuredVariant(p,{Color:'Blue',Size:'L'}), null);
const inheritance = { images:['general.jpg'], options:[{name:'Color',values:[{value:'Blue',images:['blue.jpg']}]}] };
assert.deepEqual(resolveVariantImages(inheritance,{options:{Color:'Blue'},images:[]}), ['blue.jpg']);
assert.deepEqual(resolveVariantImages(inheritance,{options:{Color:'Blue'},images:['variant.jpg']}), ['variant.jpg']);
console.log('PRODUCT UPLOAD RUNTIME LOGIC: passed representative structured product fixtures, buyer option availability, variant resolution, empty suppression, and image inheritance.');
