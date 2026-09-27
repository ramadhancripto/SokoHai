# SOKOHAI STEP 3A — PRODUCTS + POS BLOCKER REPORT

**Date:** 2026-09-26
**Status:** STOPPED BEFORE IMPLEMENTATION
**Reason:** The mandatory stop conditions were reached during the pre-change audit. Existing Product/POS/stock/sales authority is not singular or safe enough to modify minimally without first choosing and implementing a transaction authority.

## 1. EXECUTIVE RESULT

No Step 3A application files were modified.

This is intentional. The requested Step 3A requires production-authoritative Product + POS + shared inventory behavior, including concurrent Hybrid tests. The current implementation contains multiple direct client stock writers and multiple POS/ledger paths. Changing only one path would create a more dangerous split-brain system.

The correct next action is not a UI patch. It is a focused, reviewed transaction-authority repair for POS/stock, with a defined migration boundary.

## 2. PRODUCT ARCHITECTURE FOUND

### Product source

```text
Collection: products
Primary client creation/editing:
  js/app/08-app-state.js
  js/app/05-forms.js
  js/app/07-product.js
  js/app/39-product-core.js
  js/app/39-product-showcase.js
  js/app/30-seller-products.js
  js/app/15-pos-sales.js
```

Current product records use fields such as:

```text
title
price
stock
userId
ownerName
category
subcategory/filters
variants
imagesArray
publicationStatus
availabilityStatus
saleMode
createdAt
updatedAt
```

The existing Product system is real and reusable. It is also a legacy-compatible document model rather than the requested fully normalized `businessId/storeId/ownerUid` product schema.

### Existing product ownership

`firestore.rules` uses `products.userId` as the primary ownership field, with `managedByAgentUid` and admin exceptions. Seller/dashboard queries also primarily use `userId` and `shopOwnerUid`.

Step 2 created Business/Store context, but Product records have not yet been migrated or adapted to use canonical `businessId/storeId` references.

## 3. VARIANT AUDIT

Variants are embedded in Product records and product form/showcase logic. Existing tests confirm variant behavior for categories such as fashion and technology.

Observed current relationship:

```text
products/{productId}
  └── variants / selectedVariants / option-like fields
```

No separately authoritative `variants` collection or server-side variant inventory authority was found in the current audit.

This means variant uniqueness, SKU ownership and variant-specific stock cannot safely be implemented by adding another collection without first defining the migration/authority model.

## 4. INVENTORY AUTHORITY BLOCKER

The current implementation treats `products.stock` as operational quantity in multiple paths. It is not merely a read-only projection today.

### Confirmed stock writers/readers

| File | Function/path | Operation | Current authority |
|---|---|---|---|
| `js/app/08-app-state.js` | product save | creates `stock` on Product | Product document |
| `js/app/14-map-onboarding.js` | transfer/stock path | increments Product `stock` | Product document |
| `js/app/15-pos-sales.js` | `updateExistingStockAmount` | direct `increment(stock)` | Product document |
| `js/app/15-pos-sales.js` | `saveOfflineInventoryItem` | creates Product with `stock` | Product document |
| `js/app/15-pos-sales.js` | `processSmartOfflineSale` | direct `increment(-pcsToDeduct)` | Product document |
| `js/app/17-hub.js` | POS/cart paths | direct decrement/increment | Product document |
| `js/app/18-cockpit.js` | POS/stock paths | direct decrement/increment | Product document |
| `js/app/22-printing.js` | printing consumption | direct decrement | Product document |
| `js/app/30-seller-products.js` | `skhMPStock` | direct absolute stock update | Product document |
| `js/app/23-smart-cart.js` | cart refresh | reads/copies Product stock into cart state | Product/cached client state |
| `js/app/39-product-core.js` | normalization | interprets Product stock | Product document |
| `js/app/39-showcase-logic.js` | availability | renders Product stock | Product document |

### Why this blocks Step 3A

There is no single transaction layer currently coordinating:

```text
POS sale
online order reservation
online cancellation/release
return
manual stock adjustment
printing consumption
stock transfer
variant-specific quantity
```

A new POS function or a new inventory collection added without migrating these writers would leave old and new quantities competing.

## 5. POS AUTHORITY BLOCKER

### Existing POS entry points

- `html/09-admin-sell.html`
- `html/21-scripts.html`
- `js/app/15-pos-sales.js`
- `js/app/17-hub.js`
- `js/app/18-cockpit.js`
- `js/app/16-pos-admin-jobs.js`
- dashboard/POS tabs in `js/app/03-dashboard.js` and `js/app/10-dashboard-tabs.js`

### Existing transaction record

The primary visible POS record is:

```text
shop_ledger
```

There is no confirmed canonical `sales`/`pos_sales` collection with a stable, enforced sale schema in the current implementation.

`shop_ledger` is used for many different event types:

```text
income_offline
debt
expense
receivable
income_online
salary/payment-related entries
```

The same collection is written by multiple modules with different field sets.

### Rules problem

Current rules include:

```text
match /shop_ledger/{id} { allow read, write: if signedIn(); }
```

This is too broad for an authoritative POS sale ledger. A client can currently write ledger records without a canonical server sale validation path.

Changing this rule safely requires first inventorying every legitimate writer and migrating the writes. Doing only a rule tightening now would break existing flows; leaving it unchanged would fail the requested production security requirements.

## 6. CONCRETE POS BUG FOUND

In `js/app/15-pos-sales.js`, `processSmartOfflineSale` performs the Product stock decrement before all credit-sale validation is complete:

```text
read current stock
check available stock
update Product stock: decrement
then validate Deni customer name/deposit fields
then write shop_ledger
```

If the payment method is `Deni` and the customer name is missing, the function returns after the stock has already been decremented. This can produce:

```text
stock decreased
sale not recorded
```

This is a production data-integrity issue and cannot be safely fixed by merely moving one line without deciding the authoritative sale transaction and rollback/idempotency behavior.

## 7. SALE SCHEMA FINDING

Current ledger records preserve some historical fields such as:

```text
productId
productName
qty
unitPrice
amount
payMethod
profit
date
status
shopOwnerId
```

But fields are not consistent across all writers and are not protected by a server-authoritative sale function.

The requested immutable sale facts are not guaranteed uniformly:

```text
productNameAtSale
variantLabelAtSale
skuAtSale
quantity
unitPriceAtSale
discountAtSale
lineTotal
```

Historical sales could also be affected by inconsistent field interpretation in dashboard analytics.

## 8. PRICE / PROFIT FINDINGS

- Product catalogue price is stored on Product.
- POS records transaction price in some ledger entries.
- `processSmartOfflineSale` calculates profit using a hardcoded `40%` formula.
- Dashboard/chart paths contain hardcoded sample chart values in places, contrary to a production-authoritative sales report.

Before implementing Step 3A sales reporting, the project must define whether profit is:

```text
actual sale price - recorded cost
```

or another existing business rule. It must not remain a hardcoded percentage.

## 9. ONLINE ORDER RELATIONSHIP BLOCKER

Existing online orders use `orders` and several checkout/order flows. They preserve product/price snapshots in different paths, and payment/delivery state is handled by existing systems.

However, no single verified inventory reservation/release bridge was found that coordinates online orders with the direct Product stock writers above.

Therefore the mandatory Hybrid test cannot be honestly passed yet:

```text
stock 100
POS sale 10
online order 20
expected shared available 70
```

The current source does not prove that both channels mutate one atomic authority without races or double deduction.

## 10. MANAGEMENT/CAPABILITY FINDING

Step 2 provides normalized management/capability data and a Business/Store resolver. Existing Product/POS UI does not yet consistently call that resolver for authorization.

Current dashboard and POS access is distributed through:

```text
currentMode
shopOwnerUid
sellerType
shopRole
role fields
hardcoded dashboard tabs
```

A production-safe capability gate needs to be applied to both:

```text
UI visibility
server transaction authorization
```

Doing only UI hiding would not satisfy Step 3A security requirements.

## 11. SECURITY BLOCKER

The following are not yet server-authoritative enough for the requested Step 3A:

1. POS sale creation.
2. Product stock decrement.
3. Manual Product stock adjustment.
4. Shop ledger writes.
5. POS ownership/capability enforcement.
6. Variant-specific stock authority.
7. Hybrid POS + online order coordination.

The current Product rules validate some Product fields and ownership, but they do not provide an atomic server-side sale/inventory transaction.

## 12. FILE-BY-FILE CHANGE DECISION

No files were modified for Step 3A because the blocker is architectural and transactional, not a safe one-file repair.

### Files audited

```text
js/app/08-app-state.js
js/app/14-map-onboarding.js
js/app/15-pos-sales.js
js/app/16-pos-admin-jobs.js
js/app/17-hub.js
js/app/18-cockpit.js
js/app/22-printing.js
js/app/23-smart-cart.js
js/app/30-seller-products.js
js/app/39-product-core.js
js/app/39-product-showcase.js
js/app/39-showcase-logic.js
js/app/02-checkout.js
js/app/04-orders-escrow.js
js/app/03-dashboard.js
js/app/10-dashboard-tabs.js
functions/index.js
firestore.rules
```

### Files intentionally not modified

```text
All Product implementation files
All POS implementation files
functions/index.js
firestore.rules
firestore.indexes.json
Orders/payment/delivery files
```

## 13. REQUIRED SAFE NEXT REPAIR BEFORE FULL STEP 3A

A focused sub-step is required:

```text
STEP 3A-0 — POS/Stock Authority Repair
```

It should do only the following:

1. Define the authoritative sale record and immutable item snapshot.
2. Define the authoritative inventory operation and idempotency key.
3. Add one server-authoritative POS sale callable/transaction.
4. Migrate `processSmartOfflineSale` to request that callable.
5. Keep legacy `shop_ledger` as a compatibility projection during migration.
6. Add explicit owner/capability checks using Step 2 context.
7. Add transaction tests for insufficient stock, duplicate retry, credit sale validation, and concurrent sales.
8. Then migrate the remaining direct stock writers one at a time.

This must be reviewed before adding a new collection or tightening existing ledger rules.

## 14. TEST STATUS

### Performed in this audit

- Repository-wide stock writer search.
- POS/ledger source inspection.
- Product rule inspection.
- Existing product/POS/dashboard source inspection.
- Existing Step 2 source and test state review.

### Not run as a Step 3A implementation

- No nine-combination Product/POS test matrix, because the required authority is not yet safe.
- No Hybrid 100 → 90 → 70 mutation test, because no shared atomic authority exists.
- No production POS test, because no safe production transaction path should be exercised.
- No Firestore rule changes or emulator migration tests.

## 15. FINAL DECISION

**STEP 3A implementation is blocked and stopped before code changes.**

This follows the explicit instruction:

```text
STOP if existing Product/POS/inventory has multiple conflicting sources of truth.
```

The blocker is concrete:

```text
products.stock + multiple direct client writers
+ shop_ledger as multi-purpose client-writable ledger
+ no atomic POS sale authority
+ online order/inventory bridge not verified
```

No fake completion, no mock sales, no duplicate POS, no insecure workaround, and no destructive migration was performed.

**Step 3B has not started.**
