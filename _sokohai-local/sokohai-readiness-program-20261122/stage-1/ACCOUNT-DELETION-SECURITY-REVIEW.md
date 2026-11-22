# Account deletion — security review

**Date:** 22 Nov 2026. Covers the current state (FACT) and the proposed design.

## Current state (FACT)

| Threat | Current protection | Evidence |
|---|---|---|
| A user deletes another user's profile | `users`: `allow delete: if false` for everyone | `firestore.rules` `users` block |
| A user deletes financial, order or report records | delete denied on `orders`, `offers`, `negotiations`, `sokopay_*`, `support_requests`, `listing_reports` and more | rules (see `DEPENDENCY-MAP.md`) |
| A user changes privileged fields (role, status, wallet) | `unchanged(privilegedUserKeys())`, `unchanged(['walletBalance'])`, `unchanged(['trust'])` | rules lines 467 and 537+ |
| An admin edits someone else without trace | `adminStampOk()` + `usersAdminAudit` (function; not on Spark) | rules |
| Account suspension abuse | callable `adminSetAccountStatus` checks the admin claim (server) | `functions/admin-authority.js` |
| A callable deletes an account | **no deletion callable exists** | `git grep` |
| Storage rules | not applicable (no Firebase Storage) | — |
| Cloudinary | **unsigned preset**: anyone holding the preset can upload; deleting needs the API secret | `js/11-uploads.js` line 28 |

## Proposed design risks and mitigations

| Risk | Mitigation |
|---|---|
| Forged deletion request for another uid | **already enforced (FACT):** `support_requests` create requires `uid == request.auth.uid`, a fixed key list, `status == 'open'` and an `SR-` reference (`firestore.rules` lines 2587–2603). A deletion request fits the existing schema as `category: 'privacy'` + `relatedRef: 'account_deletion'`, so **no rule change is needed for the request**. `users.deletionStatus` must be writable only by the owner, with values `requested` / `cancelled` |
| Stolen session requests deletion | **re-authentication** in the client (UX) **plus** the pending period (D1) **plus** admin review; the executor confirms the requester e-mail matches the Auth record |
| Client skips re-authentication | Firebase rules cannot see re-auth time, but `request.auth.token.auth_time` is available in rules: require `auth_time` within 5 minutes for the `deletionStatus` write. **TECH: confirm token field support in the emulator test** |
| Mass-request spam | one open deletion request per uid (doc id = uid in a sub-collection, or a rules check); support cooldown already 60 s (`COOLDOWN_MS`) |
| Executor misuse | owner-run only; requires `--confirm=<manifest hash>`; refuses if the data changed; refuses outside the emulator without `SKH_ALLOW_PRODUCTION_WRITE=1` (same safeguards as `content_cleanup.mjs`, 17/17 tests) |
| Money lost | executor blocks when `walletBalance` ≠ 0, escrow is open, or a withdrawal is pending |
| Admin deletes the wrong person | manifest shows the uid, e-mail and counts; backup before execute; audit entry in `admin_audit_log` (`actorUid`, `deletionRef`) |
| Super-admin self-deletion | executor refuses for admin/superAdmin accounts and for the owner e-mail hard-coded in rules |
| Agent with members | blocked until reassignment |
| Rate limiting | no server on Spark; cooldown and one-request rule in the client/rules; admin review gate |

## Rules changes that would be needed (for approval; not made)

1. `users/{uid}` update: allow `deletionStatus` ∈ {`requested`, `cancelled`}, `deletionRequestedAt` = `request.time`, only by the owner and only with recent `auth_time`.
2. `support_requests`: **no change**. The existing schema (`category: 'privacy'`, `relatedRef: 'account_deletion'`) is used; the requester can already close (cancel) their own request.
3. **No delete permission is added anywhere.** Deletion stays server/Admin-SDK only.
