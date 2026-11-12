#!/usr/bin/env node
/* [2026-11-06] Agent/driver token check (14-map-onboarding verifyLogisticsToken):
 * ride tokens are stored hashed (pickupTokenHash), so the browser must verify through
 * the deliveryTokenVerify callable; the plaintext query is only a demo fallback. */
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../js/app/14-map-onboarding.js', import.meta.url), 'utf8');
const fn = src.slice(src.indexOf('window.verifyLogisticsToken = async function'), src.indexOf('window.setupDriverRealtimeQuery'));
const fx = fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
let passed = 0, failed = 0;
const t = (n, ok) => { if (ok) { passed++; console.log('PASS ' + n); } else { failed++; console.log('FAIL ' + n); } };
t('server stores only a hash of the pickup token', /pickupTokenHash:\s*custodyHash\(pk\)/.test(fx));
t('verify calls deliveryTokenVerify first', fn.indexOf('skhCustodyServerTokenVerify') !== -1
  && fn.indexOf('skhCustodyServerTokenVerify') < fn.indexOf('"ride_requests"), skh.where("pickupToken"'));
t('both pickup and handover kinds are tried', /\['pickup', 'handover'\]/.test(fn));
t('plaintext query is gated by skhCustodyFallbackAllowed()', /skhCustodyFallbackAllowed\(\)\) \{\s*let qNormal/.test(fn));
t('ride fields are escaped before innerHTML', /skhEscape\(rd\.cargoName/.test(fn) && /skhEscape\(rd\.fromLocation/.test(fn));
console.log('\nTRANSPORT TOKEN VERIFY: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
