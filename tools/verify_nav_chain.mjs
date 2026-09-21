#!/usr/bin/env node
/**
 * SOKOHAI — Navigation chain invariant check (static, 2026-09-21)
 * Huhakikisha itifaki ya chain-preserving wrappers:
 *  1. Kila faili ya wrapper ina __skhCopyChainFlags na inaitumia.
 *  2. 93 haina tena re-assert/clobber intervals.
 *  3. 79 ina-defer kwa 81 (single source of truth).
 *  4. Hakuna wrapper inayoweka function bila kurithi flags.
 * Usage: node tools/verify_nav_chain.mjs
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

console.log('--- NAV CHAIN INVARIANTS ---');
const wrappers = [
    'js/app/79-one-ui-at-a-time.js',
    'js/app/81-absolute-one-ui-live.js',
    'js/app/90-chat-fixes.js',
    'js/app/92-chat-auth-fix.js',
    'js/app/91-discover-fixes.js',
];
for (const f of wrappers) {
    const src = read(f);
    const hasHelper = src.includes('function __skhCopyChainFlags');
    const uses = (src.match(/__skhCopyChainFlags\(/g) || []).length;
    check(`${f}: helper + ${uses} matumizi`, hasHelper && uses >= 2, uses < 2 ? 'haitumiki vya kutosha' : '');
}

const f93 = read('js/app/93-chat-inbox-repair.js');
check('93: hakuna setInterval', !/setInterval/.test(f93));
check('93: hakuna ensureOurs93/ensureChatOurs93 hai', !/ensureOurs93\(\)|ensureChatOurs93\(\)/.test(f93.replace(/\[STABILIZE[\s\S]{0,400}?(clobber|chain-preserving)/g, '')));
check('93: wireSearch hu-itwa kwenye open', /skhInbox93\(\) \{[\s\S]{0,400}wireSearch\(\)/.test(f93));

const f79 = read('js/app/79-one-ui-at-a-time.js');
check('79: defer kwa 81 (chat/inbox/group)', (f79.match(/__skh81Live\(\)\) return/g) || []).length >= 4);

const f81 = read('js/app/81-absolute-one-ui-live.js');
check('81: closeModals hurithi flags', /patchCloseModalsAbsolute[\s\S]{0,3000}__skhCopyChainFlags\(origCloseModals, wrapped\)/.test(f81));

console.log('==================================================');
console.log(`NAV CHAIN: ${pass} zimepita, ${fail} zimeshindwa`);
process.exit(fail ? 1 : 0);
