# SokoHai Phase C — Firestore Security Hardening Report

Date: 2026-09-26
Recovery checkpoint: `0e8bb6c`
Production deployment: **NONE**

## A. Files changed

Application/security changes:

- `firestore.rules`
- `js/app/01-market.js`
- `js/app/04-orders-escrow.js`
- `js/app/09-feed-announcements.js`
- `js/app/14-map-onboarding.js`
- `js/app/21-sokopay.js`
- `js/17-pesapal-return.js`
- `js/app/53-test-sandbox.js`
- `js/app/55-escrow-guard.js`
- `tools/test_phase3_security.mjs`
- `package.json`

Existing Phase A working-tree changes remain present but were not redesigned in Phase C:

- `LOCAL-SERVER-MWONGOZO.md`
- `functions/local-server.js`
- `js/app/54-error-core.js`
- `assets/js/app/54-error-core.js`
- `js/app/62-missing-features.js`
- `assets/js/app/62-missing-features.js`

Reports:

- `SOKOHAI-PHASE-C-PRODUCER-AUDIT.md`
- `SOKOHAI-PHASE-C-REPORT.md`

The canonical business code remains `js/` and `functions/`. No independent implementation was added under `assets/`, `_old_fonts_project/`, `_originals/`, or `fonts/`.

## B. `adminRevenue`

### Client producers removed

Direct browser writes were removed from:

- `js/app/01-market.js`
- `js/app/04-orders-escrow.js`
- `js/app/09-feed-announcements.js`
- `js/app/14-map-onboarding.js`
- `js/app/21-sokopay.js`
- `js/17-pesapal-return.js`
- `js/app/53-test-sandbox.js`

The surrounding flows remain intact. Free/waived events no longer create zero-value accounting records from the browser. PesaPal-return business records still update their relevant business documents, but the accounting record is deliberately absent because the current trusted server operation does not yet accept and validate each of those legacy purposes.

The test sandbox now explicitly tells the operator that commission accounting requires a server event; it no longer claims that a client accounting write succeeded.

### Trusted producers preserved

Existing Admin SDK writes in `functions/index.js` remain intact:

- `releaseOrderEscrow` order settlement
- existing SokoPay link settlement path
- platform stats recomputation reads

No generic duplicate `adminRevenueCreate`/`adminRevenueWrite` Function was created.

### Rule result

Before:

```text
allow read, write: if signedIn();
```

After:

```text
allow read: if isAdmin();
allow write: if false;
```

Admin SDK writes continue to bypass client Firestore rules. Emulator tests confirmed:

- buyer create: denied
- buyer update: denied
- buyer delete: denied
- buyer read: denied
- admin claim read: allowed
- Admin SDK trusted write: allowed

## C. `purchase_orders`

### Actual purpose

`purchase_orders` is internal shop procurement from a shop to a supplier. It is not the marketplace buyer order collection.

### Authorization model

- Shop owner may access records where `shopOwnerId == request.auth.uid`.
- An approved agent may act only where the PO `shopOwnerId` matches the agent user's existing `shopOwnerUid` relationship.
- Admin may access through the existing `isAdmin()` model.
- `shopOwnerId` is immutable.
- Create requires pending status and basic positive procurement fields.
- Update is limited to `pending -> completed` and only the `status` field.
- Delete is denied.

### Fields protected

The rule does not authorize client changes to:

- `shopOwnerId`
- supplier/product relationships
- quantity
- unit cost
- total cost
- arbitrary status transitions

The current UI still supplies procurement prices and stock effects from the client. Those values are now scoped to the shop owner but are not yet server-recalculated. This remains a follow-up integrity gap, documented below.

### Tests

- owner create: PASS
- owner read: PASS
- owner pending→completed: PASS
- unrelated read: DENY
- unrelated create: DENY
- owner change: DENY
- delete: DENY

## D. `shipments`

### Creation rule

Top-level shipment creation is allowed only when:

1. `sokopayCoreId` exists;
2. the referenced `sokopay_core_transactions` document matches `orderId`, `buyerId`, and `sellerId`;
3. the caller is the related buyer/seller or admin;
4. the initial status is one of the existing creation states (`pending`, `Pending`, `Courier Assigned`, or `created`).

This preserves the existing smart-cart creation shape without creating a generic shipment system.

### Read/update protection

Reads are limited to the shipment buyer, seller, courier, driver, assigned agent, or admin.

Updates must preserve:

- `buyerId`
- `sellerId`
- `orderId`
- `sokopayCoreId`

Client updates cannot change:

- `status`
- `escrowStatus`
- `paymentStatus`
- `chainOfCustody`
- pickup/handover/transfer tokens
- master/stage delivery tokens
- delivery/token visibility fields

Delete remains denied.

### Compatibility impact

Legitimate smart-cart creation with a related core transaction remains allowed. Non-sensitive related-party metadata updates remain allowed. Client-side lifecycle/custody/payment/token transitions are now rejected by design; those transitions must use the existing trusted ride/custody/delivery Functions. This exposes legacy client-side shipment lifecycle paths that still require migration to the existing server-authoritative delivery architecture; no replacement shipment engine was added.

### Tests

- related buyer creation: PASS
- related seller read: PASS
- related seller non-sensitive update: PASS
- unrelated read: DENY
- unrelated creation: DENY
- buyer/seller/order/core tampering: DENY
- escrow/payment tampering: DENY
- custody/token tampering: DENY
- forged completion: DENY
- delete: DENY

## E. `activity_logs`

### Producer treatment

- Ordinary shop activity and assisted-session writes remain available only when the authenticated user is the corresponding `userId`, `actorId`, `agentId`, `memberUid`, or `shopOwnerId`.
- Cross-user forged actor/member/shop records are rejected.
- Lifecycle UI can still create actor-scoped records, but those records are not treated as settlement truth.
- The browser-side `ESCROW_RELEASED` audit append in `js/app/55-escrow-guard.js` was removed. Trusted settlement Functions remain the source of truth for escrow and accounting.

### Rule scope

Before:

```text
allow read, write: if signedIn();
```

After:

- read: only scoped actor/member/shop owner or admin
- create: only scoped actor/member/shop owner with timestamp
- update/delete: denied

### Tests

- legitimate shop activity: PASS
- legitimate assisted-session activity: PASS
- unrelated write: DENY
- forged actor: DENY
- unrelated read: DENY
- delete: DENY

## F. Tests

All tests were run against Firebase Auth and Firestore emulators at:

- Auth: `127.0.0.1:9099`
- Firestore: `127.0.0.1:8085`
- Project: `demo-sokohai`

### Phase 3

`node tools/test_phase3_security.mjs`

```text
PHASE 3 SECURITY: 34 passed, 0 failed
```

### Phase 1

`node tools/test_phase1_security.mjs`

```text
PHASE 1 SECURITY: 57 passed, 0 failed
```

### Phase 2

`node tools/test_phase2_security.mjs`

```text
PHASE 2 SECURITY: 28 passed, 0 failed
```

The Phase 1 and Phase 2 suites were run in fresh emulator sessions because their Auth fixtures intentionally reuse fixed test identities.

### Existing regressions

- `npm test`: PASS; all included suites completed with zero failed assertions.
- `node tools/test_local_functions_server.mjs`: PASS, 12/12.
- `node tools/test_functions_resilience.mjs`: PASS, 26/26.
- `node tools/test_routing.mjs`: PASS, 69/69.
- `npm run check:html`: PASS.
- Changed JS syntax checks: PASS.
- `functions/local-server.js` syntax check: PASS.
- `functions/index.js` syntax check: PASS.
- `tools/test_phase3_security.mjs` syntax check: PASS.
- `git diff --check`: PASS after cleanup.

## G. Remaining gaps

### P0

- None newly introduced by the tested rule changes.
- The server-side accounting coverage for legacy non-order PesaPal purposes remains incomplete: the safe behavior is currently to omit the client accounting record rather than accept a forged one.

### P1

- Procurement `unitCost`, `totalCost`, supplier/product relationship, and stock effects remain client-supplied within the shop-owner boundary. A trusted procurement operation is needed before treating those fields as financially authoritative.
- Legacy top-level shipment lifecycle writers still attempt some client-side state/token updates that are now correctly rejected. They must be connected to the existing ride/custody/delivery Functions, not replaced with a new delivery system.
- Some other unrelated collections remain broad in the existing rules and were intentionally not expanded into this focused Phase C change.

### P2

- Browser-level procurement, smart-cart, courier, and activity UI journeys should be rerun with real browser automation after the rejected legacy shipment transitions are migrated.
- Admin accounting dashboards should be verified using an authenticated admin browser session.

## H. Deployment

**No production deployment performed.**

**LOCAL SECURITY TEST PASS ≠ PRODUCTION READY.**

Production still requires a separate review of all remaining broad collections, real browser E2E, PesaPal sandbox/production callback verification, monitoring, backups, rate/abuse controls, and deployment validation.
