# SokoHai — Home Page Fix Report
**Date:** 2026-09-24 · **Task:** Category system visibility + duplicate buttons removal

## Ombi la Mmiliki (Request)
1. Mfumo wa **Kategoria / Subcategories / Vichujio (Filters) / Attributes** haonekani kabisa juu — urekebishwe uonekane vizuri **chini ya ad card/images** kuzunguka matangazo.
2. **Ondoa** vitufe vya **Vyote / Bidhaa / Huduma / Usafiri** vilivyojirudia ndani ya uwanja (feed), kwa sababu tayari kuna **bottom navigation** inayofanya kazi hiyo hiyo.

## Uchunguzi (Audit Findings)

### Tatizo 1 — Kategoria imefichwa
- `html/17-sliders.html` → `#topFilterToggles` (kitufe cha kategoria, `.cat-trigger-btn`,
  hufungua `openCategoryModal()`) kilikuwa na **inline `style="display:none;"`**.
- Hakuna JS yoyote inayoweka `topFilterToggles.style.display` — hivyo kilikuwa
  kimefichwa **milele** (bug). Scroll-handler (`js/app/08-app-state.js`) na CSS
  (`.cat-trigger-btn { display:flex }`) zilishaandaliwa ionekane.
- `#dynamicSliders` (chips za subcategories + filters) ni **by-design** huonekana
  tu baada ya kuchagua kategoria (`js/app/01-market.js` → `selectAdvancedCategory`).

### Tatizo 2 — Vitufe vilivyojirudia
- `js/21-home-filters.js` hujenga **`#skhHomeFilterBar`** — safu ya vitufe
  **Vyote / Bidhaa / Huduma / Usafiri** inayochomekwa juu ya feed (ndani ya uwanja).
- Kazi yake (kuchuja home kwa aina) inafanana kabisa na **bottom nav**
  (`html/19-bottomnav.html`: Home / Bidhaa / Huduma / Usafiri / Chat).
- Hivyo ni **duplication** — imeondolewa kwa maombi ya mmiliki.

## Marekebisho (Changes)

| # | Faili | Badiliko |
|---|-------|----------|
| 1 | `html/17-sliders.html` | Imeondoa inline `display:none` kwenye `#topFilterToggles` + comment ya ukaguzi. Sasa kitufe cha kategoria kinaonekana **moja kwa moja chini ya ad card**, kabla ya sliders za mikakati (Zinazovuma, Karibu Nawe, n.k.). |
| 2 | `js/21-home-filters.js` | `bar()` sasa inarudisha `null` — `#skhHomeFilterBar` **haitengenezwi tena** (vitufe vya Vyote/Bidhaa/Huduma/Usafiri vimeondolewa kwenye feed). Hooks za `renderFeedUI`/`updateApp` zimeachwa kama **pass-through salama** (`skhHomeFilter` hubaki `'all'`) ili mtiririko wa feed usivunjike. |

**Kilichojengwa upya:** `python3 tools/build_html.py build` → `index.html` mpya;
`check` → **byte-exact** na vipande vya `html/`.

## Mpangilio Mpya wa Home (juu → chini)
1. Top nav + search + region bar (`16-topnav.html`)
2. **Tangazo (Ad showcase)** — `#topAnnouncement`
3. ✅ **Kategoria: [chaguo] +** — `#topFilterToggles` *(SASA INAONEKANA)*
4. *(Baada ya kuchagua kategoria)* → Subcategories + Filters chips — `#dynamicSliders`
5. Sliders za mikakati (Zinazovuma / Karibu Nawe / Zinazotafutwa / Boosted)
6. Uwanja wa Mchanganyiko (`#mainFeed`) — bila safu ya vitufe vilivyojirudia
7. Bottom nav (Home / Bidhaa / Huduma / Usafiri / Chat) — ndiyo njia pekee sasa ya kubadili aina

## Majaribio (Test Results) — YOTE PASS
| Suite | Matokeo |
|-------|---------|
| `verify_nav_chain` | ✅ 18/0 |
| `test_market_visual_contract` | ✅ 12/0 |
| `test_home_ads_product_cards_contract` | ✅ 45/0 |
| `test_showcase` | ✅ 34/0 |
| `test_card_discovery` | ✅ 80/0 |
| `test_commerce_cards` | ✅ 47/0 |
| `test_routing` | ✅ 69/0 |
| `test_chat_e2e_journey` | ✅ 57/0 |
| Runtime check (jsdom) | ✅ trigger visible · bar not created · filter='all' |
| Build integrity | ✅ `build_html.py check` byte-exact |

## Ulindwa (Nothing Broken)
- Bottom nav, ad showcase, sliders, feed, chat, routing, Firebase flows — hazijaguswa.
- Hakuna kitu kilichofutwa bila ukaguzi; faili ya `21-home-filters.js` imeachwa
  (hooks salama), bar tu ndiyo isiyoundwa tena.
- Hakuna commit/push (kwa maagizo ya mmiliki).

## Deployment
Zip mpya: **`/home/user/SokoHai-HomeCategoryFix-Full-2026-09-24.zip`**
(inajumuisha marekebisho haya + kazi zote za awali: Creator Studio, Palette 70,
Media Design, Ads Card Visual System).
