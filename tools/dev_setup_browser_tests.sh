#!/usr/bin/env bash
# ============================================================================
# tools/dev_setup_browser_tests.sh
# ----------------------------------------------------------------------------
# HUENDA HITAJIKA MARA MOJA KWA KILA KIKAO: sandbox hii haihifadhi node_modules/
# wala ~/.cache/ms-playwright/ (haziko kwenye snapshot). Skripti hii inarudisha
# mazingira ya majaribio ya browser bila kubadilisha msimbo wa app.
#
# Matumizi:   bash tools/dev_setup_browser_tests.sh
# Kisha:      LD_LIBRARY_PATH=/tmp/libs2/usr/lib/x86_64-linux-gnu:/tmp/libs2/lib/x86_64-linux-gnu \
#             node tools/test_dashboard_data_integrity.mjs
# ============================================================================
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

echo "[1/3] playwright@1.49.1 (dev dependency ya majaribio)"
if [ ! -f node_modules/playwright/package.json ]; then
  npm i playwright@1.49.1 --no-audit --no-fund >/dev/null 2>&1 || { echo "npm install imeshindikana"; exit 1; }
fi
echo "      ok: node_modules/playwright"

echo "[2/3] chromium (playwright cache)"
if [ ! -d "$HOME/.cache/ms-playwright" ]; then
  npx playwright install chromium >/dev/null 2>&1 || echo "      (onyo: download imeshindikana — angalia mtandao)"
fi
echo "      ok: $HOME/.cache/ms-playwright"

echo "[3/3] maktaba za mfumo (Debian) → /tmp/libs2"
if [ ! -f /tmp/libs2/usr/lib/x86_64-linux-gnu/libnss3.so ]; then
  mkdir -p /tmp/deb /tmp/libs2
  ( cd /tmp/deb || exit 1
    for p in libnss3 libnspr4 libatk1.0-0t64 libatk1.0-0 libatk-bridge2.0-0t64 libatk-bridge2.0-0 \
             libcups2t64 libcups2 libxdamage1 libxkbcommon0 libasound2t64 libasound2 \
             libatspi2.0-0t64 libatspi2.0-0 libavahi-common3 libavahi-client3; do
      apt-get download "$p" >/dev/null 2>&1 || true
    done
    for f in *.deb; do [ -e "$f" ] && dpkg -x "$f" /tmp/libs2; done )
fi
echo "      ok: /tmp/libs2"

echo
echo "Tayari. Tumia:"
echo "  export LD_LIBRARY_PATH=/tmp/libs2/usr/lib/x86_64-linux-gnu:/tmp/libs2/lib/x86_64-linux-gnu"
echo "  node tools/test_dashboard_data_integrity.mjs"
