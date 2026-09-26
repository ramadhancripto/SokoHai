# SokoHai Phase B — Firebase Emulator and Journey Testing

Date: 2026-09-26
Recovery checkpoint: `0e8bb6c`
Phase A changes were present before this test phase. No Phase B source changes were made.

## 1. Environment

| Component | Result |
|---|---|
| Firebase project mode | `demo-sokohai` emulator project |
| Auth emulator | PASS — `127.0.0.1:9099` |
| Firestore emulator | PASS — `127.0.0.1:8085` |
| Local Functions/frontend | PASS — `127.0.0.1:5055` |
| Callable registry | PASS — 44 callables |
| HTTP registry | PASS — 2 HTTP functions |
| Schedules | PASS — 3 discovered, disabled |
| PesaPal | Sandbox configuration path; this run had no PesaPal credentials available to the local process, so no sandbox checkout was claimed successful |

Safe environment information only was inspected. No secrets, private keys, tokens, or passwords were printed.

The first attempt with the latest Firebase CLI was blocked because it requires Java 21. Firebase CLI `13.35.1` was used instead; it works with the available Java runtime and successfully started the emulators.

## 2. Authentication

PASS at emulator API level:

- Created test buyer, seller, agent, and driver accounts.
- Emulator returned Auth identities and ID tokens.
- Tokens were used only in local requests and were not printed.
- Local Functions authenticated requests correctly.

A full interactive browser registration/login/logout journey was not executed because this environment does not provide a browser automation tool or installed Playwright/Puppeteer browser. Existing jsdom/contract tests were run separately; they are not equivalent to a real browser.

## 3. Firestore security suites

PASS against the actual running emulators:

- `tools/test_phase1_security.mjs`: **57 passed, 0 failed**
- `tools/test_phase2_security.mjs`: **28 passed, 0 failed**

The suites covered server authority for wallet, escrow, PesaPal evidence, delivery completion, order fields, negotiation payment gates, custody, auto-release, ride acceptance, and relevant Firestore rule boundaries.

## 4. Platform stats

PASS for the Phase A fix:

- Authenticated client read of missing `platform_stats/current`: HTTP 404 / `NOT_FOUND`.
- Authenticated client write attempt: HTTP 403 / `PERMISSION_DENIED`.
- `platformStatsRefresh` as non-admin: HTTP 403 / `PERMISSION_DENIED`.
- `62-missing-features.js` now logs a read-only wait state and contains no `platform_stats` write.

An admin refresh write was not claimed in this run because creating a custom-claim admin through the emulator REST surface was not available with the test setup. Phase 1/2 security tests do cover admin/server money-path behavior.

## 5. Local Functions routing

PASS at server/injection/static level:

- `http://localhost:5055/` returned the frontend.
- The served HTML injected `window.SKH_FUNCTIONS_URL="/__fn"` and `window.SKH_LOCAL_FUNCTIONS_SERVER=true`.
- Emulator client configuration was injected for Auth and Firestore.
- `/__fn` returned the expected registry.
- Unauthenticated `pesapalCheckout` returned `401 UNAUTHENTICATED`, proving the route was reached and auth was enforced.
- Active source search found no 5056 reference in canonical active routing/diagnostic files.

The requested interactive calls to `skhUseLocalFunctions()` and `skhUseCloudFunctions()` were not browser-executed because no browser automation tool is available. Existing routing and local-server contract tests pass.

## 6. Product and variant journey

Partial local emulator verification PASS:

- Seller-authenticated REST write created `TEST_PRODUCT_PHASEB`.
- Product included two variant groups: Color `Black|White` and Size `M|L`.
- Buyer-authenticated read returned the product and both variant groups.
- No separate product document was created per variant.

The full UI journey — category/subcategory/Discover controls and visual product opening — remains unverified without browser automation.

## 7. Order and server authority

PASS at Firestore rules level:

- Buyer created `TEST_ORDER_PHASEB` with buyer/seller/product/variant/amount/delivery fields.
- Buyer attempt to change `amount` from `25000` to `1`: HTTP 403 / `PERMISSION_DENIED`.
- Phase 1/2 security suites passed further order/payment/escrow tampering checks.

The full UI delivery selection and submit journey remains unverified.

## 8. Delivery

The existing delivery state machine was not claimed as a new browser E2E pass. Phase 1/2 emulator suites passed the important server-authority transitions, including custody, tokens, accepted rides, carrier payment boundaries, and delivery completion.

A browser-level sequence of `ride_request → offers → accept → pickup → handover → complete` remains required.

## 9. Negotiation and chat

Existing contract and full `npm test` suites pass, including negotiation, delivery negotiation, chat commerce cards, chat authority, and chat E2E state-level tests. These tests exercise existing modules and fallback/error paths, but are not a real browser session.

No second negotiation engine was introduced and no Phase B UI redesign was made.

## 10. PesaPal results

### Checkout initiation

Routing and auth layers PASS. Layer classification was observed:

- Missing input: HTTP 400 `INVALID_ARGUMENT`, `Kiasi cha malipo si sahihi.`
- Authenticated request with valid-shaped input reached `pesapalCheckout`, but returned HTTP 500 `INTERNAL` because this local process did not have PesaPal consumer credentials available in `functions/.env`.

This is classified as **ENVIRONMENT ISSUE / sandbox configuration unavailable**, not as proof that PesaPal API communication succeeded. No secret value was printed.

### Return

Not executed against a real PesaPal sandbox return. Source inspection and existing tests confirm the return handler calls server transaction status and does not trust redirect alone.

### Transaction status

Not executed against a real sandbox transaction.

### IPN

No localhost IPN success was claimed. A real PesaPal IPN requires public HTTPS. No test-only IPN simulation was added in this phase.

## 11. Broad Firestore rule audit findings

Journey probes found real overbroad access that must be addressed before production. These rules were intentionally not changed during Phase B because the instruction was to reproduce and classify before refactoring:

| Collection | Authenticated buyer probe | Result | Classification |
|---|---:|---:|---|
| `adminRevenue` | arbitrary create | HTTP 200 | **REAL SECURITY BUG** |
| `purchase_orders` | arbitrary create | HTTP 200 | **REAL SECURITY BUG / authorization gap** |
| `shipments` | arbitrary create | HTTP 200 | **REAL SECURITY BUG / authorization gap** |
| `activity_logs` | arbitrary create | HTTP 200 | **REAL SECURITY BUG / authorization gap** |

The probe documents were deleted immediately after each successful write. The source also contains multiple client-side `adminRevenue` writes, which is an application architecture issue in addition to the broad rule.

Required next step: map each legitimate producer/reader, migrate sensitive writes to server functions, and tighten rules with journey tests. This must be a separate minimal security phase, not a broad rewrite.

## 12. PWA

Source verification PASS:

- `js/00-pwa.js` intentionally skips service-worker registration on `localhost` and `127.0.0.1`.
- Production service-worker registration remains enabled for HTTP/HTTPS non-local origins.
- `sokohai-sw.js` is network-first and deletes old cache names on activation.
- Hosting headers no-cache HTML, service worker, and `js/app/**`.

A production-origin service-worker browser test remains outstanding.

## 13. Files changed during Phase B

**No application files changed during Phase B.**

Only this report was added:

- `SOKOHAI-PHASE-B-REPORT.md`

Phase A working-tree changes remain as previously reported. No rules, Functions, payment logic, chat, negotiation, delivery, or UI files were modified during these tests.

## 14. Remaining problems, prioritized

1. **P0 — Firestore authorization:** `adminRevenue`, `purchase_orders`, `shipments`, and `activity_logs` accept arbitrary writes from any signed-in user. Their read scopes also require review.
2. **P0 — Client adminRevenue writes:** several frontend modules write accounting/revenue records directly; this conflicts with server-authoritative money/accounting requirements.
3. **P1 — PesaPal local environment:** provide sandbox credentials through the local secret mechanism, then repeat checkout/status testing without printing secrets.
4. **P1 — Real browser E2E:** install/provide Playwright or another browser runner and execute clean-origin routing, Auth, Discover, product, order, delivery, negotiation, and chat journeys.
5. **P1 — Admin platform stats:** perform an authenticated admin callable write test through the local Functions server.
6. **P2 — Public IPN:** test against a temporary public HTTPS endpoint or a clearly isolated verification harness.
7. **P2 — Production-origin PWA/cache test:** verify service-worker versioning and update behavior on the deployed origin.

## 15. Final status

**LOCAL EMULATOR SECURITY TESTS PASS.**

**LOCAL TEST PASS ≠ PRODUCTION READY.**

Production still requires production Firebase configuration and rule verification, deployed Functions, production secrets, PesaPal production credentials, public HTTPS IPN, monitoring, backup/recovery, rate/abuse controls, real-device/mobile testing, and operational payment testing.
