# SOKOHAI ADS — CARD / VISUAL PRESENTATION SYSTEM · RIPOTI YA MWISHO (2026-09-24)

**Audit kwanza** (`ADS-CARD-VISUAL-AUDIT-2026-09-24.md`) → kisha implementation ya additive.
Hakuna renderer ya pili, hakuna model ya pili, hakuna card mpya — **`skhAdvertisementCardHtml` ile ile imeboreshwa**.

---

## 1. FILES AUDITED

`js/06-announcement.js` (cardHtml/mediaHtml/renderAd + rotator), `js/app/creative/creative-svg-renderer.js`, `js/app/creative/creative-model.js`, `js/app/95-creative-studio.js` (preview modes), `js/app/16-pos-admin-jobs.js` (form preview + Admin panel + Media Library), `css/38-home-ad-manager.css`, `css/39-creative-studio.css`, `js/app/creative/ad-palettes.js`, `firestore.rules`.

## 2. FILES CHANGED

| Faili | Mabadiliko |
|---|---|
| `js/06-announcement.js` | `cardHtml` reorder (media-first), auto-composition `skh-comp-*`, micro-labels, offer+CTA action row, single ad indicator; video: `controls` → subtle cue + duration chip (opt-in `videoControls`). |
| `css/38-home-ad-manager.css` | **Appended** token block: spacing (`--ad-sp-1..6`), type scale (`--ad-type-*`), radii; composition/variant rules; bottom safe-gradient; video cue/dur; compact mode; responsive ≤480; Ads top-nav styles. |
| `js/app/16-pos-admin-jobs.js` | Ads panel top-nav: `Matangazo` + subtitle + actions (IDs/onclicks vile vile); panel class `skh-ads-panel` kwa lightweight tabs. |
| `tools/test_ad_card_visual.mjs` | **Mpya** — visual QA scenarios 19 (15 required + 4 system contracts). |
| `tools/test_home_ads_product_cards_contract.mjs` | Assertions 3 zilisasishwa kuendana na tabia MPYA iliyokusudiwa (video controls, ad indicator, create label) — hakuna test iliyofutwa. |

## 3. EXISTING RENDERER REUSED

`cardHtml` (`window.skhAdvertisementCardHtml`) — source of truth moja kwa Home rotator, Admin form preview, na Creator Studio preview. `renderAd`, `mediaHtml`, rotator/scheduling logic — havijaguswa kwa mantiki.

## 4. EXISTING MODEL REUSED

Fields zote za announcement/creative (`category, brandName, logoUrl, headline, description, priceTag, badge*, cta*, paletteId, overlay, focal, fit, brightness/contrast/saturation`) ndizo zinazoendesha composition mpya — hakuna field mpya ya model (isipokuwa opt-in ndogo: `compact`, `videoControls`, `mediaDurationSeconds` — zinazopuuzwa kimya kimya zisipokuwepo = backward compatible).

## 5. EXISTING PALETTE SYSTEM REUSED

Tokens 22 za `ad-palettes.js` (`--ad-*`) zinatumika zaidi sasa: `--ad-cta-bg/cta-text` kwa offer emphasis ya `skh-comp-offer`, `--ad-primary/accent` kwa micro-labels na borders. **Hakuna palette mpya.**

## 6. EXISTING CTA SYSTEM REUSED

`SKH_CTA_PRESETS` + `skhCtaIcon` + `cta-style-*` (solid/outline/glass/shine) + `cta-anim-*` — vile vile; CTA sasa inakaa na offer kwenye action row moja.

## 7. EXISTING MEDIA SYSTEM REUSED

`mediaHtml()` (focal/fit/overlay/filter/aspect) + uploader (`skhUploadFromFile`) + Admin Media Library (`adminMedia`) — havijaguswa.

## 8. CARD STRUCTURE — BEFORE / AFTER

```
BEFORE                                  AFTER
head (brand+AD, indicator mbili)        head (brand + 'Sponsored' + AD pill MOJA)
COPY (headline+offer) ← juu ya media    MEDIA (Level-1 anchor + gradient + cue)
MEDIA (video: full controls)            micro-labels (category/VIDEO — max 2)
metrics                                 HEADLINE + message (clamp 2)
footer: CTA pekee                       ACTION ROW: [OFFER]  ···  [CTA]
                                        metrics (secondary)
```

## 9. LAYOUT / COMPOSITION RULES (auto, content-driven)

`skh-comp-video` (videoUrl) → 16:9 media-dominant + cue + duration.
`skh-comp-offer` (priceTag) → offer emphasis kwenye action row.
`skh-comp-product` (default yenye media) → media anchor + headline + CTA.
`skh-comp-text` (hakuna media) → text-creative iliyopo (haijaguswa).
Renderer moja, rules reusable — hakuna renderer tofauti kwa kila layout.

## 10. RESPONSIVE BEHAVIOR

- ≤480px: metrics hidden, body clamp 2, CTA full-width kama haina offer — headline/media/CTA hubaki.
- `skh-ad-compact` (caller `a.compact=true`): body + metrics hidden, CTA compact (36px), logo 38px, spacing kupitia tokens.
- Spacing yote kupitia `--ad-sp-*` tokens — hakuna random values mpya.

## 11. VIDEO PRESENTATION

Published card: poster + **subtle play cue** (ring nyeupe) + **duration chip** (0:24 style) + autoplay muted (renderAd, haijaguswa). Full player controls zimeondolewa; technical controls zinabaki Creator Studio. Escape hatch: `a.videoControls===true`.

## 12. LOGO / BRANDING

Logo 48px (38px compact), radius 15/11, `object-fit:contain`, safe padding kwa head tokens; fallback initial mark pale logo halipo. Haiingiliani na media/headline (head row tofauti).

## 13. BADGE BEHAVIOR

Badge system yote (styles 6, sizes 3, positions 4, animations) **haijaguswa** — bado subtle na position-based juu ya card.

## 14. CTA BEHAVIOR

Presets/icons/styles/animations vile vile; compact mode → CTA compact; offer+CTA row moja (Level 2+3 pamoja); contrast inaendelea kufuatwa na palette tokens (verified na suite ya palettes).

## 15. DISTANT-VIEW READABILITY RESULTS

Hierarchy ya mbali: **MEDIA** (anchor kubwa) → **HEADLINE** (clamp 20–28px, 950 weight) → **OFFER+CTA** (row moja, tofauti ya rangi kupitia tokens) → brand row subtle juu. Body/metrics hazishindani na message (clamped/hidden compact). Verified na QA 01–19.

## 16. VISUAL QA RESULTS

**19/19 PASS** (`test_ad_card_visual.mjs`): image · video · offer · service · brand · long-headline · short-headline · no-logo · logo · portrait · landscape · busy-bg overlay · dark image · light image · compact + tokens contract · single ad indicator · text-creative preserved · top-nav structure.

## 17. TESTS PASSED

Suites **12**, zote green:
upgrade 8/8 · **ad_card_visual 19/19 (mpya)** · studio_media_design ALL PASS · creative_system ALL PASS · home_ads **45/0** · routing 69/0 · route_matcher 30/0 · functions_resilience 26/0 · nav_chain 18/0 · chat_e2e 57/0 · showcase 34/0 · card_discovery 80/0. Build `index.html` **100% byte-exact**.

## 18. TESTS FAILED

Hakuna.

## 19. PRE-EXISTING FAILURES

`test_chat_authority_contract.mjs` pekee — stale `fonts/` duplicates (imeelezwa tangu awali; si ya kazi hii, haijaguswa).

## 20. REMAINING LIMITATIONS

1. **Video duration chip** inaonekana tu kama `mediaDurationSeconds/videoDuration/durationSeconds` zipo kwenye ad doc — form ya admin haijapachika duration ya media bado (Cloudinary metadata ipo `adminMedia` tu; itahitaji field moja ya ziada kwenye save ikitakikana).
2. Micro-labels hutumia `label.split('/').pop()` — `General` haionyeshwi (kwa makusudi).
3. Compact mode ni opt-in (`a.compact=true`) — Home rotator bado hutumia full card; feed compact inaweza kuwashwa kwa kupachika flag hiyo.
4. Top-nav ya admin haina back-arrow (hakuna ad page tofauti ya kurudi — panel ni sehemu ya admin screen; kuweka arrow bila destination ingekuwa fake UI).
5. Kazi **haija-commit/push/deploy** — ngoja maelekezo yako.

---

**Goal imefikiwa:** matangazo ya SokoHai sasa yana visual hierarchy ya ad halisi (media → headline/offer → CTA → brand), yanatambulika kwa mbali kama "Advertisement", na system nzima (Home, form preview, studio preview) inatumia renderer moja canonical.

*Nimesimama — ngoja maelekezo yako.*
