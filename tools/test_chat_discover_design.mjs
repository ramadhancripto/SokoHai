#!/usr/bin/env node
/* [R13-F 2026-11] Chat "Discover New Updates" + Hali viewer follow design refs 8 and 9,
 * reuse existing handlers/data only, and never invent numbers. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const idx = rd('index.html'), css = rd('css/67-chat-discover.css'), df = rd('js/app/106-chat-discovery-feed.js'), hx = rd('js/app/121-stories-ui.js');
let pass = 0, fail = 0; const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + n); };
ok('67 CSS linked after 66', idx.indexOf('css/67-chat-discover.css') > idx.indexOf('css/66-home-layout.css'));
ok('106 cards: post (photo + title + store + price) and overlay (live/video/sponsored)', /is-overlay' : 'is-post'/.test(df) && /skh-df-uc-price/.test(df));
ok('LIVE badge is red and the pill says Live preview / Gusa kujiunga', /skh-df-uc-live/.test(df) && /Live preview/.test(df) && /Gusa kujiunga/.test(df) && /\.skh-df-uc-live[\s\S]*var\(--cd-red\)/.test(css));
ok('card stats come from records (info.label / viewsOf), no invented counts', /if \(info\.live && info\.label\) stat = info\.label;/.test(df) && /viewsOf\(card\)/.test(df));
ok('Hali + live sessions share the Discover row (slot inside #skhDfTiles)', /'<span id="skhHxRail" class="hx-slot hx-inrow"><\/span>'/.test(df) && /window\.skhHxPaint = paintRail/.test(hx) && /window\.skhDfRepaint/.test(df));
ok('live card viewers = viewerCount from live_sessions', /compact\(l\.viewerCount\)/.test(hx));
ok('story card has progress bars and author row', /hx-cbars/.test(hx) && /hx-chead/.test(hx));
ok('viewer per ref 9: back, controls, React/Comment/Share, Tazama bidhaa, Chat na muuzaji', /Rudi kwenye Chat/.test(hx) && /hx-ctls/.test(hx) && /skhStoryPause/.test(hx) && /hx-react/.test(hx) && /Tazama bidhaa/.test(hx) && /Chat na muuzaji/.test(hx));
ok('no fake verified tick in the viewer', !/hx-vf/.test(hx));
ok('story share builds its own public link (skhShareProduct ignores args)', /skhProductPublicUrl\(s\.listing\.id\)/.test(hx) && !/skhShareProduct\(\{/.test(hx));
ok('post viewer: Penda uses skhToggleLike, Maoni/Chat use openChatWithUser, Shiriki public link', /window\.skhToggleLike\(\{ id: ci\.id/.test(df) && /openChatWithUser\(cc\.sellerId/.test(df) && /skhProductPublicUrl\(card\.id\)/.test(df));
ok('existing CTA handler kept (data-df-action)', /data-df-action/.test(df) && /actOn\(state\.viewerItem, actEl\)/.test(df));
console.log(`\nCHAT DISCOVER DESIGN: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
