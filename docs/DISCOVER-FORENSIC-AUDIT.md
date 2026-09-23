# SOKOHAI DISCOVER — FORENSIC AUDIT REPORT

**Date:** 2026-09-23  
**Status:** COMPLETE & VERIFIED  
**Architecture Lead:** Senior Staff Full-Stack & System Architect  

---

## 1. Executive Summary & Forensic Findings

A forensic audit of the SokoHai Discover codebase was conducted across all JS modules, HTML fragments, CSS stylesheets, Firestore rules, and indexes.

### Core Diagnosis
Discover previously suffered from fragmented ownership across multiple evolutionary iterations (`75-discover-engine.js`, `88-discover-complete.js`, historical `91-discover-fixes.js`, and ad-hoc event listeners). This led to:
1. **Asynchronous search race conditions**: Rapid keystroke searches could resolve out of order and overwrite fresh results with stale older queries.
2. **Context stack vs modal closure confusion**: Ambiguity between single-level "Back" navigation and full modal "Close".
3. **Competing event interceptors**: Capture-phase document listeners attempting to intercept clicks and profile navigations.
4. **Mobile responsiveness variance**: Desktop multi-column assumptions causing cramped or misaligned grids on 320px–360px phone screens.

### Stabilized Target Architecture
Discover has been unified into a single authoritative pipeline:
- **Foundation / Pure Logic**: `js/app/76-discover-foundation.js` (State models, NLP intent parsing, taxonomy, dynamic facets, privacy projection, URL serialization, and pure filtering).
- **Data Adapters & Query Layer**: `js/app/75-discover-engine.js` (Firestore adapters, cache queries, location-based distance, offline/online seller status).
- **Authoritative UI & State Layer**: `js/app/88-discover-complete.js` (Single canonical Discover overlay `#skhDiscoverEngine`, sequence-guarded search `requestId`, dynamic pure rendering, 1-level context stack, declarative filters, and responsive 2-column mobile grid).

---

## 2. Single Responsibility Ownership Matrix

| Responsibility | Exactly ONE Owner | Status |
|---|---|---|
| **Search Engine & Intent** | `js/app/76-discover-foundation.js` (`parseDiscoverQuery`) | Canonical |
| **Data Fetching / Adapters** | `js/app/75-discover-engine.js` (`universalSearch`) | Canonical |
| **Discover State & Sequence** | `js/app/88-discover-complete.js` (`S`, `requestId`, `rawSections`) | Canonical |
| **Discovery Context & Stack** | `js/app/76-discover-foundation.js` + `window.skhDiscoverySession` | Canonical |
| **Filters & Facets** | `js/app/76-discover-foundation.js` (`applyDiscoverState`, `discoverFacets`) | Canonical |
| **URL Synchronization** | `js/app/88-discover-complete.js` (`syncUrl`, `restoreUrl`, `clearDiscoverUrl`) | Canonical |
| **Result Normalization** | `js/app/76-discover-foundation.js` (`listingOf`, `productAttributeMap`, `serviceAttributeMap`) | Canonical |
| **Rendering** | `js/app/88-discover-complete.js` (`render`, `productHierarchySections`, `serviceHierarchySections`) | Canonical |
| **Detail Opening / Bridge** | Canonical navigation bridges (`window.openProduct`, `window.openSellerProfile`, `window.skhOpenGroupSoga`) | Canonical |
| **Event Dispatcher** | `js/app/88-discover-complete.js` (Declarative `data-d2-*` actions) | Canonical |
| **Mobile UI & Styling** | `css/30-discover-engine.css` + `css/37-product-card-visual.css` + `injectCss()` | Canonical |

---

## 3. Comprehensive Module Map

### `js/app/76-discover-foundation.js`
- **Purpose**: Pure functional state, query parsing, intent detection, taxonomy normalization, facets, section counts, and URL serialization.
- **Exports**: `emptyDiscoverState`, `parseDiscoverQuery`, `validLocationContext`, `publicProfileProjection`, `applyDiscoverState`, `discoverFacets`, `sectionCounts`, `stateToSearchParams`, `stateFromSearchParams`, `resolveDiscoveryContext`, `createDiscoverySession`, `classifyProductMatches`, `productAttributeMap`, `classifyServiceMatches`, `serviceAttributeMap`, `catalogTokenMatch`.
- **Globals**: None (pure ESM module).
- **State**: Pure functions; stateless.
- **Events**: None.
- **DOM Ownership**: None.
- **Firebase Access**: None (pure memory and functional transformations).
- **Dependencies**: None.
- **Dependents**: `88-discover-complete.js`, `75-discover-engine.js`, `42-discovery-feed.js`, test suites.
- **Duplication**: None (source of truth).
- **Risk**: Low (fully covered by test suites).
- **Action**: **KEEP & EXTEND AS CANONICAL FOUNDATION**.

---

### `js/app/75-discover-engine.js`
- **Purpose**: Low-level search data adapters querying local cache (`skh.cachedItems`), Firestore collections (`services`, `businesses`, `drivers`, `chatGroups`, `users`), and computing GPS distance.
- **Exports**: Bound to `window.SKH_DISCOVER_ENGINE`.
- **Globals**: `window.SKH_DISCOVER_ENGINE`, `window.SKH_DISCOVER_ENGINE_TESTS`.
- **State**: Read-only cache references.
- **Events**: None in active mode.
- **DOM Ownership**: Helper shell (delegated to 88).
- **Firebase Access**: Read-only queries with bounded limits.
- **Dependencies**: `00-bootstrap.js`, `76-discover-foundation.js`.
- **Dependents**: `88-discover-complete.js`, `42-discovery-feed.js`.
- **Duplication**: Reused as data adapter layer by 88.
- **Risk**: Low.
- **Action**: **KEEP AS CANONICAL DATA ADAPTER LAYER**.

---

### `js/app/88-discover-complete.js`
- **Purpose**: Authoritative Discover UI layer, managing the lifecycle of `#skhDiscoverEngine`, real-time debounce, asynchronous race condition guarding (`requestId`), context stack navigation, declarative filter bottom sheet, and comparison matrix.
- **Exports**: `window.SKH_DISCOVER_COMPLETE`, `window.skhDiscoverEngineOpen`, `window.skhDiscoverEngineClose`, `window.skhDiscoveryApply`.
- **Globals**: `window.skhDiscoverySession`, `window.SKH_DISCOVER_COMPLETE`.
- **State**: `S` (canonical Discover state including `rawSections`, `filteredSections`, `requestId`, `facets`, `context`).
- **Events**: Delegated click, keydown, input listeners scoped to `data-d2-*` actions.
- **DOM Ownership**: `#skhDiscoverEngine`, `#d2Strip`, `#d2Body`, `#d2Side`, `#d2Sheet`.
- **Firebase Access**: Delegates to `SKH_DISCOVER_ENGINE.universalSearch`.
- **Dependencies**: `00-bootstrap.js`, `76-discover-foundation.js`, `75-discover-engine.js`.
- **Dependents**: Top search bar, category shortcuts, product showcase sidebar, chat discovery.
- **Duplication**: Replaces fragmented UI layers.
- **Risk**: Low (stabilized and fully tested).
- **Action**: **KEEP AS CANONICAL UI & STATE LAYER**.

---

### `js/app/91-discover-fixes.js`
- **Purpose**: Historical patch script containing mutation observers, capture-phase click handlers, and global error overrides.
- **Exports**: None.
- **Globals**: None (safely omitted from runtime loading in `html/21-scripts.html`).
- **State**: Non-loaded / Historical reference.
- **Events**: None active.
- **DOM Ownership**: None active.
- **Firebase Access**: None.
- **Dependencies**: None.
- **Dependents**: `tools/verify_nav_chain.mjs` (invariant validation).
- **Duplication**: Deprecated.
- **Risk**: None when non-loaded.
- **Action**: **DEPRECATED & SAFELY PRESERVED AS HISTORICAL REFERENCE**.

---

### `js/app/42-discovery-feed.js`
- **Purpose**: Vertical discovery feed on Home/Market and Maoni review sheet.
- **Exports**: `window.skhOpenDiscoveryFeed`, `window.skhOpenMaoni`.
- **Globals**: `window.skhDiscoverySession`.
- **State**: Feeds queue and review submission state.
- **Events**: Touch swipe and Maoni sheet actions.
- **DOM Ownership**: `#discoveryFeedModal`, `#maoniSheetBody`.
- **Firebase Access**: Read/write for authenticated review submissions and comments.
- **Dependencies**: `76-discover-foundation.js`, `00-bootstrap.js`.
- **Dependents**: Market product cards, seller profile reviews.
- **Duplication**: None.
- **Risk**: Low.
- **Action**: **KEEP AS DISCOVERY FEED & MAONI MODULE**.

---

### `js/app/68-chat-discover.js`
- **Purpose**: Integration bridge allowing buyers and sellers to discover products/services from inside active chats and share cards directly.
- **Exports**: `window.skhOpenChatDiscover`, `window.skhShareCommerceCard`.
- **Globals**: `window.skhChatDiscover`.
- **State**: Active chat context bridge.
- **Events**: In-chat discovery triggers.
- **DOM Ownership**: Chat modal commerce picker tray.
- **Firebase Access**: Read-only product/service queries.
- **Dependencies**: `34-chat-core.js`, `76-discover-foundation.js`.
- **Dependents**: Chat composer.
- **Duplication**: None.
- **Risk**: Low.
- **Action**: **KEEP AS CHAT DISCOVERY BRIDGE**.

---

### `css/30-discover-engine.css`
- **Purpose**: Stylesheet for Discover engine shell, search input, category chips, cards, filters, and mobile breakpoints.
- **Action**: **KEEP & MAINTAIN AS CANONICAL DISCOVER CSS**.

---

## 4. Root Cause Analysis Summary

| Issue Observed | Root Cause Identified | Architecture Fix Applied |
|---|---|---|
| **Stale Overwrite on Fast Search** | Concurrent async promises resolving out of order without a generation token. | Added monotonically incrementing `S.requestId` / `currentReqSeq`. Stale responses are discarded immediately. |
| **Filters Destroying Raw Results** | Direct in-place mutation of result arrays when filtering. | Preserved `S.rawSections` separately; `render()` dynamically computes `applyDiscoverState` from raw data. |
| **Back Button Exiting Entire System** | Lack of distinct handler between 1-level history pop and modal close. | Isolated `data-d2-back` (`session.back()`) from `data-d2-close` (`close()`). 1 Back = 1 Level. |
| **Oversized Cards on Small Phones** | Fixed min-width grid columns causing horizontal overflow or single massive card stack. | Standardized responsive 2-column grid (`repeat(2, minmax(0, 1fr))`) with 4:3 image ratios down to 320px. |
| **Fake Metric Counts** | Static or simulated counters on category tabs and filters. | Strictly derived counts from actual current result section lengths (`sectionCounts(S.sections)`). |
