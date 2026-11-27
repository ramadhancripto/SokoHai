# Security findings — client side (PART 2)

Date: 2026-11-24 · Baseline commit: `b4078f2b` · Scope: browser code only (`js/`, `shared/`, generated `index.html`).
Cloud/server work is **not** included here (see `SokoHai-audit/REGISTER-B-DEFERRED-CLOUD.csv`).

## What was checked

- committed secrets, `.env`, service-account keys, PINs, tokens → **none found**
- media upload path (`js/11-uploads.js`, Cloudinary preset vs signed uploads)
- admin authorisation on the client (all UI gates that consult `MY_ADMIN_EMAIL`)
- wallet/escrow write paths (`js/app/69-chat-groups.js`, `js/app/74-group-order-system.js`, `js/16-wallet.js`)
- PIN handling (`js/app/31-agent-assist.js`, `memberSecrets` rules)
- `system/{doc}` readability, Firebase Storage usage

## Fixes in this change set

### C1 — admin UI gate now matches `firestore.rules::isAdmin()`

`skh.MY_ADMIN_EMAIL` was compared by hand in nine places with **no** `emailVerified`
check, while `firestore.rules` only honours the owner e-mail when
`request.auth.token.email_verified == true`. The client was therefore *weaker* than
the server: an unverified address could see admin controls that the server would
reject.

- `js/app/00-bootstrap.js` — added `skh.isAdminEmailFallback(user)` and
  `skh.isAdminUser(user)`: claims first (`isAdmin` / `admin` / `role:'admin'` /
  `superAdmin`), then the owner e-mail **only** when `emailVerified === true`.
  The fallback is opt-*out* (`SOKOHAI_CONFIG.ADMIN_EMAIL_FALLBACK === false`), so
  the owner can never be locked out by a missing config file.
- Call sites migrated: `01-market.js`, `09-feed-announcements.js` (×2),
  `16-pos-admin-jobs.js` (×3), `101-marketplace-ads-studio.js`,
  `96-ad-delivery-controller.js` (keeps a guarded parity copy so it stays correct
  when the bootstrap import is stubbed/stale).
- `96-ad-delivery-controller.js` no longer trusts `user.admin === true` — that is a
  field a user can write on their own document, so it was never authority.

### C2 — wallet movement contract: complete = balance **and** ledger

`firestore.rules` makes the wallet server-only (`users` update requires
`unchanged(['walletBalance'])`, `wallet_ledger` is `allow write: if false`). A wallet
movement is **two required writes** — `users.walletBalance` and a `wallet_ledger` row.
Earlier code swallowed the denial and returned `ok: true`; a later revision returned
`ok: true` when *either* write landed, which is still unsafe:

| Outcome | Old | Now |
|---|---|---|
| both land | ok | `ok:true, complete:true` |
| balance lands, ledger fails | ok:true (money moved, no audit row) | `ok:false, reason:'partial_write', partial:true, needsReconciliation:true` |
| ledger lands, balance fails | ok:true (audit row claims money that never moved) | `ok:false, partial:true` (balance is written first, so this path is normally unreachable — no orphan ledger) |
| neither lands | ok:true | `ok:false, reason:'server_required', partial:false` |

`js/app/69-chat-groups.js`
- `gcoWalletAdd` returns the contract above, records `window.skhWalletFailures[]`, and only
  updates the local balance mirror when **both** writes landed.
- A partial attempt is remembered in `window.skhWalletAttempts`; a later call for the same
  `uid|kind|orderDocId` returns `{ok:false, reason:'needs_reconciliation'}` **without writing**,
  because the half that already landed cannot be discovered from the browser and a blind retry
  could pay twice.
- Idempotency is unchanged: an existing ledger row still returns `already:true` (checked before
  any write, and after the partial-attempt guard).
- The four call sites (`pay`, `reject_order`, `confirm_received` ×release+fee) no longer continue
  into `fin(...)` when the movement did not complete; they return `hold_failed` / `refund_failed` /
  `release_failed` / `fee_failed` with the partial flags. The order document is left untouched.

`js/app/74-group-order-system.js`
- `settlementRelease` marks `settlementReleased:true` only when the seller movement completed
  (balance **and** ledger) and, when a transporter fee is due, that movement completed too;
  otherwise it returns `partial_write` / `partial_settlement` and the package stays pending.
- `autoReleaseCheck` now **settles first** and only then writes `releaseTransactionId`,
  `autoReleased` and the participant `COMPLETED` state — previously those markers were written
  before the money moved, so a failed settlement looked released and `releaseTransactionId`
  blocked every retry.
- `confirmReceipt` returns `settlement` + `settlementComplete` so the UI never assumes a release.

**Limitation (documented, not worked around):** two documents cannot be written atomically from
the browser under these rules. Atomic completion requires a server transaction — deferred to
B-03/B-01 (needs Blaze). No client-side substitute was introduced: no shadow ledger, no
localStorage accounting, no retry loop.

### C3 — private documents never reach the public upload preset

`skhUploadFromFile` already refused the unsigned fallback for `identity` when the signing
service was unreachable, but accepted a server reply of `{mode:'unsigned'}`
(`functions/upload-signing.js:87`), and matched the literal folder `identity` only.

Now `window.skhUploadIsSensitiveFolder(folder)` normalises the path (decodes `%XX`, splits on
`/` and `\`, trims, lower-cases, strips edge dots) and matches **any path segment** against
`identity, identities, id, ids, id_docs, kyc, aml, verification(s), verify, document(s),
passport, licence/license, nida, private`. Sensitive folders require `mode === 'signed'`;
anything else fails closed with `signed_upload_required`. Path variations such as
`identity/photos`, `sokohai/identity`, `Identity/`, `%69dentity` are covered by tests.
Ordinary folders (`products`, `avatars`, `ads/*`, `uploads/market`) are unchanged.

## Tests

- `tools/test_client_security_part2.mjs` (new, 92 assertions) reads the shipped
  files, extracts the real functions and drives them, so a future edit that
  re-weakens any guard turns it red. Wired into `npm test`.
- `tools/test_ads_local_delivery_regression.mjs`: stub now models a verified owner
  (as Firebase does) and asserts an **unverified** owner no longer gets the admin
  preview.
- `tools/test_unified_ad_designer.mjs`: stub mirrors the bootstrap admin contract.
- `npm test`: 1128 assertions, 0 failures (baseline 1035; the +93 delta is this suite's 92
  assertions plus one new ads-regression assertion — no pre-existing assertion changed).
- Emulator suites (×2): phase1 57, phase2 41, phase3 34, conversation 8,
  ride privacy 52 — 0 failures.

## Deliberately **not** changed

- `js/app/31-agent-assist.js` PIN hashing (12 000 iterations) — changing it would
  invalidate every stored PIN; the fix belongs on the server (`memberAuthenticate`).
  Keep the 0-attempt rule: the client cannot lock out or rotate a PIN by design.
- `js/app/55-escrow-guard.js` — already checks the server reply before writing
  `escrowStatus:'Released'`.
- `firestore.rules` and `firestore.indexes.json` — not rewritten, not deployed.
- Cloudinary cloud/preset settings — dashboard action for the owner, not code.

## Known gap that code cannot close

The unsigned Cloudinary preset (`dt7erwy1r` / `Sokohai_preset`) is public: anyone
who reads the page can upload to it until the preset is made signed and the folder
is locked in the Cloudinary console.
