#!/usr/bin/env node
/**
 * SOKOHAI — Navigation/chat authority invariant check (2026-09-22)
 * 34-chat-core ndiyo direct-chat authority; repair layers haziruhusiwi
 * ku-wrap skhChatOpen tena. Navigation wrappers zisizo za direct chat
 * bado lazima zihifadhi chain flags.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail = '') {
    if (cond) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}

console.log('--- CHAT/NAV AUTHORITY INVARIANTS ---');
for (const f of ['js/app/79-one-ui-at-a-time.js','js/app/81-absolute-one-ui-live.js','js/app/91-discover-fixes.js']) {
    const src = read(f);
    const hasHelper = src.includes('function __skhCopyChainFlags');
    const uses = (src.match(/__skhCopyChainFlags\(/g) || []).length;
    check(`${f}: navigation chain flags preserved`, hasHelper && uses >= 2);
}

const core = read('js/app/34-chat-core.js');
check('34: direct chat implementation exists exactly once', (core.match(/window\.skhChatOpen\s*=\s*async function/g) || []).length === 1);
check('34: lifecycle states are authoritative', /CHAT_STATES[\s\S]{0,300}CONNECTING[\s\S]{0,300}READY[\s\S]{0,300}EMPTY[\s\S]{0,300}ERROR/.test(core));
check('34: conversation failure is re-thrown (not fake success)', /chatLog\('CHAT_CONVERSATION'[\s\S]{0,180}throw e/.test(core));

for (const f of ['js/app/78-chat-fix-blink.js','js/app/81-absolute-one-ui-live.js','js/app/90-chat-fixes.js','js/app/92-chat-auth-fix.js']) {
    const src = read(f);
    check(`${f}: haibadilishi direct skhChatOpen`, !/window\.skhChatOpen\s*=/.test(src));
}
const f90 = read('js/app/90-chat-fixes.js');
check('90: hakuna composer polling/setInterval', !/setInterval/.test(f90));
const f92 = read('js/app/92-chat-auth-fix.js');
check('92: hakuna auth polling/listener ya pili', !/setInterval|onAuthStateChanged\s*\(/.test(f92));
check('92: haibadilishi requireAuth', !/skh\.requireAuth\s*=/.test(f92));

const f93 = read('js/app/93-chat-inbox-repair.js');
check('93: hakuna setInterval/re-assert clobber', !/setInterval/.test(f93));
check('93: direct chat delegated to core', /Authoritative direct chat delegated to 34-chat-core/.test(f93));
check('93: timeout hufungua retry badala ya loading-lock', /loading93 = false; \/\/ Retry/.test(f93));

const f79 = read('js/app/79-one-ui-at-a-time.js');
check('79: defer kwa 81 (chat/inbox/group)', (f79.match(/__skh81Live\(\)\) return/g) || []).length >= 4);
const f81 = read('js/app/81-absolute-one-ui-live.js');
check('81: closeModals hurithi flags', /patchCloseModalsAbsolute[\s\S]{0,3000}__skhCopyChainFlags\(origCloseModals, wrapped\)/.test(f81));

console.log('==================================================');
console.log(`CHAT/NAV AUTHORITY: ${pass} zimepita, ${fail} zimeshindwa`);
process.exit(fail ? 1 : 0);
