/*
 * SokoHai Advertisement Designer — canonical DESIGN ENGINE (2026-09-24).
 *
 * ONE engine for Auto Design, Design Views, Presets and Smart Recommendations.
 * It is deliberately pure (no DOM): it reads a flat "designer state" (the same
 * keys the Advertisement Designer form writes into the canonical Creative via
 * basic-ad-creative.js) and returns PATCHES of style keys. It never returns
 * content keys (headline, description, offer, badge text, CTA label, link,
 * media URLs), so Auto Design can never overwrite what the user wrote/uploaded.
 *
 * Colour tokens come from the ONE canonical palette system
 * (js/app/creative/ad-palettes.js → window.SKH_AD_PALETTES). A Design View is
 * palette tokens + a visual recipe (typography, spacing, radius, shadow, CTA,
 * badge, background, image treatment, composition). No second palette table.
 */
import { contrastRatio, TEXT_ROLE_SIZES } from './creative-model.js';

export const DESIGN_ENGINE_VERSION = 2;

/* ---------- canonical token vocabularies (shared with the renderer) ---------- */
export const FONT_KEYS = Object.freeze(['sans', 'serif', 'rounded', 'display']);
export const CARD_SHADOWS = Object.freeze(['none', 'soft', 'lifted', 'glow']);
export const LAYER_ELEMENTS = Object.freeze(['brand', 'badge', 'media', 'headline', 'description', 'offer', 'cta']);
export const ORDERABLE_ELEMENTS = Object.freeze(['media', 'headline', 'description', 'offer', 'cta']);
export const PLACEMENT_VARIANTS = Object.freeze(['home', 'discover', 'chat', 'groups', 'product', 'service', 'dashboard', 'compact']);

/* Keys Auto Design / views may write. Content keys are intentionally absent. */
export const STYLE_KEYS = Object.freeze([
  'paletteId', 'designViewId', 'presetId', 'format', 'backgroundMode', 'gradientAngle', 'primaryColor', 'accentColor',
  'surfaceColor', 'textColor', 'descriptionColor', 'offerColor', 'offerTextColor', 'badgeColor', 'badgeTextColor',
  'frameOpacity', 'borderRadius', 'cardShadow', 'fontFamily', 'fontWeight', 'fontSize', 'textAlign', 'headlineLetterSpacing',
  'headlineLineHeight', 'textShadow', 'descriptionSize', 'descriptionAlign', 'offerSize', 'offerAlign', 'badgeStyle',
  'badgePosition', 'badgeSize', 'badgeFontSize', 'ctaStyle', 'ctaIcon', 'ctaAnimation', 'badgeAnimation', 'textAnimation',
  'animationMode', 'animationDuration', 'mediaFit', 'focalX', 'focalY', 'overlayOpacity', 'brightness', 'contrast',
  'saturation', 'mediaPosition', 'slideshowTransition'
]);
export const CONTENT_KEYS = Object.freeze(['brandName', 'headline', 'description', 'offer', 'priceTag', 'badgeText', 'ctaLabel', 'cta', 'ctaCustom', 'link', 'imageUrl', 'image', 'videoUrl', 'audioUrl', 'logoUrl', 'backgroundImageUrl', 'slideshow']);

/* Which element (Layers lock) owns which style keys. Locked element → keys kept. */
export const ELEMENT_STYLE_KEYS = Object.freeze({
  headline: ['textColor', 'fontFamily', 'fontWeight', 'fontSize', 'textAlign', 'headlineLetterSpacing', 'headlineLineHeight', 'textShadow', 'textAnimation', 'animationMode', 'animationDuration'],
  description: ['descriptionColor', 'descriptionSize', 'descriptionAlign'],
  offer: ['offerColor', 'offerTextColor', 'offerSize', 'offerAlign'],
  badge: ['badgeColor', 'badgeTextColor', 'badgeStyle', 'badgePosition', 'badgeSize', 'badgeFontSize', 'badgeAnimation'],
  cta: ['ctaStyle', 'ctaIcon', 'ctaAnimation'],
  media: ['mediaFit', 'focalX', 'focalY', 'overlayOpacity', 'brightness', 'contrast', 'saturation', 'mediaPosition', 'slideshowTransition'],
  brand: []
});

/* ---------- visual recipes (the non-colour half of a Design View) ---------- */
const RECIPES = Object.freeze({
  modern:      { label: 'Modern',      font: 'sans',    weight: 850, scale: 1,    letter: -0.5, line: 1.12, radius: 22, shadow: 'soft',   spacing: 'comfortable', cta: ['solid', 'arrow', 'none'],     badge: ['pill', 'tr', 'none'],       bg: ['gradient', 135], image: { overlay: 0,   brightness: 100, contrast: 100, saturation: 100 }, composition: 'balanced', align: 'left',   anim: ['slide-up', 'whole', 600] },
  fresh:       { label: 'Fresh',       font: 'rounded', weight: 800, scale: 1,    letter: 0,    line: 1.14, radius: 26, shadow: 'soft',   spacing: 'airy',        cta: ['pill', 'arrow', 'none'],      badge: ['sticker', 'tl', 'none'],    bg: ['gradient', 160], image: { overlay: 0,   brightness: 104, contrast: 100, saturation: 108 }, composition: 'balanced', align: 'left',   anim: ['fade', 'whole', 700] },
  business:    { label: 'Business',    font: 'sans',    weight: 750, scale: .92,  letter: -0.3, line: 1.16, radius: 12, shadow: 'soft',   spacing: 'comfortable', cta: ['solid', 'external', 'none'],  badge: ['pill', 'tr', 'none'],       bg: ['solid', 135],    image: { overlay: 0,   brightness: 100, contrast: 102, saturation: 96 },  composition: 'balanced', align: 'left',   anim: ['fade', 'whole', 500] },
  promotional: { label: 'Promotional', font: 'display', weight: 950, scale: 1.08, letter: -0.6, line: 1.04, radius: 20, shadow: 'lifted', spacing: 'compact',     cta: ['glow', 'cart', 'pulse'],      badge: ['ribbon', 'tl', 'pulse'],    bg: ['gradient', 125], image: { overlay: 0,   brightness: 102, contrast: 106, saturation: 110 }, composition: 'offer',    align: 'left',   anim: ['pop', 'whole', 500] },
  minimal:     { label: 'Minimal',     font: 'sans',    weight: 700, scale: .9,   letter: -0.2, line: 1.2,  radius: 16, shadow: 'none',   spacing: 'airy',        cta: ['outline', 'arrow', 'none'],   badge: ['outline', 'tr', 'none'],    bg: ['solid', 135],    image: { overlay: 0,   brightness: 100, contrast: 100, saturation: 100 }, composition: 'balanced', align: 'left',   anim: ['fade', 'whole', 600] },
  friendly:    { label: 'Friendly',    font: 'rounded', weight: 850, scale: 1,    letter: 0,    line: 1.12, radius: 28, shadow: 'soft',   spacing: 'comfortable', cta: ['pill', 'whatsapp', 'none'],   badge: ['sticker', 'tr', 'pop'],  bg: ['gradient', 160], image: { overlay: 0,   brightness: 103, contrast: 100, saturation: 104 }, composition: 'balanced', align: 'center', anim: ['slide-up', 'whole', 650] },
  bold:        { label: 'Bold',        font: 'display', weight: 950, scale: 1.12, letter: -0.8, line: 1.02, radius: 14, shadow: 'glow',   spacing: 'compact',     cta: ['glow', 'arrow', 'shine'],     badge: ['glass', 'tr', 'none'],      bg: ['gradient', 115], image: { overlay: .18, brightness: 98,  contrast: 110, saturation: 108 }, composition: 'type',     align: 'left',   anim: ['zoom-in', 'whole', 550] },
  elegant:     { label: 'Elegant',     font: 'serif',   weight: 700, scale: .96,  letter: 0.4,  line: 1.18, radius: 10, shadow: 'lifted', spacing: 'airy',        cta: ['border', 'arrow', 'none'],    badge: ['outline', 'tl', 'none'],    bg: ['gradient', 180], image: { overlay: .08, brightness: 100, contrast: 104, saturation: 92 },  composition: 'media',    align: 'center', anim: ['fade', 'whole', 900] },
  luxury:      { label: 'Luxury',      font: 'serif',   weight: 800, scale: 1,    letter: 0.6,  line: 1.14, radius: 8,  shadow: 'lifted', spacing: 'airy',        cta: ['outline', 'star', 'shine'],   badge: ['stamp', 'tl', 'none'],      bg: ['gradient', 160], image: { overlay: .16, brightness: 96,  contrast: 108, saturation: 90 },  composition: 'media',    align: 'center', anim: ['fade', 'whole', 1000] }
});
export const DESIGN_RECIPES = RECIPES;

const GROUP_RECIPE = { classics: 'modern', nature: 'fresh', blue: 'modern', luxury: 'luxury', warm: 'promotional', soft: 'friendly', future: 'bold', corporate: 'business', neutral: 'minimal' };

/* The 12 named presets from the spec (+ Pink). Rose & Cloud are the historical
   palettes; "Pink" and "Red" were never separate views in git history, so they
   are built on the canonical Soft Rose / Crimson palettes — no new colours. */
export const DESIGN_PRESETS = Object.freeze([
  { id: 'modern', label: 'Modern', paletteId: 'azure', recipe: 'modern' },
  { id: 'elegant', label: 'Elegant', paletteId: 'champagne', recipe: 'elegant' },
  { id: 'business', label: 'Business', paletteId: 'corporate_navy', recipe: 'business' },
  { id: 'promotional', label: 'Promotional', paletteId: 'orange', recipe: 'promotional' },
  { id: 'minimal', label: 'Minimal', paletteId: 'pure_white', recipe: 'minimal' },
  { id: 'rose', label: 'Rose', paletteId: 'rose', recipe: 'modern' },
  { id: 'pink', label: 'Pink', paletteId: 'soft_rose', recipe: 'friendly' },
  { id: 'red', label: 'Red', paletteId: 'crimson', recipe: 'promotional' },
  { id: 'cloud', label: 'Cloud', paletteId: 'cloud', recipe: 'minimal' },
  { id: 'fresh', label: 'Fresh', paletteId: 'mint', recipe: 'fresh' },
  { id: 'bold', label: 'Bold', paletteId: 'deep_black', recipe: 'bold' },
  { id: 'luxury', label: 'Luxury', paletteId: 'black_gold', recipe: 'luxury' },
  { id: 'friendly', label: 'Friendly', paletteId: 'peach', recipe: 'friendly' }
]);

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v, f) => HEX.test(String(v || '')) ? String(v) : f;
const clamp = (n, a, b) => Math.max(a, Math.min(b, Number(n) || 0));
const len = v => String(v == null ? '' : v).trim().length;
function luminanceOf(color) {
  const h = hex(color, '#000000');
  const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
}
const isLight = color => luminanceOf(color) > .45;

function paletteSource(palettes) {
  if (palettes && typeof palettes === 'object') return palettes;
  if (typeof window !== 'undefined' && window.SKH_AD_PALETTES) return window.SKH_AD_PALETTES;
  return {};
}

function recipeForPalette(tokens) {
  const base = GROUP_RECIPE[tokens.group] || 'modern';
  if (base === 'luxury' && isLight(tokens.primary)) return 'elegant'; // ivory/champagne/platinum = elegant
  return base;
}

/** Build a complete Design View (palette tokens + recipe) as canonical tokens. */
export function buildDesignView(paletteId, recipeId, meta = {}, palettes) {
  const tokens = paletteSource(palettes)[paletteId];
  if (!tokens) return null;
  const rid = RECIPES[recipeId] ? recipeId : recipeForPalette(tokens);
  const r = RECIPES[rid];
  return Object.freeze({
    id: meta.id || paletteId,
    label: meta.label || tokens.label,
    kind: meta.kind || 'palette',
    group: tokens.group,
    paletteId,
    recipe: rid,
    tokens: Object.freeze({
      colors: Object.freeze({ primary: tokens.primary, accent: tokens.accent, surface: tokens.surface, surfaceAlt: tokens.surfaceAlt, text: tokens.headline, muted: tokens.mutedText, primaryDark: tokens.primaryDark, cta: tokens.ctaBackground, ctaText: tokens.ctaText, border: tokens.border, overlay: tokens.overlay }),
      typography: Object.freeze({ font: r.font, weight: r.weight, scale: r.scale, letterSpacing: r.letter, lineHeight: r.line, align: r.align }),
      spacing: r.spacing,
      radius: r.radius,
      shadow: r.shadow,
      opacity: Object.freeze({ frame: tokens.frameOpacity, overlay: r.image.overlay }),
      surface: isLight(tokens.surface) ? 'light' : 'dark',
      border: r.shadow === 'none' ? 'hairline' : 'accent',
      accent: tokens.accent
    }),
    cta: Object.freeze({ style: r.cta[0], icon: r.cta[1], animation: r.cta[2] }),
    badge: Object.freeze({ style: r.badge[0], position: r.badge[1], animation: r.badge[2] }),
    background: Object.freeze({ mode: r.bg[0], angle: r.bg[1] }),
    imageTreatment: Object.freeze({ ...r.image }),
    composition: r.composition,
    animation: Object.freeze({ entrance: r.anim[0], mode: r.anim[1], duration: r.anim[2] })
  });
}

let viewCache = null;
let viewCacheSource = null;
/** All Design Views: the 13 named presets first, then every canonical palette. */
export function listDesignViews(palettes) {
  const source = paletteSource(palettes);
  if (viewCache && viewCacheSource === source) return viewCache;
  const presets = DESIGN_PRESETS.map(p => buildDesignView(p.paletteId, p.recipe, { id: 'preset:' + p.id, label: p.label, kind: 'preset' }, source)).filter(Boolean);
  const views = Object.keys(source).map(id => buildDesignView(id, null, { id, kind: 'palette' }, source)).filter(Boolean);
  viewCache = Object.freeze([...presets, ...views]);
  viewCacheSource = source;
  return viewCache;
}

export function getDesignView(id, palettes) {
  const key = String(id || '');
  if (!key) return null;
  const all = listDesignViews(palettes);
  return all.find(v => v.id === key) || all.find(v => v.id === 'preset:' + key) || null;
}

/* ---------- content analysis ---------- */
export function analyzeContent(state = {}, media = {}) {
  const slides = state.slideshow && Array.isArray(state.slideshow.slides) ? state.slideshow.slides.filter(s => s && s.src).length : 0;
  const image = !!String(state.imageUrl || state.image || '').trim();
  const video = !!String(state.videoUrl || '').trim();
  const audio = !!String(state.audioUrl || '').trim();
  const headlineLength = len(state.headline);
  const descriptionLength = len(state.description);
  const ctaLabel = String(state.ctaLabel || state.cta || '').trim();
  const imageAspect = Number(media.imageAspect) > 0 ? Number(media.imageAspect) : 0;
  const videoAspect = Number(media.videoAspect) > 0 ? Number(media.videoAspect) : 0;
  return {
    image, video, audio, slides,
    imageCount: slides >= 2 ? slides : (image ? 1 : 0),
    logo: !!String(state.logoUrl || '').trim(),
    backgroundImage: !!String(state.backgroundImageUrl || '').trim(),
    headlineLength, descriptionLength,
    hasHeadline: headlineLength > 0,
    hasDescription: descriptionLength > 0,
    hasOffer: len(state.offer || state.priceTag) > 0,
    hasBadge: len(state.badgeText) > 0,
    hasCta: !!ctaLabel,
    hasLink: len(state.link) > 0,
    hasText: headlineLength + descriptionLength + len(state.offer || state.priceTag) + len(state.badgeText) > 0,
    imageAspect, videoAspect,
    mediaAspect: video ? videoAspect : imageAspect,
    category: String(state.category || 'general'),
    placement: PLACEMENT_VARIANTS.includes(String(media.placement)) ? String(media.placement) : 'home',
    device: media.device === 'desktop' ? 'desktop' : 'mobile'
  };
}

/** Creative type is derived from what the user actually added — never forced. */
export function inferCreativeType(stateOrContent = {}) {
  const c = 'imageCount' in stateOrContent ? stateOrContent : analyzeContent(stateOrContent);
  if (c.slides >= 2) return 'slideshow';
  if (c.video && c.image && c.audio) return 'full_multimedia';
  if (c.video && c.image) return 'image_video';
  if (c.video && c.audio) return 'video_audio';
  if (c.video) return c.hasText ? 'video_text' : 'video';
  if (c.image && c.audio) return 'image_audio';
  if (c.image) return c.hasText ? 'image_text' : 'image';
  if (c.audio) return 'audio';
  return 'solid_text';
}

export function compositionFor(content) {
  if (content.slides >= 2) return content.slides >= 4 ? 'collage-slideshow' : 'slideshow';
  if (content.video) return 'video-first';
  if (content.image && content.audio) return 'image-audio';
  if (content.image) return content.hasText ? 'image-text' : 'image-only';
  if (content.audio) return 'poster-audio';
  return 'text';
}

const RATIO = { '1:1': 1, '4:5': .8, '9:16': .5625, '16:9': 1.7778 };
export function formatForAspect(aspect, fallback = '16:9') {
  const a = Number(aspect);
  if (!(a > 0)) return fallback;
  if (a < .66) return '9:16';
  if (a < .9) return '4:5';
  if (a <= 1.2) return '1:1';
  return '16:9';
}

/** Recommended headline px for the canonical card, by length, format and scale. */
export function headlineSizeFor(content, format, composition, scale = 1) {
  const textOnly = composition === 'text' || composition === 'poster-audio';
  const base = textOnly ? ({ '16:9': 40, '1:1': 44, '4:5': 46, '9:16': 48 }[format] || 40) : ({ '16:9': 26, '1:1': 28, '4:5': 28, '9:16': 30 }[format] || 26);
  const n = content.headlineLength;
  const k = n <= 18 ? 1.12 : n <= 36 ? 1 : n <= 60 ? .86 : n <= 90 ? .74 : .64;
  const limits = TEXT_ROLE_SIZES.headline;
  return Math.round(clamp(base * k * scale, limits.min, limits.max));
}

/* ---------- colour decisions (contrast-driven, token-based) ---------- */
function bestText(background, candidates, minimum = 4.5, background2) {
  const score = c => background2 ? Math.min(contrastRatio(c, background), contrastRatio(c, background2)) : contrastRatio(c, background);
  const ok = candidates.find(c => HEX.test(c) && score(c) >= minimum);
  if (ok) return ok;
  return candidates.filter(c => HEX.test(c)).sort((a, b) => score(b) - score(a))[0] || '#102A43';
}

function viewColors(view, content, composition, backgroundMode) {
  const t = view.tokens.colors;
  const textOnly = composition === 'text' || composition === 'poster-audio';
  const gradient = backgroundMode !== 'solid';
  const out = { primaryColor: t.primary, accentColor: t.accent, surfaceColor: t.surface };
  if (textOnly) {
    out.textColor = bestText(t.primary, [t.text, '#FFFFFF', '#102A43', t.primaryDark], 4.5, gradient ? t.accent : null);
    out.descriptionColor = out.textColor;
  } else {
    out.textColor = bestText(t.surface, [t.primary, t.primaryDark, '#102A43', '#FFFFFF']);
    out.descriptionColor = bestText(t.surface, [t.primaryDark, '#334E68', '#102A43', '#F1F5F9']);
  }
  out.offerColor = t.accent;
  out.offerTextColor = bestText(t.accent, ['#FFFFFF', '#102A43', t.primaryDark]);
  out.badgeColor = view.recipe === 'minimal' || view.recipe === 'elegant' ? t.primary : t.cta;
  out.badgeTextColor = bestText(out.badgeColor, [t.ctaText, '#FFFFFF', '#102A43']);
  return out;
}

function withoutKept(patch, keep) {
  const kept = [];
  const out = {};
  Object.keys(patch).forEach(key => {
    if (keep.has(key)) kept.push(key);
    else out[key] = patch[key];
  });
  return { patch: out, kept };
}

function keepSet(options) {
  const keep = new Set(Array.isArray(options.keep) ? options.keep : (options.keep instanceof Set ? [...options.keep] : []));
  (options.locked || []).forEach(el => (ELEMENT_STYLE_KEYS[el] || []).forEach(key => keep.add(key)));
  if (options.formatLocked) keep.add('format');
  CONTENT_KEYS.forEach(key => keep.delete(key));
  return keep;
}

/** Apply a Design View as a complete visual system (used by chips and presets). */
export function applyDesignView(viewId, state = {}, options = {}) {
  const view = getDesignView(viewId, options.palettes);
  if (!view) return { patch: {}, kept: [], view: null };
  const content = analyzeContent(state, options.media || {});
  const composition = compositionFor(content);
  const format = String(state.format || '16:9');
  const r = view.tokens.typography;
  const patch = {
    designViewId: view.id,
    presetId: view.kind === 'preset' ? view.id.replace('preset:', '') : '',
    paletteId: view.paletteId,
    backgroundMode: view.background.mode,
    gradientAngle: view.background.angle,
    frameOpacity: view.tokens.opacity.frame,
    borderRadius: view.tokens.radius,
    cardShadow: view.tokens.shadow,
    fontFamily: r.font,
    fontWeight: r.weight,
    headlineLetterSpacing: r.letterSpacing,
    headlineLineHeight: r.lineHeight,
    fontSize: headlineSizeFor(content, format, composition, r.scale),
    ctaStyle: view.cta.style,
    ctaIcon: view.cta.icon,
    badgeStyle: view.badge.style,
    badgePosition: view.badge.position,
    overlayOpacity: content.image || content.video ? view.imageTreatment.overlay : 0,
    brightness: view.imageTreatment.brightness,
    contrast: view.imageTreatment.contrast,
    saturation: view.imageTreatment.saturation,
    ...viewColors(view, content, composition, view.background.mode)
  };
  const result = withoutKept(patch, keepSet(options));
  return { ...result, view };
}

/* Deterministic view choice when the user has not picked one. */
export function recommendedViewId(content) {
  const byCategory = { product: 'preset:promotional', service: 'preset:business', transport: 'preset:modern', business: 'preset:business', event: 'preset:bold', school: 'preset:fresh', hospital: 'preset:cloud', app: 'preset:modern' };
  if (content.hasOffer && (content.category === 'product' || content.category === 'general')) return 'preset:promotional';
  return byCategory[content.category] || 'preset:modern';
}

/**
 * AUTO DESIGN — deterministic (same input → same output, no randomness).
 * Uses: content hierarchy, available media, chosen view/style, category,
 * creative type, text lengths and media aspect ratio. Placement/device are
 * rendered by the canonical renderer as variants of the SAME creative, so they
 * feed recommendations (never a silent restyle of the stored creative).
 */
export function autoDesign(state = {}, options = {}) {
  const media = options.media || {};
  const content = analyzeContent(state, media);
  const composition = compositionFor(content);
  const creativeType = inferCreativeType(content);
  const reasons = [];
  const viewId = state.designViewId || (state.paletteId ? state.paletteId : '') || recommendedViewId(content);
  const view = getDesignView(viewId, options.palettes) || getDesignView('preset:modern', options.palettes);
  if (!state.designViewId && !state.paletteId) reasons.push('Design View "' + (view ? view.label : 'Modern') + '" imechaguliwa kulingana na aina ya tangazo (' + content.category + ').');

  // 1. Format: follows the media's real aspect ratio; text-only follows text volume.
  let format = String(state.format || '16:9');
  if (!options.formatLocked) {
    if (composition === 'text') {
      const total = content.headlineLength + content.descriptionLength;
      format = total > 140 ? '1:1' : '16:9';
      reasons.push(total > 140 ? 'Maandishi ni mengi → Square (1:1) ili yasomeke.' : 'Tangazo la maandishi → Landscape (16:9) yenye typography kubwa.');
    } else if (composition === 'poster-audio') {
      format = '1:1'; reasons.push('Audio bila picha → poster ya Square yenye player.');
    } else if (content.mediaAspect > 0) {
      format = formatForAspect(content.mediaAspect, format);
      reasons.push((content.mediaAspect < .9 ? 'Media ni portrait' : content.mediaAspect > 1.2 ? 'Media ni landscape' : 'Media ni square') + ' → format ' + format + '.');
    } else if (content.slides >= 2) {
      format = '1:1'; reasons.push('Picha ' + content.slides + ' → slideshow ya Square.');
    } else if (content.video) {
      format = '16:9'; reasons.push('Video → video-first 16:9.');
    }
  } else reasons.push('Format uliyochagua (' + format + ') imeheshimiwa.');

  const base = applyDesignView(view.id, { ...state, format }, { palettes: options.palettes, media });
  const r = view.tokens.typography;
  const patch = { ...base.patch, format };

  // 2. Typography hierarchy from text length.
  patch.fontSize = headlineSizeFor(content, format, composition, r.scale);
  if (content.headlineLength > 60) reasons.push('Headline ndefu → ukubwa umepunguzwa (' + patch.fontSize + 'px).');
  const bodyLimits = TEXT_ROLE_SIZES.body;
  patch.descriptionSize = Math.round(clamp(content.descriptionLength > 200 ? 13 : content.descriptionLength > 110 ? 14 : composition === 'text' ? 18 : 15, bodyLimits.min, bodyLimits.max));
  patch.offerSize = content.hasOffer ? (composition === 'text' ? 22 : 18) : 18;
  patch.badgeFontSize = 12;
  const centered = composition === 'text' || composition === 'poster-audio' ? (content.headlineLength <= 48 ? 'center' : 'left') : r.align;
  patch.textAlign = centered;
  patch.descriptionAlign = centered;
  patch.offerAlign = centered;
  patch.textShadow = composition === 'text' && !isLight(view.tokens.colors.primary) ? 'subtle' : 'none';

  // 3. Media treatment from real aspect vs frame.
  if (content.image || content.video || content.slides >= 2) {
    const frame = RATIO[format] || 1.7778;
    const aspect = content.mediaAspect;
    if (aspect > 0 && Math.abs(Math.log(aspect / frame)) > .35) {
      patch.mediaFit = 'contain';
      reasons.push('Crop ingekata sehemu kubwa ya media → "contain" + background ya blur.');
    } else patch.mediaFit = 'cover';
    patch.focalX = 50;
    patch.focalY = aspect > 0 && aspect < frame ? 38 : 50; // portrait in wider frame → keep the upper third (faces/products)
    patch.mediaPosition = 'top';
    if (content.video) reasons.push('Video iko juu (video-first); maandishi chini yake.');
  }
  if (content.slides >= 2) patch.slideshowTransition = content.slides >= 4 ? 'crossfade' : 'fade';

  // 4. Motion: one focal animation, calmer for long copy; CTA emphasis only when a CTA exists.
  patch.textAnimation = content.headlineLength > 80 ? 'fade' : view.animation.entrance;
  patch.animationMode = 'whole';
  patch.animationDuration = view.animation.duration;
  patch.ctaAnimation = content.hasCta ? view.cta.animation : 'none';
  patch.badgeAnimation = content.hasBadge && !content.video ? view.badge.animation : 'none';
  if (content.video) { patch.textAnimation = 'fade'; reasons.push('Video tayari ina mwendo → animation ya maandishi ni tulivu.'); }

  // 5. Badge placement never collides with the play cue / brand header.
  patch.badgePosition = content.video ? 'tl' : view.badge.position;
  patch.badgeSize = content.headlineLength > 60 ? 'sm' : 'md';

  const creativeTypeReason = 'Aina imetambuliwa kutoka content: ' + creativeType + ' (' + composition + ').';
  reasons.unshift(creativeTypeReason);
  const result = withoutKept(patch, keepSet(options));
  if (result.kept.length) reasons.push('Mabadiliko yako ' + result.kept.length + ' ya manual yamehifadhiwa.');
  return { patch: result.patch, kept: result.kept, reasons, creativeType, composition, viewId: view.id, content, version: DESIGN_ENGINE_VERSION };
}

/** A stable signature of the inputs Auto Design depends on (for debounced re-runs). */
export function autoDesignSignature(state = {}, media = {}) {
  const c = analyzeContent(state, media);
  const bucket = n => n === 0 ? 0 : n <= 18 ? 1 : n <= 36 ? 2 : n <= 60 ? 3 : n <= 90 ? 4 : 5;
  return [c.image, c.video, c.audio, Math.min(c.slides, 4), c.logo, bucket(c.headlineLength), bucket(Math.round(c.descriptionLength / 3)), c.hasOffer, c.hasBadge, c.hasCta,
    formatForAspect(c.mediaAspect, '-'), c.category, state.designViewId || state.paletteId || ''].join('|');
}

/**
 * SMART RECOMMENDATIONS — never auto-applied. Each item has a patch for
 * [Apply]; [Keep current] simply dismisses it.
 */
export function recommendDesign(state = {}, options = {}) {
  const media = options.media || {};
  const content = analyzeContent(state, media);
  const composition = compositionFor(content);
  const out = [];
  const add = (id, level, title, detail, patch) => out.push({ id, level, title, detail, patch: patch || null });
  const textOnly = composition === 'text' || composition === 'poster-audio';
  const textBg = textOnly ? hex(state.primaryColor, '#0E7A5F') : hex(state.surfaceColor, '#FFFFFF');
  const textBg2 = textOnly && state.backgroundMode !== 'solid' ? hex(state.accentColor, '#167A91') : null;
  const tc = hex(state.textColor, '#102A43');
  const ratio = textBg2 ? Math.min(contrastRatio(tc, textBg), contrastRatio(tc, textBg2)) : contrastRatio(tc, textBg);
  if (content.hasHeadline && ratio < 4.5) {
    const fix = bestText(textBg, ['#FFFFFF', '#102A43', hex(state.primaryColor, '#0E7A5F')], 4.5, textBg2);
    add('contrast', 'warning', 'Contrast ya headline ni ndogo (' + ratio.toFixed(1) + ':1)', 'Maandishi hayasomeki vizuri kwenye background yake. Pendekezo: ' + fix + '.', { textColor: fix, descriptionColor: fix });
  }
  const format = String(state.format || '16:9');
  const idealSize = headlineSizeFor(content, format, composition, 1);
  if (content.hasHeadline && Number(state.fontSize) > idealSize * 1.35) {
    add('headline-size', 'hint', 'Headline ni kubwa kwa urefu wake', 'Kwa herufi ' + content.headlineLength + ' kwenye ' + format + ', ' + idealSize + 'px inasomeka vizuri zaidi.', { fontSize: idealSize });
  }
  if (content.mediaAspect > 0) {
    const ideal = formatForAspect(content.mediaAspect, format);
    if (ideal !== format && Math.abs(Math.log(content.mediaAspect / (RATIO[format] || 1.7778))) > .35) {
      add('format', 'hint', 'Format haiendani na media', 'Media yako inafaa ' + ideal + '; ' + format + ' itakata sehemu kubwa.', { format: ideal, mediaFit: 'cover' });
    }
  }
  if (content.hasLink && !content.hasCta) add('cta-missing', 'hint', 'Ongeza CTA', 'Una link lakini hakuna kitufe. CTA inaongeza clicks.', { cta: 'Tazama Zaidi' });
  if (content.hasCta && !content.hasLink) add('link-missing', 'warning', 'CTA haina destination', 'Weka HTTPS link au SokoHai destination kabla ya Publish.', null);
  if (content.hasOffer && !content.hasBadge) add('offer-badge', 'hint', 'Onyesha ofa kwa badge', 'Badge fupi huvuta macho kwenye ofa yako.', { badgeText: '🔥 OFA MAALUM' });
  if (content.descriptionLength > 200 && Number(state.descriptionSize) > 15) add('long-body', 'hint', 'Maelezo ni marefu', 'Punguza ukubwa wa description ili yasijaze card.', { descriptionSize: 14 });
  const animated = ['textAnimation', 'ctaAnimation', 'badgeAnimation'].filter(k => state[k] && state[k] !== 'none');
  if (animated.length >= 3) add('motion', 'hint', 'Animation nyingi kwa wakati mmoja', 'Chagua kitu kimoja kiwe focal point; wengine watulie.', { badgeAnimation: 'none', textAnimation: 'fade' });
  if (content.slides >= 2 && state.slideshowTransition === 'none') add('slides', 'hint', 'Slideshow bila transition', 'Fade laini hufanya picha zibadilike kitaalamu.', { slideshowTransition: 'fade' });
  if (!state.designViewId && !state.paletteId) {
    const id = recommendedViewId(content);
    const v = getDesignView(id, options.palettes);
    if (v) add('view', 'hint', 'Jaribu Design View: ' + v.label, 'Inaendana na tangazo la ' + content.category + '.', { designViewId: id, __applyView: id });
  }
  if ((content.placement === 'chat' || content.placement === 'dashboard') && format !== '16:9') add('placement-format', 'hint', 'Placement ya ' + content.placement + ' ni banner fupi', 'Creative ileile itaonekana compact; 16:9 inasomeka vizuri zaidi hapa.', { format: '16:9' });
  if (content.video && format === '9:16' && content.placement === 'home') add('video-story', 'hint', 'Story format kwenye Home', '9:16 inachukua nafasi kubwa kwenye Home feed; 4:5 au 16:9 ni bora.', { format: '4:5' });
  const dismissed = new Set(options.dismissed || []);
  return out.filter(item => !dismissed.has(item.id)).slice(0, 8);
}

/* Canonical designer defaults for a brand-new, empty advertisement. */
export function emptyDesignerState() {
  return { headline: '', description: '', offer: '', badgeText: '', ctaLabel: '', link: '', imageUrl: '', videoUrl: '', audioUrl: '', logoUrl: '', slideshow: { enabled: false, slides: [] }, format: '16:9', category: 'general' };
}
