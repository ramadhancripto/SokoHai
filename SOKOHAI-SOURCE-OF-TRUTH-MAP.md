# SokoHai Source-of-Truth Map

**Status:** Initial repository audit map; implementation and schema migration are not included.
**Date:** 2026-09-26

## 1. Authoritative map

| Domain | Current authoritative source / evidence | Discover or dashboard role | Current gap / caution |
|---|---|---|---|
| User identity | Firebase Auth plus `users` and `publicProfiles` | Read privacy-safe public projection | Keep private account data out of search |
| Business | Existing `businessName`, onboarding, offline/agent fields; no confirmed canonical Business collection found in audit | Future reference only | Needs canonical entity contract and migration plan |
| Store | `js/app/29-seller-store.js` seller profile/store-like UI; `storeName`/`shopName` compatibility fields | Future store reference | No confirmed canonical Store source found |
| Seller mode | Existing `businessMode` / `online_only`, `offline_only`, `hybrid` | Capability gating | Normalize without breaking existing values |
| Product | `products`; product foundation and showcase modules | Projection/reference | Do not create `discoverProducts` or `storeProducts` |
| Taxonomy | Existing product foundation/category/attribute logic and market filters | Reusable classification | Audit all current vocabularies before centralizing |
| Variant | Product document variant/options structures and existing product form logic | Product reference only | Must remain part of Product authority |
| Stock | `products.stock`, `availabilityStatus`, POS flows, `stock_transfers` and related operational collections | Read projection only | No single proven server-authoritative inventory ledger yet |
| Order | `orders`, negotiation/order flows, checkout and order UI | Action bridge only | Never duplicate as Discover order |
| Payment | PesaPal/SokoPay callable functions and payment collections | Action bridge only | Keep server-authoritative |
| Delivery | Delivery functions, `delivery_events`, tokens/custody collections, routing modules | Action bridge only | Do not reproduce state in Discover |
| Chat | `conversations`, messages, Chat modules | Chat action | Contact policy must be respected |
| Reviews | `comments` and review/engagement modules | Read projection; writes through existing review authority | Do not infer purchase from review/view/chat |
| Engagement | Followers, likes, saved products, watches, recommendation events | Read/action adapters | Keep event types separate |
| Live | Existing Live modules and records | Reference/action bridge | No Discover-owned live records |
| Ads | `announcements`, Ads delivery functions, creative modules | Placement/context input only | Do not change eligibility, targeting, frequency, or tracking |
| Location | Existing map onboarding/location fields and location utilities | Privacy-safe area/distance | Exact private coordinates must not become public by default |
| Discover | Current legacy Discover UI disabled/removed; historical docs are not active implementation | Future projection/query only | Re-audit active search before rebuilding |

## 2. Non-authoritative projections

The following may be derived views or indexes only:

```text
discover_index
seller dashboard metrics
store product list projection
search result cards
nearby result buckets
```

They must carry references to authoritative records and must never accept client writes that bypass ownership, inventory, order, payment, or privacy authority.

## 3. Required ownership invariants

```text
Auth/Profile -> User identity
Business -> business ownership and policy
Store -> physical/commerce presence
Products -> product and variant identity
Inventory -> quantity and reservation authority
Orders -> committed order authority
SokoPay -> payment/escrow authority
Delivery -> custody/delivery authority
Chat -> conversation/message authority
Reviews -> review authority
Discover -> search projection only
```

## 4. Safe implementation guardrails

Before creating any collection, function, or UI module:

1. Search the repository for an existing owner.
2. Confirm the source-of-truth owner and write path.
3. Confirm Firestore rules and server-authority implications.
4. Add a focused contract test.
5. Add an adapter or extend the existing owner where possible.
6. Keep migration compatibility fields until production data is migrated and verified.

## 5. Current audit conclusion

The repository has substantial reusable Product, seller profile, POS, order, payment, delivery, Chat, engagement, and Ads infrastructure. It does not yet provide sufficient evidence for a safe one-shot implementation of the entire requested Business/Store/Inventory/Universal Discover system.

The correct next step is a focused implementation plan beginning with canonical Business/Store contracts and inventory ownership, not a parallel system and not a wholesale replacement of existing modules.
