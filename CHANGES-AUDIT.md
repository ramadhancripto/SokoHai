# SokoHai — Ripoti ya Ukaguzi na Marekebisho (toleo la 2 — 2026-09-21)

Ukaguzi ulikuwa wa **kusoma msimbo (static)**: syntax ya faili zote, ESLint (`no-undef`, `no-dupe-keys`, n.k.),
na usomaji wa mkono wa sehemu za malipo, escrow na uthibitisho.
**Haujaendeshwa kwenye browser.** Jaribu kwenye staging kabla ya production.
Zip haikuwa na `functions/` (Cloud Functions) wala Firestore rules, kwa hiyo usalama wa server haujakaguliwa.

Toleo la 2 = marekebisho ya toleo la 1 (sehemu A) + marekebisho ya kadi/vitufe (sehemu A2) + mabadiliko matatu yaliyofafanuliwa kwenye sehemu A3.
Faili zilizobadilishwa: **15**, mpya: **2** (`js/94-modal-stack.js`, `css/31-product-actions.css`). Tazama `sokohai-fixes-v2.patch` (dhidi ya zip uliyopakia) kwa mabadiliko kamili mstari kwa mstari.

---

## A. Bugs zilizorekebishwa

| # | Faili | Tatizo | Athari | Marekebisho |
|---|-------|--------|--------|-------------|
| 1 | `js/app/73-group-soga.js` | SyntaxError (mistari 4 ya nakala nje ya block, ~mstari 521–524) | Module nzima (Group Soga, KB 187) haikupakiwa kabisa | Mistari iliyozidi imeondolewa |
| 2 | `js/17-pesapal-return.js` | `getOrderTrackingId()` na `getMerchantReference()` zilitumika lakini hazikufafanuliwa; `try/finally` bila `catch` | Mtu akilipa PesaPal na kurudi: malipo hayakuthibitishwa, oda haikuundwa, hakuna ujumbe wowote | Vitendaji vimefafanuliwa; `catch` imeongezwa inayoonyesha "Jaribu Tena" |
| 3 | `js/app/17-hub.js` (`executeSokoPayWalletPayment`) | `btnProceedPaySp` (jina lisilo sahihi) baada ya wallet kukatwa | Mtumiaji anaona "Imeshindwa kukamilisha malipo" wakati pesa tayari zimekatwa na escrow imefunguliwa (hatari ya kulipa mara mbili) | `btnProceed` |
| 4 | `js/17-pesapal-return.js` (`skhCreateOfflineMember`) | Nywila = `'sokohai'` + tarakimu 6 zile zile zilizo kwenye email ya akaunti | Mtu yeyote angeweza kuingia kwenye akaunti ya mwanachama wa offline | Nywila nasibu ya `crypto.getRandomValues` (hakuna kinachoitegemea) |
| 5 | `js/app/23-smart-cart.js` | `lgxEscape` haikufafanuliwa (inatumika mara 7+) | Orodha ya kampuni za logistics inashindwa kuchorwa | Imefafanuliwa (inatumia `skh.skhEscape`) |
| 6 | `js/app/04-orders-escrow.js` | `loadBuyerOrders()` haipo | Baada ya kufungua dispute, ReferenceError na skrini haisasishwi | `loadBuyerOrdersWithTracking()` (kwa ulinzi wa `typeof`) |
| 7 | `js/app/15-pos-sales.js` | `renderRecentProducts()` / `renderStaffList()` hazipo popote | Kubadili tab ya POS `pos`/`staff` kunatoa ReferenceError | Zimelindwa kwa `typeof`. **Tab hizo zitabaki tupu hadi vitendaji vitengenezwe** |
| 8 | `js/app/34-chat-core.js` | `hIc` badala ya `hIco` | Ikoni ya archive haibadiliki (kosa linamezwa na `.catch`) | `hIco` |
| 9 | `js/app/41-request-inbox.js` | Retry inaita `listen()` (haipo) | Kitufe cha "Jaribu tena" hakifanyi kitu | `load()` |
| 10 | `js/app/62-missing-features.js` | Ilitumia `skhGetEffectiveUid` / `currentUser` zisizopo | `createdBy`, `by`, `agentId` ni `null` kila mara | Inatumia `skh.currentUser.uid` |
| 11 | `js/app/17-hub.js` + `index.html` (Wallet Summary) | Salio 0 lilionyesha kwa makusudi TZS 4,090,000 / 2,450,000 / 1,320,000 / 320,000; legend ilikuwa namba za kudumu | Watumiaji waliona pesa ambazo hawana | Namba halisi; chati ya kijivu kama hakuna data; legend ina ids `spLegendAvailable/Escrow/Pending` |
| 12 | `index.html` | Data bandia isiyosasishwa na JS: takwimu za disputes (12,340 / 3,120 / 890,120 / 45,210), "15 Today", "TZS 1,850,000", miamala 3 na "Live Tracking Feed" 5 za kubuni, KPI (2,450,000 / 18 / 7 / 8,760,000 / +12.5%), jina "John"; title ya kiufundi; `og:url`/`og:image` tupu | Watumiaji halisi waliona takwimu za uongo | Zimeondolewa / kubadilishwa kuwa "—", "0" au ujumbe wa "hakuna bado"; title na og tags zimewekwa |

Uthibitisho baada ya marekebisho: faili zote 103 za JS + 5 script za ndani ya `index.html` zinapita `node --check`
(modules kama ESM); ESLint haionyeshi tatizo jipya; usawa wa tags za HTML haujabadilika.

---

## A2. Kadi: vitufe havionekani na kadi hazifunguki (toleo la 2)

**Vitufe vya kadi** (Chat, Pendekeza Bei, Weka Kikapuni, Lipa Sasa, Nunua kwa Jumla, Weka Dau, Agiza Huduma, Omba Usafiri, Jadili Nauli) **vipo na vinachorwa kwa usahihi** kwa kila aina
(imethibitishwa kwa kuendesha `39-product-showcase.js` halisi kwenye jsdom). Tatizo lilikuwa mahali vilipo na hali ya kupakia:

| # | Faili | Tatizo | Marekebisho |
|---|-------|--------|-------------|
| 13 | `css/31-product-actions.css` (mpya) + `index.html` | Kifimbo cha vitufe kilikuwa "in-flow" MWISHONI mwa `.pm-scroll` — baada ya maelezo, usambazaji na tathmini zote. Kwenye kadi ndefu mtumiaji hafiki kukiona | Sasa `position: sticky; bottom: 0` — kinaonekana muda wote, na kinatulia mahali pake (juu ya recommendations) ukifika chini. Mpangilio DETAILS → ACTION → RECOMMENDED haujabadilika |
| 14 | `js/app/07-product.js` | Data ikichelewa, eneo la vitufe lilibaki tupu; Firestore ikikataa (rules/mtandao) hakukuwa na ujumbe wowote (`onSnapshot` bila error callback) — kadi ilibaki "Bidhaa / TSh 0" | Hali ya "Inapakia…" mara moja; ujumbe "Imeshindikana kupakia kadi hii" + kitufe cha "Jaribu tena" |
| 15 | `js/app/07-product.js` | `openProduct('')` (mf. kipengee cha Saved kisicho na `productId`) kilitupa hitilafu isiyoonekana | Ujumbe wazi, hakuna hitilafu iliyofichwa |
| 16 | `js/app/07-product.js` (`skhResolveProductDeepLink`) | Timer ya 1400ms iliona URL `/p/{id}` iliyowekwa na kadi ambayo mtumiaji ALIKWISHA kuifungua na kuifungua TENA, ikirudisha kadi kwenye "Inapakia" | Haifungui tena kadi ile ile iliyo wazi |
| 17 | `js/94-modal-stack.js` (mpya) + `index.html` | **`window.skhBringToFront` HAIKUWAHI kufafanuliwa** (`openProduct` iliiita kwa `typeof`, hivyo "marekebisho" ya awali hayakufanya kitu). `productModal` ina z-index 7500, ndogo kuliko duka la muuzaji (7900), chat (7800), Saved (8763), Oda (8750), Discover (100001), Group Soga (100010), n.k. — kadi ilifunguka NYUMA na ilionekana kama "haifunguki" | Meneja wa tabaka (LIFO): modal inayofunguliwa mwisho inapandishwa juu ya zilizo wazi; `skhBringToFront(id)` sasa ipo. Dialogs/toasts (z-index 2147483000+) hubaki juu (meneja hapandishi zaidi ya 2,000,000,000). Modal zilizo ndani ya modal nyingine hazishughulikiwi |
| 18 | `js/app/56-nav-back.js` | Rundo la Back lilikataa kuhamisha modal iliyokuwa tayari kwenye rundo — kadi iliyofunguliwa tena juu ya duka ilibaki chini ya duka kwenye rundo, na X ilifunga DUKA badala ya kadi | `push()` inakubali `raise: true` (inayotumiwa na meneja wa tabaka pekee) kuhamisha kipengee juu ya rundo; tabia ya kawaida haijabadilika |

Hali nyingine zilizonufaika na #17: login (`authModal` 7000) sasa inaonekana juu ya kadi mgeni anapobonyeza "Lipa Sasa"; kadi zinazofunguliwa kutoka Saved/Oda/Kikapu/Notifications/chat.

## A3. Mabadiliko matatu ambayo chanzo chake sikiwezi kukieleza kikamilifu

`js/app/21-sokopay.js`, `js/app/39-product-showcase.js` na `js/app/39-showcase-logic.js` ni tofauti na zip uliyopakia. Kwenye nakala yangu ya kazi yalibadilishwa
kwa mkupuo mmoja (saa 21:07:12, 2026-09-20); **sikuweza kuyarudisha nyuma hadi hatua maalum ninayoweza kuithibitisha kutoka kwenye kazi niliyoonyeshwa kwenye mazungumzo haya.**
Nimeyapitia mstari kwa mstari, ni madogo na ya ulinzi (yenye alama `[AUDIT-FIX]`), na nimeyaacha ndani ya zip. Kama hutaki, ondoa hunks za faili hizi tatu kwenye `.patch`:

- `21-sokopay.js`: `.find` kwenye `sokopayActiveContractsCache` inalindwa dhidi ya cache isiyo array; `openProduct` sasa `return`s matokeo ya `originalOpenProduct` (awali `await openProduct()` ilimaliza kabla kadi haijafunguka kabisa). *Kumbuka: cache inaanzishwa kama `[]` kwenye asili, kwa hiyo hili si chanzo cha "kadi zote hazifunguki".*
- `39-product-showcase.js`: kila sehemu ya kadi (utambulisho, variants, maelezo, usambazaji, tathmini, muuzaji) ina `try/catch` yake ili hitilafu moja isizuie kifimbo; kuna `renderBarFallback` ya vitufe vya msingi. *Majaribio yangu ya data 12 zenye kasoro hayakuonyesha tofauti kati ya asili na hili (zote zilipata vitufe), kwa hiyo sidai hili lilikuwa chanzo cha vitufe kukosekana.*
- `39-showcase-logic.js`: bei kama `"120,000"` ilisomwa kama `NaN` → TSh 0; sasa koma/nafasi zinaondolewa.

---

## B. Ambayo HAYAJAREKEBISHWA (yanahitaji uamuzi, server, au majaribio)

### Usalama (kipaumbele cha juu)
1. **Akaunti za offline zilizoundwa TAYARI** bado zina nywila ya zamani inayokisiwa (`sokohai` + tarakimu 6).
   Ziwekwe upya kwa Admin SDK kwenye server: akaunti zenye email `offline_*@sokohai.internal`.
2. **PIN ya wanachama wa offline** (`js/app/31-agent-assist.js`, `skhAssistAuthenticateNative`) inakaguliwa kwenye browser:
   `pinHash`/`pinSalt` vinasomwa na kivinjari na kaunta ya majaribio inaandikwa na mteja. PIN ya tarakimu 4–6 inaweza kukisiwa nje ya mtandao.
   Deploy `memberAuthenticate` (msimbo unasema inarudisha 404), kisha zima fallback hii.
3. **Malipo ya wallet si atomic** (`executeSokoPayWalletPayment`): debit → update link → oda → notification zinafanyika hatua kwa hatua kwenye mteja.
   Hatua ikifeli katikati pesa zinabaki zimekatwa; wanunuzi wawili wanaweza kulipa link ile ile. Hamishia kwenye Cloud Function yenye transaction.
4. **Admin kwa email kwenye mteja**: `ADMIN_EMAIL_FALLBACK: true` na `skh.MY_ADMIN_EMAIL`. Ulinzi halisi lazima uwe Firestore rules / custom claims.
   Kumbuka: email ya admin kwenye msimbo ni `rshabansaid@gmail.com`.
5. **Cloudinary `Sokohai_preset` ni unsigned**: weka vikwazo (aina/ukubwa wa faili, folder) kwenye dashboard.
6. **Fomu za kadi (namba, expiry, CVV)**: `67-payment-accounts.js` inasema CVV haihifadhiwi, lakini njia za `00-bootstrap.js:~2397` na `21-sokopay.js:~404`
   hazikuthibitishwa kikamilifu. Tumia gateway yenye hosted fields (PCI-DSS).
7. **Firebase `apiKey`** kwenye `00-bootstrap.js` ni ya umma kwa muundo — hakikisha imewekewa vikwazo vya domain kwenye Google Cloud Console.
8. `js/app/07-product.js:~1455`: ujumbe wa sauti unabuni email ya mpokeaji kwa `chatPartner + "@gmail.com"`.

### Utendaji
9. **`js/app/91-discover-fixes.js` haifanyi kazi**: `boot()` haiitwi kamwe na `install` haijafafanuliwa, kwa hiyo `patchGlobalErrors`, `patchDiscoverHandlers`,
   `fixModalSizing`, `wireSellerNameClicks`, `patchPersonRenderer` hazitekelezwi. Sikuziwasha bila kuzijaribu kwenye browser.
10. `renderRecentProducts` / `renderStaffList` (POS) hazipo — tab zitakuwa tupu (ona #7 juu).
11. ~~`38-nego-form-logic.js` / `39-showcase-logic.js` hazipakiwi~~ — **nilikosea kwenye toleo la 1**: zote mbili zinapakiwa kupitia `import` (`38-negotiation-form.js:18`, `39-product-showcase.js:22`). Hakuna tatizo.
12. `js/app/34-chat-core.js:~2123`: `typeof unsubMsgs === 'function'` haitakuwa kweli kamwe (listeners hazifungwi).
13. `js/18-icons.js`: funguo zinazojirudia (`shield-check`, `arrow-left`, `arrow-right`).
14. `js/app/00-bootstrap.js` ~2438–2617: funguo 11 zinazojirudia (thamani ni zilezile `window.X` — hazina madhara, ni usafi tu).
15. Service worker (`sokohai-sw.js`) haihifadhi kitu (`CACHE_NAME` haitumiki) — hakuna kazi offline. `manifest` inatumia PNG moja kwa 192 na 512.
16. `#richDashboardContainer` ina mabaki ya data ya mfano (`Aug 30, 2024`, `LOG-78391`); yanabadilishwa na `loadAndRenderDashboard` wakati wa matumizi.
17. Ukurasa mmoja mkubwa (`index.html` KB 342 + JS ~MB 5): fikiria lazy-loading ya modules.
18. **Duka linapakia bidhaa tu** (`29-seller-store.js:58`, collection `products`): huduma na usafiri wa muuzaji huyo hazionekani kwenye duka lake. Ni pengo la kipengele, si kosa la kufunguka.
19. Kadi za duka na Discover zinapitisha `'products'` moja kwa moja (`29-seller-store.js`, `75-discover-engine.js`, `73-group-soga.js`, `14-map-onboarding.js`). Zinafanya kazi kwa sababu `openProduct` ina fallback ya makundi mengine; ikiwezekana pitisha collection halisi.
20. **Sticky bar na meneja wa tabaka havijaonekana kwenye browser halisi** (jsdom haina layout). Angalia kwa macho: urefu wa bar kwenye simu ndogo, na kwamba hakuna modal inayopanda juu ya nyingine isivyo sahihi.

---

## C. Vipimo nilivyoendesha (jsdom — si browser halisi)
- Syntax: faili 104 za JS (modules kama ESM) + script 5 za ndani ya `index.html` — hakuna kosa; hakuna faili inayokosekana kwenye `index.html`.
- ESLint (`no-undef`, `no-dupe-keys`, n.k.): hakuna tatizo jipya ukilinganisha na toleo la 1.
- Vitufe vya kadi kwa aina 9 (bidhaa, stock 0, jumla, mnada, huduma, usafiri…): vyote vinachorwa.
- Tabaka za modals (kwa `index.html` halisi + CSS zote 31 + `56-nav-back.js` halisi): 12/12 — duka→kadi, chat→kadi, Discover→kadi, Group Soga→kadi, login juu ya kadi, kadi iliyokuwa chini kupandishwa tena, X inafunga kadi kwanza.
- `openProduct` na Firestore ya bandia: 11/11 — id tupu, "Inapakia…", vitufe vya bidhaa, fallback ya huduma, permission-denied + "Jaribu tena", kadi juu ya chat.
- **Vipimo hivi vimeandikwa na mimi kuiga mazingira; havibadilishi majaribio kwenye simu halisi.**

## D. Mapendekezo ya kujaribu (staging)
- Malipo ya PesaPal: lipa → rudi → hakikisha modal ya "Inathibitisha…" inatokea na oda inaundwa.
- Malipo ya wallet kwa token ya SokoPay: hakikisha ujumbe wa mafanikio unaonekana na tab ya "track" inafunguka.
- Fungua dispute kutoka Oda Zangu: orodha inasasishwa.
- Checkout → chagua Usafiri wa Sokohai: orodha ya kampuni za logistics inachorwa.
- Group Soga: kikundi kinafunguka na "typing…" inafanya kazi.
- Akaunti mpya (salio 0): Wallet Summary inaonyesha TZS 0, si TZS 4,090,000.
- **Kadi:** fungua kadi kutoka (a) duka la muuzaji, (b) Discover, (c) chat, (d) Saved, (e) recommendations ndani ya kadi — kadi lazima ionekane juu; X irudi ulikotoka.
- **Vitufe:** fungua bidhaa yenye maelezo/tathmini nyingi — vitufe vionekane chini bila kusogeza; jaribu huduma na usafiri.
- **Mgeni (bila login):** bonyeza "Lipa Sasa" — login lionekane juu ya kadi.
- **Mtandao dhaifu:** kadi inapofunguka lazima uone "Inapakia…" kisha vitufe; zima mtandao ukaone "Jaribu tena".
