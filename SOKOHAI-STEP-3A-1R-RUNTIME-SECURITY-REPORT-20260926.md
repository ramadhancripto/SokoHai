# SokoHai STEP 3A-1R — Runtime Security Verification Report
## 2026-09-26

## 1. Environment

- Workspace: `/home/user/sokohai`
- Node.js: `v20.20.2`
- Java: OpenJDK 11.0.4
- Firebase project used by existing emulator scripts: `demo-sokohai`
- Configured emulator ports in `firebase.json`:
  - Firestore: `127.0.0.1:8085`
  - Auth: `127.0.0.1:9099`
- Existing canonical resolver preserved and inspected:
  - `functions/business-store-authority.js`
- Existing emulator-oriented security utilities found:
  - `tools/test_phase1_security.mjs`
  - `tools/test_phase2_security.mjs`
  - `tools/test_phase3_security.mjs`

## 2. Emulator availability

Runtime verification is **BLOCKED** before test data creation.

Exact environment findings:

```text
$ command -v firebase
(no output)

$ firebase --version
/bin/bash: line 1: firebase: command not found

$ npx --no-install firebase-tools --version
npm error npx canceled due to missing packages and no YES option: ["firebase-tools@15.31.0"]
```

The repository has Firebase emulator configuration and emulator test scripts, but the Firebase CLI is not installed or available locally. The required emulator services therefore could not be started safely.

No production dependency was installed. No production code was changed to work around the missing CLI.

## 3. Exact commands executed

Environment discovery:

```bash
find . -maxdepth 2 -name 'firebase.json' -o -name 'package.json' -o -name '*emulator*' -o -name '*firestore*' | sort
cat firebase.json
cat package.json
cat functions/package.json
command -v firebase || true
firebase --version
java -version
npx --no-install firebase-tools --version
```

Existing emulator-gated security checks:

```bash
node tools/test_phase1_security.mjs
node tools/test_phase2_security.mjs
```

Both correctly reported that `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST` are required. They did not run against production.

Available static checks:

```bash
node tools/test_step3a1_business_store_authority.mjs
node tools/test_step3a0_authority.mjs
node --check functions/business-store-authority.js
node --check functions/inventory-authority.js
```

Static result:

```text
STEP 3A-1 Business/Store authority contract: all checks passed
STEP 3A-0 authority contract: all checks passed
```

## 4. Controlled test data

Not created because the Auth and Firestore emulators could not be started.

The planned data model was:

```text
users/userA
businesses/businessA
stores/storeA
products/productA

users/userB
businesses/businessB
stores/storeB
products/productB
```

No production or live Firestore data was touched.

## 5. Runtime security cases

Because no emulator/auth runtime was available, every runtime case is explicitly **BLOCKED**, not PASS.

| Case | Expected result | Actual result | Status |
|---|---|---|---|
| User A valid context | Accept | Not executed; emulator unavailable | BLOCKED |
| User A → Business B | Reject | Not executed; emulator unavailable | BLOCKED |
| User A → Store B | Reject | Not executed; emulator unavailable | BLOCKED |
| User A → Product B | Reject | Not executed; emulator unavailable | BLOCKED |
| Cross-business Store | Reject | Not executed; emulator unavailable | BLOCKED |
| Forged `ownerUid` | Reject / ignore forged authority | Not executed; emulator unavailable | BLOCKED |
| Forged Business/Store IDs | Reject | Not executed; emulator unavailable | BLOCKED |
| Canonical Product scope | Reject mismatched request | Not executed; emulator unavailable | BLOCKED |
| Legacy Product resolution | User A resolves; User B rejects | Not executed; emulator unavailable | BLOCKED |
| POS unauthorized mutation | No stock, sale, or movement mutation | Not executed; emulator unavailable | BLOCKED |
| Inventory unauthorized mutation | Reject with no stock/movement mutation | Not executed; emulator unavailable | BLOCKED |
| POS idempotency | One sale, one movement, one stock mutation | Not executed; emulator unavailable | BLOCKED |
| Product scope immutability | Client update rejected | Not executed; emulator unavailable | BLOCKED |
| Product stock immutability | Client update rejected | Not executed; emulator unavailable | BLOCKED |
| Admin existing bypass | Verify existing claim mechanism only | Not executed; emulator unavailable | BLOCKED |

## 6. Static verification status

```text
STATIC PASS
```

The existing STEP 3A-1 resolver contract and STEP 3A-0 authority contract passed. JavaScript syntax checks for the canonical resolver and inventory authority passed.

These static results do not establish runtime security and are not converted into runtime PASS results.

## 7. Production code modification status

```text
Production code modified: NO
Business/Store resolver modified: NO
Duplicate resolver created: NO
```

No architecture rewrite, resolver change, rule change, Product opening-stock work, variant work, online-order inventory work, Services, Usafir, Discover, Dashboard, Chat, SokoPay, payment, delivery, or unrelated fix was made during this verification step.

No `tools/test_step3a1_runtime_security.mjs` was created because the required emulator/auth runtime could not be started; creating a test without its required runtime would not provide verification.

## 8. Final compact result table

```text
STEP 3A-1R RUNTIME SECURITY

Case                                      Result
--------------------------------------------------
User A valid context                     BLOCKED
User A → Business B                      BLOCKED
User A → Store B                         BLOCKED
User A → Product B                       BLOCKED
Cross-business Store                     BLOCKED
Forged ownerUid                          BLOCKED
Forged Business/Store                    BLOCKED
Canonical Product scope                  BLOCKED
Legacy Product resolution                BLOCKED
POS unauthorized mutation                BLOCKED
Inventory unauthorized mutation          BLOCKED
POS idempotency                          BLOCKED
Product scope immutability               BLOCKED
Product stock immutability               BLOCKED
Admin existing bypass                    BLOCKED
```

STEP 3A-1R BLOCKED — RUNTIME SECURITY NOT VERIFIED
