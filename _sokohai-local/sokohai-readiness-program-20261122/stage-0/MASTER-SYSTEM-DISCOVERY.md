# Stage 0 — Master system discovery

| | |
|---|---|
| Date | 22 Nov 2026 |
| Mode | read-only |
| Source of facts | integrated working tree `integrate/final-20261122` (HEAD `dc2e4cb` + uncommitted work), `firestore.rules`, `functions/`, `js/`, the live site, and the earlier reports (`google-oauth-deep-audit-20261122`, `google-oauth-readiness-20261122`) |
| Modified | **no code, configuration or data was modified** |

## Stage header

| | |
|---|---|
| Objective | Establish the real current state before any design |
| Existing evidence | two earlier OAuth reports; earlier remediation reports |
| Work | code, rules and functions inventory; plan constraints |
| Dependencies | none |
| Owner input | none needed for this stage |
| Risks | none (read-only) |
| Deliverables | this file, `AUTHENTICATION-AND-DATA-FLOW.md`, `DEPENDENCY-MAP.md`, `MASTER-REQUIREMENTS.md` |

---

## 1. Platform and plan constraints (decisive for every design)

| Fact | Evidence | Consequence |
|---|---|---|
| Firebase plan: **Spark** (owner statement; earlier reports) | owner; `final-20261122` report §6 | **Cloud Functions cannot be deployed on Spark.** Callables in `functions/` (273 exports, region `europe-west1`) are written but are **not available in production**. Earlier reports and the live terms page say they are "being switched on in stages" |
| Firebase **Storage is not used** | no `storage.rules`; no `getStorage` in the client | Media lives in **Cloudinary** |
| Media upload | `js/11-uploads.js`: signed upload via function, or **unsigned preset `Sokohai_preset` fallback** | Deleting Cloudinary files needs the Cloudinary API secret (owner-only; server or owner script) |
| Hosting | Netlify (`netlify.toml`), domain `sokohai.com` (`www` → apex) | — |
| Auth | Firebase Auth: e-mail/password (+ e-mail verification, password reset) and Google (`signInWithPopup`) | `00-bootstrap.js` lines 8 and 55–62; `08-app-state.js` |
| Admin SDK scripts run by the owner | precedent: `tools/content_cleanup.mjs`, `tools/verify_listing_country.mjs` | **Spark-compatible path** for privileged work (Auth admin and Firestore admin are free) |

## 2. Authentication architecture

**Web config:**

- `authDomain: sokonet-3b847.firebaseapp.com`, project number `950677961118`;
- `apiKey` present (public identifier, value not reproduced);
- source: `js/app/00-bootstrap.js` lines 619–625.

**E-mail sign-up** (`08-app-state.js` around line 199):

- `createUserWithEmailAndPassword`, then `sendEmailVerification`, then a profile doc in `users/{uid}`.

**Google** (`08-app-state.js` lines 233–261):

- `new GoogleAuthProvider()` with no extra scopes;
- `signInWithPopup`;
- first sign-in creates `users/{uid}` with `{uid, fullName, email, photoURL, createdAt, walletBalance: 0}`;
- errors are shown with `alert()`.

**Password reset:** `sendPasswordResetEmail` (`08-app-state.js` line 280).

**Not present:**

- `reauthenticateWith*`;
- `deleteUser` (client);
- `admin.auth().deleteUser` (server);
- data export.

**Session:** Firebase persistence; `skh:auth-ready` event (`00-bootstrap.js` line 1588).

## 3. Roles and permissions (`firestore.rules`)

- **`isAdmin()`** (lines 22–33): custom claim `admin`, `role == 'admin'`, or `superAdmin`, or a verified owner e-mail (owner address hard-coded in rules, lines 31 and 43).
- **`isSuperAdmin()`** (line 38): claim or verified owner e-mail.
- **`isSupportStaff()`**: `role == 'support'`.
- **Agents:** may read and manage the offline members they registered (`userDocReader`: `managedByAgentUid`, `createdByAgentId`, `registeredThroughAgentId`).
- **Privileged user keys** cannot be changed by the user (`privilegedUserKeys()`, line 467): role, admin flags, verification, account status, suspension, subscription, agent fields, `walletBalance`, `trust`.

## 4. Existing privacy and account-lifecycle mechanisms

| Mechanism | Exists | Evidence |
|---|---|---|
| Edit own profile | ✅ | `js/app/64-my-profile.js`; rules allow non-privileged keys |
| Public phone consent switch | ✅ | `functions/user-cards.js` (projection to `userCards`). The trigger needs functions; the switch itself is in the profile |
| Privacy support request ("Faragha na data yangu") | ✅ | `js/app/130-support-center.js` line 17 → `support_requests` (rules line 2587, delete denied) |
| Account suspension | ✅ (admin callable) | `functions/admin-authority.js` line 228 `adminSetAccountStatus` → `auth.updateUser(disabled)` + `accountStatus`. **Callable is not on Spark** |
| Personal Recycle Bin (hide own activity) | ✅ | personal recycle bin; "Delete kabisa haijawezeshwa" |
| Listing permanent delete (archive marks) | ✅ | recycle-bin rules; `content_cleanup.mjs` reuses the marks |
| Account self-deletion | ❌ | — |
| Deletion request status tracking | ⚠ partial | support request status (`open`, `in_progress`, `resolved`, `closed`) in `130-support-center.js` |
| Data export | ❌ | — |
| Public deletion web page | ❌ | — |

## 5. Data inventory (summary; full map in `DEPENDENCY-MAP.md`)

**~110 top-level Firestore collections are defined in the rules.**

- **User-keyed documents (doc id = uid):**
  - `users`;
  - `userCards` (public projection);
  - `publicProfiles`;
  - `user_state`;
  - `push_prefs`;
  - `notificationPreferences`;
  - `verification_requests`;
  - `dashboard_hidden/{uid}/entries`;
  - `memberSecrets` (offline members).
- **Collections carrying a user uid field:** 70+, e.g.
  - `products.userId`;
  - `orders.buyerId/sellerId/providerId/courierId`;
  - `chats.senderUid/receiverUid`;
  - `comments.authorId`;
  - `wallet_ledger.uid`;
  - `support_requests.uid`.
- **Financial / legal records (delete is denied in rules):**
  - `orders`, `offers`, `negotiations`, `shipments`;
  - `sokopay_core_transactions`, `sokopay_links`, `sokopay_tokens`;
  - `seller_order_inbox`, `logistics_assignments`;
  - `listing_reports`, `chatReports`, `support_requests`.
  - `wallet_ledger`, `escrow_holds`, `withdrawal_requests` and `refunds` are server-written.
- **Media:** Cloudinary URLs stored inside documents.

## 6. Legal pages and domain

- **Legal pages:** `privacy.html`, `terms.html`, `contact.html`, `support.html`, `about.html` are live, HTTPS, Version 1.0 (draft), with PENDING markers. Details are in `google-oauth-readiness-20261122\PRIVACY-…`, `TERMS-…`, and the Stage 2 reports to come.
- **Domain:** Netlify hosting; DNS at Spaceship (owner); no Search Console token in the repository.

## 7. Already available vs needed from the owner

| Available (will not be asked again) | Needed from owner |
|---|---|
| project id, project number, `authDomain`, plan = Spark, owner e-mail, legal-page drafts, approved logo path, Cloud Functions region, media provider, roles model, collection map | console access (owner account), company identity and legal facts, e-mails, retention periods, minimum age, deletion policy choices (Stage 1), Search Console verification, brand spelling |
