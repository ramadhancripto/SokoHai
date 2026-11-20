# SokoHai: production readiness

**Date:** 20 November 2026
**Branch:** `remediation/final-20261120`
**Base:** `origin/main` fe8b8a3

This report covers what can be shown locally, what was shown in the emulator, what was observed in production, and what still depends on the owner.

## 1. Verified locally, without Firebase

- **`npm test`: 117/117 commands.** These are unit and contract tests: pricing, taxonomy, cards, outbox, store, canonical domain, callable names, category scenes, deploy config and others.
- **Builds:**
  - `build_html.py check`: index.html is byte-exact from `html/`.
  - `build_dist.mjs --minify --check`: CSS/JS token equality.
- **Browser contracts: 36/36** (`tools/*browser*.mjs`). These run the real UI with mock cloud or emulator at 320 / 390 / 768 / 1280 / 1440 px.
  - Checks include no horizontal overflow, no broken images and no page errors.

## 2. Verified in the Firebase emulator (Firestore + Auth, project `demo-sokohai`, functions through `local-server.js`)

- **Security and rules: 39 suites, all passing.**
  - Phase 1–3 security, repair rules (139), inventory rules, conversation, ride privacy, listing trust, chat security, group chat (90), group business (33).
  - **Archive enforcement (13, new).**
- **Money paths, with no real money:**
  - wallet pay (8), dispute refund (7), group buy (12);
  - PesaPal checkout/settlement logic, with the network mocked or refused before contacting PesaPal;
  - escrow release (E2E).
- **Inventory:** reservation (27), decimal quantity, POS sale (E2E 15).
- **Delivery and transport:**
  - routing (69), cancellation race, handover, token verify;
  - pilot ops (13), including the fixed offer-expiry sweep.
- **Full E2E:** 56/56 steps on phone + desktop.
- **Navigation:** 56/56.
- **Journeys R13–R16:** all 22 runs (11 journeys × phone/desktop) pass after the test-timing fix. `r13h` phone failed once (details in `FINAL-TEST-RESULTS.md`).
- **Owner card style and header/cards:** 360 / 390 / 1440 px.
- **Firebase environment isolation:** 10/10 hosts. Production hosts reach only production; previews and unknown hosts are blocked; staging never falls back to production.

## 3. Observed in production (read-only, from the owner's browser, 20 Nov 2026)

| Check | Result |
|---|---|
| `https://sokohai.com` | **Does not load.** Domain not connected. |
| `https://sokohaicom.netlify.app` | Loads. It serves an **older build**: no `data-skh-env`, so the environment gate is not deployed. Canonical = `sokohaicom.netlify.app`. |
| `europe-west1-sokonet-3b847.cloudfunctions.net/sitemapXml` | **HTTP 404** |
| `…/pesapalIpn` | **HTTP 404** |
| `us-central1-…` | Unreachable |

**Conclusion:** none of the server work in this repository, including R-18 enforcement, is live. Production currently runs an older frontend without working Cloud Functions.

## 4. Requires deployment or external credentials

1. **Netlify deploy** of the current `main` (after this branch is merged). Without it the live site keeps the old build.
2. **Cloud Functions + rules + indexes deploy:** owner action D-1.
   - Needs: Blaze plan, `functions/.env.sokonet-3b847`, PesaPal keys.
3. **Domain:** owner action D-2.
   - Netlify custom domain + DNS + certificate.
   - Firebase authorized domains.
   - Then `tools/set_canonical_domain.mjs`.
4. **`/sitemap.xml` routing** after functions are live (D-3).
5. **PesaPal:**
   - sandbox on staging first;
   - live keys and IPN registration (D-5).

## 5. Remaining risks

| Risk | Level | Mitigation |
|---|---|---|
| Production frontend is old (no env gate, older card / rules client) | High | Deploy current `main` to Netlify after merge; check `data-skh-env="production"` |
| Functions not deployed: payments, wallet, order release, POS reports, comments and uploads fail live | High | D-1, staging first |
| Firestore rules on production unknown (cannot be read without credentials) | High | Deploy rules with functions (D-1); `production_readonly_audit.mjs` once credentials exist |
| PesaPal live never exercised with real money | High (payments) | D-5: small live payment and refund before launch |
| Canonical domain not live; SEO split between two netlify.app names | Medium | D-2 |
| Group Soko "Soko" highlight removed by the 9ca6ad2 rail design | Low (design) | D-4 |
| Machine translation and offline-member sign-in have no server function (fallbacks exist) | Low | D-7 |

**Overall:** the repository is ready for a **staging deploy**. It is **not production-ready** until D-1, D-2 and D-5 are done and the sandbox journey in `docs/SOKOHAI-DEPLOY-FIREBASE-HATUA.md` (Hatua 6) passes on staging.
