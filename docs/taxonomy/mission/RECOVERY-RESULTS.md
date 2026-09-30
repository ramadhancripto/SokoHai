# CHECKPOINT 0ac2c17 — RECOVERY RESULTS (Steps 1–8)

2026-09-30. HEAD still `0ac2c17`. **Nothing committed, nothing pushed, nothing staged.**
No Discover change. No POS redesign. No new authority. No duplicate builder.

## 1. Files recovered — NOT DONE (hard blocker)

`shared/product-schema-pilots.mjs` and `shared/product-schema-refinements.mjs`
were **not recovered**. This agent runs in an isolated Linux sandbox and has no
access to `C:\Users\user\Desktop\real sokohai\real-sokohai-complete`. The repo
here is a fresh `git clone` from GitHub, where those files have never existed
(0 commits, all history).

Per the instruction — do not re-author, do not create a replacement, do not
create a parallel implementation — **nothing was written.** The two files must
be supplied from the Windows workspace.

Required of them, derived from the consuming code (contract only, not an
implementation):

| Module | Required named exports | Consumers |
|---|---|---|
| `shared/product-schema-pilots.mjs` | `productSchemaPilots` — array; each entry `{id, categories[], branches[], canonicalRef:{categoryId, subcategory}, …schema overlay}` | `product-taxonomy-bridge.mjs:2` |
| `shared/product-schema-refinements.mjs` | `schemaRefinements` (object keyed by categoryId → array of `[leaf, names, units, additionalFields, aliases?, overrides?]`), `schemaBatchForCategory`, `reviewedLiveLeafAliases` (array of `[liveParent, liveLeaf, categoryId, leaf]`) | `product-taxonomy-bridge.mjs:3`, `tools/build_taxonomy_mission_audit.mjs:1` |

**Additional non-self-containment found (new):**
`tools/build_taxonomy_mission_audit.mjs` cannot run on any clean clone. It needs
four inputs, three unavailable:

1. `shared/product-schema-refinements.mjs` — never committed
2. `shared/product-schema-pilots.mjs` — never committed (via bridge)
3. `docs/taxonomy/mission/execution-queue.json` — gitignored by payload policy
4. `/home/user/taxonomy-final/authorized-update-baseline.json` — **hardcoded
   absolute path outside the repository** (line 9), supplying every `before` hash

Item 4 makes the audit machine-bound and should be parameterised.

## 2. Dependency verification — BLOCKED

`shared/product-taxonomy-bridge.mjs` **cannot** import both files; they are absent.

```
node tools/test_product_taxonomy_bridge.mjs
  → Error [ERR_MODULE_NOT_FOUND]: Cannot find module
    '/home/user/SokoHai/shared/product-schema-pilots.mjs'
    imported from /home/user/SokoHai/shared/product-taxonomy-bridge.mjs

node tools/test_taxonomy_mission_contract.mjs
  → same ERR_MODULE_NOT_FOUND
```

Both FAIL at import, before any assertion executes.

## 3. Hashes corrected — DONE

No file reverted. Cause established from `git show`, not assumed: the audit
generator computes `after` at generation time and ran before the final edits
landed in the same commit. CRLF explicitly ruled out (re-hashing with CRLF does
not reproduce the recorded values; `core.autocrlf` unset, no `.gitattributes`).

`authority-hashes.json` corrected **in-schema only** (it is a generated
artifact; extra fields would be destroyed on regeneration). Now verifies
**0 drift** against the tree:

| Class | Count | Files |
|---|---|---|
| Intentionally changed canonical | 1 | `shared/canonical-taxonomy-data.js` |
| Protected — actually changed | 7 | `00-bootstrap.js`, `08-app-state.js`, `12-sys-modes.js`, `39-product-core.js`, `inventory-authority.js`, `39-product-showcase.js`, `39-showcase-logic.js` |
| Protected — verified unchanged | 5 | `canonical-taxonomy-core.js`, `taxonomy-legacy-mapping.js`, `taxonomy-classification-state.js`, **`js/11-uploads.js`**, **`pos-product-identity-core.js`** |

All 7 drifts are small additive extensions of existing authorities — no second
writer, collection, uploader, identity core or showcase renderer. The uploader
and POS identity authority are byte-identical to baseline.

Per-file justification: `docs/taxonomy/mission/authority-drift-justification.md`.
Report **Section 18 corrected** — the `12/12 unchanged` claim is withdrawn and
replaced with the 1 / 7 / 5 classification and the root cause. Drift is not hidden.

## 4. HTML build — DONE, CHECK PASS

`index.html` was not hand-edited. Rebuilt from `html/` partials via the tool
(`build:html` = `python3 tools/build_html.py build`, deterministic concatenation
of 22 fragments, no npm deps):

```
BUILD OK: 22 vipande -> index.html (363553 chars)
CHECK OK: html/ inajenga index.html 100% sawa (byte-exact).
```

Diff vs committed: `1 file changed, 77 insertions(+), 8 deletions(-)` — the
Product Builder markup from `0ac2c17` that had never been rebuilt into the
generated file.

## 5. spbBuilder decision — the test was asserting stale IDs

Evidence: `git log -S'spbBuilder' -- html/ js/ index.html` returns **nothing** —
`spbBuilder` has never existed in markup or JS in any commit. The test file and
that assertion were both introduced in `0ac2c17` and were committed failing.

The authoritative container is `productBuilder`:
`<section id="productBuilder" class="spb" aria-label="Product Builder">` inside
`<div id="spbCreateMount">`. `06-product-builder.js` guards on it
(`if (!$('productBuilder')) return;`), sets `dataset.schema` / `dataset.bound`,
binds its `input` listener to it, scopes delegation to `#productBuilder`, and
moves it between `spbCreateMount` and `spbEditMount` — 8 references.

Four further assertions in the same test were equally stale:

| Asserted | Actual authority |
|---|---|
| `spbBuilder` | `productBuilder` |
| builder token `generateVariants` | `generateCombinations` (from `product-upload-data-core.mjs`), fn `generate`, bound `spbGenerate:generate` |
| builder token `Manual variant` | fn `manual()`, bound `spbManualVariant:()=>manual()` |
| label `Generate combinations` | `Generate variants` |
| label `Add variant manually` | `＋ Add Variant Manually` |

**Decision:** the implementation is the authority and is correct and complete;
the non-authoritative test was corrected to assert the real names. Markup and
builder JS untouched. No second builder. `tools/test_product_builder_ui_contract.mjs`
now PASSES.

## 6. Exact UI taxonomy source — traced

Live browser run is blocked by the same missing modules (`06-product-builder.js`
imports the bridge), so this is a static runtime trace, not a browser claim.

**Eliminated as causes** — the old taxonomy is *not* coming from any of these:

- **stale `index.html`** — was genuinely stale; now rebuilt, `CHECK OK`
- **cached projection** — `shared/product-taxonomy-browser.mjs` regenerates
  **byte-identical**; `--check` → `PASS taxonomy browser projection matches
  canonical authority`. It is current and derives directly from
  `canonical-taxonomy-data.js` + `canonical-taxonomy-core.js`
- **service worker** — `sokohai-sw.js` is network-first and registration is
  explicitly skipped on `localhost`/`127.0.0.1`; it does not cache taxonomy
- **localStorage / sessionStorage** — zero references in builder, bridge or projection
- **wrong import / fallback** — `html/21-scripts.html` loads
  `js/app/06-product-builder.js` as a module; import chain is correct

**Actual source — a deliberate merge, legacy-first on overlap:**

- Category list: `getSellerCategoryOptions(skh.advancedCategories)` — legacy
  `skh.advancedCategories` keys (defined inline at `js/app/00-bootstrap.js:907`)
  **first**, then canonical category IDs appended only where not already present.
- Subcategory list: `getSellerSubcategories` returns
  `unique([...legacy subcategories, ...canonical productLeaves[id]])`.
- Schema: `const base = {...canonical, ...live, ...pilot}` — **live legacy
  overrides canonical**, pilot overrides both. `source` is reported as
  `LEGACY_LIVE` whenever a live entry exists.

So the UI uses **both taxonomies simultaneously, with the legacy live map
winning on overlap**. This is intentional and documented in the bridge
("Existing live leaf hints win over broad canonical defaults"; "Explicit
canonical-ID routes coexist with unchanged legacy routes"), and is consistent
with PRESERVE EXISTING / USIONDOE KILICHOPO. It is **not** a staleness bug.

Open question for your decision (not acted on): whether legacy-wins is still
desired for leaves that now have source-backed canonical definitions, since a
legacy entry will currently shadow them.

## 7. Test results

| Test | Result |
|---|---|
| `test_product_taxonomy_bridge.mjs` | **FAIL** — ERR_MODULE_NOT_FOUND (Step 1 blocker) |
| `test_taxonomy_mission_contract.mjs` | **FAIL** — ERR_MODULE_NOT_FOUND (Step 1 blocker) |
| `test_product_builder_ui_contract.mjs` | **PASS** (was FAIL) |
| `test_product_upload_data_contract.mjs` | PASS |
| `test_product_upload_legacy_compatibility.mjs` | PASS |
| `test_product_upload_edit_roundtrip.mjs` | PASS |
| `test_product_upload_image_edit_contract.mjs` | PASS |
| `test_pos_level_core.mjs` | PASS |
| `build_html.py check` | **CHECK OK** (was FAIL) |
| `build_product_schema_bridge.mjs --check` | PASS |

Net: 6 PASS → 8 PASS (incl. both checks); 3 FAIL → 2 FAIL, both the same
unrecoverable missing-module blocker.

Discover baseline unchanged and out of scope: `test_white_system_final_contract.mjs`
16 passed, 2 failed. Not touched.

## 8. No semantic claims made

Verified unchanged: **59 exact / 28 PARTIAL / 656 default-only**;
`blockers.json` still 740 `RETRIEVED_NOT_ADJUDICATED` + 3 `PARTIAL_SEMANTIC_REVIEW`;
`FINAL-COMPLETION-REPORT.md` still **"Status: NOT COMPLETED"**. No leaf marked
complete. Route/test passes were not treated as semantic evidence.

## Remaining taxonomy quality-gate work

Unchanged from before this recovery — none of it was started:
exhaustive semantic review of the 743 leaves; authoritative evidence
adjudication; category-backed variant decisions; manual-combination decisions;
unit recommendations where evidence exists; additional-info applicability;
feature applicability; media guidance; historical/legacy semantic mapping
resolution (incl. the legacy-wins question in §6); production E2E; final exact
regression.

## Working tree (for your review — uncommitted)

```
 M docs/taxonomy/mission/FINAL-COMPLETION-REPORT.md   (Section 18 corrected)
 M docs/taxonomy/mission/authority-hashes.json        (after/changed corrected)
 M index.html                                         (rebuilt by tool)
 M tools/test_product_builder_ui_contract.mjs         (5 stale assertions corrected)
?? docs/taxonomy/mission/CHECKPOINT-0ac2c17-RECOVERY.md
?? docs/taxonomy/mission/authority-drift-justification.md
```

Checkpoint is **still not self-contained** until the two `shared/product-schema-*.mjs`
files are added.
