# SokoHai: Ads issue report (401 on creativePublish, ad visible only to the publisher)

**Scope:** LOCAL ONLY. Firebase emulators (project `demo-sokohai`) plus the local functions server (`localhost:5055`).
Nothing was deployed, committed or pushed, and no production data was touched. HEAD is still `afdfe61`.

Evidence and harnesses are in `/home/user/SokoHai-ads-trace/`:
- `repro.mjs`
- `e2e_ads_auth_visibility.mjs` and its output `e2e_after.txt`
- `check61.cjs`
- `sw.cjs`
- `guard.cjs`
- `ads-auth-fix.diff`

---

## Summary

`creativePublish` was never broken. The browser and the local server were talking to **two different Firebase projects**:
- **Browser:** `js/app/00-bootstrap.js` always initialises with production `sokonet-3b847`. It never connects to the emulators. So it signs in with production Auth, and its Firestore reads and writes go to **production**.
- **Local server:** in emulator mode it verifies tokens against the Auth Emulator and reads the Firestore Emulator, both as `demo-sokohai`.

Two results follow:
- **401:** every signed-in callable is rejected by the bridge before the function runs.
- **Only the publisher sees the ad:**
  - The admin/publisher never calls the server for ads; they see a local "admin preview".
  - Account B always asks the server (`adsRequestDelivery`). B gets the same 401 and the slot is hidden.

The fix: when (and only when) the page is served by the local server in emulator mode, the browser is told to use the same emulators. The E2E test passes 32/32, and all existing suites are unchanged.

---

## 1. Root cause of the 401
- The 401 is produced by the **local bridge**, not by `creativePublish`.
- The bridge calls `admin.auth().verifyIdToken()`. The browser's token has `aud`/`iss` = `sokonet-3b847`, but the server expects `demo-sokohai`. firebase-admin 12.7.0 (`token-verifier.js:218`) therefore rejects it with `auth/argument-error`.
- Proof by reproduction (`repro.mjs`):

| Token sent | Result |
|---|---|
| Project `sokonet-3b847` (what the browser sends) | **401 `{"status":"UNAUTHENTICATED","message":"Unauthenticated"}`**, for `creativePublish`, `creativeSaveDraft`, `walletAdjust` and `adsRequestDelivery` alike (not specific to ads) |
| No token | 401 `"Sign in before publishing."`, which is creativePublish's own message and differs from the user's error |
| Auth-emulator token (`demo-sokohai`) | Auth passes; the function runs its business logic |

- The user's console text `FirebaseError: Unauthenticated` matches the bridge's message exactly.
- **Second layer:** the browser saved the creative draft (`skhPersistCreativeDraft`, a direct web-SDK write) to **production** Firestore. So even a valid token would have returned `404 Creative not found` from the emulator (reproduced).
- **Why "twice":** the code sends exactly one `creativePublish` per click. There is no retry in `submitAnnouncementForm`, `skh.wrapCallable` or the SDK. Two 401 lines therefore mean two publish attempts. I could not observe the user's session, so this part is inferred.

## 2. Exact file/function responsible
- `js/app/00-bootstrap.js`, around lines 529-541 (`skh.firebaseConfig`, `initializeApp`, `getAuth`, `getFirestore`): production project only, no emulator connection. This is the root cause.
- `functions/local-server.js` `handleCallable` (the `verifyIdToken` branch): correctly rejects the foreign token. It is not a bug; its generic log just hid the reason.
- `functions/creative.js` `creativePublish`: correct, and unchanged.

## 3. Root cause of the second-account visibility failure
In `js/app/96-ad-delivery-controller.js` `load()`:

| Account | Path | Result |
|---|---|---|
| **A (admin/publisher)** | `isAdmin()` → `renderLocal('admin-preview')` from the browser's own announcements listener. No server call. The server also refuses to lease to admins (`ADMIN_CONTEXT`, ads-delivery.js:340-342). | Sees the ad |
| **B (normal user)** | `serverDeliveryEnabled()` is true whenever `functionsBaseUrl` is set, so it calls `adsRequestDelivery` → 401 → `functions/unauthenticated`. That is **not** `fnDown` (`skh.isFunctionsDownError`), so there is no local fallback: `emptySlot()` hides the slot. | Sees nothing |

- Even with auth working, the ad lived in production while the server reads the emulator, so the result would be `NO_ELIGIBLE_AD`. Reproduced: `NO_MATCHING_CAMPAIGN`.
- **Not the cause:** Firestore rules, owner filters, targeting, the collection, the service worker or a user subcollection.

## 4. Firestore document path and schema (as written by creativePublish, verified in the emulator)
- **`announcements/{autoId}`:**
  - `status:'published'`, `active:true`, `archived:false`, `moderationStatus:'approved'` when an admin publishes;
  - non-admin publishes get `status:'moderation_pending'`, `active:false`;
  - `advertiserId:<uid>`, `creativeId`, `creativeVersion:1`, `publicationId`, `createdAt` (server timestamp), `startAt`/`endAt`, plus the projected ad fields.
  - Targeting (`placements`, `targetRegions`…) is set later by the admin via `adsUpdateCampaignDelivery`.
- **`creatives/{id}`:** `ownerId`, `status` (DRAFT → PUBLISHED), `publishedVersion`.
- **`creatives/{id}/versions/v{n}`:** immutable snapshot.
- **`creativePublications/{id}`**
- Test result: exactly 1 announcement and 1 publication per publish.

## 5. Query/filter/rules responsible
**No query, filter or rule defect.** Verified in the emulator:

| Item | Detail | Result |
|---|---|---|
| Rules, `firestore.rules:102-108` | Read allowed if `status=='published'`, `active==true`, owner, or admin; writes are admin-only | B reads the published ad; B is denied pending ads |
| B's listener query, 09-feed | `where status=='published'`, `where archived==false`, `orderBy createdAt desc` | Finds the ad |
| Server delivery | Queries `active==true`, `status in [...]`, `lifecycleStatus in [...]`, then the eligibility filters | Works as designed |

The responsible "filter" was the client error branch in item 3, fed by the project mismatch.

## 6. Service worker contribution
**None to this bug. It is a separate, minor issue.** I executed the real `sokohai-sw.js` in a VM (`sw.cjs`):

| Request | Result |
|---|---|
| `POST /__fn/*` (callables are POST) | Not intercepted |
| `GET /` with the server up | Network response passed through |
| `GET /` with the server down or restarting | `respondWith(undefined)` → exactly `Failed to convert value to 'Response'` and "FetchEvent network error" |

- The SW never writes to the cache (no `cache.put`/`addAll`), so it cannot serve stale code or ads.
- Your error lines appear whenever the local server is stopped or restarting.
- Not modified. A later fix would be to fall back to a real `Response` when the network fails.

## 7. Exact files modified (this task)
- `functions/local-server.js` (+38/−2)
- `js/app/00-bootstrap.js` (+34/−2)
- Diff: `/home/user/SokoHai-ads-trace/ads-auth-fix.diff`
- Not changed: creativePublish, rules, the ads delivery engine, the controller, the SW, the 61 checker, and the Phase 2 files.

## 8. Minimal changes made
1. **`local-server.js` `serveIndex`:** in **emulator mode only**, it also injects `window.SKH_EMULATOR={projectId, firestore:{host,port}, authUrl}`, read from `GCLOUD_PROJECT`, `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST`. In PROD_DATA mode nothing is injected.
2. **`local-server.js` `handleCallable`:** the response is unchanged (still 401 UNAUTHENTICATED). The log now names the cause, e.g. `token ni ya project "sokonet-3b847", server inatarajia "demo-sokohai"…`.
3. **`00-bootstrap.js`:**
   - Adds imports for `connectAuthEmulator` and `connectFirestoreEmulator` (confirmed exported by the 10.8.1 CDN modules).
   - `skh.emulator` is active **only if** all of these hold: `isLocalEnv`; `SKH_LOCAL_FUNCTIONS_SERVER===true`; `SKH_EMULATOR` present; projectId matches `demo-*`; a Firestore host/port is given.
   - When active, it uses the emulator projectId and connects Auth and Firestore to the emulators. Otherwise behaviour is byte-for-byte the same as before.
   - Guard test (`guard.cjs`): 7/7. It stays **off** on Netlify and Firebase Hosting even if `SKH_EMULATOR` is forged, on a plain localhost server, in PROD_DATA mode, with a production projectId, or with incomplete config. It is on only in the intended case.

## 9. Before / after
| | Before | After |
|---|---|---|
| Browser project (via local server, emulator mode) | sokonet-3b847 (production Auth + Firestore) | demo-sokohai (Auth + Firestore emulators) |
| creativePublish | 401 Unauthenticated (bridge) | ok, announcement created |
| Account B Home slot | 401 → slot hidden | `DELIVERED` (A's ad) |
| Creative drafts written to | **production** Firestore | emulator |
| Foreign/production token to local emulator server | 401 (generic log) | 401 (log explains the cause); **auth not weakened** |
| Production hosting | — | unchanged |

## 10. Auth tests (E2E, Firebase web SDK 10.8.1, `httpsCallableFromURL` like `skh.wrapCallable`)
- Unauthenticated `creativePublish` → `functions/unauthenticated`: **PASS**
- Authorized A (admin) `creativePublish` → ok, no 401: **PASS**
- Unauthorized B publishing A's creative → `permission-denied`: **PASS**
- Production-project token → still 401: **PASS** (`repro.mjs`)

## 11. Account A/B visibility tests
- UIDs change on every run because the emulator is wiped; the last run is in `e2e_after.txt`.
- **A:** sees the ad in the admin listener query. **PASS**
- **B:**
  - sees the ad in the normal 09-feed listener query. **PASS**
  - direct `getDoc(announcements/<id>)` is allowed. **PASS**
  - `adsRequestDelivery` returns **DELIVERED** with this campaign. **PASS**
- **Signed-out visitor:** DELIVERED, as the existing public-ad design intends. **PASS**
- **Targeting:** set through the admin Delivery Settings call (`targetRegions:'arusha'`).
  - A fresh viewer in arusha gets the targeted ad on the first request. **PASS**
  - A mwanza viewer never gets it. **PASS**
- **Expired:** not delivered (reasons `CAMPAIGN_EXPIRED | CONTEXT_REGION_MISMATCH`). **PASS**
- Every negative delivery check is guaranteed to be a real selection (0 throttled or cooldown responses).

## 12. Ownership / security tests (all PASS)
- **B is denied:**
  - updating, deleting, or directly creating an announcement;
  - reading or editing A's creative;
  - creating a creative owned by A;
  - replacing A's announcement via `creativePublish` (`permission-denied`);
  - changing A's campaign targeting (`adsUpdateCampaignDelivery` → `permission-denied`).
- A's announcement is unchanged after these attempts.
- **Drafts and pending ads:**
  - a draft creative is unreadable by B;
  - a non-admin publish goes to `moderation_pending`, `active:false`;
  - B cannot read it, it is absent from B's query, and it is never delivered (4 fresh viewers);
  - its owner C can still see it.
- **E2E total: 32/32.**

## 13. The 61 checker: all 11 checks
I ran the real files (`20-search-chat`, `61`, `56`, `79`, `81`) in jsdom on a controlled clock (`check61.cjs`). It reproduces your "2 failed of 11".

| # | Check | Result |
|---|---|---|
| 1 | 1 AUTH: currentUser exists | PASS |
| 2 | 1 IDENTITY: AUTH UID == PROFILE UID | PASS |
| 3 | 1 OFFLINE: No fake email | PASS |
| 4 | 2 PRODUCTS: 39-showcase-logic exists | PASS |
| 5 | **2 SEARCH: handleSearch debounced** | **FAIL** |
| 6 | 3 CHAT: Chat privacy patched | PASS |
| 7 | 3 NEGO: Nego form structured | PASS |
| 8 | 4 CART: Cart patched | PASS |
| 9 | 5 TOKEN: secureToken crypto | PASS |
| 10 | 6 ESCROW: Escrow guard exists | PASS |
| 11 | **8 UI: Bottom nav fix** | **FAIL** |

- **Check 5:**
  - Expected: `window.handleSearch._patched61`.
  - Actual: false, because `20-search-chat.js` re-wraps `handleSearch` on a 300 ms interval (for about 12 s) whenever `__skhWrapped` is missing. 61 wraps it at 1.0 s; about 300 ms later it is re-wrapped and the flag is gone.
- **Check 11:**
  - Expected: `window.closeModals._patched61`.
  - Actual: false. 61 wraps it at 0 / +600 / +800 ms. Then `81-absolute-one-ui-live` (at 1 s and 2.5 s) and `56-nav-back` (at 1.5 s) wrap it again, and their flag-copy lists do not include `_patched61`.
- **Verdict:** both are **stale checks, not broken features**. 61's wrappers are still in the call chain, because the outer wrappers call the inner ones. They are unrelated to ads.
- Line meanings in your log:
  - `:604` is the 11-row table;
  - `:606` is the warning listing the 2 failures;
  - `:41` is only the identity table (the mismatch warning would be line 43).
- **Not modified.** Your rule was to change the checker only if its expectation is wrong. It is wrong, but fixing it means touching the checker or UI wrappers unrelated to this bug, so I held off. The one-line option is to add `'_patched61'` to the chain-flag lists in 79/81 and have 56 copy it. This awaits your approval.

## 14. Regression tests
| Suite | Result |
|---|---|
| Phase 1 security (emulator) | **57/57** |
| Phase 2 security (emulator) | **28/28** |
| local_functions_server, ads_delivery_engine, ads_local_delivery_regression, ads_governance, creative_system, creator_studio_upgrade, noncanvas_ad_designer, unified_ad_designer, functions_resilience, home_ads_product_cards_contract | all **PASS** |
| `npm test` chain (per file) | **39 pass / 1 fail of 40**, the same baseline. The failure is the pre-existing `test_chat_authority_contract` (stale fonts copy). |
| E2E ads auth/visibility | **32/32** |
| Bootstrap guard | **7/7** |
| Node syntax check (both files) | OK |

## 15. `git diff --check`
Clean (no output).

## 16. `git status` (repo `~/SokoHai-phase1`, HEAD `afdfe61`)
```
 M firestore.rules                 (Phase 2, awaiting approval)
 M functions/index.js              (Phase 2)
 M functions/local-server.js       ← this task
 M functions/negotiation.js        (Phase 2)
 M js/17-pesapal-return.js         (Phase 2)
 M js/app/00-bootstrap.js          ← this task
 M js/app/16-pos-admin-jobs.js     (Phase 2)
 M js/app/52-transport-inbox.js    (Phase 2)
 M package.json                    (Phase 2)
 M tools/test_phase1_security.mjs  (Phase 2)
?? tools/test_phase2_security.mjs  (Phase 2)
```

## 17. Confirmations
- LOCAL ONLY
- Emulator only (`demo-sokohai`)
- No production reads or writes
- No deploy, no commit, no push
- No Phase 3

---

## Important notes for you
1. **Your earlier "local" testing wrote to PRODUCTION Firestore.**
   - The browser was on `sokonet-3b847`, so creative drafts saved from `localhost:5055` went to production `creatives`. The failed publish writes nothing else.
   - You may want to review or remove those test drafts in production. I did not touch production.
2. **How to use it now:**
   - Start the emulators and the local server in emulator mode, as before.
   - Open **`http://localhost:5055`**, then sign up or sign in with an **emulator** account. Production accounts do not exist in the emulator. For admin, create `rshabansaid@gmail.com` in the emulator.
   - The console should show `[SokoHai] LOCAL EMULATOR: project demo-sokohai …`.
3. **Netlify site plus `skhUseLocalFunctions()` against an emulator server** will still return 401. That mismatch is inherent (production Auth vs emulator). The server log now says so explicitly.
4. **Residual, out of scope, not changed:**
   - `54-error-core.js` (a diagnostic probe) and `17-pesapal-return.js` (REST sign-up) call production REST endpoints directly, even in emulator mode.
   - A latent bug: `creativePublish` returns INTERNAL if a stored creative lacks `durationAuto`/`basicType` (undefined values reach the Admin SDK). Creatives built by the UI always include them; legacy ones may not.
   - Standard emulator behaviour: in emulator mode the Admin SDK accepts unsigned emulator tokens. The local server binds 127.0.0.1 only.
