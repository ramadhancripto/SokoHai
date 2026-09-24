# SokoHai — Local Functions Server (bila Cloud Billing)

Cloud Functions zinahitaji Blaze plan (billing). Server hii inaendesha **functions zilezile**
(`functions/index.js`) kwenye kompyuta yako. Data inaandikwa kwenye **Firestore/Auth halisi**
ya project `sokonet-3b847` (au kwenye **Firebase Emulator** — tazama hapa chini). Hakuna billing inayohitajika.

## Mara moja tu (setup)

1. Sakinisha **Node.js 20** kutoka https://nodejs.org (runtime ya Cloud Functions ya project hii).
2. Chagua njia ya utambulisho (credentials). Server inajaribu kwa mpangilio huu, na **haichapishi
   maudhui ya key yoyote**:

   **A) Firebase Emulator — salama zaidi kwa majaribio (haigusi production)**
   ```bash
   firebase emulators:start --only firestore,auth --project demo-sokohai
   # terminal nyingine (Mac/Linux):
   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-sokohai npm run local
   ```
   Credentials hazihitajiki.

   **B) Google Application Default Credentials (ADC) — inapendekezwa kwa data halisi**
   Hakuna private key inayoundwa (inafaa pale org policy inazuia service-account keys):
   ```bash
   gcloud auth application-default login
   gcloud auth application-default set-quota-project sokonet-3b847
   ```
   Akaunti yako inahitaji ruhusa za Firestore/Auth kwenye project. `memberAuthenticate`
   (createCustomToken) inahitaji pia `SKH_SERVICE_ACCOUNT_ID=<service-account-email>` na
   ruhusa ya *Service Account Token Creator* kwenye account hiyo.

   **C) Service account key (njia ya zamani — bado inakubalika)**
   - Njia zinazotafutwa: `SKH_SERVICE_ACCOUNT`, `GOOGLE_APPLICATION_CREDENTIALS`,
     kisha `~/.sokohai/service-account.json` (Windows: `C:\Users\<JINA>\.sokohai\service-account.json`),
     kisha `SokoHai/functions/service-account.json` (imezuiwa kwenye git na Netlify).
   - ⚠️ Key ni siri kubwa. Usimtumie mtu, na usiipakie Netlify, GitHub au WhatsApp.

## Kila unapofanya kazi

Fungua terminal ndani ya folda ya `SokoHai`, kisha endesha:

```bash
npm run local
```

Kisha fungua **http://localhost:5055** kwenye browser. Site itatumia server hii yenyewe:
Publish, Save draft, ads delivery, comments na zingine zitafanya kazi.

## Kutumia site ya Netlify pamoja na server (kwenye kompyuta ileile)

1. Fungua https://sokohaiworld.netlify.app.
2. Fungua console ya browser (F12) na uendeshe:
   ```js
   skhUseLocalFunctions('http://localhost:5055/__fn')
   ```
3. Kurudi kwenye Cloud Functions (baada ya kupata billing):
   ```js
   skhUseCloudFunctions()
   ```

**Hii inafanya kazi tu kwenye kompyuta inayoendesha server**, na kwenye Chrome, Edge au Firefox.
Safari na simu za wateja hazitaweza kuifikia.

## Mipaka (muhimu)

- Server ikizimwa, huduma za server zinasimama. Site inaendelea kwa fallback zake: matangazo
  yanaonyeshwa kutoka kwenye cache ya ndani, na hakuna mafanikio ya uongo.
- **PesaPal IPN** inahitaji anwani ya umma, kwa hiyo haitafika localhost. Malipo halisi yanahitaji
  deploy au tunnel.
- **Usalama wa mtandao:** kwa default server inasikiliza `127.0.0.1` tu (kompyuta hii pekee).
  Kuifungua kwa LAN/Wi-Fi ni kwa makusudi tu: `SKH_HOST=0.0.0.0` — onyo litaonyeshwa, kwa kuwa
  functions zinaendeshwa kwa nguvu za Admin SDK. Tumia tu kwenye mtandao unaouamini.
- **Scheduled jobs** (`adsDeliverySweep`, `platformStatsHourly`, `sokopayAutoRelease`) **HAZIENDESHWI
  kwa default**, kwa sababu `sokopayAutoRelease` hutoa pesa za escrow. Kuziwasha:
  - kwenye Emulator: `SKH_RUN_SCHEDULES=1`;
  - dhidi ya production: `SKH_RUN_SCHEDULES=1` **na** `SKH_ALLOW_PROD_SCHEDULES=1` (onyo kubwa
    linaonyeshwa). Bila hiyo ya pili, server inakataa kuziwasha.
- Kubadilisha port:
  - Mac/Linux: `PORT=5056 npm run local`
  - Windows PowerShell: `$env:PORT=5056; npm run local`

## Kuhakiki

```bash
curl http://localhost:5055/__fn        # orodha ya functions zilizopakiwa
node tools/test_local_functions_server.mjs
```
