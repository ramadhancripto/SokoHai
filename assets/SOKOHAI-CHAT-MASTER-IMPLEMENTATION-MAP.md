# SOKOHAI CHAT — MASTER IMPLEMENTATION MAP

Date: 2026-09-22  
Repository authority: existing root application; no Chat V2, duplicate route, duplicate collection, or replacement implementation.

## Inspection boundary

Authoritative Chat UI and behavior:

- `html/06-modals-social.html`
- `css/15-chat-comments.css`
- `css/24-chat-ui-v2.css`
- `css/32-chat-master-ui.css`
- `js/app/34-chat-core.js`
- `js/app/69-chat-groups.js`
- `js/app/73-group-soga.js`
- `js/app/74-group-order-system.js`
- `js/app/93-chat-inbox-repair.js`
- `firestore.rules`

Commerce dependencies already in Chat remain in their existing Product, Service, Transport, Order, Delivery, Group Order, and Negotiation modules.

## Existing capabilities confirmed

- One-to-one inbox and conversation opening
- Compact person/group/group-order rows and unread state
- Direct-message canonical conversation IDs and duplicate-send protection
- One active direct-chat message listener with stale-conversation guard
- Reply, swipe-to-reply, copy, reactions, forward, save, report, sender-only edit/delete entry points
- Product, Service, Transport, Order, Delivery, and Negotiation structured messages/cards
- Real sending/sent/delivered/read/failed states
- Image/video/audio/file upload through the existing uploader
- Voice recording through the existing browser MediaRecorder path
- Inbox search and loaded-message search
- Archive, mute, block, report, delete-for-me, drafts, and retry
- Existing Group and Group Order engines with membership and role controls
- Chat-owned negotiation host and separated Product/Service/Transport negotiation schemas
- Mobile width contracts for 320/360/375/390/412 px

## Defects confirmed from the new master requirements

1. Edit used a prompt instead of composer edit mode.
2. Header had no visible conversation-search control despite a search function existing.
3. DP/name did not directly open the existing profile route.
4. Message multi-selection mode is absent.
5. Conversation-row swipe-to-archive is absent.
6. Forward currently supports only a subset of structured message kinds.
7. The `+` hub exposes only camera/gallery/document/location/product/order; Saved, Liked, My Products, completed orders, services, transport, negotiation, Group Buy, and profile sharing need real data-backed selectors.
8. Chat Home search is local inbox filtering, not yet federated across messages, products, orders, services, transport, files, and links.
9. Conversation info lacks one consolidated Media/Files/Links/Products/Orders view.
10. Voice notes use tap-to-start/tap-to-stop; hold, swipe-cancel, lock, timer, and waveform are not implemented.
11. Group UI and Group Buy need a single visual/navigation review against role visibility and gold/green identity requirements.
12. The public GitHub tree still contains the retired duplicate application below `fonts/`; those tracked files need deletion in a real Git commit.

## Repairs completed in this master pass

### Composer edit lifecycle

- `skhChatEdit` now enters the existing composer instead of opening a prompt.
- The original message is previewed in an edit chip.
- Send changes to Save while editing.
- Cancel is visible.
- Save updates the same Firestore message document and writes `editedAt`.
- Ownership, message kind, deleted state, and duplicate creation are guarded.
- The sender-only Firestore update rule remains authoritative.

### Conversation header

- Added a visible search button and real search row tied to the existing message search engine.
- Closing search clears the filter and restores the stream.
- DP and account name now invoke the existing profile route.
- No new route or profile component was created.

### Tests

`tools/test_chat_e2e_journey.mjs` now proves:

- edit mode displays in the composer;
- Send becomes Save;
- the same document is updated;
- no duplicate message is created;
- edit mode closes after confirmed save;
- header search opens, filters, closes, and restores the message stream.

Latest focused result: **57 passed, 0 failed**.

## Next implementation order

1. Message selection state and selection toolbar
2. Conversation swipe/archive with threshold and desktop equivalent
3. Complete structured forward/share support
4. Data-backed `+` marketplace hub selectors
5. Conversation info: Media/Files/Links/Products/Orders
6. Federated Chat Home search
7. Voice-note hold/cancel/lock UX
8. Group and Group Buy visual/navigation closure
9. Full responsive, rules, E2E, and live-deployment verification

No item will be represented by a dead button. A UI action is added only when its real data query/write/navigation path exists.
