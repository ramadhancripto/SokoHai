# SOKOHAI — TAARIFA YA UHAMISHO (HANDOVER)

**Tarehe ya uhamisho:** 2026-09-13
**Chanzo:** https://sokohaiii.netlify.app/ (deploy ya production)
**Mahali sasa:** workspace hii (`real-sokohai/`)
**Sababu:** mfumo wa inbox kwenye page ya zamani ulikuwa unasumbua — kazi yote
inahamia hapa.

---

## 1. Kilichohamishwa (vipatikana) ✅

Mradi **kamili kwa upande wa code** umepatikana — jumla ya **mafaili 112, ~4.6 MB**:

| Sehemu | Mafaili | Hali |
|---|---|---|
| `index.html` + vipande `html/` (22) | 23 | ✅ Build imehakikishwa **byte-exact** |
| `css/` (16) | 16 | ✅ |
| `js/` (16 plugins) + `js/app/` (38 modules) | 54 | ✅ `node --check` zote zimepita |
| `functions/index.js` (backend kuu, mistari 2253) | 1 | ✅ Cloud Functions 34 |
| `functions/negotiation.js` (injinia ya majadiliano, mistari 1059) | 1 | ✅ |
| `functions/package.json` | 1 | ✅ |
| `firestore.rules` (mistari 524) + `firestore.indexes.json` | 2 | ✅ |
| `firebase.json`, `.firebaserc` (imeundwa upya kutoka project ID) | 2 | ✅ |
| PWA: `sokohai-manifest.json`, `sokohai-sw.js`, `icon-192/512.png` | 4 | ✅ |
| `_originals/app.module.js` (monolith ya asili, mistari 21,548) | 1 | ✅ Kumbukumbu |
| Docs: `README.md`, `html/README.md`, `docs/HAIPAY-DEPLOY.md`, `docs/HAIPAY-MVP-DESIGN.md`, `docs/SEO-PRODUCT-LINKS.md` | 5 | ✅ |
| `tools/build_html.py` (zana ya kujenga index.html) | 1 | ✅ |
| `robots.txt` | 1 | ✅ |

### Mafaili nyeti yaliyopatikana
- **Firebase project:** `sokonet-3b847` (region ya functions: `europe-west1`)
- Firebase web config (apiKey ya umma) imo `js/app/00-bootstrap.js` (~mstari 283) —
  hii si siri; siri za malipo zipo server pekee.

### Cloud Functions zilizopo (`functions/index.js`)
- **Fedha:** `walletAdjust`, `escrowRelease`, `haipayReleaseLink`
- **PesaPal:** `pesapalCheckout`, `pesapalTransactionStatus`, `pesapalIpn` (HTTP),
  `pesapalRegisterIpn`
- **Cron:** `platformStatsHourly` (kila saa), `sokopayAutoRelease` (kila dakika 5),
  `platformStatsRefresh`
- **Wanachama/wakala:** `memberRegister`, `memberAuthenticate`, `memberSetPin`,
  `assistedSessionValidate`, `assistedSessionEnd`, `agentMemberStatus`, `agentListMembers`
- **Usafirishaji (Chain of Custody):** `deliveryAccept`, `deliveryGenerateToken`,
  `deliveryConfirmCustody`, `deliveryRevokeTokens`, `deliveryStartTransit`,
  `deliveryPassengerBoard`, `deliveryComplete`, `deliveryDispute`, `deliveryTokenVerify`
- **Jamii:** `chatOfferAction`, `commentsPublish`, `commentsLike`, `reviewsPublish`,
  `commentsModerate`
- **SEO:** `sitemapXml` (HTTP)
- **Majadiliano:** `negotiationSendOffer`, `negotiationAction`,
  `negotiationOrderAction` (zinaagizwa kutoka `functions/negotiation.js`)

---

## 2. Havikuwepo kwenye deploy (vipungufu) ⚠️

Mafaili haya hayakupatikana kwenye Netlify (huenda hayajapakiwa au yalikuwa kwenye
page ya zamani tu):

1. **`functions/.env`** — siri za PesaPal (`PESAPAL_CONSUMER_KEY`,
   `PESAPAL_CONSUMER_SECRET`). HII NI SIRI — haiwezi kupakuliwa, inahitajika kuwekwa
   upya wewe mwenyewe (`firebase functions:secrets` au `.env`). Bila malipo yake
   PesaPal hayatafanya kazi; Firebase/Firestore zinaendelea.
2. **Nyaraka 4 za maendeleo** (rejelewa tu kwenye code):
   - `ROADMAP.md`
   - `README-DEPLOY.md`
   - `PHASE5_DEPLOY.md`
   - `tools/CLOUDINARY_CHECKLIST.md`
3. **`functions/node_modules/`** — haifai kuhamishwa; tengeneza upya kwa
   `cd functions && npm install` (firebase-admin ^12.1.0, firebase-functions ^5.0.1).
4. **`uploads/`** — picha zilizopakiwa na watumiaji (data, si code).
5. **Data ya Firestore** (users, products, orders, wallet...) ipo LIVE kwenye
   Firebase `sokonet-3b847` — haihamishwi na code; bado inafikiwa na app kama
   credentials/firebase zipo.

---

## 3. Jinsi ya kuendesha (development)

```bash
cd real-sokohai
python3 -m http.server 8080
# fungua http://localhost:8080  (USITUMIE file:// — modules + SW hazitafanya kazi)
```

App inahitaji intaneti (Firebase CDN, Firestore, Leaflet/OpenStreetMap, Chart.js).

### Kazi kwenye HTML (vipande)
- **Usihariri `index.html` moja kwa moja.** Hariri kipande cha `html/NN-*.html`,
  kisha:
  ```bash
  python3 tools/build_html.py build   # unganisha vipande -> index.html
  python3 tools/build_html.py check   # thibitisha byte-exact
  ```

### Deploy backend (kama mabadiliko yamefanyika)
```bash
cd functions && npm install && cd ..
# weka secrets za PesaPal kwanza (firebase functions:secrets:set)
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions
firebase deploy --only hosting
```

---

## 4. Mipangilio ya sasa (`js/00-config.js`)

- `DEMO_MODE: false` → **malipo halisi** (PesaPal kupitia server)
- `PAYMENTS_VIA_SERVER: true`, `WALLET_VIA_SERVER: true`, `CRON_VIA_SERVER: true`
- `STATS_VIA_DOC: false` → bado inasoma `adminRevenue` moja kwa moja (Phase 5.4
  haijawashwa — inahitaji `platformStatsHourly` iwepo; ipo kwenye index.js)
- Admin: custom claims + email fallback `rshabansaid@gmail.com`

---

## 5. Mwongozo wa haraka wa code (wapi pa kurekebisha nini)

| Tatizo/feature | Faili |
|---|---|
| Malipo / PesaPal | `js/12-payments.js`, `js/app/02-checkout.js`, `functions/index.js` |
| Escrow / wallet | `js/app/04-orders-escrow.js`, `js/app/21-sokopay.js`, `js/16-wallet.js` |
| POS (mauzo/stock) | `js/app/15-pos-sales.js`, `js/app/16-pos-admin-jobs.js`, `js/app/18-cockpit.js` |
| Kikapu/checkout | `js/app/23-smart-cart.js`, `js/19-cart-checkout-canonical.js` |
| Chat / maoni / negotiation | `js/app/34–37-*` |
| Usafirishaji/custody | `js/app/20-logistics.js`, `js/app/25-tracking-hub.js`, `js/app/27-route-dispatch.js`, `js/app/33-custody.js` |
| Muuzaji duka/bidhaa | `js/app/29-seller-store.js`, `js/app/30-seller-products.js` |
| Lugha (i18n) | `js/app/32-i18n.js` |
| Rangi/design tokens | `css/00-tokens.css` |
| Firestore permissions | `firestore.rules` |

> **Onyo kutoka README ya mradi:** baadhi ya `window.*` functions zinafafanuliwa
> mara kadhaa — toleo la mwisho ndilo linaloshinda (hasa `23-smart-cart.js` na
> `19-cart-checkout-canonical.js`).

---

## 6. Hatua inayofuata

Muulize mteja/aliyekuwa akifanya kazi nawe: ni kazi gani hasa ilikuwa ikiendelea
kabla ya inbox kuanza kusumbua? (kwa mfano: bug fulani, feature mpya, deploy,
PesaPal...) ili tuendelee pale mlipoishia.

---

## 7. MODULE 01 — Dynamic Negotiation Form (imekamilika 2026-09-13)

Fomu moja ya majadiliano inayojua muktadha (PRODUCT/SERVICE/TRANSPORT)
imeongezwa ndani ya Chat iliyopo (navigation/inbox/Home hazikuguswa).

**Mafaili mapya:**
- `js/app/38-nego-form-logic.js` — config ya fields kwa kila aina, validation,
  hesabu za jumla, modeli ya proposal (OFFER_SENT, v1), mistari ya summary
- `js/app/38-negotiation-form.js` — bottom-sheet ya mobile-first: kadi ya
  muktadha (picha/jina/muuzaji/bei ya sokoni), jumla la kiotomatiki
  (haliwezi kuandikwa), variant chips, tarehe/mahali/maelezo, summary hai,
  hali za loading/empty/error, ARIA/focus/Esc
- `css/17-negotiation-form.css` — mtindo kwa design tokens zilizopo
- `tools/test_nego_form.mjs` — majaribio 78 ya logic (`npm run test:nego`)

**Marekebisho:** `34-chat-core.js` (vitufe vitatu vya ofa sasa vinaelekeza
fomu moja; `skhChatSubmitNegotiationProposal` = njia moja ya kutuma kupitia
server `negotiationSendOffer` + Firestore fallback; fomu za zamani
zimeondolewa), `37-negotiation.js` (terms za kadi za ofa),
`functions/negotiation.js` (hifadhi ya variants/delivery/tarehe/uzito/notes
kwa nyongeza tu — bei ya sokoni haibadilishwi kamwe).

**Vipimo:** 78 logic tests + 56 jsdom DOM smoke tests zote zimepita;
`node --check` zote; `build_html.py check` byte-exact; assets zote 200.
Haiundi oda/malipo/usafirishaji — huandaa proposal tu (OFFER_SENT).
Module inayofuata: kadi ya Offer ndani ya Chat (accept/counter/reject flow).

## 8. MODULE 02 — Product Detail & Product Discovery UI (imekamilika 2026-09-13)

Modali ya bidhaa imepangwa upya ili **bidhaa iwe shujaa** (sio wasifu wa
muuzaji): hero media → utambulisho/bei/upatikanaji → variants → maelezo →
usambazaji → tathmini → maswali → muuzaji (fupi) → related rails → kifimbo
cha kununua cha chini. Mifumo yote ya nyuma (cart, chat, order, auction,
engagement, comments, seller store) imetumiwa tena — hakuna mfumo mpya.

**Mafaili mapya:**
- `js/app/39-showcase-logic.js` — mantiki tupu inayopimika: hali ya
  upatikanaji (zipo/chache/kwisha/mnada/dukani-pekee), mistari ya sifa
  (zilizopo tu — barcode/ndani hazionyeshwi), muhtasari wa tathmini
  (wastani/msambao/mpya zaidi), vikundi vya variants **kutoka data ya
  muuzaji** (`variants/sizes/colors/filters/sizePrices`; fallback ya
  kihafidhina ya saizi za Mavazi tu), na mgawanyo wa related kwenye reli
  nne (Zinazofanana / Zaidi za aina hii / Kutoka maduka mengine /
  Recommended) zenye dedupe, kutomrudisha muuzaji mmoja, alama za
  subcategory/tokeni/eneo/upatikanaji, na kofia ya idadi.
- `js/app/39-product-showcase.js` — UI mwembamba: hujenga sections zote za
  modal, icon actions (♡/🔖/💬/↗) juu ya picha, laki fupi ya muuzaji +
  Follow tofauti na Like, kifimbo cha chini chenye states halali
  (Cart/Nunua/Chat; Weka Dau kwa mnada; Agiza Huduma; Omba Usafiri;
  Zimeisha/Dukani pekee vilivyolemazwa), jukwaa la tathmini (reviews kutoka
  `comments` + kitufe cha kufungua `ratingModal` ambacho kilikuwa hakina
  opener), na overload ya `skh.loadRelatedProducts` (cache + hadi queries 3
  za Firestore, kofia 40, haijengwi upya kwenye snapshot rerun).
- `css/18-product-showcase.css` — bottom-sheet, hero, chips, variants,
  specs, reviews, seller laki, reli za kadi safi (picha/jina/bei/en tu),
  kifimbo cha sticky, ufikivu na tweaks za simu ndogo.
- `tools/test_showcase.mjs` — majaribio 34 ya logic (`npm run test:showcase`).

**Marekebisho:** `html/05-modals-market.html` (#productModal imeandaliwa upya;
cart/checkout modals hazikuguswa), `html/21-scripts.html` (kujumuisha
39/18), `js/app/07-product.js` (mchoro wa ndani wa modal (~mistari 100)
umebadilishwa na mwito mmoja `skhRenderShowcase`; hero sasa inatenga
video/picha; Chat inabeba variant context `skhActiveChatProductContext`),
`js/app/00-bootstrap.js` (`calculateDynamicPrice` sasa huandika unit halisi
badala ya "/ Pc" kila mara; `loadRelatedProducts` ya zamani imefunikwa na
ya 39), `18-cockpit.js` selectors za size/color zimefunikwa na zile za
data-driven (hakuna tena +2,000 ya kubahatisha ya XXL). Mdudu wa zamani
uliofutwa: `skhInitEngagementIcons()` ulikuwa hauitwi popote (icons za
♡/🔖 zilikuwa tupu) — sasa huitwa na renderer.

**Mipaka iliyohifadhiwa:** bei/stock/order/payment/delivery/negotiation
hazimilikiwi na UI; variants hubadilisha bei ya kuonyesha tu kupitia
`tempVariantPrice` (cart nazo husoma `selectedVariants`); reviews hubaki
`products.comments` kupitia server `reviewsPublish`; maswali ya umma
yanaendelea kwenye collection `comments` (35-comments.js).

**Vipimo:** 34 showcase logic + 58 jsdom showcase DOM + 78 nego logic +
56 nego DOM; `node --check` zote; build byte-exact; assets 200.
