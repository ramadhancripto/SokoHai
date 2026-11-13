# D8 — Kategoria 12 za zamani: pendekezo (HALIJATEKELEZWA)

**Hali halisi niliyoikuta:** ramani ya kategoria hizi 12 **tayari inatumika kwenye code** tangu commit `0767ee6`
(2026-11-12, "Preserve and integrate SokoHai local development work", faili `shared/taxonomy-legacy-mapping.js`,
alama `[F-F1 2026-11-10] Reviewed`). Jaribio la zamani `tools/test_category_filter_emulator.mjs` (R4) bado linadai
kategoria hizi **zisiunganishwe** — ndiyo sababu linashindwa 3/8. Sijabadilisha chochote: ramani ya sasa inabaki
mpaka uamue, kwa sababu kuiondoa kungeondoa bidhaa za zamani kwenye vichujio vya kategoria.

**Njia inayopendekezwa:** alias (ramani ya kusoma) pekee. `products.category` iliyohifadhiwa **haiandikwi upya**;
kichujio kinatafuta lebo ya zamani na CAT-xx kwa pamoja (`categoryFilterValues`). Kurudisha nyuma = kuondoa mstari mmoja.

**Idadi ya bidhaa:** siwezi kusoma production kutoka hapa. Endesha (kusoma tu, kwa ruhusa zako):
`node tools/legacy_category_impact.mjs --allow-production-read --project sokonet-3b847`
— inatoa idadi kwa kila lebo bila kubadilisha kitu.

| # | Lebo ya zamani | Ramani ya sasa (inatumika) | Pendekezo | Mgongano / hatari |
|---|---|---|---|---|
| 1 | Afya na Pharmacy (Health) | CAT-19 Afya & Bidhaa za Afya | **Baki CAT-19** | CAT-19 ni SERVICE_DOMAIN; bidhaa za dawa zinaonekana pamoja na huduma za afya. Ndogo. |
| 2 | Vito na Saa (Luxury) | CAT-27 Sanaa & Ubunifu | **CAT-07 Nguo & Mavazi** (vito/saa = mapambo ya mavazi) au baki CAT-27 | Saa na vito si sanaa; mnunuzi anayetafuta saa hatafuti "Sanaa". |
| 3 | Vitabu na Elimu (Education) | CAT-32 Ofisi, Shule & Stationery | **Baki CAT-32** | Hakuna (vitabu = stationery). Kozi/mafunzo ni CAT-20, si bidhaa. |
| 4 | Michezo na Mazoezi (Sports) | CAT-26 Burudani, Michezo & Events | **Baki CAT-26** (au CAT-44 mpaka kuwe na kategoria ya vifaa vya michezo) | CAT-26 ni SERVICE_DOMAIN; vifaa vya michezo ni bidhaa. Wastani. |
| 5 | Vichezeo na Michezo (Toys) | CAT-26 | **CAT-30 Mama, Mtoto & Familia** | Vichezeo vya watoto vinafaa CAT-30 kuliko "Events". |
| 6 | Sauti na Muziki (Music) | CAT-26 | **CAT-11 Electronics & Appliances** kwa vifaa (spika, ala za umeme); CAT-26 kwa huduma | Lebo moja inachanganya vifaa na huduma. Wastani. |
| 7 | Sanaa na Ubunifu (Arts) | CAT-27 Sanaa & Ubunifu | **Baki CAT-27** | Hakuna — jina ni lile lile. |
| 8 | Dini na Utamaduni (Religion) | CAT-28 Bidhaa za Jadi & Utamaduni | **Baki CAT-28** | Ndogo. |
| 9 | Zawadi na Sherehe (Gifts) | CAT-29 Harusi & Sherehe | **Baki CAT-29** | Zawadi za kawaida si za harusi pekee. Ndogo. |
| 10 | Vifungashio na Printi (Packaging) | CAT-37 Marketing, Media & Branding | **Baki CAT-37** (printi/branding) — vifungashio vya viwandani vinaweza kuwa CAT-33 | Ndogo–wastani. |
| 11 | Vitu vya Kale na Thamani (Antiques) | CAT-28 | **Baki CAT-28** | Ndogo. |
| 12 | Mchanganyiko (General Merchandise) | CAT-44 OTHER / HAIPO HAPA | **Baki CAT-44** | Hakuna — ni fallback. |

**Maamuzi unayohitaji kutoa (moja kwa kila mstari):** "Baki" (ramani ya sasa), "Pendekezo", au "Isiunganishwe"
(irudi kwenye tabia ya R4: lebo inajionyesha yenyewe tu). Baada ya uamuzi nitabadilisha `shared/taxonomy-legacy-mapping.js`
pekee, kusasisha jaribio la category filter liendane na uamuzi wako, na kuendesha impact tool + E2E.
