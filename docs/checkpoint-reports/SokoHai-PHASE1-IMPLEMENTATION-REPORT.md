# PHASE 1 IMPLEMENTATION REPORT — SokoHai money-path security

- **Repo:** `~/SokoHai-phase1` (github.com/ramadhancripto/SokoHai)
- **Commit before:** `aaf50a0`
- **State:** all changes are uncommitted in the working tree. Nothing was committed, pushed or deployed.
- **Scope:** Phase 1 only. No Phase 2 canonicalization and no Phase 3 cleanup.

**Goal:** no browser, client or user can create, modify, release or receive money unless the server has authorized it and verified the payment.

**How it works now.** The server records proof of payment in a new server-only collection, `escrow_holds`:
- `order_<id>` / `link_<id>`: payment for one order or link, verified by PesaPal or taken from the wallet by the server.
- `pptx_<trackingId>`: how much of one PesaPal payment has been used, so the same payment can't fund two things.
- `ppinit_<merchantRef>`: which user started the PesaPal payment.

Money is paid out only through the existing release functions. They check this proof, check that the amount matches, and release each proof only once. They still use the same wallet (`users.walletBalance`) and the same `wallet_ledger`; there is no second wallet system.

---

## 1. Files changed

| File | Change | Reason |
|---|---|---|
| `functions/index.js` (+740 / −272) | • `isAdmin`: an admin email must be verified.<br>• New helpers for the payment proof: `ppVerifyTransaction`, `ppTxFromStatus`, `ppInitiatorUid`, `settlePesaPalPayment`, `getEscrowEvidence`, `evidenceError`, `userDocFor`, money helpers.<br>• `walletAdjust`: now checks who may do what.<br>• `escrowRelease` and `haipayReleaseLink` now use shared release functions `releaseOrderEscrow` and `releaseLinkEscrow`.<br>• New `sokopayLinkWalletPay`.<br>• `pesapalCheckout` records who started the payment.<br>• `pesapalTransactionStatus` and `pesapalIpn` record the verified payment against the order or link.<br>• `sokopayAutoRelease` needs proof of payment.<br>• `deliveryComplete` checks the custody chain and pays only from escrow.<br>• Removed `creditWallet`, which was no longer used. | R1, R2, R4, R5 |
| `firestore.rules` (+81 / −17) | • `sokopay_links`: only the server can set payment status; delete is never allowed.<br>• `ride_requests` create: the customer must be the signed-in user, and server-only custody and payout fields are rejected.<br>• `ride_requests` update: `customerId`, `orderId` and `payoutStatus` can't be changed.<br>• **Syntax-only fixes** (explained below the table). | R4, R5; lets the rules compile and deploy |
| `functions/local-server.js` (+97 / −33) | • Listens on `127.0.0.1` by default; LAN access needs `SKH_HOST`, and a warning is shown.<br>• Schedules are off by default: `SKH_RUN_SCHEDULES=1` turns them on, and running them against production also needs `SKH_ALLOW_PROD_SCHEDULES=1` (big warning).<br>• Works with the Firebase Emulator without credentials.<br>• Falls back to Google ADC; the service-account file option is kept.<br>• Prints only the credential type, never its contents. | H2, H3, Auth |
| `LOCAL-SERVER-MWONGOZO.md` (+36 / −12) | Documents the emulator, ADC, the key fallback, `SKH_HOST` and the schedule opt-ins. | H2, H3, Auth |
| `js/16-wallet.js` (+5 / −1) | Sends `orderTrackingId`, `purpose` and `memberUid` to `walletAdjust`. | R1 (existing deposit and commission flows keep working) |
| `js/17-pesapal-return.js` (+23 / −4) | • Deposit and commission calls pass the PesaPal tracking id.<br>• A SokoPay link paid by PesaPal is only claimed by the browser (`buyerId`, `transactionId`); it is not set to `held`.<br>• After a successful return, the page asks the server to record the payment. | R1, R4 |
| `js/app/17-hub.js` (+10 / −15) | Paying a link from the wallet now calls `sokopayLinkWalletPay` (one atomic server step). Before, the browser debited the wallet and then set the link to `held` itself. | R4 |
| `firebase.json` (+6) | Added an `emulators` block (firestore 8085, auth 9099, UI off). Without it the auth emulator won't start. It does not affect deploys. | Tests |
| `package.json` (+2) | Added `test:security` and `test:security:emulator`. | Tests |
| `tools/test_phase1_security.mjs` (new, 567 lines) | Security test suite; runs on the emulator only. | Tests |

**Syntax-only fixes in `firestore.rules`.** At `aaf50a0` the whole rules file failed to compile, and this has been true since the first commit. Three syntax errors:
- `chatBlocks/$(a)__$(b)` became `$(a + '__' + b)`.
- An `if` inside `negoActorOk` became a ternary.
- Unquoted map keys in `negoNext` were quoted.

The meaning of the negotiation and chat rules did not change. Without these fixes, none of the Phase 1 rules could be deployed or tested.

---

## 2. Security fixes

### R1 — `walletAdjust`
- **Before:**
  - Any signed-in user could credit or debit **any** wallet, including their own, by any amount.
  - The ledger key came from the client.
- **After:**
  - **Admin** (custom claim `admin`, or an `ADMIN_EMAILS` address that is verified) can change any wallet, up to a cap of 50M.
  - **Non-admin** users can only touch their own wallet:
    - **Debits** are allowed if the balance covers them. Their ledger key is prefixed `u_<uid>_…`, so a user can't take over server keys like `order_*_released`.
    - **Deposit credits** need a PesaPal payment that is confirmed paid, has the same amount, and was started by this same user. Each payment can be used once (`pesapal_deposit_<tid>` plus the usage record).
    - **Commission credits** (`offline_registration`) need exactly 1,260 TSh, a PesaPal fee of at least 2,100, and a member registered through this agent. Each member pays commission once.
    - **Every other self-credit is denied.**
- **Tests:** 11 (self-credit of 5 types, other user's wallet credit/debit, own debit, overdraft, deposit without/unpaid/failed/wrong-amount/someone else's payment, legit deposit and replay, commission legit/other agent's member/wrong amount/unpaid fee, admin and unverified admin email, cap, no login).
- **Result:** **PASS**.
  - Baseline at `aaf50a0`: the same tests FAIL. For example, `alice` credited herself 100,000 and credited `bob`.

### R2 — `escrowRelease`
- **Before:**
  - Anyone could call it. Only the client-writable order status was checked.
  - A client-created order with `status: 'held'` and buyer = seller could be released, creating money from nothing.
  - (Baseline also showed the function crashed on real calls: *"transactions require all reads before writes"*.)
- **After:**
  - Only the order's **buyer** (read from server data) or an **admin** can call it.
  - Needs proof of payment in `escrow_holds`. If there is none, the server re-checks with PesaPal.
  - The order amount must equal the paid amount.
  - Buyer and seller must match the proof, and buyer ≠ seller.
  - The paid amount can't be spent twice across orders.
  - Released once (proof marked released, plus a ledger marker). Setting the status back to `held` doesn't pay again.
  - A carrier is paid only for a linked ride the server has accepted and that carried the goods.
- **Tests:** 9 (forged `held`, self-trade, missing order, third party, seller self-release, forged order using someone else's payment, order bigger than the payment, amount changed after verification, seller changed after verification, legit release plus replay plus status reset, admin release).
- **Result:** **PASS**.

### R4 — SokoPay links and auto-release
- **Before:**
  - Any signed-in user could write any link. The browser set `status: 'held'` and `paidAt`.
  - `sokopayAutoRelease` paid out any link that had been `held` for 24 hours, and any order `shipped` for 24 hours, with no payment check.
- **After:**
  - **Rules:** only the server writes `held`, `paidAt`, `paymentVerified` and similar fields.
    - The seller creates a `pending` link and can edit it while it's pending.
    - A buyer can claim a pending link (`buyerId` and `transactionId` only; no money moves).
    - Either party can open a dispute on a held link.
    - Delete is never allowed.
  - **PesaPal:** the status check and the IPN confirm the payment with PesaPal, then record it against the order or link. The amount is capped at what was paid, and the payer must be the user who started the payment.
  - **Wallet payment:** `sokopayLinkWalletPay` does the debit, the proof and `held` in one atomic step.
  - **Release:** buyer or admin only; needs proof, the same amount, the same buyer and seller, and happens once.
  - **Auto-release:** needs proof. The 24 hours are counted from when the **server** verified the payment as well as from the client time, so pushing a client date back doesn't speed up payout. It uses the same release functions.
- **Tests:** 8 (fake paid link via manual and auto release, fake shipped order via auto release, legit PesaPal link with seller/third-party denied then buyer releases once, amount changed, buyer changed, seller changed, underpayment, wallet payment atomic/replay/second payer/seller/price changed, auto-release 24h from server time).
- **Result:** **PASS**.

### R5 — `deliveryComplete`
- **Before:**
  - A ride created by the browser, with any driver, price and status and no delivery token, went straight to `creditWallet(driverId, price)`. Money was created from nothing.
- **After:**
  - The ride must have `acceptedAt` and custody stage `transit`. Both are server-only fields, now also blocked when the browser creates a ride.
  - Only the current holder of the goods or the receiver may call it.
  - If the caller isn't the receiver, **Token C (DL) is required**. It is checked against its hash, with the existing limit on attempts.
  - Payout comes **only** from the linked order's verified escrow, through `releaseOrderEscrow`. The order's buyer must be the ride's customer. The driver's share is capped by the escrow.
  - With no funded order: `payoutStatus: 'unfunded'`, payout 0.
- **Tests:** 7 (fake ride without server custody, third party / other driver / seller, missing and forged token and driver without an issued Token C, legit payout of 3,000 to the driver and 17,000 to the seller paid once, huge ride price with no order gives 0, huge price with an order stays within escrow, ride pointing at another customer's order gives nothing).
- **Result:** **PASS**.

### Rules (tested as a browser, through the emulator REST API with real ID tokens)
- `sokopay_links`: create as `held`, create as another user, seller or buyer setting `held`, seller changing the buyer, and delete are all denied. Legit create, the buyer's claim and the seller's edit are allowed.
- `ride_requests`: create with another user's `customerId`, with `in_transit`, `acceptedAt`, `custodyStage`, a token hash or an issued token status is denied. Updating `orderId`, `customerId` or `custodyStage` is denied. A legit create and a normal update are allowed.
- Browser writes to `wallet_ledger` and `escrow_holds`, and reads of `escrow_holds`, are denied.
- **Result:** 3/3 **PASS**.

### H2 — local server network binding
- **Before:** listened on `0.0.0.0`, so anyone on the LAN could reach functions running with full Admin SDK access.
- **After:** listens on `127.0.0.1` by default. `SKH_HOST=0.0.0.0` is an explicit, documented opt-in with a warning.
- **Tests:** the default log shows `127.0.0.1`; localhost can connect and the LAN address (169.254.0.21) can't; the opt-in shows the warning.
- **Result:** **PASS**.

### H3 — local server schedules
- **Before:** schedules, including `sokopayAutoRelease` (which pays out), ran against PRODUCTION by default.
- **After:**
  - Off by default.
  - `SKH_RUN_SCHEDULES=1` turns them on for the emulator.
  - Against production they also need `SKH_ALLOW_PROD_SCHEDULES=1`, and a big warning is shown.
  - Otherwise the server refuses with a warning.
  - The key's contents are never printed.
- **Tests:** 2.
- **Result:** **PASS**.

### Auth
The local server tries, in order: the emulator (no credentials), then a service-account file (the old paths, kept), then Google ADC (`gcloud auth application-default login` + `set-quota-project`). `SKH_SERVICE_ACCOUNT_ID` is optional and only needed for `createCustomToken`.
- **Emulator mode:** **PASS**.
- **ADC against the real project:** **NOT TESTED** (no credentials in the sandbox, as agreed).

---

## 3. Tests

| Test | Result |
|---|---|
| `tools/test_phase1_security.mjs` (emulator; `npm run test:security:emulator`) | **42 passed, 0 failed** |
| Same suite against the `aaf50a0` code (baseline) | Exploits **succeed** (most R1/R2/R4/R5 cases FAIL), which shows the tests catch the bugs |
| `tools/test_local_functions_server.mjs` | **12/12 PASS** |
| 39 tests in the `npm test` chain | **PASS** |
| Ads tests: `test_ads_governance` 12, `test_ads_delivery_engine` 40/40, `test_ads_local_delivery_regression` 24, `test_unified_ad_designer` 146, `test_ad_card_visual` 19/19, `test_noncanvas_ad_designer` 56, `test_creative_system`, `test_creator_studio_upgrade` | **PASS** |
| `test_chat_authority_contract.mjs` | **FAIL — pre-existing.** It also fails at `aaf50a0` (stale `fonts/` copy). Because of it, `npm test` as a whole still stops at this step. |
| `test_studio_media_design.mjs` | **FAIL — pre-existing** (`/shared/ads-design-rules.js` import; not part of `npm test`) |
| `python3 tools/build_html.py check` | **PASS** (byte-exact) |
| Firestore rules compile (emulator) | **PASS.** At `aaf50a0`: **FAIL**, the file did not compile |
| Real PesaPal (sandbox or live), a real browser, production Firestore | **NOT TESTED.** PesaPal was stubbed at the network layer, the sandbox has no browser, and production was never touched |

---

## 4. Preserved

- **PesaPal confirmation:** still `GetTransactionStatus` on the server (IPN and status call). It is now also the only thing that records a payment as proof. Client claims are never trusted.
- **Negotiation:** server logic untouched. The rules keep the same meaning; only syntax was fixed so they compile.
- **Delivery token chain (PK → TR → DL):** untouched. `deliveryComplete` now *requires* it; token issuing and custody functions are unchanged.
- **Chat permissions:** unchanged (the `isBlockedPair` syntax fix keeps the same meaning).
- **Ads (renderer, publishing, delivery):** untouched; all ads tests pass.
- **Wallet flows:**
  - Deposit, agent commission, wallet purchase of a link, buyer release, admin dispute resolution and refunds still work, using the same `users.walletBalance` and `wallet_ledger`.
  - Old client fallbacks (`04-orders-escrow` client split, `14-map` client cron, `21-sokopay` direct release) only run when `WALLET_VIA_SERVER` or `CRON_VIA_SERVER` is false. Both are `true` in `00-config.js`.
  - If those fallbacks are switched back on, the server now correctly rejects their self-credits.

---

## 5. Remaining issues (listed, not fixed)

**Phase 2:**
- `orders` rules are still open: any signed-in user can create or update orders. Money is safe because release needs server proof, but order data can still be forged or edited.
- The admin check in the rules doesn't check `email_verified` (the server check now does).
- **Carrier fare:** the driver's share comes from the ride's `fare`/`price`, which the client sets. It is capped by the escrow, but a buyer and driver working together could shift money away from the seller. Needs a server-quoted fare.
- `deliveryAccept`: no transaction and no role check; a completed or cancelled ride can be claimed again (audit N1).
- **Buyer-claim race on a pending link:** another user could claim `buyerId`/`transactionId` first. Now mostly mitigated because the payer must be the user who started the payment, but payments made before this change have no such record.
- Group-order wallet writes are broken (these are browser-side wallet writes).
- `walletAdjust` doesn't restrict which *types* a user may use for their own debits.
- `negotiationOrderAction` still accepts the client-set `held`/`paymentStatus` as proof of payment.
- **Canonicalization:** about 8 places create orders, 3 escrow payout paths remain in client fallbacks, and there are duplicate globals.

**Operations:**
- **Deploy:** none of these fixes protect production until they are deployed.
  - Functions need Blaze, or the local server.
  - Rules can be deployed on Spark with `firebase deploy --only firestore:rules`.
- **Test before deploying the rules:** because the old file never compiled, we don't know what rules production is running now, so deploying the new file changes behavior everywhere.
- **Node 20** goes out of service on Cloud Functions on **2026-10-30**. The runtime was deliberately not changed; move to nodejs22 or 24 as a follow-up.
- **Minor behavior change:** auto-release notification text and the `adminRevenue` type now come from the shared release path.
- Existing held links or orders **without** server proof (created before this change) can't be released automatically. An admin has to check them, or the IPN or a status re-check has to record them.

---

## 6. Git diff summary

```
 LOCAL-SERVER-MWONGOZO.md  |   48 ++-
 firebase.json             |    6 +
 firestore.rules           |   98 ++++-
 functions/index.js        | 1012 ++++++++++++++-------
 functions/local-server.js |  130 ++-
 js/16-wallet.js           |    6 +-
 js/17-pesapal-return.js   |   27 +-
 js/app/17-hub.js          |   25 +-
 package.json              |    2 +
 9 files changed, 1000 insertions(+), 354 deletions(-)
 ?? tools/test_phase1_security.mjs  (new, 567 lines)
```

- **Unrelated or suspicious changes:** none.
  - Every change in `index.js` is in `isAdmin`, the payment helpers, `walletAdjust`, `escrowRelease`, `haipayReleaseLink`, `sokopayLinkWalletPay`, `pesapalCheckout`, `pesapalTransactionStatus`, `pesapalIpn`, the auto-release, `deliveryComplete`, or the removal of `creditWallet`.
  - The `firebase.json` change is an emulator block only.
  - The syntax-only rules fixes are listed in §1.
- `git diff --check` is clean. No secrets or keys are in the diff.
- **Not committed, not pushed, not deployed.**

**STOP.** Waiting for approval before Phase 2.
