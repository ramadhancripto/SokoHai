# SokoHai: Final Checkpoint Report (Phase 1 + Phase 2 P1–P6 + Ads auth/visibility)

| | |
|---|---|
| **Checkpoint commit** | `b054888e8434fb974415c45bc31af32a1d62cec1` (local; parent `afdfe61`) |
| **Deploy** | NOT performed |
| **Push** | NOT performed; awaiting approval |
| **Test environment** | Firebase emulators (`demo-sokohai`) + local functions server `127.0.0.1:5055` |

Harnesses and raw outputs are in `docs/checkpoint-reports/verification/` inside the ZIP, and in `/home/user/SokoHai-final/`.

---

## STEP 1: Production test-data inventory (READ-ONLY)

**Method.** Unauthenticated HTTPS GET requests to the Firestore REST API with a metadata-only field mask (no creative content). No writes and no credentials were used; scripts: `prod_inventory_readonly.py`, `prod_announcements_readonly.py`.

### ⚠ Security finding (blocks production go-live, not this local checkpoint)

**Production Firestore is serving `creatives` to anonymous users.**
- An unauthenticated request returned HTTP 200 and 30 private drafts.
- The repo rules would deny this: `creatives` read requires `signedIn() && (isAdmin() || ownerId == uid)`.
- So the **rules deployed in production are older or different from `firestore.rules` in the repo.**
- The same applies to an unfiltered anonymous list of `announcements` (14 documents).
- **What to check in Firebase Console:** Firestore → Rules. Compare the published rules and date with the repo file. The fix is a rules deploy, which is pending your approval.

### Findings

| | |
|---|---|
| `creatives` in production | **30**, all `status: DRAFT`, **all one owner `eLxmcTphB8…`** (your account), created 2026-09-23 00:36 to 2026-09-24 21:58 UTC |
| Published | **0**: no `publishedVersion`, and **0 of 14 production announcements reference them** (no production publish ever succeeded) |
| `creativePublications` | 0 |

**Group A: 15 strongly suspected leftovers of failed publish attempts.** Same title, created 0–60 s apart. This is the "save draft → publish 401 → click again" pattern:

- `b47jkPy4Hp3pQYh0ZfTm`, `cKBiyQvbuaCve4he9lyb` ("NUNUA , UZA NA AGIZA…", 13:50:25 ×2)
- `q6cybWAO4VrtETcMrV6I`, `IpVTJPu29ZUvmLw26sob` (same title, 14:27:15 / 14:27:22)
- `oGzVdYNcJJUZrD6gyGWR`, `Nmunuiu58Kevhm3ck2Wz` ("sokohai", 15:20:50 / 15:21:39)
- `fauoFwTt3xNlsdfdj96V`, `h27t56yQYpYZuN1I7oNB`, `mcEO1AldD0yBUhOBKy28`, `3JgHc0kIiNBdxmhUvjXF`, `GsdxihXNACClbuMmbJ0z` ("TAHDHARI KWA ELNINO", 18:19–18:21)
- `EJ33p8U9VEEiBhfYJAu8`, `FsWD6AzITd7zrLX2Junn` ("UZA NUNUA NA SAFIRISHA…", 19:51:19 / 19:51:26)
- `Ul0D0IwIAXpBvJ4aNZu0`, `o0Qo12JepB92aV4UqyA7` ("TAHDHARI KWA ELNINO", 21:58:06 / 21:58:12)

**Group B: 15 other drafts, probably genuine design work.** Keep them unless you decide otherwise:
- **Creator Studio drafts from 09-23:** `bcFaDXE6…`, `RVXHW18M…`, `ir1IN3tH…`, `ZP3qxlZH…`, `x3ZjKiK3…`, `R9cmrVhA…`, `LI6d7uC3…`, `GLS81GZj…`, `dUuTOhom…`, `aKNnaNHz…`.
  - These have no `basicType`, which relates to known issue #5.
- **Basic-ad drafts:** `6oAdEpHn…`, `tDdlLWwO…`, `6aNqKJaa…`, `IaY7JTIO…`, `RMXe4vmV…`.

**Limits of this inventory.**
- The data carries no origin field, so I **cannot prove which drafts came from `localhost:5055` versus the Netlify site.** The classification above is based on timing and title patterns.
- **Nothing was deleted or changed.**

**Recommended action (yours, in Firebase Console → Firestore → `creatives`):**
1. Filter `ownerId == eLxmcTphB8…`.
2. Review Group A and delete what you don't need.
3. Deploy the repo rules afterwards, with approval.

---

## STEP 2: Emulator architecture (verified in real headless Chromium): 16/16

| Check | Result |
|---|---|
| Auth emulator (9099) and Firestore emulator (8085) start | ✅ |
| Local server listens on `127.0.0.1:5055` only | ✅ |
| Browser at `localhost:5055` uses project `demo-sokohai` | ✅ |
| Browser uses the Auth emulator (`auth.emulatorConfig` = 127.0.0.1:9099; sign-up token `aud=demo-sokohai`) | ✅ |
| Browser uses the Firestore emulator (traffic to 127.0.0.1:8085) | ✅ |
| Browser uses the local functions server (`skh.callFunction` → `/__fn`, no 401) | ✅ |
| Local page makes zero requests to production Firebase endpoints | ✅ |
| Production host (same files served as `sokohaico.netlify.app`) stays on `sokonet-3b847` with Cloud callables and no emulator | ✅ |
| A forged `SKH_EMULATOR` on the production host is ignored | ✅ |
| `handleCallable` still rejects a production (`sokonet-3b847`) token with 401, for all 4 callables tested | ✅ (security not weakened) |

---

## STEP 3: Full final regression

| Suite | Result |
|---|---|
| Phase 1 security (emulator) | **57/57** |
| Phase 2 security (emulator) | **28/28** |
| Ads auth/visibility E2E (web SDK 10.8.1) | **32/32** |
| Bootstrap emulator guard | **7/7** |
| Browser verification (Chromium) | **16/16** |
| Happy-path journey (Step 4) | **12/12** |
| local_functions_server, ads_delivery_engine, ads_local_delivery_regression, ads_governance, creative_system, creator_studio_upgrade, noncanvas_ad_designer, unified_ad_designer, functions_resilience, home_ads_product_cards_contract | **all PASS** |
| `npm test` chain (40 files, run individually) | **39 pass / 1 fail** |
| Syntax checks (all 9 changed JS/MJS + package.json) | **OK** |
| `git diff --check` | **clean** |
| Secret scan (tracked + new files) | **0 hits**; no sensitive files tracked |

### Failure classification

| Failure | Class | Evidence |
|---|---|---|
| `test_chat_authority_contract` ("stale duplicate app… fonts/") | **PRE-EXISTING** | Fails identically on a clean worktree of HEAD `afdfe61`. It is also why the plain `npm test` chain stops early. |
| Happy-path J3 first run (`paymentStatus:'paid'` write returned 200) | **TEST ISSUE** (fixed in the harness) | The server had already set `paid` (index.js:295), so the write was a no-op. The corrected test proves real attempts are denied (403) for faking `paid` or `held` on an unpaid order, and for changing `paymentStatus` or `paymentVerified` after verification. |
| Node 26: `test_functions_resilience` | **TEST ISSUE** (Node ≥21 only) | The harness assigns the read-only global `navigator`. It passes on the pinned Node 20. |
| Node 26: `test_local_functions_server` "loads real callables" | **TEST ISSUE** (race) | The harness reads a partial banner. The server itself starts under Node 26 with 44 callables. |

No real regression was found. No checker or test in the repo was modified.

---

## STEP 4: Happy paths (emulator, real Auth-emulator users, browser writes through the rules)

J1–J12, all PASS:
- **J1:** the buyer creates the product order from the client.
- **J2:** a valid PesaPal payment (stub) leads to a server escrow hold, status `held`.
- **J3:** the seller cannot change amount, status, sellerEarned, payment fields or disputeWinner, and cannot fake a hold or `paid`.
- **J4:** the delivery request is created and linked once; relinking is denied.
- **J5:** the driver accepts, `agreedFare` = 3000 is snapshotted, and the fare and price are frozen.
- **J6:** auto-release is blocked while the delivery is active.
- **J7:** the seller hands over with the token; the buyer cannot fake the handover.
- **J8:** pickup/transfer token, then in transit.
- **J9:** completion releases escrow: **seller 17,000 + eligible carrier 3,000**; the order is completed.
- **J10:** the dispute refund after release is denied; completed cannot go back; `escrowRelease` returns `already`; auto-release pays nothing twice.
- **J11:** negotiation product `CONFIRM_RECEIPT` releases once.
- **J12:** negotiation service `CONFIRM_COMPLETION` releases once; the seller cannot confirm their own work.

**Ads** (E2E 32/32):
- A publishes, and B sees the ad (feed query, getDoc, and a Home slot `DELIVERED`).
- B cannot modify, delete, replace or re-target A's ad.
- Targeting: arusha is delivered, mwanza is excluded.
- Expired, draft and pending ads stay hidden; the owner still sees their own pending ad.

---

## STEP 5: Known issues

| # | Issue | Blocks checkpoint? | Scope |
|---|---|---|---|
| 1 | Legacy rides accepted before the `agreedFare` patch (no snapshot) | No | Future maintenance: a one-off admin review/backfill of in-flight legacy rides before deploy |
| 2 | SW network-error handling (`respondWith(undefined)` when the server is down) | No; cosmetic, never touches callables or data | Future maintenance |
| 3 | `61-full-system-repair.js` stale flags (2/11: SEARCH, Bottom nav) | No; the features work and the checks are stale | Future maintenance |
| 4 | Direct production REST calls in `54-error-core.js` / `17-pesapal-return.js` | No for this checkpoint; note for local-only testing | Future maintenance |
| 5 | Legacy creatives missing `durationAuto` / `basicType` → `creativePublish` INTERNAL | No (UI-built creatives have both) | Future maintenance. **10 such production drafts exist** (Group B) |
| 6 | Node 20 runtime vs Node 26 on your machine | No: 57/57 and 28/28 pass under Node 26 and functions load; only 2 test harnesses break | **Future, time-sensitive:** Cloud Functions nodejs20 is decommissioned 2026-10-30; move to Node 22 before the next deploy |
| **7 (new)** | **Production Firestore rules differ from the repo** (anonymous read of `creatives`) | Not the local checkpoint, but it **blocks a safe production launch** | Deployment step (rules deploy, with approval) |

---

## STEP 6: Security review of the commit
- **Only the 11 intended files:** the Phase 2 files plus 2 Ads files (`functions/local-server.js`, `js/app/00-bootstrap.js`).
- No secrets, service accounts, `.env`, backups, logs or generated junk. `firestore-debug.log` is git-ignored and excluded.
- **No UI or design changes.** The client hunks only remove client-side money/completion writes (authority moves to the server).
- No destructive migration and no data migration.
- **Production writes by tests: none.** Production contact in this session was limited to the read-only Step 1 GET requests. All browser attempts to reach production were aborted by the harness.

## STEP 7: Commit
```
git -c user.name="SokoHai Engineer" -c user.email="engineer@sokohai.local" commit -F <message>
→ b054888 Phase 2 (P1-P6) server authority + local emulator ads auth/visibility fix
   11 files changed, 1049 insertions(+), 93 deletions(-)
```
The identity matches the existing history. It was passed per command; no git config was changed.
