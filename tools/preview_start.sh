#!/usr/bin/env bash
# SokoHai preview — huirudisha kwenye port 8080 baada ya sandbox mpya.
#   bash tools/preview_start.sh
set -e
cd "$(dirname "$0")/.."
# 1) dist/ na node_modules/ HAZIHIFADHIWI kwenye snapshot -> jenga upya
node tools/build_dist.mjs
# 2) soname symlinks za Playwright libs (pwlibs) zinaweza kukosekana
python3 - <<'PY'
import os, re
d = '/home/user/pwlibs/x86_64-linux-gnu'
if os.path.isdir(d):
    pat = re.compile(r'^(lib.+)\.so\.(\d+)((?:\.\d+)*)$')
    for f in os.listdir(d):
        m = pat.match(f)
        if not m: continue
        for link in (f'{m.group(1)}.so.{m.group(2)}', f'{m.group(1)}.so'):
            p = os.path.join(d, link)
            if not os.path.exists(p):
                try: os.symlink(f, p)
                except OSError: pass
PY
# 3) server
exec node tools/dev_server.mjs 8080
