# NEGOTIATION UX REPAIR — CLOSURE (2026-09-22)

## Reported defects

- Negotiation form appeared behind Chat.
- Product price negotiation could inherit Service/Transport context.
- “Toa Ofa” did not visibly expose proposed price and quantity.
- Negotiation UI could become visible only after navigating back.
- Offer submit appeared to require a normal Chat message first.

## Proven root causes

1. **Stacking mismatch:** `.nf-shell` had CSS `z-index: 9000`, while the live Chat repair layer can elevate Chat to `100010`. The modal LIFO selector in `js/94-modal-stack.js` did not include `.nf-shell`, so dynamic `#nfShell` was never promoted.
2. **Pair-conversation context collision:** one deterministic conversation can contain Product, Service and Transport history. The start card selected Transport, then Service, then Product, instead of using the entity that opened the current Chat. Negotiation listeners likewise selected the newest negotiation in the pair conversation without filtering it to the active entity.
3. **Transport misclassification:** `startChat()` recognized `drivers` as Transport but allowed `ride_requests` to fall into Product context.
4. **Negotiation-as-normal-message coupling:** negotiation launch prefilled a normal greeting, and `sendInternal()` blocked system negotiation events while Chat was CONNECTING even after the parent conversation had been confirmed.
5. **Async context drift:** the form enriched entity data asynchronously but did not lock and revalidate the conversation/partner captured at open time.

## Closed files

### `js/94-modal-stack.js` — STATUS: CLOSED
- Registered `.nf-shell` with the existing LIFO modal authority.
- Dynamic negotiation shell is now raised above an already elevated Chat.

### `js/app/38-negotiation-form.js` — STATUS: CLOSED
- Calls the existing modal authority after appending `#nfShell`.
- Locks type, entity, conversation ID and partner at open time.
- Revalidates the same conversation after async enrichment and again at submit.
- Product form remains the Product schema with `quantity` and `unitPrice`, not Service/Transport fields.

### `js/app/39-product-showcase.js` — STATUS: CLOSED
- Opens Chat with explicit `commerceKind` and without pre-filling a normal greeting for negotiation flows.
- Awaits the negotiation form open operation.

### `js/app/34-chat-core.js` — STATUS: CLOSED
- Added explicit active commerce identity `{kind,id}` to authoritative Chat state.
- Correctly classifies `drivers`, `ride_requests`, and `transport_profiles` as Transport.
- Start-negotiation card follows the currently opened entity, not historical type priority.
- Message and negotiation listeners filter active negotiation state to the current entity, preventing old Service/Transport offers from replacing a Product offer UI.
- Confirmed system events may send after the parent conversation exists even if the first message snapshot is still CONNECTING; normal composer messages remain gated.

### `tools/test_chat_e2e_journey.mjs` — STATUS: CLOSED
Added executable regressions for:
- Chat at z-index `100010` and negotiation form above it.
- Product form visibly containing proposed price and quantity.
- Product form excluding Service/Transport schema fields.
- Current Product context surviving a newer historical Service negotiation in the same conversation.
- Negotiation entry leaving the normal Chat input empty.

## Verification

- `npm test` — **PASS, exit 0**.
- Chat E2E — **44 pass, 0 fail**.
- Negotiation form logic — **78 pass, 0 fail**.
- Negotiation DOM — **76 pass, 0 fail**.
- Chat authority/mobile/security — **20 pass**.
- Chat/navigation authority — **18 pass, 0 fail**.
- `node --check` — **104/104 JavaScript files pass**.
- `python3 tools/build_html.py check` — **byte-exact pass**.
- `git diff --check` — **pass**.

## Test-scope note

The sandbox has no Chromium, Chrome or Firefox executable. The repaired runtime behavior is covered by jsdom E2E plus static/CSS contracts; no claim is made that physical-device screenshots or a live production Firebase two-account test were executed.
