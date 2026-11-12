# SOKOHAI — LIVE COMMERCE AUDIT (2026-11-10)

**Branch:** `feature/live-commerce-studio` · **Hali:** AUDIT TU — hakuna code mpya ya live iliyoandikwa (kwa mujibu wa Sehemu ya 2 ya spec).
**Mipaka iliyoheshimiwa:** hakuna prod migration/deploy, hakuna commit/push/merge, modules zilizopo hazikuguswa.

---

## 1. JEDWALI LA AUDIT (kwa mujibu wa spec §2)

| # | Kipengele | KIPO ✅ | Kinahitaji kuboreshwa 🛠️ | HAKIPO ❌ |
|---|-----------|---------|---------------------------|-----------|
| 1 | **Live sessions (CRUD + lifecycle)** | ✅ `liveCreate/Start/End/Pin/SetProducts` — auth, seller ownership (`checkProducts`), status `scheduled→live→ended/removed` (`functions/live-commerce.js`) | — | — |
| 2 | **Viewer join/leave + count** | ✅ `liveJoin/liveLeave` — transaction, `viewerCount`/`peakViewers` halisi | — | — |
| 3 | **Comments/chat + moderation** | ✅ `liveComment` (rate-limit 2s, idempotent), `liveModerate` (mute/remove), `liveReport`, `adminLiveRemove` | — | — |
| 4 | **Likes + reminders + notifications** | ✅ `liveLike` (throttle 1.5s), `liveRemind`, followers + reminder notifications kwenye `liveStart` | — | — |
| 5 | **Seller Live create form (`lvxKind`, `lvxProducts`)** | ✅ Aina 4 (`live/live_commerce/auction/price_drop`), bidhaa za muuzaji tu, kichwa/maelezo/scheduled/video-link (`120-live-commerce-ui.js:203+`) | 🛠️ Ongeza `group_buy` kwenye `lvxKind`; ongeza camera preview + studio controls | — |
| 6 | **Buyer rooms (`skhLiveOpen`)** | ✅ Room: video area, comments, side-tabs (Maoni/Bidhaa/Zabuni), Like/Share/Ripoti/Fuata, winner announcement, Zabuni zangu | 🛠️ Native `<video>` playback badala ya embed pekee; server-time offset kwa timers | — |
| 7 | **Auction Engine** | ✅ `auctionPlaceBid` (transaction + `clientBidId` idempotency + `minNextBid` + anti-snipe 2min/≤15 + `validateBid`), `auctionFinalize`, `closeAuction`, 24h payment window, second-chance ×3, sweep 15min, outbid/seller notifications (`functions/commerce-modes.js`) | — | — |
| 8 | **Price Drop engine** | ✅ `priceDropSubmit` (validation dhidi ya `pricing-core.modeUnitPrice`, min≤price≤current, stock, maxPerBuyer, dup-safe), ranking, `priceDropMyRank`, `priceDropSettle` (opportunities kwa THEIR price + 3h deadline + cascade), sweep, `priceDropOffer` kwenye checkout (`functions/price-drop-queue.js`, `pricing-core.js`) | — | — |
| 9 | **Group Buy engine** | ✅ `groupBuyJoin` (transaction, dup-safe via `participants`, target→success + notify) (`functions/commerce-modes.js:157`) | 🛠️ Hakuna **failure/expiry sweep** (lengo lisipofikiwa hakuna notify/closure ya wazi); thibitisha checkout ya group-price kwa non-members imefungwa | — |
| 10 | **Group Buy kwenye Live** | ✅ Sehemu: bidhaa za `group_buy` zinaweza kuonyeshwa kwenye room (`120:418,482`) + Join (`skhGroupJoinConfirm`→`groupBuyJoin`) | 🛠️ Hakuna **session kind `group_buy`** (backend `KINDS` + `kindOf` + badge + home grouping) — ndiyo gap kubwa hapa | — |
| 11 | **Product details ndani ya Live** | ✅ `skhLiveOpenProduct` → `openProduct` (gallery, variants, maelezo, location, delivery — `39-product-showcase.js`) | — | — |
| 12 | **Home Live Activities** | ✅ Hub (LIVE SASA/YANAYOKUJA/DEALS), home cards (Ofa/Mnada — `123-home-layout.js`), stories rail, menu rows | 🛠️ Grouping ya **Group Buy** haipo; card ya group-buy live haipo | — |
| 13 | **Plus (+) → Anzisha Live** | ✅ Fomu inafikiwa kupitia Hub ("Anzisha Live") | 🛠️ **Hakuna entry kwenye Plus/Uza menu** (`html/15-main-menu.html`) — spec inataka Plus → Anzisha Live (ADDITIVE, bila kuondoa entries zilizopo) | — |
| 14 | **Camera Live (native broadcast)** | — | — | ❌ **HAKIPO.** Video ni `none` (product-live) au `embed` (YouTube/Vimeo allowlist) pekee. `getUserMedia` ipo kwa voice-note (audio), QR scan, na 1:1 calls (P2P) — hakuna ingest, SFU, wala HLS. Hii ndiyo kazi kubwa ya ujenzi. |
| 15 | **Viewer playback (native)** | — | — | ❌ Hakuna `<video>`/HLS player kwa live za SokoHai (embed ya YouTube/Vimeo pekee). |
| 16 | **Timers (server-derived)** | ✅ `endTime` za server zinaonyeshwa | 🛠️ Client hutumia `Date.now()` — ongeza server-time offset (drift ya simu inaweza kuonyesha muda usio sahihi) | — |
| 17 | **Notifications infra** | ✅ `notifications` collection + bell/badge (`82-home-header-actions.js`) + server notify kwa events zote (bid/outbid/win/offer/success/live) | — | — |
| 18 | **Auth/permissions/security** | ✅ Rules: live_sessions/bids/boards read-only kwa client, writes zote server (`firestore.rules:1978-2063`); seller ownership kwenye callables; suspend checks; audit log | — | — |
| 19 | **Tests (engines)** | ✅ Emulator tests: `test_commerce_modes.mjs`, `test_auction_pricedrop_emulator.mjs`, `test_pricedrop_queue_emulator.mjs`, e2e R13B/R13D (`tools/`) | 🛠️ Ongeza: live-session lifecycle, group-buy expiry, studio contract (permissions/preview/publish/reconnect), video E2E checklist | — |
| 20 | **1:1 WebRTC calls (rejea)** | ✅ `105-calls.js` — RTCPeerConnection halisi + signaling `/calls` (STUN pekee, TURN ni manual flag) | — (haitumiki kwa broadcast; P2P haifai kwa audience — spec §10 inakubali) | — |

**Hitimisho la audit:** Commerce engines zote 3 + live session backend + rooms UI **vipo na ni server-authoritative** (~80% ya spec). Kilichokosekana ni **native video path** (studio + ingest + playback) na **Group Buy kama live-kind ya kwanza**, pamoja na maboresho madogo (Plus entry, home grouping, server-time).

---

## 2. VIDEO ARCHITECTURE — TATHMINI NA PENDEKEZO (spec §10)

### Chaguzi zilizotathminiwa

| Njia | Latency | Audience kubwa | Gharama | Hukumu |
|------|---------|----------------|---------|--------|
| **A. P2P mesh (kama 105-calls)** | <300ms | ❌ Muuzaji angepandisha stream kwa kila mtazamaji — haiwezekani | "Bure" lakini haifanyi kazi | **KATAA** (spec §10 inakataza pia) |
| **B. SFU (LiveKit Cloud)** | <500ms | ✅ | ~$50/mo + $0.0005/min; ghali zaidi kwa viewer wengi ([3](https://json2video.com/video-api/)) | Mbadala mzuri kama latency ya chini ni lazima |
| **C. Managed ingest → LL-HLS (Mux / AWS IVS)** | 2–5s | ✅ CDN | Mux: ingest ~$1.875/hr + $0.06/viewer-hr; IVS: input ~$0.20/hr + $0.036–0.144/viewer-hr ([1](https://sellmycode.co/blogs/how-much-does-it-cost-to-build-an-app-like-whatnot/), [2](https://www.forasoft.com/blog/article/ios-video-streaming-app-development), [3](https://json2video.com/video-api/)) | **✅ PENDENDEZWA** |

### Pendekezo: **C — Managed ingest (Mux au AWS IVS) kupitia WHIP kutoka browser**

Sababu:
1. **Hakuna app mpya inayohitajika** — WHIP ingest inafanya kazi kutoka mobile browser (Chrome/Safari) moja kwa moja.
2. **ABR + CDN** — inastahimili mitandao ya TZ (3G/4G inayobadilika); LL-HLS 2–5s inakubalika kwa biashara.
3. **Latency haiathiri usahihi wa biashara** — zabuni/joins/oda zote ni server transactions; video ni presentation tu. Mnada hauhitaji video ya 300ms.
4. **Gharama ya chini kuanzia** — pay-as-you-go, free tiers (IVS: 5h input + 100h SD output mwaka wa kwanza).
5. **Scalability** — watazamaji 10 au 10,000 bila kubadilisha code ya muuzaji.
6. **Integration na Firebase** — callable mpya (`liveIngestGrant`) hutoa ingest credentials kwa host tu; playback URL huhifadhiwa kwenye session na server.

Kuhifadhiwa: modes zilizopo (`none` = product-live, `embed` = YouTube/Vimeo) zinabaki kama fallback — video ikikatika, **biashara inaendelea** (spec §3, §11).

### Makadirio ya gharama (kwa mwezi)

| Scenario | Mux | AWS IVS |
|----------|-----|---------|
| **Kidogo:** muuzaji 1 × 2h/siku, watazamaji ~50 (3,000 viewer-hrs) | ~**$293** (ingest $113 + delivery $180) | ~**$192** (input $12 + output ~$180) |
| **Kati:** wauzaji 10 × 2h/siku, watazamaji ~500 (30,000 viewer-hrs) | ~**$2,925** | ~**$1,920** |
| **Kubwa:** 90,000 viewer-hrs (kigezo cha industri) | ~**$4,320** [1](https://sellmycode.co/blogs/how-much-does-it-cost-to-build-an-app-like-whatnot/) | ~**$6,480** (real-time) [1](https://sellmycode.co/blogs/how-much-does-it-cost-to-build-an-app-like-whatnot/) |

> Viwango vya 2026; TZS ≈ USD × 2,600. Uchaguzi wa mwisho (Mux vs IVS) ni uamuzi wa mmiliki — akaunti ya provider + gharama zinahitaji idhini.

---

## 3. MGawanyiko: EXISTING / IMPROVED / NEW / THIRD-PARTY (spec §13)

- **EXISTING (usiguse logic):** auctionPlaceBid/Finalize/sweep/anti-snipe/second-chance · priceDropSubmit/Rank/Settle/sweep · groupBuyJoin · pricing-core · live session CRUD/join/comment/moderate/like/remind · rooms UI + bid board + winner flow · product details · notifications · checkout/escrow · rules.
- **IMPROVED:** `group_buy` session kind (backend KINDS + checkProducts + frontend kindOf/TYPE/badges) · Plus menu entry (additive) · home/hub grouping ya Group Buy · server-time offset · native playback ndani ya room iliyopo · tests za ziada.
- **NEW:** Seller Live Studio module (camera preview, front/back, mic/cam toggles, permissions UX, net status, WHIP publish, reconnect, end) · `liveIngestGrant/Revoke` callables · `video.kind='native'` + playback URL · reconnect/state-preservation logic.
- **THIRD-PARTY (mmiliki):** akaunti ya Mux au AWS IVS (+ billing) · deploy ya functions/indexes zilizopo (tayari blocker) · (baadaye, hiari) TURN kwa 1:1 calls — nje ya scope.

## 4. Mpango wa utekelezaji (baada ya idhini)

1. **P0 — Video path:** provider account (mmiliki) → `liveIngestGrant` + `video.kind='native'` → Studio UI → playback kwenye room → reconnect/fallback.
2. **P1 — Group Buy first-class:** kind backend+frontend, seller flow, home/hub grouping, expiry/failure sweep wazi.
3. **P2 — Polish:** Plus entry, server-time offset, product-details funnels, tests (emulator + studio contract + video E2E checklist), ripoti ya gharama halisi.

## 5. Vizuizi vilivyopo (hazihitaji code — zinahitaji mmiliki)

1. **Functions + Firestore indexes havija-deploy** (index ya `live_sessions` imethibitishwa kukosekana production) → `firebase deploy --only firestore:indexes,functions`.
2. **Akaunti ya streaming provider** (Mux/IVS) + idhini ya gharama.
