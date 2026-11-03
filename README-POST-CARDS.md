# SokoHai — Post Cards (Bidhaa · Huduma · Usafiri) · 2026-11-02

Kazi: **kadi za posts na details zake za ndani ziwe na nakshi, zionekane kwa
kupendeza, na mpangilio uliojengwa vizuri kwa vipimo** — kwa **bidhaa, usafiri
na huduma** zote.

> Mabadiliko ni **CSS pekee** (`css/45-post-cards.css`) + mstari mmoja wa
> `<link>` kwenye `index.html`. Hakuna mabadiliko ya markup, JS, data, wala
> backend — `skh.ProductPostCard / ServicePostCard / TransportPostCard`
> zinabaki kama zilivyo, na sera ya kadi (teaser: hakuna Like/Save) haijaguzwa.

---

## Kabla → Baada (vipimo halisi, UI inayotumika)

| Kipimo | Kabla (desktop 1280) | Baada | Kabla (simu 390) | Baada |
|---|---|---|---|---|
| Kadi | 237×354 | 237×354 | 170×324 | 170×324 |
| **Picha** | 235×**176** | 235×**240** | 168×**126** | 168×**232** |
| **Nafasi tupu chini ya maudhui** | **71 px** | **13 px** | **105 px** | **10 px** |
| Jina | 15 px / mistari 2 | **13.5 px** / mistari 2 | 12.5 px | **12 px** |
| Bei | 16 px | 16 px (namba, `tabular-nums`) | 14.5 px | **13.5 px** |
| Mstari wa eneo | 11.5 px | **10.5 px** (umefungwa chini) | 11.5 px | **9.5 px** |
| Kihesabu cha picha | 39×**25 px** | 34×**19 px** | 39×25 px | 34×**18 px** |
| Kibandiko `ZIMEISHA` | **116×44 px** (bloku kubwa katikati) | **66×20 px** (pembe ya juu-kulia) | 116×44 | 66×19 |
| Njia ya usafiri | `calc(100% - 44px)` → **"Dar es …"** | upana wote → **"Dar es Salaam → Mbeya"** | yakatwa | kamili |

---

## Kilichobadilika (mpangilio wa ndani)

**1. Muundo wa kadi umefungwa**
- Kadi ni safu (`flex column`) yenye **urefu sawa** kwenye safu (grid row).
- **Picha inakua** kujaza nafasi iliyobaki; mwili unabaki juu, na **mstari wa
  eneo umefungwa chini** (`margin-top:auto` + mstari mwembamba `#F0F5F3`).
  Hivyo nafasi tupu ya 71–105 px imeondolewa — sasa ni 10–13 px (padding halisi).
- Fremu moja: radius 16, mpaka `1px #E6EEEC`, kivuli kimoja cha upole, na
  `translateY(-2px)` + kivuli laini kwa hover; `focus-visible` kwa ufikivu.

**2. Uwiano wa maandishi (hierarchy)**
- Jina: 13.5 px (simu 12 px), uzito 750, mistari **2 pekee** (line-clamp) na
  nafasi ya mstari wa pili imehifadhiwa — bei za kadi zote kwenye safu
  zinaanza kwenye mstari mmoja.
- Bei: 16 px, uzito 850, kijani `#0E6B52`, `tabular-nums` (namba zasimama
  wima), haikatwi (`TSh 45,000` kamili hata kwenye simu).
- Kiambishi `KUANZIA` / `Kwa saa` ni 9.5 px, herufi kubwa, kijivu — bei
  inabaki kuwa nyota ya kadi, sio maneno.
- Lebo zisizo na namba (`Kadirio linahitajika`, `Maelewano`) ni 12.5 px kijivu
  chenye uzito mdogo — hazijachanganywa na bei halisi.

**3. Picha na vibandiko (nakshi)**
- Kifuniko (scrim) laini chini ya picha ili vibandiko visomeke bila boksi nzito;
  zoom ya upole (1.035) kwa hover.
- Vibandiko vimeunganishwa kimoja: `ZIMEISHA` (juu-kulia), `Imethibitishwa`
  (chini-kushoto), kihesabu cha picha (chini-kulia), beji za mnada/jumla
  (juu-kushoto) — vyote 18–20 px, herufi 8.5–10 px, pembe 6 px.
- Bidhaa iliyoisha: picha inafifia (`grayscale .55`) badala ya kufichwa.

**4. Njia ya usafiri**
- Overlay ya njia ilikuwa `max-width: calc(100% - 44px)` (nafasi iliyotengwa kwa
  kihesabu cha picha ambacho hufichwa kwenye kadi yenye njia) — hivyo jina
  lilikatwa. Sasa inachukua upana wote: **"Dar es Salaam → Mbeya"** inaonekana
  kamili, mistari 1, yenye ellipsis makini ikiwa jina ni refu mno.

**5. Muuzaji, chombo, tathmini**
- Jina la muuzaji linapata nafasi (ikoni 16 px + tiki); hesabu ya maoni
  `(34)`/`Imeuzwa` haionekani kwenye kadi (ipo kwenye DOM na ukurasa wa
  maelezo) — jina lilikuwa linakatwa baada ya herufi 7.
- Nyota `⭐ 4.8` ni chip isiyo na fremu, 9.5 px — haikimbizani na jina.
- Chombo cha usafiri (mf. `Lori la Tani 10`) ni chip ndogo 19 px yenye mpaka
  mwembamba, inakaa mstari wake.
- Mpangilio wa mwili: **jina → chombo → bei → msafirishaji → eneo** (usafiri),
  **jina → bei → muuzaji → eneo** (huduma), **jina → bei → eneo** (bidhaa) —
  kama ilivyoandikwa kwenye `00-bootstrap.js`.

**6. Vipimo hufuata upana wa KADI (container queries)**
- `@container postcard (max-width: 210px)` na `(max-width: 176px)`: kadi za
  rafu (150–190 px) na grid ya simu zinapata vipimo vidogo kwa uwiano sawa.
- `@media (max-width: 640px)` imeachwa kama fallback kwa vivinjari visivyoelewa
  container queries.

---

## Faili

| Faili | Kazi |
|---|---|
| `css/45-post-cards.css` | **MPYA** — safu yote ya marekebisho (sehemu 1–6) |
| `index.html` | mstari mmoja: `<link rel="stylesheet" href="css/45-post-cards.css">` |
| `tools/test_post_cards.mjs` | mtihani mpya wa regression — **60/60** |

Hakuna faili ya JS iliyoguzwa. Kadi za matangazo (`.skh-ad-cell`) na kadi za
duka (`js/app/29-seller-store.js`) **hazijaguzwa** — selector zote zina
`.feed-card-box.skh-card`.

## Uthibitisho
- `tools/test_post_cards.mjs` — **60/60 passed** kwenye 1280 / 1024 / 390 px:
  fremu, picha, line-clamp 2, ukubwa wa jina & bei, bei haikatwi, eneo chini,
  hakuna mlipuko wa upana, vibandiko vidogo, mpangilio wa aina zote tatu,
  njia isiyokatwa, na **urefu sawa wa kadi kwenye safu**.
- Regression zilizoendeshwa baada ya mabadiliko:
  `test_commerce_cards` 47/47 · `test_delivery_choice` 58/58 ·
  `test_ad_card_styling` 14/14 · `test_ads_visibility` 18/18 ·
  `bottom_nav_verify` 12/12 · `test_chat_compact` 37/37.
- `test_card_discovery` 66/67 — kosa lililopo tangu mwanzo (`#dfCount` haipo
  kwenye jsdom); limethibitishwa kwa kuendesha bila stylesheet hii: matokeo ni
  sawa (66/67).
- Picha za UI halisi: `audit-shots/postcards-before-{desktop,mobile}.png`,
  `postcards-after-{desktop,mobile}.png`, `postcards-demo-desktop.png`
  (huduma + usafiri), `postcards-rail-desktop.png` (rafu).

## Jinsi ya kujaribu
```bash
node tools/build_dist.mjs
LD_LIBRARY_PATH=/home/user/pwlibs/x86_64-linux-gnu:/home/user/pwlibs \
  node tools/test_post_cards.mjs
```
