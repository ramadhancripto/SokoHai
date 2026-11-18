#!/usr/bin/env node
import assert from 'node:assert/strict';import {createRequire} from 'node:module';
if(!process.env.FIRESTORE_EMULATOR_HOST){console.error('BLOCKED: emulator required');process.exit(2)}
process.env.GCLOUD_PROJECT ||= 'demo-sokohai';process.env.GOOGLE_CLOUD_PROJECT=process.env.GCLOUD_PROJECT;process.env.FIREBASE_CONFIG=JSON.stringify({projectId:process.env.GCLOUD_PROJECT});
const require=createRequire(new URL('../functions/index.js',import.meta.url)), f=require('../functions/index.js'), db=require('firebase-admin').firestore(), u=Date.now().toString(36);
const buyer='bc'+u,driver='dc'+u,id='rc'+u;
async function call(n,uid,data,admin=false){try{return {ok:true,data:await f[n].run({data,auth:{uid,token:{uid,admin}},rawRequest:{headers:{}}})}}catch(e){return {ok:false,code:e.code,message:e.message}}}
async function get(p){return (await db.doc(p).get()).data()}
await db.doc('users/'+driver).set({isApprovedAgent:true,agentApprovedBy:'admin'});
await db.doc('ride_requests/'+id).set({customerId:buyer,status:'searching'});
await db.doc('delivery_offers/oc'+u).set({rideId:id,agentId:driver,customerId:buyer,status:'offered',expiresAt:new Date(Date.now()+60000).toISOString()});
const a=await call('deliveryAccept',driver,{rideId:id});assert(a.ok,JSON.stringify(a));assert(!(await call('deliveryCancel',driver,{rideId:id})).ok);
assert((await call('deliveryCancel',buyer,{rideId:id})).ok);assert((await call('deliveryCancel',buyer,{rideId:id})).data.already);
assert.equal((await get('ride_requests/'+id)).status,'cancelled');assert.equal((await get('delivery_tokens/'+id+'_pickup')).status,'revoked');assert.equal((await get('delivery_offers/oc'+u)).status,'cancelled');
assert(!(await call('deliveryConfirmCustody',buyer,{rideId:id,role:'seller',token:a.data.token})).ok);assert(!(await call('deliveryOfferAccept',driver,{offerId:'oc'+u})).ok);
const src={sourceUrl:'https://example.org/authority',sourceDate:'2022-05-30',reason:'test approved source'};
assert(!(await call('locationAdminUpsert',buyer,{...src,id:'tz',type:'country',name:'Tanzania'})).ok);
assert((await call('locationAdminUpsert','adm',{...src,id:'tz',type:'country',name:'Tanzania'},true)).ok);
const reg='reg'+u,dist='dist'+u,ward='ward'+u,village='vill'+u;
assert((await call('locationAdminUpsert','adm',{...src,id:reg,type:'region',parentId:'tz',name:'Test Region'},true)).ok);
assert(!(await call('locationAdminUpsert','adm',{...src,id:ward,type:'ward',parentId:reg,name:'Test Ward'},true)).ok);
assert((await call('locationAdminUpsert','adm',{...src,id:dist,type:'district',parentId:reg,name:'Test District'},true)).ok);
assert((await call('locationAdminUpsert','adm',{...src,id:ward,type:'ward',parentId:dist,name:'Test Ward'},true)).ok);
assert(!(await call('locationAdminUpsert','adm',{...src,id:ward,type:'ward',parentId:reg,name:'Fake'},true)).ok);
const proposal={parentId:ward,type:'village',name:'Test Village'};assert((await call('locationSuggest',buyer,proposal)).ok);assert((await call('locationSuggest',buyer,proposal)).data.already);
assert((await call('locationAdminUpsert','adm',{...src,id:village,type:'village',parentId:ward,name:'Test Village'},true)).ok);
const list=await db.collection('location_suggestions').where('submittedBy','==',buyer).get();let suggestion='';list.forEach(s=>{suggestion=s.id});
assert(!(await call('locationSuggestionResolve',buyer,{suggestionId:suggestion,decision:'approved',locationId:village,reason:'Approved'},false)).ok);
assert((await call('locationSuggestionResolve','adm',{suggestionId:suggestion,decision:'approved',locationId:village,reason:'Approved'},true)).ok);
// Actual callable races: final state must not contain a live token on a cancelled ride.
for (let i=0;i<4;i++) {
 const rid='racecancel'+u+i, ref=db.doc('ride_requests/'+rid);await ref.set({customerId:buyer,status:'searching'});
 const [accept,cancel]=await Promise.all([call('deliveryAccept',driver,{rideId:rid}),call('deliveryCancel',buyer,{rideId:rid})]);
 const r=await get('ride_requests/'+rid),t=await get('delivery_tokens/'+rid+'_pickup');
 assert(cancel.ok,JSON.stringify({accept,cancel})); assert.equal(r.status,'cancelled');if(t)assert.equal(t.status,'revoked');
}
for (let i=0;i<4;i++) {
 const rid='raceconfirm'+u+i;await db.doc('ride_requests/'+rid).set({customerId:buyer,status:'searching'});
 const accepted=await call('deliveryAccept',driver,{rideId:rid});assert(accepted.ok,JSON.stringify(accepted));
 const [confirm,cancel]=await Promise.all([call('deliveryConfirmCustody',buyer,{rideId:rid,role:'seller',token:accepted.data.token}),call('deliveryCancel',buyer,{rideId:rid})]);
 const r=await get('ride_requests/'+rid),t=await get('delivery_tokens/'+rid+'_pickup');
 assert((cancel.ok && !confirm.ok && r.status==='cancelled' && t.status==='revoked') || (confirm.ok && !cancel.ok && r.status==='seller_confirmed_handover' && t.status==='pending'),JSON.stringify({confirm,cancel,r,t}));
}
const done='picked'+u;await db.doc('ride_requests/'+done).set({customerId:buyer,status:'picked_up'});assert(!(await call('deliveryCancel',buyer,{rideId:done})).ok);
// Start-transit and handover both serialize on the ride; neither may overwrite awaiting_handover.
const next='next'+u;await db.doc('users/'+next).set({isApprovedAgent:true,agentApprovedBy:'admin'});
for(let i=0;i<3;i++){
 const rid='racestart'+u+i;await db.doc('ride_requests/'+rid).set({customerId:buyer,driverId:driver,currentCustodian:driver,status:'picked_up'});
 const [start,handover]=await Promise.all([call('deliveryStartTransit',driver,{rideId:rid}),call('deliveryGenerateToken',driver,{rideId:rid,kind:'handover',nextTransporterId:next})]);
 const r=await get('ride_requests/'+rid);assert(handover.ok,JSON.stringify({start,handover}));assert.equal(r.status,'awaiting_handover');assert.equal(r.currentCustodian,driver);
}
console.log('NATIONAL SAFETY: atomic cancel, revocation, role-guarded directory hierarchy and suggestion moderation passed');process.exit(0);
