# SokoHai — Product Management System + Dashboard
## Full current-system inspection report
### Date: 2026-09-26

## 1. Executive summary

The current SokoHai Product Management System already exists and is already connected to the Seller Dashboard.

The current Dashboard entry is:

```text
Seller Dashboard
  → MY BUSINESS
  → My Products
```

The main implementation is:

```text
js/app/30-seller-products.js
```

Dashboard integration is handled through:

```text
js/app/03-dashboard.js
js/app/10-dashboard-tabs.js
```

The system is not a separate duplicate Product engine. It reuses the existing `products` collection and existing Product/POS/Inventory functionality.

## 2. Current classification

| Area | Classification | Current state |
|---|---|---|
| Product catalogue identity | IMPLEMENTED | Existing `products` collection remains the catalogue source. |
| Seller Product Management screen | IMPLEMENTED | Available through Dashboard → My Products. |
| Product search | IMPLEMENTED | Searches Product title and category. |
| Category filtering | IMPLEMENTED | Uses categories present in the seller's loaded Product records. |
| Stock filtering | IMPLEMENTED | Supports in-stock and out-of-stock views. |
| Publication filtering | IMPLEMENTED | Supports publication/status filtering. |
| Product sorting | IMPLEMENTED | Newest, best selling, lowest selling, and highest revenue. |
| Product editing | IMPLEMENTED / RULE-PROTECTED | Uses existing `openEditModal`; protected fields cannot normally be moved or rewritten. |
| Product stock adjustment | IMPLEMENTED / SERVER-AUTHORITATIVE | Uses `inventoryAdjust`, not direct browser stock mutation. |
| Publish/unpublish | IMPLEMENTED | Existing Product publication flow remains in use. |
| Archive | IMPLEMENTED | Existing archive flow remains in use. |
| Product performance | IMPLEMENTED | Uses real Product/order data loaded by seller scope. |
| Sales performance | IMPLEMENTED | Aggregates real order/Product data; no invented sample metrics. |
| Demand insights | IMPLEMENTED | Provides rule-based insight labels from current Product metrics. |
| Product comparison | IMPLEMENTED | Existing seller comparison view is registered in Dashboard navigation. |
| Multi-Business management UI | NOT YET IMPLEMENTED | Not part of the current MVP Dashboard. |
| Multi-Store management UI | NOT YET IMPLEMENTED | Not part of the current MVP Dashboard. |
| Variant inventory | NOT YET IMPLEMENTED | Variant metadata remains, but variant-level stock is not implemented. |
| Online-order inventory bridge | NOT YET IMPLEMENTED | Product/Inventory authority is not yet connected to the full online-order lifecycle. |
| Runtime emulator verification | BLOCKED | Firebase CLI/Auth/Firestore emulator was unavailable. |

## 3. Dashboard location

The Dashboard is rendered by:

```text
js/app/03-dashboard.js
```

The Product Management navigation entry is rendered in the Dashboard sidebar as:

```text
MY BUSINESS
  My Products
```

The relevant Dashboard button uses:

```javascript
window.switchDashTab('my_products')
```

The tab router is in:

```text
js/app/10-dashboard-tabs.js
```

It first checks the seller-management renderer:

```javascript
if (typeof window.skhRenderSellerTab === 'function' && window.skhRenderSellerTab(tabName)) {
    return;
}
```

The Product Management renderer is registered by:

```text
js/app/30-seller-products.js
```

The current page function is:

```javascript
window.skhRenderMyProducts
```

Therefore, the current Product Management System is already brought into the Dashboard rather than existing only as an isolated page.

## 4. Current Product Management flow

```text
Seller opens Dashboard
        ↓
Selects My Products
        ↓
10-dashboard-tabs.js receives my_products
        ↓
skhRenderSellerTab('my_products')
        ↓
skhRenderMyProducts()
        ↓
loadSellerMetrics()
        ↓
products + orders are loaded from Firestore
        ↓
Product Management UI is rendered in #dashWorkspace
```

The Dashboard workspace target is:

```html
<div id="dashWorkspace"></div>
```

The Product Management view replaces the content of that workspace without creating a second dashboard shell.

## 5. Data sources

### Products

The current seller Product Management code reads from:

```text
products
```

Current seller query:

```javascript
where('userId', '==', shopOwnerId)
```

The seller identity is resolved through the existing compatibility behavior:

```javascript
(skh.currentUserData && skh.currentUserData.shopOwnerUid)
|| skh.currentUser.uid
```

This means the current UI remains compatible with legacy Product ownership data.

### Orders

Seller performance data reads from:

```text
orders
```

Current seller query:

```javascript
where('sellerId', '==', shopOwnerId)
```

### Product metrics

The Product Management system derives metrics from existing Product and Order fields, including:

```text
views
likeCount / likes
savedCount
orders
items
qty / quantity
price
status
createdAt
updatedAt
saleMode
modeData
stock
```

No second Product collection was introduced.

## 6. Product list functionality

The current My Products view provides:

### Search

Searches Product:

- title;
- category.

### Category filter

The category list is generated from categories found in the seller's current Product records.

### Stock filter

Current options include:

```text
All stock
In stock
Out of stock
```

Current stock is read from:

```text
product.stock
```

### Publication filter

The Product status is normalized using the existing publication-status helper where available. The system preserves compatibility between older status values and newer publication values.

### Sorting

Current sorting options include:

```text
Newest
Best selling
Lowest selling
Highest revenue
```

### Product actions

Each Product row can expose actions for:

```text
View
Edit
Stock
Publish / Unpublish
Archive
Performance
```

## 7. Product performance functionality

The current Product Management system calculates per-Product metrics:

```text
views
likes
saves
orders
units sold
revenue
conversion
current stock
publication status
sale mode
```

The conversion calculation is based on real loaded data:

```text
units sold ÷ views × 100
```

If there is no view data, the system does not invent a conversion value.

The Product Performance page is opened from the Product row's Performance action and returns to My Products using the existing Dashboard renderer.

## 8. Sales performance functionality

The current Sales Performance view provides real-data lists such as:

- Best Selling Products;
- Slow Moving Products;
- Most Viewed Products;
- Most Liked Products;
- Most Saved Products.

The source remains the current Product and Order data. The system does not create fake sales numbers or placeholder business results.

## 9. Demand insights functionality

The current Demand Insights view classifies Products using existing metrics such as:

```text
age of Product
views
units sold
saves
```

The current logic includes categories such as:

```text
new
high demand
slow moving
moderate
```

The UI gives recommendations such as:

- wait for more data;
- consider increasing stock;
- improve price or promotion;
- improve photos or listing quality.

These are advisory UI outputs. They are not a new pricing engine, inventory engine, or order engine.

## 10. Product comparison functionality

The current Product Management module registers Product comparison in the Dashboard seller-management tab map.

The comparison feature remains within the same Product Management module and uses the seller's loaded Product data.

It does not create a second Product data model.

## 11. Product editing

The Edit action uses the existing shared editing flow:

```javascript
window.openEditModal(productId, 'products')
```

The underlying editor is in:

```text
js/app/12-sys-modes.js
```

Normal Product editing remains compatible with existing catalogue fields such as:

- title;
- price;
- description;
- category;
- publication mode;
- sale mode;
- wholesale metadata;
- auction/group-buy metadata;
- product presentation fields.

The following authority fields are protected by current Firestore rules:

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

## 12. Stock management inside Product Management

The Product Management Stock action is implemented in:

```text
js/app/30-seller-products.js
```

The UI calculates a delta from the displayed current stock and sends the operational mutation through:

```javascript
skh.wrapCallable('inventoryAdjust')
```

The browser does not directly write:

```text
products/{productId}.stock
```

The server authority performs:

```text
scope resolution
→ current-stock read
→ quantity validation
→ negative-stock check
→ Product stock update
→ inventory movement creation
```

inside the existing transaction-based authority.

## 13. Product creation and opening stock

The current Product creation flow is preserved, but opening stock is now controlled by the server authority.

### Primary Product creation

File:

```text
js/app/08-app-state.js
```

Current behavior:

```text
Product created with stock = 0
openingStockPending = true
openingStockInitialized = false
        ↓
inventoryAdjust
        ↓
OPENING_BALANCE / PRODUCT_CREATION
```

### Offline Product creation

File:

```text
js/app/15-pos-sales.js
```

It follows the same controlled initialization pattern.

### Opening movement

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

## 14. POS relationship

The Product Management system does not create a second POS flow.

Current relationship:

```text
Product Management / POS UI
        ↓
posSale or inventoryAdjust
        ↓
Business/Store resolver
        ↓
Product authority
        ↓
Firestore transaction
        ↓
products.stock
inventory_movements
sales
```

The canonical operational callables remain:

```text
posSale
inventoryAdjust
```

## 15. Offline POS relationship

The existing offline POS queue is preserved.

When the network returns:

```text
offline queue
  ↓
posSale
  ↓
server-side stock mutation
```

Offline synchronization does not directly overwrite Product stock.

The queue retains legacy compatibility fields, but the server resolves the authoritative Product, Business, Store, and stock context.

## 16. Business and Store scope

The Product Management UI still has transitional legacy reads using `userId`.

The server authority uses the canonical resolver:

```text
functions/business-store-authority.js
```

Canonical operation path:

```text
request.auth.uid
  → users/{uid}
  → businesses/{businessId}
  → stores/{storeId}
  → products/{productId}
  → inventory
```

Product scope fields are preserved:

```text
businessId
storeId
```

Browser-supplied Business/Store values are not treated as ownership authority.

## 17. Security boundary

### Client-readable Product stock

Product readers can continue using:

```text
products.stock
```

for:

- marketplace availability;
- POS search;
- seller Product display;
- low-stock indicators;
- cart display.

### Client-write boundary

Normal Product updates cannot modify:

```text
stock
businessId
storeId
userId
shopOwnerUid
shopOwnerId
sellerId
```

Sales and inventory movements are server-written.

### Server authority

Operational stock changes must pass through:

```text
posSale
inventoryAdjust
```

## 18. Availability behavior

The server keeps availability aligned with stock using the current convention:

```text
stock <= 0  → out_of_stock
stock <= 3  → low_stock
otherwise   → available
```

The Dashboard reads and displays Product stock and status; it does not become an alternate stock authority.

## 19. Legacy compatibility

The current system intentionally preserves:

- `userId` Product ownership queries;
- `shopOwnerUid` seller context;
- `shopOwnerId` ledger/compatibility context;
- `sellerId` order and sale context;
- legacy Product status values;
- existing Product fields and UI paths;
- existing `shop_ledger` projection.

These are classified as compatibility or transitional fields where they are not yet canonical.

## 20. Current limitations

### Runtime verification

```text
BLOCKED
```

Firebase Auth/Firestore emulator testing was not possible because Firebase CLI was unavailable in the environment.

### Legacy seller-scoped reads

```text
TRANSITIONAL
```

The seller Product list still queries by legacy `userId`. This was preserved to avoid a broad frontend migration. Server mutation authority uses canonical Business/Store resolution.

### Multi-Business management UI

```text
NOT YET IMPLEMENTED
```

The data model retains separate Business entities, but the current dashboard does not provide a full multi-business management interface.

### Multi-Store management UI

```text
NOT YET IMPLEMENTED
```

The data model retains separate Store entities, but the current dashboard does not provide a full multi-store management interface.

### Variant inventory

```text
NOT YET IMPLEMENTED
```

`product.variants` metadata remains supported, but no variant-level stock ledger exists.

### Online-order inventory bridge

```text
NOT YET IMPLEMENTED
```

The Product/Inventory authority is prepared for later integration, but online order, payment, escrow, delivery, and inventory reservation flows were not changed.

## 21. Files inspected

- `js/app/30-seller-products.js` — current Product Management module.
- `js/app/10-dashboard-tabs.js` — Dashboard tab router and seller-management routing.
- `js/app/03-dashboard.js` — Dashboard shell/sidebar/workspace.
- `js/app/12-sys-modes.js` — shared Product editing path.
- `js/app/08-app-state.js` — primary Product creation.
- `js/app/15-pos-sales.js` — offline Product creation, POS, and stock UI.
- `js/app/17-hub.js` — POS, offline queue, transfer and return paths.
- `js/app/18-cockpit.js` — operational inventory/consumption paths.
- `js/app/30-seller-products.js` — seller Product list and stock adjustment.
- `functions/business-store-authority.js` — canonical Business/Store/Product resolver.
- `functions/inventory-authority.js` — POS and inventory authority.
- `firestore.rules` — Product scope, ownership, and stock protection.
- `html/21-scripts.html` — script loading that includes Dashboard/Product modules.
- `html/09-admin-sell.html` — Product creation and POS markup.

## 22. Files changed for this inspection

```text
No production code was changed for this inspection/report.
```

The report is the only new deliverable from this request:

```text
SOKOHAI-PRODUCT-MANAGEMENT-DASHBOARD-REPORT-20260926.md
```

## 23. How the seller reaches the current system

```text
1. Login
2. Switch to Seller / Usimamizi mode
3. Open Dashboard
4. Select MY BUSINESS
5. Select My Products
```

If `My Products` does not appear, the likely conditions are:

- the user is not in seller/management mode;
- the Dashboard shell has not loaded;
- `js/app/30-seller-products.js` was not loaded;
- the user has no authenticated seller context;
- the browser is offline or Firestore reads failed.

## 24. Final assessment

The current Product Management System is already present in the Dashboard and is not missing as a separate module.

The current MVP architecture is:

```text
Dashboard
  → My Products
  → products collection
  → existing Product editor
  → inventoryAdjust for stock
  → posSale for POS sales
  → Business/Store authority resolver
```

The correct next UI improvement, if later authorized, would be a presentation/label refinement such as renaming **My Products** to **Product Management**, not creating another Product Management engine.

No STEP 3A-3 or unrelated feature work was started.
