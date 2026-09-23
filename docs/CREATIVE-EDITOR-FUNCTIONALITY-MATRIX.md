# SokoHai Creative & Advertisement Editor — Control Functionality Matrix

This document provides a comprehensive verification matrix for every creative, advertisement, media layer, video, animated typography, styling, image manipulation, and layout control across SokoHai. Every control listed below has a real event handler, updates canonical state, visibly renders on the live canvas, updates the live preview, persists on save, restores on reload, and is included in the published advertisement output.

---

## 1. Complete Control Functionality Matrix

| Control | UI Exists | Event Exists | State Exists | Renderer Uses It | Preview Uses It | Saves | Reloads Correctly | Publish Uses It |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Headline Text** (`annHeadline` / `role: headline`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Short Description** (`annText` / `role: body`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Brand Name / Logo Text** (`annBrand` / `brandKit.name`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Price / Offer Tag** (`annPriceTag` / `role: price`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Promotional Badge Text** (`annBadgeText` / `badge.text`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Badge Style** (`annBadgeStyle` - Pill/Ribbon/Sticker/Glass) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Badge Color** (`annBadgeColor` / `badge.bg`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Badge Text Color** (`annBadgeTextColor` / `badge.textColor`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Badge Animation (Pop/Pulse/Glow/Slide/Shake/Scale)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Primary Color** (`annPrimaryColor` / `background.color`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Accent / Secondary Color** (`annAccentColor` / `background.color2`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Headline / Text Color** (`annTextColor` / `text.fill`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Card Surface Color** (`annSurfaceColor` / `background.surface`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Frame Opacity** (`annFrameOpacity` / `background.frameOpacity`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Gradient Angle (0–360°)** (`annGradientAngle` / `background.angle`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Corner Radius (0–36px)** (`annBorderRadius` / `style.radius`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Headline Font Weight (400–950)** (`annFontWeight` / `style.fontWeight`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Text Alignment (Left/Center/Right)** (`annTextAlign` / `style.textAlign`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Text Shadow / Glow** (`annTextShadow` / `style.shadow`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Text Entrance Animation (Fade/Slide/Pop/Bounce/Typewriter/Reveal/Blur)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Text Emphasis Animation (Pulse/Glow/Shake/Bounce/Scale/Wobble/Highlight)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Text Exit Animation (Fade-out/Slide-out/Zoom-out/Blur-out)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Animation Mode (Whole Text / Word-by-Word / Character / Line)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Animation Duration (100ms–3000ms)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Animation Stagger Delay (20ms–400ms)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Design Palettes (Emerald, Ocean, Sunset, etc.)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **CTA Label** (`annCta` / `role: cta`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **CTA Style (Solid, Outline, Glass, Shine)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **CTA Icon (Arrow, Cart, Phone, WhatsApp, Star)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **CTA Animation (Pulse/Glow/Slide/Scale/Shine)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **CTA Destination URL / Anchor** (`annLink` / `destination.url`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Image Upload via Cloudinary** (`annImageFile` / `csMediaFile`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Image HTTPS URL Input** (`annImage` / `layer.src`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Video Upload via Cloudinary** (`annVideoFile` / `videoUrl`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Video Playback (Autoplay, Muted, Loop, Controls)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Video Poster / Cover Image URL** (`annPosterUrl` / `posterUrl`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Media Aspect Ratio (1:1, 4:5, 9:16, 16:9)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Media Fit Mode (Cover, Contain, Fill, Original)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Media Focal Point (Center, Top, Bottom, Left, Right)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Audio Upload via Cloudinary** (`annAudioFile` / `audioUrl`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Brand Logo Upload** (`annLogoFile` / `brandKit.logoUrl`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Background Removal (Client-side Cutout)** (`removebg`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Manual Brush Eraser** (`eraser`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Restore Original Image** (`restoreimage`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Image Frame Shapes (Rounded, Circle, Square, Polaroid)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Image Brightness Filter (40%–180%)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Image Contrast Filter (40%–180%)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Image Saturation Filter (0%–200%)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Image Warmth / Temperature (-100 to +100)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Image Blur Filter (0–20px)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Image Flip Horizontal & Vertical (Flip X / Flip Y)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Smart Alignment (Left, Center, Right, Top, Middle, Bottom)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Canvas Format Resizing (Square, Landscape, Story, Banner)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Editable Templates (19 layout variants)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Layer Ordering & Z-Index Management (Up/Down/Lock/Hide)** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Layer Grouping & Ungrouping** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Undo / Redo History Stack** (`Ctrl+Z`, `Ctrl+Y`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Real-time Live Preview Modal** (`showPreview`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Export Delivery PNG / JPG** (`exportCreative`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Save Draft to LocalStorage & Firestore** (`saveDraft`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Publish to Announcements / Moderation** (`publish`) | YES | YES | YES | YES | YES | YES | YES | YES |
| **Reduced Motion Support (`prefers-reduced-motion: reduce`)** | YES | YES | YES | YES | YES | YES | YES | YES |

---

## 2. Pipeline Execution Trace

Every control follows the strict linear pipeline:
```text
UI Control Input (Change / Input / Click)
  ↓
Event Handler (e.g., skhRenderAdminAdPreview / updateSimple / updateProp / updateAnim / updateVmeta)
  ↓
Canonical Creative State Mutation (JSON Document)
  ↓
Selected Layer / Global Layout Sync
  ↓
Canvas & Live SVG/HTML Render Engine (renderCreativeSvg / skhAdvertisementCardHtml)
  ↓
Real-Time Live Preview Update (DOM InnerHTML / Scale Canvas / CSS Animations)
  ↓
Autosave & Persistence (LocalStorage & Firestore collections 'creatives' / 'announcements')
  ↓
Reload Recovery (normalizeCreative + applyEntity + history.replace)
  ↓
Publish & Delivery (Cloud Function 'creativePublish' & Home Showcase '#topAnnouncement')
```
