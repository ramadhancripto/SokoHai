# SokoHai STEP 3A-1 — Canonical Business + Store Authority
## Completion report — 2026-09-26

**Scope:** STEP 3A-1 only. No STEP 3A-2, STEP 3B, Services, Usafir, online-order inventory, variant inventory, staff migration, or unrelated rewrites were started.

## A–R status

| Section | Status | Result |
|---|---|---|
| A. Existing Business/Store audit | IMPLEMENTED | Existing flat `businesses/{businessId}` and `stores/{storeId}` documents, user context pointers, and legacy seller fields were audited and preserved. |
| B. Canonical Business | IMPLEMENTED | `businesses/{businessId}` remains the canonical Business document; authority is checked from the authenticated caller and document `ownerUid`. |
| C. Canonical Store | IMPLEMENTED | `stores/{storeId}` remains the canonical Store document; resolver checks existence, owner, and Business linkage. No nested duplicate collection was created. |
| D. Auth UID → Business | IMPLEMENTED | Server resolver starts with `request.auth.uid`, reads `users/{uid}`, and never treats browser `ownerUid` as authority. |
| E. Business → Store | IMPLEMENTED | Server resolver validates Store existence, owner, and `store.businessId === businessId`. |
| F. Product → Business/Store | IMPLEMENTED | New Product creation paths write `businessId` and `storeId` from the existing authenticated user context while preserving `userId`. Canonical Product scope wins on server operations. |
| G. Legacy Product compatibility | TRANSITIONAL | Products without scope fields resolve through the authenticated user's Business/Store context. Random request-supplied scope is not accepted as fallback for normal callers. Existing legacy fields remain. |
| H. POS authority | IMPLEMENTED | `posSale` now uses the reusable server resolver before changing stock or creating sale projections. Requested Business/Store IDs are validation inputs only. |
| I. Inventory authority | IMPLEMENTED | `inventoryAdjust` now uses the same resolver before changing Product stock or writing inventory movements. |
| J. Product scope immutability | IMPLEMENTED | Normal Product updates cannot change `businessId`, `storeId`, `userId`, or legacy ownership fields. Stock remains server-authoritative. |
| K. Product creation rule boundary | IMPLEMENTED | Product create rules validate supplied canonical Business/Store references against canonical documents and caller/approved-owner context. |
| L. Legacy identity fields | LEGACY | `userId`, `shopOwnerUid`, `shopOwnerId`, and `sellerId` were retained. They remain compatibility/projection fields, not a replacement for server scope resolution. |
| M. Seller modes | TRANSITIONAL | ONLINE, OFFLINE, and HYBRID compatibility was preserved. Full seller-mode implementation was not attempted. |
| N. Management capabilities | TRANSITIONAL | BASIC, PARTIAL, and FULL remain separate metadata/capability concepts; no management-matrix implementation was started. |
| O. Admin behavior | IMPLEMENTED | Admin claims remain supported by the resolver and rules. Admin bypass is limited to the existing admin definition; no browser admin IDs are trusted. |
| P. Focused security tests | IMPLEMENTED | Added static STEP 3A-1 contract checks covering resolver wiring, canonical references, Product creation fields, and immutable Product scope; existing STEP 3A-0 authority checks continue to pass. |
| Q. Runtime/emulator verification | BLOCKED | No authenticated Firebase Emulator/live Firestore test was run in this environment. Therefore User A/User B, wrong-store, wrong-business, forged-owner, admin, and legacy Product runtime cases are not claimed as passed. |
| R. Scope hard stop | IMPLEMENTED | Work stops at STEP 3A-1 pending review. |

## Files changed for STEP 3A-1

- `functions/business-store-authority.js` — reusable Admin SDK Business/Store/Product resolver.
- `functions/inventory-authority.js` — resolver integrated into `posSale` and `inventoryAdjust`.
- `js/app/08-app-state.js` — canonical scope fields added to primary Product creation.
- `js/app/15-pos-sales.js` — canonical scope fields added to offline Product creation.
- `firestore.rules` — smallest relevant Product scope validation and immutable-scope changes.
- `tools/test_step3a1_business_store_authority.mjs` — focused static contract test.
- `tools/test_step3a0_authority.mjs` — updated expectation for the expanded immutable Product-field list.

## Authority behavior

1. The browser may send `businessId` or `storeId` as a requested context, but the server compares it to Product/user/canonical document context.
2. For canonical Products, Product scope is authoritative and mismatches are rejected.
3. For legacy Products, scope comes from the authenticated user's existing canonical context; a caller cannot invent a scope in the request.
4. Business and Store documents must exist and satisfy ownership/linkage checks.
5. The resolver preserves legacy owner identity fields for compatibility and returns the resolved owner for sale/ledger projections.

## Verification performed

Passed:

- `node tools/test_step3a1_business_store_authority.mjs`
- `node tools/test_step3a0_authority.mjs`
- JavaScript syntax checks for the new resolver, inventory authority, callable index, and both Product creation files.
- The available `npm test` sequence passed its preceding static contracts but stopped at the pre-existing missing dependency: `ERR_MODULE_NOT_FOUND: Cannot find package 'jsdom'` from `tools/test_negotiation_dom.mjs`.

Not claimed:

- Authenticated Firebase Emulator tests.
- Live Firestore tests.
- Full runtime User A/User B security matrix.

## Classification summary

- **IMPLEMENTED:** A, B, C, D, E, F, H, I, J, K, O, P, R
- **TRANSITIONAL:** G, M, N
- **LEGACY:** L
- **BLOCKED:** Q
- **MISSING:** None within the authorized STEP 3A-1 implementation scope; runtime security verification remains blocked by unavailable emulator/auth test execution.

**Hard stop:** STEP 3A-1 is complete to the tested/static level described above. Awaiting review before any next step.
