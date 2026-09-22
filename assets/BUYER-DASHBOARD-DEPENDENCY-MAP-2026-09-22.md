# Buyer Dashboard Dependency Map

## Authority decision

The existing `mySokoHaiModal` and `js/app/28-buyer-engagement.js` are the Buyer personal-area authority. They were upgraded rather than creating a second Buyer route, order engine, inbox, wallet, profile, or notification center.

| Buyer section | Existing source | Owner query | Existing destination/action |
|---|---|---|---|
| Overview | Aggregates rows below | Every query includes authenticated UID | Opens the relevant tab/system |
| Orders | `orders` | `buyerId == uid` | `openOrderTracking` / `openBuyerOrdersModal` |
| Requests | `requests` | `senderId == uid` | Existing provider Chat/notifications |
| Negotiations | `negotiations` | `buyerId == uid` | Existing `openChatWithUser`; history stays in Chat |
| Deliveries | `ride_requests` | `customerId == uid` | `openRideTracking` / existing delivery flow |
| Saved | `savedProducts` | `userId == uid` | Existing `openProduct` via engagement card |
| Liked | `productLikes` | `userId == uid` | Existing `openProduct` via engagement card |
| Following | `sellerFollowers` | `followerId == uid` | Existing seller profile |
| Recently Viewed | `recommendationEvents` | `userId == uid`, type `ENTITY_VIEWED` | Existing original entity detail |
| Reviews | Completed `orders` + review activity event | `buyerId == uid`; event `userId == uid` | Existing review/comments flow |
| My Activity | `recommendationEvents` | `userId == uid` | Read-only action history, distinct from notifications |
| SokoPay | `sokopay_core_transactions` + user wallet | `buyerId == uid` | Existing SokoPay/order detail |
| Account | Existing global systems | Current account | Profile, account menu, security, privacy, Notifications, Chat |

## Recent-view design

No `BuyerProductHistory`, `BuyerServiceHistory`, or `BuyerTransportHistory` collections were added. A deterministic document in the existing `recommendationEvents` stream is updated per `uid + entity`, keeping one bounded current record per viewed entity. Product, service, and transport use the same structure: `entityType`, `entityId`, `collectionName`, `viewed at` (`at`).

## Navigation

- `Kazi → Buyer Dashboard` opens the upgraded existing Buyer surface.
- Dashboard **Back** returns to Overview first, then delegates to the existing universal one-level back stack.
- Dashboard **Home** explicitly invokes the existing Home navigation.
- Detail cards call existing order, delivery, profile, product, Chat, review, SokoPay, notification, and account functions.

## Security changes

Firestore rules now isolate orders, requests, notifications, engagement relations, and personal activity by participant/owner. Cross-user search signals remain readable only when the event type is `search`, preserving the existing ranking input without exposing private activity. Existing public transport-market behavior remains unchanged; private Buyer dashboard queries are always `customerId == uid`.
