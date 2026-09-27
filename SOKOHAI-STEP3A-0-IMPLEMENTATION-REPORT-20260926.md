# SOKOHAI STEP 3A-0 — POS + INVENTORY AUTHORITY REPAIR REPORT

**Date:** 2026-09-26
**Scope:** POS + Inventory authority only
**Services / Usafir / Dashboard / Discover / Taxonomy / Payment rewrite:** Not implemented

## Final status

```text
CORE POS AUTHORITY REPAIR: IMPLEMENTED
FULL STEP 3A-0 PRODUCTION CLOSURE: BLOCKED BY ONLINE-ORDER MIGRATION
```

The physical POS path now has a server-authoritative, atomic sale transaction. Direct client stock mutations in the audited Product/POS paths were removed and routed through server callables.

The complete Hybrid boundary is not yet claimable because existing online orders have not yet been mapped and connected to reservation/consumption/release operations. No speculative order mutation was added.

## A. Root cause

STEP 3A was blocked because:

1. `products.stock` was used as both catalogue data and transactional inventory.
2. Multiple browser modules directly incremented, decremented, or overwrote Product stock.
3. POS stock mutation and `shop_ledger` writes were separate operations.
4. `shop_ledger` is a mixed operational ledger and was broadly client-writable.
5. No authoritative `sales` collection or atomic POS sale + inventory transaction existed.
6. A POS credit-sale validation path could decrement stock before validating the customer name.
7. POS trusted browser-supplied price/name values for historical records.
8. No confirmed online-order inventory reservation/release bridge existed.
9. Existing staff records do not contain a canonical authenticated staff UID, so staff authorization cannot safely be inferred from display name.

## B. Files inspected

```text
js/app/08-app-state.js
js/app/14-map-onboarding.js
js/app/15-pos-sales.js
js/app/17-hub.js
js/app/18-cockpit.js
js/app/22-printing.js
js/app/30-seller-products.js
js/app/23-smart-cart.js
js/app/02-checkout.js
js/app/04-orders-escrow.js
js/app/16-pos-admin-jobs.js
functions/index.js
functions/negotiation.js
functions/business.js
shared/business-context-core.js
firestore.rules
```

## C. Files changed for Step 3A-0

```text
functions/inventory-authority.js                 CREATED
functions/index.js                               MODIFIED
firestore.rules                                  MODIFIED
js/app/15-pos-sales.js                           MODIFIED
js/app/14-map-onboarding.js                      MODIFIED
js/app/17-hub.js                                 MODIFIED
js/app/18-cockpit.js                             MODIFIED
js/app/22-printing.js                             MODIFIED
js/app/30-seller-products.js                     MODIFIED
tools/test_step3a0_authority.mjs                CREATED
```

No Service or Usafir files were created.

## D. Functions changed

### `posSale`

Added in:

```text
functions/inventory-authority.js
functions/index.js
```

Server behavior:

```text
authenticated request
→ validate idempotency key
→ read Product inside Firestore transaction
→ resolve Product owner
→ validate Business/Store scope when present
→ resolve catalogue price from Product
→ validate quantity/payment/credit fields
→ verify stock
→ create immutable sales/{saleId}
→ decrement Product stock atomically
→ create inventory_movements/{movementId}
→ optionally create a compatibility shop_ledger projection
→ commit
```

### `inventoryAdjust`

Added in:

```text
functions/inventory-authority.js
functions/index.js
```

Used for non-sale stock movements:

```text
ADJUSTMENT
PURCHASE
RETURN
TRANSFER
CONSUMPTION
```

A manual reduction is recorded as an adjustment/operational movement, not fabricated as a sale.

## E. Collections affected

### New authoritative transaction collections

```text
sales/{saleId}
inventory_movements/{movementId}
```

### Existing collections preserved

```text
products/{productId}
shop_ledger/{legacy-or-compatibility-entry}
orders/{orderId}
purchase_orders/{orderId}
stock_transfers/{transferId}
```

The existing `products` collection remains the compatibility/read projection for current UI and marketplace reads. Its `stock` field is now server-mutated for the migrated transactional paths.

## F. Authority before repair

```text
Product catalogue       → products
Stock state             → products.stock, with many client writers
POS sale                → mixed client UI + shop_ledger rows
Payment                 → mixed client values / existing payment systems
Online order            → orders, lifecycle not mapped to inventory
Manual restock          → direct Product update
Printing consumption    → direct Product update
Transfer                → direct Product update
```

## G. Authority after repair

```text
Product identity        → products
Product price           → products.price at server transaction time
Stock mutation          → inventory-authority server callables only
POS sale                → sales/{saleId}
Inventory audit         → inventory_movements/{movementId}
Compatibility ledger    → server-created projection where enabled
Payment authority       → existing SokoPay/PesaPal systems; not rewritten
Online order authority  → existing orders system; inventory bridge remains pending
Delivery authority      → existing Usafir/Delivery system; not touched
```

A POS sale item preserves:

```text
productId
variantId placeholder for future variant authority
productNameAtSale
quantity
stockQuantity
unitMode
pcsPerUnit
unitPriceAtSale
lineTotal
```

The client-supplied price is retained only as diagnostic input and is not used for the authoritative total.

## H. Security changes

### Firestore Product rule

Client Product updates may no longer modify `stock`:

```text
products/{id}
  update rejects affected key: stock
```

Product creation remains compatible with the existing legacy initial catalogue flow. Initial catalogue stock creation is not treated as a completed sale.

### New server-owned collections

```text
sales/{id}
  client write: denied

inventory_movements/{id}
  client write: denied
```

Reads are limited to the sale owner/cashier or inventory owner/actor.

### Server validation

The callables validate:

```text
authentication
Product existence
Product owner
shopOwnerUid relationship where applicable
Business/Store scope when Product carries those fields
positive bounded quantity
non-negative resulting stock
payment method
credit customer name
credit deposit <= total
idempotency key
```

## I. Direct stock-writer migration

The following audited paths no longer directly mutate Product stock:

```text
js/app/14-map-onboarding.js       → inventoryAdjust(TRANSFER)
js/app/15-pos-sales.js            → posSale / inventoryAdjust
js/app/17-hub.js                  → posSale / inventoryAdjust
js/app/18-cockpit.js              → posSale / inventoryAdjust
js/app/22-printing.js             → inventoryAdjust(CONSUMPTION)
js/app/30-seller-products.js      → inventoryAdjust(ADJUSTMENT)
```

Static search confirmed no remaining direct Product stock mutation in these migrated paths.

## J. Idempotency

POS and adjustment requests require an idempotency key.

POS sale identity:

```text
sales/pos_{idempotencyKey}
inventory_movements/pos_{idempotencyKey}
```

Adjustment identity:

```text
inventory_movements/adjust_{idempotencyKey}
```

Repeated submission returns the existing result rather than decrementing stock again.

## K. Tests executed

### Passed

```text
node tools/test_step3a0_authority.mjs
```

Result:

```text
STEP 3A-0 authority contract: all checks passed
```

The focused contract checked:

- server callables exist;
- Firestore transactions are used;
- idempotency exists;
- sale and movement records exist;
- client Product stock writes were removed from migrated paths;
- Product rules reject client stock updates;
- sale/movement client writes are denied;
- modified JavaScript passes syntax checks.

### Passed syntax checks

```text
node --check functions/inventory-authority.js
node --check functions/index.js
node --check js/app/14-map-onboarding.js
node --check js/app/15-pos-sales.js
node --check js/app/17-hub.js
node --check js/app/18-cockpit.js
node --check js/app/22-printing.js
node --check js/app/30-seller-products.js
```

### Existing regression suite

```text
npm test
```

Result: **not completed**.

The existing suite progressed through many contracts but stopped at a pre-existing missing dependency:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'jsdom'
imported from tools/test_negotiation_dom.mjs
```

No test failure attributable to the Step 3A-0 changes was observed before that dependency failure. The suite was not changed and no deployment was performed.

## L. Required tests not honestly executable yet

The following require Firebase Emulator/Firestore test fixtures or deployed callable infrastructure and were not claimed as passed:

```text
valid authenticated POS sale against Firestore
invalid product
invalid variant
insufficient stock
invalid quantity
unauthorized User A/User B mutation
concurrent oversell
repeated callable retry against the same key
actual online-order reservation
actual online-order cancellation/release
actual Hybrid POS + online shared inventory
```

No production deployment or live database test was performed.

## M. Remaining blockers

### 1. Online order inventory lifecycle

Existing `orders`, checkout, payment and negotiation paths need a deliberate mapping for:

```text
reservation
payment pending
payment verified
consumption
cancellation release
refund release
expiry
```

No direct online-order stock mutation was invented in this repair.

### 2. Staff authorization

Existing `shop_staff` records are commonly identified by display `name` and do not consistently contain an authenticated `userId`. Staff POS access therefore needs a separate reviewed identity-link migration before staff can be granted server-authoritative inventory permissions.

### 3. Product creation migration

Legacy Product creation still writes an initial `stock` value directly. This is treated as initial catalogue seeding, not a sale, but it should eventually become an explicit server-authorized inventory opening balance.

### 4. Existing `shop_ledger` rules

`shop_ledger` remains a mixed legacy collection with broad signed-in writes for compatibility. New migrated POS paths can use the server projection, but full ledger hardening requires enumerating and migrating every legacy writer.

### 5. Variant stock

The new sale snapshot currently records `variantId: null` because the existing Product variant model is embedded and no authoritative variant inventory identity was confirmed. Variant-specific stock remains pending.

## N. Compatibility with STEP 3B Services

```text
NOT YET SAFE FOR COMPLETE STEP 3B
```

The repaired POS boundary is a usable foundation for future service transactions, but Step 3B cannot yet claim all required Online/Offline/Hybrid behavior because:

- online order inventory reservation is unresolved;
- staff/provider capability authority is unresolved;
- variant inventory identity is unresolved;
- live callable/emulator tests were not run.

Service catalogue work could be separately designed, but the requested complete production Service implementation must wait for the remaining authority work.

## O. Compatibility with STEP 3C Usafir

No Usafir code was changed.

The transaction boundary is compatible in principle because it separates:

```text
Product inventory
POS sale
Payment
Delivery/Usafir
```

However, this is not sufficient to approve Usafir implementation. Usafir must continue using its existing delivery authority and must not infer transport completion from Product/POS state.

## P. Final authority map

```text
PRODUCT
→ products catalogue identity and compatibility projection

INVENTORY
→ Product stock mutated by inventory-authority callables
→ inventory_movements audit trail

POS SALE
→ sales/{saleId}, atomic with Product stock decrement

ORDER
→ orders/{orderId}, existing online commerce authority
→ inventory bridge still pending

PAYMENT
→ existing SokoPay/PesaPal authority
→ POS payment state is recorded, not external-payment verification

DELIVERY
→ existing Usafir/Delivery authority
→ untouched
```

## Final hard stop

```text
STEP 3A-0 CORE REPAIR COMPLETE
STEP 3A-0 FULL PRODUCTION CLOSURE BLOCKED ON ONLINE-ORDER INVENTORY LIFECYCLE
SERVICES NOT IMPLEMENTED
USAFIR NOT IMPLEMENTED
```
