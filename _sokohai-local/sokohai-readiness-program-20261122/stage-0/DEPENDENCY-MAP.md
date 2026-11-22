# Dependency map — account deletion, privacy rights, authentication

**Date:** 22 Nov 2026.

**Source:** `firestore.rules`, parsed for fields compared with `request.auth.uid`, plus the uid-keyed collections. "Delete denied" means `allow delete: if false` in the rules.

## A. Documents keyed by uid

| Collection | Content | Proposed treatment |
|---|---|---|
| `users/{uid}` | private profile | anonymise (keep a minimal tombstone) |
| `userCards/{uid}`, `publicProfiles/{uid}` | public card | delete |
| `user_state/{uid}`, `push_prefs/{uid}`, `notificationPreferences/{uid}`, `dashboard_hidden/{uid}/**` | preferences | delete |
| `verification_requests/{uid}` + Cloudinary images | ID documents | delete images; keep a decision record if the law requires it (OWNER/LEGAL) |
| `memberSecrets/{uid}` | offline-member PIN data | delete |

## B. Collections with a user-uid field

| Group | Collections (uid fields) | Delete denied in rules | Proposed class |
|---|---|---|---|
| Listings | `products` (`userId`, `managedByAgentUid`), `services` (`userId`), `drivers` | products, services: yes | archive (existing permanent-delete marks); delete if never ordered |
| Social content | `comments` (`authorId`), `commentLikes`, `stories` (`authorUid`), `live_sessions` (`hostUid`), `productLikes`, `savedProducts`, `productWatches`, `sellerFollowers`, `discoverRequests`, `recommendationEvents` | recommendationEvents | delete or anonymise ("Mtumiaji aliyefuta akaunti") |
| Messaging | `chats` (`senderUid`/`receiverUid`), `conversations`, `chatGroups`, `calls`, `savedMessages`, `chatBlocks`, `requests`, `productInquiries`, `cart_seller_messages` | conversations, chatGroups, calls, requests, productInquiries | **anonymise sender**; keep the other party's copy (LEGAL) |
| Commerce | `orders` (buyer/seller/provider/courier), `offers`, `negotiations`, `negotiation_events`, `inventory_reservations`, `smart_cart_checkouts`, `seller_order_inbox`, `shipments`, `logistics_assignments`, `delivery_*`, `ride_requests`, `disputes`, `refunds`, `order_adjustments` | orders, offers, negotiations, seller_order_inbox, shipments, logistics_assignments | **retain**; pseudonymise display fields only |
| Money | `wallet_ledger`, `escrow_holds`, `withdrawal_requests`, `sokopay_core_transactions`, `sokopay_links`, `sokopay_tokens`, `sokopay_saved`, `serious_deposits` | sokopay_* : yes | **retain** (legal / financial). `sokopay_saved` (saved payout accounts) → delete. **Block deletion while the balance or escrow ≠ 0** |
| Business OS | `businesses`, `stores` (`ownerUid`), `shop_staff`, `staff_invites`, `staff_attendance`, `sales` (`sellerId`, `cashierId`), `inventory_movements`, `stock_transfers`, `suppliers`, `customers`, `purchase_orders`, `shop_ledger`, `driver_expenses` | staff_attendance, stock_transfers | OWNER decision: a business with staff or sales is a business record. Retain or transfer; close the store |
| Trust and safety | `listing_reports`, `chatReports`, `story_reports`, `live_reports`, `security_events`, `admin_audit_log`, `seller_lifecycle_log`, `activity_logs`, `support_requests` | most | **retain** (moderation / security evidence), with pseudonymised reporter identity where possible |
| Agents | `agents`, `agentMembers`, `assistedSessions`, `assistedActivity` | — | if the user is an agent: reassign members first (OWNER) |
| Ads / creatives | `creatives`, `creativePublications`, `announcements` (`advertiserId`), `brandKits`, `promotion_requests` | creatives, promotion_requests | delete unpaid; retain payment-linked (same rule as `content_cleanup.mjs`) |
| Groups | `group_soko` (`memberUids`), `group_buy_commits`, `auction_participation` | — | remove membership; retain money-linked commits |

## C. Cross-system dependencies

```
Auth user ──┬─ users/{uid} ── userCards (function) ── every card and avatar across the app
            ├─ listings ── orders / reservations / reports ── seller_order_inbox
            ├─ chats / conversations ── other party's inbox
            ├─ business/store ── staff accounts (shop_staff) ── POS sales / ledger
            ├─ wallet / escrow ── SokoPay (switched off)
            └─ Cloudinary media (URLs in the documents above)
Privacy policy ── states: closure via support request, records kept for orders/reports
Google OAuth  ── Google users are the same Firebase Auth users (provider google.com)
```

**Ordering rule for any deletion:**

1. Block if money, escrow or open orders exist.
2. Run the user-data steps.
3. Clean up media.
4. Delete the Auth user **last**. If the Auth user went first, the owner could no longer re-authenticate or verify the requester.
