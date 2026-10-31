// Loads firestore.rules into the running EMULATOR (demo-sokohai only).
const fs=require('fs');const c=fs.readFileSync(process.argv[2],'utf8');
fetch('http://127.0.0.1:8085/emulator/v1/projects/demo-sokohai:securityRules',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({rules:{files:[{name:'firestore.rules',content:c}]}})}).then(async r=>{const t=await r.text();console.log(r.status,t.slice(0,300))});
