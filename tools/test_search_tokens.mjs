#!/usr/bin/env node
/* [SEARCH 2026-11-14] Unit tests for shared/search-tokens.js (no emulator). */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../shared/search-tokens.js');
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  PASS ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'assert'); };
t('words, synonyms and prefixes are stored', () => {
  const k = T.tokensFor({ title: 'Samsung Simu A54', subCategory: 'Smartphones' });
  ['samsung', 'simu', 'a54', 'phone', 'sam', 'sams', 'smartphones'].forEach(w => ok(k.includes(w), w));
});
t('accents and punctuation are folded', () => { const k = T.tokensFor({ title: 'Café-Latte (1kg)' }); ok(k.includes('cafe') && k.includes('latte') && k.includes('1kg'), k.join()); });
t('stop words are not stored', () => { const k = T.tokensFor({ title: 'Mchele wa Kyela na demo' }); ok(!k.includes('wa') && !k.includes('na') && !k.includes('demo'), k.join()); });
t('a document never stores more than MAX_TOKENS', () => { const k = T.tokensFor({ title: Array.from({ length: 300 }, (_, i) => 'neno' + i).join(' ') }); ok(k.length <= T.MAX_TOKENS, k.length); });
t('query tokens: words first, then synonyms, max 10', () => { const q = T.queryTokens('friji samsung simu tv viatu nguo'); ok(q.length <= 10 && q[0] === 'friji' && q.includes('samsung'), q.join()); });
t('matches: every word must match (word, prefix or synonym)', () => {
  const d = { title: 'Samsung Simu A54', searchTokens: T.tokensFor({ title: 'Samsung Simu A54' }) };
  ok(T.matches(d, 'phone samsung'), 'synonym'); ok(T.matches(d, 'sams'), 'prefix'); ok(!T.matches(d, 'samsung sofa'), 'all words required');
});
t('matches without stored tokens falls back to the text', () => ok(T.matches({ title: 'Sofa ya Mninga' }, 'mninga')));
t('sameTokens detects no-op writes', () => { const a = T.tokensFor({ title: 'Kitu' }); ok(T.sameTokens(a, a.slice()) && !T.sameTokens(a, a.concat('x'))); });
console.log(`SEARCH TOKENS: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
