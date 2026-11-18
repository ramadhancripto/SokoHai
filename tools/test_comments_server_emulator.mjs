#!/usr/bin/env node
// Synthetic demo data only. No production requests.
import assert from 'node:assert/strict';import{createRequire}from'node:module';
const host=process.env.FIRESTORE_EMULATOR_HOST,project=process.env.GCLOUD_PROJECT||'';
if(!host||!project.startsWith('demo-')){console.error('BLOCKED: demo Firestore emulator required');process.exit(2)}
process.env.GOOGLE_CLOUD_PROJECT=project;process.env.FIREBASE_CONFIG=JSON.stringify({projectId:project});
const require=createRequire(new URL('../functions/index.js',import.meta.url)),f=require('../functions/index.js'),db=require('firebase-admin').firestore(),u=Date.now().toString(36),a='buyerA'+u,b='buyerB'+u,p='productA'+u,p2='productB'+u;
const invoke=async(uid,data)=>{try{return {ok:true,data:await f.commentsPublish.run({data,auth:uid?{uid,token:{uid}}:null,rawRequest:{headers:{}}})}}catch(e){return{ok:false,code:e.code,message:e.message}}};
const get=async id=>(await db.doc('comments/'+id).get()).data();const count=async id=>(await db.collection('comments').where('targetId','==',id).get()).size;
await db.doc('products/'+p).set({title:'A'});await db.doc('products/'+p2).set({title:'B'});
const base={targetType:'product',targetId:p,text:'Hello',clientRequestId:'testrequestkey000'+u};
let one=await invoke(a,base);assert(one.ok,JSON.stringify(one));assert.equal((await get(one.data.id)).targetId,p);let repeat=await invoke(a,base);assert(repeat.ok&&repeat.data.already);assert.equal(one.data.id,repeat.data.id);assert.equal(await count(p),1);
assert.equal((await invoke(a,{...base,text:'changed'})).code,'already-exists');
assert.equal((await invoke(null,base)).code,'unauthenticated');assert.equal((await invoke(b,{targetId:p,text:' '})).code,'invalid-argument');assert.equal((await invoke(b,{targetId:p,text:'a'.repeat(2001)})).code,'invalid-argument');
let bad=await invoke(b,{targetId:p2,text:'bad parent',parentId:'bad/path'});assert.equal(bad.code,'invalid-argument');assert.equal(await count(p2),0);
assert.equal((await invoke(b,{targetId:p2,text:'wrong parent',parentId:one.data.id})).code,'failed-precondition');assert.equal(await count(p2),0);
assert.equal((await invoke(b,{targetId:'missing'+u,text:'orphan'})).code,'not-found');
assert.equal((await invoke(b,{targetId:p,text:'bad type',targetType:'not-type'})).code,'invalid-argument');
const payload={targetId:p,text:'Reply',parentId:one.data.id,rootId:one.data.id,clientRequestId:'replyrequestkey000'+u};
const [x,y]=await Promise.all([invoke(b,payload),invoke(b,payload)]);assert(x.ok,JSON.stringify(x));assert(y.ok,JSON.stringify(y));assert.equal(x.data.id,y.data.id);assert.equal((await get(one.data.id)).replyCount,1);assert.equal((await get(x.data.id)).rootId,one.data.id);assert.equal(await count(p),2);
assert.equal((await invoke('third'+u,{targetId:p,text:'bad root',parentId:one.data.id,rootId:'not-root'})).code,'failed-precondition');
for(const [type,col] of [['service','services'],['transport','drivers']]){let id=type+u;await db.doc(col+'/'+id).set({title:type});assert((await invoke(type+u,{targetType:type,targetId:id,text:'Sample'})).ok)}
console.log('COMMENTS EMULATOR: creation/retrieval, idempotent concurrent reply, atomic count, invalid/cross-target/root/auth/length and service/transport passed');process.exit(0);
