import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
let passed = 0, failed = 0;
function check(name, ok) {
  if (ok) { passed++; console.log(`PASS ${name}`); }
  else { failed++; console.error(`FAIL ${name}`); }
}
function has(file, needle) { return read(file).includes(needle); }
function lacks(file, needle) { return !has(file, needle); }

check('top navigation management identity is soft green', has('html/16-topnav.html', 'background:#EAF8F2; color:#17604E;'));
check('runtime toast is a white semantic surface', has('js/07-toasts.js', 'background:#fff;color:#18352D;border:1px solid #CCEBDD;border-left:4px solid #18A982'));
check('legacy chat inbox header is light', has('css/15-chat-comments.css', 'background: #F1FBF7; color: #18352D;'));
check('chat v2 active and unread states use green identity', has('css/24-chat-ui-v2.css', 'background: #18A982;'));
check('commerce route panel uses supporting blue softly', has('css/16-commerce-card.css', 'background:#F0F7FA;'));
check('commerce route action remains primary green', has('css/16-commerce-card.css', 'background:#18A982;color:#fff;border:none;border-radius:99px;'));
check('product mode summary cards no longer use dark full panels', lacks('js/app/07-product.js', 'background:#0f172a; color:white; padding:20px; text-align:center; border-radius:18px;'));
check('seller fallback cover is soft green', has('js/app/29-seller-store.js', "'<div style=\"height:140px;background:#EAF8F2;\"></div>'"));
check('seller comments header is a light surface', has('js/app/36-seller-chat-comments.js', 'linear-gradient(135deg,#EAF8F2,#F0F7FA)'));
check('print workspace header is soft green', has('js/app/22-printing.js', 'background:#EAF8F2; color:#18352D;'));
check('lifecycle active tab is primary green', has('js/app/51-lifecycle-ui.js', 'background:#18A982;border-color:#18A982;color:#fff'));
check('state retry action is primary green', has('js/09-states.js', 'background:#18A982;'));
check('account save action is primary green', has('js/app/67-payment-accounts.js', 'background:#18A982;color:white'));
check('legacy announcement source no longer has dark navy strip', lacks('css/05-announcement.css', 'background:linear-gradient(90deg,#002244,#00509d,#10b981)'));
check('old core announcement source no longer has dark navy strip', lacks('css/01-core.css', 'background: linear-gradient(90deg, #002244, #00509d)'));
check('dialogs do not use legacy blue primary background', lacks('js/05-dialogs.js', 'background:#1268A8'));
check('current Discover engine is removed', !fs.existsSync(new URL('../js/app/75-discover-engine.js', import.meta.url)));
check('current Discover completion UI is removed', !fs.existsSync(new URL('../js/app/88-discover-complete.js', import.meta.url)));

console.log(`\nFinal white-system contract: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
