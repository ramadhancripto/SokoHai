# MUANZILISHI WA CATEGORY — UKAGUZI WA COVERAGE (743 majani)

Jibu fupi: **mechanism inafanya kazi kwa kila category na subcategory, lakini DATA ipo kwa
8.3% tu ya majani.** Hakuna commit; HEAD bado `3c36db8`.

---

## 1. Matokeo ya jumla

| | Idadi | % |
|---|---|---|
| Majani yote (product leaves) | 743 | 100% |
| **Yanayoseed (≥1 pendekezo)** | **62** | **8.3%** |
| Yanayobaki tupu | 681 | 91.7% |
| Categories zenye product leaves | 30 | |
| **Categories zenye seeding yoyote** | **5** | |
| Categories zenye seeding SIFURI | 25 | |

## 2. Kwa kila category

| CAT | Majani | Seeded | Tupu | Wastani rows | Jina |
|---|---|---|---|---|---|
| CAT-01 | 17 | **6** | 11 | 9.8 | Chakula & Vinywaji |
| CAT-02 | 14 | **3** | 11 | 23.7 | Kilimo & Inputs za Kilimo |
| CAT-03 | 22 | 0 | 22 | — | Mazao & Biashara ya Kilimo |
| CAT-04 | 17 | **16** | 1 | 15.8 | Mifugo |
| CAT-05 | 18 | **17** | 1 | 15.2 | Uvuvi & Baharini |
| CAT-06 | 20 | **20** | 0 | 14.2 | Misitu, Mbao & Bidhaa Asilia |
| CAT-07 | 22 | 0 | 22 | — | Nguo & Mavazi |
| CAT-08 | 21 | 0 | 21 | — | Urembo & Personal Care |
| CAT-09 | 22 | 0 | 22 | — | Nyumba & Samani |
| CAT-10 | 28 | 0 | 28 | — | Ujenzi & Hardware |
| CAT-11 | 19 | 0 | 19 | — | Electronics & Appliances |
| CAT-12 | 20 | 0 | 20 | — | Simu & Mawasiliano |
| CAT-13 | 31 | 0 | 31 | — | Computers & IT |
| CAT-14 | 22 | 0 | 22 | — | Magari & Vyombo |
| CAT-15 | 33 | 0 | 33 | — | Vipuri & Accessories |
| CAT-19 | 17 | 0 | 17 | — | Afya & Bidhaa za Afya |
| CAT-27 | 20 | 0 | 20 | — | Sanaa & Ubunifu |
| CAT-28 | 22 | 0 | 22 | — | Bidhaa za Jadi & Utamaduni |
| CAT-29 | 28 | 0 | 28 | — | Harusi & Sherehe |
| CAT-30 | 27 | 0 | 27 | — | Mama, Mtoto & Familia |
| CAT-31 | 32 | 0 | 32 | — | Wanyama & Pets |
| CAT-32 | 29 | 0 | 29 | — | Ofisi, Shule & Stationery |
| CAT-33 | 31 | 0 | 31 | — | Viwanda & Mashine |
| CAT-34 | 37 | 0 | 37 | — | Nishati & Umeme |
| CAT-35 | 34 | 0 | 34 | — | Maji, Usafi & Mazingira |
| CAT-36 | 27 | 0 | 27 | — | Usalama |
| CAT-37 | 33 | 0 | 33 | — | Marketing, Media & Branding |
| CAT-38 | 29 | 0 | 29 | — | Digital Products & Online Services |
| CAT-42 | 30 | 0 | 30 | — | Ardhi & Property |
| CAT-43 | 21 | 0 | 21 | — | Madini, Mawe & Resources |

## 3. SABABU kwa kila jani — si bug ya seeding

| Sababu | Majani |
|---|---|
| **Hakuna exact definition — default-only leaf** → quarantine ya makusudi | **656** |
| **Ina exact definition inayotumika** → inaseed | **62** |
| **PARTIAL, haijathibitishwa** → quarantine ya makusudi | **25** |

Reconciliation: majani 87 yana definition (59 exact + 28 PARTIAL). Kati ya hizo
**62 zinaseed** (59 exact + amendments 3 za chakula zenye `fieldEvidenceVerified`),
na **25 PARTIAL** zimewekwa karantini. Hii inalingana kabisa na hali rasmi:
**59 exact / 28 PARTIAL / 656 default-only**.

**Muhimu:** utupu huu **si kasoro ya muanzilishi**. Ni sheria ya ushahidi iliyoko kwenye
bridge: kwa njia ya canonical isiyo na review, kama definition haipo au ni PARTIAL
isiyothibitishwa, schema inafutwa makusudi —
*"Hierarchy coverage is not semantic evidence. Category defaults must never become leaf
recommendations on newly exposed canonical paths."*
`test_taxonomy_mission_contract` ina-assert tabia hii hasa. Kuijaza bila ushahidi
ndicho ulichokataza: **si ruhusa kubadilisha 59/28/656.**

## 4. Uthibitisho kwenye browser — mechanism ni ya kila njia

Chromium halisi, `tools/preview_builder_seeding.mjs --sweep`:

| Njia | Rows zilizochorwa |
|---|---|
| CAT-01 / Nyama | 4 |
| CAT-02 / Mbegu | 26 |
| CAT-04 / Mbuzi | 19 |
| CAT-05 / Samaki wa Maji Safi | 22 |
| CAT-06 / Mbao / Sawn Timber | 20 |
| CAT-07 / Viatu | 0 — ujumbe wa "hakuna pendekezo" |
| CAT-12 / Smartphones | 0 — ujumbe wa "hakuna pendekezo" |
| CAT-13 / Laptops | 0 — ujumbe wa "hakuna pendekezo" |
| CAT-33 / Industrial Machinery | 0 — ujumbe wa "hakuna pendekezo" |
| CAT-43 / Gemstones | 0 — ujumbe wa "hakuna pendekezo" |

Hitimisho: **code ni generic na inafanya kazi kwa category yoyote**. Ikiwa jani lina
schema, inaseed; lisipokuwa nayo, inashuka kwa unadhifu na seller anaendelea na
custom. Hakuna njia iliyovunjika, hakuna page error.

## 5. Kwa nini Viatu / Smartphones ni tupu

Schema zao (Size/Color; RAM/Storage/Color) ziko kwenye **reviewed overlays** ambazo
hazijawahi ku-commit:
`shared/product-schema-pilots.mjs`, `shared/product-schema-refinements.mjs`.
`schemaOverlayStatus = {pilots:'MISSING', refinements:'MISSING', degraded:true}`.
Zikirudi, majani yaliyopitiwa yataanza kuseed **bila kubadilisha code hii** — muanzilishi
tayari unasoma `bridge.options / attributes / features / filters / additionalInfo /
suggestedUnits`.

## 6. Hitimisho la ukaguzi

- Je imefanya kwa **kila category/subcategory**? **Mechanism — ndiyo, 100%.**
- Je ina **maudhui** kwa kila moja? **Hapana — 62/743 (8.3%), categories 5 kati ya 30.**
- Je hilo ni kasoro ya badiliko nililofanya? **Hapana.** Ni quarantine ya ushahidi
  (656 default-only + 25 PARTIAL) pamoja na overlays mbili zinazokosekana.
- Kinachohitajika ili coverage ipande: (a) `product-schema-pilots.mjs` +
  `product-schema-refinements.mjs` kutoka source halisi, kisha (b) **quality gate ya
  majani 743** — kazi ambayo bado hujaiidhinisha na sijaianza.

Hali haijabadilika: 740 `RETRIEVED_NOT_ADJUDICATED` + 3 `PARTIAL_SEMANTIC_REVIEW`,
**NOT COMPLETED**, authority hashes 0 drift, HTML byte-exact, tests 14/14,
Discover 16/2.
