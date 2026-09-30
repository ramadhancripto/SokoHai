import assert from 'node:assert/strict';
import { buildProductWrite } from '../js/app/39-product-core.js';
import { psVariantGroups, psResolveStructuredVariant, psOptionValueAvailable } from '../js/app/39-showcase-logic.js';
const saved = buildProductWrite({
  productId:'laptop-1', title:'Laptop', category:'Computers', subCategory:'Laptops', price:900, stock:10, location:'Dar', imagesArray:['general.jpg'],
  filters:{Brand:'Example'}, variants:[{name:'Legacy',options:['One']}], variantCombinations:[{variantId:'legacy-1',sku:'LEG-1',unitId:'piece',price:900,stock:3,options:{Legacy:'One'},inventoryKey:'laptop-1:legacy-1:piece',status:'ACTIVE'}],
  attributes:[{id:'ram',name:'RAM',value:'8GB',type:'text',filterable:true}],
  options:[{id:'ram-opt',name:'RAM',selectorType:'button',values:[{id:'8',value:'8GB',label:'8GB',images:['ram8.jpg']},{id:'16',value:'16GB',label:'16GB',images:['ram16.jpg']}]}],
  variantsStructured:[{variantId:'l8',options:{RAM:'8GB'},sku:'L8',barcode:'B8',unitId:'piece',inventoryKey:'laptop-1:l8:piece',price:900,stock:5,status:'ACTIVE',available:true,images:['l8.jpg']},{variantId:'l16',options:{RAM:'16GB'},sku:'L16',unitId:'piece',inventoryKey:'laptop-1:l16:piece',price:1000,stock:2,status:'ACTIVE',available:true,images:[]}],
  features:[{id:'f1',name:'Backlit',value:true,images:['backlit.jpg']}], additionalInfo:[{id:'i1',name:'Warranty',value:'12 months'}]
});
assert.equal(psVariantGroups(saved,'products')[0].label, 'RAM');
assert.ok(psResolveStructuredVariant(saved,{RAM:'8GB'}));
assert.equal(psResolveStructuredVariant(saved,{RAM:'8GB'}).sku,'L8');
assert.equal(psOptionValueAvailable(saved,{RAM:'16GB'},'RAM','16GB'),true);
const edited = buildProductWrite({...saved, attributes:[], options:[], variantsStructured:[{...saved.variantsStructured[0],price:950,status:'INACTIVE',available:false,images:['changed.jpg']}], features:[], additionalInfo:[], imagesArray:['general-new.jpg']});
assert.equal(edited.productId,'laptop-1');
assert.deepEqual(edited.attributes,[]);
assert.deepEqual(edited.options,[]);
assert.deepEqual(edited.features,[]);
assert.deepEqual(edited.additionalInfo,[]);
assert.equal(edited.variantsStructured[0].price,950);
assert.equal(edited.variantsStructured[0].status,'INACTIVE');
assert.equal(edited.variantsStructured[0].images[0],'changed.jpg');
assert.equal(edited.variantCombinations[0].variantId,'legacy-1');
assert.equal(edited.imagesArray[0],'general-new.jpg');
console.log('PRODUCT UPLOAD EDIT ROUNDTRIP: passed same-product structured edit, removal semantics, legacy preservation, and buyer resolver compatibility.');
