/*
 * Basic Advertisement Creator adapter.
 *
 * This is deliberately an adapter over the canonical Creative model, not a
 * second model or renderer. The Basic UI writes the same schema consumed by
 * Creator Studio; the announcement card remains the existing published
 * renderer (js/06-announcement.js).
 */
import {
  createCreative,
  normalizeCreative,
  resizeCreative,
  makeLayer,
  autoAdDuration,
  slideshowTotal,
  validateCreative,
  MAX_AD_DURATION_SECONDS,
  MIN_AD_DURATION_SECONDS,
  BASIC_AD_TYPES,
  TEXT_ROLE_LIMITS,
  TEXT_ROLE_SIZES,
  normalizeAdSlideshow,
  creativeToAdvertisement
} from './creative-model.js';

const FORMAT_BY_RATIO = Object.freeze({
  '1:1': 'square',
  '4:5': 'portrait',
  '9:16': 'story',
  '16:9': 'landscape'
});
const RATIO_BY_FORMAT = Object.freeze({
  square: '1:1',
  feed: '1:1',
  portrait: '4:5',
  story: '9:16',
  landscape: '16:9',
  banner: '16:9'
});
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
const listOf = value => Array.isArray(value) ? value.map(item => String(item)) : (typeof value === 'string' && value ? value.split(',').map(item => item.trim()).filter(Boolean) : []);
/* Which media each (derived) creative type shows — one table, used by build + UI. */
export const MEDIA_BY_TYPE = Object.freeze({
  image: Object.freeze(['image_text', 'image', 'solid_text', 'image_audio', 'full_multimedia', 'image_video']),
  video: Object.freeze(['video', 'video_text', 'full_multimedia', 'image_video', 'video_audio']),
  audio: Object.freeze(['image_audio', 'full_multimedia', 'video_audio', 'audio', 'slideshow'])
});
const clean = value => String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').trim();
const validColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;

export function basicRatioToFormat(ratio) {
  return FORMAT_BY_RATIO[String(ratio || '16:9')] || 'landscape';
}

export function basicFormatToRatio(format) {
  return RATIO_BY_FORMAT[String(format || 'landscape')] || '16:9';
}

function normalizeBasicSlideshow(value) {
  return normalizeAdSlideshow(value);
}

function getRole(creative, role) {
  return creative.layers.find(layer => layer.role === role && layer.type === 'text');
}

function setTextLayer(creative, role, name, content, style = {}, animation = null) {
  let layer = getRole(creative, role);
  const existed = !!layer;
  if (!layer) {
    const w = creative.canvas.width;
    const h = creative.canvas.height;
    const defaults = role === 'headline'
      ? { x: w * .08, y: h * .12, width: w * .84, height: h * .18, zIndex: 5 }
      : role === 'body'
        ? { x: w * .08, y: h * .34, width: w * .82, height: h * .16, zIndex: 6 }
        : role === 'price'
          ? { x: w * .08, y: h * .58, width: w * .5, height: h * .1, zIndex: 7 }
          : role === 'badge'
            ? { x: w * .055, y: h * .055, width: w * .34, height: h * .07, zIndex: 9 }
            : { x: w * .08, y: h * .72, width: w * .42, height: h * .09, zIndex: 8 };
    layer = makeLayer('text', { ...defaults, role, name, content: '' });
    creative.layers.push(layer);
  }
  if (!existed) layer.name = name;
  const nextContent = clean(content);
  const contentChanged = !existed || clean(layer.content) !== nextContent;
  layer.content = nextContent;
  if (contentChanged) layer.visible = !!nextContent;
  layer.style = { ...layer.style, ...style };
  if (animation) layer.animation = { ...layer.animation, ...animation };
  return layer;
}

function syncMediaLayer(creative, type, role, source, active, extra = {}) {
  const src = clean(source);
  let layer = creative.layers.find(item => item.role === role && item.type === type);
  if (!layer && extra.manageLegacy === true) {
    layer = creative.layers.find(item => item.type === type && !item.role && clean(item.src || item.videoUrl || item.audioUrl));
    if (layer) layer.role = role;
  }
  if (!src) {
    if (layer) layer.visible = false;
    return layer || null;
  }
  if (!layer) {
    const w = creative.canvas.width;
    const h = creative.canvas.height;
    const isAudio = type === 'audio';
    layer = makeLayer(type, {
      role,
      name: type === 'image' ? 'Basic image' : type === 'video' ? 'Basic video' : 'Basic audio',
      x: isAudio ? Math.round(w * .08) : Math.round(w * .12),
      y: isAudio ? Math.round(h * .82) : Math.round(h * .25),
      width: isAudio ? Math.round(w * .84) : Math.round(w * .76),
      height: isAudio ? 76 : Math.round(h * .52),
      zIndex: Math.max(1, ...creative.layers.map(item => Number(item.zIndex) || 0)) + 1,
      style: { fit: 'cover', radius: 20 }
    });
    creative.layers.push(layer);
  }
  const sourceChanged = clean(layer.src || layer.videoUrl || layer.audioUrl) !== src;
  const wasExisting = !!layer.id;
  layer.role = role;
  layer.src = src;
  layer.originalSrc = layer.originalSrc || src;
  if (extra.forceVisibility || sourceChanged || !wasExisting) layer.visible = !!active;
  if (type === 'video') {
    layer.videoUrl = src;
    layer.videoMeta = {
      ...layer.videoMeta,
      duration: extra.originalDuration == null ? Number(layer.videoMeta && layer.videoMeta.duration) || 0 : Math.max(0, Number(extra.originalDuration) || 0),
      trimStart: extra.trimStart == null ? Number(layer.videoMeta && layer.videoMeta.trimStart) || 0 : Math.max(0, Number(extra.trimStart) || 0),
      trimEnd: extra.trimEnd == null ? Number(layer.videoMeta && layer.videoMeta.trimEnd) || 0 : Math.max(0, Number(extra.trimEnd) || 0),
      loop: extra.loop == null ? layer.videoMeta && layer.videoMeta.loop !== false : extra.loop !== false,
      muted: extra.muted == null ? layer.videoMeta && layer.videoMeta.muted !== false : extra.muted !== false
    };
  } else if (type === 'audio') {
    layer.audioUrl = src;
  }
  return layer;
}

/** Build the canonical creative object from the Basic Creator form values. */
export function buildBasicCreative(form = {}, previous = null) {
  const requestedFormat = basicRatioToFormat(form.format || form.aspectRatio || '16:9');
  const changedFields = Array.isArray(form.changedFields) ? new Set(form.changedFields) : null;
  const changed = (...fields) => !previous || !changedFields || fields.some(field => changedFields.has(field));
  let creative = previous && typeof previous === 'object'
    ? normalizeCreative(previous)
    : createCreative({
      format: requestedFormat,
      publicationType: 'advertisement',
      ownerId: form.ownerId || ''
    });

  const formatChanged = !previous || form.formatChanged === true || changed('format', 'aspectRatio');
  if (formatChanged && creative.format !== requestedFormat) creative = resizeCreative(creative, requestedFormat);
  creative.type = 'advertisement';
  const selectedType = String(form.creativeType || creative.basicType || 'image_text');
  const typeChanged = !previous || form.creativeTypeChanged === true || form.typeChanged === true || changed('creativeType');
  if (typeChanged) creative.basicType = selectedType;
  const type = typeChanged ? selectedType : String(creative.basicType || selectedType);
  creative.ownerId = clean((previous && previous.ownerId) || form.ownerId || creative.ownerId);
  const previousHeadline = previous && previous.layers && previous.layers.find(layer => layer.role === 'headline');
  if (changed('headline') && (!previous || clean(form.headline) !== clean(previousHeadline && previousHeadline.content))) {
    creative.title = clean(form.headline || form.brandName || creative.title || 'Advertisement').slice(0, 160);
  }
  if (changed('category')) creative.category = clean(form.category || 'general') || 'general';
  if (changed('campaignName')) creative.campaignName = clean(form.campaignName).slice(0, 80);
  if (changed('campaignId')) creative.campaignId = clean(form.campaignId).slice(0, 80);
  if (changed('offer', 'priceTag')) creative.offer = clean(form.offer || form.priceTag).slice(0, TEXT_ROLE_LIMITS.price);
  if (changed('paletteId')) creative.paletteId = clean(form.paletteId).slice(0, 80);
  if (changed('priority')) creative.priority = Math.max(0, Number(form.priority) || 0);
  if (changed('startAt')) creative.startAt = form.startAt ? String(form.startAt) : '';
  if (changed('endAt')) creative.endAt = form.endAt ? String(form.endAt) : '';
  if (changed('displayDurationSeconds') && form.displayDurationSeconds != null && form.displayDurationSeconds !== '' && Number.isFinite(Number(form.displayDurationSeconds))) {
    creative.displayDurationSeconds = Number(form.displayDurationSeconds);
  }
  const requestedLink = clean(form.link);
  const oldDestination = previous && previous.destination && typeof previous.destination === 'object' ? previous.destination : null;
  const oldLink = oldDestination ? (oldDestination.type === 'external' ? clean(oldDestination.url) : (oldDestination.type && oldDestination.id ? '#' + oldDestination.type + '-' + oldDestination.id : '')) : '';
  if (!changed('link')) {
    if (oldDestination) creative.destination = { ...oldDestination };
  } else if (requestedLink === oldLink && oldDestination) creative.destination = { ...oldDestination };
  else if (/^https:\/\//i.test(requestedLink)) {
    creative.destination = { type: 'external', url: requestedLink };
    if (previous) creative.linkedEntity = null;
  } else if (!requestedLink) {
    if (oldDestination) creative.destination = { ...oldDestination };
  } else {
    creative.destination = null;
  }

  const bgMode = String(form.backgroundMode || 'gradient');
  const priorBgMode = previous && previous.background && previous.background.type === 'color' ? 'solid' : 'gradient';
  const backgroundModeChanged = !previous || form.backgroundModeChanged === true || changed('backgroundMode') && bgMode !== priorBgMode;
  const nextBackground = { ...creative.background };
  if (backgroundModeChanged) nextBackground.type = clean(form.backgroundImageUrl) ? 'image' : (bgMode === 'solid' || bgMode === 'color' ? 'color' : 'gradient');
  if (changed('backgroundImageUrl')) {
    nextBackground.imageUrl = clean(form.backgroundImageUrl);
    if (nextBackground.imageUrl) nextBackground.type = 'image';
    else if (!backgroundModeChanged && previous && previous.background) nextBackground.type = previous.background.type || 'gradient';
    else if (!nextBackground.imageUrl && nextBackground.type === 'image') nextBackground.type = bgMode === 'solid' || bgMode === 'color' ? 'color' : 'gradient';
  }
  if (changed('primaryColor')) nextBackground.color = validColor(form.primaryColor, nextBackground.color || '#0E7A5F');
  if (changed('accentColor')) nextBackground.color2 = validColor(form.accentColor, nextBackground.color2 || '#167A91');
  if (changed('gradientAngle')) nextBackground.angle = clamp(form.gradientAngle || 135, 0, 360);
  if (changed('backgroundOpacity') && form.backgroundOpacity != null) nextBackground.opacity = clamp(form.backgroundOpacity, 0, 1);
  if (changed('surfaceColor')) nextBackground.surfaceColor = validColor(form.surfaceColor, nextBackground.surfaceColor || '#FFFFFF');
  if (changed('frameOpacity')) nextBackground.frameOpacity = form.frameOpacity == null ? (nextBackground.frameOpacity ?? .42) : Number(form.frameOpacity);
  if (changed('borderRadius')) nextBackground.borderRadius = form.borderRadius == null ? (nextBackground.borderRadius ?? 22) : Number(form.borderRadius);
  creative.background = nextBackground;

  const brandName = clean(form.brandName).slice(0, 80);
  const logoUrl = clean(form.logoUrl);
  const brandChanged = changed('brandName', 'logoUrl');
  if (brandChanged) {
    const brandKit = { ...(creative.brandKit || {}) };
    if (changed('brandName')) brandKit.name = brandName;
    if (changed('logoUrl')) brandKit.logoUrl = logoUrl;
    if (changed('primaryColor')) brandKit.primary = creative.background.color;
    if (changed('accentColor')) brandKit.secondary = creative.background.color2;
    creative.brandKit = brandKit;
  }

  const textColor = validColor(form.textColor, '#102A43');
  const textAlign = ['left', 'center', 'right'].includes(String(form.textAlign)) ? String(form.textAlign) : 'left';
  const descriptionColor = validColor(form.descriptionColor, textColor);
  const descriptionAlign = ['left', 'center', 'right'].includes(String(form.descriptionAlign)) ? String(form.descriptionAlign) : textAlign;
  const descriptionSize = clamp(form.descriptionSize || 20, TEXT_ROLE_SIZES.body.min, TEXT_ROLE_SIZES.body.max);
  const offerColor = validColor(form.offerColor, validColor(form.accentColor, '#167A91'));
  const offerTextColor = validColor(form.offerTextColor, textColor);
  const offerAlign = ['left', 'center', 'right'].includes(String(form.offerAlign)) ? String(form.offerAlign) : 'left';
  const offerSize = clamp(form.offerSize || 24, TEXT_ROLE_SIZES.price.min, TEXT_ROLE_SIZES.price.max);
  const badgeFontSize = clamp(form.badgeFontSize || 14, TEXT_ROLE_SIZES.badge.min, TEXT_ROLE_SIZES.badge.max);
  const badgeTextAlign = ['left', 'center', 'right'].includes(String(form.badgeTextAlign)) ? String(form.badgeTextAlign) : 'center';
  const fontWeight = clamp(form.fontWeight || 800, 400, 950);
  const fontSize = clamp(form.fontSize || 64, TEXT_ROLE_SIZES.headline.min, TEXT_ROLE_SIZES.headline.max);
  const entrance = String(form.textAnimation || 'none');
  const oldHead = getRole(creative, 'headline');
  const animation = {};
  if (changed('textAnimation')) animation.entrance = entrance;
  if (changed('animationDuration')) animation.duration = Number(form.animationDuration) || (oldHead && oldHead.animation && oldHead.animation.duration) || 600;
  if (changed('textAnimation') && oldHead) {
    const oldAnimation = oldHead.animation || {};
    if (!changed('textEmphasis') && !changed('textExit')) {
      animation.enabled = entrance !== 'none' || oldAnimation.emphasis && oldAnimation.emphasis !== 'none' || oldAnimation.exit && oldAnimation.exit !== 'none';
    }
  }

  const headlineStyle = {};
  if (changed('textColor')) headlineStyle.fill = textColor;
  if (changed('fontWeight')) headlineStyle.fontWeight = fontWeight;
  if (changed('fontSize')) headlineStyle.fontSize = fontSize;
  if (changed('textAlign')) headlineStyle.textAlign = textAlign;
  if (changed('textShadow')) headlineStyle.textShadow = form.textShadow;
  if (changed('headlineLetterSpacing') && form.headlineLetterSpacing != null && form.headlineLetterSpacing !== '') headlineStyle.letterSpacing = clamp(form.headlineLetterSpacing, -3, 8);
  if (changed('headlineLineHeight') && Number(form.headlineLineHeight) > 0) headlineStyle.lineHeight = clamp(form.headlineLineHeight, .9, 1.6);
  if (changed('textEmphasis') && form.textEmphasis != null) {
    animation.emphasis = String(form.textEmphasis || 'none');
    animation.enabled = String(form.textAnimation || 'none') !== 'none' || animation.emphasis !== 'none';
  }
  if (changed('animationMode') && form.animationMode) animation.mode = ['whole', 'word', 'character', 'line'].includes(String(form.animationMode)) ? String(form.animationMode) : 'whole';
  if (changed('textAnimation') && !oldHead) animation.enabled = entrance !== 'none' || (String(form.textEmphasis || 'none') !== 'none');
  const headlineChanged = changed('headline', 'textColor', 'fontWeight', 'fontSize', 'textAlign', 'textShadow', 'textAnimation', 'animationDuration', 'headlineLetterSpacing', 'headlineLineHeight', 'textEmphasis', 'animationMode');
  if (headlineChanged) setTextLayer(creative, 'headline', 'Headline', form.headline, headlineStyle, Object.keys(animation).length ? animation : null);

  const bodyStyle = {};
  if (changed('descriptionColor')) bodyStyle.fill = descriptionColor;
  if (changed('descriptionSize')) bodyStyle.fontSize = descriptionSize;
  if (changed('descriptionAlign')) bodyStyle.textAlign = descriptionAlign;
  if (changed('description')) setTextLayer(creative, 'body', 'Description', form.description, bodyStyle);
  else if (changed('descriptionColor', 'descriptionSize', 'descriptionAlign')) {
    const body = getRole(creative, 'body');
    if (body) body.style = { ...body.style, ...bodyStyle };
  }

  const offerStyle = {};
  if (changed('offerTextColor')) offerStyle.fill = offerTextColor;
  if (changed('offerSize')) offerStyle.fontSize = offerSize;
  if (changed('offerAlign')) offerStyle.textAlign = offerAlign;
  if (changed('offerColor')) offerStyle.backgroundColor = offerColor;
  if (changed('offer', 'priceTag')) setTextLayer(creative, 'price', 'Offer / Price', form.offer || form.priceTag || '', offerStyle);
  else if (changed('offerTextColor', 'offerSize', 'offerAlign', 'offerColor')) {
    const price = getRole(creative, 'price');
    if (price) price.style = { ...price.style, ...offerStyle };
  }

  const badgeStyle = {};
  if (changed('badgeTextColor')) badgeStyle.fill = validColor(form.badgeTextColor, '#FFFFFF');
  if (changed('badgeColor')) badgeStyle.backgroundColor = validColor(form.badgeColor, '#F59E0B');
  if (changed('badgeFontSize')) badgeStyle.fontSize = badgeFontSize;
  if (changed('badgeTextAlign')) badgeStyle.textAlign = badgeTextAlign;
  if (changed('badgeStyle') && form.badgeStyle) badgeStyle.badgeStyle = clean(form.badgeStyle).slice(0, 20);
  if (changed('badgeSize') && form.badgeSize) badgeStyle.badgeSize = ['sm', 'md', 'lg'].includes(String(form.badgeSize)) ? String(form.badgeSize) : 'md';
  if (changed('badgePosition') && form.badgePosition) badgeStyle.badgePosition = ['tl', 'tr', 'bl', 'br'].includes(String(form.badgePosition)) ? String(form.badgePosition) : 'tr';
  if (changed('badgeIcon') && form.badgeIcon) badgeStyle.badgeIcon = clean(form.badgeIcon).slice(0, 20);
  const badgeStyleKeys = ['badgeTextColor', 'badgeColor', 'badgeFontSize', 'badgeTextAlign', 'badgeStyle', 'badgeSize', 'badgePosition', 'badgeIcon', 'badgeAnimation', 'badgeOpacity'];
  const badgeAnimation = changed('badgeAnimation') && form.badgeAnimation != null
    ? { entrance: String(form.badgeAnimation || 'none'), emphasis: 'none', enabled: String(form.badgeAnimation || 'none') !== 'none' }
    : null;
  let badgeLayer = null;
  if (changed('badgeText')) badgeLayer = setTextLayer(creative, 'badge', 'Promotional badge', form.badgeText || '', badgeStyle, badgeAnimation);
  else if (changed(...badgeStyleKeys)) {
    badgeLayer = getRole(creative, 'badge');
    if (badgeLayer) {
      badgeLayer.style = { ...badgeLayer.style, ...badgeStyle };
      if (badgeAnimation) badgeLayer.animation = { ...badgeLayer.animation, ...badgeAnimation };
    }
  }
  if (badgeLayer && changed('badgeOpacity') && form.badgeOpacity != null && form.badgeOpacity !== '') badgeLayer.opacity = clamp(form.badgeOpacity, .4, 1);

  const ctaLabel = clean(form.ctaLabel || form.cta);
  if (changed('ctaLabel', 'cta', 'ctaMode', 'ctaCustom')) {
    const oldCta = getRole(creative, 'cta');
    const oldCtaContent = clean(oldCta && oldCta.content);
    setTextLayer(creative, 'cta', 'Call to action', ctaLabel);
    const ctaBg = creative.layers.find(layer => layer.role === 'cta-bg');
    if (ctaBg && oldCtaContent !== ctaLabel) ctaBg.visible = !!ctaLabel;
  }
  if (changed('ctaStyle', 'ctaIcon', 'ctaAlign', 'ctaAnimation', 'ctaLabel', 'cta', 'ctaMode', 'ctaCustom')) {
    const ctaLayer = getRole(creative, 'cta');
    if (ctaLayer) {
      const next = {};
      if (changed('ctaStyle', 'ctaLabel', 'cta', 'ctaMode', 'ctaCustom') && form.ctaStyle) next.ctaStyle = clean(form.ctaStyle).slice(0, 20);
      if (changed('ctaIcon', 'ctaLabel', 'cta', 'ctaMode', 'ctaCustom') && form.ctaIcon) next.ctaIcon = clean(form.ctaIcon).slice(0, 20);
      if (changed('ctaAlign', 'ctaLabel', 'cta', 'ctaMode', 'ctaCustom') && form.ctaAlign !== undefined) next.ctaAlign = ['left', 'center', 'right', 'full'].includes(String(form.ctaAlign)) ? String(form.ctaAlign) : '';
      ctaLayer.style = { ...ctaLayer.style, ...next };
      if (changed('ctaAnimation') && form.ctaAnimation != null) {
        const value = String(form.ctaAnimation || 'none');
        ctaLayer.animation = { ...ctaLayer.animation, entrance: 'none', emphasis: value, enabled: value !== 'none' };
      }
    }
  }

  const slideshow = normalizeBasicSlideshow(form.slideshow || form.slideshowJson);
  if (!previous || form.slideshowChanged === true || changed('slideshow', 'slideshowJson') || typeChanged && (selectedType === 'slideshow' || previous && previous.basicType === 'slideshow')) {
    if (typeChanged && selectedType === 'slideshow' && slideshow.slides.length >= 2) slideshow.enabled = true;
    if (typeChanged && selectedType !== 'slideshow' && previous && previous.basicType === 'slideshow') slideshow.enabled = false;
    creative.slideshow = slideshow;
  }
  const imagesActive = MEDIA_BY_TYPE.image.includes(type);
  const videoActive = MEDIA_BY_TYPE.video.includes(type);
  const audioActive = MEDIA_BY_TYPE.audio.includes(type);
  const imageSource = clean(form.imageUrl || form.image);
  const videoSource = clean(form.videoUrl);
  const audioSource = clean(form.audioUrl);

  // Managed media is tagged by role so unrelated advanced layers remain intact.
  const manageBasicMedia = !previous || !!previous.basicType || typeChanged;
  const mediaChanged = typeChanged || changed('imageUrl', 'image', 'videoUrl', 'audioUrl', 'videoOriginalDuration', 'videoTrimStart', 'videoTrimEnd', 'videoLoop', 'videoMuted');
  if (manageBasicMedia && mediaChanged) {
  creative.layers.filter(layer => ['basic-image', 'basic-video', 'basic-audio'].includes(layer.role)).forEach(layer => {
    if (typeChanged) layer.visible = false;
  });
  syncMediaLayer(creative, 'image', 'basic-image', imageSource, imagesActive && type !== 'slideshow', { forceVisibility: typeChanged, manageLegacy:typeChanged });
  syncMediaLayer(creative, 'video', 'basic-video', videoSource, videoActive, {
    originalDuration: form.videoOriginalDuration,
    trimStart: form.videoTrimStart,
    trimEnd: form.videoTrimEnd,
    loop: form.videoLoop !== false,
    muted: form.videoMuted !== false,
    forceVisibility: typeChanged,
    manageLegacy:typeChanged
  });
  syncMediaLayer(creative, 'audio', 'basic-audio', audioSource, audioActive, { forceVisibility: typeChanged, manageLegacy:typeChanged });
  }

  // Media transform (owner: MEDIA section) — written on the managed media layers.
  const mediaStyleChanged = changed('mediaFit', 'focalX', 'focalY', 'brightness', 'contrast', 'saturation', 'overlayOpacity', 'overlayColor', 'imageUrl', 'image', 'videoUrl');
  if (mediaStyleChanged) {
    creative.layers.filter(layer => ['basic-image', 'basic-video'].includes(layer.role)).forEach(layer => {
      const style = { ...layer.style };
      if (changed('mediaFit', 'imageUrl', 'image', 'videoUrl') && form.mediaFit) style.fit = ['cover', 'contain', 'fill', 'original'].includes(String(form.mediaFit)) ? String(form.mediaFit) : 'cover';
      if (changed('focalX', 'imageUrl', 'image', 'videoUrl') && form.focalX != null && form.focalX !== '') style.focalX = clamp(form.focalX, 0, 100);
      if (changed('focalY', 'imageUrl', 'image', 'videoUrl') && form.focalY != null && form.focalY !== '') style.focalY = clamp(form.focalY, 0, 100);
      if (changed('overlayOpacity', 'imageUrl', 'image', 'videoUrl') && form.overlayOpacity != null && form.overlayOpacity !== '') style.overlayOpacity = clamp(form.overlayOpacity, 0, .85);
      if (changed('overlayColor') && form.overlayColor) style.overlayColor = validColor(form.overlayColor, '#000000');
      const filter = { ...(style.filter || {}) };
      if (changed('brightness', 'imageUrl', 'image', 'videoUrl') && form.brightness != null && form.brightness !== '') filter.brightness = clamp(form.brightness, 50, 150);
      if (changed('contrast', 'imageUrl', 'image', 'videoUrl') && form.contrast != null && form.contrast !== '') filter.contrast = clamp(form.contrast, 50, 150);
      if (changed('saturation', 'imageUrl', 'image', 'videoUrl') && form.saturation != null && form.saturation !== '') filter.saturation = clamp(form.saturation, 0, 200);
      style.filter = filter;
      layer.style = style;
    });
  }

  // Canonical design block (views, layers visibility/lock/order, surface tokens).
  const designKeys = ['designMode', 'designViewId', 'presetId', 'fontFamily', 'cardShadow', 'mediaPosition', 'hiddenElements', 'lockedElements', 'elementOrder', 'typeLocked', 'formatLocked', 'touched', 'autoReasons'];
  if (changed(...designKeys) && designKeys.some(key => form[key] !== undefined)) {
    const prior = creative.design && typeof creative.design === 'object' ? creative.design : {};
    const pick = (formKey, designKey) => changed(formKey) && form[formKey] !== undefined ? form[formKey] : prior[designKey];
    creative.design = {
      ...prior,
      version: 2,
      mode: pick('designMode', 'mode') === 'manual' ? 'manual' : 'auto',
      viewId: clean(pick('designViewId', 'viewId')),
      presetId: clean(pick('presetId', 'presetId')),
      fontFamily: clean(pick('fontFamily', 'fontFamily')),
      cardShadow: clean(pick('cardShadow', 'cardShadow')),
      mediaPosition: pick('mediaPosition', 'mediaPosition') === 'bottom' ? 'bottom' : 'top',
      hidden: listOf(pick('hiddenElements', 'hidden')),
      locked: listOf(pick('lockedElements', 'locked')),
      order: listOf(pick('elementOrder', 'order')),
      typeLocked: pick('typeLocked', 'typeLocked') === true,
      formatLocked: pick('formatLocked', 'formatLocked') === true,
      touched: listOf(pick('touched', 'touched')),
      autoReasons: listOf(pick('autoReasons', 'autoReasons'))
    };
    creative.designMode = creative.design.mode;
  }

  const timingMode = String(form.timingMode || (form.durationAuto === false ? 'custom' : 'auto'));
  if (!previous || changed('timingMode', 'durationAuto')) creative.durationAuto = timingMode !== 'custom';
  const durationInputsChanged = changed('creativeDuration', 'duration');
  const durationDriversChanged = changed('creativeType', 'videoUrl', 'videoOriginalDuration', 'videoTrimStart', 'videoTrimEnd', 'slideshow', 'slideshowJson');
  if (!previous || durationInputsChanged || creative.durationAuto && (durationDriversChanged || changed('timingMode', 'durationAuto'))) {
    if (creative.durationAuto) {
      const guessed = autoAdDuration(creative);
      creative.duration = clamp(guessed || 9, 1, MAX_AD_DURATION_SECONDS);
    } else {
      const manualDuration = form.creativeDuration != null && form.creativeDuration !== '' ? Number(form.creativeDuration) : Number(form.duration);
      creative.duration = Number.isFinite(manualDuration) ? manualDuration : Number(creative.duration) || 9;
    }
  }
  creative.maxDuration = MAX_AD_DURATION_SECONDS;
  creative.metadata = {
    ...(creative.metadata || {}),
    source: (creative.metadata && creative.metadata.source) || 'sokohai-basic-ad-creator',
    preset: formatChanged ? creative.format : ((creative.metadata && creative.metadata.preset) || creative.format)
  };
  creative.updatedAt = new Date().toISOString();
  return normalizeCreative(creative);
}

/** Map the canonical Creative back to Basic Creator controls on edit/reopen. */
export function basicFormFromCreative(input, fallback = {}) {
  const creative = normalizeCreative(input || {});
  const role = name => getRole(creative, name);
  const first = type => creative.layers.find(layer => layer.type === type && layer.visible !== false && layer.src);
  const head = role('headline');
  const body = role('body');
  const price = role('price');
  const badge = role('badge');
  const cta = role('cta');
  const image = creative.layers.find(layer => layer.type === 'image' && layer.src);
  const video = creative.layers.find(layer => layer.type === 'video' && (layer.src || layer.videoUrl));
  const audio = creative.layers.find(layer => layer.type === 'audio' && (layer.src || layer.audioUrl));
  const videoMeta = (video && video.videoMeta) || {};
  const mediaLayer = creative.layers.find(layer => layer.role === 'basic-image' || layer.role === 'basic-video') || image || video || null;
  const mediaStyle = (mediaLayer && mediaLayer.style) || {};
  const mediaFilter = mediaStyle.filter || {};
  const design = creative.design && typeof creative.design === 'object' ? creative.design : {};
  const format = basicFormatToRatio(creative.format);
  let creativeType = String(creative.basicType || fallback.creativeType || '');
  if (!BASIC_AD_TYPES.includes(creativeType)) {
    if (creative.slideshow && creative.slideshow.enabled) creativeType = 'slideshow';
    else if (video && audio) creativeType = 'full_multimedia';
    else if (video) creativeType = String(fallback.creativeType || (head && head.content ? 'video_text' : 'video'));
    else if (image && audio) creativeType = 'image_audio';
    else if (image) creativeType = String(fallback.creativeType || 'image_text');
    else creativeType = 'solid_text';
  }
  const ctaContent = clean(cta && cta.content);
  const ctaCommon = ['Nunua Sasa', 'Wasiliana Nasi', 'Tazama Zaidi', 'Jisajili'];
  const isCommonCta = ctaCommon.includes(ctaContent);
  const slideshow = creative.slideshow || { enabled: false, transition: 'fade', defaultDuration: 3, slides: [] };
  const trimStart = Math.max(0, Number(videoMeta.trimStart) || 0);
  const trimEnd = Math.max(0, Number(videoMeta.trimEnd) || Number(videoMeta.duration) || 0);
  const mediaDuration = video ? Math.max(0, trimEnd - trimStart) : slideshowTotal(creative);

  return {
    creativeType,
    category: clean(creative.category || fallback.category || 'general'),
    campaignName: clean(creative.campaignName || fallback.campaignName),
    campaignId: clean(creative.campaignId || fallback.campaignId),
    brandName: clean(creative.brandKit && creative.brandKit.name || fallback.brandName),
    headline: clean(head && head.content || fallback.headline),
    description: clean(body && body.content || fallback.description || fallback.text),
    descriptionColor: validColor(body && body.style && body.style.fill || fallback.descriptionColor || fallback.textColor, '#102A43'),
    descriptionSize: Number(body && body.style && body.style.fontSize) || Number(fallback.descriptionSize) || 20,
    descriptionAlign: clean(body && body.style && body.style.textAlign || fallback.descriptionAlign || fallback.textAlign || 'left'),
    offer: clean(creative.offer || price && price.content || fallback.offer || fallback.priceTag),
    offerColor: validColor(price && price.style && price.style.backgroundColor || fallback.offerColor || creative.background?.color2, '#167A91'),
    offerTextColor: validColor(price && price.style && price.style.fill || fallback.offerTextColor || fallback.textColor, '#102A43'),
    offerSize: Number(price && price.style && price.style.fontSize) || Number(fallback.offerSize) || 24,
    offerAlign: clean(price && price.style && price.style.textAlign || fallback.offerAlign || 'left'),
    badgeText: clean(badge && badge.content || fallback.badgeText),
    badgeFontSize: Number(badge && badge.style && badge.style.fontSize) || Number(fallback.badgeFontSize) || 14,
    badgeTextAlign: clean(badge && badge.style && badge.style.textAlign || fallback.badgeTextAlign || 'center'),
    badgeColor: validColor(badge && badge.style && badge.style.backgroundColor || fallback.badgeColor, '#F59E0B'),
    badgeTextColor: validColor(badge && badge.style && badge.style.fill || fallback.badgeTextColor, '#FFFFFF'),
    badgeStyle: clean(badge && badge.style && badge.style.badgeStyle || fallback.badgeStyle || 'pill'),
    badgeSize: clean(badge && badge.style && badge.style.badgeSize || fallback.badgeSize || 'md'),
    badgePosition: clean(badge && badge.style && badge.style.badgePosition || fallback.badgePosition || 'tr'),
    badgeIcon: clean(badge && badge.style && badge.style.badgeIcon || fallback.badgeIcon || 'none'),
    badgeOpacity: Number.isFinite(Number(badge && badge.opacity)) ? Number(badge.opacity) : (Number(fallback.badgeOpacity) || 1),
    badgeAnimation: clean((badge && badge.animation && (badge.animation.emphasis && badge.animation.emphasis !== 'none' ? badge.animation.emphasis : badge.animation.entrance)) || fallback.badgeAnimation || 'none'),
    ctaLabel: isCommonCta ? ctaContent : (ctaContent ? 'Custom' : ''),
    ctaCustom: isCommonCta ? '' : ctaContent,
    ctaStyle: clean(cta && cta.style && cta.style.ctaStyle || fallback.ctaStyle || 'solid'),
    ctaIcon: clean(cta && cta.style && cta.style.ctaIcon || fallback.ctaIcon || 'arrow'),
    ctaAlign: clean(cta && cta.style && cta.style.ctaAlign || fallback.ctaAlign || ''),
    ctaAnimation: clean((cta && cta.animation && cta.animation.emphasis && cta.animation.emphasis !== 'none' ? cta.animation.emphasis : '') || fallback.ctaAnimation || 'none'),
    link: clean(creative.destination && (creative.destination.type === 'external' ? creative.destination.url : (creative.destination.type && creative.destination.id ? '#' + creative.destination.type + '-' + creative.destination.id : '')) || fallback.link),
    imageUrl: clean(first('image') && first('image').src || fallback.image || fallback.imageUrl),
    videoUrl: clean(video && (video.src || video.videoUrl) || fallback.videoUrl),
    audioUrl: clean(audio && (audio.src || audio.audioUrl) || fallback.audioUrl),
    logoUrl: clean(creative.brandKit && creative.brandKit.logoUrl || fallback.logoUrl),
    backgroundMode: creative.background && creative.background.type === 'color' ? 'solid' : 'gradient',
    backgroundImageUrl: clean(creative.background && creative.background.imageUrl || fallback.backgroundImageUrl),
    primaryColor: validColor(creative.background && creative.background.color || fallback.primaryColor, '#0E7A5F'),
    accentColor: validColor(creative.background && creative.background.color2 || fallback.accentColor, '#167A91'),
    textColor: validColor(head && head.style && head.style.fill || fallback.textColor, '#102A43'),
    surfaceColor: validColor(creative.background && creative.background.surfaceColor || fallback.surfaceColor, '#FFFFFF'),
    frameOpacity: Number.isFinite(Number(creative.background && creative.background.frameOpacity)) ? Number(creative.background.frameOpacity) : (Number.isFinite(Number(fallback.frameOpacity)) ? Number(fallback.frameOpacity) : .42),
    borderRadius: Number.isFinite(Number(creative.background && creative.background.borderRadius)) ? Number(creative.background.borderRadius) : Number(fallback.borderRadius) || 22,
    gradientAngle: Number(creative.background && creative.background.angle) || Number(fallback.gradientAngle) || 135,
    fontWeight: Number(head && head.style && head.style.fontWeight) || Number(fallback.fontWeight) || 800,
    fontSize: Number(head && head.style && head.style.fontSize) || Number(fallback.fontSize) || 64,
    textAlign: clean(head && head.style && head.style.textAlign || fallback.textAlign || 'left'),
    textShadow: clean(head && head.style && head.style.textShadow || fallback.textShadow || 'none'),
    textEmphasis: clean(head && head.animation && head.animation.emphasis || fallback.textEmphasis || 'none'),
    animationMode: clean(head && head.animation && head.animation.mode || fallback.animationMode || 'whole'),
    headlineLetterSpacing: Number.isFinite(Number(head && head.style && head.style.letterSpacing)) ? Number(head.style.letterSpacing) : (Number(fallback.headlineLetterSpacing) || 0),
    headlineLineHeight: Number(head && head.style && head.style.lineHeight) || Number(fallback.headlineLineHeight) || 1.1,
    mediaFit: clean(mediaStyle.fit || fallback.objectFit || fallback.fit || 'cover'),
    focalX: Number.isFinite(Number(mediaStyle.focalX)) ? Number(mediaStyle.focalX) : (Number.isFinite(Number(fallback.focalX)) ? Number(fallback.focalX) : 50),
    focalY: Number.isFinite(Number(mediaStyle.focalY)) ? Number(mediaStyle.focalY) : (Number.isFinite(Number(fallback.focalY)) ? Number(fallback.focalY) : 50),
    overlayOpacity: Number.isFinite(Number(mediaStyle.overlayOpacity)) ? Number(mediaStyle.overlayOpacity) : (Number(fallback.overlayOpacity) || 0),
    brightness: Number(mediaFilter.brightness) || Number(fallback.brightness) || 100,
    contrast: Number(mediaFilter.contrast) || Number(fallback.contrast) || 100,
    saturation: Number.isFinite(Number(mediaFilter.saturation)) ? Number(mediaFilter.saturation) : (Number(fallback.saturation) || 100),
    designMode: design.mode || (fallback.designMode === 'auto' ? 'auto' : 'manual'),
    designViewId: clean(design.viewId || fallback.designViewId),
    presetId: clean(design.presetId || fallback.presetId),
    fontFamily: clean(design.fontFamily || fallback.headlineFont || fallback.fontFamily),
    cardShadow: clean(design.cardShadow || fallback.cardShadow),
    mediaPosition: design.mediaPosition === 'bottom' || fallback.mediaPosition === 'bottom' ? 'bottom' : 'top',
    hiddenElements: Array.isArray(design.hidden) ? design.hidden.slice() : (Array.isArray(fallback.hiddenElements) ? fallback.hiddenElements.slice() : []),
    lockedElements: Array.isArray(design.locked) ? design.locked.slice() : [],
    elementOrder: Array.isArray(design.order) && design.order.length ? design.order.slice() : ['media', 'headline', 'description', 'offer', 'cta'],
    typeLocked: design.typeLocked === true,
    formatLocked: design.formatLocked === true,
    touched: Array.isArray(design.touched) ? design.touched.slice() : [],
    autoReasons: Array.isArray(design.autoReasons) ? design.autoReasons.slice() : [],
    textAnimation: clean(head && head.animation && head.animation.entrance || fallback.textAnimation || 'none'),
    animationDuration: Number(head && head.animation && head.animation.duration) || Number(fallback.animationDuration) || 600,
    paletteId: clean(creative.paletteId || fallback.paletteId),
    format,
    slideshow,
    creativeDuration: Number(creative.duration) || Number(fallback.creativeDuration) || 9,
    timingMode: creative.durationAuto === false ? 'custom' : 'auto',
    videoOriginalDuration: Number(videoMeta.duration) || Number(fallback.videoOriginalDuration) || 0,
    videoTrimStart: trimStart,
    videoTrimEnd: trimEnd,
    videoLoop: videoMeta.loop !== false,
    videoMuted: videoMeta.muted !== false,
    priority: Number(creative.priority) || Number(fallback.priority) || 0,
    startAt: String(creative.startAt || fallback.startAt || ''),
    endAt: String(creative.endAt || fallback.endAt || ''),
    displayDurationSeconds: Number(creative.displayDurationSeconds) || Number(fallback.displayDurationSeconds) || 9,
    mediaDurationSeconds: mediaDuration || Number(fallback.mediaDurationSeconds) || 0,
    status: clean(fallback.status || 'draft'),
    creativeId: clean(creative.id || fallback.creativeId)
  };
}

/** Basic Creator publish gates; validates through the canonical model too. */
export function validateBasicCreative(form = {}, inputCreative = null, options = {}) {
  const creative = inputCreative ? normalizeCreative(inputCreative) : buildBasicCreative(form);
  const result = validateCreative(creative, { forPublish: options.forPublish !== false, requireSchedule: options.requireSchedule === true, now: options.now });
  return { ok: result.ok, errors: result.errors.map(error => error.message), ruleErrors: result.errors, creative };
}

export function basicCreativeAnnouncement(input, fallback = {}) {
  return creativeToAdvertisement(normalizeCreative(input || {}), fallback);
}
