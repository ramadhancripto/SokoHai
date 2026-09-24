/*
 * SokoHai Ads Design rules — shared verbatim by the browser creative model and
 * Firebase Functions. Keep validation, limits and announcement projection here
 * so Basic, Advanced, preview, publish and Home cannot drift apart.
 *
 * This file is deliberately UMD/CommonJS-compatible: browser ESM imports it for
 * its global API; Cloud Functions require the exact same implementation.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.SokoHaiAdsDesignRules = api;
})(typeof globalThis === 'object' ? globalThis : null, function () {
  'use strict';

  const MAX_AD_MEDIA_SECONDS = 60;
  const MAX_AD_DURATION_SECONDS = 59;
  const MIN_AD_DURATION_SECONDS = 1;
  const DISPLAY_DURATION_SECONDS = Object.freeze({ min: 5, max: 59, default: 9 });
  const MAX_SLIDESHOW_SLIDES = 12;
  const MIN_SLIDESHOW_SLIDES = 2;
  const MIN_SLIDE_DURATION_SECONDS = 1;
  const MAX_SLIDE_DURATION_SECONDS = 30;
  const DEFAULT_SLIDE_DURATION_SECONDS = 3;
  const MAX_SLIDESHOW_DURATION_SECONDS = 59;
  const SLIDESHOW_TRANSITIONS = Object.freeze(['none', 'fade', 'slide', 'slide-left', 'slide-right', 'zoom', 'crossfade']);
  const ENTRANCE_ANIMATIONS = Object.freeze(['none', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'zoom-in', 'zoom-out', 'pop', 'bounce', 'typewriter', 'reveal', 'mask-reveal', 'blur-in']);
  const EMPHASIS_ANIMATIONS = Object.freeze(['none', 'pulse', 'glow', 'shake', 'bounce', 'scale', 'wobble', 'highlight']);
  const EXIT_ANIMATIONS = Object.freeze(['none', 'fade-out', 'slide-out', 'zoom-out', 'blur-out']);
  const ANIMATION_MODES = Object.freeze(['whole', 'word', 'character', 'line']);
  const BADGE_ANIMATIONS = Object.freeze(['none', 'pop', 'pulse', 'glow', 'slide', 'scale', 'shake']);
  const CTA_ANIMATIONS = Object.freeze(['none', 'fade', 'slide', 'pulse', 'glow', 'scale', 'shine']);
  const TEXT_ALIGNMENTS = Object.freeze(['left', 'center', 'right']);
  const ANIMATION_EASINGS = Object.freeze(['ease-out', 'ease-in-out', 'ease-in', 'linear', 'cubic-bezier(0.34, 1.56, 0.64, 1)']);
  const FIT_MODES = Object.freeze(['cover', 'contain', 'fill', 'original']);
  const FOCAL_POINTS = Object.freeze(['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right']);
  const TEXT_ROLE_LIMITS = Object.freeze({ headline: 120, body: 320, price: 40, badge: 40, cta: 32 });
  const TEXT_ROLE_SIZES = Object.freeze({
    headline: Object.freeze({ min: 18, max: 120 }),
    body: Object.freeze({ min: 12, max: 36 }),
    price: Object.freeze({ min: 14, max: 48 }),
    badge: Object.freeze({ min: 10, max: 28 }),
    cta: Object.freeze({ min: 14, max: 48 })
  });
  const ANIMATION_LIMITS = Object.freeze({ duration: Object.freeze({ min: 100, max: 3000 }), delay: Object.freeze({ min: 0, max: 2000 }), stagger: Object.freeze({ min: 0, max: 400 }), repeat: Object.freeze({ min: 1, max: 20 }) });
  const BASIC_AD_TYPES = Object.freeze(['image_text', 'image', 'solid_text', 'video', 'video_text', 'image_audio', 'slideshow', 'full_multimedia', 'image_video', 'video_audio', 'audio']);
  /* [AD DESIGNER 2026-09-24] Canonical design block of a creative (one model):
     view/preset, layers visibility/lock/order, card surface tokens. */
  const DESIGN_FONT_KEYS = Object.freeze(['sans', 'serif', 'rounded', 'display']);
  const DESIGN_SHADOWS = Object.freeze(['none', 'soft', 'lifted', 'glow']);
  const DESIGN_ELEMENTS = Object.freeze(['brand', 'badge', 'media', 'headline', 'description', 'offer', 'cta']);
  const DESIGN_ORDERABLE = Object.freeze(['media', 'headline', 'description', 'offer', 'cta']);
  const AD_MEDIA_FILE_LIMITS_BYTES = Object.freeze({
    image: 8 * 1024 * 1024,
    logo: 4 * 1024 * 1024,
    video: 80 * 1024 * 1024,
    audio: 20 * 1024 * 1024
  });
  const AD_MEDIA_UPLOAD_FOLDER = 'sokohai/creative-assets';
  const COMPOSITION_LABELS = Object.freeze({
    image: 'Hero Image Advertisement',
    video: 'Video Advertisement',
    audio: 'Audio Advertisement',
    image_audio: 'Image Audio Advertisement',
    image_video: 'Image + Video Advertisement',
    slideshow: 'Slideshow',
    slideshow_audio: 'Slideshow + Audio Advertisement',
    video_audio: 'Video + Audio Advertisement',
    video_text: 'Video Text Advertisement',
    full_mix: 'Full Multimedia Ad',
    poster: 'Graphic/Text Advertisement',
    sponsored: 'Sponsored Post'
  });

  const clean = value => String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').trim();
  const finite = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value, min)));
  const validColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
  const isHttps = value => /^https:\/\//i.test(String(value || '')) && !/[\s"'<>]/.test(String(value || ''));
  const hasImageSource = value => /^(https:\/\/|blob:|data:image\/)/i.test(String(value || ''));
  const hasSource = hasImageSource;

  function parseSlideshow(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  /* Preserve creative/slide extensions. Canonical normalization fills shared
     defaults without silently truncating/clamping invalid duration or media data. */
  function normalizeSlideshow(input) {
    const base = { enabled: false, transition: 'fade', defaultDuration: DEFAULT_SLIDE_DURATION_SECONDS, slides: [] };
    const source = parseSlideshow(input);
    if (!source || typeof source !== 'object') return base;
    const defaultDuration = finite(source.defaultDuration, DEFAULT_SLIDE_DURATION_SECONDS);
    const slides = Array.isArray(source.slides) ? source.slides.map(slide => {
      const s = slide && typeof slide === 'object' ? slide : {};
      return { ...s, src: clean(s.src), name: clean(s.name), duration: finite(s.duration, defaultDuration) };
    }) : [];
    return {
      ...base,
      ...source,
      enabled: source.enabled === true,
      transition: SLIDESHOW_TRANSITIONS.includes(String(source.transition || '')) ? String(source.transition) : 'fade',
      defaultDuration,
      slides
    };
  }

  const DEFAULT_LAYER_STYLE = Object.freeze({
    fill: '#102A43', fontFamily: 'Inter', fontSize: 72, fontWeight: 800, fontStyle: 'normal', textDecoration: 'none',
    letterSpacing: 0, lineHeight: 1.1, textAlign: 'left', textTransform: 'none',
    stroke: '#FFFFFF', strokeWidth: 0, strokeOpacity: 1,
    shadowColor: '#000000', shadowOpacity: 0, shadowBlur: 12, shadowX: 0, shadowY: 5,
    glowColor: '#18A982', glowBlur: 0,
    radius: 24, borderColor: '#000000', borderWidth: 0, backgroundColor: 'transparent', padding: 0,
    flipX: false, flipY: false, frameShape: 'rounded', fit: 'cover', focalX: 50, focalY: 50,
    overlayColor: '#000000', overlayOpacity: 0, cropX: 0, cropY: 0, zoom: 1,
    originalSrc: '', cutoutDataUrl: ''
  });
  const DEFAULT_FILTER = Object.freeze({ brightness: 100, contrast: 100, saturation: 100, blur: 0, temperature: 0, sharpness: 0, exposure: 100, highlights: 100, shadows: 100 });
  const DEFAULT_ANIMATION = Object.freeze({ enabled: false, entrance: 'none', emphasis: 'none', exit: 'none', mode: 'whole', duration: 600, delay: 0, stagger: 100, repeat: 1, direction: 'normal', easing: 'ease-out', trigger: 'load', intensity: 5 });

  function createLayer(type, patch = {}) {
    const t = String(type || patch.type || 'shape');
    const videoDefaults = { autoplay: false, muted: true, loop: true, trimStart: 0, trimEnd: 30, duration: 0, controls: false };
    const audioDefaults = { volume: 1, fadeIn: 0, fadeOut: 0, loop: true, trimStart: 0, trimEnd: 30, duration: 0, track: 'background' };
    const style = {
      ...DEFAULT_LAYER_STYLE,
      originalSrc: patch.originalSrc || patch.src || '',
      filter: { ...DEFAULT_FILTER, ...(patch.style && patch.style.filter || {}) },
      ...(patch.style || {})
    };
    style.filter = { ...DEFAULT_FILTER, ...(patch.style && patch.style.filter || {}) };
    return {
      id: patch.id || ('ly_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)),
      type: t, x: 120, y: 120, width: 620, height: t === 'text' ? 150 : t === 'audio' ? 80 : 420,
      rotation: 0, opacity: 1, zIndex: 1, locked: false, visible: true,
      name: t.charAt(0).toUpperCase() + t.slice(1), groupId: null,
      src: patch.src || '', originalSrc: patch.originalSrc || patch.src || '',
      videoUrl: patch.videoUrl || (t === 'video' ? patch.src || '' : ''),
      audioUrl: patch.audioUrl || (t === 'audio' ? patch.src || '' : ''), posterUrl: patch.posterUrl || '',
      focalPoint: patch.focalPoint || 'center',
      startTime: Number.isFinite(+patch.startTime) ? +patch.startTime : 0,
      endTime: Number.isFinite(+patch.endTime) ? +patch.endTime : 30,
      duration: Number.isFinite(+patch.duration) ? +patch.duration : 30,
      crop: { x: 0, y: 0, width: 100, height: 100, zoom: 1, ...(patch.crop || {}) },
      videoMeta: { ...videoDefaults, ...(patch.videoMeta || {}) },
      audioMeta: { ...audioDefaults, ...(patch.audioMeta || {}) },
      animation: { ...DEFAULT_ANIMATION, ...(patch.animation || {}) },
      content: t === 'text' ? 'Andika hapa' : '',
      style,
      ...patch,
      crop: { x: 0, y: 0, width: 100, height: 100, ...(patch.crop || {}) },
      videoMeta: { ...videoDefaults, ...(patch.videoMeta || {}) },
      audioMeta: { ...audioDefaults, ...(patch.audioMeta || {}) },
      animation: { ...DEFAULT_ANIMATION, ...(patch.animation || {}) },
      style: { ...style, ...(patch.style || {}), filter: { ...DEFAULT_FILTER, ...(patch.style && patch.style.filter || {}) } }
    };
  }

  function normalizeDesign(value) {
    const d = value && typeof value === 'object' ? value : null;
    if (!d) return null;
    const list = (v, allowed) => Array.from(new Set((Array.isArray(v) ? v : []).map(String).filter(x => allowed.includes(x))));
    const order = list(d.order, DESIGN_ORDERABLE);
    DESIGN_ORDERABLE.forEach(x => { if (!order.includes(x)) order.push(x); });
    return {
      version: Math.max(1, finite(d.version, 1)),
      mode: d.mode === 'manual' ? 'manual' : 'auto',
      viewId: clean(d.viewId).slice(0, 80),
      presetId: clean(d.presetId).slice(0, 40),
      fontFamily: DESIGN_FONT_KEYS.includes(String(d.fontFamily)) ? String(d.fontFamily) : '',
      cardShadow: DESIGN_SHADOWS.includes(String(d.cardShadow)) ? String(d.cardShadow) : '',
      mediaPosition: d.mediaPosition === 'bottom' ? 'bottom' : 'top',
      hidden: list(d.hidden, DESIGN_ELEMENTS),
      locked: list(d.locked, DESIGN_ELEMENTS),
      order,
      typeLocked: d.typeLocked === true,
      formatLocked: d.formatLocked === true,
      touched: Array.from(new Set((Array.isArray(d.touched) ? d.touched : []).map(String).filter(x => /^[A-Za-z]{2,40}$/.test(x)))).slice(0, 80),
      autoReasons: (Array.isArray(d.autoReasons) ? d.autoReasons : []).map(x => clean(x).slice(0, 180)).filter(Boolean).slice(0, 12)
    };
  }

  function normalizeCreative(input, defaults = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const fallback = defaults && typeof defaults === 'object' ? defaults : {};
    const merged = { ...fallback, ...source };
    const canvas = { ...(fallback.canvas || {}), ...(source.canvas || {}) };
    canvas.width = clamp(canvas.width, 240, 4096);
    canvas.height = clamp(canvas.height, 240, 4096);
    canvas.safe = clamp(canvas.safe, 0, Math.min(canvas.width, canvas.height) / 3);
    const background = { ...(fallback.background || {}), ...(source.background || {}) };
    background.filter = { ...((fallback.background && fallback.background.filter) || {}), ...((source.background && source.background.filter) || {}) };
    const inputLayers = Array.isArray(source.layers) ? source.layers : (Array.isArray(fallback.layers) ? fallback.layers : []);
    const seenIds = new Set();
    const layers = inputLayers.map((raw, index) => {
      const layer = raw && typeof raw === 'object' ? raw : {};
      let id = clean(layer.id) || 'legacy_layer_' + (index + 1);
      if (seenIds.has(id)) id += '_' + (index + 1);
      seenIds.add(id);
      const normalized = createLayer(layer.type || 'shape', {
        ...layer,
        id,
        x: clamp(layer.x, -canvas.width, canvas.width * 2),
        y: clamp(layer.y, -canvas.height, canvas.height * 2),
        width: clamp(layer.width, 1, canvas.width * 3),
        height: clamp(layer.height, 1, canvas.height * 3),
        rotation: clamp(layer.rotation, -360, 360),
        opacity: clamp(layer.opacity, 0, 1),
        startTime: Math.max(0, finite(layer.startTime, 0)),
        endTime: Math.min(MAX_AD_DURATION_SECONDS, finite(layer.endTime, MAX_AD_DURATION_SECONDS)),
        duration: Math.max(0, finite(layer.duration, MAX_AD_DURATION_SECONDS)),
        zIndex: Number.isFinite(+layer.zIndex) ? +layer.zIndex : index + 1,
        content: clean(layer.content),
        groupId: layer.groupId || null
      });
      return normalized;
    });
    const durationValue = source.duration == null || source.duration === '' ? finite(fallback.duration, 30) : finite(source.duration, finite(fallback.duration, 30));
    const displayValue = source.displayDurationSeconds == null || source.displayDurationSeconds === ''
      ? finite(fallback.displayDurationSeconds, DISPLAY_DURATION_SECONDS.default)
      : finite(source.displayDurationSeconds, finite(fallback.displayDurationSeconds, DISPLAY_DURATION_SECONDS.default));
    const slideshow = normalizeSlideshow(Object.prototype.hasOwnProperty.call(source, 'slideshow') ? source.slideshow : fallback.slideshow);
    const normalized = {
      ...merged,
      canvas,
      background,
      layers,
      duration: durationValue,
      maxDuration: MAX_AD_DURATION_SECONDS,
      slideshow,
      designMode: source.designMode === 'manual' ? 'manual' : (fallback.designMode === 'manual' ? 'manual' : 'auto'),
      category: clean(source.category || fallback.category || 'general') || 'general',
      campaignName: clean(source.campaignName || ''),
      campaignId: clean(source.campaignId || ''),
      offer: clean(source.offer || ''),
      paletteId: clean(source.paletteId || ''),
      priority: Math.max(0, finite(source.priority, finite(fallback.priority, 0))),
      startAt: typeof source.startAt === 'string' ? source.startAt : (typeof fallback.startAt === 'string' ? fallback.startAt : ''),
      endAt: typeof source.endAt === 'string' ? source.endAt : (typeof fallback.endAt === 'string' ? fallback.endAt : ''),
      displayDurationSeconds: displayValue,
      audioMix: { ...(fallback.audioMix || {}), ...(source.audioMix || {}) },
      timeline: Array.isArray(source.timeline) ? source.timeline : (Array.isArray(fallback.timeline) ? fallback.timeline : []),
      durationAuto: source.durationAuto === false ? false : (source.durationAuto === true ? true : fallback.durationAuto),
      basicType: Object.prototype.hasOwnProperty.call(source, 'basicType') ? source.basicType : fallback.basicType
    };
    const design = normalizeDesign(Object.prototype.hasOwnProperty.call(source, 'design') ? source.design : fallback.design);
    if (design) normalized.design = design; else delete normalized.design;
    if (normalized.durationAuto === true) normalized.duration = autoAdDuration(normalized);
    return normalized;
  }

  function slideshowTotal(creative) {
    const ss = creative && creative.slideshow;
    if (!ss || !Array.isArray(ss.slides)) return 0;
    return ss.slides.reduce((sum, slide) => sum + finite(slide && slide.duration, 0), 0);
  }

  function mediaLayers(creative) {
    return Array.isArray(creative && creative.layers) ? creative.layers.filter(layer => layer && layer.visible !== false) : [];
  }

  function detectComposition(creative) {
    const x = creative && typeof creative === 'object' ? creative : {};
    const layers = mediaLayers(x);
    const ss = normalizeSlideshow(x.slideshow);
    const hasSlides = ss.enabled && ss.slides.filter(slide => slide && slide.src).length >= MIN_SLIDESHOW_SLIDES;
    const hasVideo = layers.some(layer => layer.type === 'video' && (layer.src || layer.videoUrl));
    const hasImage = layers.some(layer => (layer.type === 'image' || layer.type === 'logo') && (layer.src || layer.originalSrc));
    const hasAudio = layers.some(layer => layer.type === 'audio' && (layer.src || layer.audioUrl));
    const hasOffer = !!clean(x.offer) || layers.some(layer => layer.role === 'price' && clean(layer.content));
    if (hasSlides) return hasAudio ? 'slideshow_audio' : 'slideshow';
    if (hasVideo && hasImage) return hasAudio ? 'full_mix' : 'image_video';
    if (hasVideo) return hasOffer ? 'video_text' : (hasAudio ? 'video_audio' : 'video');
    if (hasImage) return hasAudio ? 'image_audio' : (hasOffer ? 'sponsored' : 'image');
    if (hasAudio) return 'audio';
    return 'poster';
  }

  function autoAdDuration(creative) {
    const x = creative && typeof creative === 'object' ? creative : {};
    const composition = detectComposition(x);
    if (composition === 'slideshow' || composition === 'slideshow_audio') {
      return Math.min(MAX_AD_DURATION_SECONDS, Math.max(3, Math.round(slideshowTotal(x) || 6)));
    }
    const video = mediaLayers(x).find(layer => layer.type === 'video' && (layer.src || layer.videoUrl));
    if (video) {
      const meta = video.videoMeta || {};
      const start = Math.max(0, finite(meta.trimStart, 0));
      const end = finite(meta.trimEnd, 0);
      const duration = end > start ? end - start : finite(meta.duration, 0);
      if (duration > 0) return Math.min(MAX_AD_DURATION_SECONDS, Math.max(1, Math.round(duration)));
    }
    const audio = mediaLayers(x).find(layer => layer.type === 'audio' && (layer.src || layer.audioUrl));
    if (audio) {
      const meta = audio.audioMeta || {};
      const start = Math.max(0, finite(meta.trimStart, 0));
      const end = finite(meta.trimEnd, 0);
      const duration = end > start ? end - start : finite(meta.duration, 0);
      if (duration > 0) return Math.min(MAX_AD_DURATION_SECONDS, Math.max(1, Math.round(duration)));
    }
    return DISPLAY_DURATION_SECONDS.default;
  }

  const MEDIA_EXTENSIONS = Object.freeze({
    image: /\.(?:jpe?g|png|webp|gif|svg|bmp|avif)$/i,
    video: /\.(?:mp4|webm|mov|m4v|mkv|ogv)$/i,
    audio: /\.(?:mp3|wav|m4a|aac|ogg|flac|opus)$/i
  });

  function detectAdMediaKind(file) {
    const mime = String(file && file.type || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    const name = String(file && file.name || file && file.url || '');
    for (const kind of Object.keys(MEDIA_EXTENSIONS)) if (MEDIA_EXTENSIONS[kind].test(name)) return kind;
    return '';
  }

  function validateAdMediaFile(file, options = {}) {
    const actualKind = detectAdMediaKind(file);
    const expectedKind = options.asLogo ? 'image' : String(options.kind || '');
    const kind = expectedKind || actualKind;
    const limitKey = options.asLogo ? 'logo' : kind;
    const limitBytes = AD_MEDIA_FILE_LIMITS_BYTES[limitKey] || 0;
    if (!actualKind) return { ok: false, code: 'MEDIA_TYPE', kind: '', limitBytes, message: 'Aina ya media haitambuliki. Tumia image, video au audio.' };
    if (expectedKind && actualKind !== expectedKind) {
      return { ok: false, code: 'MEDIA_TYPE', kind: actualKind, limitBytes, message: 'File type si sahihi kwa ' + expectedKind + '.' };
    }
    const size = Math.max(0, finite(file && file.size, 0));
    if (limitBytes && size > limitBytes) {
      return { ok: false, code: 'MEDIA_SIZE', kind: actualKind, limitBytes, message: 'File ni kubwa kuliko kiwango (' + Math.round(limitBytes / 1048576) + 'MB) kwa ' + limitKey + '.' };
    }
    return { ok: true, code: '', kind: actualKind, limitBytes, message: '' };
  }

  function roleLayer(layers, role) {
    return layers.find(layer => layer.role === role && layer.type === 'text' && layer.visible !== false) || null;
  }

  function compositionToAnnouncementType(creative, layers, slideshow) {
    const explicit = String(creative && creative.basicType || '');
    if (BASIC_AD_TYPES.includes(explicit)) return explicit;
    const composition = detectComposition(creative);
    const headline = roleLayer(layers, 'headline');
    const body = roleLayer(layers, 'body');
    const hasText = !!(clean(headline && headline.content) || clean(body && body.content));
    if (composition === 'poster') return 'solid_text';
    if (composition === 'image') return hasText ? 'image_text' : 'image';
    if (composition === 'video') return hasText ? 'video_text' : 'video';
    if (composition === 'sponsored') return 'image_text';
    if (composition === 'full_mix') return 'full_multimedia';
    return composition;
  }

  function creativeToAdvertisement(creative, fallback = {}) {
    const c = creative && typeof creative === 'object' ? creative : {};
    const layers = Array.isArray(c.layers) ? c.layers : [];
    const visibleLayers = layers.filter(layer => layer && layer.visible !== false);
    const role = name => roleLayer(visibleLayers, name);
    const allRole = name => layers.find(layer => layer && layer.role === name && layer.type === 'text') || null;
    const type = compositionToAnnouncementType(c, layers, c.slideshow);
    const textVisible = !['image', 'video'].includes(type);
    const headlineLayer = role('headline') || allRole('headline');
    const bodyLayer = role('body') || allRole('body');
    const priceLayer = role('price') || allRole('price');
    const badgeLayer = role('badge') || allRole('badge');
    const ctaLayer = role('cta') || allRole('cta');
    const ctaBgLayer = visibleLayers.find(layer => layer.role === 'cta-bg') || layers.find(layer => layer && layer.role === 'cta-bg') || null;
    const imageLayer = visibleLayers.find(layer => layer.type === 'image' && (layer.src || layer.originalSrc))
      || visibleLayers.find(layer => layer.type === 'logo' && (layer.src || layer.originalSrc)) || null;
    const videoLayer = visibleLayers.find(layer => layer.type === 'video' && (layer.src || layer.videoUrl)) || null;
    const audioLayer = visibleLayers.find(layer => layer.type === 'audio' && (layer.src || layer.audioUrl)) || null;
    const slideshowState = normalizeSlideshow(c.slideshow);
    const slides = slideshowState.enabled && slideshowState.slides.length >= MIN_SLIDESHOW_SLIDES ? slideshowState : null;
    const visibleMedia = type === 'slideshow' || type === 'slideshow_audio'
      ? { image: slides && slides.slides[0] && slides.slides[0].src || imageLayer && (imageLayer.src || imageLayer.originalSrc) || '', video: '', audio: audioLayer }
      : type === 'image' || type === 'image_text'
        ? { image: imageLayer && (imageLayer.src || imageLayer.originalSrc) || '', video: '', audio: null }
        : type === 'video' || type === 'video_text'
          ? { image: '', video: videoLayer, audio: null }
          : type === 'image_audio'
            ? { image: imageLayer && (imageLayer.src || imageLayer.originalSrc) || '', video: '', audio: audioLayer }
            : type === 'audio'
              ? { image: '', video: '', audio: audioLayer }
            : type === 'image_video'
              ? { image: imageLayer && (imageLayer.src || imageLayer.originalSrc) || '', video: videoLayer, audio: null }
            : type === 'video_audio'
              ? { image: '', video: videoLayer, audio: audioLayer }
            : type === 'full_multimedia'
              ? { image: imageLayer && (imageLayer.src || imageLayer.originalSrc) || '', video: videoLayer, audio: audioLayer }
              : type === 'solid_text'
                ? { image: imageLayer && (imageLayer.src || imageLayer.originalSrc) || '', video: '', audio: audioLayer }
                : { image: imageLayer && (imageLayer.src || imageLayer.originalSrc) || '', video: videoLayer, audio: audioLayer };
    const headStyle = headlineLayer && headlineLayer.style || {};
    const bodyStyle = bodyLayer && bodyLayer.style || {};
    const priceStyle = priceLayer && priceLayer.style || {};
    const badgeStyle = badgeLayer && badgeLayer.style || {};
    const ctaStyle = ctaLayer && ctaLayer.style || {};
    const ctaBgStyle = ctaBgLayer && ctaBgLayer.style || {};
    const headAnimation = headlineLayer && headlineLayer.animation || {};
    const badgeAnimation = badgeLayer && badgeLayer.animation || {};
    const ctaAnimation = ctaLayer && ctaLayer.animation || {};
    const videoMeta = videoLayer && videoLayer.videoMeta || {};
    const audioMeta = audioLayer && audioLayer.audioMeta || {};
    const background = c.background && typeof c.background === 'object' ? c.background : {};
    const filter = (imageLayer && imageLayer.style && imageLayer.style.filter) || (videoLayer && videoLayer.style && videoLayer.style.filter) || {};
    const destination = c.destination && typeof c.destination === 'object' ? c.destination : {};
    const internalLink = destination.type && destination.id ? '#' + String(destination.type) + '-' + String(destination.id) : '';
    const link = destination.type === 'external' ? clean(destination.url) : (internalLink || clean(fallback.link));
    const videoStart = Math.max(0, finite(videoMeta.trimStart, 0));
    const videoEnd = finite(videoMeta.trimEnd, 0);
    const videoDuration = videoEnd > videoStart ? videoEnd - videoStart : finite(videoMeta.duration, 0);
    const audioStart = Math.max(0, finite(audioMeta.trimStart, 0));
    const audioEnd = finite(audioMeta.trimEnd, 0);
    const audioDuration = audioEnd > audioStart ? audioEnd - audioStart : finite(audioMeta.duration, 0);
    const mediaDuration = visibleMedia.video ? videoDuration : slides ? slideshowTotal({ slideshow: slides }) : visibleMedia.audio ? audioDuration : 0;
    const animationToken = anim => {
      if (anim && anim.emphasis && anim.emphasis !== 'none') return String(anim.emphasis);
      return String(anim && anim.entrance || 'none');
    };
    const backgroundType = String(background.type || 'gradient');
    const ctaRadius = finite(ctaBgStyle.radius, finite(ctaStyle.radius, 0));
    let derivedCtaStyle = String(ctaStyle.ctaStyle || '');
    if (!derivedCtaStyle && ctaRadius >= 100) derivedCtaStyle = 'pill';
    else if (!derivedCtaStyle && ctaRadius > 0 && ctaRadius <= 10) derivedCtaStyle = 'square';
    else if (!derivedCtaStyle) derivedCtaStyle = 'solid';
    const titleShadow = finite(headStyle.shadowOpacity, 0) > 0 || finite(headStyle.glowBlur, 0) > 0
      ? (finite(headStyle.shadowOpacity, 0) > .55 || finite(headStyle.glowBlur, 0) > 12 ? 'strong' : 'subtle')
      : String(headStyle.textShadow || 'none');
    const format = String(c.format || 'landscape');
    const ratioByFormat = { '1:1': '1:1', '4:5': '4:5', '9:16': '9:16', '16:9': '16:9', square: '1:1', feed: '1:1', portrait: '4:5', story: '9:16', landscape: '16:9', banner: '16:9' };
    const animation = {
      enabled: !!headAnimation.enabled,
      entrance: String(headAnimation.entrance || 'none'),
      emphasis: String(headAnimation.emphasis || 'none'),
      exit: String(headAnimation.exit || 'none'),
      mode: String(headAnimation.mode || 'whole'),
      duration: finite(headAnimation.duration, 600),
      delay: finite(headAnimation.delay, 0),
      stagger: finite(headAnimation.stagger, 100),
      repeat: finite(headAnimation.repeat, 1),
      easing: String(headAnimation.easing || 'ease-out')
    };
    const textColor = validColor(headStyle.fill, validColor(fallback.textColor, '#FFFFFF'));
    const descriptionColor = validColor(bodyStyle.fill, validColor(fallback.descriptionColor, textColor));
    const priceText = textVisible ? clean(c.offer || priceLayer && priceLayer.content || fallback.offer || fallback.priceTag) : '';
    const ctaContent = clean(ctaLayer && ctaLayer.content);
    const badgeContent = textVisible ? clean(badgeLayer && badgeLayer.content || fallback.badgeText) : '';
    const poster = videoLayer && (videoLayer.posterUrl || imageLayer && imageLayer.src) || fallback.posterUrl || '';
    const design = normalizeDesign(c.design) || {};
    const headFont = String(headStyle.fontFamily || '');

    return {
      ...fallback,
      creativeType: type,
      category: clean(c.category || fallback.category || 'general'),
      campaignName: clean(c.campaignName || fallback.campaignName),
      campaignId: clean(c.campaignId || fallback.campaignId),
      brandName: clean(c.brandKit && c.brandKit.name || fallback.brandName || 'SokoHai'),
      headline: textVisible ? clean(headlineLayer && headlineLayer.content || c.title || fallback.headline) : '',
      description: textVisible ? clean(bodyLayer && bodyLayer.content || fallback.description || fallback.text) : '',
      text: textVisible ? clean(bodyLayer && bodyLayer.content || fallback.text || fallback.description) : '',
      headlineFontFamily: String(headStyle.fontFamily || fallback.headlineFontFamily || 'Inter'),
      headlineFontStyle: String(headStyle.fontStyle || fallback.headlineFontStyle || 'normal'),
      headlineTextDecoration: String(headStyle.textDecoration || fallback.headlineTextDecoration || 'none'),
      headlineLineHeight: finite(headStyle.lineHeight, finite(fallback.headlineLineHeight, 1.12)),
      headlineLetterSpacing: finite(headStyle.letterSpacing, finite(fallback.headlineLetterSpacing, 0)),
      descriptionFontFamily: String(bodyStyle.fontFamily || fallback.descriptionFontFamily || 'Inter'),
      descriptionFontWeight: finite(bodyStyle.fontWeight, finite(fallback.descriptionFontWeight, 500)),
      descriptionFontStyle: String(bodyStyle.fontStyle || fallback.descriptionFontStyle || 'normal'),
      descriptionTextDecoration: String(bodyStyle.textDecoration || fallback.descriptionTextDecoration || 'none'),
      descriptionLineHeight: finite(bodyStyle.lineHeight, finite(fallback.descriptionLineHeight, 1.45)),
      descriptionLetterSpacing: finite(bodyStyle.letterSpacing, finite(fallback.descriptionLetterSpacing, 0)),
      descriptionColor,
      descriptionSize: finite(bodyStyle.fontSize, finite(fallback.descriptionSize, 20)),
      descriptionAlign: String(bodyStyle.textAlign || fallback.descriptionAlign || headStyle.textAlign || 'left'),
      offer: priceText,
      priceTag: priceText,
      offerColor: validColor(priceStyle.backgroundColor, validColor(fallback.offerColor, validColor(background.color2, '#167A91'))),
      offerTextColor: validColor(priceStyle.fill, validColor(fallback.offerTextColor, textColor)),
      offerSize: finite(priceStyle.fontSize, finite(fallback.offerSize, 24)),
      offerAlign: String(priceStyle.textAlign || fallback.offerAlign || 'left'),
      badgeText: badgeContent,
      badgeFontSize: finite(badgeStyle.fontSize, finite(fallback.badgeFontSize, 14)),
      badgeTextAlign: String(badgeStyle.textAlign || fallback.badgeTextAlign || 'center'),
      badgeStyle: String(badgeStyle.badgeStyle || fallback.badgeStyle || 'pill'),
      badgeColor: validColor(badgeStyle.backgroundColor, validColor(fallback.badgeColor, '#F59E0B')),
      badgeTextColor: validColor(badgeStyle.fill, validColor(fallback.badgeTextColor, '#FFFFFF')),
      badgeSize: String(badgeStyle.badgeSize || fallback.badgeSize || 'md'),
      badgePosition: String(badgeStyle.badgePosition || fallback.badgePosition || 'tr'),
      badgeOpacity: clamp(badgeLayer && badgeLayer.opacity != null ? badgeLayer.opacity : (fallback.badgeOpacity == null ? 1 : fallback.badgeOpacity), .4, 1),
      badgeIcon: String(badgeStyle.badgeIcon || fallback.badgeIcon || 'none'),
      badgeAnimation: animationToken(badgeAnimation),
      ctaLabel: ctaContent || clean(fallback.ctaLabel),
      ctaStyle: derivedCtaStyle,
      ctaIcon: String(ctaStyle.ctaIcon || fallback.ctaIcon || 'arrow'),
      ctaAlign: ['left', 'center', 'right', 'full'].includes(String(ctaStyle.ctaAlign)) ? String(ctaStyle.ctaAlign) : (['left', 'center', 'right', 'full'].includes(String(fallback.ctaAlign)) ? String(fallback.ctaAlign) : ''),
      ctaAnimation: animationToken(ctaAnimation),
      ctaColor: validColor(ctaBgStyle.fill || ctaStyle.backgroundColor, validColor(fallback.ctaColor, '#F4C542')),
      ctaTextColor: validColor(ctaStyle.fill, validColor(fallback.ctaTextColor, '#102A43')),
      ctaRadius,
      link,
      image: visibleMedia.image,
      imageUrl: visibleMedia.image,
      videoUrl: visibleMedia.video ? clean(visibleMedia.video.src || visibleMedia.video.videoUrl) : '',
      audioUrl: visibleMedia.audio ? clean(visibleMedia.audio.src || visibleMedia.audio.audioUrl) : '',
      logoUrl: clean(c.brandKit && c.brandKit.logoUrl || fallback.logoUrl),
      posterUrl: clean(poster),
      backgroundMode: backgroundType === 'color' ? 'solid' : 'gradient',
      backgroundImageUrl: clean(background.imageUrl || fallback.backgroundImageUrl),
      primaryColor: validColor(background.color, validColor(fallback.primaryColor, '#0E7A5F')),
      accentColor: validColor(background.color2, validColor(fallback.accentColor, '#167A91')),
      surfaceColor: validColor(background.surfaceColor, validColor(fallback.surfaceColor, '#FFFFFF')),
      frameOpacity: clamp(background.frameOpacity == null ? (fallback.frameOpacity == null ? .42 : fallback.frameOpacity) : background.frameOpacity, .08, 1),
      gradientAngle: finite(background.angle, finite(fallback.gradientAngle, 135)),
      borderRadius: clamp(background.borderRadius == null ? (fallback.borderRadius == null ? 22 : fallback.borderRadius) : background.borderRadius, 0, 36),
      textColor,
      fontWeight: finite(headStyle.fontWeight, finite(fallback.fontWeight, 800)),
      fontSize: finite(headStyle.fontSize, finite(fallback.fontSize, 64)),
      textAlign: String(headStyle.textAlign || fallback.textAlign || 'left'),
      textShadow: titleShadow,
      textAnimation: String(headAnimation.entrance || fallback.textAnimation || 'none'),
      headlineAnimation: String(headAnimation.entrance || fallback.headlineAnimation || 'none'),
      textEmphasis: String(headAnimation.emphasis || fallback.textEmphasis || 'none'),
      textExit: String(headAnimation.exit || fallback.textExit || 'none'),
      animationMode: String(headAnimation.mode || fallback.animationMode || 'whole'),
      animationDuration: finite(headAnimation.duration, finite(fallback.animationDuration, 600)),
      animationDelay: finite(headAnimation.delay, finite(fallback.animationDelay, 0)),
      animationStagger: finite(headAnimation.stagger, finite(fallback.animationStagger, 100)),
      animation,
      paletteId: clean(c.paletteId || fallback.paletteId),
      aspectRatio: ratioByFormat[format] || clean(fallback.aspectRatio || fallback.format || '16:9'),
      format: ratioByFormat[format] || clean(fallback.format || '16:9'),
      objectFit: String((visibleMedia.video && visibleMedia.video.style && visibleMedia.video.style.fit) || (imageLayer && imageLayer.style && imageLayer.style.fit) || fallback.objectFit || 'cover'),
      fit: String((visibleMedia.video && visibleMedia.video.style && visibleMedia.video.style.fit) || (imageLayer && imageLayer.style && imageLayer.style.fit) || fallback.fit || 'cover'),
      focalPoint: String((imageLayer && imageLayer.focalPoint) || (videoLayer && videoLayer.focalPoint) || fallback.focalPoint || 'center'),
      focalX: finite(imageLayer && imageLayer.style && imageLayer.style.focalX, finite(fallback.focalX, 50)),
      focalY: finite(imageLayer && imageLayer.style && imageLayer.style.focalY, finite(fallback.focalY, 50)),
      brightness: finite(filter.brightness, finite(fallback.brightness, 100)),
      contrast: finite(filter.contrast, finite(fallback.contrast, 100)),
      saturation: finite(filter.saturation, finite(fallback.saturation, 100)),
      blur: finite(filter.blur, finite(fallback.blur, 0)),
      overlayColor: validColor((imageLayer && imageLayer.style && imageLayer.style.overlayColor) || (videoLayer && videoLayer.style && videoLayer.style.overlayColor), validColor(fallback.overlayColor, '#000000')),
      overlayOpacity: clamp((imageLayer && imageLayer.style && imageLayer.style.overlayOpacity) ?? (videoLayer && videoLayer.style && videoLayer.style.overlayOpacity) ?? fallback.overlayOpacity, 0, 1),
      slideshow: slides,
      creativeDuration: finite(c.duration, finite(fallback.creativeDuration, 9)),
      durationAuto: c.durationAuto !== false && fallback.durationAuto !== false,
      timingMode: c.durationAuto === false ? 'custom' : 'auto',
      videoOriginalDuration: finite(videoMeta.duration, finite(fallback.videoOriginalDuration, 0)),
      videoTrimStart: videoStart,
      videoTrimEnd: videoEnd || videoStart + videoDuration,
      videoLoop: videoMeta.loop !== false,
      videoMuted: videoMeta.muted !== false,
      videoControls: videoMeta.controls === true,
      mediaDurationSeconds: mediaDuration > 0 ? mediaDuration : finite(fallback.mediaDurationSeconds, 0),
      audioOriginalDuration: finite(audioMeta.duration, finite(fallback.audioOriginalDuration, 0)),
      audioTrimStart: audioStart,
      audioTrimEnd: audioEnd || audioStart + audioDuration,
      audioLoop: audioMeta.loop !== false,
      audioVolume: clamp(audioMeta.volume == null ? 1 : audioMeta.volume, 0, 1),
      priority: Math.max(0, finite(c.priority, finite(fallback.priority, 0))),
      startAt: String(c.startAt || fallback.startAt || ''),
      endAt: String(c.endAt || fallback.endAt || ''),
      displayDurationSeconds: finite(c.displayDurationSeconds, finite(fallback.displayDurationSeconds, DISPLAY_DURATION_SECONDS.default)),
      creativeId: clean(c.id || fallback.creativeId),
      /* [AD DESIGNER 2026-09-24] design system projection (same fields in preview + published) */
      designViewId: clean(design.viewId || fallback.designViewId),
      designMode: design.mode || clean(fallback.designMode) || '',
      headlineFont: DESIGN_FONT_KEYS.includes(headFont) ? headFont : (DESIGN_FONT_KEYS.includes(String(design.fontFamily)) ? design.fontFamily : ''),
      cardShadow: design.cardShadow || (DESIGN_SHADOWS.includes(String(fallback.cardShadow)) ? String(fallback.cardShadow) : ''),
      mediaPosition: design.mediaPosition || (fallback.mediaPosition === 'bottom' ? 'bottom' : 'top'),
      hiddenElements: Array.isArray(design.hidden) ? design.hidden.slice() : (Array.isArray(fallback.hiddenElements) ? fallback.hiddenElements.filter(x => DESIGN_ELEMENTS.includes(String(x))) : []),
      elementOrder: Array.isArray(design.order) ? design.order.slice() : DESIGN_ORDERABLE.slice(),
      status: clean(fallback.status || 'draft')
    };
  }

  function validateCreative(creative, options = {}) {
    const forPublish = options && options.forPublish === true;
    const c = creative && typeof creative === 'object' ? creative : {};
    const errors = [];
    const layers = Array.isArray(c.layers) ? c.layers : [];
    const visible = layers.filter(layer => layer && layer.visible !== false);
    const canvas = c.canvas && typeof c.canvas === 'object' ? c.canvas : {};
    const width = finite(canvas.width, 0), height = finite(canvas.height, 0);
    const add = (code, message, extra = {}) => errors.push({ code, message, ...extra });

    if (!Array.isArray(c.layers) || layers.length < 1) add('EMPTY', 'Add at least one visible layer.');
    if (layers.length > 150) add('LAYER_LIMIT', 'Creative ina layers zisizozidi 150.');
    if (width < 240 || height < 240 || width > 4096 || height > 4096) add('CANVAS', 'Creative canvas dimensions are invalid.');
    if (!visible.length) add('EMPTY', 'Add at least one visible layer.');

    visible.forEach(layer => {
      const name = clean(layer.name || layer.type || 'Layer');
      const extra = { layerId: layer.id };
      const x = finite(layer.x, 0), y = finite(layer.y, 0);
      const layerWidth = finite(layer.width, 0), layerHeight = finite(layer.height, 0);
      const style = layer.style && typeof layer.style === 'object' ? layer.style : {};
      const animation = layer.animation && typeof layer.animation === 'object' ? layer.animation : {};
      if (layer.type === 'text' && !clean(layer.content)) add('EMPTY_TEXT', name + ' has no text.', extra);
      if (layer.type === 'text' && TEXT_ROLE_LIMITS[layer.role] && clean(layer.content).length > TEXT_ROLE_LIMITS[layer.role]) {
        add('TEXT_LENGTH', name + ' ina herufi nyingi kuliko kiwango (' + TEXT_ROLE_LIMITS[layer.role] + ').', extra);
      }
      if (layerWidth <= 0 || layerHeight <= 0 || x + layerWidth < 0 || y + layerHeight < 0 || x > width || y > height) {
        add('OUTSIDE', name + ' is outside the canvas.', extra);
      }
      if (layer.type === 'text' && TEXT_ROLE_SIZES[layer.role]) {
        const limits = TEXT_ROLE_SIZES[layer.role], size = finite(style.fontSize, limits.min);
        if (size < limits.min || size > limits.max) add('TEXT_SIZE', name + ' size lazima iwe ' + limits.min + '–' + limits.max + ' px.', extra);
        const align = String(style.textAlign || 'left');
        if (!TEXT_ALIGNMENTS.includes(align)) add('TEXT_ALIGN', name + ' alignment haijatambuliwa.', extra);
      }
      if (animation.enabled === true) {
        const role = String(layer.role || '');
        const entranceOptions = role === 'badge' ? BADGE_ANIMATIONS : role === 'cta' ? CTA_ANIMATIONS : ENTRANCE_ANIMATIONS;
        const emphasisOptions = role === 'badge' ? BADGE_ANIMATIONS : role === 'cta' ? CTA_ANIMATIONS : EMPHASIS_ANIMATIONS;
        if (!entranceOptions.includes(String(animation.entrance || 'none'))) add('ANIMATION_ENTRANCE', name + ' entrance animation haijatambuliwa.', extra);
        if (!emphasisOptions.includes(String(animation.emphasis || 'none'))) add('ANIMATION_EMPHASIS', name + ' emphasis animation haijatambuliwa.', extra);
        if (!EXIT_ANIMATIONS.includes(String(animation.exit || 'none'))) add('ANIMATION_EXIT', name + ' exit animation haijatambuliwa.', extra);
        if (!ANIMATION_MODES.includes(String(animation.mode || 'whole'))) add('ANIMATION_MODE', name + ' animation mode haijatambuliwa.', extra);
        const inRange = (value, bounds) => finite(value, bounds.min) >= bounds.min && finite(value, bounds.min) <= bounds.max;
        if (!inRange(animation.duration, ANIMATION_LIMITS.duration)) add('ANIMATION_DURATION', name + ' animation duration iko nje ya kiwango.', extra);
        if (!inRange(animation.delay, ANIMATION_LIMITS.delay)) add('ANIMATION_DELAY', name + ' animation delay iko nje ya kiwango.', extra);
        if (!inRange(animation.stagger, ANIMATION_LIMITS.stagger)) add('ANIMATION_STAGGER', name + ' animation stagger iko nje ya kiwango.', extra);
        if (!inRange(animation.repeat, ANIMATION_LIMITS.repeat)) add('ANIMATION_REPEAT', name + ' animation repeat iko nje ya kiwango.', extra);
        if (!ANIMATION_EASINGS.includes(String(animation.easing || 'ease-out'))) add('ANIMATION_EASING', name + ' animation easing haijatambuliwa.', extra);
      }
      if (layer.type === 'image' || layer.type === 'logo') {
        const src = String(layer.src || layer.originalSrc || style.originalSrc || '');
        if (!/^(https:\/\/|data:image\/)/i.test(src)) add('IMAGE', name + ' image is not loaded.', extra);
        const fit = String(style.fit || 'cover');
        if (!FIT_MODES.includes(fit)) add('IMAGE_FIT', name + ' image fit haijatambuliwa.', extra);
      }
      if (layer.type === 'video') {
        const src = layer.src || layer.videoUrl || '';
        if (!/^(https:\/\/|blob:)/i.test(String(src))) add('VIDEO', name + ' video URL is not loaded.', extra);
        const meta = layer.videoMeta && typeof layer.videoMeta === 'object' ? layer.videoMeta : {};
        const original = finite(meta.duration, 0);
        const start = Math.max(0, finite(meta.trimStart, 0));
        const end = finite(meta.trimEnd, 0);
        const effective = end > start ? end - start : original;
        if (forPublish && original <= 0) add('VIDEO_DURATION_UNKNOWN', 'Video duration haijatambulika. Subiri metadata ipakie au weka muda wake.', extra);
        if (effective < MIN_AD_DURATION_SECONDS || effective > MAX_AD_DURATION_SECONDS || end > MAX_AD_DURATION_SECONDS) {
          add('VIDEO_DURATION', 'Video "' + name + '" lazima iwe sekunde ' + MIN_AD_DURATION_SECONDS + '–' + MAX_AD_DURATION_SECONDS + ' (clip ya mwisho). Tumia Trim; original inabaki salama.', extra);
        }
        if (original > 0 && end > original) add('VIDEO_TRIM_RANGE', 'Video trim end haiwezi kuzidi muda wa original.', extra);
      }
      if (layer.type === 'audio') {
        const src = layer.src || layer.audioUrl || '';
        if (!/^(https:\/\/|blob:|data:audio\/)/i.test(String(src))) add('AUDIO', name + ' audio URL si sahihi.', extra);
        const meta = layer.audioMeta && typeof layer.audioMeta === 'object' ? layer.audioMeta : {};
        const original = finite(meta.duration, 0);
        const start = Math.max(0, finite(meta.trimStart, 0));
        const end = finite(meta.trimEnd, 0);
        const effective = end > start ? end - start : original;
        if (effective > MAX_AD_DURATION_SECONDS || end > MAX_AD_DURATION_SECONDS) add('AUDIO_DURATION', 'Audio ya tangazo haiwezi kuzidi sekunde ' + MAX_AD_DURATION_SECONDS + '.', extra);
        if (original > 0 && end > original) add('AUDIO_TRIM_RANGE', 'Audio trim end haiwezi kuzidi muda wa original.', extra);
        const volume = finite(meta.volume, 1);
        if (volume < 0 || volume > 1) add('AUDIO_VOLUME', 'Audio volume lazima iwe 0–1.', extra);
      }
    });

    if (forPublish) {
      const explicitType = String(c.basicType || '');
      if (explicitType && !BASIC_AD_TYPES.includes(explicitType)) add('AD_TYPE', 'Aina ya tangazo haijatambuliwa.');
      const slideshow = normalizeSlideshow(c.slideshow);
      const type = explicitType && BASIC_AD_TYPES.includes(explicitType) ? explicitType : compositionToAnnouncementType(c, visible, slideshow);
      const hasImage = visible.some(layer => (layer.type === 'image' || layer.type === 'logo') && (layer.src || layer.originalSrc));
      const hasVideo = visible.some(layer => layer.type === 'video' && (layer.src || layer.videoUrl));
      const hasAudio = visible.some(layer => layer.type === 'audio' && (layer.src || layer.audioUrl));
      const headline = visible.find(layer => layer.role === 'headline' && layer.type === 'text');
      const hasHeadline = !!clean(headline && headline.content);
      const slideCount = slideshow.slides.filter(slide => slide && slide.src).length;
      const requiredMedia = {
        image_text: ['image'], image: ['image'], video: ['video'], video_text: ['video'],
        image_audio: ['image', 'audio'], full_multimedia: ['image', 'video', 'audio'],
        image_video: ['image', 'video'], video_audio: ['video', 'audio'], full_mix: ['image', 'video', 'audio'],
        audio: ['audio'], sponsored: ['image'], slideshow_audio: ['audio']
      }[type] || [];
      const mediaFlags = { image: hasImage, video: hasVideo, audio: hasAudio };
      if (requiredMedia.some(kind => !mediaFlags[kind])) {
        const messages = {
          image_text: 'Ongeza picha ya tangazo.', image: 'Ongeza picha ya tangazo.',
          video: 'Chagua au pakia video.', video_text: 'Chagua au pakia video.',
          image_audio: 'Image + Audio inahitaji picha na sauti.',
          full_multimedia: 'Full Multimedia inahitaji picha, video na sauti.',
          image_video: 'Image + Video inahitaji picha na video.',
          video_audio: 'Video + Audio inahitaji video na sauti.',
          full_mix: 'Full Multimedia inahitaji picha, video na sauti.',
          audio: 'Chagua au pakia audio.', sponsored: 'Ongeza picha ya tangazo.',
          slideshow_audio: 'Slideshow + Audio inahitaji sauti.'
        };
        add('AD_MEDIA', messages[type] || 'Chagua media inayohitajika kwa aina hii ya tangazo.');
      }
      if (['solid_text', 'image_text', 'video_text'].includes(type) && !hasHeadline) {
        add('AD_HEADLINE', type === 'solid_text' ? 'Andika kichwa cha tangazo.' : 'Andika headline fupi ya tangazo.');
      }

      const needsSlideshow = type === 'slideshow' || type === 'slideshow_audio' || slideshow.enabled;
      if (needsSlideshow) {
        if (slideCount < MIN_SLIDESHOW_SLIDES) add('SLIDESHOW_SLIDES', 'Slideshow inahitaji picha angalau 2 zenye source halisi.');
        if (slideCount > MAX_SLIDESHOW_SLIDES) add('SLIDESHOW_LIMIT', 'Slideshow inaweza kuwa na picha zisizozidi ' + MAX_SLIDESHOW_SLIDES + '.');
        if (!slideshow.enabled) add('SLIDESHOW_DISABLED', 'Washa slideshow kabla ya kuchapisha.');
        if (slideshow.defaultDuration < MIN_SLIDE_DURATION_SECONDS || slideshow.defaultDuration > MAX_SLIDE_DURATION_SECONDS) {
          add('SLIDE_DEFAULT_DURATION', 'Muda wa default slide lazima uwe ' + MIN_SLIDE_DURATION_SECONDS + '–' + MAX_SLIDE_DURATION_SECONDS + ' sekunde.');
        }
        slideshow.slides.forEach((slide, index) => {
          if (slide.src && !/^(https:\/\/|data:image\/)/i.test(slide.src)) add('SLIDE_IMAGE', 'Slide ' + (index + 1) + ' image URL si sahihi.', { layerId: String(index) });
          if (slide.duration < MIN_SLIDE_DURATION_SECONDS || slide.duration > MAX_SLIDE_DURATION_SECONDS) {
            add('SLIDE_DURATION', 'Muda wa slide lazima uwe ' + MIN_SLIDE_DURATION_SECONDS + '–' + MAX_SLIDE_DURATION_SECONDS + ' sekunde.', { layerId: String(index) });
          }
        });
        const total = slideshowTotal({ slideshow });
        if (total > MAX_SLIDESHOW_DURATION_SECONDS) add('SLIDESHOW_DURATION', 'Slideshow lazima iwe sekunde ' + MIN_AD_DURATION_SECONDS + '–' + MAX_SLIDESHOW_DURATION_SECONDS + ' (jumla: ' + Number(total.toFixed(2)) + 's). Punguza muda wa slides.');
      }

      const duration = finite(c.duration, 0);
      if (duration < MIN_AD_DURATION_SECONDS || duration > MAX_AD_DURATION_SECONDS) add('CREATIVE_DURATION', 'Creative duration lazima iwe ' + MIN_AD_DURATION_SECONDS + '–' + MAX_AD_DURATION_SECONDS + ' sekunde.');
      const internal = !!(c.destination && c.destination.type && c.destination.id);
      const external = !!(c.destination && c.destination.type === 'external' && isHttps(c.destination.url));
      if (!internal && !external) add('DESTINATION', 'Choose a real SokoHai destination or valid HTTPS link before publishing.');
      if (c.linkedEntity && !c.linkedEntity.id) add('ENTITY', 'The selected SokoHai entity is incomplete.');
      if (c.startAt || c.endAt) {
        const start = c.startAt ? Date.parse(c.startAt) : NaN;
        const end = c.endAt ? Date.parse(c.endAt) : NaN;
        if (c.startAt && !Number.isFinite(start)) add('SCHEDULE', 'Start date si sahihi.');
        if (c.endAt && !Number.isFinite(end)) add('SCHEDULE', 'End date si sahihi.');
        if (Number.isFinite(start) && Number.isFinite(end) && end <= start) add('SCHEDULE', 'End date lazima iwe baada ya Start date.');
      }
      if (options && options.requireSchedule === true) {
        const start = Date.parse(c.startAt || '');
        const now = finite(options.now, Date.now());
        if (!Number.isFinite(start) || start <= now) add('SCHEDULE_REQUIRED', 'Chagua muda wa baadaye wa kuanza tangazo kabla ya kuratibu.');
      }
      const displayDuration = finite(c.displayDurationSeconds, NaN);
      if (!Number.isFinite(displayDuration) || displayDuration < DISPLAY_DURATION_SECONDS.min || displayDuration > DISPLAY_DURATION_SECONDS.max) {
        add('DISPLAY_DURATION', 'Display duration lazima iwe sekunde ' + DISPLAY_DURATION_SECONDS.min + '–' + DISPLAY_DURATION_SECONDS.max + ' (media duration ni kitu kingine).');
      }
      const priority = finite(c.priority, 0);
      if (priority < 0 || priority > 999) add('PRIORITY', 'Priority lazima iwe 0–999.');
      const audioMix = c.audioMix && typeof c.audioMix === 'object' ? c.audioMix : {};
      ['originalVideoVolume', 'musicVolume', 'voiceVolume'].forEach(key => {
        if (audioMix[key] != null && (finite(audioMix[key], -1) < 0 || finite(audioMix[key], 2) > 1)) add('AUDIO_MIX', 'Audio mix volume lazima iwe 0–1.');
      });
    }
    return { ok: errors.length === 0, errors };
  }

  return Object.freeze({
    MAX_AD_MEDIA_SECONDS,
    MAX_AD_DURATION_SECONDS,
    MIN_AD_DURATION_SECONDS,
    DISPLAY_DURATION_SECONDS,
    MAX_SLIDESHOW_SLIDES,
    MIN_SLIDESHOW_SLIDES,
    MIN_SLIDE_DURATION_SECONDS,
    MAX_SLIDE_DURATION_SECONDS,
    DEFAULT_SLIDE_DURATION_SECONDS,
    MAX_SLIDESHOW_DURATION_SECONDS,
    SLIDESHOW_TRANSITIONS,
    ENTRANCE_ANIMATIONS, EMPHASIS_ANIMATIONS, EXIT_ANIMATIONS, ANIMATION_MODES, BADGE_ANIMATIONS, CTA_ANIMATIONS,
    TEXT_ALIGNMENTS, ANIMATION_EASINGS, TEXT_ROLE_LIMITS, TEXT_ROLE_SIZES, ANIMATION_LIMITS, FIT_MODES, FOCAL_POINTS,
    BASIC_AD_TYPES,
    DESIGN_FONT_KEYS, DESIGN_SHADOWS, DESIGN_ELEMENTS, DESIGN_ORDERABLE, normalizeDesign,
    AD_MEDIA_FILE_LIMITS_BYTES,
    AD_MEDIA_UPLOAD_FOLDER,
    COMPOSITION_LABELS,
    createLayer,
    normalizeCreative,
    normalizeSlideshow,
    slideshowTotal,
    detectComposition,
    autoAdDuration,
    detectAdMediaKind,
    validateAdMediaFile,
    creativeToAdvertisement,
    validateCreative
  });
});
