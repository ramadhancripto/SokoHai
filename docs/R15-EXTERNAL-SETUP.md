# SokoHai R15 — Usanidi wa nje unaohitajika (owner action)

Haya ni mambo ambayo code yake iko tayari na imejaribiwa kwenye emulator, lakini **hayawezi kufanya kazi
kwa watumiaji halisi** mpaka mmiliki aweke funguo/huduma za nje. Hakuna funguo iliyobuniwa, hakuna malipo
yaliyoigwa kuwa halisi, na hakuna deploy iliyofanyika bila idhini.

| # | Mfumo | Kinachohitajika | Nani | Hali ya code |
|---|---|---|---|---|
| 1 | Push notifications (FCM) | Web Push certificate (VAPID) + `SKH_PUSH_ENABLED=1` + deploy | Mmiliki | Tayari, emulator 9/9 + UI 5/5 |
| 2 | Kubadili nenosiri (barua pepe halisi) | Authorized domain + Action URL ya template | Mmiliki | Tayari, E2E 9/9 (emulator) |
| 3 | PesaPal sandbox | Funguo za sandbox + IPN ID (`docs/SOKOPAY-DEPLOY.md` §3) | Mmiliki | Tayari, stub L1–L6 41/41 |
| 4 | Live video kati ya mitandao | TURN (na SFU kwa watazamaji wengi) | Mmiliki | Mesh WebRTC tayari; `docs/live/TURN-SFU-SETUP.md` |
| 5 | Group Buy ya pesa halisi kwenye chat | Uamuzi wa sera + idhini | Mmiliki | Imezimwa kwa makusudi |
| 6 | PWA kwenye simu halisi | Kujaribu "Add to Home screen" kwenye Android/iOS | Mmiliki | Tayari, E2E 8/8 |

---

## 1. Push notifications (FCM)

**Kilichopo:** `functions/push.js` (pushRegisterToken, pushUnregisterToken, pushSetPrefs, pushOnNotification),
`js/app/126-push.js` (paneli "Arifa za simu" ndani ya *Taarifa Zako*), `sokohai-sw.js` (push + notificationclick),
rules: `push_tokens` hazisomeki/hazibadilishwi na browser; `push_prefs` mmiliki anasoma tu.

Hatua:
1. Firebase Console → Project settings → **Cloud Messaging** → *Web Push certificates* → **Generate key pair**.
   Nakili *public key* (VAPID). Hii si siri (inatumika kwenye browser), lakini usiweke *private key* popote kwenye repo.
2. Weka public key kwenye `html/00-head.html` (kisha `python3 tools/build_html.py build`):
   `<meta name="skh-fcm-vapid" content="B...">`
3. Hakikisha **Firebase Cloud Messaging API (V1)** imewashwa kwenye Google Cloud Console ya mradi.
4. Kwenye `functions/.env` (au secrets) ongeza `SKH_PUSH_ENABLED=1`. Bila hii trigger haitumi chochote.
5. Deploy (kwa idhini yako tu): `firebase deploy --only firestore:rules,functions:pushRegisterToken,functions:pushUnregisterToken,functions:pushSetPrefs,functions:pushOnNotification,hosting`.
6. Jaribio: fungua SokoHai ya mtandaoni kwenye Android Chrome → *Taarifa Zako* → **Washa** → ruhusu.
   Kisha kutoka akaunti nyingine weka oda → simu ipokee arifa hata app ikiwa imefungwa; kuigusa kunafungua *Taarifa Zako*.

Chaguo-msingi: oda, malipo, usafirishaji, ujumbe, minada = **ON**; ofa/matangazo = **OFF** (uamuzi wako unahitajika
kama ubadilishwe). iOS: push ya wavuti inafanya kazi tu baada ya mtumiaji kuongeza SokoHai kwenye Home Screen (iOS 16.4+).

## 2. Kubadili nenosiri kwa barua pepe halisi

**Kilichopo:** `doResetPassword` (ujumbe usiofichua kama akaunti ipo, kikomo cha dakika 1 kwa kifaa) na ukurasa
wa ndani `?mode=resetPassword&oobCode=…` (nenosiri jipya ≥ 8, kuthibitisha, link moja = matumizi moja).

Hatua:
1. Firebase Console → Authentication → Settings → **Authorized domains**: ongeza domain ya SokoHai (mf. `sokohai.co.tz`).
2. Authentication → Templates → *Password reset* → **Customize action URL** → `https://<domain-yako>/` (app inashika `mode` na `oobCode` yenyewe).
3. (Hiari) Badilisha lugha/maandishi ya barua pepe kuwa Kiswahili kwenye template hiyo hiyo.
4. Jaribio: omba link kwa akaunti yako → fungua barua pepe → link ifungue SokoHai → weka nenosiri jipya → ingia.

## 3. PesaPal sandbox (majaribio, si pesa halisi)

Fuata `docs/SOKOPAY-DEPLOY.md` §3 na §6. Kwa ufupi:
1. Fungua akaunti ya **sandbox** kwenye developer.pesapal.com, chukua consumer key/secret za sandbox.
2. `functions/.env` (au secrets): `PESAPAL_BASE_URL=https://cybqa.pesapal.com/pesapalv3`, key/secret za sandbox,
   `PESAPAL_REDIRECT_URL`, kisha baada ya deploy sajili IPN (`PESAPAL_IPN_URL=.../pesapalIpn`) na weka `PESAPAL_IPN_ID`.
3. **Usichanganye** sandbox na live: mradi wa majaribio uwe tofauti na wa uzalishaji au angalau `.env` tofauti.
4. Jaribio la sandbox: oda ndogo → PesaPal sandbox → IPN → server (`pesapalIpn` + `GetTransactionStatus`) ndiyo inaweka
   `paid`. Browser haiwezi kuweka `paid` (imethibitishwa na rules + majaribio ya money adversarial).

Haijaunganishwa (uamuzi wako): **refund kupitia PesaPal** (kurudisha pesa kwenye kadi/M-Pesa ya mnunuzi). Leo
mgogoro ukiamuliwa `refund_buyer`, pesa inarudi kwenye **SokoPay wallet** ya mnunuzi (imejaribiwa: V-D13).
Kuunganisha refund ya PesaPal kunahitaji API yao ya refund + idhini yako ya sera (nani analipa ada, muda gani).

## 4. Live video kati ya mitandao tofauti

Soma `docs/live/TURN-SFU-SETUP.md`. Leo kamera ya muuzaji → mtazamaji inafanya kazi kwenye mtandao mmoja
(imethibitishwa kwa browser halisi). Kwenye 4G ↔ Wi-Fi tofauti **haitafanya kazi kwa uhakika bila TURN**.
Hatua: chagua mtoa huduma wa TURN (coturn yako au huduma kama Twilio/Cloudflare/Metered), weka ICE servers
kupitia `window.SKH_ICE` au `<meta name="skh-ice">` (maelezo kwenye doc). Kwa watazamaji wengi (> ~4) SFU inahitajika.
**Hatudai** kwamba live inafanya kazi kwenye mtandao wa umma mpaka jaribio la §"Acceptance test" lifanyike.

## 5. Group Buy (pesa halisi) — uamuzi unasubiriwa

- Inayofanya kazi: Group Buy ya **bidhaa** (`saleMode: group_buy`, server `groupBuyJoin`), imejaribiwa kwenye emulator.
- Imezimwa kwa makusudi: oda za kikundi zinazoanzishwa **ndani ya chat** zenye pesa. `adminSetEscrowPolicy`
  inakataa `chatGroupOrders: true`; UI inaonyesha "BLOCKED".
- Maamuzi yanayohitajika kabla ya kuwasha: (a) pesa inakaa escrow mpaka lengo lifikiwe? (b) lengo lisipofikiwa —
  refund ya wallet moja kwa moja? (c) nani anabeba ada? (d) muda wa juu wa kampeni? (e) kikomo kwa kila mnunuzi?

## 6. PWA kwenye simu halisi

Imethibitishwa (Chromium): manifest sahihi (icons 192/512), service worker inasajiliwa, app inafunguka bila mtandao,
ukurasa wa "Hakuna mtandao" ukikosekana cache, malipo/auth/API havihifadhiwi, toleo jipya linaonyesha "Pakia upya".
Jaribu mwenyewe: Android Chrome → menyu → *Install app*; iOS Safari → Share → *Add to Home Screen*;
washa Airplane mode → fungua SokoHai → app ifunguke (bidhaa mpya hazitaonekana mpaka mtandao urudi).
