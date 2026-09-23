# SOKOHAI CREATOR STUDIO — MEDIA + FIRST-LEVEL DESIGNING · BEFORE → AFTER MAP (2026-09-24)

Audit kabla ya kubadilisha: `95-creative-studio.js`, `creative/creative-model.js`,
`creative/creative-svg-renderer.js`, `creative/ad-palettes.js`, `16-pos-admin-jobs.js`
(Announcement Form + Admin Media Library), `js/11-uploads.js` (uploader MMOJA),
`js/06-announcement.js` (published renderer + `skhAdvertisementCardHtml`),
`css/39-creative-studio.css`, `firestore.rules` (adminMedia = admin only).

## 1. TAB STRUCTURE

BEFORE (12 tabs, media/design zimetawanyika, basic design imefichwa Advanced):
`presets · content · media · audio · animation · timeline · templates · style · effects · cutout · uploads · advanced`

AFTER (7 tabs kama ilivyoagizwa):
`BASIC · DESIGN · MOTION · MEDIA · CTA · SCHEDULE · ADVANCED`

## 2. CONTROL MIGRATION (BEFORE → AFTER)

| BEFORE (mahali) | Control | AFTER |
|---|---|---|
| presets | Ad-type presets (static/motion/short_video/audio-visual/video+audio/full-mix), format switch | BASIC |
| content | Headline / Body / Price inputs | BASIC |
| content | Image upload (jpeg/png/webp TU) + Image URL | DESIGN → **+ Add Media** (aina zote) |
| content | CTA text + destination URL | CTA |
| content | Category, campaign, start/end, priority, display duration | SCHEDULE |
| media | Fit mode / Focal point / Frame shape / Flip / Filters | DESIGN (Media design) |
| media | Media source URL | DESIGN (Replace media) |
| media | Video playback (autoplay/muted/loop/controls), poster, duration, trim Start–End | MEDIA |
| audio | Audio upload | DESIGN → **+ Add Media** |
| audio | Track volume/fade/trim + multi-track mixing + test playback | MEDIA |
| animation | Entrance/Emphasis/Exit/Mode/Timing | MOTION |
| timeline | Per-layer start/end, total duration (deep) | ADVANCED (sub-view) |
| templates | Templates + Auto Design variations | DESIGN |
| style | Palettes 70 / quick colors / gradients / headline font | DESIGN |
| effects | Frame shapes + patterns | DESIGN |
| cutout | Auto Background Removal + Restore | DESIGN |
| cutout | Manual Brush Eraser | ADVANCED (masking ya kina) |
| uploads | Device upload + HTTPS URL | imeunganishwa kwenye **+ Add Media** (pipeline ile ile) |
| advanced | → text / elements / background / brand | **basic tools sasa ziko DESIGN** |
| advanced | Layers & Grouping, Smart Design Improver | ADVANCED (imebaki) |

## 3. NEW IN DESIGN (first-level designing)

- **+ Add Media** flow moja: Upload from device · Select from Media Library · HTTPS URL.
- Crop: Original / 1:1 / 4:5 / 16:9 / 9:16 / 4:3 / 3:4 / **Custom** — inatumia crop engine
  ILIYOPO kwenye renderer (`style.cropX/cropY/zoom` + fit + clipPath). Hakuna engine ya pili.
- Size/Position: Fit canvas / Fill / Contain, Center H/V (`alignLayers` iliyopo), rotate, opacity.
- Appearance: radius, border, overlay, shadow, filters (brightness/contrast/saturation/warmth/blur).
- Layers list: select · forward/backward · duplicate · lock · delete (basic).
- Text (add + font/size/weight/align/color/spacing), Logo (add/resize/position/opacity),
  Shapes (rectangle/circle/line/arrow/badge + fill/border), Templates, Cutout.

## 4. MEDIA TYPES & VALIDATION

Detection kwa MIME + extension: image (jpeg/png/webp/**gif**/**svg**) / video / audio.
Validation limits ZINAZOTUMIKA TENA kutoka form: image 8MB · logo 4MB · video 80MB · audio 20MB.
30s video rule (`validateCreative`) HAIJAGUSWA.

## 5. REUSED SYSTEMS (hakuna duplicates)

- Uploader: `window.skhUploadFromFile` pekee (js/11-uploads.js).
- Media Library: `adminMedia` collection + `skhOpenAdminMediaLibrary/skhSelectAdminMedia`
  (form) — studio inapokea tu kupitia target mpya `'studio'`; upload kutoka studio inaandika
  `adminMedia` reference (admin tu kwa rules; non-admin inaruka kimya kimya).
- Renderer: `renderCreativeSvg` (editor + preview modes) na `skhAdvertisementCardHtml`
  (Feed/Card preview). Hakuna renderer mpya.
- Crop/transform: model fields zilizopo (`crop`, `style.cropX/cropY/zoom`, `fit`, `focalPoint`,
  `rotation`, `opacity`) — hakuna transform engine ya pili.
- Video preview: editor-only `<video>` overlay juu ya canvas (SVG ya published renderer haijabadilika).

## 6. ADVANCED CLEANUP

Advanced sasa: Deep Timeline · Layers & Grouping (deep) · Advanced Masking (manual eraser) ·
Smart Design Improver · toolbar ya Export/Resize/Duplicate/Auto Design.
Basic upload/crop/resize/position/text/logo/shape/preview HAZIPO tena humo.

## 7. PRESERVATION

`syncBackToLegacyForm` (studio → announcement form), `skhOpenAdvancedFromLegacy`,
publish chain (`creativePublish` Cloud Function), save/reopen (localStorage + `creatives`
collection via `normalizeCreative` — crop/videoMeta/audioMeta/style zote hupita round-trip),
na Home renderer (`js/06-announcement.js`) — HAVIJABADILISHWA.
