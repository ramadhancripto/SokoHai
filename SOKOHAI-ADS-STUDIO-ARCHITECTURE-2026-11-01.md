# SokoHai — Marketplace Ads Studio: architecture map
**Date:** 2026-11-01 · **Branch:** `improve/phase1-audit-upload-fix` · Read-only audit, no data written.

This map records what exists **before** the rebuild, so that the new Ads Studio reuses the
working machinery instead of duplicating it.

---

## 1. Existing frontend components

| Module | Role | Faith in rebuild |
|---|---|---|
| `js/06-announcement.js` | Canonical ad **card renderer** `skhAdvertisementCardHtml` + local campaign store `skhLocalActiveCampaigns` + targeting filter | **Reused as-is** |
| `js/app/16-pos-admin-jobs.js` | Admin "Advertisement Designer" (`skhAdFormHtml`, `submitAnnouncementForm`) + Campaign Manager (`renderAnnouncementManagerList`, `skhAdminAdState`) + Delivery Settings dialog (`skhOpenAdDeliverySettings`) | **Retired from the seller path**, kept for admins |
| `js/app/95-creative-studio.js` | `SokoHaiCreativeStudio` — advanced canvas editor; already has `applyEntity()` entity linking and a publish sheet | **Reused** (open-in-place from the new studio for advanced editing) |
| `js/app/96-ad-delivery-controller.js` | Slot discovery, delivery request, viewability, tracking, `refreshSlot/refreshAll/pauseSlot/resumeSlot` | **Reused untouched** |
| `js/app/99-ads-marketplace.js` | In-feed sponsored cell injection + true-size studio preview | **Extended** (services/transport feeds) |
| `js/app/creative/creative-model.js` | `createCreative`, `normalizeCreative`, `applyEntity(entity, sourceType)`, `validateCreative` | **Reused** — this is the linking primitive |
| `js/app/creative/basic-ad-creative.js` | `buildBasicCreative`, `validateBasicCreative` wrappers | Reused |
| `shared/ads-design-rules.js` | Creative validation rules, `creativeToAdvertisement`, limits | **Reused, unmodified** |
| `js/app/39-market-ranking.js` | `listingEligible(x)` — canonical listing eligibility predicate | **Reused** for eligibility + reasons |
| `js/app/00-bootstrap.js` | `skh.ProductPostCard`, `skh.ServicePostCard`, `skh.TransportPostCard`, `skh.CommercePostCard` — the marketplace card components | **Reused** for previews and ad presentation |
| `css/38-home-ad-manager.css`, `css/41-ads-marketplace.css`, `css/42-ads-studio.css` | Designer + in-feed + studio presentation | 41/42 stay; new `43` for the rebuilt studio |
| `html/03-modals-core.html` | Advertiser shell (Overview / Creative Studio / Billing) | Entry points re-pointed to the new studio |

## 2. Data structures (Firestore)

| Collection | Key fields | Notes |
|---|---|---|
| `products` | `userId` (owner), `title`, `price`, `image/imageUrl`, `location/region`, `stock`, `status/availability`, `category`, `shopName` | Advertisable listing |
| `services` | `userId` (owner), `title/serviceName`, `servicePrice/price`, `image`, `serviceArea/location`, `providerName` | Advertisable listing |
| `delivery` | owner (`userId`/`driverId`), `company/driverName/title`, `pickupRegion`, `destinationRegion`, `vehicleType`, `price` | Transport; note the collection is **`delivery`**, not `drivers` (the marketplace *feed* is called `drivers`) |
| `creatives` | `ownerId`, `canvas`, `layers`, `linkedEntity {type,id}`, `destination {type,id}`, `category`, `startAt/endAt`, `priority`, `status`, `publishedVersion` | Client-writable by its owner (status DRAFT/PREVIEW/READY) |
| `announcements` | `advertiserId`, `entityType`, `entityId`, `linkedEntity`, `creativeId`, `status`, `moderationStatus`, `active`, `archived`, `priority`, `startAt/endAt`, `viewCount`, `clickCount`, delivery metadata (`placements`, `targetEntityTypes`, `goals`, …) | **Read-your-own** only; browser create/update is admin-only |
| `creativePublications`, `creatives/{id}/versions` | Immutable publication + version snapshots | Written by the publish function |

## 3. Creation / publishing workflow (backend, unchanged)

```
client: persist creative            → creatives/{id}         (rules: owner, status DRAFT/PREVIEW/READY)
        creativeSaveDraft           → announcements/{id}     (draft; owner checked server-side)
        creativePublish             → versions + publication + announcements
                                      status = published | moderation_pending
                                      active = isAdmin
        adsUpdateCampaignDelivery   → placement/targeting/goals/lifecycle   (ADMIN ONLY)
```

`functions/creative.js` already implements **listing-linked advertising**:

* `ENTITY_COLLECTIONS = { product:'products', service:'services', transport:'delivery', seller, business }`
* `canonicalEntity()` re-reads the listing **server-side** and enforces ownership
  (`ownerId|sellerId|userId|uid|providerId|driverId` must contain the caller's uid — admins bypass).
* Publish requires `creative.destination.id === linkedEntity.id`, otherwise `failed-precondition`.
* Non-admins are forced to `moderationStatus: 'pending'`, `active: false`.
* On replace, the existing delivery metadata (`placements`, `targetEntityTypes`, `goals`, …) is carried over.

**Conclusion: the "advertise an existing product / service / transport listing" capability already exists
end-to-end on the backend. What is missing is only the UI that uses it.**

## 4. Placement & rendering

* Server placements: `home, discover, search, product_detail, service_detail, chat, groups, live, auction, group_buy, price_drop, dashboard`. There is **no dedicated transport placement**.
* Campaign types: `business, product, service, event, announcement, promotion, partnership, community, sokohai_announcement, other`.
* Slots are discovered from `data-skh-ad-slot` + context attributes, including `data-skh-ad-entity-type`, which the delivery controller already uses as targeting context.
* `projectAnnouncement()` derives the announcement's `headline/brandName/image/price/link` from the creative layers; the ad card is rendered by the canonical renderer for every placement.

## 5. Billing / analytics / tracking

* Billing: **UI-only "Coming Soon"** (`html/03-modals-core.html`, `js/app/19-roles.js`). No pricing, wallet or spend code exists for ads. Nothing in the rebuild may create one.
* Delivery policy + metrics: `functions/ads-delivery-core.js` (`DEFAULT_POLICY`: frequency, cooldown, fatigue, viewability, rotation, lease, analytics retention).
* Event tracking: `trackDeliveryEvent`; counters `viewCount` / `clickCount` on the announcement; CTR is computed in the admin Analytics tab.
* Approval: `moderationStatus` + `active`; admins approve. Unchanged.

## 6. Reusable vs. out-of-scope

**Reused:** card renderers, creative model + `applyEntity`, validation rules, publish/draft functions,
delivery controller, eligibility predicate, existing design tokens, existing advertiser shell, existing admin designer.

**Retired from the seller path (not deleted):** the generic 9-section designer form
(`skhAdFormHtml` → Content/Media/Design/Text/CTA/Layers/Animation/Preview/Publish) — it advertises *anything*
and asks sellers to re-type data that already exists in their listing.

**Out of marketplace scope (explicitly not offered in the new studio):** generic banner/“business update”
creatives with no linked listing, external-URL-only ads, and the canvas layer editor as a *primary* flow
(it stays reachable as an advanced editor for the generated creative).

## 7. Required backend changes

**One, found during implementation and applied additively (backward compatible).**

`functions/creative.js` resolved `transport` to the `delivery` collection, but the live Usafiri feed stores
transport listings in **`drivers`** (`functions/index.js` re-types `transport -> drivers`), and `delivery` is
empty in production. `canonicalEntity()` therefore could not resolve a seller's transport listing at all —
a transport ad would be created in the UI and then rejected with *"Linked destination no longer exists."*

The change (already applied, **not deployed**):

```js
// before
const ENTITY_COLLECTIONS = { …, transport:'delivery', … };
const snap = await db.collection(collection).doc(id).get();

// after — first-wins list, `delivery` kept so historical docs still resolve
const ENTITY_COLLECTIONS = { …, transport:['delivery','drivers'], … };
for (const collection of collections) { …if (candidate.exists) { snap = candidate; break; } }
```

* No document is read twice, moved, rewritten or deleted; no migration, no backfill.
* `delivery` stays first, so any existing/legacy transport announcement resolves exactly as before.
* Ownership (`ownerId|sellerId|userId|uid|providerId|driverId`) and the admin gate are untouched.
* The studio's listing query mirrors the same order (`collections:['drivers','delivery']`).
* Locked by `tools/test_ads_studio_transport_link.mjs` (11 checks, wired into `npm test`).

**Everything else needs no backend change.** Listing-linked create → draft → submit → moderate → serve is
fully supported by `creativeSaveDraft` / `creativePublish` / `ads-delivery*` today.

Two capabilities remain admin-only by design, and the new studio therefore **displays them without offering
fake controls**:

1. `adsUpdateCampaignDelivery` (placements, targets, goals, pause/resume) requires an admin token.
   Sellers can submit; placement/targeting/budget is set by operations. Surfaced read-only with the reason.
2. `announcements` browser writes are admin-only, so a seller cannot pause/resume/archive from the client.
   Those actions are shown only to admins.

If seller-side placement choice or self-serve pause is wanted later, it needs a new callable
(`adsSetMyCampaignPlacements` / `adsSetMyCampaignLifecycle`) with ownership checks — flagged, not invented here.

## 8. Migration / safety

* No schema changes, no destructive migration, no backfill.
* Historical announcements and creatives keep working; the new studio reads the same documents.
* The legacy designer remains in the codebase and reachable for admins; nothing is deleted.
