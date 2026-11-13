# SokoHai — Ukarabati wa Live na Chat (login) — ripoti

**Tarehe:** 2026-11-14 · **Tawi:** `fix/live-merge-reconcile-20261113` · **Msingi:** `26bc673` (navigation repair)
Hakuna router mpya. Mfumo uleule wa `56-nav-back.js` + `94-modal-stack.js` umepanuliwa. Firebase, malipo na
data ya production havikuguswa. Backup za faili kabla ya kubadilisha: `scratchpad/backups/nav2/`.

## 1. Kasoro zilizothibitishwa kabla ya ukarabati (browser halisi, emulator)

| Kasoro | Ushahidi (probe kabla ya marekebisho) |
|---|---|
| **Live inafunguka nyuma ya ukurasa** | Bidhaa ya mnada → "INGIA KWENYE MNADA": `lvxRoom` iko wazi lakini kilicho chini ya kidole ni `productModal` (390×844). |
| **Back kutoka Live inatoka nje ya app** | Live hub → chumba → Back: ukurasa wa app unaondoka (Live haikuwa kwenye historia; `ov: []`). |
| **Chat bila kuingia: chat juu ya login** | Kugusa Chat (bila login): `authModal` NA `chatListModal` zote wazi, chat juu (`ov: ["authModal","chatListModal"]`). |
| **Live: hitilafu baada ya kutoka haraka** | Ukitoka chumbani (Back) kabla `liveJoin`/ufuatiliaji haujajibu: `TypeError: Cannot set properties of null` (unhandled rejection) kwenye `120-live-commerce-ui.js`. |

## 2. Vyanzo halisi

1. **Skrini za Live (`.lvx-overlay`: hub, chumba cha live, mnada, Zabuni zangu…) zilikuwa nje ya mfumo wa navigation.**
   Zinaundwa na `sheet()` ya `120-live-commerce-ui.js` (z-index 7400, `css/63-live-commerce.css:9`), lakini
   `94-modal-stack.js` (inayopandisha overlay mpya juu ya zilizo wazi) na `56-nav-back.js` (rundo + historia) zilisoma
   tu `.overlay-menu,[id$="Modal"],[id$="Form"]`. Matokeo: Live ilifunguka chini ya bidhaa (7500), kikapu (7600),
   chat (7800/9601), menyu ya akaunti (100005); na Back haikujua Live ipo.
2. **Inbox ya chat ilionyeshwa KABLA ya kukagua login.** `81-absolute-one-ui-live.js` (`patchChatInbox`) inaita
   `skhAbsoluteShowOnly('chatListModal')` kisha `orig()` ambayo ndiyo inaita `requireAuth()` → fomu ya login
   ikafunguliwa chini ya inbox.
3. **Hakuna njia ya "baada ya login, endelea ulipokusudia".** `skh.requireAuth()` ilifungua login tu.
4. **Mbio za async kwenye Live:** `paintHost`, `refreshRank`, `skhLiveOpen` na `productRoom` ziliandika kwenye `room`
   baada ya `await` bila kuhakikisha chumba bado ni kilekile.

## 3. Marekebisho (faili halisi)

| Faili | Mabadiliko |
|---|---|
| `js/94-modal-stack.js` | `.lvx-overlay` imeongezwa kwenye overlays zinazopandishwa (LIFO) na kusajiliwa kwenye rundo; restore ya Live inatumia njia yake halali (`skhLiveClose`). |
| `js/app/56-nav-back.js` | Live ni overlay ya kawaida ya rundo/historia (inafuatilia pia `hidden`); restore ya Live = `skhLiveClose(id)` (inaondoka chumbani vizuri, si kuficha tu); Forward haiundi upya chumba cha Live. |
| `js/app/81-absolute-one-ui-live.js` | Inbox ya chat: **login kwanza**, kisha inbox. Bidhaa iliyofunguliwa KUTOKA kwenye live haipunguzi live kuwa mini-player. |
| `js/app/00-bootstrap.js` | `skh.requireAuth(resume)` — nia ya mtumiaji inahifadhiwa; baada ya login inaendelea yenyewe; akighairi (anafunga login), nia inafutwa. |
| `js/app/120-live-commerce-ui.js` | `skhLiveOpen`/mnada/bei-kushuka zinapitisha `resume`; `skhLiveOpenProduct` inaweka bidhaa juu ya chumba; ulinzi wa mbio za async (`room` iliyobadilika baada ya `await`). |
| `js/app/22-printing.js` | Menyu ya akaunti bila login → login → menyu inafunguka yenyewe. |
| `tools/e2e-emulator/test_nav_live_auth.cjs` | Jaribio jipya (sehemu ya 4). |

Hakuna CSS/z-index iliyobadilishwa kuficha dalili: Live sasa inapandishwa na meneja uleule wa overlays wa app.

## 4. Majaribio

`test_nav_live_auth.cjs` (viewports 390×844, 360×800, 768×1024, 1440×900; kugusa halisi; `elementFromPoint`):

| Hatua | Inachothibitisha |
|---|---|
| C1 | Bila login, Chat → login iko juu mara moja; inbox **haijachorwa** |
| C2 | Back / kitufe cha kufunga login → ukurasa wa umma, hakuna tabaka, nia imefutwa |
| C3 | Login kutoka kwenye ombi la Chat → inbox inafunguka yenyewe → Back → ukurasa |
| C4 | Logout halisi → menyu ya akaunti → login → menyu inafunguka yenyewe |
| L1 | Home → Live (simu: kadi "Live Mnada" → bidhaa → INGIA MNADA; desktop: "Live sasa" → hub → chumba): Live juu mara moja; Back → hatua iliyotangulia → Home |
| L2 | Bidhaa (tab) → bidhaa ya mnada → chumba juu; Back → bidhaa → Bidhaa |
| L3 | Live ikifunguliwa wakati inbox ya chat iko wazi (story ya live): chumba juu; Back → inbox → ukurasa |
| L4 | Mini-player: Punguza → mini (session hai, hakuna tabaka) → "Rudi" → chumba kizima; bidhaa kutoka chumbani → X → chumba (si mini) |
| L5 | Menyu ya akaunti → "Live sasa" (njia ya simu) ukiwa Huduma → hub juu → chumba juu → Back → hub → Huduma |
| L6 | Hakuna JS error wala unhandled rejection |

Matokeo: **40/40** (hatua 10 × viewports 4), 0 JS errors / unhandled rejections. Kabla ya marekebisho, probe ileile ilionyesha
kasoro zote nne za sehemu ya 1.

Regression (code hii, emulator, Chromium):

| Seti | Matokeo |
|---|---|
| `test_nav_system.cjs` (navigation, viewports 4) | 56/56 |
| E2E kamili simu / desktop | 56/56 / 56/56 |
| `npm test` / build `--minify --check` | 107/107 / PASS |
| Live kamera (simu / desktop) | 6/6 / 6/6 — desktop ilitoa 4/6 mara moja wakati mashine ilikuwa na mzigo (WebRTC timeout), kisha 6/6 mara mbili mfululizo; code ya kabla ya marekebisho: 6/6 |
| Auction Live `ali` · Mnada admin | 10/10 × 2 · 3/3 × 2 |
| Group chat · Group business | 8/8 × 2 · 13/13 × 2 |
| Oda · Huduma · Usafiri · Group Buy · Kurejesha akaunti | 7/7 · 10/10 · 7/7 · 6/6 · 9/9 (kila moja × 2) |
| `test_r13b_live_stories_groupsoko` | 12/17 × 2 — **kushindwa 5 kulekule kunatokea kwenye code ya KABLA ya marekebisho** (`26bc673`): jaribio linatumia selectors za muundo wa zamani wa R13-B (`.lvx-card`, `.lvx-prod`, `#lvxPinned`) ambao ulibadilishwa na muundo mpya wa Live. Si regression; jaribio linahitaji kusasishwa (sijalibadilisha). |

## 5. Pointi zote za kuingia zilizolindwa (bila login) — ukaguzi

Kila moja iliitwa kwenye ukurasa usio na login (390×844), kisha nikaangalia kilicho juu:

| Mahali | Matokeo |
|---|---|
| Chat (bottom nav), Kikapu, SokoPay, Menyu ya akaunti, Taarifa, Kituo cha Escrow, Oda zangu, Uza (fomu ya muuzaji), Duka (switchMode), My SokoHai, Zabuni zangu, Group Soko, Matangazo, Huduma Hub | **Login juu peke yake**; hakuna UI iliyolindwa nyuma yake; 0 JS errors |
| Mode menu | Inafunguka (ni orodha tu); kila kipengele chake kinakagua login |
| Live hub, ukurasa wa bidhaa | Ni za umma kwa makusudi; kujiunga na live/kununua kunakagua login |

"Endelea baada ya login" imewekwa kwa: Chat, menyu ya akaunti, chumba cha Live / mnada / bei-kushuka. Mahali pengine
login inafunguka juu sawasawa lakini baada ya login mtumiaji anagusa tena (hakuna kuvunjika; ni nyongeza inayowezekana).
