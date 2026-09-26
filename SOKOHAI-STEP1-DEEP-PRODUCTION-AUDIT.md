# SOKOHAI STEP 1 — DEEP PRODUCTION AUDIT

**Date:** 2026-09-26 (Africa/Dar_es_Salaam)
**Repository inspected:** local SokoHai workspace at `/home/user/sokohai`
**Requested repository:** `https://github.com/ramadhancripto/SokoHai.git`
**Remote status:** no Git remote is configured in this workspace; the audit therefore covers the local repository only.
**Commit inspected:** `0e8bb6c`
**Working tree:** dirty before this audit, with extensive pre-existing UI, Discover-removal, routing, Functions, rules, test, and report changes. Those changes were not reverted.
**Firebase project:** `sokonet-3b847`
**Functions region:** `europe-west1`
**Audit status:** COMPLETE for repository architecture mapping. **No application implementation was added in this Step 1.**

---

## 1. EXECUTIVE ARCHITECTURE MAP

```text
SOKOHAI STATIC FRONTEND
|
+-- index.html / html fragments
|     +-- CSS token/design-system layers
|     +-- Firebase browser SDK modules
|     +-- js/app/* feature modules
|     +-- legacy-compatible js/* modules
|
+-- AUTHENTICATION
|     +-- Firebase Auth in js/app/00-bootstrap.js
|     +-- email/password, Google, custom-token assisted access
|     +-- Auth state -> skh.currentUser/currentUserData
|
+-- USER / IDENTITY
|     +-- users
|     +-- publicProfiles
|     +-- profile and identity layers
|     +-- offline member + assisted agent session
|
+-- HOME / MARKET
|     +-- js/app/01-market.js
|     +-- js/app/07-product.js
|     +-- js/app/39-product-core.js
|     +-- js/app/39-product-showcase.js
|     +-- products, services, drivers
|     +-- category/region/near-me filters
|
+-- BIDHAA
|     +-- Product foundation and creation/editing in app-state/form modules
|     +-- products collection
|     +-- category/subcategory/attribute/variant fields
|     +-- product showcase and seller profile references
|
+-- HUDUMA
|     +-- services collection
|     +-- service forms, search, negotiation and comments
|
+-- USAFIR / LOGISTICS
|     +-- drivers, transport profiles, ride_requests
|     +-- routing.js/routing-core.js/routing-logic.js
|     +-- delivery choice, offers, tokens and custody
|
+-- SELLER / STORE-LIKE EXPERIENCE
|     +-- #sellerForm in html/09-admin-sell.html
|     +-- js/app/29-seller-store.js (public seller profile/store-like view)
|     +-- js/app/30-seller-products.js (seller products/metrics)
|     +-- user storeName/shopName/businessName compatibility fields
|     +-- no confirmed canonical businesses/stores collection in this audit
|
+-- MANAGEMENT / DASHBOARD
|     +-- js/app/03-dashboard.js (ERP-style cockpit shell)
|     +-- js/app/10-dashboard-tabs.js (tab router)
|     +-- js/app/11-analytics.js, 15-pos-sales.js, 16-pos-admin-jobs.js
|     +-- js/app/18-cockpit.js, 19-roles.js, 30-seller-products.js
|     +-- products, orders, shop_ledger, stock_transfers and operational records
|     +-- current dashboard is capability/role mixed, not a clean mode-capability resolver
|
+-- POS / SALES
|     +-- html/09-admin-sell.html and html/21-scripts.html
|     +-- js/app/15-pos-sales.js, 16-pos-admin-jobs.js, 17-hub.js
|     +-- products.stock, shop_ledger and order/sales records
|     +-- some writes are client-side; authority is not one consolidated inventory ledger
|
+-- CART / CHECKOUT / PAYMENT
|     +-- js/app/02-checkout.js
|     +-- js/app/23-smart-cart.js
|     +-- js/19-cart-checkout-canonical.js
|     +-- pesapalCheckout callable and server verification
|     +-- SokoPay wallet/escrow functions
|
+-- ORDERS / NEGOTIATION
|     +-- orders collection
|     +-- js/app/04-orders-escrow.js, 37-negotiation.js, 38-negotiation-form.js
|     +-- functions/negotiation.js and order action functions
|     +-- payment state, order state, negotiation state and delivery state are distinct concepts
|
+-- SOKOPAY / ESCROW / PESAPAL
|     +-- functions/index.js
|     +-- js/12-payments.js, js/16-wallet.js, js/17-pesapal-return.js
|     +-- wallet_ledger, escrow_holds, sokopay_links, payment/order records
|     +-- server-authoritative money and verification paths exist
|
+-- DELIVERY / CUSTODY
|     +-- ride_requests, delivery_offers, delivery_events
|     +-- delivery_handovers, delivery_tokens, custody_attempts
|     +-- functions delivery/routing exports
|     +-- js/app/20-logistics.js, 33-custody.js, 40-token-box.js, 43-delivery-choice.js
|
+-- CHAT / GROUPS / LIVE
|     +-- conversations/messages, chats, chatGroups
|     +-- js/app/34-chat-core.js, 35-comments.js, 69-chat-groups.js
|     +-- js/app/73-group-soga.js, 74-group-order-system.js
|     +-- live modules and live/account negotiation integrations
|
+-- ADS
|     +-- announcements, creatives, creativePublications
|     +-- functions/ads-delivery.js, ads-delivery-core.js, creative.js
|     +-- js/app/95-creative-studio.js, 96-ad-delivery-controller.js
|     +-- server-only leases/metrics/events
|
+-- NOTIFICATIONS / REVIEWS / ENGAGEMENT
|     +-- notifications, comments, commentLikes
|     +-- productLikes, productWatches, savedProducts, sellerFollowers
|     +-- recommendationEvents and review callables
|
+-- SEARCH / DISCOVERY
|     +-- js/23-smart-search.js and js/20-search-chat.js
|     +-- market cache/search service and intent parser
|     +-- legacy Discover implementation is currently removed/disabled in active loading
|     +-- shared search/location/engagement infrastructure remains
|
+-- LOCATION
|     +-- js/app/01-market.js and js/app/14-map-onboarding.js
|     +-- browser GPS cache, reverse geocoding, region and near-me filters
|     +-- current public profile projection excludes private fields by rules
|
+-- OFFLINE MEMBERS / AGENTS
|     +-- functions memberRegister/memberAuthenticate/assisted sessions
|     +-- js/app/31-agent-assist.js, 62-missing-features.js
|     +-- memberSecrets, agentMembers, assistedSessions, assistedActivity
|     +-- agent is intended as access/support bridge, not member owner
|
+-- FIREBASE / DEPLOYMENT
      +-- firebase.json, .firebaserc, firestore.rules, firestore.indexes.json
      +-- functions/package.json and Functions v2 exports
      +-- Netlify production frontend is separate from Firebase Functions deployment
```

### Architecture conclusion

The application is a large static frontend with a modularized `js/app/*` layer, legacy-compatible `js/*` helpers, Firebase Auth/Firestore, and a Functions v2 backend. The major existing domains are real and interconnected. Business/Store and Inventory are currently represented through compatibility fields and operational flows rather than one fully normalized canonical model.

---

## 2. FILE STRUCTURE

### Frontend

- `index.html`: assembled production page and active script loading.
- `html/`: view/form/modal fragments, including seller, POS, onboarding, menu, checkout and logistics UI.
- `js/app/`: modular application engine loaded in an intentionally ordered sequence by `html/21-scripts.html` and `index.html`.
- `js/`: older/core compatibility modules, cart/payment/search/sync/modal/toast/PWA helpers.
- `css/`: tokens, core styling, marketplace, dashboard, chat, delivery, product, ads and visual audit layers.
- `shared/`: shared browser/Functions rules such as Ads design rules.
- `img/`, `vendor/`, `fonts/`: media/vendor/font assets.

### Backend

- `functions/index.js`: central wallet, escrow, PesaPal, member, delivery, comments, sitemap and re-export wiring.
- `functions/ads-delivery.js`: Ads delivery engine and callable exports.
- `functions/ads-delivery-core.js`: shared Ads normalization/eligibility/core logic.
- `functions/creative.js`: Creative save/publish/event functions.
- `functions/negotiation.js`: negotiation state machine and order actions.
- `functions/routing.js`, `routing-core.js`, `routing-logic.js`: transport/routing operations.
- `functions/local-server.js`: local callable/HTTP adapter and local CORS/origin gate.

### Configuration and controls

- `firebase.json`: Firestore, Hosting, Functions source/runtime/region and predeploy.
- `.firebaserc`: project `sokonet-3b847`.
- `firestore.rules`: authorization, field mutation restrictions and server-only collections.
- `firestore.indexes.json`: query indexes.
- `package.json`: frontend/test commands.
- `functions/package.json`: Node 20 Functions package and shared build command.
- `tools/`: contract, flow, security, Ads, navigation and regression tests.

The requested `originals/` directory is represented locally as `_originals/`; there is also an `assets/` copy and an older `_old_fonts_project`. These copies must not be treated as active authority without checking the active root script/build path.

---

## 3. MODULE-BY-MODULE MAP

### 3.1 Authentication and identity

**Files:** `js/app/00-bootstrap.js`, `js/app/60-identity-layer.js`, `js/app/64-my-profile.js`, `js/app/70-role-identity.js`, `js/app/31-agent-assist.js`, `functions/index.js`.

**Functions:** Firebase Auth initialization, auth-state listener, `wrapCallable`, profile loading, role/identity display, custom-token assisted login, member registration/authentication.

**Collections:** `users`, `publicProfiles`, `memberSecrets`, `agentMembers`, `assistedSessions`, `assistedActivity`, `user_state`.

**Source of truth:** Firebase Auth for authentication; `users`/`publicProfiles` for application identity projections.

**Dependencies:** Firebase Auth, Firestore, Functions callable protocol.

**Current state:** Real authentication architecture. Assisted member flow is server-oriented and explicitly separates agent session from member identity.

**Risks/gaps:** Multiple compatibility fields (`uid`, `userId`, `shopOwnerUid`, `accountType`, `isOfflineUser`) increase migration and ownership complexity. Any new Business/Store work must normalize them without changing Auth architecture.

### 3.2 Product system

**Files:** `js/app/01-market.js`, `02-checkout.js`, `07-product.js`, `08-app-state.js`, `23-smart-cart.js`, `29-seller-store.js`, `30-seller-products.js`, `39-product-core.js`, `39-product-showcase.js`, `html/09-admin-sell.html`, `firestore.rules` product match.

**Responsibilities:** Product creation/editing, category/subcategory selection, dynamic fields, media, price, stock field, variants, publication state, availability, seller profile links, product cards/detail, cart entry.

**Collection:** `products`.

**Created by:** Existing seller/product forms and POS/offline product flow.

**Updated by:** Product edit flow, seller product management, POS stock flow, some direct client updates.

**Consumed by:** Home/market, product detail, seller profile, cart/checkout, orders, search, Ads context and engagement.

**Security:** `firestore.rules` makes products publicly readable, requires authenticated ownership for create/update, validates title/price/stock/userId/publication/availability/variants/images, blocks delete and blocks browser changes to `comments`.

**Current problems:** Product documents carry both commerce and stock fields; variants are embedded rather than proven as a separately authoritative inventory relationship. Seller/store identity is mostly derived from user fields. Product stock is directly writable in some client flows; this is a concrete inventory authority gap.

**Reusable pieces:** Product foundation, shared eligibility/scoring, existing forms, showcase and seller product management. Do not create `storeProducts`, `discoverProducts`, or separate online/offline product databases.

### 3.3 Service system

**Files:** `html/10-form-agent.html`, service-related form/app modules, `firestore.rules` `/services/{id}` and search modules.

**Collection:** `services`.

**Source of truth:** Service document plus owner identity; service pricing/availability fields are validated by rules.

**Dependencies:** Search, negotiations, Chat, comments/reviews and action requests.

**Current state:** Separate from products and transport; should remain separate entity type in a future Discover projection.

### 3.4 Transport and delivery

**Files:** `js/app/20-logistics.js`, `27-route-dispatch.js`, `33-custody.js`, `40-token-box.js`, `43-delivery-choice.js`, `52-transport-inbox.js`, `functions/routing*.js`, delivery sections of `functions/index.js`.

**Collections:** `drivers`, `transport_profiles`, `ride_requests`, `delivery_offers`, `delivery_events`, `delivery_handovers`, `delivery_tokens`, `custody_attempts`, `logistics_assignments`, `shipments`, `delivery`-related records.

**Functions:** `deliveryAccept`, `deliveryOfferAccept`, `deliveryGenerateToken`, `deliveryConfirmCustody`, `deliveryStartTransit`, `deliveryPassengerBoard`, `deliveryComplete`, `deliveryDispute`, `deliveryTokenVerify`, routing booking/decline/retry/sweep/report functions.

**Source of truth:** Server-authoritative delivery/custody functions and server-only event/token collections. `ride_requests` is the visible request/state record, but token/custody transitions are protected.

**Current state:** Mature, distinct custody/token architecture with lifecycle stages and routing.

**Risks:** There are legacy/demo fallbacks in frontend code when Functions are unavailable. These must remain clearly scoped and must not be used as production authority. Do not create a second delivery engine for Stores, Discover or POS.

### 3.5 Store/business/seller

**Files:** `html/09-admin-sell.html`, `html/15-main-menu.html`, `html/21-scripts.html`, `js/app/14-map-onboarding.js`, `js/app/29-seller-store.js`, `js/app/30-seller-products.js`, `js/app/19-roles.js`, `js/app/31-agent-assist.js`, `firestore.rules`.

**Current concepts:** User, seller, provider, driver, business name, store name/shop name, seller mode/visibility, shop owner and agent-managed owner.

**Current source:** No confirmed canonical `businesses` or `stores` collection was found in this audit. Public seller profile reads `users/{uid}` and queries `products` by `userId`; product cards route to `openSellerProfile`.

**Current UI:** `#sellerForm` is the single seller entrance. `businessMode` and `prodVisibility` distinguish `online_only`, `offline_only`, and `hybrid`/offline behavior. `29-seller-store.js` provides a public seller/store-like profile, not a normalized Store aggregate.

**Current state:** Store-like experience exists; Business/Store entity separation is incomplete. Seller mode and management level are not cleanly separated. This is a Step 2 design area, not a Step 1 implementation.

### 3.6 Management/dashboard/POS

**Files:** `js/app/03-dashboard.js`, `10-dashboard-tabs.js`, `11-analytics.js`, `15-pos-sales.js`, `16-pos-admin-jobs.js`, `17-hub.js`, `18-cockpit.js`, `19-roles.js`, `30-seller-products.js`, `html/09-admin-sell.html`, `html/21-scripts.html`.

**Current entry:** Dashboard shell uses `dashWorkspace`, `switchDashTab`, `renderActiveTabContent` and driver-specific dashboard routing.

**Current tabs/capabilities:** Overview, My Products, product analytics/performance/insights/compare, Inventory & Stock, transfers, ledger/expenses, staff/HR, logistics and role-specific tabs. The shell is an ERP/cockpit style dashboard.

**Source of truth:** Dashboard reads products/orders and operational collections; it is a projection and action surface, not one capability authority.

**Current state:** More than three dashboards do not exist as clean separate products, but role-specific rendering and hardcoded tab availability are mixed. There is no demonstrated `resolveBusinessContext → resolveSellerMode → resolveCapabilities` pipeline.

**Risk:** Do not rewrite dashboard until current role/capability checks and every tab action are inventoried. Management level must be separate from seller mode in future work.

### 3.7 Cart and checkout

**Files:** `js/app/02-checkout.js`, `js/app/23-smart-cart.js`, `js/19-cart-checkout-canonical.js`, `js/app/57-checkout-bridge.js`.

**Data:** Browser cart/session context plus server/order/payment records.

**Current state:** Product price/quantity/variant context is collected in browser, then payment and final authority flow through Functions/payment verification. Browser pending state is not payment proof.

**Risk:** Any future Store/Discover action must route into existing cart/checkout, never create a second checkout.

### 3.8 Orders and negotiation

**Files:** `js/app/04-orders-escrow.js`, `37-negotiation.js`, `38-negotiation-form.js`, `74-group-order-system.js`, `functions/negotiation.js`, `functions/index.js`.

**Collections:** `orders`, `negotiations`, `negotiation_events`, `offers`, `order_adjustments`, `seller_order_inbox`, group-order records.

**Source of truth:** Existing order and negotiation state machines, not Discover or dashboard cards.

**Current state:** Negotiation belongs to Chat/negotiation engine; accepted agreements create orders, with snapshots and server checks. Payment status, order status, negotiation status and delivery status are represented as separate concerns.

### 3.9 Payment/SokoPay/PesaPal

**Files:** `functions/index.js`, `js/12-payments.js`, `js/16-wallet.js`, `js/17-pesapal-return.js`, `js/app/02-checkout.js`, `js/app/21-sokopay.js`, `js/app/55-escrow-guard.js`.

**Functions:** `walletAdjust`, `escrowRelease`, `haipayReleaseLink`, `sokopayLinkWalletPay`, `pesapalCheckout`, `pesapalTransactionStatus`, `pesapalIpn`, `pesapalRegisterIpn`, scheduled auto-release/stat functions.

**External API:** PesaPal base URL defaults to `https://pay.pesapal.com/v3`; consumer credentials are read from Functions environment only.

**State distinction:**

```text
payment intent/initiation
  -> PesaPal hosted redirect
  -> server GetTransactionStatus/IPN verification
  -> escrow_hold/payment evidence
  -> order/link protected state
  -> server-authoritative release/settlement
```

**Current state:** The code explicitly rejects treating browser payment fields as independent proof and writes `escrow_holds` server-side for verified evidence.

**Production gap:** Current live probes returned `404` for `OPTIONS` and `POST` to both `adsRequestDelivery` and `pesapalCheckout`; deployed availability is unresolved. This audit does not claim production payment is fixed.

### 3.10 Ads

**Files:** `functions/ads-delivery.js`, `ads-delivery-core.js`, `creative.js`, `js/app/95-creative-studio.js`, `96-ad-delivery-controller.js`, `shared/ads-design-rules.js`, Ads CSS.

**Collections:** `announcements`, `creatives`, `creativePublications`, `creativeEvents`, `adDeliveryState`, `adDeliveryLeases`, `adDeliveryMetrics`, `adDeliveryEvents`.

**Source of truth:** Server delivery engine and server-only lease/event/metric records; Creative rules are shared with browser renderer.

**Functions:** `adsRequestDelivery`, `adsTrackDeliveryEvent`, `adsUpdateCampaignDelivery`, `adsDeliverySweep`, creative functions.

**Current state:** Campaign eligibility, targeting, placement, frequency/cooldown/fatigue and analytics are intentionally centralized. Do not duplicate for Discover/Store.

### 3.11 Chat/groups/live/reviews/engagement

**Files:** `js/app/34-chat-core.js`, `35-comments.js`, `36-seller-chat-comments.js`, `69-chat-groups.js`, `73-group-soga.js`, `74-group-order-system.js`, `76-group-order-production-enhancement.js`, Live modules, `functions/index.js` comment/chat functions.

**Collections:** `conversations` and messages, `chats`, `chatGroups`, `comments`, `commentLikes`, `notifications`, engagement collections, group order collections.

**Source of truth:** Existing Chat/Group/Review/Live modules. Discover should only route to them.

**Current state:** Chat is also the negotiation host and contains order/product bridges. Do not add dashboard or Discover negotiation copies.

### 3.12 Search and current Discover

**Files:** `js/23-smart-search.js`, `js/20-search-chat.js`, `js/app/01-market.js`, product foundation/search helpers, historical Discover files/docs.

**Current search:** `23-smart-search.js` has a client intent parser for category hints, price bounds, routes and regions; scoring reads cached items and uses product eligibility/scoring where available. It groups results into products/services/drivers.

**Current Discover:** Historical files `75-discover-engine.js`, `76-discover-foundation.js`, `88-discover-complete.js`, `42-discovery-feed.js`, `68-chat-discover.js`, and `91-discover-fixes.js` are absent/deleted from the active working tree and are not loaded by current `html/21-scripts.html`. The Discover concept is not abandoned, but the previous implementation is not a safe current source of truth.

**Reusable infrastructure:** Search parser/service, product search, location, public profile, engagement, Chat and action bridges.

**Risk:** Reintroducing historical Discover files without re-auditing current navigation would create duplicate UI/state systems.

### 3.13 Location and media

**Files:** `js/app/01-market.js`, `14-map-onboarding.js`, `js/11-uploads.js`, `js/app/26-image-zoom.js`, forms and profile modules.

**Current location:** Browser geolocation is cached in `localStorage` as `skh_last_loc`, reverse-geocoded using Nominatim, and used for near-me/region filtering. Rules expose a privacy-safe `publicProfiles` projection rather than private profile fields.

**Current media:** Product images, profile image/DP, cover/logo and upload utilities exist, but a canonical separate Store Photo / Store Cover / Landmark Photo model was not found.

**Risks:** Coordinates cached in browser are not equal to a server privacy policy. Exact location and landmark visibility require an explicit policy before Discover use.

---

## 4. DATA MODEL AND SOURCE OF TRUTH

| Domain | Current collection/record | Source of truth | Writers | Readers | Main concern |
|---|---|---|---|---|---|
| Auth identity | Firebase Auth | Firebase Auth | Auth flows/Functions | Bootstrap/all identity modules | Multiple application identity projections |
| User profile | `users` | User profile document | Profile/identity flows, some client paths | Profile, seller, agent, checkout | Ownership field vocabulary varies |
| Public identity | `publicProfiles` | Privacy-safe projection | Profile/backend paths | Search/profile | Must remain privacy-safe |
| Business | No confirmed canonical collection | Compatibility fields in users/onboarding | Seller/onboarding/agent paths | Seller/dashboard | Needs canonical contract later |
| Store | No confirmed canonical collection | Seller profile + user fields/products query | Seller/profile flows | Product cards/profile | Store/product relationship is implicit |
| Product | `products` | Product system | Seller forms, POS, product edit | Market, seller, cart, search, Ads | `stock` is mixed into product |
| Variant | Embedded product fields (`variants`, selected variant snapshots) | Product document | Product form/edit | Product/cart/order snapshot | No verified separate variant inventory authority |
| Inventory | `products.stock` plus operational collections | Not fully consolidated | Client POS/product management and operations | Product/seller/dashboard/checkout | Direct client writes and no one ledger |
| Stock transfer | `stock_transfers` | Transfer records/rules | Signed-in clients/operations | Management | Rules appear broad; ownership audit needed |
| POS ledger | `shop_ledger` | Shop ledger records | Signed-in clients/operations | Dashboard/accounting | Rules permit signed-in writes; needs authority review |
| Order | `orders` | Order system | Negotiation/order/payment/server flows | Buyer/seller/delivery/SokoPay | Preserve state separation |
| Payment evidence | `escrow_holds`, `wallet_ledger`, PesaPal status | Server Functions | Admin SDK/Functions | Escrow/release/status | Correct authority boundary; deployment must be verified |
| SokoPay links | `sokopay_links` | SokoPay contract | Existing payment/order flows | Buyer/seller/payment | Server release and evidence rules matter |
| Delivery request | `ride_requests` | Delivery/routing lifecycle | Customer/authorized actor plus Functions | Driver/seller/customer | State mutation restrictions are complex |
| Delivery custody | `delivery_events`, `delivery_handovers`, `delivery_tokens` | Server custody engine | Functions only | Participants/admin where permitted | Must not be duplicated |
| Chat | `conversations`, messages, `chats` | Chat system | Chat functions/client under rules | Participants | Negotiation/action bridges depend on it |
| Reviews | `comments`, review functions | Server review path | `reviewsPublish`/comment functions | Public/profile/order views | Verified purchase must not be client forged |
| Engagement | likes/watches/saved/followers/recommendation events | Engagement collections | User-scoped client paths | User/seller/ranking | Events must remain distinct |
| Ads | announcements/creative/ad delivery state | Ads engine | Admin/Functions | Public published projection/client controller | Server-only delivery state |
| Discover | No active canonical projection found | Search/cache/current sources only | Existing search/market flows | Home/search/UI | Build only after source map review |

### Product / Variant / Inventory conclusion

The desired model:

```text
PRODUCT -> VARIANT -> INVENTORY -> ORDER/POS
```

is not fully present as one authoritative chain. Current code has Product and embedded variants, but quantity is principally `products.stock` and is directly updated by some client flows. This is the most important architecture gap before implementing hybrid physical/online stock.

### Order / payment distinction

The code has meaningful separation:

```text
payment initiation != payment verification != escrow hold != release
order state != payment state != delivery/custody state
```

This separation must be preserved. Redirect URL, browser pending state, and user-entered payment fields are not proof of payment.

---

## 5. AUTH / SECURITY AUDIT

### Strengths observed

- Firebase Authentication is the identity boundary.
- Functions use `requireAuth` for protected money/member operations.
- Wallet balance changes are intended to pass through server functions and ledger records.
- `escrow_holds` and delivery custody/token/event collections are server-only in rules.
- Product ownership and immutable owner fields are checked in product rules.
- Comments/review verified-purchase fields are server-controlled.
- Agent-assisted sessions use custom tokens and server-side PIN/hash/session paths.
- Chat blocks and delivery custody restrictions are implemented in rules/backend.

### Concrete risks/gaps to carry forward

1. **Client-authoritative stock mutations:** `js/app/30-seller-products.js` updates `products.stock` directly; `js/app/15-pos-sales.js` uses direct product updates/increments. This is incompatible with a fully authoritative concurrent inventory model.
2. **Broad signed-in operational writes:** `shop_ledger`, `shop_staff`, `agents`, and `stock_transfers` rules currently allow broad signed-in access patterns. These require a dedicated ownership/capability review before exposing a unified dashboard.
3. **Public product reads:** `products` is publicly readable and legacy documents may contain seller/POS fields; field-level privacy separation is not complete.
4. **Fallback behavior:** Several frontend flows have demo/local/native fallbacks when Functions are unavailable. Production gating must ensure fallback cannot create false payment, custody, or authoritative stock success.
5. **Agent/native fallback complexity:** `31-agent-assist.js` documents Firestore-native fallback behavior when server functions are unavailable. This must be audited carefully before changing offline-member ownership or permissions.
6. **Location privacy:** Browser GPS cache and public profile rules are separate concerns. Exact location exposure must be policy-driven, not inferred from cached coordinates.
7. **Fake FOMO/social proof:** `js/app/14-map-onboarding.js` contains `triggerFomo()` with generated names, cities and purchase-like actions. This conflicts with production truth requirements and should be treated as a concrete UI/data integrity issue in a separate reviewed fix, not silently reused for Discover.
8. **Admin identity:** Rules include an email fallback in `isAdmin()` and Functions use environment/admin claims. This is sensitive and must remain unchanged until a dedicated security review.

No rules were changed during this Step 1 audit.

---

## 6. BUSINESS / STORE / SELLER MODE

### Current concepts found

- `sellerForm` is the main seller entry.
- `businessMode` uses `online_only`, `offline_only`, `hybrid`.
- `prodVisibility` branches product form and button semantics.
- `storeName`, `shopName`, `businessName`, `ownerName`, `userId`, `shopOwnerUid`, `managedByAgentUid` appear across code.
- `openSellerProfile()` reads a user document and products by `userId`.
- `businessOSForm` is an operational/POS/accounting form, not a canonical Business entity.

### Current relationship

```text
USER / users/{uid}
   +-- seller/provider/driver compatibility fields
   +-- products where userId == uid
   +-- public seller profile
   +-- agent-managed owner fields
```

A confirmed normalized relationship of `USER -> BUSINESS -> STORE` does not yet exist in the inspected source.

### Seller mode vs management level

Current seller mode exists, but current dashboard role/tab logic is mixed with driver/admin/shop-owner/agent states. There is no verified central capability matrix supporting all combinations:

```text
ONLINE/OFFLINE/HYBRID + BASIC/PARTIAL/FULL
```

This must be designed as a later capability layer, not inferred from tab visibility alone.

### Agent/offline member finding

The intended design is mostly present: agent is a bridge/support role and the member receives a real custom-token account/session. However, legacy and fallback paths mean every write path must be checked before declaring ownership fully isolated. Existing agent metadata should not be converted into business ownership.

---

## 7. POS / SALES / INVENTORY AUDIT

### Existing POS flow

`html/09-admin-sell.html` and `html/21-scripts.html` provide POS/inventory forms. `js/app/15-pos-sales.js`:

- searches existing `products` by owner;
- updates stock with `increment()` for received stock;
- creates offline/POS products in the main `products` collection;
- writes `isOffline`, `isOnline`, `stock`, pricing and owner metadata;
- supports offline sale/ledger-related flows.

### Important conclusion

The system does not currently enforce a clean three-way boundary:

```text
PRODUCT = what is offered
INVENTORY = quantity authority
POS = recorded transaction
```

Instead, some POS and seller flows treat `products.stock` as the quantity authority. This may preserve current behavior, but it is not yet safe for concurrent physical + online decrements without a dedicated server transaction/ledger plan.

### Do not implement yet

Do not create `offlineProducts`, `onlineProducts`, `offlineStock`, or `discoverStock`. First inventory all stock writers/readers, define the meaning of current `stock`, then add a reversible adapter and tests.

---

## 8. ORDER / PAYMENT / DELIVERY

### Order lifecycle

Existing negotiation modules create/order snapshots and order actions. Checkout stores pending context, then PesaPal server flow returns a hosted URL. Post-return code verifies/settles through server-backed paths. Order records also connect to delivery and Chat events.

### PesaPal

Confirmed Functions:

```text
pesapalCheckout           onCall
pesapalTransactionStatus  onCall
pesapalIpn                onRequest
pesapalRegisterIpn        onCall
```

Credentials and base URL are server-side in `functions/index.js`. Existing amount rounding, merchant reference, callback, token acquisition, transaction status and settlement logic must be preserved.

### SokoPay/escrow

Confirmed server functions and `escrow_holds` evidence model exist. Release is intended to depend on verified payment evidence and idempotent holds. Browser fields such as `paymentVerified` are not sufficient evidence.

### Delivery

The custody sequence is represented in rules and modules, with server-only token/events/handovers and role-constrained ride request transitions. Discover/store/POS must call this system rather than create delivery records of their own.

---

## 9. CHAT / NEGOTIATION AUDIT

**Primary files:** `js/app/34-chat-core.js`, `35-comments.js`, `36-seller-chat-comments.js`, `37-negotiation.js`, `38-negotiation-form.js`, `69-chat-groups.js`, `functions/negotiation.js`, `functions/index.js`.

**Current behavior:** Chat is the existing communication authority; negotiation is a Chat-integrated state machine; order/payment handoff uses existing bridges; group ordering is separate but related.

**Preserve:** unread state, message history, block rules, back navigation, negotiation state and payment event messages.

**Do not create:** dashboard negotiation, Discover negotiation, or separate store negotiation systems.

---

## 10. DISCOVER AUDIT

### Current state

The active script list does not load the historical Discover modules. The working tree also records removal/deletion of the old Discover files and tests. Existing historical documentation describes a previous multi-module Discover architecture, but that documentation is not current runtime authority.

### Preserved reusable systems

- `js/23-smart-search.js` intent parsing/scoring.
- `js/20-search-chat.js` search/chat integration.
- Product foundation/eligibility/scoring.
- Market collection loaders and filters.
- Location/near-me behavior.
- Public profile privacy projection.
- Existing product/seller/Chat/order/delivery action bridges.
- Engagement and review systems.

### Required future architecture

```text
AUTHORITATIVE PRODUCT / SERVICE / STORE / BUSINESS / PLACE
              ↓
privacy-safe search reference/projection
              ↓
Discover query/UI
              ↓
existing Product / Chat / Order / Directions / Service actions
```

### Context audit

Current product and seller flows can route to product detail and seller profile. A future `Gundua bidhaa hii` can use those references, but a universal context engine, Places model, role verification projection and nearby privacy layer are not currently established as one implementation.

### Event integrity

Existing engagement collections distinguish likes/follows/saves/search/recommendation events. Discover must not infer purchases from views, likes or chats. Purchase must come from Orders/payment evidence.

---

## 11. TAXONOMY AUDIT

**Current evidence:** `skh.advancedCategories` and dynamic category/subcategory fields in `js/app/08-app-state.js`, product foundation/search helpers, `deliveryTaxonomy` in `js/app/01-market.js`, and service/transport-specific fields.

**Current state:** There is reusable product taxonomy and a separate transport taxonomy. A fully central taxonomy service reusable across Products, Services, Transport, Stores and Discover was not verified.

**Gap:** Before centralizing, inventory current category vocabularies and field requirements. Do not create independent `discoverTaxonomy` or `serviceTaxonomy` if existing structures can be extended, but do not force transport-specific attributes into product records.

Target remains:

```text
CATEGORY -> SUBCATEGORY -> ATTRIBUTES -> FILTERS -> OPTIONS -> VARIANTS
```

with entity-specific applicability.

---

## 12. SEARCH AND LOCATION AUDIT

### Search

`js/23-smart-search.js` parses product/service/driver hints, prices, routes and region names, then scores cached data using searchable text and product scoring. It is client/cache based and does not constitute a universal server-side Discover index.

### Location

`js/app/01-market.js` stores browser location in `skh_last_loc`, uses TTL/cache, reverse geocodes via Nominatim, supports region and near-me filters, and fails open when GPS is unavailable. `js/app/14-map-onboarding.js` also controls seller visibility/product form behavior and location-related onboarding.

### Gaps

- No confirmed canonical `LOCATION` entity with visibility enum and landmark roles.
- No verified approximate-location projection for all entity types.
- Exact/private location policy must be defined before universal nearby discovery.
- External geocoding dependency needs production resilience/rate-limit review.

---

## 13. UI / DESIGN SYSTEM AUDIT

### Existing design system

The repository already has a substantial CSS design system:

- `css/00-tokens.css`: semantic colors, spacing, radii, shadows, typography.
- `css/26-design-system.css`: buttons, cards, forms, lists, states, sidebar, modals/sheets, responsive and accessibility rules.
- Additional domain layers: marketplace, chat, dashboard, logistics, product cards, ads, buyer dashboard and creative studio CSS.

### Strengths

- Existing green/blue/light visual language.
- Shared token aliases and spacing/radius/shadow scales.
- Loading skeleton and empty/error state patterns in multiple modules.
- Mobile/responsive CSS layers and modal/sheet conventions.
- Existing tests enforce parts of the white/light visual system.

### Concrete issues observed

- Some modules still contain large inline HTML/CSS strings and older dark sidebar/legacy styling, especially dashboard and seller profile code.
- `js/app/29-seller-store.js` uses inline styling and external avatar fallback rather than a clearly separated Store media model.
- Dashboard shell is large and role/tab behavior is distributed across several modules.
- Visual consistency exists at token level but component ownership is not fully centralized.
- Fake FOMO content is a data integrity/UI issue, not merely a visual issue.

Do not create another button/card/modal stylesheet. Later changes should extend existing tokens and components.

---

## 14. CURRENT BUGS AND PRODUCTION VERIFICATION

### Modal selector

Current repository state:

```js
var SEL = '.overlay-menu,[id$="Modal"],[id$="Form"],.skh-sheet-overlay';
```

Repository-wide malformed selector count: `0`.

This issue is currently repaired in the working tree. No additional modal manager should be introduced.

### Production Functions/CORS

Current source declarations:

```text
functions/ads-delivery.js -> adsRequestDelivery onCall
functions/index.js         -> pesapalCheckout onCall
```

Existing local Functions CORS/origin handling is in `functions/local-server.js`. It is not ordinary middleware to copy into Firebase callable functions.

Live probe from the audited workspace:

```text
OPTIONS adsRequestDelivery  -> 404
POST    adsRequestDelivery  -> 404
OPTIONS pesapalCheckout     -> 404
POST    pesapalCheckout     -> 404
```

Origin tested:

```text
https://sokohaiworld.netlify.app
```

Production CORS/function availability remains unresolved. No claim of production fix is made.

---

## 15. DUPLICATION MAP

| Domain | Existing competing/legacy paths | Authority to preserve | Risk |
|---|---|---|---|
| Frontend shell | `index.html`, `html/21-scripts.html`, legacy `app.module.js` references/docs | Active root `index.html`/active script list | Editing inactive copies creates false fixes |
| Product | Product foundation, market loaders, seller profile, POS product creation | `products` + product foundation | New store/discover product collections |
| Stock | `products.stock`, POS, seller product management, stock transfers, ledger | Not yet fully consolidated | Conflicting quantity semantics |
| Seller/store | user fields, seller profile, seller form, agent shop fields | Existing seller/profile paths until Store contract exists | Treating User/Business/Store as one object |
| Management | dashboard shell, tabs, cockpit, role modules, POS | Existing dashboard shell + capability audit | Three duplicate dashboards or mode/level conflation |
| Search | `23-smart-search`, `20-search-chat`, market filters, historical Discover | Existing search utilities until projection design | Parallel search engines |
| Discover | historical 75/76/88 stack vs current removed state | Shared search/location/action infrastructure | Reviving stale UI as a second system |
| Chat/negotiation | Chat core, negotiation, group order modules | Chat/negotiation system | Dashboard/Discover negotiation copies |
| Payment | PesaPal, SokoPay wallet, links, escrow | Existing Functions/payment authority | Browser payment success or new payment pipeline |
| Delivery | routing, delivery choice, custody/token modules | Existing delivery/custody engine | Store/POS/Discover delivery engines |
| Ads | Ads delivery/core/creative/browser controller | Existing Ads engine | New contextual ad delivery rules |

---

## 16. PRODUCTION GAPS

### Functional gaps

- No verified canonical Business/Store entity flow.
- No unified seller-mode plus management-capability resolver.
- No confirmed universal Discover query/projection implementation.
- No complete first-class Place/landmark model.
- Inventory lifecycle operations are not consolidated behind one verified authority.

### UI gaps

- Seller profile/store is not a normalized Store page with distinct Store/Business/Product/Landmark media roles.
- Dashboard capabilities are distributed and role-mixed.
- Offline and online management surfaces are not cleanly separated by mode while sharing one source.
- Some legacy inline styling and UI layers remain.

### Data gaps

- `businesses` and `stores` canonical source not confirmed.
- Product variants and stock are not linked through a proven inventory authority.
- Location visibility/landmark schema not confirmed.
- Discover projection/index not active as a current canonical layer.

### Security gaps

- Direct client stock changes.
- Broad signed-in writes in some operational collections.
- Fallback/demo paths require explicit production gating.
- Exact location privacy is not yet a unified entity policy.
- Agent/member fallback paths need a complete ownership/write audit.

### Integration gaps

- Hybrid physical + online stock decrements are not proven atomic.
- Product → Store relationship is implicit through user fields, not a canonical reference.
- Discover → Store/Business/Place/Service action routing is incomplete as one layer.
- Production Functions endpoints for Ads/PesaPal currently return 404 in probes.

### Performance/operational gaps

- Search currently relies substantially on browser cache/client scoring.
- Nominatim reverse geocoding is an external dependency.
- Dashboard performs multiple reads/aggregations in client modules.
- Production deployed state is not synchronized with the local source based on current endpoint probes.

---

## 17. RECOMMENDED BUILD SEQUENCE

Based on repository evidence, the safe sequence is:

1. Freeze this source-of-truth and ownership map.
2. Resolve deployment/environment mismatch for existing Functions without changing business logic.
3. Audit and test current stock writers/readers and define legacy `products.stock` semantics.
4. Define Business/Store contracts and ownership rules without deleting compatibility fields.
5. Add focused migration adapters/tests for seller profile/store references.
6. Separate seller mode from management capabilities in a resolver, reusing the existing dashboard shell.
7. Design server-authoritative inventory operations and concurrency tests.
8. Integrate existing Products/Variants with Store references without copying records.
9. Add physical presence/location/privacy/media roles using existing upload/location primitives.
10. Re-audit active search and build one read-only Discover projection/query layer.
11. Add Discover context/action routing to existing Product, Store/Profile, Chat, Order, Service, Groups, Live and Directions flows.
12. Run end-to-end online, offline and hybrid journeys with security/emulator tests.

This sequence deliberately postpones Dashboard rewrite, taxonomy rewrite, POS rewrite and Discover rewrite.

---

## 18. FILES THAT MUST NOT BE TOUCHED YET

Until Step 2 is reviewed and explicitly approved, do not modify:

- `firestore.rules`
- `firestore.indexes.json`
- `functions/index.js` payment/escrow/delivery sections
- `functions/routing.js`, `routing-core.js`, `routing-logic.js`
- `js/app/21-sokopay.js`, `js/04-orders-escrow.js`, `js/17-pesapal-return.js`
- `js/app/33-custody.js`, `40-token-box.js`, `43-delivery-choice.js`
- Chat core/group/order modules
- Ads delivery/core/creative modules
- Product foundation and existing product system
- Auth/bootstrap architecture
- Navigation and modal architecture
- Existing Discover-removal changes

These may be audited and tested, but not redesigned in Step 1.

---

## 19. FILES LIKELY TO BE MODIFIED IN STEP 2

Only after review and a focused plan:

- A new or explicitly approved canonical Business/Store contract location, if no existing owner can be extended.
- `html/09-admin-sell.html` and `js/app/14-map-onboarding.js` for mode/context compatibility.
- `js/app/29-seller-store.js` for Store reference reads, with compatibility fallback.
- `js/app/30-seller-products.js` only for Store-scoped reads after authority is defined.
- `js/app/03-dashboard.js`, `10-dashboard-tabs.js`, `19-roles.js` for capability resolution.
- Focused tests under `tools/` for Business/Store/mode ownership contracts.
- Existing design-system CSS only where an approved UI change requires it.

No Step 2 file was changed by this audit.

---

## 20. AUDIT COMPLETION / STOP CONDITION

Step 1 is complete.

The repository has been mapped without starting the Business/Store, capability, inventory, dashboard or Discover implementation. The main architectural conclusion is:

```text
Existing Product, Order, Payment, Delivery, Chat, Auth and Ads systems are real reusable authorities.
Business/Store/Inventory/Discover are not yet one normalized production architecture.
The next safe change is a reviewed Business/Store contract and stock-authority plan,
not a parallel system and not a broad rewrite.
```

**STOP. Step 2 has not been started.**
