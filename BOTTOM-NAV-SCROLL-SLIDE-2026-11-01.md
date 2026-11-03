# Bottom Nav — Scroll Slide (Facebook style)

**Date:** 2026-11-01 · **Branch:** `improve/phase1-audit-upload-fix` (uncommitted)

Bottom nav inajificha wakati mtu anashuka chini, na inarudi wakati anavuta juu — kama Facebook.

## Iliyobadilika

| Faili | Kilichoongezwa |
|---|---|
| `js/app/08-app-state.js` | `skhBottomNavAutoHide()` (~75 lines) — scroll listener, rAF-throttled, passive |
| `css/01-core.css` | `.bottom-area-wrapper` transition + `.nav-slide-hidden` (`@media max-width:1024px` pekee) |
| `tools/bottom_nav_verify.mjs` | 12 checks kwenye build halisi |
| `tools/bottom_nav_shots.mjs` | screenshots 4 (imeonekana / imefichwa / imerudi / katikati ya slide) |

## Kanuni zilizowekwa (kwa makusudi)

1. **Kila mara inaonekana karibu na juu** (scrollY ≤ 60px) — mtu asishangae upau umetoweka ukurasa unaanza.
2. **Ukurasa usioweza kuscroll → haifichwi kamwe.**
3. **Mwisho wa ukurasa → inarudi** (tolerance 80px), kwa sababu picha za feed zinapoanza kuonekana hubadilisha urefu wa ukurasa; mtu asikose kitufe cha mwisho.
4. **Hysteresis 8px** — mienendo midogo ya kidole haina kutetemesha upau.
5. **Inaficha baada ya kushuka 120px**, sio mara moja.
6. **`transform` pekee** — `padding-bottom` ya body haibadiliki, kwa hiyo hakuna layout shift na hakuna maandishi yanayofunikwa.
7. **Inarudi kwenye** `hashchange`, `orientationchange`, na kugusa `.nav-tab` / `.sell-action-fab` — hivyo haikosekani baada ya kubadilisha ukurasa.
8. **`prefers-reduced-motion`** → hakuna animation (kuficha/kuonyesha papo hapo).
9. **Desktop (≥1025px) haibadiliki** — upau ulikuwa unafichwa tayari na kanuni ya 40-ui-refinement.

Kifuto cha "Uza" (`+`) kiko ndani ya `.bottom-area-wrapper`, kwa hiyo kinaenda na upau — kama ilivyo kwenye app za simu.

## Uthibitisho (build halisi, 390×844)

`node tools/bottom_nav_verify.mjs` → **12/12 checks passed**
- inaonekana mwanzoni, ina transition ya 0.22s
- inashuka chini → imefichwa kabisa (top ≥ viewport, hakuna kipande kinachobaki)
- kuvuta juu → inarudi, iko chini kabisa (identity transform)
- baada ya kurudi inagusa vizuri (tab ya Bidhaa inafanya kazi)
- juu ya ukurasa → inaonekana; mwisho wa ukurasa → inaonekana
- hakuna horizontal overflow; `padding-bottom` ya body inabaki (hakuna kuruka)
- desktop 1440 → tab strip bado imefichwa kama ilivyokuwa

Regressions: `ads_phase1_verify` **30/30**, `ads_task01_verify` **18/18**, `ads_studio_rebuild_verify` **74/74** — marketplace na Ads Studio hazijaguswa.

Screenshots: `audit-shots/nav-01-visible-top.png`, `nav-02-hidden-scrolling-down.png`, `nav-03-returned-on-scroll-up.png`, `nav-04-mid-slide.png`.
