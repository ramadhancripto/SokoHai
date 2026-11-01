# SokoHai — Ads Studio: marekebisho ya mpangilio (toleo la 2)

Toleo hili lina **faili zilizoguswa tu**. Hakuna `dist/`, `node_modules/`, picha za majaribio, wala taxonomy.

---

## Kilichorekebishwa kwenye toleo hili (v2)

### 1. Hatua za utengenezaji (stepper) zilikuwa zinatoka nje ya paneli — SIMU
Hatua 7 zilikuwa kwenye mstari mmoja usio na mwisho; hatua 5–7 zilikuwa **nje kabisa ya sanduku** kwenye upana wa 390px.

Sasa: hatua zisizo za sasa zinaonyesha **namba pekee**, hatua ya sasa inaonyesha namba + jina lake. Kila kitu kinatosha ndani ya paneli.

### 2. Mstari wa sehemu (nav) ulionekana "umekatwa" katikati ya neno — TABLETI/SIMU
Kwenye 820px, sehemu ya 11 ilikatika katikati ya neno bila ishara yoyote kwamba kuna zaidi.

Sasa: **fade ya upande wa kulia** inaonyesha wazi kuna sehemu zaidi, pamoja na `scroll-snap` na `overscroll-behavior` — unateleza kwa urahisi na kitufe kinakaa katikati.

### 3. Kadi zilijikunja upande mmoja (upana usio sawa) — `.mas-empty-page`
`.mas-empty-page { place-items: start; }` ilikuwa inabana **vitu vyote** (upana NA urefu) kwa upana wa maudhui yao. Ndiyo maana kadi ya "Hakuna kampeni" na kichwa vilikuwa vidogo upande wa kushoto.

Sasa: `align-items: start; justify-items: stretch;` — kuzuia kunyoshwa kwa **wima** pekee; upana unabaki kamili.

### 4. Kichwa cha sehemu na kitufe hazikuoana
`h1` sasa inachukua nafasi iliyobaki (`flex: 1 1 auto`) — kitufe kinabaki **kulia kabisa** badala ya kusogea karibu na kichwa.

### 5. Mipangilio (settings) — kadi mbili fupi zinaoanishwa
"Malipo na bajeti" na "Ufikiaji na usalama" sasa ziko **kando kwa kando** kwenye skrini pana (grid 2), badala ya kadi moja ndefu yenye nafasi tupu ndani yake.

### 6. Thamani za Mipangilio zinaoana kwa mstari
`.mas-facts` ni grid ya safu mbili: lebo kushoto (upana thabiti), thamani zinaanza mahali pale pale. Kwenye simu (≤560px): lebo juu, thamani chini.

### 7. Kadi hazinyoshwi kujaza skrini
`.mas-view { align-content: start; }` — ndiyo iliyokuwa sababu ya nafasi tupu kubwa kati ya kadi na ndani ya kadi.

---

## Uthibitisho (build halisi, si mockup)

Vipimo vilifanyika kwenye sehemu **zote 11** × upana **4** (1440 / 1024 / 820 / 390) = 44 mikusanyiko:

| Kipimo | Matokeo |
|---|---|
| Overflow / clipping / overlap kwenye sehemu zote 11 × 4 upana | **0 matatizo** |
| Sehemu 11 pamoja na data halisi (kampeni 4) @ 820, 1440, 390 | **0 matatizo** |
| Ads Studio contract (`ads_studio_rebuild_verify`) | **74/74** |
| Marketplace ad delivery (`ads_phase1_verify`) | **30/30** |
| Card parity / tablet / no overflow (`ads_task01_verify`) | **18/18** |
| Bottom nav slide (`bottom_nav_verify`) | **12/12** |

---

## Namna ya kufunga

1. Nakili folda zote juu ya mzizi wa mradi (muundo wa njia umehifadhiwa): `js/app/`, `css/`, `html/`, `functions/`, `index.html`, `tools/`
2. Endesha:
   ```
   node tools/build_dist.mjs
   node tools/dev_server.mjs 8080
   ```
3. Fungua `http://localhost:8080` → menu → Matangazo.

---

## Faili na kazi yake

| Faili | Kazi |
|---|---|
| `js/app/101-marketplace-ads-studio.js` | Studio yote — sehemu 11 |
| `css/43-marketplace-ads-studio.css` | **Marekebisho yote ya mpangilio ya toleo hili** |
| `js/app/100-ads-studio-ui.js` | UI ya studio (preview ya ukubwa halisi) |
| `js/app/99-ads-marketplace.js` | Matangazo ndani ya soko |
| `css/41-ads-marketplace.css`, `css/42-ads-studio.css` | Mitindo ya matangazo ya soko |
| `js/app/08-app-state.js` | Bottom nav inayojificha inaposhuka |
| `css/01-core.css` | `.nav-slide-hidden` + transition |
| `js/app/16-pos-admin-jobs.js` | Tabs za Matangazo kwa Kiswahili |
| `functions/creative.js` | `transport` → `delivery` (**backend — haijadeploywa**) |
| `html/*`, `index.html` | Marejeleo ya CSS/JS |
| `tools/*.mjs` | Vipimo 6 |

---

## Bado hakuna
Hakuna commit, merge, wala deploy. Malipo ya matangazo, lifecycle callables, na attribution hazijaanza — zinahitaji idhini yako.
