#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
if (!process.env.FIRESTORE_EMULATOR_HOST) {console.error('BLOCKED: Firestore emulator required');process.exit(2)}
process.env.GCLOUD_PROJECT ||= 'demo-sokohai';process.env.GOOGLE_CLOUD_PROJECT=process.env.GCLOUD_PROJECT;process.env.FIREBASE_CONFIG=JSON.stringify({projectId:process.env.GCLOUD_PROJECT});
const require=createRequire(new URL('../functions/index.js',import.meta.url));
const fn=require('../functions/index.js'),db=require('firebase-admin').firestore(),t=Date.now().toString(36);
const a='hda'+t,b='hdb'+t,c='hdc'+t,owner='hdo'+t,id='hdr'+t;
async function call(n,uid,data){try{return {ok:true,data:await fn[n].run({data,auth:{uid,token:{uid}},rawRequest:{headers:{}}})}}catch(e){return {ok:false,code:e.code,message:e.message}}}
async function read(path){return (await db.doc(path).get()).data()}
for(const uid of [a,b,c]) await db.doc('users/'+uid).set({displayName:uid,isApprovedAgent:true,agentApprovedBy:'admin'});
await db.doc('ride_requests/'+id).set({customerId:owner,status:'searching',fare:2000});
let r=await call('deliveryAccept',a,{rideId:id});assert(r.ok,JSON.stringify(r));const pk=r.data.token;
assert((await call('deliveryConfirmCustody',owner,{rideId:id,role:'seller',token:pk})).ok);
assert((await call('deliveryConfirmCustody',a,{rideId:id,role:'transporter',token:pk})).ok);
assert((await call('deliveryStartTransit',a,{rideId:id})).ok);
const [x,y]=await Promise.all([call('deliveryGenerateToken',a,{rideId:id,kind:'handover',nextTransporterId:b}),call('deliveryGenerateToken',a,{rideId:id,kind:'handover',nextTransporterId:b})]);
assert(x.ok,JSON.stringify(x));assert(y.ok,JSON.stringify(y));assert.equal(x.data.token,y.data.token);assert.equal(x.data.handoverId,y.data.handoverId);const tr=x.data.token;assert.match(tr,/^TR-[A-F0-9]{24}$/);
assert(!(await call('deliveryGenerateToken',a,{rideId:id,kind:'handover',nextTransporterId:c})).ok);
assert(!(await call('deliveryTokenVerify',c,{rideId:id,kind:'handover',token:tr})).ok);
await db.doc('ride_requests/'+id).update({pickupTokenExpiresAt:new Date(Date.now()-60000).toISOString()});
assert((await call('deliveryTokenVerify',b,{rideId:id,kind:'handover',token:tr})).ok);
assert(!(await call('deliveryConfirmCustody',b,{rideId:id,role:'transporter',handover:true,token:tr})).ok);
assert.equal((await read('ride_requests/'+id)).currentCustodian,a);
assert((await call('deliveryConfirmCustody',a,{rideId:id,role:'handover_from'})).ok);
assert(!(await call('deliveryConfirmCustody',b,{rideId:id,role:'transporter',handover:true,token:'TR-WRONG'})).ok);
const [p,q]=await Promise.all([call('deliveryConfirmCustody',b,{rideId:id,role:'transporter',handover:true,token:tr}),call('deliveryConfirmCustody',b,{rideId:id,role:'transporter',handover:true,token:tr})]);
assert(p.ok,JSON.stringify(p));assert(q.ok,JSON.stringify(q));assert.equal((await read('ride_requests/'+id)).currentCustodian,b);assert.equal((await read('delivery_tokens/'+id+'_handover')).status,'used');assert.equal((await read('delivery_handovers/'+x.data.handoverId)).status,'completed');assert(!(await call('deliveryTokenVerify',b,{kind:'handover',token:tr})).ok);
const second=await call('deliveryGenerateToken',b,{rideId:id,kind:'handover',nextTransporterId:c});assert(second.ok,JSON.stringify(second));assert.notEqual(second.data.token,tr);assert(!(await call('deliveryConfirmCustody',a,{rideId:id,role:'handover_from'})).ok);assert.equal((await read('ride_requests/'+id)).currentCustodian,b);
console.log('HANDOVER EMULATOR: parallel issuance/retry, actor/token/stage checks, two-party custody, reuse and next leg passed');process.exit(0);
