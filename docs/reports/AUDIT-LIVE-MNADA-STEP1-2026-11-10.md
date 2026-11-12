# AUDIT — Live Mnada (Hatua ya 1) · 2026-11-10
**Read-only.** Hakuna code iliyoandikwa/kubadilishwa/kufutwa. Hakuna prod write, migration, commit, au deploy.

## 1. Ramani ya flow ya sasa
```
Muuzaji: 113-sale-type-flow (chagua 'auction') → 05-forms (mode_auction_fields:
          starting bid=price, endTime/startTime, minIncrementPct/minIncrement)
                │  create product (saleMode=auction, modeData safi — rules hukataa
                │  maxBidder/totalBids/participants zilizojazwa)
                ▼
Live (optional): live_sessions (120-live-commerce-ui skhLiveOpen ← liveJoin/
          liveLeave/viewerCount) + pinnedProductId → mnada unaonyeshwa live
                ▼
Mnunuzi: 07-product placeBid → auctionPlaceBid(productId, amount, clientBidId)
          → transaction: validateBid → currentBid/maxBidder/totalBids +
          bids/{uid_clientBidId} + auction_participation/{uid__pid}
                │  outbid→notify(prev), bid→notify(seller)
                ▼
Kufunga: commerceModesSweep (15 min) AU auctionFinalize (mtu yeyote, mara moja
          muda ukiisha) → closeAuction: ended, winnerId/Bid/Name, paymentDeadline
          (+24h), notify mshindi + muuzaji
                ▼
Malipo: skhAuctionWinnerCheckout (guard: ended + winnerId==uid) →
          checkoutSeriousMode(winnerBid) → SERVER pricing-core.modeUnitPrice +
          modeEligibility: auction_live / auction_no_winner / not_auction_winner /
          auction_payment_expired
                ▼
Second chance: sweep → secondChance: winnerHasPaid? hapana → nextBidder
          (bids orderBy amount desc, max 3 rounds) → paymentDeadline mpya + notify
```

## 2. Files / functions / collections
| Jukumu | Mahali |
|---|---|
| Bid/join/finalize/sweep logic | `functions/commerce-modes.js:1-324` (auctionPlaceBid:99, auctionFinalize:260, sweep:316, closeAuction/secondChance/winnerHasPaid/nextBidder) |
| Bei + eligibility ya server | `functions/pricing-core.js` (modeUnitPrice:9, modeEligibility:45-56) |
| Live session/join/viewers | `functions/live-commerce.js` (liveJoin:164, liveLeave:181) |
| UI ya mnada (product page) | `js/app/07-product.js` (placeBid:712, winnerCheckout:471, compute:495) |
| UI ya mnada ndani ya live | `js/app/120-live-commerce-ui.js` (auctionRows:128, finalize-trigger:433) |
| Fomu ya muuzaji | `js/app/113-sale-type-flow.js:46` + `js/app/05-forms.js:240-275` |
| Rules (product/modeData lock) | `firestore.rules:150-200` (create safi; update: modeData locked baada ya bid ya 1) |
| Rules (bids read-only) | `firestore.rules:2060-2063` (read signedIn, write false) |
| Rules (participation) | `firestore.rules:2008-2010` (owner-only read) |
| Collections | `products` (+modeData), `products/{pid}/bids`, `auction_participation`, `live_sessions` (+viewers), `orders`, `notifications` |
| Tests | `tools/g1/verify_auction_adversarial.mjs` (7/7), Phase E report |

## 3. Kinachofanya kazi tayari (kime thibitishwa na tests)
- Transaction moja kwa bid: hakuna lost bids / double join; clientBidId idempotency (duplicate → first result).
- validateBid: si_mnada, mnada_umefungwa, mnada_haujaanza, tangazo_lako (seller+agent), ingiza_kiasi, waliokuzidi (+minRequired), tayari_unaongoza.
- minNextBid: max(absolute, pct) — default 5%, cap 50%.
- Anti-snipe: +2min ndani ya dirisha la 2min, max 15 extensions (mnada hauishi milele).
- Kufunga mara mbili: sweep 15min + finalize ya papo (server ndiye anaamua).
- dirisha la malipo 24h + second chance (3 rounds, distinct bidders, bei ya kila mshindi).
- Server-side checkout guard: mshindi pekee, baada ya ended, kabla ya deadline (pricing-core).
- Legacy client-side close IMEZIMWA (`07-product.js:618 return;` — dead code, haifanyi kazi).
- Notifications: outbid, bid mpya, won, ended, payment_expired, second_chance, winner_changed.
- Rules: seller hawezi kuandika matokeo; bids ni read-only kwa client; participation ni owner-only.

## 4. Mapungufu na bugs zilizothibitishwa (read-only — uthibitisho wa macho, si exploit)
1. **(LOW, pre-existing)** `winnerHasPaid` inasoma orders 50 za buyer bila index ya productId — na hesabu ya `items[]` inategemea shape ya order. Kama order ya mnada haibebi productId/items vizuri, second-chance inaweza ku-trigger kimakosa. Haijathibitishwa kama bug — inahitaji test ya order halisi ya mnada.
2. **(INFO)** Legacy lifecycle code (07-product.js:619-680) ni dead code baada ya `return` — haina madhara lakini inachanganya wasomaji. Pendekezo: kuifuta siku moja (si sasa).
3. **(INFO)** `minNextBid` inaonyeshwa na client kwa formula yake (07-product.js:513) — lakini server ndiye mwenye mamlaka, kwa hiyo tofauti yoyote inakataliwa kwa `waliokuzidi:minRequired`. Sio bug (defense in depth ipo).
4. **(INFO)** Sweep ni 15 min — matokeo yanaweza kuchelewa hadi 15 min kama hakuna mtu anayaita auctionFinalize. Live UI tayari inaita finalize (120:433) muda ukiisha — kwa hiyo live mnada hufunga papo.

## 5. Hatari za usalama na ushindani wa dau
- **Shill bidding (muuzaji kujizabunia kupitia akaunti nyingine):** `tangazo_lako` inazuia seller+agent UIDs tu. Akaunti tofauti kabisa haijazuilika kiufundi — hatari ya kibiashara, inapunguzwa na: malipo lazima (mshindi analipa kweli), second-chance, na 24h window. Pendekezo: velocity/abuse monitoring (nje ya scope ya sasa).
- **Sniping:** imepunguzwa na anti-snipe (+2min ×15). Baada ya extensions 15, snipe ya sekunde ya mwisho inawezekana — inakubalika (mnada lazima uishe).
- **Bid forgery:** haiwezekani — bids zinaandikwa na server; rules zinakataa client write; modeData imefungwa baada ya bid ya 1.
- **Winner checkout bypass:** haiwezekani — server (modeEligibility) hukataa si-mshindi; client guard ni UX tu.
- **Replay/double-submit:** clientBidId + transaction → duplicate inarudisha matokeo ya kwanza.
- **Race ya dau mbili kwa wakati mmoja:** transaction inahakikisha mmoja unashinda (validateBid ndani ya txn).
- **Fungua-funga mara mbili:** closeAuction idempotent (endNotified guard ndani ya txn).
- **Second-chance race:** compare-and-swap kwenye winnerId+paymentDeadline ndani ya txn.

## 6. Mapendekezo (bila kutekeleza — kusubiri idhini)
1. P1: Test ya E2E ya "mshindi analipa → winnerPaid=true" (kufunga pengo la #4.1) — emulator, order halisi ya mnada.
2. P2: Futa dead code ya client lifecycle (07-product.js:619-680) — usafi, hakuna tabia inayobadilika.
3. P3: Ongeza `auction_unsold` path ya UI (baada ya rounds 3 hakuna mnunuzi → muuzaji aone "Haujauzwa" + chaguo la ku-relist).
4. P3: Shill/abuse monitoring (velocity ya bids kwa UID/device) — baadaye, si kabla ya launch.
5. P4: Kupunguza sweep 15min → 5min kwa auction tu (gharama ndogo, matokeo haraka) — uamuzi wa mmiliki.

## 7. Group Buy / Price Drop
Tofauti kabisa: `validateGroupJoin`/`groupBuyJoin` na `price-drop-queue.js` hazigusiwi na audit hii; hakuna pendekezo linalozigusa.

**HATUA YA 1 IMEKAMILIKA. Nasimama hapa — subiri idhini kabla ya Hatua ya 2.**
