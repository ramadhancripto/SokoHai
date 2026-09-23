# SOKOHAI DISCOVER — STABILITY CHANGELOG

**Date:** 2026-09-23  
**Status:** ALL TESTS PASSING (100%)  

---

## Change Log Entries

### 1. `js/app/88-discover-complete.js`
- **Old Behavior**: Concurrent search requests had no sequence tracking; rapid typing could cause older, slower asynchronous search promises to resolve after newer ones and overwrite the active results with stale data.
- **Problem**: Inconsistent search results when typing quickly on desktop or mobile.
- **New Behavior**: Added monotonically incrementing `currentReqSeq` and `S.requestId`. When `universalSearch` resolves, it verifies `reqId === S.requestId` before updating state or rendering. Preserved `S.rawSections` separately from derived filter output.
- **Why**: Enforces request race condition protection (Section 11) and raw data preservation (Section 10).
- **Dependencies**: `76-discover-foundation.js`, `75-discover-engine.js`.
- **Test**: `tools/test_discover_phase2_contract.mjs`, `tools/test_discover_phase3_service_contract.mjs`, `npm test`.

---

### 2. `css/30-discover-engine.css` & `injectCss()` in `88-discover-complete.js`
- **Old Behavior**: Mobile breakpoint at `<=360px` collapsed cards into a single column (`grid-template-columns: 1fr`), which made product and service cards overly large and filled up the screen too quickly.
- **Problem**: Screen space was exhausted rapidly on mobile devices.
- **New Behavior**: Updated mobile media query rules down to `320px` to maintain a compact, balanced 2-column grid (`repeat(2, minmax(0, 1fr))`) with 4:3 aspect ratio images, 2-line title clamps, and touch targets >= 44px.
- **Why**: Ensures uniform, compact card sizing across all phone viewports (Sections 51, 79).
- **Dependencies**: `css/37-product-card-visual.css`.
- **Test**: `tools/test_home_ads_product_cards_contract.mjs`, `tools/test_commerce_cards.mjs`.

---

### 3. `html/03-modals-core.html`, `js/app/63-audit-fixes.js`, and `js/app/08-app-state.js`
- **Old Behavior**: Welcome alert contained a legacy PNG/icon reference, displayed generic "MTUMIAJI" placeholder, and lacked automated triggering upon user registration/login.
- **Problem**: Broken visual mark and lack of personalized user greeting after signup/login.
- **New Behavior**: 
  - Embedded high-resolution vector SVG SokoHai brand 'S' logo with emerald-to-blue gradient and gold accent dot.
  - Added personalized greeting displaying the registered user's actual name (`Karibu, {Name}!`).
  - Added `window.skhShowWelcomeAlert(name)` invoked directly upon signup (`doSignup`), email login (`doLogin`), and Google login (`doGoogleLogin`), as well as on first visit.
- **Why**: Fulfills explicit user requirement for a beautiful S-logo welcome alert greeting users by their registered name.
- **Dependencies**: `00-bootstrap.js`, `08-app-state.js`.
- **Test**: `npm test`, `tools/build_html.py check`.

---

### 4. `html/16-topnav.html`
- **Old Behavior**: The Home announcement/advertisement card was positioned above the top search row.
- **Problem**: Advertisements obstructed the primary search bar.
- **New Behavior**: Relocated `#topAnnouncement` directly beneath `#topSearchRow` and `#locationFilterBar`.
- **Why**: Aligns advertisement placement naturally underneath the search bar.
- **Dependencies**: `38-home-ad-manager.css`.
- **Test**: `tools/test_home_ads_product_cards_contract.mjs`.

---

### 5. `firestore.rules`
- **Old Behavior**: Announcements collection read rule required admin or specific authentication context in some evaluation paths.
- **Problem**: Advertisement cards were visible only to the uploader/admin and did not render publicly for all visitors.
- **New Behavior**: Added public read rule for published active announcements (`allow read: if resource.data.status == 'published' || request.auth.token.admin == true;`).
- **Why**: Guarantees advertisement visibility for all marketplace users.
- **Dependencies**: `06-announcement.js`, `09-feed-announcements.js`.
- **Test**: `tools/test_home_ads_product_cards_contract.mjs`.

---

## File Modification Summary

- **FILES MODIFIED**:
  - `html/03-modals-core.html`
  - `html/16-topnav.html`
  - `index.html` (rebuilt byte-exact)
  - `js/app/08-app-state.js`
  - `js/app/63-audit-fixes.js`
  - `js/app/88-discover-complete.js`
  - `js/app/16-pos-admin-jobs.js`
  - `js/06-announcement.js`
  - `js/app/09-feed-announcements.js`
  - `css/37-product-card-visual.css`
  - `css/38-home-ad-manager.css`
  - `firestore.rules`
  - `tools/test_home_ads_product_cards_contract.mjs`

- **FILES ADDED**:
  - `docs/DISCOVER-FORENSIC-AUDIT.md`
  - `docs/DISCOVER-ARCHITECTURE-BEFORE-AFTER.md`
  - `docs/DISCOVER-STABILITY-CHANGELOG.md`

- **FILES DEPRECATED / RETAINED AS HISTORICAL**:
  - `js/app/91-discover-fixes.js` (omitted from load order; retained for nav chain invariant checks)

- **FILES REMOVED**:
  - Stale duplicates in `fonts/` directory.
