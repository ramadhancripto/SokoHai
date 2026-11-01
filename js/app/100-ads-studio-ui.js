/* ==== js/app/100-ads-studio-ui.js ==== */
/* ============================================================================
   SokoHai — Ads Creator Studio interaction layer  [ADS PHASE 1 · C/D]
   ----------------------------------------------------------------------------
   Presentation only. This module never creates a creative, never writes to
   Firestore, never changes an ad rule, a placement, a price or a campaign
   state. It listens to the EXISTING designer (js/app/16-pos-admin-jobs.js →
   skhAdFormHtml / submitAnnouncementForm) and improves four things:

     1. Icons — the designer's emoji glyphs are replaced with the project's own
        SVG set (js/18-icons.js → skhNavIcon). The codebase is explicitly
        "hakuna emoji" everywhere else, so emoji-only controls were an
        inconsistency (and an empty box on systems without an emoji font).
     2. Validation — submitAnnouncementForm reports problems through alert().
        A blocking OS dialog is not a validation message: it hides the form and
        gives no field context. The SAME validator still runs (single source of
        truth); only its output is rendered as an inline panel + field marks.
     3. States — the existing disabled/«Inahifadhi…» behaviour gets a visible
        busy treatment, and the validation panel gets a dismissal.
     4. Navigation — the section chips show which section you are in, and the
        preview opens on the marketplace size so it represents the real ad.

   Everything is idempotent: the module can be re-run after the form re-renders
   (editing an existing ad rebuilds the modal HTML).
   ========================================================================== */
(function () {
    'use strict';

    function log() {
        try { console.debug.apply(console, ['[ads-studio]'].concat([].slice.call(arguments))); } catch (e) {}
    }

    function formEl() { return document.querySelector('#announcementFormModal .adm-ad-form'); }

    /* ---------------------------------------------------------- 1. ICONS */
    function iconSvg(name, size) {
        try {
            if (typeof window.skhNavIcon === 'function') return window.skhNavIcon(name, size || 14);
        } catch (e) {}
        return '';
    }

    var STEP_ICON = {
        content: 'edit', media: 'image', design: 'palette', text: 'edit',
        cta: 'target', layers: 'archive', animation: 'bolt', preview: 'eye', publish: 'send'
    };

    var TARGETS = [
        ['.adm-ad-mode-switch [data-design-mode-btn="auto"]', 'bolt'],
        ['.adm-ad-mode-switch [data-design-mode-btn="manual"]', 'settings'],
        ['.adm-ad-seg [data-preview-device="mobile"]', 'phone'],
        ['.adm-ad-seg [data-preview-device="desktop"]', 'globe'],
        ['.adm-ad-empty-actions .adm-ad-btn:nth-child(1)', 'edit'],
        ['.adm-ad-empty-actions .adm-ad-btn:nth-child(2)', 'image'],
        ['.adm-ad-empty-actions .adm-ad-btn:nth-child(3)', 'bolt'],
        ['#annSuggestTitle', 'bolt'],
        ['.adm-ad-props-trigger', 'bolt'],
        ['.adm-ad-sheet-close', 'x']
    ];

    /* Replace the leading non-alphanumeric glyph (an emoji or a box-drawing
       symbol) of an element with an inline SVG, keeping the label text. */
    function replaceLeadingGlyph(el, name) {
        if (!el || el.getAttribute('data-adm-ico') === name) return;
        var svg = iconSvg(name);
        if (!svg) return;
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        var node = walker.nextNode();
        if (!node) return;
        var value = node.nodeValue || '';
        var stripped = value.replace(/^[^A-Za-z0-9]+/, '');
        if (stripped === value) return;              // no glyph to replace
        var span = document.createElement('span');
        span.className = 'adm-ico';
        span.setAttribute('aria-hidden', 'true');
        span.innerHTML = svg;
        node.nodeValue = stripped;
        el.insertBefore(span, el.firstChild);
        el.setAttribute('data-adm-ico', name);
    }

    function hydrateIcons(root) {
        var scope = root || formEl();
        if (!scope) return;
        TARGETS.forEach(function (entry) {
            var el = scope.querySelector(entry[0]);
            replaceLeadingGlyph(el, entry[1]);
        });
        Array.prototype.forEach.call(scope.querySelectorAll('.adm-ad-step-number'), function (el) {
            var step = el.closest('[data-basic-step]');
            var key = step && step.getAttribute('data-basic-step');
            var name = STEP_ICON[key];
            if (!name) return;
            var svg = iconSvg(name, 14);
            if (!svg || el.getAttribute('data-adm-ico') === name) return;
            el.innerHTML = svg;
            el.setAttribute('data-adm-ico', name);
        });
        Array.prototype.forEach.call(scope.querySelectorAll('.adm-ad-remove'), function (el) {
            replaceLeadingGlyph(el, 'x');
        });
        /* Transport buttons: the emoji prefixes (⏸ 🔇 …) have no SVG equivalent
           in the project icon set and one of them renders as an empty box on
           systems without an emoji font. They read fine as plain words. */
        Array.prototype.forEach.call(scope.querySelectorAll('.adm-ad-preview-transport button'), function (el) {
            var node = el.firstChild;
            if (!node || node.nodeType !== 3) return;
            var value = node.nodeValue || '';
            if (/^[^A-Za-z0-9]*[^\x00-\x7F]/.test(value)) {
                node.nodeValue = value.replace(/^[^A-Za-z0-9]+/, '');
                el.setAttribute('data-adm-plain', '1');
            }
        });
        Array.prototype.forEach.call(scope.querySelectorAll('.adm-ad-upload .adm-ad-btn'), function (el) {
            if (/upload/i.test(el.textContent || '')) replaceLeadingGlyph(el, 'download');
        });
        /* Suggestion cards lead with a small glyph too (⚠ / ▢ …); map them to
           the nearest icon in the project set so no empty-box placeholder can
           appear on a system without those glyphs. */
        Array.prototype.forEach.call(scope.querySelectorAll('#annSuggestions > *'), function (el) {
            var head = el.querySelector('b, h5, strong') || el;
            replaceLeadingGlyph(head, 'alert');
        });
        /* Layer rows are re-rendered on every change, so they are mapped by the
           data attribute the renderer already emits, not by position. */
        [['[data-layer-action="toggle"]', 'eye'], ['[data-layer-action="lock"]', 'lock'], ['[data-layer-action="edit"]', 'edit']]
            .forEach(function (pair) {
                Array.prototype.forEach.call(scope.querySelectorAll('#annLayersList ' + pair[0]), function (el) {
                    replaceLeadingGlyph(el, pair[1]);
                });
            });
    }

    /* --------------------------------------------- 2. INLINE VALIDATION */
    function validationBox() {
        var form = formEl();
        if (!form) return null;
        var box = document.getElementById('skhAdValidation');
        if (box) return box;
        box = document.createElement('div');
        box.id = 'skhAdValidation';
        box.setAttribute('role', 'alert');
        box.setAttribute('aria-live', 'assertive');
        var head = form.querySelector('.adm-ad-form-head');
        var grid = form.querySelector('.adm-ad-designer-grid');
        if (head && head.parentNode === form) form.insertBefore(box, grid || head.nextSibling);
        else form.insertBefore(box, form.firstChild);
        return box;
    }

    function clearFieldMarks(scope) {
        var root = scope || formEl();
        if (!root) return;
        Array.prototype.forEach.call(root.querySelectorAll('.is-invalid'), function (el) {
            el.classList.remove('is-invalid');
            el.removeAttribute('aria-invalid');
        });
    }

    function clearValidation() {
        var box = document.getElementById('skhAdValidation');
        if (box) {
            box.classList.remove('is-visible');
            box.innerHTML = '';
        }
        clearFieldMarks();
    }

    /* The validator speaks about layers ("Headline has no text", "Call to
       action…"), so map its wording onto the real input ids to mark fields. */
    var FIELD_HINTS = [
        [/headline/i, 'annHeadline'],
        [/brand|business name/i, 'annBrand'],
        [/description|body|maelezo/i, 'annText'],
        [/call to action|cta|kiungo|link/i, 'annLink'],
        [/price|offer|bei/i, 'annPriceTag'],
        [/start|schedule|tarehe/i, 'annStartAt'],
        [/end|expiry|muda/i, 'annEndAt'],
        [/image|photo|picha/i, 'annImage'],
        [/video/i, 'annVideo'],
        [/preview/i, 'annPreviewConfirmed']
    ];

    function showValidation(message) {
        var box = validationBox();
        if (!box) return;
        var lines = String(message || '').split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
        if (!lines.length) return;
        clearFieldMarks();
        var marked = [];
        lines.forEach(function (line) {
            FIELD_HINTS.forEach(function (entry) {
                if (!entry[0].test(line)) return;
                var input = document.getElementById(entry[1]);
                if (!input || marked.indexOf(input.id) >= 0) return;
                input.classList.add('is-invalid');
                input.setAttribute('aria-invalid', 'true');
                marked.push(input.id);
            });
        });
        var title = lines.length === 1 ? 'Kuna jambo moja la kurekebisha' : 'Kuna mambo ' + lines.length + ' ya kurekebisha';
        box.innerHTML = '<b>' + title + '</b><ul>' + lines.map(function (line) {
            return '<li>' + line.replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }) + '</li>';
        }).join('') + '</ul>'
            + '<button type="button" class="adm-ad-close" data-adm-close-validation="1">Sawa, nitaendelea kuhariri</button>';
        var dismiss = box.querySelector('[data-adm-close-validation]');
        if (dismiss) dismiss.addEventListener('click', clearValidation);
        box.classList.add('is-visible');
        try { box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
        if (marked.length) {
            var first = document.getElementById(marked[0]);
            if (first && typeof first.focus === 'function') {
                try { first.focus({ preventScroll: true }); } catch (e) {}
            }
        }
        return lines.length;
    }
    window.skhAdShowValidation = showValidation;
    window.skhAdClearValidation = clearValidation;

    /* Wrap the existing submit so its alert() output becomes the panel.
       The original handler, its validator and its backend calls stay intact. */
    function wrapSubmit() {
        if (typeof window.submitAnnouncementForm !== 'function' || window.__skhAdStudioSubmitWrapped) return false;
        var original = window.submitAnnouncementForm;
        window.__skhAdStudioSubmitWrapped = true;
        window.submitAnnouncementForm = async function (mode) {
            clearValidation();
            var targetId = mode === 'draft' ? 'btnSaveAdDraft' : mode === 'schedule' ? 'btnScheduleAnnouncement' : 'btnSubmitAnnouncement';
            var button = document.getElementById(targetId);
            var form = formEl();
            var previousAlert = window.alert;
            var previousToast = window.skhToast;
            var capturedError = '';
            /* Capture every alert this call makes (validation, schedule hint,
               upload rejection) so nothing blocks the studio with an OS modal. */
            window.alert = function (msg) { showValidation(msg); };
            /* The save path reports backend failures through skhToast. A toast is
               transient, so the same message is also kept in the inline panel —
               the advertiser can still read why the save failed. */
            if (typeof previousToast === 'function') {
                window.skhToast = function (message, type) {
                    if (type === 'error') capturedError = String(message || '');
                    return previousToast.apply(this, arguments);
                };
            }
            var timer = setTimeout(function () {
                if (button) { button.classList.add('is-busy'); button.setAttribute('aria-busy', 'true'); }
                if (form) form.setAttribute('aria-busy', 'true');
            }, 220);
            try {
                return await original.apply(this, arguments);
            } finally {
                clearTimeout(timer);
                window.alert = previousAlert;
                if (previousToast) window.skhToast = previousToast;
                if (capturedError) showValidation(capturedError);
                if (button) { button.classList.remove('is-busy'); button.removeAttribute('aria-busy'); }
                if (form) form.removeAttribute('aria-busy');
            }
        };
        return true;
    }

    /* Typing in a marked field clears its mark (and the panel when nothing is
       left marked) — the same behaviour users expect from a form. */
    function bindFieldClearing(root) {
        var scope = root || formEl();
        if (!scope || scope.__skhAdClearBound) return;
        scope.__skhAdClearBound = true;
        scope.addEventListener('input', function (event) {
            var el = event.target;
            if (!el || !el.classList || !el.classList.contains('is-invalid')) return;
            el.classList.remove('is-invalid');
            el.removeAttribute('aria-invalid');
            if (!scope.querySelector('.is-invalid')) {
                var box = document.getElementById('skhAdValidation');
                if (box) { box.classList.remove('is-visible'); box.innerHTML = ''; }
            }
        }, true);
    }

    /* ------------------------------------------- 3. PREVIEW = REAL SIZE
       A preview that is larger than the real ad is a misleading preview. The
       studio therefore opens on "Kwenye soko" (the true marketplace card) and
       only switches to full size when the advertiser asks for it. The choice is
       remembered per browser. */
    var PREF_KEY = 'skhAdPreviewSizePref';

    function readPref() {
        try { return localStorage.getItem(PREF_KEY) || ''; } catch (e) { return ''; }
    }

    function applyPreviewPref() {
        if (typeof window.skhAdSetPreviewMode !== 'function') return;
        var pref = readPref() || 'market';
        try { window.skhAdSetPreviewMode(pref); } catch (e) { log('preview pref', e && e.message); }
    }

    function wrapPreviewMode() {
        if (typeof window.skhAdSetPreviewMode !== 'function' || window.__skhAdPreviewWrapped) return false;
        var original = window.skhAdSetPreviewMode;
        window.__skhAdPreviewWrapped = true;
        window.skhAdSetPreviewMode = function (mode) {
            var result = original.apply(this, arguments);
            try { localStorage.setItem(PREF_KEY, mode === 'market' ? 'market' : 'full'); } catch (e) {}
            return result;
        };
        return true;
    }

    /* ------------------------------------------------- 4. SECTION NAV STATE */
    /* Only the navigable, in-flow steps can become "current". The preview panel
       is sticky, so it always sits at the top of the scroll port and would
       otherwise steal the indicator from the section you just clicked. */
    var NAV_KEYS = ['content', 'media', 'design', 'text', 'cta', 'layers', 'animation', 'publish'];
    var navLockedUntil = 0;

    function setActiveSection(key) {
        var scope = formEl();
        if (!scope || !key) return;
        Array.prototype.forEach.call(scope.querySelectorAll('.adm-ad-section-nav button'), function (btn) {
            var on = btn.getAttribute('data-jump') === key;
            if (on) btn.setAttribute('aria-current', 'true');
            else btn.removeAttribute('aria-current');
        });
    }

    function bindNav() {
        var scope = formEl();
        if (!scope || scope.__skhAdNavBound) return;
        scope.__skhAdNavBound = true;
        scope.addEventListener('click', function (event) {
            var btn = event.target.closest && event.target.closest('.adm-ad-section-nav button');
            if (!btn) return;
            navLockedUntil = Date.now() + 1400;      // the click decides for a moment
            setActiveSection(btn.getAttribute('data-jump'));
        }, true);
        var ticking = false;
        scope.addEventListener('scroll', function () {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(function () {
                ticking = false;
                if (Date.now() < navLockedUntil) return;
                var sections = Array.prototype.slice.call(scope.querySelectorAll('[data-basic-step]'));
                var head = scope.querySelector('.adm-ad-form-head');
                var offset = (head ? head.offsetHeight : 0) + 52;
                var best = null;
                sections.forEach(function (section) {
                    var key = section.getAttribute('data-basic-step');
                    if (NAV_KEYS.indexOf(key) < 0) return;
                    if (section.closest('.adm-ad-preview-wrap')) return;
                    var top = section.getBoundingClientRect().top - scope.getBoundingClientRect().top;
                    if (top <= offset + 24 && (best === null || top > best.top)) best = { key: key, top: top };
                });
                if (best) setActiveSection(best.key);
            });
        }, { passive: true });
    }

    /* --------------------------------------------------------- bootstrap */
    function safe(fn, arg) {
        try { return fn(arg); } catch (e) { log('step failed:', (e && e.message) || e); }
    }

    function initNav() {
        var scope = formEl();
        if (!scope || scope.querySelector('.adm-ad-section-nav button[aria-current]')) return;
        setActiveSection('content');
    }

    function hydrate() {
        var scope = formEl();
        if (!scope) return;
        safe(hydrateIcons, scope);
        safe(bindFieldClearing, scope);
        safe(bindNav);
        safe(initNav);
        safe(bindPreviewToggle);
        /* Applied once per rendered form: it pushes a preview re-render, which
           mutates the DOM and would otherwise re-enter the observer forever. */
        if (scope.__skhPreviewPrefApplied !== true) {
            scope.__skhPreviewPrefApplied = true;
            safe(applyPreviewPref);
        }
    }

    /* Record the advertiser's own size choice so the next open matches it. */
    function bindPreviewToggle() {
        var wrap = document.getElementById('skhAdPreviewMode');
        if (!wrap || wrap.__skhPrefBound) return;
        wrap.__skhPrefBound = true;
        wrap.addEventListener('click', function (event) {
            var btn = event.target.closest && event.target.closest('button[data-mode]');
            if (!btn) return;
            try { localStorage.setItem(PREF_KEY, btn.dataset.mode === 'market' ? 'market' : 'full'); } catch (e) {}
        }, true);
    }

    function boot() {
        wrapSubmit();
        wrapPreviewMode();
        hydrate();
    }

    /* The designer modal is rebuilt from a template string every time it opens
       or an existing ad is edited, so re-hydrate whenever it changes. */
    function watchForm() {
        if (typeof MutationObserver === 'undefined') return;
        var queued = false;
        var observer = new MutationObserver(function () {
            if (queued || !formEl()) return;
            queued = true;
            window.requestAnimationFrame(function () {
                queued = false;
                if (!formEl()) return;
                if (!document.getElementById('skhAdValidation')) validationBox();
                hydrate();      /* full, idempotent pass: icons, states, preview default */
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    window.skhAdStudioUI = {
        hydrate: hydrate,
        showValidation: showValidation,
        clearValidation: clearValidation
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { boot(); watchForm(); });
    } else {
        boot();
        watchForm();
    }
    /* the ads modules load in order; make sure the wrap lands even if this file
       evaluates before 16-pos-admin-jobs.js finishes */
    window.setTimeout(boot, 1200);
})();
