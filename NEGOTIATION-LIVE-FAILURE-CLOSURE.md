# NEGOTIATION LIVE FAILURE REPAIR — CLOSURE

Date: 2026-09-22

Forensic prerequisite: `NEGOTIATION-LIVE-FAILURE-REPORT.md`

## Result

Negotiation remains the existing system, but now has one explicit commerce context and one Chat-owned visual host. Delivery remains in Cart/Delivery flow.

## Closed files

### `html/06-modals-social.html` — STATUS: CLOSED
- Added exactly one `#chatNegotiationHost` inside `#chatMainSurface`.
- Chat main surface is positioned and clips its controlled negotiation layer.
- Chat Back closes negotiation first; the next Back leaves Chat.

### `css/17-negotiation-form.css` — STATUS: CLOSED
- Converted `.nf-shell` from viewport-fixed/body modal to absolute Chat-host layer.
- Host owns visibility and pointer events.
- Sheet height is bounded by the Chat surface, with internal scrolling and wrapped mobile actions.
- Added loading/success/error submit visuals and `aria-busy` spinner styling.

### `js/app/38-nego-form-logic.js` — STATUS: CLOSED
- Product schema contains Product identity, seller price, proposed price, quantity, variants where applicable, and message only.
- Removed Product `deliveryLocation`, `preferredDate`, delivery section, validation, proposal fields, and summary fields.
- Service basic schema contains service scope, units, proposed price, terms/message; schedule/location appears only when the Service explicitly declares `negotiationScheduleRequired` or `bookingRequired`.
- Transport retains its own route/cargo/fare terms because those identify a real Transport request.
- Proposal objects now receive only their own kind-specific fields instead of a universal object containing null Product/Service/Transport/Delivery keys.

### `js/app/38-negotiation-form.js` — STATUS: CLOSED
- Removed historical-card/shared-global inference from form opening.
- Requires explicit `{type, entity}` before rendering.
- Constructs an explicit sanitized snapshot per kind; Product cannot inherit Service/Transport/Delivery keys.
- Maintains one `skh.activeNegotiationContext`:
  - `kind`
  - `entityId`
  - `conversationId`
  - `partnerUid`
  - `partnerName`
  - `snapshot`
- Clears that context and the Chat host on close.
- Automatically resolves/opens the authoritative conversation; no ordinary-message prerequisite.
- Renders only inside `#chatNegotiationHost`; it cannot append to `document.body` or remain over Home.
- Submit lifecycle is `IDLE → VALIDATING → PREPARING_CONVERSATION → SUBMITTING → SUCCESS`, with `ERROR → retry`.
- Rapid duplicate clicks are blocked synchronously and share a stable request ID.
- Confirmed success remains visible as `✓ Ofa imetumwa`, with `Rudi Chat`.

### `js/app/37-negotiation.js` — STATUS: CLOSED
- Accept/Reject/Counter command buttons pass their clicked element into the existing command function so real processing/success/error state can be rendered.

### `js/app/34-chat-core.js` — STATUS: CLOSED FOR NEW DIMENSIONS ONLY
- No new Chat implementation or wrapper was added.
- Product negotiation payload no longer sends delivery/pickup fields.
- Stable command ID is used as the native negotiation ID and structured Chat event ID for duplicate protection.
- Structured negotiation Chat event failure is returned as an error instead of being silently reported as success.
- System negotiation events may proceed during confirmed CONNECTING state, but never through Chat `ERROR` state.
- Existing Accept/Reject/Counter command function now renders loading, confirmed success, and error/retry state on the clicked button.
- “Patana bei” shows immediate opening/busy state and visible error state.

### `js/app/39-product-showcase.js` — STATUS: CLOSED
- Existing shared Product/Service/Transport entry remains explicit and conversation-first.
- Negotiation launch still avoids pre-filling/forcing a normal greeting.

### `js/app/61-full-system-repair.js` — STATUS: CLOSED
- Removed the proven late `skhNegoFormOpen` wrapper that mutated caller entity collections and could turn `ride_requests` into `drivers`.
- `38-negotiation-form.js` is the sole form authority.

### `js/94-modal-stack.js` — STATUS: CLOSED
- Removed `.nf-shell` from body-level modal authority because negotiation is no longer a body modal.

### Cart/Delivery dependencies — STATUS: CLOSED, UNCHANGED
- `js/app/43-delivery-choice.js` remains the post-agreement delivery-choice authority.
- `js/app/23-smart-cart.js` remains Cart/fulfilment authority.
- `js/app/40-token-box.js` remains custody-token authority.
- None are merged into negotiation.

## Executable journey coverage

### Product
- Form is a descendant of the Chat host.
- Proposed price and quantity are visible.
- No Service, Transport, pickup, destination, delivery-location, or preferred-date fields.
- Submit creates one offer despite rapid double-click.
- Success state is shown after confirmed structured Chat event.
- `Rudi Chat` closes only negotiation.

### Service
- Scope, units, price and message only by default.
- No Product variants, Transport route, pickup, or Product delivery fields.
- Optional schedule/location only with explicit Service business-rule flags.

### Transport
- Route, cargo, date and fare schema only.
- No Product price/variant schema and no Service scope schema.
- Driver and `ride_requests` collections retain their real identity.

### Context leakage sequence
- Product → Service → Transport → Product: all four transitions tested.
- Every close clears `activeNegotiationContext`.
- Every open constructs a new explicit snapshot.
- A newer historical Service negotiation in the same pair conversation cannot replace current Product context.

## Verification

- `npm test`: **PASS, exit 0**.
- Negotiation form logic: **80 pass, 0 fail**.
- Negotiation engine: **108 pass, 0 fail**.
- Negotiation dialogue DOM: **76 pass, 0 fail**.
- Transport negotiation flow: **30 pass, 0 fail**.
- Chat E2E journey: **49 pass, 0 fail**.
- Chat authority/mobile/security/negotiation contracts: **28 pass**.
- Chat/navigation authority: **18 pass, 0 fail**.
- JavaScript syntax: **104/104 files pass**.
- HTML source/build: **byte-exact pass**.
- `git diff --check`: **pass**.

## Validation boundary

The sandbox has no Chromium, Chrome or Firefox executable. Mobile widths 320/360/375/390/412 are covered by CSS/DOM contracts and jsdom flow tests, not physical-device screenshots. Live two-account Firebase production delivery was not claimed.
