# SokoHai Advertising — Phase 1 Architecture Audit

**Date:** 2026-11-01 · **Branch:** `improve/phase1-audit-upload-fix` (nothing merged, nothing deployed)
**Rule applied throughout:** *a capability is "existing" only if the code path was read and its authorisation
verified — not because a screen or a label mentions it.*

---

## 0. Verdict in one paragraph

The **serving and measurement spine already exists and is stronger than the UI suggests**: there is a real
ad-delivery engine with leases, frequency capping, fatigue scoring, viewability, an hourly sweep, per-campaign
metric counters and de-duplicated impression/click events. What does **not** exist is the *commercial and
self-service layer*: money budgets, spend, bidding, invoices, seller-side pause/resume, ad-scoped analytics
access, conversions/attribution, ad notifications, and an audited ad review callable. Most of the "missing"
phases in the brief are therefore **new backend capabilities, not new UI** — and several of them
(budget/billing, attribution) are product decisions rather than coding tasks. The brief's own rule applies:
**present the plan before large backend changes.** This document separates what is real, what is
half-built, and what would have to be created.

---

## 1. What exists today (verified in code)

### 1.1 Ad object model — EXISTS

| Concept (brief §14) | Where it lives today | Notes |
|---|---|---|
| Advertisement / Creative | `creatives/{id}` | owner-editable at `DRAFT`/`PREVIEW`/`READY` (rules `firestore.rules:241`) |
| Campaign | `announcements/{id}` | the serving record; browser writes **admin-only** (`firestore.rules:228`) |
| Promoted listing | `announcements.linkedEntity` + `destination` | `creativePublish` requires `destination.id === linkedEntity.id` |
| Placement | `announcements.placements[]` | validated against a 12-entry server list |
| Audience configuration | `announcements.targetRegions / targetCategories / targetKeywords / targetEntityTypes / targetEntityIds` | |
| Delivery goal (budget-like) | `announcements.goals.dailyImpressions / totalImpressions` | **impressions, not money** |
| Spend ledger | — | **does not exist** |
| Impression / click event | `adDeliveryEvents`, `creativeEvents` | server-only reads |
| Metrics aggregate | `adDeliveryMetrics/{campaignId}` | per-campaign counters, daily + total |
| Campaign review | `announcements.moderationStatus` | values exist; **no audited review callable** |
| Billing transaction / invoice | — | **does not exist for ads** |
| Attribution record | — | **does not exist** |

### 1.2 Creation, ownership, publishing — EXISTS and is server-authoritative

* `functions/creative.js:100` `creativeSaveDraft` and `:154` `creativePublish`.
* `functions/creative.js:71` `canonicalEntity()` re-reads the listing server-side and enforces ownership
  (`ownerId|sellerId|userId|uid|providerId|driverId`), rejecting anything else with `permission-denied`.
* Non-admin publishes are forced to `moderationStatus:'pending'` (`creative.js:194`) — no approval bypass.
* Listing-linked advertising covers `product → products`, `service → services`, `transport → delivery|drivers`
  (the `drivers` fallback was added in the current work and is pending review).

### 1.3 Delivery engine — EXISTS (this is the strongest part of the system)

`functions/ads-delivery-core.js` + `functions/ads-delivery.js`:

* 12 server placements (`ads-delivery-core.js:8`): `home, discover, search, product_detail, service_detail,
  chat, groups, live, auction, group_buy, price_drop, dashboard`.
* Policy defaults (`:17`): frequency (5/session, 12/hour, 30/day, 3 leases), cooldowns (global/advertiser/
  creative/dismissed), fatigue weights, **viewability ≥ 50 % for ≥ 1000 ms**, lazy loading, rotation 5–59 s,
  lease TTL 5 min, 90-day analytics retention, `Africa/Dar_es_Salaam` timezone.
* `adsRequestDelivery` (`ads-delivery.js:325`) issues session-bound leases; `adsTrackDeliveryEvent` (`:503`)
  records `requested / loaded / rendered / entered_viewport / viewable / clicked / dismissed /
  lease_released` with idempotent event ids, lease ownership checks and per-type metric counters.
* `adsDeliverySweep` (`:596`, hourly) activates scheduled campaigns, completes exhausted ones and pauses.
* `lifecycle()` (`ads-delivery-core.js:241`) is the single eligibility gate: archived / draft / paused /
  completed / **moderation not approved** / not started / expired / goal reached.

### 1.4 Tracking on the marketplace side — EXISTS

* `js/06-announcement.js:84` `track()` → `creativeTrackEvent` (impression once per session via `sessionStorage`,
  plus click), server de-duplicates by `sha256(id|type|ip|bucket)` (`creative.js:311`).
* `js/app/96-ad-delivery-controller.js:191` → `adsTrackDeliveryEvent` with the lease id (viewability path).
* `js/app/99-ads-marketplace.js` handles in-feed placement and presentation; `css/41-ads-marketplace.css`
  keeps sponsored cards the size of ordinary cards.

### 1.5 Metrics that a seller can actually read today — PARTIAL

* `announcements.viewCount` / `clickCount` — real, incremented by `creativeTrackEvent`, **readable by the ad's
  owner** (rules allow read when `advertiserId == uid`).
* `adDeliveryMetrics`, `adDeliveryEvents`, `creativeEvents` — **`allow read, write: if false`**
  (`firestore.rules:270, 276, 277`). Richer metrics exist but **no client or seller path can read them.**

### 1.6 Admin side — PARTIAL

* Ad inventory is managed through the admin designer/campaign manager (`js/app/16-pos-admin-jobs.js:318`
  `skhAdminAdState`, `:332` `renderAnnouncementManagerList` with Active/Draft/Expired/Campaigns/Analytics tabs).
* `adsUpdateCampaignDelivery` (`ads-delivery.js:648`) is the admin-only control for placements/targets/goals.
* `adminModerateListing` (`admin-authority.js:318`) covers **products/services only** (`hide`/`restore`,
  reason required, audit written). **No equivalent for ads.**
* Audit infrastructure exists: `writeAudit` / `adminAuditQuery` (`admin-authority.js`).

### 1.7 Notifications — GENERIC ONLY

`notifications/{id}` (`firestore.rules:596`) with `{userId, title, body, type, createdAt, read}` is written by
several server flows (payments, escrow, orders). **No advertising flow writes a notification**; no ad-related
notification exists anywhere.

### 1.8 Money — EXISTS, but for commerce, not for ads

Wallet, escrow (`escrow_holds`), PesaPal returns, refunds and ledger entries are real and server-authoritative.
Advertising is **not** connected to any of them: the advertiser billing surface is explicitly a
**Coming Soon** stub, locked by `tools/test_advertiser_billing_coming_soon_contract.mjs` (20 checks).

---

## 2. Incomplete functionality (structure exists, capability does not)

| # | Capability | What exists | What is missing |
|---|---|---|---|
| I1 | **Seller lifecycle control** (pause / resume / archive / duplicate / extend) | `lifecycle()` honours `paused`/`archived`; admin callable can set them | No seller-authorised callable; `announcements` writes are admin-only |
| I2 | **Placements UI** | server validates 12 placements | no `transport_detail` / `service_discovery` / `category_listing` / `related_listing` placement ids; no seller-facing placement choice (admin-only) |
| I3 | **Targeting** | server honours region / category / keyword / entityType | no device, interests, new-vs-returning, no explicit search-intent targeting, no audience estimates, no UI |
| I4 | **Analytics** | rich per-campaign counters in `adDeliveryMetrics` | seller cannot read them; no date filters, breakdowns, reach/frequency, export |
| I5 | **Budget** | impression goals with daily/total pacing and auto-complete | no money, no spend, no bid, no reservation, no utilisation |
| I6 | **Admin ad review** | `moderationStatus` gate at delivery; admin designer writes ads directly | no approve/reject callable with mandatory reason, no audit entry, no seller-visible rejection reason, no review queue |
| I7 | **Creative library** | `creatives` collection with layers/assets | no library UI, no asset validation surface, no reuse across campaigns |
| I8 | **Ad notifications** | generic `notifications` collection | no ad writers, no links to campaign actions |

## 3. Proposed new functionality (must be built, needs approval)

| # | Capability | Why it cannot be faked | Backend change needed |
|---|---|---|---|
| N1 | Money budget + spend ledger + reserved funds | money must never be derived in the browser | new callables + `adBudgets` / `adSpendLedger`; payment provider + wallet separation decision |
| N2 | CPC / CPM / CPA / fixed-placement pricing | changes settlement, not just UI | requires N1 first; pricing model must be an approved product decision |
| N3 | Invoices / receipts / transactions for ads | financial documents need server authority and immutability | server-side invoice writer; reuse existing order-invoice patterns where possible |
| N4 | Conversions + attribution + attributed revenue + ROAS | must be provable, never inferred | server-side conversion capture from order/inquiry flows + attribution records + agreed window |
| N5 | Reach / frequency | needs de-duplicated audience state aggregation | scheduled rollup from `adDeliveryState` / events |
| N6 | Audited ad review (approve / reject / suspend + reasons) | governance must be auditable | `adsModerateCampaign` + `writeAudit` + notification |
| N7 | Ad notifications | must be server-written and link to campaigns | writers into existing `notifications` |
| N8 | New marketplace placements | server rejects unknown placements | extend `PLACEMENTS` + slot mapping in the controller |
| N9 | Seller metrics read path | rules forbid client reads | owner-scoped read callable over `adDeliveryMetrics` |

---

## 4. Contradictions found between UI wording and reality

1. The advertiser dashboard says **"Billing is not enabled"** — correct — but the old designer screen offers
   *"Placements / Goals / Budget"* controls that only an admin can persist. Sellers were being shown
   controls that silently required admin rights.
2. `adDeliveryMetrics` is described nowhere in the UI, yet it is the only source of viewability, dismissals and
   rendered counts. The seller-facing "Performance" view therefore under-reports reality (it only sees
   `viewCount`/`clickCount`).
3. The brief's "Total spend / ROAS / attributed revenue" **cannot be shown today at all**. They must render as
   *not available*, never as `0`.

---

## 5. Historical data and migration safety

* No document, collection, index or rule was changed, moved or deleted by any advertising work so far.
* `announcements` / `creatives` / `adDelivery*` reads are additive; every existing campaign keeps its id,
  metrics and lifecycle.
* The only backend change in the current work is the `transport: ['delivery','drivers']` collection list
  (`functions/creative.js:18`) — first-wins, backward compatible, no backfill.
* Phase 14 (below) proposes **no new collections for concepts that already have a home**: campaigns stay in
  `announcements`, creatives stay in `creatives`, events stay in `adDeliveryEvents`.

---

## 6. Test coverage that already protects this area

| Suite | Purpose |
|---|---|
| `tools/ads_phase1_verify.mjs` (30) | in-feed presentation, sizing, manager filters, analytics tab |
| `tools/ads_task01_verify.mjs` (18) | studio interactions, market preview mode, tablet |
| `tools/ads_studio_rebuild_verify.mjs` (67) | new studio: 3 ad types end-to-end, previews, campaigns, marketplace, mobile/tablet, write-safety |
| `tools/test_ads_studio_transport_link.mjs` (11) | transport listing resolution + no destructive migration |
| `tools/test_ads_governance.mjs` (12) | shared rules module, save/publish routes |
| `tools/test_ads_delivery_engine.mjs`, `test_ads_local_delivery_regression.mjs` | delivery policy/engine |
| `tools/test_creative_system.mjs`, `test_creator_studio_upgrade.mjs`, `test_unified_ad_designer.mjs` (146), `test_noncanvas_ad_designer.mjs` (56) | creative model, designer, validation |
| `tools/test_advertiser_billing_coming_soon_contract.mjs` (20) | billing must stay Coming Soon until real money exists |

Anything built in Phases 3–12 must extend these, not replace them.
