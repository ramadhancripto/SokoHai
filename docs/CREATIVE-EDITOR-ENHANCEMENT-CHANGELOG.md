# SokoHai Creative Editor — Non-Destructive Enhancement Changelog

## Overview
This changelog documents the complete, production-ready, non-destructive upgrade of the SokoHai Creative Studio / Creative Editor. All existing capabilities (templates, live SVG rendering, dynamic entity data hydration, Cloudinary uploads, draft & cloud Firestore saving, admin moderation, and legacy advertisement integration) have been strictly preserved, while professional design capabilities have been seamlessly integrated.

---

## 1. Dual Mode System (Simple Mode & Advanced Mode)
- **Simple Mode (Default)**:
  - Streamlined 3-step workflow: `1. Weka maneno yako` (Content input), `2. Weka picha` (Image upload / URL), and `3. Chagua muonekano` (Style, swatches, templates, harmonies).
  - Clean UI without technical clutter, ideal for non-designer sellers.
- **Advanced Mode**:
  - Activated via `More design tools` button or object properties.
  - Exposes in-depth controls: Typography font categories, font pairings, element layers, custom HEX/RGB/HSL, rotation, letter-spacing, line-height, stroke, glow, shadow, frame shapes, and alignment grids.

---

## 2. Smart Quick Action Bar
- Floating, contextual action bar dynamically displayed when any canvas element is selected:
  - **Image Selected**: `🪄 Remove BG`, `🧽 Erase`, `✨ Frames & Effects`, `↔ Flip`, `↺ Restore`, `⚙️ Advanced`.
  - **Text Selected**: `Headline`, `🏷️ Price Pill`, `⭐ CTA Button`, `Bold`, `🎨 Colors`, `⚙️ Advanced`.
  - **Shape/Icon Selected**: `🎨 Fill Color`, `Duplicate`, `⚙️ Advanced`.

---

## 3. Color System & Color Harmonies
- **Quick Colors**: 11 curated vibrant base colors for single-tap styling.
- **SokoHai Brand Palette**: Primary `#0E7A5F`, Secondary `#167A91`, Slate `#102A43`, Gold `#F4C542`, Warm Coral `#E27D60`.
- **Pure Color Harmony Generator (`generatePalette`)**:
  - Generates cohesive 4-color palettes on the fly using color wheel mathematics (`Monochromatic`, `Analogous`, `Complementary`, `Triadic`, `Luxury`, `Warm`).
- **Gradient Presets**: 11 gradient combinations (`Sunrise`, `Ocean`, `Forest`, `Luxury`, `Emerald`, `Sunset`, `Warm`, `Cool`, `Soft`, `Dark`, `Bright`) with adjustable angle (0–360°).
- **Recent Colors**: Tracks last 8 colors used in the active session.

---

## 4. Backgrounds, Textures & Patterns
- **SVG Pattern Overlays**: Dot matrix (`pat_dots`), Grid lines (`pat_grid`), Striped horizontal lines (`pat_lines`), Diagonal hatching (`pat_diagonal`), Gentle waves (`pat_waves`), Geometric polygons (`pat_geometric`), Concentric circles (`pat_circles`), and Squares (`pat_squares`).
- **Texture Overlays**: High-definition paper, grain, canvas, concrete, noise, vintage, and fabric simulation.

---

## 5. Client-Side Image Cutout, Eraser & Frames
- **Pure Client-Side Background Removal (`removeBackgroundClient`)**:
  - Segmenting corner and boundary colors with adaptive thresholding directly on an HTML5 `<canvas>`, generating clean PNG transparent cutouts without server dependencies.
- **Interactive Manual Brush Eraser**:
  - Modal canvas supporting interactive brush strokes, adjustable brush diameter slider, transparent grid background, and non-destructive "Restore Original" option.
- **Image Frame Shapes**:
  - `rounded` (smooth card corners), `circle` (circular clip-path), `square` (crisp modern rectangle), `polaroid` (classic white-bordered frame).
- **Non-Destructive Adjustments**:
  - Brightness, Contrast, Saturation, Warmth (Hue Rotate), and Soft Blur filters rendered via SVG `<filter>` definitions.

---

## 6. Typography & 1-Tap Text Style Presets
- **Font Registry**: Verified Google Fonts loaded across 5 curated categories:
  - *Modern*: `Inter`, `Roboto`
  - *Bold Commerce*: `Montserrat`, `Oswald`
  - *Luxury & Editorial*: `Playfair Display`
  - *Friendly & Display*: `Poppins`, `Nunito`
- **1-Tap Text Presets (`TEXT_STYLE_PRESETS`)**:
  - `Headline`, `Subheadline`, `Body`, `Price`, `Discount`, `CTA`, `Badge`, `Caption`, `Location`, `Contact`.
- **Font Pairings**:
  - `Modern Impact` (Montserrat + Inter), `Bold Commerce` (Poppins + Inter), `Luxury Brand` (Playfair Display + Inter), `Urban Punch` (Oswald + Roboto), `Friendly Market` (Nunito + Inter).

---

## 7. Smart Alignment & Design Improver
- **Alignment Controls**:
  - Align Left, Center, Right, Top, Middle, Bottom, and Distribute across the creative bounds.
- **Smart Design Improver (`improveDesign`)**:
  - 1-tap automated suggestions: `Optimize Contrast & Readability`, `Position High-Impact CTA`, `Center Align All Elements`, and `Scale Headline & Price`.

---

## 8. Verification & Integration Stability
- **Test Suite**: 34/34 test suites passed with 0 failures, including `tools/test_creative_system.mjs`.
- **Backward Compatibility**:
  - `window.skhAdvertiseOpenEntity` smoothly opens creative studio preloaded with active Product/Service data.
  - `window.skhOpenAdvancedFromLegacy` converts legacy announcement forms into editable studio creatives.
  - `window.skhOpenCompanyAdsSoon` launches fresh canvas.
- **Build Status**: Single-file shell `index.html` compiled cleanly via `python3 tools/build_html.py build`.
