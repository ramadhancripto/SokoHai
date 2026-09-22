# CHAT ROOT CAUSE REPORT

**Mradi:** SokoHai  
**Repository:** `https://github.com/ramadhancripto/SokoHai`  
**HEAD iliyokaguliwa:** `115664605be9e517974857d6f9fd342476074571`  
**Tarehe:** 22 Septemba 2026  
**Hali:** FORENSIC TRACE IMEKAMILIKA — hakuna source code iliyobadilishwa kabla ya ripoti hii.

## Executive finding

Chat ya moja-kwa-moja ina msingi mmoja wenye uwezo mkubwa (`js/app/34-chat-core.js`), lakini siyo authority moja wakati wa runtime. Entry point yake inafunikwa na wrappers nyingi zenye auth-wait, instant-open, modal control, timeout, cache na retry. Zaidi ya hapo, core yenyewe inameza kosa la ku-create/read conversation na kuendelea kama conversation ipo. Hii inaeleza mzunguko mkuu wa dalili:

```text
open → ensureConversation inapata permission/network/write failure
     → failure inamezwa na kurudishwa kama conv object bandia
     → listener inaanzwa kwenye parent conversation ambayo huenda haipo
     → rules za message create zinategemea parent conversation
     → message write inakataliwa / history listener inakosea
     → timers/wrappers tofauti zinabadilisha loader kuwa empty/error/retry
```

Kwa hiyo tatizo si “timeout ndogo”; ni **error suppression + runtime wrapper chain + state ownership iliyogawanyika**.

---

## A. Authoritative Chat entry point

### Source authority
`js/app/34-chat-core.js:1944` ndiyo implementation halisi ya direct chat:

- inathibitisha auth/UID;
- inaunda deterministic conversation ID;
- inaweka `skh.currentChatUid` na `skh.chatCore`;
- inaresolve profile;
- inaita `ensureConversation`;
- inaita `attachConversation`;
- inaanzisha message na conversation listeners;
- inawasha commerce/negotiation context.

### Runtime authority
Runtime haina entry point moja safi. `window.skhChatOpen` ya 34 inafunikwa na 78, 81, 90 na 92. `93` sasa ina-authority ya inbox pekee, lakini row yake hupitia `openChatWithUser`, ambayo nayo imefunikwa na 92.

**Hitimisho:** 34 inapaswa kubaki authority ya lifecycle. UI/modal helper inaweza kuitwa na 34 kupitia API moja, si ku-wrap public function mara nyingi.

---

## B. Current script order

Order halisi katika `html/21-scripts.html`:

1. `37-negotiation.js` — line 38
2. `38-negotiation-form.js` — line 40 (`38-nego-form-logic.js` ina-importiwa ndani yake)
3. `34-chat-core.js` — line 41
4. `39-product-showcase.js` — line 45 (`39-showcase-logic.js` ina-importiwa ndani yake)
5. `40-token-box.js` — line 47
6. `41-request-inbox.js` — line 49
7. `68-chat-discover.js` — line 62
8. `69-chat-groups.js` — line 63
9. `73-group-soga.js` — line 66
10. `52-transport-inbox.js` — line 73
11. `78-chat-fix-blink.js` — line 77
12. `79-one-ui-at-a-time.js` — line 78
13. `81-absolute-one-ui-live.js` — line 79
14. `58-request-visibility.js` — line 81
15. `90-chat-fixes.js` (`defer`) — line 878
16. `92-chat-auth-fix.js` (`defer`) — line 882
17. `93-chat-inbox-repair.js` (`defer`) — line 883

`38-nego-form-logic.js` na `39-showcase-logic.js` si scripts zilizokosekana; zinaingizwa kwa ES module imports.

---

## C. Function overwrite chain

### `window.skhChatOpen`

```text
34: authoritative direct-chat implementation
 ↓
78: instant modal + skeleton + double-click guard wrapper
 ↓
79: fallback one-UI wrapper (hu-defer kwa 81 ikiwa 81 iko live)
 ↓
81: absolute one-UI wrapper + skeleton + second open guard
 ↓
90: loading/cache/8-second timeout wrapper
 ↓
92: auth-wait wrapper
```

Kwa sababu 81 na 90 hu-boot kwa timers baada ya DOM/module load, exact wrapper ya nje inaweza kutegemea timing. Chain flags hupunguza re-wrap, lakini architecture bado inategemea timing.

### `window.openChatWithUser`

```text
07-product.js defines it twice
 ↓
34 replaces it
 ↓
92 replaces/wraps behavior and calls skhChatOpen directly
```

### `window.sendMessage`

```text
07-product.js legacy
 ↓
34 stores legacy as _skhLegacySendMessage, then replaces sendMessage
```

Fallback ya legacy bado inaweza kuitwa kwa `no_partner`, hivyo kuna njia mbili za send katika hali ambayo state imeharibika.

### `window.skhChatOpenInbox`

```text
34 base inbox
 ↓ 78/79/81/90/92 wrappers depending boot flags/order
 ↓
93 replaces final inbox authority
```

93 imerekebishwa tayari kutoshika direct chat, lakini wrappers zilizotangulia bado zipo ndani ya references zilizohifadhiwa.

---

## D. Partner resolution flow

Partner UID inaweza kutoka:

- `sellerId`, `userId`, `sellerUid`, `ownerUid`, `ownerId`, `providerId`, `driverId` katika product/service/transport;
- discover/profile/inbox `uid`;
- `skh.currentChatUid` kama fallback;
- `core.partnerUid` wakati wa send.

Contract ya core ni `currentUserUid + partnerUid + conversationId`, lakini sasa `sendInternal` ina recovery chain:

```text
opts.partnerUid || core.partnerUid || skh.currentChatUid
opts.conversationId || core.convId || convIdFor(partnerUid)
```

Hii inaficha state corruption badala ya kuikataa mapema. `participantMeta()` pia humeza profile-read errors na kurudisha generic member; kwa hiyo “profile haipatikani” na “permission/network failure” hazitofautishwi.

**Root risk:** globals za partner/context ni nyingi, na 92 `openChatWithUser` haipokei/preserve `opts`, hivyo njia inayopita humo inaweza kupoteza commerce context.

---

## E. Conversation ID flow

Direct ID ni deterministic:

```js
'conv_' + [myUid(), partnerUid].sort().join('_')
```

Hii ni sahihi kwa jozi moja. `ctx` haijumuishwi licha ya parameter kuwepo, hivyo commerce zote za jozi moja zinakusanywa katika conversation moja kwa makusudi.

Issues zilizothibitishwa:

1. `convIdFor()` haikatai `myUid() == null`; inaweza kutengeneza ID yenye `null` endapo guard ya auth/state itateleza.
2. `ensureConversation()` ni read-then-write bila transaction/merge; A na B wakianzisha mara moja wanaweza wote kuona “haipo” na `setDoc` ya mwisho ku-overwrite metadata/unread ya kwanza.
3. `opts.convId` ya inbox haifuatwi na 34 direct-open; canonical pair ID ndiyo hutumika. Merge/migration ya legacy inaendeshwa background, hivyo data inaweza kuchelewa kuonekana.
4. `ensureConversation` humeza exception na kurudisha `{id, ref, data:null}` kana kwamba flow inaweza kuendelea.

Issue #4 ndiyo root cause kubwa zaidi ya open/send failure.

---

## F. Message write flow

Njia halisi:

```text
composer → window.sendMessage (34)
→ sendInternal
→ optimistic temp bubble
→ block reads/cache
→ conversations/{convId}/messages addDoc/setDoc
→ conversation getDoc + updateDoc(lastMessage/unread/related)
→ legacy chats dual-write (non-system only)
→ notification
→ listener echo/render
```

Root causes/risk:

1. Parent conversation inaweza kuwa haikuundwa kwa sababu `ensureConversation` ilimeza failure; message rule hutumia `get(conversation).participants`, hivyo create hushindwa.
2. Error ya write inafinyangwa kuwa `write_failed`; error code kama `permission-denied`, `unavailable`, `unauthenticated` haipitishwi kwenye structured diagnostic.
3. Conversation metadata update ni read-modify-write, si transaction/atomic increment; simultaneous messages zinaweza kupoteza unread increment.
4. Main message write inaweza kufanikiwa huku conversation metadata update ikishindwa kimya; inbox/history status basi huwa stale.
5. Legacy dual-write bado ipo. Hii ni compatibility path, lakini inaongeza schema mbili na inaweza kuleta duplicate wakati migration ikikimbia bila idempotent legacy key kamili.
6. `sendMessage` inaweza kurudi legacy sender kwa `no_partner`; hii inaruhusu state mbili tofauti badala ya fail-fast.

---

## G. Message listener flow

Kwa direct chat kuna listeners mbili zenye madhumuni tofauti:

1. **ONE messages listener**: `conversations/{convId}/messages`, orderBy `createdAt`, limit.
2. **ONE conversation listener**: parent doc kwa typing/read/delivered/unread.

`listen()` hu-unsubscribe zote kabla ya kuattach nyingine — msingi huu ni sahihi.

Issues:

- callback haihakiki kwamba `convId` bado ndiyo `skh.chatCore.convId`; callback ya snapshot iliyokuwa queued kabla unsubscribe inaweza kuandika messages za partner wa zamani kwenye core mpya.
- listener error callback inaonyesha generic UI pekee, haiclear watchdog state wala kuhifadhi category/code.
- timers tatu zinaweza kushindana: 34 open watchdog (8s), 34 history watchdog (12s), 90 wrapper watchdog (8s), pamoja na check ya 90 baada ya 2.5s.
- 90 inaweza kutafsiri loader kuwa EMPTY kwa sababu `skhChatOpen` ya 34 hurudi baada ya listener kuattach, si baada ya first snapshot. Hivyo slow first snapshot inaweza kuonyeshwa kama mazungumzo tupu.
- local cache ya 90 inaweza kuonyesha stale history kama authoritative bila lifecycle state iliyotenganishwa vizuri.

---

## H. Commerce context flow

Writers/readers zipo kwa Product, Service na Transport:

```text
activeChatProduct/Service/Transport
→ sendInternal structured ref + snapshot
→ conversation.related patch
→ message listener
→ product/service/transport renderer
→ commerce anchor/action buttons
```

Positive findings:

- structured refs/snapshots zipo;
- receiver anaweza ku-render card bila dashboard;
- context leak guards na owner checks zipo;
- globals zinafutwa baada ya first send.

Root risks:

1. Context bado inategemea globals (`activeChat*`) hadi first send; wrapper/path inayotumia `openChatWithUser` inaweza ku-clear au kutopreserve context.
2. `startChat` hutambua aina kwa `collectionName/collection`; data isiyo-normalized inaweza kuangukia product default.
3. Context ya conversation moja kwa pair ni “latest related”; bidhaa/huduma nyingi kwa pair zinategemea message snapshots kwa history, si parent `related` pekee.
4. metadata update ikishindwa baada ya message write, card ya message ipo lakini persistent anchor inaweza kukosekana.

---

## I. Negotiation flow

Flow iliyopo ni:

```text
commerce context/card
→ skhNegoFormOpen
→ proposal
→ negotiationSendOffer Cloud Function
→ Firestore-native fallback
→ negotiations doc + offers + event
→ system negotiation message in conversation
→ skhNegoListen
→ render negotiation card/anchor
→ negotiationAction / native transaction
→ accept/reject/counter/order
```

Positive findings:

- negotiation haitegemei dashboard;
- state engine iko `37-negotiation.js`;
- form logic iko imported `38-nego-form-logic.js`;
- refresh persistence inatokana na `negotiations` na message snapshot;
- product/service/transport payloads zipo;
- transport negotiation lock (`negotiationAllowed === false`) inaheshimiwa.

Issues:

1. Negotiation authority imewekwa ndani ya `34-chat-core.js` pamoja na chat, badala ya 37 pekee; integration ni kubwa na lifecycle yake inategemea chat state.
2. primary listener inaweza kuwasha hadi fallback listeners **3** (conversation IDs + buyer/seller directions). Hizi si message listeners, lakini zina duplicate negotiation snapshots/reads.
3. fallback buyer/seller queries hazifungi commerce entity; “latest negotiation ya pair” inaweza ku-adopt negotiation ya bidhaa nyingine kwenye chat ileile ikiwa timestamps zinaongoza.
4. listener callbacks hazihakiki active conversation/partner kabla `adoptNego`, hivyo queued snapshot inaweza kuchafua chat mpya.
5. errors nyingi kwenye fallback/listener zimefichwa (`function(){}` / empty catches), hivyo missing index, permission na network ni indistinguishable.
6. client-native fallback ina writes kadhaa zisizo atomic (`negotiation`, `offer`, `event`, notification/chat system message); failure katikati inaweza kuacha partial state.

---

## J. CSS overflow causes

Chat CSS imetawanyika katika `01-core`, `12-mobile-responsive`, `14`, `15`, `17`, `24`, `25`, `26`, `27` na inline styles.

Exact hazards:

1. `.ch-card` na `.ch-offer-msg` zina `min-width:220px` (`css/15-chat-comments.css`), wakati bubble ni `max-width:88%`; kwenye 320px, nested padding/actions zinaweza kulazimisha overflow.
2. `.ch-loc-card` ina `min-width:200px` pamoja na nested content/buttons.
3. negotiation term value ina `white-space:nowrap`; amount/quantity ndefu inaweza kusukuma row.
4. head-menu rows na labels zina `white-space:nowrap`; menu ina `width:max-content` + `max-width:90vw`, lakini children zinaweza bado kukataa shrink.
5. rule za chat bubble zimerudiwa katika `01`, `15`, `24`, `25`; cascade ya mwisho inabadilisha max-width/background/wrapping.
6. `body { overflow-x:hidden }` kwenye mobile inaficha dalili badala ya kuzuia child overflow.
7. horizontal scrollers (`context`, `commerce`, tabs) ni intentional, lakini acceptance inahitaji kutofautisha internal strip scroll na page-level overflow.
8. negotiation form footer button ina `min-width:96px`, state buttons `min-width:140px`; hakuna dedicated 320px wrap rule ya actions zote.
9. `overflow-wrap: break-word` ipo, lakini long unbroken token inahitaji `overflow-wrap:anywhere` kwa message/card/title/ID/URL surfaces maalum.

---

## K. Duplicate/legacy systems

- `conversations/{id}/messages` ndiyo canonical mpya.
- `chats` ndiyo legacy dual-write/read-migration path.
- `07-product.js` bado ina legacy `sendMessage` na duplicate `openChatWithUser` definitions.
- 78/79/81 ni UI/navigation repair layers zinazofunika public functions.
- 90 ni loading/cache/timer repair layer inayofunika chat/open/render/inbox.
- 92 ni auth repair layer inayobadilisha `requireAuth`, login na chat functions.
- 93 ni inbox replacement; direct chat ime-delegate kwa 34.

Logic muhimu kutoka repair layers inapaswa kuhamishwa kwa surgical merge:

- instant modal/no blink → lifecycle ya 34/UI manager moja;
- auth-ready wait → bootstrap/auth authority moja;
- timeout/state/error/cache → chat lifecycle state moja;
- inbox rendering → 93 inaweza kubaki inbox authority ikiwa contract yake itafungwa wazi.

---

## L. Exact root causes — priority order

### P0 — functional

1. **`ensureConversation` swallows all failures and returns a fake-success object.** Hii husababisha listener na send kuendelea dhidi ya conversation ambayo huenda haipo.
2. **Runtime entry point imefungwa kwa wrappers nyingi zenye boot timers.** State/loading/auth/modal behavior hutegemea execution timing.
3. **Loading ownership ni nyingi:** 34 open timeout + 34 listener timeout + 90 timeout + 90 delayed inspection + MutationObserver.
4. **Auth ownership ni mbili:** bootstrap/app auth state na 92 listener/requireAuth override/polling.
5. **No stale-callback guard** kwa message, conversation na negotiation snapshots wakati wa partner switch.
6. **Send metadata update si atomic na errors zimefichwa**, hivyo message inaweza kuwepo lakini inbox/related/unread ikawa stale.

### P1 — commerce/negotiation

7. **Context hupitia globals na paths ambazo hazipreserve opts consistently.** Hii ndiyo sababu card/negotiation inaweza kutoweka kulingana na entry path.
8. **Negotiation fallback by participant pair si entity-scoped**, hivyo latest negotiation ya pair inaweza kuonekana katika context isiyo sahihi.
9. **Negotiation fallback has multiple realtime queries and silent errors**, hivyo behavior si predictable wala observable.
10. **Native negotiation creation is multi-write, non-atomic**, hivyo partial persistent state inawezekana.

### P1 — security

11. **Firestore message create rule haithibitishi sender ni participant.** Inathibitisha `senderId == auth.uid`, lakini si kwamba auth UID iko kwenye parent participants. Signed-in attacker anayejua conversation ID anaweza kujaribu kuandika message humo. Hii lazima ifungwe bila kuweka rules public.
12. Legacy `/chats` bado ni `allow read, write: if signedIn()`, hivyo canonical privacy ya participants haipo kwenye legacy collection.

### P2 — mobile/performance

13. **CSS authorities nyingi + fixed min-width/nowrap** zinasababisha overflow ya nested cards/actions kwa 320px.
14. **Infinite composer guard interval (90, 800ms)** ni repair polling ya DOM badala ya lifecycle state.
15. **Profile/block/conversation reads na legacy migration** zinaongeza startup/send latency; baadhi ni sequential au repeated.

---

## Repair direction iliyoidhinishwa na forensic evidence

1. Fanya 34 iwe lifecycle authority: typed state + typed error + one timeout + stale-open token.
2. `ensureConversation` iwe fail-closed, race-safe, na isirudishe success bandia.
3. One public `skhChatOpen`; repair files zisiwe wrappers za direct chat. Zibaki kwa roles zisizoduplicati au ziwe no-op compatibility delegates.
4. Auth-ready iwe bootstrap contract moja; chat iisubiri kupitia promise/event moja, si listener+poll+wrappers.
5. Preserve commerce `opts` end-to-end; context iwe normalized kwa product/service/transport.
6. Scope negotiation fallback kwa active conversation + entity; guard stale callbacks; expose error categories.
7. Harden Firestore rules kwa participant membership; usifungue rules.
8. Consolidate responsive rules kwenye chat CSS authority, test widths 320/360/375/390/412.
9. Ongeza integration tests za real lifecycle mock: create failure, permission-denied, partner switch, stale callbacks, first-snapshot delay, send metadata failure, commerce persistence, negotiation refresh.

## Test truth at report time

- Repo ime-clone kikamilifu.
- Static forensic tracing imefanywa kwenye files zote za kuanzia, script order, rules, indexes, CSS inventory na existing tests.
- Existing test suite files zipo, lakini **hakuna claim ya live Firebase/two-browser success** katika report hii.
- Source code haijabadilishwa kabla ya report.
