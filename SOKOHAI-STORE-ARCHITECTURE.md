# SokoHai Store Architecture

**Status:** Audit and production plan only — no application implementation changed in this phase.
**Date:** 2026-09-26

## 1. Scope and decision

This document maps the requested unified Store/Business model onto the existing SokoHai system. It is not a second store implementation and it does not authorize a broad build in one change.

The existing system already has:

- Auth/Profile identity in `users`, `publicProfiles`, and Firebase Authentication.
- A seller entrance in `html/09-admin-sell.html` (`#sellerForm`) with `hybrid`, `offline_only`, and `online_only` values.
- Product records in the `products` collection and product UI in `js/app/01-market.js`, `js/app/07-product.js`, `js/app/39-product-core.js`, `js/app/39-product-showcase.js`.
- Seller profile/store-like UI in `js/app/29-seller-store.js`.
- Seller product management in `js/app/30-seller-products.js`.
- Existing POS/offline inventory flows in `js/app/15-pos-sales.js` and `html/21-scripts.html`.
- Orders, SokoPay, delivery, chat, reviews, followers, engagement, and ads already operating as separate systems.

The current implementation does **not** yet demonstrate a canonical first-class `businesses`, `stores`, or `inventory` entity model. Existing `storeName`, `businessName`, `shopName`, `userId`, `stock`, and `isOffline` fields are compatibility fields, not proof of one normalized Store/Business source of truth.

## 2. Existing-system map

| Requested domain | Current evidence | Safe interpretation |
|---|---|---|
| User/Profile | Firebase Auth plus `users`/`publicProfiles` | Keep as identity source of truth |
| Seller entrance | `#sellerForm`, `businessMode` in onboarding | Reuse; normalize mode vocabulary behind existing UI |
| Store profile | `29-seller-store.js` reads user profile and seller products | Extend only after deciding canonical Store record; do not duplicate per-product store copies |
| Products | `products`, shared product foundation and showcase | Keep as sole product source |
| Taxonomy | Product foundation/category logic and market filters | Extract/reuse only after inventory of current helpers and fields |
| Stock | `products.stock`, POS forms, `offlineStockModal`, stock transfers/rules | Existing stock is mixed into product/POS; no verified authoritative inventory ledger yet |
| Orders | `orders`, negotiation/order code, checkout and SokoPay | Keep order source and server-authoritative payment/delivery paths |
| Physical presence | map onboarding/location fields and offline/agent flows | Reuse location/privacy primitives; do not expose exact private coordinates by default |
| Discover | Prior Discover implementation was removed/disabled in the current working tree; historical architecture docs remain | Build a projection/query layer only after authoritative entities are mapped |

## 3. Target relationship

```text
USER / AUTH PROFILE
        |
        +--> BUSINESS (new canonical entity, phased)
                |
                +--> STORE (commerce/physical identity, phased)
                |      +--> existing PRODUCTS by reference
                |      +--> existing SERVICES by reference
                |      +--> INVENTORY projection/ledger (phased)
                |      +--> existing ORDERS
                |      +--> existing DELIVERY / SOKOPAY
                |
                +--> DISCOVER PRESENCE / PROJECTION (reference only)
```

A Store must not own copied product documents. A Discover record must not become another product, stock, order, or store database.

## 4. Proposed canonical entity boundaries

### Business

A future canonical Business document should contain identity and business-level policy only:

```text
businessId, ownerUid, businessName, businessType, sellerMode,
categoryId, subcategoryId, description, verificationStatus,
contactPolicy, visibility, status, createdAt, updatedAt
```

### Store

A future Store document should contain commerce/physical presence only:

```text
storeId, businessId, ownerUid, storeName, logo, cover,
categoryId, subcategoryId, sellerMode, locationRef, openingHours,
pickupAvailable, deliveryAvailable, verificationStatus, status,
createdAt, updatedAt
```

These are target contracts, not a request to create collections during this audit phase.

## 5. Compatibility rules

1. Existing `products` remain authoritative for products.
2. Existing `orders`, payment, escrow, and delivery remain authoritative for those domains.
3. Existing seller profile UI may be adapted to read a canonical Store record later, but must retain a compatibility fallback during migration.
4. Existing `products.stock` must not be silently deleted or reinterpreted until a migration and server-side authority are implemented.
5. `offline_only` must not create fake online stock, cart, checkout, or online orders.
6. Switching modes must be a state transition, not account recreation.
7. Historical orders/products must not be deleted when commerce is deactivated.
8. No Firestore rules weakening is acceptable.

## 6. Recommended build sequence

### Phase 1 — audit (current phase)

- Inventory current fields, collections, functions, UI entrances, and rules.
- Freeze a source-of-truth map.
- Identify compatibility fields and migration risks.
- Add contract tests before adding data models.

### Phase 2 — canonical identity contracts

- Introduce Business/Store contracts only after rules, ownership, and migration design are reviewed.
- Add references to existing seller/product records rather than copying records.
- Preserve old fields during a compatibility window.

### Phase 3 — mode-aware Store UI

- Reuse the existing seller entrance.
- Show commerce controls only for `online_only`/`hybrid`.
- Show physical-presence controls for `offline_only`/`hybrid`.

### Phase 4 — inventory authority

- Design server-authoritative inventory operations and history.
- Reconcile legacy `products.stock` safely.
- Test concurrent reserve/release/sell behavior before changing checkout.

### Phase 5 — Discover projection

- Project authoritative Product, Store, Business, Service, Place, and approved public identity references.
- Keep privacy and contact policy at projection/query time.

## 7. Explicit non-goals for this phase

- No new Business/Store/Inventory collections yet.
- No migration of existing production data yet.
- No replacement of Product, Order, Chat, Delivery, SokoPay, or Auth.
- No new Discover UI yet.
- No rules changes.
