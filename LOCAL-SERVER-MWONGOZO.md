# SokoHai — Local Functions Server (bila Cloud Billing)

Cloud Functions zinahitaji Blaze plan (billing). Server hii inaendesha **functions zilezile**
(`functions/index.js`) kwenye kompyuta yako. Data inaandikwa kwenye **Firestore/Auth halisi**
ya project `sokonet-3b847`. Hakuna billing inayohitajika.

## Mara moja tu (setup)

1. Sakinisha **Node.js 20** kutoka https://nodejs.org.
2. Pakua service account key (bure, Spark plan):
   - Fungua Firebase Console, kisha ⚙ **Project settings**, kisha **Service accounts**.
   - Bonyeza **Generate new private key**. Faili la `.json` litapakuliwa.
   - Liweke **nje ya project**:
     - Windows: `C:\Users\<JINA>\.sokohai\service-account.json`
     - Mac/Linux: `~/.sokohai/service-account.json`
   - Njia mbadala: `SokoHai/functions/service-account.json`. Njia hii imezuiwa kwenye git na Netlify.
   - ⚠️ Key hii ni siri kubwa. Usimtumie mtu, na usiipakie Netlify, GitHub au WhatsApp.

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
- Scheduled jobs (`adsDeliverySweep` kila dakika 5, `platformStatsHourly`, `sokopayAutoRelease`)
  zinaendeshwa na server wakati iko hai. Kuzizima: `SKH_RUN_SCHEDULES=0`.
- Kubadilisha port:
  - Mac/Linux: `PORT=5056 npm run local`
  - Windows PowerShell: `$env:PORT=5056; npm run local`

## Kuhakiki

```bash
curl http://localhost:5055/__fn        # orodha ya functions zilizopakiwa
node tools/test_local_functions_server.mjs
```
