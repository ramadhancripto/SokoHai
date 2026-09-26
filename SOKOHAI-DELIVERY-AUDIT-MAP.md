# SokoHai Delivery System — Audit Mapping

Date: 2026-09-26
Status: audit complete; no delivery code changed during this audit.

## Executive finding

SokoHai already has one delivery/routing/custody architecture. It is not necessary or safe to create another delivery engine.

Existing server-authoritative path:

`orders` → `deliveryRouteBooking` → `ride_requests` → `delivery_offers` → `deliveryOfferAccept`/`deliveryAccept` → `deliveryGenerateToken` → `deliveryConfirmCustody` → `deliveryStartTransit` → `deliveryComplete` → existing escrow/order settlement.

Existing custody records:

- `ride_requests`: operational snapshot and current state/custodian fields
- `delivery_tokens`: private server-created token records
- `delivery_events`: append-only server audit events
- `delivery_handovers`: intermediate handover records
- `delivery_offers`: server-created routing offers
- `orders`: commercial/order authority
- `shipments`: separate hardened shipment documents, not the active ride custody authority in the inspected flow
- `notifications`: existing notification system

The implementation already enforces many requirements, but the audit found important completion gaps: cargo manifest normalization, buyer-controlled final delivery token flow, strict atomicity for all custody transitions, server-side transition centralization, role-scoped history reads, and client UI paths that still contain legacy direct-write/demo/fallback behavior.

## Mapping

| Existing component | Current responsibility | Current state | Gap | Required smallest change | Existing function/helper to reuse |
|---|---|---|---|---|---|
| `functions/routing.js` | Creates/reroutes delivery requests from orders; creates offer flow | Server-authoritative request/routing | Request data is not normalized into one explicit cargo manifest with order item/variant/package references; buyer/seller requester role is not consistently persisted as a first-class request contract | Add a server-normalized `deliveryRequest`/manifest snapshot to the existing `ride_requests` record, linked to `orderId`, `shipmentId`, `buyerId`, `sellerId`, `requestedByUid`, `requestedByRole`; never create a duplicate order/cargo object | `deliveryRouteBooking`, `routing-core.routeBookingFromOrder`, existing order lookup |
| `functions/routing-core.js` | Ranks eligible drivers/agents; offer lifecycle | Existing offer state machine: waiting/offered/accepted/declined/expired/cancelled | Offer acceptance needs stronger transaction/idempotency evidence and explicit active-assignment conflict handling across concurrent calls | Preserve the state machine; make acceptance transactionally claim the ride and close competing offers; add idempotent already-accepted response only for the same carrier | `transitionOffers`, `deliveryOfferAccept`, `deliveryAccept` |
| `functions/index.js:deliveryAccept` | Legacy/general delivery acceptance | Server verifies assignment and creates pickup token path | There are two acceptance entry points; they must have one shared authoritative acceptance helper to avoid behavior drift | Route both public functions through one internal acceptance/claim helper or clearly designate `deliveryOfferAccept` as canonical and retain compatibility wrapper | Existing `deliveryOfferAccept` + custody helpers |
| `functions/index.js:deliveryGenerateToken` | Generates pickup (`PK`), handover (`TR`), and final/transfer (`DL`) token records | Uses crypto random token, hash/masked reference on ride, private `delivery_tokens` record | Token schema is conceptually centralized but uses `kind` and a fixed `{rideId}_{kind}` key; replacement/parallel legs can collide; token record keeps plaintext for authorized reads and does not have complete issued/presented/verified/consumed lifecycle metadata | Extend existing token records with `tokenId`, `tokenType`, `shipmentId`, `orderId`, `stage`, issuer/intended actor/from/to roles, lifecycle timestamps, attempts, and leg id; use a unique leg-aware token document id; preserve legacy lookup during migration | `custodySetToken`, `custodyGetToken`, `custodyMarkTokenStatus`, `custodyHash`, `custodyTokenOk` |
| `functions/index.js:deliveryConfirmCustody` | Seller pickup handover, carrier pickup receipt, intermediate transfer verification | Server checks role, token, state, expiry, attempts; writes event and updates ride | Multi-document writes are sequential (`ride_requests`, token record, events, handover record, notifications), so a network/process failure can leave partial custody state; token expiry uses combined pickup/handover fields rather than stage-specific expiry; final receipt is not handled here | Introduce one internal transaction for each custody-changing operation: read ride/token/order/leg, validate all, atomically update ride + consume token + write custody event + close handover; notifications occur after commit and are idempotent | `deliveryConfirmCustody`, Firestore `runTransaction`, `custodyEvent`, `custodyMarkTokenStatus` |
| `functions/index.js:deliveryStartTransit` | Moves picked-up ride to in-transit | Callable and server-authorized | Must verify the caller is the current custodian, not merely assigned driver, and must be idempotent | Centralize allowed transition matrix and return current state for repeat calls by the same authorized actor | Existing `deliveryStartTransit`, `custodyGetRide` |
| `functions/index.js:deliveryComplete` | Final delivery, final custody to buyer, escrow release | Requires server acceptance, transit custody, and DL token where applicable; invokes existing escrow settlement | Carrier can still be the initiating caller; final buyer receipt is not a distinct `DELIVERY_VERIFICATION` transition with a buyer-controlled, stage-specific token. Completion update and token consumption are not one atomic transaction. `deliveryComplete` has legacy direct completion compatibility | Add `deliveryRequestVerification`/`deliveryConfirmReceipt` only if no existing equivalent can be extended; otherwise extend `deliveryComplete` with explicit `requestVerification` and `confirmReceipt` actions, buyer authorization, `deliveryToken` stage, and one transaction. Keep existing escrow release after authoritative delivery commit and idempotent | `deliveryComplete`, existing escrow release/`releaseOrderEscrow`, `custodyTokenOk` |
| `js/app/33-custody.js` | Browser custody screens/actions and compatibility wrapper | Correctly prefers server callables; production fallback is disabled unless explicit demo flag | Contains an opt-in client Firestore fallback and local token/event helpers; UI may expose legacy direct patterns. This is acceptable only for explicit emulator/demo mode, not normal local Functions | Make production UI server-only, label demo fallback visibly, remove/disable client-authoritative fallback from normal config, and ensure all action buttons refresh from server state after reconnect | `callServer`, `custodyFallbackAllowed`, `skhCustodyGenerateToken`, `skhCustodyConfirm` |
| `js/app/40-token-box.js` | Token vault/list and token display | Existing token UI for pickup/handover/transfer; QR display is local | It may read different token kinds and expose broader ride data than necessary; does not present a unified stage-specific verification state or attempt history | Keep existing Token Box, add stage/role filtering and masked status; token secret display only through authorized callable/participant access; no duplicated token fields in UI data | Existing token box loaders and `delivery_tokens` rules |
| `js/app/20-logistics.js` | Seller logistics/pickup UI, passenger/transport controls, recovery UI | Existing seller dispatch and logistics screens | Contains legacy direct `updateDoc(ride_requests)` recovery/reassignment path and broad operational UI; recovery must not alter active custody directly | Route breakdown/reassignment through a server callable that checks current custodian, state, and active custody; preserve existing notification path | `deliveryRouteRetry`, routing functions, existing `delivery_events` |
| `js/app/27-route-dispatch.js` | Delivery post picker and selection before routing | Existing UI for real `drivers` posts and route filtering | Selection is a transport request input, not yet a complete cargo manifest/request role contract | Preserve picker; ensure checkout passes order item IDs/variants/package count and requester role to `deliveryRouteBooking` | `deliveryRouteBooking`, current delivery selection state |
| `js/app/43-delivery-choice.js` | Buyer delivery choice and transport selection | Existing choice UI and selected transport snapshot | It can describe package/weight as free-form input; not authoritative manifest | Normalize only on server from order/order items; treat client description as hints and reject mismatched immutable references | `deliveryRouteBooking`, existing order data |
| `firestore.rules` `ride_requests` | Protects custody fields and allows only safe pre-pickup client changes | Strong Phase C field-level protections; custody fields server-only | Existing rules still allow broad reads for signed-in participants in several delivery collections; `ride_requests` read scope must be checked against role/participant needs; direct demo fallback remains a compatibility risk | Do not weaken rules; tighten reads only after UI query paths are updated; add explicit immutable-field protections for new manifest/requester fields | Existing `ride_requests` rules and `delivery_tokens`/`delivery_events` server-only writes |
| `firestore.rules` `delivery_tokens` | Private token read; server-only write | Participant-scoped read, server-only write | Token access is collection-record participant based, not stage/action based; plaintext should never be broadly queryable by a participant who does not need to see it | Keep server-only writes; add stage/actor checks in callable responses and use references/masked records for general views | Existing `delivery_tokens` rule + callable boundary |
| `firestore.rules` `delivery_events` / `delivery_handovers` | Server-only immutable event/handover writes | Good audit protection | Read is `signedIn()` broadly, exposing all events/handovers to any authenticated user | Restrict reads to shipment/order participants, assigned carriers, involved handover actors, or admin; preserve server-only writes | Existing event/handover records and helper fields |
| `shipments` rules/model | Separate shipment/order link with hardened custody fields | Client cannot mutate status/custody fields | Active delivery path is primarily `ride_requests`; shipment records may not be created/linked consistently for every routed order | Extend request creation to link existing shipment if present; create server-side shipment only when required by existing order flow, never duplicate cargo/order truth | Existing order/shipment link fields and server functions |
| Existing order/escrow functions | Commercial payment, escrow, payout, commission | Existing server-authoritative/idempotent release path | Delivery completion must not settle before receipt; intermediate carrier payout/leg accounting needs explicit policy | Keep current escrow engine; pass authoritative carrier/ride/leg data into existing release helper, never create payment logic | `releaseOrderEscrow`/existing `deliveryComplete` settlement path |
| Existing `notifications` | Delivery event notifications | Reused already | Some notification writes occur after separate updates and may duplicate on retries | Add event id/idempotency key and send after committed state; notifications are not state authority | `custodyNotify`, routing notifications |

## Required state machine

The current `ride_requests.status` values are retained for compatibility, but transitions must be centralized:

```text
REQUESTED/PENDING_ROUTING
  -> OFFERED (delivery_offers)
  -> ACCEPTED
  -> PICKUP_READY / PICKUP_PENDING
  -> SELLER_CONFIRMED_HANDOVER
  -> PICKED_UP
  -> IN_TRANSIT
  -> TRANSFER_REQUIRED / AWAITING_HANDOVER
  -> IN_TRANSIT (new custodian)
  -> ARRIVED / DELIVERY_VERIFICATION
  -> DELIVERED
  -> COMPLETED
```

Failure states remain `declined`, `expired`, `cancelled`, `reassignment_required`, `failed`, and `disputed`.

No ordinary client may write a custody transition.

## Cargo manifest contract to add to the existing ride/shipment link

Server-normalized, immutable after acceptance:

```js
cargoManifest: {
  source: 'order',
  orderId,
  shipmentId: null,
  items: [{
    orderItemId,
    productId,
    variantId: null,
    titleSnapshot,
    quantity,
    packageCount: 1
  }],
  packageCount: 1,
  declaredWeightKg: null,
  category: 'product',
  verifiedPickupCount: null
}
```

The client may provide hints, but the server derives authoritative item/product/quantity values from the existing order and order items. Do not copy the whole product document.

## Priority implementation order

1. Add shared server transition/authorization helpers without changing the existing public callable names.
2. Normalize cargo/requester/shipment references at delivery request creation.
3. Make token records leg-aware and stage-complete while supporting legacy records.
4. Make pickup/transfer/final receipt custody changes atomic and idempotent.
5. Route recovery/reassignment through server authority.
6. Tighten role-scoped reads for events, handovers, and token displays.
7. Update delivery UI to show cargo, current custodian, chain timeline, and exactly one next action.
8. Add emulator/local Functions tests for three-account and four-account concurrency journeys.

## Explicit non-changes

- No second delivery engine.
- No duplicate orders, shipments, products, payment, escrow, notification, or private chat engine.
- No reopening Phase C shipment/custody fields in Firestore rules.
- No production deployment or commit.
- No Posts changes.
