#!/usr/bin/env bash
# ============================================================
# SOKOHAI — Tuma Cloud Functions (europe-west1, project
# sokonet-3b847). Hati hii inarekebisha tatizo la CORS/404
# linalotokea functions zisipokuwa zimetumwa:
#   "No 'Access-Control-Allow-Origin' header ... commentsEvidence"
#
# Matumizi:
#   bash scripts/deploy-functions.sh            # tuma functions zote
#   bash scripts/deploy-functions.sh comments   # tuma za maoni tu
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT="sokonet-3b847"
REGION="europe-west1"

echo "==> 1. Kagua firebase CLI"
if ! command -v firebase >/dev/null 2>&1; then
  echo "firebase CLI haipo. Sakinisha: npm i -g firebase-tools"
  echo "Kisha ingia:        firebase login"
  exit 1
fi

echo "==> 2. Kagua kuingia (firebase login)"
if ! firebase projects:list >/dev/null 2>&1; then
  echo "Hujaingia. Endesha: firebase login"
  exit 1
fi

echo "==> 3. Tayarisha vitegemezi vya functions/"
( cd functions && npm install --no-audit --no-fund )

echo "==> 4. Kagua .env (siri za PesaPal; hiari kwa functions za maoni)"
if [ ! -f functions/.env ]; then
  echo "ONYO: functions/.env haipo — PesaPal haitafanya kazi, lakini"
  echo "maoni/usafirishaji/negotiation zitatumwa. Nakili:"
  echo "  cp functions/.env.example functions/.env  # kisha hariri"
fi

if [ "${1:-}" = "comments" ]; then
  echo "==> 5. Tuma functions za MAONI tu"
  firebase deploy --only "functions:commentsEvidence,functions:commentsPublish,functions:commentsLike,functions:reviewsPublish,functions:commentsModerate" --project "$PROJECT"
else
  echo "==> 5. Tuma functions ZOTE (region $REGION)"
  firebase deploy --only functions --project "$PROJECT"
fi

echo "==> 6. Hakiki CORS (lazima ionekane Access-Control-Allow-Origin)"
sleep 3
curl -s -i -X OPTIONS \
  -H "Origin: https://sokohaitz.netlify.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" \
  "https://${REGION}-${PROJECT}.cloudfunctions.net/commentsEvidence" | head -n 12

echo ""
echo "IMEMALIZIKA. Kama jibu lina 'access-control-allow-origin: *' (au origin yako),"
echo "tatizo la CORS limekwisha. Fungua upya tovuti (Ctrl+Shift+R)."
