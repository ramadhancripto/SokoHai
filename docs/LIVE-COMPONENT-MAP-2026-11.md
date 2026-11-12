# LIVE COMMERCE — COMPONENT MAP (Hatua 2) · 2026-11-10

Hadhi: 🟩 IPO (tumia tena, usijenge upya) · 🟨 BORESHA (ipo sehemu) · ⬛ MPYA (jenga baada ya idhini) · 🟥 THIRD-PARTY/BLOCKER (mmiliki).

## 1. SHARED LIVE FOUNDATION (jenga mara moja)

### 1.1 Discovery (`120` + hub + home)
| # | Component | Hali | Mahali / Kumbuka |
|---|-----------|------|------------------|
| 1 | Live Now section | 🟩 | Hub LIVE SASA + home slider |
| 2 | Upcoming + reminders | 🟩 | YANAYOKUJA + `liveRemind` |
| 3 | Featured Live | ⬛ | Flag `featured` (server-set) + rail |
| 4 | Recommended | ⬛ | Rahisi: zinazoisha muda / zinazotazamwa zaidi (bila ML) |
| 5 | Category filters + Search | ⬛ | Filter kind + text search (client-side juu ya 30 docs) |
| 6 | Event cards + status | 🟨 | `cardHtml`; ongeza Starting Soon/Paused/Cancelled |
| 7 | Counts/thumb/seller/Join | 🟩 | `viewerCount`, product, hostName, `liveJoin` |

### 1.2 Shared layout (room shell)
| # | Component | Hali | Mahali / Kumbuka |
|---|-----------|------|------------------|
| 1–3 | Header, LIVE badge, seller identity | 🟩 | `renderRoomShell`, `paintHost`, Fuata |
| 4–8 | Gallery, image, name/desc, specs, condition | 🟨 | Pinned card + "Fungua"→details kamili (`openProduct`) |
| 9 | Stock | 🟩 | Kwenye panels (drop/group) |
| 10–11 | Timer (server), participant counter | 🟨 | `liveTime` offset MPYA; count IPO |
| 12 | Activity indicators | 🟨 | Event feed MPYA (kutoka snapshots zilizopo) |
| 13 | Business panel | 🟩 | CTA kwa mode (`tick()`) |
| 14–15 | Comments + reactions panels | 🟨 | Taz 1.3 |
| 16–18 | Share / Save / Report | 🟨 | Share+Report IPO; **Save event MPYA** |
| 19–20 | Seller info / Exit | 🟩 | Host block + `leaveRoom` (+pagehide MPYA) |

### 1.3 Comments Engine (store moja: `live_sessions/{sid}/comments`)
| # | Component | Hali | Mahali / Kumbuka |
|---|-----------|------|------------------|
| 1–4,8,11 | Stream, composer, send, list, avatar, timestamps | 🟩 | `liveComment` + overlay + form |
| 5–6 | Reply + threading | ⬛ | `parentId` (additive) + UI |
| 7 | Reactions za comment | ⬛ | `comment_reacts/{cid}__{uid}` + callable + UI |
| 9–10 | Seller/buyer badge | 🟨 | Seller name IPO; beji rasmi + buyer MPYA |
| 12–14 | New-indicator, load-older, pagination | ⬛ | Cursor `startAfter`, 25/page |
| 15 | Edit/delete own | ⬛ | `liveCommentEdit/Delete` (owner+window) |
| 16–17 | Seller pin/hide | 🟨 | Hide IPO; pin MPYA (`pinnedCommentId`) |
| 18–20 | Admin mod, report, mute/block | 🟨 | Report/mute IPO; block live-scope MPYA |
| 21–22 | Spam/rate-limit, retry | 🟩 | 2s throttle + idempotency + restore |
| Modes | Live overlay + Persistent discussion | 🟨 | Overlay IPO; discussion MPYA (store ile ile) |

### 1.4 Participation
| Component | Hali | Kumbuka |
|-----------|------|---------|
| Join/Leave + counts | 🟩 | `liveJoin/liveLeave` (txn) |
| Participant list | ⬛ | UI kwa host (rules tayari: host-read) |
| Presence: online-vs-joined + cleanup | ⬛ | Heartbeat 60s + sweep 5min + pagehide-beacon |
| Likes/reactions, share/save/follow, seller replies | 🟨 | Likes/share IPO; reactions/save MPYA |
| Notifications | 🟨 | Taz §4 |
| Connection/empty/error/loading states | 🟨 | Connection-state UI MPYA |

### 1.5 Seller Studio (light)
| Component | Hali | Kumbuka |
|-----------|------|---------|
| Create/type/product-picker/title/desc/schedule/start | 🟩 | `skhLiveCreateForm` + `liveCreate` |
| Details preview + live preview | ⬛ | Preview screen kabla ya Start |
| Dashboard (counts/comments/pin/end) | 🟨 | Unganisha controls zilizotawanyika |
| Pause/resume | ⬛ | Status + rules (mnada: ruhusu kabla ya zabuni ya 1 tu — policy) |
| Performance summary/report | ⬛ | Kutoka records (G) — bila revenue isiyo na data |

## 2. LIVE MNADA (engine: `commerce-modes.js` — USIGUSE logic)
| Component | Hali |
|-----------|------|
| Setup: product/title/desc/gallery/start-price/increment/times/terms/preview/confirm | 🟨 (modeData inaunga; seller form thibitisha) |
| Reserve price / Buy-now / min eligibility / pause-cancel policy | ⬛ (reserve+buynow = uamuzi wa mmiliki) |
| Buyer: image/details/current/min-next/input/quick-bid/confirm/feedback/leader/history(15)/count/countdown/anti-snipe-notice/comments/rules/share/follow | 🟩 (quick-bid 🟨) |
| Mgmt: live-updates/validation/increment/history/eligibility/dup-prevention/server-timer/anti-snipe/finalize/winner/notify/deadline/second-chance/unpaid/report | 🟩 (server-timer offset 🟨; pause 🟨 policy) |
| Result: ended/winner/payment-states/summary/buyer-result/order/delivery | 🟩 (payment-status UI 🟨) |

## 3. LIVE PRICE DROP (engine: `price-drop-queue.js` + `pricing-core.js` — USIGUSE)
| Component | Hali |
|-----------|------|
| Setup: product/gallery/orig/start/min/schedule/interval/amount/times/stock/maxqty/eligibility/rules/preview/confirm | 🟨 (modeData inaunga wote; seller form thibitisha) |
| Buyer: image/details/orig/current/discount/next-drop/countdown/stock/qty-selector/buy/join/comments/reactions/count/share/rules | 🟩 (qty-selector UI 🟨; reactions ⬛) |
| Engine: schedule/server-price/sync/history/stock/qty/eligibility/orders/dup-prevention/reservation/notifs/soldout/expired/cancelled/report | 🟩 (history ⬛; soldout/cancelled UI 🟨) |

## 4. LIVE GROUP BUY (logic: `groupBuyJoin` + `pricing-core` — PANUA, usichanganye na mnada)
| Component | Hali |
|-----------|------|
| Setup: product/gallery/normal/group-price/min-participants/max?/qty/qty-per-buyer/times/delivery/payment/eligibility/preview/launch | 🟨 (max + qty-per-buyer ⬛) |
| Buyer: image/details/prices/savings/target/current/progress/timer/join/qty/participants/feed/comments/share/rules/my-status/payment-status | 🟩 (participants-list 🟨; feed ⬛; payment-status 🟨) |
| Engine: join/eligibility/register/qty/dup/count/progress/timer/target/max/success/failure/payment/stock/orders/notifs/refund/report | 🟨 (max-capacity/failure-sweep/stock-reservation ⬛) |
| Session kind `group_buy` + badge + grouping | ⬛ |

## 5. NOTIFICATIONS (shared) — 11/16 zipo
IPO: live_started/reminder/removed · auction bid/outbid/won/ended/payment_expired/second_chance/winner_changed · group_buy_success · price_drop(+offer/expired/ended/campaign_end).
MPYA: joined-your-live · new-comment · seller-replied · mentioned · offer-ending-soon · group-progress · group-failed · live-ended · payment-reminder. Prefs: storage+code 🟨, UI thibitisha. Kanuni: throttle + digest kwa wingi.

## 6. ADMIN (UI ngazi ya msimamizi) — backend 🟩, UI ⬛
 vipengele vyote 12 vya §F vinahitaji UI mpya juu ya: `live_reports`, `adminLiveRemove`, `liveModerate`, suspend, `admin_audit_log`. Hakuna UI ya live kwenye 98-admin-control-center.

## 7. ANALYTICS (records, sio mock) — 🟨
IPO: participants(total rows), peak, comments, likes, duration, winning price, joined/target, board/offers.
MPYA: reactions, product-views/live, followers-delta, join-conversion, **orders/units/revenue attribution** (inahitaji `liveSessionId` kwenye oda — additive, approval ya schema).

## 8. INFRA / DATA-FLOW
```
[Buyer/Seller App] --callables--> [Cloud Functions: live* | auction | pricedrop | groupbuy | sweep15min]
        | reads (listeners: session+comments60+product+bids15/board)          | (server authority)
        v                                                                       v
[Firestore: live_sessions{viewers,comments,likes,reminders} products/{pid}/bids
 auction_participation price_drop_entries/board productWatches notifications
 live_reports admin_audit_log sellerFollowers notificationPreferences]
Rules: client read-only (live/bids/boards); writes = callables ONLY.
Indexes: live_sessions(status,updatedAt) DEFINED+NOT DEPLOYED 🟥 | mingine auto.
```
**Gharama:** kawaida <$0.02/live; kubwa ~$6/live; video IMEKATAZWA (bila IVS/Mux).

## 9. MPANGILIO WA UJENZI (baada ya idhini — Hatua 5)
1. Foundation: presence cleanup + server-time + event feed + save-event + connection states.
2. Comments: replies + reactions + pagination + resume + pin + edit/delete + badges.
3. Group-buy kind + discovery (featured/recommended/filter/search/status).
4. Seller studio: preview + dashboard + pause-policy + setup forms + summary.
5. Engines gaps: group max/failure-sweep/stock; auction reserve?/eligibility? (mmiliki); drop history/soldout UI.
6. Notifications mpya + prefs UI + throttle.
7. Admin UI + analytics attribution + reports.
8. Tests (Hatua 6): common/auction/drop/group + multi-user + low-bandwidth + ushahidi.
