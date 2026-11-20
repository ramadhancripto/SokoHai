# SokoHai: ripoti ya vipimo vya marekebisho

**Tarehe:** 20 Nov 2026
**Tawi:** `remediation/consolidated-20261120`
**Baseline:** `origin/main` 9ca6ad2

## Mazingira

- Kila kitu kilikuwa local:
  - Firebase emulator: Firestore 8085, Auth 9099, project `demo-sokohai`;
  - `functions/local-server.js` kwenye port 5055;
  - Chromium (Playwright).
- **Hakuna ombi lolote lililoenda production** (`sokonet-3b847`), Netlify wala PesaPal.
- Firebase web SDK 10.8.1 ilitolewa kutoka nakala ya local (`SKH_FIREBASE_SDK_DIR`) kwa sababu gstatic haifikiki hapa.

## Matokeo

| Kundi | Amri | Matokeo |
|---|---|---|
| Unit / contract | `npm test` (kila amri peke yake) | **112/112 zimepita** (baseline: 104/112) |
| E2E kamili (emulator, simu + desktop) | `tools/e2e-emulator/run.sh` | **56/56 zimepita**, EXIT=0 |
| Navigation | `test_nav_system.cjs` | **56/56 zimepita** |
| Journeys za R14 hadi R16 (simu + desktop) | service, transport, order, group_buy, account_recovery, pwa, push_ui, live_camera, auction_admin | **Zote zimepita** (18/18 runs) |
| Rules na emulator suites | phase1/2/3 security, repair, commerce modes, admin authority, user cards, upload signing, inventory rules (44), conversation, inventory reservation (27), seller lifecycle, decimal quantity, ride privacy, ride migration, listing trust, trust badges (35), group chat rules (90), auction ×3, price drop, live/stories/group soko, chat security (59), group business rules (33), push, dispute refund, order wallet pay, group buy lifecycle, identity verification, r16 server fixes | **Zote zimepita** |
| Kadi za mmiliki (mpya) | `test_owner_card_style.cjs` @360, 390, 1440 | **PASS** |
| Kadi na header | `test_ui_header_cards.cjs` | **PASS** |
| Kutenganisha mazingira | `test_env_isolation_browser.cjs` (hosts 10) | **10/10** |
| Browser contracts | `tools/*browser*.mjs` (36) | **32/36** (tazama hapa chini) |
| Build | `build_html.py check`; `build_dist.mjs --minify --check` | **OK / OK** |

## Vipimo vinavyoshindwa: vyote vipo kwenye baseline au ni vya mazingira

| Kipimo | Matokeo | Kwenye baseline 9ca6ad2? | Sababu |
|---|---|---|---|
| `test_r13g_group_chat.cjs` | 5/8 | **Ndiyo, 5/8 sawasawa** | Tabs za Media, Group Orders na Chat zimefichwa (`#gsgTabs` visibility hidden) hadi paneli ya info ifunguliwe. Muundo huu ulikuja na merge ya 9ca6ad2. Kipimo hakijasasishwa. |
| `test_r13h_group_business.cjs` | 3/13 | **Ndiyo, 3/13 sawasawa** | Ni hali ileile ya UI ya group (sidebar / tabs) |
| `test_category_filter_emulator.mjs` | 5/8 | **Ndiyo** | Mapping ya legacy "Afya" → CAT-19 dhidi ya matarajio ya kipimo. Haimo kwenye CI. D8 haikuguswa. |
| `test_product_compare_browser.mjs` hatua 12 | 1 inashindwa | **Ndiyo** | Safu "Transactions (POS)" |
| `test_seller_photo_editor_browser.mjs` | haianzi | Mazingira | Fixture png haipo kwenye repo |
| `test_taxonomy_all_leaf_browser.mjs` | haianzi | Mazingira | `execution-queue.json` haijatengenezwa |
| `test_terminology_stage_b_browser.mjs` | haianzi | Mazingira | Njia ngumu `/home/user/SokoHai` |

## Vipimo vilivyosasishwa: kwa nini, na kwa nini si "kuficha kasoro"

- **Contracts za kadi** (commerce_cards, product_card_visual, popular_rail, market_rails, natural_product_grid, waterfall_feed, home_product_archive, ui_header_cards):
  - Muundo umebadilika kwa uamuzi wa mmiliki: fremu ya 4:3, eneo na "Bado tathmini" vimeondolewa, ⭐ iko kulia.
  - Assertions mpya **zinapima muundo mpya kwa ukali uleule**: fremu, contain, urefu sawa, hakuna overflow, hakuna ⭐ ya uongo, bei kushoto.
  - `ui_header_cards` sasa inashindwa ikiwa safu ya Home haina kadi. Awali ilipita bila kadi yoyote.
- **Contracts zilizopitwa na wakati** (product_foundation, delivery_choice, unified_ad_designer, admin_control_center): zilikuwa zinashindwa kwenye baseline kwa sababu ya mabadiliko ya awali ya code. Kila moja ina maoni ya sababu.
- **Hakuna assertion ya usalama, rules wala pesa iliyolegezwa.**

## Kinachothibitishwa na `test_owner_card_style.cjs`

Kipimo hiki kinaendesha app halisi kwenye emulator, kwa simu (360, 390) na desktop (1440), kwa bidhaa, huduma na usafiri:

- chip ya kategoria juu kushoto; ♡ juu kulia; "Imethibitishwa" chini kulia (kwa walio verified tu);
- ⭐ halisi upande wa kulia, mstari mmoja na bei; hakuna ⭐ iliyobuniwa;
- picha nzima (contain) ndani ya fremu ya 4:3;
- mpangilio wa Home: Bidhaa, Huduma, Usafiri;
- bidhaa iliyofichwa haionekani;
- hakuna scroll ya pembeni na hakuna JS errors.
