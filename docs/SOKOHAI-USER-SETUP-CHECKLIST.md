# SokoHai — Orodha ya mambo yako (setup, maamuzi, idhini)

Code iko tayari kwa kila kipengele hapa chini. Kilichobaki ni **funguo zako, akaunti za watoa huduma,
maamuzi ya sera na idhini yako**. Admin Control Center → **Muhtasari → "Usanidi wa nje"** inaonyesha
(ndiyo/hapana tu, bila siri) kipi kimeshawekwa kwenye server.

Mpangilio unaopendekezwa: A → B → C → D → E.

## A. GitHub na build (dakika 5)

1. Fungua `_sokohai-local\WEKA-KWENYE-MAIN.bat`. Inaleta commits zote za R14–R16 kwa fast-forward tu,
   inaweka backup `backup/main-before-20261113`, inakuuliza **Y/N** kabla ya kusukuma, haitumii force.
2. Netlify itajenga yenyewe baada ya push. Angalia **Deploys** kwenye Netlify (build ni
   `node tools/build_dist.mjs --minify`; imethibitishwa kupita hapa).

## B. Firebase (inahitaji idhini yako ya deploy)

Kwenye mradi wa **staging** kwanza (si production):

```
firebase deploy --only firestore:rules --project <staging>
firebase deploy --only functions --project <staging>
```

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
| D6 | **Kitufe cha "Weka Oda"** kwenye ukurasa wa bidhaa | Ni ikoni tu (ina `aria-label="Weka oda"`). E2E #29 inadai maandishi yanayoonekana, kwa hiyo inashindwa kwa makusudi. | (a) Rudisha neno "Weka Oda" kwenye kitufe, **au** (b) niidhinishe kubadili jaribio litumie jina la accessibility. Sikubadili jaribio bila idhini yako. |
| D7 | **Muuzaji kwenye kadi ya bidhaa** | Kadi inaonyesha muuzaji + rating; contract test ya zamani inataka kadi bila muuzaji. | Chagua design moja, nitarekebisha upande mwingine. |
| D8 | **Mapping ya kategoria 12 za zamani** (mf. Michezo → CAT-26) | Haijabadilishwa (kanuni yako: hakuna kubadili ID/mapping bila idhini). Category filter 5/8. | Nipe ramani au idhinisha pendekezo. |
| D9 | Ofa/matangazo kwenye push | OFF kwa chaguo-msingi | ON/OFF |

## E. Majaribio ya mkono baada ya A–C

Fuata "Mpangilio wa kwanza wa majaribio" kwenye `SOKOHAI-R16-FINAL-REPORT.md`.
Kwa sandbox: lipa oda ndogo kwa PesaPal sandbox → hakikisha oda inakuwa *held* baada ya IPN (si kabla).
