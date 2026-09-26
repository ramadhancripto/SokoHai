# SokoHai Delivery Implementation Report

Date: 2026-09-26

## Implemented

1. Added the audited delivery mapping in `SOKOHAI-DELIVERY-AUDIT-MAP.md`.
2. Added server-normalized `cargoManifest` snapshots to the existing `ride_requests` and `delivery_offers` flow.
   - Linked to existing order and optional shipment IDs.
   - Preserves product/order authority.
   - Carries product/variant/order-item/quantity/package references without duplicating products or orders.
   - Persists `requestedByUid` and `requestedByRole`.
3. Extended existing `delivery_tokens` records with stage-aware audit metadata:
   - `tokenId`, `tokenType`, `stage`, `orderId`, `shipmentId`, `legId`
   - issuer/intended/from/to actor references
   - issued/presented/verified/consumed/expired/revoked timestamps
   - attempt count and existing participant protection
4. Made initial pickup-token creation during `deliveryOfferAccept` part of the existing Firestore transaction, reducing the acceptance/token split-brain window.
5. Added server-authoritative `deliveryReportTransportFault`:
   - pre-pickup assignment can be released for recovery;
   - active custody is preserved and marked `reassignment_required`;
   - browser no longer directly rewrites the ride for breakdown recovery.
6. Registered the recovery callable in the existing bootstrap path and connected `js/app/20-logistics.js` to it.
7. Preserved existing routing, custody, token, order, escrow, notification, and shipment systems. No parallel delivery engine was created.

## Not implemented in this pass

The audit identified further work that requires a dedicated follow-up rather than unsafe partial coding:

- Full transaction wrapper for every multi-document pickup/transfer/final-receipt operation.
- Separate buyer-controlled `DELIVERY_VERIFICATION` callable with a distinct final-recipient receipt transition.
- Full role-scoped read rules for `delivery_events` and `delivery_handovers` (current server-only writes are preserved; broad read behavior needs UI/query migration first).
- Complete carrier-B → buyer multi-leg payout policy.
- Full seller/buyer/carrier shipment detail component with a unified next-action view.
- Firestore emulator concurrency journey for three and four accounts.

These remain P1/P2 design items; no security rule was weakened to hide them.

## Validation

Passed:

- `npm test` — **146 passed, 0 failed**
- `node tools/test_functions_resilience.mjs` — **26 passed, 0 failed**
- `node tools/test_route_matcher.mjs` — **30 passed, 0 failed**
- `node tools/test_routing.mjs` — **69 passed, 0 failed**
- `npm run check:html` — **CHECK OK**
- JavaScript syntax checks for modified Functions and logistics code

Not run / blocked:

- Phase 1/2/3 emulator security suites require `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST`; Firebase Emulator CLI was not available in the workspace.
- `test_local_functions_server.mjs` reported its documented dependency skip because `functions/node_modules` was not installed.

## Production status

- No production deployment.
- No commit.
- No credentials or `.env` files included.
- The ZIP is a workspace delivery bundle, not a production-ready declaration.
