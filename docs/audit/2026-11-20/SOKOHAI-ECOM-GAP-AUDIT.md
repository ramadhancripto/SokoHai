# SokoHai: ukaguzi wa mapengo ya E-commerce (ECOM)

**Tarehe:** 20 Nov 2026
**Msingi:** `origin/main` 9ca6ad2, tawi `remediation/consolidated-20261120`.

## Aina ya ukaguzi

- **Ukaguzi wa kusoma tu (READ-ONLY).** Hakuna kategoria, subcategory, product type wala attribute iliyoongezwa au kubadilishwa. Category IDs (D8) na legacy mappings hazikuguswa.
- **Chanzo cha ukweli:** `shared/canonical-taxonomy-data.js` na `shared/canonical-taxonomy-core.js`.
  - 44 categories, 733 subcategories, 5,418 product types, 1,159 attributes.
  - Overlays: CAT-39, CAT-40, CAT-41.
  - Service domains 10.
- **Workbook:** `Category-Gap-Analysis.xlsx` ni **mapendekezo ya rejea**, si kasoro zilizothibitishwa. Kipengele kinahesabiwa "pengo" tu kama hakuna njia yoyote ya kanuni (category, subcategory, product type, attribute au overlay) inayokibeba.
- **Mbinu:**
  1. Kila kipengele cha ECOM kilitafutwa kwenye registry halisi kwa maneno (`ecom_scan.cjs`).
  2. Kila matokeo yalisomwa kwa mkono.
  3. Matokeo ya maneno pekee (mf. "energy drinks" kwa Energy, au "bookshelf" kwa vitabu) **hayahesabiwi** kama ushahidi.

## Jedwali la maamuzi

Hali zinazotumika:

- **IPO**: njia ya kanuni ipo na inatosha.
- **SEHEMU**: inabebwa kwa sehemu, kupitia overlay, attribute au subcategory ya kategoria nyingine.
- **PENGO**: hakuna njia ya kanuni.

| ID | Kipengele | Hali | Ushahidi (file:line) | Uamuzi | Anayeamua |
|---|---|---|---|---|---|
| ECOM-C11-S01 | Bidhaa za kidijitali / downloads | IPO | CAT-38 Digital Products & Online Services (canonical-taxonomy-data.js:45); subs Software, Desktop Software (:166, :197); `ATTR-DOWNLOADABLE`, `ATTR-SOFTWARE_TYPE` | Hakuna kazi | — |
| ECOM-C11-S02 | Airtime / data bundles / LUKU | **PENGO** | Hakuna category, sub wala type ya airtime au top-up. Matokeo ya maneno ("utility poles", "bundles") si husika. | **BLOCKED**: inahusu leseni za malipo/telco, si taxonomy tu | Mmiliki (D8 + kisheria) |
| ECOM-C11-S03 | Subscriptions / memberships | SEHEMU | CAT-38 › Digital Memberships (:197); `ATTR-SUBSCRIPTION_REQUIRED`, `ATTR-MEMBERSHIP_TYPE`. Hakuna malipo ya kujirudia (recurring billing). | Taxonomy inatosha. Recurring billing ni uamuzi wa biashara. | Mmiliki |
| ECOM-C11-S04 | Huduma + ufungaji (installation) | SEHEMU | `ATTR-INSTALLATION_REQUIRED/TYPE/METHOD`; CAT-34 › Solar Mounting & Installation (:193); huduma ziko kwenye service domains (10). Hakuna kiungo "bidhaa + ufungaji" kwenye oda. | Hakuna kazi ya taxonomy | Mmiliki (bundle ya oda) |
| ECOM-C11-S05 | Gift cards / vouchers | **PENGO** | Zipo **bidhaa za zawadi** tu: CAT-27 Creative Gifts (:186), CAT-28 (:187), CAT-29 (:188). Hakuna gift card au voucher yenye thamani ya pesa. | **BLOCKED**: ni stored value (pesa), inahitaji sera ya wallet | Mmiliki + kisheria |
| ECOM-C11-S06 | B2B / jumla / bulk | IPO | Overlay CAT-40 Wholesale/Bulk (:47); subs za bulk CAT-03/04/10/13 (:81, :87, :141, :167); bei za jumla + MOQ (E2E 26–27) | Hakuna kazi | — |
| ECOM-C11-S07 | Cross-border / duty-paid | SEHEMU | Overlay CAT-41 Import/Export (:48); CAT-14 Vehicle Trade/Import (:174). Hakuna attribute ya "duty paid" (`ATTR-DUTY_CYCLE` ni ya mashine, si husika). | Attribute ya duty-paid inapendekezwa | Mmiliki (D8) |
| ECOM-C01-S08 | Refurbished / open-box | IPO | Overlay CAT-39 Used/Second-hand/Refurbished (:46); `ATTR-REFURBISHED`, `ATTR-NEW_USED`; CAT-13 Refurbished & Used IT (:166) | Hakuna kazi | — |
| ECOM-C02-S07 | Mavazi ya jadi / utamaduni | IPO | CAT-28 Bidhaa za Jadi & Utamaduni (:35); `ATTR-TRADITIONAL`, `ATTR-CULTURAL_CONTEXT` | Hakuna kazi | — |
| ECOM-C02-S08 | Plus-size / adaptive | **PENGO** | Hakuna sub, type wala attribute (`ecom_scan`: 0) | Pendekezo: attribute ya size-range, si kategoria mpya | Mmiliki (D8) |
| ECOM-C03-S08 | Bustani / outdoor | IPO | CAT-09 › Outdoor & Garden Furniture (:125); `ATTR-INDOOR_OUTDOOR` | Hakuna kazi | — |
| ECOM-C03-S09 | Nishati / backup power | IPO | CAT-34 Nishati & Umeme (:41); Solar PV Modules (:193); CAT-13 UPS (:164); `ATTR-BATTERY` | Hakuna kazi | — |
| ECOM-C04-S07 | Vifaa vya matibabu | SEHEMU | Compliance profile ya HEALTH inadai `registrationNumber, prescriptionStatus, batchLot, expiryDate…` (canonical-taxonomy-core.js:70). Hakuna subcategory ya wazi ya "medical devices" iliyothibitishwa kwa jina (matokeo ya maneno ni IoT/GPS). | Thibitisha kwenye CAT-19 kabla ya kuongeza chochote | Mmiliki + mtaalamu wa udhibiti |
| ECOM-C04-S08 | Famasia / OTC | SEHEMU | Dawa za mifugo (PT-CAT-04-…VETERINARY_MEDICINES) na dawa za mimea (CAT-02 :70) zipo. Dawa za binadamu zinadhibitiwa (TMDA); hazitekelezwi bila sera. | **BLOCKED**: kisheria | Mmiliki + kisheria |
| ECOM-C05-S07 | Frozen / chilled | IPO | CAT-05 › Frozen Fish & Seafood (:93); `ATTR-FROZEN_STATE`, `ATTR-FRESH_FROZEN` | Hakuna kazi | — |
| ECOM-C05-S08 | Halal / organic / lishe | SEHEMU | `ATTR-ORGANIC` (kilimo, :74). Hakuna `halal` wala `gluten-free`. | Pendekezo: attributes za lishe kwenye CAT-01 | Mmiliki (D8) |
| ECOM-C05-S09 | Wazalishaji wa ndani / artisan | IPO | CAT-01 Local & Traditional Foods (:66); CAT-07 Handmade/Local Made (:113); `ATTR-HANDMADE` | Hakuna kazi | — |
| ECOM-C06-S05 | Vifaa vya shule / uniform | IPO | CAT-32 Ofisi, Shule & Stationery (:39); CAT-07 Uniform (:109); PT-CAT-07-DEFAULT_SCHOOL_UNIFORM | Hakuna kazi | — |
| ECOM-C06-S06 | Maternity | IPO | CAT-30 › Maternity Wear / Support / Accessories (:189) | Hakuna kazi | — |
| ECOM-C07-S06 | Michezo ya majini | SEHEMU | CAT-07 › Swimwear (:111) tu; hakuna vifaa vya michezo ya majini | Pendekezo la rejea | Mmiliki (D8) |
| ECOM-C07-S07 | Lishe ya michezo | **PENGO** | Matokeo yaliyopatikana ni virutubisho vya wanyama/mifugo, si husika | Pendekezo la rejea | Mmiliki (D8) |
| ECOM-C08-S07 | Vifaa vya ujenzi | IPO | CAT-10 Ujenzi & Hardware (:17); Cement (:133), Steel (:134), Timber (:135) | Hakuna kazi | — |
| ECOM-C08-S08 | Usalama / viwanda | IPO | CAT-33 Viwanda & Mashine (:40); CAT-36 Usalama (:43); CAT-10 Safety & PPE (:139) | Hakuna kazi | — |
| ECOM-C09-S02 | Vitabu vya Kiswahili | SEHEMU | CAT-30 Baby Books (:189); CAT-38 e-books. Hakuna sub ya "vitabu" vya kuchapishwa kwa lugha. | Pendekezo: attribute ya lugha | Mmiliki (D8) |
| ECOM-C09-S06 | Ala za muziki | SEHEMU | CAT-28 › Traditional Musical Instruments (:187); `ATTR-INSTRUMENT_TYPE`. Ala za kisasa (gitaa, kinanda) hazijathibitishwa. | Pendekezo la rejea | Mmiliki (D8) |
| ECOM-C10-S03 | Chakula cha kuku / mifugo | IPO | CAT-04 Mifugo (:85, :87); `ATTR-FEED_TYPE`; PT-CAT-04-LIVESTOCK_FEED_* | Hakuna kazi | — |
| ECOM-C12-S01 | Haijapangwa / Nyingine | IPO | CAT-44 OTHER / HAIPO HAPA [FALLBACK] (:51); `CLASSIFICATION_STATES` NEEDS_REVIEW, UNCLASSIFIED | Hakuna kazi | — |
| ECOM-C12-S05 | Zilizozuiliwa / umri / udhibiti | SEHEMU | CAT-03 › Tumbaku (:79) ipo. Hakuna uthibitisho wa umri (age gate). Compliance profiles zipo (identity, commerce, food, digital…). | **BLOCKED**: uthibitisho wa umri ni sera + kisheria | Mmiliki + kisheria |

## Muhtasari

| Hali | Idadi |
|---|---|
| IPO | 14 |
| SEHEMU | 10 |
| PENGO | 4 (airtime, gift cards, plus-size, lishe ya michezo) |
| BLOCKED (sera, sheria au pesa) | 4 (C11-S02, C11-S05, C04-S08, C12-S05) |

**Hakuna kitu kilichotekelezwa kwenye taxonomy.** Kwa mujibu wa brief na waraka wa remediation, kuongeza kategoria, subcategory au attribute kunahitaji idhini ya mmiliki (D8). Mapendekezo yaliyo hapo juu yanapendekeza **attributes** badala ya kategoria mpya, ili kuepuka taxonomy ya pili.
