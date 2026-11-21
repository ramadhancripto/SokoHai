# SokoHuru: phased launch scope and security hardening (2026-11-21)

| | |
|---|---|
| Branch | `feature/sokohuru-launch-20261121` (local, **not committed, not pushed**) |
| Base | `d8cba09` + server remediation v2 + recycle-bin fix (same tree as the two earlier patches) |
| Production | **untouched**: no deploy, no commit, no push, no production data written, no payment initiated |
| Status | **CODE READY FOR OWNER REVIEW**. Activation needs the owner steps in §9. |

## 1. Launch scope and feature status

**What enforces the switch.** All three places read the same switch, the Firestore document `system/launch`. Only a super admin can write it.

- **Firestore rules** (`firestore.rules`): the main control in production today.
- **Server** (`functions/launch-gates.js`): becomes effective once Cloud Functions are deployed.
- **Browser** (`js/app/129-launch-scope.js`): keeps the interface honest. It is not a security control.

| Feature | Status | Enforced by |
|---|---|---|
| Registration, sign-in | **Active now** | unchanged |
| Public browsing (Home feed, Bidhaa, product page) | **Active now** | rules `products` read = public |
| Search | **Active now**, with a limitation | Local search works on loaded listings. The server keyword index (`searchTokens`) is written by a Cloud Function, so new listings join it only after Functions are deployed. |
| Free product posting (photos, description, price, condition, location) | **Active now**, no posting fee | rules: signed-in, own `userId`, no badges, no boost, no private keys, stock starts 0 |
| Seller edit / archive / restore / Recycle Bin | **Active now** | rules: owner only, no ownership change |
| Buyer → seller contact | **Active now** through chat (by user id) | unchanged chat rules. Listings no longer carry the seller e-mail. |
| Report a listing | **Active now** (new) | rules `listing_reports`: one report per user per listing |
| Admin moderation (hide / restore) | **Active now** | Server `adminModerateListing` when deployed. Until then, a browser fallback with an append-only audit record in the same write (rules `moderationAuditOk`). |
| Paid promotions / boosts, manual verification | **Prepared but not yet activated** (`promotionsManual` off; no payment channel configured) | rules `promotion_requests` + `promotion_payment_refs` + audit |
| Featured / homepage-sponsored placements | **Prepared but not yet activated** | The package `kind` is stored on the listing (`boostPlacement`). The current feed ranks every active boost the same way and shows the **"Boosted"** badge. A separate homepage slot is not built. |
| Server-side launch gates (48 callables, 5 schedules) | **Prepared but not yet activated** (Functions not deployed) | `functions/launch-gates.js` |
| Auction (incl. live auction) | **Disabled until future infrastructure** | rules (saleMode), server, UI |
| Price Drop | **Disabled until future infrastructure** | rules (saleMode), server, UI |
| Group Buy / Group Soko pooling | **Disabled until future infrastructure** | rules (saleMode), server, UI |
| Wallet deposits / withdrawals | **Disabled until future infrastructure** | rules (server-only ledger), server, UI |
| Escrow / SokoPay links / payment release / disputes | **Disabled until future infrastructure** | rules (`sokopay_*` creates), server, UI |
| Checkout / orders / PesaPal checkout | **Disabled until future infrastructure** | rules (`orders`, `smart_cart_checkouts`), server, UI |
| Delivery booking, driver assignment, transport settlement | **Disabled until future infrastructure** | rules (`ride_requests`, `logistics_assignments`, `shipments`), server, UI |
| PesaPal-paid boost / subscription / agent fee (`entitlementGrant`) | **Disabled until future infrastructure** | server `paidEntitlements` gate, UI |

No code, collection, UI module, test or data was deleted. Every disabled feature comes back by switching one flag in `system/launch`.

## 2. Revenue and promotion workflow (manual verification)

There is no posting fee. Revenue comes from paid promotions.

1. The owner defines packages in `system/promotion_packages`, for example `{ packages: { boost3: { active: true, kind: 'boost', amount: 5000, days: 3, label: 'Siku 3' } } }`. Only a super admin can write it.
2. The owner fills `SOKOHAI_CONFIG.LAUNCH.promotionPayment` with the **public** payee name and till / pay-bill numbers. No credentials, no keys. Until this is filled, the seller sees "Malipo ya matangazo bado hayajafunguliwa" and **no request is created**.
3. The seller opens **Tangaza** on their own listing (or the Boost button) and picks a package. The browser creates `promotion_requests/PRM-XXXXXXXXXX` with status `pending`. Rules require:
   - `reference` equals the document id (immutable);
   - `amount`, `days` and `kind` exactly match an **active** package;
   - currency `TZS`;
   - the requester owns the listing;
   - no `paid`, `verified` or `active` field.
4. The seller pays through the approved channel and quotes the reference.
5. An admin checks the payment in the **provider's official records**. A screenshot is not proof. In **Kituo cha Udhibiti → Matangazo**, the admin selects the provider, types the transaction id and confirms.
6. **One atomic write** does all of the following. If any part fails, nothing is written.
   - The request goes `pending → active`, with `paymentRef`, `paymentProvider`, `verifiedBy` (= the admin), `verifiedAt`, `activatedAt` and `expiresAt`.
   - The document `promotion_payment_refs/{provider}_{ref}` is created. Rules allow **create only**: no update, no delete. The same transaction id can never activate a second request (duplicate and replay protection).
   - `admin_audit_log/promo_{id}_activate` is written. It is append-only.
   - On the listing, `isBoosted`, `boostDays` (= the paid days), `boostedAt` (= `activatedAt`), `boostExpiresAt`, `boostPaidRef` (= the request id) and `boostPlacement` are set. The rule `promoBoostOk` re-reads the request **after** the write and checks the match.
7. **Reject:** status `rejected`, plus a reason (at least 5 characters) and an audit record.
8. **Expiry:** `boostEligibility()` stops placement at `boostExpiresAt`. The listing then shows as a normal listing.

Clients can never write paid, verified, activation or audit fields. The seller cannot boost, extend or fake a reference. An ordinary admin cannot change prices or flags. PesaPal / SokoPay automatic processing stays **off** (`paidEntitlements: false`, server gate) until its server integration is deployed and verified.

## 3. Files changed for this phase

| File | Change |
|---|---|
| `firestore.rules` | Launch helpers:<br>• `launchOff` / `launchOn` / `saleModeAllowed` / `productPrivateKeys` / `launchUpdateOk` / `promoBoostOk` / `moderationAuditOk` / `promoPackage`;<br>• product create/update gates;<br>• `system/launch` and `system/promotion_packages` for super admin only;<br>• checkout, escrow and delivery creates gated;<br>• browser `admin_audit_log` create for `mod_*` / `promo_*` only;<br>• new `listing_reports`, `promotion_requests`, `promotion_payment_refs`. |
| `functions/launch-gates.js` (new) | Wraps 48 callables and 5 schedules. The original handler runs unchanged when the feature is on; otherwise the callable returns `FEATURE_DISABLED`. |
| `functions/index.js` | One line at the end: `require('./launch-gates').applyLaunchGates(exports)`. |
| `js/00-config.js` | `LAUNCH` browser defaults: all payment features false, `promotionsManual` false, empty `promotionPayment`. |
| `js/app/129-launch-scope.js` (new) | • Guards 48 global entry points, plus the Boost button and the sale-type chooser, with a Swahili message.<br>• Refuses gated callables before any network call.<br>• Hides the auction / price-drop / group-buy options and chooser cards.<br>• "Ripoti" button and sheet.<br>• Seller promotion sheet.<br>• Admin reports and promotions panel.<br>• Browser moderation fallback. |
| `js/app/98-admin-control-center.js` | The Matangazo tab shows the reports and promotions panel. Hide/restore falls back to the audited browser path when the server is missing or unreachable. |
| `js/app/39-product-core.js` | `productEligible` also excludes `adminHidden` / `moderationStatus: removed` (finding F-04). |
| `js/app/00-bootstrap.js` | Product writes no longer include `userEmail`. |
| `js/app/15-pos-sales.js` | POS product writes no longer include `userEmail`. |
| `js/app/07-product.js` | Legacy chat attachment sends now address the seller by uid (`senderUid` / `receiverUid`). They used to fail the chat rules. |
| `html/21-scripts.html`, `index.html` | Load `129-launch-scope.js`. `build_html check` is byte-exact. |
| `package.json` | Both new emulator suites added to `test:security:all:emulator` and `test:ci:emulator`. |
| `tools/test_sokohuru_launch_rules_emulator.mjs` (new) | 80 rules assertions. |
| `tools/test_sokohuru_launch_gates_emulator.mjs` (new) | 19 server-gate assertions. |
| `tools/test_sokohuru_launch_browser.mjs` (new) | 25 real-app assertions. |
| `tools/sokohuru_strip_product_private_fields.mjs` (new) | **Owner-run only.** Dry run by default; removes e-mail and phone keys from existing public listings. |

## 4. Firestore rules changes and reasoning

**Feature switch.**

- `launchOff(f)` is true only when `system/launch` exists and `f == false`. A missing document keeps today's behaviour. That is why production **must** get the document (§9). Existing suites and staging keep working without it.
- `launchOn(f)` is opt-in: paid promotions are on only when the flag is explicitly true.

**Product create.** In addition to the existing checks:

- `saleModeAllowed`: no auction, price drop or group buy while they are off;
- no private keys (`userEmail`, `sellerEmail`, `ownerEmail`, `email`, `ownerPhone`, `sellerPhone`, `phone`, `phoneNumber`, `whatsapp`). The listing is public, and contact goes through chat;
- unchanged: no boost or moderation keys, no trust badges, stock 0 with server opening stock, own `userId`.

**Product update (`launchUpdateOk`).**

- One `diff()` for all launch checks, because the 1000-expression budget was hit with separate diffs on listings with large `searchTokens`. The existing search-index suite found it.
- Checks:
  - the sale mode can change only to an allowed mode;
  - no private key may be added (legacy keys that are left unchanged are fine, so old listings stay editable);
  - any boost change needs an active, matching promotion request (applies to admins too);
  - any `adminHidden` / `moderationStatus` change needs an audit record written in the same request.
- Ownership, trust-badge, stock, archive and Recycle Bin rules are unchanged.

**`system/launch` and `system/promotion_packages`.** Super admin only. An ordinary admin and every user are refused. They are readable when signed in, so the browser can follow the switch.

**Creates that move money or book delivery** (`orders`, `smart_cart_checkouts`, `sokopay_links`, `sokopay_core_transactions`, `sokopay_tokens`, `logistics_assignments`, `shipments`, `ride_requests`) are refused while the matching feature is off. The wallet ledger, withdrawals and escrow holds were already server-only.

**`admin_audit_log`.** Still append-only. A browser admin may create **only** `mod_*` / `promo_*` records that carry:

- its own uid;
- `via: 'browser'`;
- one of four actions;
- a reason.

**`listing_reports`.**

- Document id = `productId_uid`, so there is one report per user per listing.
- Fixed fields only. Reason from a fixed list; note at most 500 characters; status `open`.
- The reported seller cannot read it. Only an admin resolves it.

**`promotion_requests` / `promotion_payment_refs`.** See §2. The payment-reference document is the uniqueness lock: create only, admin only, must match the request's provider + reference and amount after the write.

## 5. Security findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| F-01 (SEC-01) | **Critical** | The production project still runs older rules that let **anonymous** visitors read private collections (found in the read-only audit). | Fixed in the repository rules. **Owner:** deploy the rules (§9). |
| F-02 | **High** | Existing public listings in production carry seller e-mail / phone. The read-only audit counted `userEmail`, `ownerPhone` and `sellerPhone` keys in `products`. | New writes are blocked by rules and client. **Owner:** run `tools/sokohuru_strip_product_private_fields.mjs`: dry run, then `--apply` after a backup. |
| F-03 | **High** | `entitlementGrant` grants boosts and subscriptions **free** when the payment gate is off. This would be a free-promotion loophole once Functions are deployed. | Gated (`paidEntitlements: false`). The browser Boost button now goes to the manual workflow. |
| F-04 | **High** | `productEligible()` did not exclude listings hidden by moderation, so a moderated listing could stay on the Home feed. | Fixed. A test proves a hidden listing is not eligible. |
| F-05 | **Medium** | Payment-dependent features were hidden only in parts of the UI. Direct calls (console, old links) reached the rules or server. | Rules + server gates + browser guards. Tests show direct writes and calls refused. |
| F-06 | **Medium** | Unsigned Cloudinary upload preset (earlier audit): anyone holding it can upload. | Not changed. **Owner:** signed uploads (`upload-signing.js`, needs Functions), or restrict the preset in Cloudinary and enable moderation and size limits. |
| F-07 | **Medium** | No rate limit on listing creation or reports (Firestore rules cannot count). | Reports are de-duplicated per user and listing. Listing spam is handled by reports + moderation. **Next:** App Check enforce + a server counter once Functions run. Legitimate sellers are not limited. |
| F-08 | **Low** | `firestore.rules isAdmin()` still names the owner's e-mail as a fallback admin (the server no longer does). | By design until custom claims are set. **Owner:** set the `superAdmin` claim, then remove the fallback. |
| F-09 | **Low** | Legacy chat attachment sends (voice / file in the product chat) always failed the chat rules (no `senderUid`). | Fixed: they are addressed by uid. |
| F-10 | **Info** | Opening stock is written by the server (`inventoryAdjust`). Without deployed Functions, a new listing is visible but its stock stays "pending". | Known dependency. Listing visibility does not depend on it. |

## 6. Test results

All runs are on the local emulator (`demo-sokohai`), never production.

| Suite | Result |
|---|---|
| `npm test` (117 commands) | **117 / 117 pass** |
| Emulator security suites (`test:security:all:emulator` list + product-remove), 44 suites | **44 / 44 pass**. This includes all earlier suites: phase 1–3, repair rules (139), commerce modes, auction / price drop / group buy, ride privacy, recycle bin, G-1…G-6, search index (14 / 14). |
| New: SokoHuru rules | **80 / 80** |
| New: SokoHuru server gates | **19 / 19**: 48 callables answer `FEATURE_DISABLED`, 5 schedules skipped, 155 callables still exported and labelled, marketplace callables not gated, switch-on runs the original handler. |
| New: SokoHuru browser (real app) | **25 / 25** |
| Browser suites (`tools/*browser*.mjs`, 39) | **39 / 39 pass** |
| Negative control | The new rules test **fails on the previous rules** at "listing with userEmail refused". |

**Failures met during the work, all fixed.**

1. The search-index suite failed: the expression budget was hit by separate `diff()` calls. Fixed with a single `diff` (`launchUpdateOk`).
2. The new rules test reused a fixed transaction id between runs, and the anti-replay lock (correctly) refused it. The test now uses a unique id per run.
3. The new browser test needed the auth emulator variable by default.

No existing test was weakened, skipped or deleted.

## 7. Free listing and browsing: confirmation

The browser test, using the real app and the real write path `skh.saveData('products', …)`, shows:

- a signed-out visitor sees a published listing on the Home feed;
- a seller posts a listing with no fee and no payment step;
- the stored document has the seller's `userId` and **no e-mail or phone**;
- it is readable without signing in;
- the seller cannot boost it from the browser;
- a buyer reports a listing once, and a second report and a self-report are refused.

The rules suite also shows:

- owner edit, archive and restore work;
- another seller is refused;
- ownership change, self-verification, self-inspection, fake stock and fake boost reference are refused;
- legacy listings stay editable.

## 8. Payment features: confirmation that they are safely disabled

- **Rules:** with `system/launch` all false, every money and delivery create is refused. Control tests show the same records are accepted when the owner switches a feature on, which proves the switch is what refuses them.
- **Server:** every gated callable is refused before its handler runs, and the refused wallet calls wrote nothing. Schedules are skipped.
- **Browser:** these entry points are guarded and show "… haijawashwa kwenye SokoHuru kwa sasa":
  - checkout, SokoPay, bids, group buy, price drop;
  - withdrawal, deposit;
  - ride booking, transport booking;
  - boost payment, subscription.

  Sale-mode options are hidden. Gated callables are refused locally.
- **Paid promotions:** off (`promotionsManual: false`, no payment channel). No credential was invented or hard-coded. PesaPal / SokoPay automatic processing stays off. No real payment was made.

## 9. Production deployment commands (for owner review only; not run)

Run in this order. Each step is safe on its own.

**1. Back up first.** The project has no Storage bucket yet, so the owner creates one first.

```
gcloud firestore export gs://<owner-bucket>/pre-sokohuru-20261121 --project sokonet-3b847
```

**2. Deploy the web client** (Netlify). It no longer writes `userEmail`. This works with both the old and the new rules.

```
netlify deploy --prod --dir . --site <production-site-id>
```

Or use the owner's existing Netlify Git deploy after review, merge and push.

**3. Create the switch.** In the Firebase Console → Firestore → collection `system`, create the document `launch` with booleans:

```
auction=false priceDrop=false groupBuy=false wallet=false escrow=false
checkout=false delivery=false paidEntitlements=false promotionsManual=false
```

**4. Deploy the rules.** Step 3 must exist first; without it the payment flows stay open in the rules.

```
firebase deploy --only firestore:rules --project sokonet-3b847
```

**5. Clean existing public listings.**

```
node tools/sokohuru_strip_product_private_fields.mjs --project=sokonet-3b847          # dry run: counts only
node tools/sokohuru_strip_product_private_fields.mjs --project=sokonet-3b847 --apply  # after reviewing the counts
```

**6. Later, when Cloud Functions are deployed** (not requested now): add `SKH_LAUNCH_SCOPE=sokohuru` to the functions environment, then:

```
firebase deploy --only functions --project sokonet-3b847
```

**7. Later, to open paid promotions:**

1. Create `system/promotion_packages`.
2. Fill `LAUNCH.promotionPayment` (public payee and till numbers only).
3. Set `system/launch.promotionsManual=true`.

**Rollback:** set any flag back to false (immediate), or redeploy the previous rules.
