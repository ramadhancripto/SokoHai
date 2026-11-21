# Server final verification

All results below were produced on 2026-11-20 against the **final working tree** of `remediation/server-20261120`: base `d8cba09` plus uncommitted changes.

- Environment: Linux, Node 22, Firestore + Auth emulator (project `demo-sokohai`), Chromium (Playwright), Firebase JS SDK 10.8.1 served locally.
- Nothing ran against Firebase staging or production.
- Historical numbers (117 / 39 / 56 / 36 / 10) were **re-run**, not copied.

## 1. Results

| # | Suite | Command | Result |
|---|---|---|---|
| A | Unit / contract (`npm test`, run command by command so one failure does not hide the rest) | `scripts.test` split on `&&` | **117 / 117 commands passed** (second run, after fixes D-2/D-3) |
| B | Emulator suites of `test:security:all:emulator` | each `node tools/…` against the emulator, auth reset between suites, Firestore wiped first | **40 / 40 passed** (35 existing + G-1, G-1b, G-3, G-6, G-2) |
| B+ | Routing / transport suites run with B | `test_routing`, `test_routing_cancel_race_emulator`, `test_transport_handover_emulator`, `test_transport_token_verify` | **4 / 4 passed** |
| B++ | Other emulator suites matching `test_*emulator*` / `*security*` / `*rules*` but not in any package list | 7 rules/server suites + `national_safety`, `pickup_accept`, `staging_callable_adapter`, `report_comment_http` (needs a local server on port 5056; started for the run) | **11 / 11 passed** |
| C | Browser contracts (`tools/*browser*.mjs`) | `browser-all.sh` | **37 / 37 passed** (36 existing + G-4 `test_client_error_states_browser` 14/14) |
| D | Full E2E (`tools/e2e-emulator/run.sh`) | fresh emulator + local functions server | **56 / 56 PASS**, exit 0 |
| E | Navigation | `test_nav_system.cjs` | **56 / 56 passed**, 0 JS errors |
| E | Journeys, phone + desktop | 11 journeys × 2 viewports | **22 / 22**: service 10, transport 7, order 7, group buy 6, account recovery 9, PWA 8, push UI 5, live camera 6, auction admin 3, group chat 8, group business 13 |
| F | Owner card style / header cards / Firebase environment isolation | e2e-emulator | PASS / PASS / **10 / 10** |
| F | `build_html.py check` · `build_dist --minify --check` · taxonomy family variants | | OK (byte-exact) · OK · OK |
| X | Cross-system domain suites (`tools/g1/*`, not in package lists) | §3 | 16 run: **14 pass** (phase 7 after the contract update). `g1/test_transport_market` is now 5/6: C2 was resolved on 2026-11-20 (§4); C4 is pre-existing. `g1/test_business_os` 23/25 is pre-existing. |
| S | Static | `node --check` on every modified/new file; `require(functions/index.js)` | 0 syntax errors; 180 exports, 155 callables, 155 wrapped + labelled |

**Skipped / unavailable:** none of the suites listed above were skipped. The following were **not** run, with the reason:

| Not run | Reason |
|---|---|
| `firebase emulators:exec …` wrappers themselves | Same suites, run directly against the already-running emulator, one by one, so a failure is visible per suite. |
| Screenshot / probe scripts (`*_shots`, `audit_visual`, `s3`…`s7`) | Not assertions. |

## 2. Reconciling 39 versus 44 emulator suites

| Count | What it is |
|---|---|
| **39** (reported earlier as "39/39") | 35 commands in `test:security:all:emulator` at `d8cba09` + 4 routing/transport suites run alongside |
| **39** files at `d8cba09` matching `tools/test_*emulator*.mjs`, `*security*`, `*rules*` | a different set; the equal number is a coincidence. 13 of those files are not in any package list; 9 list entries do not match the glob (e.g. `test_commerce_modes`, `test_user_cards`). |
| **44** files matching the same glob on the final tree | 39 + 5 new suites (G-1, G-1b, G-2, G-3, G-6) |
| **44** suites run in B + B+ now | 40 list commands (35 + 5 new) + 4 routing/transport |
| **+11** | the glob-matched suites outside the package lists, run separately (B++) |

Every glob-matched emulator suite was run in this verification (44 + 11 − overlap = all 44 files, plus `test_routing`/`test_transport_token_verify`).

## 3. Cross-system domains (15)

| # | Domain | Evidence (this run) | Status |
|---|---|---|---|
| 1 | Marketplace & products | E2E 1–10, search index (emulator 14 + G-2 trigger), archive enforcement 13, category filter 9, product-remove rules, browser market/feed suites | verified locally |
| 2 | Business OS & stores | store ownership / robustness (npm), business OS browser suites, `g1/test_business_os` 23/25 (pre-existing staff-invite UI gap, §4) | verified, with a known UI gap |
| 3 | Checkout & orders | `test_order_wallet_pay` 8, order journey 7×2, `inventoryOrderCreated/Updated` (G-2), E2E checkout steps | verified locally |
| 4 | SokoPay wallet & escrow | G-3 (**8 parallel `orderWalletPay` = 1 debit**, `USER_MISSING` race), `g1/verify_money_adversarial` **13/13** (forged price/status/balance, replay, double-release, double-pay, unauthorised release), `g1/verify_money_reconcile` pass, dispute refund 7, withdrawal 13, `sokopayAutoRelease` no early release (G-2) | verified locally |
| 5 | PesaPal | G-3 mocks (no keys / 401 / 503 / network / 15 s timeout / 502 / one hold), G-2 IPN (**unpaid = no change; COMPLETED credited once after 2 IPNs**) and reconcile (**PesaPal down = left open; settled once**), `g1/test_phase7_server_lifecycle` 41/41, `g1/test_phase7_pesapal_stub` 11/11 | verified with mocks. **Real sandbox: staging.** |
| 6 | Auctions & price drop | auction/price-drop 18, price-drop queue 16, auction live impl 16, auction admin 11, `g1/verify_auction_adversarial` 7/7, `commerceModesSweep` (G-2) | verified locally |
| 7 | Live commerce & stories | live/stories/group soko 26, `g1/test_live_commerce` 7/7, G-1 (`livePing`, `liveSetProducts`, `liveSetVideo`, `storyReact`), live camera journey | verified locally |
| 8 | Group Soko, Group Buy & chat | group chat rules 90, group business rules 33, group buy lifecycle 12 + sweep (G-2), group chat / business journeys | verified locally |
| 9 | Services | service journey 10×2, `g1/test_service_orders` 5/5 | verified locally |
| 10 | Transport & delivery | routing 69, cancel race, handover, token verify, pickup rules/accept, national safety, `g1/test_delivery_lifecycle` 9/9, G-1 delivery callables (D-1 fixed), offer expiry sweep (G-2) | verified. `g1/test_transport_market` has 2 pre-existing stale assertions (§4). |
| 11 | Inventory & POS | inventory reservation 27, inventory rules 44, decimal quantity 10, POS unit suites (npm, incl. D-3), G-1b POS gates, reservation sweep (G-2), opening stock once (R27) | verified locally |
| 12 | Notifications | push emulator 9, `pushOnNotification` (G-2: off by default, prunes dead tokens), push UI journey | verified with stub. **Real FCM: staging.** |
| 13 | Accounts & permissions | phase 1/2/3 security 57/41/34, user cards 18 + G-2, admin & agent authority 9, identity verification 8, account recovery journey, env isolation 10 | verified locally |
| 14 | Search & taxonomy | search index 14, `adminSearchBackfill` lease + idempotency (G-2), taxonomy suites (npm) | verified locally. **Composite indexes: staging.** |
| 15 | Admin & super admin | G-6 matrix 13 (7 identities × 10 module gates), trust badges 35, pilot ops 13, auction admin 11, admin audit triggers (G-2) | verified locally |

**Financial and inventory integrity checks:**

| Check | Result | Evidence |
|---|---|---|
| No duplicate wallet debit | ✔ | G-3 parallel pay, `verify_money_adversarial` |
| No duplicate ledger entry | ✔ | `verify_money_reconcile`, IPN ×2 credited once, reconcile sweep ×2 settled once |
| No unintended escrow release | ✔ | `sokopayAutoRelease` (G-2), adversarial double/unauthorised release, dispute lifecycle |
| No incorrect stock reservation or release | ✔ | reservation emulator 27, order triggers (G-2), `inventoryReleaseReservation` (G-1: a paid order is refused) |
| No payment marked successful without verified provider status | ✔ | IPN unpaid = no change; PesaPal down = open; phase 7 lifecycle |
| No order paid on browser redirect alone | ✔ (by design) | The redirect page writes nothing. Settlement only happens in `pesapalIpn`, `pesapalTransactionStatus` and `pesapalReconcileSweep`, and each first asks PesaPal `GetTransactionStatus` (phase 7 L2/L3, G-2). |
| No unauthorised admin operation | ✔ | G-6, phase 1–3 security, trust badges, G-1/G-1b admin gates |

## 4. Failures seen during verification and their resolution

| Failure | Cause | Resolution | Status |
|---|---|---|---|
| `test_functions_resilience` 2 checks | regression from this branch (D-2) | classification fixed | **fixed + verified** |
| `test_pos_return_authority`, `test_pos_void_reversal`, `test_pos_money_reversal`, `test_pos_receipt_reconciliation` | regression from this branch (D-3) | `isHttpsError`. The double in `test_pos_return_authority` now throws the same `HttpsError` as the real module; the assertion is unchanged. | **fixed + verified** |
| `test_auction_admin_emulator` "every admin action is in admin_audit_log" (first run only) | **test isolation**: development runs of the new suites had left audit rows from other actors in the same emulator | re-run on a wiped emulator in package order: 11/11 | **not a defect** |
| `g1/test_phase7_server_lifecycle` L1 expected `internal` | intended SRV-06 contract change (missing redirect → `unavailable PAYMENT_PROVIDER_UNAVAILABLE`) | expectation updated to the typed code, and now also asserts the reason | **fixed + verified** (41/41) |
| `g1/test_transport_market` **C2** (the same driver re-accepting an accepted offer returned ok) | **Not a defect.** Since `ddacd20` (19 Nov, after the test was written on 12 Nov), `deliveryOfferAccept` deliberately treats a replay by the **same driver** of an offer it already accepted as an idempotent retry. It returns `already:true` and the **same** pickup token. It performs no write: no new token, no second assignment, no events, no notifications. Another driver is refused. A replay after pickup, or on an inactive offer, is refused. | The stale assertion (`used offer denied`) was replaced with assertions that prove exactly these properties. **Evidence:** `g1/test_transport_market` C2 **PASS** on 2026-11-20 (same token; ride, token record, events and notifications unchanged; other driver `permission-denied`; post-pickup and declined offers `failed-precondition`). | **resolved: test corrected, no code change needed** |
| `g1/test_transport_market` **C4** (customer cancel by direct Firestore REST write → 403) | **pre-existing** (identical on `d8cba09`). Direct client status writes are denied by the hardened rules (`test_national_rules_emulator` asserts this). Cancellation goes through the server (`deliveryRevokeTokens` / cancel callables, C3 passes). | not changed (outside this scope; stale) | **pre-existing stale test; owner may retire or update it** |
| `g1/test_business_os` B4.2/B4.3 (staff invite card and `skhStaffInviteCreate` handler missing in the UI) | **pre-existing** (same on `d8cba09`). The `staffInvite*` callables exist and pass G-1, but no UI calls them. | not changed (would be new UI scope) | **still unresolved: owner product decision** |
| `test_report_comment_http_emulator` "fetch failed" (first batch) | environment: the test needs the local functions server (`functions/local-server.js`) on **port 5056** | 2026-11-20 final run with the server started on 5056 (HTTP 200): **PASS**, rc=0. Covers auth, comments 200, idempotent retry, invalid 400, reports 200, unauthenticated 401. Also passes on `d8cba09`. | **verified** |
| G-1b `adminSetTrustBadge` `internal` (once) | ran in parallel with the emulator batch; not reproducible alone, and 11/11 in the sequential batch | — | **not reproducible** |

## 5. Classification

| Category | Items |
|---|---|
| **Fixed and verified (local)** | SRV-02, 03, 05, 06 (code), 07 (failure path), 09, 10, 11, 12; D-1…D-5; G-1, G-1b, G-2, G-3, G-4, G-6 |
| **Fixed but not yet verified** | none in code. All code changes have a test that runs them. |
| **Not reproducible** | the single parallel-run `internal` in G-1b |
| **Still unresolved** | staff-invite UI not wired (pre-existing, product scope); `g1/test_transport_market` C4 stale assertion (pre-existing) |
| **Requires Firebase staging** | SRV-01 deploy; composite indexes; App Check (SRV-08); IAM `signBlob` success path (SRV-07); PesaPal sandbox + IPN registration; Cloudinary signed upload; real FCM; cold start / timeouts / `maxInstances`; Cloud Scheduler and Eventarc delivery; backfills on real data (SRV-04) |
| **Requires owner action** | Blaze billing; staging project (SRV-14); review + push/merge of `d8cba09` and this branch (SRV-13); `SUPER_ADMIN_EMAILS`; IAM Token Creator; PesaPal sandbox keys via env/Secret Manager (never in source); App Check site key; feature flags `contentTranslation` / `offlineMemberTokenSignIn`; approving the app icon integration and naming the APK build project; `assetlinks.json` |

**Readiness:** code remediation is complete and locally verified. **Production readiness is not claimed.** The functions, rules and indexes are not deployed, and no staging run has happened.
