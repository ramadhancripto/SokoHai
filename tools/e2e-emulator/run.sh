#!/usr/bin/env bash
# [REPAIR 2026-10] Browser E2E on the LOCAL EMULATOR (no production, no real money).
# Terminal 1:  firebase emulators:start --only firestore,auth --project demo-sokohai
# Terminal 2:  cd functions && FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
#              GCLOUD_PROJECT=demo-sokohai SUPER_ADMIN_EMAILS=owner@sokohai.test PORT=5055 node local-server.js
# Terminal 3:  bash tools/e2e-emulator/run.sh
# Optional: SKH_FIREBASE_SDK_DIR=/path/to/node_modules/firebase  (offline copy of firebase@10.8.1)
# The run WIPES the emulator data (demo-sokohai only). Screenshots: tools/e2e-emulator/out/e2e/
set -e
cd "$(dirname "$0")"
curl -sf http://127.0.0.1:8085/ >/dev/null || { echo "Firestore emulator not running on 127.0.0.1:8085"; exit 2; }
curl -sf http://localhost:5055/ >/dev/null || { echo "functions/local-server.js not running on :5055"; exit 2; }
mkdir -p out/e2e
node push-rules.cjs ../../firestore.rules
for s in s1 s2 s3 s4 s5 s6 s7; do node "$s.cjs"; done 2>&1 | grep -v MetadataLookupWarning | tee out/e2e-results.txt
! grep -q '^FAIL' out/e2e-results.txt
