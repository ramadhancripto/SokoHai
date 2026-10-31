# taxonomy-draft/ — SokoHai Taxonomy v1 (DRAFT)

**Hali:** RASIMU kwa ukaguzi. Haitumiwi na runtime, haijaunganishwa na `npm test`, haibadilishi
`shared/`, `js/`, `firestore.rules` wala data ya Firebase.

## Faili

| Faili | Kazi |
|---|---|
| `src/research.mjs` | Vyanzo vya utafiti (URL, tarehe, kilichotumika), Sekta (level 0), overlays, regulatory flags |
| `src/additions.mjs` | Categories mpya CAT-45..49, subcategories mpya, sub-subcategory groupings, ramani ya "default" types |
| `src/services.mjs` | Subcategories + aina za huduma kwa CAT-16..26 na CAT-19 (CPC 2.1) |
| `src/types-priority.mjs` | Aina za bidhaa (PROPOSED) kwa leaves zilizopo zisizo na aina |
| `src/legacy.mjs` | Ramani ya `skh.advancedCategories` (25 / 120) |
| `src/model.mjs` | Units, attribute templates, variant families |
| `src/i18n-existing.mjs` | Majina sw/en ya categories 44 + leaves 743 (rasimu) |
| `build_taxonomy_draft.mjs` | Generator → `out/` (deterministic; `--check` hugundua output iliyopitwa na wakati) |
| `test_taxonomy_draft.mjs` | Validator (39 checks) |
| `attribute_audit.mjs` | Attribute reuse/urithi, variant families, duplicates, coverage ya categories zote na biashara za aina zote → `out/attribute-audit.draft.{json,md}`, `out/business-coverage.draft.json` (`--check`) |
| `test_attribute_audit.mjs` | Checks 14 za audit hiyo |

## Kuendesha

```bash
node taxonomy-draft/build_taxonomy_draft.mjs        # andika out/
node taxonomy-draft/build_taxonomy_draft.mjs --check
node taxonomy-draft/test_taxonomy_draft.mjs
node taxonomy-draft/attribute_audit.mjs          # baada ya build ya draft
node taxonomy-draft/test_attribute_audit.mjs
```

## Output (`out/`)

- `sokohai-taxonomy-v1.draft.json` — dataset kamili (nodes, sources, units, variants, attributes)
- `hierarchy.draft.md` — mti wote unaosomeka
- `types.draft.csv` — aina zote za bidhaa/huduma
- `legacy-mapping.draft.json|csv` — ramani ya legacy → mpya (advancedCategories + serviceDataMap)
- `coverage-matrix.draft.csv` — coverage kwa kila category
- `reports.draft.json` — counts, duplicates/overlaps, missing, generator issues

## Sheria za usalama

Hakuna migration, deploy, commit wala push bila idhini ya mmiliki. Hakuna ID iliyopo
(CAT-xx, PT-*) inayobadilishwa; hakuna category/leaf/type inayofutwa.

## Interactive preview (`preview/`)

- Fungua `preview/taxonomy-preview.html` moja kwa moja kwenye browser (double-click). Haihitaji server, Firebase wala mtandao.
- Sehemu: Seller Builder (hatua dynamic + biashara 11 za mfano), Stock & Reservation (simulator), Taxonomy Explorer, Taarifa za Bidhaa, Other/Mapendekezo, Admin, Maamuzi & Awamu.
- Vyanzo: `preview/src/{core,builder,stock,views,flow,main}.js` + `body.html` + `style.css`; build inaviunganisha kuwa ukurasa mmoja.
- Kila unachofanya kinakaa kwenye kumbukumbu ya ukurasa tu; kinapotea ukipakia upya.
- Jenga upya baada ya kubadilisha draft au `preview/src/*`: `node taxonomy-draft/preview/build_preview.mjs`
- Tests (Playwright, desktop + 390px): `node taxonomy-draft/preview/test_preview.cjs`
- Haiingii kwenye `dist/` (build_dist ina allow-list), kwa hiyo haiwezi kufika production kwa bahati mbaya.
