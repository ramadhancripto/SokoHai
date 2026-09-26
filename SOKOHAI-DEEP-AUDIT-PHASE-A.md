# SokoHai Deep Audit — Phase A Discovery

Date: 2026-09-26
Recovery checkpoint: `0e8bb6c`

## Scope and method

This is a discovery report made before source changes. The repository was cloned at commit `0e8bb6c`; the working tree was clean. I inspected the canonical root frontend, the `assets/` and `_old_fonts_project/` copies, the local Functions server, Functions implementation, Firestore rules, PesaPal return path, PWA files, and the existing contract-test definitions.

## 1. Current architecture

### Production path

`index.html` loads the canonical `js/` modules. `js/app/00-bootstrap.js` initializes Firebase Auth, Firestore, and Functions for region `europe-west1`. Callable wrappers use the Firebase Functions SDK unless an explicit local endpoint is configured. Sensitive payment and escrow transitions are implemented in `functions/index.js` using Admin SDK and server-side PesaPal credentials. Firestore rules deny direct client writes to `wallet_ledger` and `platform_stats`; payment verification is intended to occur through server functions and PesaPal status/IPN verification.

PesaPal flow found:

1. `js/app/02-checkout.js` calls `window.skhServerPaymentsCheckout`.
2. `00-bootstrap.js` maps that wrapper to `pesapalCheckout`.
3. `functions/index.js` authenticates the caller, validates order/payment input, obtains a PesaPal token, calls `SubmitOrderRequest`, and records an initiation hold.
4. `js/17-pesapal-return.js` handles the redirect and calls `pesapalTransactionStatus`; it does not treat a redirect alone as payment proof.
5. `pesapalTransactionStatus` and `pesapalIpn` call server verification/settlement helpers. IPN is HTTP and acknowledges the callback, but the server verifies status before settlement.
6. `pesapalRegisterIpn` is admin-only.

### Local path

`functions/local-server.js` imports the same `functions/index.js`; it does not duplicate business logic. By default it binds to `127.0.0.1:5055`, serves the frontend, injects `window.SKH_FUNCTIONS_URL='/__fn'` when serving the page, and exposes callable/HTTP functions under `/__fn/<name>`. It can connect to Auth/Firestore emulators when `FIRESTORE_EMULATOR_HOST` is set; otherwise the implementation warns/uses configured credentials and can reach real project data. Schedules are disabled unless explicitly enabled.

The frontend local endpoint precedence is:

1. `localStorage.skh_functions_url`;
2. injected `window.SKH_FUNCTIONS_URL`;
3. no local URL, therefore Firebase Cloud Functions SDK.

`skhUseLocalFunctions(url)` persists the URL and reloads. `skhUseCloudFunctions()` removes that key and reloads.

## 2. Root causes found

### A. The 5056 reference is real, but not in the canonical callable router

The active canonical bootstrap contains no hardcoded `5056`; its local default is `http://localhost:5055/__fn`. The active `js/app/54-error-core.js` does contain a hardcoded `http://127.0.0.1:5056/__fn/` in the developer diagnostic (`skhDiagnose`) and its documentation. The local server's EADDRINUSE error also recommends `PORT=5056`, and `LOCAL-SERVER-MWONGOZO.md` documents 5056 as an alternate.

Therefore 5056 is an active diagnostic/fallback/documentation inconsistency, but repository search does not show a canonical `skh_functions_url` or `SKH_FUNCTIONS_URL` assignment to 5056. A browser POST to 5056 can be explained by stale browser state (`skh_functions_url` persisted from an earlier manual call), a stale service-worker/page asset, or an older process/page copy. It cannot be attributed to the current canonical bootstrap without browser storage/runtime evidence. `skh_functions_url` intentionally has precedence over the injected value, so a stale value wins.

The root cause is thus two-part: persistent client routing state is not visibly surfaced/validated, and the diagnostic/error-core and server conflict hint still advertise 5056. The PWA is not registered on localhost, but a previously registered worker on a non-local origin can still be relevant; the worker is network-first and deletes old cache names on activation.

### B. PesaPal checkout implementation is present and server-authoritative

`pesapalCheckout` is exported in `functions/index.js` and is registered by the local server from the exported function table. The visible `functions/internal`/`functions/not-found` messages in historical logs are not evidence that the function is absent from source. They are consistent with the request reaching the wrong endpoint/port, a function deployment mismatch, missing credentials/configuration, or an upstream PesaPal failure being normalized by the frontend. The current source does not expose the consumer secret to the browser.

Local initiation and sandbox API access are testable. External PesaPal IPN delivery cannot reach localhost; production IPN must be public HTTPS. A local IPN simulation must remain an explicit test-only harness and must not alter production verification logic.

### C. `platform_stats` permission error is caused by client-side seeding

`js/app/62-missing-features.js` runs `skhEnsurePlatformStats()` after a timeout. It reads `platform_stats/current` and, when missing, performs a client `set`. The rules explicitly state `allow read: if signedIn(); allow write: if false;`. The denied create/update is therefore expected and is not a rule bug. The server already exposes `platformStatsRefresh` (admin-only) and `platformStatsHourly` (scheduled) which write through Admin SDK. The client seed is an architectural conflict and should be removed or made read-only; rules must not be weakened.

### D. Cache/source topology

The root `index.html` loads `js/`, not `assets/js/`. The repository also contains `assets/` and `_old_fonts_project/` copies plus intentional backups. These are not automatically active in the root app. `html/index.html` is the build source and `tools/build_html.py check` reports it byte-identical to root `index.html`. The active PWA registration is in `js/00-pwa.js`; localhost registration is deliberately skipped. The service worker uses network-first fetch and versioned cache cleanup, but the current root hosting headers only explicitly no-cache `js/app/**`; other JavaScript paths should be verified during deployment.

### E. Security observations

Positive controls found: server-side PesaPal secret use; authenticated callable checks; server settlement helpers; Firestore denial of direct `wallet_ledger`/`platform_stats` writes; admin-only stats refresh/IPN registration; emulator-aware local server; schedules disabled by default.

Risks requiring further audit (not changed in Phase A): several legacy Firestore matches remain broad (for example `purchase_orders`, `shipments`, `activity_logs`, and `adminRevenue` are readable/writable by any signed-in user in the current rules); these need journey-based authorization review before production. The local server can use production credentials when emulators are not configured, so local testing must default to emulators and must not use production data casually. The Firebase web API key is public configuration, not a secret; no private key or PesaPal consumer secret was printed.

## 3. Recommended minimal fixes, in order

1. Remove all active 5056 assumptions from canonical diagnostics and conflict guidance; make port collision fail with instructions to stop the existing 5055 process, not silently switch ports.
2. Remove the client write/auto-seed of `platform_stats`; retain server refresh/scheduled ownership and read-only UI behavior.
3. Add/execute a routing test that proves localStorage precedence, `skhUseCloudFunctions()`, and `skhUseLocalFunctions('http://localhost:5055/__fn')` behavior.
4. Run the local server against Auth/Firestore emulators by default for testing, then separately test sandbox PesaPal initiation. Do not claim IPN success locally without a public endpoint or explicit signed/test harness.
5. Audit broad Firestore rules and complete real authenticated user journeys before production.

## 4. Discovery checks run

- `git log -1`: `0e8bb6c Backup current SokoHai state before Developer AI audit`
- Repository search for `5056`, `skh_functions_url`, `SKH_FUNCTIONS_URL`, and `pesapalCheckout`.
- Inspected requested architecture, routing, PWA, error core, PesaPal, local server, rules, and stats files.
- `npm run check:html`: PASS.
- Contract-test execution is currently blocked because dependencies are not installed: `jsdom` is missing; the local-server test also reports `cd functions && npm install` is required.

No application source was changed while producing this Phase A report.

## 5. Minimal fixes applied after discovery (Phase C, 2026-09-26)

| FILE | PROBLEM | CHANGE | WHY | RISK |
|---|---|---|---|---|
| `js/app/54-error-core.js` and `assets/js/app/54-error-core.js` | Diagnostic advertised localhost port 5056 | Changed diagnostic comments and endpoint to 5055 | Keeps the diagnostic aligned with the one authoritative local server | Low; diagnostic-only path |
| `functions/local-server.js` | Port collision message recommended creating a second server on 5056 | It now tells the operator to stop the existing 5055 process and retry | Prevents silent split-brain local testing | Low; error-message only |
| `LOCAL-SERVER-MWONGOZO.md` | Guide documented 5056 as a normal alternate | Documented 5055 as authoritative and advised stopping the existing process | Removes operator ambiguity | None |
| `js/app/62-missing-features.js` and `assets/js/app/62-missing-features.js` | Client attempted to create `platform_stats/current`, which rules intentionally reject | Kept the health/read check but removed the client write; server refresh/schedule remains authoritative | Fixes the observed permission error without weakening Firestore rules | Low; an uninitialized stats doc now waits for server refresh |

Backups were not loaded, deleted, or modified. `functions/index.js`, `firestore.rules`, payment logic, negotiation, delivery, and PWA runtime were not rewritten.

## 6. Post-fix checks

- `npm install` and `npm --prefix functions install`: PASS (dependencies installed locally; generated `node_modules/` is ignored).
- `node tools/test_local_functions_server.mjs`: PASS, 12/12.
- `node tools/test_functions_resilience.mjs`: PASS, 26/26.
- `node tools/test_routing.mjs`: PASS, 69/69.
- `npm run check:html`: PASS; `html/` and root `index.html` remain byte-exact.
- `node --check functions/local-server.js`: PASS.
- `node --check functions/index.js`: PASS.
- Local server booted with Auth/Firestore emulator environment on authoritative port 5055: PASS; 44 callable, 2 HTTP, and 3 schedule exports discovered; schedules remained disabled.
- `GET http://127.0.0.1:5055/__fn`: PASS; function registry returned.
- Unauthenticated POST to `pesapalCheckout`: PASS as a security test; returned `401 UNAUTHENTICATED`, not a fake payment success.
- `test_phase1_security.mjs` and `test_phase2_security.mjs`: BLOCKED outside emulator because the required emulator environment was not running. They were not reported as passes.
- `npm test`: PASS; all included contract suites completed with zero failed assertions. The suite intentionally logs fallback/error-path cases (missing Functions, mocked permission denial, and mocked Firestore adapter limitations); these are test fixtures, not a claim that the corresponding live journeys passed.

## 7. Still required

This is not a production-readiness signoff. Browser journeys, Firebase Auth/Firestore emulator rules, product/order/delivery/chat journeys, real sandbox PesaPal status verification, public IPN testing, and the broad Firestore authorization review remain. The next safe step is to run Firebase Auth/Firestore emulators and execute the security suites, then exercise the browser with clean localStorage/service-worker state.
