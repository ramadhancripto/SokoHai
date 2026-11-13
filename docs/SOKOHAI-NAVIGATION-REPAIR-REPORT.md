# SokoHai — Ripoti ya ukaguzi na ukarabati wa mfumo wa navigation

**Tarehe:** 2026-11-13 · **Tawi:** `fix/live-merge-reconcile-20261113` · **Commit:** tazama sehemu ya 7.
**Tatizo lililoripotiwa:** mtumiaji anabonyeza/anafungua ukurasa, lakini maudhui hayaonekani mpaka abonyeze
Back, afunge ukurasa mwingine au arudie kitendo.

Hakuna router mpya wala moduli ya pili ya navigation. Mfumo uliopo — rundo la `js/app/56-nav-back.js`
(+ `updateApp`/`switchMode`) — ndio umekarabatiwa na sasa ndio chanzo kimoja cha ukweli wa "nini kiko
kwenye skrini" na wa historia ya browser. Firebase, malipo na data ya production havikuguswa.

## 1. Vyanzo halisi vilivyopatikana (vimethibitishwa kwa browser, si kwa kukisia)

Uchunguzi ulifanywa kwa Chromium halisi kwenye emulator, kwa kufuatilia kila `pushState`/`replaceState`/
`popstate` na kila badiliko la `style.display` la overlays (kwa stack trace).

| # | Chanzo | Dalili kwa mtumiaji | Faili |
|---|---|---|---|
| R1 | `updateApp()` (tabs za chini) na `switchMode()` (Soko ↔ Duka/Huduma Hub/Admin) ziliita `closeModals()`. Kwa sababu `closeModals` imefunikwa na 56/79/81, inafunga **hatua moja tu** ya rundo. | Ukiwa na chat juu ya bidhaa ukabonyeza Huduma: chat/bidhaa inabaki juu ya ukurasa wa Huduma — Huduma "haionekani" mpaka ubonyeze Back. | `08-app-state.js`, `01-market.js` |
| R2 | `81-absolute-one-ui-live.js` ina **rundo la pili** (`uiStack`) lililotumika KABLA ya rundo la 56, bila kujua kilicho juu kweli; halikufutwa UI zilipofungwa kwa njia nyingine. | X ya bidhaa iliyofunguliwa kutoka chat ilificha chat na kurudisha inbox, bidhaa ikabaki juu; UI za zamani zilifufuka. | `81-absolute-one-ui-live.js` |
| R3 | Tawi la "live" la 81 lilipunguza Live kuwa mini-player kila `closeModals()` ikiitwa — hata kama kilicho juu ni bidhaa. | Live → fungua bidhaa → X: bidhaa **haikufungwa**, Live ikawa mini-player. | `81-absolute-one-ui-live.js` |
| R4 | Kila overlay ilisukuma `history.pushState`, lakini kufunga kwa X/Esc/tab hakukugusa historia; `popstate` ilisukuma hatua mpya tena (`syncHistory`); tabs na modes hazikuwa kwenye historia kabisa. | Back ya simu "haifanyi kitu" mara 1–3; Forward haifanyi kazi; Back kutoka Huduma inatoka nje ya app. | `56-nav-back.js` |
| R5 | `skhSetProductUrl` iliandika `#/product/{id}` kwa `replaceState(null, …)` (ilifuta hali ya historia) na hash hiyo ilirithiwa na **kila hatua iliyofuata**. Back/Forward ikibadilisha URL, `hashchange` (deep-link) **ilifungua bidhaa tena**. | Bidhaa inajitokeza yenyewe juu ya Home/Huduma baada ya Back. | `07-product.js`, `56-nav-back.js` |
| R6 | Fomu (SokoPay n.k.) ziko NDANI ya `#plusMenu`. Kufunga fomu kuliacha `#plusMenu` wazi — backdrop tupu ya skrini nzima. | Skrini "tupu"/haigusiki baada ya kufunga SokoPay mpaka ubonyeze Back tena. | `56-nav-back.js` |
| R7 | Kufungua kwa mtindo wa "badilisha" (kikapu → malipo, ukurasa wa huduma → fomu ya ombi, inbox → mazungumzo, bidhaa → chat) kulifunga ukurasa wa awali kabisa. | Kufunga ukurasa wa juu kunakupeleka mahali pasipo sahihi (Home) badala ya ulipotoka. | `56-nav-back.js` |
| R8 | Ufunguaji wa chat ni async; ukibonyeza Back/Esc kabla haujamaliza, sehemu yake ya mwisho ilifunga ukurasa uliorudiwa na kuonyesha chat tena. | Chat inarudi "yenyewe", inbox/bidhaa inapotea. | `34-chat-core.js`, `56-nav-back.js` |
| R9 | Esc ilikuwa na wasikilizaji wawili (24 + 56) — Esc moja ilifunga tabaka mbili; ukiwa Home, Esc ilifanya `history.back()` (inatoka nje ya app). | Esc inaruka hatua. | `24-ui-final.js` |
| R10 | Mbio za feed: kubadili tab haraka — Promise ya Home ('all') au `onSnapshot` ya collection ya zamani ilichora juu ya ukurasa mpya (njia ya cache haikuzima listener ya zamani). | Bidhaa zinaonekana ndani ya Huduma, au ukurasa unabadilika wenyewe baadaye. | `00-bootstrap.js` |
| R11 | `scrollRestoration` ya browser + `scrollTo smooth` ya `updateApp` vilipigana na Back. | Nafasi ya orodha inapotea. | `56-nav-back.js`, `08-app-state.js` |
| R12 | Kitufe kikuu cha ukurasa wa huduma/usafiri ("Kadirio / Agiza Huduma", `.pm-bar-primary`) kilikuwa **cheupe juu ya cheupe** — sheria ya CSS iliondoa background ya vitufe vyote vya `#pmActionArea`. | Kitufe muhimu "hakionekani" ingawa kipo. | `css/52-product-card-details.css` |
| R13 | Tabs za chini zilikuwa `div` bila `role`/`tabindex`. | Hazifikiki kwa kibodi/visoma-skrini. | `html/19-bottomnav.html` |

Vilivyochunguzwa na **havikuwa chanzo**: `#welcomeModal` (inaonekana mara ya kwanza tu, inafungwa sawasawa);
z-index ya `#productModal` (94-modal-stack inaipandisha sawasawa); `display`/`opacity` za kurasa kuu.

## 2. Mfumo mmoja wa navigation (baada ya ukarabati)

- **Rundo la 56-nav-back = ukweli mmoja.** Kila hatua ya historia ina hali `{ tab, ov:[overlays] }`
  (`tab` = home/bidhaa/services/delivery au `mode:seller` n.k.).
- **Kurasa (tabs/modes)** = hatua mpya ya historia; zinafunga KILA overlay (Live inahamia mini-player, haifi).
- **Overlays** = hatua juu ya ukurasa. Ikifunguliwa kwa "kubadilisha" nyingine, ile ya awali inabaki chini
  (imefichwa) na kufunga ya juu kunairudisha.
- **Back/Forward** = `popstate` inalinganisha hali ya hatua na skrini (inafunga zisizotakiwa, inarudisha tab,
  inafungua tena kurasa-kama-overlay: bidhaa, kikapu, inbox, duka la muuzaji, taarifa, vilivyohifadhiwa, oda,
  kategoria). Hatua iliyokufa (haibadilishi chochote) inarukwa kwa mwelekeo uleule. Haisukumi hatua mpya.
- **URL**: `#/product/{id}` iko kwenye hatua ya bidhaa pekee.
- **Usafi**: kila kufunga kunaondoa backdrop tupu ya `#plusMenu` na vizuizi vya scroll vilivyobaki.
- **Mbio**: overlay iliyofungwa kwa Back/Esc/tab ikijitokeza tena ndani ya sekunde 1.5 bila mtumiaji kugusa
  chochote, inafichwa; chat inayofunguliwa inaambiwa ijikatae (`skhChatCancelPendingOpen`).
- Moduli za zamani (79/81 "one UI at a time", 94 modal stack) **zimebaki** — 81 sasa inafuata rundo la 56.

## 3. Faili zilizobadilishwa

`js/app/56-nav-back.js` (msingi), `js/app/08-app-state.js`, `js/app/01-market.js`, `js/app/81-absolute-one-ui-live.js`,
`js/app/07-product.js`, `js/app/24-ui-final.js`, `js/app/34-chat-core.js` (mstari 4: hook ya kughairi), `js/app/00-bootstrap.js`
(feed), `css/52-product-card-details.css`, `html/19-bottomnav.html` → `index.html` (build), jaribio jipya
`tools/e2e-emulator/test_nav_system.cjs`, ripoti hii. Backup za faili zote kabla ya kubadilisha: `scratchpad/backups/nav/`.

## 4. Jaribio jipya: `tools/e2e-emulator/test_nav_system.cjs`

Chromium halisi, kugusa halisi (`click`, `goBack`, `goForward`, Enter, Esc), emulator pekee. Kwa kila viewport
**390×844, 360×800, 768×1024, 1440×900**, kila hatua inathibitisha kinachoonekana: kipengele kiko wazi NA ndicho
kilicho chini ya kidole (`elementFromPoint`), tab sahihi ni active, hakuna overlay ya pili, hakuna tabaka
lisiloonekana linalozuia, ukurasa unascroll, hakuna JS errors.

| Hatua | Inachothibitisha |
|---|---|
| 0 | Karibu (welcome) inafungwa kwa kitufe chake, haiachi tabaka |
| A | Home → Huduma: kadi ya huduma inaonekana mara moja, tab active, sub-nav sahihi |
| B | Bidhaa → bidhaa → Back: bidhaa inafungwa, orodha + nafasi ya scroll vinabaki |
| C | Kikapu → malipo (oda halisi ya emulator) → funga → kikapu → funga → ukurasa unafanya kazi; Back haifufui malipo |
| D | SokoPay: inafunguka, tab inabadilika, Back haiachi backdrop tupu, ukurasa unascroll |
| E | Inbox → mazungumzo (mstari halisi) → Back → inbox → Back → ukurasa |
| F | Huduma → ukurasa wa huduma → kitufe "Agiza Huduma" (kinaonekana) → fomu → Back → ukurasa wa huduma → Back → orodha |
| G | Live: bidhaa kutoka kwenye live → X → live ileile (si mini-player, si kufa) |
| H | Drawer → modal kutoka drawer → Esc: hakuna tabaka lisiloonekana, ukurasa unascroll |
| I | Kugusa haraka Home/Bidhaa/Huduma/Usafiri/Bidhaa/Huduma: Huduma pekee, bila bidhaa ndani ya gridi; kuishia kwenye Chat: inbox pekee juu; Back → Huduma |
| J | Back/Forward: bidhaa ↔ orodha (Forward inarudisha bidhaa), Huduma → Bidhaa → Home → Bidhaa → Huduma |
| K | Kibodi: tabs zina `role=button`, `tabindex`, jina; Enter inafungua; Esc moja = tabaka moja (chat → bidhaa) |
| M | Business OS: mode menu → duka → Back → soko (tab ileile) → Forward → duka → "Rudi Soko" |
| L | Hakuna JS error katika safari nzima |

## 5. Matokeo ya majaribio

Kabla na baada — jaribio lilelile (`test_nav_system.cjs`, 390×844):

| | Kabla (code ya `d5795b8`) | Baada |
|---|---|---|
| Hatua zilizopita | **6/14** — C, D, E, F, G, J, K, M zilishindwa | **14/14** |
| Mfano wa kushindwa kabla | D: `#plusMenu` tupu inabaki juu baada ya SokoPay; E: Back inabaki kwenye chat; G: X ya bidhaa juu ya Live → bidhaa inabaki, Live inakuwa mini-player; J: Back kutoka Huduma inaonyesha bidhaa iliyofungwa; M: Back kutoka Duka haurudi Sokoni | — |

Baada ya ukarabati (code ya commit hii, emulator, Chromium):

| Seti | Matokeo |
|---|---|
| `test_nav_system.cjs` — viewports 4 (390×844, 360×800, 768×1024, 1440×900) × hatua 14 | **56/56** |
| `npm test` (amri 107 za unit/contract) | **107/107** |
| `node tools/build_dist.mjs --minify --check` | inapita |
| E2E kamili `tools/e2e-emulator/run.sh` — simu | **56/56** |
| E2E kamili — desktop 1440×900 | **56/56** |
| Safari za R16: huduma 10, usafiri 7, oda 7, Group Buy 6 (simu + desktop) | **zote zinapita** (60/60) |
| R15: kurejesha akaunti 9, PWA 8, push UI 5 (simu + desktop) | **44/44** |
| Live kamera 6, Mnada admin 3, Mnada live (`ali`) 10 (simu + desktop) | **38/38** |
| Group Chat 8, Group Business 13 (simu + desktop) | **42/42** |
| Utambulisho (identity) 5 (simu + desktop) | **10/10** |
| JS errors kwenye safari za navigation | **0** |

Moduli zilizothibitishwa kubaki salama kupitia majaribio hayo: SokoCart, SokoPay/escrow (wallet), orodha na
vichujio, huduma, usafiri, Group Buy, Mnada, Bei Kushuka (E2E kamili), Live, Group Chat, Business OS, Admin
Control Center (E2E #18), auth/kurejesha akaunti. Hakuna jaribio lililodhoofishwa; majaribio ya zamani
hayakubadilishwa. Firebase production na usanidi wa malipo havikuguswa.

## 6. Yaliyobaki / mipaka (kwa uwazi)

1. **Forward haiundi upya kila kitu**: kurasa-kama-overlay (bidhaa, kikapu, inbox, duka la muuzaji, taarifa,
   vilivyohifadhiwa, oda, kategoria) zinarudishwa; chat, malipo na fomu hazirudishwi kwa Forward (zinahitaji
   data/hali mpya) — Forward inaziruka.
2. **Kikapu baada ya malipo kuandaliwa**: R16 inaunda oda (payment_pending) na kufuta kikapu kabla ya skrini ya
   malipo. Kufunga malipo kunarudisha kikapu (sasa kitupu); oda isiyolipwa iko kwenye Escrow Center.
   **Uamuzi wako (D10):** je, bidhaa zibaki kwenye kikapu mpaka malipo yathibitishwe? Sijabadilisha sera hii.
3. Upau wa chini unajificha ukiscroll chini (muundo uliopo) — unarudi ukiscroll juu.
4. Back kwenye ukurasa wa kwanza wa app inatoka nje ya app (tabia ya kawaida ya web/PWA).
5. Admin Control Center inatumia njia ileile ya `switchMode` iliyojaribiwa kwenye Business OS; haikujaribiwa
   kwa akaunti ya admin kwenye jaribio hili (inahitaji claims za admin).
6. Moduli 79/81 bado zipo (hazijaondolewa — kuziondoa ni kazi kubwa yenye hatari); zimeoanishwa na rundo la 56.

## 7. Git

Commit tofauti ya navigation juu ya R16 (`d5795b8`). Hakuna force push, reset, clean wala kufuta mabadiliko.
Kuiweka kwenye `main`: `_sokohai-local\WEKA-KWENYE-MAIN.bat` mpya (bundle mpya, EXPECT = commit hii).
