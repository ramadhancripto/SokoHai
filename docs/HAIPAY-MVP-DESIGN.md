# HaiPay (SokoPay) MVP — Design Specification

> **Brand:** SokoPay → renamed **HaiPay** (user-facing). Internal code identifiers
> (`openSokoPay`, `toggleSokoPayTab`, `sokopay_links`, etc.) stay unchanged to avoid
> breaking the app. Rename is cosmetic only.
>
> **Core concept:** PAY → SECURE → TRACK → CONFIRM → RELEASE / DISPUTE
>
> This document covers the 7 required deliverables. It is a **plan** — implementation
> follows this plan in small, safe steps. We do NOT rewrite SokoHai; we reuse the
> existing architecture.

---

## 0. Inspection findings (current state)

### Existing SokoPay / payment files
| File | Role |
|---|---|
| `js/app/21-sokopay.js` | SokoPay UI engine: `toggleSokoPayTab`, `confirmSokoPayLinkDirect`, `raiseSokoPayLinkDispute`, `openSokoPayDeposit`, `processSokoPayDeposit`, dispute resolution |
| `js/app/17-hub.js` | `openSokoPay()` entry, `syncSokoPayRealtimeData()`, **payment-link creation** (`sokopay_links` + `SP-XXXXXX` code), `executeSokoPayWalletPayment`, link accept/dispute |
| `js/app/02-checkout.js` | Marketplace checkout: `openCheckout`, `processPayment` (AzamPay via server callable) |
| `js/app/04-orders-escrow.js` | Escrow for marketplace orders: `confirmEscrowOrder`, `disputeEscrowOrder`, wallet bridge |
| `js/app/23-smart-cart.js` | Smart cart + SokoPay core tx orchestration |
| `js/app/24-ui-final.js` | **Token center**: `generateSokoPayCoreTokens`, `openSokoPayUnifiedTokenCenter`, `loadMyBuyerTokens`, tracking lookup |
| `js/12-payments.js` | AzamPay token + checkout bridge (`skhAzamPayToken`, server checkout) |
| `js/15-sp-live.js` | SokoPay live read API (per-category KPI loaders) |
| `js/16-wallet.js` | Wallet bridge (`skhWalletAdjust`, callables) |
| `js/17-azampay-return.js` | AzamPay redirect return handler + `azampayTransactionStatus` |
| `js/19-cart-checkout-canonical.js` | Canonical cart/checkout handler |

### Existing checkout / payment / escrow / token logic
- **Checkout:** cart → `confirmSmartCartOrder` (23-smart-cart) → `openCheckout` → `processPayment` (02-checkout). Payment is **server-authoritative** via Cloud Function `azampayCheckout` (`PAYMENTS_VIA_SERVER=true`). `DEMO_MODE=false`.
- **Escrow:** `confirmEscrowOrder` holds funds; `escrowRelease` Cloud Function releases (atomic split, idempotent); `walletAdjust` adjusts balances server-side. Firestore rules block browser writes to `walletBalance`.
- **Tokens:** `generateSokoPayCoreTokens(masterTransactionId)` produces token objects; token center UI in `24-ui-final.js`; logistics/courier permission tokens exist.
- **Links:** `sokopay_links` collection; code `SP-XXXXXX`; status `pending → held`; `confirmSokoPayLinkDirect`, `raiseSokoPayLinkDispute`.

### Existing Firestore collections (payment/escrow relevant)
`sokopay_links`, `orders`, `users` (walletBalance, paymentAccount…), `notifications`,
`adminRevenue`, `shop_ledger`, `chats`, plus marketplace: `products`, `services`, `jobs`, `drivers`.

### Existing UI entry points
Top-nav HaiPay icon (`openSokoPay`), desktop sidebar button, `sokopayForm` modal with
left sidebar tabs: overview, lipa, products, services, **jobs**, logistics, companies,
governance, events, token center, disputes, settings — plus tab areas `spOverviewArea`,
`spLipaArea`, `spCreateArea`, `spPayArea`, `spTrackArea`, `spSettingsArea`,
`spDisputesArea`, `spProductsArea`, `spServicesArea`, `spJobsArea`, `spLogisticsArea`,
`spCompaniesArea`, `spGovernanceArea`, `spEventsArea`.

---

## 1. HaiPay MVP architecture

**One modal (`sokopayForm`), one column, mobile-first.** Sidebar reduced to the MVP
sections. Everything financial stays server-authoritative.

```
┌───────────────────────────────────────────────────────────┐
│  HaiPay MVP                                                │
│                                                            │
│  Sidebar (mobile: top chips)        Main area              │
│  ├─ Home          (spOverviewArea)  → 3 big actions        │
│  ├─ Pay           (spLipaArea)      → direct pay by code   │
│  ├─ Create Link   (spCreateArea)    → desc + amount → link │
│  ├─ Track         (spTrackArea)     → token lookup         │
│  ├─ Transactions  (spPayArea)       → my transactions list │
│  ├─ Details       (reuse modal)     → transaction detail   │
│  └─ Help          (new static)      → how it works + rules │
└───────────────────────────────────────────────────────────┘
```

**Removed from HaiPay UI (MVP scope):** products/services/jobs/logistics/companies/
governance/events contract tabs and their "create contract" forms. Marketplace escrow
for those categories is handled by the **generic escrow** (below), not per-category modules.

**Two entry points (MVP):**
1. **SokoHai checkout** — cart → checkout → HaiPay payment → token → escrow → track →
   seller fulfills → buyer confirms → release.
2. **External** — seller opens HaiPay → **Create Link** → description + amount →
   token/link → share → buyer opens → reviews → pays → escrow → track → confirm → release.

---

## 2. Transaction state machine

```
                    ┌──────────────┐
    create link ──▶ │   CREATED    │
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐   timeout (e.g. 48h)
                    │PENDING_PAYMENT│──────────────▶ EXPIRED
                    └──────┬───────┘
                           ▼  (server verifies payment)
                    ┌──────────────┐
                    │     PAID     │  (escrow becomes HELD atomically)
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
                    │  ESCROW_HELD │
                    └──────┬───────┘
              ┌────────────┴───────────┐
              ▼                        ▼
        ┌─────────────┐          ┌──────────────┐
        │  PROCESSING │          │   DISPUTED   │──▶ ADMIN REVIEW ──┐
        │  DELIVERED  │          └──────────────┘                   │
        │  COMPLETED  │                                             │
        └──────┬──────┘                                             │
               ▼                                                    ▼
        buyer confirms ──▶ ┌──────────────┐              ┌──────────────┐
                           │   RELEASED   │              │   REFUNDED   │
                           └──────────────┘              └──────────────┘
                           (CANCELLED only from CREATED/PENDING_PAYMENT)
```

**States:** `CREATED, PENDING_PAYMENT, PAID, ESCROW_HELD, PROCESSING, DELIVERED,
COMPLETED, RELEASED, DISPUTED, REFUNDED, CANCELLED, EXPIRED`

**Transitions (server-authoritative):**
| From | To | Trigger |
|---|---|---|
| CREATED | PENDING_PAYMENT | link shared / checkout initiated |
| PENDING_PAYMENT | PAID | `azampayCheckout`/`azampayTransactionStatus` verifies |
| PENDING_PAYMENT | EXPIRED | timer |
| PAID | ESCROW_HELD | server sets escrow HELD (same call) |
| ESCROW_HELD | PROCESSING | seller marks "fulfilling" |
| PROCESSING | DELIVERED | seller marks delivered |
| DELIVERED | COMPLETED/RELEASED | buyer confirms (`escrowRelease`) |
| ESCROW_HELD/PROCESSING | DISPUTED | buyer reports problem |
| DISPUTED | RELEASED / REFUNDED | admin review (server callable) |
| CREATED/PENDING_PAYMENT | CANCELLED | owner cancels |

**Security rule:** the browser may never set `PAID`, `RELEASED`, `REFUNDED`, or any
wallet balance. Only Cloud Functions + Firestore security rules.

---

## 3. Firestore data model

**Collection `haiPay_transactions`** (new, or evolve `sokopay_links`):
```
{
  txId: "SP-82KF91",            // token = identifier, not money
  type: "marketplace" | "external",
  buyerId, sellerId,
  description: "iPhone 12 64GB",
  amount: 850000, currency: "TZS",
  paymentStatus: "PENDING_PAYMENT",
  escrowStatus: "NOT_HELD" | "HELD" | "RELEASED" | "REFUNDED",
  orderStatus: "CREATED" | "PROCESSING" | "DELIVERED" | "COMPLETED",
  state: "ESCROW_HELD",          // master state (state machine)
  azamPayRef: "...", provider: "AirtelMoney|TigoPesa|M-Pesa|Card|Bank",
  fees: { platform: 5%, carrier: 0, seller: 95% },
  createdAt, paidAt, releasedAt, timestamps...
  dispute: { status, reason, adminNote } | null,
  source: { orderId } | { linkId }   // integration back-reference
}
```

**Keep existing collections** (`sokopay_links`, `orders`, `users`, `notifications`,
`adminRevenue`) — the MVP maps `sokopay_links` documents into the state machine
(rename fields only where safe). No destructive migration.

**Indexes needed:** `state + createdAt`, `buyerId + state`, `sellerId + state`.

---

## 4. Frontend file structure

```
js/app/21-sokopay.js        → keep (engine), slim the tab switch to MVP sections
js/app/21b-haipay-home.js   → Home (3 actions + KPI summary)      [new]
js/app/21c-haipay-link.js   → Create Link form (desc + amount)    [new]
js/app/21d-haipay-track.js  → Track by token                      [new]
js/app/21e-haipay-tx.js     → Transactions list + details         [new]
js/app/21f-haipay-help.js   → Help (static)                       [new]
js/app/17-hub.js            → keep openSokoPay(); rename label to HaiPay
js/app/24-ui-final.js       → keep token center (Track reuses it)
```

**HTML (`index.html`):**
- `sokopayForm` sidebar: keep `overview, lipa, create, track, pay, settings, disputes` +
  add `help`; **delete** `products, services, jobs, logistics, companies, governance,
  events` buttons + their tab areas.
- Overview: replace per-category "Review" demo cards with 3 primary actions
  (PAY / CREATE LINK / TRACK).

---

## 5. Backend / server functions required

| Function | Purpose | State it may set |
|---|---|---|
| `azampayCheckout` | init payment, verify provider callback | `PENDING_PAYMENT → PAID`, escrow `HELD` |
| `azampayTransactionStatus` | poll/verify status | idempotent confirm |
| `escrowRelease` | buyer-confirmed release (atomic split to seller/platform) | `DELIVERED → RELEASED` |
| `escrowRefund` | refund on dispute (admin/verification) | `DISPUTED → REFUNDED` |
| `haipayCreateLink` *(optional)* | server-side link creation + token | `CREATED` |
| `haipayDispute` | open dispute → admin queue | `→ DISPUTED` |
| `haipayResolveDispute` | admin release/refund | `DISPUTED → RELEASED/REFUNDED` |
| `walletAdjust` | ledgered balance change (exists) | balances only |

All financial writes flow through these; Firestore rules deny direct client writes to
`walletBalance`, escrow status, and payment status fields.

---

## 6. Integration points with SokoHai cart / orders

1. **Checkout (02-checkout.js `processPayment`)** — after payment success, write/update
   the HaiPay transaction: `state=PAID`, escrow `HELD`, attach `source.orderId`, generate
   token. (Currently `sokopay_links` + `orders` already hold most of this.)
2. **Buyer confirms receipt (04-orders-escrow.js `confirmEscrowOrder`)** — calls
   `escrowRelease` (server) → `state=RELEASED`. Same as today.
3. **Order tracking** — reuse `loadBuyerOrdersWithTracking` + token center lookup.
4. **External links** — `Create Link` writes `sokopay_links` (or new `haiPay_transactions`)
   with `type=external`; buyer pays via shared URL (token lookup).
5. **Notifications** — on every state change, `addDoc(notifications, ...)` (already used).

No changes to the marketplace feed/product engine are required.

---

## 7. Implementation order

1. **Rename SokoPay → HaiPay** (visible labels only). ✅ (done this round)
2. **Remove Payroll & Jobs module** (sidebar + area + demo rows + filter). ✅ (this round)
3. **Slim sidebar** to MVP sections: remove products/services/logistics/companies/
   governance/events buttons + areas (dead renderers become unreachable — safe).
4. **Home screen** — 3 primary actions (PAY / CREATE LINK / TRACK) + balance/active KPI.
5. **Create Link** — simplify `spCreateArea` to description + amount (drop per-type
   product/job/passenger metadata forms).
6. **Track** — token lookup (reuse `openTrackingTokenLookup` / token center).
7. **Transactions + Details** — list from `sokopay_links` + `orders`; detail modal.
8. **Help** — static rules ("HaiPay protects your money…").
9. **State machine alignment** — normalize statuses to the 12 states; add expiry timer.
10. **Server functions** — add `haipayCreateLink`, `haipayDispute`, `haipayResolveDispute`,
    `escrowRefund`; wire status verification.
11. **Security rules** — enforce the state machine on `sokopay_links`/`haiPay_transactions`.
12. **Test** — checkout flow + external link flow end-to-end; dispute → refund path.

---

## Notes / guardrails

- **Do NOT** rename JS function names or collection names during MVP (only labels).
- **Do NOT** remove `orders`/`sokopay_links` writes — the marketplace depends on them.
- Keep `DEMO_MODE=false`, `PAYMENTS_VIA_SERVER=true` (already correct).
- All state transitions from the browser are **requests**; the server is the authority.
