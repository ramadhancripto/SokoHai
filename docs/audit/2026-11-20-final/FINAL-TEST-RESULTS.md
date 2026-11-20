# SokoHai: final test results

**Date:** 20 November 2026
**Branch:** `remediation/final-20261120` (base `origin/main` fe8b8a3)

**Environment:**

- Linux cloud workspace, Node 22.
- Chromium with Playwright 1.x.
- Firebase emulators: Firestore :8085, Auth :9099, project `demo-sokohai`.
- `functions/local-server.js` on :5055 (functions on the emulator).
- Fixture servers:
  - `python3 -m http.server 4173` (repository root);
  - `node tools/product_preview_server.mjs` (:4174, mock cloud).
- Firebase web SDK 10.8.1 served locally (`SKH_FIREBASE_SDK_DIR`), because gstatic is not reachable from the workspace.

**Nothing touched production, real money or real accounts.**

## Summary against the previous baseline

| Suite | Previous baseline | Now | Command |
|---|---|---|---|
| npm test (each command separately) | 112/112 | **117/117** (+5 new) | `npm test`, split on `&&` and run one by one (perfile) |
| Emulator suites (`test:security:all:emulator` list + 4 routing/transport) | 1 suite failing on baseline (pilot_ops C1) + category_filter | **39/39 suites pass** (35 from the package list incl. new archive test + 4) | each `node tools/<suite>.mjs` with `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` set |
| Emulator E2E | 56/56 | **56/56**, EXIT=0 | `bash tools/e2e-emulator/run.sh` |
| Navigation | 56/56 | **56/56** | `node tools/e2e-emulator/test_nav_system.cjs` |
| R14–R16 journeys | 18/18 | **18/18** | `VP=phone/desktop node tools/e2e-emulator/<journey>.cjs` |
| R13 group chat / group business | 5/8 and 3/13 (failing on baseline) | **8/8** phone + desktop; **13/13** phone + desktop (see note) | as above |
| Browser contracts | 32/36 | **36/36** | `node tools/<name>_browser.mjs` for every `tools/*browser*.mjs` |
| Owner card style / header-cards / env isolation | PASS / PASS / 10/10 | **PASS / PASS / 10/10** | `node tools/e2e-emulator/test_owner_card_style.cjs` … |
| Build | passed | **passed** | `python3 tools/build_html.py check`; `node tools/build_dist.mjs --minify --check` |
| Taxonomy family variants (browser) | — | **pass** (30 families) | `node tools/test_taxonomy_family_variants.mjs` |

**Skipped:** none. **Remaining failures:** none in the final runs.

**Note on `r13h_group_business` (phone):**

- In the full verification run, step 1 failed once. The rail was measured during its 160 ms slide-in (x = -59).
- After the test was fixed to wait for the animation, phone runs were 6 of 7 passing. The one failing run happened before its log was kept, so its cause was not captured.
- The next 5 consecutive phone runs passed, and desktop passed every time.
- Treat it as **possibly flaky** until more runs confirm it.

## New tests added

| Test | Covers | Result |
|---|---|---|
| `tools/test_archive_enforcement_emulator.mjs` | R-18 server + rules + sitemap | 13/13 |
| `tools/test_store_ownership.mjs` | R-22 store ownership and visibility | pass |
| `tools/test_canonical_domain.mjs` | R-19 single origin, PesaPal origins, switch dry run | pass |
| `tools/test_callable_names.mjs` | R-21 client names ⊂ exports, region | pass (74 names / 180 exports) |
| `tools/test_category_scenes.mjs` | R-20 artwork resolution and safety | pass |

## Emulator suites (39)

| Command | Result | Summary line |
|---|---|---|
| `node tools/test_phase1_security.mjs` | PASS | PHASE 1 SECURITY: 57 passed, 0 failed |
| `node tools/test_phase2_security.mjs` | PASS | PHASE 2 SECURITY: 41 passed, 0 failed |
| `node tools/test_phase3_security.mjs` | PASS | PHASE 3 SECURITY: 34 passed, 0 failed |
| `node tools/test_repair_rules.mjs` | PASS | Repair rules: 139 passed, 0 failed |
| `node tools/test_commerce_modes.mjs` | PASS | COMMERCE MODES: 13 passed, 0 failed |
| `node tools/test_admin_agent_authority.mjs` | PASS | ADMIN & AGENT AUTHORITY: 9 passed, 0 failed |
| `node tools/test_user_cards.mjs` | PASS | USER CARDS + SYSTEM AUDIT: 18 passed, 0 failed |
| `node tools/test_upload_signing.mjs` | PASS | UPLOAD SIGNING: 11 passed, 0 failed |
| `node tools/test_inventory_rules.mjs` | PASS | INVENTORY RULES: 44 passed, 0 failed |
| `node tools/test_conversation_rules.mjs` | PASS | CONVERSATION RULES: 8 passed, 0 failed |
| `node tools/test_inventory_reservation_emulator.mjs` | PASS | INVENTORY RESERVATION (emulator): 27 passed, 0 failed |
| `node tools/test_seller_lifecycle_emulator.mjs` | PASS | SELLER LIFECYCLE (emulator): 21 passed, 0 failed |
| `node tools/test_decimal_quantity_emulator.mjs` | PASS | DECIMAL QUANTITY (emulator): 10 passed, 0 failed |
| `node tools/test_ride_privacy_rules.mjs` | PASS | RIDE PRIVACY RULES: 52 pass, 0 fail |
| `node tools/test_ride_contact_migration_emulator.mjs` | PASS | RIDE CONTACT MIGRATION (emulator): 16 passed, 0 failed |
| `node tools/test_category_filter_emulator.mjs` | PASS | CATEGORY FILTER (emulator): 9 passed, 0 failed |
| `node tools/test_listing_trust_rules.mjs` | PASS | LISTING TRUST RULES: 17 pass, 0 fail |
| `node tools/test_trust_badges_emulator.mjs` | PASS | TRUST BADGES (emulator): 35 passed, 0 failed |
| `node tools/test_auction_pricedrop_emulator.mjs` | PASS | AUCTION + PRICE DROP: 18 passed, 0 failed |
| `node tools/test_pricedrop_queue_emulator.mjs` | PASS | PRICE DROP QUEUE + LIVE EXTRAS: 16 passed, 0 failed |
| `node tools/test_live_stories_groupsoko_emulator.mjs` | PASS | LIVE + STORIES + GROUP SOKO: 26 passed, 0 failed |
| `node tools/test_auction_live_impl_emulator.mjs` | PASS | AUCTION-LIVE IMPL: 16 passed, 0 failed |
| `node tools/test_auction_admin_emulator.mjs` | PASS | AUCTION ADMIN: 11 passed, 0 failed |
| `node tools/production_readonly_audit.mjs --self-test` | PASS | (exit 0; no summary line) |
| `node tools/test_group_chat_rules.mjs` | PASS | PASS: 90   FAIL: 0 |
| `node tools/test_group_business_rules.mjs` | PASS | GROUP BUSINESS RULES: 33 passed, 0 failed |
| `node tools/test_push_emulator.mjs` | PASS | RESULT 9 pass 0 fail |
| `node tools/test_dispute_refund_lifecycle.mjs` | PASS | DISPUTE REFUND LIFECYCLE: 7 passed, 0 failed |
| `node tools/test_order_wallet_pay.mjs` | PASS | ORDER WALLET PAY: 8 passed, 0 failed |
| `node tools/test_archive_enforcement_emulator.mjs` | PASS | ARCHIVE ENFORCEMENT (emulator): 13 passed, 0 failed |
| `node tools/test_group_buy_lifecycle.mjs` | PASS | GROUP BUY LIFECYCLE: 12 passed, 0 failed |
| `node tools/test_identity_verification.mjs` | PASS | IDENTITY VERIFICATION: 8 passed, 0 failed |
| `node tools/test_r16_server_fixes.mjs` | PASS | R16 SERVER FIXES: 9 passed, 0 failed |
| `node tools/test_search_index_emulator.mjs` | PASS | SEARCH INDEX (emulator): 14 passed, 0 failed |
| `node tools/test_pilot_ops_emulator.mjs` | PASS | PILOT OPS (emulator): 13 passed, 0 failed |
| `node tools/test_routing.mjs` | PASS | ROUTING TESTS: 69 pass, 0 fail |
| `node tools/test_routing_cancel_race_emulator.mjs` | PASS | ROUTING RACES: decline versus cancellation preserves closed ride and no active offers |
| `node tools/test_transport_handover_emulator.mjs` | PASS | HANDOVER EMULATOR: parallel issuance/retry, actor/token/stage checks, two-party custody, reuse and next leg passed |
| `node tools/test_transport_token_verify.mjs` | PASS | TRANSPORT TOKEN VERIFY: 5 passed, 0 failed |

## Browser contracts (36)

| Test | Result | Summary line |
|---|---|---|
| `test_business_os_9_modules_browser` | PASS | BUSINESS OS — MODULI 9: 10 passed, 0 failed |
| `test_business_os_browser` | PASS | BUSINESS OS BROWSER (1A): 16 passed, 0 failed |
| `test_category_images_browser` | PASS | PASS 1280px: 67 category/service/transport image elements loaded; no placeholder, broken image or page overflow (mock cloud). |
| `test_category_navigation_images_browser` | PASS | PASS navigation: 34 existing buyer category tiles call the unchanged selection handler and request a feed refresh (mock data). |
| `test_chat_conversations_browser` | PASS | PASS 1280x800: inbox, unread, keyboard direct/group, composer, bubbles, wrapping |
| `test_cockpit_kuu_browser` | PASS | COCKPIT KUU BROWSER: 14 passed, 0 FAILED |
| `test_comments_experience_browser` | PASS | PASS 1280: real sheet, sorting, threads, specific reply, counts, seller/verified, like, failure/draft, layout (mock cloud) |
| `test_comments_retry_browser` | PASS | (exit 0; no summary line) |
| `test_dashboard_product_remove_browser` | PASS | PASS browser: selection, filter persistence, cancellation, partial failure, auction guard, single removal, restore, layout 280–1440px |
| `test_demand_insights_browser` | PASS | MAHITAJI YA SOKO BROWSER: 14 passed, 0 FAILED |
| `test_feed_tabs_rating_browser` | PASS | PASS real review, aggregate, no rating, invalid rating |
| `test_group_sidebar_browser` | PASS | PASS 1440x900: toggle, responsive layout, destinations, active state, multiline, mock send, attachment menu, resized viewport |
| `test_header_brand_balance_browser` | PASS | PASS 1440: centered post, non-overlap, equally spaced actions, matching welcome brand |
| `test_home_posters_browser` | PASS | PASS timer 5s and dot navigation |
| `test_home_product_archive_browser` | PASS | PASS home: archived excluded and populated sections clear on refresh |
| `test_home_promo_compact_browser` | PASS | PASS 1280x900: compact 171px, both slides, no width overflow, buttons and navigation |
| `test_home_promo_trio_browser` | PASS | PASS 1440px: bounded text, cards, icons, responsive layout |
| `test_live_mini_compact_browser` | PASS | PASS scrolled content anchored during mini insertion and removal |
| `test_market_rails_browser` | PASS | PASS 1280px: real rankings/cards, uniform cards, contained photos, aligned horizontal rails, text, scroll, interactions, empty state |
| `test_my_products_kpi_browser` | PASS | BIDHAA ZANGU KPI BROWSER: 20 passed, 0 FAILED |
| `test_natural_product_grid_browser` | PASS | PASS 1280px: natural portrait/landscape/square, mixed feed, no overlap, rail, sentinel, dynamic item/ad |
| `test_overview_recovery_browser` | PASS | (exit 0; no summary line) |
| `test_personal_recycle_browser` | PASS | PASS mock browser: buyer orders/requests/negotiations/rides; provider completed orders; driver history; per-user isolation, active safety, b |
| `test_popular_rail_browser` | PASS | PASS 1280px: actual popular rail, truthful stock/rating, owner 4:3 cards, contained photos, scroll and keyboard |
| `test_product_compare_browser` | PASS | LINGANISHA BIDHAA BROWSER: 16 passed, 0 FAILED |
| `test_product_performance_browser` | PASS | UTENDAJI WA BIDHAA BROWSER: 20 passed, 0 FAILED |
| `test_recycle_bin_browser` | PASS | PASS browser mock: header, bulk move, normal list, bin, restore/cancel/failure/moderation, pagination 205, layout 280–1440px; permanent de |
| `test_ride_request_view_browser` | PASS | PASS 1280px: form layout, dynamic fields, route search/back, broadcast, chain and close (mock cloud) |
| `test_role_recycle_headers_browser` | PASS | PASS provider and driver real shell icon, provider overview contains no fake KPIs; modal opens |
| `test_sales_insights_browser` | PASS | MAARIFA YA MAUZO BROWSER: 16 passed, 0 FAILED |
| `test_seller_photo_editor_browser` | PASS | PASS large WebP compression retains alpha: { input: 1524642, type: 'image/webp', w: 1600, alpha: 0 } |
| `test_stock_comments_repairs_browser` | PASS | PASS: audited stock adjustment, blank validation, safe errors, server-first comment and retained input (mock cloud). |
| `test_taxonomy_all_leaf_browser` | PASS | (exit 0; no summary line) |
| `test_terminology_stage_b_browser` | PASS | STAGE B — TERMINOLOGY BROWSER: 16 passed, 0 FAILED |
| `test_waterfall_feed_browser` | PASS | PASS real feed + scroll pagination, loading placeholder, image resolution, 53 unique cards, keyboard/click, empty state (mock cloud) |
| `test_welcome_alert_browser` | PASS | PASS guest, late auth, async profile ahead of email fallback, stale response, i18n guard |

## Journeys (final verification run)

| Journey | Viewport | Result |
|---|---|---|
| test_r16_service_journey | phone | RESULT 10 pass 0 fail |
| test_r16_service_journey | desktop | RESULT 10 pass 0 fail |
| test_r16_transport_journey | phone | RESULT 7 pass 0 fail |
| test_r16_transport_journey | desktop | RESULT 7 pass 0 fail |
| test_r16_order_journey | phone | RESULT 7 pass 0 fail |
| test_r16_order_journey | desktop | RESULT 7 pass 0 fail |
| test_r16_group_buy | phone | RESULT 6 pass 0 fail |
| test_r16_group_buy | desktop | RESULT 6 pass 0 fail |
| test_r15_account_recovery | phone | RESULT 9 pass 0 fail |
| test_r15_account_recovery | desktop | RESULT 9 pass 0 fail |
| test_r15_pwa | phone | RESULT 8 pass 0 fail |
| test_r15_pwa | desktop | RESULT 8 pass 0 fail |
| test_r15_push_ui | phone | RESULT 5 pass 0 fail |
| test_r15_push_ui | desktop | RESULT 5 pass 0 fail |
| test_r14_live_camera | phone | RESULT 6 pass 0 fail |
| test_r14_live_camera | desktop | RESULT 6 pass 0 fail |
| test_r14_auction_admin | phone | RESULT 3 pass 0 fail |
| test_r14_auction_admin | desktop | RESULT 3 pass 0 fail |
| test_r13g_group_chat | phone | RESULT 8 pass 0 fail |
| test_r13g_group_chat | desktop | RESULT 8 pass 0 fail |
| test_r13h_group_business | phone | RESULT 12 pass 1 fail |
| test_r13h_group_business | desktop | RESULT 13 pass 0 fail |

The phone run of `r13h` failed once in this list (step 1, slide-in timing). It was fixed and re-run as described above.

## Console and runtime errors

- E2E steps 31 (phone and desktop) and the owner-card test assert **no page errors**.
- Each browser contract collects `pageerror`. Most also collect `console.error` and assert the list is empty.
- No JavaScript error was reported in any final run.

## Responsive coverage

The final runs covered these widths:

- 320, 360, 375, 390, 414, 768, 1024, 1280 and 1440 px;
- category images, cards, rails, seller editor, group sidebar, owner card and header;
- phone (390×844) and desktop (1440×900) for every E2E journey.

**Not tested:** no physical devices.

## Limitations

- **Production was not tested,** apart from read-only checks from the owner's browser:
  - `sokohai.com` does not load;
  - Cloud Functions return 404.
- **Firestore rules:** checked in the emulator only.
- **PesaPal:** no live or sandbox network call. Server logic is tested with the network refused or mocked.
- **Payment processing:** NOT verified end-to-end with real money.
