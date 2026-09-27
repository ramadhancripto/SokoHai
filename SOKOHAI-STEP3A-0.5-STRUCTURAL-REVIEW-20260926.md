# SOKOHAI STEP 3A-0.5 — REAL IMPLEMENTATION SHOWCASE + STRUCTURAL REVIEW

**Date:** 2026-09-26
**Review only:** No application behavior was modified during this review.
**Implementation/development server:** A static server is running at the workspace preview on port 8080. This exposes the actual current UI files; it is not a mockup and is not authenticated against Firebase.

## 1. Current workspace snapshot

```text
Branch: main
HEAD:   0e8bb6c
```

The working tree is heavily dirty from earlier work. The Step 3A-0 files are not committed.

### Step 3A-0 files touched/created

```text
M  firestore.rules
M  functions/index.js
M  js/app/14-map-onboarding.js
M  js/app/15-pos-sales.js
M  js/app/17-hub.js
M  js/app/18-cockpit.js
M  js/app/22-printing.js
M  js/app/30-seller-products.js
?? functions/inventory-authority.js
?? tools/test_step3a0_authority.mjs
```

### Step 3A-0 report

```text
?? SOKOHAI-STEP3A-0-IMPLEMENTATION-REPORT-20260926.md
```

### Pre-existing dirty changes

The following were already dirty before the Step 3A-0 work and were not attributed to this review:

```text
LOCAL-SERVER-MWONGOZO.md
assets/js/app/54-error-core.js
assets/js/app/62-missing-features.js
css/21-discovery-maoni.css
css/27-visual-audit-fixes.css
css/29-nav-dict.css
css/30-discover-engine.css
functions/build-shared.js
functions/local-server.js
functions/routing-core.js
functions/routing.js
html/00-head.html
html/05-modals-market.html
html/06-modals-social.html
html/10-form-agent.html
html/16-topnav.html
html/17-sliders.html
index.html
js/17-pesapal-return.js
js/23-smart-search.js
js/94-modal-stack.js
js/app/00-bootstrap.js
js/app/01-market.js
js/app/04-orders-escrow.js
js/app/07-product.js
js/app/09-feed-announcements.js
js/app/20-logistics.js
js/app/21-sokopay.js
js/app/32-i18n.js
js/app/53-test-sandbox.js
js/app/54-error-core.js
js/app/55-escrow-guard.js
js/app/62-missing-features.js
js/app/69-chat-groups.js
js/app/70-role-identity.js
js/app/71-visual-dictionary.js
js/app/73-group-soga.js
js/app/78-chat-fix-blink.js
js/app/79-one-ui-at-a-time.js
js/app/81-absolute-one-ui-live.js
js/app/79-one-ui-at-a-time.js
package.json
tools/build_html.py
tools/test_ads_delivery_engine.mjs
tools/test_white_system_final_contract.mjs
tools/test_white_system_forms_contract.mjs
tools/test_white_system_modules_contract.mjs
tools/verify_nav_chain.mjs
```

There are also many pre-existing untracked audit/report files and deleted Discover-related files. No files were deleted during this review.

## 2. Actual POS architecture

### Current runtime path

```text
HTML POS form
  ↓
js/app/17-hub.js: window.submitPosSale()
  ↓
window/skh.wrapCallable('posSale')
  ↓
functions/index.js export
  ↓
functions/inventory-authority.js: exports.posSale
  ↓
Firestore db.runTransaction()
  ├── read products/{productId}
  ├── create sales/pos_{idempotencyKey}
  ├── create inventory_movements/pos_{idempotencyKey}
  ├── update products/{productId}.stock
  └── optionally set shop_ledger/pos_{idempotencyKey}
```

A second quick-sale UI exists in:

```text
js/app/15-pos-sales.js: window.processSmartOfflineSale()
```

It also calls `posSale`.

The cockpit's queued offline-sync path in:

```text
js/app/18-cockpit.js
```

calls `posSale` when the browser returns online.

### Actual authority

```text
POS stock mutation: server-authoritative for migrated paths
Sale record: sales/{saleId}
Movement record: inventory_movements/{movementId}
Product stock: server-mutated compatibility/current stock field
Legacy accounting display: shop_ledger
```

The Product stock field is therefore transitional, not a pure projection yet. It remains the quantity read by the existing UI, but the migrated write authority is the server callable.

## 3. Actual `posSale`

File:

```text
functions/inventory-authority.js
```

Export:

```text
exports.posSale = onCall({ region: REGION }, async req => { ... })
```

### 3.1 Authentication

`authOf(req)` rejects requests without `req.auth.uid` with `unauthenticated`.

### 3.2 Input validation

Validated inputs:

```text
idempotencyKey
productId
quantity
unitMode: pc | unit
paymentMethod: Cash | Mpesa | TigoPesa | AirtelMoney | Deni | Awamu
```

The callable bounds quantity to a positive safe integer no greater than `1,000,000`.

### 3.3 Idempotency

The sale document is deterministic:

```text
sales/pos_{idempotencyKey}
```

If it already exists for the same cashier and key, the callable returns an idempotent result without mutating stock again.

### 3.4 Product lookup

Inside the Firestore transaction:

```text
const productSnap = await tx.get(productRef)
```

The callable rejects a missing Product.

### 3.5 Ownership validation

`ownerForProduct()` resolves the owner from:

```text
product.userId || product.shopOwnerUid
```

The caller is accepted only when:

```text
caller UID == Product owner
or users/{caller}.shopOwnerUid == Product owner
or caller has admin claims
```

There is no authenticated staff UID path yet.

### 3.6 Business/Store validation

`productBusinessScope()` checks supplied `businessId` and `storeId` against Product fields when those fields exist.

If the Product has no canonical Business/Store fields, the supplied values can become the resulting scope. This is transitional compatibility behavior, not a fully canonical Business/Store authority.

### 3.7 Price resolution

The server reads:

```text
product.price
product.pcsPerUnit
product.title/name
```

The browser-supplied `unitPrice` is stored only as `requestedUnitPrice` inside the item snapshot for diagnostics. It is not used for the authoritative total.

### 3.8 Quantity and stock validation

The callable computes:

```text
unitMode == pc    → stockQuantity = quantity
unitMode == unit  → stockQuantity = quantity * pcsPerUnit
```

It requires Product stock to be a non-negative safe integer and rejects insufficient stock.

### 3.9 Sale creation

The sale is written inside the same Firestore transaction as the stock update.

### 3.10 Inventory movement

A `SALE` movement is written inside the same transaction with before/after stock values.

### 3.11 Product stock update

The Product stock is updated atomically to:

```text
stock - item.stockQuantity
```

Availability is also updated to:

```text
out_of_stock
low_stock
available
```

### 3.12 Compatibility ledger projection

By default, the callable writes:

```text
shop_ledger/pos_{idempotencyKey}
```

The legacy Hub/Cockpit paths pass `writeLedgerProjection: false` because they still write their own aggregate compatibility ledger entries. This avoids one server projection plus one legacy projection for those paths, but means their legacy ledger entry remains separate from the authoritative Sale record.

### 3.13 Commit

The product update, sale creation, inventory movement, and optional ledger projection commit through one Firestore transaction. If a validation or write fails, the transaction does not commit.

## 4. Actual `inventoryAdjust`

File:

```text
functions/inventory-authority.js
```

Export:

```text
exports.inventoryAdjust = onCall({ region: REGION }, async req => { ... })
```

### Supported movement types

```text
ADJUSTMENT
PURCHASE
RETURN
TRANSFER
CONSUMPTION
```

Any unsupported movement type falls back to `ADJUSTMENT`.

### Who can call it

The caller must be authenticated and must own the Product, be linked through `users/{uid}.shopOwnerUid`, or have admin claims. Authenticated staff records are not yet linked by UID.

### What it changes

It atomically changes:

```text
products/{productId}.stock
products/{productId}.availabilityStatus
products/{productId}.updatedAt
```

### What it records

It creates:

```text
inventory_movements/adjust_{idempotencyKey}
```

with movement type, source, product, delta, previous stock, resulting stock, reason, scope and actor.

### Atomicity

Product update and movement creation occur in one Firestore transaction.

### Idempotency

The deterministic movement document is:

```text
inventory_movements/adjust_{idempotencyKey}
```

A repeated matching request returns the existing result without applying the delta twice.

## 5. Actual `sales/{saleId}` schema

The actual object written by `posSale` is:

```js
{
  saleId,
  idempotencyKey,
  type: 'POS_SALE',
  channel: 'OFFLINE_POS',
  businessId,
  storeId,
  sellerId,
  cashierId,
  items: [{
    productId,
    variantId: null,
    productNameAtSale,
    quantity,
    stockQuantity,
    unitMode,
    pcsPerUnit,
    unitPriceAtSale,
    lineTotal,
    requestedUnitPrice
  }],
  totals: { subtotal, discount: 0, total },
  payment: { method, status, deposit, outstanding },
  status: 'COMPLETED',
  customer: { name, phone } || null,
  createdAt,
  completedAt,
  immutableSnapshot: true
}
```

### Field classification

| Field | Classification |
|---|---|
| `saleId` | AUTHORITATIVE identity |
| `idempotencyKey` | AUTHORITATIVE retry identity |
| `type` | AUTHORITATIVE event type |
| `channel` | AUTHORITATIVE channel |
| `businessId` | TRANSITIONAL scope; Product fields/request fallback |
| `storeId` | TRANSITIONAL scope; Product fields/request fallback |
| `sellerId` | AUTHORITATIVE resolved Product owner |
| `cashierId` | AUTHORITATIVE authenticated caller |
| `items.productId` | AUTHORITATIVE reference |
| `items.variantId` | CURRENTLY `null`; not implemented as variant authority |
| `items.productNameAtSale` | IMMUTABLE SNAPSHOT |
| `items.quantity` | AUTHORITATIVE request quantity after validation |
| `items.stockQuantity` | AUTHORITATIVE inventory delta |
| `items.unitMode` | AUTHORITATIVE validated mode |
| `items.pcsPerUnit` | SNAPSHOT from Product |
| `items.unitPriceAtSale` | IMMUTABLE SNAPSHOT resolved server-side |
| `items.lineTotal` | DERIVED and persisted snapshot |
| `requestedUnitPrice` | DIAGNOSTIC snapshot, not authority |
| `totals` | DERIVED transaction totals |
| `payment` | POS-recorded payment state, not external gateway verification |
| `status` | AUTHORITATIVE POS result, but no later sale state machine exists yet |
| `customer` | SNAPSHOT supplied/validated for credit sales |
| `createdAt/completedAt` | AUTHORITATIVE server-function timestamps |
| `immutableSnapshot` | CONTRACT marker |

## 6. Actual `inventory_movements/{movementId}` schema

### Sale movement

```js
{
  movementId,
  type: 'SALE',
  source: 'POS',
  saleId,
  productId,
  quantity: -item.stockQuantity,
  previousStock,
  resultingStock,
  businessId,
  storeId,
  actorUid,
  createdAt
}
```

### Adjustment movement

```js
{
  movementId,
  type: ADJUSTMENT | PURCHASE | RETURN | TRANSFER | CONSUMPTION,
  source,
  productId,
  quantity: delta,
  previousStock,
  resultingStock,
  reason,
  businessId,
  storeId,
  ownerUid,
  actorUid,
  createdAt
}
```

### Field meaning

| Field | Meaning |
|---|---|
| `movementId` | deterministic movement document identity |
| `type` | movement classification |
| `source` | originating UI/workflow |
| `saleId` | present only for POS sale movement |
| `productId` | Product affected |
| `quantity` | signed stock delta |
| `previousStock` | stock read in transaction before change |
| `resultingStock` | stock after change |
| `reason` | present for adjustments; human explanation |
| `businessId/storeId` | transitional business scope |
| `ownerUid` | present for adjustment movements |
| `actorUid` | authenticated function caller |
| `createdAt` | server-function generated ISO timestamp |

There is currently no `variantId` in the movement schema.

## 7. Actual Product/stock relationship

Current state is:

```text
PRODUCT STOCK = transitional current-stock field
```

More precisely:

- Existing UI reads `products.stock` for marketplace availability, POS search, cart synchronization, seller Product management, analytics and low-stock display.
- The migrated POS and operational writers mutate `products.stock` only through server callables.
- `inventory_movements` records the corresponding event.
- Existing Product creation still accepts an initial `stock` value through the legacy Product create path.
- `products.stock` is therefore not yet a pure projection from a separate Inventory balance document.
- It is also no longer a freely client-writable transaction field for Product updates because Firestore rules reject client updates affecting `stock`.

Actual classification:

```text
TRANSITIONAL HYBRID:
products.stock is the current readable balance and server-updated quantity;
inventory_movements is the audit trail;
no separate balance collection exists yet.
```

## 8. Actual variant structure

Product variants are embedded in the Product document. The normalizer is:

```text
js/app/39-product-core.js: normalizeVariants()
```

The actual conceptual normalized shape is:

```js
products/{productId}.variants: [
  {
    name,
    options: [String]
  }
]
```

The Product form in `js/app/08-app-state.js` stores normalized variants. Product rules only require `variants` to be a list.

The product showcase and negotiation UI also use transient selections such as:

```text
selectedVariants.color
selectedVariants.size
chosenColor
chosenSize
```

Current findings:

```text
variant identity: NOT canonical
variantId: NOT stored by posSale; always null
attributes: embedded/name/options only
variant price: no server-authoritative variant price resolution in posSale
SKU: legacy Product metadata may exist, but no variant SKU authority confirmed
variant stock: NOT authoritative; Product stock is aggregate/current stock
```

The POS search UI does not expose a variant selector. Variant inventory was not implemented in this review.

## 9. Actual POS UI walkthrough

The static current UI is available through the live workspace preview started for this review.

### A. POS home — REAL

Source:

```text
html/09-admin-sell.html:276
businessOSForm
```

The form is titled `SOKOHAI SMART POS` and includes a POS action selector.

### B. Product selection — REAL

Source:

```text
html/09-admin-sell.html:299
js/app/17-hub.js: searchPosProductsLive()
```

It provides a product search/scan-style input, search results, stock text and price. Product results are also cached locally for offline browsing.

### C. Variant selection — NOT PRESENT IN POS

Product forms/showcase support embedded variant data, but the actual POS flow does not present a canonical variant-selection control.

### D. Quantity — REAL

The POS cart supports quantity increment/decrement through:

```text
js/app/17-hub.js: updatePosCartQty()
```

### E. Cart — REAL

Source:

```text
html/09-admin-sell.html:307
#posCartItems
```

### F. Totals — REAL UI, server reconciliation differs

The UI displays `posCartTotal` and supports promotional/discount calculations. `posSale` currently resolves the Product catalogue price server-side and writes `discount: 0`. The Hub legacy aggregate ledger can still use the UI's final total. Therefore the displayed discounted total and authoritative `sales.totals` are not yet one unified price/discount contract.

### G. Payment — REAL

The UI exposes:

```text
Cash
Mobile/Mpesa-related options
Deni
Awamu
```

and credit customer/deposit fields.

The new callable records POS payment state. It does not verify an external mobile-money payment; that remains the existing payment-system responsibility.

### H. Confirm sale — REAL

The main button is:

```text
HIFADHI MAUZO POS
```

It invokes `window.submitPosSale()`.

### I. Receipt — NOT CONFIRMED

No canonical receipt document/rendering path connected to `sales/{saleId}` was found. Existing UI contains printing-job functionality, but a completed POS sale does not currently produce a verified receipt from the new Sale document.

### J. Sales history — LEGACY / LEDGER-BASED

Existing dashboard and Hub analytics read `shop_ledger`. No current UI query of `sales` or `inventory_movements` was found. Therefore the new authoritative Sale collection is not yet surfaced as a dedicated sales-history screen.

## 10. Actual Product Management UI walkthrough

### Product list — REAL

```text
js/app/30-seller-products.js
```

It reads Products by legacy `userId`, displays title, price, stock, publication status and controls.

### Add Product — REAL legacy-compatible form

```text
js/app/08-app-state.js
html/09-admin-sell.html
```

It writes Product fields including:

```text
title
price
buyPrice
category
variants
stock
publication/availability fields
```

Initial Product creation still writes opening `stock` client-side.

### Edit Product — REAL

Product editing uses existing modal/state infrastructure. Client Product updates cannot modify `stock` after the rule change, but other Product fields remain legacy-compatible.

### Stock adjustment — REAL, now callable-backed

```text
js/app/30-seller-products.js: skhMPStock()
js/app/15-pos-sales.js: updateExistingStockAmount()
```

Both call `inventoryAdjust` rather than directly updating Product stock.

### Product details — REAL

```text
js/app/07-product.js
js/app/39-product-showcase.js
```

These display Product catalogue data and current `products.stock` availability.

### Variants — REAL data/form support, not POS-authoritative

Variants can be represented in Product form/showcase data, but no variant-level inventory identity is connected to the new transaction path.

## 11. Fresh stock-writer review

| File / function | Mutation or read | Authority | Status |
|---|---|---|---|
| `functions/inventory-authority.js: posSale` | decrements `products.stock` in transaction | SERVER AUTHORITATIVE | Migrated |
| `functions/inventory-authority.js: inventoryAdjust` | changes `products.stock` in transaction | SERVER AUTHORITATIVE | Migrated |
| `js/app/08-app-state.js` | writes initial `stock` on Product create | CLIENT CREATE / LEGACY OPENING BALANCE | Remaining legacy path |
| `js/app/15-pos-sales.js: processSmartOfflineSale` | POS sale request, no direct stock write | SERVER AUTHORITATIVE through callable | Migrated |
| `js/app/15-pos-sales.js: updateExistingStockAmount` | adjustment request | SERVER AUTHORITATIVE through callable | Migrated |
| `js/app/14-map-onboarding.js` | transfer receipt request | SERVER AUTHORITATIVE through callable | Migrated |
| `js/app/17-hub.js: submitPosSale` | POS sale request; legacy ledger afterward | SERVER stock + LEGACY ledger | Transitional |
| `js/app/17-hub.js: submitStockTransfer` | transfer adjustment request | SERVER AUTHORITATIVE movement | Migrated |
| `js/app/17-hub.js: submitReturnSale` | return adjustment request | SERVER AUTHORITATIVE movement | Migrated |
| `js/app/18-cockpit.js` | offline sync / purchase / spoilage requests | SERVER AUTHORITATIVE movement/sale | Migrated |
| `js/app/22-printing.js: reducePrintingPaperStock` | consumption request | SERVER AUTHORITATIVE movement | Migrated |
| `js/app/30-seller-products.js: skhMPStock` | delta adjustment request | SERVER AUTHORITATIVE movement | Migrated |
| `js/app/23-smart-cart.js` | reads Product stock into cart | READ ONLY / CLIENT CACHE | Legacy read |
| `js/app/39-product-core.js` | normalizes/read availability | READ ONLY | Legacy-compatible read |
| `js/app/39-showcase-logic.js` | renders availability from stock | READ ONLY | Legacy-compatible read |

No remaining direct client Product stock mutation was found in the migrated operational paths. The initial Product-create stock write remains.

## 12. Fresh sale-writer review

| File / function | Collection | Authority | Purpose |
|---|---|---|---|
| `functions/inventory-authority.js: posSale` | `sales` | SERVER | Canonical migrated POS Sale |
| `functions/inventory-authority.js: posSale` | `inventory_movements` | SERVER | POS SALE movement |
| `functions/inventory-authority.js: posSale` | `shop_ledger` optional | SERVER projection | Legacy compatibility |
| `js/app/17-hub.js: submitPosSale` | `shop_ledger` | CLIENT legacy write | Aggregate POS income/debt/activities |
| `js/app/15-pos-sales.js: saveLedgerEntry` | `shop_ledger` | CLIENT legacy write | Manual ledger entry |
| `js/app/15-pos-sales.js` debt/payment handlers | `shop_ledger` | CLIENT legacy write | Debt settlement / payment records |
| `js/app/18-cockpit.js` | `shop_ledger` | CLIENT legacy write | Legacy aggregate ledger, purchase/expense/offline summary |
| `js/app/22-printing.js` | `shop_ledger` | CLIENT legacy write | Printing income/receivable |
| `js/17-pesapal-return.js` | `shop_ledger` | CLIENT legacy write | Wallet top-up/salary compatibility entries, not canonical POS Sale |
| `js/app/62-missing-features.js` | `pos_transactions` | CLIENT legacy path | POS void-history feature; not connected to `sales` |
| `js/app/11-analytics.js`, `js/app/03-dashboard.js`, `js/app/17-hub.js` | `shop_ledger` | READERS | Existing reporting/history |

`shop_ledger` is not the canonical Sale collection. It remains a mixed ledger containing income, debt, expenses, printing, salary and other operational records.

## 13. POS → Inventory trace

| Stage | Actual result |
|---|---|
| POS UI | REAL — `businessOSForm`, `submitPosSale()` |
| Request | REAL — callable request through `skh.wrapCallable('posSale')` |
| Authentication | REAL — `authOf(req)` |
| Product read | REAL — transaction reads `products/{id}` |
| Owner check | REAL for owner/shopOwnerUid/admin; staff UID path missing |
| Business/Store check | PARTIAL — checks fields when present; fallback scope remains transitional |
| Price | REAL server Product price; discount contract incomplete |
| Quantity | REAL validated integer and unit conversion |
| Stock | REAL atomic validation/decrement for migrated calls |
| Movement | REAL `inventory_movements` creation |
| Sale | REAL `sales` creation |
| Receipt | MISSING from new Sale authority |
| History | LEGACY — ledger readers, no `sales` reader |
| Legacy aggregate ledger | PARTIAL/LEGACY — still client-written by Hub/Cockpit |

## 14. Online Order → Inventory trace

No implementation was made during this review. Current observed path:

```text
Product / cart
  ↓
js/app/02-checkout.js
  ↓
pending checkout in localStorage/session context
  ↓
PesaPal checkout callable
  ↓
PesaPal return/status verification
  ↓
orders / SokoPay / negotiation commerce records
  ↓
delivery/escrow lifecycle
```

### Current status

| Stage | Status | Finding |
|---|---|---|
| Product → cart | IMPLEMENTED | Product stock is read into cart/cache |
| Cart → checkout | IMPLEMENTED | Checkout stores product/cart snapshots |
| Order creation | IMPLEMENTED in several existing paths | `orders` and SokoPay/negotiation records exist |
| Payment pending | IMPLEMENTED | Existing payment/order statuses use pending states |
| Payment verification | IMPLEMENTED separately | Existing PesaPal server verification exists |
| Inventory reservation | MISSING | No confirmed reservation write was found |
| Inventory consumption | MISSING | No online order call to `posSale`/`inventoryAdjust` was found |
| Cancellation release | MISSING | No shared inventory reservation release was found |
| Refund release | MISSING/UNKNOWN | Payment/escrow refund exists in domain-specific paths, but no inventory release bridge |
| Expiry release | MISSING | No shared inventory reservation expiry was found |
| Completion → inventory | MISSING | Order completion does not update the new inventory authority |

The online order system remains a separate commerce/payment/delivery flow that is not yet connected to `sales` or `inventory_movements`.

## 15. Hybrid trace

The target shape is not currently complete.

Actual state:

```text
One legacy Product document can be read by both marketplace/cart and POS.
POS migrated path → server stock mutation + sales/movement records.
Online order path → order/payment/delivery records, no inventory mutation.
```

Therefore:

```text
ONE PRODUCT READ: YES
ONE CURRENT products.stock FIELD: YES
ONE AUTHORITATIVE POS STOCK WRITER: YES for migrated POS paths
ONE SHARED POS + ONLINE INVENTORY TRANSACTION: NO
```

Hybrid is **PARTIAL / NOT SAFE TO CLAIM**.

## 16. Staff authority

Current `shop_staff` records inspected in:

```text
js/app/15-pos-sales.js
js/app/14-map-onboarding.js
```

contain fields such as:

```text
shopOwnerId
name
salary
role
status
performanceScore
```

They do not consistently contain an authenticated `userId`/UID. Existing performance updates query by:

```text
shopOwnerId + name
```

Current implication:

```text
A staff display name is not a secure authenticated identity.
```

The new server authority currently permits the owner/shopOwnerUid/admin paths, but does not safely grant arbitrary `shop_staff` records POS authority.

## 17. `shop_ledger`

### Writers

```text
js/app/15-pos-sales.js
js/app/17-hub.js
js/app/18-cockpit.js
js/app/22-printing.js
js/17-pesapal-return.js
functions/inventory-authority.js (optional server compatibility projection)
```

### Readers

```text
js/app/03-dashboard.js
js/app/09-feed-announcements.js
js/app/11-analytics.js
js/app/17-hub.js
js/app/18-cockpit.js
```

### Purposes

```text
income_offline
income_online
debt
expense
receivable
salary/payment-related entries
printing
wallet and other operational records
```

### Authority

```text
NOT canonical POS Sale authority
MIXED legacy operational ledger
```

### Current rules

```text
match /shop_ledger/{id} {
  allow read, write: if signedIn();
}
```

This means any authenticated client can currently create or modify ledger records. It was not changed in this review.

## 18. Relevant Firestore rules

### Products

```text
allow read: if true;
allow create: if signedIn() && validProduct(request.resource.data) && owner/agent/admin condition;
allow update: if ownsProduct(resource.data)
  && validProduct(request.resource.data)
  && request.resource.data.userId == resource.data.userId
  && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['comments','stock']);
allow delete: if false;
```

Meaning:

```text
Product is public-readable.
Product owner/approved-agent/admin can edit catalogue fields.
Client Product stock update is denied.
Product physical deletion is denied.
```

### Sales

```text
allow read: if signedIn() && (isAdmin()
  || resource.data.sellerId == request.auth.uid
  || resource.data.cashierId == request.auth.uid);
allow write: if false;
```

### Inventory movements

```text
allow read: if signedIn() && (isAdmin()
  || resource.data.ownerUid == request.auth.uid
  || resource.data.actorUid == request.auth.uid);
allow write: if false;
```

### Shop ledger

```text
allow read, write: if signedIn();
```

This is the largest remaining ledger security gap.

## 19. UI/UX findings

### Strengths

- Existing POS is a real workflow, not a static card.
- Product search, cart, quantity, payment method and debt fields exist.
- Product management has stock visibility, filters and archive/publish actions.
- Existing styles use the current light SokoHai direction in many surfaces.
- Forms are compact enough for ordinary desktop use.

### Concrete improvements, not implemented

1. Add a dedicated authoritative Sale History reader from `sales`, not only `shop_ledger`.
2. Add an authoritative receipt view tied to `saleId`.
3. Make the server-confirmed total/discount visible before final confirmation.
4. Add visible pending/retry/reconciliable state when the callable/network fails.
5. Add a clear “server-confirmed” result instead of only a success alert.
6. Add a canonical variant selector to POS before variant sales are enabled.
7. Replace inline alert-heavy error handling with the existing toast/modal error system.
8. Add explicit loading/disabled state to the main POS submit button during callable execution.
9. Add mobile sticky cart total and larger touch targets for quantity controls.
10. Remove or clearly label legacy dashboard sample/static KPI sections that coexist with real ledger-driven sections.
11. Make payment state terminology distinguish `RECORDED`, `CREDIT_OPEN`, and `PENDING_VERIFICATION` in the UI.
12. Add empty states for no Products, no sales, no movements and unavailable server authority.

## 20. Responsive findings

### Source-level review

The POS form uses:

```text
width: 95%
max-width: 550px
flexible search/cart areas
```

and several controls are full-width, which is suitable for mobile.

### Not verified

Authenticated interactive Desktop/Tablet/Mobile browser execution was not completed because:

- the static preview has no authenticated Firebase session;
- no emulator/auth fixture was started;
- no browser automation tool was available in this review;
- the POS callable requires authenticated Firebase context.

Therefore actual responsive runtime status is:

```text
SOURCE-LEVEL: PARTIALLY POSITIVE
RUNTIME: NOT VERIFIED
```

## 21. Test state

### Passed

```text
node tools/test_step3a0_authority.mjs
```

```text
STEP 3A-0 authority contract: all checks passed
```

Syntax checks passed for all Step 3A-0 modified JavaScript files.

The current UI was served from the actual repository using:

```text
python3 -m http.server 8080 --bind 0.0.0.0
```

### Failed / blocked

```text
npm test
```

The existing suite stops because `jsdom` is missing:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'jsdom'
```

### Not run

```text
Firebase Emulator transaction tests
Authenticated callable tests
Concurrent oversell test
User A/User B live rules test
Online-order inventory test
Hybrid inventory test
Production deployment test
```

No deployment or production verification was performed.

## 22. Recommended improvements ordered by dependency

These are recommendations only. None were implemented in this review.

### Dependency 1 — authority correctness

1. Define canonical Business/Store scope server-side rather than accepting fallback request scope.
2. Link `shop_staff` to authenticated UIDs and capability records.
3. Connect online orders to reservation/consumption/release movements.
4. Define the variant identity/SKU/stock contract.
5. Replace initial client Product stock seeding with server-authorized opening balance.

### Dependency 2 — data/reporting correctness

6. Migrate legacy POS aggregate ledger projections to reference `saleId` consistently.
7. Build sales and movement history readers from `sales` and `inventory_movements`.
8. Reconcile Hub/Cockpit discount totals with the server price/discount contract.
9. Define returns/voids against original sale IDs.

### Dependency 3 — UI completeness

10. Add authoritative receipt/history screens.
11. Add variant-aware POS selection.
12. Add clear pending/retry/error/loading states.
13. Add mobile POS polish and responsive runtime verification.

### Dependency 4 — validation

14. Install/restore the test dependency set or run the suite in its intended environment.
15. Add Firestore Emulator tests for authorization, retries and concurrency.
16. Run the nine seller-mode/management capability combinations after the authority contracts are complete.

# HARD STOP

This report shows the actual implementation and its limitations.

```text
STEP 3A-0.5 REVIEW COMPLETE
NO IMPLEMENTATION PERFORMED DURING REVIEW
STEP 3B NOT STARTED
STEP 3C/USAFIR NOT STARTED
```
