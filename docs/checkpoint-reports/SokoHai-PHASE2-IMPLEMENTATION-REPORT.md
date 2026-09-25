# SokoHai — Phase 2 Implementation Report (P1–P6)

Repo: `~/SokoHai-phase1` · base `afdfe61` (GitHub main) · **nothing is committed, pushed or deployed**
Tests were run against the local Firebase emulator only (`demo-sokohai`). No production Firestore, no real PesaPal, no production rules.

---

## A. Files changed

| File | Change |
|---|---|
| `functions/index.js` | P1, P3, P5, P6 server patches, plus the P4 setter wiring (+267 / −60 lines, all inside existing functions) |
| `functions/negotiation.js` | P4: `setEscrowEngine` setter, a paid gate based on escrow evidence, and CONFIRM_* now releases through `releaseOrderEscrow` |
| `firestore.rules` | P1/P2/P6: authority rules for `orders` and `ride_requests` |
| `js/17-pesapal-return.js` | P2: the browser no longer writes `held`/`paid`/`paymentVerified`/`paidAt`/`heldAt` on non-demo paths |
| `js/app/52-transport-inbox.js` | P6: receiver confirmation goes through `skhCustodyCompleteDelivery` (server) instead of writing `status: completed` directly |
| `js/app/16-pos-admin-jobs.js` | P2: `completedAt` → `shippedAt` (one field) on held → shipped |
| `tools/test_phase2_security.mjs` | **new**: T1–T28, using the same harness as Phase 1 |
| `tools/test_phase1_security.mjs` | Fixture updates, each equivalent or stricter (see E) |
| `package.json` | Scripts `test:security:phase2`, `test:security:phase2:emulator`, `test:security:all:emulator` |

What was **not** changed: no new module, no UI, design or business model changes, no commission change. Negotiation logic was not moved. The token chain, PesaPal confirmation and ads are untouched. The `assets/` and `fonts/` copies were not touched (Phase 1 did not touch them either; they were already stale).

## B. Patches by P1–P6

**P1 — Fare / carrier**
- `deliveryAccept` and `deliveryOfferAccept` snapshot `agreedFare = fare || price` on the server at acceptance.
- `deliveryComplete` and `releaseOrderEscrow` pay the carrier from **`agreedFare` only**. There is no fallback to fare/price and no 15%. The explicit carrier amount is `ctx.carrier.amount` or 0.
- New helper `carrierRideEligible(rd, order)`. The carrier gets a share only if all of these hold:
  - `agreedFare > 0`;
  - the driver is neither the buyer nor the seller;
  - for a product or service order, `sellerConfirmedBy === order.sellerId`.
- `deliveryConfirmCustody` with role=seller:
  - For a ride linked to a non-transport order, it requires `auth.uid === order.sellerId`. Transport rides keep the old rule (customerId).
  - It writes `sellerConfirmedBy` on the server.
- Rules:
  - `agreedFare`, `sellerConfirmedBy`, `sellerId`, `productOrder` and `source` cannot be edited, and `agreedFare`/`sellerConfirmedBy` cannot be set on create.
  - `fare`/`price`/`cargoPrice` can be changed only by the customer, and only before `acceptedAt` and before any driver is assigned.
  - Updates are limited to the customer, the driver, the `currentCustodian`, or an admin.

**P2 — Order state authority (rules and client)**
- Only parties to the order (or an admin) can update it. `buyerId`/`sellerId`/`providerId`/`courierId` cannot change.
- Money keys are blocked:
  - amount, verifiedAmount, paymentProtectedAt, paidAt, heldAt;
  - sellerEarned, carrierEarned, commission, completedAt;
  - autoReleased, autoReleasedAt, disputeResolvedAt, disputeWinner;
  - buyerRefund, verifiedByServer, …
- `paymentStatus`/`paymentVerified`: the client may only write informational values (rejected / verification_pending / verification_unavailable / pending). It can never write `paid` or `true`, and cannot change them after the server has verified payment.
- `rideRequestId`/`deliveryId`/`driverId`/`transportRequestId` can be set once (empty → value) and are fixed after that.
- Status allow-list:
  - buyer: held/shipped/awaiting_pickup/in_transit/delivered → `disputed`;
  - buyer or seller: payment_pending/pending → `cancelled`;
  - seller/provider: held → `shipped` (and `shippedAt` only in that same write).
  - Everything else is admin/server only, so disputed → shipped/held, completed → any state, and refunded → active are all blocked.
- Create: blocks results fields (sellerEarned, commission, disputeWinner, …) and final statuses (completed/refunded_by_admin/split_refund_resolved).
- `17-pesapal-return.js`:
  - `markNegoOrderPaid` (non-demo) strips status/paymentStatus/paymentVerified/paidAt/heldAt.
  - `postPayDelivery` writes only `paymentRef` + `transactionId`.
  - The server (`settleWithServer` → `settlePesaPalPayment`, which was already called afterwards) writes held/paid.

**P3 — Auto-release and stuck orders**
- `runSokoPayAutoRelease` also requires `now − snap.updateTime ≥ 24h`. This is the Firestore server time, so it cannot be backdated.
  - In the emulator only, `scheduleTime` can move the clock for tests. Production always uses `Date.now()`.
- `releaseOrderEscrow` returns "already" for a `completed` order only if one of these is true: the `wallet_ledger/order_<id>_released` marker exists, the hold is released, or there is no evidence. Otherwise the stuck escrow is released (transactionally, once).

**P4 — Negotiation**
- `negotiation.js` gets `setEscrowEngine()`, and `index.js` passes in `{releaseOrderEscrow, getEscrowEvidence}`. If the engine is missing it fails closed.
- Step 4, the paid gate, now uses `getEscrowEvidence('order', …, {recheckPesaPal:true}).ok`.
- CONFIRM_RECEIPT and CONFIRM_COMPLETION call `releaseOrderEscrow(orderId, {callerUid, trigger:'buyer_confirm'})` before the patch. If the release fails, nothing is written. `delivered` is accepted.
- Stages, UI fields and events are unchanged.

**P5 — walletAdjust dispute (dispwin_/splitref_)**
- The whole check runs inside the existing transaction:
  - It requires a server hold (`order_<id>`, `link_<itemId>`, `link_<id>`), or a legacy `splink_buy_<id>` ledger entry that matches the price.
  - It rejects the payout if the hold was released by a normal path (`releasedFor ≠ admin_dispute`).
  - `disputePaid` is added atomically, and the cumulative total must be ≤ `hold.amount`. A split can only use what remains.
  - It rejects amount ≤ 0.
  - The recipient must match the role: `buyer` = payerUid/buyerId, `seller` = payeeUid/sellerId.
- Client `order.amount` and `status` are not trusted.

**P6 — Ride acceptance**
- `deliveryAccept` runs in a transaction:
  - It accepts only status ∈ {searching, pending_acceptance} with no other driver and not `assigned` to someone else. The customer cannot be the driver.
  - The pickup token is written with `t.set` inside the transaction.
  - A re-accept by the same driver before pickup returns the existing token without changing anything. In later states it is rejected.
- `deliveryOfferAccept`: the customer cannot accept, and the status must be open.
- `deliveryGenerateToken` (pickup): works only in accepted/pickup_pending/awaiting_pickup (it can return an existing token in seller_confirmed_handover).
- Rules:
  - `driverId → null` is allowed only for the driver themself (breakdown) or for the customer before pickup.
  - Client `status` can only be `searching` (with driverId null) or `cancelled` (customer, before pickup).
- Auto-release skips an order with an active linked delivery (`orderHasActiveDelivery`: driver + acceptedAt, not completed or cancelled).

## C. Findings closed

The Step‑1 exploit PoC (`SokoHai-phase2-audit/poc_phase2_audit.mjs`) was re-run on the emulator against the patched code:

| Finding | Before | Now |
|---|---|---|
| S1 fare edit shifts escrow | CONFIRMED | **NOT-REPRODUCED** (PATCH 403) |
| S1b buyer + accomplice drain escrow | CONFIRMED | **NOT-REPRODUCED** |
| S2 seller overrides dispute → auto-release | CONFIRMED | **NOT-REPRODUCED** (403) |
| S3a buyer `completed` → money stuck | CONFIRMED | **NOT-REPRODUCED** (403, and stuck escrow can still be released) |
| S3b amount edit → DoS | CONFIRMED | **NOT-REPRODUCED** (403) |
| S4 CONFIRM_RECEIPT doesn't pay seller | CONFIRMED | **NOT-REPRODUCED** (seller paid, hold released) |
| S5 re-dispute + amount → double pay | CONFIRMED | **NOT-REPRODUCED** |
| S6a–d ride hijack / rewind / double accept / status forge | CONFIRMED | **NOT-REPRODUCED** |
| S7 forged paid gate | CONFIRMED | **NOT-REPRODUCED** |
| S9 auto-release before delivery (carrier 0) | code-verified | closed; covered by T28 |
| S8 CONTROL (forge hold / swap seller / pay once) | holds | **still holds** |

## D. T1–T28 results — **28 passed, 0 failed**

`PATH=/tmp/fbt/node_modules/.bin:$PATH npm run test:security:phase2:emulator`

| # | Test | Result |
|---|---|---|
| T1 | A stranger cannot change a ride's fare/price/status/driverId | PASS |
| T2 | Fare is locked after acceptance; the customer can change it before | PASS |
| T3 | agreedFare/sellerConfirmedBy/acceptedAt are server-only (update + create) | PASS |
| T4 | agreedFare is snapshotted; deliveryComplete pays agreedFare only (fare 20000 → driver 3000, seller 17000) | PASS |
| T5 | The buyer cannot do the seller handover; the real seller can | PASS |
| T6 | S1b: buyer + accomplice driver get 0; seller gets the whole escrow | PASS |
| T7 | Driver = buyer/seller → no carrier share | PASS |
| T8 | Buyer → disputed works; disputed → shipped/held is blocked | PASS |
| T9 | Status completed / refunded and amount changes are blocked | PASS |
| T10 | Money, split and resolution fields are blocked; informational PesaPal writes still work | PASS |
| T11 | Completed/refunded orders cannot go back to active states | PASS |
| T12 | Link fields can be set once (43-delivery-choice, 57-checkout-bridge still work) | PASS |
| T13 | Seller held → shipped works; shippedAt cannot be backdated; cancel before payment works | PASS |
| T14 | Create: no final status or payout results; normal create and admin resolution work | PASS |
| T15 | A "completed" order with an unreleased hold is released once (not "already") | PASS |
| T16 | Auto-release uses updateTime (not at T+0; released at T+25h; once) | PASS |
| T17 | Negotiation happy path pays the seller once; replay is idempotent | PASS |
| T18 | A forged paid gate does not work | PASS |
| T19 | Service CONFIRM_COMPLETION releases escrow | PASS |
| T20 | S5: dispute after release is rejected | PASS |
| T21 | No hold / amount ≤ 0 is rejected | PASS |
| T22 | Split total ≤ hold; overpayment and a third payment are rejected; the winner is paid once | PASS |
| T23 | The recipient must match the role | PASS |
| T24 | Concurrent accept gives exactly one driver (3 rounds) | PASS |
| T25 | Re-accept is idempotent; no reset in transit | PASS |
| T26 | Completed/cancelled/in-custody rides cannot be hijacked; stranger REST is blocked; breakdown, cancel and reassign still work | PASS |
| T27 | Pickup token is issued only before pickup | PASS |
| T28 | An active delivery blocks auto-release; completion pays seller + carrier; an order without delivery is still auto-released | PASS |

## E. Phase 1 regression — **57 passed, 0 failed**

I updated three Phase 1 fixtures. Each is an equivalent or stricter assertion:
1. **R5 `ride()` fixture:** added `agreedFare: 3000, sellerConfirmedBy: 'seller'`. These are fields the server now writes during a legitimate delivery chain. The expected payouts (driver 3000 / seller 17000) are unchanged.
2. **R5 "arbitrary price with no order":** it passes again because of item 1 (it previously failed as a knock-on effect).
3. **V2 negotiation "forged held":**
   - Before, the test expected the forged gate to pass as long as no money moved (documenting S7).
   - Now it expects the gate itself to reject the order (`failed-precondition`), expects CONFIRM_RECEIPT without escrow to be rejected, and still checks that no money moves.

Other checks:
- **npm tests:** 39 pass / 1 fail. This is **identical** to the baseline `afdfe61`. The one failure is `test_chat_authority_contract` (stale `fonts/` copy, pre-existing).
- **Local server:** `test_local_functions_server.mjs` PASS; `test_ads_local_delivery_regression.mjs` PASS.

## F. Happy paths (verified on the emulator)

- Buyer → seller: escrowRelease (Phase 1 R2) and negotiation CONFIRM_RECEIPT (T17) each pay the seller once.
- Seller → driver → buyer: accept → real seller handover → pickup → transit → receiver completes (T4, T28).
- Seller marks shipped, buyer disputes (T8, T13); payment_pending orders can be cancelled (T13).
- Admin refund / split / winner (T14, T22, T23, Phase 1 V-tests).
- Linking:
  - rideRequestId/deliveryId/transportRequestId (T12);
  - driver breakdown and recovery, customer cancel/reassign before pickup, driver location updates (T26).
- Auto-release with no delivery still works (T28, T16).

## G. Remaining risks / notes

1. **Legacy rides** accepted before this patch have no `agreedFare`, so the carrier share is 0 and the seller gets 100%. Rides accepted after deploy are unaffected. Admin can correct legacy rides by hand.
2. **Pre-accept fare is set by the buyer.** This is limited: the carrier is paid only if the real seller did the handover (`sellerConfirmedBy`), and the payout is capped at the escrow.
3. **Breakdown recovery** (`20-logistics`) returns the ride to `searching`. A new accept restarts custody at `pickup` (this was already the behaviour).
4. **The demo payment path** in `17-pesapal-return` (`pending.demo`) still tries to write `held`/`paid`. The rules now deny this (it was never a real payment).
5. **Demo fallbacks for custody writes** (33-custody, 16-pos, 14-map, 20-logistics:250, 52:414/430) are denied by the rules. The real path is the server callable, which was already the default.
6. **Stale copies** `assets/js/*` and `fonts/*` were not changed (same as Phase 1).
7. Items still left for Phase 2 hardening or Phase 3 (not done here):
   - `isAdmin` in the rules has no `email_verified` check;
   - the link `carrierShare` is paid to nobody;
   - display-only collections are writable;
   - Node 20 is decommissioned on **2026-10-30**. `firebase.json`/engines are pinned to node 20, so this needs a decision before you deploy.

## H. git status

```
 M firestore.rules
 M functions/index.js
 M functions/negotiation.js
 M js/17-pesapal-return.js
 M js/app/16-pos-admin-jobs.js
 M js/app/52-transport-inbox.js
 M package.json
 M tools/test_phase1_security.mjs
?? tools/test_phase2_security.mjs
HEAD: afdfe61 (unchanged) · 8 files changed, 420 insertions(+), 89 deletions(-) + 1 new file (557 lines)
```

## I. git diff --check

Clean (no output). The new file has 0 lines with trailing whitespace. `node --check` passes on every JS file that changed. Secret scan: no keys, tokens or private keys were added; the tests only use stub values (`test-key`, `test-secret`).

## J. Emulator-only confirmation

- All tests use `firebase emulators:exec --only firestore,auth --project demo-sokohai`. The harness refuses to run without `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST`.
- PesaPal is a fetch stub (`https://pesapal.stub/`).
- The emulator clock hook (`scheduleTime`) is active only when `FIRESTORE_EMULATOR_HOST` is set.
- No production Firestore, production rules or real money were touched.

## K. No commit, push or deploy

No commit, push or deploy was made. HEAD is still `afdfe61`. **Waiting for your approval.**
