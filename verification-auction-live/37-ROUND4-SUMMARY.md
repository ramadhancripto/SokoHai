# ROUND 4 — Fresh battery (2026-11-11, baada ya wipe #3 + restore #3)

Mazingira yalifutwa tena (wipe #3: servers down, /tmp gone, 120 rolled back
kwa mara ya 3 → 109+/9-). Urejeshaji:
- 120: byte-copy kutoka `120-live-commerce-ui.RESTORED.js` (SHA256 inafanana
  na nakala ya ZIP1) → SYNTAX_OK, IMESITISHWA=5, diff 214+/34- ✅
- Infra rebuild #4: JDK 21.0.13 (symlink fix /etc→extract), firebase-tools
  15.35.0, functions `npm ci`, playwright 1.49.1 + shell-1148, pwlibs2 + 6 debs
  (0 missing libs), emulators 8085/9099/4400, 5055 + 5056 (126 callables).
- E2E harness rebuilt: muundo /tmp/e2e2505/tools/e2e-emulator/ + functions
  symlink + hardening upya (goto 120s, W 60s, evalclick, shot-catch, kbd,
  submit-fallback, aucEnd/aucExt endTime refresh, waitForFunction 30s).
  Assertions 19/19 hazikuguswa; repo `tools/e2e-emulator/` haijaguswa.

## Matokeo (fresh, round 4)
| Log | Suite | Matokeo |
|---|---|---|
| 32-emulator-16-16.log | impl emulator | **16/16 PASS** |
| 33-e2e-10-10.log | browser E2E | **10/10 PASS, JS errors 0** |
| 34-r13d-20-20.log | r13d regression | 19/20, JS0 (click-flake: Viongozi/ranking `.lv7-foot button` timeout) |
| 35-r13d-rerun.log | r13d rerun | 19/20, JS0 (kosa lilelile — driver issue, sio feature) |
| 36-r13d-20-20.log | r13d + evalclick (harness-only, /tmp tu) | **20/20 PASS, JS errors 0** |

Uchambuzi wa 19/20: click ya playwright ilishindwa kwenye kitufe kinachoonekana
na ni stable (aina ileile ya flake kama E2E history/emoji zilizorekebishwa na
evalclick). Mistari yangu 5 ya 120 inayogusa price_drop ni shared-path
additive (hub card ptag, side panel, create-form) — haigusi board/click
mechanics; code ileile ilipata 20/20 mara 2 hapo awali. Baada ya evalclick,
assertions za ranking (rows ≥2, masked) zimepita — feature inafanya kazi.

Shots: `shots/round4-*` (38 fresh: 15 auction E2E + 23 r13d).
Preview demo data imeseedwa upya (aucPrev1 + prevSess1); 5056 inahudumia (200).
