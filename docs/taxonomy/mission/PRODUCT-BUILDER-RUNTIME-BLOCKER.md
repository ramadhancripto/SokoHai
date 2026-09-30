# PRODUCT BUILDER RUNTIME BLOCKER — INVESTIGATION RESULT

2026-09-30. HEAD `3c36db8` (unchanged). **NO COMMIT, NO PUSH this round.**
No source file was modified. Nothing was re-authored.

## VERDICT

**No implementation of the four symbols exists anywhere — not in the current source, not
in any commit, branch, tag or loose object, not in the old project copies, not in tests
or fixtures. They were never written into this repository.**

Per the instruction's own decision tree (§7, final branch): **STOP and report genuine
blocker. Do not invent protected logic.** That is what was done.

---

## 1. Exact root cause of the four missing exports

`js/app/06-product-builder.js:5` imports nine symbols from
`shared/product-upload-data-core.mjs`. That module exports twelve symbols, and **four of
the nine imports are not among them**:

| Imported by builder | Exported by data-core |
|---|---|
| `normalizeAttributes` | yes |
| `normalizeOptions` | yes |
| `normalizeFeatures` | yes |
| `normalizeAdditionalInfo` | yes |
| `normalizeFilters` | yes |
| **`imageList`** | **NO** |
| **`generateCombinations`** | **NO** |
| **`combinationKey`** | **NO** |
| **`suggestCustom`** | **NO** |

ES modules resolve named imports eagerly, so the **whole builder module fails to
evaluate** on the first unresolved name. Real Chromium:

```
/js/app/06-product-builder.js => FAILED: The requested module
'../../shared/product-upload-data-core.mjs' does not provide an export named 'combinationKey'
```

Root cause classification: **an incomplete commit, not a wrong import path and not a
rename.** `0ac2c17` committed a builder written against a version of
`product-upload-data-core.mjs` that contains four more functions than the version that
was actually committed in `6056472`. The consumer landed; the provider half did not.

No Node test caught it because **no test imports the builder** —
`test_product_builder_ui_contract.mjs` only reads it as text and asserts substrings.

## 2. Where authoritative implementations were searched (exhaustive)

| Search | Method | Result |
|---|---|---|
| Content history, all refs | `git log --all -S<sym>` ×4 | Only `0ac2c17` + `3c36db8` — i.e. only the *import line* and my own docs |
| Every blob in the object DB | scanned **1606 objects**, `git cat-file -p` + definition regex (`function X`, `X = (`, `X = function`) | **0 definition blobs** |
| Every commit, all refs | `git grep <sym> $(git rev-list --all)` | consumers only |
| All branches | `main`, `origin/main`, `origin/restore-sokohai-16d8c3e`, `origin/security/phase-1-firestore-hardening` | the two side branches do not even contain `shared/product-upload-data-core.mjs` or the builder |
| Tags / reflog | `git tag`, `git reflog` | none / 2 entries, nothing relevant |
| File history | `git log --all -- shared/product-upload-data-core.mjs` | exactly **one** version, created in `6056472`; its `export {...}` line never listed the four |
| Whole working tree incl. `_originals/`, `assets/`, `fonts/`, `_old_fonts_project/`, `vendor/`, `scripts/`, `reviews/`, `functions/`, `docs/` | recursive grep | no definition anywhere |
| Tests & fixtures | all of `tools/` | no test imports or exercises any of the four |

## 3. Were the imports wrong? (§7 analysis — checked before touching anything)

**No — this cannot be fixed by correcting an import path.** Findings per symbol:

### `combinationKey` — a semantically equivalent authority EXISTS, but is not usable as-is
`shared/pos-product-identity-core.js` contains `optionSignature(options)`:
normalises each name/value with `keyText()` (lowercase, NFKD, non-alphanumerics → `_`),
**sorts entries by name**, rejects duplicates, and joins as `name=value|name=value`.
That is exactly a canonical combination key, and it is the POS authority.

Why the import path cannot simply be repointed:
- that file is **CommonJS** (`'use strict'; const crypto = require('crypto')`). The
  builder is a browser ES module; importing it in the browser fails on `require`.
- it is a **protected POS identity authority**. Re-exporting it into the browser bundle
  is an architecture decision, not a mechanical import fix.

### `generateCombinations` — no equivalent anywhere, and a **semantic conflict** exists
The nearest relative is `buildVariantCombination(productId, options, input)` in the same
POS core, but it builds **one** combination and does **not** do the cartesian product,
does not merge/preserve pre-existing rows, and takes no id factory.

More importantly the two identity models are **incompatible as written**:

| | POS identity core | Builder call site |
|---|---|---|
| variantId | `deterministicVariantId(productId, signature)` = `'var_' + sha256(productId\|signature).slice(0,24)`; a supplied non-matching id throws `VARIANT_ID_NOT_CANONICAL` | `generateCombinations(..., () => uid(), ...)` — a **random** id factory, and in create mode **no productId exists yet** |
| inventoryKey | `productId:variantId:unitId`, re-validated in `39-product-core.js` (`'Inventory identity si canonical.'`) | not set by the builder; derived later |
| SKU | `input.sku \|\| null` | `'SKU-' + variantId.slice(-12)` |

Resolving that conflict *is* the design of the variant engine. Guessing it would
silently change `variantId` / `inventoryKey` semantics for every future product and is
exactly what rule 9 and "PRESERVE EXISTING" forbid.

### `imageList` — no equivalent with this signature
The builder calls it as a **single-argument list normaliser**
(`imageList(item.images)`, `imageList(await window.skhUploadPicked(...))`). The exported
`resolveVariantImages(product, variant)` is a different two-argument resolver. The
internal `cleanList(...).map(text).filter(Boolean)` pattern is the likely shape, but
`cleanList` is **not exported** and the dedupe/cap behaviour is unproven.

### `suggestCustom` — no equivalent anywhere
Powers the seller-only **Others / Nyingine** fallback.

**Conclusion:** one of four has an equivalent authority that is unusable without an
architecture decision; three have no implementation at all. No import correction can fix
this.

## 4. Documented expected contracts (from call sites — observed, NOT invented)

Recorded so the real implementations can be verified on arrival.

**`imageList(value) -> string[]`** — call sites: `:23`, `:172`, `:176`, `:246`.
Accepts array | single value | undefined. Returns a clean string list. `:176` does
`[...new Set([...imageList(target.images), ...urls])].slice(0, 6)` — caller dedupes and
caps at 6, so `imageList` itself need not. `:246` maps `v.images || v.imageRefs || v.image`.

**`combinationKey(options) -> string`** — call sites: `:101`, `:289`.
Pure function of an options object, used **only** for equality/duplicate detection
(`combinationKey(a) === combinationKey(b)`; `Set` of signatures → `'Duplicate combination.'`).
Ordering must not matter. Relation to `variantId` at these sites: none — identity is
separate. Candidate authority: `optionSignature()` (see §3).

**`generateCombinations(options, existingVariants, idFactory, defaults) -> variant[]`** —
call site `:112`:
```js
state.variants = generateCombinations(
  state.options, state.variants, () => uid(),
  { unitId: baseUnit(), price: basePrice(), stock: 0, barcode: '' }
).map(v => ({ ...v, sku: v.sku || 'SKU-' + v.variantId.slice(-12) }));
```
Observed expectations: returns the full cartesian product of `state.options` values;
**preserves existing rows** (UI text: *"Generate haitafuti rows zako"*, and
`0ac2c17` claims "IDs zilizopo zimehifadhiwa"); every returned row carries a
`variantId` (caller slices its last 12 chars); new rows take the `defaults`; `sku` may be
absent so the caller can derive it. Row shape per `newVariant()` at `:109`:
`{variantId, sku, barcode, unitId, price, stock, options, images, status:'INACTIVE', available:false}`
— i.e. **generated rows start disabled**, matching the documented
"Generated rows zinaanza disabled" flow. Exact preservation/merge/removal rules are
**NOT** inferable and must come from source.

**`suggestCustom(text) -> suggestion | null`** — call sites `:146`, `:213`, consumed by
`useSuggestion()` at `:149`. Returns falsy for empty input. On success returns at least
`{kind, name, value}` where `kind ∈ {'filter','unit','option','attribute','feature','additional'}`
(from the `fields` map at `:157` plus the `filter`/`unit` special cases), optionally
`attributeReference`. Exact parsing rules are **NOT** inferable.

## 5. Product Builder browser result

`tools/verify_taxonomy_ui_browser.mjs`, real Chromium:

```
/js/app/05-forms.js            => LOADED
/js/app/08-app-state.js        => LOADED
/js/app/06-product-builder.js  => FAILED: ...does not provide an export named 'combinationKey'
```

Therefore, and stated plainly:

| Required check | Result |
|---|---|
| Product Builder loads | **NO — blocked** |
| Selectors / values / Generate / variant rows | **NOT VERIFIABLE** |
| SKU / barcode / price / stock / unit / image on rows | **NOT VERIFIABLE** |
| Attributes / Filters / Features / Additional Info panels | **NOT VERIFIABLE** |
| Simple product path | **NOT VERIFIABLE** |
| Variant product path | **NOT VERIFIABLE** |
| Custom variant path | **NOT VERIFIABLE** |
| Edit existing product path | **NOT VERIFIABLE** |
| Identity preservation (variantId/SKU/barcode/unitId/inventoryKey) on regenerate+edit | **NOT VERIFIABLE** |

No PASS is claimed for any of these. Identity semantics were not changed.

## 6. Taxonomy integration result

Verified at the **bridge boundary** — the exact object the builder would receive via
`getProductSuggestions(category, leaf)` — since the builder itself cannot mount. This is
labelled as bridge-level evidence, not builder-rendered evidence.

| Route | source | canonicalDefined | legacySuppressed | attributes | variantRule | completionState |
|---|---|---|---|---|---|---|
| CAT-01 / Nyama | CANONICAL | true | [] | Animal Source, Preservation State | UNSPECIFIED | EXPLICIT_INCOMPLETE |
| CAT-04 / Mbuzi | CANONICAL | true | [] | Breed, Sex, Age, Weight, Purpose, Health, Vaccination, Pregnancy, Lactation, Origin, Identification | UNSPECIFIED | EXACT_REQUIRES_REVIEW |
| CAT-05 / Samaki wa Maji Safi | CANONICAL | true | [] | Species, Scientific Name, Local Name, Origin, Water Body, Capture/Farmed, Breed, Size, Weight, Grade, Freshness, Catch Date, Harvest Date, Processing, Packaging, Quantity, Unit | UNSPECIFIED | EXACT_REQUIRES_REVIEW |
| CAT-07 / Viatu | CANONICAL | true | [] | [] | UNSPECIFIED | EXPLICIT_INCOMPLETE |
| CAT-12 / Smartphones | CANONICAL | true | [] | [] | UNSPECIFIED | INHERITED_REQUIRES_REVIEW |

All five resolve **CANONICAL**, confirming the canonical-first fix reaches the schema
layer. PARTIAL leaves are surfaced without upgrade — `variantRule.mode` stays
`UNSPECIFIED` everywhere and nothing was promoted.

Note for later (not acted on): **CAT-07 / Viatu and CAT-12 / Smartphones currently return
empty selectors/attributes.** The Color/Size and Color/RAM/Storage schemas described in
the handover live in the reviewed overlays — `product-schema-refinements.mjs` /
`product-schema-pilots.mjs` — which are still missing, so those routes legitimately
degrade to bare canonical. This is expected while `schemaOverlayStatus.degraded === true`
and is **not** a regression from the precedence change.

Category/subcategory UI from the previous round re-confirmed unchanged: 45 options
(30 canonical + 14 legacy-only), CAT-01 → 18 canonical leaves.

## 7. Tests (each run individually)

| Test | Result |
|---|---|
| `test_product_taxonomy_bridge` | PASS |
| `test_taxonomy_mission_contract` | PASS (committed-source; local-input cross-check SKIPPED) |
| `test_product_builder_ui_contract` | PASS |
| `test_product_upload_data_contract` | PASS |
| `test_product_upload_legacy_compatibility` | PASS |
| `test_product_upload_edit_roundtrip` | PASS |
| `test_product_upload_image_edit_contract` | PASS |
| `test_pos_level_core` | PASS |
| `test_advertiser_billing_coming_soon_contract` | PASS |
| `test_ads_delivery_engine` | PASS |
| `test_ads_governance` | PASS |
| `test_ads_local_delivery_regression` | PASS |
| `test_home_ads_product_cards_contract` | PASS |
| `test_product_foundation_contract` | PASS |
| `python3 tools/build_html.py check` | **CHECK OK** (byte-exact) |
| `node tools/build_product_schema_bridge.mjs --check` | PASS |

**14 passed, 0 failed.** Discover baseline untouched: 16 passed, 2 failed.

Environment note: `test_ads_delivery_engine` and `test_ads_local_delivery_regression`
first reported FAIL with an unmodified tree. Cause was **`node_modules` not persisting
between sessions** (`Cannot find package 'jsdom'`), not a code regression — confirmed by
three consecutive identical failures, then 14/14 after `npm install`. Playwright browsers
and the apt libs also need reinstalling per session.

## 8. Status guards

- 59 exact / 28 PARTIAL / 656 default-only — **unchanged**
- 740 `RETRIEVED_NOT_ADJUDICATED` + 3 `PARTIAL_SEMANTIC_REVIEW` — **unchanged**
- `FINAL-COMPLETION-REPORT.md`: **NOT COMPLETED** — unchanged
- Taxonomy UI canonical-first fix: **kept, not reverted**
- Advertiser: **not modified**; `window.openSidebarMenu` left alone (no evidence it is
  part of intended Advertiser navigation)
- No POS redesign, no Discover/ChatHai change, no duplicate authority

## 9. Remaining genuine blockers

1. **`imageList`, `generateCombinations`, `combinationKey`, `suggestCustom`** — needed in
   `shared/product-upload-data-core.mjs` (or a decision to repoint them). Until then the
   Product Builder does not run in any browser. **Highest priority.**
   Needs an explicit decision on the `uid()` vs `deterministicVariantId` conflict in §3.
2. `shared/product-schema-pilots.mjs` — reviewed pilot overlays (Viatu, Smartphones)
3. `shared/product-schema-refinements.mjs` — reviewed schemas, batches, leaf aliases
4. `tools/fixtures/taxonomy-browser-cloud.mjs` — committed preview server (port 4174)
5. `docs/taxonomy/mission/execution-queue.json` — local input by payload policy
6. Production Firebase/cloud E2E — not run
7. The 743-leaf semantic quality gate — untouched

Items 1–4 are all the same class of defect: **`0ac2c17` committed consumers whose
providers were never committed.** Recovering them from the Windows workspace is the
single unblocking action.
