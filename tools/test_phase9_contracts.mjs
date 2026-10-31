#!/usr/bin/env node
/* [PHASE 9] Source contracts for the Phase 9 fixes (no network).
 *  B-16 the browser no longer tells another user that money arrived
 *  B-17 upload call sites store the link (.url), not the whole result object
 *  B-18 seller/admin archive carries the author signature
 *  D-xx the 11 removed Discover files are not loaded by the app */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (info ? ' :: ' + info : '')); } };

console.log('[B-16 money notices come from the server]');
const hub = rd('js/app/17-hub.js');
ok('wallet payment no longer writes "wallet.escrowFunded" from the browser', !/event:\s*'wallet\.escrowFunded'/.test(hub));
const ppr = rd('js/17-pesapal-return.js');
ok('PesaPal return no longer tells the seller "Malipo ... Yamepokelewa"', !/title:\s*' Malipo ya SokoPay Yamepokelewa!'/.test(ppr));
const idx = rd('functions/index.js');
ok('server notifies seller after wallet pay', /notifyLinkEscrowFunded\(db, linkId, result\.sellerId/.test(idx));
ok('server notifies seller after verified PesaPal link payment', /notifyLinkEscrowFunded\(db, le\.id, le\.sellerId/.test(idx));
ok('server notice id uses a client-forbidden prefix (escrow_)', /doc\('escrow_link_' \+ safeKey\(linkId\)\)/.test(idx));
const rules = rd('firestore.rules');
ok('rules refuse money-claim notices to other users', /!moneyClaimNotif\(request\.resource\.data\)/.test(rules));

console.log('[B-17 uploads store the URL]');
ok('shipping receipt stores receiptUp.url', /const receiptUrl = receiptUp && receiptUp\.url;/.test(rd('js/app/03-dashboard.js')));
ok('rating photo stores ratingUp.url', /uploadedPhotoUrl = \(ratingUp && ratingUp\.url\) \|\| ""/.test(rd('js/app/08-app-state.js')));
// every caller must read .url / .data / secure_url from the result, never use the object as a string
const files = ['js', 'js/app'].flatMap(d => fs.readdirSync(path.join(ROOT, d)).filter(f => f.endsWith('.js')).map(f => d + '/' + f)).filter(f => f !== 'js/11-uploads.js');
const raw = [];
for (const f of files) {
  const src = rd(f);
  const re = /(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*=\s*await\s+window\.skhUploadFromFile\(/g; let m;
  while ((m = re.exec(src))) {
    const v = m[1]; const after = src.slice(m.index, m.index + 900);
    if (!new RegExp('\\b' + v + '\\s*(&&\\s*\\(?\\s*' + v + ')?\\s*(\\?\\.|\\.)\\s*(url|data|secure_url)|typeof ' + v + " === 'string'|" + v + '\\s*&&\\s*' + v + '\\.(url|data)').test(after)) raw.push(f + ':' + v);
  }
}
ok('no caller treats the upload result object as a link', raw.length === 0, raw.join(', '));

console.log('[B-18 signed archive]');
ok('deleteAd archive carries skhAdminStamp()', /archivedAt: new Date\(\)\.toISOString\(\), updatedAt: new Date\(\)\.toISOString\(\),\s*\n\s*\/\/[^\n]*\n\s*\.\.\.window\.skhAdminStamp\(\)/.test(rd('js/app/09-feed-announcements.js')));

console.log('[Discover files not loaded]');
const shell = rd('index.html') + rd('html/21-scripts.html');
for (const n of ['42-discovery-feed', '68-chat-discover', '75-discover-engine', '76-discover-foundation', '88-discover-complete', '91-discover-fixes', '21-discovery-maoni', '30-discover-engine'])
  ok('not referenced by the app shell: ' + n, !shell.includes(n));
console.log(`\nPHASE 9 CONTRACTS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
