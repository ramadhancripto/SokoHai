# SOKOHAI — Ultimate Pro Edition (Escrow & Admin)

Muundo wa project baada ya refactor ya **Phase 1 + Phase 2**:
monolith ya awali (`sokohai-hai.html`, ~33,400 lines) sasa ni project halisi
yenye `css/`, `js/`, `js/app/` na `index.html` — **kila faili ina kazi yake.**

> ⚠️ **Hakuna kitu kilichobadilishwa kwenye utendaji (behaviour).**
> Code zote zimehamishwa kwa utaratibu (AST + scope analysis) — zimepangwa upya tu.
> Imehakikishwa kuwa: syntax yote inapita, marejeo yote yanasuluhika, na **mlolongo
> wa `window.*` assignments wa wakati wa load unalingana 100%** na build ya awali.

---

## 1. Muundo wa Project

```
sokohai/
├── index.html                    # HTML pekee (4,539 lines — ilikuwa 33,395)
├── README.md                     # Faili hili
├── sokohai-manifest.json         # PWA manifest (jina, theme, icons)
├── sokohai-sw.js                 # Service Worker (network-first)
├── icon-192.png / icon-512.png   # Icon za PWA (brand ya SOKOHAI)
├── _originals/                   # Nakala ya asili (kumbukumbu tu — haijapakiwa)
│   └── app.module.js             # (21,549 lines — kilichokuwa engine moja)
├── css/                          # Staili (10 faili)
│   ├── 00-tokens.css             #   Design tokens (rangi, nafasi, radius, motion)
│   ├── 01-core.css               #   CSS kuu ya mfumo mzima
│   ├── 02-menu.css / 02b-…       #   Staili za menu (sidebar)
│   └── 05…10-*-polish.css        #   Polishes za matangazo, auth, soko, POS, SokoPay, admin
└── js/
    ├── 00-pwa.js                 # Manifest + Service Worker (PWA)
    ├── 00-config.js              # MIPANGILIO YA MFUMO (ona §5 Usalama!)
    ├── 06…19-*.js                # Plugins huru (toasts, uploads, payments, wallet…)
    └── app/                      # ★ ENGINE YA APP (ilikuwa app.module.js moja)
        ├── 00-bootstrap.js       #   Firebase imports + config + auth/db + bridges + shared state `skh`
        ├── 01-market.js          #   Soko: kategoria, market modes, boost/kukuza bidhaa
        ├── 02-checkout.js        #   Checkout na malipo (AzamPay)
        ├── 03-dashboard.js       #   Dashboard renderer (moyo wa app)
        ├── 04-orders-escrow.js   #   Oda za mnunuzi, escrow, wallet, migogoro
        ├── 05-forms.js           #   Fomu za muuzaji + upload ya picha ya profile
        ├── 06-navigation.js      #   Sidebar, tabu, logout, zoom ya picha
        ├── 07-product.js         #   Bidhaa: maelezo, dau (bids), chat, kikapu
        ├── 08-app-state.js       #   Auth, submit bidhaa/huduma/usafirishaji, topbar
        ├── 09-feed-announcements.js # Matangazo, wanachama, wakala, usajili
        ├── 10-dashboard-tabs.js  #   Maudhui ya tabu za dashboard
        ├── 11-analytics.js       #   Product analytics + grafu
        ├── 12-sys-modes.js       #   Sys modes, notifications, main feed
        ├── 13-community.js       #   Community guard, ticker, agent dashboard
        ├── 14-map-onboarding.js  #   Ramani + onboarding ya duka
        ├── 15-pos-sales.js       #   POS: mauzo, stock, madeni, mishahara
        ├── 16-pos-admin-jobs.js  #   POS admin, kazi (jobs), admin dashboard
        ├── 17-hub.js             #   Hub ya huduma (service hub)
        ├── 18-cockpit.js         #   Cockpit charts + manunuzi (procurement)
        ├── 19-roles.js           #   Dashboards za roles (driver, provider…)
        ├── 20-logistics.js       #   Logistics & dispatch
        ├── 21-sokopay.js         #   SokoPay links, migogoro, deposits
        ├── 22-printing.js        #   Huduma za uchapishaji
        ├── 23-smart-cart.js      #   Smart Cart + logistics + final cart (canonical)
        └── 24-ui-final.js        #   UI polish, tokens, language center
```

---

## 2. Muundo wa Kiteknolojia (Phase 2)

`js/app/` inafanya kazi hivi:

- **`00-bootstrap.js`** ina imports za Firebase, `auth`/`db`, bridges za plugins,
  na **shared state yote** kwenye object moja `skh` (imetangazwa kama `const skh = {}`
  na **`export { skh }`**).
- **Imports za Firebase zinaakisiwa (mirrored)** kwenye `skh`:
  `skh.initializeApp = initializeApp; skh.collection = collection; …` —
  ndiyo maana faili za feature zinaweza kuita `skh.db`, `skh.collection(...)`,
  `skh.onAuthStateChanged(...)` n.k.
- Kila faili ya feature (`01…24`) ni ES module inayoanza na
  `import { skh } from './00-bootstrap.js';` — kisha ina **`window.X = …`** zake tu.
- State na helpers za pamoja zinatumika kama `skh.myCart`, `skh.db`, `skh.requireAuth()`…
- **Mpangilio wa kupakia NI MUHIMU** (unaonekana mwishoni mwa `index.html`):
  bootstrap kwanza, kisha `01…24` kwa mpangilio — ni mpangilio ule ule wa code ya awali,
  kwa hiyo "last definition wins" inabaki sahihi.

### Kwa nini `skh.*`?
Code ya awali ilikuwa module moja — state (`myCart`, `currentUser`…) na helpers
zilishirikishwa moja kwa moja. Baada ya kugawa katika modules tofauti, bindings za
`let` haziwezi kuagizwa (imports ni read-only). Hivyo state yote ikawekwa kwenye
object moja `skh` (mutable) — suluhisho lile lile wakubwa wa JavaScript hutumia.

### "Capture" consts (kwa nini zipo mahali pake)
Const kama `const _oldAddToCartSmart = window.addToCart;` zinahifadhi **thamani ya
wakati huo** kabla ya kufafanua upya. Zimebaki **mahali pake** (hazijasogezwa kwenye
bootstrap) ili capture iwe sahihi.

---

## 3. Jinsi ya Kuendesha (Run)

App inahitaji **mtandao** (Firebase CDN + Firestore, Leaflet, Chart.js).
Usifungue kwa `file://` moja kwa moja (service worker + modules hushindwa).
Tumia server ndogo:

```bash
cd sokohai
python3 -m http.server 8080
# kisha fungua: http://localhost:8080
```

Au deploy folda nzima kwenye hosting yoyote (Firebase Hosting, Netlify, Vercel…).

---

## 4. Jinsi ya Kurekebisha (Marekebisho kwa kina)

Sasa unaweza kufungua **faili MOJA yenye kazi MOJA** badala ya kusearch kwenye
21,000+ lines. Mfano:

- Tatizo la malipo? → `js/app/02-checkout.js`
- Tatizo la escrow/wallet? → `js/app/04-orders-escrow.js` + `js/app/21-sokopay.js`
- Tatizo la POS? → `js/app/15-pos-sales.js` + `js/app/16-pos-admin-jobs.js`
- Tatizo la kikapu (cart)? → `js/app/23-smart-cart.js` + `js/19-cart-checkout-canonical.js`
- Mpangilio wa mfumo (rangi, modes, usalama)? → `js/00-config.js` + `css/00-tokens.css`

**KUMBUKA:** baadhi ya kazi zinafafanuliwa mara kadhaa (`window.openCart`,
`window.confirmSmartCartOrder`, `window.addToCart`…). **Toleo la mwisho linashinda.**
Hilo ni muundo wa awali (patches) — `js/app/23-smart-cart.js` na
`js/19-cart-checkout-canonical.js` ndizo "canonical".

---

## 5. Usalama & Mambo ya Kufanyia Kazi (TODO)

1. **`AZAMPAY_CLIENT_ID` bado iko kwenye browser** (`js/00-config.js`).
   Client Secret imeondolewa tayari (server pekee), lakini Client ID bado inaonekana.
   Hatua sahihi: ihamishe kwenye backend (Cloud Function) — ona comments za code (Phase 5).

2. **`js/17-azampay-return.js`** inatumia `window.AZAMPAY_*` (fallback tu — inafanya kazi
   **tu** ikiwa `PAYMENTS_VIA_SERVER=false`, na sasa ni `true`, hivyo haina athari).
   Inafaa kurekebishwa kuwa `window.SOKOHAI_CONFIG`/server callable.

3. **Bridges za plugins:** bootstrap inaita `window.skhRegisterFirestore(...)` n.k. —
   plugins hizo (`js/13…17`) ni plain scripts zinazotekelezwa kabla ya modules,
   hivyo usajili unafanya kazi. Usibadilishe mpangilio huu.

4. **Kujaribu baada ya marekebisho:** baada ya kuhariri faili yoyote, onyesha kwenye
   browser console — makosa yoyote ya "Uncaught" yanaonyesha faili na mstari husika.

---

## 6. Historia (Changelog)

- **Phase 1:** monolith → `css/` + `js/` + `index.html` (style/script ziligawanywa).
- **Phase 2 (hii):** `js/app.module.js` (21,549 lines) → `js/app/` (bootstrap + 24 feature files),
  kwa kutumia AST + scope analysis (espree + eslint-scope). Behaviour haijaguswa:
  - 496 majina ya `window.*` yamehifadhiwa (counts sawa),
  - mlolongo wa load-time wa 473 top-level assignments unalingana 100%,
  - hakuna marejeo yaliyoachwa bila kusuluhika.
- **Phase 2.1 (bugfix):** imports za Firebase zinaakisiwa kwenye `skh` (la sivyo
  `skh.initializeApp`/`skh.collection` n.k. zilikuwa undefined) + faili za PWA
  (`sokohai-manifest.json`, `sokohai-sw.js`, icons) zimeongezwa.
- **Phase 2.3 (HaiPay MVP — mwanzo):**
  - **SokoPay → HaiPay** (jina la kuonekana). Code identifiers hazijaguswa.
  - **Payroll & Jobs module imeondolewa** kwenye HaiPay (sidebar tab + tab area + demo rows +
    chujio + option ya payroll).
  - **Design spec ya MVP** imeandikwa: `docs/HAIPAY-MVP-DESIGN.md` (architecture,
    state machine, Firestore data model, frontend structure, server functions,
    integration points, implementation order).
- **Phase 2.4 (HaiPay MVP — frontend kupunguzwa):**
  - **Sidebar imebadilishwa** kuwa sehemu za MVP: Home, Pay, Create Link, Track,
    Transactions, Help + (Trust & Security: Disputes, Settings, Direct Pay).
  - **Maeneo yaliyoondolewa** (dead tabs): Products, Services, Logistics, Companies,
    Governance, Events — HTML imepungua kutoka ~394K hadi ~298K chars.
  - **Home (spOverviewArea)** imefanywa upya kwa mobile-first: KPI 4 (Available,
    Escrow Locked, Pending, Completed) + vitendo 3 vya msingi (PAY, CREATE LINK, TRACK)
    + Active Escrow + Recent Activity + trust note.
  - **Create Link (spCreateArea)** imerahisishwa: maelezo + kiasi + maelezo ya ziada
    + simu/email ya mnunuzi (hiari) + picha (hiari). Sehemu za contract nyingi
    (product/service/job/logistics/passenger, split engine, image-proof lazima)
    zimeondolewa/kuwa hidden.
  - **`generateSokoPayCode`** imerekebishwa: partner/picha ni vya hiari, ujumbe
    unatumia "token (SP-XXXXXX)" badala ya "mkataba".
  - **Tab mpya: Transactions** (`spTransactionsArea` + `renderSokoPayTransactions`)
    na **Help** (`spHelpArea`) — zenye maelezo ya mtiririko PAY → SECURE → TRACK →
    CONFIRM → RELEASE/DISPUTE na token si pesa.
  - `toggleSokoPayTab` imerekebishwa kwa orodha ya maeneo ya MVP.
- **Phase 2.5 (HaiPay LIVE — Firebase backend):**
  - **Uchunguzi ulithibitisha**: project `sokonet-3b847` iko LIVE na ina data
    halisi (users, sokopay_links). Lakini **Firestore rules zilikuwa WAZI**
    (mtu yeyote anaweza kuandika/kufuta) na Cloud Functions hazijawahi kuwepo.
  - **Cloud Functions zimeundwa** (`functions/index.js`, region `europe-west1`):
    `walletAdjust` (atomic + idempotent + wallet_ledger), `escrowRelease`
    (smart-split server), `haipayReleaseLink` (HaiPay escrow), `azampayCheckout`,
    `azampayTransactionStatus`, `azampayWebhook`, `platformStatsRefresh`,
    `platformStatsHourly`.
  - **`firestore.rules`** zimeandikwa: login required kwa kuandika; `walletBalance`
    ni server-only (browser haiwezi kuandika salio); `wallet_ledger`/`platform_stats`
    ni server-only; products/services/announcements zinabaki public kusoma.
  - **`firestore.indexes.json`** (code+status, customerId+status, n.k.),
    **`firebase.json`**, **`.firebaserc`** zimeongezwa.
  - **`confirmSokoPayLinkDirect`** sasa inapita Cloud Function `haipayReleaseLink`
    (server-authoritative release ya HaiPay).
  - **Runbook**: `docs/HAIPAY-DEPLOY.md` — hatua za `firebase deploy` (rules →
    functions → hosting), AzamPay secret kwenye `functions/.env`, na Blaze plan.
- **Phase 2.6 (bugfix — HaiPay haikufunguka kwenye browser):**
  - **Sababu:** `skh.masterCommands` (registry ya functions 160+) hujengwa kwenye
    `00-bootstrap.js` (module ya kwanza), wakati `window.*` functions bado
    hazijafafanuliwa — hivyo values zote ni `undefined`. Kisha `17-hub.js`
    kilizire-register kwenye `window`, na **kufuta functions halisi** (mf.
    `updateApp`, `openSokoPay`) na `undefined`. Hili lilitokea tu baada ya
    kugawanya monolith (awali registry ilijengwa BAADA ya definitions).
  - **Rekebisho:** `17-hub.js` sasa hure-register tu functions zilizopo
    (`typeof cmd === 'function'`); bootloader inaitwa kwa ulinzi
    (`typeof updateApp === 'function'`); no-op `window.renderPosCart = renderPosCart`
    imefungwa kwa `typeof`.
  - Imethibitishwa: `node --check` zote OK, `verify_split` ALL CHECKS PASSED,
    hakuna top-level crash nyingine (scan ya modules zote 00–24).
- **Phase 2.7 (HTML body imegawanywa — njia ya build):**
  - `index.html` (298 KB, mistari 3566) imegawanywa kuwa **vipande 22 huru** kwenye
    `html/` — kila kimoja kina kazi yake (`14-haipay.html` = HaiPay modal nzima,
    `16-topnav.html`, `19-bottomnav.html`, `03-modals-core.html`, n.k.).
  - Zana: `tools/build_html.py` — `split` (gawanya), `build` (kusanya vipande →
    `index.html`), `check` (thibitisha mkutano ni byte-exact).
  - **Hakuna mabadiliko ya runtime** — mkutano umethibitishwa 100% sawa na
    faili ya asili (`cmp` → identical; tag balance 651/651, 168/168, 194/194).
  - Maelezo kamili ya kila kipande: `html/README.md`.
- **Phase 2.8 (bugfix — top nav ilikuwa 'inapotea'):**
  - **Sababu 1:** `applyModeUI()` inaficha top nav/bottom nav/environment (display:none)
    unapoingia Usimamizi/dashboard, lakini `updateApp()` (tabs za chini Home/Bidhaa/...) 
    haikuzirudisha → top nav ilibaki fiche milele baada ya kurudi sokoni.
  - **Sababu 2:** scroll-handler ilificha `.top-nav-row` (scroll-hidden) unaposcroll chini.
  - **Rekebisho:** (a) `updateApp()` sasa inarudisha `.sticky-top-section`,
    `.bottom-area-wrapper` na `#locationFilterBar`; (b) scroll-handler haifichi top nav
    tena — **announcement ndiyo pekee inayojificha** unaposcroll chini.
  - Uthibitisho: `node --check` zote OK, `verify_split` ALL CHECKS PASSED,
    HTML build byte-exact, duplicate IDs zimekaguliwa (pre-existing tu).
- **Phase 2.9 (HaiPay mobile-first + button polish):**
  - **Tatizo:** kwenye kioo wima (portrait), HaiPay ilikuwa inaonyesha sidebar tu;
    workspace ilionekana baada ya kusroll chini kabisa (layout haikuwa mobile-friendly).
  - **Rekebisho (`css/11-haipay-mobile.css`):** kwenye `≤1024px` HaiPay inakuwa
    **screen nzima** (`100dvh`); sidebar inakuwa **upau wa juu** (horizontal pills
    za Home/Pay/Create Link/Track/Transactions/Help/Disputes/Settings/Direct Pay);
    workspace inajaza kioo na **kuscroll peke yake**; paneli ya kulia (demo)
    inafichwa; header imefanywa compact (search/QR/fullscreen zimefichwa).
  - **Button mpya ya "Rudi Soko"** (`sp-back-btn`) imeongezwa kwenye brand row —
    inafanya kazi desktop na mobile; wallet chip (`spSidebarBalanceTop`) imeongezwa
    kwenye top bar ya mobile.
  - **Buttons zote za HaiPay** zimepigwa msasa: hover lift, active press, focus ring,
    pills za sidebar zenye gradient na shadow, transitions laini.
  - `updateSokoPayUIBalances` sasa inasasisha pia wallet chip ya mobile.
  - Uthibitisho: `node --check` OK, `verify_split` ALL CHECKS PASSED, HTML tag
    balance (651/651, 169/169, 196/196), CSS braces balanced.
- **Phase 2.10 (button ya "Rudi Soko" imeboreshwa):**
  - Button ya "Rudi Soko" imehamishwa kutoka brand row ya sidebar → **header ya
    workspace (kushoto)**, kama button nzuri ya kisasa (white card, icon ya mshale,
    border laini, hover lift + shadow).
  - Brand row sasa ni safi: logo + jina + wallet chip pekee.
  - Style mpya ya `.sp-back-btn` (light theme) kwenye `css/11-haipay-mobile.css`.
  - Uthibitisho: HTML tag balance 652/652, 169/169, 196/196; CSS braces 47/47.
- **Phase 2.11 (usafishaji wa CSS — makosa ya syntax VS Code):**
  - `css/01-core.css` ilikuwa na **mabaki 4 ya `@keyframes`** (mistari ya `50%/70%/100%`
    bila kifuniko cha `@keyframes`) — mabaki ya zamani kutoka monolith asili.
    Browser ilivivumilia kimya lakini VS Code ilionyesha makosa ya
    `at-rule or selector expected` / `{ expected`.
  - **Rekebisho:** mabaki 12 ya mistari yameondolewa kwa usahihi (bila kugusa
    keyframes 17 halali — dash, pulse, fadeIn, alert-flash, kutingishika, n.k.).
  - Uthibitisho: braces za CSS zote 646/646 (01-core) + faili zote 11 za CSS
    ziko safi (hakuna orphans), `verify_split` ALL CHECKS PASSED, HTML build
    byte-exact.
- Build ya awali imehifadhiwa kwenye `_originals/` na `uploads/`.
