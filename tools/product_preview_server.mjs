// Local-only test host: serves actual generated markup/CSS/modules, replacing
// only bootstrap/cloud boundaries. Never deploy this fixture as production.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
const root=path.resolve(new URL('..',import.meta.url).pathname),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const b=read('js/app/00-bootstrap.js'),ctx={skh:{}};
vm.runInNewContext(b.slice(b.indexOf('skh.advancedCategories ='),b.indexOf('\n',b.indexOf('};',b.indexOf('skh.advancedCategories =')))),ctx);
const save=b.slice(b.indexOf('skh.saveData ='),b.indexOf('\nskh.activeSubCategory',b.indexOf('skh.saveData =')));
const product=read('js/app/07-product.js');const media=product.slice(product.indexOf('window.skhRenderProductMedia ='),product.indexOf('// Tafsiri'));
http.createServer((req,res)=>{try{
 const url=new URL(req.url,'http://preview'),p=decodeURIComponent(url.pathname);let body,type='text/javascript';
 if(p==='/'){
  type='text/html';body=read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  body=body.replace('</body>','<script type="module" src="/tools/fixtures/product-preview-start.mjs"></script></body>');
 }else if(p==='/preview-config.json'){type='application/json';body=JSON.stringify({live:ctx.skh.advancedCategories,save,media});}
 else if(p==='/js/app/00-bootstrap.js')body=read('tools/fixtures/taxonomy-browser-cloud.mjs');
 else {const file=path.resolve(root,'.'+p);if(!file.startsWith(root+'/')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 type=({'.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.json':'application/json','.woff2':'font/woff2','.html':'text/html'})[path.extname(file)]||'text/javascript';body=fs.readFileSync(file);}
 res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
 }catch(e){res.writeHead(500);res.end(String(e));}}).listen(4174,'0.0.0.0',()=>console.log('Actual Product UI fixture on 4174 — mock cloud, session-only products'));
