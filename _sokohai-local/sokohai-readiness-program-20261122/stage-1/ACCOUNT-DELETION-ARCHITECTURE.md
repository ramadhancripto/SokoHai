# Stage 1 — Account deletion architecture (PROPOSAL — not implemented)

| | |
|---|---|
| Date | 22 Nov 2026 |
| Status | **READY FOR APPROVAL** (design) |
| Modified | nothing |

## Stage header

| | |
|---|---|
| **Objective** | A responsible, Spark-compatible deletion process with retained records, that matches the privacy policy |
| **Existing evidence** | Stage 0 discovery |
| **Work** | design; security review; UI plan; implementation plan |
| **Dependencies** | Stage 0 |
| **Owner input** | decisions D1–D8 below (also in `OWNER-REQUIREMENTS-AND-DECISIONS.md`) |
| **Risks** | data loss, orphan records, broken counterparties, abuse (forced deletion), money stuck in a deleted account |

**Deliverables:**

- this file;
- `DATA-RETENTION-AND-ANONYMIZATION.md`;
- `ACCOUNT-DELETION-SECURITY-REVIEW.md`;
- `ACCOUNT-DELETION-UI-PLAN.md`;
- `ACCOUNT-DELETION-IMPLEMENTATION-PLAN.md`.

## 1. Current state

| User can… | Status | Evidence |
|---|---|---|
| view account information (own profile, listings, orders, chats) | VERIFIED (in-app views) | `64-my-profile.js`, dashboards |
| correct personal information | VERIFIED (self-edit, non-privileged keys) | rules `users` update |
| request access to their data | PARTIALLY: via support request only; no export | `130-support-center.js` |
| request account deletion | PARTIALLY: support request "Faragha na data yangu"; no dedicated flow | same |
| track request status | PARTIALLY: support request status | same |
| contact support about privacy | VERIFIED (in-app) / NOT IMPLEMENTED (e-mail, PENDING) | contact page |
| withdraw consent (public phone) | VERIFIED | profile switch |
| self-service deletion | NOT IMPLEMENTED | — |

## 2. Options considered

| Option | How | Spark | Pros | Cons |
|---|---|---|---|---|
| A. Client deletes everything itself (`deleteUser` + client deletes) | browser | ✅ | instant | rules deny deletes on most collections (good); would need loosening rules → **security risk**; cannot touch Cloudinary or other parties' docs; partial failures leave orphans |
| B. Cloud Function `accountDeleteRequest` / scheduled executor | server | ❌ **needs Blaze** | automated, atomic | paid plan; currently not allowed |
| **C. Request in app → admin review → owner-run Admin SDK executor (recommended)** | browser writes a request; owner runs `tools/account_deletion.mjs` (same pattern as `content_cleanup.mjs`) | ✅ | no rule loosening; manifest + backup + hash confirm; Auth user deleted last via Admin SDK; works today | manual step for the owner; response time depends on the owner (set an SLA, e.g. ≤ 30 days, LEGAL) |
| D. Auth "disable" only (soft) | `updateUser(disabled)` | ✅ (owner script) | reversible | not a deletion; data remain |

**Recommendation: C.** Use D (disable) **immediately at approval** as a safety step during the pending period. When Blaze is ever enabled, the executor can move into a function without changing the data model.

## 3. Proposed process (Option C)

1. **Request (user, in app):** Settings → "Faragha na data yangu" → "Futa akaunti yangu".
2. **Re-authentication:**
   - Google users: `reauthenticateWithPopup`;
   - password users: `reauthenticateWithCredential`.
   - This uses the existing Auth SDK, imported from the same `firebase-auth` module; no new module.
3. **Pre-checks (client, informational):** the client checks what it can read:
   - open orders, active negotiations, money (wallet balance, escrow), active store with staff, agent with members.
   - It shows blockers ("Maliza oda 2 kwanza" = finish 2 orders first).
   - The **executor re-checks on the server side**; the client check is not trusted.
4. **Warning and confirmation:** what is deleted, what is kept and why (links to the privacy policy), typed confirmation ("FUTA").
5. **Record:**
   - create `support_requests/{rid}` with `category: 'privacy'`, `relatedRef: 'account_deletion'`, `uid`, `createdAt`, `status: 'open'` (fits the existing rules; no rule change);
   - set `users/{uid}.deletionRequestedAt` / `deletionStatus: 'requested'`.

   This needs a small rules addition **for the `users` keys only**: allow these two keys, owner-only, and **no `deletionStatus` beyond `requested` / `cancelled` from the client**.
6. **Pending period:** D1, proposal 14 days. The user can cancel ("Ghairi ombi"), which sets `deletionStatus: 'cancelled'`.
7. **Admin review:** the Admin Control Center / Admin Portal lists deletion requests (read-only on Spark), checks blockers, and approves by setting `support_requests.status = 'in_progress'`.
8. **Execution (owner, Admin SDK, `tools/account_deletion.mjs`):**
   - `inventory --uid=` → manifest (delete / anonymise / retain / blockers), hash;
   - `backup` → encrypted local backup (owner machine);
   - `execute --confirm=<hash>` → batches.
   - Order of operations:
     1. disable Auth;
     2. anonymise or delete Firestore;
     3. Cloudinary delete (with owner Cloudinary credentials, optional step);
     4. write the audit entry;
     5. `admin.auth().deleteUser(uid)` **last**.
9. **Confirmation:**
   - `support_requests.status = 'resolved'`;
   - tombstone `users/{uid}` (`deleted: true`, `deletedAt`, no personal fields);
   - optional e-mail by the owner (no automatic mailer on Spark).
10. **Appeal / support:** a new support request; the backup is kept for D6 days, then destroyed (LEGAL).

## 4. What is not done automatically

- Other users' copies of shared conversations: kept, with the deleted user shown as "Mtumiaji aliyefuta akaunti" (LEGAL to confirm).
- Financial, order, moderation and audit records: retained, pseudonymised in display fields (see the retention file).

## 5. Owner decisions for this stage

| ID | Decision |
|---|---|
| D1 | Pending period: 0 / 7 / **14** / 30 days |
| D2 | Response deadline (SLA) for executing requests (LEGAL under PDPA) |
| D3 | Chats: anonymise sender in shared conversations (recommended) vs delete the user's messages for everyone |
| D4 | Business / store with staff or sales: block until transferred/closed (recommended) vs close automatically |
| D5 | Seller with past orders: archive listings (recommended) |
| D6 | Backup retention after deletion (e.g. 30 days, LEGAL) |
| D7 | Whether to delete Cloudinary media (needs Cloudinary API key/secret on the owner machine; never in chat) |
| D8 | Who executes: owner only, or also admins with an Admin SDK key |
