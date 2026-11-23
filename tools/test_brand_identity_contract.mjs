import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const head=read('html/00-head.html'), mark='assets/img/sokohai-cart-mark.png';
// [PERF 2026-11-22] in-app surfaces may use the 192px WebP rendering of the SAME mark (67 KB -> 17 KB); metadata keeps the PNG
const mark192='assets/img/sokohai-cart-mark-192.webp';
assert(fs.existsSync(new URL('../'+mark192,import.meta.url)) && fs.readFileSync(new URL('../'+mark192,import.meta.url)).slice(8,12).toString()==='WEBP','192px WebP of the mark exists');
for(const path of ['html/16-topnav.html','html/01-shell.html','html/03-modals-core.html','html/08-modal-transport.html','html/14-sokopay.html','js/app/120-live-commerce-ui.js','js/app/75-discover-engine.js','js/app/00-bootstrap.js']) assert(read(path).includes(mark)||read(path).includes(mark192),`${path} missing top-nav logo`);
assert(head.includes('https://sokohai.com/'+mark),'Open Graph / JSON-LD logo keeps the full-size PNG');
for(const path of ['html/00-head.html','html/16-topnav.html','html/01-shell.html','html/03-modals-core.html','html/08-modal-transport.html','js/app/120-live-commerce-ui.js','js/app/00-bootstrap.js','offline.html','functions/push.js','sokohai-sw.js']) assert(!/sokohai-logo\.png|sokohai-s-mark\.png|(?:^|\/)icon-192\.png|(?:^|\/)icon-512\.png/.test(read(path)),`${path} contains an old system logo reference`);
const manifest=JSON.parse(read('sokohai-manifest.json'));for(const icon of manifest.icons) {assert(icon.src.includes('sokohai-app-'));assert(fs.existsSync(new URL('../'+icon.src,import.meta.url)));}
const code=head.match(/<script id="skhWordmarkGen">([\s\S]*?)<\/script>/)[1];const ctx={window:{},document:{querySelectorAll:()=>[]},Math,Number};vm.runInNewContext(code,ctx);
const output=ctx.window.skhWordmark(200,{}),white=ctx.window.skhWordmark(200,{variant:'white'});assert(output.includes(mark));assert(output.includes('skh-brand-soko')&&output.includes('skh-brand-hai'));assert(white.includes('color:#fff'));assert(!output.includes('<svg'));
const bootstrap=read('js/app/00-bootstrap.js');assert(/skh\.skohaiLogo = function skohaiLogo/.test(bootstrap));
console.log('PASS system brand references: nav, splash, welcome, transport, SokoPay default avatar, Discover, Live, wordmark compatibility, metadata, PWA, offline and push source. Seller/user branding untouched.');
