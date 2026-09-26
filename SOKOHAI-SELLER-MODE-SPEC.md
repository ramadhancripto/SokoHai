# SokoHai Seller Mode Specification

**Status:** Audit-derived contract and rollout plan; no seller-mode implementation changed in this phase.
**Date:** 2026-09-26

## 1. Current implementation findings

The existing UI already has one seller form and three mode values:

```text
online_only
offline_only
hybrid
```

Evidence:

- `html/09-admin-sell.html` contains the seller form and all three options.
- `html/21-scripts.html` contains onboarding mode cards.
- `js/app/14-map-onboarding.js` uses `businessMode` and branches behavior for `offline_only` versus `hybrid`/`online_only`.
- `js/app/08-app-state.js` uses product visibility values including `offline_only` and `hybrid`.
- `js/app/15-pos-sales.js` writes offline/POS products into the existing `products` collection.
- `js/app/00-bootstrap.js` and offline-member/agent flows contain existing account and business compatibility fields.

This means the requested mode concept should be integrated into the existing entrance, not implemented as a second onboarding system.

## 2. Canonical mode semantics

| Mode | Physical presence | Online commerce | Allowed product behavior |
|---|---:|---:|---|
| `online_only` | Optional/hidden by policy | Active | Product, price, variants, stock, cart, order, payment, delivery according to existing rules |
| `offline_only` | Active | Inactive | Physical identity/services/offerings; no invented online stock, cart, checkout, or online order |
| `hybrid` | Active | Active | Both surfaces reference the same Business/Store/Product/Inventory records |

The existing `hybrid` value is the compatibility name for the specification's `ONLINE + OFFLINE` mode.

## 3. One entrance

```text
WEKA BIASHARA / POST
        |
        +--> SELLER MODE
                +--> ONLINE
                +--> OFFLINE
                +--> ONLINE + OFFLINE
```

The implementation must reuse `#sellerForm` and the existing onboarding form. Do not introduce another seller registration modal, account type, or parallel submission path.

## 4. Mode capabilities

### Online

Use existing product/order/payment/delivery systems. The future Store identity should link to products; it must not copy products into a store-specific collection.

### Offline

The UI should expose only physical business identity, offerings/services, location, contact, privacy, optional photos, and Discover presence. It must not write a fake online inventory record merely to make the profile searchable.

Existing POS functionality is separate from public ecommerce availability. If POS inventory is retained, it must be labeled and reconciled explicitly rather than assumed to be online availability.

### Hybrid

Expose both physical and commerce management while keeping the same product and order records. The physical location is Store/Business metadata; it is not a second product feed.

## 5. State transitions

Allowed transitions:

```text
OFFLINE -> HYBRID
HYBRID  -> OFFLINE
ONLINE  -> HYBRID
HYBRID  -> ONLINE
```

Transition requirements:

- Keep the same `ownerUid` and identity.
- Keep Business/Store/location/reviews/followers/history.
- When commerce is disabled, mark commerce inactive; do not delete historical products or orders.
- When commerce is enabled, require explicit product/inventory setup; do not fabricate stock.
- Re-evaluate visibility and contact policy server-side.

## 6. Data contract proposal

Until canonical Business/Store documents exist, current compatibility fields must remain readable:

```text
businessMode: online_only | offline_only | hybrid
businessId: nullable during migration
storeId: nullable during migration
ownerUid/userId: existing owner reference
isOffline: compatibility projection only
isOnline: compatibility projection only
```

The long-term source of truth should be `sellerMode` on Business/Store, with old fields derived during a controlled migration. This should not be changed casually in a client-only patch.

## 7. Permission requirements

- Auth identity remains Firebase Auth/Profile.
- Business/Store ownership must be checked against the authenticated owner.
- Product ownership remains validated by the existing product rules/functions.
- Inventory and order/payment transitions must remain server-authoritative.
- Agents may assist an offline member but must not become the owner of that member's business.

## 8. Required acceptance tests for a future implementation

1. One entrance exposes all three modes.
2. Offline creation does not create online cart/checkout capability.
3. Online creation uses existing Products and Orders.
4. Hybrid exposes both paths without duplicate records.
5. Offline-to-hybrid preserves identity, location, reviews, and followers.
6. Hybrid-to-offline preserves historical products and orders while disabling new commerce where required.
7. Unauthorized users cannot edit another Business/Store.
8. No frontend-only mutation reports authoritative success on network failure.
9. Mode filtering and visibility work with existing navigation and back behavior.
10. Existing product, order, chat, delivery, SokoPay, and auth tests remain green.

## 9. Not implemented in this audit phase

No seller-mode code, Firestore schema, rules, or migration was changed. This document is the contract to review before implementation.
