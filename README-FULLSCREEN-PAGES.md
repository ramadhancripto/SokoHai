# SokoHai — Kurasa Zote Zinachukua Skrini Yote · 2026-11-02

Ombi: **"kila page au ukurasa unaojitegemea unatakiwa uchukue screen yote na
sio kuchukua part … pages inacover UI yake yote, sio kubakisha part ambazo
hazina thamani."**

Ukaguzi ulifanyika **ukurasa kwa ukurasa**, ukianzia **Chat**, kisha Bidhaa,
duka la muuzaji, MySokoHai, oda, kikapu, maombi, njia, mizigo, safari, tokeni,
procurement, repair, miradi, uchapishaji, scrap yard, stock, daftari, setup,
aina ya muuzaji, admin, advertiser, malipo, SokoPay — **kurasa 33**.

> Mabadiliko ni **CSS pekee**: `css/46-fullscreen-pages.css` + mstari mmoja wa
> `<link>` kwenye `index.html`. Hakuna JS, data, wala backend iliyoguzwa.

---

## Kabla → Baada (vipimo halisi, desktop 1280×900)

| Ukurasa | Kabla | Baada |
|---|---|---|
| **Chat — inbox** | 480 × 484 (dirisha dogo katikati, skrini nyingine tupu) | **1280 × 900** |
| **Chat — mazungumzo** | 980 × 828 | **1280 × 900** |
| **Bidhaa** | 1248 × 868 (16px ya pembeni) | **1280 × 900** |
| **MySokoHai** | 1180 × 900 | **1280 × 900** (tabs zote zinaonekana) |
| Taarifa / Oda / Kikapu / Vitu vilivyohifadhiwa | 420–480 px upana, ≤828 urefu | **1280 × 900** |
| Maombi / Njia / Tokeni / Token Center | 980 × 828 | **1280 × 900** |
| Setup biashara / Aina ya muuzaji / Admin / Malipo | 420–480 × ≤765 | **1280 × 900** |

Kila ukurasa sasa: `pembe = 0px`, `kivuli = none`, hakuna nafasi ya nyuma
(backdrop) inayoonekana — **hakuna "part" isiyo na thamani**.

## Kanuni zilizowekwa

1. **Ukurasa = skrini yote.** Kila shell inachukua `100dvh` × `100vw`, pembe 0,
   kivuli hakuna, `padding` ya dirisha = 0.
2. **Hakuna `scroll` ndani ya `scroll`** kwa kurasa zenye kichwa + tabs +
   orodha: kichwa na tabs zinakaa (`flex: 0 0 auto`), maudhui yanajaa na
   kusogeza (`flex: 1 1 auto; min-height: 0; overflow-y: auto`).
3. **Safu ya maudhui inayosomeka.** Skrini kubwa haimaanishi mistari mirefu:
   – chat inbox: safu 900px katikati (vichwa, chips na orodha zote pamoja)
   – chat mazungumzo: bubble safu 780px
   – kurasa za fomu/orodha: safu 780px katikati
   – maombi / njia / tokeni: 960px · MySokoHai: 1180px · kikapu: 1200px
4. **Dialog ndogo hazibadiliki** — kwa makusudi ni chaguo/uthibitisho la
   haraka, sio ukurasa: `#categoryModal`, `#modeMenuModal`, `#plusMenu`,
   `#sidebarMenuModal`, `#authModal`, `#welcomeModal`, `#mapModal`,
   `#checkoutModal`, `#boostModal`, `#subModal`, `#ratingModal`,
   `#actionRequestModal`, `#deliveryChoiceModal`, `#chatForwardModal`,
   `#chatAttachProductModal`, `#chatAttachOrderModal`,
   `#advertiserBillingSoonModal`, `#companyAdsSoonModal`.
5. **`html body #id`** kwa specificity: JS huingiza `<style>` baada ya CSS hizi
   (`23-smart-cart.js` ina `max-height: calc(100vh - 24px) !important`), hivyo
   selector yenye nguvu inahitajika ili ukurasa usibaki na "kadi" ndogo.

## Marekebisho ya ndani kwa kila ukurasa

- **Chat inbox**: vichwa + search + chips + orodha vyote kwenye safu moja ya
  900px; chips 10 zinaonekana zote kwenye 1280; orodha inasogeza yenyewe.
- **Chat mazungumzo**: `#chatBody` na `#chatMainSurface` sasa
  `flex: 1 1 auto; min-height: 0` — composer inabaki chini, ujumbe unajaa
  urefu wote (zamani ilikuwa inabaki nusu tupu).
- **Bidhaa**: safu mbili (picha 46% | maelezo 54%) zinajaza skrini; picha
  inajaza safu yake (`object-fit: cover`) na mandhari ni nyepesi (hakuna shimo
  jeusi).
- **MySokoHai**: kichwa + tabs + maudhui; tabs zote zinaonekana (teleza kwa
  ukingo unaofifia), maudhui yanajaa.
- **Kikapu (SokoCart)**: shell inajaza skrini; safu mbili (bidhaa | muhtasari)
  zinabaki kwenye 1200px katikati; simu = safu moja.
- **Kurasa za fomu/orodha**: kichwa cha ukurasa kinakaa juu (`sticky`),
  maudhui kwenye safu ya 780px; kitufe cha mwisho (mf. FUNGA) ni kipimo cha
  kitufe (≤320px), sio ukuta wa upana wote.

---

## Faili

| Faili | Kazi |
|---|---|
| `css/46-fullscreen-pages.css` | **MPYA** — sheria za kurasa zote (sehemu 1–6) |
| `index.html` | mstari mmoja: `<link rel="stylesheet" href="css/46-fullscreen-pages.css">` |
| `tools/test_fullscreen_pages.mjs` | mtihani mpya — **399/399** (33 kurasa × 1280/1024/390) |
| `tools/_shot_pages.mjs`, `_shot_pages_real.mjs`, `_shot_pages2/3/4.mjs`, `_shot_mysokohai.mjs` | probes za kupiga picha kurasa halisi |

## Uthibitisho
- `tools/test_fullscreen_pages.mjs` — **399/399 passed**: kila ukurasa
  `overlay = skrini yote`, `sheet = skrini yote`, pembe 0, hakuna mlipuko wa
  upana — kwenye 1280×900, 1024×800 na 390×844.
- `tools/test_chat_compact.mjs` — **37/37** (imesasishwa: inbox sasa ni ukurasa
  kamili; safu ya maudhui ≤960px; chips zote zinaonekana au zinapita kwa
  kuteleza).
- `tools/test_post_cards.mjs` **60/60** · `bottom_nav_verify` **12/12** ·
  `test_ad_card_styling` **14/14**.
- Picha za UI halisi: `audit-shots/page-chat-inbox-{desktop,mobile}.png`,
  `page-chat-convo-*`, `page-product-*`, `page-mysokohai-*`, `page-cart-*`,
  `page-notif-*`, `page-shopSetup-*`, `page-requestInbox-desktop.png`,
  `page-tokenBox-desktop.png`, `page-escrow-desktop.png`, `page-trips-desktop.png`,
  `page-savedItems-desktop.png`, `page-routeMatch-desktop.png`,
  `page-deliveries-desktop.png`, `page-userPayment-desktop.png`,
  `page-adminSettings-desktop.png`, `page-procurement-desktop.png`.

## Jinsi ya kujaribu
```bash
node tools/build_dist.mjs
source /home/user/pw.sh
node tools/test_fullscreen_pages.mjs
```
