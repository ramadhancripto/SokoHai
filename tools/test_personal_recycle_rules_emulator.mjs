// Emulator only; fake user data. Never run against production.
import assert from 'node:assert/strict';
const h=process.env.FIRESTORE_EMULATOR_HOST;if(!h)throw Error('FIRESTORE_EMULATOR_HOST required');const project='demo-sokohai',base=`http://${h}/v1/projects/${project}/databases/(default)/documents`;
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');function token(uid){let n=Math.floor(Date.now()/1000);return b64({alg:'none',typ:'JWT'})+'.'+b64({iss:'https://securetoken.google.com/'+project,aud:project,auth_time:n,user_id:uid,sub:uid,iat:n,exp:n+3600,firebase:{identities:{},sign_in_provider:'password'}})+'.'}
function enc(v){if(typeof v==='number')return{integerValue:String(v)};if(typeof v==='boolean')return{booleanValue:v};if(typeof v==='string')return{stringValue:v};if(v===null)return{nullValue:null};if(Array.isArray(v))return{arrayValue:{values:v.map(enc)}};return{mapValue:{fields:fields(v)}}}function fields(o){return Object.fromEntries(Object.entries(o).map(([k,v])=>[k,enc(v)]))}
async function req(method,path,tok,data){const r=await fetch(base+'/'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:data?JSON.stringify({fields:fields(data)}):undefined});return{status:r.status,body:await r.text()}}
const admin='owner',u=token('test-buyer'),seller=token('test-seller'),evil=token('test-other');
for(const [col,id,data] of [['orders','z-done',{buyerId:'test-buyer',sellerId:'test-seller',status:'completed',amount:10}],['orders','z-active',{buyerId:'test-buyer',sellerId:'test-seller',status:'shipped',amount:10}],['orders','z-upper',{buyerId:'test-buyer',sellerId:'test-seller',status:'COMPLETED',amount:10}],['ride_requests','z-ride',{customerId:'test-buyer',driverId:'test-driver',status:'completed'}],['requests','z-request',{senderId:'test-buyer',receiverId:'test-seller',status:'cancelled'}],['negotiations','z-nego',{buyerId:'test-buyer',sellerId:'test-seller',currentState:'REJECTED'}]])assert.equal((await req('PATCH',col+'/'+id,admin,data)).status,200);
const item=(col,id)=>({collection:col,recordId:id,hiddenAt:'2026-11-18T00:00:00Z'});const marker=(uid,col,id)=>`dashboard_hidden/${uid}/entries/${col}__${id}`;
assert.equal((await req('PATCH',marker('test-buyer','orders','z-done'),u,item('orders','z-done'))).status,200);
assert.equal((await req('PATCH',marker('test-seller','orders','z-done'),seller,item('orders','z-done'))).status,200,'other party may independently hide');
assert.equal((await req('PATCH',marker('test-buyer','orders','z-upper'),u,item('orders','z-upper'))).status,200,'uppercase legacy terminal');
assert.equal((await req('PATCH',marker('test-buyer','orders','z-active'),u,item('orders','z-active'))).status,403,'active cannot hide');
assert.equal((await req('PATCH',marker('test-other','orders','z-done'),evil,item('orders','z-done'))).status,403,'nonparty rejected');
assert.equal((await req('PATCH',marker('test-buyer','orders','z-done'),evil,item('orders','z-done'))).status,403,'other user cannot write preference');
assert.equal((await req('GET',marker('test-buyer','orders','z-done'),evil)).status,403,'preferences private');
assert.equal((await req('PATCH',marker('test-buyer','orders','z-done')+'x',u,item('orders','z-done'))).status,403,'id must match');
assert.equal((await req('PATCH',marker('test-buyer','orders','z-done'),u,{...item('orders','z-done'),amount:0})).status,403,'extra data disallowed');
for(const [col,id] of [['ride_requests','z-ride'],['requests','z-request'],['negotiations','z-nego']])assert.equal((await req('PATCH',marker('test-buyer',col,id),u,item(col,id))).status,200,col);
assert.equal((await req('DELETE',marker('test-buyer','orders','z-done'),u)).status,200,'restore marker');assert.equal((await req('GET','orders/z-done',u)).status,200,'order still exists');assert.equal((await req('GET',marker('test-seller','orders','z-done'),seller)).status,200,'other party marker unchanged');
console.log('PASS isolated emulator: private markers, party/terminal enforcement, independent users, restore without shared deletion');
