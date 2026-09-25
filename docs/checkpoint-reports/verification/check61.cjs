const {JSDOM}=require('/home/user/SokoHai-phase1/node_modules/jsdom');const fs=require('fs');
const R='/home/user/SokoHai-phase1/';
const dom=new JSDOM('<!doctype html><body><input id="searchInput"><div class="search-wrap"></div></body>',{runScripts:'outside-only',url:'http://localhost:5055/'});
const w=dom.window; let now=0; const q=[]; let id=1;
w.setTimeout=(f,ms)=>{q.push({id:id,t:now+(ms||0),f});return id++;}; w.clearTimeout=i=>{const k=q.findIndex(x=>x.id===i);if(k>=0)q.splice(k,1);};
w.setInterval=(f,ms)=>{const my=id++;const tick=()=>{q.push({id:my,t:now+ms,f:()=>{f();tick();}})};tick();return my;}; w.clearInterval=w.clearTimeout;
function advance(to){for(;;){q.sort((a,b)=>a.t-b.t);const n=q[0];if(!n||n.t>to)break;q.shift();now=n.t;try{n.f()}catch(e){}}now=to;}
const log=[];w.console={log(){},warn(...a){log.push(['warn',now,a[0]])},error(){},table(x){log.push(['table',now,x])},info(){}};
// Stand-ins for functions defined by EARLIER modules (exist before 61 runs)
w.eval(`window.skh={currentUser:{uid:'u1',email:'a@b.c'},currentUserData:{uid:'u1'},secureToken:function(p){return p+'X'},currentMode:'buyer'};
window.handleSearch=function(){};window.openChatList=function(){};window.openCart=function(){};window.closeModals=function(){};
window.skhRenderShowcase=function(){};window.skhNegoFormOpen=function(){};`);
const load=(f,mod)=>{let s=fs.readFileSync(R+f,'utf8');if(mod)s=s.replace(/^import\s*\{\s*skh\s*\}\s*from\s*'\.\/00-bootstrap\.js';?/m,'var skh=window.skh;');try{w.eval('(function(){'+s+'\n})();')}catch(e){console.log('load err',f,e.message)}};
// classic scripts execute during parse (before deferred modules)
load('js/19-cart-checkout-canonical.js');load('js/20-search-chat.js');
// modules, document order: 61 (line 3294) ... 56 (3315), 79 (3317), 81 (3318)
for(const f of ['js/app/61-full-system-repair.js','js/app/56-nav-back.js','js/app/79-one-ui-at-a-time.js','js/app/81-absolute-one-ui-live.js']) load(f,true);
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
const snap=t=>{advance(t);console.log(`t=${String(t).padStart(4)}ms  handleSearch._patched61=${!!w.handleSearch._patched61}  closeModals._patched61=${!!w.closeModals._patched61}  openCart=${!!w.openCart._patched61} openChatList=${!!w.openChatList._patched61} secureToken=${!!w.skh.secureToken._patched61}`)};
for(const t of [900]) snap(t);
advance(1050);snap(1050);advance(1400);snap(1400);snap(1600);snap(2600);advance(2600);console.log("t=1050ms handleSearch._patched61="+!!w.handleSearch._patched61+"  (61 patched it at 1000ms)");advance(3000);w.skhFullSystemCheck();
const tab=log.find(l=>l[0]==='table'&&Array.isArray(l[2]));
console.log('\nskhFullSystemCheck at t=' + tab[1] + 'ms ('+tab[2].length+' checks):');tab[2].forEach(c=>console.log('  '+(c.ok?'PASS':'FAIL')+'  '+c.phase.padEnd(11)+c.test));
console.log('warn lines:',log.filter(l=>l[0]==='warn').map(l=>l[2]).join(' | '));
