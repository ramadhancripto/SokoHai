# SokoHai — Chat Compact (Inbox + Mazungumzo) · 2026-11-01

Kazi: **chat inbox ilikuwa inachukua nafasi kubwa mno**, na **maandishi ya
mazungumzo/negotiation ndani ya bubbles yalikuwa yamebanwa**. Mabadiliko haya
yanabana inbox, na kufanya mazungumzo **yasomeke lakini yasilemee (sio makubwa)**.

> Hakuna mabadiliko ya msimbo wa chat, data, wala backend — **CSS pekee**
> (`css/44-chat-compact.css`) + mstari mmoja wa `<link>` kwenye `index.html`.
> Faili iliyoongezwa mwishoni; sheria za awali hazijafutwa wala kudhoofishwa.

---

## Kabla → Baada (vipimo halisi, UI inayotumika)

| Kipimo | Kabla (desktop) | Baada (desktop) | Kabla (simu) | Baada (simu) |
|---|---|---|---|---|
| Dirisha la inbox | 1280×900 (**skrini nzima**) | **480×484** (dirisha dogo katikati) | 390×844 | 374×528 |
| Urefu wa safu moja | 94 px | **57 px** | 91 px | **57 px** |
| Orodha (safu 6) | 608 px | **419 px** | 542 px | **419 px** |
| Ujumbe: jumla ya urefu | 1335 px | **733 px** (−45%) | 1541 px | **830 px** (−46%) |
| Kadi ya bidhaa/ofa | 128 px | **104 px** | 222 px | **137 px** (−38%) |
| Upana wa safu ya ujumbe | 960 px | **780 px** | — | 334 px |
| Kitufe cha ndani ya kadi | 40 px | **28 px** | 40 px | **28 px** |

---

## Kilichobadilika

### 1. Inbox (orodha ya mazungumzo)
- **Dirisha dogo**: zamani modal ilijaza skrini yote (nafasi tupu kubwa chini ya
  safu 6). Sasa ni dirisha la **480 px** lililowekwa katikati, urefu unafuata
  idadi ya mazungumzo (`height:auto; max-height:78vh`), pembe zilizozawadiwa.
- **Safu moja = mstari mmoja mwembamba (57 px)**: hakuna kadi inayoelea, hakuna
  kivuli, hakuna nafasi kati ya safu — mpaka mmoja mwembamba (`1px #F1F5F9`) pekee.
- **Jina MOJA**: chip ya kijani iliyokuwa inazunguka jina imeondolewa (jina
  lilikuwa na uzito mara mbili). Sasa ni maandishi 13.5 px, mazito.
- **Cheo (Muuzaji / Msafirishaji / GROUP)** kimewekwa kwenye mstari huo huo
  kulia kwa jina (gridi 2×2) — hakiongezi mstari wa tatu wala urefu.
- Simu: cheo kimefichwa kwenye orodha ili **ujumbe wa mwisho usikatwe mapema**;
  cheo kinaonekana ndani ya mazungumzo.
- Avatar 40×40 (36 px kwenye simu), mraba uliozawadiwa pembe — uthabiti kwa
  watu na makundi.
- **Chips 10**: mstari mmoja unaoteleza (`overflow-x:auto`) + ukingo unaofifia
  kulia, badala ya kukatika ghafla ("Kumbukumbu" ilikatika).
- Mstari mwembamba wa kijani (3 px) upande wa kushoto = ishara ya ujumbe mpya,
  badala ya kivuli kizito.

### 2. Mazungumzo (bubbles)
- Maandishi **14 px** (yalikuwa yanabanwa na padding kubwa); padding `7px 11px`
  badala ya nafasi iliyotawanyika.
- **Vitendo vya kila ujumbe (`Jibu · Nakili · Zaidi`)** vilikuwa vikichukua
  safu ya 112 px kwa kila ujumbe. Sasa:
  - kompyuta: vinaonekana **kwa hover/focus** tu (havichukui nafasi);
  - simu/tablet: havionekani; vinapatikana kwa **kubonyeza kwa muda mrefu**
    (menyu ya ujumbe iliyokuwepo).
- Safu za ujumbe zimebaki katikati kwa upana wa **780 px** (zilienea 960 px —
  macho yalilazimika kusafiri mbali).
- Mandhari: kijani cha SokoHai kwa ujumbe wako, nyeupe kwa mwenzako; doti za
  mandhari zimeondolewa; radii 14 px na "mkia" mdogo.
- Ujumbe wenye kadi pekee: **bubble haifanyi fremu ya pili** (hakuna border
  mara mbili) — kadi yenyewe ni fremu.

### 3. Kadi za bidhaa / huduma / usafiri (negotiation)
- Picha ya bidhaa 44 px; kadi `max 340 px`; hakuna kivuli kizito.
- Bei 12.5 px kijani, kichwa 12.5 px mazito, kiungo "Tazama Bidhaa →" 11 px.
- Vitufe vitatu (Oda / Pendekeza Bei / Weka Kikapu) **28 px kwa mstari mmoja**
  kwenye kompyuta (yalikuwa 40 px na kupanga mistari miwili kwenye simu).
  *(Sababu: `css/26-design-system.css` ina `button { min-height:40px }` —
  tumeweka `min-height:0` kwa vitufe hivi vidogo vya ndani ya kadi pekee;
  vitufe vikuu vya app havijaguzwa.)*

### 4. Kadi za ofa (negotiation)
- Kichwa "OFA YA BEI" ni lebo ndogo ya herufi kubwa (10.5 px) + jina la bidhaa
  12 px — kama kichwa cha habari, sio sentensi ndefu.
- Bei 13 px **hai katika kipande kimoja** ("TSh 38,000"), bei ya awali
  imepigwa mstari na kufifia.
- Hali (`Inasubiri jibu` / `Counter imetolewa` / `Imekubaliwa`) ni chip ndogo
  10.5 px yenye rangi inayolingana na hali.
- Ofa zenye vitendo: vitufe 28 px, `Kubali` kijani, `Kataa` nyekundu.

---

## Faili

| Faili | Kazi |
|---|---|
| `css/44-chat-compact.css` | **MPYA** — safu yote ya marekebisho (imegawanywa sehemu 0–5) |
| `index.html` | mstari mmoja: `<link rel="stylesheet" href="css/44-chat-compact.css">` |
| `tools/test_chat_compact.mjs` | mtihani wa regression — **37/37** |

Hakuna faili ya JS ya chat iliyoguzwa; hakuna data/Firestore; hakuna backend.

## Vipimo / uthibitisho
- `tools/test_chat_compact.mjs` — **37/37 passed** (desktop 1280×900 + simu 390×844:
  urefu wa safu, hakuna kivuli/fremu, avatar, fonti, chips, dirisha, bubble,
  kadi, vitufe, na vitendo vinafichwa ipasavyo).
- Regression zilizoendeshwa baada ya mabadiliko:
  `test_ad_card_styling` 14/14 · `test_ads_visibility` 18/18 · `bottom_nav_verify` 12/12.
- Picha za UI halisi inayotumika: `audit-shots/chat-inbox-{desktop,mobile}.png`,
  `audit-shots/convo-{desktop,mobile}.png`.

## Jinsi ya kujaribu
```bash
node tools/build_dist.mjs          # css -> dist
LD_LIBRARY_PATH=/home/user/pwlibs/x86_64-linux-gnu:/home/user/pwlibs \
  node tools/test_chat_compact.mjs
```
