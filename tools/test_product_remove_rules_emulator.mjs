// Emulator only. This test uses demo-sokohai and never contacts live Firebase.
import assert from 'node:assert/strict';
const host=process.env.FIRESTORE_EMULATOR_HOST;if(!host)throw Error('FIRESTORE_EMULATOR_HOST is required');
const project='demo-sokohai',base=`http://${host}/v1/projects/${project}/databases/(default)/documents`;
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');function token(uid){const n=Math.floor(Date.now()/1000);return b64({alg:'none',typ:'JWT'})+'.'+b64({iss:'https://securetoken.google.com/'+project,aud:project,auth_time:n,user_id:uid,sub:uid,iat:n,exp:n+3600,firebase:{identities:{},sign_in_provider:'password'}})+'.'}
function enc(v){if(v===null)return{nullValue:null};if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};if(typeof v==='boolean')return{booleanValue:v};if(typeof v==='string')return{stringValue:v};if(Array.isArray(v))return{arrayValue:{values:v.map(enc)}};return{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,enc(x)]))}}}const f=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,enc(v)]));
async function req(method,path,tok,data,query=''){let r=await fetch(base+'/'+path+query,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:data?JSON.stringify({fields:f(data)}):undefined});return{status:r.status,body:await r.text()}}
const set=(id,data)=>req('PATCH','products/'+id,'owner',data);const patch=(id,tok,data)=>req('PATCH','products/'+id,tok,data,'?'+Object.keys(data).map(k=>'updateMask.fieldPaths='+encodeURIComponent(k)).join('&')+'&currentDocument.exists=true');
const owner=token('remove-bob'),other=token('remove-eve');
const orig={userId:'remove-bob',title:'Sabuni',price:1500,stock:5,publicationStatus:'published',status:'active',category:'CAT-01'};
assert.equal((await set('remove-test-p1',orig)).status,200);assert.equal((await set('remove-test-p2',orig)).status,200);
const change={publicationStatus:'archived',status:'archived',archivedAt:'2026-11-18T00:00:00.000Z',updatedAt:'2026-11-18T00:00:00.000Z'};
let r=await patch('remove-test-p1',other,change);assert.equal(r.status,403,'other seller must not archive');
r=await patch('remove-test-p1',owner,change);assert.equal(r.status,200,'owner archives');let fields=JSON.parse(r.body).fields;assert.equal(fields.publicationStatus.stringValue,'archived');assert.equal(fields.stock.integerValue,'5');assert.equal(fields.title.stringValue,'Sabuni');
r=await req('DELETE','products/remove-test-p2',owner);assert.equal(r.status,403,'physical client deletion prohibited');
r=await patch('remove-test-p1',owner,{publicationStatus:'published',status:'active',archivedAt:null,updatedAt:'2026-11-18T01:00:00.000Z'});assert.equal(r.status,200,'owner can restore');assert.equal(JSON.parse(r.body).fields.archivedAt.nullValue,null);
await set('remove-test-invalid',{...orig,price:0});r=await patch('remove-test-invalid',owner,change);assert.equal(r.status,200,'owner can archive invalid legacy product');
r=await patch('remove-test-invalid',owner,{...change,stock:999});assert.equal(r.status,403,'archive exception cannot change stock');
r=await patch('remove-test-invalid',other,change);assert.equal(r.status,403,'other user cannot use legacy exception');
r=await patch('remove-test-invalid',owner,{publicationStatus:'published',status:'active',archivedAt:null,updatedAt:'2026-11-18T01:00:00.000Z'});assert.equal(r.status,403,'invalid legacy record cannot bypass normal validation to republish');
r=await patch('remove-test-invalid',other,{publicationStatus:'draft',status:'draft',archivedAt:null,updatedAt:'2026-11-18T02:00:00.000Z'});assert.equal(r.status,403,'other user cannot restore');
r=await patch('remove-test-invalid',owner,{publicationStatus:'draft',status:'draft',archivedAt:null,updatedAt:'2026-11-18T02:00:00.000Z',stock:900});assert.equal(r.status,403,'restore cannot change stock');
r=await patch('remove-test-invalid',owner,{publicationStatus:'draft',status:'draft',archivedAt:null,updatedAt:'2026-11-18T02:00:00.000Z'});assert.equal(r.status,200,'legacy archived product can restore to draft');
await set('remove-test-moderated',{...orig,price:0,publicationStatus:'archived',status:'archived',archivedAt:'2020',adminHidden:true});
r=await patch('remove-test-moderated',owner,{publicationStatus:'draft',status:'draft',archivedAt:null,updatedAt:'2026-11-18T02:00:00.000Z'});assert.equal(r.status,403,'cannot bypass admin moderation with legacy restore');
console.log('PASS emulator: owner archive/restore, other seller denied, physical delete denied, invalid legacy narrowly archived, stock changes and invalid republish denied');
