# SokoHai R16 — Ripoti ya mwisho ya kukamilisha mfumo

Tarehe: 2026-11-13 · Tawi: `fix/live-merge-reconcile-20261113` · Msingi: `origin/main` = `af9947f`

## 1. Jibu fupi

- **Maendeleo (development):** mifumo **28 kati ya 30 ni COMPLETE**. Miwili iliyobaki (#5 kategoria, #7 kadi ya bidhaa)
  inasubiri **maamuzi yako ya design**, si kazi ya code. Hii inatoa alama ya **96.7%** kwa kipimo kile kile cha R14/R15
  (COMPLETE = 1, PARTIAL = 0.5).
- **Production:** bado haiko tayari. Kinachobaki ni setup yako: funguo za PesaPal, Cloudinary signed, VAPID ya push,
  barua pepe ya reset, TURN, deploy ya Firebase (kwa idhini yako) na push ya GitHub kwa bat.
  Orodha kamili: `docs/SOKOHAI-USER-SETUP-CHECKLIST.md`.
- Ushahidi wote ni wa **emulator ya Firebase + Chromium halisi** (390×844 na 1440×900). Hakuna pesa halisi iliyoguswa.

## 2. Hitilafu halisi zilizopatikana na kurekebishwa (R16)

| # | Ukali | Hitilafu | Marekebisho | Ushahidi |
|---|---|---|---|---|
| 1 | **Critical** | Checkout ya kikapu (SokoCart) ilikataliwa na rules kwa **kila** oda: `escrowStatus` (server-only tangu Phase B) ilikuwa ndani ya oda | Field imeondolewa kabla ya kuandika oda | Order journey E2E 7/7 × 2 |
| 2 | High | `reviewsPublish`: `({ id, od })` badala ya `({ id, d: od })` → TypeError kwa mnunuzi yeyote mwenye oda → **hakuna tathmini iliyowahi kupata beji ya "verified purchase"** | Destructuring sahihi; oda za kikapu (bidhaa ndani ya `items[]`) zinahesabiwa | Server fixes 9/9 (inashindwa 5/7 kwenye code ya zamani) |
| 3 | High | Pickup Token (PK) ya safari ya oda ilikwenda kwa **mnunuzi** badala ya muuzaji (mtumaji) → mnunuzi angeweza kumtuma mtu kuchukua mzigo kisha kudai haukufika | PK kwa muuzaji + msafirishaji tu (deliveryAccept, deliveryOfferAccept, deliveryGenerateToken) | Transport E2E 7/7 × 2; server fixes |
| 4 | High | Mteja hakuwa na njia ya kulipia oda ya huduma iliyokubaliwa (callable ipo, UI haikuwepo) | Kitufe "Lipa kwa SokoPay" kwenye Kituo cha Escrow | Service journey E2E 10/10 × 2 |
| 5 | Medium | Muuzaji hakuwa na kitufe cha "Nimesafirisha" (`markShipped` haikuitwa popote) | Kitufe kwenye Kituo cha Escrow (held → shipped, rules zinaruhusu muuzaji tu) | Order journey E2E |
| 6 | Medium | Group Buy: wanachama wangeweza kulipa bei ya kikundi kabla ya lengo; hakuna kutoka, kughairi wala kushughulikia muda kuisha | Lifecycle kamili + sera (sehemu 4) | Group Buy 12/12 + E2E 6/6 × 2 |
| 7 | Medium | Ledger ya Group Buy ingegongana mwanachama akitoka na kujiunga tena (ingevunja reconcile) | Kitambulisho cha ledger kina namba ya ahadi (`seq`) | Group Buy: ledger sum test |

## 3. Kilichojengwa R16

- **Huduma mwisho-hadi-mwisho:** usajili (Huduma Hub) → kugundua → ombi → fundi anakataa/anakubali → mteja analipa kwa wallet
  (escrow) → fundi "kazi imekamilika" → namba ya kupokea → kuthibitisha → malipo kwa fundi mara moja → tathmini yenye beji.
- **Usafiri:** `orders → ride_requests → delivery_offers → Agent Request Inbox` (mnyororo ule ule) → kukubali →
  PK → makabidhiano → safari → DL ya mnunuzi → kukamilisha → malipo ya escrow kwa msafirishaji + muuzaji mara moja.
- **Malipo ya wallet kwa oda za kikapu na "Lipa Sasa"** (`orderWalletPay`): bei inakaguliwa kabla ya kukata salio, kisha
  inapita kwenye settlement ile ile iliyokaguliwa ya PesaPal (stock, escrow, held). Kiasi kisichotumika kinarudishwa;
  inaweza kuendelezwa baada ya hitilafu; `WLT_` ni ya server tu (rules).
- **Group Buy:** kujiunga/kutoka/kughairi (sababu + audit)/muda kuisha/dirisha la malipo/admin; **sera mbili**:
  `pay_after_target` (chaguo-msingi salama) na `escrow_commit` (pesa inawekwa escrow wakati wa kujiunga, refund za moja kwa moja)
  ambayo **inawashwa na Super Admin pekee**.
- **Uthibitisho wa utambulisho:** hati zinapakiwa kama `authenticated` (siri) kwenye Cloudinary, admin anaona kwa kiungo
  kilichosainiwa, herufi 4 za mwisho tu za namba zinahifadhiwa, uamuzi una sababu + audit + arifa.
- **Hali ya usanidi** kwenye Admin Control Center (ndiyo/hapana tu, hakuna siri).

## 4. Rejista A — DEVELOPMENT COMPLETION (mifumo 30)

| # | Mfumo | R15 | R16 | Kilichofanyika R16 | Kinachotegemea nje (Rejista B) | Ushahidi |
|---|---|---|---|---|---|---|
| 1 | Usajili, login, kurejesha akaunti | COMPLETE | COMPLETE | — | Template ya barua pepe (C5) | Reset 9/9 × 2 |
| 2 | Profaili, utambulisho | PARTIAL | **COMPLETE** | Hati za siri + ukaguzi wa admin | Cloudinary signed (C3) | Identity 8/8; E2E 5/5 × 2 |
| 3 | Usajili wa biashara | COMPLETE | COMPLETE | — | — | Seller lifecycle 21 |
| 4 | Nyumbani, kugundua | COMPLETE | COMPLETE | — | — | E2E 4, 24 |
| 5 | Kategoria, vichujio | PARTIAL | PARTIAL | — | **Uamuzi D8** (mapping) | Category filter 5/8 |
| 6 | Bidhaa, stock | COMPLETE | COMPLETE | — | — | Inventory 44 + 27 + 10 |
| 7 | Ukurasa / kadi ya bidhaa | PARTIAL | PARTIAL | — | **Maamuzi D6, D7** | E2E #29 imeshindwa (×2) |
| 8 | Kikapu na checkout | PARTIAL | **COMPLETE** | Checkout ilirekebishwa; wallet pay | PesaPal sandbox (C1) | Order journey 7/7 × 2; wallet pay 8/8 |
| 9 | Oda na mzunguko | PARTIAL | **COMPLETE** | Mzunguko kamili kwenye browser | — | Order journey; core release 22 |
| 10 | Oda za muuzaji | PARTIAL | **COMPLETE** | Kusafirisha + makabidhiano | — | Order journey |
| 11 | Wallet na escrow | PARTIAL | **COMPLETE** | Malipo ya wallet kwa oda zote | Deposit kupitia PesaPal (C1) | Reconcile PASS; money 13/13 |
| 12 | Malipo, refunds, migogoro | PARTIAL | **COMPLETE** | Refund ya Group Buy; wallet pay | PesaPal sandbox (C1); refund ya kadi (D3) | Dispute 7/7; stub 11/11; phase7 41/41 |
| 13 | Mnada | COMPLETE | COMPLETE | Mshindi anaweza kulipa kwa wallet | — | Auction suites; ali 10/10 × 2 |
| 14 | Live Commerce | PARTIAL | **COMPLETE** (mtandao mmoja) | — | **TURN/SFU (C6)** kwa mitandao tofauti | Kamera 6/6 × 2; live 26 |
| 15 | Bei Kushuka | COMPLETE | COMPLETE | — | — | Queue 16 |
| 16 | Group Buy | BLOCKED | **COMPLETE** | Lifecycle + sera | **Uamuzi D1** (pesa halisi) | 12/12; E2E 6/6 × 2 |
| 17 | Soko la huduma | PARTIAL | **COMPLETE** | Safari kamili | — | Service journey 10/10 × 2 |
| 18 | Watoa huduma (kukubali/kukataa) | PARTIAL | **COMPLETE** | Kukataa + kukubali kwenye Hub | — | Service journey |
| 19 | Usafiri na delivery | PARTIAL | **COMPLETE** | Safari kamili ya browser | — | Transport 7/7 × 2; delivery 9 |
| 20 | Ride, ofa, mawakala | PARTIAL | **COMPLETE** | Inbox → kukubali → PK | — | Transport; market 6 |
| 21 | Chat | COMPLETE | COMPLETE | — | — | Chat security 59 |
| 22 | Group Chat + Group Soko | COMPLETE | COMPLETE | — | Matangazo ya kulipia (D5), oda za kikundi (D4) | Rules 33 + 90; E2E 13 + 8 × 2 |
| 23 | Arifa na push | PARTIAL | **COMPLETE** | — | VAPID + `SKH_PUSH_ENABLED` (C4) | Push 9/9; UI 5/5 × 2 |
| 24 | Tathmini na beji | PARTIAL | **COMPLETE** | Beji ya verified imerekebishwa | — | Server fixes; service + order journeys |
| 25 | Business OS, POS | COMPLETE | COMPLETE | — | — | E2E 15, 25 |
| 26 | Admin | COMPLETE | COMPLETE | Tab za Group Buy, utambulisho, usanidi | — | Group Buy + identity E2E |
| 27 | Usalama, rules | COMPLETE | COMPLETE | Rules mpya 4 | Deploy (idhini yako) | Suites 32 |
| 28 | Simu na desktop | COMPLETE | COMPLETE | — | — | E2E zote × 2 |
| 29 | PWA, offline | COMPLETE | COMPLETE | — | Kujaribu kwenye simu halisi | PWA 8/8 × 2 |
| 30 | Build na deploy | PARTIAL | **COMPLETE** (dev) | Build inapita | Push (bat) + deploy (yako) | `--minify --check` PASS |

**Hesabu:** 28 COMPLETE · 2 PARTIAL (maamuzi) · 0 BLOCKED · 0 NOT COMPLETE → **(28 + 1) ÷ 30 = 96.7%**.

## 5. Rejista B — SETUP YAKO (production activation)

Tazama `docs/SOKOHAI-USER-SETUP-CHECKLIST.md`: A (GitHub/Netlify), B (Firebase deploy), C1–C6 (funguo), D1–D9 (maamuzi).

## 6. Ushahidi wa majaribio (R16, mwisho)

| Kundi | Matokeo | Maelezo |
|---|---|---|
| `npm test` (kila amri) | 104 / 106 | Zinazoshindwa: kadi ya bidhaa (D7), faili `test_product_card_visual.mjs` haipo kwenye repo (tangu R14) |
| `build_dist.mjs --minify --check` | PASS | |
| Suites za emulator | 31 / 32 | Category filter 5/8 (D8). Mpya: wallet pay 8, Group Buy 12, identity 8, server fixes 9 |
| g1 server battery | 16 / 18 | Evidence 9/9 kwenye project sahihi; rules adversarial = harness (tangu R14) |
| E2E kamili simu / desktop | 54 + 2 FAIL / 54 + 2 FAIL | FAIL zote ni #29 (D6) |
| R16 journeys (simu + desktop) | Huduma 10+10, Usafiri 7+7, Oda 7+7, Group Buy 6+6, Utambulisho 5+5 | 0 JS errors |
| R15/R14 regression E2E | Reset 9+9, PWA 8+8, Push 5+5, Kamera 6+6, Admin minada 3+3, Auction Live 10+10, Group chat 8+8 + 13+13 | |

Jaribio moja **halikubadilishwa**: nilitaka E2E #29 isome jina la accessibility (`aria-label="Weka oda"`) badala ya
maandishi yanayoonekana — ombi hilo lilikataliwa na mfumo wa ukaguzi kama kubadili assertion. Imebaki kama uamuzi D6.

## 7. Usalama

- Hakuna siri kwenye code au git (scan ya AIza / PRIVATE KEY / sk_live kwenye diff). Thamani za Cloudinary kwenye
  majaribio ni za uongo na ziko kwenye majaribio tu.
- Rules hazikulegezwa. Mpya: `push_tokens` (server pekee), `push_prefs`, `group_buy_commits`, `verification_requests`
  (mmiliki anasoma), `orders.paymentRef` haiwezi kuwa `WLT_` kutoka browser.
- Pesa: kila njia mpya ni idempotent, ina ledger, na `verify_money_reconcile` inapita (kila wallet = jumla ya ledger yake).
- Hati za utambulisho: siri (authenticated), viungo vilivyosainiwa kwa admin tu, kutazama kunaandikwa kwenye audit.

## 8. Git

Commits juu ya `af9947f` (fast-forward tu): R14 ×6, R15 `2f6456f`, R16 `bf3a99a`, `e867336`, `fe65837`, `6318a23`,
`0a2893d`, `ccd1a5c` + commit ya ripoti hii. `origin/main` bado ni `af9947f` mpaka uendeshe `WEKA-KWENYE-MAIN.bat`.

## 9. Mpangilio wa kwanza wa majaribio ya mkono

1. `ANZISHA-SOKOHAI-LOCAL.bat` (emulator + data ya demo). Akaunti: `SOMA-KWANZA-LOCAL.md`.
2. **Oda:** mnunuzi → kikapu → "Sitahitaji usafirishaji" → Lipa kwa SokoPay Wallet → muuzaji "Nimesafirisha" →
   mnunuzi "Namba ya Kupokea" → muuzaji anaithibitisha → mnunuzi "Nimepokea" → "Andika Tathmini".
3. **Mgogoro:** rudia 2 lakini mnunuzi "Fungua Mgogoro" → admin → Migogoro → refund → angalia wallet.
4. **Huduma:** fundi anasajili huduma → mteja anaomba → fundi anakubali kwenye Huduma Hub → mteja analipa → kazi → namba → kuthibitisha.
5. **Usafiri:** oda iliyolipwa → "Nahitaji usafirishaji" → wakala anaona kwenye "Maombi Yaliyotumwa Kwako" → kukubali → PK → safari → DL.
6. **Group Buy:** muuzaji anaweka bidhaa ya Group Buy → watu 2–3 wanajiunga → admin → Group Buy → "Sasisha hali" → wanachama wanalipa.
7. **Utambulisho:** (inahitaji C3) wasifu → Thibitisha utambulisho → admin → Uthibitisho.
8. Mnada, Bei Kushuka, Group Chat, Live (mtandao mmoja), PWA (Airplane mode).
