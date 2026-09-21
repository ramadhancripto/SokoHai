# Tatizo la CORS kwenye Cloud Functions (commentsEvidence / commentsPublish) — Mwongozo wa Kiswahili

## Utambuzi wa tatizo (kwa nini kilijitokeza)

Kosa la kivinjari:

```
Access to fetch at '...cloudfunctions.net/commentsEvidence' from origin
'https://sokohaitz.netlify.app' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present ...
```

**Hili si tatizo la msimbo wa CORS.** Ukaguzi wa seva ulionyesha:

```bash
curl -i -X OPTIONS \
  -H "Origin: https://sokohaitz.netlify.app" \
  -H "Access-Control-Request-Method: POST" \
  https://europe-west1-sokonet-3b847.cloudfunctions.net/commentsEvidence
# HTTP/2 404  — "Page not found"
```

Functions **zote** (commentsEvidence, commentsPublish, walletAdjust,
negotiationSendOffer, deliveryAccept, …) zinarejesha **404** katika project
`sokonet-3b847`, kwa mikoa yote miwili (europe-west1 na us-central1). Maana
yake: **Cloud Functions hazijawahi kutumwa (deploy) kwenye mradi huu.**
Seva ya Google inapokosa URL, inarudisha ukurasa wa 404 wa HTML usio na
vichwa vya CORS — ndipo kivinjari kinaripoti "blocked by CORS policy".

Callables za `firebase-functions` v2 (`onCall`) **hujijengea CORS zenyewe
kwa asili zote** (origin `*`) mara tu zinapotumwa — hakuna msimbo wa ziada
wa CORS unaohitajika.

## Jinsi ya kurekebisha (hatua za mmiliki wa mradi)

> Cloud Functions za kizazi cha 2 zinahitaji mradi wa Firebase kuwa kwenye
> **mpango wa Blaze (billing)**. Washa Blaze kwenye
> https://console.firebase.google.com/project/sokonet-3b847/usage (kuna
> kiwango cha bure; matumizi ya SokoHai ni madogo sana).

### Njia ya haraka — hati iliyotengenezwa tayari

```bash
# 1. Sakinisha Firebase CLI (mara moja tu kwenye kompyuta yako)
npm install -g firebase-tools

# 2. Ingia na akaunti inayomiliki mradi sokonet-3b847
firebase login

# 3. Tuma functions zote
bash scripts/deploy-functions.sh

# Au, tuma za maoni tu (commentsEvidence/commentsPublish/...):
bash scripts/deploy-functions.sh comments
```

### Njia ya mikono

```bash
cd functions
npm install
cd ..
# Siri za PesaPal (hiari kwa maoni, LAZIMA kwa malipo):
cp functions/.env.example functions/.env   # kisha hariri na funguo halisi
firebase deploy --only functions --project sokonet-3b847
```

Muda wa kwanza deploy inaweza kuchukua dakika kadhaa (Cloud Run APIs
kuwezeshwa). Mwisho utaona orodha ya URL za functions 41.

### Hakiki baada ya deploy

```bash
curl -i -X OPTIONS \
  -H "Origin: https://sokohaitz.netlify.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" \
  https://europe-west1-sokonet-3b847.cloudfunctions.net/commentsEvidence
```

Jibu sahihi: `HTTP/2 204` pamoja na
`access-control-allow-origin: https://sokohaitz.netlify.app` (au `*`).

Kisha fungua tovuti upya kwa `Ctrl+Shift+R` (futa kache).

## Mabadiliko ya mteja yaliyofanyika pamoja (kustahimili kutokuwepo)

1. **Circuit breaker** (`js/app/00-bootstrap.js`, `skh.wrapCallable`): baada
   ya kugundua functions hazipatikani (404/CORS/`functions/internal`),
   mteja hatuma maombi mapya ya mtandao kwa sekunde 30 (yaliyokuwa
   yakijaza console makosa ya CORS na kupunguza kasi); badala yake
   anarudisha kosa la "haipatikani" mara moja na **fallback za kawaida**
   (mfano maoni huchapishwa moja kwa moja Firestore bila beji za server).
   Mwito wowote ukifanikiwa, huduma hurudi kiotomatiki.
2. Maoni (comments) yaliyoandikwa kabla ya server kutumwa bado
   yanachapishwa kupitia njia mbadala ya mteja (bila verified badges —
   beji hujengwa na server tu, kama ilivyo kanuni ya mradi).

## Orodha ya functions zitakazotumwa (41)

Fedha: walletAdjust, escrowRelease, haipayReleaseLink, pesapalCheckout,
pesapalTransactionStatus, pesapalIpn, pesapalRegisterIpn.
Mfumo: platformStatsRefresh, platformStatsHourly, sokopayAutoRelease,
sitemapXml.
Wanachama/mawakala: memberRegister, memberAuthenticate,
assistedSessionValidate/End, memberSetPin, agentMemberStatus,
agentListMembers.
Usafirishaji: deliveryAccept, deliveryOfferAccept/Decline,
deliveryGenerateToken, deliveryConfirmCustody, deliveryRevokeTokens,
deliveryStartTransit, deliveryPassengerBoard, deliveryComplete,
deliveryDispute, deliveryTokenVerify, deliveryRouteBooking,
deliveryRouteSweep, deliveryRouteRetry.
Majadiliano/maoni: chatOfferAction, negotiationSendOffer,
negotiationAction, negotiationOrderAction, commentsEvidence,
commentsPublish, commentsLike, reviewsPublish, commentsModerate.

## Kumbuka

- Tovuti ya Netlify (static) na Firebase (functions/database) ni sehemu
  mbili: kubadilisha msimbo na kuzalisha ZIP haitumii functions —
  **deploy ya functions inafanywa na mmiliki kwa Firebase CLI** kwani
  inahitaji kuingia kwa siri za Google.
- Baada ya functions kutumwa, hakikisha mazingira `functions/.env`
  (PesaPal) yamewekwa kabla ya kutumia malipo.
