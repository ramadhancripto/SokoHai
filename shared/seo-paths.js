/* [SEO 2026-11-21] Public, crawlable URL scheme — ONE module for the build (tools/build_seo.mjs) and the app
 * (canonical link of an open listing, the seller share kit). Paths are descriptive and stable:
 *   /bidhaa/<title-slug>-<id>/        product page          /huduma/<title-slug>-<id>/   service page
 *   /duka/<name-slug>-<uid>/          public seller page    /soko/<category-slug>/        category page
 *   /soko/<category-slug>/<region>/   category in a region  /chapa/<brand-slug>/          brand page
 *   /soko/mkoa/<region>/              region hub (all public listings of one verified region)
 * Only ids made of letters, digits, "_" and "-" get a page (anything else stays app-only). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SKHSeoPaths = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var ORIGIN = 'https://sokohai.com';
  function slugify(s, max) {
    s = String(s == null ? '' : s).toLowerCase();
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
    s = s.replace(/&/g, ' na ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    max = max || 60;
    if (s.length > max) s = s.slice(0, max).replace(/-[^-]*$/, '') || s.slice(0, max);
    return s;
  }
  function safeId(id) { id = String(id == null ? '' : id); return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null; }
  function withSlug(prefix, title, id, fallback) {
    var sid = safeId(id); if (!sid) return null;
    var slug = slugify(title) || fallback;
    return '/' + prefix + '/' + slug + '-' + sid + '/';
  }
  return {
    ORIGIN: ORIGIN, slugify: slugify, safeId: safeId,
    product: function (p) { return withSlug('bidhaa', p && (p.title || p.name), p && p.id, 'bidhaa'); },
    service: function (s) { return withSlug('huduma', s && (s.title || s.serviceTitle || s.serviceName || s.name), s && s.id, 'huduma'); },
    seller: function (name, uid) { return withSlug('duka', name, uid, 'duka'); },
    category: function (label, region) { var c = slugify(label); if (!c) return null; return '/soko/' + c + '/' + (region ? slugify(region) + '/' : ''); },
    brand: function (brand) { var b = slugify(brand, 40); return b ? '/chapa/' + b + '/' : null; },
    // [LOCAL SEO 2026-11-22] region hub: every public listing of one verified first-level region (tools/build_seo.mjs)
    region: function (region) { var r = slugify(region); return r ? '/soko/mkoa/' + r + '/' : null; },
    absolute: function (path) { return path ? ORIGIN + path : null; }
  };
});
