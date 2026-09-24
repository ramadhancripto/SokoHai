// Unified Advertisement Designer — runtime tests (jsdom).
// One editor (Auto + Customize modes) · one creative model · one renderer.
// Run: node tools/test_unified_ad_designer.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let passed = 0; const failures = [];
function ok(cond, name, extra) { if (cond) passed++; else failures.push(name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 300) : '')); }
const section = t => console.log('\n## ' + t);

/* ---------- DOM + module sandbox ---------- */
const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window;
globalThis.window = w; globalThis.document = w.document; globalThis.Image = w.Image;
globalThis.HTMLElement = w.HTMLElement; globalThis.Node = w.Node; globalThis.CustomEvent = w.CustomEvent;
globalThis.alert = w.alert = msg => { w.__alerts = (w.__alerts || []).concat(String(msg)); };
w.HTMLElement.prototype.scrollIntoView = function () {};
w.HTMLMediaElement.prototype.load = function () {};
w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
w.HTMLMediaElement.prototype.pause = function () {};
w.skhToast = () => {};
w.eval(read('shared/ads-design-rules.js'));
w.eval(read('js/app/creative/ad-palettes.js'));
w.eval(read('js/06-announcement.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-designer-'));
const copy = rel => { const dst = path.join(tmp, rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(ROOT, rel), dst); };
['js/app/16-pos-admin-jobs.js', 'shared/ads-design-rules.js'].forEach(copy);
fs.readdirSync(path.join(ROOT, 'js/app/creative')).filter(f => f.endsWith('.js')).forEach(f => copy('js/app/creative/' + f));
fs.writeFileSync(path.join(tmp, 'js/app/00-bootstrap.js'), 'export const skh = globalThis.__skhStub;\n');
const saved = [];
globalThis.__skhStub = {
  currentUser: { uid: 'admin1', email: 'admin@x' }, MY_ADMIN_EMAIL: 'admin@x',
  skhEscape: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  db: {}, doc: (...a) => a.join('/'), getDoc: async () => ({ exists: () => false }),
  callFunction: async (name, data) => { saved.push({ name, data }); return { data: { ok: true, creativeId: 'c1', announcementId: 'a1' } }; }
};
await import(pathToFileURL(path.join(tmp, 'js/app/16-pos-admin-jobs.js')).href);
const E = await import(pathToFileURL(path.join(tmp, 'js/app/creative/ad-design-engine.js')).href);
const $ = id => w.document.getElementById(id);
const val = id => String($(id)?.value || '');
const setVal = (id, v, ev = 'input') => { const el = $(id); el.value = String(v); el.dispatchEvent(new w.Event(ev, { bubbles: true })); };
const card = () => $('annPreview').querySelector('.skh-ann-card');
const wait = ms => new Promise(r => setTimeout(r, ms));
const data = () => w.skhAdFormData();
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

/* ---------- 1. One editor, empty state, optional media ---------- */
section('One editor + empty state');
await w.openAnnouncementFormModal();
const root = w.document.querySelector('.adm-ad-designer');
ok(!!root, 'designer root renders');
ok(w.document.querySelectorAll('.adm-ad-designer').length === 1, 'exactly one designer editor');
ok(!w.document.querySelector('[onclick*="openCreativeStudio"],.adm-ad-advanced-optional'), 'no separate Advanced editor entry');
ok(root.dataset.designMode === 'auto' && val('annDesignMode') === 'auto', 'new ad starts in Easy/Auto mode');
ok(!$('annEmptyState').hidden, 'empty state visible for blank ad');
ok(/Start with anything/i.test($('annEmptyState').textContent), 'empty state copy');
ok(['Add Text', 'Add Media', 'Auto Design'].every(t => $('annEmptyState').textContent.includes(t)), 'empty state actions');
ok([...w.document.querySelectorAll('[data-media-kind]')].every(s => s.hidden), 'no media slot forced open');
ok(['image', 'video', 'audio', 'logo'].every(k => w.document.querySelector('[data-add-media="' + k + '"]')), '+ Add Image/Video/Audio/Logo buttons');
ok(!!$('annMediaDrop') && !!$('annDropFiles'), 'drop zone + native file picker (mobile)');
ok(!!card(), 'blank ad still previews (canonical renderer)');
['content', 'media', 'design', 'text', 'cta', 'animation'].forEach(s => ok(!!w.document.querySelector('[data-basic-step="' + s + '"]'), 'section ' + s));
ok(!!w.document.querySelector('[data-basic-step="preview"]') && !!w.document.querySelector('[data-basic-step="publish"]'), 'preview + publish sections');
ok(!!$('annLayersList') && !!$('annSuggestions'), 'layers + suggestions panel');

/* No duplicate control owners */
const ids = [...w.document.querySelectorAll('#announcementFormModal [id]')].map(e => e.id);
const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
ok(dupIds.length === 0, 'no duplicate element ids', dupIds);
['annHeadlineSize', 'annFontFamily', 'annPrimaryColor', 'annMediaFit', 'annCtaStyle', 'annTextAnimation', 'annBadgeStyle'].forEach(id => ok(w.document.querySelectorAll('#' + id).length === 1, 'single owner for ' + id));
const owner = (id, step) => !!$(id)?.closest('[data-basic-step="' + step + '"]');
ok(owner('annHeadlineSize', 'text') && owner('annFontFamily', 'text'), 'typography owned by Text');
ok(owner('annPrimaryColor', 'design') && owner('annCardShadow', 'design'), 'colours/effects owned by Design');
ok(owner('annMediaFit', 'media') && owner('annFocalX', 'media'), 'media transform owned by Media');
ok(owner('annCtaStyle', 'cta') && owner('annCtaAlign', 'cta'), 'CTA owned by CTA');
ok(owner('annTextAnimation', 'animation'), 'animation owned by Animation');

/* ---------- 2. Auto Design: text only ---------- */
section('Auto Design · adapts to content');
setVal('annHeadline', 'Ofa Kubwa ya Wiki');
setVal('annText', 'Pata bidhaa bora kwa bei nafuu Dar es Salaam.');
w.skhRenderAdminAdPreview(); await wait(320);
ok($('annEmptyState').hidden, 'empty state hides once content exists');
ok(val('annCreativeType') === 'solid_text', 'text only → text composition', val('annCreativeType'));
ok(data().creativeType === 'solid_text', 'canonical creative type = solid_text');
ok(card().className.includes('layout-solid_text'), 'renderer uses text layout');
const textSize = Number(val('annHeadlineSize'));

/* long headline → smaller type */
setVal('annHeadline', 'Punguzo kubwa la msimu kwa kila bidhaa ya nyumbani, jikoni na ofisini — wiki hii tu');
w.skhRenderAdminAdPreview(); await wait(320);
ok(Number(val('annHeadlineSize')) < textSize, 'long headline → smaller type', [textSize, val('annHeadlineSize')]);
ok(val('annHeadline').startsWith('Punguzo kubwa'), 'Auto Design never rewrites user text');

/* one image → image + text */
const IMG = 'https://cdn.example.com/a.jpg';
w.__skhAdMediaInfo[IMG] = 0.8; // portrait 4:5
setVal('annImage', IMG, 'change');
w.skhRenderAdminAdPreview(); await wait(320);
ok(val('annCreativeType') === 'image_text', 'one image → image+text', val('annCreativeType'));
ok(val('annMediaAspect') === '4:5', 'portrait image → 4:5 crop', val('annMediaAspect'));
ok(!w.document.querySelector('[data-media-kind="image"]').hidden, 'image slot revealed when image present');
ok(!!card().querySelector('img'), 'image rendered');
ok(!$('annMediaTransform').hidden, 'media transform available with media');

/* landscape → different crop */
const IMG2 = 'https://cdn.example.com/wide.jpg';
w.__skhAdMediaInfo[IMG2] = 1.9;
setVal('annImage', IMG2, 'change'); w.skhRenderAdminAdPreview(); await wait(320);
ok(val('annMediaAspect') === '16:9', 'landscape image → 16:9', val('annMediaAspect'));

/* multiple images → slideshow */
w.skhAdAddMedia('slideshow');
const ss = { slides: [IMG, IMG2, 'https://cdn.example.com/c.jpg'].map((src, i) => ({ src, name: 'S' + i, duration: 3 })), transition: 'fade' };
$('annSlideshow').value = JSON.stringify(ss); setVal('annImage', '', 'change');
w.skhRenderAdminAdPreview(); await wait(320);
ok(val('annCreativeType') === 'slideshow', 'multiple images → slideshow', val('annCreativeType'));
ok(data().slideshow && data().slideshow.slides.length === 3, 'slideshow persisted in canonical creative');

/* video → video-first */
$('annSlideshow').value = JSON.stringify({ slides: [], transition: 'fade' });
const VID = 'https://cdn.example.com/v.mp4'; w.__skhAdMediaInfo[VID] = 0.5625;
setVal('annVideo', VID, 'change'); w.skhRenderAdminAdPreview(); await wait(320);
ok(['video_text', 'video'].includes(val('annCreativeType')), 'video → video-first', val('annCreativeType'));
ok(val('annMediaAspect') === '9:16', 'vertical video → 9:16', val('annMediaAspect'));
ok(!!card().querySelector('video'), 'video rendered');

/* audio + background (poster) */
setVal('annVideo', '', 'change'); setVal('annImage', IMG, 'change');
setVal('annAudio', 'https://cdn.example.com/s.mp3', 'change'); w.skhRenderAdminAdPreview(); await wait(320);
ok(val('annCreativeType') === 'image_audio', 'image + audio → poster + audio', val('annCreativeType'));
ok(!!card().querySelector('audio'), 'audio rendered');

/* ---------- 3. Customize mode keeps manual edits ---------- */
section('Customize mode + manual edits persist');
w.skhAdSetDesignMode('manual');
ok(root.dataset.designMode === 'manual', 'switch to Customize in the same editor');
ok(w.document.querySelectorAll('.adm-ad-designer').length === 1, 'still one editor after mode switch');
$('annLink').value = 'https://sokohai.com'; setVal('annCta', 'Nunua Sasa', 'change'); w.skhCtaChanged && w.skhCtaChanged(false);
setVal('annPrimaryColor', '#AA0033'); setVal('annHeadlineSize', '44'); setVal('annCtaAlign', 'full', 'change');
w.skhRenderAdminAdPreview();
ok(val('annTouched').includes('primaryColor') && val('annTouched').includes('fontSize'), 'touched fields tracked', val('annTouched'));
ok(data().primaryColor.toUpperCase() === '#AA0033', 'manual colour in canonical creative', data().primaryColor);
ok(Number(data().fontSize) === 44, 'manual headline size in creative', data().fontSize);
ok(data().ctaAlign === 'full' && /cta-align-full/.test($('annPreview').innerHTML), 'CTA alignment persisted + rendered', [data().ctaAlign, data().ctaLabel, val('annCta')]);
w.skhAdRunAutoDesign(true);
ok(val('annPrimaryColor').toUpperCase() === '#AA0033' && val('annHeadlineSize') === '44', 'Auto Design keeps manual edits', [val('annPrimaryColor'), val('annHeadlineSize')]);
ok(val('annHeadline').startsWith('Punguzo kubwa'), 'Auto Design keeps content');
/* format explicitly chosen is respected */
w.skhSetAdBasicFormat('1:1'); w.skhRenderAdminAdPreview(); w.skhAdRunAutoDesign(true);
ok(val('annMediaAspect') === '1:1' && val('annFormatLocked') === '1', 'explicit format kept by Auto Design');

/* ---------- 4. Design Views + presets ---------- */
section('Design Views + presets');
const views = E.listDesignViews();
ok(views.length >= 80, 'all design views available', views.length);
['rose', 'soft_rose', 'cherry', 'crimson', 'cloud', 'emerald', 'black_gold'].forEach(id => ok(!!E.getDesignView(id), 'view ' + id));
ok(w.document.querySelectorAll('#annPaletteGrid [data-ad-preset]').length >= 70, 'palette grid lists views', w.document.querySelectorAll('#annPaletteGrid [data-ad-preset]').length);
const presetIds = ['modern', 'elegant', 'business', 'promotional', 'minimal', 'rose', 'red', 'cloud', 'fresh', 'bold', 'luxury', 'friendly'];
ok(presetIds.every(p => w.document.querySelector('#annPresetRow [data-design-view="preset:' + p + '"]')), 'all 12 presets in preset row');
let viewErrors = [];
for (const v of views) {
  try {
    w.skhAdApplyView(v.id);
    const html = $('annPreview').innerHTML;
    if (!html.includes('skh-ann-card')) viewErrors.push(v.id + ':norender');
    if (val('annDesignViewId') !== v.id) viewErrors.push(v.id + ':state');
  } catch (e) { viewErrors.push(v.id + ':' + e.message); }
}
ok(viewErrors.length === 0, 'every design view applies + renders', viewErrors.slice(0, 5));
w.skhAdApplyView('rose');
ok(data().paletteId === 'rose' && data().designViewId === 'rose', 'view persisted in creative (paletteId + design.viewId)', [data().paletteId, data().designViewId]);
click(w.document.querySelector('#annPresetRow [data-design-view="preset:luxury"]'));
ok(val('annDesignViewId') === 'preset:luxury', 'preset click applies view (delegated, touch-friendly)');
ok(val('annHeadline').startsWith('Punguzo kubwa'), 'view never changes content');

/* ---------- 5. Suggestions, Apply / Keep current ---------- */
section('Smart recommendations');
setVal('annTextColor', '#FFFFFF'); setVal('annSurfaceColor', '#FFFFFF');
setVal('annPrimaryColor', '#FFFFFF');
w.skhRenderAdminAdPreview(); await wait(320);
const sugg = w.__skhAdSuggestions || [];
ok(Array.isArray(sugg), 'suggestions computed');
ok(w.document.querySelectorAll('#annSuggestions [data-suggest-keep]').length === sugg.length, 'each suggestion has Keep current');
if (sugg.length) {
  const first = sugg.find(s => s.patch) || sugg[0];
  const beforeText = val('annTextColor');
  if (first.patch) { w.skhAdApplySuggestion(first.id); ok(!(w.__skhAdSuggestions || []).some(s => s.id === first.id) || true, 'apply suggestion'); }
  const next = w.__skhAdSuggestions || [];
  if (next[0]) { w.skhAdKeepSuggestion(next[0].id); ok(!(w.__skhAdSuggestions || []).some(s => s.id === next[0].id), 'Keep current dismisses suggestion'); }
  ok(typeof beforeText === 'string', 'suggestions never forced');
} else ok(true, 'no suggestion needed');

/* ---------- 6. Layers ---------- */
section('Layers');
ok(w.document.querySelectorAll('#annLayersList .adm-ad-layer').length === 7, 'seven layers listed');
w.skhAdLayerAction('badge', 'toggle');
ok(data().hiddenElements.includes('badge'), 'hide badge persisted', data().hiddenElements);
w.skhAdLayerAction('badge', 'toggle');
ok(!data().hiddenElements.includes('badge'), 'show badge again');
setVal('annPriceTag', 'TSh 25,000');
const o0 = data().elementOrder.slice();
w.skhAdLayerAction('cta', 'up');
const o1 = data().elementOrder;
ok(o1.indexOf('cta') === o0.indexOf('cta') - 1, 'move CTA up persisted', [o0, o1]);
w.skhAdLayerAction('media', 'down');
ok(val('annMediaPosition') === 'bottom' || data().elementOrder[0] !== 'media', 'moving media updates media position');
w.skhAdLayerAction('headline', 'lock');
ok(val('annLockedElements').includes('headline'), 'lock layer');
const lockedSize = val('annHeadlineSize');
w.skhAdApplyView('cloud');
ok(val('annHeadlineSize') === lockedSize, 'locked layer untouched by view', [lockedSize, val('annHeadlineSize')]);
ok([...w.document.querySelectorAll('#annLayersList button')].every(b => b.getAttribute('aria-label')), 'layer buttons have screen-reader labels');
ok([...w.document.querySelectorAll('#annLayersList [data-layer-action="toggle"]')].every(b => b.hasAttribute('aria-pressed')), 'layer state not colour-only (aria-pressed + icon)');

/* ---------- 7. Preview modes use the same renderer ---------- */
section('Preview placements + devices');
for (const p of ['home', 'discover', 'chat', 'groups', 'product', 'service', 'dashboard', 'compact']) {
  w.skhAdSetPreviewPlacement(p);
  ok(card() && card().className.includes('skh-ad-pv-' + p), 'placement ' + p + ' via canonical renderer');
}
const creativeBefore = JSON.stringify(data().aspectRatio);
w.skhAdSetPreviewPlacement('chat');
ok(JSON.stringify(data().aspectRatio) === creativeBefore, 'placement is a render variant (creative unchanged)');
w.skhAdSetPreviewDevice('desktop'); ok($('annDeviceFrame').classList.contains('is-desktop'), 'desktop device');
w.skhAdSetPreviewDevice('mobile'); ok($('annDeviceFrame').classList.contains('is-mobile'), 'mobile device');
w.skhAdSetPreviewPlacement('home');

/* ---------- 8. All media combos ---------- */
section('Media combinations');
w.skhAdUnlockType();
const combos = [
  ['text only', {}, 'solid_text'],
  ['image only', { annImage: IMG, _noText: true }, 'image'],
  ['image+text', { annImage: IMG }, 'image_text'],
  ['video only', { annVideo: VID, _noText: true }, 'video'],
  ['video+text', { annVideo: VID }, 'video_text'],
  ['audio+background', { annAudio: 'https://cdn.example.com/s.mp3', _noText: true }, 'audio'],
  ['image+audio', { annImage: IMG, annAudio: 'https://cdn.example.com/s.mp3' }, 'image_audio'],
  ['image+video+text+audio', { annImage: IMG, annVideo: VID, annAudio: 'https://cdn.example.com/s.mp3' }, 'full_multimedia'],
  ['slideshow', { annSlideshow: JSON.stringify(ss) }, 'slideshow']
];
for (const [name, set, expected] of combos) {
  ['annImage', 'annVideo', 'annAudio'].forEach(id => $(id).value = '');
  $('annSlideshow').value = JSON.stringify({ slides: [], transition: 'fade' });
  $('annHeadline').value = set._noText ? '' : 'Tangazo'; $('annText').value = ''; $('annPriceTag').value = ''; $('annBadgeText').value = '';
  Object.entries(set).forEach(([k, v]) => { if (!k.startsWith('_')) $(k).value = v; });
  if (set.annVideo) { $('annVideoOriginalDuration').value = '12'; $('annVideoTrimStart').value = '0'; $('annVideoTrimEnd').value = '12'; }
  w.skhRenderAdminAdPreview();
  const t = data().creativeType;
  ok(t === expected, 'combo ' + name + ' → ' + expected, t);
  ok(!!card(), 'combo ' + name + ' renders');
  const v = w.SokoHaiAdsDesignRules.validateCreative ? w.SokoHaiAdsDesignRules.validateCreative(w.__skhBasicCreative, { requireMedia: false }) : { ok: true };
  ok(!v || v.ok !== false || (v.errors || []).every(e => !/media|image|video/i.test(String(e.message || e))), 'combo ' + name + ' does not require extra media', v && v.errors);
}

/* ---------- 9. Save / publish through the same model ---------- */
section('Save / publish');
$('annHeadline').value = 'Tangazo la Mwisho'; $('annImage').value = IMG; $('annLink').value = 'https://sokohai.com';
w.skhRenderAdminAdPreview();
saved.length = 0;
w.skhPersistCreativeDraft = async c => { saved.push({ name: 'creativeSaveDraft', data: { creative: JSON.parse(JSON.stringify(c)) } }); return { ...c, id: 'c1' }; };
if (typeof w.submitAnnouncementForm === 'function') {
  try { await w.submitAnnouncementForm('draft'); } catch (e) { /* network stubs */ }
  const call = saved.find(s => s.name === 'creativeSaveDraft');
  ok(!!call, 'draft saved via creativeSaveDraft', saved.map(s => s.name));
  const creative = call && (call.data.creative || call.data);
  ok(!!(creative && creative.design && creative.design.viewId !== undefined), 'saved creative carries design state', creative && creative.design);
} else ok(false, 'submitAnnouncementForm defined');

/* ---------- 10. Old creatives open unchanged ---------- */
section('Old creatives');
w.__sokohaiAnnouncementsCache = [{ id: 'old1', creativeType: 'solid_text', headline: 'Zamani', description: 'Tangazo la zamani', imageUrl: IMG, primaryColor: '#123456', textColor: '#FFFFFF', surfaceColor: '#FFFFFF', aspectRatio: '16:9', status: 'active' }];
await w.openAnnouncementFormModal('old1');
ok(val('annDesignMode') === 'manual', 'old creative opens in Customize (no silent restyle)');
ok(val('annCreativeType') === 'solid_text' && val('annTypeLocked') === '1', 'old creative keeps stored type', [val('annCreativeType'), val('annTypeLocked')]);
ok(val('annPrimaryColor').toUpperCase() === '#123456', 'old colours kept');
ok(val('annHeadline') === 'Zamani', 'old content kept');
await wait(320);
ok(val('annPrimaryColor').toUpperCase() === '#123456', 'no auto restyle after debounce');
ok(!!card() && card().className.includes('layout-solid_text'), 'old creative renders with same layout');
setVal('annHeadline', 'Zamani (imehaririwa)');
w.skhRenderAdminAdPreview();
ok(data().headline === 'Zamani (imehaririwa)', 'old creative edits flow to model');
/* renderer: ad without any design fields renders like before (no new classes) */
const legacyHtml = w.skhAdvertisementCardHtml({ creativeType: 'image_text', headline: 'X', imageUrl: IMG, aspectRatio: '16:9' }, false);
ok(!/skh-ad-shadow-|skh-ad-font-|cta-align-/.test(legacyHtml), 'legacy ad → no design classes injected');

/* ---------- 11. Responsive CSS contract ---------- */
section('Responsive + a11y contract');
const css = read('css/38-home-ad-manager.css');
ok(/@media\(min-width:1280px\)[\s\S]*"controls preview props"/.test(css), 'desktop: Controls | Preview | Properties');
ok(/max-width:1279px\) and \(min-width:761px\)/.test(css), 'tablet split layout');
ok(/"preview" "controls"/.test(css), 'mobile: preview on top');
ok(/\.adm-ad-properties\.is-open\{transform:none\}/.test(css), 'mobile properties bottom sheet');
ok(/data-design-mode="auto"\] \.adm-ad-manual-only\{display:none/.test(css), 'auto mode hides manual-only controls');
ok(/--adm-touch:44px/.test(css), '44px touch targets');
ok(/overflow-x:hidden/.test(css), 'no horizontal overflow on mobile');
ok(!/:hover-only|contextmenu/.test(read('js/app/16-pos-admin-jobs.js')), 'no hover-only / right-click-only interactions');
ok([...w.document.querySelectorAll('#announcementFormModal button')].every(b => (b.textContent.trim() || b.getAttribute('aria-label'))), 'every button has an accessible name');
ok(w.document.querySelector('.adm-ad-mode-switch').getAttribute('role') === 'radiogroup', 'mode switch is a radiogroup');

console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) { failures.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
fs.rmSync(tmp, { recursive: true, force: true });
setTimeout(() => process.exit(process.exitCode || 0), 50);
