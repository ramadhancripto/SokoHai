# SokoHai Chat Home Identity Closure — 2026-09-22

## Scope
Refined the existing Chat Home only. No sample conversations, duplicate Chat application, new route, new Firebase collection, or fake state was added.

## Proven authority and data path
- Live inbox authority: `js/app/93-chat-inbox-repair.js`.
- Chat lifecycle/navigation authority remains `js/app/34-chat-core.js`.
- Rows still originate from real `conversations` records, with the existing legacy `chats` compatibility read.
- Group Buy / Order Group identity now uses the existing `conversations.goHead` summary already maintained by the group-order system. No new data structure was introduced.

## Implemented hierarchy
- White remains the inbox and row surface.
- Personal chats: circular soft-green DP treatment and compact soft-green name block; business roles receive a slightly stronger green.
- Groups: rounded-square `#EAF3FA` identity avatar, `#39779B` text, compact blue name block, and a `GROUP` label. The row itself remains white.
- Order Groups: rounded-square cream/gold identity, compact cream name block, `ORDER GROUP` label, and actual `totalQty / targetQty` progress in green when available. The row itself remains white.
- Long names are safely ellipsized.
- Header uses pale green/white rather than a dark blue fill.
- Identity filters expose Zote, Watu, Groups, Order Groups, Zisizosomwa, and Kumbukumbu.
- Existing Wanunuzi, Wauzaji, Wasafirishaji, and Mawakala filters remain available in the same horizontal filter rail.
- Real group member counts remain visible beside `GROUP` / `ORDER GROUP`.
- Stored group emoji avatars are preserved whole (including surrogate-pair emoji); Order Groups use the real stored avatar before the commerce-icon fallback.
- Group draft and mute states remain visible, while pin/archive continue to use their real record flags. Pin uses a neutral accent rather than borrowing premium gold.
- The all view organizes non-pinned records into Watu, Groups, and Order Groups while preserving real ordering inside each set.

## Preserved behavior
Search, timestamps, unread counts, real profile photos, last messages, member counts, pin ordering, archive filtering, mute indication, drafts, verified state, and existing direct/group destinations remain connected to the real records.

## Changed files for this refinement
- `js/app/93-chat-inbox-repair.js`
- `css/34-chat-inbox-identity.css`
- `html/00-head.html`
- `index.html` (rebuilt from fragments)
- `tools/test_chat_home_identity_contract.mjs`
- `package.json`
- `FINAL-TEST-LOG.txt`

## Verification
- Chat Home identity contract: **30 passed, 0 failed**.
- Full `npm test`: **exit 0**.
- Chat E2E: **57 passed, 0 failed**.
- Chat authority contract: **32 passed**.
- Navigation authority: **18 passed, 0 failed**.
- JavaScript syntax: **105 files passed**.
- HTML fragment build/check: **22 fragments, byte-exact**.
- `git diff --check`: passed.

No browser runtime was available, so no screenshot or physical-device claim is made. The implementation was verified through the real renderer source, final cascade contract, full automated suite, syntax checks, and byte-exact HTML build.
