# SOKOHAI - Ultimate Pro Edition (Escrow & Admin)

Mfumo mzima wa **SOKOHAI** (`sokohaicom.netlify.app`) uliopakuliwa kikamilifu bila kukosa faili hata moja wala mstari wowote wa msimbo (code).

---

## 📁 Muundo wa Faili za Mfumo (Project Structure)

Jumla ya faili: **151+ files**

### 1. Ukurasa Mkuu (Core HTML)
- `index.html` - Ukurasa kamili wa mfumo (341 KB), unaojumuisha muundo wote wa DOM, templates, modals, navigation, na bootstrapping.

### 2. Mtindo na Muonekano (CSS - `css/`, jumla ya faili 30)
- `css/00-tokens.css` - Design tokens, rangi, vipimo na vigezo vya CSS.
- `css/01-core.css` - Mpangilio mkuu wa mfumo (Core layout & animations).
- `css/02-menu.css` - Mtindo wa menyu na drop-downs.
- `css/02b-menu-extra.css` - Marekebisho ya ziada ya menyu.
- `css/05-announcement.css` - Tangazo la juu (Marquee & announcement banner).
- `css/06-auth-polish.css` - Muonekano wa dirisha la Kuingia / Kujisajili (Auth polish).
- `css/07-market-polish.css` - Soko la bidhaa na gridi ya bidhaa.
- `css/08-dashboard-pos-polish.css` - Dashibodi ya mfanyabiashara na mashine ya POS.
- `css/09-sokopay-polish.css` - Muonekano wa pochi ya SokoPay.
- `css/10-admin-dash-polish.css` - Dashibodi ya msimamizi mkuu (Admin dashboard).
- `css/11-haipay-mobile.css` - Muonekano wa simu kwa malipo ya HaiPay.
- `css/12-mobile-responsive.css` - Usanidi wa simu za mkononi (Mobile responsiveness).
- `css/13-ui-polish.css` - Maboresho ya viwango vya interface (UI polish).
- `css/14-chat-admin-polish.css` - Dirisha la gumzo na dhibiti za admin.
- `css/15-chat-comments.css` - Maoni na ujumbe wa bidhaa.
- `css/16-commerce-card.css` - Kadi za biashara (Bidhaa, huduma, usafiri).
- `css/17-negotiation-form.css` - Fomu ya kufanya mapatano ya bei (Negotiation).
- `css/18-product-showcase.css` - Muonekano wa undani wa bidhaa (Product showcase).
- `css/19-token-box.css` - Sanduku la msimbo wa uthibitisho (Token box ya makabidhiano).
- `css/20-request-inbox.css` - Kikasha cha maombi ya wateja (Request inbox).
- `css/21-discovery-maoni.css` - Sehemu ya kugundua na maoni (Discovery & feedback).
- `css/22-delivery-choice.css` - Dirisha la uchaguzi wa usafirishaji (Delivery modal).
- `css/23-logistics-market.css` - Soko la usafirishaji kwa madereva na watoa huduma.
- `css/24-chat-ui-v2.css` - Toleo jipya la gumzo la kisasa (Chat UI v2).
- `css/25-typography.css` - Mipangilio ya fonti na maandishi (Typography).
- `css/26-design-system.css` - Mfumo thabiti wa usanifu wa kielektroniki (Design system).
- `css/27-visual-audit-fixes.css` - Marekebisho ya visual audit na touch targets.
- `css/28-my-profile.css` - Ukurasa wa wasifu binafsi (Profile, DP & Cover).
- `css/29-nav-dict.css` - Menyu ya juu + kamusi ya picha (Visual Dictionary).
- `css/30-discover-engine.css` - Injini ya uvumbuzi (Discover feed & cards).

### 3. Mantiki ya Mfumo (JavaScript - `js/` & `js/app/`, jumla ya faili 101)
#### Faili za Msingi (`js/`):
- `js/00-config.js` - Mipangilio ya mfumo (Demo mode, Escrow, PesaPal, Firebase Cloud Functions).
- `js/00-pwa.js` - Usajili wa Progressive Web App na Service Worker.
- `js/01-lib-loader.js` - Kipakiaji cha maktaba za Leaflet na Chart.js kwa uvivu (Lazy-loader).
- `js/05-dialogs.js` - Madirisha ya uthibitisho na ujumbe (Modals & dialogs).
- `js/06-announcement.js` - Marquee na matangazo yanayotembea.
- `js/07-toasts.js` - Toasts za taarifa za haraka (Success/error toasts).
- `js/08-auth-polish.js` - Utatuzi na uthibitishaji wa akaunti.
- `js/09-states.js` - Usimamizi wa hali za mfumo.
- `js/10-pwa-install.js` - Kitufe cha kusakinisha PWA kwenye simu/kivinjari.
- `js/11-uploads.js` - Upakiaji wa picha kupitia Cloudinary.
- `js/12-payments.js` - Mantiki ya kuchakata malipo.
- `js/13-listeners.js` - Event listeners za mfumo mzima.
- `js/14-sync.js` - Usawazishaji wa data nje ya mtandao na mtandaoni.
- `js/15-sp-live.js` - Salio la moja kwa moja la SokoPay (Live wallet polling).
- `js/16-wallet.js` - Vitendo vya pochi (Deposit, withdraw, transfer).
- `js/17-pesapal-return.js` - Mapokezi na uthibitishaji wa matokeo ya PesaPal.
- `js/18-icons.js` - Maktaba ya ikoni zote za SVG (SVG Icon library).
- `js/19-cart-checkout-canonical.js` - Usimamizi mkuu wa kikapu na malipo.
- `js/20-search-chat.js` - Utafutaji wa gumzo na mawasiliano.
- `js/21-home-filters.js` - Vichujio vya bidhaa kwenye ukurasa mkuu.
- `js/22-humanize.js` - Ugeuzaji wa tarehe na nambari kuwa lugha nyepesi.
- `js/23-smart-search.js` - Injini ya utafutaji werevu wa bidhaa na huduma.

#### Moduli Kuu za Programu (`js/app/`):
- `js/app/00-bootstrap.js` - Uunganishaji wa Firebase SDK (Auth, Firestore, Functions, Cloud Storage) na uanzishaji.
- `js/app/01-market.js` - Usimamizi wa soko, kuorodhesha bidhaa na kategoria.
- `js/app/02-checkout.js` - Njia ya ukamilishaji wa oda.
- `js/app/03-dashboard.js` - Dashibodi kuu ya mtumiaji.
- `js/app/04-orders-escrow.js` - Usimamizi wa oda na fedha zilizoshikiliwa (Escrow protection).
- `js/app/05-forms.js` - Udhibiti wa fomu zote za mfumo.
- `js/app/06-navigation.js` - Njia za kufungua kurasa na vichupo (Tab switching).
- `js/app/07-product.js` - Kuongeza, kuhariri na kuonyesha bidhaa.
- `js/app/08-app-state.js` - Hali ya jumla ya programu na utunzaji wa mtumiaji wa sasa.
- `js/app/09-feed-announcements.js` - Milisho ya habari na matangazo.
- `js/app/10-dashboard-tabs.js` - Vichupo vya dashibodi ya biashara.
- `js/app/11-analytics.js` - Takwimu za mauzo, chati na ripoti.
- `js/app/12-sys-modes.js` - Njia za mfumo (Demo vs Real, Sandbox).
- `js/app/13-community.js` - Jumuia ya watumiaji na machapisho.
- `js/app/14-map-onboarding.js` - Ramani ya maeneo, usajili na GPS geocoding.
- `js/app/15-pos-sales.js` - Mashine ya mauzo ya duka (Point of Sale).
- `js/app/16-pos-admin-jobs.js` - Usimamizi wa stoo, matawi na mhamisho wa hisa (Stock transfers).
- `js/app/17-hub.js` - Kituo cha shughuli zote za biashara.
- `js/app/18-cockpit.js` - Cockpit ya dereva na msafirishaji.
- `js/app/19-roles.js` - Majukumu ya watumiaji (Mnunuzi, Muuzaji, Dereva, Wakala, Admin).
- `js/app/20-logistics.js` - Mfumo kamili wa usafirishaji na ufuatiliaji wa mzigo.
- `js/app/21-sokopay.js` - Mfumo mkuu wa kifedha wa SokoPay Wallet.
- `js/app/22-printing.js` - Uchapishaji wa risiti za POS na ankara (Receipt printing).
- `js/app/23-smart-cart.js` - Kikapu werevu chenye mahesabu ya usafiri na punguzo.
- `js/app/24-ui-final.js` - Marekebisho ya mwisho ya kiolesura.
- `js/app/25-tracking-hub.js` - Kituo cha kufuatilia mwenendo wa oda.
- `js/app/26-image-zoom.js` - Ukuzaji wa picha za bidhaa (Image gallery lightbox).
- `js/app/27-route-dispatch.js` - Upangaji wa njia za wasafirishaji.
- `js/app/28-buyer-engagement.js` - Mwingiliano wa wanunuzi na wauzaji.
- `js/app/29-seller-store.js` - Duka la mtandaoni la muuzaji binafsi.
- `js/app/30-seller-products.js` - Usimamizi wa bidhaa za muuzaji.
- `js/app/31-agent-assist.js` - Mfumo wa mawakala kusaidia wateja.
- `js/app/32-i18n.js` - Lugha za mfumo (Kiswahili & Kiingereza).
- `js/app/33-custody.js` - Usimamizi wa ulinzi wa bidhaa na makabidhiano.
- `js/app/34-chat-core.js` - Injini kuu ya gumzo la papo hapo (Real-time chat).
- `js/app/35-comments.js` - Mfumo wa maoni na mrejesho wa bidhaa.
- `js/app/36-seller-chat-comments.js` - Mazungumzo ya moja kwa moja baina ya muuzaji na mteja.
- `js/app/37-negotiation.js` - Injini ya mapatano ya bei (Bargaining engine).
- `js/app/38-negotiation-form.js` & `38-nego-form-logic.js` - Fomu na mantiki ya mapatano.
- `js/app/39-product-showcase.js` & `39-showcase-logic.js` - Onyesho la bidhaa.
- `js/app/40-token-box.js` - Uzalishaji na uhakiki wa tokeni za OTP za makabidhiano.
- `js/app/41-request-inbox.js` - Kikasha cha maombi ya huduma na bidhaa.
- `js/app/42-discovery-feed.js` - Mlisho wa ugunduzi wa bidhaa mpya.
- `js/app/43-delivery-choice.js` - Uchaguzi wa aina ya usafirishaji (Pikipiki, gari, n.k.).
- `js/app/50-lifecycle-core.js` - Mzunguko wa uhai wa oda (Pending -> Paid -> Dispatched -> Completed).
- `js/app/51-lifecycle-ui.js` - Muonekano wa hatua za oda.
- `js/app/52-transport-inbox.js` - Kikasha cha maombi ya usafiri kwa madereva.
- `js/app/53-test-sandbox.js` - Hali ya majaribio (Testing sandbox).
- `js/app/54-error-core.js` - Udhibiti na ufuatiliaji wa makosa (Error handling).
- `js/app/55-escrow-guard.js` - Mlinzi wa fedha za Escrow.
- `js/app/56-nav-back.js` - Udhibiti wa kitufe cha kurudi nyuma kwenye simu/browser.
- `js/app/57-checkout-bridge.js` - Daraja la kuunganisha kikapu na malipo.
- `js/app/58-request-visibility.js` - Udhibiti wa kuonekana kwa maombi.
- `js/app/59-agent-monitor.js` - Dashibodi ya ufuatiliaji wa mawakala.
- `js/app/60-identity-layer.js` - Utambulisho wa mtumiaji na sifa zake.
- `js/app/61-full-system-repair.js` - Marekebisho ya utangamano wa mifumo.
- `js/app/62-missing-features.js` - Utatuzi wa vipengele vya ziada.
- `js/app/63-audit-fixes.js` - Marekebisho ya usalama na viwango vya mfumo.
- `js/app/64-i18n-core.js` - Injini ya tafsiri ya haraka.
- `js/app/64-my-profile.js` - Wasifu wa mtumiaji, picha ya jalada na DP.
- `js/app/65-content-l10n.js` - Ujanibishaji wa maudhui ya kienyeji.
- `js/app/66-wordmark.js` - Uundaji wa nembo ya SokoHai SVG.
- `js/app/67-payment-accounts.js` - Akaunti za malipo (M-Pesa, Tigo, Airtel, Benki).
- `js/app/68-chat-discover.js` - Uvumbuzi wa gumzo na biashara mpya.
- `js/app/69-chat-groups.js` - Vikundi vya mazungumzo (Community & buyer groups).
- `js/app/70-role-identity.js` - Beji na viwango vya mtumiaji.
- `js/app/71-visual-dictionary.js` - Kamusi ya picha ya vitu na huduma.
- `js/app/73-group-soga.js` - Gumzo la kijamii la vikundi (Soga).
- `js/app/74-group-order-system.js` - Mfumo wa oda za pamoja kwa punguzo (Group orders).
- `js/app/75-discover-engine.js` - Injini kuu ya uvumbuzi wa bidhaa na wauzaji.
- `js/app/76-group-order-production-enhancement.js` - Maboresho ya mfumo wa oda za pamoja.
- `js/app/78-chat-fix-blink.js` - Utatuzi wa flicker kwenye ujumbe wa gumzo.
- `js/app/79-one-ui-at-a-time.js` - Udhibiti wa dirisha moja pekee kuwa wazi kwa wakati mmoja.
- `js/app/81-absolute-one-ui-live.js` - Utekelezaji thabiti wa One-UI.
- `js/app/88-discover-complete.js` - Moduli kamilifu ya Discover.
- `js/app/90-chat-fixes.js` - Marekebisho ya historia na spidi ya gumzo.
- `js/app/91-discover-fixes.js` - Marekebisho ya Discover kwenye vifaa vya simu.
- `js/app/92-chat-auth-fix.js` - Utatuzi wa mbio za uthibitisho wa akaunti (Auth race condition).
- `js/app/93-chat-inbox-repair.js` - Marekebisho ya kikasha cha ujumbe.

### 4. Fonti (Typography - `fonts/`)
- `fonts/inter.css` - Mipangilio ya fonti ya kisasa ya 'Inter'.
- 6 faili kamili za TTF (Uzito 400, 500, 600, 700, 800, 900) zilizopakuliwa ndani ya mfumo (Hakuna utegemezi wa Google Fonts kutoka nje).

### 5. Picha na Nembo (`img/` na `assets/`)
- `assets/sokohai-s-mark.png` - Nembo rasmi ya SokoHai (High-res mark).
- `img/avatar-sokohai.png` - Picha ya wasifu ya roboti/mfumo wa SokoHai.
- `img/avatar-user.png` - Picha chaguomsingi ya mtumiaji.
- `img/avatar-gray.png` - Picha chaguomsingi ya kivuli.
- `img/hero-product.jpg` - Picha ya mfano ya bidhaa.

### 6. Maktaba za Nje Zilizopakuliwa Ndani (`vendor/`)
- `vendor/leaflet/leaflet.js` - Maktaba ya ramani ya Leaflet (v1.9.4).
- `vendor/leaflet/leaflet.css` - Mtindo wa ramani ya Leaflet.
- `vendor/leaflet/images/` - Picha za ramani (alama na vivuli vya pini za ramani).
- `vendor/chart.umd.min.js` - Maktaba ya grafu na chati za takwimu (Chart.js).

### 7. PWA & Offline Support
- `sokohai-manifest.json` - Web App Manifest ya usakinishaji kwenye simu.
- `sokohai-sw.js` - Service Worker ya kuwezesha tovuti kufanya kazi nje ya mtandao.

---

## 🚀 Jinsi ya Kuendesha Mfumo (How to Run)

Unaweza kuendesha mfumo huu mara moja kwa kutumia seva yoyote ya mitaa (local HTTP server):

### Kwa Python:
```bash
python3 -m http.server 8080
```
Kisha fungua kivinjari chako kwenye: `http://localhost:8080`

### Kwa Node.js (npx serve):
```bash
npx serve -l 8080 .
```

---

## 🔒 Usalama na Backend (Firebase & PesaPal)
- **Firebase Project ID**: `sokonet-3b847`
- Mfumo huu unatumia Firebase Firestore na Authentication kuunganisha data moja kwa moja.
- Siri zote za malipo (PesaPal Consumer Secret) ziko salama ndani ya Firebase Cloud Functions (`functions/.env`) kulingana na usanifu wa Phase 2.

---

## 🛠️ Marekebisho ya Masuala Yaliyotatuliwa (Critical Fixes & Optimization)

1. **Kufungua Vikundi Mara Moja (Group Soga Immediate Fast Opening):**
   - **Chanzo:** Hitilafu ya `ReferenceError: snap is not defined` iliyotokea ndani ya `skhOpenGroupSoga` (`js/app/73-group-soga.js:472-487`) pamoja na vizuizi vya `canOpen` na `atomicShowGroupModal` vilivyokuwa vikifunika dirisha kwa skeleton spinner "Inafungua..." na kusababisha `skhChatOpenGroupRow` na `skhOpenGroupSoga` kukwama bila kikomo. Pia `mergePairConversations` ilikuwa ikiharibu vitambulisho vya vikundi kwa kuweka `mergedInto`.
   - **Suluhisho:**
     - Tumeondoa kizuizi cha skeleton ya kusubiri; sasa dirisha la kikundi (`#skhGroupSogaModal`) linafunguka mara moja synchronously kwa mwonekano kamili (`display: flex`).
     - Kusoma meseji na subscriptions za moja kwa moja (`onSnapshot`) zinaanza papo hapo; taarifa za uanachama na metadata zinapakiwa background bila kuzuia interface ya mtumiaji.
     - Vitambulisho vyote vya vikundi vimesanifiwa kuondoa kiambishi `conv_group_`.
     - Data za mazungumzo ya kikundi zilizokuwa na `mergedInto` batili kwenye Firestore zimerekebishwa.

2. **Menyu ya Nukta Tatu kwenye Gumzo (Chat 3-Dots Menu & Actions):**
   - **Chanzo:** Kitufe `#chatMenuBtn` kilikosa handler ya kuaminika ya kufungua/kufunga `#chatHeadMenu` na kilikosa kitendo cha "Tazama Wasifu / Duka" cha moja kwa moja.
   - **Suluhisho:** Tumeongeza kazi thabiti ya `window.skhChatToggleHeadMenu(event)` iliyofungwa kwenye kitufe, tukarekebisha click-outside listener, na tukaongeza machaguo yote yakiwemo kutazama duka/wasifu, kunyamazisha, kuhifadhi, kufuta na kuzuia.

3. **Mfumo wa Mapatano ya Bei (Negotiation / Offer System):**
   - **Chanzo:** Wakati Firebase Cloud Functions zikirejesha 404/NOT_FOUND, regex `/not-found/i` ilishindwa kugundua `code: "NOT_FOUND"`, na hivyo kuzuia mfumo kugeukia Firestore fallback. Pia msikilizaji wa ofa alikosa kuunganisha data pale ambapo `conversationId` haikulingana au index ilikosekana.
   - **Suluhisho:**
     - Regex ya `isFunctionsDown` imeboreshwa ili kutambua `NOT_FOUND`, `UNAVAILABLE`, `DEADLINE_EXCEEDED`, n.k.
     - Fallback queries za `negotiations` sasa zinasikiliza moja kwa moja `buyerId == me && sellerId == partner` bila kuhitaji composite index, na ofa mpya huingia papo hapo pande zote mbili.

4. **Mpangilio wa Maandishi Mlalo kwenye Simu (Horizontal Text on Mobile Portrait):**
   - **Chanzo:** Kwenye `css/12-mobile-responsive.css` kulikuwa na sheria ya `@media (max-width: 480px)` iliyoweka `overflow-wrap: anywhere;` kwa vitufe (`button, a`). Katika CSS, `overflow-wrap: anywhere` inaruhusu upana wa min-content kuwa wa herufi moja tu, hivyo vitufe ndani ya vyombo vya flex vilikandamizwa na kusababisha maneno kusimama wima herufi moja baada ya nyingine.
   - **Suluhisho:**
     - Tumeondoa `overflow-wrap: anywhere` na kuweka `overflow-wrap: break-word` na `word-break: normal`.
     - Tumeongeza sheria madhubuti ya `writing-mode: horizontal-tb !important; text-orientation: mixed !important;` kwenye vipengele vyote.
     - Vitufe, lebo, vichwa vya habari na tabs za kategoria, discover na menyu zimewekwa `white-space: nowrap !important;` na `flex-shrink: 0;` ili maandishi yasivunjike wala kusimama wima.

