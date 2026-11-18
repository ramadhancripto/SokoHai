#!/usr/bin/env node
import assert from 'node:assert/strict';import{createRequire}from'node:module';
if(!process.env.FIRESTORE_EMULATOR_HOST){console.error('BLOCKED: emulator required');process.exit(2)}
process.env.GCLOUD_PROJECT||='demo-sokohai';process.env.GOOGLE_CLOUD_PROJECT=process.env.GCLOUD_PROJECT;process.env.FIREBASE_CONFIG=JSON.stringify({projectId:process.env.GCLOUD_PROJECT});
const require=createRequire(new URL('../functions/index.js',import.meta.url)),f=require('../functions/index.js'),db=require('firebase-admin').firestore(),n=Date.now().toString(36),buyer='br'+n,d1='dr1'+n,d2='dr2'+n;
const call=async(n,uid,data)=>{try{return{ok:true,data:await f[n].run({data,auth:{uid,token:{uid}},rawRequest:{headers:{}}})}}catch(e){return{ok:false,code:e.code,message:e.message}}};
for(const d of[d1,d2])await db.doc('users/'+d).set({isApprovedAgent:true,agentApprovedBy:'admin'});
for(let i=0;i<3;i++){
 const r='route-race-'+n+i,o1='of1-'+n+i,o2='of2-'+n+i;
 await db.doc('ride_requests/'+r).set({customerId:buyer,status:'searching',routingStatus:'routing',assignmentStatus:'seeking',activeOfferId:o1});
 for(const [id,agent,status,rank]of[[o1,d1,'offered',0],[o2,d2,'waiting',1]])await db.doc('delivery_offers/'+id).set({rideId:r,agentId:agent,customerId:buyer,status,rank,expiresAt:new Date(Date.now()+60000).toISOString()});
 const [cancel,decline]=await Promise.all([call('deliveryCancel',buyer,{rideId:r}),call('deliveryOfferDecline',d1,{offerId:o1})]);
 assert(cancel.ok,JSON.stringify({cancel,decline}));const ride=(await db.doc('ride_requests/'+r).get()).data(),a=(await db.doc('delivery_offers/'+o1).get()).data(),b=(await db.doc('delivery_offers/'+o2).get()).data();
 assert.equal(ride.status,'cancelled');assert(!['offered','waiting'].includes(a.status));assert(!['offered','waiting'].includes(b.status));
}
console.log('ROUTING RACES: decline versus cancellation preserves closed ride and no active offers');process.exit(0);
