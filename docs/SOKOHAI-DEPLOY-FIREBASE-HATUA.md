# SokoHai — Deploy ya Firebase hatua kwa hatua (staging kwanza)

Lengo: Cloud Functions + Firestore rules + indexes zifanye kazi. Leo kwenye production
(`sokonet-3b847`) functions zote zinajibu **404** — malipo, stock, Live, escrow, kutoa pesa,
utafutaji na upakiaji salama havifanyi kazi. Hii ndiyo kizuizi kikuu cha launch.

> Hakuna kati ya hatua hizi kinachofanywa na Claude: zinahitaji akaunti yako ya Google/Firebase.

## Hatua 0 — Toleo jipya kwenye kompyuta yako
1. `_sokohai-local\SASISHA-NA-SUKUMA-GITHUB.bat` (inaleta code mpya + push GitHub).
2. `_sokohai-local\ANZISHA-SOKOHAI-PILOT.bat` (inaunda/inasasisha folda `sokohai-pilot`). Deploy inafanywa kutoka folda hiyo.

## Hatua 1 — Mradi wa staging (dakika 10, mara moja)
1. https://console.firebase.google.com → **Add project** → jina `sokohai-staging`.
2. **Upgrade → Blaze** (Functions zinahitaji Blaze; weka *budget alert*, mf. $10/mwezi).
3. **Build → Firestore Database → Create** → eneo `europe-west1` (sawa na functions) → production mode.
4. **Build → Authentication → Get started** → washa *Email/Password* (na Google ukitaka).
5. **Project settings → Your apps → Web (</>)** → sajili app → nakili config (`apiKey, authDomain, projectId, storageBucket, appId`).

## Hatua 2 — Site ya staging (frontend)
1. Netlify → **Add new site → Import from GitHub** → repo `SokoHai`, branch `pilot/completion-20261114`
   (au `main`), build command `node tools/build_dist.mjs --minify --check`, publish `dist`. Jina mf. `sokohai-staging`.
2. Kwenye `js/00-config.js` → `FIREBASE_BY_HOST`, ongeza:
   `'sokohai-staging.netlify.app': { …config ya Hatua 1.5… }` — commit/push (au niambie nikuandalie).
   Host nyingine zote zinaendelea kutumia production.
3. Firebase (staging) → Authentication → Settings → **Authorized domains** → ongeza `sokohai-staging.netlify.app`.

## Hatua 3 — Funguo za server (functions env)
1. Nakili `functions\env.template.txt` kuwa `functions\.env.sokohai-staging` ndani ya folda `sokohai-pilot`.
2. Jaza: `SUPER_ADMIN_EMAILS` (email yako), PesaPal **sandbox**, `PUBLIC_BASE_URL`, `PESAPAL_REDIRECT_URL`.
   Cloudinary ni hiari kwa sasa (bila hiyo picha zinapakiwa kwa preset ya umma).

## Hatua 4 — Deploy (dakika 5–15)
Bonyeza mara mbili `_sokohai-local\DEPLOY-FIREBASE.bat` → andika **staging** → andika project id `sokohai-staging`.
Faili:
- inathibitisha folda `sokohai-pilot` ni toleo jipya na kwamba `functions\.env.<project>` ipo;
- inakuomba kuingia Firebase (mara ya kwanza) — dirisha la browser;
- `npm ci` ya functions → `firebase deploy --only firestore:rules,firestore:indexes,functions --project <id>`;
- kwa **production** inakuuliza uandike `NDIYO PRODUCTION` — vinginevyo inasimama.

## Hatua 5 — Baada ya deploy (staging)
1. Fungua site ya staging → jisajili kwa email iliyo kwenye `SUPER_ADMIN_EMAILS` → toka → ingia tena.
2. Admin → **Muhtasari → Usanidi wa nje**:
   - "Utafutaji: adminSearchBackfill" → bonyeza **Endesha sasa**;
   - angalia PesaPal (sandbox), admins, App Check.
3. Firestore (staging) → `system/config` → ongeza:
   `withdrawals.dualApprovalMin = 200000`, `pilotLimits.maxPaymentTSh = 500000`, `pilotLimits.maxWithdrawalTSh = 300000`
   (au viwango unavyoamua).
4. PesaPal sandbox: sajili IPN (URL ya `pesapalIpn`), weka `PESAPAL_IPN_ID` kwenye env, deploy tena functions.
5. Jaribio: muuzaji achapishe bidhaa yenye picha → mnunuzi alipe kwa wallet → oda → makabidhiano → muuzaji alipwe;
   deposit ndogo ya PesaPal sandbox → wallet inajaa (hata ukifunga dirisha kabla ya kurudi, ndani ya dk 10–20).
6. Google Cloud Console (staging na production): **Firestore → Point-in-time recovery: ON** (backups).

## Hatua 6 — Production (baada ya siku 3–7 za staging bila tatizo)
1. `functions\.env.sokonet-3b847` (funguo za production; PesaPal live **mwisho kabisa**).
2. `DEPLOY-FIREBASE.bat` → **production** → `NDIYO PRODUCTION`.
3. Backfill ya utafutaji kupitia Admin, viwango vya `system/config`, PITR.
4. Netlify: rudisha `sokohai.com` (billing), thibitisha deploy ni commit ya `main`.

## Kurudi nyuma (rollback)
- Functions: deploy tena kutoka commit ya zamani (`git switch --detach <commit>` ndani ya `sokohai-pilot`) kisha `DEPLOY-FIREBASE.bat`.
- Rules: Firebase Console → Firestore → Rules → *History* → rudisha toleo la awali.
