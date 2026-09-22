# NEGOTIATION LIVE FAILURE REPORT

Date: 2026-09-22
Scope: post-repair live failures only; no new Chat-core audit.

## 1. Why Product, Service and Transport are mixing

The form engine has three schemas, but its opener still permits non-authoritative inference. `js/app/38-negotiation-form.js:detectTypeAndEntity()` searches, in order, the last negotiation card, three shared globals (`activeChatTransport`, `activeChatService`, `activeChatProduct`), conversation `related`, and historical commerce cards. A deterministic pair conversation can legitimately contain all three commerce types, so historical/latest context is not authority for the entity currently being negotiated.

A late repair layer also wraps `window.skhNegoFormOpen` in `js/app/61-full-system-repair.js:patchNegotiation()` and mutates the supplied entity in place by adding a collection. For Transport it forces `drivers`, even when the real collection is `ride_requests`. This is a second type/context authority after the form.

The previous active-commerce filter reduced one path, but did not remove these fallback authorities or the late wrapper.

## 2. Why “Final Pickup”/delivery content appears

The Product schema itself includes a `productDelivery` section in `js/app/38-nego-form-logic.js:sectionsFor()` with `deliveryLocation` and `preferredDate`. Those fields are copied into the Product proposal and summary.

The Transport schema includes route Pickup/Destination plus pickup/deadline dates. Pickup/Destination is valid for a true Transport negotiation, but it becomes unrelated delivery content when stale inference incorrectly selects Transport while the user is negotiating a Product or Service.

There is no literal `Final Pickup` string in the repository. The live label is therefore produced from delivery/pickup data or UI terminology, not from a standalone hard-coded “Final Pickup” field in the negotiation file.

## 3. Where delivery/pickup originates

- Product negotiation delivery fields: `js/app/38-nego-form-logic.js`, `sectionsFor()`, `defaultValues()`, `validateForm()`, `buildProposal()`, and `summaryLines()`.
- Real Cart/Delivery selection: `js/app/43-delivery-choice.js` (`pickupLocation`, destination, delivery choice, transporter selection).
- Cart/fulfilment state: `js/app/23-smart-cart.js` and bootstrap smart-cart logic.
- True Transport request route/date fields: Transport branch of `js/app/38-nego-form-logic.js`.

The Product negotiation schema duplicates fulfilment concerns that belong after agreement in Cart/Delivery.

## 4. Why submit appears to require an ordinary message

`js/app/38-negotiation-form.js:onSubmit()` requires a captured `convId` and `partnerUid`, but the form does not itself ensure/create the conversation. Some entry points call `skhNegoFormOpen()` directly without first awaiting the authoritative Chat open lifecycle. The resulting error is presented as a Chat prerequisite even though the actual prerequisite is only an initialized conversation.

The proposal submit function is `window.skhChatSubmitNegotiationProposal()` in `js/app/34-chat-core.js`. It also fails when partner/conversation is absent. There is no business rule requiring an ordinary message count; the failure is conversation initialization/context timing.

## 5. Why the form leaves Chat

`js/app/38-negotiation-form.js:skhNegoFormOpen()` creates `#nfShell` and appends it directly to `document.body`. This is a body-level modal, not a Chat descendant.

The previous z-index repair made that body-level modal visible above Chat but did not correct visual ownership. Consequently, navigation or UI layer changes can leave the form visible over Home or make it appear detached from Chat.

## 6. Current DOM owner

Current owner: `document.body`.

Required owner: one authoritative `#chatNegotiationHost` inside the main Chat surface in `html/06-modals-social.html` / generated `index.html`.

## 7. Function that opens it

Authoritative form implementation: `window.skhNegoFormOpen()` in `js/app/38-negotiation-form.js`.

Current callers include Chat start actions in `js/app/34-chat-core.js`, the shared product/showcase sequence in `js/app/39-product-showcase.js`, and explicit Transport entry points. A late wrapper in `js/app/61-full-system-repair.js:patchNegotiation()` currently intercepts the same public function and must be retired as a duplicate authority.

## 8. Function that submits it

UI submit: `onSubmit()` in `js/app/38-negotiation-form.js`.

Commerce submit: `window.skhChatSubmitNegotiationProposal()` in `js/app/34-chat-core.js`, then Cloud Function with the existing Firestore-native fallback.

## 9. State controlling visibility

Visibility is currently implicit: existence of body-level `#nfShell` plus module-local `state`. Closing removes the shell from the body and sets `state = null`.

There is no Chat-owned host and no single exported active negotiation context. Shared Chat commerce globals and historical cards can therefore influence a later open.

## 10. CSS causing escape/clipping risk

`css/17-negotiation-form.css` defines `.nf-shell { position: fixed; inset: 0; }`, so it is viewport/body-oriented rather than Chat-surface-oriented. `.nf-sheet` uses up to `94dvh`, also based on the whole viewport.

The Chat card has `overflow:hidden`. A correct in-Chat host therefore needs an explicit positioned Chat main surface and controlled absolute host; simply moving the existing fixed shell without host CSS would clip or misplace it.

## 11. Why buttons appear dead

The form submit button only changes text to `Inatuma…` and disables during request. On success the form is immediately removed, so confirmed success is not visibly retained. Error restores the button but has no explicit retry state machine or `aria-busy` lifecycle.

Negotiation action buttons (Accept/Reject/Counter and related commands) call command functions directly from inline handlers. They do not pass the clicked element into the command lifecycle, so the button cannot display processing/success/error per operation. Some commands open prompts or wait on backend work with no immediate per-button feedback.

## 12. Stale context involvement

Yes. Stale context is a primary cause:

- fallback detection reads historical negotiation/cards;
- three shared active commerce globals can coexist historically;
- conversation `related` can contain prior commerce fields;
- the late `61-full-system-repair.js` wrapper mutates caller-owned entity objects;
- close clears only local form state, not a single authoritative negotiation-context object.

## 13. Exact repair surface

Required:

- `html/06-modals-social.html` — add one Chat-owned negotiation host and positioned main surface.
- `css/17-negotiation-form.css` — convert shell from viewport-fixed to Chat-hosted absolute layout; add responsive/keyboard-safe states.
- `js/app/38-nego-form-logic.js` — remove Product delivery fields/payload/summary; keep explicit, separate schemas.
- `js/app/38-negotiation-form.js` — explicit context construction only; automatic conversation ensure; render/clear Chat host; submit state machine and duplicate protection.
- `js/app/39-product-showcase.js` — preserve explicit kind/entity and conversation-first sequence.
- `js/app/34-chat-core.js` — structured negotiation command button feedback and stable idempotency key; no new Chat implementation.
- `js/app/61-full-system-repair.js` — remove the proven duplicate negotiation wrapper only.
- Negotiation/E2E/mobile contract tests — add Product→Service→Transport→Product isolation, no Product delivery fields, Chat-host ownership, no manual-message gate, button state, and width contracts.

Conditional files checked but not implicated in form rendering:

- `js/app/43-delivery-choice.js` owns the correct post-agreement delivery flow and should remain separate.
- `js/app/40-token-box.js` owns custody tokens and is not the source of the negotiation form.
- `js/app/23-smart-cart.js` remains fulfilment/cart authority and should not be merged into negotiation.
