# SokoHai STEP 3A-2 — Product + Inventory Authority
## Report — 2026-09-26

## Executive result

STEP 3A-2 implementation is complete to the static/code-contract tested level. Runtime verification remains blocked by the STEP 3A-1R environment blocker: Firebase CLI/emulators are unavailable.

```text
STATIC PASS
RUNTIME BLOCKED
```

No duplicate Product engine, Inventory engine, stock resolver, or Business/Store resolver was created.

## 1. Product authority — IMPLEMENTED / RUNTIME BLOCKED

Product remains catalogue identity. Existing Product fields and metadata were preserved, including title, description, category, brand, images, attributes, variants metadata, pricing, publication, availability, legacy `userId`, and compatibility ownership fields.

Canonical scope remains:

```text
products/{productId}.businessId
products/{productId}.storeId
```

The Product document is not a sale or movement record.

Product creation now starts with `stock: 0` and a controlled initialization marker. The server then performs the opening-stock movement through the existing `inventoryAdjust` authority.

Runtime confirmation is BLOCKED because Auth/Firestore emulators could not be started.

## 2. Inventory authority — IMPLEMENTED / RUNTIME BLOCKED

Current stock remains:

```text
products/{productId}.stock
```

Movement history remains:

```text
inventory_movements/{movementId}
```

No second stock-balance collection was introduced.

The existing canonical writers remain:

- `posSale`
- `inventoryAdjust`

Both use `functions/business-store-authority.js` and perform stock plus movement writes inside Firestore transactions.

## 3. Business/Store scope — IMPLEMENTED / RUNTIME BLOCKED

New inventory operations resolve through:

```text
request.auth.uid
  → users/{uid}
  → canonical Business
  → canonical Store
  → Product scope
```

Canonical Product scope wins when present. Legacy Products use the existing STEP 3A-1 fallback through the authenticated user's canonical context. Browser-supplied `businessId`, `storeId`, and owner identity values remain request/validation inputs only.

No hard-coded single-business or single-store authority was introduced.

## 4. PRODUCT STOCK WRITER MAP

| Writer | Classification | Notes |
|---|---|---|
| `posSale` | SERVER-AUTHORITATIVE | Transactionally decrements Product stock, writes Sale and SALE movement, validates scope and negative stock, and uses idempotency. |
| `inventoryAdjust` | SERVER-AUTHORITATIVE | Transactionally handles adjustment, purchase, return, transfer, consumption, and opening balance. |
| Primary Product creation (`js/app/08-app-state.js`) | SERVER-AUTHORITATIVE initialization | Client creates stock zero/pending; server `OPENING_BALANCE` callable establishes initial stock. |
| Offline Product creation (`js/app/15-pos-sales.js`) | SERVER-AUTHORITATIVE initialization | Same controlled opening flow through `inventoryAdjust`. |
| Offline POS sync (`js/app/17-hub.js`, `js/app/18-cockpit.js`) | SERVER-AUTHORITATIVE | Queue submits `posSale`; it does not write Product stock directly. |
| Purchase receipt (`js/app/17-hub.js`) | SERVER-AUTHORITATIVE | Uses `inventoryAdjust`, `PURCHASE`, and deterministic PO idempotency key. |
| Customer return (`js/app/17-hub.js`) | SERVER-AUTHORITATIVE | Uses `inventoryAdjust`, `RETURN`. |
| Transfer out (`js/app/17-hub.js`) | SERVER-AUTHORITATIVE | Uses `inventoryAdjust`, `TRANSFER`; transfer document remains compatibility workflow. |
| Transfer receipt/onboarding (`js/app/14-map-onboarding.js`) | SERVER-AUTHORITATIVE | Uses `inventoryAdjust`, `TRANSFER`. |
| Consumption/spoilage (`js/app/18-cockpit.js`) | SERVER-AUTHORITATIVE | Uses `inventoryAdjust`, `CONSUMPTION`. |
| Printing paper consumption (`js/app/22-printing.js`) | SERVER-AUTHORITATIVE | Uses `inventoryAdjust`, `CONSUMPTION`. |
| Seller stock UI (`js/app/30-seller-products.js`) | SERVER-AUTHORITATIVE | UI calculates delta only; mutation goes through `inventoryAdjust`. |
| Product readers/availability calculations | READ-ONLY | Readers consume `products.stock`; they do not write operational stock. |
| Cached POS product quantities (`js/app/17-hub.js`) | TRANSITIONAL | Local display/cache adjustment only; it is not persisted as Product stock authority. |
| Legacy direct stock writes in old paths | LEGACY / BLOCKED BY RULES | No current direct operational Product stock writer was found in the audited active paths; Firestore rules reject client stock updates. |
| Purchase-order creation without receipt | TRANSITIONAL | Creates a purchase order only; stock changes only on receipt through `inventoryAdjust`. |

No unknown active operational Product stock writer was found in the audited JavaScript and Functions paths.

## 5. Opening-stock behavior — IMPLEMENTED / RUNTIME BLOCKED

Chosen compatible MVP behavior:

```text
Product create with stock = 0
  → openingStockPending = true
  → inventoryAdjust
  → type = OPENING_BALANCE
  → source = PRODUCT_CREATION
  → Product current stock updated
  → openingStockInitialized = true
```

The server rejects opening initialization unless the Product is pending, has zero current stock, and has not already been initialized. The operation is idempotent through `opening-{productId}`.

The opening movement contains:

```text
movementId
 type = OPENING_BALANCE
source = PRODUCT_CREATION
productId
businessId
storeId
quantity
previousStock
resultingStock
actorUid
createdAt
```

A Product may remain at zero/pending if the follow-up callable fails; the UI reports that initialization must be retried. This is a contained transitional failure state, not a client-authoritative stock fallback.

## 6. Movement contract — IMPLEMENTED / RUNTIME BLOCKED

`inventoryAdjust` supports the existing required operation types:

```text
SALE              source POS
PURCHASE
RETURN
ADJUSTMENT
TRANSFER
CONSUMPTION
OPENING_BALANCE   source PRODUCT_CREATION
```

Movement records retain existing additional fields and include scope, quantity, previous stock, resulting stock, actor, and timestamp.

## 7. Atomicity — IMPLEMENTED IN CODE / RUNTIME BLOCKED

`posSale` and `inventoryAdjust` use `db.runTransaction`. Within the transaction they:

1. read the existing idempotency record;
2. read Product stock;
3. resolve Business/Store/Product authority;
4. validate quantity and resulting stock;
5. write current Product stock;
6. create the immutable movement;
7. create the Sale where applicable;
8. write the existing ledger compatibility projection where applicable.

Firestore transaction failure prevents the corresponding stock/movement commit. Runtime confirmation was not possible.

## 8. Idempotency — IMPLEMENTED IN CODE / RUNTIME BLOCKED

- POS uses `sales/pos_{idempotencyKey}` and `inventory_movements/pos_{idempotencyKey}`.
- Adjustments use `inventory_movements/adjust_{idempotencyKey}`.
- Opening balance uses a deterministic `opening-{productId}` key.
- Purchase receipt uses a deterministic PO-based key.
- Offline POS sync submits queued sales to `posSale` rather than writing stock directly.

Runtime duplicate-submit verification is BLOCKED.

## 9. Concurrency — IMPLEMENTED IN CODE / RUNTIME BLOCKED

Stock reads and writes are inside Firestore transactions. With stock one, concurrent transactions cannot both successfully decrement one unit; one transaction must observe the resulting insufficient stock and reject.

This was statically verified from the transaction path, not runtime-tested because the emulator was unavailable.

## 10. Negative stock — IMPLEMENTED IN CODE / RUNTIME BLOCKED

Server checks reject:

- invalid or negative current stock;
- sale quantity greater than current stock;
- adjustment resulting in stock below zero;
- consumption/spoilage resulting in stock below zero.

No frontend validation is treated as authority.

## 11. Product compatibility — IMPLEMENTED / TRANSITIONAL

Preserved:

- legacy `userId` and ownership compatibility fields;
- `businessId` and `storeId`;
- existing Product readers using `products.stock`;
- existing availability conventions;
- `product.variants` metadata without adding variant stock authority;
- existing `shop_ledger` compatibility projection for POS sales.

Legacy Products without Business/Store fields remain transitional and use the existing STEP 3A-1 fallback behavior.

## 12. Availability status — IMPLEMENTED IN SERVER WRITERS

Server mutation paths keep Product availability consistent using existing conventions:

```text
stock <= 0  → out_of_stock
stock <= 3  → low_stock
otherwise   → available
```

No second availability engine was introduced.

## 13. Variant limitation — NOT YET IMPLEMENTED

Variant-level inventory authority was intentionally not implemented.

```text
Variant inventory authority = NOT YET IMPLEMENTED
```

Existing `product.variants` metadata and UI were preserved.

## 14. POS — IMPLEMENTED IN CODE / RUNTIME BLOCKED

The existing POS flow remains:

```text
POS UI
 → posSale
 → Business/Store resolver
 → Product authority
 → Firestore transaction
 → sales
 → inventory_movements
 → products.stock
```

No POS UI, receipt, or Sales History redesign was started.

## 15. Offline POS — TRANSITIONAL / SERVER-AUTHORITATIVE

The existing local queue remains. On reconnect it calls `posSale` with deterministic idempotency keys. The queue does not directly overwrite Product stock.

The queue still contains legacy compatibility data such as owner context and local totals; the server remains authoritative for Product scope, catalogue price, stock, Sale, and movement.

Runtime offline-sync verification is BLOCKED.

## 16. Online-order boundary — NOT YET IMPLEMENTED

```text
ONLINE ORDER INVENTORY: NOT YET CONNECTED
```

No PesaPal, SokoPay, order lifecycle, delivery, escrow, or payment code was changed.

## 17. Shop ledger boundary — TRANSITIONAL

```text
shop_ledger = transitional compatibility projection
sales = canonical POS sale record
inventory_movements = canonical stock movement audit
```

No ledger migration or accounting engine was introduced.

## 18. Security rules — IMPLEMENTED IN CODE / RUNTIME BLOCKED

Product create now starts with zero stock and requires the controlled opening-pending marker. Normal Product updates cannot change:

```text
businessId
storeId
userId
shopOwnerUid
shopOwnerId
sellerId
stock
openingStockPending
openingStockInitialized
```

Sales and inventory movement client writes remain denied. Rules were not loosened.

## 19. Tests

Added:

```text
tools/test_step3a2_product_inventory_authority.mjs
```

Static checks cover:

- canonical Product Business/Store fields;
- legacy compatibility fields;
- controlled opening stock;
- resolver wiring;
- server-only stock writers;
- transaction usage;
- movement scope fields;
- idempotency;
- negative stock rejection;
- Product rule immutability;
- no direct active operational Product stock updates.

Passed:

```text
node tools/test_step3a2_product_inventory_authority.mjs
node tools/test_step3a1_business_store_authority.mjs
node tools/test_step3a0_authority.mjs
node tools/test_business_store_context.mjs
node tools/test_product_foundation_contract.mjs
node --check functions/inventory-authority.js
node --check functions/business-store-authority.js
node --check js/app/08-app-state.js
node --check js/app/15-pos-sales.js
node --check js/app/17-hub.js
node --check js/app/18-cockpit.js
node --check js/app/22-printing.js
node --check js/app/30-seller-products.js
```

## 20. Runtime status

```text
STATIC PASS
RUNTIME BLOCKED
```

The STEP 3A-1R blocker remains unchanged:

```text
firebase: command not found
npx --no-install firebase-tools: package unavailable locally
```

No Auth/Firestore emulator runtime test was claimed. No production dependency was installed merely to bypass the blocker.

## 21. Files changed for STEP 3A-2

- `functions/inventory-authority.js`
  - added controlled `OPENING_BALANCE` handling;
  - preserved existing `posSale` and `inventoryAdjust` authority;
  - kept transaction/idempotency/scope behavior.
- `firestore.rules`
  - Product creation requires zero stock plus opening-pending initialization;
  - opening lifecycle fields and stock remain immutable to ordinary clients.
- `js/app/08-app-state.js`
  - primary Product creation now starts stock at zero and invokes server opening initialization.
- `js/app/15-pos-sales.js`
  - offline Product creation now starts stock at zero and invokes server opening initialization.
- `tools/test_step3a2_product_inventory_authority.mjs`
  - focused STEP 3A-2 static contract test.
- `tools/test_step3a1_business_store_authority.mjs`
  - expectation updated for the already-protected `shopOwnerId` field.
- `tools/test_step3a0_authority.mjs`
  - existing expanded immutable Product-field expectation retained.

Existing `functions/business-store-authority.js` was reused and not rewritten.

## 22. Remaining transitional items

| Item | Classification |
|---|---|
| Runtime Auth/Firestore verification | BLOCKED |
| Legacy Products without canonical scope | TRANSITIONAL |
| Offline queue legacy payload compatibility | TRANSITIONAL |
| `shop_ledger` projection | LEGACY / TRANSITIONAL |
| Online-order inventory bridge | NOT YET IMPLEMENTED |
| Variant inventory | NOT YET IMPLEMENTED |
| Transfer workflow’s broader multi-store management | NOT YET IMPLEMENTED |
| Multi-Business/Multi-Store management UI | NOT YET IMPLEMENTED |
| Staff/membership/advanced roles | NOT YET IMPLEMENTED |

## Scope hard stop

No Multi-Business UI, Multi-Store UI, staff migration, membership system, advanced roles, enterprise management, Services, Usafir, Discover rewrite, Chat rewrite, online-order inventory bridge, variant inventory, receipt redesign, Sales History redesign, SokoPay, PesaPal, delivery, or unrelated refactor was started.

STEP 3A-2 COMPLETE — PRODUCT + INVENTORY AUTHORITY VERIFIED TO TESTED LEVEL
