# SokoHai — PHASE 2 STEP 1: ORDER + ESCROW AUTHORITY AUDIT (READ-ONLY)

- **Checkpoint audited:** GitHub `main` = `afdfe61`.
  - The local clone is at `b5be2cc`. Its tree matches `afdfe61` in every file except `PHASE1-PACKAGE-INFO.md`, which is documentation only.
  - Verified with `git fetch` of GitHub main, then `git diff b5be2cc afdfe61`: 1 file changed.
- **Scope:** only `orders`, `escrow_holds`, `ride_requests`/delivery, wallet payouts, disputes and the related `firestore.rules`.
- **Out of scope:** Phase 3, UI, ads, ChatHai and GuardHai.
- **Method:**
  1. Full code trace of server and client.
  2. Every money bypass below was then **executed on the Firebase emulator**: Firestore and Auth, with PesaPal stubbed.
     - Browser writes go through the real `firestore.rules` via REST using real auth-emulator ID tokens.
     - Callables run as real function code.
     - No production access, no real money.
- **PoC script:** `/home/user/SokoHai-phase2-audit/poc_phase2_audit.mjs`, stored outside the repo.
- **Phase 1 regression suite:** re-run on this checkout, **57/57 PASS**.

---

## A. PHASE 2 AUDIT VERDICT

**NOT SAFE: order and escrow lifecycle is only partially server-authoritative.**

**What Phase 1 made server-authoritative, and still holds** (confirmed by control test S8):
- Money can only leave escrow if a server-created `escrow_holds` proof exists.
- The payer and payee must match the order's buyer and seller, and the amount must match.
- Each hold can be released once, and concurrent releases pay once.

**What remains:**
- The **state machine around that money** is client-writable:
  - order `status`, `amount` and linkage;
  - ride `fare`, `status` and `driverId`.
- `deliveryAccept` is not state-checked.
- Negotiation receipt and admin disputes are disconnected from the hold.

**12 confirmed findings.** 8 of them move money wrongly, or lock it so a legitimate payout never happens:

| Sev | ID | One-line |
|---|---|---|
| **CRITICAL** | S1 | Any signed-in stranger can edit `ride_requests.fare`. The whole order escrow then goes to the driver and the seller gets 0. |
| **CRITICAL** | S1b | A buyer plus an accomplice driver can drain an order's escrow with **no seller involvement**. The buyer performs the "seller handover" step himself. |
| **HIGH** | S2 | The seller can overturn a buyer dispute (`disputed → shipped`) and backdate `shippedAt`. Auto-release then pays the seller. |
| **HIGH** | S5 | A buyer can re-dispute a completed (already paid) order and inflate `amount`. The admin dispute refund then pays out again, up to the 50M cap. |
| **HIGH** | S4 | Negotiation `CONFIRM_RECEIPT` / `CONFIRM_COMPLETION` marks the order `completed` **without releasing escrow**. The seller is never paid and the hold is stuck forever. **This is the normal legitimate flow.** |
| **HIGH** | S9 | Auto-release (`shipped`, no carrier) pays the seller 100%. A later `deliveryComplete` then finds "already released", so the driver is never paid. Code-verified, not executed. |
| MEDIUM | S3a/S3b | The buyer can write `status: completed` or change `amount`, which permanently blocks the seller's payout. |
| MEDIUM | S6a–d | `deliveryAccept` has no state check and no transaction. Any user can write ride `status`/`driverId`. Result: hijack, rewind of a completed ride, double-accept race, and DoS of completion. |
| LOW | S7 | The `negotiationOrderAction` "paid" gate trusts client `paymentStatus`/`status`. Workflow only; no payout, because release still requires a hold. |

---

## B. COMPLETE MONEY-FLOW MAP

### B1. Money IN, which creates escrow proof (`escrow_holds`, server-only; rules `write:false`)

| Source | Function | Proof written | Amount source | Parties source | Guards |
|---|---|---|---|---|---|
| PesaPal payment for order/link | `settlePesaPalPayment` ← `pesapalTransactionStatus` / `pesapalIpn` / recheck inside release | `order_<id>` / `link_<id>` + `pptx_<tid>` usage | `orders.amount` / `sokopay_links.price` (client-set at creation), capped by the verified PesaPal amount | `orders.buyerId/sellerId` (client-set at creation; immutable after, per rules) | payer == PesaPal initiator (`ppinit_`); sum ≤ paid; hold once; txn |
| Wallet → SokoPay link | `sokopayLinkWalletPay` | `link_<id>` + ledger `splink_buy_<id>` | `link.price` | auth.uid / `link.userId` | atomic debit+hold; link must be `pending`; self-trade blocked |
| Legacy wallet link | `getEscrowEvidence → legacyWalletLink` | reads ledger `splink_buy_<id>` | ledger amount == price | ledger callerUid == buyer | read-only |

### B2. Money OUT (wallet credits). All other client wallet credits are rejected by `walletAdjust` (Phase 1).

| Payout | Entry point → core | Caller authz | Order authz | Escrow proof | State validation | Amount source | Replay | Atomic | Client fields that influence payout |
|---|---|---|---|---|---|---|---|---|---|
| Seller (+agent, platform) via buyer confirm | `escrowRelease` → `releaseOrderEscrow` | buyer (`orders.buyerId`) or admin | server reads order | hold required, payer/payee/amount match | status ∈ held/shipped/awaiting_pickup/in_transit; **`completed` ⇒ returns "already" without checking hold** | hold amount | marker `order_<id>_released` + `hold.released` | yes (txn) | **`status`** (S3a); **`amount`** (S3b); **`rideRequestId`/`deliveryId`** (selects carrier ride); carrier share = **`ride.fare`/`ride.price`** (S1) |
| Carrier (driver) via buyer confirm | same (auto carrier lookup) | same | ride must have `acceptedAt`, custodyStage transit/handover/completed, customerId == buyer, driver ≠ seller/buyer | same hold | — | **`ride.fare` → ride.price → 15%**, capped at escrow − fee | same marker | yes | **`ride.fare` (writable by ANY signed-in user)**, order `rideRequestId` |
| Seller + carrier via delivery | `deliveryComplete` → `releaseOrderEscrow(carrier)` | current custodian, or receiver (customerId) | `ride.orderId` (set by customer at ride create) with `order.buyerId == ride.customerId`, or legacy `parentRideId` match | same hold | ride: `acceptedAt`, custodyStage `transit`, Token C (receiver may skip it); order status as above | carrier = **`ride.fare`/`ride.price`** ≤ escrow − fee; the rest goes to the seller | marker + hold | release is txn; ride update is not | **ride `fare`/`price`**; "seller handover" is confirmed by **customerId (= buyer)**, not the order's seller (S1b) |
| Seller via auto-release | `sokopayAutoRelease` → `releaseOrderEscrow({requireStatus:'shipped', noCarrier})` | system | — | hold required | status == `shipped`; now − `shippedAt` ≥ 24h **and** now − `hold.verifiedAt` ≥ 24h | hold amount, **no carrier** | marker + hold | yes | **`status` (seller can flip disputed→shipped)**, **`shippedAt` (backdatable)** (S2); driver starved later (S9) |
| Link seller (manual) | `haipayReleaseLink` → `releaseLinkEscrow` | link buyer or admin | — | hold `link_<id>` or legacy ledger | `link.status == held` (server-only) | hold; `carrierShare` from link (seller-writable while pending) is deducted and **paid to nobody** | `spman_link_` + hold | yes | `link.carrierShare` (seller's own loss; low) |
| Link seller (auto) | `sokopayAutoRelease` → `releaseLinkEscrow` | system | — | same | held + 24h from `paidAt` and `verifiedAt` (both server-written now) | same | `spauto_link_` + hold | yes | none material (rules protect link state) |
| Dispute: winner (buyer refund / seller) | admin UI `21-sokopay.resolvePlatformDispute` → `walletAdjust(ledgerKey dispwin_<id>_<winner>)` | admin (verified email/claim) | **none** (client writes order status first, non-atomically) | marks holds `released:true` (Phase 1 patch) **but never checks they were unreleased** | none | **`orders.amount` read by the admin browser (client-writable)** | ledger key once | wallet+hold txn only | **order `status` (buyer re-disputes a completed order)**, **`amount`** (S5) |
| Dispute: split refund | admin UI → `walletAdjust(splitref_buyer_<id>)` + `walletAdjust(splitref_seller_<id>)` | admin | none | same as above | none | admin-typed split of **`orders.amount`** | per key | per call | same as above |
| Deposit / agent commission | `walletAdjust` (non-admin) | own wallet | — | verified PesaPal tx + `pptx_` usage | — | PesaPal amount / 1260 | tracking id / member id | yes | none (Phase 1) |

### B3. Negotiation order pipeline (`functions/negotiation.js`), with no money movement at all

| Command | From → status | Money |
|---|---|---|
| `PREPARE_ORDER` (seller) | held/shipped/prepared → `shipped` (sets `preparedAt`, **not** `shippedAt`, so auto-release never fires) | none |
| `START_TRANSIT` (seller) | → `in_transit` | none |
| `MARK_DELIVERED` (seller) | → `delivered` (not an allowed release status) | none |
| `CONFIRM_RECEIPT` / `CONFIRM_COMPLETION` (buyer) | → `completed` | **none. `releaseOrderEscrow` afterwards returns "already"; the hold is never released (S4).** |

---

## C. EXACT CONFIRMED BYPASSES (emulator evidence)

All of these ran through real rules and real function code. Output is from the `poc_phase2_audit.mjs` run on this checkout.

- **S1: third-party fare edit shifts escrow from seller to driver. CONFIRMED.**
  - Setup: order 20 000 is paid and a hold is created. The buyer creates a ride with `orderId` and `fare: 2000` (rules: 200).
  - Driver `deliveryAccept`; custody chain completed; Token C issued.
  - **A stranger** PATCHes `ride_requests/r1 {fare: 999999999}` → **200**.
  - Driver `deliveryComplete` → `paid_from_escrow`. **Seller = 0, driver = 20 000.**
  - The seller never took part in the custody chain.
- **S1b: buyer plus accomplice driver drain the escrow without the seller. CONFIRMED.**
  - The buyer creates a ride with `orderId` and `fare = order amount`.
  - The friend accepts.
  - The buyer calls `deliveryConfirmCustody role:'seller', direct:true`. This passes because `customerId == buyer`.
  - The driver confirms pickup. The buyer (receiver) completes without Token C.
  - **Seller = 0, driver = 20 000.**
- **S2: seller overrides a buyer dispute. CONFIRMED.**
  - Hold verified 48h ago. Buyer PATCH `status:'disputed'` → 200.
  - **Seller PATCH `status:'shipped', shippedAt: 30h ago` → 200.**
  - The auto-release run marks the order `completed` with `autoReleased: true`. **Seller = 20 000.**
- **S3a: buyer blocks payout by writing `completed`. CONFIRMED.**
  - Buyer PATCH `status:'completed'` → 200.
  - Admin `escrowRelease` → `already: true`. Seller = 0; `hold.released = false` (money stuck).
- **S3b: buyer blocks payout by editing `amount`. CONFIRMED.**
  - Buyer PATCH `amount: 20001` → 200.
  - Release is rejected with `amount_mismatch`.
- **S4: `CONFIRM_RECEIPT` strands escrow. CONFIRMED.**
  - `PREPARE_ORDER` → `START_TRANSIT` → `MARK_DELIVERED` → `CONFIRM_RECEIPT` all return ok.
  - `order.status = completed`, `hold.released = false`, `escrowRelease → already`. Auto-release does nothing.
  - **Seller = 0.**
- **S5: double payout through dispute after release. CONFIRMED.**
  - Normal release: seller = 20 000.
  - Buyer PATCH `{status:'disputed', amount: 5000000}` on the **completed** order → 200.
  - The admin dispute path (`walletAdjust dispwin_o5_buyer`, amount read from the order as the admin UI does) → ok.
  - **Buyer refunded 5 000 000** on an escrow of 20 000, and the seller keeps 20 000.
- **S6a: ride hijack mid-transit. CONFIRMED.**
  - A stranger PATCHes `driverId: null` → 200, then calls `deliveryAccept` → ok.
  - The stranger is now the driver. Status resets to `accepted`, custody to `pickup`.
- **S6b: rewind of a completed ride. CONFIRMED.**
  - `deliveryAccept` on a `completed` ride → ok. Status becomes `accepted` with the stranger as driver.
- **S6c: concurrent accept. CONFIRMED.**
  - Two drivers call `deliveryAccept` at the same time and both get `ok` plus a pickup token. The last write wins.
- **S6d: stranger writes ride `status`. CONFIRMED.**
  - `status:'completed'` → 200. `deliveryComplete` then returns "already" and no payout happens.
- **S7: forged paid gate. CONFIRMED.**
  - Buyer PATCH `paymentStatus:'paid', status:'held'` on an unpaid negotiation order → 200.
  - Seller `PREPARE_ORDER` → ok. `escrowRelease` is still denied, so no money moves.
- **S9: auto-release starves the driver. CODE-VERIFIED (not executed).**
  - `runSokoPayAutoRelease` calls `releaseOrderEscrow({noCarrier:true})`, which pays the seller 100% and marks the hold released.
  - A later `deliveryComplete` → `releaseOrderEscrow` returns `already`, so `carrierShare = 0`.

**Control S8: works as designed.**
- A browser cannot create `escrow_holds` (403) or swap `sellerId` (403).
- Concurrent `deliveryComplete` ×2, then `escrowRelease`, then auto-release, paid **exactly 20 000 in total** (seller + driver).

---

## D. EXACT FILES / FUNCTIONS INVOLVED

| Finding | Server | Rules | Client callers (not patched) |
|---|---|---|---|
| S1, S1b | `functions/index.js`: `releaseOrderEscrow` (carrier lookup: `rd.fare`/`rd.price`, `o.rideRequestId`), `deliveryComplete` (`fareBase = rd.fare‖rd.price`), `deliveryConfirmCustody` role `seller` (checks `rd.customerId`); `functions/routing-core.js` `rideFromProductOrder`/`ensureRideForOrder` (fare = client `delivery.fare` / `order.fare‖amount`); `functions/routing.js` `deliveryRouteBooking` (`d.fare` from request) | `ride_requests` create (customer sets `orderId`, `fare`) and update (**any signed-in user**; `fare`, `price`, `cargoPrice`, `status` unprotected) | `js/app/43-delivery-choice.js:662,735` (fallback ride create), `57-checkout-bridge.js`, `52-transport-inbox.js:571` |
| S2, S3a, S3b, S5 (client side) | `runSokoPayAutoRelease`, `releaseOrderEscrow` (`status==='completed'` short-circuit) | `orders` update: any party may change **any** field except the 4 party ids | `03-dashboard.js:161` (shipped), `04-orders-escrow.js:324` (disputed), `16-pos-admin-jobs.js:2307`, `17-pesapal-return.js:79/85/108`, `34-chat-core.js:3918/4265`, `43-delivery-choice.js:692/735`, `57-checkout-bridge.js:328`, `21-sokopay.js:975/1092` (admin) |
| S4, S7 | `functions/negotiation.js`: `negotiationOrderAction` (step 4 "paid" gate; step 6 writes `completed`), `PRODUCT/SERVICE/TRANSPORT_ORDER_DEFS` | — | `js/app/37-negotiation.js` (buttons) |
| S5 (server side) | `functions/index.js`: `walletAdjust` admin branch + `adminDisputeTargetId` (marks holds released; no "unreleased"/amount check) | `orders` update (status/amount) | `js/app/21-sokopay.js:953–1010` `resolvePlatformDispute`, `:1060–1140` split refund |
| S6a–d | `functions/index.js`: `deliveryAccept` (no txn; state check covers only active statuses; driver == customer allowed), `deliveryGenerateToken` pickup branch (resets `status`/`custodyStage` from any state) | `ride_requests` update (any signed-in; `driverId → null` allowed for anyone; `status` free) | `js/app/33-custody.js`, `41-request-inbox.js`, `52-transport-inbox.js` |
| S9 | `runSokoPayAutoRelease` (`noCarrier:true`) vs `deliveryComplete` | — | — |

---

## E. GENUINE SECURITY/MONEY BUGS vs DESIGN / PHASE 3

**Genuine security or money bugs (Phase 2 scope):**
- S1, S1b, S2, S5: money goes to the wrong party, or is paid out more than once.
- S4, S9: a legitimate party is never paid, and the money is stuck or misallocated. S4 hits the normal happy path.
- S3a, S3b: counter-party DoS on payout.
- S6a–d: custody and assignment integrity.
- S7: state-integrity only; no funds move.

**Design / business-model questions (flag only, no change without your decision):**
- **D1.** For product orders the **carrier fare is deducted from the seller's escrow**; the buyer does not pay it on top. Current code behaves this way. The patches below keep it, but cap it to a server-snapshotted fare.
- **D2.** The order `amount` is set by the buyer at creation and is not validated against the product price. Money is bounded by what the buyer actually paid, so no money is created.
- **D3.** `deliveryDispute` (ride) does not freeze the order escrow, so auto-release can still pay the seller.
- **D4.** In custody the "seller" role is whoever booked the ride (`customerId`). For product orders that booker is the **buyer**.

**Phase 2 hardening (not exploited here):**
- **H-a.** Rules `isAdmin()` accepts the admin email without `email_verified`. The server `isAdmin` checks it.
- **H-b.** `releaseLinkEscrow` deducts a seller-set `carrierShare` that is paid to nobody. It is the seller's own money, so severity is low.

**Phase 3 cleanup (not security):**
- **Legacy client money code:** `04-orders-escrow.js` fallback and `21-sokopay.js:85`. It is dead while `WALLET_VIA_SERVER`, and the server rejects it anyway.
- **Display-only escrow strings writable by any user:** `sokopay_core_transactions`, `seller_order_inbox`, `logistics_assignments`. No money moves, but the UI can be misleading.
- **`adminRevenue`:** client-writable (stats only).
- **`16-pos-admin-jobs.js:2242`:** creates an order with `buyerId` set to another user. The rules deny this, so the flow is broken; it is a functional bug.

---

## F. PROPOSED MINIMAL PATCHES (not applied)

Principles:
- Reuse the existing `releaseOrderEscrow`, `getEscrowEvidence` and the hold/marker.
- Create no new modules and move no negotiation logic.
- Rules only protect money-bearing fields and transitions.
- Every existing client write listed in D is re-checked against the new rules before landing.

**P1 (S1, S1b): server-snapshotted fare, and the real seller confirms handover.**
1. **Fare snapshot at acceptance.**
   - `deliveryAccept` and `deliveryOfferAccept` write `agreedFare = Number(rd.fare‖rd.price‖0)` inside the accept.
   - `deliveryComplete` and the carrier lookup in `releaseOrderEscrow` use **`rd.agreedFare` only**, with no `fare`/`price` fallback, still capped at escrow − fee.
2. **Rules for `ride_requests` update:**
   - add `agreedFare`, `fare`, `price`, `cargoPrice`, `sellerId`, `productOrder`, `source` to the protected list;
   - restrict updates to parties (`customerId`, `driverId`, `currentCustodian`) or admin.
3. **Handover by the real seller.**
   - In `deliveryConfirmCustody` role `seller`: if the ride is linked to a product order (`rd.orderId` → order, `commerceType ≠ transport`), require `auth.uid == order.sellerId`, not `customerId`.
   - Booking rides (the seller is the transporter) keep the current behaviour.
4. **Driver identity:** `deliveryComplete` releases carrier escrow only if `rd.driverId ∉ {buyer, seller}`. This check already exists in the lookup; add it to the explicit carrier path.

**P2 (S2, S3a, S3b, and the client side of S5): order-state rules.** On `orders` update, a non-admin party:
- may not change: `amount`, `paymentStatus`, `paymentVerified`, `verifiedAmount`, `paymentProtectedAt`, `paidAt`, `heldAt`, `sellerEarned`, `carrierEarned`, `commission`, `completedAt`, `autoReleased*`, `disputeResolvedAt`, `disputeWinner`, `rideRequestId`/`deliveryId`/`driverId` once set;
- may change `status` only via a small allow-list:
  - buyer: `held|shipped|awaiting_pickup|in_transit|delivered → disputed`, or `payment_pending → cancelled`;
  - seller: `held → shipped` (+`shippedAt`);
- **may never move an order out of `disputed`**, or out of `completed`/`refunded*`/`split_refund_resolved` (admin only).

`17-pesapal-return.js` writes `paymentStatus`/`paidAt`/`heldAt`. Those writes are non-authoritative, and the server settle writes the same fields. The patch will allow only the non-paid values (`rejected`, `verification_*`) from the browser, or drop that write so the server settle is authoritative. Checked individually at implementation.

**P3 (S2 server side, S3a):**
- `runSokoPayAutoRelease` also requires `now − snap.updateTime ≥ 24h`. Firestore update time is server-set, so backdating `shippedAt` gives no gain.
- `releaseOrderEscrow`: treat `status === 'completed'` as "already" **only if** the release marker exists or the hold is released. Otherwise proceed, which fixes stuck holds.

**P4 (S4, S7): negotiation receipt releases escrow through the existing engine.**
- `index.js` hands `releaseOrderEscrow` and `getEscrowEvidence` to `negotiation.js` through a one-line setter. There is no logic move and no new module.
- `CONFIRM_RECEIPT` / `CONFIRM_COMPLETION` call `releaseOrderEscrow(orderId, {trigger:'buyer_confirm', callerUid})`, then write the stage fields.
- `releaseOrderEscrow` accepts `delivered` for that trigger.
- The step-4 "paid" gate uses `getEscrowEvidence(...).ok` instead of client `paymentStatus`/`status`.

**P5 (S5 server side): dispute resolution bound to the hold.** In `walletAdjust`, when `adminDisputeTargetId(ledgerKey)` resolves:
- require an existing hold that is **not released** (a split may be partially consumed);
- require the cumulative amount paid from the hold (tracked as `disputePaid` on the hold, in the same txn) ≤ `hold.amount`;
- otherwise reject with `failed-precondition`.

The admin UI is unchanged. Its amount is then bounded server-side.

**P6 (S6, S9):**
- **`deliveryAccept`:** move into `runTransaction`, and accept only when:
  - `status ∈ {searching, pending, open, requested}` (whatever the existing creators use; verified at implementation);
  - `!driverId`;
  - `assignmentStatus ≠ 'assigned'`;
  - `auth.uid ≠ customerId`.
  - Re-accept by the same driver is idempotent, returning the existing token without resetting state.
- **`deliveryGenerateToken` pickup:** only while `status ∈ {accepted, pickup_pending, awaiting_pickup}`.
- **Rules:** `driverId → null` only by the customer or current driver, and only before pickup.
- **S9:** auto-release skips orders that have a linked ride (`rideRequestId`/`deliveryId`, or `ride_requests.orderId`) with an accepted driver that is not yet completed. Delivery completion then pays seller + carrier. Otherwise the current behaviour stays.

---

## G. PHASE 2 TEST MATRIX (proposed; to be added to `tools/test_phase1_security.mjs` style, emulator only)

| # | Scenario | Actor | Expected after patch | Current (audit) |
|---|---|---|---|---|
| T1 | Forged status `held`/`shipped` on unpaid order → release/auto-release | buyer/seller | denied, 0 paid | 0 paid ✅ (S8/Phase 1) |
| T2 | Forged `completed` by buyer | buyer | rules 403; release still possible | 200, payout blocked ❌ S3a |
| T3 | Seller flips `disputed → shipped` + backdated `shippedAt` | seller | rules 403; auto-release skips | paid ❌ S2 |
| T4 | Buyer edits `amount` after payment | buyer | rules 403 | 200, DoS ❌ S3b |
| T5 | Forged fare by stranger / buyer / driver after accept | any | rules 403; payout uses `agreedFare` | escrow drained ❌ S1 |
| T6 | Buyer performs "seller handover" on product-order ride | buyer | permission-denied | allowed ❌ S1b |
| T7 | Wrong buyer calls `escrowRelease` | other user | permission-denied | ✅ Phase 1 |
| T8 | Wrong seller (sellerId swap) | party | rules 403 / seller_mismatch | ✅ S8 |
| T9 | Wrong driver / third party calls `deliveryComplete` | stranger | permission-denied | ✅ Phase 1 |
| T10 | Stale / wrong / used Token C, PK, TR | driver | failed-precondition | ✅ Phase 1 + rate-limit |
| T11 | Replay `deliveryComplete`, `escrowRelease`, auto-release | any | single payout | ✅ S8 |
| T12 | Double `deliveryAccept` by the same driver | driver | idempotent, no state reset | resets ❌ S6 |
| T13 | Concurrent `deliveryAccept` by 2 drivers | 2 drivers | exactly one ok | both ok ❌ S6c |
| T14 | Accept on in-custody / completed / cancelled ride | stranger | failed-precondition | allowed ❌ S6a/b |
| T15 | Stranger writes ride `status`/`driverId` | stranger | rules 403 | 200 ❌ S6d |
| T16 | Concurrent double completion | driver + receiver | one payout | ✅ S8 |
| T17 | Dispute + auto-release race (disputed order) | seller/system | not released | released ❌ S2 |
| T18 | Admin dispute on already-released order | admin | rejected | double pay ❌ S5 |
| T19 | Admin dispute amount > hold / split sum > hold | admin | rejected | allowed ❌ S5 |
| T20 | Refund then auto-release / buyer release | system/buyer | no second payout | ✅ (Phase 1 patch) |
| T21 | Negotiation `CONFIRM_RECEIPT` pays seller once | buyer | seller paid, hold released | unpaid ❌ S4 |
| T22 | Negotiation actions on unpaid (forged paid) order | seller | failed-precondition | allowed ❌ S7 |
| T23 | Auto-release on order with active delivery | system | skipped until delivery completes | seller 100 %, driver 0 ❌ S9 |
| T24 | **Legit** buyer→seller (PesaPal → held → shipped → buyer confirm) | buyer | seller = amount − fee | ✅ |
| T25 | **Legit** seller→driver (product order + ride, real seller handover, Token C) | seller, driver, buyer | driver = agreedFare, seller = rest | ✅ today, must stay ✅ |
| T26 | **Legit** admin refund (disputed, unreleased hold) + split refund | admin | buyer/seller paid ≤ hold, hold consumed | ✅, must stay ✅ |
| T27 | **Legit** link flows (wallet/PesaPal, manual + auto) | buyer/system | unchanged | ✅ Phase 1 |
| T28 | Existing client writes still allowed (shipped, disputed, delivery linkage, paymentRef, stage fields) | parties | 200 | regression guard |

---

## H. GIT STATUS / DIFF SUMMARY

```
$ git status
On branch main
nothing to commit, working tree clean
$ git log -1 --oneline
b5be2cc Phase 1: server-side money-path security (R1/R2/R4/R5, H2/H3)
$ git diff --stat            (working tree vs HEAD)
(empty)
$ git diff --stat b5be2cc afdfe61   (local vs GitHub main)
 PHASE1-PACKAGE-INFO.md | 34 ++++++++++++++++++++++++++++++++++
```

The code audited equals GitHub `afdfe61`.

---

## I. CONFIRMATION

- **No repository file was modified.** `git status` is clean and `git diff` is empty.
- No commit, no push, no deploy (functions or rules).
- **Installs:** only ignored dependency directories (`functions/node_modules`, `node_modules`) and `/tmp/fbt` (firebase-tools 13.35.1), all needed to run the emulator.
- **Created outside the repo:**
  - `/home/user/SokoHai-PHASE2-AUDIT.md` (this report);
  - `/home/user/SokoHai-phase2-audit/poc_phase2_audit.mjs`, a copy of the emulator PoC that was run from `/tmp`.
- No Phase 3 work was done. Nothing was touched in UI, ads, ChatHai or GuardHai.

**STOPPED. Waiting for your approval before implementing P1–P6.**
