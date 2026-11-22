# Account deletion — implementation plan

**Date:** 22 Nov 2026.

**Status:** NOT EXECUTED. Waiting for approval of D1–D8.

| Step | Work | Files (existing reused) | Tests (emulator) | Effort | External cost |
|---|---|---|---|---|---|
| 1 | Rules: `deletionStatus` / `deletionRequestedAt` owner-only with recent `auth_time`. `support_requests` unchanged (`category:'privacy'`, `relatedRef:'account_deletion'`) | `firestore.rules` | new `test_account_deletion_rules_emulator.mjs`: own request ok; other uid denied; stale auth denied; no delete permission anywhere | 0.5 day | none |
| 2 | Privacy & data section + deletion flow with re-auth, blockers, confirm, cancel | `130-support-center.js`, settings screen, `32-i18n.js` (keys), `00-bootstrap.js` (export `reauthenticateWithPopup` / `reauthenticateWithCredential` / `EmailAuthProvider` from the same Auth import) | browser test: Google and e-mail re-auth (emulator), blockers, cancel, both languages, 360/1366 px | 1.5 days | none |
| 3 | Executor `tools/account_deletion.mjs` (inventory / backup / execute, hash confirm, blockers, ordered steps, audit entry, Auth delete last) | new tool, patterned on `tools/content_cleanup.mjs` (not a duplicate system: one generic cleanup library could be shared, decision at implementation) | `test_account_deletion_emulator.mjs`: classes per collection, blockers (wallet, escrow, open order, agent, admin), retained records intact, tombstone, Auth user gone, orphan check, refusal without confirm or after a change | 2 days | none |
| 4 | Cloudinary deletion (optional, D7) | executor flag `--cloudinary` reading credentials from owner environment variables | mocked API test | 0.5 day | none (Cloudinary free tier) |
| 5 | Admin Portal read-only list of deletion requests | `js/admin/portal.js` | admin test | 0.5 day | none |
| 6 | `/delete-account.html` public page | `tools/build_seo.mjs` or a static page with the legal-page CSS | legal pages test | 0.5 day | none |
| 7 | Privacy policy update to describe the final process | `privacy.html` (Stage 2) | — | with Stage 2 | lawyer |

**Total:** ~5–6 developer-days. No paid service is required.

**Deploy:** only after approval. **Production execution:** each request separately approved by the owner.
