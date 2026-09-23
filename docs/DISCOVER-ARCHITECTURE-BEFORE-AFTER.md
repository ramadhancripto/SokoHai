# SOKOHAI DISCOVER — ARCHITECTURE BEFORE & AFTER

**Date:** 2026-09-23  
**Status:** CONSOLIDATED & STABILIZED  

---

## 1. BEFORE (Fragmented Architecture)

```text
               USER ACTIONS (Search / Clicks / Filters / Back)
                                      │
       ┌──────────────────────────────┼─────────────────────────────┐
       ▼                              ▼                             ▼
[75 Discover Engine]        [88 Discover Complete]        [91 Discover Fixes]
 • Alternate Modal UI        • Second State Tree           • Capture Click Interception
 • Independent Search        • URL Params Management       • MutationObserver Polling
 • Local State Cache         • Independent Renderer        • Global Error Overrides
 • Direct DOM writes         • Hardcoded Counts            • CSS Inject Overrides
       │                              │                             │
       └──────────────────────────────┼─────────────────────────────┘
                                      ▼
                      CONFLICTS & INSTABILITIES:
                      - Search requests race and overwrite each other
                      - Filters permanently destroy raw result arrays
                      - Back button randomly closes entire Discover UI
                      - Competing click handlers fight for modal dispatch
                      - Competing CSS rules with !important
```

---

## 2. AFTER (Consolidated Canonical Architecture)

```text
               USER ACTIONS (Search / Clicks / Filters / Back)
                                      │
                                      ▼
                      [88 CANONICAL DISCOVER UI LAYER]
                        • Single Authoritative Shell (#skhDiscoverEngine)
                        • Request ID & Sequence Guard (Anti-Race Token)
                        • Pure Declarative Dispatcher (data-d2-*)
                        • Responsive 2-Column Mobile Grid (320px–414px+)
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            ▼                                                   ▼
[76 DISCOVER FOUNDATION]                               [75 DATA ADAPTER LAYER]
 • Pure Functional Engine                                • Local Cached Items Query
 • Intent & NLP Query Parsing                            • Firestore Read Adapters
 • Taxonomy & Attribute Normalization                    • GPS Distance Calculation
 • URL State Serialization (stateToSearchParams)         • Offline/Online Seller Logic
 • Dynamic Facets & Section Counts                       • Bounded, Resilient Queries
 • Context History Stack (session.activate/back)
            │                                                   │
            └─────────────────────────┬─────────────────────────┘
                                      ▼
                    [CANONICAL NAVIGATION & ACTION BRIDGES]
         • window.openProduct(id, 'products'|'services'|'drivers')
         • window.openSellerProfile(uid)
         • window.openChatWithUser(uid, name)
         • window.skhOpenGroupSoga(groupId)
                                      ▼
                       [EXISTING SOKOHAI CORE MODULES]
                 (Chat, SokoPay, Negotiation, Orders, Escrow)
```

---

## 3. Key Architectural Invariants Enforced

1. **One Authoritative State (`S`)**:
   - `S.rawSections`: Preserves the complete raw result collection returned by data sources.
   - `S.requestId`: Sequence token ensuring stale asynchronous search requests are dropped immediately.
   - `S.context`: Active discovery context capturing the entity, taxonomy, and search intent.
   - `session.back()`: Single-level history stack pop (`1 Back = 1 Level`).

2. **Pure Functional Transformations**:
   - Filtering via `applyDiscoverState(rawItems, state, locationContext)` never mutates source data.
   - Removing a filter returns the full unmutated raw collection instantaneously.

3. **Explicit Action Dispatching**:
   - Direct entity opening reuses canonical modules (`openProduct`, `openSellerProfile`, `openChatWithUser`, `skhOpenGroupSoga`) without inventing duplicate profile or messaging screens.

4. **Honest Data & Resilient Error Handling**:
   - Zero fake counts; all tab badges and sidebar counts are calculated from real array lengths.
   - Partial source failures display an informative banner while rendering all successful sections.
