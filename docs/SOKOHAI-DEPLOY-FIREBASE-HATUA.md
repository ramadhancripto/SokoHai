# SokoHai: kuandaa staging, kisha deploy ya Firebase

**Sasisho:** 16 Nov 2026, tawi `dev/staging-hardening-20261116`.

**Lengo:** staging salama inayofanya kazi kwanza (mradi tofauti wa Firebase + site tofauti ya Netlify). Production ni uamuzi wa baadaye, peke yake.

> Claude hafanyi hatua hizi: zinahitaji akaunti yako ya Google, Firebase na Netlify. Hakuna hatua hapa inayogusa `sokohai.com`, DNS, data ya production wala pesa halisi.

---

## Jinsi mfumo unavyochagua mradi wa Firebase (tangu `dev/staging-hardening-20261116`)

Uchaguzi unategemea **host ya ukurasa**. Mipangilio iko kwenye `js/00-config.js` → `FIREBASE_ENVIRONMENTS`. Ikiwa host haijatajwa, Firebase **haiwashwi kabisa**.

| Host | Mradi |
|---|---|
| `sokohai.com`, `www.sokohai.com`, `sokohaicom.netlify.app`, `sokohaimarket.netlify.app` | production `sokonet-3b847` |
| `sokohai-staging.netlify.app` na `*--sokohai-staging.netlify.app` (branch/preview deploys za staging) | **staging tu**. Bila config ya staging: "Environment not configured". Haiendi production kamwe. |
| `deploy-preview-N--sokohaicom.netlify.app`, `main--sokohaimarket.netlify.app`, nakala yoyote ya site, host nyingine yoyote | **"Environment not configured"**. Firebase haiwashwi, hakuna ombi lolote kwenda Firebase. |
| `localhost` / `127.0.0.1` | emulator tu (kupitia `ANZISHA-SOKOHAI-PILOT.bat`). Bila emulator, ukurasa unazuiwa. |

**Kinga za ziada:**
- Config ya staging ikitumia project ID, `apiKey` au `appId` ya production, staging inazuiwa.
- Ukurasa wa staging hutumia ufunguo wa App Check wa staging (`appCheckSiteKey`). Ukiwa tupu, App Check imezimwa.

---

## Hatua 0: Code kwenye kompyuta yako

1. Bonyeza mara mbili `_sokohai-local\LETA-STAGING-HARDENING.bat`. Inaleta tawi `dev/staging-hardening-20261116` kutoka kwenye bundle, kisha inasasisha folda `sokohai-pilot`. **Haiendi GitHub.**
2. Deploy yoyote inafanywa kutoka folda `sokohai-pilot`.

## Hatua 1: Mradi wa Firebase wa staging (dakika 10, mara moja)

1. https://console.firebase.google.com → **Add project** → jina `sokohai-staging`. Andika **Project ID** halisi inayoonyeshwa; inaweza kuwa tofauti, mf. `sokohai-staging-4f2a1`.
2. **Upgrade → Blaze**. Cloud Functions zinahitaji Blaze. Weka *budget alert*, mf. $10/mwezi.
3. **Build → Firestore Database → Create**: eneo `europe-west1`, *production mode*.
4. **Build → Authentication → Get started**: washa *Email/Password*.
5. **Project settings → Your apps → Web (</>)**: sajili app, kisha nakili `apiKey, authDomain, projectId, storageBucket, appId`. Hii si siri; ni config ya umma ya web app.

## Hatua 2: Weka config ya staging kwenye code KABLA ya kuunda site ya Netlify

Kwa nini kwanza? Site ya staging ikifunguliwa bila config itaonyesha "Environment not configured", na haitagusa production.

1. `js/00-config.js` → `FIREBASE_ENVIRONMENTS.staging`:
   ```js
   staging: {
       hosts: ['sokohai-staging.netlify.app'],   // jina halisi la site utakayounda Hatua 5
       netlifySite: 'sokohai-staging',           // sehemu kabla ya .netlify.app
       appCheckSiteKey: '',
       firebase: { apiKey: '…', authDomain: '<id>.firebaseapp.com', projectId: '<id>', storageBucket: '<id>.appspot.com', appId: '…' }
   }
   ```
   Kama jina `sokohai-staging` limechukuliwa Netlify, tumia jina utakalopata (mf. `sokohai-stg`) kwenye `hosts` na `netlifySite`.
2. `tools/deploy/firebase-targets.json` → `"staging": { "projectId": "<id halisi>" }`.
3. Commit kwenye tawi `dev/staging-hardening-20261116`. Ukipenda, nitumie config nikuandalie commit hii.
4. Jaribu kwenye kompyuta: `node tools/test_firebase_env.mjs`. Lazima ipite yote.

## Hatua 3: Funguo za server za staging

1. Ndani ya `sokohai-pilot\functions\`, nakili `env.template.txt` kuwa `.env.<staging-id>`.
2. Jaza:
   - `SUPER_ADMIN_EMAILS` (email yako);
   - PesaPal **sandbox** (`PESAPAL_BASE_URL=https://cybqa.pesapal.com/pesapalv3`);
   - `PUBLIC_BASE_URL=https://sokohai-staging.netlify.app`;
   - `PESAPAL_REDIRECT_URL`.
   Cloudinary ni hiari.
3. **Ndani ya `functions\` kuwe na faili moja tu ya `.env`, ile ya mradi unaodeploy.** Hamisha (usifute) faili hizi nje ya `functions\`, mf. kwenye `_siri\`:
   - `functions\.env`
   - `functions\.env.sokonet-3b847`
   - `service-account*.json`
   - backups zozote
   Deploy inakataa ikiziona.

## Hatua 4: Deploy ya Firebase (staging)

1. **Funga server za local** (madirisha ya `ANZISHA-SOKOHAI-PILOT`, emulator).
2. Bonyeza mara mbili `sokohai-pilot\tools\deploy\DEPLOY-FIREBASE.bat` → andika `staging` → andika **project ID halisi**.
3. Faili linasimama mara moja (bila kupakia chochote) ikiwa:
   - umeandika `default` au alias nyingine, au ID isiyolingana na `firebase-targets.json`;
   - mradi haupo kwenye akaunti uliyoingia nayo (`firebase projects:list`);
   - `functions\` ina `.env` isiyohusika, service-account JSON, `.pem`/`.key`, `admin-login.json`, `token.txt`, au backup (`*.backup*`, `*.bak`, `*.orig`);
   - `.env.<id>` haipo, au haina `SUPER_ADMIN_EMAILS`;
   - staging inaelekeza PesaPal **live**;
   - server ya local bado inaendesha (port 5055/8085/9099/4000/4400/4500/9150/5001);
   - kuna mabadiliko yasiyocommitiwa.
4. Ukaguzi ukipita, faili linaendelea:
   - kuingia Firebase;
   - `npm ci`;
   - `deploy --only firestore:rules,firestore:indexes,functions --project <id>`.

   Kumbukumbu inaandikwa kwenye `deploy-firebase-log.txt`.
5. `firebase.json`:
   - `predeploy` = `npm --prefix functions run build:shared` (inafanya kazi CMD na Linux, hata kwenye folda yenye nafasi);
   - `ignore` inazuia `.env*`, service-account JSON, funguo na backups zisipakiwe.

## Hatua 5: Site ya Netlify ya staging (baada ya Hatua 2 na 4)

1. Push tawi `dev/staging-hardening-20261116` kwenda GitHub. **Kwa ruhusa yako tu**; nitakuandalia faili la push.
2. Netlify → **Add new site → Import from GitHub** → repo `SokoHai`, branch `dev/staging-hardening-20261116`:
   - build: `node tools/build_dist.mjs --minify --check`;
   - publish: `dist`;
   - jina la site: lile ulilotumia Hatua 2.
3. Firebase (staging) → Authentication → Settings → **Authorized domains** → ongeza `sokohai-staging.netlify.app`.
4. Fungua site; inapaswa kufunguka kama kawaida. Ukiona "Environment not configured", host haijaandikwa sawa kwenye `FIREBASE_ENVIRONMENTS.staging`.

## Hatua 6: Baada ya deploy (staging)

1. Jisajili kwa email iliyo kwenye `SUPER_ADMIN_EMAILS`, toka, kisha ingia tena.
2. Admin → **Muhtasari → Usanidi wa nje → "Endesha sasa"** (utafutaji). Uandaaji unaruhusiwa mmoja tu kwa wakati mmoja:
   - kubonyeza mara ya pili, au kutoka tab nyingine, kunakataliwa na server;
   - kila uandaaji unaandika rekodi moja ya ukaguzi (`SEARCH_BACKFILL`).
3. Firestore (staging) → `system/config`: `withdrawals.dualApprovalMin`, `pilotLimits.maxPaymentTSh`, `pilotLimits.maxWithdrawalTSh`. Viwango ni uamuzi wako.
4. PesaPal sandbox: sajili IPN (URL ya `pesapalIpn`), weka `PESAPAL_IPN_ID`, kisha deploy tena.
5. Jaribio kamili:
   - bidhaa yenye picha;
   - malipo ya wallet;
   - oda;
   - makabidhiano;
   - muuzaji kulipwa;
   - deposit ya sandbox.
6. Google Cloud Console (staging): **Firestore → Point-in-time recovery: ON**.

## Hatua 7: Production (uamuzi tofauti, baadaye)

1. `functions\.env.sokonet-3b847` iwekwe ndani ya `functions\` **wakati wa deploy ya production tu**. `.env` ya staging ihamishwe nje.
2. `DEPLOY-FIREBASE.bat` → `production` → `NDIYO PRODUCTION` → `sokonet-3b847`.
3. Netlify ya `sokohai.com` (billing). Thibitisha deploy ni commit ya `main`.

## Kurudi nyuma (rollback)

- **Functions:** `git switch --detach <commit>` ndani ya `sokohai-pilot`, kisha `DEPLOY-FIREBASE.bat`.
- **Rules:** Firebase Console → Firestore → Rules → *History*.
- **Host iliyozuiwa kimakosa:** ongeza host kwenye `FIREBASE_ENVIRONMENTS` na deploy ya Netlify. Usiweke host isiyo yako kwenye `production.hosts`.
- **localhost bila emulator** (mf. `npm run local:static`): sasa inazuiwa. Tumia `ANZISHA-SOKOHAI-PILOT.bat`, ambayo inawasha emulator.
