#!/usr/bin/env node
// Uses demo Firestore only. FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 GCLOUD_PROJECT=demo-sokohai node tools/test_pickup_accept_emulator.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('BLOCKED: Firestore emulator required'); process.exit(2); }
process.env.GCLOUD_PROJECT ||= 'demo-sokohai'; process.env.GOOGLE_CLOUD_PROJECT = process.env.GCLOUD_PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({projectId:process.env.GCLOUD_PROJECT});
const require = createRequire(new URL('../functions/index.js', import.meta.url));
const f = require('../functions/index.js'), db = require('firebase-admin').firestore();
const T = Date.now().toString(36), buyer='pkbuyer'+T, seller='pkseller'+T, d1='pkd1'+T, d2='pkd2'+T;
const call = async (name, uid, data) => { try { return {ok:true,data:await f[name].run({data,auth:{uid,token:{uid}},rawRequest:{headers:{}}})}; } catch(e) {return {ok:false,code:e.code,message:e.message};} };
const get = async p => (await db.doc(p).get()).data();
const ride = id => 'ride_requests/'+id, token = id => 'delivery_tokens/'+id+'_pickup';
for (const id of [d1,d2]) await db.doc('users/'+id).set({isApprovedAgent:true,agentApprovedBy:'admin',displayName:id});
let failures=0;
async function test(name,fn){try{await fn();console.log('PASS '+name)}catch(e){failures++;console.log('FAIL '+name+' '+e.stack)}}
let id='pk-order-'+T, order='pk-order-doc-'+T, pk;
await test('racing direct accept commits exactly one driver and one token without payment prerequisite',async()=>{
 await db.doc('orders/'+order).set({buyerId:buyer,sellerId:seller,commerceType:'product',status:'pending'});
 await db.doc(ride(id)).set({customerId:buyer,orderId:order,status:'searching',fare:3000});
 const results=await Promise.all([call('deliveryAccept',d1,{rideId:id}),call('deliveryAccept',d2,{rideId:id})]);
 assert.equal(results.filter(r=>r.ok).length,1);const win=results.find(r=>r.ok);pk=win.data.token;
 const r=await get(ride(id)),t=await get(token(id));assert.equal(r.status,'accepted');assert.equal(r.sellerId,seller);assert.equal(t.token,pk);assert.equal(t.status,'pending');assert.deepEqual(new Set(t.participants),new Set([seller,r.driverId])); assert.match(pk,/^PK-[A-F0-9]{24}$/);assert(!JSON.stringify(r).includes(pk));
 const retry=await call('deliveryAccept',r.driverId,{rideId:id});assert(retry.ok,JSON.stringify(retry));assert.equal(retry.data.token,pk);
});
await test('verification checks caller, exact token, stage and order seller',async()=>{
 const r=await get(ride(id));assert((await call('deliveryTokenVerify',seller,{token:pk})).ok);
 assert((await call('deliveryTokenVerify',r.driverId,{rideId:id,token:pk})).ok);
 assert(!(await call('deliveryTokenVerify',buyer,{rideId:id,token:pk})).ok);
 assert(!(await call('deliveryTokenVerify',seller,{rideId:id,token:'PK-WRONG'})).ok);
});
await test('two-party custody is atomic, buyer and wrong token rejected, token used once',async()=>{
 const r=await get(ride(id)),driver=r.driverId;
 assert(!(await call('deliveryConfirmCustody',buyer,{rideId:id,role:'seller',token:pk})).ok);
 assert(!(await call('deliveryConfirmCustody',driver,{rideId:id,role:'transporter',token:pk})).ok);
 assert((await call('deliveryConfirmCustody',seller,{rideId:id,role:'seller',token:pk})).ok);
 assert(!(await call('deliveryConfirmCustody',driver,{rideId:id,role:'transporter',token:'PK-WRONG'})).ok);
 assert((await call('deliveryConfirmCustody',driver,{rideId:id,role:'transporter',token:pk})).ok);
 assert.equal((await get(ride(id))).status,'picked_up');assert.equal((await get(token(id))).status,'used');
 assert(!(await call('deliveryTokenVerify',seller,{token:pk})).ok);
});
await test('routed accept is idempotent and remains usable for pickup',async()=>{
 const rid='pko-'+T, oid='pkoffer-'+T;await db.doc(ride(rid)).set({customerId:buyer,status:'searching'});
 await db.doc('delivery_offers/'+oid).set({rideId:rid,customerId:buyer,agentId:d1,status:'offered',expiresAt:new Date(Date.now()+3600000).toISOString()});
 const a=await call('deliveryOfferAccept',d1,{offerId:oid}),b=await call('deliveryOfferAccept',d1,{offerId:oid});assert(a.ok,JSON.stringify(a));assert(b.ok,JSON.stringify(b));assert.equal(a.data.token,b.data.token);assert.equal((await get(token(rid))).status,'pending');
 assert((await call('deliveryConfirmCustody',buyer,{rideId:rid,role:'seller',token:a.data.token})).ok);
 assert((await call('deliveryConfirmCustody',d1,{rideId:rid,role:'transporter',token:a.data.token})).ok);
});
await test('pre-pickup fault revokes old token; reassignment gets fresh token',async()=>{
 const rid='pkfault-'+T;await db.doc(ride(rid)).set({customerId:buyer,status:'searching'});
 const a=await call('deliveryAccept',d1,{rideId:rid});assert(a.ok,JSON.stringify(a));const fault=await call('deliveryReportTransportFault',d1,{rideId:rid});assert(fault.ok,JSON.stringify(fault));assert.equal((await get(token(rid))).status,'revoked');
 assert(!(await call('deliveryTokenVerify',d1,{token:a.data.token})).ok);
 const b=await call('deliveryAccept',d2,{rideId:rid});assert(b.ok,JSON.stringify(b));assert.notEqual(a.data.token,b.data.token);assert(!(await call('deliveryTokenVerify',d1,{rideId:rid,token:a.data.token})).ok);
});
await test('expired and cancelled tokens are refused',async()=>{
 const rid='pkexpired-'+T;await db.doc(ride(rid)).set({customerId:buyer,status:'searching'});
 const a=await call('deliveryAccept',d1,{rideId:rid});assert(a.ok,JSON.stringify(a));
 await db.doc(ride(rid)).update({pickupTokenExpiresAt:new Date(Date.now()-1000).toISOString()});
 assert(!(await call('deliveryTokenVerify',buyer,{rideId:rid,token:a.data.token})).ok);
 assert(!(await call('deliveryConfirmCustody',buyer,{rideId:rid,role:'seller',token:a.data.token})).ok);
 await db.doc(ride(rid)).update({status:'cancelled'});
 assert(!(await call('deliveryAccept',d1,{rideId:rid})).ok);
});
await test('cancel versus seller confirmation never revives a cancelled ride',async()=>{
 const rid='pkcancel-'+T;await db.doc(ride(rid)).set({customerId:buyer,status:'searching'});
 const a=await call('deliveryAccept',d1,{rideId:rid});assert(a.ok,JSON.stringify(a));
 const ref=db.doc(ride(rid));
 const [s,c]=await Promise.all([call('deliveryConfirmCustody',buyer,{rideId:rid,role:'seller',token:a.data.token}),db.runTransaction(async t=>{const snap=await t.get(ref);if(['accepted','awaiting_pickup','pickup_pending'].includes(snap.data().status)){t.update(ref,{status:'cancelled'});return true}return false})]);
 const r=await get(ride(rid));assert((c&&r.status==='cancelled'&&!s.ok)||(!c&&s.ok&&r.status==='seller_confirmed_handover'),JSON.stringify({s,c,r}));
});
console.log(`PICKUP ACCEPT EMULATOR: ${failures} failed`);process.exit(failures?1:0);
