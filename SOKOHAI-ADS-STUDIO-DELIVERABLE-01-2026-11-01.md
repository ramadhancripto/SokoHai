# SokoHai Marketplace Ads Studio — Deliverable 01: Audit & Implementation Plan

**Date:** 2026-11-01 · **Branch:** `improve/phase1-audit-upload-fix` · **Nothing committed, merged or deployed**
**Scope:** audit first, plan second — no backend changes proposed here have been made.
**Companions:** `SOKOHAI-ADS-PLATFORM-AUDIT-2026-11-01.md` (capability verdicts),
`SOKOHAI-ADS-STUDIO-ARCHITECTURE-2026-11-01.md` (collection/function detail),
`sokohai-ads-platform-structure.html` (interactive IA prototype — 11 sections, desktop/tablet/mobile).

Every statement below was read in the code. Line numbers are from the current working tree.

---

## 1. Existing Ads Studio architecture and files

There was never **one** Ads Studio. Four separate surfaces exist, which is why the generic experience felt
disconnected:

| File | Lines | Role today | Verdict |
|---|---|---|---|
| `js/app/16-pos-admin-jobs.js` | 2 647 | The **generic Advertisement Designer**: `skhAdFormHtml` (Content/Media/Design/Text/CTA/Layers/Animation), `submitAnnouncementForm` (writes `announcements` directly), `renderAnnouncementManagerList` (admin campaign manager: Active/Draft/Expired/Campaigns/Analytics tabs), `skhAdminAdState` | **Keep for admins**, remove as the seller entry point |
| `js/app/95-creative-studio.js` | 2 525 | Canvas-based **Creative Studio** (`#skhCreativeStudio`): layers, timeline, save/publish via `creativeSaveDraft`/`creativePublish` | Keep as the *advanced editor*; not a seller flow |
| `js/app/creative/creative-model.js` | 418 | `createCreative`, `normalizeCreative`, `applyEntity`, `FORMAT_PRESETS`, fonts/palettes | **Core — reuse as-is** |
| `js/app/creative/ad-palettes.js` | — | Canonical palette/CTA tokens | Reuse |
| `shared/ads-design-rules.js` | 786 | `validateCreative`, `creativeToAdvertisement`, `normalizeCreative`, text-role limits — **the same file the Cloud Functions require** | **Core — reuse as-is** |
| `js/app/96-ad-delivery-controller.js` | 634 | Client side of the delivery engine: leases, slots, viewability, `adsTrackDeliveryEvent` | Reuse untouched |
| `js/app/06-announcement.js` (`js/06-announcement.js`) | — | Canonical ad card renderer `skhAdvertisementCardHtml`, targeting filter, `creativeTrackEvent` impressions/clicks | **Core — reuse as-is** |
| `js/app/99-ads-marketplace.js` | 415 | In-feed placement (one sponsored cell per grid), presentation normalisation (`skhAdsNormalizeCell`) | Reuse |
| `js/app/100-ads-studio-ui.js` | 440 | Studio icons, inline validation, states, section nav (phase-1 layer) | Reuse |
| **`js/app/101-marketplace-ads-studio.js`** | 1 348 | **NEW** marketplace-only studio (Products/Services/Transport, 7-step wizard, drafts/publish, campaign list) | Awaiting approval |
| `css/38-home-ad-manager.css` | 670 | Legacy home ad manager + `skh-ann-post` card skin | Reuse (unchanged) |
| `css/41-ads-marketplace.css` | 818 | Compact in-feed presentation (cell = product-card width, Sponsored chip) | Reuse (extended) |
| `css/42-ads-studio.css` | 1 020 | Phase-1 studio styling | Reuse |
| **`css/43-marketplace-ads-studio.css`** | 719 | **NEW** studio design system (scoped to `#masRoot`) | Awaiting approval |

Entry points: `html/03-modals-core.html` (advertiser dashboard), `html/00-head.html` (styles), `html/21-scripts.html` (modules), built into `index.html` by `python3 tools/build_html.py`.

**Duplication found:** two creative-building UIs (`95` canvas + `16` designer) and now a third, *purpose-built*
seller studio (`101`). The plan below consolidates rather than adds: `101` becomes the seller flow, `95` stays
the advanced editor, `16` stays the admin tool.

---

## 2. Firebase collections and Cloud Functions involved

**Collections (all existing — no new collection is required for Phases 1–6 of the plan):**

| Collection | Written by | Read by | Notes |
|---|---|---|---|
| `creatives/{id}` | owner (client, rules-gated) + callables | owner / admin | `status ∈ DRAFT/PREVIEW/READY/ARCHIVED` |
| `creatives/{id}/versions/{v}` | server only | owner / admin | immutable history |
| `creativePublications/{id}` | server only | owner / admin / published | |
| `announcements/{id}` | **admin only** (rules `firestore.rules:228`) + `creativePublish` | public (published) / owner (`advertiserId`) / admin | the serving campaign record |
| `creativeEvents/{id}` | server only | **nobody** (`read/write: if false`) | legacy impression/click dedupe |
| `adDeliveryEvents/{id}` | server only | nobody | full delivery event stream |
| `adDeliveryMetrics/{campaignId}` | server only | nobody | per-campaign counters (daily + total) |
| `adDeliveryLeases/{id}`, `adDeliveryState/{id}` (+`adDeliverySessions`) | server only | nobody | lease + frequency/fatigue state |
| `notifications/{id}` | server flows + limited client | `userId == uid` | generic; no ad notifications yet |
| `products`, `services`, `drivers` (+ legacy `delivery`) | existing marketplace flows | public | promoted listings — **never copied** |
| `publicProfiles/{uid}` | existing | public | advertiser identity |
| `wallet_ledger`, `escrow_holds`, `sokopay_*` | server (`SokoPay`/PesaPal flows) | owner/admin | **commerce money — completely separate from ads** |

**Cloud Functions (europe-west1):**

| Function | Kind | Auth | Purpose |
|---|---|---|---|
| `creativeSaveDraft` (`functions/creative.js:100`) | callable | signed-in, ownership | draft/announcement upsert |
| `creativePublish` (`:154`) | callable | signed-in, ownership + `destination.id === linkedEntity.id`; non-admin forced `moderationStatus:'pending'`, `active:false` | submit/publish |
| `creativeTrackEvent` (`:311`) | callable | **anonymous allowed** | impression/click → counters + `creativeEvents` (IP+bucket dedupe) |
| `adsRequestDelivery` (`functions/ads-delivery.js:325`) | callable | session lease | campaign selection/rotation |
| `adsTrackDeliveryEvent` (`:503`) | callable | lease owner | requested/loaded/rendered/entered_viewport/viewable/clicked/dismissed |
| `adsUpdateCampaignDelivery` (`:648`) | callable | **admin only** | placements, targets, goals, pause/resume |
| `adsDeliverySweep` (`:596`) | scheduled hourly | system | auto-activate, auto-complete (goal/expiry), pause |
| `adminModerateListing` (`functions/admin-authority.js:318`) | callable | admin | listings only (products/services) — **not ads** |
| `adminAuditQuery` + `writeAudit` | callable/infra | admin | audit trail |

Policy constants live in `functions/ads-delivery-core.js`: 12 placements (`:8`), campaign types (`:12`),
frequency/cooldown/fatigue/viewability/lease/retention defaults (`:17`), `campaignGoal` (`:187`),
**single eligibility gate `lifecycle()`** (`:241`).

---

## 3. Features that already work (verified)

1. **Listing-linked campaign creation** for products, services and transport; server re-reads the listing and
   enforces ownership (`canonicalEntity`, `creative.js:71`).
2. **Draft → submit with moderation** — non-admin submissions are `pending` and cannot self-approve.
3. **Real ad rendering** — one canonical card (`skhAdvertisementCardHtml`) used by the feed, the studio preview
   and the admin preview.
4. **Compact in-feed placement** — one sponsored cell per grid, identical width to ordinary cards, `Sponsored`
   chip, dismissable, no oversized blocks.
5. **Delivery engine** — leases, frequency caps (5/session, 12/hour, 30/day), cooldowns, fatigue scoring,
   viewability (≥50 % for ≥1 s), rotation, hourly sweep, auto-complete on goal/expiry.
6. **Tracking** — impressions (once per session) and clicks, de-duplicated, written to counters and event
   collections; delivery-level events for rendered/viewable/dismissed.
7. **Delivery goals (impression budget)** — `goals.dailyImpressions/totalImpressions` already pace delivery and
   auto-complete campaigns (`ads-delivery-core.js:187, 241`, `deliverySweep`).
8. **Campaign states** — `lifecycle()` already produces draft / pending / scheduled / active / paused /
   completed / archived / expired, and enforces moderation.
9. **Admin campaign manager** — list, filters, per-state actions, analytics tab (admin-only).
10. **Audit infrastructure** — `writeAudit` / `adminAuditQuery` (used by listing moderation today).
11. **Permissions** — server-authoritative ownership, admin claims, rules that block client writes to
    `announcements`, and server-only `adDelivery*`.

## 4. Features that are incomplete or broken

| # | Item | Reality | Impact |
|---|---|---|---|
| B1 | **Seller metrics beyond counters** | `adDeliveryMetrics`/`adDeliveryEvents` are `allow read, write: if false` | sellers cannot see viewability, dismissals, rendered counts — the Overview under-reports reality |
| B2 | **Seller lifecycle control** | pause/resume/archive exist only in an admin callable; `announcements` browser writes are admin-only | "Pause/Resume/Archive/Extend" in the brief is impossible for sellers today |
| B3 | **Ad review workflow** | `moderationStatus` gate exists at delivery, but there is **no audited approve/reject callable with a reason**; admins edit the document directly through the designer | no review queue, no seller-visible rejection reason, no audit entry |
| B4 | **Placements for services/transport** | server list is `home, discover, search, product_detail, service_detail, chat, groups, live, auction, group_buy, price_drop, dashboard` | no `transport_detail`, `service_discovery`, `category_listing`, `related_listing`; transport ads ride entity-typed slots only |
| B5 | **Seller-facing placement control** | admin-only (`adsUpdateCampaignDelivery`); the legacy designer nevertheless displays placement/goal controls to sellers | misleading UI — being removed from the seller path |
| B6 | **Targeting dimensions** | server honours `targetRegions / targetCategories / targetKeywords / targetEntityTypes / targetEntityIds` only | no device, interests, new-vs-returning, explicit search intent, no audience estimates |
| B7 | **Money, bidding, invoices** | nothing exists; billing UI is a contract-locked "Coming Soon" stub | Total spend / CPC / CPM / CPA / reserved funds / invoices / ROAS cannot be shown |
| B8 | **Conversions & attribution** | no conversion events, no attribution records | purchases/revenue/ROAS must stay "not available" |
| B9 | **Reach & frequency** | per-session state exists, no aggregate reach/frequency metric | cannot be displayed |
| B10 | **Reach/analytics UI** | admin analytics tab aggregates `viewCount`/`clickCount` only; no date range, breakdowns or export | |
| B11 | **Ad notifications** | generic `notifications` collection exists; **no ad flow writes to it** | no approval/rejection/budget alerts |
| B12 | **Creative library** | `creatives` data exists, no library UI | assets cannot be reused across campaigns |
| B13 | **Transport listing resolution** | `creative.js` resolved transport to `delivery` while the feed stores transport in `drivers` | transport ads could never be linked → **fixed** by the collection-list change in the current work (pending approval) |
| B14 | **Fraud/invalid-click monitoring** | `creativeTrackEvent` is anonymous and only IP+bucket deduped | impression/click inflation is possible; no monitoring surface |

## 5. Existing integrations that must be preserved

1. **Delivery engine + policy** (`96-ad-delivery-controller.js`, `ads-delivery.js`, `ads-delivery-core.js`) — no
   second rotation/serving path, ever.
2. **Canonical renderer** (`06-announcement.js`) and **in-feed placement** (`99-ads-marketplace.js`,
   `css/41-ads-marketplace.css`) — every new surface must render through these.
3. **Canonical creative model + shared rules** (`creative-model.js`, `shared/ads-design-rules.js`) — the same
   file is required by the Cloud Functions; validation must never diverge.
4. **Marketplace data** (`products`, `services`, `drivers`) — referenced, never copied.
5. **SokoPay / PesaPal commerce money** (`wallet_ledger`, `escrow_holds`, `sokopay_*`) — must not be touched or
   reused for ad funds without the separate-balance design in Phase 7.
6. **Notifications collection** — reuse the shape, do not create a parallel one.
7. **Admin audit trail** — every future state change (review, pause, budget) writes through `writeAudit`.
8. **Cloudinary uploads** (existing media pipeline) — listing media is referenced, not re-uploaded.

## 6. Security and permission issues found

| # | Issue | Where | Severity | Proposed handling |
|---|---|---|---|---|
| S1 | `creatives` update rule validates owner, version and status but **not which fields change** — an owner could pre-set `moderationStatus`/`advertiserId`-style fields on their creative to mislead a reviewer | `firestore.rules:241-248` | Medium (serving path is safe: `creativePublish` forces `pending` at `creative.js:194`) | Harden rules to an allow-list of mutable fields in Phase 2; read `moderationStatus` only from `announcements` |
| S2 | **Hardcoded super-admin email** `rshabansaid@gmail.com` in ad authorization | `functions/creative.js:34`, `functions/ads-delivery.js:44` | Medium | Replace with custom-claims-only check (needs approval; behaviour change) |
| S3 | `creativeTrackEvent` is callable **without authentication** | `functions/creative.js:311` | Medium (counters inflatable) | Keep anonymous impressions (guests must count) but add server-side rate/bot heuristics + invalid-click reporting in Phase 9 |
| S4 | No audited ad review → admin edits are not attributable | `16-pos-admin-jobs.js` designer | Medium | `adsModerateCampaign` with mandatory reason + audit (Phase 4) |
| S5 | Clients may create `notifications` documents (system/money types blocked) | `firestore.rules:596+` | Low | Ad notifications will be written **server-side only**, with a reserved type/prefix |
| S6 | Sellers shown placement/goal controls they cannot persist | `16-pos-admin-jobs.js` in the seller path | Low (UX/trust) | Already surfaced read-only in the new studio; overlay explains why |
| S7 | No fraud/invalid-click monitoring surface | — | Medium (once money exists) | Phase 9 admin reporting from `adDeliveryEvents` |

No security control was weakened at any point; no rule was modified by the current work.

---

## 7. Proposed implementation phases

| Phase | Content | Type | Size |
|---|---|---|---|
| **P0** *(done, awaiting approval)* | Marketplace studio: 3 ad types, listing reuse, 7 steps, real preview, drafts/submit, campaign list | UI + 1 backend fallback | — |
| **P1** | IA to the approved 11 sections + **honest Overview** (real counters, date filters; unavailable metrics rendered as unavailable) | UI only | 1 |
| **P2** | `adsSetMyCampaignLifecycle` (pause/resume/archive/extend, ownership + transition table + audit) and creative-field hardening (S1) | small backend | 1 |
| **P3** | `adsGetMyCampaignMetrics` (owner-scoped read of `adDeliveryMetrics`, aggregates only) → charts, breakdowns, CSV export | small backend | 1 |
| **P4** | `adsModerateCampaign` (approve/reject/suspend + mandatory reason + audit) + ad notifications into the existing `notifications` collection | medium backend | 1 |
| **P5** | Delivery-goal editing by the seller (`adsSetMyCampaignGoals`, bounded) + new placements (`transport_detail`, `service_discovery`, `category_listing`, `related_listing`) | medium backend | 1 |
| **P6** | Creative Library (read `creatives`) + **Ads Performance Intelligence v1** — read-only comparison of placements/regions/listings from verified metrics, with an explicit "data haitoshi" state | UI (+P3 data) | 1 |
| **P7** | **Money architecture only** (design document, no code): CPC/CPM/CPA review, **separate ad-funds balance vs `walletBalance`**, spend ledger, reserved funds, invoices/receipts, refunds, audit — built on SokoPay only after explicit approval | design + finance review | — |
| **P8** | Conversion tracking + attribution (7-day click / 1-day view), only after Phase 15-style validation of existing tracking | large backend | 2 |
| **P9** | Fraud/invalid-click monitoring, policy controls, platform-wide reporting | medium backend | 1 |

Nothing in P2–P9 starts before the corresponding approval. **No new collection is required for P1–P6.**

---

## 8. Exact files and backend components that would need modification

| Component | Change | Phase | Backend? | Risk |
|---|---|---|---|---|
| `js/app/101-marketplace-ads-studio.js` | extend 6 → 11 sections, 7 → 10 steps, audience/goal steps, lifecycle actions, metrics views | P1, P2, P3, P5, P6 | no | low |
| `css/43-marketplace-ads-studio.css` | shared component set, "unavailable" tile style, responsive rails | P1 | no | low |
| `functions/ads-delivery.js` (or a sibling module) | add `adsSetMyCampaignLifecycle`, `adsSetMyCampaignGoals` | P2, P5 | yes | medium |
| new `functions/ads-metrics.js` | `adsGetMyCampaignMetrics` (owner-scoped aggregates) | P3 | yes | medium (must not leak per-user events) |
| new `functions/ads-review.js` | `adsModerateCampaign` (+ audit + notification) | P4 | yes | medium |
| `functions/ads-delivery-core.js` | add 4 placement ids to `PLACEMENTS` (single source of truth) | P5 | yes | low-medium (policy tests must be updated) |
| `js/app/96-ad-delivery-controller.js` | map the new placements to real slots | P5 | no | medium (must not change rotation) |
| `js/app/16-pos-admin-jobs.js` | add review queue UI; remove seller-facing placement/goal controls | P4, P1 | no | medium (large legacy file) |
| `firestore.rules` | tighten `creatives` update to a field allow-list (S1) | P2 | yes | **high — needs careful test** |
| `functions/creative.js`, `functions/ads-delivery.js` | replace hardcoded admin email with claims (S2) | P2 | yes | medium |
| `shared/ads-design-rules.js` | unchanged (server and client must stay identical) | — | — | — |
| `tools/*` | new contract + Playwright suites per phase (see §9) | all | — | — |
| `package.json` (`npm test` chain) | register each new contract test | all | — | low |

Not touched at all: `wallet_ledger`, `escrow_holds`, `sokopay_*`, PesaPal flows, checkout, cart, delivery
routing, POS, chat, taxonomy, any Pasihai/GuardHai/ChatHai code.

---

## 9. Risks and testing strategy

### Risks

| Risk | Mitigation |
|---|---|
| Diverging creative validation (client vs `shared/ads-design-rules.js`) | client asks the same module; server re-validates on publish (already) |
| Metrics access leaking per-user data | aggregate-only payloads, ownership per campaign id, no `ownerKey`/`sessionKey`/IP ever returned |
| New placements breaking the delivery policy | `PLACEMENTS` is the single source; policy tests updated in the same commit |
| Rules tightening (`creatives` allow-list) breaking the existing studio save path | run the full creative + studio suites before/after; never loosen anything |
| Money model mixing ad funds with shopper wallet | separate balance + separate ledger; no code in P7 — design-only until finance approves |
| Attribution over-claiming | conversions only from paid orders; inquiries are labelled inquiries, never revenue; ROAS hidden until both sides exist |
| Displaying fabricated numbers | a UI test asserts unavailable metrics never render `0` |
| Legacy designer regression | it stays in place and admin-only; `16-pos-admin-jobs.js` parses clean (`node --check` verified) |
| Production data | no writes in any test; publishing intercepted in the harness |

### Testing strategy

**Already green (must stay green):** `ads_studio_rebuild_verify.mjs` 67/67 · `ads_phase1_verify.mjs` 30/30 ·
`ads_task01_verify.mjs` 18/18 · `test_ads_studio_transport_link.mjs` 11/11 ·
`test_advertiser_billing_coming_soon_contract.mjs` 20/20 · creative/designer/governance suites · `npm test`
(118 pass; 2 pre-existing Discover failures unrelated to ads).

**Added per phase:**

| Phase | New tests |
|---|---|
| P1 | 11 sections reachable at 390/820/1440 px; no unavailable metric renders as `0`; no horizontal overflow; existing 67 still pass |
| P2 | transition matrix (valid/invalid), ownership denial for another seller, audit entry written, pause stops delivery via `lifecycle()` |
| P3 | ownership matrix, payload shape/size caps, no PII, empty-state honesty |
| P4 | non-admin denied, missing reason denied, rejected campaign stops serving, notification written and links to the campaign |
| P5 | goal bounds, pacing/auto-complete regression, new placements accepted/rejected by the policy, delivery-engine regression suite |
| P6 | library reflects `creatives` only, reuse pre-fills the wizard, “insufficient data” state when metrics are thin |
| P7 | design review only (no code) |
| P8 | conversion fixtures from paid orders only; attribution window boundaries; no revenue for inquiries |
| P9 | invalid-click detection fixtures; admin-only visibility |

**Lifecycle end-to-end** (their §12) will be executed against the local build with write interception:
listing → create → configure → preview → submit → review → approve/reject → start → deliver → track →
(pause/resume) → complete → report, plus ownership, admin, invalid-transition, failed-submission, missing-listing,
goal-boundary and responsive checks.

---

## Decisions required before Phase 2 starts

1. **Budget path:** approve **delivery goals** (impressions) as the Phase-1 budget, with money billing staying
   Coming Soon (recommended), or authorise the Phase-7 money design now?
2. **Two small callables:** `adsSetMyCampaignLifecycle` and `adsGetMyCampaignMetrics`?
3. **Review workflow:** `adsModerateCampaign` with mandatory reason + audit + notification?
4. **Placements:** add `transport_detail`, `service_discovery`, `category_listing`, `related_listing`, and should
   sellers choose placements or stay read-only?
5. **Hardening:** approve tightening `creatives` update rules (S1) and replacing the hardcoded admin email (S2)?
6. **Attribution:** approve conversions from paid orders / service inquiries / transport requests with a
   7-day click / 1-day view window — or keep conversions, revenue and ROAS "not available"?

**No code beyond the completed P0 studio will be written until these are answered.**
