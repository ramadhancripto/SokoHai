# TAXONOMY UI PRECEDENCE + ADVERTISER — FIX REPORT

2026-09-30. Continues from checkpoint `0ac2c17` on the current clone.
No Discover change. No POS redesign. No new authority. No duplicate builder/ads system.
Taxonomy semantic status deliberately unchanged.

---

## 1. Taxonomy old-UI ROOT CAUSE

The user-visible symptom — *"ukienda kutazama wakati unataka kujaza, mfumo wetu wa
taxonomy bado unaonesha ya zamani kabisa"* — had **two independent causes**, and the
one everybody assumed (the bridge merge) was not the main one.

**Cause A — the create-mode dropdowns never consulted the canonical taxonomy at all.**

The canonical-aware bridge helpers `getSellerCategoryOptions` / `getSellerSubcategories`
were only ever called from **edit** mode (`fillEdit` in `06-product-builder.js`). The
**Add Product** form was populated from two different places that read the legacy map
directly:

| Populator | File | Behaviour before |
|---|---|---|
| `populateFormCategories()` | `js/app/05-forms.js` | `for (const catName in skh.advancedCategories)` — legacy map **only** |
| `updateFormSubcats()` | `js/app/08-app-state.js` | bailed out on `!skh.advancedCategories[catVal]`, then `Object.keys(skh.advancedCategories[catVal].subcategories)` — legacy **only** |

So a seller opening Add Product saw **only the legacy categories**. The 30 canonical
categories and their 743 leaves were unreachable in create mode. This is the literal
"ya zamani kabisa".

**Cause B — legacy-first precedence in the bridge.** Confirmed as previously reported:
category list was legacy-then-canonical, subcategory list was legacy-then-canonical, and
the schema merge `{...canonical, ...live, ...pilot}` let a legacy live hint silently
overwrite a source-backed canonical definition.

**Cause C (separate, still open) — the Product Builder module cannot load in a browser.**
See blocker 6.3. This does not affect the category dropdowns but does disable the whole
`spb*` builder surface.

## 2. Taxonomy precedence FIX

Architecture now implemented:
`CANONICAL TAXONOMY → visible Product Builder taxonomy → legacy mapping/IDs/aliases → backward compatibility`

**`shared/product-taxonomy-bridge.mjs`**

- `getSellerCategoryOptions(live)` — canonical categories first, each tagged
  `source:'CANONICAL'` with its `canonicalId`. Legacy categories follow, tagged
  `source:'LEGACY_COMPATIBILITY'`, and are **skipped when they already resolve to a
  canonical ID** through `taxonomy-legacy-mapping`, so no duplicate visible category.
- `getSellerSubcategories(category, live)` — canonical product leaves first, legacy-only
  leaves appended; `unique()` keeps the canonical occurrence, so a canonical route always
  wins over an identically named legacy route. Unresolved mappings are not guessed.
- `getProductSuggestions(...)` — precedence changed from
  `{...canonical, ...live, ...pilot}` to **canonical base → legacy fills only undefined
  fields → explicit reviewed overlay (pilot) still authoritative**. A new `defined()`
  helper treats empty array/object/string as "not defined" so genuine gaps can still be
  filled by compatibility data. Every call now reports
  `taxonomyPrecedence: {order, canonicalDefined, legacyFillFields, legacySuppressedFields, overlayStatus}`.
- `source` label now prefers `CANONICAL` whenever canonical defines the leaf;
  `LEGACY_LIVE` only when canonical defines nothing.

**`js/app/05-forms.js`** — `populateFormCategories()` now builds from
`getSellerCategoryOptions(skh.advancedCategories)`; canonical in the main group,
legacy-only in a separate, clearly labelled "Legacy categories (compatibility)" optgroup.
`generateSellerFilters()` gained a null-guard so a canonical `CAT-xx` route cannot throw
on the legacy-only filter strip.

**`js/app/08-app-state.js`** — `updateFormSubcats()` no longer bails on non-legacy
categories and now uses `getSellerSubcategories`.

**Explicitly preserved:** `skh.advancedCategories` not deleted or mutated;
`shared/taxonomy-legacy-mapping.js` untouched; legacy IDs untouched; no saved product
read, rewritten or reclassified. `fillSelect()` still injects the currently-saved value,
so editing an existing product keeps its original legacy category/subcategory even when
that value is no longer offered to new products.

## 3. Advertiser — ROOT CAUSE: none found in committed code

Traced `advertiser/Advertiser/ads/campaign/Tangazo/Matangazo/Coming Soon` across
`html/`, `js/`, `functions/`, `index.html`. **The advertiser UI exists, is mounted, is
visible, and works.** No second ads system was created and no change was made.

Verified in a **real browser** (`tools/verify_advertiser_ui_browser.mjs`, Chromium,
420×900):

| Check | Result |
|---|---|
| `01-market.js`, `21-sokopay.js`, `19-roles.js`, `22-printing.js` | all LOADED |
| Handlers `skhOpenAdvertiserDashboard` / `…BillingSoon` / `renderSokoHaiAccountMenu` / `skhSidebarGo` | all `function` |
| Real top-nav **KAZI** button → mode menu opens | `modeMenuOpened: true` |
| `#mode-advertiser` rendered | 306×79 px, top 652, **in viewport** |
| Click → `#advertiserDashboardModal` | visible, title "Advertiser" |
| Dashboard content | Overview · Creative Studio (CREATE) · Billing & Payments (COMING SOON) · "Create Creative → OPEN STUDIO" |
| Billing Coming Soon dialog | visible, `.adv-coming` present, Swahili copy + Sawa |
| Sidebar account menu | 46 items, Advertiser present and visible |
| Page errors | none |

Screenshot: `docs/taxonomy/mission/ui-advertiser-verification.png`.
`tools/test_advertiser_billing_coming_soon_contract.mjs` — 20 passed, 0 failed.

Also checked and ruled out: it is present in both the stale committed `index.html` and
the rebuilt one; the CSS `css/36-advertiser-coming-soon.css` exists and is linked; no
role gating hides `mode-*` entries; the service worker is network-first and skipped on
localhost.

**Per the instruction's decision tree, no code change was warranted** — the UI is not
hidden, the route is not missing, and it is not admin-only. Faking a fix would have been
the wrong action.

Because the failure could not be reproduced, the remaining plausible explanations —
none of which are repository defects — are:
1. **Logged-out state.** `skhOpenAdvertiserDashboard` returns early to `openAuthModal()`
   when `skh.currentUser` is falsy. The entry stays visible; the dashboard just will not
   open. Most likely match for the report.
2. A deployed build older than this commit.
3. An environment bootstrap failure (Firebase CDN/config): if `00-bootstrap.js` throws,
   every module importing it dies and `openModeMenu` becomes undefined, so KAZI does
   nothing. I reproduced exactly this symptom artificially and confirmed it is **not**
   present in the committed code.

One genuine minor gap, reported not fixed: `window.openSidebarMenu` (`22-printing.js`)
is defined but never called from any markup, so the sidebar route to Advertiser is
currently unreachable. The mode-menu route works, so this is not the reported failure.

## 4. Audit portability FIX

`tools/build_taxonomy_mission_audit.mjs`:

- Removed the hardcoded `/home/user/taxonomy-final/authorized-update-baseline.json`.
  Baseline now resolves in order: `--baseline=<path>` → `SOKOHAI_AUDIT_BASELINE` env var
  → repo-relative `docs/taxonomy/mission/authorized-update-baseline.json`. No other
  machine path introduced; works on Windows, Linux and a clean clone.
- Added an explicit **AUDIT INPUT CONTRACT** header separating committed source from
  required local input, and a `requireLocal()` guard that replaces a bare `ENOENT` with a
  message naming the file, why it is needed, and that it is gitignored by payload policy.
  `execution-queue.json` is **not** committed.
- The `product-schema-refinements.mjs` import is now optional so the tool reaches its own
  error messages instead of dying at module resolution.

`tools/test_taxonomy_mission_contract.mjs` was split: the committed-source contract (all
743 routes, filter references, inherited-defaults quarantine, three food amendments)
always runs; the queue cross-check reports `SKIPPED` + `STATUS: PARTIAL` when the local
input is absent, and is never silently counted as a pass.

## 5. Build result

`python3 tools/build_html.py check` → **CHECK OK (byte-exact)**.
`node tools/build_product_schema_bridge.mjs --check` → **PASS**, projection matches
canonical authority.

## 6. Open blockers — NOT re-authored

### 6.1 `shared/product-schema-pilots.mjs` — never committed (0 commits, not gitignored)
Required export: `productSchemaPilots` — array of
`{id, categories[], branches[], canonicalRef:{categoryId, subcategory}, …schema overlay}`.

### 6.2 `shared/product-schema-refinements.mjs` — never committed
Required exports: `schemaRefinements` (categoryId → array of
`[leaf, names, units, additionalFields, aliases?, overrides?]`), `schemaBatchForCategory`,
`reviewedLiveLeafAliases` (`[liveParent, liveLeaf, categoryId, leaf]`).

The bridge now **degrades gracefully** instead of failing to import: both are loaded with
optional dynamic import and the state is published as
`schemaOverlayStatus = {pilots:'MISSING', refinements:'MISSING', degraded:true}`.
Nothing was substituted — reviewed overlays and leaf aliases are simply inactive, so
`REVIEWED_SCHEMA` / `PILOT_SCHEMA` routes currently fall back to canonical.

### 6.3 NEW — `js/app/06-product-builder.js` cannot load in any browser
It imports four symbols from `shared/product-upload-data-core.mjs` that **that module does
not export and that are defined nowhere in the repository**:

`imageList`, `generateCombinations`, `combinationKey`, `suggestCustom`

Real browser result:
`FAILED: The requested module '../../shared/product-upload-data-core.mjs' does not provide an export named 'combinationKey'`

Consequence: the entire `spb*` Product Builder surface (selectors, values, generate,
variants, attributes, filters, features, additional info, units) does not initialise in a
browser at this checkpoint. Node tests never caught it because no test imports the
builder — `test_product_builder_ui_contract.mjs` only reads it as text.

**Deliberately not implemented.** `generateCombinations` governs variant identity
preservation on regenerate (`variantId`, SKU, barcode, `unitId`, `inventoryKey`), which is
POS-critical and explicitly protected. Inventing its semantics would create exactly the
unreviewed second authority the rules forbid. Required from real source.

### 6.4 `tools/fixtures/taxonomy-browser-cloud.mjs` — never committed
The mock bootstrap that `tools/product_preview_server.mjs` (port 4174) serves in place of
`00-bootstrap.js`. Without it the committed preview server 500s. Not recreated; two
purpose-built harnesses were added instead (see below).

### 6.5 `docs/taxonomy/mission/execution-queue.json` — gitignored local input, by policy.

## 7. Test results (each run individually)

| Test | Result |
|---|---|
| `test_product_taxonomy_bridge` | **PASS** (was FAIL — module not found) |
| `test_taxonomy_mission_contract` | **PASS** — committed-source contract; local-input cross-check SKIPPED |
| `test_product_builder_ui_contract` | PASS |
| `test_product_upload_data_contract` | PASS |
| `test_product_upload_legacy_compatibility` | PASS |
| `test_product_upload_edit_roundtrip` | PASS |
| `test_product_upload_image_edit_contract` | PASS |
| `test_pos_level_core` | PASS |
| `test_advertiser_billing_coming_soon_contract` | PASS (20/20) |
| `test_ads_delivery_engine` | PASS |
| `test_ads_governance` | PASS |
| `test_ads_local_delivery_regression` | PASS |
| `test_home_ads_product_cards_contract` | PASS |
| `test_product_foundation_contract` | PASS |
| `build_html.py check` | **CHECK OK** |
| `build_product_schema_bridge --check` | PASS |

**14 passed, 0 failed.**

Discover baseline unchanged and out of scope: `test_white_system_final_contract` —
16 passed, 2 failed (Discover engine removed; Discover completion UI removed).

Two stale assertions were corrected against evidence, not to force green:
`test_product_taxonomy_bridge` expected `GENERIC_FALLBACK|LEGACY_LIVE` for
`Mifugo / Livestock Services`, but canonical `branchContexts` classifies that branch
`SERVICE`, so the bridge correctly returns `CONTEXT_ONLY` / `NOT_PRODUCT` (this is
independent of the precedence change — the context guard returns first). A new assertion
was added proving canonical attributes survive a competing legacy live hint.

## 8. Browser/UI result — actual Chromium, not static tracing

`tools/verify_taxonomy_ui_browser.mjs` (port 4175) and
`tools/verify_advertiser_ui_browser.mjs` (port 4176). Both serve the **real generated
index.html, real CSS and real ES modules**, mocking only the Firebase/cloud bootstrap
boundary. No second builder, taxonomy source or renderer.

- **A. Category list visible in Product Builder:** 45 options = 1 placeholder +
  **30 canonical** ("Other SokoHai Categories") + **14 legacy-only**
  ("Legacy categories (compatibility)"). First entries: `CAT-01 Chakula & Vinywaji`,
  `CAT-02 Kilimo & Inputs za Kilimo`, `CAT-03 Mazao & Biashara ya Kilimo`,
  `CAT-04 Mifugo`, `CAT-05 Uvuvi & Baharini`.
- **B. Subcategory list after selecting CAT-01:** container `block`, 18 options —
  `Nafaka, Unga & Mikunde`, `Mboga & Fresh Produce`, `Matunda`, `Mizizi & Viazi`,
  `Nyama`, `Samaki & Seafood`, `Maziwa & Dairy`, …
- **C. Is it the current canonical taxonomy?** **Yes.** Canonical leads; the projection
  regenerates byte-identical from canonical data (`--check` PASS).
- **D. Does a canonical leaf load the right schema?** `CAT-01 / Nyama` →
  `source: CANONICAL`, `precedence: CANONICAL_THEN_LEGACY_THEN_REVIEWED_OVERLAY`,
  `canonicalDefined: true`, attributes `["Animal Source","Preservation State"]` (the
  reviewed CAT-01 food amendment), `variantRule.mode: UNSPECIFIED`, units `[]` — i.e. the
  PARTIAL amendment is surfaced **without** being silently upgraded.
  The `spbSuggestions` panel is empty **because of blocker 6.3**, not because of routing.
- **E. Legacy compatibility preserved?** **Yes.** 14 legacy-only categories retained;
  a legacy label that maps to canonical appears **0 extra times** (no duplicates);
  `Vyakula na Vinywaji (Food)` still resolves **28 leaves** through the bridge;
  a legacy-only category (`Afya na Pharmacy (Health)`) is still selectable with 7 leaves.
- **F/G. Advertiser visible, and where?** **Yes** — see section 3. Top-nav **KAZI** →
  mode menu → "Advertiser" (306×79, in viewport) → Advertiser Dashboard; also in the
  sidebar account menu under USIMAMIZI (DASHBOARDS).
- Page errors in both runs: **none**.

Screenshots: `ui-taxonomy-verification.png`, `ui-advertiser-verification.png`.

**Not claimed:** production Firebase/auth/storage E2E — still NOT RUN. These harnesses
mock the cloud boundary and write nothing.

## 9. Taxonomy status — UNCHANGED

- 59 exact / 28 PARTIAL / 656 default-only — unchanged.
- `blockers.json`: 740 `RETRIEVED_NOT_ADJUDICATED` + 3 `PARTIAL_SEMANTIC_REVIEW` — unchanged.
- `FINAL-COMPLETION-REPORT.md`: **Status: NOT COMPLETED** — unchanged.
- No leaf marked semantically complete. Routing/test/browser passes were not treated as
  semantic evidence.

`authority-hashes.json` re-verified after these edits: 8 changed / 5 unchanged,
**0 drift** against the tree. `js/11-uploads.js` and `shared/pos-product-identity-core.js`
remain byte-identical to baseline.

## 10. Remaining genuine blockers

1. `shared/product-schema-pilots.mjs` — needed for pilot overlays (6.1)
2. `shared/product-schema-refinements.mjs` — needed for reviewed schemas + leaf aliases (6.2)
3. **`imageList` / `generateCombinations` / `combinationKey` / `suggestCustom`** — needed
   before the Product Builder can run in a browser at all (6.3). Highest priority.
4. `tools/fixtures/taxonomy-browser-cloud.mjs` — needed for the committed preview server (6.4)
5. `docs/taxonomy/mission/execution-queue.json` — local input by policy (6.5)
6. Production Firebase/cloud E2E — not run
7. The whole 743-leaf semantic quality gate — untouched and still outstanding
8. Decision needed: `window.openSidebarMenu` has no caller in markup (section 3)
