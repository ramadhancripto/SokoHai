const FN='http://127.0.0.1:5055/__fn', AUTH='http://127.0.0.1:9099';
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
// Token as the BROWSER has it today: issued by project sokonet-3b847 (production Auth, never connected to emulator).
// Unsigned stand-in: emulator-mode Admin SDK skips signature, but checks aud/iss first -> same failure point.
const now=Math.floor(Date.now()/1000);
const prodLike=b64({alg:'none',typ:'JWT'})+'.'+b64({iss:'https://securetoken.google.com/sokonet-3b847',aud:'sokonet-3b847',auth_time:now,user_id:'uidA',sub:'uidA',iat:now,exp:now+3600,email:'rshabansaid@gmail.com',email_verified:true,firebase:{sign_in_provider:'password'}})+'.';
async function emuUser(email){const r=await fetch(AUTH+'/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'secret123',returnSecureToken:true})});const j=await r.json();if(!j.idToken){const r2=await fetch(AUTH+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'secret123',returnSecureToken:true})});return r2.json();}return j;}
async function call(name,data,tok){const r=await fetch(FN+'/'+name,{method:'POST',headers:Object.assign({'content-type':'application/json',origin:'http://localhost:5055'},tok?{authorization:'Bearer '+tok}:{}),body:JSON.stringify({data})});return r.status+' '+(await r.text()).slice(0,160);}
const A=await emuUser('rshabansaid@gmail.com'), B=await emuUser('userb@test.local');
console.log('--- 1. token from project sokonet-3b847 (what the browser sends today)');
for(const f of ['creativePublish','creativeSaveDraft','walletAdjust','adsRequestDelivery']) console.log(' ',f.padEnd(20),await call(f,{creativeId:'x'},prodLike));
console.log('--- 2. no token');
console.log('  creativePublish     ',await call('creativePublish',{creativeId:'x'}));
console.log('--- 3. Auth-emulator token (demo-sokohai), admin A uid='+A.localId);
console.log('  creativePublish     ',await call('creativePublish',{creativeId:'creativeWrittenByBrowserToProd',publicationType:'advertisement',action:'publish'},A.idToken));
console.log('  B uid='+B.localId+' adsRequestDelivery', await call('adsRequestDelivery',{placement:'home',slotId:'home-top',sessionId:'s1',requestId:'r1'},B.idToken));
