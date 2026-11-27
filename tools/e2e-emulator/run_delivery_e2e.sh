#!/usr/bin/env bash
# ============================================================================
# tools/e2e-emulator/run_delivery_e2e.sh
# [PART 5B-1 2026-11-25] Delivery workflow — BROWSER E2E runner.
#
# Runs tools/e2e-emulator/test_delivery_e2e.cjs in REAL Chromium against the
# local Firebase stack:
#   • Firestore + Auth emulators (demo-* project, isolated, wiped at start)
#   • functions/local-server.js (runs the REAL functions/index.js — same code
#     as production: routing-core.js, routing-logic.js, custody callables)
#   • the real app (index.html + js/app/*.js) served by local-server.js
#
# NOT part of `npm test` (needs Playwright + emulators + local-server).
#
# The suite runs in three stages (same emulator data, one stage per process) so
# a slow machine cannot blow a single timeout:
#   1 main      — customer creates the delivery request, server routing, offers,
#                 Request Inbox DOM, accept click, second provider refused,
#                 ranked queue (decline → promotion → late accept refused)
#   2 custody   — seller handover, transporter pickup (token), transit, complete,
#                 order↔ride consistency, no money docs
#   3 failures  — expired offer, cancellation, T-03 (ineligible providers get
#                 nothing)
#
# Usage:
#   bash tools/e2e-emulator/run_delivery_e2e.sh
# Vars: FIREBASE_BIN, SKH_E2E_PROJECT (default demo-sokohai), SKH_E2E_PORT,
#       SKH_FUNCTIONS_PORT (default 5055), SKH_E2E_STAGES
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/../.."

PROJECT="${SKH_E2E_PROJECT:-demo-sokohai}"
APP_PORT="${SKH_FUNCTIONS_PORT:-5055}"
export FIRESTORE_EMULATOR_HOST="${FIRESTORE_EMULATOR_HOST:-127.0.0.1:8085}"
export FIREBASE_AUTH_EMULATOR_HOST="${FIREBASE_AUTH_EMULATOR_HOST:-127.0.0.1:9099}"
export GCLOUD_PROJECT="$PROJECT"
export SKH_E2E_PROJECT="$PROJECT"
export SKH_APP_ORIGIN="http://127.0.0.1:${APP_PORT}"
export SKH_FUNCTIONS_URL="http://127.0.0.1:${APP_PORT}/__fn"
STAGES="${SKH_E2E_STAGES:-main custody failures}"

if [ ! -d node_modules/playwright ]; then
  echo "BLOCKED: playwright haipatikani (npm i -D playwright && npx playwright install chromium)" >&2
  exit 2
fi

running() { curl -sf "http://${1}/" >/dev/null 2>&1; }

EMU_PID=""
LS_PID=""
cleanup() {
  [ -n "$LS_PID" ] && kill "$LS_PID" 2>/dev/null
  [ -n "$EMU_PID" ] && kill "$EMU_PID" 2>/dev/null
}
trap cleanup EXIT

# ---- 1. emulators -----------------------------------------------------------
if ! running "$FIRESTORE_EMULATOR_HOST" || ! running "$FIREBASE_AUTH_EMULATOR_HOST"; then
  FB="${FIREBASE_BIN:-}"
  if [ -z "$FB" ]; then
    for c in ./node_modules/.bin/firebase /tmp/fbt14/node_modules/.bin/firebase; do
      [ -x "$c" ] && FB="$c" && break
    done
  fi
  [ -z "$FB" ] && FB="$(command -v firebase || true)"
  if [ -z "$FB" ]; then echo "BLOCKED: firebase-tools haipatikani (weka FIREBASE_BIN)." >&2; exit 2; fi
  echo "== starting emulators ($FB, project $PROJECT) =="
  "$FB" emulators:start --only firestore,auth --project "$PROJECT" > /tmp/skh-e2e-emulators.log 2>&1 &
  EMU_PID=$!
  for _ in $(seq 1 60); do
    running "$FIRESTORE_EMULATOR_HOST" && running "$FIREBASE_AUTH_EMULATOR_HOST" && break
    sleep 1
  done
fi

# ---- 2. local functions server (real functions/index.js) --------------------
if ! running "127.0.0.1:${APP_PORT}"; then
  echo "== starting functions/local-server.js on :${APP_PORT} =="
  ( cd functions && PORT="$APP_PORT" SKH_HOST=127.0.0.1 SKH_RUN_SCHEDULES= \
      node local-server.js > /tmp/skh-e2e-local-server.log 2>&1 ) &
  LS_PID=$!
  for _ in $(seq 1 60); do running "127.0.0.1:${APP_PORT}" && break; sleep 1; done
fi

TOTAL_PASS=0
TOTAL_FAIL=0
FAILED_STAGES=""
for stage in $STAGES; do
  echo ""
  echo "──────── stage: $stage ────────"
  SKH_E2E_PART="$stage" node tools/e2e-emulator/test_delivery_e2e.cjs
  rc=$?
  line=$(grep -E "^DELIVERY BROWSER E2E: [0-9]+ pass" tools/e2e-emulator/out/delivery-e2e.log | tail -1)
  p=$(printf '%s' "$line" | sed -n 's/.*: \([0-9]\+\) pass.*/\1/p')
  f=$(printf '%s' "$line" | sed -n 's/.* \([0-9]\+\) fail.*/\1/p')
  TOTAL_PASS=$((TOTAL_PASS + ${p:-0}))
  TOTAL_FAIL=$((TOTAL_FAIL + ${f:-0}))
  [ "$rc" -ne 0 ] && FAILED_STAGES="$FAILED_STAGES $stage"
done

echo ""
echo "========================================"
echo "DELIVERY BROWSER E2E (total): ${TOTAL_PASS} pass, ${TOTAL_FAIL} fail"
[ -n "$FAILED_STAGES" ] && echo "FAILED STAGES:$FAILED_STAGES"
echo "========================================"
[ -n "$FAILED_STAGES" ] && exit 1
exit 0
