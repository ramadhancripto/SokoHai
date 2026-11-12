# AUDIT — BIDHAA SOKONI (aina 4 za mauzo) + LIVE (full-screen & mini player)

**Tarehe:** 2026-11-08 · **Hali:** ukaguzi + preview pekee. **Hakuna code ya app iliyobadilishwa.**
Branch `feature/product-card-visual-refinement`, HEAD `2e8d049`.
Uhusiano: inaendelea kutoka `AUDIT-MNADA-CREATION-2026-11-08.md`.

---

## SEHEMU A — BIDHAA SOKONI

### A1. Mtiririko uliopo (sasa)

```
(+)  →  menu ya vitu 4  →  "BIDHAA SOKONI"  →  showForm('sellerForm')
                                              fomu moja: sehemu 5, fields 53
                                              mnada/group/price-drop zote
                                              zimefichwa ndani ya sehemu 4
```

`index.html:2993` → `05-forms.js:296` · `prodSaleMode` `index.html:1551`

**Chaguo za sasa za `prodSaleMode` (5):** `free_market` · `auction` · `price_drop` · `wholesale` · `group_buy`

### A2. Tatizo

Muuzaji hachagui **aina ya biashara** kwanza; anaingia kwenye fomu ya bidhaa kisha anagundua chaguo kwenye sehemu 4/5. Mnada ni hatua 3 kati ya 19 (ona audit ya awali §2 Swali 1).

### A3. Kinachohitajika (brief mpya)

```
(+)  →  BIDHAA SOKONI  →  [1] SokoHuru  [2] Mnada  [3] Group Buy  [4] Price Drop
                       →  [2] bidhaa iliyopo  AU  bidhaa mpya
                       →  [3] taarifa za msingi + masharti ya aina hiyo
                       →  Chapisha
```

### A4. Kinachogusa code (blast radius — kidogo kwa makusudi)

| Faili | Kinachobadilika | Kwa nini salama |
|---|---|---|
| `js/app/05-forms.js` (`showForm`) | kabla ya kuonyesha `sellerForm`, onyesha chooser | `showForm` inabaki; tunaongeza hatua moja tu mbele yake |
| `index.html` (mpya) | kasha moja jipya la chooser | hakuna kubadili `#sellerForm` |
| `js/app/08-app-state.js` (`submitSeller`) | **hakuna** | `prodSaleMode` inawekwa tayari kabla ya kuonyesha fomu |
| `js/app/12-sys-modes.js` (`submitEditForm`) | ongeza lazima ya `endTime` + startTime/minIncrement | sehemu zilizopo zinajazwa, sio kubadilishwa |

**Hakuna kubadilisha:** menu ya (+) vitu 4, `serviceForm`, `deliveryForm`, `skhOpenMemberRegistration`, `prodSaleMode` options (Wholesale inabaki), handlers zote.

### A5. Uamuzi unaohitaji idhini: **Wholesale**

Brief inataja aina **4**; mfumo una **5** (`wholesale` ni ya tano, na *Business OS/POS* inaitumia).
Pendekezo: **Wholesale ibaki** — chooser ionyeshe aina 4 + kiungo kidogo "Zaidi: Kuuza kwa Jumla". Hakuna kuondoa.

### A6. Bidhaa Zangu — kubadilisha aina bila kupoteza taarifa

**Sasa:** `Hariri → editSaleMode → Hifadhi` (`13-form-edit.html:8`, `12-sys-modes.js:374,405`)

| Kipengele | Hali | Athari |
|---|---|---|
| Kubadili mode kwa bidhaa yenye zabuni | ✅ imezuiwa | `12-sys-modes.js:419–421` + `firestore.rules:186–194` |
| Kubadili bei baada ya zabuni | ✅ imezuiwa | `:470–474` |
| **Muda wa kuisha unakaguliwa?** | ❌ **hapana** | `:481` `if (et && et.value)` → mnada unaweza kuzaliwa "umeisha" |
| Muda wa kuanza / nyongeza ya chini kwenye Hariri | ❌ haipo | `13-form-edit.html:20` ina `editAucEndTime` pekee |
| Taarifa za bidhaa zinabaki | ✅ zinabaki | `updateMap` ina title/price/location/desc + structured |
| Draft inahifadhi sehemu za mode | ❌ hapana | `core.mjs:291–296` |

**Cha kufanya (pendekezo):** sehemu ile ile ya uhariri iongezewe `startTime`, `minIncrement`, na **lazima ya `endTime` ikiwa `auction`** — ndani ya panel ile ile, sio fomu mpya. Taarifa zote zilizopo zinabaki (hakuna `reset()`).

---

## SEHEMU B — LIVE

### B1. Jinsi Live inavyofanya kazi kwa kweli (muhimu sana)

| Swali | Jibu (ushahidi) |
|---|---|
| Ni app ya aina gani? | **Web/PWA pekee.** Hakuna Capacitor/Cordova/native wrapper (`package.json`, hakuna `capacitor.config.*`). |
| Video inatoka wapi? | **Iframe ya YouTube/Vimeo** (`120:331`) au **hakuna video kabisa** ("Live bila video: bidhaa, bei na maoni" `120:336`). |
| SokoHai inarusha (broadcast) camera? | ❌ **Hapana.** Hakuna `getUserMedia({video})` kwa Live popote. |
| Kuna screen recording? | ❌ **Hapana.** Hakuna `getDisplayMedia` kwenye repo nzima. |
| `recordingAllowed` ni nini? | Flag pekee. `recordingUrl` **unapaswa kupitishwa na mtu** mwisho wa live (embed URL) — `functions/live-commerce.js:98,129`. |
| `getUserMedia` inatumika wapi? | **Voice notes** (`34:6824`, `73:1358`), **sauti ya bidhaa** (`07:1536`), **QR scanner** (`17:1775`), **simu/WebRTC** (`105-calls.js`). |
| MediaRecorder? | Voice notes + sauti ya bidhaa tu. **Sio video, sio screen.** |

> **Hitimisho lililo wazi:** "screen recording flow" ambayo brief inasema *"acha kama ilivyo"* **haipo kwenye code**. Sitaisimulia kama ipo, na **sitaitengeneza** bila idhini yako (itakuwa feature mpya, si marekebisho). Kinachopo ni kurekodi **sauti** na **kuchukua picha**. Hii ni tofauti muhimu kwa scope na muda.

### B2. Navigation lifecycle (kwa nini Live inakatika leo)

| Tukio | Kinachotokea | Chanzo |
|---|---|---|
| Chumba kimefunguliwa | `.lvx-overlay` fixed `z-index:7400` inashughulikia skrini yote | `63-live-commerce.css:9`, `65-live-design.css:68` |
| "Funga" (X) | `skhLiveClose('lvxRoom')` → **`leaveRoom()`** → `unsubscribe` + `liveLeave` + `room = null` | `120:78,262` |
| Navigation (`updateApp`) | haiwezekani bila kufunga chumba — overlay inafunika UI | `24-ui-final.js:89` |
| `closeModals()` | **haiathiri** chumba (inafunga `.overlay-menu` pekee, sio `.lvx-overlay`) | `00-bootstrap.js:588` |
| Back/Escape | `61-full-system-repair.js:555` ndio inashinda (imepakiwa baada ya 24). **Haihusiki na `lvxRoom`** | order: 24 → 61 → 120 |

**Athari:** hali ya live (`room`, subscriptions, comments, bids) inaishi ndani ya JS na **inafutwa kabisa** kwenye `leaveRoom()`. Ndio mahali panapohitaji "persistent state" — sio kuunda injini mpya.

### B3. Inawezekana mini player? (ukweli kwa kila upande)

| Uwezo | Mtazamaji | Mtangazaji |
|---|---|---|
| Iframe ya YouTube/Vimeo iendelee | ✅ **inawezekana** — hali ya iframe inadumu kama **hatui izuii/kuondoa** kwenye DOM | ✅ hali hiyo hiyo (stream iko YouTube upande wao) |
| Chumba (bidhaa, maoni, zabuni, mnada) kiendelee | ✅ — `room` state inabaki, subscriptions zinaendelea | ✅ |
| **Kamera/mic ya SokoHai ikiendelea background** | — | ❌ **haiwezekani** — hakuna camera capture ya Live. Browser pia inazuia camera ya tab isiyoonekana kwenye simu nyingi. |
| Audio iendelee | ✅ ikiwa iframe haitabadilishwa | ✅ (sauti inatoka YouTube) |
| Kudhibiti mute | ⚠️ iframe cross-origin haina mute ya moja kwa moja. `?mute=1`/reload **huanzisha upya** embed (sauti mara mbili, hali inapotea). Njia sahihi: ongeza `enablejsapi=1` kwenye `src` **wakati wa kuunda** kisha tumia `postMessage` (`mute`/`unMute`) — hakuna reload. Bila hiyo, onyesha "sauti inaendelea" (usidai kimya). | hiyo hiyo |

**Ufunguo wa kiufundi:** **usisogeze iframe kwenye DOM.** Badala yake, weka chumba kimoja cha kudumu (`.skh-live-host`) na ubadilishe **darasa la CSS** kati ya `is-full` na `is-mini`. Iframe haitabadilishwa ⇒ hakuna kupakia upya ⇒ hakuna sauti mara mbili ⇒ hakuna stream ya pili. Hii inakidhi §9.5–9.7 za brief moja kwa moja.

### B4. Kilichopo vs kinachohitajika (Live)

| Kinachopo (kinafanya kazi) | Kinachohitajika kuongezwa |
|---|---|
| Chumba cha full-screen (`.lv7`) | Uwezo wa **kupunguza** (mini) badala ya kufunga |
| Live Hub, YANAYOKUJA, DEALS | Hali ya `mini` inayoshiriki state ile ile |
| Maoni (Firestore), Likes, Share, Bidhaa panel, Zabuni board | Kurudisha full-screen mahali palipokuwa |
| `liveCreate`, `liveJoin`, `liveLeave`, `liveComment`, `liveEnd` | "X" yenye chaguo 2 (ficha / ondoka kabisa) |
| Mnada/PriceDrop ndani ya live | `reconnecting` state (network loss) |
| Muda wa live, watazamaji | Uhusiano wa wazi wa bidhaa + aina ya mauzo kwenye mini player |

### B5. Media constraints (platform)

| Kitu | Ukweli |
|---|---|
| iOS Safari (simu) | Tab isiyoonekana inasimamisha video/sauti; **hakuna** background camera |
| Android Chrome | Video inasimama tab isiyoonekana isipokuwa PiP ya native; camera inazimwa |
| Desktop Chrome/Edge/Safari | Video inaendelea kama DOM/iframe inabaki; PiP ya native inapatikana kwa `<video>`, **sio** iframe |
| Hitimisho | Mini player = **UI ya ndani ya app** (si PiP ya OS). Hii ni sahihi kwa brief na ni ya kuaminika. |

---

## SEHEMU C — RAMANI YA MABADILIKO (baada ya idhini)

| # | Eneo | Faili | Aina |
|---|---|---|---|
| 1 | Chooser ya aina 4 | `index.html` (kasha jipya) + `05-forms.js` (hatua moja) | nyongeza |
| 2 | Bidhaa iliyopo/mpya | `05-forms.js` (orodha ya bidhaa zako) | nyongeza |
| 3 | Masharti ya aina | `toggleModeFields()` ile ile | **reuse** |
| 4 | Bidhaa Zangu → kubadili aina | `13-form-edit.html` + `12-sys-modes.js` | marekebisho madogo |
| 5 | Live → bidhaa bila kurudia | `120:189` `skhLiveCreateForm` (prefill) | **reuse** |
| 6 | Mini player | nyongeza: `css` + module ndogo | nyongeza |
| 7 | Persistent state | `120` `room` (hakuna kuunda mpya) | **reuse** |

**HAITAGUSWA:** menu ya (+), Huduma, Usafirishaji, Sajili Mwanachama, Live Settings, `liveCreate`/`liveEnd`, rules, functions, `submitSeller` core, `auctionPlaceBid`.

---

## SEHEMU D — MAAMUZI (yaliyokubaliwa 2026-11-08)

Q1–Q5 zimejibiwa. **Hakuna code iliyoandikwa bado** — tunasubiri go-ahead ya M1.

| # | Uamuzi wa mmiliki | Athari |
|---|---|---|
| **Q1** | Wholesale → chini ya kiungo **“Zaidi ›”** | Orodha kuu = aina 4; Wholesale/POS haziondolewa, haziguswi |
| **Q2** | Muuzaji **achague**: kubadilisha iliyopo **au** kutengeneza nakala | Hatua 2 ina chaguo 2 wazi; bidhaa asili haiguswi |
| **Q3** | Mini player = **iframe pekee**; “Live bila video” ibaki kama ilivyo | Hakuna kuvunja kikomo cha `120:336` |
| **Q4** | **Screen recording isiwekwe** | Hakuna `getDisplayMedia`; `recordingUrl` inabaki kwa mkono |
| **Q5** | Mini player **chini-kulia** by default, **draggable** | Nafasi ya awali chini-kulia; inavutwa; inahifadhiwa kifaa (localStorage) |

### D1. Maswali mawili yaliyobaki

| # | Swali | Chaguo | Pendekezo |
|---|---|---|---|
| **Q6** | “Nakala mpya” inakili kiasi gani? | (a) `skhDuplicateProduct` kama ilivyo (hakuna picha) · (b) `saleCopyTemplate()` mpya kwenye shared core: picha+maelezo+specs zinakiliwa, **stock=0**, variants bila stock | **(b)** — (a) inalazimu kupiga picha upya, kinyume na lengo la “bila kurudia taarifa” |
| **Q7** | Mini player ionekane skrini zipi? | (a) kila mahali isipokuwa checkout/full-screen modals · (b) mahali pote · (c) nyumbani+soko pekee | **(a)** |

> **Sababu Q6 ipo:** `duplicateTemplate` kwa makusudi **hainakili** picha, stock, variants wala `modeData` (`shared/product-listing-core.mjs:259–262`). Ni “mipangilio”, sio bidhaa.

---

## SEHEMU E — RAMANI YA MODULES 5

Kila module ni ndogo, inapimwa peke yake, na inaweza kuachwa bila kuathiri inayofuata. Mpangilio: **M1 → M2 → M3** (Bidhaa Sokoni), kisha **M4 → M5** (Live).

| # | Module | Faili | Kigezo cha kufaulu |
|---|---|---|---|
| **M1** | Chooser ya aina 4 (+ “Zaidi ›”) | mpya `css/71-sale-type-flow.css`, `js/app/113-sale-type-flow.js`; mstari 1 kwenye `html/15-main-menu.html:9` | Bidhaa Sokoni inafungua chooser; Huduma/Usafirishaji/Sajili hazibadiliki; aina → `#sellerForm` ile ile |
| **M2** | Bidhaa iliyopo / mpya (+ ibadilishe au nakala) | `113-sale-type-flow.js`; reuse `skhDuplicateProduct` (`05-forms.js:512`); ikiwa Q6=(b): `shared/product-listing-core.mjs` | Kuchagua bidhaa kunajaza fomu; nakala inaunda mpya; asili haiguswi |
| **M3** | Masharti ya aina + Hariri | `113-sale-type-flow.js`; `html/13-form-edit.html`; `js/app/12-sys-modes.js:374–389, 481` | Mnada hauhifadhiwi bila `endTime`; kubadili aina hakupoteza taarifa; ulinzi wa zabuni unabaki |
| **M4** | Live → bidhaa (prefill) | `js/app/120-live-commerce-ui.js:189` `skhLiveCreateForm(opts)` — parameter tu | Live kutoka bidhaa inajaza bidhaa+aina; Live Settings haziguswi; `liveCreate` haibadilishwi |
| **M5** | Full-screen ↔ mini player | mpya `css/72-live-mini-player.css`, `js/app/127-live-mini-player.js`; hook mmoja kwenye `120` | Iframe **moja** kwenye DOM wakati wote; hakuna `src` mpya; hali inarudi; draggable, chini-kulia |

### E1. Mipaka migumu ya M5

- Iframe **haihamishwi** kwenye DOM; hakuna `iframe.src =`, hakuna `.remove()`, hakuna re-mount.
- Chumba kimoja cha kudumu `.skh-live-host`; kubadilisha = darasa la CSS `is-full` ↔ `is-mini`.
- Hakuna stream/camera session ya pili; hakuna autoplay mpya.
- Test inashindwa ikiwa idadi ya `<iframe>` ≠ 1 au `src` imebadilika.

### E2. Uthibitisho kwa kila module

`npm test` (vifungu vyote + `build_html.py check`) · test mpya `tools/test_sale_type_flow.mjs` (M1–M3) · `tools/test_live_mini_player.mjs` (M5) · ripoti ya `git diff --stat` + orodha ya yaliyoguswa/yasiyoguswa.

---

## HITIMISHO

Doc hii ni audit + mpango. **App haijabadilishwa**; hakuna deploy, hakuna merge. Uthibitisho wa macho: `preview/proposals/live-and-sale-type.html` (toleo la 2, maamuzi Q1–Q5 + ramani ya modules).
