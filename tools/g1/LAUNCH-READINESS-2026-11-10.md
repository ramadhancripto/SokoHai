# SokoHai — Launch Readiness (2026-11-10)

> Hiisi ni ripoti ya **ukaguzi wa kiufundi**, sio tamko la "iko tayari 100%".
> Kila namba hapa chini ina hesabu na ushahidi unaoweza kukaguliwa tena.

## 1. Matokeo kwa ufupi

| Kipimo | Thamani |
|---|---|
| **Readiness (jumla)** | **80.0%** |
| Code-readiness (A–C, bila owner gates) | 100% |
| Battery | 736 pass / 0 fail / 1 known-env |
| Browser regression | 20 / 20 |
| Server-surface coverage | 111 / 111 exports |

**Tafsiri:** codebase iko **launch-ready** — kila test ya kiotomatiki ni kijani
na kila server export ina funiko. Kilichobaki ni **hatua 4 za mmiliki**
(taz. §5) ambazo agent haruhusiwi kuzifanya (deploy, prod data, live IPN).

## 2. Mbinu (methodology — inayokaguliwa)

```
Readiness = 0.45×A + 0.10×B + 0.25×C + 0.20×D
```

| Sehemu | Uzito | Inapimwaje (amri halisi) |
|---|---|---|
| A. Battery | 45% | `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-sokohai-g1 SKH_URL=http://127.0.0.1:5055 node tools/g1/run_battery.mjs` → `BATTERY_TOTAL pass=736 fail=0 known_env=1`; alama = pass/(pass+fail), known_env (T14) imetengwa kwa sababu ni ya kimazingira (suite ina-hardcode project `demo-sokohai` badala ya `demo-sokohai-g1`) — sio kushindwa kwa bidhaa. |
| B. Browser | 10% | `node tools/dev_server.mjs 8080` + `SKH_URL=http://127.0.0.1:8080/ node tools/g1/test_browser_regression.mjs` (inahitaji `LD_LIBRARY_PATH=/home/user/pwlibs/usr/lib/x86_64-linux-gnu`) → 20/20, pageerrors=0. |
| C. Server-surface | 25% | `grep -o "exports\.[A-Za-z0-9_]*" functions/index.js \| sort -u` = 111 exports; kila moja: ama ina behavior-test kwenye `tools/` AU imehakikiwa na tripwire ya K4 (`tools/g1/test_3k_final_sweep.mjs` K4.1: onCall+auth-gate AU onSchedule/onDocument/onRequest). Siku ya ripoti: 111/111. |
| D. Owner gates | 20% | Orodha ya §5: kila geti lililofanywa na mmiliki = 25%. Siku ya ripoti: 0/4. |

**Hesabu:** 0.45×100 + 0.10×100 + 0.25×100 + 0.20×0 = **80.0%**.

## 3. Ushahidi kwa awamu (battery 2026-11-10)

| Suite | Matokeo | Inachunguza |
|---|---|---|
| test_phase1_security | 57/0 | sheria za msingi |
| test_phase3_security | 34/0 | sheria za awamu ya 3 |
| test_repair_rules | 139/0 | marekebisho ya rules |
| test_commerce_modes | 13/0 | modes za biashara |
| test_admin_agent_authority | 9/0 | mamlaka ya admin/wakala |
| test_user_cards | 18/0 | kadi za watumiaji + audit |
| test_upload_signing | 11/0 | upakiaji salama |
| test_inventory_rules | 44/0 | sheria za stoo |
| test_conversation_rules | 8/0 | sheria za mazungumzo |
| test_g1_access_control | 86/0 | udhibiti wa ufikiaji |
| test_fix8_service_orders | 20/0 | oda za fundi (rules) |
| test_phase7_server_lifecycle | 41/0 | lifecycle ya oda |
| test_phase7_pesapal_stub | 11/0 | PesaPal (stub) |
| test_phase5_withdrawal | 13/0 | utoaji wa pesa |
| test_phase5_evidence | 9/0 | ushahidi wa malipo |
| test_phase5_client | 16/0 | mteja wa malipo |
| test_phase6_negotiation | 7/0 | majadiliano |
| test_phase8_pos | 6/0 | POS |
| test_phase9_boost | 7/0 | boost/matangazo |
| test_phase10_market | 5/0 | soko |
| test_phase1_write_conformance | 32/0 | uandishi sahihi |
| test_phase2_core_release | 22/0 | release ya msingi |
| test_phase3_transport | 13/0 | usafiri |
| test_delivery_lifecycle | 9/0 | lifecycle ya delivery |
| test_transport_market | 6/0 | soko la usafiri |
| test_live_commerce | 7/0 | biashara live |
| test_category_assets | 6/0 | mali za kategori |
| test_discover_modeprice | 5/0 | discover/bei |
| test_service_orders (SV) | 5/0 | I-I1: fundi pay-flow |
| test_business_os (BOS) | 25/0 | J-J1: mialiko ya staff |
| test_3k_final_sweep (3K) | 12/0 | agent/nego/delivery + tripwire |

Jumla: **736/0/1-known-env** (T14 — ya kimazingira, sio ya bidhaa).

## 4. Mapengo yaliyofungwa (awamu 3H–3K)

- **I-I1 (3I):** oda za fundi ziliundwa `held` bila malipo (uongo wa escrow)
  → sasa `awaiting_payment` + malipo ya wallet/PesaPal-wiring + settle.
  Ushahidi: SV 5/5 + FIX8 20/20 (I-I1 guard: fundi hawezi kuunda `held` moja kwa moja).
- **J-J1 (3J):** mmiliki hakuweza kuonboard staff (shop_staff text-only;
  shopOwnerUid admin-or-self tu) → mialiko ya kodi yenye server-authoritative
  create/accept/revoke/remove + UI (staff tab + mode menu) + indexes.
  Ushahidi: BOS 25/25.
- **FIX8-stale:** test ya zamani ilitarajia `held`-at-create (pre-I-I1)
  → imesasishwa kufuata semantics za I-I1 + kesi mpya ya escrow-lie guard.
- **3K sweep:** callables 29 zilizobaki bila test → zimefunikwa (K1 agent/PIN/
  lockout/session 7, K2 negotiation 2, K3 delivery booking/dispute 2,
  K4 tripwire ya aina+auth kwa zote 29).

## 5. Owner-action checklist (D — ndiyo inayoshusha readiness hadi 80%)

Mmiliki afanye kwa mpangilio huu (project: `sokonet-3b847`):

1. **Deploy rules + indexes + functions + hosting**
   ```bash
   firebase use sokonet-3b847
   firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
   ```
2. **Backfill ya false completions** (oda zilizokwama `completed` bila escrow release):
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/owner-key.json node tools/g1/owner_backfill_false_completions.mjs
   # kagua orodha, kisha:
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/owner-key.json node tools/g1/owner_backfill_false_completions.mjs --fix --confirm
   ```
3. **Live-IPN proof (PesaPal):** muamala mmoja halisi wa jaribio →
   thibitisha `pesapalIpn` inaandika paymentRef + settle inahamishia held/delivered.
   (Emulator haiwezi kuthibitisha IPN hai — hii ndiyo sababu ya "pending dependency".)
4. **Sitemap redirect target:** Netlify `/sitemap.xml` kwa sasa ni SPA-fallback;
   amua URL halisi ya sitemap kisha weka redirect. (Sio kizuizi cha malipo.)

Baada ya 1–3, readiness inapanda hadi **95%** (D=3/4); baada ya 4 → **100%**.

## 6. Mipaka ya ripoti hii

- Agent hajafanya deploy, hajagusa prod data, hajafanya live PesaPal —
  kwa makusudi na kwa idhini ya mmiliki.
- Credential/provider-gated features zinabaki "pending dependency".
- Faili zote za ushahidi ziko kwenye workspace (`tools/g1/`, battery output hapo juu).
