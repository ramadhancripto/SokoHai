# SOKOHAI — CREATOR STUDIO UPGRADE · PRE-EDIT AUDIT (2026-09-23)

Audit hii imeandikwa KABLA ya kuhariri faili lolote, kama ilivyoagizwa.
Lengo: kuinua "Create Advertisement" iliyopo kuwa SokoHai Creator Studio bila kuvunja mfumo unaofanya kazi.

## 1. RAMANI YA MFUMO ULIOPO (PIPELINE YA TANGAZO)

| Hatua | Wapi | Maelezo |
|---|---|---|
| Advertisement Manager | `js/app/16-pos-admin-jobs.js` (sehemu ya `loadAdminDashboard`, ~L276) | Paneli moja tu ya admin: tabs (active/scheduled/draft/expired/archived), Media Library, + Create Advertisement |
| Create Advertisement form | `window.skhAdFormHtml` — `js/app/16-pos-admin-jobs.js` L307–338 | Fomu rahisi yenye fields zote zilizoorodheshwa kwenye brief |
| Live Preview | `skhRenderAdminAdPreview` → `window.skhAdvertisementCardHtml` | **Renderer hiyohiyo** (js/06-announcement.js L169) inayotumiwa na Home feed — GOOD: preview + published tayari ni canonical moja |
| Save | `submitAnnouncementForm` → `sokohaiSaveAnnouncement(payload, editId)` (`js/app/09-feed-announcements.js` L181) → Firestore `announcements` | Whitelist save |
| Home rotation | `js/06-announcement.js` | state machine (draft/scheduled/active/expired/archived), priority sort, rotationMs (default 9000), impression/click tracking kupitia `creativeTrackEvent`, video autoplay muted |
| Creative Studio (advanced) | `js/app/95-creative-studio.js` + `js/app/creative/{creative-model,creative-svg-renderer,creative-history}.js` | ES module; canonical layer model; `creatives`, `brandKits`, `creativePublications`, `creatives/{id}/versions` |
| Daraja Simple↔Studio | `skhOpenAdvancedFromLegacy` (95 L1640) na `syncBackToLegacyForm` (95 L86) | Flat form ↔ canonical creative (njia mbili tayari ipo) |
| Cloud authority | `functions/creative.js` (`creativePublish`, `creativeTrackEvent`) + `firestore.rules` L110+ | Server andika versions immutable; announcements zinawekwa admin-only |
| HTML build | `tools/build_html.py` — **`index.html` ni generated** kutoka `html/*.html` | Kuhariri fragment `html/21-scripts.html` kisha `npm run build:html` |
| Tests | `tools/*.mjs` (Node ESM), `npm run test:creative` nk. | Contract tests zilizo tayari |

## 2. MIFUMO ILIYOPO ITAKAYOTUMIKA TENA (KANONIKALI — HAITADUPLIKATIWA)

- **Renderer ya post-card**: `skhAdvertisementCardHtml` (06-announcement.js) — preview na published.
- **Renderer ya canvas/export**: `renderCreativeSvg` (creative-svg-renderer.js) + keyframes ndani yake.
- **Data model**: `creative-model.js` (layers: text/image/video/audio/logo/icon/shape; `videoMeta`, `audioMeta`, `animation`, `crop`, `filter`, `timeline`, `audioMix`, `destination`, `validateCreative`).
- **Animation CSS classes**: `anim-enter-*`, `anim-emph-*`, `badge-anim-*`, `cta-anim-*` + keyframes (css/38-home-ad-manager.css L150+).
- **Badge styles css**: `style-pill`, `style-ribbon`, `style-sticker`, `style-glass` (L44–47).
- **CTA styles css**: `solid`(default), `outline`, `glass` (+`shine` sehemu) (L72–73).
- **Media upload/library**: `skhAdminAdUpload` + `adminMedia` collection (Cloudinary).
- **Palettes za sasa**: `skhAdApplyPreset` hardcoded 8 presets (emerald/ocean/royal/sunset/mono/gold/rose/neon) — zitabaki na msingi huu, zikigeuzwa kuwa token source kanonikali.

## 3. MAPENGO YALIYOPATIKANA (YATAKAYOFANYIWA KAZI)

1. **DATA LOSS KATIKA SAVE (bug halisi):** `sokohaiSaveAnnouncement` haitahifadhi fields nyingi ambazo fomu hukusanya na renderer husoma: `badgeAnimation`, `ctaAnimation`, `textAnimation`, `textEmphasis`, `animationMode`, `animationDuration`, `animation{}`, `videoAutoplay/videoLoop/autoplay/loop`, `aspectRatio/format`, `objectFit/fit`, `focalPoint/focalX/focalY`, `brightness`, `contrast`, `saturation`, `blur`, `overlay*`, `fontSize`. Matokeo: tangazo linapohifadhiwa/kurindishwa animations na media controls HUPOTELEA. (Kipimo cha brief #14/#15.)
2. **Palettes ni hardcoded** ndani ya click handler — si tokens zinazoweza kutumika na studio + renderer (brief: DESIGN PALETTE SYSTEM).
3. **Badge system**: ina styles 4 tu (pill/ribbon/sticker/glass); hakuna stamp/outline; hakuna size/position/opacity/icon props.
4. **CTA presets/icons/styles**: list fupi; hakuna gradient/pill/border/glow halisi; icons 5 tu.
5. **Canonical ad-state fields zinazokosekana**: `paletteId`, `category` (nini kinachotangazwa), `campaignName`, `campaignId`, `offer`, `displayDurationSeconds` (tofauti na media duration), na `creativeId` reference kwenye announcement inapotoka studio.
6. **Daraja simple↔studio halisawazishi fields zote** (badge, logo, palette, schedule, priority, category…).
7. **`creativePublish` (functions/creative.js)** uandishi wa announcement haupeleki category/campaign/displayDuration/palette — butunisho la baadaye lenye fallbacks salama.

## 4. DUPLICATES ZILIZOPATIKANA (RIPOTI TU — HAKUNA KUFUTA)

1. **`assets/` tree** — nakala ya karibu repo nzima (assets/js, assets/css, assets/*.md). `diff` imethibitisha `assets/js/06-announcement.js` na `assets/js/app/16-pos-admin-jobs.js` ZINATOFAUTIANA na canonical `/js`. index.html haitumii (script src = `js/...`). → legacy mirror; HAITAFUTWI bila ridhaa.
2. `_originals/app.module.js` — nakala ya zamani ya module moja.
3. `sokohai-fixes-v2.patch` — patch file ya zamani (52 KB).
4. `html/21-scripts.html` ↔ scripts block ya index.html — **si duplicate** bali build source (build_html.py); lazima kuhariri fragment kisha rebuild.
5. Njia zilizo zenye majina yanayofanana katika vivinjari vikubwa (`05-announcement.css` vs `38-home-ad-manager.css`) zimekaguliwa: 05 ni ya core announcement bar styles za zamani, 38 ni manager/ads engine — **zote mbili zinatumika**, haziduplikati Advertisement Manager.

**Hakuna** Advertisement Manager ya pili, **hakuna** Creative Studio ya pili, **hakuna** bottom navigation ya pili.

## 5. MPANGO WA UTEKELEZAJI (INCREMENTAL)

1. Kanonikali mpya (data tu): `js/app/creative/ad-palettes.js` — palette tokens (8 palettes zilizopo, tokens 22 kila moja) + CTA presets + icon map (window-scope: inasomwa na fomu, renderer 06, na studio module).
2. `creative-model.js`: ongeza canonical fields (category/campaign/campaignId/offer/priority/startAt/endAt/displayDurationSeconds clamp 5–59; `duration` inabaki = media/timeline duration ≤ 30 — hakuna kuchanganya).
3. `16-pos-admin-jobs.js`: restructure ya fomu kwenye sections BASIC/DESIGN/MOTION/MEDIA/SCHEDULE (kila input id + handler za zamani kubaki), fields mpya, palette refactor kutumia canonical tokens.
4. `09-feed-announcements.js`: `sokohaiSaveAnnouncement` ihifadhi fields ZOTE (kurekebisha data loss) + fields mpya — sanitize + backwards compatible.
5. `06-announcement.js`: palette tokens → CSS vars; badge stamp/outline/size/position/opacity/icon; CTA styles/icons mpya; `displayDurationSeconds→rotationMs` fallback — bila kubadilisha tabia zilizopo.
6. `38-home-ad-manager.css`: classes mpya tu (hakuna kubadilisha zilizopo).
7. `95-creative-studio.js`: daraja kwa njia zote mbili lipanuliwe; contentControls + "Advertisement / Campaign" (category, campaign, offer, schedule, priority, display duration).
8. `functions/creative.js`: announcement mapping + fallbacks (inahitaji `firebase deploy --only functions` — itaflagiwa kwenye ripoti).
9. `html/21-scripts.html` + `npm run build:html`; test file mpya `tools/test_creator_studio_upgrade.mjs`; hakuna kuvunja tests zilizopo.
