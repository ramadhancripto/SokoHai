# NON-CANVAS ADVERTISEMENT DESIGNER MVP — REPORT (2026-09-24)

> **Mission:** Make the Non-Canvas Designer a complete, professional, first-level
> Advertisement MVP (image / video / audio / slideshow / mixed-media) while
> preserving the existing Canvas-adjacent systems and every existing SokoHai
> system. Audit → integrate → implement → test → report. No duplicate renderer,
> model, media pipeline, or CTA system.

---

## 1. Audited files

| File | Role in audit |
|---|---|
| `js/app/95-creative-studio.js` (2 074 ln) | Non-Canvas editor shell: tabs, layers, drag/resize, undo/redo, drafts, publish |
| `js/app/creative/creative-model.js` | Canonical creative model (schema v2) — had **30s hard cap**, no slideshow |
| `js/app/creative/creative-svg-renderer.js` | Editor SVG renderer + PNG/JPG export |
| `js/app/creative/ad-palettes.js` | 70 palettes + tokens (reused, untouched semantics) |
| `js/app/creative/creative-history.js` | Undo/redo (reused) |
| `js/11-uploads.js` | Single canonical uploader `skhUploadFromFile` (reused) |
| `js/06-announcement.js` | **Canonical Home ad renderer** `skhAdvertisementCardHtml` |
| `js/app/16-pos-admin-jobs.js` | Advertisement form + live preview + save payload |
| `js/app/09-feed-announcements.js` | Announcement save whitelist → Firestore |
| `css/39-creative-studio.css`, `css/38-home-ad-manager.css` | Studio + published-card styles |
| `tools/test_creative_system.mjs`, `test_creator_studio_upgrade.mjs`, `test_studio_media_design.mjs` | Existing contracts (30s assertions identified) |

**Canvas vs Non-Canvas map (§2):**
```text
CANVAS            → no standalone Canvas Designer module exists in-repo; only
                    <canvas> image-PROCESSING utilities (11-uploads downscale,
                    eraser mask, dominant-color). LEFT UNTOUCHED.
NON-CANVAS        → 95-creative-studio.js + creative-model + svg-renderer
  missing (fixed) → 60s cap · slideshow · editor↔published parity · text
                    toolset · video trim editor · audio transport · timer
```

## 2. Modified files

**Production**
- `js/app/creative/creative-model.js` — `MAX_AD_MEDIA_SECONDS=60`, `slideshow` state + `normalizeSlideshow`, `slideshowTotal`, `SLIDESHOW_TRANSITIONS`, `detectComposition`/`COMPOSITION_LABELS`, `autoAdDuration`; validation: video >60s rejected, slideshow ≥2 slides + total ≤60 at publish; presets `maxDuration` 30→60 + new `slideshow` preset; `zoom-out` entrance added.
- `js/06-announcement.js` — **additive** slideshow media branch in the SAME `mediaHtml` (unique-id CSS keyframes from per-slide durations, fade/slide/zoom/crossfade/none, dots, "N picha · Xs" chip, `SLIDESHOW` micro-label); video/image branches now gated `!visual`; `let visual=''` hoisted.
- `js/app/95-creative-studio.js` — 60s caps (trim sliders, timeline, audio trim, duration clamp); `Trim to 60s` + `Edit manually`; trim-aware video preview (seek `trimStart`, wrap at `trimEnd`); `slideshowControls()` + `addSlidesFromInput` (multi-file 4+), `slideshowAction`, `updateSlideshowProp`; full text toolset in properties; 9-grid position presets; composition badge + Auto/Custom duration; `creativeAsAnnouncement` full-field mapping; `syncBackToLegacyForm` writes `annSlideshow`/`annMediaDuration`; **all 4 preview modes now use the canonical published card** (§22).
- `js/app/16-pos-admin-jobs.js` — hidden carry-through fields `#annSlideshow`/`#annMediaDuration` (restore on edit + pass in `skhAdFormData`).
- `js/app/09-feed-announcements.js` — save whitelist now persists `slideshow` (validated) + `mediaDurationSeconds` (≤60) + `videoControls`.
- `css/38-home-ad-manager.css` — `.skh-ann-slideshow` layout, dots, chip, `prefers-reduced-motion` (slide 1 only).
- `css/39-creative-studio.css` — `.cs-grid9`, `.cs-comp-badge`, `.cs-ss-list/.cs-ss-row`.
- `js/app/creative/creative-svg-renderer.js` — `style.maxLines` honored (default 16 unchanged).

**Tests (updated contracts — never deleted, dated comments)**
- `tools/test_creative_system.mjs` — `short_video.maxDuration` 30→**60**; 45s video now VALID; 75s rejected; trimmed-60s accepted; `slideshow` preset asserted.
- `tools/test_creator_studio_upgrade.mjs` — 45s allowed / 75s rejected; rule token now `MAX_AD_MEDIA_SECONDS` + `inazidi sekunde`.
- `tools/test_noncanvas_ad_designer.mjs` — **NEW** 33-check acceptance suite (§30/§32/§22/§27/§33).
- `package.json` — `test:noncanvas-mvp` script + chain appended.

## 3. Existing systems reused (§29 — nothing duplicated)

One uploader (`skhUploadFromFile`) · one Media Library (`skhOpenAdminMediaLibrary`) · one creative model (`creative-model.js`) · one editor SVG renderer · one **published** renderer (`skhAdvertisementCardHtml` — extended in place) · one CTA preset set (`SKH_CTA_PRESETS`) · one palette system (`skhPaletteTokens`) · one crop/filter stack · one persistence path (localStorage draft → Firestore `creatives` / announcements) · one form↔studio sync (`syncBackToLegacyForm`/`skhOpenAdvancedFromLegacy`).

## 4. New controls / features

- **§3 sections:** Media, Text, Layout (crop/fit/align/9-grid), Animation, Audio, CTA, Appearance, Timing, Layers, Preview — progressive disclosure across Basic/Design/Motion/Media/CTA/Schedule/Advanced tabs.
- **§7/§8 text:** heading/subtitle/body/offer/micro via text-style presets; font family/size/weight; **Italic + Underline**; color picker + **presets White/Black/Blue/Green/Gold + Custom**; opacity; alignment; **letter-spacing**; **line-height**; **text background**; **outline (stroke color/width)**; **text shadow (color/strength/blur)**; rotation; X/Y; **width slider**; **max lines**; 9-grid position presets; delay/duration on entrance.
- **§11/§12 video:** duration banner (original · 1:00 max · trim length), **[Trim to 60s] + [Edit manually]**, Start/End `[mm:ss]` sliders (0–60), autoplay/muted/loop/controls, poster URL; preview seeks into the trim window and wraps; original file preserved.
- **§13/§14 audio:** upload/library/URL, play/test, volume, fade in, trim 0–60, multi-track mix (mute original / original / music / voiceover).
- **§15/§16 slideshow:** multi-image upload (1/2/3/4+), URL slides, per-slide duration 1–30s, reorder ↑↓, remove, transitions **none/fade/slide/zoom/crossfade**, default duration, live total, enable at ≥2 slides.
- **§21 timer:** Auto (computed from media/slideshow/video-trim/audio) vs Custom, slider 1–60s; `durationAuto` state; display-duration (rotation 5–59s) kept SEPARATE and untouched.
- **§24/§25 composition:** auto-detected badge (`Static Image Ad`…`Slideshow Ad`) with manual presets always available (`image/video/audio/image_audio/video_audio/slideshow/full_mix`).
- **§19 layers:** select, reorder ↑↓, forward/backward, duplicate, delete, lock, hide, grouping (existing sheet).
- **§26 toolbar:** × Back, Undo/Redo, Preview, Save draft, Publish + Media/Text/Shape/Logo/Audio/Animation/Timing/Layers tools.

## 5. Text rendering fix (§6/§27 — the main ask)

```text
Input → State (creative layer) → SVG renderer (editor canvas)
      → creativeAsAnnouncement → skhAdvertisementCardHtml (Preview = Home = Saved = Published)
```
- `creativeAsAnnouncement` now maps: headline/text/price/CTA/badge (+badge color/animation), **slideshow**, **mediaDurationSeconds (trimmed)**, `textAnimation/textEmphasis/animationMode/animationDuration/Delay/Stagger`, `paletteId`, `ctaAnimation`, category, brand/logo, link, colors, font weight/align.
- Save path persists them (whitelist + hidden form fields), so reload + published ad keep everything.
- Verified by runtime tests: `OFa ya leo` + Color + Animation + Start/Duration appear in card HTML output.

## 6. Animation system

Existing engine kept (entrance/emphasis/exit, whole/word/character/line, duration/delay/stagger/easing + play-preview). Added `zoom-out` entrance (§9 list; `skh_anim_zoom_out` keyframes already existed). Animation = optional; `none` → text stays visible. Delay slider 0–5000ms enables staged entrances (0.0s image → 0.5s headline → …).

## 7. 60-second validation (§33 — hard rule)

- `MAX_AD_MEDIA_SECONDS = 60` is the single source: model clamp, validation, studio sliders/timeline/audio trim, save whitelist (`mediaDurationSeconds` min(60,…)).
- Video >60s effective → `VIDEO_DURATION` error → **publish blocked** with message telling the user to Trim; `[Trim to 60s]` fixes it without deleting the original (`videoMeta.duration` + `src` preserved; re-editable).
- Slideshow total >60 → `SLIDESHOW_DURATION` publish error.

## 8. Preview (§22/§23) & persistence (§30)

- Preview sheet: **Card, Mobile, Desktop, Fullscreen all render `skhAdvertisementCardHtml`** from the same state (published look); SVG design canvas shown as an extra reference. Transport: play/pause/restart/mute/timeline scrubber + video preview honors trim; audio `<audio controls>` in card.
- Persistence: create → edit → autosave (local 900ms + Firestore) → reload → preview → publish — slideshow, trim, animations, palette all round-trip (normalize keeps safe defaults for old creatives).

## 9. Tests (§30/§31) — 13/13 suites green, build byte-exact

| Suite | Result |
|---|---|
| `test_noncanvas_ad_designer` (NEW) | **33/33** |
| `test_creative_system` | PASS (30s→60s contract updated, dated) |
| `test_creator_studio_upgrade` | PASS (75s rejection contract updated) |
| `test_studio_media_design` | PASS |
| `test_home_ads_product_cards_contract` | 45/0 |
| `test_ad_card_visual` | 19/19 |
| `test_market_visual_contract` | 12/0 |
| `verify_nav_chain` | 18/0 |
| `test_showcase`, `test_routing`, `test_card_discovery`, `test_commerce_cards`, `test_chat_e2e_journey` | PASS |
| `tools/build_html.py check` | byte-exact OK |

Pre-existing, unrelated: `fonts/` stale-duplicate failure in `test_chat_authority_contract` (documented in earlier reports; not touched).

## 10. Remaining limitations (honest list)

1. **Published-card text cannot swap copy segments over wall-clock time** (e.g. headline 0–2s → offer 2–5s → CTA 5–10s as distinct texts): the canonical Home card supports entrance/emphasis animations with delay (staged ENTRANCES work), but has no per-segment content scheduler. Adding one would require extending `cardHtml` — deferred (would touch the shared card contract used by all published ads).
2. **Editor canvas stage** still draws layer composition (SVG); slideshow presentation plays in every Preview mode (canonical card), not on the working stage.
3. **Audio transport**: play/pause/trim/volume/mix work; the timeline scrubber does not seek the audio element frame-accurately (no waveform editor — was explicitly out of MVP scope in prior tasks).
4. **Video brightness/contrast filters** apply to poster/SVG and published `<video>` via announcement fields; the editor's live HTML overlay uses object-fit only (poster path is exact).
5. **Per-slide text binding** (text tied to a specific slide index) not modeled — slideshow text behaves as normal text layers over the sequence.
6. Drag-on-preview text move exists on the editor canvas (pointer drag); not inside the Preview sheet itself.

## 11. §32 FINAL ACCEPTANCE WALKTHROUGH (mapping)

Upload image ✓ → add second image (slides) ✓ → slideshow enable ✓ → headline ✓ → color (picker+presets) ✓ → font size ✓ → position (X/Y + 9-grid) ✓ → animation (entrance/delay/duration + replay) ✓ → offer ✓ → CTA (existing presets/style/animation) ✓ → upload audio ✓ → duration Auto/Custom ≤60 ✓ → preview (4 modes = published renderer) ✓ → edit timing (trim/slide durations/timeline) ✓ → preview again ✓ → save ✓ → reload ✓ → preview ✓ → publish (validates ≤60s) ✓ → **published ad matches preview** (same renderer, same state mapping).
