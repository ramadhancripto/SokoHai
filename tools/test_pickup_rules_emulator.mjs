#!/usr/bin/env node
import assert from 'node:assert/strict';
const host=process.env.FIRESTORE_EMULATOR_HOST, project=process.env.GCLOUD_PROJECT||'demo-sokohai';
if(!host){console.error('BLOCKED: Firestore emulator required');process.exit(2)}
const base=`http://${host}/v1/projects/${project}/databases/(default)/documents`;
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(uid){const now=Math.floor(Date.now()/1000);return b64({alg:'none',typ:'JWT'})+'.'+b64({iss:'https://securetoken.google.com/'+project,aud:project,sub:uid,user_id:uid,iat:now,exp:now+3600,firebase:{identities:{},sign_in_provider:'password'}})+'.'}
function value(x){if(Array.isArray(x))return {arrayValue:{values:x.map(value)}};return {stringValue:String(x)}}
async function seed(path,data){const r=await fetch(base+'/'+path,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,value(v)]))})});assert(r.ok,await r.text())}
async function read(uid,path){return (await fetch(base+'/'+path,{headers:{Authorization:'Bearer '+jwt(uid)}})).ok}
const id='rules-pk-'+Date.now(), rid='ride_requests/'+id, tk='delivery_tokens/'+id+'_pickup';
const live={customerId:'buyer',sellerId:'seller',driverId:'driver',status:'accepted',pickupTokenStatus:'pending'};
await seed(rid,live);await seed(tk,{kind:'pickup',rideId:id,token:'PK-TEST',participants:['seller','driver']});
assert(await read('seller',tk));assert(await read('driver',tk));assert(!(await read('buyer',tk)));assert(!(await read('stranger',tk)));
await seed(rid,{...live,status:'cancelled'});assert(!(await read('seller',tk)));assert(!(await read('driver',tk)));
await seed(rid,{...live,driverId:'driver2'});assert(!(await read('driver',tk)));assert(!(await read('seller',tk)));
await seed(rid,{...live,status:'searching'});assert(!(await read('driver',tk)));
console.log('PICKUP RULES: seller/driver allowed; buyer/stranger/cancelled/reassigned denied');
