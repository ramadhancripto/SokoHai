# Server staging readiness (G-5)

Nothing in this document has been run against Firebase staging or production. The emulator evidence in SERVER-FINAL-VERIFICATION.md proves code behaviour only. Every item below that is marked **STAGING** still has to be proven on a deployed project.

## 1. What blocks deployment today

| Blocker | Who | Notes |
|---|---|---|
| **Firebase Blaze billing** | Owner | Cloud Functions (2nd gen), Cloud Scheduler, Secret Manager and outbound network calls (PesaPal, Cloudinary, FCM) all need Blaze. The owner cannot enable billing now. **Everything in §3–§5 waits for it.** Rules and indexes can be deployed on the Spark plan. |
| Staging project (SRV-14) | Owner | Create e.g. `sokohai-staging` (Blaze, region europe-west1) with Firestore (Native) and Authentication. |
| Release order (SRV-13) | Owner | `remediation/final-20261120` (d8cba09) and this branch are not on `origin/main`. Review, push and merge them before the first deploy, so the deployed code equals the tested code. |
| IAM `signBlob` (SRV-07) | Owner | §3.3 |
| PesaPal sandbox IPN registration | Owner, after the functions are deployed | §3.4 |

## 2. Can be done locally / without Blaze (already done in this branch)

- All server code fixes: SRV-02, 03, 05, 06 (code), 09, 10, 11, 12 (flags).
- Emulator verification:
  - Firestore + Auth emulator;
  - callables run through `fn.run()`;
  - triggers with real snapshots;
  - schedules through `fn.run({})`;
  - HTTP handlers with fake `req`/`res`;
  - PesaPal with a mocked `fetch`;
  - FCM with a stubbed sender.
- The local functions server (`node functions/local-server.js`, port 5055) serves the same `functions/index.js` callables at `/__fn/<name>`. It can be used for a no-billing demo on one computer. It is **not** a production backend: there is no IAM, no scheduler, and it is not reachable from phones.

## 3. Staging configuration (names only; never put values in source, chat, reports or Git)

### 3.1 Environment / secrets for `functions` (`functions/.env.<staging-project-id>`, or Secret Manager)

| Name | Required for | Notes |
|---|---|---|
| `PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET` | PesaPal | **Sandbox** keys on staging. Prefer Secret Manager (`defineSecret`) once on Blaze; the code currently reads `process.env`. |
| `PESAPAL_BASE_URL` | PesaPal | `https://cybqa.pesapal.com/pesapalv3` (sandbox). A live URL is refused unless `PESAPAL_ALLOW_LIVE` is set **and** the project is production (`PAYMENTS_LIVE_BLOCKED`). |
| `PESAPAL_IPN_ID`, `PESAPAL_IPN_URL` | PesaPal IPN | filled **after** `pesapalRegisterIpn` returns an id for the deployed `pesapalIpn` URL (§3.4) |
| `PESAPAL_REDIRECT_URL`, `PESAPAL_ALLOWED_RETURN_ORIGINS` | PesaPal return | staging web origin |
| `SUPER_ADMIN_EMAILS` | admin (SRV-09) | the owner's verified e-mail. The hard-coded personal e-mail was **removed** from `creative.js` and `ads-delivery.js`. Without this variable (or an `admin`/`superAdmin` custom claim), the owner is **not** an admin on the server. |
| `ADMIN_EMAILS` | admin | other verified admin e-mails (optional) |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_SIGNED_PRESET`, `CLOUDINARY_UPLOAD_MODE` | signed uploads | secret only on the server |
| `SKH_PUSH_ENABLED` | FCM | unset = no push is sent (tested). Set to `1` on staging to test push. |
| `APP_CHECK_ENFORCE` | App Check | leave **unset/false** first (monitor), §3.5 |
| `PUBLIC_BASE_URL` | sitemap | staging origin |
| `SKH_ALLOWED_ORIGINS`, `UPLOAD_MAX_PER_HOUR`, `WALLET_MAX_ABS`, fees (`AGENT_REG_FEE`, `OFFLINE_REG_FEE`, `OFFLINE_REG_COMMISSION`, `SERIOUS_DEPOSIT_FEE`), `ASSISTED_SESSION_TIMEOUT_MINUTES` | business settings | defaults exist in code |

`firebase.json` excludes `.env*` and credential files from the uploaded source. **STAGING:** confirm after the first deploy, in Cloud Console → Functions → Variables, that the variables arrived.

### 3.2 Rules and indexes

- `firebase deploy --only firestore:rules,firestore:indexes --project <staging-id>` works on Spark.
- **STAGING:** wait until every index in `firestore.indexes.json` shows *Enabled* before running smoke tests. A missing index now returns `failed-precondition INDEX_UNAVAILABLE` (typed) instead of INTERNAL.
- The emulator does **not** enforce composite indexes. Every query of the backfills, sweeps and reports must be exercised once on staging, and the logs searched for `INDEX_UNAVAILABLE`.

### 3.3 IAM

- **Token Creator role.** Grant `roles/iam.serviceAccountTokenCreator` to the functions runtime service account, on itself. This is needed for `createCustomToken` (`memberAuthenticate`, assisted member sign-in). Without it the callable returns `failed-precondition SIGNING_NOT_CONFIGURED` (tested) and closes the session.
- **Scheduler service agent.** Cloud Scheduler must be able to invoke the 8 schedules. The default is fine after the first deploy.

### 3.4 PesaPal (sandbox only on staging)

1. Deploy the functions. Then the `pesapalIpn` URL is `https://europe-west1-<staging-id>.cloudfunctions.net/pesapalIpn`.
2. As super admin, call `pesapalRegisterIpn` with that URL. Store the returned id as `PESAPAL_IPN_ID`. **Do not reuse the unrelated existing IPN listener of `invoicing.pesapal.com`.**
3. Run the sandbox checkout of a small deposit and check:
   - one `escrow_holds/ppinit_*` record;
   - the IPN arrives;
   - `GetTransactionStatus` = COMPLETED;
   - the wallet is credited **once**;
   - a second IPN changes nothing;
   - `pesapalReconcileSweep` leaves it settled.
4. Negative paths:
   - wrong keys → `PAYMENT_PROVIDER_AUTH`;
   - a closed sandbox → `PAYMENT_PROVIDER_UNAVAILABLE`;
   - the user closes the redirect → the order is **not** paid until the IPN or status check says so.

### 3.5 App Check (SRV-08)

1. Register the web app with the reCAPTCHA Enterprise provider and add the site key to the client config.
2. Keep `APP_CHECK_ENFORCE` off and watch App Check metrics for 1–2 weeks: verified versus unverified requests.
3. Enforce only when unverified traffic is close to zero. **STAGING:** the emulator cannot test App Check.

### 3.6 Runtime limits

- `setGlobalOptions({ region: 'europe-west1', maxInstances: 10 })`, plus per-function `timeoutSeconds` where set (e.g. `adminSearchBackfill` 300 s).
- **STAGING checks:**
  - **Cold start:** measure the first-call latency of `pesapalCheckout`, `orderWalletPay` and `marketplace` reads. The client SDK timeout is 70 s.
  - **Timeouts:** `pesapalCheckout` with PesaPal slowed down. The server gives up at 15 s with `PAYMENT_PROVIDER_UNAVAILABLE`.
  - **maxInstances:** run about 50 parallel `orderWalletPay` calls on different orders. Expect no `resource-exhausted` storms, and exactly one debit per order (tested locally: 8 parallel = 1 debit).

## 4. Deployment order (staging)

1. `firebase use <staging-id>`.
2. `firebase deploy --only firestore:rules,firestore:indexes --project <staging-id>`. Wait for the indexes.
3. `firebase deploy --only functions --project <staging-id>` (Blaze). Expect **177 functions**: 155 callables, 12 Firestore triggers, 8 schedules and 2 HTTP functions. `index.js` has 180 enumerable exports; the other 3 (`_orderQuantity`, `_transporterAccountProblem`, `_pesapalGuardForTest`) are plain helper objects, not function endpoints, and are not deployed.
4. IAM Token Creator (§3.3). PesaPal IPN registration (§3.4).
5. Smoke tests (§5).
6. Backfills (SRV-04), as super admin:
   - `adminBackfillUserCards` (page until `next` is null);
   - `adminSearchBackfill` (start, then continue with `runId` until `done`; one run at a time);
   - opening stock: owners set it through `inventoryAdjust` `OPENING_BALANCE` (once per record, enforced).

   All three are **idempotent on emulator fixtures** (G-2 tests): a second run writes nothing new and never copies private fields.
7. Only after staging is green: repeat for production with **live** PesaPal approval by the owner.

## 5. Staging smoke tests

All run from the real web origin. Each must pass **on staging**; the emulator results do not count here.

| # | Check | Pass when |
|---|---|---|
| 1 | GET `sitemapXml` | 200 XML with listed products |
| 2 | Sign in; call `adminWhoAmI` | owner = super admin; a normal user is refused |
| 3 | Create a product | `searchTokens` appear (`catalogSearchIndexProducts`); `userCards/<uid>` exists (`userCardSync`) |
| 4 | Wallet deposit via PesaPal sandbox | credited once (§3.4) |
| 5 | `orderWalletPay` on an order; double-click | one debit, one ledger entry, one escrow hold |
| 6 | Buyer confirms delivery | escrow released once; seller credited once; no release without confirmation or auto-release time |
| 7 | Dispute → admin resolve | funds split as decided; non-admin refused |
| 8 | Inventory reservation ON: order → cancel | stock reserved, then released; sweep expires stale ones |
| 9 | Auction ends | `commerceModesSweep` finalises it (end time in ms) |
| 10 | Push (`SKH_PUSH_ENABLED=1`) | the device receives one push; dead tokens pruned |
| 11 | Upload an image | Cloudinary signed upload works; no secret in the browser |
| 12 | Agent offline member sign-in | works after IAM; otherwise `SIGNING_NOT_CONFIGURED` |
| 13 | Error drill | an unknown callable → client shows "haijawashwa" and pauses 10 min; a server error shows a reference number; the logs show the same `requestId` with `fn`/`where` |
| 14 | Logs | no `INDEX_UNAVAILABLE`, no `UNEXPECTED` internal during 1–13 |

## 6. Status summary

| Area | Code | Locally verified | Deployed |
|---|---|---|---|
| Callables (155) | done | yes (SERVER-CALLABLE-COVERAGE) | **no** |
| Triggers (12) / schedules (8) / HTTP (2) | done | yes (SERVER-TRIGGER-SCHEDULE-VERIFICATION) | **no** |
| Composite indexes | in `firestore.indexes.json` | not testable in emulator | **no** |
| App Check | code present, enforce off | not testable | **no** |
| IAM signBlob | typed failure | yes (failure path only) | **no** (owner) |
| PesaPal | typed errors, timeout, idempotent settle | yes (mocked) | **no**: sandbox after deploy |
| Cloudinary signed upload | unchanged | existing tests (`test_upload_signing`) | **no** |
| FCM | trigger tested with stub | yes (stub) | **no** |
| Production | — | — | **not ready**: needs staging first |
