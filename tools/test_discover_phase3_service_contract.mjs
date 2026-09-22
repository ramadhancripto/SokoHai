import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseDiscoverQuery, applyDiscoverState, classifyServiceMatches,
  serviceAttributeMap, resolveDiscoveryContext, createDiscoverySession,
  stateToSearchParams, stateFromSearchParams
} from '../js/app/76-discover-foundation.js';

let passed=0,failed=0;
function test(name,fn){try{fn();passed++;console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,'—',e.message)}}
const svc=(id,title,extra={})=>({listing:{entityId:id,entityType:'SERVICE',title,categoryName:'Tech & Repair',subCategory:'AC Repair',sellerId:extra.providerId||'provider-1',providerId:extra.providerId||'provider-1',businessId:extra.businessId||null,price:extra.price??50000,availabilityStatus:extra.availabilityStatus||'',serviceType:extra.serviceType||'AC Repair',specialization:extra.specialization||'',serviceAreas:extra.serviceAreas||[],pricingModel:extra.pricingModel||'',travelAvailable:extra.travelAvailable===true,raw:{...extra}}});
const exact=svc('s1','AC repair',{specialization:'Inverter AC',availabilityStatus:'available_today',pricingModel:'per_job',serviceAreas:['Kinondoni'],travelAvailable:true,businessId:'biz-1'});
const type=svc('s2','Home cooling technician',{serviceType:'AC repair',providerId:'provider-2',price:70000});
const spec=svc('s3','Cooling specialist',{serviceType:'Cooling',specialization:'Inverter AC'});
const unrelated=svc('s4','Wedding photography',{serviceType:'Photography',specialization:'Portraits'});unrelated.listing.categoryName='Events';unrelated.listing.subCategory='Photography';
const support=svc('s5','AC spare parts support',{supportFor:['AC'],supportedProductCategories:['Air conditioners']});
const sections={products:[],services:[exact,type,spec,unrelated,support],transporters:[],businesses:[],groups:[],people:[],onlineSellers:[],offlineSellers:[]};

test('1 service intent recognizes Swahili role and conservative AC synonym',()=>{const x=parseDiscoverQuery('fundi wa kiyoyozi');assert.equal(x.primary,'services');assert.equal(x.searchText,'ac')});
test('2 intent extracts factual location, price and availability constraints',()=>{const x=parseDiscoverQuery('fundi AC available today Dar es Salaam under 80,000');assert.equal(x.constraints.location,'dar es salaam');assert.equal(x.constraints.maxPrice,80000);assert.equal(x.constraints.availability,'available_today')});
test('3 service attributes are derived from record fields and filters',()=>{const a=serviceAttributeMap(exact);assert.deepEqual(a['Specialization'],['Inverter AC']);assert.deepEqual(a['Pricing model'],['per_job'])});
test('4 exact services remain in exact layer',()=>assert.deepEqual(classifyServiceMatches([exact],'ac repair').exact.map(x=>x.listing.entityId),['s1']));
test('5 service type matches remain separate',()=>assert.deepEqual(classifyServiceMatches([type],'ac repair').serviceType.map(x=>x.listing.entityId),['s2']));
test('6 specialization matches remain separate',()=>assert.deepEqual(classifyServiceMatches([spec],'inverter ac').specialization.map(x=>x.listing.entityId),['s3']));
test('7 explicit support service relationships are recognized',()=>assert.ok(classifyServiceMatches([support],'ac').supportService.length===1));
test('8 unrelated services are not merged into a query hierarchy',()=>{const x=classifyServiceMatches([unrelated],'ac repair');assert.equal(Object.values(x).flat().length,0)});
test('9 service filters are cumulative across price availability provider area and travel',()=>{const x=applyDiscoverState([exact,type],{maxPrice:60000,availability:'available_today',providerId:'provider-1',serviceArea:'Kinondoni',travelRequired:true});assert.deepEqual(x.map(v=>v.listing.entityId),['s1'])});
test('10 provider and business ids are deduplicated from actual service listings',()=>{const c=resolveDiscoveryContext({query:'ac',sections,state:{entityType:'services'}});assert.equal(c.counts.providers,2);assert.equal(c.counts.businesses,1)});
test('11 service action context never exposes Buy',()=>{const c=resolveDiscoveryContext({query:'AC repair',activeEntity:exact,activeEntityType:'SERVICE',sections,state:{entityType:'services'}});assert.equal(c.actions.buy,false);assert.equal(c.actions.requestService,true);assert.equal(c.actions.viewProvider,true)});
test('12 negotiation and quote actions use stored service values',()=>{const q=svc('q','Assessment',{pricingModel:'quotation_required',negotiationAllowed:false});const c=resolveDiscoveryContext({activeEntity:q,activeEntityType:'SERVICE',sections:{...sections,services:[q]},state:{entityType:'services'}});assert.equal(c.actions.requestQuote,true);assert.equal(c.actions.negotiate,false)});
test('13 travel capability is included only when represented by data',()=>{const c=resolveDiscoveryContext({query:'ac',sections,state:{entityType:'services'}});assert.deepEqual(c.travelServices.map(x=>x.listing.entityId),['s1'])});
test('14 service filters survive URL round trip',()=>{const s={entityType:'services',serviceType:'AC Repair',pricingModel:'per_job',serviceArea:'Kinondoni',providerId:'provider-1',businessId:'biz-1',travelRequired:true};const r=stateFromSearchParams(stateToSearchParams(s));for(const k of Object.keys(s))assert.equal(r[k],s[k])});
test('15 shared session back pops exactly one context',()=>{const s=createDiscoverySession();s.activate({query:'one'});s.activate({query:'two'});s.activate({query:'three'});assert.equal(s.back().query,'two');assert.equal(s.back().query,'one')});

const f76=fs.readFileSync(new URL('../js/app/76-discover-foundation.js',import.meta.url),'utf8');
const f75=fs.readFileSync(new URL('../js/app/75-discover-engine.js',import.meta.url),'utf8');
const f88=fs.readFileSync(new URL('../js/app/88-discover-complete.js',import.meta.url),'utf8');
const f42=fs.readFileSync(new URL('../js/app/42-discovery-feed.js',import.meta.url),'utf8');
const showcase=fs.readFileSync(new URL('../js/app/39-product-showcase.js',import.meta.url),'utf8');
const logic=fs.readFileSync(new URL('../js/app/39-showcase-logic.js',import.meta.url),'utf8');
const rules=fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
const indexes=JSON.parse(fs.readFileSync(new URL('../firestore.indexes.json',import.meta.url),'utf8'));
test('16 direct Service opening activates the shared context and canonical detail',()=>{assert.match(f42,/col!==['"]products['"]&&col!==['"]services['"]/);assert.match(f42,/activeEntityType:isService\?['"]SERVICE['"]/)});
test('17 provider profile activation uses the shared session without a ServiceContext',()=>{assert.match(f42,/installAccountContextWrapper/);assert.doesNotMatch(f42+f76+f88,/ServiceContext|ServiceDiscoverHelper|ServiceHelper/)});
test('18 Service UI reuses canonical cards and comparison architecture',()=>{assert.match(f88,/skh\.ServicePostCard/);assert.match(f88,/data-d2-compare-service/);assert.match(f88,/classifyServiceMatches/)});
test('19 availability is not fabricated for legacy Service records',()=>{assert.doesNotMatch(logic,/col === PS_SERVICE[\s\S]{0,350}return \{ kind: 'service', label: 'Inapatikana leo' \};\s*\}/);assert.match(logic,/p\.availableToday === true/)});
test('20 bounded queries, owner rules, indexes and existing Chat negotiation remain authoritative',()=>{assert.match(f75,/collection\(skh\.db, 'services'\)[\s\S]{0,350}limit\(50\)/);assert.match(rules,/match \/services\/\{id\}[\s\S]*allow create:[\s\S]*validService/);assert.ok(indexes.indexes.some(x=>x.collectionGroup==='services'&&x.fields.some(f=>f.fieldPath==='category')));assert.match(showcase,/skhChatNegotiate/);assert.doesNotMatch(f75+f88+f42,/DiscoverChat|DiscoverOrder|DiscoverPayment/)});

console.log(`\nDISCOVER PHASE 3 SERVICE CONTRACT: ${passed} passed, ${failed} failed`);
if(failed)process.exit(1);
