import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync('js/app/34-chat-core.js', 'utf8');
const css = fs.readFileSync('css/15-chat-comments.css', 'utf8');
const negoCss = fs.readFileSync('css/17-negotiation-form.css', 'utf8');
const rules = fs.readFileSync('firestore.rules', 'utf8');
const scripts = fs.readFileSync('html/21-scripts.html', 'utf8');
const chatHtml = fs.readFileSync('html/06-modals-social.html', 'utf8');
const negoForm = fs.readFileSync('js/app/38-negotiation-form.js', 'utf8');
const negoLogic = fs.readFileSync('js/app/38-nego-form-logic.js', 'utf8');
const negoEngine = fs.readFileSync('js/app/37-negotiation.js', 'utf8');
const repair61 = fs.readFileSync('js/app/61-full-system-repair.js', 'utf8');
const firebaseConfig = fs.readFileSync('firebase.json', 'utf8');
const serviceWorker = fs.readFileSync('sokohai-sw.js', 'utf8');

console.log('--- CHAT AUTHORITY / MOBILE / SECURITY CONTRACT ---');
const checks = [];
function ok(name, condition) { assert(condition, name); checks.push(name); console.log('✅ ' + name); }

ok('skhChatOpen implementation moja tu', (core.match(/window\.skhChatOpen\s*=\s*async function/g) || []).length === 1);
ok('state machine ina IDLE/CONNECTING/READY/EMPTY/ERROR/RETRYING', ['IDLE','CONNECTING','READY','EMPTY','ERROR','RETRYING'].every((x) => core.includes(`${x}: '${x}'`)));
ok('conversation error haimezwi', /chatLog\('CHAT_CONVERSATION'[\s\S]{0,200}throw e/.test(core));
ok('message listener ina stale conversation guard', /activeCore\.convId !== convId \|\| activeCore\.openToken !== openToken/.test(core));
ok('conversation listener ina stale conversation guard', /core\.convId !== convId \|\| core\.openToken !== openToken/.test(core));
ok('unread update ni atomic increment', /metaPatch\['unread\.' \+ partnerUid\][\s\S]{0,120}skh\.increment\(1\)/.test(core));
ok('negotiation pair-wide listeners zimeondolewa', !/skh\.where\('buyerId',[\s\S]{0,160}skh\.where\('sellerId'/.test(core.slice(core.indexOf('function negoFallbackQuery'), core.indexOf('// [ORDER FIX]'))));

for (const width of [320, 360, 375, 390, 412]) {
  ok(`mobile ${width}px iko ndani ya breakpoint iliyofunikwa`, /@media \(max-width: 420px\)/.test(css) && width <= 420);
}
ok('message/card long text hutumia overflow-wrap:anywhere', /#chatMessages \.chat-bubble[\s\S]{0,180}overflow-wrap: anywhere/.test(css));
ok('commerce cards hazina effective fixed min-width', /#chatMessages \.ch-card[\s\S]{0,260}min-width: 0 !important/.test(css));
ok('negotiation actions zina-wrap', /\.nf-foot, \.nf-actions \{ display: flex; flex-wrap: wrap/.test(negoCss));
ok('320px negotiation buttons zinaweza kuwa row moja kamili', /@media \(max-width: 330px\)[\s\S]{0,180}flex-basis: 100%/.test(negoCss));
ok('Chat ina negotiation host moja authoritative', (chatHtml.match(/id="chatNegotiationHost"/g) || []).length === 1);
ok('negotiation shell inaingia Chat host, si document.body', /host\.innerHTML = shellHtml/.test(negoForm) && !/document\.body\.appendChild\(host\.firstChild\)/.test(negoForm));
ok('Product schema haina delivery/pickup fields', !/id: 'productDelivery'/.test(negoLogic) && !/p\.deliveryLocation\s*=/.test(negoLogic) && !/p\.preferredDate\s*=/.test(negoLogic));
ok('commerce type na entity ni explicit kabla ya render', /if \(!opts\.entity \|\| !opts\.entity\.id\)/.test(negoForm) && !/lastNegotiationCard\(/.test(negoForm));
ok('submit ina VALIDATING/PREPARING/SUBMITTING/SUCCESS/ERROR', ['VALIDATING','PREPARING_CONVERSATION','SUBMITTING','SUCCESS','ERROR'].every((x) => negoForm.includes(`'${x}'`)));
ok('Accept/Reject/Counter buttons zinapeleka clicked button kwa feedback', /skhNegoCommand\([\s\S]{0,180},this\)/.test(negoEngine));
ok('command lifecycle ina loading/success/error UI', /actionState\('loading'/.test(core) && /actionState\('success'/.test(core) && /actionState\('error'/.test(core));
ok('late repair layer haifungi tena skhNegoFormOpen', !/window\.skhNegoFormOpen\s*=\s*function/.test(repair61));
ok('stale duplicate app haipo tena ndani ya fonts/', !fs.existsSync('fonts/js') && !fs.existsSync('fonts/css') && !fs.existsSync('fonts/html'));
ok('legacy Product delivery labels hazipo kwenye deploy tree', !negoLogic.includes("id: 'productDelivery'") && !negoLogic.includes('Mahali pa kupeleka (hiari)'));
ok('service worker inafuta cache za build ya zamani', serviceWorker.includes('sokohai-negotiation-host-v3-20260922') && /caches\.delete/.test(serviceWorker));
ok('Firebase haitunzi HTML na app modules za zamani', firebaseConfig.includes('no-store, max-age=0') && firebaseConfig.includes('js/app/**'));

ok('message create rule inahitaji sender awe participant', /allow create: if signedIn\(\)[\s\S]{0,700}participants\.hasAny\(\[request\.auth\.uid\]\)/.test(rules.slice(rules.indexOf('match /conversations/{convId}/messages'))));
ok('legacy chats read imefungwa kwa sender/receiver', /match \/chats\/\{id\}[\s\S]{0,300}senderUid == request\.auth\.uid[\s\S]{0,120}receiverUid == request\.auth\.uid/.test(rules));
ok('legacy chats haina update/delete ya client', /match \/chats\/\{id\}[\s\S]{0,500}allow update, delete: if false/.test(rules));
ok('script 93 inabaki baada ya core na ni inbox authority', scripts.indexOf('34-chat-core.js') < scripts.indexOf('93-chat-inbox-repair.js'));

console.log(`ALL ${checks.length} CHAT CONTRACT CHECKS PASSED`);
