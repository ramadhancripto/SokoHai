# SokoHai — Ripoti ya Kukamilisha Mfumo kwa Pilot

**Tawi:** `pilot/completion-20261114` (kutoka `ebfc9991c84d3475235fed253d593ac6bc78e938`)
**Tarehe:** 14 Novemba 2026
**Hali:** commits za ndani tu. Hakuna push, deploy, data ya production wala pesa halisi.

Ushahidi wote hapa unatoka kwenye **emulator ya `demo-sokohai`**. Hiyo si ushahidi wa production. Malipo halisi ya PesaPal **hayajajaribiwa**, kwa hiyo **hayajathibitishwa**.

---

## 1. Kilichorekebishwa (commits 9)

| # | Commit | Tatizo halisi (chanzo) | Marekebisho | Ushahidi |
|---|---|---|---|---|
| 1 | `b06bbc0` feat(search) | Utafutaji uliangalia matangazo 20–100 mapya tu yaliyokuwa tayari kwenye browser (`skh.searchQuery` ndani ya `renderFeedUI`). Kwa hiyo bidhaa ya zamani haikuweza kupatikana kwa jina. | Server inaweka `searchTokens` kwenye kila bidhaa na huduma (`functions/search-index.js`). Rules zinakataza mteja kuzibadilisha. Browser inauliza Firestore `array-contains-any`. Kuna maneno sawa Kiswahili↔Kiingereza (simu/phone, friji/fridge…) na `adminSearchBackfill`. | unit 8/8 · emulator 8/8 · browser: "fridge hisense" inapata "Jokofu Hisense" iliyo nje ya feed (matangazo 120 mapya juu yake) |
| 2 | `250096c` feat(money-ops) | (a) IPN ya PesaPal ikipotea na mteja asirudi, pesa ilibaki bila kuingia kwenye wallet. (b) Admin mmoja angeweza kufunga malipo makubwa. (c) Ofa ya usafiri iliyopita muda ilisogezwa tu mtu alipofungua inbox. | (a) `pesapalReconcileSweep` kila dakika 10: inaiuliza PesaPal kisha inatumia `settlePesaPalPayment` iliyopo (idempotent). (b) `system/config.withdrawals.dualApprovalMin`: kiasi kikifika kiwango hicho, admin wawili tofauti wanahitajika. (c) `deliveryOfferExpirySweep` kila dakika 5. Pia `adminMoneyWatch` na `clientErrorReport`. | emulator 13/13 (PesaPal stub): pesa inaingia mara moja tu; ya chini ya dk 10 haiguswi; PesaPal ikiwa chini inabaki wazi; baada ya saa 48 → `expired_unpaid` |
| 3 | `b238574` fix(admin) | Owner aliyewekwa kwa `SUPER_ADMIN_EMAILS` peke yake alikataliwa na callables za `index.js` (withdrawals, disputes…), ingawa `admin-authority.js` ilimkubali. | `isAdmin` ya `index.js` sasa inamkubali pia super admin mwenye email iliyothibitishwa. | B0: email isiyothibitishwa bado inakataliwa · Phase 1/2 security 57/57, 41/41 |
| 4 | `e0e2eb9` fix(checkout) | Kugusa "thibitisha" mara mbili haraka kuliunda **oda mbili** (kila mguso uliunda ORD na token mpya). | Lock ya "busy" katika `confirmSmartCartOrder`. | Browser: bila fix oda **2**, na fix oda **1** |
| 5 | `f254650` feat(admin-ui) | Admin hakuona pesa zinazosubiri. Makosa ya production yalibaki kwenye console ya mtumiaji tu. | Kisanduku "Ulinzi wa pesa" kwenye Muhtasari. Withdrawals zinaonyesha idhini ya kwanza na kitufe "idhini ya pili", pamoja na namba ya muamala (hiari). `54-error-core` inatuma makosa kwa server: kikomo 5 kwa ukurasa; tokens, email na simu zinaondolewa. | Browser 7/7 |
| 6 | `ead2f0c` ci | CI iliendesha `npm test` na build tu; sheria na pesa hazikupimwa kwenye CI. | Job ya `emulator` (Java + firebase-tools, demo pekee) na job ya `e2e` usiku/kwa mkono, inayopakia picha. | YAML imehakikiwa (5 jobs). Haijaendeshwa GitHub, kwa sababu hakuna push |
| 7 | `8d84de9` test(r13b) | Hitilafu 5 za r13b zilikuwa selectors za kabla ya muundo mpya wa R13-D, si kasoro za app. | Selectors za sasa (`.lvh-card`, `#lvxChatInput`, `.lv7-pcard`, `#lv7BidCta`). Ukaguzi wa bei-kushuka sasa ni wa fomula kamili badala ya regex. | 17/17 |
| 8 | `337d0a0` feat(delivery) | Nauli hukatwa kutoka escrow ya oda (yaani malipo ya muuzaji), lakini muuzaji hakuonyeshwa kiasi hicho kabla ya kukabidhi mzigo. | Milango yote mitatu ya kukabidhi inaonyesha nauli na kiasi kitakachobaki, na muuzaji anaweza kusimama. Kiasi cha server hakijabadilika. | Browser: 15,000 inaonyeshwa, ~105,000 inabaki, "hapana" inasimamisha |
| 9 | `a30b275` feat(pilot-limits) | Hakukuwa na kikomo cha muamala kwa pilot. | `system/config.pilotLimits.{maxPaymentTSh,maxWithdrawalTSh}`: zikiwa hazijawekwa, hakuna kikomo (kama awali). Setup status inaonyesha App Check, kiwango cha admin wawili, backfill na vikomo. | F1, E1 |

Kanuni zilizofuatwa: hakuna kipengele kilichofutwa; hakuna assertion iliyodhoofishwa; sheria hazikulegezwa; hakuna siri iliyoandikwa.

---

## 2. Matokeo ya majaribio

### Yaliyoendeshwa (emulator / browser halisi ya Chromium)

| Kundi | Matokeo |
|---|---|
| `npm test` (amri 108, kila moja peke yake) | **108/108** |
| Build ya HTML (byte-exact) · dist · dist --minify (usawa wa token) | **OK** |
| Emulator: security/rules/pesa (suites 34 za `test:security:all:emulator`) | **33/34 suites**. Inayoshindwa ni **kichujio cha kategoria (5/8)**, kinachosubiri uamuzi D8 (kipo kabla ya kazi hii) |
| Pilot ops (mpya) | **13/13** · PesaPal stub (phase 7) **11/11** · wallet pay **8/8** · dispute refund **7/7** |
| Search index (mpya) | **8/8** |
| Navigation | **56/56** |
| Live + Chat auth | **40/40** |
| E2E kuu, simu (s1–s9) | **56/56** |
| E2E kuu, desktop | **56/56** |
| Journeys simu + desktop (pilot, r13d, r14 ×2, r13b, r13g, r13h, r16 ×5, r15, ali) | **26/26 runs, 246/246 checks** (zote 0 fail; mpya + ali ikiwemo) |

### Yasiyoendeshwa

- **CI ya GitHub:** hakuna push bila idhini yako.
- **PesaPal sandbox halisi:** hakuna funguo kwenye mazingira haya. Zipo stub tu.
- **Production:** read-only; hakuna kitu kilichoguswa.
- **App Check halisi:** haiwezekani kwenye emulator.

### Haijawekwa (config)

App Check, `dualApprovalMin`, `pilotLimits`, backfill ya search, na TTL ya `client_error_limits`. Tazama sehemu ya 3.

---

## 3. Usanidi wa nje (wewe au msimamizi wa Firebase)

| # | Kitu | Wapi | Kumbuka |
|---|---|---|---|
| 1 | Mradi wa **staging** wa Firebase | Firebase Console | Deploy kwanza huko, kisha production |
| 2 | **App Check**: reCAPTCHA Enterprise site key | `js/00-config.js` → `APP_CHECK_SITE_KEY` | Kwanza monitor siku 3–7, kisha `APP_CHECK_ENFORCE=true` kwenye `functions/.env` |
| 3 | **PesaPal sandbox**: key, secret, IPN URL/ID, redirect | `functions/.env` | `npm run pesapal:sandbox`. Live **ibaki imezimwa** |
| 4 | **Admin wawili** | `system/config.withdrawals.dualApprovalMin` (namba, TSh) | Mpe admin wa pili claim ya `admin` |
| 5 | **Vikomo vya pilot** | `system/config.pilotLimits.maxPaymentTSh`, `maxWithdrawalTSh` | Hazijawekwa = hakuna kikomo |
| 6 | **Search backfill** mara moja baada ya deploy | Admin: `adminSearchBackfill({collection:'products'})`, kisha `'services'`. Rudia na `startAfter=next` mpaka `next` iwe null | Ni idempotent |
| 7 | **TTL** kwa `client_error_limits.expireAt` | Firestore → TTL policies | Hiari: TTL ya siku 30 kwa `client_errors.createdAt` |
| 8 | **Scheduler**: `pesapalReconcileSweep` (dk 10), `deliveryOfferExpirySweep` (dk 5) | Huundwa na deploy (Blaze) | Angalia "Ulinzi wa pesa", ambapo saa ya mwisho kila kazi ilipoendeshwa inaonekana |
| 9 | **Backups** za Firestore (PITR au scheduled export) | Google Cloud Console | Lazima kabla ya pilot |
| 10 | Usafi wa repo: ondoa `*.backup*` 10 zilizo kwenye git | Ruhusa yako | Sikuzifuta, kwa sababu ya kanuni "usiguse backups" |

---

## 4. Maamuzi ya mmiliki (na pendekezo langu)

| # | Uamuzi | Pendekezo |
|---|---|---|
| 1 | **Nani analipa nauli?** Sasa inakatwa kwa muuzaji. | Mnunuzi aione na ailipe kwenye checkout (nauli juu ya bei). Kwa sasa muuzaji anaonyeshwa kabla ya kukabidhi. |
| 2 | **D10:** kikapu kibaki mpaka malipo yathibitishwe? | Ndiyo. |
| 3 | **Ada** (kamisheni 5%, subscription, boost…). Zote zimezimwa. | Zibaki zimezimwa kwa wiki 4 za kwanza za pilot. |
| 4 | **Kamisheni ya wakala** (60% ya ada ya jukwaa) | Ianze pamoja na ada. |
| 5 | **Kiwango cha admin wawili** | TSh 200,000 |
| 6 | **Vikomo vya pilot** | Malipo ≤ TSh 500,000; kutoa ≤ TSh 300,000. Mkoa mmoja (Dar es Salaam). |
| 7 | **Upeo wa pilot** | Bidhaa + POS + escrow + usafiri + huduma. Live, Mnada, Group Buy, Bei Kushuka na Group Soko ziwe "beta" (zisifutwe). |
| 8 | **D1:** Group Buy pesa halisi (`escrow_commit`) | Hapana kwa pilot. `pay_after_target` ibaki. |
| 9 | **D8:** ramani ya kategoria | Kubali pendekezo la `docs/D8-LEGACY-CATEGORY-PROPOSAL.md` baada ya kulipitia. |
| 10 | **Usafi wa repo** (backups 10 + `assets/js` ya zamani) | Ruhusu commit moja tofauti. |
| 11 | **Push** ya tawi hili GitHub na **deploy staging** | Ndiyo: staging kwanza, kisha production baada ya siku 7 bila tatizo. |

---

## 5. Hukumu ya pilot

**TAYARI KWA PILOT INAYOFUATILIWA kwenye staging**, kwa masharti haya:

1. Usanidi #1–#6 na #9 ukamilike.
2. Maamuzi #1, #5, #6 na #7 yafanywe.
3. Muamala halisi wa PesaPal **sandbox** (deposit, IPN, na reconcile) uthibitishwe kwenye staging.

**Bado si tayari kwa pesa halisi ya umma.** Hakuna muamala halisi wa PesaPal uliothibitishwa, na App Check bado haijalazimishwa.

---

## 6. Hatua za kuweka (baada ya idhini yako)

1. Kwenye kompyuta yako: endesha `SOKOHAI-PILOT-COMPLETION.bat` (dry-run kwanza). Inaleta tawi `pilot/completion-20261114` bila kugusa `main` wala faili zako 22.
2. `npm ci && npm --prefix functions ci && npm test`
3. Staging: `firebase use staging` → `firebase deploy --only firestore:rules,functions` → hosting.
4. Weka `dualApprovalMin` na `pilotLimits`, endesha backfill, kisha angalia Admin → Muhtasari.
5. Jaribu PesaPal sandbox: deposit ndogo; zima simu kabla ya kurudi; ndani ya dk 10–20 wallet inapaswa kujazwa na reconcile.

---

## 7. Hatua zinazofuata (kwa ufupi)

- Fanya maamuzi 11 hapo juu (hasa nauli, vikomo na upeo).
- Nipe ruhusa ya push ya tawi, ili CI mpya iendeshwe GitHub.
- Unda staging na ujaze funguo za sandbox.
- Baada ya siku 7 za staging bila tatizo, deploy production na pilot ya watumiaji 20–50, mkoa mmoja.
