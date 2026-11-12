# SOKOHAI FULL LIVE COMMERCE — AUDIT (Hatua 1) · 2026-11-10

**Branch:** `feature/live-commerce-studio` · **Mbinu:** read-only audit + previews; hakuna app code iliyobadilishwa, hakuna commit/deploy.
**Stat:** ⬛ HAKIPO · 🟨 IPO SEHEMU / inahitaji kuboreshwa · 🟩 IPO (tumika tena).

## A. SHARED FOUNDATION

### A1. Discovery — 🟨 (60%)
| # | Kipengele | Hali | Ushahidi |
|---|-----------|------|----------|
| 1 | Live Now | 🟩 | Hub tab LIVE SASA (`120:156`) + home slider "Live sasa" |
| 2 | Upcoming | 🟩 | Hub YANAYOKUJA + reminders (`liveRemind`) |
| 3 | Featured Live | ⬛ | Hakuna featured flag/UI |
| 4 | Recommended | ⬛ | Hakuna recommendation |
| 5 | Category filters | ⬛ | Hakuna filter/search ya live |
| 6 | Search Live | ⬛ | — |
| 7 | Event cards | 🟩 | `cardHtml` + V2 preview |
| 8 | Status indicators | 🟨 | `scheduled/live/ended/removed` zipo; **Starting Soon/Paused/Cancelled hakuna** |
| 9–12 | Counts, thumb+price, seller, Join | 🟩 | `viewerCount`, product panel, hostName, `liveJoin` |

### A2. Shared layout — 🟨 (75%)
Room shell (`renderRoomShell 120:254`): header, LIVE badge, viewers, host, stage, pinned product, overlay feed, rail (Penda/Shiriki/Bidhaa/Zaidi), chat form, side tabs (Maoni/Bidhaa/Zabuni), CTA panel kwa mode. **Mapengo:** gallery kamili (picha 1 + "Fungua"→details 🟨), specs/condition/stock 🟨 (sehemu kwenye panels), Save Live ⬛, reactions panel 🟨 (likes zipo, reactions za comment hakuna), status Paused ⬛.

### A3. Comments Engine — 🟨 (55%)
🟩: stream realtime (limit 60), composer+send, list, avatar/identity, seller-name, timestamps, rate-limit 2s, idempotency (clientId), seller hide (`remove_comment`), mute, admin remove, report, retry-failed (restore text).
⬛: **replies/threading, reactions za comment, edit/delete own, seller pin, block (live-scope), pagination ("Pakia zaidi"), new-indicator/resume marker, buyer badge.**

### A4. Participation — 🟨 (60%)
🟩: join/leave + txn counts, likes, share, seller replies (kama comments), notifications, empty/error/loading states.
⬛/🟨: **participant list UI** ⬛ (viewers readable na host pekee — rules tayari), **online-vs-joined** ⬛ (hakuna heartbeat; `lastSeenAt` inaandikwa join tu), **presence cleanup** ⬛ (hakuna pagehide/heartbeat/sweep — count zinaweza kupanda uongo), save/follow event ⬛ (`skhLiveFollow` = follow SELLER, sio event), connection-state UI ⬛, profile quick view 🟨.

### A5. Seller Studio — 🟨 (55%)
🟩: create form (aina/bidhaa zako/kichwa/maelezo/scheduled/video-link), product picker (checkbox ≤20), start/end + confirm, edit products mid-live (`liveSetProducts`+UI), pin product, comments mgmt (Ondoa/Zuia), `liveModerate`.
⬛/🟨: **preview kabla ya start** ⬛, **dashboard ya host** 🟨 (controls zimetawanyika), **pin announcement** ⬛, **pause/resume** ⬛ (hakuna status/rules), **performance summary/report** ⬛, image upload mpya ⬛ (picha za bidhaa zilizopo zinatosha — nje ya scope), auction/price/group setup forms 🟨 (taz B1/C1/D1).

## B. LIVE MNADA — 🟩 (85%)
- **Engine (server):** `auctionPlaceBid` (txn + clientBidId + minNext + anti-snipe 2min/≤15 + validateBid + outbid/seller notify), `auctionFinalize` (mtu yeyote anaomba, server inaamua), `closeAuction` idempotent, 24h payment window, second-chance ×3, sweep 15min, `modeEligibility` (winner-only checkout + deadline), bids readable signed-in, `auction_participation` owner-only. **Usijenge engine mpya.**
- **Buyer view:** current/min-next/starting/leader/count/history(15)/countdown/CTA states (WEKA/UNAONGOZA/LIPA SASA/IMEFUNGWA), anti-snipe toast, winner pay (`skhLiveWinner`), share/follow. **Mapengo:** quick-bid buttons 🟨 (confirm modal ipo, quick amounts — thibitisha), reserve price ⬛, buy-now ⬛ (inapingana na mnada safi — uamuzi wa mmiliki), min buyer eligibility ⬛, pause/cancel policy ⬛, payment status tracking 🟨 (winnerHasPaid ipo server; UI ya seller — thibitisha), delivery next steps 🟩 (orders flow).

## C. LIVE PRICE DROP — 🟩 (85%)
- **Engine (server):** stepped schedule (`intervalMs` dft 60s, `dropAmount`, floor `minPrice`, start/end — `pricing-core.modeUnitPrice`), queue `priceDropSubmit` (min≤price≤current, stock, maxPerBuyer, dup-safe), rank, `priceDropSettle` (opportunities kwa THEIR price + 3h + cascade), sweep, checkout `priceDropOffer` + eligibility + qty limits, watchers notify (`sweepPriceDrops`). **Usijenge engine mpya.**
- **Buyer view:** original/current/discount/next-drop/timer/stock/rank/offer CTA/NUNUA SASA/board. **Mapengo:** quantity selector UI 🟨 (thibitisha kwenye submit modal), price history ⬛, sold-out state 🟨 (stock 0 inaonyeshwa; state wazi — boresha), cancelled (`stopped` ipo server; UI 🟨), join/follow offer 🟩 (watches), seller setup form 🟨 (C1 fields zote zinaungwa na modeData — UI ya seller form inahitaji ukaguzi).

## D. LIVE GROUP BUY — 🟨 (70%)
- **Engine:** `groupBuyJoin` (txn, dup-safe, target→success+notify), group price kwa MEMBERS (`modeUnitPrice`), non-member = base. **Mapengo (server):** max participants ⬛, min/max qty per buyer ⬛ (modeQuantityLimit ni price-drop tu), failure/expiry sweep+notify ⬛ (`validateGroupJoin` inahesabu status lakini hakuna closure), stock reservation ⬛, payment workflow 🟨 (checkout ya kawaida kwa group price — ipo; deadline wazi — thibitisha), refund/cancel 🟩 (orders flow).
- **Buyer view:** normal/group/savings/joined/target/progress/timer/join/qty?/rules/status 🟩 (room panel + 07 panel). **Mapengo:** participant list 🟨, activity feed ⬛ (event feed ya pamoja), payment status 🟨, **session kind `group_buy`** ⬛ (backend KINDS + badge + grouping — kazi ya pamoja na A1/A2).

## E. NOTIFICATIONS — 🟨 (65%)
🟩 (11 types): live_started, live_reminder, live_removed, auction_bid/outbid/won/ended/payment_expired/second_chance/winner_changed, group_buy_success, price_drop (+price_drop_offer/expired/ended/campaign_end). Prefs storage `notificationPreferences/{uid}` + code (28-buyer-engagement) 🟨.
⬛: joined-your-live, new comment, seller replied, mentioned (@mentions hazipo), offer ending soon, group progress update, group failed/expired, live ended, payment reminder (generic), order confirmed (nje ya live — orders flow). Prefs UI — thibitisha.

## F. ADMIN & MODERATION — 🟨 (45%)
🟩 (backend): `live_reports` (admin-read), `adminLiveRemove`, `liveModerate`, suspend checks, `admin_audit_log`.
⬛ (UI): view-all-live, search/filter, participants view, reports review queue, hide/suspend actions UI, disable-live UI, suspicious bidding/participation review, complaints inbox, activity-log viewer, moderation history viewer. (98-admin-control-center haina section ya live.)

## G. ANALYTICS — 🟨 (40%)
🟩 (server records): viewerCount, peakViewers, commentCount, likeCount, startedAt/endedAt (duration), sellerFollowers (followers wapya kwa live — hesabu 🟨), product views (07 — 🟨 thibitisha).
⬛: reactions count (feature mpya), join conversion, **orders/units/revenue per live** (oda hazina `liveSessionId` — ndiyo gap kubwa; bila attribution usionyeshe revenue — spec inakubali), winning price 🟩 (winnerBid), drop performance 🟨 (board+offers), completion rate 🟩 (joined/target).

## H. ARCHITECTURE (muhtasari; mchoro kwenye Component Map)
- **Collections (server-written):** live_sessions{viewers,comments,likes,reminders} · products/{pid}/bids · auction_participation · price_drop_entries/board · productWatches · notifications · live_reports · admin_audit_log · sellerFollowers · notificationPreferences.
- **Functions:** live* (13) · auctionPlaceBid/Finalize · groupBuyJoin · priceDropSubmit/MyRank/Settle · commerceModesSweep (15min) · checkout/pricing.
- **Rules:** client read-only kwa live/bids/boards; writes zote kupitia callables (firestore.rules:1978-2063).
- **Indexes:** `live_sessions(status+updatedAt)` **DEFINED lakini NOT DEPLOYED** ( blocker — uthibitisho: error ya production); comments/bids single-field (auto).
- **Realtime topology/viewer:** session doc + comments(60) + product + bids(15)/board ≈ listeners 4, ukomo mdogo — salama; pagination itaweka ukomo 25/page.
- **Gharama:** live ya kawaida (100 viewers/200 comments/1h) ≈ <$0.02; kubwa (10k/1k) ≈ ~$6 — timer local, hakuna video (brief inakataza IVS/Mux/RTMP/HLS).
- **Kanuni:** engines 3 zinabaki tofauti; foundation (UI/comments/presence/notify/reports) moja; server ndiyo ukweli wa bei/stock/timer/participation; video Phase 2.
