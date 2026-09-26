# SokoHai Phase C — Producer / Consumer Audit Before Rule Changes

Date: 2026-09-26
Recovery checkpoint: `0e8bb6c`

This report is the required audit before changing `firestore.rules`. Canonical active code is `js/` and `functions/`; `assets/js/`, `_old_fonts_project/`, `_originals/`, and `fonts/` are copies/backups or generated/deployment variants and were not treated as separate business systems.

## 1. `adminRevenue`

| Producer | Operation | Role/runtime | Current authorization | Intended authorization | Server function required? |
|---|---|---|---|---|---|
| `js/app/01-market.js` | create zero-value `boost` record in FREE mode | signed-in browser | any signed-in user by rules | no accounting write for a free/waived event; server-controlled event if retained | No client write should remain |
| `js/app/04-orders-escrow.js` | create `commission` after legacy client escrow path | buyer browser | any signed-in user by rules | server escrow settlement only | Yes; existing `escrowRelease` / release path |
| `js/app/09-feed-announcements.js` | create zero-value `subscription` record in FREE mode | signed-in browser | any signed-in user by rules | no arbitrary accounting write; server operation if a billable subscription exists | No client write should remain |
| `js/app/14-map-onboarding.js` | create `sokopay_commission` in legacy browser auto-release path | signed-in browser | any signed-in user by rules | server auto-release only | Yes; existing `sokopayAutoRelease` / release path |
| `js/app/21-sokopay.js` | create `commission` in legacy/direct payment path | signed-in browser | any signed-in user by rules | server settlement only | Existing SokoPay server functions should own it |
| `js/17-pesapal-return.js` | create `offline_registration`, `serious_deposit`, `boost`, `agent_registration`, `subscription` after return | buyer/agent browser | any signed-in user by rules | server-verified PesaPal business operation must create its own accounting record | Existing server payment/status flow is the required integration point; current client writes are not trusted |
| `js/app/53-test-sandbox.js` | create test commission record | browser test sandbox | any signed-in user by rules | test-only data must not use production accounting collection | Remove/disable direct write |
| `functions/index.js` `releaseOrderEscrow` | create `commission` atomically with settlement | Admin SDK / trusted Function | bypasses Firestore rules | correct server-authoritative producer | Yes, existing function |
| `functions/index.js` link release path | create `sokopay_commission` atomically with link settlement | Admin SDK / trusted Function | bypasses Firestore rules | correct server-authoritative producer | Yes, existing function |
| `functions/index.js` `recomputePlatformStats` | read collection | Admin SDK | trusted backend | trusted backend | Existing function |

Readers: `js/app/16-pos-admin-jobs.js` reads `adminRevenue` for admin/POS statistics, while `functions/index.js` reads it for `platformStatsRefresh`. The current Firestore rule allows every signed-in user to read it; intended read is admin/backend only.

Conclusion: direct browser accounting writes are not legitimate trusted producers. Existing escrow/link server settlement already proves the correct pattern and must remain the only direct producer until each PesaPal business purpose is attached to a validated server operation. The safe minimal Phase C action is to remove client writes and make the collection server-write-only; this may expose missing legacy accounting for non-order payment purposes as an explicit remaining gap rather than accepting forged records.

## 2. `purchase_orders`

Purpose from `js/app/18-cockpit.js`: internal procurement orders from a shop to a supplier, not buyer marketplace orders.

Producer: `createPurchaseOrder()` creates a document with `shopOwnerId`, `supplierId`, `productId`, `quantity`, `unitCost`, `totalCost`, `status: pending`, and timestamps. The current `ownerUid` is the signed-in user or `currentUserData.shopOwnerUid` for an assisted/managed shop.

Updater: `receivePurchaseOrder()` updates the related product stock and changes the PO status to `completed`; it also writes a shop ledger expense. Reader: `js/app/03-dashboard.js` queries by `shopOwnerId`. No Cloud Function producer was found.

Intended authorization: shop owner or an approved agent acting for that exact shop may read/create/update its own procurement documents. `shopOwnerId` must be immutable. Supplier/product relationship validation is currently client-side only and should not be treated as a security boundary. Arbitrary signed-in users must not create a PO for another shop. Delete is not used by the active producer and should remain denied.

## 3. `shipments`

There are two distinct structures:

1. Top-level `shipments/{id}` used by `js/app/23-smart-cart.js`, `js/app/24-ui-final.js`, and `js/app/62-missing-features.js`. Smart cart creates a shipment alongside a `sokopay_core_transactions` record and an order; fields include `orderId`, `buyerId`, `sellerId`, `courierId`, `sokopayCoreId`, tracking/stage fields, escrow status, custody data, and status.
2. `chatGroups/{gid}/groupOrders/{goid}/shipments/{shipmentId}` used by the group-order module. This is a separate subcollection and is not matched by the top-level rule.

Readers: buyer/seller/courier logistics UI and transport inboxes query top-level shipments. Producers are currently browser-side smart-cart/multi-leg code. Updates are browser-side in legacy logistics UI. The existing trusted delivery Functions primarily operate on `ride_requests`, delivery offers, tokens, and custody records; they are not a drop-in producer for every top-level shipment write.

Intended authorization: a shipment must be related to an existing authorized order/core transaction; buyer/seller/courier/assigned agent may read according to that relationship. Client creation should be limited to the buyer/seller relationship and immutable references; sensitive lifecycle, custody, payment, escrow, and token transitions must be server-only. Delete must remain denied.

This is a direct dependency area: tightening the rule without first constraining the legacy client writer will break part of smart cart. The Phase C change therefore needs a narrowly scoped relationship rule plus protected fields, followed by a targeted journey test. A complete migration to delivery Functions is a separate follow-up, not a new generic shipment system.

## 4. `activity_logs`

Producers:

- `js/app/17-hub.js` `addActivityLog()` writes shop activity with `shopOwnerId`, `userId`, role, action, details, timestamp.
- `js/app/31-agent-assist.js` writes assisted-session start with `agentId`, `memberUid`, and session ID.
- `js/app/50-lifecycle-core.js` writes lifecycle audit records with `collectionName`, `recordId`, `actorId`, and action.
- `js/app/55-escrow-guard.js` writes `ESCROW_RELEASED` from the browser after calling the escrow function.
- `js/app/60-identity-layer.js` writes assisted-session activity with agent/member IDs.

Readers: `js/app/51-lifecycle-ui.js` reads history by collection/record; lifecycle/admin surfaces read activity. The current rule allows every signed-in user to read and write every record.

Intended authorization: user-scoped shop/assisted-session activity may be created only when the actor/owner/member relationship matches the authenticated user; users should not read unrelated logs. Security-sensitive escrow/lifecycle audit records should be generated by trusted server operations. The browser-side escrow log is not authoritative and must not be relied on for settlement history.

## Rule-change plan

1. `adminRevenue`: server-only writes; admin-only reads. Remove direct active client writes and preserve existing Admin SDK writes from trusted settlement functions.
2. `purchase_orders`: owner/approved-agent scoped reads and writes; immutable shop owner; only pending→completed receive transition; no delete.
3. `shipments`: relationship-scoped reads/creates; immutable actor/order links; protect payment/escrow/custody/token fields; no delete. Keep group-order subcollection untouched in this focused change.
4. `activity_logs`: owner/actor/member scoped access; reject arbitrary cross-user records; remove the client-side authoritative escrow audit write or make it non-authoritative, with server settlement remaining the source of truth.

Before applying the rule patch, the exact field-level expressions must be tested against the emulator for legitimate and unauthorized flows. No production deployment is planned.
