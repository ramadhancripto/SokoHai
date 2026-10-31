# SokoHai — Mwongozo wa Deploy na Rollback (Ukarabati Okt 2026)

Hali: **TAYARI KWA STAGING. HAIJAPELEKWA PRODUCTION.** Hakuna kati ya hatua za
production hapa chini iliyotekelezwa. Kila hatua ya production inahitaji idhini
ya mmiliki.

Msingi wa kazi: `main` (`ac22ddc`) + kazi ya local ya 30 Okt + marekebisho ya
ukarabati. Nakala za kurejesha ziko `_recovery/*.bundle` (zisizopakiwa GitHub).

---

## 1. Kabla ya deploy yoyote (mmiliki)

| # | Kitendo | Kwa nini |
|---|---------|----------|
| 1 | Badilisha neno siri la akaunti ya admin na uwashe uthibitishaji wa hatua mbili | `seed-local-test-accounts.mjs` ya zamani (yenye email ya admin na neno siri) bado inapatikana kwenye tovuti hai mpaka deploy mpya ifanyike |
| 2 | Jaza `functions/.env` kutoka `functions/.env.example` (PesaPal, `SUPER_ADMIN_EMAILS`, `PESAPAL_ALLOWED_RETURN_ORIGINS`) | Bila `SUPER_ADMIN_EMAILS` hakuna Super Admin upande wa server (isipokuwa custom claim) |
| 3 | Cloudinary: funga preset `Sokohai_preset` (aina za faili: picha/video tu, ukubwa wa juu, folda maalum) | Upload bado ni "unsigned" kutoka kivinjari (H7) |
| 4 | Google Cloud Console: weka vikwazo vya API key ya Firebase kwa domain za SokoHai | Kuzuia matumizi mabaya ya quota |
| 5 | Futa mafaili 11 ya Discover (orodha kwenye ripoti ya mwisho) kwenye folda ya mradi | Uamuzi wa 2026-09-26; `npm test` inazihitaji zisiwepo |
| 6 | Hifadhi nakala ya Firestore: `gcloud firestore export gs://<bucket>/sokohai-$(date +%Y%m%d)` | Njia ya kurejesha data ikihitajika (inahitaji mpango wa Blaze + bucket) |
| 7 | Rekodi toleo la sasa la rules: Firebase Console → Firestore → Rules → historia | Rollback ya rules ni kubonyeza toleo la awali |

## 2. Majaribio kabla ya deploy (kwenye kompyuta ya mradi)

```bash
npm ci                     # lockfile sasa inalingana na package.json
npm --prefix functions ci
npm test                   # suites zote za unit/contract — zote lazima zipite
npm run test:emulator      # suites 8 za emulator (ukaguzi 309) — zote lazima zipite
npm run test:browser:taxonomy   # majani 743 + familia 30 za bidhaa (UI halisi, mock cloud)
npm run test:e2e:emulator  # E2E ya browser (hatua 34): akaunti, bidhaa, chat, SokoPay escrow,
                           # huduma, POS, admin, matangazo, analytics, kurasa 390/820/1366px
npm run build:dist         # hujenga dist/ na kukataa faili lolote la siri
python3 tools/build_html.py check
```

Majaribio ya emulator yanahitaji Java na `firebase-tools` (CLI). Hayagusi
production (project `demo-sokohai`).

## 3. Staging (inapendekezwa kwanza)

1. Unda Firebase project ya staging (mf. `sokonet-staging`) na Netlify site ya staging.
2. `firebase use --add` → chagua staging; weka `functions/.env` ya staging na
   **PesaPal sandbox** (`PESAPAL_BASE_URL=https://cybqa.pesapal.com/pesapalv3`).
3. `firebase deploy --only functions,firestore:rules,firestore:indexes --project sokonet-staging`
4. Netlify (staging): build command `node tools/build_dist.mjs --check`, publish `dist`.
5. Fanya majaribio ya "smoke" (sehemu ya 6) kwa akaunti za majaribio na pesa za sandbox.
6. PesaPal sandbox: `PESAPAL_CONSUMER_KEY=… PESAPAL_CONSUMER_SECRET=… npm run pesapal:sandbox -- order`,
   lipa kwenye ukurasa wa sandbox, kisha `npm run pesapal:sandbox -- status <OrderTrackingId>`.

### Rules zilizobadilika kwenye ukaguzi wa E2E (31 Okt 2026)
E2E ya browser ilionyesha kwamba rules za repo zilikuwa zikizuia kazi za msingi.
Zote zimerekebishwa na zina majaribio (`tools/test_repair_rules.mjs`, B-09…B-13):
- **B-09** usajili wa akaunti mpya ulikataliwa (`walletBalance: 0` ilionekana kama ufunguo hatari).
- **B-10** kuchapisha bidhaa kulikataliwa (`businessId/storeId: null`).
- **B-11** kusikiliza hali ya "block" kwenye chat kulikufa pale hakuna block.
- **B-12** views/shares za bidhaa hazikuhesabiwa (sasa +1 tu, hakuna kingine).
- **B-13** kuunda link ya SokoPay kulikataliwa (kivinjari kilituma `platformFee`).
Kabla ya deploy ya rules, linganisha rules zilizo LIVE sasa (Console → Firestore → Rules)
na hizi; kama LIVE ni za zamani zaidi, mabadiliko ni makubwa — jaribu staging kwanza.


### Phase 9 (31 Okt 2026) — mambo ya kujua kabla ya deploy
- **B-16 Taarifa za pesa:** mtumiaji hawezi tena kumtumia mtu mwingine taarifa ya "pesa imefika"
  (escrow/malipo/salio). Server ndiyo inatuma `notifications/escrow_link_<id>` baada ya kuthibitisha
  malipo (wallet au PesaPal). Weka `WALLET_VIA_SERVER: true` na `CRON_VIA_SERVER: true` (js/00-config.js) —
  njia za zamani za kivinjari sasa zinakataliwa na rules.
- **B-18 Uhariri wa admin kutoka kivinjari:** admin akihariri oda, bidhaa ya muuzaji mwingine au wasifu wa
  mtu mwingine lazima abebe sahihi (`skhAdminStamp()`); fedha za oda haziwezi kubadilishwa kwa njia hii
  (tumia callables). Triggers mpya: `ordersAdminAudit`, `productsAdminAudit`, `usersAdminAudit`.
- **Cloudinary:** sahihi ya server sasa inajumuisha `allowed_formats` (picha / sauti-video / nyaraka kwa
  chat na printing tu). Bado funga preset kwenye dashboard.
- **PesaPal:** functions zinakataa URL ya LIVE nje ya project `sokonet-3b847` (isipokuwa `PESAPAL_ALLOW_LIVE=true`).
  `tools/pesapal_sandbox_check.mjs` inakubali host `cybqa.pesapal.com` tu.
- **App Check:** `window.skhAppCheckHeaders()` inaongeza token kwenye simu za REST (usajili wa mwanachama
  wa offline, uchunguzi wa admin).
- **Dependencies:** `npm audit fix` (bila --force) kwenye functions: critical 1 + high 3 zimeondoka; zimebaki
  moderate 9 zinazohitaji firebase-admin 13 (mabadiliko makubwa) — angalia kabla ya kupandisha.
- **Discover:** mafaili 11 hayapakiwi na programu; yakibaki local, `npm test` (test_white_system_final_contract)
  inashindwa kwa sababu inahakikisha 75/88 hayapo.

### Inventory, reservation na seller channels (31 Okt 2026)
Maelezo kamili: `docs/INVENTORY-AND-SELLER-MODEL-2026-10.md`. Kabla ya deploy:
- **Rules (F6):** browser haiwezi tena kuandika `variantCombinations` wala `reservedStock`. Deploy
  functions (`productVariantsSave`) **pamoja** na rules, au kabla yake, sivyo kuhariri variants kutashindwa.
- **functions/shared:** `pos-product-identity-core.js` na `inventory-reservation-core.js` lazima ziwe ndani ya
  `functions/shared/` (`node functions/build-shared.js`). Code ya HEAD ilikuwa inasoma `../shared/...`, ambayo
  haipakiwi kwenye deploy.
- **Indexes:** deploy `firestore.indexes.json` kabla ya kuwasha reservation (sweep inahitaji indexes).
- **Reservation:** inaanza `off`. Usiwashe `pilot`/`all` kwenye production kabla ya majaribio ya staging na
  PesaPal sandbox. TTL ya dakika 15 ni ya majaribio.
- **Triggers mpya:** `inventoryOrderCreated`, `inventoryOrderUpdated` (zinasoma config tu zikiwa `off`),
  `inventoryReservationSweep` (kila dakika 5).
- **Seller lifecycle (UX 31 Okt):** rules sasa zinazuia kivinjari kuandika `sellerType: 'permanent'`,
  `productLimit > 9` na `sellerStatusHistory`. Deploy `sellerLifecycleChange` **pamoja** na rules; sivyo
  usajili wa duka la kudumu na kitufe cha "Badili kuwa Kudumu" vitashindwa. Wauzaji waliopo wa kudumu hawaguswi.
- **Picha:** bidhaa za dukani-tu / kusimamia-tu zinaweza kuhifadhiwa bila picha (`image: ''`).
- **Desimali (1 Nov):** `functions/shared/quantity-core.js` lazima iwepo (`node functions/build-shared.js`).
  Rules: `quantityPrecision` 0–3 na haibadilishwi na muuzaji; `verificationChecks` ni privileged.
  `system_config/seller_verification` haihitajiki (bila hiyo hakuna sharti la verification).

## 4. Deploy ya production (BAADA YA IDHINI TU)

Runtime: **Node 22**. Node 20 iliondolewa kwenye Cloud Functions tarehe
2026-10-30; deploy kwa `nodejs20` itakataliwa.

Mpangilio ni muhimu (client mpya inahitaji callables mpya; rules mpya zinakataa
njia za zamani za kivinjari):

1. **Functions:** `firebase deploy --only functions --project sokonet-3b847`
   - Thibitisha zimetumwa: `auctionPlaceBid`, `groupBuyJoin`, `commerceModesSweep`,
     `admin*`, `orderDeliveryCodeIssue`, `orderConfirmDelivery`, `disputeOpen`,
     `adminResolveDispute`, `adminApproveOrderPrice`, `adminSetEscrowPolicy`, `entitlementGrant`,
     `userCardSync`, `adminBackfillUserCards`, `systemConfigAudit`.
   - **Kabla ya rules:** Super Admin afungue Kituo cha Udhibiti → Sera ya Escrow →
     **"Jaza kadi za umma sasa"** (au aite `adminBackfillUserCards`). Bila hatua hii,
     baada ya rules mpya majina na picha za watumiaji wa zamani hazitaonekana kwa
     wengine, kwa sababu `users/{id}` sasa ni binafsi.
2. **Netlify:** deploy ya commit hii (build `node tools/build_dist.mjs --check`, publish `dist`).
3. **Rules + indexes (mara moja baadaye):**
   `firebase deploy --only firestore:rules,firestore:indexes --project sokonet-3b847`
4. **PesaPal IPN:** ikiwa URL ya IPN haijasajiliwa, piga `pesapalRegisterIpn` (admin) au tumia dashboard ya PesaPal.

## 5. Kazi za mara moja baada ya deploy (admin)

1. Fungua **Kituo cha Udhibiti wa Admin → Mawakala**: hakiki upya mawakala wa
   zamani (idhini za kabla ya marekebisho hazitumiki mpaka zihakikiwe).
2. **Sera ya Escrow**: amua na uweke saa za kuachia kiotomatiki na muda wa mgogoro
   (tupu = hakuna kuachia kiotomatiki).
3. **Ukaguzi wa Bei**: pitia oda zilizosimamishwa.
4. Hakikisha swichi ya **Oda za Pamoja za makundi** imezimwa.
5. Washa/zima swichi moja ya ada au moduli kisha uangalie **Kumbukumbu**: lazima
   ionekane `SYSTEM_CONFIG_CHANGED` yenye jina lako (thibitisho la M7).

## 6. Majaribio ya smoke baada ya deploy

- Tovuti: `/seed-local-test-accounts.mjs`, `/fonts/functions/index.js`, `/firestore.rules`
  lazima zirudishe ukurasa wa programu (si faili).
- Mnunuzi: oda ya bidhaa → PesaPal (kiasi kidogo halisi au sandbox kwenye staging)
  → oda inakuwa "held" na server → Namba ya Kupokea → muuzaji anathibitisha →
  "Nimepokea" → muuzaji analipwa mara moja tu.
- Mnada: dau kutoka akaunti mbili; muuzaji hawezi kuweka dau.
- Group Buy: kujiunga mara moja kwa kila mtu.
- Admin: `adminWhoAmI` inaonyesha nafasi sahihi; kumbukumbu za ukaguzi zinaonekana.
- Usafirishaji: kuomba usafiri kutoka checkout kunafanikiwa (rule mpya ya `ride_requests`).
- Faragha: ukiwa umeingia kama mtumiaji wa kawaida, ukurasa wa duka la muuzaji
  unaonyesha jina/picha (kutoka `userCards`), lakini `users/<id-ya-mtu-mwingine>`
  inakataliwa.
- Fomu ya Kuongeza Bidhaa: sehemu ya "Generate variants" inafanya kazi (Product
  Builder ilikuwa haipakii kabisa kwa sababu ya exports zilizokosekana).

## 7. Rollback

| Sehemu | Jinsi ya kurudisha | Muda |
|--------|-------------------|------|
| Netlify | Netlify → Deploys → chagua deploy ya awali → "Publish deploy" | Papo hapo |
| Firestore rules | Console → Rules → historia → chagua toleo la awali → Publish; au `git show ac22ddc:firestore.rules > firestore.rules` kisha deploy rules | Dakika 1 |
| Functions | `git checkout <commit-ya-awali> -- functions` **lakini acha** `firebase.json` kwenye `nodejs22`, kisha `firebase deploy --only functions` | Dakika 5–10 |
| Data | `gcloud firestore import gs://<bucket>/<backup>` (huandika juu ya data — tumia tu kwa dharura kubwa) | Inategemea ukubwa |

Kumbuka: kurudisha rules za zamani kunarudisha pia mianya ya usalama iliyorekebishwa
(C1–C5). Tumia rollback ya rules kwa muda mfupi tu.
