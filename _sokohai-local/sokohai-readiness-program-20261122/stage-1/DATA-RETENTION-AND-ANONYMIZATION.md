# Data retention and anonymisation (PROPOSAL)

**Date:** 22 Nov 2026.

**Classes:**

| Class | Meaning |
|---|---|
| **DELETE** | removed |
| **ANON** | personal fields replaced; record kept for integrity |
| **RETAIN** | kept unchanged for legal or operational reasons |
| **REVIEW** | owner or legal decision |

Retention periods are **not** set here (OWNER + LEGAL).

| Data | Class | Detail | Reason |
|---|---|---|---|
| Firebase Auth account | DELETE (last step) | `admin.auth().deleteUser` | no further sign-in |
| `users/{uid}` | ANON → tombstone | keep `{uid, deleted:true, deletedAt, deletionRef}`; remove name, phone, e-mail, photo, region, shop text, language, consents, push data | foreign keys in retained records still resolve; prevents accidental re-creation |
| `userCards`, `publicProfiles` | DELETE | — | public data |
| Preferences (`user_state`, `push_prefs`, `notificationPreferences`, `dashboard_hidden`, `push_tokens` for the uid) | DELETE | — | no purpose |
| Listings never ordered | DELETE + media | — | — |
| Listings with orders/sales/reservations | ANON/ARCHIVE | `permanentlyDeleted`, `publicationStatus:'archived'` (existing marks) | order history |
| Comments, likes, follows, saved items, watches | DELETE (likes etc.) / ANON (comments that have replies) | — | REVIEW: delete all comments vs anonymise |
| Stories, live sessions, creatives (unpaid) | DELETE + media | — | — |
| Paid promotions | RETAIN | linked to payment references | financial |
| Chats / conversations | ANON sender in shared threads; DELETE the user's `savedMessages` | REVIEW (D3) | other party's record |
| Orders, offers, negotiations, reservations, inbox, shipments, delivery, disputes, refunds | RETAIN; ANON display names in new reads | — | contractual / consumer protection (LEGAL period) |
| Wallet ledger, escrow, withdrawals, SokoPay transactions/links/tokens | RETAIN | **deletion blocked while the balance or escrow ≠ 0** | financial law (LEGAL period) |
| Saved payout accounts (`sokopay_saved`) | DELETE | — | not needed after closure |
| Business/store, staff, POS sales, ledger, suppliers, customers | REVIEW (D4) | — | may belong to a business, not a person |
| Reports by or against the user, security events, admin audit, seller lifecycle log, activity logs | RETAIN (reporter identity pseudonymised where possible) | — | safety evidence |
| Support requests | RETAIN (incl. the deletion request itself) | — | proof of handling |
| Verification documents (Cloudinary images) | DELETE images; RETAIN a decision record (approved/rejected, date) | REVIEW | KYC rules if payments are switched on |
| Agent members (if the user is an agent) | BLOCK until members are reassigned | — | other people's accounts |
| Device `localStorage` | user's browser; cleared on sign-out after deletion | — | — |
| Backups made by the executor | RETAIN for D6 days, then destroy | owner machine, encrypted | appeal / error recovery |

## Orphan check (executor must report)

After execution, verify that:

- no document still holds the uid in a **public** field;
- `userCards` and `publicProfiles` are gone;
- active listings by the uid = 0;
- Auth user absent;
- every retained record shows the deleted-user display.
