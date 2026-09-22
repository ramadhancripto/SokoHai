import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const inbox = fs.readFileSync(path.join(root, 'js/app/93-chat-inbox-repair.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/34-chat-inbox-identity.css'), 'utf8');
const head = fs.readFileSync(path.join(root, 'html/00-head.html'), 'utf8');
let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log('PASS', name); }
  else { fail++; console.error('FAIL', name); }
}

check('authoritative inbox maps real conversation goHead', /goHead:\s*c\.goHead\s*\|\|\s*null/.test(inbox));
check('order group classification is data-derived', /it\.goHead\s*&&\s*\(it\.goHead\.targetQty\s*\|\|\s*it\.goHead\.status\)/.test(inbox));
check('person rows have semantic identity class', inbox.includes('ch-person-row'));
check('business rows have restrained stronger identity hook', inbox.includes('ch-business-row'));
check('normal groups have semantic identity class', inbox.includes('ch-group-row ch-tint-group'));
check('order groups have semantic identity class', inbox.includes('ch-order-group-row ch-tint-group-order'));
check('group label rendered', inbox.includes("'GROUP'"));
check('order group label rendered', inbox.includes("'ORDER GROUP'"));
check('order progress uses actual total and target', /total\s*\+\s*'\/'\s*\+\s*target/.test(inbox));
check('real profile avatar helper remains in use', inbox.includes('window.skhUserAvatar(it.photo || null, it.name, 48)'));
check('group navigation remains existing group destination', inbox.includes("window.__skhInboxOpenRow93(\\'g:"));
check('personal navigation remains existing user destination', inbox.includes("window.__skhInboxOpenRow93(\\'' + jsEsc(it.otherUid"));
check('required identity filter set exists', ['people', 'groups', 'order_groups', 'unread', 'archive'].every(k => inbox.includes("['" + k + "'")));
check('existing commerce and role filters are preserved', ['buyers', 'sellers', 'transport', 'agents'].every(k => inbox.includes("['" + k + "'")));
check('group member count remains visible from real record', inbox.includes("(it.memberCount ? ' · ' + esc(it.memberCount) : '')"));
check('all view groups real rows into people groups and order groups', /var people = recent\.filter/.test(inbox) && /var groups = recent\.filter/.test(inbox) && /var orders = recent\.filter/.test(inbox));
check('old inline-styled group avatar removed from authority', !inbox.includes('<div class="ch-cc-avatar"><span style="display:inline-flex;width:48px'));
check('final identity stylesheet is loaded after marketplace stylesheet', head.indexOf('34-chat-inbox-identity.css') > head.indexOf('33-white-marketplace.css'));
check('white row remains dominant for every type', /ch-contact\.ch-tint-group[\s\S]*background:\s*#fff\s*!important/.test(css));
check('personal identity is soft green and circular', css.includes('--ch-home-green-soft: #e9f7f1') && /ch-identity-avatar\.is-person[\s\S]*border-radius:\s*50%/.test(css));
check('group identity uses requested distant blue', css.includes('--ch-home-blue-soft: #eaf3fa') && css.includes('--ch-home-blue: #39779b'));
check('order identity uses restrained cream gold', css.includes('--ch-home-gold-soft: #fff7df') && css.includes('--ch-home-gold-border: #ead8a3'));
check('order progress is semantically green', /ch-order-progress[\s\S]*color:\s*#217a57/.test(css));
check('long identity names are ellipsized', /ch-name-block > span:first-child[\s\S]*text-overflow:\s*ellipsis/.test(css));
check('red is not introduced by Chat Home identity stylesheet', !/#(?:f00|ff0000|dc2626|ef4444|b91c1c)/i.test(css));

console.log(`\nChat Home identity contract: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
