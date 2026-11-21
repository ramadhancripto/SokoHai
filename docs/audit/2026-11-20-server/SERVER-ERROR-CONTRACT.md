# Server error contract (callables + client)

Branch `remediation/server-20261120`. Implementation:

- `functions/errors.js` and `functions/authz.js` (server);
- `js/app/00-bootstrap.js` (client).

Tests:

- G-3 `tools/test_server_error_contract_emulator.mjs`;
- G-4 `tools/test_client_error_states_browser.mjs`;
- `tools/test_functions_resilience.mjs` (existing, jsdom).

## 1. Server: one wrapper for all 155 callables

The 24 modules that define callables now take `onCall` from `./errors`. The signature is identical: `onCall(opts, handler)` or `onCall(handler)`. Every handler runs inside `withErrors()`. Handler logic is unchanged.

`functions/index.js` ends with `labelCallables(exports)`, so each log line names its export. Labelled: **155/155**, unlabelled 0. This is checked by G-3 and by `node -e` (see SERVER-FINAL-VERIFICATION §2).

| Thrown by the handler | Sent to the client | Log level |
|---|---|---|
| `HttpsError(code, message, details)`, from any copy of firebase-functions or a test double (`isHttpsError`: same class name and a valid code) | **unchanged** code and message; `details.requestId` added when details are empty or a plain object (string details left alone) | `info` for client codes, `error` for internal / unavailable / deadline-exceeded |
| Firestore `ABORTED` (10) | `aborted`: "Ombi limegongana na jingine… Jaribu tena." | info |
| Firestore `RESOURCE_EXHAUSTED` (8) | `resource-exhausted` | info |
| Firestore `FAILED_PRECONDITION` + "index" | `failed-precondition` `INDEX_UNAVAILABLE: …` | info |
| `DEADLINE_EXCEEDED` (4) / `UNAVAILABLE` (14) | `deadline-exceeded` / `unavailable` | error |
| `ALREADY_EXISTS` (6) | `already-exists` | info |
| "Cannot use undefined as a Firestore value" | `invalid-argument` `INVALID_FIELD: … (field)` | info |
| anything else (`TypeError`, plain `Error`, …) | `internal` "Hitilafu ya server (namba: `<requestId>`). Jaribu tena; ikiendelea, wasiliana na msaada ukitaja namba hii." The raw message, stack and data **never** reach the client. | error |

**Log line.** One line per failure via `firebase-functions/logger`, with these fields:

- `fn`, `requestId`, `code`;
- `reason` (the first segment of the typed message, or `UNEXPECTED`/`CONTENTION`/…);
- `where` (`file.js:line` of the throw);
- `uidHash` (sha256, 12 characters);
- `durationMs`;
- `upstream {service, stage, status, durationMs, timeout}` for PesaPal;
- `errorType` for unexpected errors.

The line never contains payloads, tokens, PINs, e-mails, phone numbers or keys.

**Best-effort steps.** These are notifications, audit copies, cosmetic look-ups and claim syncs. They keep their non-fatal behaviour but call `logBestEffort(where, e)`, which logs `warn` with `where`, `code` and `errorType`. Section 4 lists every catch.

### Typed codes introduced by this remediation

| Code / prefix | Callable(s) | Meaning |
|---|---|---|
| `failed-precondition` `USER_MISSING` | `walletAdjust`, `withdrawalRequest` (SRV-05) | wallet owner document missing; was a plain `Error`, so INTERNAL |
| `failed-precondition` `PAYMENTS_NOT_CONFIGURED` | `pesapalCheckout`, `pesapalTransactionStatus`, `pesapalRegisterIpn` (SRV-06) | PesaPal keys / base URL not set |
| `failed-precondition` `PAYMENTS_LIVE_BLOCKED` | same | live PesaPal URL on a non-production project |
| `failed-precondition` `PAYMENT_PROVIDER_AUTH` | same | PesaPal refused the keys (401/403) |
| `failed-precondition` `PAYMENT_PROVIDER_REJECTED` | same | PesaPal 4xx or `error` in the body |
| `unavailable` `PAYMENT_PROVIDER_UNAVAILABLE` | same | PesaPal timeout (15 s `AbortController`), network failure or 5xx. "Pesa yoyote haijatolewa." |
| `failed-precondition` `SIGNING_NOT_CONFIGURED` | `memberAuthenticate` (SRV-07) | `createCustomToken` lacks IAM `signBlob`. The session is closed (`active:false`, `endReason:'TOKEN_FAILED'`). |
| `failed-precondition` `not_a_booking` / `not-found` / `invalid-argument` | `deliveryRouteBooking`, `deliveryRouteRetry` | was INTERNAL. **Defect found by G-1:** `return` without `await` inside `try` skipped `mapError`. |

## 2. Client: one classification (`fnErrorKind`)

| Kind | When (SDK 10.8.1 output) | User text (Swahili) | Circuit breaker |
|---|---|---|---|
| `unreachable` | code `internal` with bare message `internal` / `Response is not valid JSON object.` and no details; or a `failed to fetch` / network error; or the synthetic breaker error. This is **status 0**: offline, CORS-blocked 404 of an undeployed function, DNS. | "Hatukuweza kufikia server (mtandao umekatika, au huduma bado haijawashwa)…"; offline: "Hakuna mtandao kwenye kifaa hiki."; money features add "Malipo hayajakamilika na pesa yoyote haijatolewa." | 30 s per callable |
| `missing` | readable 404 without a callable body (`not-found` / `NOT_FOUND`) | "Huduma hii ya server bado haijawashwa." | 10 min per callable |
| `busy` | `unavailable` / `deadline-exceeded` **without server details**: SDK timeout, front-end 503 | "Server imechelewa kujibu." | 30 s |
| `server` | **any** error with a server message or `details.requestId` (typed HttpsError, or wrapped `internal`) | the server's own message. Generic codes are replaced by `FN_CODE_TEXT`. `(namba ya kumbukumbu: <id>)` is appended for internal / unknown / data-loss / unavailable / deadline-exceeded, and when the text was substituted. | **never**; a server answer also clears that callable's breaker |

**Why typed business messages are not suffixed.** UI code parses them. For example, `07-product.js placeBid` extracts `mnada_umefungwa`. The id is still available as `e.requestId`.

**What `normalizeFnCallError` sets.** It sets `e.kind`, `e.requestId`, `e.rawMessage` and `e.friendlyMessage`, and sets `e.message = e.friendlyMessage`. As a result, all 80 existing `alert(e.message)` sites show the Swahili text without being edited. The original code is kept on `e.code`, so existing fallbacks keep working.

**Feature flags (SRV-12).** These live in `js/00-config.js` `FEATURES` and default to `false`:

- `contentTranslation`: `translateContent` is not called; the text stays in its original language.
- `offlineMemberTokenSignIn`: `offlineMemberCustomToken` is not called. The code throws `feature-disabled` and the existing assisted-mode fallback runs.

`tools/test_callable_names.mjs` asserts that both guards come before the call and default to false.

## 3. Evidence

| Test | Result (final run, see SERVER-FINAL-VERIFICATION) |
|---|---|
| G-3 `test_server_error_contract_emulator`: wrapper, labels, mapping, undefined write, `USER_MISSING` (incl. walletAdjust race), PesaPal mocks (no keys / 401 / 503 / network / 15 s timeout / 502 / success with one hold), 8 parallel `orderWalletPay` = 1 debit, `memberAuthenticate` signing failure | 15/15 |
| G-4 `test_client_error_states_browser` (real Chromium + real SDK): status 0, money wording, offline, HTTP 500 + request id, bare INTERNAL, readable 404, server not-found, SDK deadline, front-end 503, server unavailable, unauthenticated, permission-denied, parseable business code, success | 14/14 |
| `test_functions_resilience` (existing, jsdom, 27 checks) | 27/27. It **caught two regressions during this work**, both fixed: `Service unavailable.` was not classed as busy, and `deadline`. |
| POS unit suites with a stubbed `firebase-functions` (`test_pos_*`) | pass. They **caught a regression**: a test double's `HttpsError` class was not `instanceof` the real one, so it became `internal`. Fixed with `isHttpsError` duck-typing. |

## 4. Every catch that used to be silent

**Converted to `logBestEffort` (structured `warn`, behaviour unchanged): 44 sites plus those changed earlier in this branch.**

| Module | Sites | Kind |
|---|---|---|
| index.js | 28 | notifications (deposit, refund, dispute, payout, custody), audit copy, chat event of the IPN, carrier/agent look-ups, `finalPayout` bookkeeping after escrow release (the ledger is authoritative; the ride field is display), sitemap read |
| negotiation.js | 7 | buyer name, product meta, re-routing, "assume not paid" (safe default) |
| routing-core.js | 7 | ride events, agent look-ups, sweep of a ride |
| live-commerce.js | 6 | notifications, audit, unpausing a product that may be gone |
| admin-authority.js | 5 | `mergeClaims` (the Firestore flag is authoritative), audit side copies |
| commerce-modes.js | 3 | notification, audit trail on the money path |
| search-index.js | 2 | refusal audit, lock release after a failed page |
| group-buy, group-soko, auction-admin, routing, price-drop-queue, verification, ads-delivery, setup-status | 1–2 each | notifications, policy read, metrics |

**Deliberately left without logging: 5 sites, each with a justification comment.**

- `errors.js` ×2: the logging itself must never throw.
- `ads-delivery.js:104`: a truncated JSON clone for an audit copy.
- `setup-status.js:17`: an invalid URL is reported as "not configured".
- `commerce-modes.js:236`: a `create()` race that the guarded update decides.

**Rethrown instead of swallowed:**

- `custodySetToken`: the ride read;
- `memberRegister`: the original error now goes through the wrapper, so the client gets a request id instead of the raw message.
