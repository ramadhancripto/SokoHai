/* ==== js/app/133-taxonomy-i18n.js ====                       [I18N TAXONOMY 2026-11-22]
 * Taxonomy labels follow the selected language (categories, subcategories, attributes, option groups and values,
 * filters, features, variant rules, legacy categories and stock units) in every form and filter panel.
 *
 * NOT a second language system: it extends SokoHaiLMS (24-ui-final.js) with one more dictionary, `taxLabel`, and
 * listens to the same `sokohai:languageChanged` event. Data: shared/taxonomy-i18n-data.mjs (generated from
 * docs/taxonomy/i18n/taxonomy-i18n.tsv), loaded only when needed (English selected, or a form / filter panel renders).
 *
 * DISPLAY ONLY — stored values never change:
 *   - <option value="…"> keeps the canonical value; only the visible label is translated;
 *   - text is replaced only when the WHOLE text of an element / text node is a known taxonomy string, and the original
 *     is remembered, so switching back restores it exactly;
 *   - only inside taxonomy-bearing containers (SCOPES). Product titles, descriptions and other seller content outside
 *     those containers are never touched; inputs, textareas, contenteditable and [data-no-i18n] are skipped.
 * Product types: all 4,688 translated since 2026-11-23 (coverage report: tools/build_taxonomy_i18n.mjs). */
(function () {
    'use strict';
    if (window.__skhTaxI18n) return; window.__skhTaxI18n = true;
    const SCOPES = '#sellerForm, #serviceForm, #editModal, #businessOSForm, #categoryModal, #categoryStrip, #dynamicFiltersContainer, '
        + '#filtersInputsArea, #hubServiceFiltersBox, #hubServiceFiltersArea, #filterRow, #bosPosBody, #skhPkrFilters, #lgxFilters, #spbFilters, '
        + '#prodTaxonomyResults, #pmCustomDetails, [data-tax-scope]';   // #pmCustomDetails: product page spec rows (category, type, attributes)
    const SKIP = 'input, textarea, script, style, [contenteditable="true"], [data-no-i18n], [data-user-content], #skhPsLive, #prodImagePreviews';   // + live previews of the seller's own listing
    let MAP = null, loading = null;
    const srcOfNode = new WeakMap();          // text node -> canonical string
    const lang = () => { try { return (window.SokoHaiLMS && window.SokoHaiLMS.lang) || 'sw'; } catch (e) { return 'sw'; } };

    function load() {
        if (MAP || loading) return loading || Promise.resolve();
        loading = import('../../shared/taxonomy-i18n-data.mjs').then((m) => {
            const rows = m.default || []; const map = new Map();
            rows.forEach(([c, en, sw]) => map.set(c, [en || c, sw || c]));
            // reverse lookup so a label already shown in one language (e.g. after a re-render) is recognised too
            rows.forEach(([c, en, sw]) => { if (en && !map.has(en)) map.set(en, [en, sw || c, c]); if (sw && !map.has(sw)) map.set(sw, [en || c, sw, c]); });
            MAP = map; window.skhTaxonomyI18nCoverage = m.COVERAGE || null;
        }).catch((e) => { console.warn('[taxonomy i18n] data', e); loading = null; });
        return loading;
    }
    /** Display label of a canonical taxonomy string in the current (or given) language; unknown -> unchanged. */
    function taxLabel(s, lg) {
        if (s == null || !MAP) return s;
        const k = String(s).trim(); const e = MAP.get(k); if (!e) return s;
        return (lg || lang()) === 'en' ? e[0] : e[1];
    }
    const canonical = (s) => { const e = MAP && MAP.get(String(s).trim()); return e ? (e[2] || String(s).trim()) : null; };

    function applyIn(root) {
        if (!MAP || !root) return;
        const L = lang();
        // 1. option labels (value untouched)
        root.querySelectorAll('option').forEach((o) => {
            if (o.closest(SKIP)) return;
            const src = o.dataset.taxSrc || canonical(o.textContent); if (!src) return;
            o.dataset.taxSrc = src; const t = taxLabel(src, L); if (o.textContent !== t) o.textContent = t;
        });
        // 2. whole text nodes (labels, chips, headings, buttons)
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode(n) {
            const p = n.parentElement; if (!p || p.tagName === 'OPTION' || p.closest(SKIP)) return NodeFilter.FILTER_REJECT;
            const t = n.nodeValue.trim(); return t && t.length <= 90 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } });
        const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
        nodes.forEach((n) => {
            let src = srcOfNode.get(n);
            const cur = n.nodeValue.trim();
            if (!src || (cur !== taxLabel(src, 'en') && cur !== taxLabel(src, 'sw') && cur !== src)) { src = canonical(cur); if (!src) return; srcOfNode.set(n, src); }
            const t = taxLabel(src, L); if (cur !== t) n.nodeValue = n.nodeValue.replace(cur, t);
        });
    }
    function applyAll() { if (!MAP) return; document.querySelectorAll(SCOPES).forEach(applyIn); }

    // re-apply when the language changes and when taxonomy containers (re)render
    // (the app also fires this event at start-up when it applies the saved language)
    const onScreen = () => [...document.querySelectorAll(SCOPES)].some(el => !PASSIVE.has(el.id) && el.getClientRects().length && el.getBoundingClientRect().width > 0);
    document.addEventListener('sokohai:languageChanged', () => { if (MAP) applyAll(); else if (lang() === 'en' || onScreen()) load().then(applyAll); });
    let pending = new Set(), raf = 0;
    // [PERF] the dictionary (~96 KB) is fetched only when it is needed: English selected, or a form / filter panel renders.
    // Home's category strip and sheet alone do not trigger it in Swahili (their legacy labels are already Swahili).
    const PASSIVE = new Set(['categoryStrip', 'categoryModal']);
    // a hidden form populated at start-up does not count: only a container that is actually ON SCREEN triggers the download
    const io = ('IntersectionObserver' in window) ? new IntersectionObserver((ents) => {
        if (!MAP && ents.some(e => e.isIntersecting && e.boundingClientRect.width > 0 && e.boundingClientRect.height > 0 && !PASSIVE.has(e.target.id))) load().then(applyAll);   // zero-size (display:none) entries can report isIntersecting
    }) : null;
    const watched = new WeakSet();
    const watch = (el) => { if (io && el && !watched.has(el)) { watched.add(el); io.observe(el); } };
    const flush = () => { raf = 0; const list = [...pending]; pending = new Set();
        if (!MAP) { if (lang() === 'en') load().then(applyAll); else list.forEach(watch); return; }
        list.forEach(applyIn); };
    const mo = new MutationObserver((muts) => {
        for (const m of muts) {
            const t = m.target.nodeType === 1 ? m.target : m.target.parentElement; if (!t || !t.closest) continue;
            const scope = t.closest(SCOPES) || (t.matches && t.matches(SCOPES) ? t : null);
            if (scope) pending.add(scope);
            else m.addedNodes && m.addedNodes.forEach((a) => { if (a.nodeType === 1) { if (a.matches(SCOPES)) pending.add(a); a.querySelectorAll && a.querySelectorAll(SCOPES).forEach((s) => pending.add(s)); } });
        }
        if (pending.size && !raf) raf = requestAnimationFrame(flush);
    });
    function start() {
        mo.observe(document.body, { childList: true, subtree: true, characterData: true });
        document.querySelectorAll(SCOPES).forEach(watch);
        if (lang() === 'en') { const idle = window.requestIdleCallback || ((f) => setTimeout(f, 2500)); idle(() => load().then(applyAll), { timeout: 8000 }); }
    }
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

    window.skhTaxLabel = taxLabel;
    window.skhTaxonomyI18n = { load, apply: applyAll, label: taxLabel, canonical: (s) => (MAP ? canonical(s) : null), ready: () => !!MAP };
    try { if (window.SokoHaiLMS) window.SokoHaiLMS.taxLabel = taxLabel; } catch (e) {}
})();
