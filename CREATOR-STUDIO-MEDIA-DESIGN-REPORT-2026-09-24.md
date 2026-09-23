# SOKOHAI CREATOR STUDIO — MEDIA + FIRST-LEVEL DESIGNING · RIPOTI YA MWISHO (2026-09-24)

**Kanuni iliyofuatwa:** Studio ile ile, model ile ile, renderer ile ile, uploader ile ile, library ile ile.
Media na basic designing sasa ni **FIRST DESIGNING EXPERIENCE** (tab ya DESIGN), si Advanced.

---

## 1. FILES AUDITED (zilizokaguliwa kabla ya kubadilisha)

1. `js/app/95-creative-studio.js` — Creator Studio (tabs 12 za zamani, media upload zilizotawanyika, advanced gateway).
2. `js/app/creative/creative-model.js` — canonical creative state; iligundulika kuwa tayari ina `crop{x,y,width,height,zoom}`, `videoMeta` (trim), `audioMeta`, `style.cropX/cropY/zoom/fit/overlay/filter` — hizi NDIZO zilizotumika, hakuna mpya.
3. `js/app/creative/creative-svg-renderer.js` — canonical renderer; tayari inatumia `style.cropX/cropY/zoom`, fit/focal, frame shapes, filters, overlay, border, video (poster + play badge).
4. `js/app/creative/ad-palettes.js` — palettes 70 + `SKH_CTA_PRESETS` (16) + `SKH_CTA_ICONS` + categories.
5. `js/app/16-pos-admin-jobs.js` — Announcement Form + **Admin Media Library** (`adminMedia` collection, `skhOpenAdminMediaLibrary/skhSelectAdminMedia/skhAdminAdUpload` yenye size limits).
6. `js/11-uploads.js` — uploader MMOJA (`skhUploadFromFile` + compression).
7. `js/06-announcement.js` — published renderer + `skhAdvertisementCardHtml`.
8. `css/39-creative-studio.css` — studio styles (responsive bottom-sheet tayari ipo).
9. `firestore.rules` — `adminMedia` ni admin-only (read/write); `creatives` rules hazijaguswa.

BEFORE → AFTER map kamili: `CREATOR-STUDIO-MEDIA-DESIGN-MAP-2026-09-24.md`.

## 2. FILES CHANGED

| Faili | Mabadiliko |
|---|---|
| `js/app/95-creative-studio.js` | Tabs 12 → **7** (BASIC·DESIGN·MOTION·MEDIA·CTA·SCHEDULE·ADVANCED); DESIGN mpya yenye Add Media + crop/size/position/appearance/layers/text/logo/shapes/templates/background; MEDIA tab (playback/trim/mix, bila uploader); CTA tab (presets + style); SCHEDULE tab; Advanced iliosafishwa; unified `addMediaFile` pipeline + type detection + size validation; crop aspect + pan/zoom; fit-to-canvas; video overlay preview; preview modes (card/mobile/desktop/fullscreen); `duplicate/delete-layer` zilizokuwa dead zimefanyika kazi; `uploadMedia/uploadAudio` sasa ni delegates za pipeline moja. |
| `js/app/16-pos-admin-jobs.js` | Laini 1 tu: `skhSelectAdminMedia` inapokea target `'studio'` → existing Media Library inaweza kutuma media kwenye studio. |
| `css/39-creative-studio.css` | Appended: `.cs-addmedia`, `.cs-crop-grid`, `.cs-cta-presets`, `.cs-layer-inline`, `.cs-video-overlay`, `#csCanvas{position:relative}`, preview card/full styles. (Appenditive — hakuna kuandika upya.) |
| `tools/test_creator_studio_upgrade.mjs` | Section 8 mpya (contract ya update hii). |
| `tools/test_creative_system.mjs` | Token `mediaControls` → `designControls`+`mediaTabControls` (jina limebadilika kwa mpango; contract imehifadhiwa). |
| `tools/test_studio_media_design.mjs` | **Mpya** — functional jsdom test inayowasha studio halisi. |

## 3. EXISTING SYSTEMS REUSED (hakuna duplicate)

- **Uploader**: `window.skhUploadFromFile` pekee (Cloudinary). Studio haina `api.cloudinary.com` yake — imethibitishwa na test.
- **Media Library**: `adminMedia` collection + `skhOpenAdminMediaLibrary` modal iliyopo — studio ni *target mpya* tu (`'studio'`); upload kutoka studio inaandika `adminMedia` reference (admin tu kwa rules; non-admin inaruka kimya kimya). Hakuna library ya pili.
- **Renderer**: `renderCreativeSvg` (editor, preview modes) + `skhAdvertisementCardHtml` (Feed/Card preview). Hakuna renderer mpya.
- **Crop/transform engine**: fields za model zilizopo (`style.cropX/cropY/zoom`, `fit`, `focalPoint`, `rotation`, `opacity`, `alignLayers`). Hakuna crop engine ya pili.
- **Validation**: 30s video rule (`validateCreative`) na size limits (8/4/80/20 MB) za form — zimetumika tena bila kubadilika.
- **Persistence**: `syncBackToLegacyForm`, `skhOpenAdvancedFromLegacy`, `creativePublish` Cloud Function, localStorage drafts + `creatives` collection — havijaguswa.

## 4. CONTROLS MOVED: ADVANCED → DESIGN

| Ilikuwa wapi | Sasa |
|---|---|
| Advanced → Typography sub-tab | DESIGN → Text (add + font pairings; font/size/weight/align/color kwenye Properties) |
| Advanced → Shapes & Icons sub-tab | DESIGN → Shapes & Icons |
| Advanced → Background/Gradients/Patterns sub-tab | DESIGN → Templates & Background |
| Advanced → Cutout (auto) | DESIGN → Cutout / Remove BG + Restore (image layer) |
| Advanced → Media upload (content/uploads tabs) | DESIGN → **+ Add Media** |
| Advanced → basic filters/frames | DESIGN → Appearance + Frame Shape |
| Zimebaki ADVANCED pekee: Deep Timeline, Layers & Grouping (deep), Advanced Masking (manual eraser), Smart Design Improver, Brand Kit, toolbar Export/Resize/Duplicate/Auto Design. | |

## 5. NEW MEDIA CAPABILITIES

1. **+ Add Media** (DESIGN): Upload from device (image/video/GIF/SVG/audio — `accept="image/*,video/*,audio/*"`), Select from Media Library, HTTPS URL. Media huonekana **papo hapo** kwenye canvas.
2. **Auto type detection** kwa MIME + extension; validation kwa aina (image 8MB, logo 4MB, video 80MB, audio 20MB).
3. **Crop**: Original/1:1/4:5/16:9/9:16/4:3/3:4 + **Custom**, pan X/Y + zoom (crop-in).
4. **Size/Position**: Fit canvas / Fill / Contain, Center H/V, align left/right/top, rotate, opacity, drag-resize kwenye canvas (engine iliyopo).
5. **Appearance**: border radius/width/color, overlay color+strength, shadow, filters (brightness/contrast/saturation/warmth/blur), frame shapes, flip.
6. **Layers**: inline list na select/forward/backward/lock/duplicate (+ delete kwenye Properties) — basic layer control sasa DESIGN.
7. **Logo**: upload/URL, layer ya `logo` (fit contain), resize/position/opacity.
8. **Video live preview overlay** kwenye canvas (editor-only).
9. **Preview modes**: Feed/Card (Home renderer halisi), Mobile, Desktop, **Fullscreen**.

## 6. PREVIEW ARCHITECTURE

Preview zote zinatumia canonical renderer:
- Canvas ya editor: `renderCreativeSvg(state,{guides,selectedId})` — kila `commit()` hurender papo hapo (mtumiaji hahitaji ku-save kuona mabadiliko).
- Video: editor-only `<video>` overlay inayofuata `videoMeta` (autoplay/muted/loop) na coordinates za layer; published renderer haijaguswa.
- Preview button: `skhAdvertisementCardHtml(creativeAsAnnouncement(state))` — ad object hutengenezwa kutoka canonical state (headline/body/image/video/audio/cta/badge/colors) → **Home card halisi**; + Mobile/Desktop SVG + Fullscreen.

## 7. CROP / RESIZE ARCHITECTURE

- **Crop**: `applyCropAspect(ratio)` hubadili frame ya layer kuwa ratio (center-preserving) + `fit:'cover'`; pan/zoom hutumia `style.cropX/cropY/zoom` ambazo renderer tayari inazila (`<image x=cropX y=cropY width=w*zoom ... clip-path>`). `cropAspect` huhifadhiwa kwenye layer kwa ajili ya reopen. Custom = free resize kwenye canvas.
- **Resize/Move**: pointer-drag engine iliyopo (`pointerStart/Move/End` na snap) + Properties X/Y/W/H. Hakuna engine ya pili.

## 8. VIDEO HANDLING

- Upload → video layer (`type:'video'`, `videoUrl`, `videoMeta` yenye duration kutoka Cloudinary metadata; `trimEnd` hukatwa 30 kama duration>30).
- **MEDIA tab**: duration display + 30s status, Play/Pause preview, Mute/Unmute, poster URL, **trim Start ─ End**, autoplay/muted/loop/controls.
- Media duration ≠ display duration (SCHEDULE) — concepts mbili, zimehifadhiwa.
- 30s validation rule ya `validateCreative` HAIJABADILISHWA.

## 9. SAVE / REOPEN VERIFICATION

- Functional test: media imeongezwa → crop 1:1 → Save draft → localStorage draft ina `cropAspect:'1:1'`, `width==height`, src sahihi; duplicate layer inaongezeka.
- Round-trip test (section 8l): `normalizeCreative` huhifadhi `style.cropX/cropY/zoom`, `rotation`, `opacity`, `fit`, `zIndex` (layer order), `videoMeta.trimStart/trimEnd`, `posterUrl`, `audioMeta.volume` — **media, crop, position, size, opacity, layer order, text, CTA, animation na campaign data zote hukamilika baada ya reopen**.
- Save chain: `commit()` → `scheduleSave()` → localStorage + `creatives` collection (signed-in) → `syncBackToLegacyForm()` → form preview. Haijaguswa.

## 10. TESTS RUN

`test_creator_studio_upgrade.mjs` (sections 8), `test_studio_media_design.mjs` (functional jsdom — mpya), `test_creative_system.mjs`, `test_home_ads_product_cards_contract.mjs`, `test_routing.mjs`, `test_route_matcher.mjs`, `test_functions_resilience.mjs`, `verify_nav_chain.mjs`, `test_chat_e2e_journey.mjs`, `test_showcase.mjs`, `test_card_discovery.mjs`, `python3 tools/build_html.py build+check`.

## 11. TESTS PASSED

| Suite | Matokeo |
|---|---|
| test_creator_studio_upgrade (sections 1–8) | **8/8 OK** (70 palettes · legacy locked · real contrast) |
| **test_studio_media_design (functional)** | **ALL PASS** (tabs · Add Media · crop · persistence · video overlay · MEDIA tab · Advanced cleanup · CTA/SCHEDULE · previews · library bridge) |
| test_creative_system | ALL PASS |
| home_ads_product_cards_contract | **45/0** |
| routing | **69/0** |
| route_matcher | **30/0** |
| functions_resilience | **26/0** |
| verify_nav_chain | **18/0** |
| chat_e2e_journey | **57/0** |
| showcase | **34/0** |
| card_discovery | **80/0** |
| build_html check | **index.html 100% byte-exact** |

Jumla: **suites 12 zimepita, assertions 360+**.

## 12. TESTS FAILED

Hakuna failure mpya.

## 13. PRE-EXISTING FAILURE

`test_chat_authority_contract.mjs` bado inashinda kwa sababu ile ile ya zamani: **stale duplicate app files ndani ya `fonts/`** (sio ya kazi hii; haijaguswa kwa mujibu wa sheria za kazi).

## 14. REMAINING LIMITATIONS

1. **SVG editor preview huonyesha frame ya kwanza ya GIF** (GIF hu-animate kwenye published `<img>` ya Home — tabia ya SVG `<image>`, si udhibiti wa mfumo).
2. Video overlay ya editor ni `pointer-events:none` kwa kukusudia (ili drag-move isivunjike) — Play/Mute hudhibitiwa kwa buttons za quick-bar/MEDIA tab.
3. Media Library ni admin-only (Firestore rules) — non-admin anaona Upload + URL tu; library button itaomba admin authorization (tabia iliyopo ya form).
4. Advanced features za baadaye (keyframes, deep SVG editing, waveform) bado hazipo — zimeorodheshwa kwenye Advanced tab note; hakuna kitu kilichodai kuwa kipo.
5. `fonts/` stale duplicates (pre-existing) — inahitaji uamuzi wako kusafishwa.
6. Kazi **haija-commit/push/deploy** — ngoja maelekezo yako.

---

**PRINCIPLE IMEFIKIWA:** Upload → Preview → Design → Preview → Save/Publish, yote kwenye first-level experience. Advanced ni kwa anayehitaji kina zaidi, si kwa functionality ya msingi.

*Nimesimama — ngoja maelekezo yako.*
