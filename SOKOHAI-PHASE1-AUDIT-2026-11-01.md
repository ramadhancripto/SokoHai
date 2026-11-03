# SokoHai — Phase 1 Report: Audit, Root-Cause Fix, UI Foundation
**Date:** 2026-11-01 · **Branch:** `improve/phase1-audit-upload-fix` · **Commit:** `3aab659`
**Scope of this round:** complete repository + runtime audit, root-cause fix of the seller image-upload failure, one additive UI-refinement layer, an empty-state fix on Home, and a real, runnable preview harness.

Nothing was deployed. Nothing was merged into `main`. No Firebase data, rules, or functions were changed.

---

## 1. What actually exists (measured, not assumed)

| Area | Reality |
|---|---|
| Frontend | Static ES-module app, no bundler. `index.html` = **4,242 lines / 372 KB**, assembled byte-exactly from **22 fragments** in `html/` (`python3 tools/build_html.py build` / `check`). |
| App JS | `js/app/*.js` = **68,665 lines across 87 modules**, loaded as native `<script type="module">`. Classic scripts in `js/` = 4,285 lines. |
| CSS | **40 stylesheets** (≈ 640 KB), no cascade layer; order decides everything. `01-core.css` (71 KB) + `26-design-system.css` (68 KB) overlap heavily. |
| Backend | `functions/` — Node 22, `firebase-functions` v5, region `europe-west1`. Modules: wallet/escrow, PesaPal, negotiation, routing, delivery custody, inventory reservation, product variants, business/store authority, ads delivery + governance, creative studio, reporting, admin authority, upload signing. |
| Data/rules | `firestore.rules` **87 KB** (plus 4 backup copies), `firestore.indexes.json` 13.6 KB. |
| Build/deploy | Netlify publishes **only `dist/`**, produced by an allow-list builder (`tools/build_dist.mjs`, 203 files, 8.8 MB). Repo root, `functions/`, reports and seed scripts are correctly **not** served. |
| Tests | 100+ Node contract suites (`npm test`), plus emulator suites and a real-browser taxonomy suite. |
| Dead weight | **Three duplicate copies of the app** in the repo: root (live), `assets/` (87 app modules + 82 reports), `fonts/` (73 files incl. a full `index.html`). None of them are shipped (`dist/` proves it), but they are a maintenance and confusion hazard. Plus 82 markdown/txt reports in the repo root. |
| Secrets | **No secrets in the browser or the repo.** PesaPal/Cloudinary secrets live in `functions/.env` only; `build_dist` denies `.env`, `service-account*`, `*.backup`, `*.patch`, logs and markdown. |

---

## 2. Verified working (ran it, did not read it)

Executed in real Chromium against the real build (`tools/dev_server.mjs` serves `dist/` the way Netlify does):

- **Boot, auth gate, splash, top nav, search, region filter, category rail, marketplace rails, bottom nav, sell FAB** — all render and respond.
- **Seller form** (`showForm('sellerForm')`) opens with the 5-step structure, business-mode default (`Dukani + Mtandaoni`), taxonomy search, per-step progress chips, autosave draft, "copy previous product".
- **Product photo picker** — now works (see §3).
- **Contract suites:** `118 passed / 2 failed`. Both failures (`current Discover engine is removed`, `current Discover completion UI is removed`) **reproduce on a clean checkout of `main`** — pre-existing, unrelated to this branch. The contract expects `75-discover-engine.js` / `88-discover-complete.js` to be deleted while the files still ship; that decision is yours, not mine to guess.

---

## 3. Root cause of the upload error (proven, then fixed)

**Symptom you reported:** `window.skhUploadManyFromInput — 11-uploads.js:216`, `window.skhUploadPicked — 11-uploads.js:196`, `window.submitSeller — 08-app-state.js:504`. Those three lines are a *chain*, not three bugs.

**What is actually wrong — load order.** The Add-Product photo picker was initialised by an **inline `<script>` inside the form markup** (`html/09-admin-sell.html`), which executes while the HTML is being parsed. `js/11-uploads.js` — the file that defines `window.skhInitPhotoPicker` — is a `<script src>` at the **end of `<body>`**, so it loads *after*. The initialiser was guarded with `if (window.skhInitPhotoPicker)`, so it silently did nothing. Consequences:

1. no `change` listener was ever attached to `#prodImage` / `#prodImageCam`;
2. `window.skhClearPickedPhotos['prodImage']` was never registered;
3. `skhUploadPicked('prodImage')` found an empty picked-list and fell through line 196 to `skhUploadManyFromInput` (line 216);
4. `submitSeller` got `[]` and raised *"Weka angalau picha 1 ya bidhaa"* — **a message that is wrong for every other kind of failure too** (network, not signed in, Cloudinary refusal).

**Measured before the fix** (real browser, 3 photos selected through the actual input):

```
picker: { initFn: "function", clearPickedRegistered: false }
multiselect: { filesStillInInput: 3, previewsRendered: 0, hint: "" }
afterCamera: { previews: 0, hint: "" }
```

**Measured after the fix:**

```
picker: { initFn: "function", clearPickedRegistered: true }
multiselect: { filesStillInInput: 0, previewsRendered: 3, hint: "Picha 3/6 ✓ tayari" }
afterCamera: { previews: 4, hint: "Picha 4/6 ✓ tayari" }
```

Screenshots: `audit-shots/before/12-seller-form-photos-picked.png` (empty) vs `audit-shots/12-seller-form-photos-picked.png` (3 thumbnails, "KUU" badge on the first).

**Engineering fix (no workaround, no hidden error):**
- The picker is now **declared in markup** (`data-skh-photo-picker='{"galleryInput":"prodImage",…}'`) and bound by `js/11-uploads.js` on load, on `DOMContentLoaded`, and on two cheap retries. Binding is **idempotent**, so loading the file late, early, or twice is harmless — the root cause class is gone, not papered over.
- Picker v2 under that: gallery + camera feed **one** list; per-photo state `pending / uploading / done / failed` with a visible overlay; per-photo remove (first tile is marked **KUU** = main image); type + 12 MB + 6-file validation with real messages; hint line shows count, minimum and failures.
- **Truthful failures:** `window.skhUploadLastError` and `skhUploadPickedDetailed()` tell the form *why* it failed; `submitSeller` now says "Picha haikupandishwa. Sababu: … Bidhaa yako bado ipo kwenye fomu" instead of blaming the seller for not choosing a photo. Partial success publishes with the photos that uploaded and warns about the rest.

**One thing I could not verify here, stated plainly:** the actual byte-transfer to Cloudinary. It requires a signed-in Firebase session plus `CLOUDINARY_*` values in `functions/.env`. What I verified is everything up to the network call: selection → compression → signature request → correct signed/unsigned request shape → error surfacing. If `CLOUDINARY_UPLOAD_MODE` is `signed` and the server env is missing, your seller now sees *"Seva imekataa kupandisha picha. Hakikisha umeingia…"* instead of a silent failure. **Please run one real upload from a seller account and tell me what the toast says** — if it is a Cloudinary refusal, the message will now quote it.

---

## 4. Broken / inconsistent things found in the audit (not yet fixed)

Ordered by user impact. I stopped at the end of Phase 1 + the upload fix so you can review before more code moves.

1. **A signing module named as the source of truth does not exist.** `shared/product-taxonomy-bridge.mjs` imports `product-schema-pilots.mjs` and `product-schema-refinements.mjs` — **neither was ever committed**. The bridge degrades gracefully and reports `schemaOverlayStatus.degraded = true`, but that means the *reviewed seller-schema overlay* is not actually running. The bridge's own header calls it "an explicit blocker". This needs your decision: commit those two files, or accept canonical-only routing.
2. **Desktop navigation is duplicated.** The fixed mobile tab strip (`Nyumbani / Bidhaa / Huduma / Usafiri / Chat`) is forced on at ≥1025 px (`01-core.css`) *and* covered the first marketplace rail with **no compensating body padding** (verified at 1440×900). This round hides the tab strip on desktop and keeps the sidebar + sell FAB. The sidebar still needs an audit — `openSidebarMenu()` is wired, but I have not yet proven every entry inside it lands somewhere real.
3. **Home repeats its own content.** `Zinazovuma Sasa` (3 items) and `Uwanja wa Mchanganyiko` (11) draw from the same `all` feed, so `cocacola ×3`, `simu ×4`, `Viatu ×3` appear twice on one screen. The trending rail also has no "why": no sales/view counter — it is the newest N items wearing a trending label.
4. **Two home rails are structurally empty** (`Zinazotafutwa Sana`, `Boosted`). Fixed for the empty-*box* case this round (see §5); the real fix is an ad/search-signal density problem, i.e. Phase 4.
5. **`js/app/26-design-system.css` vs `01-core.css`** duplicate the same components with different values; specificity decides. This is why small fixes so often need `!important`. A cascade cleanup is a Phase 2 decision, and it must be done file-by-file or it will break white-system contracts.
6. **82 report/markdown files and 3 duplicate app copies in the repo root.** `dist/` is clean; the repo is not. `assets/js/app/*` (87 files) is a stale third copy of the app.
7. **Hard-coded `alert()` / `confirm()` remain in several flows** (`08-app-state.js` transport booking, price-drop/auction validation) despite `NICE_ALERTS` — inconsistent with the toast/dialog system.
8. **`Cart` and `SokoPay` top-right icons** render, and are wired, but I have not yet exercised the full cart → checkout → PesaPal path (needs live payment credentials; I will not fake that).
9. **Product cards still show `SOKOHAI / Picha inakuja hivi karibuni` placeholders** for 5 of 25 images on Home, and 2 images fail to load — real data problem, not a CSS one.

---

## 5. What changed in this round

**A. `js/11-uploads.js` — picker v2** (root-cause fix above). Keeps the original public contract (`skhUploadFromFile`, `skhUploadFromInput`, `skhUploadManyFromInput`, `skhUploadPicked`, `skhClearPickedPhotos`) so all **27 existing call sites** across the app keep working; adds `skhPhotoPickerFiles`, `skhPhotoPickerReset`, `skhAutoBindPhotoPickers`, `skhUploadPickedDetailed`.

**B. `html/09-admin-sell.html` — the photo block** is now declared markup (`data-skh-photo-picker`), with a real label, a one-line explanation ("Picha ya kwanza ni picha kuu…"), sentence-case buttons, and an `aria-label`ed hint. Same ids, same form, same save path.

**C. `js/app/08-app-state.js` — `submitSeller`** upload branch: truthful error reporting, partial-success handling, no data loss on failure.

**D. `css/40-ui-refinement.css` — new, additive, loaded last.** One file, no new system, uses your palette (`#18A982`, `#3B82F6`, `#EAF8F3`, `#D4A72C`). It only re-shapes what exists:
- card-lite surfaces (white, 1 px `#E2E8F0`, 16 px radius, restrained shadow), one hover language;
- one section-head rhythm, readable titles (13.5–14.5 px, 2-line clamp, reserved height so rows align), prices never smaller/dimmer than titles;
- "Ona zote" is now a real pill affordance instead of tiny uppercase text;
- desktop: duplicate tab strip retired, sell FAB parked bottom-right (it was floating over a product rail);
- mobile: `padding-bottom` so the fixed bar can never hide the end of the page, 46 vw cards (two full cards + a peek), readable tab labels;
- shared `.skh-field*` form primitives, consistent focus-visible ring, one loading/empty/error look (`.skh-state`), sponsored chip styling.

**E. `js/app/00-bootstrap.js` — `renderMarketplaceSections`**: an empty rail no longer paints a grey "Hakuna…" card. Empty rails collapse (keeping their markup for the contract tests), and if all are empty one calm explanation appears instead of three apologies.

**F. Preview + test harness (new, reusable):**
- `tools/dev_server.mjs` — serves `dist/` with Netlify's rewrite/no-store semantics → **this is the live preview you are looking at**.
- `tools/audit_probe*.mjs` — real-browser audit probes (console errors, failed requests, overflow, duplicate content, ad slots, nav visibility).
- `tools/ui_shots.mjs` — real-UI screenshots (seller form desktop/mobile, photo block before/after, market, home) with a JSON report.
- `tools/pw-env.sh` — makes Chromium runnable in this sandbox (system libs extracted without root).

**Tests:** `npm test` → **118 pass, 2 pre-existing fails** (proven identical on a clean checkout). The 12 upload/product/taxonomy/quantity contracts specifically re-run green.

---

## 6. Phase 2 proposal (needs your call before I write code)

I recommend this order, because the two biggest risks are *silent* ones:

1. **Decide the taxonomy overlay blocker** (commit `product-schema-*.mjs`, or drop them and delete the import). Everything category-driven depends on which answer is true.
2. **Seller form: real photography test.** You run one upload from a seller account; I fix whatever the new message reports. Then: preview-before-publish, step-to-step focus/scroll management, and "required" audit of Step 2–4 fields.
3. **Home de-duplication + honest labels** (Phase 3/4 overlap): one source per rail, trending must be evidence-based or renamed, ads placed *between* rails at fixed frequency with a `Sponsored` chip, respecting the existing ads-delivery engine (`96-ad-delivery-controller.js`, `functions/ads-delivery.js`) — not a second ad engine.
4. **Cascade cleanup, file by file** (`01-core.css` → `26-design-system.css` → `40-ui-refinement.css`), retiring only rules that are provably overridden, with the white-system contracts run after every file.
5. **Sidebar + every visible control** — click-through of the whole menu, list of dead controls, then fix.

Say which of these you want first, and whether I may keep the `40-ui-refinement.css` layer as the permanent home for these changes (it is the only way I can promise "no regression" while the older CSS stays untouched).

---

## 7. Standing constraints I am honouring

- `main` untouched, PR **not** merged, nothing deployed to Netlify or Firebase.
- No Firebase data, rules, functions or financial logic changed.
- No new taxonomy, no second ads engine, no duplicate uploader, no rebuild from scratch.
- Every claim above is either a measured browser number, a file/line reference, or an explicit "not verified".
