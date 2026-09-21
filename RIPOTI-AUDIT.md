# RIPOTI YA UKAGUZI + MATENGENEZO — SokoHai (21 Sept 2026)

**Mbinu:** Kagua kwanza → Tafuta chanzo (root cause) → Rekebisha chanzo tu → Jaribu mara moja → Thibitisha hakuna regression.
**Visivyofanywa (kwa makusudi):** Hakuna Chat V2 / Negotiation V2, hakuna ujenzi upya kiholela, hakuna schema change ya Firestore, hakuna feature iliyofutwa, hakuna lazy-load ya kiholela.

---

## 1. Muhtasari wa Commits (8)

| Hash | Jina | Faili |
|---|---|---|
| `a1fc355` | i18n-fix | `js/app/24-ui-final.js` |
| `eced7b1` | navigation-stabilization | 79, 81, 90, 92, 91, 93, `tools/verify_nav_chain.mjs` |
| `9ceec35` | chat-send-fix | `js/app/34-chat-core.js`, `css/15-chat-comments.css` |
| `92287cd` | negotiation-fix | 34, 39, 38 |
| `d1957f2` | performance-startup-fix | 00, 24, 28, 56, 90 |
| `28d219b` | mobile-polish | `css/12-mobile-responsive.css` |
| `f8ee084` | html-sync | `html/` (vipande 20) — `index.html` haikuguswa |
| `25bb323` | chat-menu-icon-fix | `index.html`, 34, `html/06-modals-social.html` |

---

## 2. Root Causes + Marekebisho

### 2.1 Urambazaji (navigation conflicts) — `eced7b1`
- **Chanzo:** Tabaka 7 za wrappers (`06/79/81/78/90/92/93`) ziligongana; `93-chat-inbox-repair.js` ilikuwa na **timers 5** zinazo-re-assert na **kubomoa (clobber) wrappers za 91** kila sekunde 5 — ndiyo iliyofanya chat kufunguka/fungwa ovyo.
- **Fix:** Chain-preserving flags (`__skhCopyChainFlags`) kwenye 79/81/90/92/91; 79 hudefer kwa 81; **timers 5 za 93 zimeondolewa (5 → 0)**.
- **Verify:** `tools/verify_nav_chain.mjs` — **10/10 pass**.

### 2.2 Kutuma ujumbe (chat send/render delays) — `9ceec35`
- **Chanzo:** `sendInternal` (34) haikuwa na optimistic UI — bubble ilionekana tu baada ya round-trip ya Firestore; kila send ilisoma `chatBlocks` **mara 2**; write ikishindwa — kimya (hakuna dalili).
- **Fix:** Optimistic bubble (`tempId/clientTempId/_pendingSends` + reconcile bila flicker/dup), block-check **baada ya render + cache 60s**, write fail → bubble jekundu + **"Jaribu Tena"** + toast, `writeLegacy` best-effort, `skhChatRetrySend`.

### 2.3 Toa Ofa haifunguki chat (inaonekana baada ya Home) — `92287cd`
- **Chanzo:** `skhChatNegotiate` (39) ilipoll **bila kipimo (6s)** bila kujua kama chat imefunguka; fomu ilijifungua hata chat ikiwa imefungwa → inaonekana "baada ya Home"; double-tap = fomu mbili.
- **Fix:** `startChat` (34) **inarudisha promise**; negotiate **huawait kufunguka halisi (timeout 10s)**, huabort kama `chatModal` imefungwa, in-flight key `kind:id:seller` ya 12s; `close()` (38) huhifadhi scroll-lock ya chat.
- **Muhimu:** Opener halisi ni **38:730**, sio 37 (37 ni engine tu) — dhana potofu iliyokanushwa wakati wa uchunguzi.

### 2.4 Startup nzito / simu ndogo — `d1957f2`
- **Chanzo:** Home ilirender **kadi zote (~160)** mara moja; engagement ili-query **~900 docs kila tab** bila cache; personalized queries 3–4 kila Home; timer ya 1s **milele** (FriendlyCard); FAB scan ya `getComputedStyle` (~50–100 nodes) kila **800ms milele**; observers mbili (56-body, 90-msgs) ziliscan **kila mutation** (kuandika herufi 1 = scans ~5–10).
- **Fix:** Feed pagination **20 + "Onyesha zaidi"** (+ infinite scroll), tab cache **limit-aware**, early cache return (hakuna skeleton flash); engagement + personalized **cache 5-min**; FriendlyCard timer **capped 60**; FAB **800ms → 2s + ruka tab iliyofichwa**; observers zote **batched kwa frame moja**; composer guard **fast-path** chat ikiwa imefungwa.

### 2.5 i18n — `a1fc355`
- **Chanzo:** Vifunguo 7 vya chat vilikosekana kwenye LMS dict (sw+en) → fallback ya Kiingereza; `register()` iliandika localStorage **kila key** (O(n²)).
- **Fix:** Keys 7 zimeongezwa; register writes **batched**.
- **CSS `backdrop-filter`:** ilidaiwa kuvunjika — **uchunguzi umeonyesha `-webkit-` prefix ipo kila faili**; hakuna fix iliyohitajika.

### 2.6 Simu ndogo (mobile) — `28d219b`
- **Chanzo halisi kilichopatikana:** `chatInput` inline `font-size:15px` (na inputs nyingine 12–14px) → **iOS Safari auto-zoom** inayovunja layout; hakuna `touch-action` popote → **tap delay 300ms** + double-tap-zoom.
- **Fix (CSS moja, salama):** inputs zote za kuandika **16px**, `touch-action: manipulation` kwenye vitufe/viungo/inputs.

### 2.7 Commerce cards ("kupotea") — **Hakuna defect**
- **Uchunguzi:** 3-tier fallback ni thabiti (`activeChatProduct` → `conversation.related` → ujumbe wa mwisho wa bidhaa); writers/readers za `related` + `related.commerce` zinapatana; re-render triggers zipo (`adoptNego`, `ingestLatestNegoFromMsgs`, order sub); CTX-LEAK guards + on-read scrub ni sahihi.
- **Hitimisho:** Dalili zilielezewa na bugs zilizorekebishwa (send flicker, form-conflicts, wrapper clobber iliyoficha UI). **Hakuna commit ya kubuniwa** — kwa mujibu wa kanuni "rekebisha chanzo tu".

### 2.8 html-sync + icon iliyofichika — `f8ee084`, `25bb323`
- `build_html.py check` ilikuwa **FAIL (drift 13KB)** — vipande vimezalishwa upya kutoka `index.html` hai (`split`, sio `build` — build ingefuta mabadiliko hai). Sasa **BYTE-EXACT ✓**.
- Sync ilifichua bug halisi: kipengele **"Futa kwangu"** kwenye menyu ya chat kilikosa icon (span haina id, `wireHeadMenu` haikuihydrate) — test ilianguka 27/1, fix → **28/28**.

---

## 3. Performance: KABLA → BAADA (zimethibitishwa kwenye code)

| Kipimo | Kabla (5de2c63) | Baada (HEAD) |
|---|---|---|
| Kadi za Home/zilizorenderwa | zote (~160) | **20 + Onyesha zaidi** |
| Engagement query/tab | ~900 docs, kila tab | **cache 5-min** |
| Personalized queries/Home | 3–4, kila ziara | **cache 5-min** |
| Block-check reads/send | 2 | **0 (cache 60s)** |
| Timers za 93 (clobber) | 5 milele | **0** |
| FriendlyCard timer | 1s milele | **capped 60** |
| FAB overlay scan | 800ms milele | **2s + skip hidden tab** |
| 56 body observer | scan kila mutation | **1 scan/frame** |
| 90 msgs observer | ~5–10 scans/herufi | **1 tick/frame** |
| Composer guard | getComputedStyle kila 800ms | **fast-path skip (chat closed)** |
| LMS localStorage writes | kila key | **batched** |
| iOS zoom / tap delay | inavunja layout / 300ms | **16px / manipulation** |

---

## 4. Majaribio (regression kamili — yote GREEN, exit 0)

`npm test` (vikosi 16) + `node --check` kila faili iliyoguswa + `verify_nav_chain.mjs` 10/10 + `build_html.py check` BYTE-EXACT:

- nego_form: **78/78** · showcase: **34/34** · chat_header_sides: **28/28** (baada ya fix) · commerce_flow: **30/30** · routing: **69/69** · token_inbox: **24/24** · logistics: **30/30** · card_discovery: **80/80** · delivery_choice: **58/58** · chat_commerce_cards: **ALL PASS** · negotiation_engine/dom, delivery_nego, route_matcher, commerce_cards, functions_resilience: **pass (chain exit 0)**

Upeo uliofunikwa: marketplace, chat, cards, negotiation (ofa/counter/kubali/kataa), transport token/custody, groups, notifications, orders, SokoPay, auth paths, mobile CSS.

---

## 5. Masuala Yaliyobaki / Mapendekezo

1. **Jaribio la kifaa halisi bado:** suites ni jsdom + static — pendekeza ukaguzi wa mikono kwenye Android ya chini (360px) na iPhone Safari kabla ya deploy.
2. **Scripts 95 bado zote hupakia startup** — lazy-load haikutumika kwa makusudi (dependency chain ni hatari); faida zimetoka kwenye queries/timers/DOM.
3. **Hakuna deploy iliyofanywa** — kama ulivyoagiza, hadi regression ipite. Regression sasa **IMEPITA**; deploy inasubiri idhini yako.
4. `node_modules` (+39 pkgs) imewekwa kwa ajili ya tests (env tu, sio commit).

---

## 6. Faili/Kazi Zilizoguswa (orodha kamili)

- `js/app/34-chat-core.js` — sendInternal (optimistic), blockCache, retry, writeLegacy guard, renderCommerceAnchor ctx, startChat promise, wireHeadMenu icon
- `js/app/39-product-showcase.js` — skhChatNegotiate (await open, nav-guard, inflight)
- `js/app/38-negotiation-form.js` — close() overflow guard
- `js/app/79/81/90/92/91/93` — chain flags, defer, timer removal
- `js/app/00-bootstrap.js` — feed pagination, cache key, early return
- `js/app/28-buyer-engagement.js` — 5-min caches
- `js/app/24-ui-final.js` — i18n keys, LMS batch, timer caps, FAB throttle
- `js/app/56-nav-back.js` — observer batching
- `js/app/90-chat-fixes.js` — observer batching, composer fast-path
- `css/15-chat-comments.css` — pending/failed/retry styles
- `css/12-mobile-responsive.css` — 16px inputs, touch-action
- `index.html` — DeleteMe icon id (mstari 1)
- `html/` — resplit (22 vipande), `tools/verify_nav_chain.mjs` — mpya
