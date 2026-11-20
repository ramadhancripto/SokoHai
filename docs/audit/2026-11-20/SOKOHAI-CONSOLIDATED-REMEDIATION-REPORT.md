# SokoHai: ripoti ya pamoja ya marekebisho ya matokeo ya ukaguzi

**Tarehe:** 20 Nov 2026
**Tawi:** `remediation/consolidated-20261120` (kutoka `origin/main` 9ca6ad2)

**Haikufanyika:** push, deploy, mabadiliko ya data ya production, mabadiliko ya category IDs, wala kuwasha PesaPal live.

## 1. Vyanzo vilivyosomwa

| Chanzo | Aina | Jinsi kilivyotumika |
|---|---|---|
| `AUDIT-REPORT.md` | Ripoti ya ukaguzi (kiambatisho) | Matokeo yalithibitishwa moja moja kwenye code |
| `DOCUMENT-KAMILI-Category-Audit.docx` | Ukaguzi wa kategoria | Mapendekezo ya taxonomy; hakuna kilichoundwa (D8) |
| `Category-Gap-Analysis.xlsx` | Workbook ya mapengo | **Rejea tu**, si kasoro zilizothibitishwa (tazama ECOM audit) |
| `LOG-USAFIRISHAJI-REPORT-KAMILI_1.docx` | Ripoti ya usafirishaji | Kadi za usafiri na safu ya Usafiri nyumbani |
| `SOKOHAI-ECOM-AUDIT-BRIEF.md`, `SOKOHAI-INVENTORY-AUDIT-BRIEF.md` | Briefs za kusoma tu | `SOKOHAI-ECOM-GAP-AUDIT.md`, `SOKOHAI-INVENTORY-GAP-AUDIT.md` |
| Rekodi za local (MABADILIKO_*, MAREKEBISHO_TOP_NAV, SOKOHAI-CARD-UI-FIX, FULL-SYSTEM-AUDIT, NAV-STORE-REPAIR, UCHUNGUZI, UKAGUZI, ripoti za Arena) | Rekodi za mawakala wengine (11-18) | Kila kasoro iliyo wazi ilijaribiwa tena kwenye `origin/main` |
| Mfano wa kadi wa mmiliki (picha) na majibu ya maswali 3 | Uamuzi wa mmiliki | Muundo mmoja wa kadi + safu 3 nyumbani |

## 2. Rejista ya marekebisho

**Hali:**

- **IMEREKEBISHWA**: kasoro ilithibitishwa, ikarekebishwa na ikajaribiwa.
- **SEHEMU**: sehemu ya tatizo imerekebishwa.
- **NAKALA**: ni kasoro ileile ya kipengele kingine.
- **REJEA**: pendekezo la taxonomy, halijatekelezwa.
- **BLOCKED**: inahitaji uamuzi, idhini, au inagusa pesa/data.
- **HAIJATHIBITIKA**: haikuweza kuthibitishwa hapa.

**Kipaumbele:** P1 = hitilafu au upotevu wa data; P2 = tabia isiyo sahihi au ujumbe wa uongo; P3 = muonekano au mapendekezo.

| ID | Chanzo | Moduli / faili | Tatizo (ushahidi) | Hali | Marekebisho | P | Kipimo cha kukubali |
|---|---|---|---|---|---|---|---|
| R-01 | Rekodi 11-18 | 39-product-core.js `productEligible` | Bidhaa zilizozimwa (`isOnline:false`) au zilizofichwa zilionekana kwenye soko (regression) | IMEREKEBISHWA | Masharti `isOnline!==false && availabilityStatus!=='hidden'` yamerudishwa pamoja na `channelsOf` | P1 | test_product_foundation_contract; test_owner_card_style ("hidden product excluded") |
| R-02 | Rekodi 11-18 ("hdr is not defined") | 08-app-state.js | Listener ya `resize` iliita `hdr()`/`measure()` nje ya scope yake, hivyo kila resize ilitoa ReferenceError | IMEREKEBISHWA | Listener iliyopotea imeondolewa | P1 | E2E "no page errors"; owner card "no JS errors" |
| R-03 | Ukaguzi wa kadi | 00-bootstrap.js `ProductPostCard` | `col` haikufafanuliwa (ReferenceError) wakati wa kuchora moyo ♡ | IMEREKEBISHWA | `cardHeartIcon(data,'products')` | P1 | test_commerce_cards |
| R-04 | Rekodi 11-18 (outbox) | 102-publish-outbox.js | Hitilafu ya storage ilimezwa, na mtumiaji aliambiwa "imehifadhiwa"; foleni ikijaa, kipengele cha zamani kilifutwa kimya | IMEREKEBISHWA | `write()` inarudisha boolean; `enqueue` inakataa na kuonyesha `failNotice` | P1 | npm test (outbox contracts) |
| R-05 | Rekodi 11-18 (nakala za tangazo) | 00-bootstrap.js `saveData` | Hitilafu ya mtandao isiyo wazi, ikifuatiwa na kujaribu tena, iliweza kuunda tangazo mara mbili | IMEREKEBISHWA | ID inatengenezwa mapema na `setDoc` inatumika, kwa hiyo kujaribu tena kunaandika hati ileile (products/services/drivers) | P1 | npm test; E2E 14 (huduma imehifadhiwa) |
| R-06 | Rekodi 11-18 | 08-app-state.js `submitSeller` | `saveData` ikirudisha null, kitufe kilibaki "Inahifadhi…" | IMEREKEBISHWA | `setLoading` inarudishwa kabla ya `if(!docId) return` | P2 | Ukaguzi wa code + E2E |
| R-07 | Rekodi 11-18 | 08-app-state.js | Bidhaa yenye variants ikihifadhiwa offline, variants zilipotea | IMEREKEBISHWA | `hasVariantCombos` husababisha `skipQueue:true` | P1 | npm test |
| R-08 | Rekodi 11-18 | 08-app-state.js | Ujumbe "kikamilifu" ulionyeshwa hata hatua ya builder ilipokosekana | IMEREKEBISHWA | Ujumbe sasa unaeleza ukweli (`builderIncomplete`) | P2 | Ukaguzi wa code |
| R-09 | Rekodi 11-18 | 03-dashboard.js | `Promise.all`: query moja ikishindwa, dashboard nzima ilishindwa | IMEREKEBISHWA | Queries za ziada (shop_ledger/shop_staff/purchase_orders) zina fallback laini, `__unavailable` na toast | P2 | test_dashboard_data_integrity 16/16; E2E 16 |
| R-10 | Rekodi 11-18 | 30-seller-products.js | Hitilafu ya oda ilifichwa; kikomo cha 300 hakikuonyeshwa | IMEREKEBISHWA | META `ordersUnavailable`, `productsTruncated`, `ordersTruncated` na toast | P2 | test_my_products_kpi_browser |
| R-11 | Ukaguzi wa Business OS | 110-business-os-shell.js | Taarifa na Gumzo hazikufikika ndani ya Business OS | IMEREKEBISHWA | Vitufe vya Taarifa (badge) na Gumzo vimeongezwa chini ya sidebar | P2 | test_business_os_browser |
| R-12 | Ukaguzi wa POS | 110/112 | POS ya header, ikifuatiwa na Back, iliweka ukurasa wa POS ndani ya POS. Chanzo: `closeModals` (79/81) uliita `skhCloseTop` na kuondoa 'bostab' | IMEREKEBISHWA | Bendera `__bosSuppressTabRestore` wakati wa `showForm` | P2 | test_dashboard_data_integrity 16/16 |
| R-13 | Ukaguzi | 111-business-os-overview.js | Ujumbe wa hitilafu haukueleza kwa nini namba hazionyeshwi | IMEREKEBISHWA | Ujumbe wa ukweli: ripoti ya server haijathibitishwa | P3 | test_business_os_browser |
| R-14 | Mmiliki (mfano wa kadi) | 00-bootstrap.js, css/82 (mpya) | Kadi za bidhaa/huduma/usafiri zilikuwa na mitindo tofauti na maelezo yasiyohitajika; ⭐ ilikuwa ndani ya picha | IMEREKEBISHWA | Kadi moja `skh-oc`:<br>• fremu 4:3, picha nzima (contain);<br>• chip ya kategoria juu kushoto;<br>• ♡ juu kulia;<br>• "Imethibitishwa" (kweli tu) chini kulia;<br>• jina, kisha bei kushoto na ⭐ halisi kulia | P2 | test_owner_card_style (360/390/1440); test_commerce_cards; test_ui_header_cards |
| R-15 | Mmiliki (majibu) | 123-home-layout.js, css/66 | Nyumbani hakukuwa na safu za Huduma na Usafiri | IMEREKEBISHWA | Safu 3: Bidhaa, Huduma, Usafiri, kila moja na "Ona Zote". Rekodi halisi tu; safu tupu inafichwa. | P2 | test_owner_card_style (mpangilio); test_popular_rail_browser; test_home_product_archive_browser |
| R-16 | Mmiliki | cardVerifiedPill / cardRatingCompact | "Bado tathmini" na ⭐ ya kubuni hazitakiwi | IMEREKEBISHWA | ⭐ inaonyeshwa tu kukiwa na thamani halisi; pill ya "Imethibitishwa" kwa walio verified tu | P2 | test_popular_rail_browser (hakuna ⭐ ya uongo) |
| R-17 | Mmiliki ("verification kupitia admin/form") | Uthibitishaji wa bidhaa | Pill inasoma hali ya uthibitishaji iliyopo, inayowekwa na admin kupitia `listing_trust` rules. Mtiririko mpya wa admin **haukuundwa**. | SEHEMU | Kuonyesha kumefanyika. Mtiririko uliopo wa trust (test_listing_trust_rules, test_trust_badges_emulator 35/35) unatumika. | P3 | trust_badges 35/35 |
| R-18 | Rekodi 11-18 | Checkout / Live | Bidhaa iliyowekwa kwenye kumbukumbu (archived) haizuiwi na server wakati wa checkout au Live | **BLOCKED** | Inagusa njia ya pesa; inahitaji muundo na idhini | P1 | — |
| R-19 | Rekodi 11-18 | Domain | Domain rasmi (canonical) haijaamuliwa | **BLOCKED** | Uamuzi wa mmiliki; DNS haiguswi | P2 | — |
| R-20 | Rekodi 11-18 | Picha za kategoria | Picha 3 za canonical na 5 za huduma bado ni SVG | **BLOCKED** | Zinahitaji picha halisi kutoka kwa mmiliki | P3 | — |
| R-21 | Rekodi 11-18 | Functions (live 404) | Functions hazijadeployiwa | **BLOCKED** | Deploy imekatazwa bila idhini (tazama `docs/SOKOHAI-DEPLOY-FIREBASE-HATUA.md`) | P1 | — |
| R-22 | Rekodi 11-18 | Store | Store inauliza kwa `userId` tu (huenda inahitaji `sellerId`) | HAIJATHIBITIKA | Haikuthibitishwa kuwa kasoro kwenye data ya majaribio | P3 | — |
| R-23 | Rekodi 11-18 | test_product_foundation, dashboard integrity | Vipimo vilikuwa vinashindwa | IMEREKEBISHWA | Contracts zilizopitwa na wakati zimesasishwa (zimeelezwa kwenye maoni ya kila kipimo) | P2 | npm test 112/112 |
| R-24 | Workbook / ECOM | Taxonomy | 4 PENGO, 10 SEHEMU (airtime, gift cards, plus-size…) | REJEA / BLOCKED | Hakuna kilichoundwa (D8) | P3 | `SOKOHAI-ECOM-GAP-AUDIT.md` |
| R-25 | INV brief | Inventory | Write-off codes, cycle count, ABC, karantini, njia ya gharama, utekelezaji wa expiry | REJEA / BLOCKED | Hakuna kilichotekelezwa | P3 | `SOKOHAI-INVENTORY-GAP-AUDIT.md` |
| R-26 | Rekodi za kadi (SOKOHAI-CARD-UI-FIX) | Kadi | Inarudia R-14 | NAKALA (ya R-14) | — | — | — |
| R-27 | Rekodi za nav (MAREKEBISHO_TOP_NAV, NAV-STORE-REPAIR) | Navigation | Zilirekebishwa kwenye `main` kabla ya tawi hili. Zimejaribiwa tena (nav suites). | Tayari ipo (imethibitishwa) | — | — | test_nav_system |

## 3. Ukaguzi wa marudio (re-audit)

Hali kwenye tawi hili ikilinganishwa na baseline `origin/main`:

| Kipimo | Baseline (9ca6ad2) | Baada ya marekebisho |
|---|---|---|
| npm test (kila amri) | 104/112 (8 zinashindwa) | **112/112** |
| E2E emulator (hatua 56) | 56/56 (iliendeshwa kwenye c99c1f4) | **56/56** |
| Browser contracts `tools/*browser*.mjs` | Kadhaa zinashindwa (gstatic, contracts za zamani) | **32/36**. 4 zilizobaki: 1 tangu awali + 3 za mazingira (tazama Test Report) |
| Emulator rules suites | — | Zote zinapita, isipokuwa `test_category_filter_emulator` (inashindwa pia kwenye baseline; haimo kwenye CI) |
| Navigation + journeys R14 hadi R16 | — | **nav 56/56; journeys 18/18 runs**. `r13g_group_chat` (5/8) na `r13h_group_business` (3/13) zinashindwa **sawasawa kwenye baseline** |
| Env isolation (hosts 10) | 10/10 | **10/10** |
| Kadi za mmiliki (360/390/1440) | — | **PASS** |
| `build_html check`, `build_dist --minify --check` | OK | **OK** |

Sehemu iliyobaki haijakamilika: R-18 hadi R-22 na R-24/R-25 ni BLOCKED au REJEA. **Kwa hiyo hii si "100% kamili".**
