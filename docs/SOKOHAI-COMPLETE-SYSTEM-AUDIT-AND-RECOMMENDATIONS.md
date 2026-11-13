# SOKOHAI — Ukaguzi kamili wa mfumo na mapendekezo ya kiarkitekti

**Tarehe:** 2026-11-14 · **Code iliyokaguliwa:** tawi `fix/live-merge-reconcile-20261113` (juu ya `26bc673` + ukarabati
wa Live/Chat ulioidhinishwa) · **Mazingira:** Firebase Emulator (Firestore 8085, Auth 9099)
+ local functions server (5055) + Chromium halisi. **Hakuna** production, PesaPal halisi, Netlify wala data ya wateja.

**Ukaguzi huu ni wa kusoma tu**, isipokuwa ukarabati wa Live/Chat ulioidhinishwa
(`docs/SOKOHAI-LIVE-CHAT-NAV-FIX-REPORT.md`). Hakuna pendekezo hapa lililotekelezwa.

### Alama za ushahidi (zinatumika kote)

| Alama | Maana |
|---|---|
| **[T]** | Imethibitishwa kwa jaribio la kiotomatiki (unit/emulator/E2E kwenye browser halisi) — matokeo yametajwa |
| **[C]** | Imeonekana kwa kusoma code tu (faili:mstari) — haijaendeshwa |
| **[N]** | Haijathibitishwa (NOT VERIFIED) — kinachohitajika kimetajwa |
| **[B]** | Imezuiwa na funguo/usanidi wa nje (PesaPal, Cloudinary signed, VAPID, TURN, staging) |
| *Maoni* | Maoni yangu ya kitaalamu — si ukweli uliothibitishwa |

Ushahidi wa majaribio uliotumika: `npm test` 107/107; build `--minify --check` PASS; suites za emulator za server
(R16: 31/32 — category filter 5/8 inasubiri uamuzi D8; code ya server haijabadilika tangu hapo); E2E kamili 56/56 simu
+ 56/56 desktop; navigation 56/56 (viewports 4); Live/Chat-auth 40/40 (viewports 4); safari za R13–R16 (oda, huduma,
usafiri, Group Buy, utambulisho, Live kamera, mnada, group chat/business). Namba za mwisho za mzunguko huu: sehemu H.

---

## A. Muhtasari mkuu (Executive Summary)

**Hali ya jumla:** SokoHai si mfano (prototype) tena. Ni marketplace kubwa (≈95,000 mistari ya JS ya browser, faili 143;
≈16,000 mistari ya Cloud Functions; callables/triggers ≈150; rules mistari 2,229 zinazofunga kila collection isiyotajwa).
**Kiini cha fedha kimejengwa kwa nidhamu nzuri**: salio la wallet haliwezi kuandikwa na browser, kila mabadiliko ya pesa
yanapita kwenye transaction ya server yenye ledger na ufunguo wa idempotency, escrow inatolewa mara moja tu, na
majaribio yanathibitisha hili. Safari kuu (kununua → kulipa kwa wallet → kusafirisha → kupokea → kutolewa kwa escrow;
huduma; usafiri; mnada; Group Buy) zinafanya kazi mwisho-hadi-mwisho **kwenye emulator**.

**Utayari wa kuzindua:** **Tayari kwa masharti** — kwa majaribio ya kikundi kidogo (pilot) yenye pesa ndogo na
uangalizi wa karibu, BAADA ya masharti ya sehemu G. **Siyo tayari** kwa uzinduzi wa wazi wa umma leo.

**Nguvu kuu:**
1. Usalama wa pesa upande wa server (ledger + idempotency + escrow ya mara moja + rules) [T].
2. Upana wa vipengele: bidhaa, huduma, usafiri, POS/Business OS, mnada, bei-kushuka, Live, Group Buy/Soko, chat, matangazo.
3. Utamaduni wa majaribio: mamia ya majaribio ya rules/emulator na E2E za browser halisi kwenye simu na desktop.
4. Kila uamuzi wa admin wenye pesa unahitaji sababu na unaandikwa kwenye `admin_audit_log` [C][T kwa sehemu].

**Udhaifu mkuu:**
1. **Arkitekti ya frontend ya "tabaka za marekebisho"**: kazi nyingi zimeandikwa upya mara nyingi
   (`window.openCart` mara 7, `closeModals` mara 5, `updateApp` mara 4, faili 9 zenye majina ya "fix/repair"),
   na tabia inaamuliwa na mpangilio wa kupakia. Kasoro za navigation tulizorekebisha mara mbili zilitoka hapa.
2. **Mtiririko wa pesa wa nje haujawahi kuendeshwa**: PesaPal (sandbox wala live), payouts za kutoa pesa ni za mkono
   (admin anatuma nje ya mfumo), refund kwenye kadi/M-Pesa hazipo [B][C].
3. **Mantiki ya nauli ya usafiri**: nauli inalipwa kutoka kwenye fedha za MUUZAJI zilizo escrow, na kiasi chake
   kinatoka kwenye ombi la safari lililoandikwa na mnunuzi (sehemu D, P1-02) [C].
4. **Hakuna mazingira ya staging**, App Check haijawashwa kwa chaguo-msingi, Netlify imesimamishwa [B][C].
5. Uendeshaji (ops): hakuna ufuatiliaji wa makosa ya production, upatanisho wa malipo yaliyokwama, wala dashibodi ya
   SLA za wakala/wauzaji [C].

**Hatari kubwa zaidi:** (1) fedha za wahusika kugawanywa vibaya (nauli/ada) bila mtu kugundua; (2) malipo ya PesaPal
yaliyokamilika lakini IPN ikakosekana → mteja amelipa, oda haijashikiliwa; (3) mabadiliko madogo ya frontend
kuvunja safari nyingine kwa sababu ya tabaka zinazofunika kazi zile zile.

---

## B. Ukaguzi moduli kwa moduli

Hali: **PASS** · **PARTIAL** · **FAIL** · **NOT VERIFIED** · **NOT IMPLEMENTED**.

### B1. Wakala (Agent) — **PARTIAL**
- **Kinachofanya kazi:** maombi ya wakala na uamuzi wa admin (`adminApproveAgent`, `adminRejectAgent`,
  `adminSetAgentStatus` — rules/server 9/9 [T]); usajili wa wanachama wa offline kupitia wakala
  (`memberRegister`, `assistedSessionValidate/End`, `31-agent-assist.js`) [C]; wakala kama msafirishaji:
  "Maombi Yaliyotumwa Kwako" → kukubali → PK → safari → DL → malipo [T: transport journey 7/7 × 2].
- **Kamisheni:** wakala anapata **60% ya ada ya jukwaa** ya mauzo ya muuzaji aliyemsajili (`functions/index.js:1240`),
  lakini ada ya jukwaa **imezimwa kwa chaguo-msingi** (`paymentGate`, `functions/index.js:147-158`) → kwa sasa
  wakala anapata **0** kutokana na mauzo [C]. Kamisheni ya usajili wa offline inahitaji ada iliyolipwa PesaPal [C][B].
- **Pungufu:** dashibodi ya wakala (`loadAgentDashboard`) haina E2E [N]; uhusiano wa wakala na muuzaji ni kamba ya
  maandishi (`agentCode` ↔ `myAgentCode`) bila historia/uhamisho [C]; hakuna SLA, eneo (territory), KPI, wala
  ufuatiliaji wa uwajibikaji wa wakala (kukataa/kuchelewa) [C]; athari ya kumsimamisha wakala kwa safari alizonazo [N].
- **Usalama:** kukubali safari ni atomic; mteja hawezi kujifanya dereva; dereva hawezi kuwa mnunuzi/muuzaji [C][T].

### B2. Chat — **PASS (msingi) / PARTIAL (nyongeza)**
- **Inafanya kazi:** mazungumzo ya mtu kwa mtu, uundaji na historia, ruhusa za rules (chat security 59/59 [T]),
  E2E mnunuzi↔muuzaji (#6) [T], inbox → mazungumzo → Back [T: nav E], chat kutoka ukurasa wa bidhaa [T: nav K],
  group chat na group business (8 + 13 × 2) [T], kuzuia (`blocks`, rules 1252-1262) [C], kuripoti
  (`skhChatReport`) [C], kutafuta [C], kadi za bidhaa/oda ndani ya chat [C], sauti (MediaRecorder; `netlify.toml`
  sasa inaruhusu microphone) [C], chat bila login → login kwanza → inbox [T: C1–C3, viewports 4].
- **Pungufu:** hakuna "read receipts" halisi (alama ya kusomwa) [C]; hali ya online haionyeshwi kwa makusudi [C];
  simu za sauti/video (`105-calls.js`) zipo lakini hazijajaribiwa [N]; push ya ujumbe inahitaji VAPID [B].
- **Hatari:** faili 8+ zinagusa chat (34, 68, 69, 78, 90, 92, 93, 104) — marekebisho mengi yanayofunika mengine.
  Mbio za async (chat kufunguka baada ya mtumiaji kurudi) zilikuwepo na zimezuiwa kwa token [T].

### B3. Usafirishaji na bidhaa — **PARTIAL**
- **Inafanya kazi:** `orders → ride_requests → delivery_offers → Inbox ya wakala → kukubali → PK (muuzaji + wakala
  tu) → makabidhiano → safari → DL ya mnunuzi → kukamilisha → escrow kwa muuzaji + msafirishaji` [T];
  ripoti za hitilafu/migogoro ya safari (`deliveryReportTransportFault`, `deliveryDispute`) [C];
  route booking/sweep [C]; mnunuzi anachagua "Sitahitaji usafirishaji" [T].
- **Tatizo la sera/fedha (P1-02):** nauli (`agreedFare`) inakatwa kutoka kwenye **fedha za mauzo zilizo escrow**
  (`releaseOrderEscrow`, `functions/index.js:1181-1224`; `sellerEarned = jumla − ada − nauli`). Mnunuzi halipi
  nauli wakati wa checkout ("nauli huamuliwa na mtoa usafiri"). Kiasi cha nauli kinachukuliwa kutoka `ride_requests.fare`
  ambacho **kinaandikwa na mnunuzi** (`43-delivery-choice.js:445, 716`; rules zinamruhusu `customerId` kuunda). Kikomo
  pekee ni jumla ya oda. Muuzaji anathibitisha makabidhiano lakini sikuona mahali anapoona/kukubali kiasi cha nauli [C].
  Hii inahitaji uamuzi wako na jaribio maalum.
- **Pungufu:** ufuatiliaji wa ramani wa moja kwa moja [N]; kugawa upya (reassignment) wakala akishindwa [N];
  arifa kwa kila hatua [C, push [B]].

### B4. Huduma (Huduma) — **PASS (emulator)**
- Usajili kupitia Huduma Hub → kugundua → ombi/majadiliano (`nfShell`) → fundi kukataa/kukubali → mteja kulipa
  kwa wallet (escrow) → "kazi imekamilika" → namba → kuthibitisha → malipo kwa fundi → tathmini yenye beji
  [T: service journey 10/10 × 2; nav F].
- **Iliyorekebishwa leo:** kitufe kikuu "Kadirio / Agiza Huduma" kilikuwa cheupe juu ya cheupe [T].
- **Pungufu:** ratiba/kalenda ya upatikanaji wa fundi [C: haipo kama mfumo]; fundi kutofika (no-show) — hakuna
  mtiririko maalum, ni mgogoro wa kawaida [C]; uthibitisho wa fundi unategemea uthibitisho wa utambulisho [B: Cloudinary].

### B5. SokoPay — wallet, escrow, malipo — **PASS (ndani) / NOT VERIFIED (nje)**
- **Imara [T][C]:** `walletBalance` haiandikwi na browser (rules `privilegedUserKeys`, mistari 340-411); `walletAdjust`
  ndiyo njia pekee, admin anahitaji sababu + audit, mtumiaji anaweza kuongeza tu kwa ushahidi wa PesaPal;
  `orderWalletPay`/`serviceOrderWalletPay` zinakagua bei upande wa server; `WLT_` ni ya server tu; escrow inatolewa
  mara moja (E2E #12 [T]); reconcile ya ledger PASS (R16) [T]; migogoro → refund kwenye wallet 7/7 [T];
  `sokopayAutoRelease` haitoi pesa kwa tarehe za browser [C].
- **Kutoa pesa (withdrawal):** `withdrawalRequest` inashikilia salio mara moja (atomic, idempotent); `withdrawalResolve`
  ni **admin anathibitisha kwamba ametuma pesa NJE kwa mkono** (`functions/index.js:971-1076`) [C]. Hakuna jaribio la
  kiotomatiki linaloita njia hii [N]. Hakuna idhini ya watu wawili (maker-checker) kwa malipo makubwa [C].
- **Nje [B]:** amana (deposit) kupitia PesaPal haijawahi kuendeshwa hata sandbox; hakuna kazi iliyopangwa ya kupatanisha
  miamala ya PesaPal iliyokwama bila IPN [C]; refund kwenye kadi/M-Pesa haipo (zote zinarudi wallet) [C].
- **Ada:** ada ya jukwaa 5% imezimwa kwa chaguo-msingi [C] — mapato ya jukwaa na kamisheni ya wakala = 0 mpaka uiwashe.

### B6. Kikapu na checkout — **PASS (njia kuu) / PARTIAL (uimara)**
- Kuongeza/kuondoa/idadi, bei za jumla kwa idadi (E2E #26-30 [T]), wauzaji wengi → oda kwa kila muuzaji [C],
  checkout → wallet → `held` [T: order journey 7/7 × 2], kikapu → malipo → kufunga → kikapu [T: nav C].
- **Kikapu kinafutwa KABLA ya malipo kuthibitishwa** (`43-delivery-choice.js:614`): oda inaundwa (`payment_pending`)
  na kikapu kinafutwa; mtumiaji akiacha, oda isiyolipwa inabaki (ipo kwenye Kituo cha Escrow) [C][T].
  *Pendekezo (uamuzi D10):* usifute kikapu mpaka malipo yathibitishwe (`held`); badala yake "funga" vipengele vya kikapu
  kwenye oda hiyo (lock) na uvifungue ikiwa malipo yameshindwa/yameisha muda. Hii inaondoa "nimelipa wapi?" na kikapu
  kilichopotea, bila kuruhusu oda mbili.
- **Oda zinaundwa na browser** (rules `match /orders`, mstari 549) na server inakagua bei wakati wa kulipa [C][T].
  Kugusa mara mbili kunaweza kuunda oda mbili zisizolipwa [N]; malipo yenyewe ni idempotent [T].

### B7. Navigation, menyu, sidebar, bottom nav — **PASS (baada ya ukarabati)**
- Mfumo mmoja (`56-nav-back.js`): tabs, overlays, Live, modes ziko kwenye historia; Back/Forward/Esc/X sahihi;
  hakuna tabaka lisiloonekana; Business OS sidebar 31 × viewports 6 [T]; pointi zote zilizolindwa zinaonyesha login
  juu bila UI nyuma yake [T: ukaguzi wa entry points].
- **Pungufu:** ukurasa ukipakiwa upya (refresh) unarudi Home (hali ya overlay/tab haihifadhiwi kwenye URL, isipokuwa
  `#/product/{id}`) [C]; sehemu 4 zinafuta hali ya historia (`replaceState(null)`: kurudi kutoka PesaPal, push link,
  reset ya nenosiri, logout) [C, athari ndogo]; tabaka 79/81 bado zipo [C].

### B8. Bidhaa, kategoria, wauzaji, Business OS, inventory, POS — **PASS (kwa sehemu kubwa)**
- Kuchapisha bidhaa kwa fomu halisi [T]; ukurasa wa bidhaa (picha, jumla, linganisha wauzaji) [T]; usajili wa muuzaji
  (temporary/permanent, kupandishwa na server tu) [T]; Business OS 31 [T]; POS kuuza → stock [T]; inventory rules 44,
  reservations 27, decimal 10 [T]; lifecycle ya muuzaji 21 [T].
- **Kategoria — PARTIAL:** lebo 12 za zamani zimeunganishwa kwenye code; jaribio la R4 linadai zisiunganishwe (5/8) →
  **uamuzi D8** [T].
- Uthibitisho wa muuzaji (beji) unategemea uthibitisho wa utambulisho [B: Cloudinary signed].

### B9. Oda, Group Soko, Group Buy, Live, Mnada, Bei Kushuka
| Moduli | Hali | Ushahidi |
|---|---|---|
| Oda (mzunguko) | PASS | order journey 7/7 × 2; core release; migogoro 7/7 [T] |
| Group Soko (biashara ya pamoja) | PASS (emulator) | rules 33 + 90; E2E 13 × 2 [T]; matangazo ya kulipia/mgao = **haijawashwa** (D5) |
| Group Buy | PASS | lifecycle 12/12; E2E 6/6 × 2 [T]; `escrow_commit` inasubiri idhini yako (D1) |
| Live Commerce | PASS (mtandao mmoja) | kamera 6/6 × 2; Live/Chat nav 40/40 [T]; mitandao tofauti inahitaji TURN [B] |
| Mnada | PASS | auction suites; Auction Live 10/10 × 2; admin 3/3 × 2 [T] |
| Bei Kushuka | PASS | queue 16/16 [T] |
| Oda za kikundi ndani ya chat | NOT IMPLEMENTED (kwa makusudi) | server inakataa (E2E #17) [T]; uamuzi D4 |

### B10. Admin Control Center, arifa, utambulisho, usalama
- **Admin — PASS:** kufungua, kutafuta mtumiaji, sera ya escrow, kuficha/kurudisha tangazo + audit (E2E #18-19) [T];
  Group Buy, uthibitisho, hali ya usanidi (booleans tu) [T]; maombi ya kutoa pesa [C].
  *Pungufu:* hakuna idhini ya watu wawili kwa hatua za pesa; hakuna dashibodi ya "pesa zilizokwama" (pending payments,
  withdrawals za muda mrefu, escrow zinazokaribia auto-release) [C].
- **Arifa — PARTIAL:** arifa za ndani ya app [C]; push imejengwa (push 9/9, UI 5/5 × 2 [T]) lakini inahitaji VAPID [B].
- **Utambulisho — PASS (code) / [B]:** hati za siri (authenticated), admin anaona kwa kiungo kilichosainiwa, herufi 4
  za mwisho tu (8/8 + 5/5 × 2 [T]); inahitaji Cloudinary signed kwa production [B].
- **Usalama:** rules zina `deny` ya mwisho kwa kila kisichotajwa (mstari 2227) [C]; suites za usalama 57 + 41 + 34 +
  139 [T]; **App Check imezimwa kwa chaguo-msingi** (`APP_CHECK_ENFORCE`, `functions/index.js:33-36`) [C];
  collections za umma (`drivers`, `transport_profiles`, `userCards`, `publicProfiles`) zinasomeka na yeyote — maudhui
  yake yanapaswa kukaguliwa kwa taarifa binafsi (namba za simu) [N].

### B11. Database, rules, Cloud Functions, muunganiko
- Rules: 130 `match`, `deny` ya mwisho, sehemu za pesa/hali ya oda ni za server [C][T].
- Functions: ≈150 callables/triggers; kazi 7 zilizopangwa (auto-release kila dk 5, inventory kila dk 5, commerce/Group
  Buy kila dk 15, matangazo kila saa, takwimu kila saa) [C]; `maxInstances: 10` kwa kila function [C].
- **Haipo:** kazi ya kupatanisha PesaPal iliyokwama; ufuatiliaji wa makosa (Sentry/Cloud Error Reporting) uliounganishwa
  na tahadhari; backup/PITR ya Firestore iliyoandikwa kama utaratibu [C].
- **Repo:** faili zisizohitajika zimo kwenye git: `"iness OS and platform improvements…"` (mzizi wa repo, ipo hata kwenye
  `origin/main`), `js/app/54-error-core.js.backup-before-local-fix` [C]. `53-test-sandbox.js` inapakiwa production lakini
  inajizima nje ya localhost/staging [C].
- **Utendaji:** script 141 kwenye `index.html`; JS ya `dist` ≈5.7 MB kabla ya gzip [C]. Kasi kwenye 3G/simu za bei
  nafuu haijapimwa [N].

---

## C. Ramani ya muunganiko wa mifumo

```mermaid
flowchart LR
  subgraph Buyer[Mnunuzi]
    P[Bidhaa/Huduma] --> Cart[Kikapu] --> Ord[Oda payment_pending]
    P --> Chat
    P --> Live[Live / Mnada / Bei Kushuka]
  end
  Ord -->|orderWalletPay| Esc[(Escrow hold)]
  Ord -.->|PesaPal IPN  [B]| Esc
  Wallet[(Wallet + ledger)] -->|debit| Esc
  Esc -->|seller ships| Ship[Imesafirishwa]
  Ord -->|Nahitaji usafiri| Ride[ride_requests]
  Ride --> Offer[delivery_offers] --> Agent[Wakala inbox]
  Agent -->|deliveryAccept: agreedFare| Ride
  Ship --> DL[DL ya mnunuzi / Nimepokea]
  DL -->|releaseOrderEscrow| Split{Mgawanyo}
  Split -->|jumla - ada - nauli| Seller[Wallet ya muuzaji]
  Split -->|nauli| Carrier[Wallet ya msafirishaji]
  Split -->|60% ya ada| AgentW[Wallet ya wakala]
  Split -->|40% ya ada| Platform[Jukwaa]
  Wallet -->|withdrawalRequest| WR[Maombi ya kutoa] -->|admin: paid kwa mkono| Out[Pesa nje]
  Disp[Mgogoro] -->|adminResolveDispute| Wallet
  Svc[Huduma: ombi -> kukubali] -->|serviceOrderWalletPay| Esc
  Admin[Admin Control Center] --> Disp
  Admin --> Verif[Uthibitisho] --> Seller
  GB[Group Buy] -->|lengo limefikiwa| Ord
  classDef gap fill:#fff3cd,stroke:#b8860b;
  class Carrier,Out,Ride gap;
```

**Viungo vyenye pengo (njano):**
- `Ride → agreedFare → Carrier`: nauli inatoka kwa muuzaji, kiasi kinatoka kwa mnunuzi (P1-02).
- `withdrawalRequest → Out`: payout ni ya mkono; hakuna muunganiko wa M-Pesa/benki (P1-04).
- `PesaPal → Escrow`: haijawahi kuendeshwa; hakuna upatanisho wa IPN iliyokosekana (P1-01).
- Wakala ↔ muuzaji: kupitia `agentCode` tu; kamisheni = 0 mpaka ada iwashwe.
- Arifa za kila hatua: in-app ndiyo; push [B].

---

## D. Matokeo muhimu (P0–P3)

**P0 (pesa kupotea/usalama/data kuharibika):** *Sikupata P0 iliyothibitishwa kwenye code ya sasa.* Hii ni kauli yenye
mipaka: njia za pesa za nje (PesaPal live, payouts) hazijawahi kuendeshwa — zikiwashwa bila masharti ya sehemu G, P1-01
na P1-04 zinaweza kugeuka P0.

| ID | Kipaumbele | Tatizo | Ushahidi | Athari / nani | Hatua inayopendekezwa |
|---|---|---|---|---|---|
| P1-01 | P1 | Hakuna upatanisho wa PesaPal: IPN ikikosekana, mteja amelipa lakini oda inabaki `payment_pending` | Kazi zilizopangwa hazina PesaPal reconcile [C]; `pesapalTransactionStatus` inaitwa na ukurasa wa kurudi tu | Wateja, support | Kazi iliyopangwa ya kuuliza hali ya miamala `pending` > dk 10; dashibodi ya admin ya "malipo yaliyokwama" |
| P1-02 | P1 | Nauli ya usafiri inakatwa kwenye fedha za muuzaji; kiasi kinatoka kwenye `ride_requests.fare` iliyoandikwa na mnunuzi | `functions/index.js:1181-1224, 2844, 2968`; `43-delivery-choice.js:445,716` [C] | Wauzaji (mapato), uaminifu | Uamuzi wa sera: nani analipa nauli. Pendekezo: mnunuzi analipa nauli tofauti (escrow tofauti) iliyokubaliwa na mnunuzi + msafirishaji; muuzaji anaona kiasi kabla ya makabidhiano; jaribio la mgongano mnunuzi+dereva |
| P1-03 | P1 | App Check haijawashwa; callables ziko wazi kwa skripti | `functions/index.js:33-36` [C] | Matumizi mabaya, gharama | Washa App Check (reCAPTCHA Enterprise) kwenye staging → production |
| P1-04 | P1 | Kutoa pesa: admin mmoja anaweka "paid" baada ya kutuma nje; hakuna maker-checker wala muunganiko wa payout; hakuna jaribio | `functions/index.js:971-1076` [C][N] | Pesa za wauzaji/mawakala | Idhini ya watu wawili juu ya kiwango; rekodi ya kumbukumbu ya muamala wa nje (M-Pesa ref); jaribio la emulator |
| P1-05 | P1 | Hakuna staging; deploy yoyote isiyo na `--project` inaenda production | `.firebaserc` (default = production) [C] | Kila mtu | Mradi wa staging + CI inayozuia deploy ya production bila idhini |
| P1-06 | P1 | Arkitekti ya frontend ya tabaka zinazofunika kazi zilezile | `openCart` ×7, `closeModals` ×5, `updateApp` ×4; faili 9 za "fix" [C] | Kila badiliko | Usiandike upya sasa; anzisha "mmiliki mmoja kwa kila kazi" hatua kwa hatua (sehemu E) |
| P2-01 | P2 | Kikapu kinafutwa kabla ya malipo | `43-delivery-choice.js:614` [C] | Wanunuzi | D10: lock badala ya kufuta |
| P2-02 | P2 | Ada ya jukwaa/kamisheni ya wakala = 0 kwa chaguo-msingi | `functions/index.js:147-158, 1240` [C] | Biashara, mawakala | Uamuzi wa bei kabla ya kuajiri mawakala |
| P2-03 | P2 | Hakuna ufuatiliaji wa makosa ya production + tahadhari | [C] | Ops | Cloud Error Reporting/Sentry + tahadhari kwa makosa ya callables za pesa |
| P2-04 | P2 | Collections za umma zinaweza kuwa na taarifa binafsi | rules 1454-1476 [N] | Faragha ya madereva | Kagua maudhui; hamisha mawasiliano kwenye subcollection ya kibinafsi (kama ilivyofanywa kwa rides) |
| P2-05 | P2 | Mzigo wa JS kwa simu (script 141, ≈5.7 MB) | [C][N] | Wateja wa 3G | Pima kwenye kifaa halisi; bundle + lazy-load ya moduli za admin/BOS/ads |
| P2-06 | P2 | Mawakala: hakuna SLA/eneo/uwajibikaji/kugawa upya | [C] | Usafiri | Sehemu E |
| P2-07 | P2 | Oda mbili zisizolipwa kwa kugusa mara mbili | [N] | Data chafu | Ufunguo wa idempotency wa checkout kwenye kuunda oda |
| P3-01 | P3 | Faili zisizohitajika kwenye repo | mzizi `"iness OS…"`, `54-error-core.js.backup-…` [C] | Usafi | Ondoa kwa commit tofauti (kwa idhini) |
| P3-02 | P3 | Refresh inarudi Home; `replaceState(null)` sehemu 4 | [C] | UX | URL kwa kurasa kuu (tab, duka) |
| P3-03 | P3 | Hakuna "read receipts" za chat | [C] | UX | Ikiwa inahitajika kibiashara |
| P3-04 | P3 | Jaribio `test_r13b_live_stories_groupsoko` limechakaa (selectors za muundo wa zamani wa Live) — 5/17 zinashindwa hata kwenye code ya zamani | `audit`: base run 12/17 × 2 [T] | Ulinzi wa majaribio wa Live umepungua | Sasisha selectors (kwa idhini; si kulegeza assertions) |

---

## E. Mapendekezo yangu huru (Claude)

### E1. Tathmini yangu ya SokoHai kama bidhaa
- *Maoni:* Ni jukwaa lenye **upana usio wa kawaida** kwa hatua hii — linajaribu kuwa Jumia + Upwork/Fundi + Bolt +
  Square POS + TikTok Live kwa wakati mmoja, kwa soko la Tanzania. Kiini cha fedha (ledger/escrow/idempotency) ni
  **imara zaidi kuliko kawaida** kwa startup, na hiyo ndiyo mali kubwa.
- **Iliyojengwa vizuri sana:** escrow + ledger + reconcile; rules zinazokataa kila kisichotajwa; mamlaka ya admin yenye
  sababu + audit; uthibitisho wa utambulisho wenye hati za siri; POS/Business OS; majaribio ya browser halisi.
- **Inaonekana kamili juu lakini ina udhaifu ndani:** usafirishaji (nani analipa nauli), mawakala (kamisheni = 0,
  hakuna SLA), malipo ya nje (hayajawahi kuendeshwa), frontend (tabaka za marekebisho).
- **Je, ni marketplace moja iliyounganishwa?** Kwa njia za pesa — **ndiyo** (wallet/escrow moja kwa bidhaa, huduma,
  usafiri, mnada, Group Buy). Kwa uzoefu wa mtumiaji — **kwa sehemu**: kuna milango mingi (Home, sidebar, mode menu,
  Business OS, hub ya Live, chat discovery) na mtumiaji mpya anaweza kupotea.
- **Inafaa kwa wateja halisi?** Kwa pilot ndogo inayoangaliwa — ndiyo, baada ya masharti ya G. Kwa ukuaji mkubwa —
  frontend inahitaji kuimarishwa kwanza.

### E2. Kinachokosekana (kwa uhalisia, si kuongeza idadi)
1. **Upatanisho wa malipo na dashibodi ya "pesa zilizokwama"** (PesaPal pending, withdrawals > saa 48, escrow karibu na
   auto-release, migogoro iliyo wazi > siku 3).
2. **Sera ya nauli iliyo wazi** + nauli inayolipwa na mnunuzi kwenye escrow yake.
3. **Payout halisi** (M-Pesa B2C au benki) yenye idhini ya watu wawili juu ya kiwango.
4. **Kitabu cha uendeshaji (runbook)**: nini kinafanyika kwa kila tukio la sehemu E5, nani anafanya, ndani ya muda gani.
5. **Ufuatiliaji wa production**: makosa, muda wa callables, kushindwa kwa malipo, na tahadhari.
6. **Staging** inayofanana na production + CI inayoendesha majaribio kabla ya deploy.

### E3. Ningeboresha nini (kwa moduli)
| Eneo | Pendekezo | Thamani | Ugumu |
|---|---|---|---|
| Navigation/UX | Punguza milango: njia moja ya "Akaunti yangu" na moja ya "Biashara yangu"; URL kwa kurasa kuu (refresh/kushiriki) | Kupotea kidogo, support kidogo | Kati |
| Ugunduzi/kununua | Utafutaji unaovumilia makosa ya tahajia ya Kiswahili/Kiingereza; "Lipa Sasa" moja kwa bidhaa moja | Mauzo | Kati |
| Business OS | Ripoti ya kila siku ya mauzo/stock kwa SMS/WhatsApp kwa wauzaji wasio na data nyingi | Kubaki kwa wauzaji | Chini–Kati |
| Mawakala | SLA (muda wa kukubali/kufika), kugawa upya kiotomatiki, alama ya uaminifu, eneo | Uaminifu wa usafiri | Kati |
| Chat | Read receipts (hiari), ujumbe uliokwama ukiwa offline kutumwa baadaye | Uaminifu | Chini–Kati |
| Huduma | Ratiba/booking yenye muda, sera ya no-show (fidia/adhabu) | Uaminifu wa huduma | Kati |
| SokoPay | Upatanisho, payouts, maker-checker, risiti za PDF, ripoti ya kila mwezi ya mtumiaji | Imani, sheria | Kati–Juu |
| Kikapu | D10 (lock), idempotency ya kuunda oda | Hakuna oda mbili/kikapu kupotea | Chini |
| Admin | Foleni moja ya kazi (migogoro, uthibitisho, withdrawals, malipo yaliyokwama) yenye SLA | Ops | Kati |
| Usalama/utendaji | App Check, bundle ya JS, kipimo cha 3G, Firestore PITR | Gharama, kasi, ustahimilivu | Kati |

### E4. Nisichobadilisha (hifadhi)
- Kiini cha pesa: `walletAdjust`/ledger/idempotency/escrow ya mara moja, `releaseOrderEscrow`, rules za `privilegedUserKeys`.
- `deny` ya mwisho ya rules na nidhamu ya "pesa ni ya server tu".
- Mamlaka ya admin yenye sababu + audit; hati za utambulisho za siri.
- `56-nav-back.js` kama mfumo mmoja wa navigation (usiongeze router nyingine).
- Muundo wa wauzaji temporary/permanent unaopandishwa na server tu; POS/Business OS.
- Majaribio ya E2E kwenye browser halisi — ni kinga yako bora dhidi ya kuvunjika.
- Sera salama za chaguo-msingi: Group Buy `pay_after_target`, PesaPal live imezimwa, oda za kikundi kwenye chat zimezimwa.

### E5. Uendeshaji halisi — matukio
| Tukio | Leo | Salama? |
|---|---|---|
| Mteja amelipa (PesaPal) lakini oda haijaundwa/kushikiliwa | Oda inaundwa KABLA ya kulipa; settlement inakuja na IPN au ukurasa wa kurudi. IPN ikikosekana na mteja akafunga browser → inakwama [C] | **Hapana** mpaka P1-01 |
| Malipo ya wallet mara mbili | Idempotent; mara ya pili inarudisha "already" [T] | Ndiyo |
| Muuzaji amekubali lakini hawezi kutimiza | Mnunuzi anafungua mgogoro → admin → refund kwenye wallet [T]; stock ikikosekana baada ya malipo, oda inaingia ukaguzi wa admin (`adminPaymentReviewResolve`: refund au kutimiza, sababu ≥ herufi 10) [C]; muuzaji hawezi kughairi oda iliyolipwa mwenyewe na kurudisha pesa moja kwa moja [C] | Ndiyo, kupitia admin |
| Wakala ameshindwa kufikisha | Ripoti ya hitilafu/mgogoro ya safari ipo [C]; kugawa upya na adhabu [N] | Kwa sehemu |
| Mteja anaomba refund | Mgogoro → admin → wallet [T]; kwenye kadi/M-Pesa haipo [C] | Ndiyo (kwenye wallet) |
| Fundi hakufika | Escrow inashikiliwa; mgogoro wa kawaida [C] | Kwa mkono |
| Mgogoro wa mnunuzi na muuzaji | Escrow inazuiwa wakati mgogoro uko wazi; uamuzi wa admin wenye audit [T] | Ndiyo |
| Intaneti inakatika wakati wa checkout | Malipo ya wallet ni transaction moja na yanaweza kurudiwa salama [T]; oda isiyolipwa inabaki pending [C] | Ndiyo (wallet) / [B] (PesaPal) |
| Intaneti inakatika wakati wa usafiri | Tokens (PK/DL) zinaweza kuthibitishwa baadaye; Live inaonyesha "unganisha tena" [C] | Kwa sehemu [N] |

### E6. Ramani yangu huru
**A. Lazima kabla ya kuzindua**
| # | Nini | Kwa nini | Moduli | Ugumu | Inategemea |
|---|---|---|---|---|---|
| A1 | Staging + CI ya majaribio + deploy yenye idhini | Kuzuia deploy ya bahati mbaya; kujaribu PesaPal | Ops | Kati | Mradi wa Firebase (wewe) |
| A2 | PesaPal sandbox mwisho-hadi-mwisho + kazi ya upatanisho + dashibodi ya malipo yaliyokwama | Mteja kulipa bila oda (P1-01) | SokoPay | Kati | Funguo za sandbox |
| A3 | Sera + marekebisho ya nauli (P1-02) | Mapato ya wauzaji, uaminifu | Usafiri/Escrow | Kati | Uamuzi wako |
| A4 | App Check + rate limits kwenye callables za pesa/chat | Matumizi mabaya | Usalama | Chini–Kati | reCAPTCHA Enterprise |
| A5 | Payout: utaratibu wa maker-checker + rekodi ya kumbukumbu ya nje + jaribio | Pesa kutoka nje ya mfumo (P1-04) | SokoPay/Admin | Kati | Sera ya payout |
| A6 | Ufuatiliaji wa makosa + tahadhari + runbook ya matukio ya E5 | Kugundua tatizo kabla ya mteja | Ops | Chini–Kati | — |
| A7 | Maamuzi D1, D8, D10 na ada ya jukwaa | Tabia ya mfumo inategemea | Biashara | Chini | Wewe |

**B. Haraka baada ya kuzindua**
B1 Kikapu lock (D10) + idempotency ya kuunda oda · B2 SLA na kugawa upya kwa mawakala · B3 Foleni moja ya kazi za admin ·
B4 Bundle/lazy-load ya JS + kipimo cha 3G · B5 Ratiba ya huduma + sera ya no-show · B6 URL za kurasa kuu (refresh) ·
B7 Push (VAPID) + TURN kwa Live.

**C. Fursa za baadaye**
C1 Payout ya moja kwa moja (M-Pesa B2C) · C2 Alama ya uaminifu ya wauzaji/mawakala kutoka data ya oda · C3 Mikopo ya
stock kwa wauzaji kulingana na historia ya POS (kwa washirika) · C4 Kuunganisha tabaka za frontend (79/81/61/63…) kuwa
moduli moja kwa kila eneo — hatua kwa hatua, chini ya majaribio · C5 WhatsApp kama chaneli ya arifa/oda.

### E7. Maoni yangu ya mwisho ya kitaalamu
- **Ningezindua leo?** Siyo kwa umma. **Ningezindua pilot** (wauzaji 10–30, wanunuzi mia chache, mji mmoja, kikomo cha
  kiasi kwa muamala) baada ya A1–A7, nikiwa na mtu wa uendeshaji anayeangalia dashibodi kila siku.
- **Mambo matano ya kwanza:** (1) staging + CI; (2) PesaPal sandbox + upatanisho; (3) sera ya nauli; (4) App Check +
  ufuatiliaji wa makosa; (5) payout yenye maker-checker.
- **Hatari kubwa ya kiarkitekti:** frontend ya tabaka zinazofunika kazi zilezile (`window.*` iliyoandikwa upya mara
  nyingi). Kila badiliko lina hatari ya kuvunja sehemu isiyohusika. Majaribio ya E2E ndiyo yanayokulinda leo — yaendeshwe
  kwenye CI kwa kila badiliko.
- **Fursa kubwa ya kibiashara:** *Maoni:* POS/Business OS + escrow kwa wauzaji wa kawaida wa Tanzania (maduka ya mtaa
  yanayouza offline na online). Hapo SokoHai ina kitu ambacho marketplaces nyingi hazina: mauzo ya dukani + mtandaoni +
  malipo salama kwenye mfumo mmoja. Ningeiweka hiyo mbele kuliko Live/Group Buy kwenye uzinduzi.
- **Ningefanya tofauti tangu mwanzo:** (1) moduli moja inayomiliki kila kazi ya UI (si `window.*` za kuandikwa upya),
  router/state moja tangu siku ya kwanza; (2) staging na CI kabla ya kipengele cha kwanza; (3) vipengele vichache
  vilivyokamilika kwa kina (bidhaa + POS + escrow + usafiri) kabla ya Live/mnada/Group Soko; (4) sera za fedha (nani
  analipa nini) kuandikwa kwanza, kisha code.
- **Ninachokipinga kwa heshima:** kuongeza vipengele zaidi kabla ya A1–A7. Upana tayari ni mkubwa kuliko uwezo wa
  uendeshaji wa timu ndogo; thamani sasa iko kwenye kina na uaminifu, si idadi.

---

## F. Ramani ya utekelezaji (Roadmap)

| Awamu | Pendekezo | Kipaumbele | Ugumu | Inategemea | Faida | Hatari ya utekelezaji |
|---|---|---|---|---|---|---|
| 1. Kabla ya kuzindua | A1 Staging + CI | P1 | Kati | Mradi wa Firebase | Deploy salama | Usanidi wa mazingira mawili |
| | A2 PesaPal sandbox + upatanisho | P1 | Kati | Funguo | Hakuna malipo yaliyopotea | Tabia ya IPN ya sandbox |
| | A3 Sera + marekebisho ya nauli | P1 | Kati | Uamuzi | Mapato sahihi | Kugusa escrow — majaribio ya pesa lazima |
| | A4 App Check | P1 | Chini–Kati | reCAPTCHA | Kuzuia skripti | Kuzuia watumiaji halali kama imesanidiwa vibaya |
| | A5 Payout maker-checker | P1 | Kati | Sera | Pesa salama | Kuchelewesha malipo |
| | A6 Ufuatiliaji + runbook | P1 | Chini–Kati | — | Kugundua mapema | — |
| | A7 Maamuzi D1/D8/D10/ada | P1 | Chini | Wewe | Uwazi | — |
| 2. Mara baada | B1–B7 | P2 | Chini–Kati | Awamu 1 | Uaminifu, kasi, ops | Kugusa checkout/nav — E2E lazima |
| 3. Kati | C2, C4 (hatua kwa hatua), C5 | P2–P3 | Kati–Juu | CI | Kupunguza hatari ya mabadiliko | Kurudi nyuma (regressions) |
| 4. Muda mrefu | C1, C3 | P3 | Juu | Washirika/leseni | Ukuaji | Sheria za fedha |

---

## G. Uamuzi wa mwisho wa kuzindua

**TAYARI KWA MASHARTI — kwa pilot inayoangaliwa tu. SIYO tayari kwa uzinduzi wa umma.**

**Kwa nini:** njia zote za ndani za fedha zimejaribiwa na ni imara; safari kuu zinafanya kazi kwenye browser halisi.
Lakini njia za fedha za NJE (kulipa kwa PesaPal, kutoa pesa) hazijawahi kuendeshwa, hakuna staging, na mgawanyo wa nauli
unahitaji sera. Hizi ni hatari za pesa za watu halisi, si za muonekano.

**Masharti yanayobaki:**
1. `WEKA-KWENYE-MAIN.bat` (GitHub main) na Netlify kurudi (billing).
2. Mradi wa staging + deploy ya rules/functions huko + majaribio ya mkono (`docs/SOKOHAI-ACCEPTANCE-TEST-PLAN.md`).
3. PesaPal sandbox mwisho-hadi-mwisho + upatanisho (A2).
4. Uamuzi na marekebisho ya nauli (A3).
5. App Check + ufuatiliaji wa makosa (A4, A6).
6. Utaratibu wa payout (A5) na kikomo cha kiasi kwa pilot.
7. Maamuzi D1, D8, D10 na ada ya jukwaa (A7).
8. Cloudinary signed (utambulisho), VAPID (push), TURN (Live mitandao tofauti) — kwa vipengele hivyo kuwashwa.

---

## H. Matokeo ya majaribio ya mzunguko huu na yasiyothibitishwa

| Seti | Matokeo | Alama |
|---|---|---|
| `npm test` (amri 107) | 107/107 | [T] |
| Build `--minify --check` | PASS | [T] |
| Navigation `test_nav_system` (viewports 4) | 56/56 | [T] |
| Live + Chat-auth `test_nav_live_auth` (viewports 4) | 40/40 | [T] |
| Pointi 16 zilizolindwa (bila login) | Login juu peke yake kwa zote zinazolindwa; Live hub + bidhaa ni za umma | [T] probe |
| E2E kamili simu / desktop | 56/56 / 56/56 | [T] |
| Safari: oda, huduma, usafiri, Group Buy, kurejesha akaunti (× simu + desktop) | 7, 10, 7, 6, 9 — zote zinapita | [T] |
| Live kamera / Auction Live / Mnada admin / Group chat / Group business (× 2) | 6, 10, 3, 8, 13 — zote zinapita (kamera desktop: hitilafu moja ya muda chini ya mzigo, kisha 6/6 × 2) | [T] |
| Suites za server/rules (R16; server haijabadilika) | 31/32 (category filter 5/8 — D8) | [T] |
| `test_r13b_live_stories_groupsoko` | 12/17 × 2 — kushindwa 5 kulekule kwenye code ya zamani; selectors za muundo wa R13-B uliobadilishwa (jaribio limechakaa) | [T] |

**Hali ya Git:** marekebisho ya Live/Chat + ripoti hizi ziko kwenye commit tofauti (sehemu ya mwisho ya ripoti ya
marekebisho). Hakuna push, merge wala deploy.

**Hazijathibitishwa / zimezuiwa:** PesaPal (sandbox/live) [B]; payouts za nje na `withdrawalRequest/Resolve` [N];
push halisi [B]; Live kati ya mitandao [B]; uthibitisho wa utambulisho na Cloudinary halisi [B]; dashibodi ya wakala [N];
simu za sauti/video [N]; kasi kwenye 3G/kifaa halisi [N]; collections za umma kwa taarifa binafsi [N]; refresh/viungo
vya moja kwa moja zaidi ya `#/product/{id}` [C]; production yenyewe (hakuna ufikiaji, kwa makusudi).
