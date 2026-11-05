# Chat Sponsored Business Discovery Feed — Stage B Refinement Report

**Project:** SokoHai · Chat module
**Stage:** B — refinement of the approved UI direction + functional integration
**Repo HEAD:** `03a6811 Merge SokoHai feature improvements into main`
**Date:** 2026-11-04 (Africa/Dar_es_Salaam)
**Status:** Implemented and verified in a real browser. **Not committed, not pushed, not merged, not deployed** (as instructed).

---

## 1. What this refinement did

Stage B turned the Chat opening screen into a **premium sponsored business advertising + discovery feed** instead of a row of ordinary product cards. The refinement phase kept that direction and fixed the things that were still wrong: the card was too tall/narrow, labels lied or duplicated, the CTA shouted, the arrows sat on top of the cards, the Plus menu looked like a list of buttons, and `SPONSORED` had to prove it was paid.

One feed. Not a second section, not a Status feature, no parallel feed beside the old one.

**Chat hierarchy (unchanged, as required):**

| # | Layer | Element |
|---|-------|---------|
| 1 | SokoHai header | `.ch-inbox-head` brand |
| 2 | Chat heading + `+` | `CHAT` / "Mazungumzo yako ya biashara" + `#sogaPlusBtn` |
| 3 | Search + filters | `.ch-inbox-search`, `#inboxChips` |
| 4 | **Gundua Biashara feed** | `#skhDiscoverFeed` → `.skh-df-rail` → `#skhDfTrack` |
| 5 | Inbox / Mazungumzo | `#inboxList` (+ `#skhDfPill` restore chip when hidden) |

**No Status anywhere:** no Status section, composer, rings, "Status za Biashara"/"Status yangu", no publishing area. Verified by an automated assertion at all five viewports (`hasStatusWord: false`, `statusRing: 0`).

---

## 2. Files changed in this stage

| File | Change | Lines |
|------|--------|-------|
| `js/app/106-chat-discovery-feed.js` | **new** — the sponsored feed module (data adapter, card painter, viewer, “Tazama zote” sheet, follow bridge, edge states) | 930 |
| `css/52-chat-discovery-feed.css` | **new** — all `.skh-df-*` / `.skh-spm-*` styling, 10 numbered sections + responsive + reduced-motion | 800 |
| `js/app/69-chat-groups.js` | `window.skhSogaPlusMenu` rewritten (two groups); dispatch extended with `shareproduct`, `advertise` | +75 / −12 |
| `index.html` | CSS link, `#skhDiscoverFeed` + `#skhDfPill` markup between chips and inbox, module script, `+` button `title`/`aria-label` | +40 / −1 |

**Untouched and must stay untouched:** Services System, Transport System, Business OS, Product Modules, POS, SokoPay, Firestore Rules, Cloud Functions, Group Chat membership logic, chat security rules, `html/*.html` fragments. No new collection, no `videoUrl` schema, no second follow system, no second group-buy join.

> **Note on the working tree.** `git status` also lists `firestore.rules` (+127) and `package.json` (+1, the `test:chat-security` script) as modified. Those are **from the earlier Stage 1 chat-security work** (mtime 04:48/04:49, before this stage began at 06:34) and were not touched here. They are excluded from the delivered patch.

**Exact patch:** `/home/user/audit/stageB2/CHANGES.patch` (1,925 lines; 4 files — the two new files as full-file additions).

---

## 3. Card design (the change that mattered)

The old card was an ordinary marketplace product card. The new one is media-first:

```
┌───────────────────┐
│  4:5 media        │  ← real photo, object-fit: cover, gradient shade at bottom
│  [BIDHAA][SPONSORED]│  ← labels top-left, data-supported only
│  TZS 23,000       │  ← on-media price line (only when the record has a price)
│  Chakula          │
├───────────────────┤
│ Mafuta ya Alizeti 5L │  ← short title, 2-line clamp
│ Mafuta safi ya alizeti… │  ← promo line, 2-line clamp
│ ● Neema Kessy      │  ← avatar + name
│   Muuzaji          │  ← role
│ [  TAZAMA BIDHAA ] │  ← one CTA, tinted #EAF8F2 / #CDE9DC
└───────────────────┘
```

**Measured geometry (identical proportions at every viewport):**

| Viewport | Card w | Card h | Media h | Media ratio | CTA h | Rail gap | Feed h |
|----------|--------|--------|---------|-------------|-------|----------|--------|
| 1440 | 188 px | 369 px | 233 px | 0.80 = 4:5 | 28 px | 11 px | 447 px |
| 820 | 188 px | 369 px | 233 px | 0.80 | 28 px | 11 px | 447 px |
| 768 | 188 px | 369 px | 233 px | 0.80 | 28 px | 11 px | 447 px |
| 390 | 176 px | 354 px | 218 px | 0.80 | 28 px | 11 px | 434 px |
| 360 | 164 px | 339 px | 203 px | 0.80 | 28 px | 11 px | 419 px |

Card height ≈ 1.96 × width — a premium ad card, not a narrow strip and not a full-screen slab. Carousel arrows live entirely in the gutter (`left/right: calc(var(--ch-col) - 36px)`), so they never cover a card face.

**Label hierarchy (only one state claim per card):** kind badge (`BIDHAA`/`HUDUMA`/`USAFIRISHAJI`/`NUNUA PAMOJA`/`MNADA UNAENDELEA`/`BEI IMESHUKA`) + at most one of `SPONSORED` / `LIVE` / `MPYA`. Live/status badges are `static` (no animation) except the genuine `LIVE` pip, and animation is dropped entirely under `prefers-reduced-motion`.

**CTA map (one CTA per card, consistent size/weight/radius/padding):**

| Kind | CTA | Destination (existing code only) |
|------|-----|----------------------------------|
| product | `TAZAMA BIDHAA` | `openProduct()` → real Product Details |
| group_buy | `JIUNGE SASA` | canonical `skhGroupBuyJoin()` |
| auction | `TOA ZABUNI` | real bidding surface (`skhPsScrollToBid`) — never an ordinary product page |
| price_drop | `TAZAMA OFA` | Product Details with the real previous + current price |
| service | `TAZAMA HUDUMA` | Service Details |
| transport | `OMBA USAFIRI` | real transport/request flow |

---

## 4. Truth rules enforced by the data adapter

| Rule | How it is enforced |
|------|--------------------|
| `SPONSORED` only for genuinely boosted records | `skh.boostEligibility(x)` → `listingEligible(x)` **AND** `isBoosted === true` **AND** boost end (`boostExpiresAt`/`boostedUntil`/`boostEndAt`/`boostExpiry`, else `boostedAt + boostDays·86400000`) in the future **AND** `boostedViewsCount < boostTargetViews`. Organic items show `BIDHAA`/`TANGAZO` and never claim payment. |
| Price-drop only when the price really dropped | `oldPrice` is rendered **only** when `base > price`; no generated percentages, no invented old price. |
| Auction status/bid/time | read from backend fields only; nothing synthesised. |
| Group Buy | real cover, seller, status, participants, deadline/progress, `Jiunge Sasa` → `skhGroupBuyJoin`. |
| Group Orders | **never rendered** — `chatGroupOrders` flag defaults OFF and no public authorised backend flow exists. No card, no chip, no dead CTA. |
| Video | no `videoUrl` field and no Storage in this stage, so the play icon is never painted. Images never get a fake player. |
| Transport | name/route/price only from real records; no fabricated availability, vehicle or driver. |
| Empty vs failed read | `feed_unavailable` (retry) is a distinct state from `Hakuna tangazo bado…` (ready/empty). |

**Verified live during testing:** `df_p_1` (boost valid, expires +5 d) → `SPONSORED`; `df_sv_1` (boost expired −1 d) → **not** sponsored, no label. Exactly 1 sponsored card out of 9.

---

## 5. Viewer

Large media stage · real seller identity (avatar, name, role) · follow · category + status · title · real supporting facts (price, category, views) · description · **one** contextual CTA · close button.

- No autoplay, no sound, no `<video>` element for image-only records; an image-only record explicitly says *"Hakuna video kwa tangazo hili — unaona picha halisi."*
- Header shows the type name as text (`.skh-df-vtitle`), so the kind badge is not duplicated.
- **Closing the viewer never closes the Inbox:** viewer/sheet use `bindLayer()` with `stopPropagation`; Escape is handled in the capture phase with `stopImmediatePropagation`, so it closes only the topmost layer. Verified: viewer closes → `#chatListModal` still `flex` and the feed keeps its 9 cards.

**Follow uses the one existing system** — `window.skhToggleFollowSeller(sellerId, sellerName, btnEl)`, state in `window.skhEngagementState.following` and the `sellerFollowers/{uid}__{sellerId}` relation doc. No second follow implementation.

---

## 6. Plus (`+`) menu

`#sogaPlusBtn` stays the single entry point. No status button. Two labelled groups:

**A · Mawasiliano** (unchanged behaviour)
- Mazungumzo mapya → `skhContactPicker({multi:false})`
- Kikundi kipya → existing `openCreateModal()` wizard
- Chagua wanachama → `skhContactPicker({multi:true})`

**B · Shughuli za Biashara**
- **Shiriki Bidhaa** → contact picker → opens the real conversation → `skhChatAttachProduct()` (reads `products where userId == me`, reuses existing media/details, sends through the existing message writer — **no duplicate product record**)
- **Tangaza Biashara** → `skhOpenMarketplaceAdsStudio()` (existing announcements/campaign studio)
- **Omba Bei** → visibly disabled (`disabled` + `aria-disabled="true"`), because the offer flow only works inside a conversation that already contains a product. Shown, not faked.

### Plus menu action matrix

| Item | Handler | Live? | Evidence |
|------|---------|-------|----------|
| Mazungumzo mapya | `skhContactPicker({multi:false})` | ✅ | picker opens, 3 real contacts |
| Kikundi kipya | `openCreateModal()` | ✅ | "Unda Kikundi" modal opens |
| Chagua wanachama | `skhContactPicker({multi:true})` | ✅ | multi-select picker |
| Shiriki Bidhaa | picker → `openChatWithUser` → `skhChatAttachProduct()` | ✅ after joining a chat | picker → conversation (`chatModal: flex`) → product list (1 owned product) → send closed picker and wrote a real message (`type: product`, `productRef: {products/df_my_1}`, `productSnapshot.title: "Kikapu cha Kusuka (kikubwa)"`) |
| Tangaza Biashara | `skhOpenMarketplaceAdsStudio()` | ✅ | Ads Studio root present, `.open`, heading *"SokoHai Marketplace Ads"* |
| Omba Bei | — | ⛔ disabled by design | chat-only workflow; no fake action |

Menu geometry: 1440/820/768 → 399 px tall, anchored under the `+`; 390/360 → bottom sheet, 345/362 px, last row fully visible, no clipping. Max-height is now `calc(100dvh - 72px)` with `overflow-y:auto` so a short screen can never cut a row.

---

## 7. Backend support matrix

| Content type | Source collection | Public authorised read | Destination | Verdict |
|--------------|-------------------|------------------------|-------------|---------|
| Product (`BIDHAA`) | `products` | ✅ | `openProduct()` | **Live** |
| Sponsored product | `products` + boost fields | ✅ | `openProduct()` | **Live** — truth from `boostEligibility` |
| Service (`HUDUMA`) | `services` | ✅ | Service Details | **Live** |
| Transport (`USAFIRISHAJI`) | `drivers` / transport records | ✅ | request flow | **Live** |
| Group Buy (`NUNUA PAMOJA`) | `groupBuys` | ✅ | `skhGroupBuyJoin` | **Live** (join tested on emulator only) |
| Auction (`MNADA UNAENDELEA`) | auction fields on products | ✅ | bidding surface | **Live** |
| Price Drop (`BEI IMESHUKA`) | `price` + `oldPrice` | ✅ | Product Details | **Live** when genuinely decreased |
| Group Order | `chatGroupOrders` | ❌ no public authorised flow (flag OFF) | — | **Not rendered** |
| Video ads | — | ❌ no `videoUrl`, no Storage | — | **Not rendered** |
| Broadcast / Add Customer | — | ❌ no backend | — | **Kept out of the menu as operational** |

---

## 8. Edge states (distinguishing genuine empty from failed read)

| State | Behaviour | Verified |
|-------|-----------|----------|
| Missing image | inline `data:image/svg+xml` placeholder, no broken-image icon | ✅ |
| Missing video | no play icon, no player; viewer states it is a photo | ✅ |
| Loading | 3 skeleton cards, `status: loading` | ✅ |
| Empty | *"Hakuna tangazo bado…"*, `status: ready` | ✅ |
| Backend read error | *"Imeshindikana kupakia matangazo… Jaribu tena."* + retry → recovers to 9 cards / `ready` | ✅ |
| Unsupported type (group_order) | never rendered, no chip | ✅ |
| No available CTA | card renders without a CTA button (nothing to fake) | ✅ |

---

## 9. Test results

### Full journey, 5 viewports — 1440 / 820 / 768 / 390 / 360

Every viewport produced an identical result set; all checks passed.

```
 1440 | PASS | cards=9 sponsor=1
  820 | PASS | cards=9 sponsor=1
  768 | PASS | cards=9 sponsor=1
  390 | PASS | cards=9 sponsor=1
  360 | PASS | cards=9 sponsor=1

ALL VIEWPORTS PASS: True
```

Per-viewport assertions: feed sits **after** search + chips and **before** `#inboxList` · 9 cards · media ratio `4/5` · exactly 1 sponsored · 9/9 cards carry avatar + name + role · carousel scrolls via arrows · viewer opens with no `<video>`/autoplay and a follow button · Escape closes the viewer with `#chatListModal` still `flex` · “Tazama zote” = 9 cards · “Ficha” hides the feed and shows the restore pill, restoring returns it · inbox 4 rows · search “Amina” → 1 row with the feed intact · conversation opens (`flex`) and back returns to the list (`flex`) with the feed intact · no “status” word, 0 status rings · no page-level horizontal overflow (`scrollWidth == clientWidth`).

**Labels observed:** `[BIDHAA, SPONSORED]`, `[NUNUA PAMOJA, LIVE]`, `[MNADA UNAENDELEA, MPYA]`, `[BEI IMESHUKA, MPYA]`, `[BIDHAA, MPYA]` ×4, `[HUDUMA, MPYA]`, `[USAFIRISHAJI]`.
**“Tazama zote” chips:** Zote 9 · SPONSORED 1 · Nunua Pamoja 1 · Mnada 1 · Bei Imeshuka 1 · Bidhaa 4 · Huduma 1 · Usafirishaji 1.

### Console errors

| Viewport | `pageerror` | Console |
|----------|-------------|---------|
| 1440 / 820 / 768 / 390 / 360 | **0** | one benign `[SokoHai:unhandledrejection]` beacon per viewport |

Pre-existing, unrelated, reported only: `items.filter is not a function` at `js/app/34-chat-core.js:3623` when typing in inbox search.

### Repo test suite

| Run | Result |
|-----|--------|
| Working tree (this stage) | **77 / 80** |
| Pristine `git archive HEAD` in `/tmp/skh-base` | **77 / 80** |

Same three failures in both runs — **known baseline, not caused by this stage**:
1. `tools/test_users_privacy_inventory.mjs` (`34-chat-core.js:310`)
2. `tools/test_white_system_modules_contract.mjs` (avatar)
3. `tools/test_white_system_final_contract.mjs` (Discover name)

No new failures.

### Functional checks beyond the journey

- **Follow** (real browser, real emulator): `Fuata` → `Unafuata` (`aria-pressed="true"`), `sellerFollowers/{uid}__u_seller_neema` doc created in Firestore; toggling back restored `Fuata` and **deleted** the doc. `Fuata` on load when the relation doc is absent.
- **Product sharing**: message written with `type: product`, `productRef: {collection: "products", id: "df_my_1"}`, `productSnapshot.title` populated — reusing the existing product, no duplicate record.

---

## 10. Defects found and fixed inside this refinement

1. **`SPONSORED` gone from live cards** — a PATCH to the emulator without `updateMask` had replaced whole documents, wiping the boost fields on `df_p_1`/`df_sv_1`. Both restored with full payloads; now `df_p_1` is sponsored and `df_sv_1` (expired) correctly is not.
2. **Duplicate/incorrect labels** — label priority rewritten: one kind badge + at most one of `SPONSORED`/`LIVE`/`MPYA`; removed duplicate `LIVE` and a duplicated `MNADA UNAENDELEA` in the viewer header.
3. **Cards too tall and narrow, arrows over the artwork** — card width 188 px (176/164 on small screens), 4:5 media, arrows moved fully into the gutter.
4. **CTA too loud** — softened to a tint (`#EAF8F2` / `#CDE9DC`) so it reads as a business CTA, not a marketplace button.
5. **`Ndani ya chat` badge overlapped the image text** — removed.
6. **False follow success** — the button painted the optimistic state and the canonical writer then failed silently in this test account, leaving a green “followed” button with nothing in the database. Now the honest state is painted only after the canonical call settles, and a failure surfaces a toast instead of a fake success.
7. **Follow state never hydrated** — the page-level `skhLoadEngagementState` hydrates four relations with one `Promise.all`, so a single denied read (a relation doc that does not exist) blanked all of them. The feed now reads the *same* `sellerFollowers` relation doc directly and writes through the *same* `skhToggleFollowSeller`. One system, still.
8. **Plus menu cut off on short screens** — the last row could be clipped. The menu now caps at `calc(100dvh - 72px)` with internal scrolling, and a short-screen block tightens spacing. (A first attempt set `top` in that block, which overrode the mobile bottom-sheet anchor and stretched the menu down the whole screen — removed.)
9. **`Ficha` restore path re-verified** — hiding the feed shows the `#skhDfPill` restore chip and brings the feed back (asserted at all five viewports).
10. **Search/state HTML replaced the wrong node** — state HTML now replaces `#skhDfTrack` contents, so “loading/empty/error” no longer breaks the carousel.

---

## 11. Known limitations (reported, not faked)

- **Group Orders** — no public authorised backend flow and `chatGroupOrders` defaults OFF → nothing is rendered. Needs a backend decision before it can appear.
- **Video ads** — no `videoUrl` field and no Storage path in this stage. Play/pause/mute controls exist behind the real-video branch but are unexercised; no invented URLs.
- **Advertising publishing** — “Tangaza Biashara” opens the existing Ads Studio. A Chat-side advertiser identity/publish flow does not exist and was **not** invented.
- **“Omba Bei”** — only meaningful inside an open product conversation, so it is disabled in the menu rather than opening a dead surface.
- **Broadcast / Add Customer** — no backend; deliberately not exposed as operational.
- **Emulator test data** — verification created one conversation between `df.tester` and `u_hamisi` containing the shared product message, and left 9 seeded feed records. This is emulator-only, not in the repo.

---

## 12. Git state

**Before this stage** (start of refinement):

```
$ git log --oneline -1
03a6811 Merge SokoHai feature improvements into main

$ git status --porcelain
 M firestore.rules
 M index.html
 M package.json
?? css/52-chat-discovery-feed.css
?? js/app/106-chat-discovery-feed.js
?? tools/test_chat_conversation_security.mjs
```

**After this stage (current):**

```
$ git log --oneline -1
03a6811 Merge SokoHai feature improvements into main

$ git status --porcelain
 M firestore.rules          ← Stage 1, untouched here
 M index.html               ← this stage
 M js/app/69-chat-groups.js ← this stage
 M package.json             ← Stage 1, untouched here
?? css/52-chat-discovery-feed.css
?? js/app/106-chat-discovery-feed.js
?? tools/test_chat_conversation_security.mjs   ← Stage 1, untouched here

$ git diff --stat
 firestore.rules          | 127 +++++++++++++++++++++++++++++++++++++++++++++-
 index.html               |  40 +++++++++++++++-
 js/app/69-chat-groups.js |  75 ++++++++++++++++++++++++----
 package.json             |   1 +
```

**HEAD unchanged. Nothing staged. No commit, no push, no merge, no deploy.**

---

## 13. Acceptance checklist

| Criterion | Result |
|-----------|--------|
| No Status section / composer / rings | ✅ none, asserted at 5 viewports |
| Sponsored-style feed between Search and Inbox | ✅ |
| Real products appear | ✅ 9 genuine records |
| Genuine promotions / Group Buy / auction / Price Drop shown | ✅ only where data supports it |
| Cards open the correct **existing** destinations | ✅ `openProduct`, `skhGroupBuyJoin`, bidding surface |
| Plus menu keeps existing conversation flows + approved business sharing | ✅ with one item honestly disabled |
| No fake video / ad / data / false success | ✅ fixed defects 6 & 7 explicitly |
| Inbox, conversations, chat intact | ✅ open/back/group/calls untouched |
| Responsive 1440 / 820 / 768 / 390 / 360, no horizontal overflow | ✅ |
| No unrelated modules changed | ✅ |
| Verified in the real browser, then stopped | ✅ |

---

## 14. Screenshots

`/home/user/audit/stageB2/screens/` — 51 PNGs.

Per viewport (`1440`, `820`, `768`, `390`, `360`): `-10-feed`, `-11-scrolled`, `-15-plus-menu`, `-20-viewer`, `-30-ficha`, `-40-tazama-zote`, `-41-sponsored`, `-50-search`.

1440-only extras: `1440-22-sponsored-viewer`, `1440-23-missing-image-viewer`, `1440-24-following`, `1440-60-loading`, `1440-61-empty`, `1440-62-error`, `1440-70-plus-contact`, `1440-71-plus-group`, `1440-72-share-product`, `1440-73-plus-advertise`, `1440-74-share-sent`.

Earlier Stage B evidence: `/home/user/audit/STAGEB-REPORT.md`, `/home/user/audit/stageB/screens/` (41 PNGs).
