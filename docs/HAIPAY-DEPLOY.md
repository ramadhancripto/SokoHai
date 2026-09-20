# HaiPay / SokoHai — KUPANDA LIVE (Firebase)

Hii ni hatua ya mwisho: kupeleka mfumo **live** kwenye Firebase yako halisi
(`sokonet-3b847`) — kwa Cloud Functions, Security Rules na Indexes.

> **Ukweli muhimu:** App yako TAYARI imeunganishwa na Firebase yako (project
> `sokonet-3b847` ina data halisi). Kilichokuwa hakipo ni: **(1)** Firestore
> rules ziko WAZI (mtu yeyote anaweza kuandika/kufuta), na **(2)** Cloud
> Functions ambazo client tayari anaziita (`walletAdjust`, `escrowRelease`,
> `pesapalCheckout`, `negotiationAction`, `deliveryAccept`, n.k.) hazijawahi
> kuundwa. Faili hizi sasa zipo tayari. Kinachobaki ni **wewe** ku-deploy kwa
> akaunti yako (sisi hatuwezi kuingia kwenye Firebase yako).

> ## 0. Dalili ya kwanza: kila kitu kinarusha "INTERNAL"
> Ikiwa sehemu kubwa ya app (malipo, SokoPay wallet, tokeni za uwasilishaji,
> maoni, routing, majibizano) inaonyesha **INTERNAL / "Huduma haipatikani"**,
> karibu kila mara sababu ni **functions hazijapelekwa**. Pima haraka:
> ```bash
> # 404 = function haipo (hazijapakiwa); 400/401 = zipo na zinafanya kazi
> curl -s -o /dev/null -w "%{http_code}\n" -X POST \
>   https://europe-west1-sokonet-3b847.cloudfunctions.net/pesapalCheckout \
>   -H "Content-Type: application/json" -d '{"data":{}}'
> ```
> Mnamo 2026-09 ukaguzi ulipata **404 kwa functions ZOTE** (kila mkoa) — yaani
> hazijawahi kupakiwa. Baada ya deploy (`firebase deploy --only functions`)
> curl hapo juu inapaswa kurudisha **400/401/403**, si 404.
>
> Kumbuka: mteja ameimarishwa (wrapper ya kati) — functions zikikosekana,
> mtumiaji haoni tena "INTERNAL" bali ujumbe wa Kiswahili, na mizunguko isiyo
> ya kifedha (majibizano, maoni, msaada wa wakala) inafuata njia ya
> Firestore-native. **Lakini malipo/SokoPay/tokeni za ukabidhi HAZIWEZI**
> kufanya kazi bila server (kwa usalama) — deploy ni lazima.

---

## 1. Mahitaji ya awali

1. **Node.js** 18 au 20+ kwenye kompyuta yako.
2. **Firebase CLI:**
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
3. **Billing (Blaze plan)** — Cloud Functions HAZIFANYI kazi kwenye Spark
   (free) plan. Nenda Firebase Console → ⚙️ Project settings → **Usage and
   billing** → wezesha **Blaze** (pay-as-you-go). Huwezi ku-deploy functions
   bila hii.

## 2. Washa huduma (Console)

Kwenye [Firebase Console](https://console.firebase.google.com/project/sokonet-3b847):

- **Firestore Database** — tayari ipo (data yako ipo). ✔️
- **Authentication** — tayari iko (users wapo). ✔️
- **Functions** — hakikisha imewashwa (itawezeshwa kiotomatiki wakati wa deploy).
- **Cloud Scheduler** — kwa `platformStatsHourly` (huwezeshwa na deploy ya scheduler).

## 3. Weka SECRET za PesaPal (server-side)

Malipo yote hupitia **PesaPal hosted checkout** (sio AzamPay tena). Siri za
PesaPal huishi Cloud Function pekee — kamwe haziko browser.

```bash
cd functions
cp .env.example .env
# hariri .env — weka funguo HALISI za PesaPal
```

Vigezo muhimu (rejea `functions/.env.example`):

- `PESAPAL_CONSUMER_KEY` na `PESAPAL_CONSUMER_SECRET` — funguo za PesaPal
  dashboard (Settings → API Credentials). **Hazipaswi kuwepo browser kamwe.**
- `PESAPAL_BASE_URL` — majaribio: `https://cybqa.pesapal.com/pesapalv3`;
  live: `https://pay.pesapal.com/v3` (chaguo-msingi).
- `PESAPAL_REDIRECT_URL` — URL ya kurudi, kwa kawaida
  `https://sokonet-3b847.web.app/?pesapal_return=1` (au domain yako ya
  Netlify ikitumiwa, mf. `https://sokohaiii.netlify.app/?pesapal_return=1`).
- `PESAPAL_IPN_URL` na `PESAPAL_IPN_ID` — kwanza deploy functions, kisha
  sajili IPN kwa kupiga callable `pesapalRegisterIpn` (inarudisha IPN ID),
  weka hizo mbili kwenye `.env`, kisha **redeploy functions**.
- `ADMIN_EMAILS` — orodha ya email za msimamizi.

> Badala ya `.env` unaweza kutumia Secret Manager, mfano:
> `firebase functions:secrets:set PESAPAL_CONSUMER_SECRET`
> (kumbuka kuitangaza kwenye `runWith`/`secrets` wa function ukichagua njia hii).

> PesaPal hupiga mtandao wa nje (pay.pesapal.com) — hii inahitaji **Blaze**
> billing (tayari imeainishwa hapo juu). Bila hivyo functions za malipo
> zitagoma kwa INTERNAL hata baada ya deploy.

## 4. Deploy (mfuatano muhimu!)

Kutoka kwenye mzizi wa mradi (`/home/user/sokohai`):

```bash
# 1) RULES Kwanza — funga mlango mara moja (aibu wageni kuandika/kusoma)
firebase deploy --only firestore:rules,firestore:indexes

# 2) FUNCTIONS — server-authoritative layer
firebase deploy --only functions

# 3) HOSTING (hiari — kuweka app live kwenye URL ya Firebase)
firebase deploy --only hosting
```

**Mpangilio huu ni muhimu:** rules kwanza (usitoe funguo za browser), kisha
functions. Ukideploy functions kabla ya rules, dirisha la "fungua" linabaki
wazi mpaka rules zimepanda.

Baada ya deploy, functions zitakuwa kwenye:
- `https://europe-west1-sokonet-3b847.cloudfunctions.net/walletAdjust`
- `https://europe-west1-sokonet-3b847.cloudfunctions.net/escrowRelease`
- `https://europe-west1-sokonet-3b847.cloudfunctions.net/pesapalCheckout`
- `https://europe-west1-sokonet-3b847.cloudfunctions.net/pesapalIpn`
- `https://europe-west1-sokonet-3b847.cloudfunctions.net/negotiationAction`
- `https://europe-west1-sokonet-3b847.cloudfunctions.net/deliveryAccept`
- n.k. (client tayari anazijua — region `europe-west1`)

Hakiki kuwa zimepanda (tarajia **400/401/403**, si 404):
```bash
for fn in pesapalCheckout escrowRelease walletAdjust negotiationAction deliveryAccept; do
  echo -n "$fn → "
  curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    "https://europe-west1-sokonet-3b847.cloudfunctions.net/$fn" \
    -H "Content-Type: application/json" -d '{"data":{}}'
done
```

Functions zinazosafirishwa (41): wallet/escrow (`walletAdjust`, `escrowRelease`,
`haipayReleaseLink`), PesaPal (`pesapalCheckout`, `pesapalTransactionStatus`,
`pesapalIpn`, `pesapalRegisterIpn`), takwimu (`platformStatsRefresh`,
`platformStatsHourly`, `sokopayAutoRelease`), wanachama/wakala
(`memberRegister`, `memberAuthenticate`, `memberSetPin`,
`assistedSessionValidate/End`, `agentMemberStatus`, `agentListMembers`),
ukabidhi/usafirishaji (`deliveryAccept`, `deliveryGenerateToken`,
`deliveryConfirmCustody`, `deliveryStartTransit`, `deliveryPassengerBoard`,
`deliveryComplete`, `deliveryDispute`, `deliveryTokenVerify`,
`deliveryRevokeTokens`), routing (`deliveryRouteBooking`, `deliveryOfferAccept`,
`deliveryOfferDecline`, `deliveryRouteSweep`, `deliveryRouteRetry`),
maoni (`commentsPublish`, `commentsEvidence`, `commentsLike`,
`commentsModerate`, `reviewsPublish`), majibizano (`negotiationSendOffer`,
`negotiationAction`, `negotiationOrderAction`, `chatOfferAction`), pamoja na
`sitemapXml`.

## 5. Hakiki kila kitu

1. **Login** → fungua HaiPay → salio linaonekana (inapita Firestore read, auth-required). ✔️
2. **Create Link** → token (SP-XXXXXX) inazalishwa. ✔️
3. **Lipa** → ukilipa kwa wallet, `walletAdjust` (server) inaenda; ukilipa kwa
   simu/kadi, `pesapalCheckout` (server) inakuelekeza kwenye PesaPal; baada ya
   kurudi, `pesapalTransactionStatus` inathibitisha. ✔️
4. **Confirm delivery / Release** → `escrowRelease` au `haipayReleaseLink`
   (server) ndiyo inatoa pesa. ✔️
5. **Admin dashboard** → bofya "Sasisha" stats → `platformStatsRefresh`. ✔️

## 6. Mambo muhimu ya kujua (na kufuatilia)

- **Browser haiwezi tena kuandika `walletBalance`** — ni server pekee.
  Jaribio lolote la kuandika salio kutoka kwa console litakataliwa na rules.
- **`wallet_ledger`** — kila mabadiliko ya salio yana rekodi (audit trail)
  yenye `callerUid`. Unaweza kuikagua kwenye Firestore console.
- **IPN ya PesaPal** (muhimu): baada ya deploy ya kwanza, piga callable
  `pesapalRegisterIpn` (kwa mfano kutoka Firebase Console → Functions → jaribio,
  au kwa kuandika script ndogo ya Admin SDK) ili kupata `ipn_id`. Weka
  `PESAPAL_IPN_ID` na `PESAPAL_IPN_URL=.../pesapalIpn` kwenye `functions/.env`,
  kisha `firebase deploy --only functions`. IPN inathibitisha malipo hata
  mtumiaji asiporudi kwenye app.
- **Hosting**: baada ya `firebase deploy --only hosting`, app itapatikana kwenye
  `https://sokonet-3b847.web.app` (na `*.firebaseapp.com`).

## 7. Usalama — hatua zinazofuata (baada ya live)

Mfumo sasa una ulinzi wa kimsingi (login required + wallet server-only). Ili
kukaza zaidi, fanya haya hatua kwa hatua:

1. **Custom claims za admin** — badilisha `isAdmin` iwe custom claim
   (`firebase auth:setcustomclaims`) badala ya email fallback.
2. **walletAdjust per-type authorization** — hakikisha `type` fulani (mf.
   `escrow_release`) zinapita escrowRelease pekee, si walletAdjust moja kwa moja.
3. **sokopay_links / orders owner-scoping** — kwa sasa login yoyote inaweza
   kusoma miamala ya wengine; pindua kuwa "mmiliki/wahusika pekee".
4. **Rate limiting** — weka quota kwenye functions (tayari `maxInstances: 10`).

## 8. Ikiwa kuna hitilafu

| Dalili | Sababu | Suluhisho |
|---|---|---|
| "functions hazijawekwa" | Huja-deploy functions | `firebase deploy --only functions` |
| "wallet haijasajiliwa" | `WALLET_VIA_SERVER=true` lakini function haipo | deploy functions au (kwa majaribio tu) weka `WALLET_VIA_SERVER:false` |
| Malipo yanakataliwa | Funguo za PesaPal si sahihi / mazingira ya sandbox-live | kagua `functions/.env` na `PESAPAL_BASE_URL` |
| curl yarudisha 404 | Hazijapakiwa au mkoa si sahihi | `firebase deploy --only functions`; hakikisha region ni `europe-west1` |
| curl 404 imekwisha baada ya deploy ya zamani | Toleo la zamani/functions nyingine | onyesha orodha: `firebase functions:list` |
| "Missing or insufficient permissions" | Rules mpya zimezuia | hakikisha umelogin; kagua console |
| Deploy inashindwa | Billing (Spark) | wezesha Blaze plan |
