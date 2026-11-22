# Authentication and data flow

22 Nov 2026 — read-only.

## 1. Sign-up / sign-in flows (FACT, from code)

```
E-mail sign-up
  browser ── createUserWithEmailAndPassword ──► Firebase Auth (uid)
          ── sendEmailVerification ──────────► user's inbox
          ── setDoc users/{uid} ─────────────► Firestore   (rules: selfProfileCreateOk; walletBalance must be 0)

Google sign-in (signInWithPopup)
  sokohai.com ─► popup https://sokonet-3b847.firebaseapp.com/__/auth/handler
               ─► accounts.google.com  ("to continue to sokonet-3b847.firebaseapp.com")
               ─► handler returns credential to opener (sokohai.com)
  browser ── getDoc users/{uid}; if missing setDoc {uid, fullName, email, photoURL, createdAt, walletBalance:0}

Password reset
  browser ── sendPasswordResetEmail ─► Firebase Auth e-mail template (action URL per earlier setup notes)
```

**Authorized domains:** the site's domain must be in Firebase → Authentication → Authorized domains, otherwise `auth/unauthorized-domain`. The actual list is BLOCKED (console). The popup works from sokohai.com, which is indirect evidence that it is listed.

## 2. After sign-in

- `onAuthStateChanged` sets `skh.currentUser`, then dispatches `skh:auth-ready` (`00-bootstrap.js` line 1588).
- The profile is loaded from `users/{uid}`. The language preference syncs to `users/{uid}.language` (22 Nov work).
- The public card `userCards/{uid}` is written **only by the `userCardSync` function** (rules line 576). On Spark, functions are not deployed, so `userCards` may be stale or missing in production (to verify).

## 3. Where a user's personal data ends up

| Data | Store | Written by |
|---|---|---|
| Account (e-mail, provider, password hash) | Firebase Auth | Auth |
| Profile (name, phone, photo URL, region, shop name, language, consent flags) | `users/{uid}` | user (non-privileged keys) |
| Public card | `userCards/{uid}`, `publicProfiles/{uid}` | function / owner |
| Listings | `products`, `services`, `drivers` (`userId`) | user |
| Messages | `chats`, `conversations`, `chatGroups`, `calls`, `savedMessages` | users |
| Social | `comments`, `commentLikes`, `stories`, `live_sessions`, `sellerFollowers`, `productLikes`, `savedProducts`, `productWatches` | users |
| Commerce | `orders`, `offers`, `negotiations`, `inventory_reservations`, `smart_cart_checkouts`, `seller_order_inbox`, `shipments`, `disputes`, `refunds` | users / functions |
| Money | `wallet_ledger`, `escrow_holds`, `withdrawal_requests`, `sokopay_*` | functions (payments are switched off) |
| Business OS | `businesses`, `stores`, `shop_staff`, `sales`, `inventory_movements`, `suppliers`, `customers`, `purchase_orders`, `shop_ledger` | user / functions |
| Trust and safety | `listing_reports`, `chatReports`, `story_reports`, `live_reports`, `security_events`, `admin_audit_log`, `seller_lifecycle_log` | users / admins / functions |
| Support | `support_requests` | user |
| Verification | `verification_requests/{uid}` + Cloudinary document images | user / admin |
| Device | `push_tokens`, `push_prefs`, `notificationPreferences`, `user_state` | user / functions |
| Media | Cloudinary (unsigned preset) | browser |
| Local device | `localStorage` (session, language, recent searches) | browser |

## 4. Implication for account deletion

**Deleting the Firebase Auth user alone does not remove any Firestore document or Cloudinary file** (FACT: there is no deletion trigger in `functions/`, and triggers would not run on Spark anyway). It would leave:

- **orphans:** `users/{uid}`, listings still visible, `userCards` card;
- **broken counterparties:** for example, chats show an unknown user.

A deletion must therefore be an **orchestrated process**. See Stage 1.
