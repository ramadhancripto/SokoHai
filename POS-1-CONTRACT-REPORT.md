# POS-1 Contract + Lifecycle Foundation

Status: COMPLETE FOR REVIEW

## Scope

This phase preserves the existing server-authoritative `posSale` and `inventoryAdjust` implementations. It does not add a second sale, inventory, payment, ledger, receipt, return, or offline engine.

## Production change

`functions/inventory-authority.js` was minimally extended to normalize existing payment labels and preserve a forward-compatible payment shape:

- `Tigo` is accepted and stored as `TigoPesa`.
- `Airtel` is accepted and stored as `AirtelMoney`.
- `Bank` is accepted as a non-verified payment method with `PENDING_VERIFICATION`.
- Payment snapshots now have optional `provider`, `reference`, `amount`, `cashReceived`, and `change` fields.
- Existing `Cash`, `Mpesa`, `TigoPesa`, `AirtelMoney`, `Deni`, and `Awamu` behavior remains supported.

No external provider verification was added.

## Contract findings

### Cart

The current cart remains `window.posCart` and continues to use the existing product ID, quantity, retail/wholesale pricing mode, customer fields, and authenticated seller/cashier context. No taxonomy, unit foundation, or variant fields were added.

### Sale

`posSale` remains the only authoritative sale engine. It continues to use the Firestore transaction, server catalogue price, atomic stock validation/decrement, idempotency, `sales/pos_{idempotencyKey}`, `inventory_movements/pos_{idempotencyKey}`, Business/Store validation, and immutable snapshot fields.

The current frontend still invokes the existing one-product `posSale` contract once per cart item. A single multi-item sale aggregate was not invented in this phase because doing so would change existing production behavior and requires a separately approved authority expansion.

### Discount

The UI calculates `10`, `weekend`, and `buy2get1` discounts. The current server sale still persists `discount: 0`, and the frontend does not pass an authoritative discount policy/payload. This conflict is explicitly preserved and reported; no client discount was silently trusted and no unsafe discount model was introduced.

### Payment

The stored server method names remain compatible with the existing authority. UI aliases are normalized at the server boundary. Mixed payment remains unimplemented. Provider verification and reconciliation remain outside POS-1.

### Cash

The authority now has optional `cashReceived` and `change` fields in the payment snapshot, but existing POS submission was not rewritten to claim a complete cash reconciliation flow. Existing clients that omit these fields remain compatible.

### Credit/Awamu

Existing `deposit`, `outstanding`, `CREDIT_OPEN`, and ledger projection behavior was preserved. No ledger migration or accounting engine was added.

### Return/Void

No authoritative return, refund, void, or cancel engine was added. Existing return behavior remains outside the POS-1 sale lifecycle contract.

### Receipt

No receipt generator, numbering rule, snapshot collection, or reprint flow was added. Receipt remains a future boundary.

### Offline

`sokohai_offline_sales` and the current queue behavior were not changed. Queue IDs, replay idempotency, retry states, server acknowledgments, failure states, and conflict handling remain future work.

## Tests

Created:

```text
tools/test_pos_contract.mjs
```

The test covers static contract presence for cart, sale authority, snapshot fields, server price/stock/idempotency, payment aliases, credit statuses, discount conflict visibility, and protected future boundaries.

Runtime Firebase/emulator verification was not claimed.
