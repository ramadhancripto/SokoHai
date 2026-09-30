# AUTHORITY HASH DRIFT — JUSTIFICATION RECORD

Created during checkpoint `0ac2c17` recovery. Companion to
`docs/taxonomy/mission/authority-hashes.json`.

## Why this file exists separately

`authority-hashes.json` is a **generated artifact**, written by
`tools/build_taxonomy_mission_audit.mjs` (line 12). Its emitted schema is
exactly `{file, before, after, scope, changed}`. Any extra explanatory field
added by hand would be silently destroyed on the next regeneration, so the
justification lives here instead and the JSON was corrected in-schema only.

## What was wrong

The recovery audit of a clean clone found 7 protected files whose live SHA-256
did not match the `after` value recorded in `authority-hashes.json`, all of them
recorded `"changed": false`.

Root cause, established from `git log`/`git show`, not assumed:
`build_taxonomy_mission_audit.mjs` computes `after` as the file hash **at
generation time** (line 9). The audit was generated partway through the
`0ac2c17` session, *before* the final edits to those files landed in the same
commit. The two showcase files were last edited one commit earlier, in
`6056472`. So the stale values are a **generation-ordering artifact**.

Explicitly ruled out: CRLF/line-ending translation. Re-hashing each file with
CRLF normalisation does not reproduce the recorded value; `core.autocrlf` is
unset and there is no `.gitattributes`. This was real content drift.

**The drift was not hidden and no file was reverted.** The corrected JSON now
reports 8 changed / 5 unchanged, verified 0-drift against the working tree.

## Classification

### A. Intentionally changed canonical file (1)

| File | Scope |
|---|---|
| `shared/canonical-taxonomy-data.js` | `CANONICAL` |

Already correctly recorded as `changed: true`. Carries the three authorised
CAT-01 food amendments (Mizizi & Viazi, Nyama, Mayai). Chain of custody in
`food-changes.json` + `food-state-compatibility.json`. Not affected by this
correction.

### B. Protected files actually changed (7) — justification per file

All seven are **additive extensions of the existing authority**. None replaces
an authority, introduces a second writer/collection/uploader/identity core, or
removes a legacy path.

**1. `functions/inventory-authority.js`** — `+3`, commit `0ac2c17`
Adds `Card: 'Bank'` to the existing frozen `PAYMENT_METHOD_ALIASES` map.
Card tenders accepted by the Basic POS UI resolve onto the **existing** Bank
settlement authority until a distinct card processor exists. One alias entry;
no new settlement path, no second inventory authority.

**2. `js/app/39-product-core.js`** — `+11`, commit `0ac2c17`
Imports `normalizeProductUploadData` / `resolveVariantImages` from
`shared/product-upload-data-core.mjs` and re-exports them. Inside the
**existing** `buildProductWrite`, writes `attributes`, `filters`, `options`,
`variantsStructured`, `features`, `additionalInfo` — each only when populated.
Legacy fields above remain authoritative and are untouched. No second product
writer; `buildProductWrite` remains the single write authority.

**3. `js/app/00-bootstrap.js`** — `+4 / -1`, commit `0ac2c17`
Extends the existing import list from `./39-product-core.js` with the two new
symbols and mirrors them onto the existing `skh` service surface as
`skh.normalizeProductUploadData` / `skh.resolveVariantImages`. Pure surface
extension of the established one-interface pattern.

**4. `js/app/08-app-state.js`** — `+7`, commit `0ac2c17`
In the existing seller submit path, reads `window.skhProductBuilderExport` and
spreads only non-empty `attributes/options/variantsStructured/features/
additionalInfo` into the **existing** `skh.saveData('products', …)` call. Also
calls `window.skhProductBuilderReset()` on form reset. Still one save call to
the one `products` collection via the existing writer.

**5. `js/app/12-sys-modes.js`** — `+16 / -1`, commit `0ac2c17`
Extends the existing `openEditModal` / `submitEditForm`. Stores
`window.__skhLastEditProduct`, toggles `#editStructuredFields` for the
`products` collection only, and merges a `structuredPatch` into the existing
`updateMap`. Uses the existing edit flow and existing update path; no second
edit flow.

**6. `js/app/39-product-showcase.js`** — commit `6056472`
Imports `psResolveStructuredVariant` / `psOptionValueAvailable` from the
existing `39-showcase-logic.js` to disable unavailable variant chips and prefer
an exact structured variant price, falling back to the pre-existing
`psVariantDelta` behaviour when no structured row matches. Same single showcase
renderer.

**7. `js/app/39-showcase-logic.js`** — commit `6056472`
Adds `psResolveStructuredVariant` and `psOptionValueAvailable`; renders
`attributes`/`features`/`additionalInfo` rows in `psSpecRows` for
`PS_PRODUCT`; `psVariantGroups` prefers structured `p.options` when present and
otherwise falls through to the legacy `p.variants` logic unchanged. Legacy
compatibility preserved — covered by
`tools/test_product_upload_legacy_compatibility.mjs` (PASS).

### C. Protected files verified unchanged (5)

| File |
|---|
| `shared/canonical-taxonomy-core.js` |
| `shared/taxonomy-legacy-mapping.js` |
| `shared/taxonomy-classification-state.js` |
| `js/11-uploads.js` |
| `shared/pos-product-identity-core.js` |

The two authorities named most explicitly in the architecture rules — the
uploader (`js/11-uploads.js`, `skhUploadPicked()`) and the POS product identity
core (`shared/pos-product-identity-core.js`) — are **byte-identical** to
baseline.

## Regeneration caveat

`authority-hashes.json` was corrected **by hand**, in-schema, because the
generator cannot currently run on a clean clone. It needs four things, three of
which are unavailable:

1. `shared/product-schema-refinements.mjs` — **never committed**
2. `shared/product-schema-pilots.mjs` — **never committed** (via the bridge)
3. `docs/taxonomy/mission/execution-queue.json` — gitignored by payload policy
4. `/home/user/taxonomy-final/authorized-update-baseline.json` — **hardcoded
   absolute path outside the repository** (`build_taxonomy_mission_audit.mjs`
   line 9); supplies every `before` value

Item 4 means the `before` column cannot be re-derived from the repo at all.
The existing `before` values were therefore preserved verbatim and only `after`
and `changed` were recomputed. Once items 1–3 are restored, re-run the
generator and confirm it reproduces this file; consider parameterising item 4
so the audit is reproducible rather than machine-bound.
