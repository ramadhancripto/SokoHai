# SOKOHAI — UPDATE REPORT HADI 2026-09-26

## 1. Muhtasari

Hadi sasa kazi imefanyika katika maeneo mawili:

1. **Repair ndogo ya production/UI**
2. **Step 1 deep audit + architecture mapping**

Hakuna Step 2 implementation ya Business/Store/Inventory/Dashboard/Discover iliyoanza.

## 2. Repair iliyofanywa hasa

### File

```text
js/94-modal-stack.js
```

### Mabadiliko

Selector ya `isCandidate()`/modal stack ilikuwa:

```js
'.overlay-menu,[id$="Modal"],[id$="Form"],,.skh-sheet-overlay'
```

Imebadilishwa kuwa:

```js
'.overlay-menu,[id$="Modal"],[id$="Form"],.skh-sheet-overlay'
```

### Verification

- Repository-wide malformed selector scan: `0` remaining occurrences.
- `node --check js/94-modal-stack.js`: passed.
- Hakuna modal manager mpya iliyoundwa.
- Modal architecture haikuandikwa upya.

**Muhimu:** `js/94-modal-stack.js` ilikuwa tayari na mabadiliko mengine ya awali yanayohusiana na Discover-removal. Repair hii ililenga selector pekee; mabadiliko hayo ya awali hayakurejeshwa wala kuboreshwa.

## 3. Production Functions/CORS audit

### Functions zilizokaguliwa

```text
functions/ads-delivery.js
functions/index.js
functions/local-server.js
js/app/00-bootstrap.js
js/app/96-ad-delivery-controller.js
js/app/02-checkout.js
```

### Findings

`adsRequestDelivery` ni:

```js
onCall({ region: REGION, enforceAppCheck: false }, requestDelivery)
```

`pesapalCheckout` ni:

```js
onCall({ region: REGION }, async (req) => { ... })
```

Kwa hiyo zote ni Firebase callable functions, si ordinary `onRequest` HTTP handlers.

Local server ina shared origin/CORS handling inayotambua:

```text
https://sokohaiworld.netlify.app
```

Haikuongezwa duplicate CORS middleware kwenye callable functions.

### Production probes

Origin iliyotumika:

```text
https://sokohaiworld.netlify.app
```

Matokeo ya mwisho yaliyothibitishwa:

```text
OPTIONS adsRequestDelivery -> 404
POST    adsRequestDelivery -> 404
OPTIONS pesapalCheckout    -> 404
POST    pesapalCheckout    -> 404
```

Kwa hiyo production Functions/CORS haijatangazwa kuwa fixed. Deployment/restoration ya callable endpoints bado inahitajika.

### PesaPal logic iliyohifadhiwa

Hakuna mabadiliko yaliyofanywa kwenye:

- consumer key/secret logic
- PesaPal base URL
- amount calculation
- redirect/merchant reference logic
- transaction status verification
- IPN
- escrow/payment evidence
- settlement/release authority

### Ads logic iliyohifadhiwa

Hakuna mabadiliko yaliyofanywa kwenye:

- campaign eligibility
- targeting
- placements
- frequency/cooldown/fatigue
- delivery leases
- tracking/analytics
- Ads business rules

## 4. Step 1 audit na architecture mapping iliyoongezwa

### Main report

```text
SOKOHAI-STEP1-DEEP-PRODUCTION-AUDIT.md
```

Ina:

- complete architecture tree
- file structure
- module-by-module mapping
- collections and source-of-truth map
- Auth/security audit
- Business/Store audit
- Product/Variant/Inventory audit
- POS/Sales audit
- Order/Payment/SokoPay/PesaPal audit
- Delivery/Custody/Token audit
- Chat/Negotiation audit
- Discover/Search audit
- Taxonomy audit
- Location/media audit
- UI/design-system audit
- duplication risks
- security risks
- production gaps
- recommended build sequence
- files that must not be touched yet
- likely Step 2 files

### Supporting architecture documents

```text
SOKOHAI-STORE-ARCHITECTURE.md
SOKOHAI-SELLER-MODE-SPEC.md
SOKOHAI-INVENTORY-ARCHITECTURE.md
SOKOHAI-DISCOVER-ARCHITECTURE.md
SOKOHAI-SOURCE-OF-TRUTH-MAP.md
```

### Main audit conclusions

- Existing Product, Order, Payment, Delivery, Chat, Auth and Ads systems are real reusable authorities.
- No confirmed canonical `businesses` source was found.
- No confirmed canonical `stores` source was found.
- Product-to-store relationship is currently mostly implicit through user/seller fields.
- Inventory is not yet one consolidated server-authoritative ledger.
- Some client paths update `products.stock` directly.
- Seller mode exists as `online_only`, `offline_only`, `hybrid`.
- Management level is not yet cleanly separated from seller mode.
- Historical Discover implementation is removed/disabled from active script loading, while search/location/action infrastructure remains.
- No universal active Discover projection/index was confirmed.
- No canonical Place/Landmark privacy model was confirmed.

## 5. Files created for documentation

```text
SOKOHAI-STEP1-DEEP-PRODUCTION-AUDIT.md
SOKOHAI-STORE-ARCHITECTURE.md
SOKOHAI-SELLER-MODE-SPEC.md
SOKOHAI-INVENTORY-ARCHITECTURE.md
SOKOHAI-DISCOVER-ARCHITECTURE.md
SOKOHAI-SOURCE-OF-TRUTH-MAP.md
SOKOHAI-UPDATE-REPORT-20260926.md
```

These are documentation/audit files only. They do not create runtime features.

## 6. Package files created

### Audit-only package

```text
/home/user/SokoHai-step1-audit-20260926.zip
```

Contains the Step 1 audit reports and manifest.

### Full project package

```text
/home/user/SokoHai-full-step1-repaired-20260926.zip
```

Contains the current full workspace source, including the repaired selector and existing systems.

Excluded from the full package:

- `.git`
- `node_modules`
- `.env` files
- credentials/service-account files
- private keys
- emulator artifacts
- build/cache directories
- previous ZIP archives

Package verification:

```text
unzip -t: passed
```

## 7. Tests and verification run

- JavaScript syntax check for `js/94-modal-stack.js`: passed.
- Full existing `npm test` suite: passed in the earlier repair/audit session.
- Ads delivery regression suite: passed.
- Functions resilience tests: passed.
- Malformed selector scan: passed, zero remaining.
- Production OPTIONS/POST probes: both named endpoints returned 404.
- Full ZIP integrity check: passed.

Local Functions server could not fully start in the workspace because Firebase credentials or a running emulator were unavailable.

## 8. What has NOT been updated

Hadi sasa hakuna mabadiliko mapya yaliyofanywa kwenye:

- Firestore rules
- Firestore indexes
- Auth architecture
- Business/Store implementation
- Inventory schema or migration
- Dashboard rewrite
- Discover rewrite
- Taxonomy rewrite
- POS rewrite
- Product source-of-truth implementation
- Order implementation
- SokoPay/PesaPal business logic
- Delivery/custody/token implementation
- Chat/Groups/Live
- Ads business logic
- Navigation architecture

## 9. Current status

```text
STEP 1 DEEP AUDIT: COMPLETE
MODAL SELECTOR REPAIR: COMPLETE
PRODUCTION FUNCTIONS AVAILABILITY: UNRESOLVED (404)
BUSINESS/STORE IMPLEMENTATION: NOT STARTED
INVENTORY REWRITE: NOT STARTED
DASHBOARD REWRITE: NOT STARTED
DISCOVER REBUILD: NOT STARTED
```

## 10. Next step

Hakuna Step 2 itakayoanza bila review/approval ya audit hii.

Step 2 inayopendekezwa ni scope ndogo ya:

```text
Business/Store contract
+ ownership mapping
+ seller-mode compatibility
+ legacy migration plan
```

Bila kuanza Dashboard rewrite, Inventory rewrite, POS rewrite au Discover rewrite kwa pamoja.
