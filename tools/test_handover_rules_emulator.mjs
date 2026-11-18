#!/usr/bin/env node
import assert from 'node:assert/strict';
const host=process.env.FIRESTORE_EMULATOR_HOST,project=process.env.GCLOUD_PROJECT||'demo-sokohai';if(!host){console.error('BLOCKED: Firestore emulator required');process.exit(2)}
const base=`http://${host}/v1/projects/${project}/databases/(default)/documents`, b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(u){const n=Math.floor(Date.now()/1000);return b64({alg:'none',typ:'JWT'})+'.'+b64({iss:'https://securetoken.google.com/'+project,aud:project,sub:u,user_id:u,iat:n,exp:n+3600,firebase:{identities:{},sign_in_provider:'password'}})+'.'}
function val(x){return Array.isArray(x)?{arrayValue:{values:x.map(val)}}:{stringValue:String(x)}}
async function seed(p,d){const r=await fetch(base+'/'+p,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({fields:Object.fromEntries(Object.entries(d).map(([k,v])=>[k,val(v)]))})});assert(r.ok,await r.text())}
async function read(u,p){return (await fetch(base+'/'+p,{headers:{Authorization:'Bearer '+jwt(u)}})).ok}
const id='hr'+Date.now(),ride='ride_requests/'+id,tk='delivery_tokens/'+id+'_handover',ho='delivery_handovers/'+id;
const data={customerId:'buyer',driverId:'a',currentCustodian:'a',nextTransporterId:'b',status:'awaiting_handover',handoverTokenStatus:'pending'};
await seed(ride,data);await seed(tk,{kind:'handover',rideId:id,token:'TR-TEST',participants:['a','b']});await seed(ho,{rideId:id,fromTransporterId:'a',toTransporterId:'b'});
assert(await read('a',tk));assert(await read('b',tk));assert(!(await read('buyer',tk)));assert(!(await read('c',tk)));assert(await read('a',ho));assert(await read('b',ho));assert(!(await read('c',ho)));
await seed(ride,{...data,nextTransporterId:'c'});assert(!(await read('b',tk)));await seed(ride,{...data,status:'in_transit',handoverTokenStatus:'used'});assert(!(await read('a',tk)));assert(!(await read('b',tk)));
console.log('HANDOVER RULES: active participants only, handover record access, stale/used token denied');
