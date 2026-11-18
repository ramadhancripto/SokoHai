#!/usr/bin/env node
import assert from 'node:assert/strict';
const host=process.env.FIRESTORE_EMULATOR_HOST, project=process.env.GCLOUD_PROJECT||'demo-sokohai';if(!host){console.error('BLOCKED: emulator required');process.exit(2)}
const base=`http://${host}/v1/projects/${project}/databases/(default)/documents`,b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function jwt(uid){const now=Math.floor(Date.now()/1000);return b64({alg:'none',typ:'JWT'})+'.'+b64({iss:'https://securetoken.google.com/'+project,aud:project,sub:uid,user_id:uid,iat:now,exp:now+3600,firebase:{identities:{},sign_in_provider:'password'}})+'.'}
async function patch(uid,path,obj,mask=false){const qs=mask?'?'+Object.keys(obj).map(k=>'updateMask.fieldPaths='+encodeURIComponent(k)).join('&'):'';return fetch(base+'/'+path+qs,{method:'PATCH',headers:{Authorization:'Bearer '+(uid==='owner'?'owner':jwt(uid)),'Content-Type':'application/json'},body:JSON.stringify({fields:Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,{stringValue:v}]))})})}
async function read(uid,path){return fetch(base+'/'+path,{headers:{Authorization:'Bearer '+jwt(uid)}})}
const id=Date.now().toString(36),r='ride_requests/rules-'+id,l='location_directory/test-'+id,s='location_suggestions/test-'+id;
assert((await patch('owner',r,{customerId:'buyer',status:'searching'})).ok);
assert(!(await patch('buyer',r,{status:'cancelled'},true)).ok);assert(!(await patch('buyer',r,{driverId:'someone'},true)).ok);
assert((await patch('owner',l,{name:'Test only',type:'region',status:'verified'})).ok);assert((await read('buyer',l)).ok);
assert(!(await patch('buyer',l,{name:'Attacker'},true)).ok);assert(!(await patch('buyer',s,{submittedBy:'buyer',status:'approved'})).ok);
assert((await patch('owner',s,{submittedBy:'buyer',status:'pending'})).ok);assert((await read('buyer',s)).ok);assert(!(await read('stranger',s)).ok);
console.log('NATIONAL RULES: direct client status/assignment and directory writes denied; suggestion privacy passed');
