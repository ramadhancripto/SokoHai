#!/usr/bin/env node
/* [R14 2026-11-13] Static contract: auction admin is server-authoritative, the Live room merge
 * keeps both feature sets, campaign setup validates + previews, no leftover conflict markers. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0; const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + n); };
const adm = rd('functions/auction-admin.js'), idx = rd('functions/index.js'), ui = rd('js/app/98-admin-control-center.js'), live = rd('js/app/120-live-commerce-ui.js'), css = rd('css/65-live-design.css'), form = rd('js/app/08-app-state.js'), cm = rd('functions/commerce-modes.js');
ok('admin auction callables exported', ['adminAuctionsList', 'adminAuctionDetail', 'adminAuctionAction'].every(n => idx.includes('exports.' + n + ' = auctionAdmin.' + n)));
ok('every admin auction callable checks the role on the server', (adm.match(/needAdmin\(req\);/g) || []).length === 3 && /isAdmin\(req\)/.test(adm));
ok('actions need a written reason and are audited', /requireReason\(d\.reason, 5\)/.test(adm) && /writeAudit\(req, 'auction_' \+ action/.test(adm));
ok('payment can not be marked by hand', !/mark_paid|winnerPaid': true|winnerPaid = true/.test(adm) && /const ACTIONS = \['finalize', 'second_chance', 'extend_payment'\];/.test(adm));
ok('admin cancel writes admin_audit_log', /writeAudit\(req, 'auction_cancel'/.test(cm));
ok('admin UI uses only server callables (no direct writes)', /run\('adminAuctionsList'/.test(ui) && /run\('adminAuctionAction'/.test(ui) && !/setDoc|updateDoc|addDoc/.test(ui.slice(ui.indexOf('VIEWS.auctions'), ui.indexOf('window.skhAdminCCTab = async'))));
ok('Live room keeps local + Auction Live features', ['lvLiveErr', 'auctionHasBids', 'lvClockStart', 'stopSession', 'skhAuctionCancel', 'showConn', 'lvxEmoji', 'lvBidChips', 'lv7-endsoon', 'Wazabuni', 'lvh-pausedtag'].every(k => live.includes(k)));
ok('no merge-conflict markers in live/functions files', !/^(<{7}|={7}|>{7})( |$)/m.test(live + idx + cm));
ok('host media bar is above the frame (was under the header on phones)', /\.lv7-hostmedia \{ position: absolute; top: 108px;/.test(css));
ok('emoji row no longer covers the room bottom block', /\.lv7-stage:has\(\.lv7-chat:not\(\[hidden\]\)\) \.lv7-frame \{ bottom: 100px; \}/.test(css));
ok('campaign setup validates and asks for confirmation', /THIBITISHA MNADA/.test(form) && /THIBITISHA BEI KUSHUKA/.test(form) && /minPrice > 0 && minPrice < price/.test(form));
console.log(`\nR14 CONTRACT: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
