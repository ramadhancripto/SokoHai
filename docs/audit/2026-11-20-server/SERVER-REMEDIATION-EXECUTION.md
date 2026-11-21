# Server remediation: execution record

| | |
|---|---|
| Branch | `remediation/server-20261120` (local, **not pushed**) |
| Base | `d8cba09` (`remediation/final-20261120`, also not pushed); `origin/main` = `fe8b8a3` |
| HEAD | `d8cba09`. **All work is uncommitted** in the working tree, because the owner said "Do not commit unless explicitly instructed". |
| Production | **untouched**: no deploy, no push, no merge, no production data, no real payment |

Status words used below:

- **Fixed + verified**: code changed and a test that runs the code passes.
- **Fixed, not verified**: code changed, no runnable proof yet.
- **Staging**: can only be proven on a deployed Firebase project.
- **Owner**: needs an owner decision or credential.

## 1. Findings SRV-01 … SRV-14

| ID | Finding (audit) | What was done | Status |
|---|---|---|---|
| SRV-01 | All functions return 404 in production (not deployed) | Nothing to fix in code. Deploy plan in SERVER-STAGING-READINESS. | **Owner + Staging** (Blaze billing) |
| SRV-02 | Client cannot tell "not deployed" from "server error" | `fnErrorKind`: unreachable / missing / busy / server (SERVER-ERROR-CONTRACT §2) | **Fixed + verified** (G-4 14/14, resilience 27/27) |
| SRV-03 | Every `internal` was treated as "server down"; raw `INTERNAL` in 80 alerts | Only infrastructure kinds trip the breaker. A server answer clears it. `e.message` = Swahili friendly text. Request id shown for unexpected failures. | **Fixed + verified** (G-4) |
| SRV-04 | Production data drift: 0 `userCards`, products without `searchTokens`, pending opening stock | No code change needed. Backfills proven **idempotent on emulator fixtures** (G-2 §2); order of operations in staging plan §4. | **Fixed + verified (local)**; running them = **Owner + Staging** |
| SRV-05 | `walletAdjust` / `withdrawalRequest` threw plain `Error('USER_MISSING')` → INTERNAL | `HttpsError('failed-precondition','USER_MISSING: …')` | **Fixed + verified** (G-3, including the race) |
| SRV-06 | PesaPal errors all INTERNAL, no timeout | Typed codes `PAYMENTS_NOT_CONFIGURED`, `PAYMENTS_LIVE_BLOCKED`, `PAYMENT_PROVIDER_AUTH`, `PAYMENT_PROVIDER_REJECTED`, `PAYMENT_PROVIDER_UNAVAILABLE`; 15 s `AbortController`; structured `upstream` log | **Fixed + verified** (G-3 mocks). Real sandbox = **Staging**. |
| SRV-07 | `memberAuthenticate` IAM `signBlob` failure → INTERNAL + dangling session | `SIGNING_NOT_CONFIGURED` + session closed `TOKEN_FAILED` | **Fixed + verified** (failure path, G-3). IAM grant = **Owner**. |
| SRV-08 | App Check | Unchanged (enforce off); monitor-then-enforce plan | **Staging + Owner** |
| SRV-09 | 9 different admin checks; hard-coded personal e-mail; unverified e-mail accepted in places | `functions/authz.js` is the one policy, used by every module. Hard-coded e-mail removed. `email_verified` required. Matches `firestore.rules isAdmin()`. | **Fixed + verified** (G-6 13/13). **Owner:** set `SUPER_ADMIN_EMAILS`. |
| SRV-10 | No logging contract; silent catches | `withErrors()` on all 155 callables. `logBestEffort` on 44+ best-effort catches (list in SERVER-ERROR-CONTRACT §4). | **Fixed + verified** (G-3; labels 155/155) |
| SRV-11 | Firestore contention / index / undefined errors surface as INTERNAL | mapped to `aborted` / `resource-exhausted` / `INDEX_UNAVAILABLE` / `INVALID_FIELD` | **Fixed + verified** (G-3). Real missing index = **Staging**. |
| SRV-12 | Client calls two functions that do not exist | Feature flags `contentTranslation`, `offlineMemberTokenSignIn` (default false); the existing fallbacks run | **Fixed + verified** (`test_callable_names`). Turning them on = **Owner** product decision. |
| SRV-13 | d8cba09 not on `main` | — | **Owner** (push/merge after review) |
| SRV-14 | No staging project | — | **Owner** |

`ignoreUndefinedProperties` was **not** enabled globally. Undefined values are mapped to a typed `INVALID_FIELD` error instead.

## 2. Coverage gaps G-1 … G-6

| Gap | Delivered | Result |
|---|---|---|
| G-1 callables with no test (29) | `tools/test_callables_g1_emulator.mjs` | 28/28 (29 callables; see SERVER-CALLABLE-COVERAGE §2) |
| G-1b (found on the final tree) 9 callables with only static tests | `tools/test_callables_g1b_emulator.mjs` | 11/11 |
| G-2 triggers / schedules / HTTP (22) | `tools/test_triggers_schedules_emulator.mjs` | 20/20, all 22 exports |
| G-3 error contract | `tools/test_server_error_contract_emulator.mjs` | 15/15 |
| G-4 client error states | `tools/test_client_error_states_browser.mjs` (Chromium + SDK 10.8.1) | 14/14 |
| G-5 staging-only checks | SERVER-STAGING-READINESS.md: complete plan (configuration names, IAM, indexes, App Check, PesaPal sandbox, Cloudinary, FCM, cold start / timeouts / `maxInstances`, deploy order, 14 smoke tests) | plan **complete**. Executing it is **not applicable until a deployed project exists** (blocked by deployment, documented separately). |
| G-6 admin authorisation matrix | `tools/test_admin_authz_matrix_emulator.mjs` | 13/13 (7 identities × 10 module gates + policy + source scan) |

The new emulator suites were added to `test:security:all:emulator` and `test:ci:emulator` in `package.json`. The browser test is picked up by the existing `tools/*browser*.mjs` runner. No existing test was deleted or skipped.

## 3. Real defects found and fixed during verification

| # | Defect | Found by | Fix |
|---|---|---|---|
| D-1 | `deliveryRouteBooking` / `deliveryRouteRetry` returned INTERNAL for an order that is not a delivery booking. `return` without `await` inside `try` bypassed `mapError`. | G-1 | `return await …` + typed `mapError` (`not_a_booking` → failed-precondition, missing → not-found, bad input → invalid-argument) |
| D-2 | **Regression from this branch:** a front-end 503 / SDK timeout with a non-code message (`Service unavailable.`, `deadline`) was no longer treated as "busy", so the breaker did not engage | existing `test_functions_resilience` (2 failures) | `unavailable` / `deadline-exceeded` **without server details** = busy. A server-thrown one always carries `requestId`. |
| D-3 | **Regression from this branch:** an `HttpsError` from another copy of `firebase-functions` was turned into `internal` (`instanceof` failed). This broke 4 POS suites. | `test_pos_*` (npm test) | `isHttpsError` duck-typing: class name `HttpsError` + valid callable code |
| D-4 | **Regression risk from this branch:** appending the reference number to every server message would have broken `placeBid`, which parses `mnada_umefungwa` from `e.message` | code review + G-4 | the reference number is appended only to unexpected / infrastructure codes and substituted texts; `e.requestId` always set |
| D-5 | `sitemapXml` and `adminSearchBackfill` swallowed failures silently | G-2 review | `logBestEffort` |

**Test-side corrections.** These fixed wrong assumptions; no assertion was weakened.

- **G-2:** cron schedule form; business phone by design; `admin.messaging` getter; auction end time in milliseconds; fake `res`; lease protocol; the `docId` param.
- **G-1:** staff role casing; reason length.
- **G-1b:** reason length.
- **G-4:** the SDK timeout is set when the callable is created.
- **`tools/test_pos_return_authority.mjs`:** its test double for `business-store-authority` threw a plain `Error('unauthorized')`. The real module throws `HttpsError('permission-denied', …)`. The double now does the same, and the assertion (`'unauthorized'`) is unchanged.
- **`tools/g1/test_phase7_server_lifecycle.mjs`** L1: expects the SRV-06 typed code (`unavailable PAYMENT_PROVIDER_UNAVAILABLE`) instead of a raw `internal`, and now also asserts the reason.
- **`tools/g1/test_transport_market.mjs`** C2: the stale "used offer denied" assertion predates the deliberate same-driver idempotent replay (`ddacd20`). It was replaced with stricter assertions: same token, no writes, other driver refused, post-pickup and declined offers refused.

These three, plus `test_callable_names` (feature-flag guard checks added), are the only edits to existing tests.

## 4. Inspection of every modified file

Checks run on the final tree:

- `node --check` on all modified and new `.js`/`.mjs` files: **0 errors**.
- `require('functions/index.js')`: 180 exports, **155 callables, all wrapped and labelled**, 0 unlabelled.
- Duplicates: none. One export object; module re-exports only.
- Imports: every module that uses `logBestEffort` imports it from `./errors` (checked per file).
- `routing-core.js` (also used by `tools/test_routing.mjs` and `test_delivery_choice.mjs`): both pass.
- Removed lines (`git diff -U0 | grep ^-`) were reviewed one by one. They are only:
  - the old local admin helpers, replaced by `authz`;
  - the two hard-coded e-mail checks;
  - the `token.isAdmin` claim in `creative.js`. The rules never accepted it and the server never sets it.
  - raw `HttpsError('internal', <raw upstream text>)` in PesaPal paths, replaced by typed `ppError`;
  - empty catches, replaced by the same catch plus `logBestEffort`.

  No feature, callable, collection or flow was removed.
- `build_html check`: byte-exact. `build_dist --minify --check`: OK.

**Security notes for the owner:**

1. The owner is an admin on the server only via `SUPER_ADMIN_EMAILS` (verified e-mail) or a custom claim.
2. A plain `isAdmin:true` claim is no longer honoured by `creative.js`. This matches the rules.
3. `userCardSync` publishes `businessPhone` for business-like accounts (by design).

## 5. Files

See FINAL-GIT-CHANGE-SUMMARY.md for the complete list and how to review or apply the changes.
