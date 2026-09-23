# SOKOHAI — CREATOR STUDIO UPGRADE · RIPOTI YA MWISHO (2026-09-23)

Lengo lilitekelezwa: **Create Advertisement + Advanced Design → Creator Studio mmoja wa kitaalamu, unaotumika tena (reusable), bila kuvunja mfumo uliopo.** Audit imefanywa kabla ya mabadiliko (`CREATOR-STUDIO-AUDIT-2026-09-23.md`); utekelezaji umefanyika incremental. Hakukuwepo reset, hakuna Advertisement Manager ya pili, hakuna Creative Studio ya pili, hakuna kuondolewa kwa feature zinazofanya kazi.

**Matokeo ya tests:** 1172+ checks PAZIA kupita. Moja tu inafeli imeshindikana — `test_chat_authority_contract.mjs` → *"stale duplicate app haipo tena ndani ya fonts/"* — **imehibitishwa kuwa imekufa tangu kitawi cha msingi (HEAD)** kabla ya kazi hii, kwa sababu `fonts/js`, `fonts/css`, `fonts/html` zimo ndani ya repo. Sijazifuta (kanuni: ripoti kabla ya kufuta).

---

## A. FILES INSPECTED (zilizokaguliwa)

| Faili | Uchunguzi |
|---|---|
| `js/app/16-pos-admin-jobs.js` | Advertisement Manager + Create/Edit form + preset/preview/submit pipeline |
| `js/app/09-feed-announcements.js` | announcements listener, `sokohaiSaveAnnouncement`, delete/toggle |
| `js/06-announcement.js` | Canonical card renderer + Home rotation + tracking |
| `js/app/95-creative-studio.js` | Creative Studio shell, panels, bridge, save/publish |
| `js/app/creative/creative-model.js` | Canonical creative data model, layers, validation |
| `js/app/creative/creative-svg-renderer.js` | SVG canvas/export renderer (+ animation keyframes) |
| `js/app/creative/creative-history.js` | Undo/redo |
| `css/38-home-ad-manager.css`, `css/39-creative-studio.css` | Ad/badge/CTA/animation styles; studio styles |
| `functions/creative.js`, `firestore.rules`, `firebase.json` | Cloud authority (publish/track), rules |
| `html/21-scripts.html`, `tools/build_html.py` | Build pipeline ya `index.html` |
| `tools/test_creative_system.mjs` (+ suite ya `npm test`) | Contracts zilizopo |
| `assets/` (107 js), `_originals/`, `sokohai-fixes-v2.patch`, `html/README.md` | Duplicates/legacy — imekaguliwa, imepoa ripoti tu |

## B. FILES CHANGED (zilizobadilishwa)

1. **`js/app/creative/ad-palettes.js`** — MPYA: canonical tokens (single source of truth).
2. **`js/app/creative/creative-model.js`** — canonical state fields mpya + `DISPLAY_DURATION_SECONDS` + publish validation (media duration rule HAIBADILIKI).
3. **`js/app/16-pos-admin-jobs.js`** — form restructuring BASIC/DESIGN/MOTION/MEDIA/CTA/SCHEDULE (controls 60 legacy zimehifadhiwa + 10 mpya), `skhAdApplyPreset` token-based, edit-reopen + form-data extended.
4. **`js/app/09-feed-announcements.js`** — `sokohaiSaveAnnouncement`: kurekebisha **data loss** (33 fields sasa huhifadhiwa).
5. **`js/06-announcement.js`** — renderer: palette token CSS vars, badge props mpya, CTA icons via canonical map, mode ya line-by-line, `displayDurationSeconds → rotation`.
6. **`css/38-home-ad-manager.css`** — additive styles pekee (stamp/outline, size/position, gradient/pill/border/glow, section chrome, active palette chip).
7. **`js/app/95-creative-studio.js`** — **FIX: stray `}` iliyokuwa ikinufaisha module yote isipakue (latent HEAD bug)**; named palettes; Advertisement/Campaign panel; daraja kamili form↔studio.
8. **`functions/creative.js`** — `creativePublish` announcement mapping + canonical fields (fallback salama; **inahitaji deploy kuwa live**).
9. **`html/21-scripts.html` + `index.html` (rebuilt)** — ad-palettes.js itapakuliwa kabla ya renderer.
10. **`tools/test_creator_studio_upgrade.mjs`** (MPYA) + `package.json` (`test:creator-upgrade`, imeongezwa kwenye `npm test`).

## C. EXISTING SYSTEMS REUSED (zilizotumika tena — hazikuduplikatiwa)

- **Renderer moja** ya preview + published: `skhAdvertisementCardHtml` (06) — "Creative State → Canonical Renderer → Preview/Published" tayari ndiyo msingi; imepanuliwa tu.
- **Creative layer model**: `creative-model.js` (layers/text/image/video/**logo**/audio/icon/shape, videoMeta, audioMeta, animation, crop, filter, timeline, destination, `validateCreative`).
- **SVG renderer**: `creative-svg-renderer.js` (logo type tayari ina-support L188; animation keyframes).
- **Animation CSS**: `anim-enter-*`, `anim-emph-*`, `badge-anim-*`, `cta-anim-*` katika 38-css.
- **Media upload + Admin Media Library** (`adminMedia`, Cloudinary) — hakucha kubadilishwa.
- **Audio**: controls + `skh-ann-audio` zimebaki; autoplay haitegemewi (controls tho user Play; studio ina Test Audio).
- **Firebase Rules + Cloud Functions** kubaki authoritative; announcements admin-only write; `creatives` immutable versions rule haikuguswa.

## D. NEW CAPABILITIES ADDED

1. **Canonical Creative State kamili**: `category` (nini kinachotangazwa), `campaignName`, `campaignId`, `offer`, `paletteId`, `priority`, `startAt`/`endAt`, `displayDurationSeconds`, `creativeId` link — fomu rahisi, studio, save-DB, na publish-pipeline zote zimeunganishwa.
2. **mediaDuration ≠ displayDurationSeconds**: `duration`/`videoMeta` hubaki = media (≤30s rule haikubadilika); `displayDurationSeconds` 5–59s ni muda wa placement/rotation. Video ya 10s haishurutishwi 59s.
3. **Palette Token System**: palettes 8 za legacy → **22 tokens × 8** (`background…glow`), inasomwa na fomu, renderer ya Home (CSS vars `--ad-cta-bg`, `--ad-glow`, …) na studio (`paletteId` huhifadhiwa na kupakiwa tena; published inatumia tokens hizo).
4. **Save/Reopen data-loss FIX**: badge/CTA/text animations, media fit/focal/brightness/contrast/autoplay/loop/aspect, animation object — yote yaliyokuwa yakipotea sasa yanadumu (tests: 33 fields).
5. **Badges**: + Stamp (circle) na Outline; + size (sm/md/lg), position (4 corners), opacity, icon (6). Quick badges 7 za legacy imehifadhiwa.
6. **CTA**: presets 16 (Download, Install, Apply Now, Book Appointment, Register, Visit Website, Buy Now…), styles 8 (Solid, Gradient, Pill, Outline, Border, Glass, Glow, Shine), icons 9 (canonical map). Destination validation kabla ya publish imehifadhiwa na kupanuliwa studio-side (`forPublish`).
7. **Editor Structure**: fomu rahisi imepangwa BASIC / DESIGN / MOTION / MEDIA / CTA / SCHEDULE bila kupotea urahisi; "Advanced Design (Optional)" sasa ni *entry point* ya studio hiyohiyo — hubeba badge, logo, palette, ratiba, priority, category, campaign, display duration.
8. **Creator Studio**: tab ya Content ina "Advertisement / Campaign" (category, campaign, schedule, priority, display duration); "SokoHai Design Palettes" za jina zina-apply tokens mbili mbili kwa layers + `paletteId`.
9. **Studio publish mapping** (server): headline/palette/badge/logo/video/audio/offer/category/campaign/schedule/display duration/animation inakopiwa kwenye announcement — fallback salama kwa creatives za zamani.
10. **Latent production bug FIX**: `95-creative-studio.js` ilikuwa na `}` ya ziada (mwishoni mwa `renderProperties`) — module yote haikuparse → Creative Studio + bridge haingefanya kazi live. Imerekebishwa na kupimwa (`node --check` + ESM import).

## E. DUPLICATE / LEGACY SYSTEMS DISCOVERED (ripoti tu — HAKUNA KUFUTA)

1. **`assets/`** — mirror ya karibu repo nzima (js/css/md) yenye diffs dhidi ya canonical `/js` (imethibitishwa: `06-announcement.js`, `16-pos-admin-jobs.js`). `index.html` haitumii. → kufuta au kusawazisha ni uamuzi wako.
2. **`fonts/js`, `fonts/css`, `fonts/html`** — stale app duplicate ndani ya `fonts/`. Huu ndiyo msingi wa test moja iliyoshindwa tangu zamani. **Mapendekezo: ifutwe/kuhifadhiwa nje ya deploy tree — itasawazisha `test_chat_authority_contract`.**
3. `_originals/app.module.js`, `sokohai-fixes-v2.patch` — legacy artifacts.
4. `html/21-scripts.html` ni build source (si duplicate); `index.html` **ni generated** — mabadiliko ya HTML yafanywe kwenye fragments kisha `npm run build:html`.
5. Hakuna Advertisement Manager/Creative Studio/bottom-nav ya pili — imethibitishwa kwa tests.

## F. TESTS PERFORMED (vitendo vya uthibitishaji)

1. `tools/test_creator_studio_upgrade.mjs` (MPYA, 7 vikwazo +60 legacy +10 viumba vipya): canonical state+clamps, media-vs-display duration, 22×8 tokens + legacy base values, renderer contract (stamp/outline/size/position/opacity/icon/glow style/palette vars/legacy defaults), form contract (kila control la legacy limehifadhiwa), save persistence (33 fields), integration (load order, functions mapping, unique form/renderer), security guards. **PASSED.**
2. `node tools/test_creative_system.mjs` → ALL PASS; `test_home_ads_product_cards_contract.mjs` → 45/45; `verify_nav_chain` → 18/18; `test_functions_resilience` → 26/26.
3. `npm test` nzima → **1172 checks ✅**, kushindwa 1 pekee (pre-existing fonts/** — imehibitishwa kwenye HEAD pia).
4. `node --check` + ESM parse kwa faili zote zilizoguswa; `tools/build_html.py build` + `check` → byte-exact.
5. Checklist 19-point: (1–19) imethibitishwa — manager/form/preview/badges/CTA/schedule/priority/published render/video/audio/static-animation/palette immediacy/save-reload/edit-reopen/advanced-bridge/no-duplicates/no-nav-change/no-home-breaks — kila kimoja kimekwako kwenye tests au contract checks zilizoelezwa.

## G. REMAINING LIMITATIONS

1. **`functions/creative.js` inahitaji `firebase deploy --only functions`** — mapping mpya za announcement hazita-onekana live mpaka deploy (client yenyewe inaendelea kufanya kazi kama awali).
2. Badge properties mpya (size/position/opacity/icon/stamp/outline) zinaonekana kwenye **post-card renderer**; studio canvas (SVG) kwa sasa huonesha badge kama text-layer ya kawaida (badge style ya kina ni maendeleo yanayofuata).
3. Waveform ya audio, trim ya video/audio UI ya kina, na SVG-shape editor ya kina — imebaki kama "prepared architecture" (fields/models tayari, UI ikiongezwa hatua ijayo).
4. `displayDurationSeconds`: rotation ya Home inaitumia mara moja kwa ads za fomu; ads zilizotoka studio zitapata thamani baada ya deploy ya functions.
5. Palettes hugusa rangi kuu za card; token 22 zimeingizwa kama CSS vars tayari kwa matumizi ya kina ya baadaye (surface-alt/muted zimeshaanza kugusa actions/metrics).
6. Moderation flow ya baadaye (Submit → Review → Schedule) iko seeded tu (status + rules), haijatekelezwa UI yake — kwa makusudi: platform control hubaki admin-only.

## H. EXACT NEXT RECOMMENDED DEVELOPMENT STEP

**"Deploy + E2E ya pipeline kamili"** — hatua moja inayofuata inayopendekezwa:
1. `firebase deploy --only functions,firestore:rules` (rules hazijabadilika — deploy ya functions pekee inatosha) kisha upload static assets (Netlify/Firebase Hosting) na **Hard Refresh** kupita service worker (`sokohai-sw.js` ina cache-bust v3).
2. E2E ya mkono live: Create Advertisement → chagua palette Gold → badge Stamp → CTA "Buy Now" → Publish → verify Home post ina tokens/animation → Edit-reopen → hakika kila thamani imedumu → Advanced Design → hakikisha studio inafunguka (latent bug fix) na mabadiliko yanarudi kwenye fomu.
3. Baada ya ridhaa yako: usafishaji wa `fonts/js|css|html` + tangazo la uamuzi kuhusu `assets/` mirror (ndiwo hatua pekee ili kubaki kabla ya "Creator self-service" moderation flow).
