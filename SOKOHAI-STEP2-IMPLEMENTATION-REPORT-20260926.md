# SOKOHAI STEP 2 IMPLEMENTATION REPORT

**Date:** 2026-09-26
**Scope:** Business / Store foundation, ownership mapping, seller mode normalization, management capability foundation, legacy compatibility.
**Status:** Implemented and tested locally at source level. Not deployed. No Step 3 started.

## 1. IMPLEMENTED

### 1A. Shared Business/Store context core

Added a dependency-free compatibility core that is used by browser code and packaged for Functions:

```text
shared/business-context-core.js
```

It provides:

- `normalizeSellerMode(value)`
- `normalizeManagement(input)`
- `resolveBusinessContext(uid, raw)`
- `hasBusinessEvidence(data)`
- canonical mode constants: `ONLINE`, `OFFLINE`, `HYBRID`
- canonical management levels: `BASIC`, `PARTIAL`, `FULL`
- one capability vocabulary

Legacy mappings:

```text
online_only  -> ONLINE
offline_only -> OFFLINE
hybrid       -> HYBRID
```

The resolver does not create records and does not infer ownership from names/email. It uses the authenticated UID passed by the caller and marks legacy-derived contexts as non-canonical until the server bridge persists them.

### 1B. Server-authoritative Business/Store bridge

Added:

```text
functions/business.js
```

Exported callable:

```text
businessEnsureContext
```

This callable:

- requires Firebase Auth;
- uses `req.auth.uid` as the only owner identity;
- ignores client-supplied `ownerUid`, `businessId`, `storeId`, `verificationStatus`, and `status`;
- creates/updates one owner-scoped Business document;
- creates/updates one owner-scoped Store document;
- preserves legacy profile identifiers such as `myShopCode`, `sellMode`, and `sellerType` as compatibility metadata;
- writes canonical `businessId`, `storeId`, `sellerMode`, and `management` references back to the authenticated user profile;
- preserves existing verification/status values instead of accepting them from the browser;
- rejects an existing Business/Store record owned by another UID;
- uses deterministic owner-scoped fallback IDs when no canonical reference exists, preventing repeated duplicate creation for the same owner.

### 1C. Browser context adapter

Added:

```text
js/app/20-business-context.js
```

Exposes:

```text
window.skhResolveBusinessContext()
window.skhEnsureBusinessContext(input)
skh.normalizeSellerMode
skh.normalizeManagement
skh.resolveBusinessContextFromData
```

The adapter is loaded once, after the existing role module and before logistics. It does not create a second dashboard, Product system, Store UI, Discover system, inventory system, or payment path.

### 1D. Existing seller onboarding integration

Modified:

```text
js/app/14-map-onboarding.js
```

The existing seller onboarding flow now:

- keeps writing the existing legacy profile fields;
- also stores canonical `sellerMode` and a separate `management` foundation with safe `BASIC` default;
- calls `businessEnsureContext` after the legacy profile save;
- reports clearly if the legacy save succeeds but canonical Business/Store synchronization fails;
- does not claim canonical success when the server bridge is unavailable.

No new onboarding flow was created.

### 1E. Firestore ownership boundaries

Modified:

```text
firestore.rules
```

Added explicit matches for:

```text
businesses/{businessId}
stores/{storeId}
```

Rules are intentionally conservative:

- authenticated owner/admin may read;
- browser writes are disabled;
- the callable/Admin SDK is the write authority;
- no security rule was weakened.

This rules change was required because new canonical collections cannot safely rely on the catch-all deny rule or direct browser writes.

### 1F. Shared Functions packaging

Modified:

```text
functions/build-shared.js
```

The predeploy packaging now copies both:

```text
shared/ads-design-rules.js
shared/business-context-core.js
```

into:

```text
functions/shared/
```

### 1G. Functions export and script loading

Modified:

```text
functions/index.js
html/21-scripts.html
index.html
package.json
```

Added the `businessEnsureContext` export, loaded the browser adapter/core exactly once, and added the focused test command to the package test suite.

## 2. FILES CREATED

```text
shared/business-context-core.js
functions/business.js
functions/shared/business-context-core.js
js/app/20-business-context.js
tools/test_business_store_context.mjs
SOKOHAI-STEP2-IMPLEMENTATION-REPORT-20260926.md
```

`functions/shared/business-context-core.js` is the generated Functions package copy produced by `npm run build:shared`.

## 3. FILES MODIFIED

```text
firestore.rules
functions/build-shared.js
functions/index.js
html/21-scripts.html
index.html
js/app/14-map-onboarding.js
package.json
```

The working tree already contained unrelated changes from earlier work. Those were not reverted. The files above include pre-existing modifications where applicable; this Step 2 added only the Business/Store-related additions described in this report.

## 4. FILES NOT TOUCHED BY THIS STEP

No Step 2 changes were made to:

- Product foundation or product data model
- Product variants
- Product stock mutation logic
- Inventory/POS transaction logic
- Cart or checkout logic
- PesaPal credentials, base URL, amount, verification, IPN or settlement
- SokoPay wallet/escrow logic
- Delivery/routing/custody/token logic
- Chat/negotiation/groups/live
- Ads business logic
- Auth core
- Discover implementation
- Firestore indexes
- Existing navigation/modal architecture

## 5. BUSINESS MODEL

Canonical Business documents are written under:

```text
businesses/{businessId}
```

Fields established by the server bridge include:

```text
businessId
ownerUid
businessName
businessType
categoryId
subcategoryId
description
sellerMode
management
verificationStatus
visibility
contactPolicy
status
legacyOwnerUid
legacyBusinessCode
createdAt
updatedAt
```

`ownerUid` always comes from authenticated Functions context.

## 6. STORE MODEL

Canonical Store documents are written under:

```text
stores/{storeId}
```

Fields include:

```text
storeId
businessId
ownerUid
storeName
storeLogo
storeCover
categoryId
subcategoryId
sellerMode
locationRef
openingHours
pickupAvailable
deliveryAvailable
verificationStatus
status
createdAt
updatedAt
```

Products, services, transport and orders were not copied into Store documents. Existing systems remain authoritative.

## 7. OWNERSHIP MODEL

```text
Firebase Auth uid
        ↓
Business.ownerUid
        ↓
Store.ownerUid + Store.businessId
```

The client cannot choose or override the authoritative owner. Existing documents owned by another UID are rejected by the callable.

Agent/offline-member ownership was not transferred. The agent remains a bridge/support role.

## 8. SELLER MODE MODEL

Canonical values:

```text
ONLINE
OFFLINE
HYBRID
```

Compatibility values remain accepted:

```text
online_only
offline_only
hybrid
```

Normalization is centralized in `shared/business-context-core.js`; conversion logic is not scattered through seller, dashboard, Product, POS, or Discover code.

## 9. MANAGEMENT MODEL

Canonical foundation:

```text
management: {
  enabled: true/false,
  level: BASIC | PARTIAL | FULL,
  capabilities: { ... }
}
```

Capabilities are normalized by one shared function. BASIC is the compatibility default for an existing seller onboarding setup. No full dashboard rendering or capability-based dashboard rewrite was started.

Seller mode and management level remain independent.

## 10. RESOLVER

The shared resolver is:

```text
resolveBusinessContext(uid, raw)
```

Browser entry point:

```text
window.skhResolveBusinessContext()
```

Server persistence entry point:

```text
businessEnsureContext
```

The resolver supports:

- authenticated user with no business;
- legacy seller/profile fields;
- canonical Business/Store references;
- explicit mode normalization;
- management capability normalization;
- ownership metadata;
- legacy source metadata.

It does not silently create duplicate records.

## 11. LEGACY COMPATIBILITY

Existing fields remain intact:

```text
userId
sellerId
shopOwnerUid
shopName
storeName
businessName
myShopCode
sellMode
sellerType
businessMode
```

Canonical fields are added as compatibility anchors:

```text
businessId
storeId
sellerMode
management
businessContextUpdatedAt
```

No destructive migration was executed.

## 12. MIGRATION STRATEGY

This step uses a non-destructive, owner-scoped migration bridge:

```text
legacy user profile
        ↓
server-authenticated businessEnsureContext
        ↓
canonical Business + Store
        ↓
legacy profile references updated
```

No production-wide backfill was executed. Existing Product, Order, POS and Inventory documents were not rewritten.

## 13. SECURITY

Implemented:

- Auth requirement on canonical write callable.
- Owner UID from `req.auth.uid` only.
- Client owner/business/store IDs stripped from the request.
- Verification/status not client-controlled.
- Existing owner mismatch rejected.
- Browser writes to `businesses` and `stores` denied.
- Existing Auth/Product/Payment/Delivery rules preserved.

Remaining security requirement:

- Deploy and run emulator/rules tests with real Firebase emulators before production activation.
- Review existing broad operational collection permissions in a separate security task; they were not expanded here.

## 14. TESTS

Run:

```text
node tools/test_business_store_context.mjs
node --check functions/business.js
node --check functions/index.js
node --check functions/build-shared.js
node --check js/app/20-business-context.js
node --check js/app/14-map-onboarding.js
npm run build:shared
npm run check:html
npm test
```

## 15. TEST RESULTS

- Business/Store context test: **22 checks passed**.
- JavaScript syntax checks: **passed**.
- Shared Functions packaging: **passed**.
- HTML build/check: **passed; byte-exact**.
- Full existing npm suite: **passed**.
- Existing Product, Order, Chat, Delivery, Ads and UI contract suites: **passed**.

Existing tests still print expected simulated fallback/error logs for unavailable Functions and mocked Firestore edge cases; the final test process exited successfully.

## 16. REGRESSIONS

No regression was observed in the existing automated suite.

The existing production Functions availability issue remains separate: earlier/live probes showed `adsRequestDelivery` and `pesapalCheckout` returning 404. This Step 2 did not claim those production endpoints fixed and did not alter their business logic.

## 17. REMAINING GAPS

- Production deployment has not been performed.
- Canonical Business/Store write behavior has not been verified against the deployed Firebase project.
- Emulator credential/runtime was unavailable in the workspace for full callable/rules integration testing.
- No full Dashboard capability renderer was implemented.
- No Inventory/POS rewrite was implemented.
- No Discover rebuild was implemented.
- Existing legacy Business/Store records have not been bulk migrated.
- Public Store/Business visibility projection is intentionally not enabled by rules yet.

## 18. BLOCKERS

### Blocker: live verification/deployment

**Why:** The new callable and rules must be deployed and tested against Firebase before production claims are made.

**Exact areas:**

```text
functions/business.js
functions/index.js
firestore.rules
```

**Risk:** Deploying without emulator/live verification could expose environment or index/rules issues.

**Alternative used:** Source-level tests, syntax checks, shared packaging checks and full existing regression suite. No deployment was performed.

## 19. DISCOVER STATUS

Not rebuilt.

The Business/Store foundation now provides references that future Discover can project, but no Discover collection, index, UI, or search engine was added.

## 20. INVENTORY STATUS

Not rewritten.

No stock field, variant model, reservation system or inventory mutation logic was changed. Store documents only provide the future relationship boundary.

## 21. POS STATUS

Not rewritten.

Existing POS behavior remains intact. The existing direct stock-write risk remains documented and is outside this Step 2 scope.

## 22. PAYMENT STATUS

Not changed.

PesaPal/SokoPay/escrow/verification/IPN/settlement implementation was preserved.

## 23. READY FOR STEP 3

**NO — not yet.**

The foundation is source-tested, but it requires review plus deployment/emulator verification before proceeding to a broader capability/dashboard phase.

## 24. IMPORTANT CHANGE RECORD

| File | Symbol | Old behavior | New behavior | Why |
|---|---|---|---|---|
| `shared/business-context-core.js` | `normalizeSellerMode` | Mode mappings were scattered/legacy-only | One canonical ONLINE/OFFLINE/HYBRID normalization | Prevent mode drift |
| `shared/business-context-core.js` | `resolveBusinessContext` | No shared Business/Store resolver | Normalized owner-scoped context with legacy mapping | Establish foundation without duplicate UI logic |
| `functions/business.js` | `businessEnsureContext` | No canonical owner-scoped Business/Store write path | Authenticated, transactional Business/Store bridge | Persist foundation safely |
| `functions/index.js` | `businessEnsureContext` export | Callable unavailable | Existing Functions entrypoint exposes bridge | Keep one Functions deployment |
| `firestore.rules` | `businesses`, `stores` matches | Catch-all deny/no explicit model | Owner/admin read; browser writes denied | Protect canonical records |
| `js/app/20-business-context.js` | browser adapter | No shared frontend context API | One resolver and callable wrapper | Reuse across future dashboard/store/search work |
| `js/app/14-map-onboarding.js` | `saveShopSetup` | Legacy profile only | Legacy save plus canonical bridge and explicit error state | Compatibility migration without destructive rewrite |
| `html/21-scripts.html`, `index.html` | script loading | No context core/adapter | Core and adapter loaded once | Make foundation available to active app |
| `functions/build-shared.js` | shared packaging | Ads rules only | Ads rules plus Business/Store core | Keep browser/server normalization aligned |
| `package.json` | test suite | No Business/Store contract test | Focused test included in full suite | Regression coverage |

**STOP: Step 2 only.**
