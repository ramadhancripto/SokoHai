# SokoHai — Orodha ya mambo yako (setup, maamuzi, idhini)

Code iko tayari kwa kila kipengele hapa chini. Kilichobaki ni **funguo zako, akaunti za watoa huduma,
maamuzi ya sera na idhini yako**. Admin Control Center → **Muhtasari → "Usanidi wa nje"** inaonyesha
(ndiyo/hapana tu, bila siri) kipi kimeshawekwa kwenye server.

Mpangilio unaopendekezwa: A → B → C → D → E.

## A. GitHub na build (dakika 5)

1. Fungua `_sokohai-local\WEKA-KWENYE-MAIN.bat`. Inaleta commits zote za R14–R16 kwa fast-forward tu,
   inaweka backup `backup/main-before-20261113`, inakuuliza **Y/N** kabla ya kusukuma, haitumii force.
2. **Netlify imesimamishwa (paused):** tarehe 2026-11-13 `sokohai.com` na `www.sokohai.com` zote zinaonyesha
   "Site not available — This site was paused as it reached its usage limits". Hili ni suala la **billing/plan
   kwenye akaunti yako ya Netlify** — ni wewe tu unaweza kuliamua (kupandisha plan au kusubiri kipindi kipya).
   Sijabadilisha DNS wala domain. Baada ya site kurudi, Netlify itajenga yenyewe kutoka main
   (`node tools/build_dist.mjs --minify --check`, imethibitishwa kupita) — angalia Deploys kwamba commit ni ile
   iliyochapishwa na bat.

## B. Firebase (inahitaji idhini yako ya deploy)

**Tahadhari:** `.firebaserc` ina mradi mmoja tu — `default: sokonet-3b847`, ambao code inautambua kama
**PRODUCTION** (`PRODUCTION_PROJECT_ID`). Hakuna mradi wa staging bado. `firebase deploy` bila `--project`
ingeenda production. Hatua:

1. Firebase Console → Add project → mf. `sokohai-staging` (Blaze plan inahitajika kwa Functions).
2. `firebase use --add` → chagua `sokohai-staging` → alias `staging`.
3. Thibitisha lengo kabla ya kila deploy: `firebase use staging` kisha `firebase projects:list` / `firebase use`.
4. Staging pekee:

```
firebase deploy --only firestore:rules --project staging
firebase deploy --only functions --project staging
```

5. Production (`sokonet-3b847`) **tu baada ya idhini yako ya maandishi**.

Functions mpya za R15–R16: `pushRegisterToken, pushUnregisterToken, pushSetPrefs, pushOnNotification,
orderWalletPay, groupBuyCommitJoin, groupBuyLeave, groupBuyCancel, groupBuySettleNow, groupBuySweep (kila dakika 15),
adminGroupBuyList, adminSetGroupBuyPolicy, verificationSubmit, adminVerificationQueue, adminVerificationDocUrls,
adminVerificationDecide, adminSetupStatus`. Rules mpya: `push_tokens`, `push_prefs`, `group_buy_commits`,
`verification_requests`, `orders.paymentRef` (WLT_ ni ya server tu).

Weka anwani yako kwenye `SUPER_ADMIN_EMAILS` (functions env) ili uwe Super Admin.

## C. Funguo na akaunti za watoa huduma

| # | Kitu | Unachofanya | Kinawasha |
|---|---|---|---|
| C1 | **PesaPal sandbox** | developer.pesapal.com → akaunti ya sandbox → consumer key/secret. Kwenye functions env: `PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET`, `PESAPAL_BASE_URL=https://cybqa.pesapal.com/pesapalv3`, `PESAPAL_REDIRECT_URL=https://<domain>/`. Deploy, sajili IPN (`PESAPAL_IPN_URL=https://<region>-<project>.cloudfunctions.net/pesapalIpn`), weka `PESAPAL_IPN_ID`. | Malipo ya kadi/M-Pesa kupitia PesaPal (majaribio). Wallet ya SokoPay inafanya kazi tayari bila hii. |
| C2 | **PesaPal live** | Baada ya sandbox kupita: funguo za live + `PESAPAL_BASE_URL=https://pay.pesapal.com/v3` **kwenye mradi wa production pekee** (server inazuia live kwenye mradi mwingine). | Pesa halisi |
| C3 | **Cloudinary signed** | Dashboard → Upload presets → preset **signed** (formats/size). Env: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_SIGNED_PRESET`, kisha `CLOUDINARY_UPLOAD_MODE=signed` na zima preset ya unsigned. | Upakiaji salama wa picha zote **na hati za utambulisho** (bila hii, hati za utambulisho zinakataliwa kwa makusudi). |
| C4 | **Push (FCM)** | Firebase Console → Cloud Messaging → Web Push certificate → nakili *public* VAPID key → `<meta name="skh-fcm-vapid" content="B...">` kwenye `html/00-head.html` → `python3 tools/build_html.py build`. Washa FCM API (V1). Env `SKH_PUSH_ENABLED=1`. | Arifa za simu |
| C5 | **Barua pepe ya kubadili nenosiri** | Authentication → Settings → Authorized domains: ongeza domain. Templates → Password reset → Action URL `https://<domain>/`. | Kubadili nenosiri kwa barua pepe halisi |
| C6 | **TURN (na SFU baadaye)** | Mtoa huduma wa TURN (coturn/Twilio/Cloudflare/Metered). Weka `window.SKH_ICE` au `<meta name="skh-ice" content='[{"urls":"turn:...","username":"...","credential":"..."}]'>`. Maelezo: `docs/live/TURN-SFU-SETUP.md`. | Live video kati ya mitandao tofauti (4G ↔ Wi-Fi) |

## D. Maamuzi ya sera (code iko tayari, inasubiri uamuzi wako)

| # | Uamuzi | Hali ya sasa (salama) | Ukiamua |
|---|---|---|---|
| D1 | **Group Buy: pesa halisi wakati wa kujiunga** (`escrow_commit`) | Imezimwa. Hali ni `pay_after_target`: hakuna pesa inayotoka mpaka lengo lifikiwe, kisha wanachama wanalipa ndani ya saa 48. | Admin Control Center → Group Buy → **Idhinisha pesa halisi** (Super Admin pekee, sababu inahitajika, inaandikwa audit). |
| D2 | Group Buy: saa za kulipia / wanachama wa juu / siku za kampeni | 48 / 100 / 14 | Badilisha kwenye tab ya Group Buy. |
| D3 | **Refund kurudi kwenye kadi/M-Pesa** (PesaPal refund API) | Refund zote zinarudi kwenye **SokoPay wallet** (imejaribiwa). | Ukitaka refund ya PesaPal, nitaiunganisha baada ya kupata API na sera (nani analipa ada). |
| D4 | **Oda za kikundi ndani ya Group Chat** (pesa) | `adminSetEscrowPolicy` inakataa `chatGroupOrders: true`. | Uamuzi wa sera + idhini. |
| D5 | **Matangazo ya kulipia + mgao wa mapato kwa admin wa kundi** | Matangazo ya wanachama yanapita kwenye idhini ya admin wa kundi (rules); malipo na mgao havijawashwa. | Bei, muda, asilimia ya mgao. |
| D6 | Kitufe cha "Weka Oda" | **Imeamuliwa (R16):** ikoni inabaki; jaribio sasa linathibitisha `aria-label`, focus ya kibodi na kwamba Enter inaweka bidhaa kwenye kikapu. E2E #29 inapita. | — |
| D7 | Muuzaji kwenye kadi ya bidhaa | **Imeamuliwa (R16):** hakuna jina la muuzaji/tathmini mbele ya kadi; taarifa za muuzaji ziko kwenye ukurasa wa bidhaa. | — |
| D8 | Mapping ya kategoria 12 za zamani | Ramani inatumika kwenye code tangu `0767ee6`; jaribio la R4 linadai zisiunganishwe (5/8). Pendekezo: `docs/D8-LEGACY-CATEGORY-PROPOSAL.md`. | Chagua kwa kila mstari: Baki / Pendekezo / Isiunganishwe. |
| D9 | Ofa/matangazo kwenye push | OFF kwa chaguo-msingi | ON/OFF |

## E. Majaribio ya mkono baada ya A–C

Fuata "Mpangilio wa kwanza wa majaribio" kwenye `SOKOHAI-R16-FINAL-REPORT.md`.
Kwa sandbox: lipa oda ndogo kwa PesaPal sandbox → hakikisha oda inakuwa *held* baada ya IPN (si kabla).
