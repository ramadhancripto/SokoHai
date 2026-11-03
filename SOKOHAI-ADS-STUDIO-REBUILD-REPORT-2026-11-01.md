# SokoHai Marketplace Ads Studio — Rebuild Report

**Date:** 2026-11-01 · **Branch:** `improve/phase1-audit-upload-fix` (uncommitted, not merged, not deployed)
**Scope:** replace the generic Ads Creator Studio entry point with a marketplace-only studio for **Products,
Services, Transport & delivery**. Backend, billing, analytics, tracking, campaign records and ad delivery
were to be preserved.
**Evidence:** `audit-shots/PHASE2-ads-studio-overview.png` (contact sheet) · `audit-shots/mas-*.png` (12 shots)
· `audit-shots/mas-verify.json` (per-check results).

---

## 1. What was built

A single new screen — **SokoHai Marketplace Ads** (`#masRoot`, `js/app/101-marketplace-ads-studio.js`) — with
six views and a seven-step wizard.

| View | What the seller gets |
|---|---|
| **Muhtasari** (Overview) | Counts by state (active / awaiting approval / drafts), impressions, clicks · CTR, the three ad types as entry cards, and the flow the wizard follows. |
| **Tengeneza** (Create) | 7 steps: **1** type → **2** pick one of *your* eligible listings → **3** copy & settings → **4** where it will appear (read-only) → **5** schedule (+ priority) → **6** live preview → **7** save draft or submit. Back/next preserve every input; validation names the step that needs fixing. |
| **Kampeni Zangu** | Every campaign grouped by real state — awaiting approval, active, paused, draft, expired, rejected — with the actions that state allows and its existing impressions/clicks/CTR. |
| **Rasimu** | Drafts only, with **Hariri** / **Tuma**. |
| **Utendaji** | Totals plus a per-ad table, computed from the existing counters (`viewCount` / `clickCount`). Nothing new is tracked. |
| **Mipangilio** | Who you are advertising as, eligible listing counts per type, and the billing entry — still **Coming Soon**. |

**Type-aware by construction.** The seller never retypes listing data:

* **Product** — shop, stock, category come from the listing; preview is the sponsored card plus the ordinary
  `CommercePostCard` for comparison.
* **Service** — provider, coverage area, pricing model; no product fields are asked for.
* **Transport & delivery** — provider (company), route (pickup → destination), vehicle category, coverage;
  never treated as a product ad.

Ineligible listings are shown **with the reason** in plain Swahili (draft, archived, rejected, out of stock,
no image, missing title) and cannot be selected.

---

## 2. Modules reused (no second engine, no second design system)

| Reused | Used for |
|---|---|
| `functions/creative.js` → `creativeSaveDraft`, `creativePublish` | **the only** write path for drafts and submissions |
| `js/app/creative/creative-model.js` → `createCreative`, `applyEntity`, `normalizeCreative`, `FORMAT_PRESETS` | creative construction |
| `shared/ads-design-rules.js` → `validateCreative`, `creativeToAdvertisement` | validation (used as the source of truth, see §5) and the ad projection |
| `js/06-announcement.js` → `skhAdvertisementCardHtml` | the real ad card in the preview **and** in the feed |
| `js/app/00-bootstrap.js` → `skh.CommercePostCard` | the real listing card used for side-by-side comparison |
| `js/app/39-market-ranking.js` → `listingEligible` | eligibility primitive, wrapped with Swahili reasons |
| `js/app/16-pos-admin-jobs.js` → `skhAdminAdState` | campaign state vocabulary (admin manager unchanged) |
| `js/app/96-ad-delivery-controller.js`, `js/06-announcement.js` targeting | untouched — delivery/serving behaviour identical |
| `js/app/99-ads-marketplace.js`, `css/41-ads-marketplace.css` | in-feed cell placement and compact presentation (fixed, not replaced — see §5) |
| `js/app/95-creative-studio.js`, `js/app/16-pos-admin-jobs.js` designer | still present, still admin-reachable, no longer the seller's entry point |

## 3. Components replaced

* The seller's entry point (`Advertiser → Create advertisement`) now opens the new studio. The old generic
  designer (Content / Media / Design / Text / CTA / Layers / Animation) is **not deleted** — it stays as the
  advanced editor for admins.
* `window.skhOpenCompanyAdsSoon` and `window.skhAdvertiseOpenEntity` are re-pointed at the studio. Billing
  surfaces (`skhOpenAdvertiserBillingSoon`, `#companyAdsSoonModal`) are untouched and still Coming Soon.
* Presentation is new and scoped (`css/43-marketplace-ads-studio.css`, everything under `#masRoot`): white/light
  surfaces, `#18A982` primary, supporting blue and gold, Inter, fine borders, compact cards, 12–16px radii.

## 4. Backend preserved

* No collection, document, index or rule was created, changed, migrated or deleted.
* No campaign, creative, announcement, billing, analytics or tracking record was touched.
* `announcements` writes stay admin-only; `adsUpdateCampaignDelivery` stays admin-only and is surfaced
  **read-only** with the reason (admins get a "Delivery Settings" button, sellers get an explanation).
* Ownership is still enforced **server-side** in `canonicalEntity()`; the UI only mirrors it.
* Submissions by non-admins are forced to `moderationStatus:'pending'`, `active:false` — no approval bypass.

### One backend change was required (and is the only one)

`functions/creative.js` mapped `transport` → `delivery`, but the live Usafiri feed stores transport listings in
**`drivers`** (`functions/index.js` re-types `transport -> drivers`; `delivery` is empty). A transport ad could
be created in the UI and then be rejected by `canonicalEntity()` with *"Linked destination no longer exists."*

```js
// functions/creative.js — additive, backward compatible, NOT deployed
const ENTITY_COLLECTIONS = { … product:['products'], service:['services'],
  transport:['delivery','drivers'], … };      // `delivery` first: legacy docs win
for (const collection of collections) { if (candidate.exists) { snap = candidate; break; } }
```

No migration, no backfill, nothing moved; the ownership check is unchanged. Locked by
`tools/test_ads_studio_transport_link.mjs` (11 checks, wired into `npm test`).

---

## 5. Bugs found and fixed while verifying (all pre-existing, exposure widened by the rebuild)

| Bug | Effect | Fix |
|---|---|---|
| Preset typography exceeded the canonical rule bounds (`body` 38 px > 36 px max at 1200 px canvas) | *every* submit failed validation with "Body size lazima iwe 12–36 px" | the studio now asks `validateCreative` and clamps only the layers it objects to (`harmonizeCreative`) — no hardcoded copy of the limits |
| Offer/price rendered as an inline-flex pill in a flex row | the price was cut mid-number ("TSh 21") and a solid colour bar could cover it | `display:block` + wrapping actions row in `css/41`, and `normalizeCopyColors` now strips the inline `background` too |
| Transport listings were unfetchable (see §4) | transport ads were impossible | collection list + server fallback |

---

## 6. Tests executed (real runs, this session)

| Suite | Result |
|---|---|
| `tools/ads_studio_rebuild_verify.mjs` (**new**, 67 checks: dashboard, 3 ad types end-to-end, previews, campaign management, marketplace display, mobile + tablet, write-safety) | **67 / 67 pass** |
| `tools/ads_phase1_verify.mjs` (regression) | **30 / 30 pass**, 0 console errors |
| `tools/ads_task01_verify.mjs` (regression) | **18 / 18 pass**, 0 console errors |
| `tools/test_ads_studio_transport_link.mjs` (**new**, 11 checks) | **11 / 11 pass** |
| `tools/test_advertiser_billing_coming_soon_contract.mjs` | **20 / 20 pass** (no billing/payment surface changed) |
| `tools/test_creative_system.mjs`, `test_creator_studio_upgrade.mjs`, `test_unified_ad_designer.mjs` (146), `test_noncanvas_ad_designer.mjs` (56), `test_ads_governance.mjs` (12) | all pass |
| `npm test` | 118 pass, **2 pre-existing failures** (`current Discover engine is removed`, `current Discover completion UI is removed`) — identical on clean `main`, unrelated |
| `python3 tools/build_html.py check` · `node tools/build_dist.mjs --check` | byte-exact / only public files |

**How the demo was kept safe.** No sign-in exists in this sandbox, so the harness installs a **read-only** test
identity in memory (a real seller, so the studio queries that seller's real listings) and intercepts every
write boundary: `addDoc`/`setDoc` on `creatives` and the `creativeSaveDraft`/`creativePublish` callables are
recorded, never executed. **0 Firestore writes** happened; `mas-verify.json` asserts it.

### The 8 required demo items

1. **New dashboard** — `mas-01-overview-desktop.png`
2. **Product ad creation** — full 7 steps in the harness
3. **Service ad creation** — full 7 steps
4. **Transport ad creation** — full 7 steps, facts read route/vehicle, not product fields
5. **Preview for each** — `mas-02-{product,service,transport}-preview.png`
6. **Campaign management** — `mas-03-campaigns.png` (6 states, per-state actions)
7. **Marketplace display of all three** — `mas-05-{product,service,transport}-in-marketplace.png`, rendered by
   the real card renderer inside the real feed grid, matching ordinary card width with the small *Sponsored* chip
8. **Mobile + desktop** — `mas-06-overview-mobile.png`, `mas-06-overview-tablet.png`, `mas-07-*-settings.png`

---

## 7. Remaining limitations (deliberate, not hidden)

1. **Seller-side placement/pause is not offered.** `adsUpdateCampaignDelivery` and `announcements` writes are
   admin-only. Placements and audience are shown read-only with the reason; a future callable
   (`adsSetMyCampaignPlacements` / `adsSetMyCampaignLifecycle`) would be needed. Not invented here.
2. **Budget/spend is Coming Soon** and calls nothing — no ad billing exists (contract-locked).
3. **Nothing was published for the demo.** Item 7 uses the real renderer in the real feed fed by the studio's
   own creatives; a true end-to-end publish needs a real account and a moderator, i.e. production writes.
4. **Serve-side transport placements.** The server has no dedicated transport placement; transport ads ride the
   existing entity-typed slots (`data-skh-ad-entity-type`). Unchanged by this work.
5. **The legacy designer is still reachable for admins** (kept on purpose — deleting it is out of scope).
6. Only the `drivers`/`delivery` mismatch was fixed server-side; the deployed functions were **not** updated.

---

**Awaiting approval before anything is committed, merged or deployed.**
