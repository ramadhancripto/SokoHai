# MAREKEBISHO YA SOKOHAI — FILES ZILIZOBADILIKA PEKEE

Msingi: commit **`0ac2c17`** (ndipo system yako ilipo).
Kifurushi hiki kina **files 19 pekee** zilizobadilika. Kila file iko kwenye njia yake
halisi — nakili juu ya project yako ukihifadhi muundo wa folda.

> Muhimu: commit `3c36db8` **haikuwahi kwenda GitHub** (push ilishindwa, hakuna
> credentials). Kwa hiyo kifurushi hiki kinajumuisha marekebisho ya commit hiyo
> **pamoja na** yale ya baadaye.

---

## 1. FILES ZA CODE — lazima

| File | Kilichobadilika |
|---|---|
| `js/app/05-forms.js` | `populateFormCategories()` sasa inatumia canonical taxonomy (`getSellerCategoryOptions`) badala ya kusoma `skh.advancedCategories` moja kwa moja. Canonical mbele, legacy kwenye kundi lake. Pia guard kwenye `generateSellerFilters()` ili category ya `CAT-xx` isilipuke. |
| `js/app/08-app-state.js` | `updateFormSubcats()` haitoi tena bail kwa category isiyo ya legacy; inatumia `getSellerSubcategories()` — canonical leaves mbele. |
| `js/app/06-product-builder.js` | **MUANZILISHI**: `seedRows()` + `seedBlock()` — mapendekezo ya category yanajaa ndani ya kila section (Attributes, Filters, Features, Additional, Selectors) yakiwa draft yenye **Use / Hariri / Skip**. `＋ Add ...` inabaki baada yake. Pia null-guards kwenye `bind()` na edit-mode hosts. |
| `shared/product-taxonomy-bridge.mjs` | Precedence: **canonical → legacy compatibility → reviewed overlay**. Legacy haiwezi tena kufunika definition ya canonical. Overlays mbili zinazokosekana sasa zinapakiwa kwa hiari (`schemaOverlayStatus`) badala ya kuvunja import. |
| `css/38-product-builder-seed.css` | **MPYA** — styling ya seed block pekee. |
| `html/00-head.html` | Imeongeza `<link>` ya CSS mpya hapo juu. |
| `index.html` | Imejengwa upya. **Usiihariri kwa mkono** — au iache na ujenge mwenyewe (ona §3). |

## 2. FILES ZA TOOLS / TESTS

| File | Kilichobadilika |
|---|---|
| `tools/build_taxonomy_mission_audit.mjs` | Imeondoa path ngumu ya `/home/user/taxonomy-final/...`. Sasa: `--baseline=<path>` → env `SOKOHAI_AUDIT_BASELINE` → default ya repo. Inafanya kazi Windows na Linux. Pia ujumbe wazi wa "REQUIRED LOCAL INPUT". |
| `tools/test_product_builder_ui_contract.mjs` | Imerekebisha assertions 5 zilizokuwa stale (`spbBuilder`→`productBuilder`, `generateVariants`→`generateCombinations`, n.k.). |
| `tools/test_product_taxonomy_bridge.mjs` | `Mifugo/Livestock Services` ni SERVICE context → inatarajia `CONTEXT_ONLY`. Imeongeza assertion kwamba canonical haifunikwi na legacy. |
| `tools/test_taxonomy_mission_contract.mjs` | Imegawanywa: committed-source contract inakimbia daima; queue cross-check inaonyesha `SKIPPED` kama `execution-queue.json` haipo. |
| `package.json` | Imeongeza `playwright` kwenye devDependencies (tests mbili zilizokuwepo zinaihitaji lakini haikuwa imeorodheshwa). |

## 3. JINSI YA KU-APPLY

```bash
# 1. Nakili files zote juu ya project yako (hifadhi muundo wa folda)

# 2. Jenga index.html upya kutoka html/ (usiihariri kwa mkono)
python3 tools/build_html.py build
python3 tools/build_html.py check      # lazima: CHECK OK

# 3. Kimbiza tests
node tools/test_product_taxonomy_bridge.mjs
node tools/test_taxonomy_mission_contract.mjs
node tools/test_product_builder_ui_contract.mjs
node tools/test_product_upload_data_contract.mjs
node tools/test_product_upload_legacy_compatibility.mjs
node tools/test_product_upload_edit_roundtrip.mjs
node tools/test_product_upload_image_edit_contract.mjs
node tools/test_pos_level_core.mjs
node tools/build_product_schema_bridge.mjs --check
```

Matokeo yaliyothibitishwa hapa: **14 passed, 0 failed**, HTML byte-exact,
projection PASS, authority hashes **0 drift**.

## 4. BLOCKERS — HAZIJATATULIWA, ZINAHITAJI FILES KUTOKA KWAKO

Product Builder **haitapakia kwenye browser** mpaka hizi zije:

**4.1 `shared/product-upload-data-core.mjs` haina exports nne:**
`imageList`, `generateCombinations`, `combinationKey`, `suggestCustom`.
Zimeitwa na `06-product-builder.js` lakini **hazipo popote kwenye repo wala history**
(nilikagua objects 1606 — sifuri). Sikuziandika kwa sababu `generateCombinations`
inasimamia `variantId`/SKU/`inventoryKey` — ni POS-critical.

**4.2 Modules mbili hazijawahi ku-commit:**
`shared/product-schema-pilots.mjs`, `shared/product-schema-refinements.mjs`.
Bila hizi, majani yaliyopitiwa (Viatu, Smartphones n.k.) hayana schema.

**4.3 Markup ids tano hazipo:**
`spbAddGeneralImage`, `spbEditMount`, `spbEditFields`, `spbEditDraft`, `spbEditImages`.
Nimeweka guards ili zisiue builder, lakini **edit-mode mounting bado haipo**.

**4.4 `tools/fixtures/taxonomy-browser-cloud.mjs`** haipo — preview server ya 4174 haifanyi kazi.

## 5. COVERAGE YA MUANZILISHI — jua ukweli

Mapendekezo yanajaa kwa **majani 62 kati ya 743 (8.3%)**, categories **5 kati ya 30**:
Chakula (6/17), Kilimo (3/14), Mifugo (16/17), Uvuvi (17/18), Misitu (20/20).

Sababu ya 681 zilizobaki kuwa tupu:
- **656** hazina exact definition (default-only) → karantini ya ushahidi, **kwa makusudi**
- **25** ni PARTIAL zisizothibitishwa → karantini, **kwa makusudi**

Hii **si hitilafu ya code** — ni sheria iliyopo tayari kwenye bridge, na
`test_taxonomy_mission_contract` inaithibitisha. Kuijaza bila ushahidi
kungekuwa ni kubadilisha **59 exact / 28 PARTIAL / 656 default-only**.

## 6. HALI YA TAXONOMY — HAIJABADILIKA

- 59 exact / 28 PARTIAL / 656 default-only — **kama ilivyo**
- 740 `RETRIEVED_NOT_ADJUDICATED` + 3 `PARTIAL_SEMANTIC_REVIEW` — **kama ilivyo**
- `FINAL-COMPLETION-REPORT.md`: **NOT COMPLETED** — **kama ilivyo**
- Discover: 16 passed, 2 failed — **haijaguswa**
- POS, uploader, inventory authority — **hazijaguswa**

## 7. YASIYOMO KWENYE KIFURUSHI

Preview harnesses (`tools/preview_*.mjs`, `tools/verify_*.mjs`) **sijaziweka** —
ni za kuonyesha tu, si sehemu ya mfumo. Zina *test doubles* za zile functions nne
zinazokosekana; **usizipeleke production**. Niambie ukizitaka.
