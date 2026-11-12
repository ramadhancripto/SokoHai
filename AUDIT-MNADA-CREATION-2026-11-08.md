# UKAGUZI — Mfumo wa kuanzisha Mnada (Direct Mnada)

**Tarehe:** 2026-11-08
**Hali:** Ukaguzi pekee. **Hakuna mstari wa code uliobadilishwa.** Branch `feature/product-card-visual-refinement`, HEAD `2e8d049`.
**Lengo:** kuelewa mfumo uliopo kabla ya kubadilisha muonekano wa Direct Mnada.

> **Kikomo cha ukaguzi:** huu ni ukaguzi wa **code** (file:line). Sikuweza kubonyeza UI kwa akaunti ya muuzaji — sandbox haina browser wala akaunti ya mtihani. Kila kitu nilichosema "kinafanya kazi" kinathibitishwa na code + Cloud Functions + sheria za Firestore; ninatenganisha wazi kile kinachohitaji uthibitisho wa moja kwa moja (live click-through).

---

## 0 · MUHTASARI WA HARAKA (TL;DR)

| # | Ukweli | Ushahidi |
|---|---|---|
| 1 | **"Mnada" si kitu kinachoundwa peke yake.** Mnada ni **sifa (`saleMode`) ya bidhaa** — hakuna entity ya "mnada" kwenye database. | `products.saleMode:'auction'` + `modeData` |
| 2 | **Hakuna kitufe cha Mnada kwenye (+).** Menu ya (+) ina vitu 4: Bidhaa, Huduma, Usafirishaji, Sajili Mwanachama. | `index.html:2986–3019` |
| 3 | Njia pekee ya kuanzisha mnada: **(+) → BIDHAA SOKONI → fomu ya bidhaa → Sehemu 4 → chagua "Mnada (Live Auction)" → muda wa kuisha → Chapisha.** | `index.html:1364`, `:1551`, `:1562` |
| 4 | **"Anzisha Live → Mnada Live" haitengenezi mnada.** Inakagua tu kwamba bidhaa ulizochagua **tayari ni mnada**; vinginevyo inatoa kosa. | `functions/live-commerce.js:72,88` |
| 5 | Kubadili bidhaa **iliyopo** kuwa mnada: inawezekana tu kupitia **Hariri**, na ina upungufu (hakuna lazima ya muda wa kuisha). | `12-sys-modes.js:480` |
| 6 | Muuzaji anaingiza **hatua ~19** kuanzisha mnada mpya; kati ya hizo, **mnada ni hatua 3 tu** (muda wa kuisha, muda wa kuanza, nyongeza). | `08-app-state.js:459–469` |

---

## 1 · MFUMO ULIOPO (data model)

Mnada umejengwa juu ya **bidhaa**, si juu ya "event". Vitu vinne pekee:

```
products/{id}
  saleMode: 'auction'
  modeData: {
    endTime        <— LAZIMA (ms)
    startTime      <— hiari (ms); ikiwepo mnada hauanzi kabla
    minIncrement   <— hiari (TSh); vinginevyo 5% ya dau la juu
    currentBid     <— huanza = price (bei ya bidhaa = bei ya kuanzia)
    maxBidder, totalBids
    winnerId, winnerBid, paymentDeadline, ended   <— SERVER pekee
  }
  price            <— inakuwa "BEI YA KUANZIA" mnada ukichaguliwa
  stock, image(s), description, location, category …

live_sessions/{id}
  kind: 'auction' | 'live' | 'live_commerce' | 'price_drop'
  productIds[], pinnedProductId, scheduledAt, status

auction_participation/{uid_pid}   <— "Zabuni zangu" ya mnunuzi
```

**Vyanzo:** `js/app/08-app-state.js:459–469` (uundaji) · `js/app/120-live-commerce-ui.js:57` (`auctionState`) · `functions/commerce-modes.js` (zabuni/kufunga) · `firestore.rules:137–194` (`modeData` ni ya server baada ya zabuni).

**Muhimu:** `modeData.winnerId / winnerBid / paymentDeadline / pastWinners` **haziwezi kuandikwa na muuzaji** — `firestore.rules:140–148,161–165`.

---

## 2 · MAJIBU YA MASWALI 7

### Swali 1 — Muuzaji anaanzishaje mnada? Anaanzia wapi, hatua zipi?

Anaanzia **fomu moja kubwa ya bidhaa** (`#sellerForm`), inayoitwa **"Weka Bidhaa / Stoo"**. Mnada ni sehemu ndogo ndani yake.

**Njia A — bidhaa mpya (njia kuu):**

| # | Hatua | Ushahidi |
|---|---|---|
| 1 | Bonyeza kitufe cha (+) kinachoelea | `index.html:3479` → `togglePlusMenu()` |
| 2 | Chagua **BIDHAA SOKONI** | `index.html:2993` → `showForm('sellerForm')` |
| 3 | Sehemu 1 "Inauzwa wapi" — chagua chaneli (duka / mtandaoni / zote) | `data-sf-group="channel"` |
| 4 | Jina la bidhaa | `prodName` |
| 5 | Tafuta na chagua **aina ya bidhaa** (taxonomy) | `prodTaxonomySearch` |
| 6 | Kategoria + subkategoria | `prodCategory` / `prodSubCategory` |
| 7 | Aina + hali ya bidhaa | `prodProductType` / `prodCondition` |
| 8 | **Bei** — inabadilika kuwa "Starting Bid" mnada ukichaguliwa | `prodPrice`, `05-forms.js:260–262` |
| 9 | Stock, kipimo cha msingi | `prodStock`, `prodBaseUnit` |
| 10 | **Picha (angalau 1)** | `prodImage`, `08-app-state.js:555–560` |
| 11 | Skrola hadi **Sehemu 4 "Soko la mtandaoni"** | `data-sf-group="online"` |
| 12 | Chagua **MTINDO WA KUUZA MTANDAONI = "Mnada (Live Auction)"** | `prodSaleMode` (`index.html:1551`) |
| 13 | **MUDA WA MNADA KUISHA** (lazima) | `aucEndTime` (`:1565`) |
| 14 | MUDA WA MNADA KUANZA (hiari) | `aucStartTime` (`:1568`) |
| 15 | NYONGEZA YA CHINI YA ZABUNI (hiari) | `aucMinIncrement` (`:1570`) |
| 16 | Maelezo (lazima kwa soko) | `prodDesc`, `08-app-state.js:450` |
| 17 | Mahali bidhaa ilipo (lazima) | `prodLocation` |
| 18 | Bonyeza **"CHAPISHA BIDHAA SOKONI"** | `submitSeller()` `08-app-state.js:352` |
| 19 | (Hiari) Nenda Live Hub → "Anzisha Live" → aina "Mnada Live" → chagua bidhaa ile ile → tengeneza → "Anza live" | `120-live-commerce-ui.js:189` |

**Hitimisho:** hatua **19**, ambapo **mnada ni 3 tu** (13–15).

---

### Swali 2 — Kuna kitufe cha (+) au njia nyingine?

**Kitufe cha (+) kipo — lakini hakina Mnada.**

Menu ya (+) (`#mainMenu`, `index.html:2986`) ina vitu **vinne** tu:

| Kitu | Kinafanya nini | Mstari |
|---|---|---|
| BIDHAA SOKONI | `showForm('sellerForm')` | `:2993` |
| MTOA HUDUMA / FUNDI | `showForm('serviceForm')` | `:2999` |
| USAFISHAJI & DELIVERY | `showForm('deliveryForm')` | `:3005` |
| SAJILI MWANACHAMA | `skhOpenMemberRegistration()` | `:3012` |

**Njia nyingine zilizopo (zote si za kuunda mnada):**

| Lango | Linaenda wapi | Aina |
|---|---|---|
| Hamburger → **"Live sasa"** | Live Hub (`skhLiveHub`) | Kuunda **live**, sio mnada |
| Nyumbani → kitufe "Mnada · Shiriki mnada" | `setMarketMode('auction')` | **Kichujio cha mnunuzi** |
| Nyumbani → "Live na fursa za soko" | `skhLiveHub('deals')` | Mnunuzi |
| Tab "Mnada (Live)" kwenye soko | `setMarketMode('auction')` | **Kichujio cha mnunuzi** |
| Bidhaa Zangu → **Hariri** | `openEditModal` | Kubadili bidhaa kuwa mnada |

⚠️ Kitufe cha "Mnada" kinachoonekana nyumbani `index.html:3254` **kinampeleka mnunuzi kwenye orodha ya minada** — hakianzishi mnada. Hii ni sababu moja ya mkanganyiko.

---

### Swali 3 — Anaweza kuanzisha mnada kwa kuongeza bidhaa mpya moja kwa moja?

**Ndiyo — na hii ndiyo njia inayopatikana.** Lakini mtiririko ni **"bidhaa kwanza, mnada baadaye"**: muuzaji hawezi kusema "nataka kuanzisha mnada" na kupewa fomu ya mnada; anapewa fomu ya bidhaa na mnada umefichwa ndani.

Hakuna hatua yoyote inayomwambia muuzaji "hii ndiyo itakuwa mnada" hadi afike **Sehemu 4 kati ya 5** ya fomu.

---

### Swali 4 — Anaweza kuchagua bidhaa iliyopo (Bidhaa Zangu / SokoHuru) na kuiingiza kwenye mnada?

**Ndiyo, kwa njia mbili — zote zina upungufu:**

**(a) Kupitia "Hariri" (kubadili bidhaa kuwa mnada):** ✅ inafanya kazi
`Bidhaa Zangu → Hariri → MTINDO WA KUUZA → Mnada → muda wa kuisha → Hifadhi`
(`html/13-form-edit.html:8,20` · `12-sys-modes.js:374,405`)

- ✅ Inazuia kubadili mode kama tayari kuna zabuni (`12-sys-modes.js:419–421`) — na **sheria za Firestore zinalinda hilo upande wa server** (`saleMode`/`modeData` haziwezi kubadilishwa kama `totalBids > 0`, `firestore.rules:186–194`)
- ✅ Inazuia kubadili bei baada ya zabuni (`:470–474`)
- ❌ **Muda wa kuisha si lazima** — `if (et && et.value)`; ukiacha wazi, hakuna `endTime` → mnada unaonekana **"umeisha" papo hapo** (`:481`)
- ❌ Hakuna kuchagua **muda wa kuanza** wala **nyongeza ya chini** kwenye Hariri
- ❌ Bidhaa inabadilika **papo hapo** kutoka "inauzwa" kwenda "mnada" — mnunuzi aliyekuwa akiitazama anaona mabadiliko bila taarifa

**(b) Kupitia "Anzisha Live" → aina "Mnada Live":** ⚠️ inachagua tu, haitengenezi
Orodha ya bidhaa inaonyesha bidhaa zako zote (hadi 60) zenye lebo "· Mnada". Ukichagua bidhaa isiyo mnada:

```
functions/live-commerce.js:72
if (kind === 'auction' && saleMode(p) !== 'auction') throw ... 'si_mnada:' + pid
```
→ Muuzaji anapata: **"Mnada Live inahitaji bidhaa za mnada."** — hatakiwi kuambiwa hivyo; anatakiwa kupewa njia ya kuifanya kuwa mnada hapo hapo.

---

### Swali 5 — Taarifa zipi zinahitajika kabla ya kuchapisha?

Fomu ina **fields 53** zenye `id`. Kwa mnada wa mtandaoni, hizi ni zinazohitajika:

**Lazima (zisizo na mnada):**

| Taarifa | Sheria | Chanzo |
|---|---|---|
| Jina la bidhaa | si tupu | `08-app-state.js:402` |
| Bei | > 0 | `:402` |
| Kategoria | lazima (isipokuwa duka-la-ndani) | `:402` |
| Mahali | lazima (isipokuwa digital) | `:402` |
| Maelezo | lazima kwa soko la mtandaoni | `:450` |
| Picha | angalau **1** (hadi 6) | `:555–560` |
| Chaneli | mtandaoni au zote | `prodVisibility` |

**Lazima kwa mnada pekee:**

| Taarifa | Sheria | Chanzo |
|---|---|---|
| **Muda wa kuisha** | lazima; **haikaguliwi kama uko mbeleni** | `:459–460` |
| Muda wa kuanza | hiari; lazima uwe **kabla** ya kuisha | `:464–467` |
| Nyongeza ya chini | hiari; vinginevyo **5% ya dau la juu** | `:468–469`, `120:60` |

**Hiari:** stock (default 1), kipimo, barcode, variants, filters za soko, SKU.

**Masharti mengine:** mtumiaji aliyeingia (`requireAuth`) — **hakuna** uthibitisho maalum wa muuzaji kwa mnada (`firestore.rules:151–175`).

---

### Swali 6 — Sehemu zipi zinafanya kazi, zipi ni UI tu, zipi hazipo?

#### ✅ ZINAFANYA KAZI (zimeunganishwa na Firestore / Cloud Functions)

| Kazi | Ushahidi |
|---|---|
| Kuchapisha mnada (product + modeData) | `08-app-state.js:591–620` |
| Kuweka zabuni kwa usalama (server-side) | `functions/commerce-modes.js:99` `auctionPlaceBid` |
| Nyongeza ya chini + anti-snipe | `commerce-modes.js` (`minNextBid`, `antiSnipeEnd`) |
| Kufunga mnada + mshindi + deadline ya malipo (24h) | `closeAuction` `:211`, `auctionFinalize` `:260` |
| Sweep ya kila dakika 15 (minada iliyosahaulika) | `commerceModesSweep` `:316` |
| Chumba cha mnada cha mnunuzi | `skhAuctionRoom` `120:303` |
| Paneli ya mnada kwenye ukurasa wa bidhaa | `07-product.js:322–343` |
| "Zabuni zangu" (mnunuzi) | `skhMyBids` `120:648` |
| Live Hub + live session ya aina `auction` | `liveCreate` `functions/live-commerce.js:78` |
| Arifa za mshindi/mshindwa | `07-product.js:641–648` |
| Deposit ya mnunuzi (TSh 1,300, inaweza kuzimwa na admin) | `12-sys-modes.js:138–152` |
| Chips za hali ya mnada kwenye Bidhaa Zangu | `30-seller-products.js:185–192` |

#### ⚠️ UI TU / SEHEMU

| Kitu | Tatizo |
|---|---|
| "Anzisha Live → Mnada Live" | Inaonekana kama inatengeneza mnada; kwa kweli inahitaji mnada uwe tayari |
| "Hariri" kwa mnada | `editAucEndTime` pekee — hakuna startTime / minIncrement |
| Kitufe "Mnada" nyumbani | Ni kichujio cha mnunuzi, si kuanzisha |
| `prodSaleMode` | Chaguo 5 zote zinaonekana; hakuna mwongozo wa tofauti yao |

#### ❌ HAZIPO KABISA

| Kinachokosekana | Athari |
|---|---|
| Lango la "Anzisha Mnada" | Muuzaji haoni mahali pa kuanza |
| Mtiririko wa "mnada kwanza" | Lazima ajaze bidhaa yote kwanza |
| Kuchagua bidhaa iliyopo **ndani ya mtiririko wa mnada** | Lazima aende Hariri |
| Uthibitisho: muda wa kuisha uko mbeleni | Anaweza kuchapisha mnada ulioisha |
| **"Minada yangu"** kwa muuzaji | Haoni minada yake yote mahali pamoja |
| Kufunga / kughairi mnada kwa mkono | Anaweza tu **ku-archive** (kufuta hakuna: `firestore.rules:207`) |
| Hakiki (preview) kabla ya kuchapisha | Hana uhakika jinsi mnada utaonekana |
| Draft inayohifadhi sehemu za mnada | Akirudi, anajaza tena |
| Muunganisho wa muda wa mnada ↔ muda wa live | Saa mbili tofauti |
| Mnada kwenye Business OS / product builder | `06-product-builder.js` **haina** `saleMode` |

---

### Swali 7 — Sehemu zinazojirudia / kuingiza taarifa mara mbili

| # | Kurudiwa | Ushahidi | Athari |
|---|---|---|---|
| R1 | **Kichwa cha live** kinajazwa upya (si kuchukuliwa kutoka bidhaa) | `120:194` `lvxTitle` | Andika jina la bidhaa mara ya pili |
| R2 | **Muda**: mnada una `startTime`/`endTime`; live ina `scheduledAt` | `08:464`, `120:197` | Saa mbili tofauti — zisipolingana mnunuzi anapata "mnada haujaanza" |
| R3 | **Uchaguzi wa bidhaa** unafanyika baada ya kuunda bidhaa | `120:198` `lvxProducts` | Mnada umeundwa tayari, kisha unachaguliwa tena kwenye live |
| R4 | **Draft** haihifadhi `aucEndTime/aucStartTime/aucMinIncrement` | `product-listing-core.mjs:291–296` | Ukirudi baadaye, muda unajazwa upya |
| R5 | **"Nakili bidhaa"** hunakili `saleMode` lakini **si** `modeData` | `core.mjs:262–266`, `05-forms.js:512–533` | Mnada nakala unadai muda upya; banner haitaji hivyo |
| R6 | Sehemu ya mode inaonekana **mara mbili** (uundaji + uhariri) zenye fields tofauti | `index.html:1562` vs `13-form-edit.html:20` | Uhariri hauwezi kufanya kila uundaji unachofanya |
| R7 | Bei ya kuanzia ni `prodPrice` ile ile ya rejareja | `08:461` | Muuzaji haambiwi waziwazi "bei ya kuanzia = bei uliyoweka" isipokuwa lebo |

---

## 3 · MTIRIRIKO KAMILI WA SASA (hatua kwa hatua)

### Mtiririko A — Mnada mpya (njia kuu)

```
[MUUZAJI]                                        [MFUMO]
   |                                                 |
   |-- 1. Bonyeza (+) ------------------------------> inaonyesha mainMenu (vitu 4)
   |-- 2. BIDHAA SOKONI ---------------------------> showForm('sellerForm')
   |                                                 fomu "Weka Bidhaa / Stoo"
   |-- 3..10. Jaza sehemu 1-3 ---------------------> hakuna kidokezo cha mnada
   |          (chaneli, jina, taxonomy, kategoria,
   |           bei, stock, kipimo, picha)
   |-- 11. Skrola hadi sehemu 4 -------------------> (hakuna anchor/kitufe cha kuruka)
   |-- 12. Chagua "Mnada (Live Auction)" ----------> sehemu 3 za mnada zinaonekana
   |                                                lebo ya bei inakuwa "Starting Bid"
   |-- 13. Muda wa kuisha (LAZIMA)
   |-- 14. Muda wa kuanza (hiari)
   |-- 15. Nyongeza ya chini (hiari)
   |-- 16..17. Maelezo + Mahali
   |-- 18. CHAPISHA ------------------------------> products doc: saleMode='auction'
   |                                                 modeData{endTime,currentBid=price,...}
   |                                                 stock=0 + openingStockPending (server)
   |                                                 <-- bidhaa INAONEKANA sokoni PAPO HAPO
   |
   |-- 19. (hiari) Live Hub -> Anzisha Live ------> live_sessions{kind:'auction'}
             -> aina "Mnada Live"                    inakagua saleMode=='auction' (au kosa)
             -> chagua bidhaa (ile ile tena)
             -> kichwa + maelezo (mara ya pili)
             -> "Tengeneza live" -> "Anza live"
```

**Muda:** mnada unaanza mara moja isipokuwa `startTime` imewekwa. Unafungwa na: (a) mtu aliye na chumba wazi (`auctionFinalize`), au (b) sweep ya dakika 15.

### Mtiririko B — Bidhaa iliyopo → mnada (Hariri)

```
Bidhaa Zangu -> tafuta -> Hariri -> MTINDO = Mnada -> (linganisho la muda)
   -> Hifadhi -> saleMode='auction', modeData.endTime (KAMA umejaa)
```
Hatua 6. **Lakini**: hakuna lazima ya muda → mnada unaweza kuzaliwa "umeisha"; hakuna startTime/minIncrement.

### Mtiririko C — Live show ya mnada
Hatua 10 za ziada (juu ya A), zenye kurudiwa kwa kichwa, maelezo na uchaguzi wa bidhaa.

---

## 4 · MAPUNGUFU (GAPS) — yaliyopimwa

| # | Upungufu | Ukubwa | Chanzo |
|---|---|---|---|
| **G1** | Hakuna lango la "Anzisha Mnada" kwenye (+) | 🔴 kubwa | `index.html:2986–3019` |
| **G2** | Mnada umefichwa kwenye Sehemu 4/5 ya fomu ya fields 53 | 🔴 kubwa | `index.html:1551` |
| **G3** | Hakuna mtiririko wa "mnada kwanza" | 🟠 wastani | — |
| **G4** | "Mnada Live" inatoa kosa badala ya njia | 🟠 wastani | `live-commerce.js:72` |
| **G5** | Muda wa kuisha haukaguliwi kuwa **mbeleni** | 🔴 kubwa (data) | `08-app-state.js:459` |
| **G6** | Hariri → mnada bila `endTime` = mnada "umeisha" papo hapo | 🔴 kubwa (data) | `12-sys-modes.js:481` |
| **G7** | Hariri haina startTime / minIncrement | 🟡 ndogo | `13-form-edit.html:20` |
| **G8** | Draft haihifadhi sehemu za mnada | 🟠 wastani | `core.mjs:291` |
| **G9** | Nakili bidhaa hai nakili `modeData` | 🟡 ndogo | `core.mjs:262` |
| **G10** | Hakuna "Minada yangu"; hakuna kufunga kwa mkono. Zaidi ya hayo **muuzaji hawezi kufuta bidhaa** (`allow delete: if false`) — anaweza tu ku-archive/unpublish | 🟠 wastani | hakuna `skhMyAuctions`; `firestore.rules:207`; `30-seller-products.js:811` |
| **G11** | Saa mbili: `modeData.startTime` vs `live_sessions.scheduledAt` | 🟠 wastani | `120:197` |
| **G12** | Hakuna hakiki (preview) kabla ya kuchapisha | 🟡 ndogo | — |
| **G13** | `friendly()` inaweza kuonyesha "TSh …" isiyo sahihi kwa kosa `si_mnada:<id>` | 🟡 ndogo | `120:41` |

---

## 5 · PENDEKEZO LA UX

### Kanuni tatu
1. **Hakuna kinachoondolewa.** `submitSeller`, `modeData`, `auctionPlaceBid`, rules, `liveCreate` — zote zinabaki kama zilivyo.
2. **Taarifa zisijirudie.** Kila kitu kinachojulikana kwa bidhaa kikitumika kwenye mnada, hakina kuulizwa tena.
3. **Muuzaji aone mnada, si fomu.** Hatua ziwe kuhusu **mnada**, na bidhaa iwe hatua moja tu.

### Jibu: **NJIA ZOTE MBILI — ndani ya mtiririko mmoja** ✅

> **Kitufe kimoja: "Anzisha Mnada".** Kinaanza na swali moja — *bidhaa ipi?* — kisha kinagawanyika:
> **[Chagua iliyopo]** au **[Ongeza mpya]**. Njia zote mbili zinaungana kwenye **hatua ile ile ya mwisho** (muda + hakiki + chapisha).

**Kwa nini si (+) peke yake:** muuzaji mwenye stock 80 tayari atalazimika kuingiza jina, picha, bei, maelezo na mahali **mara ya pili** — kazi ya kurudia na hatari ya bei tofauti kati ya duka na mnada.

**Kwa nini si "bidhaa zilizopo" peke yake:** muuzaji mpya hana bidhaa yoyote — hana pa kuanzia. Na "Direct Mnada" isingekuwa na mlango wake.

**Kwa nini zote ndani ya mtiririko mmoja (si menu mbili):** menu mbili = marejeleo mawili ya kudumisha, na hatua za mwisho zingeendelea kutofautiana (ndiyo tatizo la R6 leo).

### Mtiririko unaopendekezwa (hatua 5 badala ya 19)

```
[Anzisha Mnada]  <-- kitufe kwenye eneo la Mnada + kipengee kipya kwenye (+)
       |
  1. BIDHAA YA MNADA?          [ Chagua iliyopo ]   [ Ongeza mpya ]
       |                              |                    |
       |                    orodha ya bidhaa zako      fomu ile ile ya
       |                    (picha, bei, stock)        bidhaa, iliyowekwa
       |                    + utafutaji                 tayari kwenye
       |                              |                 "Mnada" mode
       |                              |                    |
       +------------------------------+--------------------+
                                      |
  2. MUDA NA BEI        bei ya kuanzia (imejazwa), muda wa kuanza,
                        muda wa kuisha, nyongeza ya chini
                                      |
  3. HAKIKI             kadi inayoonyesha KILICHOCHAPISHWA:
                        picha, jina, bei ya kuanzia, nyongeza,
                        start -> end, idadi ya watazamaji 0
                                      |
  4. CHAPISHA           "Mnada wako uko hewani"
                                      |
  5. BAADA YA KUCHAPISHA  [ Anza Live sasa ]  [ Nakili kiungo ]  [ Ona sokoni ]
```

**Hatua 1** inaondoa G1, G2, G3, G4, R3. **Hatua 2** inaunganisha saa (G11) na kufanya endTime iwe lazima + ya mbeleni (G5, G6). **Hatua 3** inaondoa G12. **Hatua 5** inaunganisha mnada na live bila kuandika kichwa mara ya pili (R1).

### Inatumikaje code iliyopo (hakuna backend mpya)

| Kipengele | Kile kilichopo kinachotumika |
|---|---|
| "Ongeza mpya" | `showForm('sellerForm')` + `submitSeller()` — fomu ile ile, `prodSaleMode` imewekwa tayari |
| "Chagua iliyopo" | update ya product (`modeData.endTime` kama `submitEditForm` inavyofanya) |
| Hakiki | data ile ile ya `modeData` + `auctionState()` |
| "Anza Live sasa" | `skhLiveCreateForm()` ikiwa imejazwa awali (kind=`auction`, bidhaa iliyochaguliwa) |
| Uthibitisho | ongeza sharti moja: `endTime > Date.now()` (client) — **hakuna mabadiliko ya schema** |

### Uamuzi unaohitaji idhini yako (sitachagua mwenyewe)

**Bidhaa iliyopo ibadilishwe au inakiliwe?**
- **(a) Badilisha** — listing moja; inapoteza bei ya rejareja; rahisi; stock moja.
- **(b) Nakili** — bidhaa ya duka inabaki; mnada ni listing ya pili; **lazima tuamue stock** (mnada ukichukua kipande kimoja, stock ya duka ipungue lini?).

Hii inagusa inventory — siwezi kuamua bila wewe.

---

## 6 · MASWALI KWA MMILIKI (kabla ya muundo wa mwisho)

| # | Swali | Chaguo |
|---|---|---|
| **D1** | Kitufe "Anzisha Mnada" kiwe **wapi** kwanza? | (i) eneo la Mnada pekee (ii) ndani ya (+) pekee (iii) zote mbili |
| **D2** | Bidhaa iliyopo: **badilisha** au **nakili**? | (a) / (b) / mwache muuzaji achague kila mara |
| **D3** | Muda wa kuisha uwe **lazima** daima? | ndiyo / hapana |
| **D4** | Muda wa kuanza uunganishwe na muda wa live? | ndiyo (saa moja) / hapana |
| **D5** | Tuongeze **"Minada yangu"** kwa muuzaji? | ndiyo (awamu 2) / baadaye |
| **D6** | Mnada usio na live uendelee kuwa halali? (sasa: ndiyo) | ndiyo / hapana |

---

## 7 · VIAMBATISHO

### 7.1 Fields 53 za fomu (`#sellerForm`), na za mnada

Mnada: `aucEndTime` (27), `aucStartTime` (28), `aucMinIncrement` (29) — **3 kati ya 53**.
Orodha kamili: `html/09-admin-sell.html` (chanzo cha `index.html`).

### 7.2 Codes za makosa ya mnada
`si_bidhaa_yako`, `si_mnada`, `chagua_bidhaa`, `waliokuzidi`, `mnada_umefungwa`, `mnada_haujaanza`, `tangazo_lako`, `tayari_unaongoza`, `juu_ya_bei_ya_sasa`, `chini_ya_bei_ya_mwisho` — `js/app/120-live-commerce-ui.js:40–45`.

### 7.3 Ramani ya faili

| Faili | Jukumu |
|---|---|
| `index.html:1361–1600` | `#plusMenu`, `#sellerForm`, sehemu za mode |
| `index.html:2986` | `#mainMenu` (menu ya +) |
| `js/app/08-app-state.js:352–620` | `submitSeller()` — kuchapisha |
| `js/app/05-forms.js:240` | `toggleModeFields()` — kuonyesha sehemu |
| `js/app/05-forms.js:512` | `skhDuplicateProduct()` |
| `js/app/12-sys-modes.js:374–520` | `openEditModal` + `submitEditForm` |
| `js/app/120-live-commerce-ui.js` | Live/Mnada UI, `auctionState`, chumba, Zabuni zangu |
| `js/app/07-product.js:322–343, 669` | Paneli ya mnada + kuweka zabuni |
| `functions/commerce-modes.js` | `auctionPlaceBid`, `closeAuction`, `auctionFinalize`, sweep |
| `functions/live-commerce.js` | `liveCreate` + sharti `saleMode=='auction'` |
| `shared/product-listing-core.mjs:262–296` | COPY_FIELDS, DRAFT_FIELDS |
| `firestore.rules:150–194` | Ulinzi wa `products` na `modeData` |

---

## 8 · NINI HAKIJAFANYIKA

- ❌ Hakuna code iliyobadilishwa (app, CSS, rules, functions).
- ❌ Hakuna commit ya mabadiliko ya app (ripoti hii ni nyaraka pekee).
- ❌ Hakuna uthibitisho wa "click-through" wa muuzaji (hakuna browser/akaunti sandbox) — hii inahitaji muuzaji mmoja wa mtihani kwenye kifaa.
- ❌ Muundo wa mwisho wa Direct Mnada haujaamuliwa — ninasubiri majibu ya D1–D6.
