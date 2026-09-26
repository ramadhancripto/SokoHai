# SokoHai Discover Architecture

**Status:** Audit and target architecture; no new Discover implementation was built in this phase.
**Date:** 2026-09-26

## 1. Current state

Historical Discover audit documents describe an earlier canonical stack based on `75-discover-engine.js`, `76-discover-foundation.js`, and `88-discover-complete.js`. Those files are not part of the current active script list in `html/21-scripts.html`, and the current working tree contains the prior Discover-removal work.

The current system still contains reusable discovery-related infrastructure, including:

- `js/20-search-chat.js`
- `js/23-smart-search.js`
- market/product listing and showcase modules;
- `publicProfiles`, `products`, `services`, `drivers`, `chatGroups`, users, reviews, engagement, and location-related existing paths;
- canonical action bridges such as product opening, seller profiles, Chat, Orders, Delivery, and payment flows.

Conclusion: the Discover concept remains valid, but the legacy Discover UI should not be revived blindly. The next implementation must first re-audit the current active search/navigation paths and then add a single projection/query layer.

## 2. Target rule

```text
AUTHORITATIVE ENTITY
        |
        +--> read-only/search projection
                    |
                    +--> Discover query and UI
```

Discover must not own:

- products;
- variants or inventory;
- orders or payments;
- delivery/custody/tokens;
- chat messages;
- reviews;
- user identity;
- business/store ownership.

## 3. Projection contract

A minimal projection/reference should contain only fields needed for authorized search and routing:

```text
projectionId
entityType
entityId
ownerUid/businessId/storeId (only where safe)
categoryId/subcategoryId
locationRef or privacy-safe location bucket
visibility
searchTerms/status
verificationSummary
updatedAt
```

Sensitive fields must not be copied unnecessarily. Projection freshness and source references must be explicit.

## 4. Entity types

The future query layer may support:

```text
product
service
store
business
public_person
transporter
place
community/group
live
```

Each result must retain its authoritative `entityType` and `entityId`. Result cards must route to existing systems:

| Discover action | Existing authority |
|---|---|
| View product | Product detail / product system |
| View store | Seller/store profile, later canonical Store |
| Buy/order | Existing cart/checkout/order |
| Chat/contact | Existing Chat/contact policy |
| Request service | Existing service/negotiation flow |
| Directions | Existing location/map mechanism |
| View place | Place authority, once introduced and reviewed |

## 5. Intent and nearby search

A future search pipeline should be:

```text
query
  -> intent and entity classification
  -> taxonomy/category filters
  -> privacy-safe location filter
  -> authorized projection query
  -> result normalization
  -> existing action bridge
```

Examples such as `fundi simu karibu`, `mchele karibu`, or `duka la nguo` must not cause the client to guess a role or expose private exact coordinates.

Location policy:

```text
PRIVATE | AREA | APPROXIMATE | PUBLIC | CUSTOM
```

Private identities should be represented by an approximate distance or area only when permitted.

## 6. Privacy and verification

Discover display must distinguish:

- identity verified;
- business/store verified;
- professional role verified;
- self-declared role.

A self-declared `Daktari` or `Transporter` must not be rendered as officially verified without an authoritative verification state.

Contact actions must honor policy:

```text
chat | contact_request | phone | hidden
```

## 7. Projection update strategy

The first implementation should avoid a broad backfill until source contracts are stable. Preferred order:

1. Define result normalization and privacy tests.
2. Add adapters over current authoritative collections.
3. Route results to existing Product, Store/Profile, Chat, Order, Service, and map actions.
4. Add projection writes or indexed search only after ownership and freshness rules are defined.
5. Add nearby and natural-language search incrementally.
6. Remove/disable only legacy UI that is proven redundant; preserve shared search, location, engagement, and action infrastructure.

## 8. Required Discover tests

- online store result references the authoritative store/product;
- offline business result does not invent online stock;
- hybrid store exposes physical and commerce actions;
- product result opens existing product detail;
- store result opens existing seller/store profile;
- Chat action uses existing Chat;
- Order/Buy action uses existing checkout;
- service action uses existing service flow;
- nearby search respects location privacy;
- place is not treated as a person;
- role verification is displayed correctly;
- VIEW, CONTACT, CHAT, SAVE, FOLLOW, ORDER, PURCHASE, REVIEW, and SHARE remain separate events;
- stale/unavailable network state does not display a false successful mutation.

## 9. Explicit non-goals for this phase

No Discover UI, search engine, projection collection, place system, or universal query endpoint was created. Existing Product, Search, Chat, Location, Engagement, Auth, Order, Delivery, SokoPay, and Ads infrastructure remains untouched.
