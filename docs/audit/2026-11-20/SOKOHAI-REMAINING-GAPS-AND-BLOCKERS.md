# SokoHai: mapengo yaliyobaki na vizuizi (blockers)

**Tarehe:** 20 Nov 2026
**Tawi:** `remediation/consolidated-20261120`

Vipengele hivi **havijarekebishwa**. Hakuna kilichokisiwa. Kila kimoja kinahitaji uamuzi au idhini yako.

## A. BLOCKED (vinahitaji uamuzi au idhini)

| ID | Kipengele | Kwa nini kimezuiwa | Unachohitaji kuamua | Hatari kikibaki |
|---|---|---|---|---|
| R-18 | Server haizuii bidhaa iliyowekwa kwenye kumbukumbu (archived) wakati wa checkout au Live | Kinagusa njia ya pesa (oda, malipo, escrow). Kinahitaji mabadiliko ya functions, rules na vipimo vya pesa. | Ruhusa ya kubuni `archived` → kukataa oda upande wa server, pamoja na vipimo vya emulator | Mnunuzi anaweza kuagiza bidhaa iliyoondolewa, ikiwa ana link ya zamani |
| R-19 | Domain rasmi (sokohai.com au netlify) | Uamuzi wa biashara; DNS haiguswi | Domain ipi iwe rasmi (canonical) | SEO na links mbili |
| R-20 | Picha 8 za kategoria bado ni SVG | Zinahitaji picha halisi | Kutuma picha (au idhini ya picha za bure zenye leseni) | Muonekano tu |
| R-21 | Cloud Functions zinarudisha 404 live | Deploy imekatazwa bila idhini | Kufuata `docs/SOKOHAI-DEPLOY-FIREBASE-HATUA.md` (staging kwanza) | Huduma za server hazifanyi kazi live |
| ECOM-C11-S02 | Airtime / data / LUKU | Leseni za telco na malipo | Kama SokoHai itauza airtime | — |
| ECOM-C11-S05 | Gift cards / vouchers | Ni stored value (pesa) | Sera ya wallet na kisheria | — |
| ECOM-C04-S08 | Dawa za binadamu (OTC) | Udhibiti wa TMDA | Sera ya famasia | Kisheria |
| ECOM-C12-S05 | Uthibitisho wa umri (tumbaku, n.k.) | Sera na sheria | Age gate ndiyo au hapana | Kisheria |
| INV | Utekelezaji wa expiry / FEFO | Unagusa njia ya mauzo | Muundo wa kuzuia kuuza bidhaa iliyopita muda | Bidhaa iliyopita muda kuuzwa |
| INV | Njia ya gharama (FIFO / weighted average) | Uamuzi wa uhasibu | Njia ipi itumike | Faida isiyo sahihi kwenye ripoti |

## B. Mapendekezo ya taxonomy (REJEA, yanahitaji idhini ya D8)

Mapendekezo haya yanaongeza **attributes** tu, si kategoria mpya, ili kusiwe na taxonomy ya pili:

- size-range (plus-size / adaptive);
- halal / gluten-free;
- duty-paid;
- lugha ya kitabu;
- vifaa vya michezo ya majini;
- lishe ya michezo;
- ala za muziki za kisasa.

Maelezo kamili yako kwenye `SOKOHAI-ECOM-GAP-AUDIT.md`.

## C. Mapendekezo ya inventory (REJEA)

- write-off reason codes;
- cycle count / stocktake;
- ripoti ya ABC/XYZ;
- hali ya karantini / QC hold;
- arifa ya server ya stock ndogo;
- bin-level stock.

Maelezo kamili yako kwenye `SOKOHAI-INVENTORY-GAP-AUDIT.md`.

## D. HAIJATHIBITIKA

- **R-22: Store inauliza kwa `userId` tu.** Haikuonekana kasoro kwenye data ya majaribio. Inahitaji sampuli ya data halisi isiyo na `userId` (bila kugusa production).

## E. Kasoro za vipimo zilizokuwepo kabla (si za tawi hili)

| Kipimo | Hali | Ushahidi |
|---|---|---|
| `test_r13g_group_chat.cjs` (5/8) na `test_r13h_group_business.cjs` (3/13) | Zinashindwa sawasawa kwenye baseline 9ca6ad2. Tabs za group (`#gsgTabs`) zimefichwa hadi paneli ya info ifunguliwe (muundo uliokuja na merge). | Uamuzi: je, tabs zionekane moja kwa moja (UX), au vipimo visasishwe? Haikuguswa hapa. |
| `test_product_compare_browser` hatua 12 ("Transactions (POS)" row) | Inashindwa pia kwenye baseline `origin/main` (port 5057) | Ililinganishwa na baseline |
| `test_category_filter_emulator` (3 zinashindwa) | Inashindwa pia kwenye baseline. Haimo kwenye orodha ya CI. Inatarajia "Afya" isipangwe, lakini mapping ya legacy sasa inaipeleka CAT-19. | Mapping ya legacy haikubadilishwa (D8). Inahitaji uamuzi kati ya kusasisha kipimo au mapping. |
| `test_my_products_kpi_browser` hatua 14–16 | Matokeo yanabadilika kwa muda (flaky). Yalibadilishana kati ya toleo la awali na la sasa. | Haisababishwi na tawi hili |
| `test_seller_photo_editor_browser` | Mazingira: inakosa `tools/fixtures/editor-product-edge-test.png` | Faili halipo kwenye repo |
| `test_taxonomy_all_leaf_browser` | Mazingira: inakosa `docs/taxonomy/mission/execution-queue.json`, ambalo hutengenezwa na zana nyingine | — |
| `test_terminology_stage_b_browser` | Mazingira: inatumia njia ngumu `/home/user/SokoHai` | — |
