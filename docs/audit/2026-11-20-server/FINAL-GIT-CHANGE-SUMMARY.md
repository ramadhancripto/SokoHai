# Final Git change summary

## 1. Where the work is

| | |
|---|---|
| Working directory (cloud session) | `rem/` worktree of `ramadhancripto/SokoHai` |
| Branch | `remediation/server-20261120` (local only) |
| Base commit | `d8cba09f946fbde4b796fb3a47b03b907263febb` (`remediation/final-20261120`; **not on GitHub yet**) |
| `origin/main` | `fe8b8a3` (unchanged) |
| HEAD | `d8cba09` (no new commit: **the owner did not authorise a commit**) |
| Pushed / merged / deployed | **No / No / No** |

**Where the work is NOT.** The owner's folders `C:\Users\user\Desktop\real sokohai\real-sokohai-complete` and `…\sokohai-remediation` were **not modified**. Only new files were added in `_sokohai-local\` (see §4). The previous sessions' work (`fe8b8a3`, `d8cba09`) is unchanged. This branch adds the server remediation on top of `d8cba09`.

## 2. `git status --short` (final tree; screenshots `*.png` and the untracked `functions/node_modules`, `out/` omitted)

```
 M functions/admin-authority.js
 M functions/ads-delivery.js
 M functions/auction-admin.js
 M functions/business-store-authority.js
 M functions/business.js
 M functions/commerce-modes.js
 M functions/creative.js
 M functions/group-buy.js
 M functions/group-soko.js
 M functions/index.js
 M functions/inventory-authority.js
 M functions/inventory-reservation.js
 M functions/live-commerce.js
 M functions/negotiation.js
 M functions/pilot-ops.js
 M functions/price-drop-queue.js
 M functions/push.js
 M functions/reporting-authority.js
 M functions/routing-core.js
 M functions/routing.js
 M functions/search-index.js
 M functions/setup-status.js
 M functions/stories.js
 M functions/upload-signing.js
 M functions/user-cards.js
 M functions/verification.js
 M js/00-config.js
 M js/app/00-bootstrap.js
 M js/app/62-missing-features.js
 M js/app/65-content-l10n.js
 M package.json
 M tools/g1/test_phase7_server_lifecycle.mjs
 M tools/g1/test_transport_market.mjs
 M tools/test_callable_names.mjs
 M tools/test_pos_return_authority.mjs
?? docs/audit/2026-11-20-final/GIT-CHANGE-SUMMARY.md     (from the previous session; left as is)
?? docs/audit/2026-11-20-server/                         (8 reports)
?? functions/authz.js
?? functions/errors.js
?? tools/test_admin_authz_matrix_emulator.mjs
?? tools/test_callables_g1_emulator.mjs
?? tools/test_callables_g1b_emulator.mjs
?? tools/test_client_error_states_browser.mjs
?? tools/test_server_error_contract_emulator.mjs
?? tools/test_triggers_schedules_emulator.mjs
```

## 3. Changed tracked files (`git diff --stat d8cba09`)

```
     functions/admin-authority.js              |  31 ++---
     functions/ads-delivery.js                 |  11 +-
     functions/auction-admin.js                |   5 +-
     functions/business-store-authority.js     |   3 +-
     functions/business.js                     |   3 +-
     functions/commerce-modes.js               |  10 +-
     functions/creative.js                     |   6 +-
     functions/group-buy.js                    |   7 +-
     functions/group-soko.js                   |   5 +-
     functions/index.js                        | 195 ++++++++++++++++++------------
     functions/inventory-authority.js          |  11 +-
     functions/inventory-reservation.js        |  10 +-
     functions/live-commerce.js                |  16 +--
     functions/negotiation.js                  |  15 +--
     functions/pilot-ops.js                    |   3 +-
     functions/price-drop-queue.js             |   5 +-
     functions/push.js                         |   3 +-
     functions/reporting-authority.js          |   3 +-
     functions/routing-core.js                 |  13 +-
     functions/routing.js                      |  40 ++++--
     functions/search-index.js                 |   7 +-
     functions/setup-status.js                 |   9 +-
     functions/stories.js                      |   6 +-
     functions/upload-signing.js               |   3 +-
     functions/user-cards.js                   |   3 +-
     functions/verification.js                 |   5 +-
     js/00-config.js                           |   3 +
     js/app/00-bootstrap.js                    | 140 +++++++++++++++------
     js/app/62-missing-features.js             |   6 +-
     js/app/65-content-l10n.js                 |   5 +
     package.json                              |   4 +-
     tools/g1/test_phase7_server_lifecycle.mjs |   7 +-
     tools/g1/test_transport_market.mjs        |  23 +++-
     tools/test_callable_names.mjs             |  16 ++-
     tools/test_pos_return_authority.mjs       |   4 +-
     35 files changed, 405 insertions(+), 231 deletions(-)
```

**New files (lines):**

| File | Lines |
|---|---|
| `functions/errors.js` | 147 |
| `functions/authz.js` | 50 |
| `tools/test_callables_g1_emulator.mjs` | 296 |
| `tools/test_triggers_schedules_emulator.mjs` | 236 |
| `tools/test_server_error_contract_emulator.mjs` | 169 |
| `tools/test_client_error_states_browser.mjs` | 142 |
| `tools/test_callables_g1b_emulator.mjs` | 113 |
| `tools/test_admin_authz_matrix_emulator.mjs` | 86 |

**What changed, by group:**

- `functions/*`: shared error contract (`onCall` from `./errors`), one admin policy (`authz`), typed PesaPal / USER_MISSING / signing errors, routing `mapError` fix, `logBestEffort` on best-effort catches.
- `js/*`: error classification and Swahili texts, circuit breaker, the two feature flags.
- `package.json`: 5 new emulator suites in `test:security:all:emulator` and `test:ci:emulator`.
- Edits to existing tests, each explained in SERVER-REMEDIATION-EXECUTION §3:
  - `test_callable_names`: guard checks;
  - `test_pos_return_authority`: the double throws the real `HttpsError`;
  - `g1/test_phase7_server_lifecycle`: L1 expects the SRV-06 typed code.

## 4. Delivered to the owner's computer (new files only, nothing overwritten)

Folder `C:\Users\user\Desktop\real sokohai\real-sokohai-complete\_sokohai-local\`:

| File | Purpose |
|---|---|
| `sokohai-server-remediation-20261120-v2.patch` | **the current, complete change set**. It supersedes the earlier `sokohai-server-remediation-20261120.patch`, which is kept unchanged but lacks the C2 test correction and the report updates. (tracked diffs + new files + reports). Verified with `git apply --check` on a clean copy of `d8cba09`. |
| `ripoti-server-final-20261120\*.md` | the 8 reports |
| `sokohai-app-icon-android-res-20261120.zip`, `sokohai-app-icon-pwa-play-20261120.zip`, `sokohai-icon-mask-preview.png` | Android/PWA/Play launcher icons made from the owner's image (not applied). The full pack, including the 1024 master, is in the chat download. |

## 5. How the owner can review and apply (when ready; not done by Claude)

The patch sits on top of `d8cba09`. The `sokohai-remediation` worktree has that commit through `sokohai-remediation.bundle`.

```
cd "C:\Users\user\Desktop\real sokohai\sokohai-remediation"
git status                                   # must be clean
git switch -c remediation/server-20261120 d8cba09
git apply --check "..\real-sokohai-complete\_sokohai-local\sokohai-server-remediation-20261120-v2.patch"
git apply        "..\real-sokohai-complete\_sokohai-local\sokohai-server-remediation-20261120-v2.patch"
git status                                   # review; then add files BY NAME (no `git add .`)
```

Commit, push and merge only after review. **Never force-push.**

## 6. Remaining blockers (external)

1. Firebase Blaze billing → deploy of functions, Scheduler and secrets (SRV-01).
2. Staging project + smoke tests (SERVER-STAGING-READINESS §5).
3. Push/merge `d8cba09` and this branch after review (SRV-13).
4. `SUPER_ADMIN_EMAILS`, IAM Token Creator, PesaPal sandbox keys (env/Secret Manager only), IPN registration after deploy.
5. App icon: approval to apply, and where the APK is built; `assetlinks.json`.
6. Product decisions:
   - staff-invite UI;
   - feature flags `contentTranslation` and `offlineMemberTokenSignIn`;
   - retire/update the stale C4 assertion in `g1/test_transport_market` (C2 resolved).
