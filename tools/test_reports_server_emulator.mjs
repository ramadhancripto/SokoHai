// Demo data only; Firestore emulator does not enforce composite indexes.
import assert from 'node:assert/strict';import{createRequire}from'node:module';
const host=process.env.FIRESTORE_EMULATOR_HOST,project=process.env.GCLOUD_PROJECT||'';
if(!host||!project.startsWith('demo-')){console.error('BLOCKED: demo Firestore emulator required');process.exit(2)}
process.env.GOOGLE_CLOUD_PROJECT=project;process.env.FIREBASE_CONFIG=JSON.stringify({projectId:project});
const require=createRequire(new URL('../functions/index.js',import.meta.url));const f=require('../functions/index.js'),db=require('firebase-admin').firestore();
const id=Date.now().toString(36),owner='owner'+id,other='other'+id, business='business'+id,store='store'+id,start='2026-11-01T00:00:00.000Z',end='2026-12-01T00:00:00.000Z';
await Promise.all([db.doc('users/'+owner).set({businessId:business,storeId:store}),db.doc('users/'+other).set({}),db.doc('businesses/'+business).set({ownerUid:owner}),db.doc('stores/'+store).set({ownerUid:owner,businessId:business}),db.doc('sales/sale'+id).set({saleId:'sale'+id,businessId:business,storeId:store,status:'COMPLETED',completedAt:'2026-11-05T11:00:00.000Z',totals:{total:125},payment:{method:'Cash',status:'RECORDED',cashReceived:125,change:0},items:[{productId:'p',quantity:1,lineTotal:125}]}),db.doc('sales/out'+id).set({saleId:'out'+id,businessId:business,storeId:store,status:'COMPLETED',completedAt:'2026-10-05T11:00:00.000Z',totals:{total:999},items:[]}),db.doc('shop_ledger/expense'+id).set({businessId:business,storeId:store,type:'expense',amount:12,date:'2026-11-06T11:00:00.000Z'})]);
const data={businessId:business,storeId:store,period:{start,end}},auth=uid=>({uid,token:{uid}});
const r=await f.posReports.run({data,auth:auth(owner),rawRequest:{headers:{}}});assert.equal(r.summary.grossSales,125);assert.equal(r.summary.completedSales,1);assert.equal(r.summary.expenses,12);
await assert.rejects(()=>f.posReports.run({data,auth:auth(other),rawRequest:{headers:{}}}),e=>e.code==='permission-denied');await assert.rejects(()=>f.posReports.run({data,rawRequest:{headers:{}}}),e=>e.code==='unauthenticated');
console.log('POS REPORT EMULATOR: scoped totals, date bounds, other-account denial and auth passed (indexes not enforced by emulator)');process.exit(0);
