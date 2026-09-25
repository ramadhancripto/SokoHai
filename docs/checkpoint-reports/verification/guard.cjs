const fs=require('fs'); const src=fs.readFileSync('/home/user/SokoHai-phase1/js/app/00-bootstrap.js','utf8');
const guard=src.slice(src.indexOf('skh.emulator = (function () {'), src.indexOf('})();', src.indexOf('skh.emulator = (function () {'))+5);
const isLocal=fs.readFileSync('/home/user/SokoHai-phase1/js/app/00-bootstrap.js','utf8'); const il=isLocal.slice(isLocal.indexOf('skh.isLocalEnv = (function () {'), isLocal.indexOf('})();', isLocal.indexOf('skh.isLocalEnv = (function () {'))+5);
const good={projectId:'demo-sokohai',firestore:{host:'127.0.0.1',port:8085},authUrl:'http://127.0.0.1:9099'};
const cases=[
 ['production host sokohaico.netlify.app, SKH_EMULATOR forged', {hostname:'sokohaico.netlify.app',protocol:'https:'}, {SKH_EMULATOR:good,SKH_LOCAL_FUNCTIONS_SERVER:true}, false],
 ['firebase hosting host, forged', {hostname:'sokonet-3b847.web.app',protocol:'https:'}, {SKH_EMULATOR:good,SKH_LOCAL_FUNCTIONS_SERVER:true}, false],
 ['localhost, no local server flag (plain static server)', {hostname:'localhost',protocol:'http:'}, {SKH_EMULATOR:good}, false],
 ['localhost via local server, PROD_DATA mode (no SKH_EMULATOR)', {hostname:'localhost',protocol:'http:'}, {SKH_LOCAL_FUNCTIONS_SERVER:true}, false],
 ['localhost, SKH_EMULATOR with production projectId', {hostname:'localhost',protocol:'http:'}, {SKH_EMULATOR:Object.assign({},good,{projectId:'sokonet-3b847'}),SKH_LOCAL_FUNCTIONS_SERVER:true}, false],
 ['localhost, SKH_EMULATOR missing firestore', {hostname:'localhost',protocol:'http:'}, {SKH_EMULATOR:{projectId:'demo-sokohai'},SKH_LOCAL_FUNCTIONS_SERVER:true}, false],
 ['localhost via local server in EMULATOR mode (intended)', {hostname:'localhost',protocol:'http:'}, {SKH_EMULATOR:good,SKH_LOCAL_FUNCTIONS_SERVER:true}, true],
];
let pass=0; for(const [name,loc,win,expect] of cases){ const window=Object.assign({location:loc},win); const skh={}; eval(il); eval(guard); const on=!!skh.emulator; const ok=on===expect; pass+=ok; console.log((ok?'PASS':'FAIL')+'  '+name+' → emulator '+(on?'ON':'off')); }
console.log(pass+'/'+cases.length);
