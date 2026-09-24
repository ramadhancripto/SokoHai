# SOKOHAI ADS — CARD / VISUAL PRESENTATION SYSTEM · AUDIT REPORT (2026-09-24)

**PHASE 1–3** (Audit · Current structure map · Visual problems). Implementation imeendelea tu baada ya audit hii; hakuna renderer ya pili inayohitajika — card iliyopo (`skhAdvertisementCardHtml`) NDIYO source of truth na inaweza kuboreshwa moja kwa moja.

## 1. SOURCE OF TRUTH (renderer moja — haigawanyiki)

`js/06-announcement.js` → `cardHtml(a, live)` = `window.skhAdvertisementCardHtml`. Inatumika sehemu **3** (hakuna card nyingine):
1. **Home rotator** — `renderAd()` → `#topAnnouncement` (class `skh-home-ad skh-ann-post`).
2. **Admin form live preview** — `skhRenderAdminAdPreview()` (16-pos-admin-jobs.js).
3. **Creator Studio preview modes** — `showPreview()` (95-creative-studio.js).

SVG renderer (`renderCreativeSvg`) ni **editor canvas/published creative** — tofauti na Home card; haitumiki ku-render Home card. Hazigongani.

## 2. CARD STRUCTURE YA SASA (BEFORE)

```
<article class="skh-ann-card layout-{type}">        ← theme vars (--ad-*, palette tokens)
  badge (pos tl/tr/bl/br, styles 6, sizes 3, anims)
  <header class="skh-ann-post-head">                ← logo 48px | brand + "Sponsored · Advertisement" | "AD" pill
  <div class="skh-ann-copy">                        ← price pill + HEADLINE + message   ←❗ KABLA YA MEDIA
  media (.skh-ann-media aspect-*, blur-fill + main img contain | video yenye `controls`)
  metrics (likes/views/clicks)
  <footer class="skh-ann-post-actions">             ← CTA pekee, right-aligned
</article>
```

Styles: `css/38-home-ad-manager.css` (mistari 39–116 = `.skh-ann-post` card; 28–29 = legacy `.skh-home-ad` grid — ina-overridiwa na `display:block!important` ya skh-ann-post). Tokens za palette (`--ad-*`, 22) tayari zipo na zinatumika.

## 3. VISUAL PROBLEMS (zilizogunduliwa)

| # | Tatizo | Athari (distant view) |
|---|---|---|
| P1 | **Copy iko juu ya media** (DOM order) | Media si Level-1 anchor; card inasomika kama post ya kawaida |
| P2 | **Offer iko na headline; CTA iko footer peke yake** | "Kwa nini ni muhimu" + "Nifanye nini" hazijaunganishwa |
| P3 | **Video card ina full `controls`** | Inaonekana kama video player, si video ad; clutter |
| P4 | **Ad indicator mbili** ("Sponsored · Advertisement" + "AD" pill) | Redundant noise |
| P5 | Hakuna **micro-labels** (VIDEO/BIDHAA/HUDUMA) ingawa `category` iko kwenye data | Mtumiaji hajui anatangazwa nani/nini haraka |
| P6 | Hakuna **composition variants** — layout-* ni type markers tu | Kila ad inaonekana muundo mmoja |
| P7 | Hakuna **compact mode** (body/metrics/CTA size hazibadiliki na ukubwa) | Compact card inasongamana |
| P8 | Hakuna **spacing/typography tokens** — px hardcoded | Inconsistency; maintenance ngumu |
| P9 | Hakuna **bottom gradient/safe-zone** kwenye media | Readability ya text juu ya busy media haijahakikishiwa |
| P10 | Admin panel header ni generic h4 + pill tabs kubwa | Hakuna "Matangazo system" identity |

## 4. EXISTING SYSTEMS REUSED (havita-dupliketiwa)

- **Renderer**: `cardHtml` moja — inaboreshwa ndani yake yenyewe.
- **Creative model/fields**: `category, brandName, logoUrl, headline, description, priceTag, badgeText(+style/size/pos/anim), ctaLabel/ctaStyle/ctaIcon, paletteId, media fields, overlay, focal, fit` — zote tayari zipo.
- **Palettes**: `ad-palettes.js` tokens 22 (`--ad-*`) — zinatumiwa zaidi, hakuna mpya.
- **CTA presets/icons**: `SKH_CTA_PRESETS` + `skhCtaIcon` — vile vile.
- **Badge system**: style/size/position/animation zote zimehifadhiwa.
- **Media pipeline**: `mediaHtml()` (focal/fit/overlay/filters) — inaboreshwa, si kuandikwa upya.

## 5. PROPOSED COMPOSITION (AFTER)

```
┌────────────────────────────────────┐
│ [logo] Brand ······ Sponsored · AD │  ← Level 4 (subtle, row 1)
│ ┌────────────────────────────────┐ │
│ │  MEDIA (visual anchor)      ▶  │ │  ← Level 1 + video cue + duration
│ │       ─ bottom gradient ─      │ │
│ └────────────────────────────────┘ │
│ BIDHAA · VIDEO (micro, max 2)      │  ← labels yanayohitajika tu
│ MAIN HEADLINE                      │  ← Level 2
│ short supporting message (2 lines) │  ← Level 5
│ [ OFA / price ]        [ CTA → ]   │  ← Level 3 + offer pamoja
│ metrics (secondary, small)         │
└────────────────────────────────────┘
```

**Auto-composition** (kupitia existing fields, class `skh-comp-*`):
- `video` (videoUrl/creativeType video) → video-dominant + cue + duration
- `offer` (priceTag/offer + media) → offer row emphasized
- `product` (media default) → media anchor + headline + CTA
- `text` (hakuna media) → existing text-creative (haijaguswa)

**Responsive hierarchy**: compact/small → body inafichwa/clamped, metrics hidden, CTA compact, spacing inapungua — headline + CTA + media focal hubaki.

## 6. SCOPE YA IMPLEMENTATION

1. `js/06-announcement.js` — `cardHtml` reorder + composition + micro-labels + video cue (hakuna function mpya ya renderer).
2. `css/38-home-ad-manager.css` — **append** tokens (`--ad-sp-*`, type scale) + rules mpya za composition/compact/video-cue/topnav; existing rules zinabaki.
3. `js/app/16-pos-admin-jobs.js` — admin panel top-nav refinement (title/subtitle/actions; IDs/onclicks vile vile) — hakuna fake back-arrow kwa sababu hakuna ad page tofauti ya kurudi (ndani ya admin panel).
4. Tests: contract section mpya + jsdom visual-QA ya scenarios 15.
