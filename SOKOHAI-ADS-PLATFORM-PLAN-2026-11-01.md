# SokoHai Marketplace Ads Platform — UI Structure & Implementation Plan

**Date:** 2026-11-01 · **Status:** proposed, awaiting approval · **Companion:** `SOKOHAI-ADS-PLATFORM-AUDIT-2026-11-01.md`
**Rule:** nothing in Phases 3–12 starts on the backend until the decisions in §9 are answered.

---

## 1. Where we are starting from

Already built and verified (uncommitted, 67/67 + 30/30 + 18/18 passing): the **SokoHai Marketplace Ads Studio**
(`js/app/101-marketplace-ads-studio.js`, `css/43-marketplace-ads-studio.css`) — 6 views, a 7-step wizard for
Products / Services / Transport, live preview built from the real card renderer, campaign list grouped by real
state, draft + submit through `creativeSaveDraft` / `creativePublish`, admin-only placement settings surfaced
read-only for sellers.

This plan **grows that studio into the 11-section platform** rather than replacing it.

---

## 2. Phase 2 — Information architecture (11 sections)

```
Muhtasari            Overview            ← real: counters, states · planned: charts, alerts
Tengeneza            Create Advertisement ← real: 10-step-capable wizard (currently 7)
Kampeni Zangu        My Campaigns         ← real: list/details/filters · planned: pause/duplicate/extend
Maktaba ya Ubunifu   Creative Library     ← planned (reads existing `creatives`)
Hadhira & Walengwa   Audience & Targeting ← planned (server already honours regions/categories/keywords)
Mahali pa Kuonekana  Placements           ← partial (admin-set today; seller read-only)
Uchanganuzi          Analytics & Reports  ← planned (needs owner-scoped metrics read)
Bajeti & Malipo      Budget & Billing     ← decision required (§9.1)
Fedha & Ankara       Transactions & Invoices ← decision required (§9.1)
Arifa                Notifications        ← planned (server writers into `notifications`)
Mipangilio & Msaada  Settings & Help      ← real: identity, eligibility counts, billing stub
```

**Navigation rules**

* Desktop ≥ 1024 px: 232 px left rail, grouped — *Create* (Tengeneza), *Manage* (Kampeni, Maktaba, Arifa),
  *Insight* (Uchanganuzi, Bajeti, Fedha), *Config* (Hadhira, Mahali, Mipangilio). No more than 3 items per group.
* Tablet 640–1023 px: the same rail collapses to a horizontal, scrollable chip rail; groups become separators.
* Mobile < 640 px: rail becomes a bottom sheet opened from a "Sehemu" button; the primary action
  (**Tengeneza**) stays a fixed, full-width button in the header.
* A section that has no backend support yet shows an **honest state** — what it will show, what is required, and
  who can enable it. It never renders fake numbers.

---

## 3. Phase 3 — Overview dashboard (real vs unavailable)

| Metric | Source today | Display rule |
|---|---|---|
| Impressions | `announcements.viewCount` (real) | show |
| Clicks / CTR | `announcements.clickCount` (real) | show |
| Active / Pending / Draft campaigns | `moderationStatus` + `lifecycle()` state | show |
| Viewable impressions, dismissals, rendered | `adDeliveryMetrics` (**rule-blocked**) | "Inahitaji uidhinishaji" until WP3 |
| Reach / Frequency | not aggregated anywhere | **not available** (never 0) |
| Conversions / Attributed revenue / ROAS | **no data model exists** | **not available** |
| Total spend / Budget remaining | **no money model** | **not available** |

Charts (after WP3): impressions & clicks per day from `adDeliveryMetrics.daily*` + a campaign comparison table.
Until then the chart area shows the real `viewCount`/`clickCount` series that is already readable, labelled
"impressions (legacy counter)" so the wording never overstates what it measures.

Date filters: 7 / 30 / 90 days (90 = the engine's analytics retention). Anything older is explicitly
labelled *historia haipatikani* rather than shown as a drop.

---

## 4. Phase 4 — Creation flow (extend the current 7 steps to 10)

| Step | Today | Addition |
|---|---|---|
| 1 Type | ✅ product / service / transport | — |
| 2 Listing | ✅ eligible-only, reasons shown | — |
| 3 Review listing | ✅ read-only facts + real card | add media review (all listing images) |
| 4 Creative content | ✅ headline / description / offer / badge / CTA | add creative library reuse (WP8) |
| 5 Objective & placement | ⚠ read-only for sellers | objective = delivery goal (impressions) · placement = read-only until §9.5 |
| 6 Audience | ❌ | region / category / keyword / entity-type pickers (server already supports these) |
| 7 Budget & bidding | ❌ | **delivery goal only** (daily/total impressions) until §9.1 decides money |
| 8 Schedule | ✅ dates + priority | — |
| 9 Preview | ✅ real card + listing comparison | — |
| 10 Review & submit | ✅ approval-state aware | add required-acknowledgement summary |

Drafts and progress are already preserved in `S.draft`; WP2 adds server-side draft persistence guidance note
(the creative itself is already saved through `creativeSaveDraft`).

---

## 5. Work packages

Each package lists: scope · backend change · authorisation · validation · audit · tests · risk.

### WP1 — IA expansion (UI only) — *can start immediately*

* Restructure the studio nav to the 11 sections with grouped, responsive rails.
* Sections without backend show the honest "what this needs" state.
* Overview gets date filters over the *readable* counters, plus explicit "not available" tiles.
* No writes. No schema. **Tests:** extend `ads_studio_rebuild_verify.mjs` with nav/IA checks (all 11 sections
  reachable, no section renders `0` for an unavailable metric, responsive at 390/820/1440).
* **Risk:** low.

### WP2 — Seller lifecycle (`pause / resume / archive / duplicate / extend`)

* **Backend:** new callable `adsSetMyCampaignLifecycle` (functions/ads-delivery.js or a sibling module):
  `{ campaignId, action: 'pause'|'resume'|'archive' }`.
  Authorisation: `request.auth.uid` must equal the campaign `advertiserId` (admins may act on any).
  Validation: transition table only (`active→paused`, `paused→active`, `*→archived`); never touches money,
  placements or moderation.
  Audit: `writeAudit('CAMPAIGN_' + action)`.
* `duplicate` = client-side copy: new creative via the existing `creativeSaveDraft` + `creativePublish` path
  (no new write surface); `extend` = schedule update, needs the same callable with `endAt` + bounds.
* **Tests:** new `tools/test_ads_lifecycle_contract.mjs` (transition matrix, ownership, audit) + Playwright flow.

### WP3 — Owner-scoped metrics read

* **Backend:** `adsGetMyCampaignMetrics({ campaignIds?[], from, to })` — verifies ownership for every id,
  returns only aggregate counters (no per-user events, no PII). Rate-limited.
* Powers Overview charts, Analytics breakdowns and CSV export (export is a client-side CSV of what the callable
  returned — no new endpoint).
* **Tests:** ownership matrix (other seller → `permission-denied`), shape/size caps, no `ownerKey`/`sessionKey`
  leakage.

### WP4 — Audited ad review (admin governance, Phase 12)

* **Backend:** `adsModerateCampaign({ campaignId, action: 'approve'|'reject'|'suspend', reason })`
  — admin claim required, `reason` mandatory (≥ 5 chars), writes `moderationStatus`, `moderatedAt/By`,
  `rejectionReason`, `writeAudit('CAMPAIGN_REVIEW')`, and a notification to the advertiser (WP5 writer).
* Seller sees the rejection reason on the campaign row and in review step 10.
* **Tests:** non-admin → denied, missing reason → denied, rejected campaign stops serving (delivery engine
  already gates on `moderationStatus`), audit entry exists.

### WP5 — Ad notifications

* **Backend:** a small writer using the **existing** `notifications` collection shape
  `{userId, title, body, type:'ads', link, createdAt, read:false}` — triggered by: submitted, approved,
  rejected, started, paused, completed, low goal (≥ 80 % of daily/total impressions), goal exhausted.
* **Frontend:** the Arifa section reads `notifications` where `userId == uid` (already permitted by rules).
* **Tests:** writer contract + link targets resolve to the campaign row.

### WP6 — Budget & Billing (Phase 6, 14) — **decision required**

Two clearly separated options; the recommendation is **A then B**.

* **A · Delivery goals (no money)** — *ships now, no financial risk.*
  Seller sets `goals.dailyImpressions` / `goals.totalImpressions` through a new owner-scoped callable
  `adsSetMyCampaignGoals` (ownership-checked, bounded 0…1 000 000 000, admin-overridable). The engine already
  paces and auto-completes on these values (`ads-delivery-core.js:187, 241`). UI shows *goal progress*,
  *estimated days remaining* (from real daily delivery), and *goal exhausted* warnings — never currency.
* **B · Money budget & billing** (CPC/CPM/CPA/invoices/receipts/reserved funds) — *requires all of:*
  1. a pricing model decision (CPM vs CPC vs fixed-placement);
  2. a payment provider decision (PesaPal top-up vs wallet transfer) and a **separate ad-funds balance** so
     advertising money is never mixed with shopper wallet balances (brief's explicit requirement);
  3. a settlement design: reserve → spend → reconcile, with idempotent ledger ids (same discipline as
     `escrow_holds`), server-only writes, no client-side arithmetic;
  4. refund/void handling and invoice numbering;
  5. finance review of every transaction path.
  This is multi-week, financial-core work and is **not** started in this phase.

### WP7 — Conversions & attribution (Phase 9, 15) — **decision required**

No conversion data exists today. Building it honestly means:

1. Emit a server-side **conversion event** when an existing, already-authoritative action happens on a
   promoted listing: order paid (products), inquiry/booking created (services), transport request created.
   These flows already write their own documents — the ad link is carried as `adCampaignId` in the write.
2. Write an **attribution record** only when the visitor's ad interaction is provable: `clicked` event within a
   defined window (proposed **7-day click / 1-day view**, recorded server-side).
3. Revenue for products = order value **actually paid** (already in the escrow path); services/transport =
   *inquiries*, which are **not revenue** and must be labelled "maulizo" not "mapato".
4. Until 1–3 exist, Overview/Analytics render *not available*. **No modelled, estimated or back-filled numbers.**

### WP8 — Creative library (Phase 10)

Read-only over `creatives` (owner + admin), grouped by type, with headline/description/CTA variants, media
thumbnail, validation result (`validateCreative`), and "use in new campaign" that pre-fills the wizard.
No duplicate catalogue: listing media is referenced, never copied.

### WP9 — Placements (Phase 8)

Server `PLACEMENTS` currently has `home, discover, search, product_detail, service_detail, chat, groups, live,
auction, group_buy, price_drop, dashboard`. Proposed additions (server change, same validation path):
`transport_detail`, `service_discovery`, `category_listing`, `related_listing`.
Seller-facing choice stays **read-only** until §9.5; the studio will show which placements a campaign actually
has, sourced from the campaign document (real values, not a mock).
Presentation rules stay as they are today: sponsored cells identical in width to ordinary cards, small
*Sponsored* chip, no oversized featured blocks.

### WP10 — Admin governance (Phase 12)

Extend the existing admin campaign manager (do **not** create a second one): review queue (pending only) using
WP4, rejection reasons, suspend/remove, placement editing (existing `adsUpdateCampaignDelivery`), category
restrictions, invalid-click monitoring from `adDeliveryEvents` dedupe counters, billing oversight (only once
WP6-B exists), audit log viewer via `adminAuditQuery`, platform-wide reporting.

---

## 6. Phase 14 — data model mapping (concept → real home)

| Concept | Home today | Action |
|---|---|---|
| Advertiser | `users/{uid}` + `publicProfiles` | reuse |
| Campaign | `announcements` | reuse (no new collection) |
| Advertisement / Creative | `creatives` | reuse |
| Promoted listing | `announcements.linkedEntity/destination` | reuse |
| Placement | `announcements.placements[]` | extend list (WP9) |
| Audience configuration | `announcements.target*` fields | reuse (UI only in WP1) |
| Delivery goal (budget-like) | `announcements.goals` | reuse, expose via WP6-A |
| Budget (money) / Spend ledger | **none** | new, only if WP6-B approved |
| Impression / Click event | `adDeliveryEvents`, `creativeEvents` | reuse (reached via WP3) |
| Conversion event | **none** | new, only if WP7 approved |
| Attribution record | **none** | new, only if WP7 approved |
| Billing transaction / Invoice | **none for ads** | new, only if WP6-B approved |
| Campaign review | `announcements.moderationStatus` + audit log | reuse + WP4 |
| Analytics aggregate | `adDeliveryMetrics` | reuse (+ optional daily rollup inside the existing sweep) |

**Non-negotiables for any new piece:** server-only writes, explicit ownership/admin checks, bounded inputs,
idempotency keys, audit entries for state changes, and a contract test in `npm test` before it ships.

---

## 7. Phase 13 — design system applied to 11 sections

Unchanged tokens: white/light surfaces, `#18A982` primary, supporting blue `#3B82F6`, gold `#D4A72C`, Inter,
1 px `#E2E8F0` borders, 12–16 px radii, compact cards, no full-width banners, no oversized ad cards.
New in this phase: one component set (stat tile, metric-with-source label, status chip, campaign row, section
header, empty state, "not available" tile) reused across all 11 sections so nothing drifts.
`unavailable ≠ 0`: unavailable metrics render a dash plus a reason — a visual rule, not a copy rule.

## 8. Phase 15 — acceptance matrix

| # | Lifecycle step | How it is proven | Status |
|---|---|---|---|
| 1 | Select eligible listing | Playwright, all 3 types | ✅ built |
| 2 | Create campaign | Playwright, intercepted writes | ✅ built |
| 3 | Configure placement & targeting | placement read-only today; targeting after WP1/WP9 | ⚠ partial |
| 4 | Set budget & schedule | schedule ✅; goal-based after WP6-A | ⚠ partial |
| 5 | Preview | real renderer, per type | ✅ built |
| 6 | Submit | `creativePublish`, pending for non-admins | ✅ built |
| 7 | Approve / reject | needs WP4 | ❌ |
| 8 | Start campaign | sweep + `lifecycle()` | ✅ server-side |
| 9 | Record delivery & engagement | leases + `adsTrackDeliveryEvent` | ✅ server-side (not seller-visible) |
| 10 | Record conversions | needs WP7 | ❌ |
| 11 | Analytics | after WP3 | ❌ seller-visible |
| 12 | Spending/budget update | needs WP6 | ❌ |
| 13 | Complete / pause / resume | engine ✅ · seller action after WP2 | ⚠ partial |
| 14 | Reports | CSV export after WP3 | ❌ |
| — | Permissions & failure scenarios | new contract tests per WP + existing 67/30/18 suites | ✅ per WP |

---

## 9. Decisions needed before any backend work

1. **Money now or later?** — A) ship **delivery goals** (impressions) now and keep billing Coming Soon;
   B) start the financial build (pricing model + provider + separate ad-funds ledger + invoices) in this cycle.
2. **Seller lifecycle** — approve `adsSetMyCampaignLifecycle` (pause/resume/archive/extend) with ownership
   checks and audit? (needed by Phases 5 and 15-step-13).
3. **Metrics access** — approve `adsGetMyCampaignMetrics` so sellers can see real delivery metrics that are
   currently rule-blocked? (needed by Phases 3, 9).
4. **Attribution** — approve conversion capture from paid orders / service inquiries / transport requests, with
   a **7-day click / 1-day view** window? Without it, conversions, revenue and ROAS stay *not available*
   forever — showing them any other way would mean inventing data.
5. **Admin review** — approve `adsModerateCampaign` (approve/reject/suspend + mandatory reason + audit +
   notification)? (needed by Phase 12).
6. **Placements** — approve adding `transport_detail`, `service_discovery`, `category_listing`,
   `related_listing` to the server placement list, and whether sellers may choose placements or stay read-only.

## 10. Proposed sequence

| Order | Package | Type | Blocked by |
|---|---|---|---|
| 1 | **WP1** IA + honest Overview | UI only | nothing |
| 2 | **WP3** metrics read + **WP2** lifecycle | small backend | decisions 2, 3 |
| 3 | **WP5** notifications + **WP4** review | medium backend | decisions 5 |
| 4 | **WP6-A** delivery goals + **WP9** placements | medium backend | decisions 1A, 6 |
| 5 | **WP8** creative library | UI only | nothing |
| 6 | **WP7** conversions/attribution | large backend | decision 4 |
| 7 | **WP6-B** money budget, billing, invoices | large financial | decision 1B + finance review |

Everything above keeps the current guarantee: **no destructive migration, no historical campaign touched, no
unrelated module modified, no production deploy, no merge to `main`.**
