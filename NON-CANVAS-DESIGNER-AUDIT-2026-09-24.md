# NON-CANVAS ADVERTISEMENT DESIGNER MVP — AUDIT (2026-09-24)

## CANVAS → existing implementation
Repo search (`js/`, `html/`, `css/`) shows **no separate Canvas Designer module**.
The only `<canvas>` usages are image-processing utilities:
- `js/11-uploads.js` — client-side downscale before upload
- `js/app/95-creative-studio.js` (`#csEraserCanvas`) — manual mask eraser
- `js/app/62-missing-features.js`, `js/app/17-hub.js`, `js/23-smart-search.js` — dominant-color/analytics helpers
Per the spec these are NOT touched. The Non-Canvas pipeline (SVG renderer +
HTML5 media overlays) is the upgrade target and stays separate.

## NON-CANVAS → existing implementation
| System | File(s) | State |
|---|---|---|
| Editor shell, tabs (Basic/Design/Motion/Media/CTA/Schedule/Advanced), layers, drag/resize, undo/redo, drafts | `js/app/95-creative-studio.js` (2074 ln) | ✅ exists |
| Creative model (schema v2, formats, fonts, gradients, layers, video/audio/animation meta) | `js/app/creative/creative-model.js` | ✅ exists, **30s video cap** |
| SVG renderer (preview + PNG/JPG export) | `js/app/creative/creative-svg-renderer.js` | ✅ exists (video/audio = poster placeholders) |
| Palettes (70) + tokens | `js/app/creative/ad-palettes.js` | ✅ reused |
| Undo/redo | `js/app/creative/creative-history.js` | ✅ reused |
| Media uploader | `js/11-uploads.js` (`skhUploadFromFile`) | ✅ reused via `addMediaFile` |
| Media library | `skhOpenAdminMediaLibrary('studio')` → `skhStudioApplyLibraryMedia` | ✅ reused |
| CTA presets | `window.SKH_CTA_PRESETS` | ✅ reused in CTA tab |
| Published Home ad renderer (canonical) | `js/06-announcement.js` (`skhAdvertisementCardHtml`) | ✅ exists; reads animation/badge/palette/media fields |
| Legacy form ↔ studio sync | `syncBackToLegacyForm` + `skhOpenAdvancedFromLegacy` | ✅ exists |
| Persistence | localStorage drafts + Firestore `creatives` + announcements | ✅ exists |
| CSS | `css/39-creative-studio.css`, `css/38-home-ad-manager.css` | ✅ exists |

## NON-CANVAS → missing features (spec gaps)
1. **60-second video cap** — model/trim/validation hardcoded to 30s (spec §11/§21/§33 require 60s, trim editor, publish gate, original preserved).
2. **Slideshow / multi-image (Type E)** — no model state, no studio UI, no renderer support (spec §4, §5, §15, §16).
3. **Editor → published parity** — `creativeAsAnnouncement` only maps headline/text/price/CTA/badge/media URLs; text animation, palette, audio, trimmed video duration, CTA animation NOT carried to the Home card (spec §6, §22, §27).
4. **Text controls missing in properties UI** — italic/underline toggles, letter-spacing, line-height, opacity, shadow, background, 9-grid position presets, max lines, color preset swatches (spec §7, §8).
5. **Video editor MVP** — trim sliders capped at 30, no one-click “Trim to 60s”, preview playback ignores trim points (spec §11, §12).
6. **Audio transport** — only a standalone test button; no play/seek tied to studio transport, no start/end wiring into ad duration (spec §13).
7. **Timer** — overall duration clamps at 30; no Auto/Custom up to 60 (spec §21).
8. **Automatic composition display** — presets exist but no auto-detect indicator (spec §24).

## Decisions (integrate, never duplicate)
- 30s → **60s** via one `MAX_AD_MEDIA_SECONDS` constant; DISPLAY_DURATION_SECONDS (placement rotation) untouched.
- Slideshow = new `slideshow` field in the SAME creative model; rendered by extending the SAME canonical renderer (`06-announcement.js`) additively. No second renderer.
- Existing creatives normalize with safe defaults (`slideshow.enabled=false`, animation `none`) — backward compatible.
- Tests that encode the old 30s contract are updated to the new 60s contract with dated comments (never deleted).
