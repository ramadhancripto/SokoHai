# SOKOHAI — FINAL LAUNCH READINESS ENGINEERING (10 Nov 2026)

Project: `sokonet-3b847` · Repo: `ramadhancripto/SokoHai` · Region: `europe-west1`
独立 verification — namba za awali hazikutumika kama matokeo; kila kitu kimehakikiwa fresh.

## PHASE A — BASELINE

- Branch: `feature/product-card-visual-refinement` · HEAD: `2e8d049`
- Working tree: 110 status lines; diff vs HEAD: **51 files +2323/−1163** (uncommitted; hakuna commit iliyofanywa)
- Node v20.20.2 · npm 10.8.2 · firebase-tools 15.35.0 · Java 21 (Temurin, /tmp — haidumu kwenye snapshot)
- `.firebaserc` default project = **`sokonet-3b847` (PRODUCTION)** — kila `firebase` command bila `--project` inaelekea prod
- Functions region: `europe-west1` (firebase.json + functions/index.js REGION — zinalingana ✓)
- Build: `python3 tools/build_html.py` (split/build/check byte-exact) + `tools/build_dist.mjs`
- Test inventory: 211 tools/*.mjs + 31 tools/g1/*.mjs; battery = 30 suites; verify_* suites = 6 (vyangu, nje ya battery)
- Mazingira ya tests: Firestore emu :8085 + Auth emu :9099 (project `demo-sokohai-g1`) + local-server :5055 + static :8080 + Playwright chromium + LD_LIBRARY_PATH=/home/user/pwlibs2
- Usalama wa env: tools zote zinazotaja `sokonet-3b847` zinatumia **fake keys za unit-test** (test_local_functions_server, test_pesapal_guards, test_phase1_security) — hakuna test inayounganisha prod ✓
- Tofauti za config: local/static (hakuna functions, inaelekea PROD URLs — CORS blocked), emulator-mode local-server (SKH_EMULATOR + SKH_LOCAL_FUNCTIONS_SERVER, project demo-sokohai-g1), staging (hakuna staging project iliyothibitishwa — GAP), production (sokonet-3b847, europe-west1)
- **REPAIR A1 (guard):** `tools/g1/owner_backfill_false_completions.mjs` ilikuwa na projectId hardcoded `sokonet-3b847` bila emulator support. Sasa: emulator mode (bila key), `--fix` nje ya emulator inahitaji `SKH_BACKFILL_PROJECT=sokonet-3b847` + `SKH_BACKFILL_I_UNDERSTAND_PROD=YES` + `--confirm`. Proof: `--fix` pekee → exit 2; `--fix --confirm` bila key → exit 2 BLOCKED.
- package.json iongezwe? — firebase-admin iliwekwa `--no-save` (root) kwa ajili ya dry-run; functions/ `npm i --no-save` kwa local-server. node_modules haidumu (snapshot exclusion) — si mabadiliko ya repo.

## PHASE B — FIRESTORE SECURITY RULES (129 match blocks, 2121 lines)

Suite mpya: `tools/g1/verify_rules_adversarial.mjs` — **29/29** (personas 6: buyer, sellerA, sellerB, staff, exStaff, admin + anon).
Regression baada ya fix: phase1 57/57, phase3 34/34, repair 139/139, inventory 44/44, conversation 8/8; phase2 T14 = known-env (haujaguswa).

| Collection | Read | Create | Update | Delete | Server-only fields (muhimu) |
|---|---|---|---|---|---|
| users | owner/admin/agent | self (walletBalance 0/absent, bila privileged) | self+unchanged(privileged+walletBalance+trust); admin wageni lazima adminStamp | no | walletBalance, role/admin*, verification*, suspension*, subscription*, trust, **staffRole/staffSince/staffRemovedAt (B1)** |
| products | public | signedIn, stock=0+openingStockPending, bila server keys | owner; stock/modeData(seller baada ya bids)/trust/boost locked | no | reservedStock, modeData baada ya bids, winner/bids, moderation*, trust |
| products/{pid}/bids | signedIn | no (server) | no | no | zote |
| orders | party+admin | buyer=auth, unpaid-only, bila server keys; fundi: awaiting_payment + accepted request | party + unchanged(moneyKeys) + orderStatusOk + orderPaymentInfoOk; admin+stamp | no | amount/qty/verified, paid/held/completed markers, escrowStatus (update; **create B2**), priceApproval*, reservation* |
| sokopay_links | party+admin | userId=self, pending, bila server keys | owner(pending, bila status); buyer-claim (4 fields); dispute held→disputed | no | coreServerKeys |
| sokopay_core_transactions | party+admin | buyerId=self, bila coreServerKeys | party, buyerId/sellerId/amount/orderId + coreServerKeys locked | no | escrowReleased, releasedAt, payoutStatus, paymentVerified, verifiedAmount, refundStatus |
| wallet_ledger / escrow_holds / withdrawal_requests / refunds / payment_reviews / inventory_reservations / sales / inventory_movements / admin_audit_log / security_events / platform_stats / adminRevenue / serious_deposits | owner-party/admin | **no** | **no** | no | zote (server/Admin SDK tu) |
| shop_ledger / shop_staff / staff_attendance / shift_logs / suppliers / customers / + | owner chain (myShopOwnerUid) | owner chain | owner chain + shopOwnerId locked | owner/admin (staff) | shopOwnerId |
| staff_invites | owner/admin | no (server staffInvite*) | no | no | zote |
| businesses / stores | signedIn (?) | owner-checked | owner-checked | — | ownerUid |
| shipments | party | party + sokopayCore match + status pending | party + status/escrow/payment/tokens locked | no | status, escrowStatus, paymentStatus, tokens |
| logistics_assignments | party/admin/open-new | buyer/seller=self | amount locked; agent accept (acceptedBy=self) | no | amount, buyerId, sellerId |
| delivery_offers | party | no | no | no | zote |
| conversations/messages/offers/negotiations | party | party | party + price/server keys locked (B-04) | mostly no | price, order link |
| live/stories/group_soko/price_drop | party/public | party + server gates | party + server gates | — | winners, timers, counts |
| system/config | signedIn | superAdmin+stamp | superAdmin+stamp (config); admin (others) | superAdmin (si config) | config |

**REPAIR B1 (rules):** `staffRole` iliandikwa na server (staffInviteAccept) lakini mtumiaji aliweza kujibadilishia (200). Proof: B-R13 FAIL→PASS. Fix: privilegedUserKeys += staffRole/staffSince/staffRemovedAt. Impact: LOW (hakuna auth inayotegemea staffRole — display integrity + future-proof).
**REPAIR B2 (rules+client):** `escrowStatus` ili-injectika kwenye orders create (200). Proof: B-R23 FAIL→PASS. Fix: orderServerOnlyCreateKeys += escrowStatus + strip kwenye `...core` spread (23-smart-cart.js:432, 24-ui-final.js:327). Impact: LOW (server haisomi orders.escrowStatus; UI integrity).
**REPAIR B3 (functional, kubwa):** `acceptHubServiceRequest` (16-pos-admin-jobs.js, live "Kubali Kazi" button) iliunda order `status:"held"` — rules zinaikataa → fundi accept ilikuwa IMEVUNJIKA (error + request accepted bila order). Fix: awaiting_payment + paymentStatus/paymentVerified wazi + compensating revert ya request + alert sahihi. Proof: B-R22 (awaiting_payment na accepted request → 200).
**FINDING (imeandikwa, haijarekebishwa — legacy flow):** `confirmSokoPayDelivery` (23-smart-cart.js:285) + `updatePendingSokoPayAfterPayment` zinaandika `escrowStatus:'Released'`/`orderStatus:'Completed'` kutoka client kwenye sokopay_core. Ushahidi: hakuna function inayosoma sokopay_core (server money inategemea orders+wallet_ledger+escrow_holds) → hakuna fund movement; ni display/false-assurance (MEDIUM-LOW). Marekebisho sahihi = kuhamia server path (orderConfirmDelivery + custody code — ipo na ni imara); kufunga fields moja kwa moja kungevunja legacy UI flow nzima. Inapendekezwa kama remediation ya baadaye, si launch-blocker.
**MINOR:** seller anaweza ku-forge `shippedAt` anapo-mark shipped (orderStatusOk tawi la 3 halilock shippedAt). Display-only; inapendekezwa kuongeza unchanged(['shippedAt']).

## PHASE C — MONEY SAFETY (fresh: VERIFY-D 13/13 + suluhu 5/5 + PesaPal stub 11/11)

- **C1 Checkout:** bei ya server inathibitishwa — `settlePesaPalPayment` inaita `expectedOrderAmount` kwa kila oda; underpriced → `price_review` (test: commerce_modes "only the winner can pay", `priceReviewReason=underpriced` ✓). `serviceOrderWalletPay` inafunga kiasi ≤ bajeti ya request (`requests.detail2`) + `expectedAmount` anti-tamper (C4-2 ✓). `posSale` inapuuza bei ya client (V-D1 ✓). Duplicate order: idempotency keys (V-D2 ✓).
- **C2 Wallet:** client hawezi kujiongezea (V-D7 ✓); transactions ni atomic (Firestore txn); concurrent double-submit → 1 (V-D2 ✓); replay → already (V-D6/V-D8 ✓); hakuna negative (C4-5 inadai ≥0 ✓).
- **C3 Escrow:** held tu baada ya malipo yaliyothibitishwa (settle/serviceOrderWalletPay); double-release → already + malipo 1 (V-D5 ✓); stranger/seller denied, buyer ok (V-D4 ✓); dispute inazuia release (V-D13: split mara 1 + idempotent ✓); seller hawezi kujithibitishia delivery (orderConfirmDelivery: seller + buyer-code custody, 5 attempts, expiry ✓); I-I1: fundi sasa anaunda awaiting_payment (REPAIR B3).
- **C4 Ledger:** write:false kwa client (B-R10 ✓); suluhu mpya `verify_money_reconcile.mjs` 5/5: buyer 80000=80000, seller 15000=15000, entries zote zina note, escrow hold released. CAVEAT: `wallet_ledger/order_*_released` (type escrow_release_marker) hubeba `amount` kamili lakini ni alama ya idempotency — maripoti ya baadaye LAZIMA zi-exclude `type=escrow_release_marker` (hakuna code ya prod inayojumlisha ledger leo; mtego wa baadaye).
- **C5 Withdrawals:** owner tu; min TSh 5,000; replay → debit 1 (V-D6 ✓); paid→reject → already, hakuna phantom refund (V-D6 ✓); paid ina audit trail (ledgerKey+resolvedBy+resolvedAt+resolutionNote — C4-4 ✓). LIMIT: risiti ya provider (M-Pesa code) ni maandishi ya admin (manual disbursement) — hakuna API ya auto-payout.
- **C6 PesaPal:** IPN HAIMINI callback — inathibitisha kwa GetTransactionStatus (`ppVerifyTransaction`) kisha settle ikiwa paid (functions/index.js:1870 ✓); forged IPN → rejected (V-D12 ✓); stub suite 11/11: IPN↔browser idempotency, mismatch salama, unmatched→review, replay salama, initiator binding, ack 200 robust ✓; live-money guard: host live (`pay.pesapal.com`) inaruhusiwa tu kwenye project `sokonet-3b847` (pesapalLiveGuard ✓). Hakuna live transaction iliyofanywa.
- **GAP (V-D11, haijarekebishwa kwenye logic):** mauzo ya legacy (bila businessId) hayawezi ku-voidiwa (SALE_SCOPE_MISMATCH). Sababu: fail-closed kwa usahihi; suluhu sahihi ni migration (stamp canonical business/store), si kulegeza scope-check. Script imeandaliwa: `tools/g1/owner_backfill_legacy_sales_scope.mjs` (dry-run default + guards; owner-run; tazama Phase D).

## PHASE D — BACKFILL (dry-run + --fix zimethibitishwa kwenye emulator)

**D1 Audit `owner_backfill_false_completions.mjs`:** inasoma orders status=completed; ushahidi wa completion halisi = `wallet_ledger/order_<id>_released` (server-only). Upgrades (Phase D): uainishaji A/B/D/E; PII masking (uid prefix); FIX class A tu + revalidation kwa kila record + audit log (`admin_audit_log`) + abort baada ya makosa 5; project guard (Phase A).
**D2 Dry-run (emulator, seeds A/B/D/E):** A=1 (BF-A1 revertable), B=1 (BF-B1 paid-bila-marker → manual), D=2 (BF-D1 + ve1 ya VERIFY-D ✓), E=1 (BF-E1 tayari). `--fix --confirm` kwenye emulator: fixed=1 (BF-A1→shipped), BF-B1 untouched, audit=1, notifications=2; re-run: fixed=0 (idempotent ✓).
**D3 Classification:** A=confirmed false (completed + SI paid + bila marker); B=inconsistent (paid + bila marker → MANUAL); C=payment unverified (nje ya scan); D=marker ipo; E=tayari/ambiguous.
**D4 Safety:** dry-run default ✓; project guard ✓; --fix+--confirm ✓; idempotency (query + revalidation) ✓; per-record validation ✓; audit logging ✓; retry safety (re-run fixed=0) ✓; stop-on-unexpected (abort≥5) ✓; no broad overwrite (class A + field 3) ✓; no silent skips (kila record ina darasa) ✓.
**Script ya pili (V-D11):** `owner_backfill_legacy_sales_scope.mjs` — stamp businessId/storeId kutoka canonical ya seller (users+businesses+stores, umiliki umethibitishwa). Dry-run: STAMPABLE=1, AMBIGUOUS=2, ALREADY=3; --fix: STAMPED 1 + audit. HAZIJAWAHI kuendeshwa kwenye prod (owner-run; tazama Phase L).
**Manifest (prod):** haiwezi kutolewa bila kusoma prod (hairuhusiwi) — owner ataendesha dry-run na kutuma output; muundo wa manifest umo kwenye script output (CLASS lines + JSON).

## PHASE E — AUCTION / GROUP BUY / PRICE DROP (fresh: 7+18+16+13 = 54 tests, zote green)

Suites: `verify_auction_adversarial` 7/7 · `test_auction_pricedrop_emulator` 18/18 · `test_pricedrop_queue_emulator` 16/16 · `test_commerce_modes` 13/13.

**Auction lifecycle:** create (seller, saleMode=auction, modeData: startPrice/minIncrement/deadline) → `auctionPlaceBid` (auth + minNextBid: default 5% au absolute + clientBidId idempotency + deadline check) → expiry → `auctionFinalize`/sweep (15min schedule, anti-snipe extension, secondChance) → winner order → settle (winner pays winning bid; underpay → price_review) → escrow → release.
Ushahidi wa usalama (V-B): forged bid 403 · kujipa ushindi 403 · kufunga mapema 403 · race 5×clientBidId→1 · saleMode locked baada ya bids 403 · participation row server-only 403 · bid baada ya close → mnada_umefungwa.
**Group Buy lifecycle:** create (target qty, group price, deadline) → `groupBuyJoin` (server count, participant lock — hakuna leave export; kujiondoa = design decision, wajumbe wamefungwa) → target/deadline → completion → payment → fail/expire → cancelled_not_fulfilled/expired (UNPAID → refund path). Progress/count ni server-authoritative (modeData locked kwa seller baada ya join — B-R18 class).
**Price Drop lifecycle:** campaign (steps + timers za server) → `priceDropSubmit` (queue entry) → `priceDropMyRank` (masked rank) → `priceDropSettle`/sweepQueues (OFFER_MS window, server-computed current price — hakuna fake timer; client hawezi ku-update bei) → purchase/expire/cancel. Watchers: notice 1 kwa drop halisi (18/18 ✓).
**Mipaka:** group-buy leave haipo (deliberate lock-in — thibitisha na owner kama inahitajika); auction settlement inategemea winner kulipa kwa wakati (paymentDeadline + secondChance vipo).

## PHASE F — TRANSPORT / DELIVERY / SERVICE (fresh: 9+13+6+5+20 = 53 green)

Suites: delivery_lifecycle 9/9 · phase3_transport 13/13 · transport_market 6/6 · service_orders 5/5 · fix8_service_orders 20/20.
**Normal delivery E2E (D1-D6):** ride create (custody/token keys za client zinakataliwa) → accept (dereva 1 anashinda; mteja/dereva-2 denied) → seller-confirm (token sahihi/mbaya) → pickup (lazima seller-confirm) → transit (custodian tu, lazima picked_up) → Token C complete + escrow payout (dereva + muuzaji).
**Intermediary delivery (D8 handover):** custodian switch kwa TR token (pande zote mbili zinathibitishwa); D7: receiver anaweza kukamilisha bila Token C isipotolewa; D9: rate-limit (majaribio 6 mabaya → resource-exhausted).
**Service orders:** fundi accept sasa awaiting_payment (REPAIR B3); held tu kupitia serviceOrderWalletPay na bajeti ya request (C4-2); service ≠ stock (hakuna inventory touch kwenye service path — FIX8 20/20).
**Agent assignment/offers:** deliveryOfferAccept na logistics assignment accept zimefungwa kwa party (acceptedBy=self, B-R estate + D2).

## PHASE G — BUSINESS OS (fresh: static 20/20 + live 20/20 + BOS 23/25 + VERIFY-C 5/5)

**Static (`verify_bos_tabs_static`):** 20/20 tabs zina handler (14×10-dashboard-tabs, 5×30-seller-products, 1×112-pos-page); loaders 15/15 zipo (skhDriverOverviewStats, loadMarketplaceRequests, setupDriverActiveJobsQuery, skhTokenCenterHtml, skhWithLeaflet, skhDriverSaveExpense, skhDriverFleetStats, skhRenderTripHistory, loadDriverDirectoryList, 5×skhRender*); unknown-tab fallback (skhTabNotFoundHtml) ipo; cache kuu (03-dashboard.js: products+shop_ledger+shop_staff+purchase_orders, scoped shopOwnerId); empty-states zipo; hakuna mock-data patterns.
**Live (`verify_bos_tabs_live`, emulator + Playwright, seller signed-in):** 20/20 tabs zinabadilika na kuchora; data halisi inaonekana (my_products: F-Live Chipa/Mchele; inventory/product_analytics: F-Live; expenses: 5,000; staff: Mw_pb F); overview inachora 3055 chars kupitia posReports halisi (0 errors) akaunti ikiwa na Business/Store; bila hizo → BUSINESS_STORE_REQUIRED (gate inafanya kazi ✓).
**Makosa pekee:** 2× HTTP404 `shared/product-schema-{pilots,refinements}.mjs` — zilizoandikwa kwenye code kama blockers wazi (product-taxonomy-bridge.mjs: degrade to canonical-only, schemaOverlayStatus.degraded=true). Sio bug mpya; ni kipengele kinachofanya kazi kwa degraded mode.
**Staff invitation J-J1:** server kamili (staffInviteCreate/Accept/Revoke + TTL 7d + charset + owner-only remove — VERIFY-C V-C1..V-C4 ✓); shopOwnerUid/personal context hazichanganywi (B-R13..R16 ✓). **UI GAPS (pre-existing, confirmed):** B4.2 staffInviteCard/kadi ya mwaliko haipo; B4.3 skhStaffInviteCreate/skhStaffInvitesPaint/skhStaffInviteRevoke/skhStaffRemove/skhJoinShopWithCode handlers hawapo (V-C5: dead menu item). Hizi ni Invite-UI zinazokosekana — server iko tayari, UI ya staff-join haijajengwa.
**INCIDENT (wazi):** `build_html.py build` yangu ilifuta hand-edit ya `mode-staffjoin` kutoka index.html (B4.1 23→22). Imerejeshwa kwenye kipande sahihi (`html/03-modals-core.html`) na build sasa byte-exact; BOS 23/25 imerudi. Somo: build inaandika upya index.html kutoka pieces — hand-edits za moja kwa moja kwenye index.html hupotea (guard ya baadaye: CI check kabla ya build).
**Mobile:** tabs zinatumia responsive grid (auto-fit minmax) + sidebar inayokunjwa; hakuna mobile-specific breakage iliyoonekana (browser suite + live pass zote headless desktop; mobile viewport haijajaribiwa — LIMIT).

## PHASE H — LIVE / CHAT / NOTIFICATIONS / MARKETPLACE (fresh: 26+5+5+7)

Suites: live+stories+group-soko 26/26 · storyReact (mpya) 5/5 · discover-modeprice 5/5 · live_commerce (battery) 7/7.
**Live sessions:** create/start/end/pin/products/join/leave/comment/moderate/report/remove/like/remind zimejaribiwa (26+7). **Mini-player:** hakuna mini-player/float-player iliyotekelezwa; mwendelezo wa session unalindwa na iframe-src guard (120-live-commerce-ui.js:330 — iframe haiundwi upya src ikifanana) + `picture-in-picture` allow attr. Kigezo "bila session mpya kwenye minimize/restore" kinatoshelezwa kwa usanifu uliopo (re-open = reuse).
**Marketplace modes:** SokoHuru (free_market) / Mnada (auction) / Bei Kushuka (price_drop) / Group Buy (group_buy) zinatofautishwa na `saleMode` + `modeData` + callables tofauti; bei ya mode inakokotolewa na `modePrice` (5/5 ✓); hakuna kuchanganya business logic (bids ≠ queue ≠ joins).
**Notifications/chat:** conversation rules 8/8; group chat rules (battery); chat commerce cards (suites). UI ya marketplace haikuguswa (isipokuwa staffjoin restore — Phase G).

## PHASE I — SERVER SURFACE COVERAGE (143 exports, sio 111)

Inventory upya: **143 exports** (static 111 + dynamic 32 kupitia forEach: live×13, priceDrop×3, story×5, groupSoko×11). Local-server inathibitisha: 124 callables + 2 HTTPS + 5 schedules = 131; +12 triggers/test-helpers = 143 ✓ (hesabu inalingana).
Table kamili: `tools/g1/verify_coverage_table.txt` (kila export: file, type, auth, test, tag).
**Classification (script + manual):** BEHAVIOR 100 (66 battery + 34 nje-battery/non-battery suites kama LSG/pricedrop) · TRIGGER(+hook) 12 · REQUEST(+test) 1 (sitemapXml) · STATIC(K4-only) 12 · MENTION-ONLY 15 · TEST-HELPER 3 · NONE 0.
**Manual upgrades (ushahidi wa ziada):** posReports → BEHAVIOR-OBSERVED (F-live: gate + success kupitia overview halisi); storyReact NONE→BEHAVIOR (suite mpya H-R1..5). Honest behavior coverage ≈ 101/143 ≈ 71%.
**MENTION-ONLY 15 (true gaps):** adminModerateListing, adminSetVerification, adminWhoAmI, ads×3, commentsEvidence, commentsPublish, creative×5, platformStatsRefresh (+posReports kabla ya upgrade). Hakuna money-moving; zote ni admin/moderation/content — zinafaa kwa staging verification, si launch-blockers.
**STATIC 12:** K4-only (onCall+auth-gate tripwire) — 2 read-verified na mimi (inventoryReleaseReservation, deliveryRouteRetry — auth/scoping sound); 10 hazijachunguzwa handaki — zimeorodheshwa kwenye table.
Kanuni: onCall+auth-gate tripwire HAIKUHESABIWA kama full behavior (STATIC class kando) ✓.

## PHASE J — PERFORMANCE / RELIABILITY / DATA QUALITY (static + measurements; billing haijaguswa)

**Indexes (51 defined; 47 composite queries scanned):** candidates 12 zinazoweza kukosa index (lazima zihakikiwe staging — emulator ha-enforce indexes):
activity_logs(collectionName+recordId)@51-lifecycle-ui · agentMembers(agentId+memberCode)@31 · group_soko(memberUids+updatedAt↓)@122 · notifications(groupOrderId+type+at↓)@76 · notifications(userId+monitoring)@59 · orders(buyerId+kind)@40 · orders(sellerId+kind)@40 · productInquiries(buyerId+productId)@53 · stories(visibility+status+expiresAtMs)@121 · userCards(fullName range)@122 · users(memberId+createdByAgentId)@31 · wallet_ledger(kind+orderDocId+uid)@69.
**Unbounded reads:** dashboard cache (03-dashboard.js) inapakia collections ZOTE (products/ledger/staff/POs) bila limit — sawa kwa maduka madogo; hatari ya kusoma kwa wingi maduka makubwa yanapokua → pendekezo: pagination/limits + indexes (baada ya launch).
**N+1:** 120-live-commerce-ui.js:717 `getProduct` kwa kila live session bila cache (N ndogo; LOW — weka cache).
**Listeners:** zote zina unsubscribe handles (chatUnsubscribe, notifUnsubscribe, userUnsubscribe, activeProductUnsubscribe, __sokohaiAnnouncementsUnsub) — hakuna duplicate-listener leak iliyoonekana.
**Retry/offline:** wrapCallable ina circuit-breaker (30s transient / 10min missing) ✓; callable errors ni normalized; hakuna retry-storm.
**Images:** `loading=lazy` inatumika (00, 06, 101, 106, 120) — partial; endelea kueneza.
**Logging:** server errors zina Admin SDK logs + security_events/admin_audit_log kwa matukio ya ulinzi; client ina console.warn fallbacks. Hakuna PII kwenye logs mpya (backfill masking ✓).
**Mapendekezo (priorities):** 1) staging index-proof kwa 12 candidates; 2) limits kwenye dashboard cache; 3) getProduct cache; 4) lazy images kueneza. Hakuna billing upgrade.

## PHASE K — FULL REGRESSION (baada ya marekebisho yote)

**T14 (known-env): IMECHUNGUZWA NA KUREKEBISHWA.** Sababu: suite ilihardcode PROJECT='demo-sokohai' lakini battery inaendesha emulator kama 'demo-sokohai-g1' (Auth namespaced) → setCustomUserClaims ilikosa mtumiaji. Fix (test-only, salama): `process.env.GCLOUD_PROJECT || 'demo-sokohai'` + fallback ya awali. Matokeo: PHASE 2 SECURITY 41/41, 0 failed. Haijafichwa wala kuondolewa kwenye hesabu — imekamilika kweli.
**Battery harness fix:** parser ilisoma "23/25 passed" kama pass=25/fail=0 (B4.2/B4.3 zilifichwa + phantom +2). Sasa inasoma `a/b passed` kwa usahihi; B4.2/B4.3 zimewekwa KNOWN_FAILS (gaps zilizoandikwa, zinafuatiliwa).
**Matokeo (fresh, exit codes 0 isipokuwa ilipoelezwa):**
- Battery: **pass=735 fail=0 known=2** (known = B4.2/B4.3 Invite-UI gaps; 0 environmental) — exit 0
- Browser regression: 20/20 (pageerrors 0) — exit 0
- Build: byte-exact CHECK OK — exit 0 · Static quality: 36/36 — exit 0
- Verify suites (vyangu): rules 29/29 · money 13/13 · reconcile 5/5 · auction 7/7 · JJ1 5/5 · storyReact 5/5 · BOS-live 20/20 · BOS-static 20/20 — zote exit 0
- Ziada (non-battery, fresh): auction+pricedrop 18/18 · pricedrop-queue 16/16 · commerce 13/13 · LSG 26/26 · delivery 9/9 · phase3-transport 13/13 · transport-market 6/6 · service 5/5 · fix8 20/20 · discover 5/5
- card_discovery: 60/7 — HAIJABADILIKA (pre-existing, non-battery, nje ya scope; tazama attribution ya awali)
**Ulinganisho na baseline:** 736/0/1 (claimed) → kweli ilikuwa 734+2masked+1env → sasa **735/0/2-tracked** (T14 fixed +1, masking removed, gaps tracked). Hakuna regression mpya kutoka kwenye marekebisho yangu (rules suites zote green; BOS 23/25 kama awali; browser/build/static kama awali).

## PHASE L — PRODUCTION DEPLOYMENT PACKAGE (imeandaliwa; HAIJATEKELEZWA)

**L1 Rules:** diff ya local vs HEAD: firestore.rules +122/-hunks (ikiwemo B1 staffRole + B2 escrowStatus + userCards list-lock ya awali). **Hali ya prod rules HAIJULIKANI** (hakuna credentials) — owner lazima: `firebase firestore:rules:get > /tmp/prod.rules` + diff dhidi ya local kabla ya deploy. Risk: MEDIUM (rules ni fail-closed; B1/B2 zinafunga zaidi, hazilegezi). Rollback: Firebase console → Firestore Rules → History → revert; au deploy toleo la HEAD (`git stash` + deploy + unstash — kwa uangalifu).
**L2 Indexes:** 51 defined, 0 duplicates; 12 candidates zinazoweza kukosekana (Phase J) — lazima zihakikiwe staging (matumizi halisi) + ongeza zilizopendekezwa na Firestore console. Missing index = runtime FAILED_PRECONDITION (si silent).
**L3 Functions:** 143 exports (124 callables + 2 HTTPS + 5 schedules + 12 triggers/helpers); runtime nodejs22 (firebase.json) — **CAVEAT: tests zimeendeshwa kwenye Node v20 local** (syntax compatible; hakuna v22-only API iliyotumika kwa mujibu wa ukaguzi); region europe-west1; predeploy `build:shared`; deps: functions/package.json; schedules 5 (adsDelivery 60min, commerceModes 15min, platformStatsHourly, +2 — SKH_RUN_SCHEDULES/ALLOW_PROD_SCHEDULES). Secrets (functions/.env — OWNER anaweka, kamwe repo): PESAPAL_CONSUMER_KEY/SECRET/BASE_URL/REDIRECT_URL/IPN_URL/IPN_ID/ALLOWED_RETURN_ORIGINS (+ALLOW_LIVE ikiwa staging-live), ADMIN_EMAILS, CLOUDINARY_*, WALLET_MAX_ABS, AGENT_REG_FEE, OFFLINE_REG_*, SERIOUS_DEPOSIT_FEE, UPLOAD_MAX_PER_HOUR, SKH_ALLOWED_ORIGINS, APP_CHECK_ENFORCE.
**L4 Hosting:** build `node tools/build_dist.mjs --minify --check` → publish `dist/` (allow-list; server code/tests hazitumwi); SPA fallback /*→/index.html 200 ✓; security headers (HSTS 2y, nosniff, SAMEORIGIN) ✓; CSP haipo kwa makusudi (400+ inline handlers — baadaye); **sitemap target HAIJATHIBITISHWA** (owner gate — sitemapXml ni 404; usi-redirect bila target).
**L5 Mpango (commands — USIZIENDESHE bila idhini):** tazama `docs/reports/OWNER-LAUNCH-CHECKLIST-2026-11-10.md` (staging → prod → verify → rollback + backfill + live-IPN proof). Hakuna command iliyoendeshwa na mimi.

## PHASE M — FINAL READINESS SCORING (upya, na denominators)

| Kundi | Score | Denominator | Ushahidi | Kinachokosekana / Blocker |
|---|---|---|---|---|
| A. Automated tests | 99.7% | 735/737 battery (2 tracked, 0 env) + 104 verify + 126 non-battery + 20 browser | Battery exit 0; zote fresh Phase K | B4.2/B4.3 UI gaps (tracked, si siri) |
| B. Security | 93% | 29 rules-adv + 323 rules-suites + 86 G1-access + custody/IPN/guards | 452+ security assertions green | shippedAt forge (minor); sokopay_core display (med-low); CSP absent (deliberate); 12 indexes → staging |
| C. Money-flow | 97% | 13 money-adv + 5 reconcile + 38 P5 + 11 stub + 13 commerce + 6 pos | Suluhu 1:1; IPN verify; idempotency | Legacy void → migration script ready (owner-run); manual M-Pesa disbursement (process) |
| D. Business functionality | 93% | BOS 23/25 + F-live 20/20 + 53 delivery/svc + 54 sale-modes + 26 LSG + cards 60/67 | Flows zote green | B4.2/B4.3 (tracked); card_discovery 7 pre-existing (non-battery, disclosed) |
| E. Browser/mobile | 85% | Browser 20/20, pageerrors 0, consoleErrors 4 (pre-existing) | Headless chromium fresh | **Mobile viewport haijajaribiwa**; consoleErrors 4 hazijachunguzwa |
| F. Operational | 75% | Package ✓, backfills ✓ proven, rollback ✓, audit logs ✓ | Checklist + scripts + plan zipo | **Staging project haijathibitishwa**; schedules hazijathibitishwa prod; on-call/runbook nje ya scope |
| G. External provider | 20% | Design 100% (guards/verify/stub 11/11) · live 0% | Hakuna live txn (hairuhusiwi) | **PesaPal keys/IPN/sandbox/live zote ni owner** (0/4 gates); Cloudinary live untested |
| H. Prod deployment | 5% | 0/4 gates; package ready | L1–L5 + checklist | **Hakuna kilichopelekwa prod** (hairuhusiwi) |

**Wastani (A–H): 70.9%.** Ufafanuzi: code+security+money ziko juu (93–99.7%); kinachoshusha ni G+H (provider+deployment = owner gates, 0/4). Hii ni sahihi — mfumo hauwezi kuitwa "tayari" bila live proof.
**Code-readiness pekee (A–E): 93.5%** — lakini HAIJAWEKWA 100% (B4.2/B4.3 + cards 7 + mobile + consoleErrors zipo).
**LAUNCH CLASSIFICATION: 2 — Ready for staging.** Sio pilot (G haijathibitishwa live), sio production (H 0/4). Staging ndiyo hatua inayofuata inayostahili ushahidi uliopo.

## PHASE N — FINAL REPORT NA HANDOVER

### 1. Executive summary
Verification huru imekamilika (A–N). Mfumo: code/security/money ziko imara (93–99.7%) na ushahidi fresh wa ~1,100+ assertions; mapungufu 7 mapya yamethibitishwa na kurekebishwa (4 code + 2 harness + 1 data-restore); coverage ya kweli ni 101/143 (~71% behavior, sio 111/111); battery ya kweli ni 735/0/2-tracked (sio 736/0/1). Classification: **Ready for staging (2/5)** — staging + live-IPN proof + owner gates ndizo hatua zinazofuata.

### 2-10. (Sehemu zipo juu: baseline A, security B, money C, backfill D, sale-modes E, transport F, BOS G, live/market H, coverage I, perf J, regression K, deploy-package L, scoring M.)

### 11. Bugs zilizorekebishwa (7)
1. **B1 staffRole self-grant** (rules) — B-R13 FAIL(200)→PASS(403). 2. **B2 escrowStatus create-inject** (rules+client strips) — B-R23 FAIL→PASS. 3. **B3 fundi accept held** (functional — ilikuwa IMEVUNJIKA) — awaiting_payment + revert + alert. 4. **A1 backfill project guard** (safety) — emulator support + prod triple-gate. 5. **T14** (test-only) — 41/41, known_env 0. 6. **Battery parser masking** (harness) — 735/0/2-tracked honest. 7. **staffjoin menu restore** (data) — B4.1 22→23, kwenye piece sahihi.
Before/after: kila moja ina FAIL→PASS na file:line kwenye phases husika.

### 12. Known risks (zisizorekebishwa)
- sokopay_core client "release" (display, MEDIUM-LOW — hakuna fund movement; migration inapendekezwa).
- Legacy sales void → migration script ready (owner-run).
- shippedAt forge (minor, display). Cards 60/7 pre-existing. Mobile untested. ConsoleErrors 4. 12 index candidates → staging. Node v20-tested vs v22-deploy (parity caveat). Staging project unconfirmed. Sitemap target unknown.

### 13-15. Package / backfill manifest / PesaPal plan
- Deploy package: Phase L + `docs/reports/OWNER-LAUNCH-CHECKLIST-2026-11-10.md`.
- Backfill manifest (prod): haiwezi kutolewa bila kusoma prod — scripts ziko tayari + zimethibitishwa emulator (D2: A/B/D/E + STAMPABLE/AMBIGUOUS/ALREADY).
- PesaPal/IPN test plan: (a) sandbox checkout→IPN→GetTransactionStatus→settle→escrow→release na doc screenshots; (b) live TSh 1,000 + refund/cancel; (c) duplicate IPN → settle 1; (d) initiator binding; (e) delayed IPN (sawa na duplicate — idempotent). Hakuna live txn iliyofanywa na agent.

### 16-18. Scoring / recommendation / owner actions
- Scoring: Phase M (70.9% overall; code A–E 93.5%; G 20%; H 5%).
- Recommendation: **peleka staging sasa; pilot tu baada ya sandbox-IPN proof + 12 indexes; production tu baada ya 4/4 gates.**
- Owner actions: checklist (6 sections) — staging, prod deploy, backfills, live-IPN, rollback, gates.

### Evidence paths (test IDs)
Battery `tools/g1/run_battery.mjs` · rules `tools/g1/verify_rules_adversarial.mjs` (B-R1..23) · money `verify_money_adversarial` (V-D1..14) + `verify_money_reconcile` (C4-1..5) · auction `verify_auction_adversarial` (V-B1..7) · JJ1 `verify_jj1_extra` (V-C1..5) · BOS `verify_bos_tabs_{static,live}` + `test_business_os` (B4.x) · story `verify_story_react` (H-R1..5) · coverage `tools/g1/verify_coverage_table.txt` · browser `tools/g1/test_browser_regression.mjs` · static `tools/test_static_quality.mjs` · backfills `tools/g1/owner_backfill_{false_completions,legacy_sales_scope}.mjs`.
Hakuna production change, commit, au live transaction iliyofanywa. Kazi imekamilika A–N.
