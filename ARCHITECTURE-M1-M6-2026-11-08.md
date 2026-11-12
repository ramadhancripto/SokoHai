# SOKOHAI — ARCHITECTURE M1–M6: Sales Flow, Live Studio & Upcoming Activities
**Tarehe:** 2026-11-08 · **Branch:** `feature/product-card-visual-refinement` · **HEAD:** `2e8d049`
**Aina:** Audit + architecture + UI preview. **Hakuna mstari wa code ya app uliobadilishwa. Hakuna commit, merge, deploy wala migration.**
**Preview ya kuona:** `preview/proposals/sales-flow-m1-m6.html` (interactive; simu + desktop; inafunguka kwenye browser moja kwa moja).

---

## 0. MUHTASARI WA HARAKA

| Swali la mmiliki | Jibu |
|---|---|
| Files zilizotajwa zipo? | **Ndio zote 5** (`html/15-main-menu.html`, `shared/product-listing-core.mjs`, `html/13-form-edit.html`, `js/app/12-sys-modes.js`, `js/app/120-live-commerce-ui.js`). Files 4 mpya hazipo — hakuna mgongano: `css/71-*`, `css/72-*`, `js/app/113-*`, `js/app/127-*` |
| Kuna module nyingine inayofanya kazi hiyo? | **Hakuna** chooser ya aina za mauzo (`prodSaleMode` ni `<select>` ndani ya `#sellerForm` pekee; product builder haina hatua ya saleMode) |
| M4 Live Studio — kuna kitu kipo? | **Sehemu:** chumba cha live kipo (`120:262+`), host actions zipo (`skhLiveHost('start'|'end')`, `120:609-611`), lakini **hakuna Live Studio dashboard** — na **hakuna panel ya biashara** inayotofautisha Mnada/Group Buy/Price Drop ndani ya chumba |
| M6 — kuna notifications? | **Ndio, nyingi:** `notifications` collection (rules:645), badge subscription (`00-bootstrap:1827`), prefs (`notificationPreferences/{uid}`, rules:1762), `skhGetNotifPrefs/skhSetNotifPref/skhAllowedNotif` (`28:457-480`), na server `notify()` katika `commerce-modes.js:40` + `live-commerce.js:270+` |
| M6 — kuna scheduled jobs? | **Ndio:** `commerceModesSweep` kila **dakika 15** (`commerce-modes.js:316`), `inventoryReservationSweep` dakika 5, `adsDeliverySweep` saa 1, `sokopayAutoRelease`, `platformStatsHourly` |
| M6 — kuna reminders? | **Ndio (kwa live pekee):** `live_sessions/{id}/reminders/{uid}` + callable `liveRemind` (`live-commerce.js:287`) + `liveStart` inawajulisha (`:118-124`) |
| M6 — kuna upcoming activities? | **Sehemu:** Live Hub ina tab **“YANAYOKUJA”** inayoorodhesha `live_sessions` `status='scheduled'` (`120:106,138-152`), ikiwa na kitufe cha Ukumbusho na “Fungua” |
| **Kikwazo kikubwa** | Hakuna **OS push (FCM)** kabisa (`messaging()` haipo kwenye repo) → arifa zote ni **ndani ya app** tu. Hii ni uamuzi wa mmiliki, sio bug |

**Hitimisho:** M1–M6 zote zinaweza kujengwa **juu ya msingi uliopo** — hakuna injini mpya ya mauzo, ya live wala ya arifa. M6 ni upanuzi wa mfumo uliopo, sio mfumo mpya.

---

## 1. ARCHITECTURE YA M1–M6 (kile kinachojengwa, wapi, na kwa nini)

### Kanuni tano zinazotawala utekelezaji
1. **Eneo moja = module moja.** Hakuna module inayogusa eneo la mwingine.
2. **Reuse kabla ya kuandika.** Kila mahali panapoweza kutumia function iliyopo, tunaitumia.
3. **Server ndio mwamuzi** kwa bids, group joins, bei na arifa — frontend haiamui.
4. **Hakuna doc mpya yenye data ile ile iliyopo.** `activities` ni *nyongeza* kwa ajili ya kile kisichopo (shughuli isiyo live iliyopangwa), sio nakala ya `live_sessions` wala ya `products`.
5. **Kila kitu kinarudi nyuma kwa usalama.** Module ikizimwa, app inaendelea kama leo.

### M1 — Sales Type Chooser
- **Eneo:** kabla ya `#sellerForm`. Badiliko moja kwenye `html/15-main-menu.html:9` → `skhOpenSaleTypeChooser()` badala ya `showForm('sellerForm')`.
- **Nini kinatokea:** chooser (aina 4) → `window.skhSaleFlow.setType(mode)` → `showForm('sellerForm')` ile ile + `prodSaleMode` imewekwa + `toggleModeFields()` inaitwa.
- **Hakitaguswa:** `#plusMenu`, `#mainMenu` items 3 zilizobaki, `showForm()` yenyewe.

### M2 — Existing / New product (+ Copy Template)
- **Eneo:** hatua ya pili ndani ya chooser sheet (module ile ile ya M1), ikitumia `skhLiveCreateForm`-style sheet.
- **Reuse:**
  - “Tumia iliyopo” → inajaza `#sellerForm` kupitia `setField()` (`05-forms.js:365`) — hakuna fomu mpya.
  - “Nakala” → `saleCopyTemplate()` **mpya kwenye `shared/product-listing-core.mjs`**, inayotumia lugha ile ile ya `duplicateTemplate()` (COPY_FIELDS/`strip()`), **lakini** inaongeza picha + maelezo + specs na kuweka `stock: 0`. `duplicateTemplate()` **haibadilishwi** (ina watumiaji wengine — `skhDuplicateProduct`, `05-forms.js:512`).
- **Ulinzi:** bidhaa asili haipatikani kwa `update` kwenye njia hii — nakala ni `saveData('products', …)` mpya.

### M3 — Mode-specific fields
- **Eneo:** panel zilizopo (`#mode_auction_fields`, `#mode_groupbuy_fields`, `#mode_price_drop_fields`, `html/09-admin-sell.html:222-279`) + Hariri (`html/13-form-edit.html:20-49`) + validators (`08-app-state.js:459-527`, `12-sys-modes.js:474-500`).
- **Nyongeza (ndogo, zinazolindwa):**
  | Aina | Kinachokosekana leo | Nyongeza |
  |---|---|---|
  | Mnada | `endTime` haikaguliwi kuwa **mbeleni** (ni uwepo tu, `08:459-462`) | `endTime > now` + `startTime < endTime` (ipo tayari) + `minIncrement ≥ 0` |
  | Group Buy | **hakuna `startTime`**, hakuna **kiwango cha chini cha washiriki**, hakuna bei ya kikundi tofauti (punguzo pekee) | `startTime` (hiari), `minPeople` (hiari), `unitPrice`/`discount` wazi kama ilivyo sasa |
  | Price Drop | `startTime` + `endTime` zipo; hakuna **“bei ya awali”** iliyohifadhiwa kwa uthibitisho | `originalPrice` (snapshot ya `price` wakati wa kuunda) kwa onyesho la uaminifu |
  | SokoHuru | — | **Hakuna** kulazimishwa Live/ratiba (brief §5.D) |
- **Hariri:** ongeza `editAucStartTime`, `editAucMinIncrement`, `editGbStartTime`, `editAucEndTime` iwe **lazima** ikiwa Mnada; hakuna `reset()`.

### M4 — Live Studio
- **Ukweli wa kiufundi (uliothibitishwa):**
  - `live_sessions.kind` = `live | live_commerce | auction | price_drop` — **hakuna `group_buy`** (`live-commerce.js:27`).
  - `checkProducts()` inakataza tu `auction`→si mnada na `price_drop`→si bei kushuka (`:64-76`). **Group Buy inaruhusiwa** kupandishwa kwenye `live_commerce`.
  - **Kwa hiyo: hakuna haja ya kubadili server kwa Group Buy Live.** Panel ya biashara itaamuliwa na **`product.saleMode`**, si `session.kind`.
- **Muundo:** `Live Studio` = tabaka **juu ya chumba kilichopo** (`.lv7`), sio chumba kingine:
  - `js/app/126-live-studio.js` (mpya) inaongeza `.lv7-studio-panel` ndani ya room shell (`120:243 renderRoomShell`).
  - `sku` ya panel: `MnadaPanel` (bei ya sasa, zabuni, washiriki, muda, hali) · `GroupBuyPanel` (bei ya kikundi, lengo, waliojiunga, progress, muda) · `PriceDropPanel` (awali, mpya, punguzo, stock, muda).
  - Controls: `Anzisha / Simamisha (pause) / Maliza` zinatumia **`skhLiveHost('start'|'end')` zilizopo** (`120:609-611`). “Pause” haipo kwenye server — **haitajengwa** bila uamuzi (ona §7, D3).
  - Prefill: `skhLiveCreateForm(opts)` inapokea `{productId, saleMode, activityId}` → inachagua kind sahihi + bidhaa + kichwa. Nyongeza ya parameter tu.

### M5 — Persistent Mini Player
- **Muundo:** host mmoja wa kudumu `.skh-live-host` (mtoto wa `body`), iframe **moja** ndani yake; kubadilisha ukubwa = darasa la CSS `is-full` / `is-mini` / `is-hidden`.
- **API:** `skhLiveMinimize()`, `skhLiveRestore()`, `skhLiveLeaveFinally()` — zote zinafunga `skhLiveClose`/`leaveRoom` zilizopo.
- **Hakuna** `iframe.src=`, **hakuna** `.remove()`, **hakuna** re-mount. Test inahesabu `<iframe>` na `src`.
- **Visibility:** `is-hidden` ni darasa; kitufe `Live inaendelea ▲` kinabaki (si kufunga).

### M6 — Upcoming Activities & Notifications
- **Kilichopo:** upcoming = `live_sessions.scheduled` tu; reminders kwa live tu; arifa 5–6 aina (outbid, bid mpya, group target, auction win/end, price drop cut, live start).
- **Kile kinachokosekana:**
  1. **Shughuli isiyo Live iliyopangwa** haina nyumbani (Group Buy bila live, Price Drop inayoanza kesho).
  2. **Reminder ya “kabla”** (dakika 15/60) haipo — `liveStart` inatuma **saa ya kuanza** tu.
  3. Hakuna arifa za **imepangwa / imeahirishwa / imefutwa / muda umebadilika**.
  4. Hakuna **dedupe** ya kimuundo (docs hutumia `add()` → auto-id; sweep ikirudi inaweza kutuma mara mbili).
  5. **Group Buy** haionekani kwenye upcoming hata kidogo.
- **Architecture (pendekezo):** collection moja nyembamba `activities` + subcollection `reminders`, **sio** nakala ya `live_sessions`:
  ```
  activities/{activityId}
    hostUid, hostName, type:'auction'|'group_buy'|'price_drop'
    productId, title, image, priceLabel, currency:'TZS'
    status:'planned'|'live'|'ended'|'cancelled'|'postponed'
    startsAt:ms, endsAt:ms, timezone:'Africa/Dar_es_Salaam'
    liveSessionId:string|null        // live ikiwa ipo (live_sessions ipo tayari)
    announce:boolean, createdAt, updatedAt, createdBy
    reminders/{uid} {minutesBefore:15|60|1440, at:iso, createdAt}
    fanout/{event}                  // marker ya dedupe (planned/reminder15/started/...)
  ```
  - `live_sessions` **haibadilishwi**; `activity.liveSessionId` inaunganisha.
  - Shughuli iliyopangwa **haiwezi kuwa live** kabla ya `startsAt` (sweep inasimamia; UI inaonyesha “Inaanza baada ya siku X”).
  - Display ya muda: `startsAt` ni **ms epoch**; UI inaonyesha kwa timezone ya mtumiaji (`toLocaleString`), muuzaji akiweka kwa `Africa/Dar_es_Salaam` kwa lebo wazi.

---

## 2. FLOW YA MUUZAJI (text version; mchoro wa SVG uko kwenye preview §G)

```
(+) → Bidhaa Sokoni
  ↓  M1
[ SokoHuru | Mnada | Group Buy | Price Drop ]        Zaidi › (Wholesale, POS)
  ↓  M2
[ Bidhaa iliyopo ]  au  [ Bidhaa mpya ]  →  nakala? (Copy Template, stock 0)
  ↓  M3
[ Taarifa za msingi ] + [ Sehemu maalum za aina ]     ← panel ile ile ya sellerForm
  ↓
[ Anza sasa ]  au  [ Panga kuanza baadaye ]           ← M6-A
  ↓
[ Ongeza Live? ] ── ndiyo ─→ Live Studio (M4) ─→ chumba cha live (kilichopo)
   │                              ↓
   │                        Mini player (M5) ukitoka
   └── hapana ─→ shughuli inaendelea bila live (SokoHuru, Group Buy, Price Drop)
  ↓
[ Hali: imepangwa → inaendelea → imeisha / imeahirishwa / imefutwa ]
  ↓  server sweep (kila 5–15 dk) + arifa (M6-D)
```

## 3. FLOW YA MNUNUZI

```
Nyumbani / Shughuli Zijazo (M6-B)
  ↓ filter: Minada · Group Buy · Price Drop
[ Kadi: picha, bidhaa, aina, bei, tarehe, muda uliobaki, muuzaji, hali ya live ]
  ↓
[ Nihabarishe (reminder 15dk / 1h / siku 1) ]  au  [ Hifadhi ]  au  [ Mfuate muuzaji ]
  ↓  (arifa: imepangwa → inakaribia → imeanza; au imeahirishwa/imefutwa)
[ Fungua ukurasa wa shughuli ]
  ↓   live ipo?
  ├─ ndiyo → ingia live (liveJoin ile ile) → chumba / mini player
  └─ hapana → ukurasa wa shughuli: bidhaa, muda, progress (Group Buy), bei (Price Drop)
  ↓
[ Shiriki: zabuni (Mnada) · jiunge (Group Buy) · nunua (Price Drop) ] → checkout iliyopo
```

---

## 4. FILE / MODULE MAP (files zilizothibitishwa kuwepo)

| Module | Faili mpya | Faili zilizopo zinazoguswa | Mstari/eneo |
|---|---|---|---|
| **M1** | `js/app/113-sale-type-flow.js`, `css/71-sale-type-flow.css` | `html/15-main-menu.html` | `:9` (onclick) |
| **M2** | *(ndani ya 113)* | `shared/product-listing-core.mjs` (`saleCopyTemplate` **mpya**, `duplicateTemplate` haibadilishwi), `js/app/05-forms.js` (`setField` reuse) | `:259-296`, `:365` |
| **M3** | *(ndani ya 113)* | `html/09-admin-sell.html`, `html/13-form-edit.html`, `js/app/08-app-state.js`, `js/app/12-sys-modes.js`, `js/app/05-forms.js` | `:222-279`, `:20-49`, `:459-527`, `:474-500`, `:240-283` |
| **M4** | `js/app/126-live-studio.js` *(mpya)* | `js/app/120-live-commerce-ui.js` (prefill param + panel hook), `css/63/65-live-*.css` (paneli mpya kwenye `71`/`72`?) | `:189`, `:243+`, `:609-611` |
| **M5** | `js/app/127-live-mini-player.js`, `css/72-live-mini-player.css` | `js/app/120-live-commerce-ui.js` (hook mmoja), `js/app/61-full-system-repair.js` (back guard — **hiari**, ona D4) | `:262 leaveRoom` |
| **M6** | `functions/activities.js` *(mpya)*, `js/app/125-activities-ui.js` *(mpya)*, `css/73-activities.css` *(mpya)* | `functions/index.js` (export), `firestore.rules` (clauses mpya), `js/app/120-live-commerce-ui.js` (YANAYOKUJA ↔ activities), `html/21-scripts.html` + `html/00-head.html` (includes) | ona §6 |

**Haitaguswa (orodha ngumu):** Huduma/Fundi, Usafirishaji, Sajili Mwanachama, POS (`124-pos-grid.js`, `112-business-os-pos-page.js`), Wholesale (`shared/wholesale-price-core.js`), `#plusMenu`, `#mainMenu` items 3, `submitSeller` core isipokuwa validation ndogo, `auctionPlaceBid`, `closeAuction`, `secondChance`, `groupBuyJoin`, cart/checkout/orders/payment, chat, card actions (`Weka Oda`/`Patana Bei`/`Chat`/Share/Like/Save), auth, rules zilizopo.

---

## 5. DATA MODEL (proposed; `✅` = ipo leo bila mabadiliko)

### 5.1 `products` (kwa aina)
```js
// ✅ saleMode: 'free_market' | 'auction' | 'group_buy' | 'price_drop' | 'wholesale'
// ✅ Mnada
modeData = { endTime:ms, currentBid:number, maxBidder:uid|null, totalBids:number,
             startTime?:ms, minIncrement?:number }
// ✅ Price Drop
modeData = { minPrice, intervalMs, dropAmount, endTime, startTime, maxPerBuyer?,
             lastNotifiedPrice?, lastNotifiedAt?, stopped? }
// ✅ Group Buy
modeData = { discountValue, discountType:'amount'|'percent', joinedUsers:number,
             targetPeople:number, endTime:ms, participants?:uid[] }
// 🆕 M3 (nyongeza, hazivunji zilizopo)
modeData.originalPrice      // Price Drop: snapshot ya bei ya awali
modeData.minPeople          // Group Buy: kiwango cha chini (hiari)
modeData.startTime          // Group Buy: kuanza (hiari)
```
### 5.2 `live_sessions` ✅ (haibadilishwi)
```js
{ hostUid, hostName, title, description, kind:'live'|'live_commerce'|'auction'|'price_drop',
  status:'scheduled'|'live'|'ended'|'removed', scheduledAt:ms|null,
  startedAt, endedAt, productIds:[], pinnedProductId, video:{kind:'none'|'embed',url},
  viewerCount, peakViewers, commentCount, mutedUids, recordingAllowed, recordingUrl,
  createdAt, updatedAt }
// subcollections ✅ comments · viewers · likes · reminders/{uid}{at}
```
### 5.3 `activities` 🆕 (M6)
```js
{ hostUid, hostName, type:'auction'|'group_buy'|'price_drop',
  productId, title, image, priceLabel, currency:'TZS',
  status:'planned'|'live'|'ended'|'cancelled'|'postponed',
  startsAt:ms, endsAt:ms, timezone:'Africa/Dar_es_Salaam',
  liveSessionId:null|string, announce:boolean,
  createdAt, updatedAt, createdBy,
  stats:{ views:0, reminders:0, joined:0 } }        // joined ni server-only
// activities/{id}/reminders/{uid} = { minutesBefore:15|60|1440, at:iso, createdAt }
// activities/{id}/fanout/{event}   = { at:iso, recipients:n }  // dedupe marker
```
### 5.4 `notifications` ✅ (schema ile ile; nyongeza 3 za hiari)
```js
{ userId, title, body, createdAt, read, type, source, fromUid?, ... }
// 🆕 dedupeKey:'act_<id>_<event>'  🆕 activityId  🆕 actionUrl
```
### 5.5 `notificationPreferences/{uid}` ✅
```js
{ seller:{newProducts,priceDrops,restock,deals,allUpdates},
  product:{priceDrop,restock,majorDeal},
  chat:{newMessage,newOffer}, comments:{newComment,mention,reply} }
// 🆕 activities:{ reminder:true, started:true, changed:true, cancelled:true }
```
### 5.6 Nyingine zinazotumika ✅
`sellerFollowers/{sellerId__followerId}` · `price_drop_board` · `price_drop_entries` (server-only) · `group_orders` · `admin_audit_log`

---

## 6. NOTIFICATION ARCHITECTURE + KUEpuka MARUDIO

### 6.1 Njia mbili tu za kutuma (hakuna ya tatu)
1. **Mtumiaji → mtumiaji** (mchango wa chat/comments): client `addDoc(notifications)` — rules:645-660 zinaruhusu **kwa nafsi yake tu** na `fromUid==self`, haziruhusu `system:true`.
2. **Server → mtumiaji** (malipo, mnada, group, live, activities): `notify()` ya admin SDK (`live-commerce.js:270`, `commerce-modes.js:40`). **M6 itatumia njia hii.**

### 6.2 Dedupe — tabaka tatu
| Tabaka | Njia |
|---|---|
| **1. Doc ID deterministic** | `notifications/{activityId}_{event}_{uid}` kwa `set()` — kuandika tena **kunabadilisha** badala ya kuongeza |
| **2. Fanout marker** | `activities/{id}/fanout/{event}` — sweep inaangalia kwanza; transaction inaweka marker ndani ya `runTransaction` |
| **3. Field guard** | `dedupeKey` + `where('dedupeKey','==',k)` kwa kesi za legacy/zilizotumwa kwa mkono |

### 6.3 Events (7) na mtumaji
| Event | Wakati | Mtumaji | `dedupeKey` |
|---|---|---|---|
| `planned` | activity imeundwa/kupewa announce | client→server callable | `act_{id}_planned` |
| `reminder` | `startsAt − minutesBefore` | sweep (5 dk) | `act_{id}_rem_{uid}_{minutesBefore}` |
| `started` | `status: planned→live` | sweep au `liveStart` | `act_{id}_started` |
| `changed` | `startsAt` imebadilishwa | callable | `act_{id}_chg_{n}` (`n` = rev) |
| `postponed` | `status→postponed` | callable | `act_{id}_post_{n}` |
| `cancelled` | `status→cancelled` | callable | `act_{id}_cancel` |
| `ended` | `endsAt` imepita | sweep | `act_{id}_ended` |

### 6.4 Scheduled jobs
- **Mpya:** `activitiesSweep` — `onSchedule('every 5 minutes', timeZone:'Africa/Dar_es_Salaam')`:
  1. `planned` + `startsAt ≤ now` → `live` (au `ended` ikiwa `endsAt` imepita) + `started` fanout.
  2. `startsAt − minutesBefore ≤ now` → `reminder` fanout (kwa walioweka **hio** dakika tu).
  3. `endsAt ≤ now` + `status='live'` → `ended` + fanout.
  4. Retry-safe: kila hatua ina fanout marker → sweep ikirudi haina madhara.
- **Zilizopo zinabaki:** `commerceModesSweep` (15 dk), `inventoryReservationSweep` (5 dk), `adsDeliverySweep` (60 dk), `sokopayAutoRelease`, `platformStatsHourly`.
- **Hakuna** `setTimeout` ya frontend inayotuma arifa (brief §8.D).

### 6.5 Nani anapokea
`reminders` watu walioweka → `planned/reminder/started/changed/cancelled` (kulingana na prefs `activities.*`) · **followers wa muuzaji** (`sellerFollowers`, ≤500 kama `liveStart`) → `started` tu · **hakuna** arifa kwa wasiohusika.

### 6.6 Duplicate-prevention ya UI
`paint()` ya badge (`00-bootstrap:1793-1825`) inahesabu `read:false` **peke yake** — hakuna `announceNew` mara mbili kwa doc ile ile ikiwa ID ni ya kudumu.

---

## 7. TECHNICAL LIMITATIONS & DEPENDENCIES

| # | Kikomo | Ukweli | Athari |
|---|---|---|---|
| **L1** | Hakuna **OS push** | `messaging()`/FCM haipo kwenye repo | Arifa zinaonekana **app ikiwa wazi** pekee. Push = uamuzi tofauti (service worker + VAPID + functions) |
| **L2** | Kamera ya Live haipo | `getUserMedia` haitumiki kwa Live; video = iframe YouTube/Vimeo au “bila video” | **Hakuna camera/background broadcasting**; Live Studio ni dirisha la biashara, sio encoder |
| **L3** | Screen recording haipo | `getDisplayMedia` haipo; `MediaRecorder` ni ya sauti pekee | Q4: haijaongezwa |
| **L4** | `live_sessions.kind` haina `group_buy` | `KINDS` (`live-commerce.js:27`) | Group Buy Live = `live_commerce` + bidhaa ya `group_buy` (**inafanya kazi leo**); `kind:'group_buy'` = uamuzi D1 |
| **L5** | Iframe cross-origin | Hakuna mute ya moja kwa moja | `enablejsapi=1` + `postMessage` **wakati wa kuunda**; hakuna reload |
| **L6** | Background camera kwenye simu | iOS/Android wanazuia tab isiyoonekana | Mini player inaendelea kwa **iframe + room**; hakuna kuahidi zaidi |
| **L7** | `products` delete = `false` | `firestore.rules:207` | “Kufuta” shughuli = `cancelled`, sio ku-futa bidhaa |
| **L8** | `live_sessions` client write = `false` | rules:1913-1917 | Shughuli zote za mpangilio **lazima** zipite callable |
| **L9** | Sweep latency | 5 dk (mpya) / 15 dk (ipo) | “Inaanza saa 15:05” inaweza kuonekana live saa 15:09 → UI inaonyesha hali halisi, si ya kudhaniwa |
| **L10** | Timezone | `startsAt` = epoch ms; `Africa/Dar_es_Salaam` default | Onyesho kwa tz ya mtumiaji; hakuna kuandika string za muda kwenye DB |

**Dependencies:** Firebase Functions v2 (`onCall`, `onSchedule`) ✅ ipo · Firestore rules deploy (baada ya idhini) ✅ · `jsdom` + `playwright` (devDependencies) — **playwright haiko imewekwa kwenye sanduku hili** · node 18+ ✅.

---

## 8. RISK ASSESSMENT

| # | Hatari | Uwezekano | Athari | Kinga |
|---|---|---|---|---|
| R1 | Chooser inavunja ufunguzi wa `#sellerForm` | Kati | Kati | Fallback: `showForm('sellerForm')` ikiwa module haijapakia; test ya M1 inagusa njia zote mbili |
| R2 | Nakala inaharibu bidhaa asili | Chini | **Juu** | `saleCopyTemplate` ni pure function; hakuna `update` kwa doc asili; test inalinganisha `before/after` |
| R3 | Double audio kwa mini player | Chini | **Juu** | Iframe 1 tu; test inahesabu iframe + `src` |
| R4 | Arifa rudufu | Kati | Kati | Doc ID ya kudumu + fanout marker ndani ya transaction |
| R5 | Shughuli “live” kabla ya muda | Kati | Kati | Server inasimamia `startsAt`; UI haitoi kitufe cha “anza” kabla ya muda |
| R6 | Group Buy Live imevunjika kwa sababu `kind` haipo | **Kubwa** kama tungeongeza kind | Juu | **Hatuongezi** `kind`; tunatumia `live_commerce` (D1) |
| R7 | Rules mpya zinafunga njia zilizopo | Chini | **Juu** | Clauses mpya ni **nyongeza** tu; test za rules zipo (`test_commerce_modes`, `test_live_stories_groupsoko_emulator`) |
| R8 | Mabadiliko ya `08-app-state.js` yanavunja uwekaji bidhaa | Kati | Juu | Validation ni **nyongeza** (`endTime>now`); hakuna kuondoa checks zilizopo |
| R9 | Mini player inafunika checkout | Kati | Juu | Darasa `is-suppressed` linatumika kwenye checkout + full-screen modals; test ya UI |

---

## 9. ACCEPTANCE TESTS

### 9.1 Zilizopo (zitakimbizwa kila module)
`npm test` (vifungu vyote): `build_html.py check` · `test_product_listing_core` · `test_commerce_flow` · `test_commerce_cards` · `test_phase9_contracts` · `test_market_ranking` · `test_live_*` (emulator) · `test_pos_*` (POS haiguswi) — **739 pass** kama baseline.

### 9.2 Mpya (kwa module)
| Module | Test | Kinachothibitishwa |
|---|---|---|
| M1 | `tools/test_sale_type_flow.mjs` | Aina 4 zinafungua flow; Huduma/Usafirishaji/Sajili haziathiriki; `#sellerForm` inafunguka |
| M2 | `tools/test_sale_copy_template.mjs` | Picha/maelezo/specs zinanakiliwa; **stock=0**; variants bila stock; doc asili haijabadilika |
| M3 | `tools/test_mode_fields_validation.mjs` | Mnada unakataa `endTime` iliyopita; Group Buy progress; Price Drop inaisha |
| M4 | `tools/test_live_studio_panel.mjs` | Panel sahihi kwa `saleMode`; hakuna bid controls kwa Group Buy/Price Drop |
| M5 | `tools/test_live_mini_player.mjs` | `<iframe>` = 1; `src` haijabadilika; hide/restore/close tofauti |
| M6 | `tools/test_activities_contract.mjs` + emulator | Planned→live→ended; reminder mara moja; postpone/cancel; hakuna duplicate |

### 9.3 Kutoka brief §13 (yote yamefunikwa hapo juu) + ya ziada
- Wholesale/POS bado zinafanya kazi (regression ya `test_pos_*` + `test_wholesale_price_core`).
- Bidhaa asili haibadilishwi kwa bahati mbaya (M2).
- Mini player haifuniki checkout/full-screen modals (M5).
- Existing features zote: `npm test` kamili.

---

## 10. FILES ZITAKAZOGUSWA / ZISIZOGUSWA

### Zitakazoguswa (jumuishi, kwa module)
| # | Faili | Module | Aina |
|---|---|---|---|
| 1 | `html/15-main-menu.html` | M1 | mstari 1 |
| 2 | `js/app/113-sale-type-flow.js` 🆕 | M1, M2, M3 | mpya |
| 3 | `css/71-sale-type-flow.css` 🆕 | M1, M2 | mpya |
| 4 | `shared/product-listing-core.mjs` | M2 | `saleCopyTemplate()` mpya tu |
| 5 | `html/09-admin-sell.html` | M3 | panel fields |
| 6 | `html/13-form-edit.html` | M3 | fields 3 |
| 7 | `js/app/08-app-state.js` | M3 | validation |
| 8 | `js/app/12-sys-modes.js` | M3 | edit mode |
| 9 | `js/app/120-live-commerce-ui.js` | M4, M5, M6 | prefill param, panel hook, upcoming source |
| 10 | `js/app/126-live-studio.js` 🆕 | M4 | mpya |
| 11 | `js/app/127-live-mini-player.js` 🆕 | M5 | mpya |
| 12 | `css/72-live-mini-player.css` 🆕 | M5 | mpya |
| 13 | `js/app/125-activities-ui.js` 🆕 | M6 | mpya |
| 14 | `css/73-activities.css` 🆕 | M6 | mpya |
| 15 | `functions/activities.js` 🆕 | M6 | mpya (callables + sweep) |
| 16 | `functions/index.js` | M6 | export 1 |
| 17 | `firestore.rules` | M6 | clauses mpya (nyongeza) |
| 18 | `html/00-head.html`, `html/21-scripts.html` | zote | includes 4 |
| 19 | `tools/test_sale_type_flow.mjs` etc. 🆕 | zote | tests 6 |

> `index.html` ni **generated** — inajengwa upya kwa `python3 tools/build_html.py build`; `check` inathibitisha byte-exact.

### Hazitaguswa (ngumu)
`#plusMenu` · `MTOA HUDUMA / FUNDI` · `USAFIRISHAJI` · `SAJILI MWANACHAMA` · POS files zote · `wholesale-price-core.js` · `submitSeller` core (isipokuwa validation) · `auctionPlaceBid` / `closeAuction` / `secondChance` / `groupBuyJoin` / `sweepPriceDrops` · `liveCreate/liveStart/liveEnd/liveJoin/liveLeave/liveComment/liveRemind` · Live Settings · chat/comment modules · cart/checkout/orders/payment/SokoPay · share/like/save handlers · auth · `firestore.rules` zilizopo (zinaongezwa, hazibadilishwi).

---

## 11. MPANGILIO WA UTEKELEZAJI (baada ya idhini)

| Awamu | Modules | Kizuizi cha kuanza |
|---|---|---|
| **A** | M1 → M2 → M3 | Hakuna (Bidhaa Sokoni pekee) |
| **B** | M4 → M5 | Awamu A kupitiwa na kuthibitishwa |
| **C** | M6 (architecture + UI preview → implementation) | Preview ya M6 + idhini tofauti |

Kila module: audit ndogo → preview → code → `npm test` + test mpya → ripoti (`git diff --stat`, faili, tests) → idhini ya module inayofuata.

---

## 12. MASWALI YA UAMUZI (yanayozuia utekelezaji wa sehemu fulani)

| # | Swali | Chaguo | Athari |
|---|---|---|---|
| **D1** | Group Buy Live: tumia `live_commerce` (hakuna server change) au tuongeze `kind:'group_buy'`? | (a) `live_commerce` **(pendekezo)** · (b) ongeza kind (server + rules + sweep) | (b) inagusa `KINDS`, `TYPE` map, sweep — kubwa kidogo |
| **D2** | “Simamisha (pause)” live/auction: haipo server | (a) acha (Live/End tu) **(pendekezo)** · (b) iongezwe (sweep + hali mpya) | (b) = mabadiliko ya server ya live |
| **D3** | Arifa za shughuli ziende kwa **followers** pia, au kwa walioweka reminder tu? | (a) reminder + followers **(kama `liveStart`)** · (b) reminder pekee | Uchaguzi wa faragha |
| **D4** | Back button kwenye full-screen Live: ipunguze kuwa mini (badala ya kufunga)? | (a) ndiyo, mini **(pendekezo)** · (b) ibaki kufunga | (a) inagusa `skhGoBack` (`61:555`) — module ndogo ya M5 |
| **D5** | OS push (FCM) | (a) baadaye, sasa in-app tu **(pendekezo)** · (b) ianze sasa | (b) = service worker + VAPID + functions mpya |

---

**MWISHO.** Doc hii ni architecture + mpango. **Hakuna code ya app iliyobadilishwa, hakuna commit/merge/deploy/migration.** Uthibitisho wa macho: `preview/proposals/sales-flow-m1-m6.html`.
