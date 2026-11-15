/* ==== js/05-local-avatars.js ====                                   [UI 2026-11-15]
 * Avatars and broken pictures, in ONE place.
 *
 * 1) The app built avatars from the third-party service ui-avatars.com in ~39 places. That sent each
 *    user's NAME to an outside server, failed whenever that service or the network was slow, and showed
 *    a broken-image icon with the alt text overlapping the circle (profile, seller page, chat).
 *    Every such URL is now replaced, before it loads, by a local SVG with the same initials and colour.
 * 2) Any avatar/profile picture that fails to load falls back to the initials; any other listing
 *    picture that fails falls back to the SokoHai placeholder tile — never a broken-image icon.
 */
(function () {
    'use strict';
    var PALETTE = ['0f6e55', '17604E', '03509d', '7c3aed', 'b45309', 'be123c', '0e7490', '4d7c0f'];
    function initialsOf(name) {
        var parts = String(name || '').replace(/[+_]/g, ' ').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return 'SH';
        var a = parts[0].charAt(0), b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : (parts[0].charAt(1) || '');
        return (a + b).toUpperCase();
    }
    function colourFor(name) {
        var h = 0, s = String(name || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return PALETTE[h % PALETTE.length];
    }
    function hex(c, fallback) { c = String(c || '').replace(/[^0-9a-f]/gi, ''); return (c.length === 6 || c.length === 3) ? c : fallback; }
    function avatarSvg(name, bg, fg) {
        var ini = initialsOf(name).replace(/[<>&"']/g, '');
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">' +
            '<rect width="128" height="128" rx="64" fill="#' + hex(bg, colourFor(name)) + '"/>' +
            '<text x="64" y="64" dy=".36em" text-anchor="middle" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="50" font-weight="700" fill="#' + hex(fg, 'ffffff') + '">' + ini + '</text></svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }
    window.skhInitials = initialsOf;
    window.skhAvatarUrl = function (name, bg) { return avatarSvg(name, bg); };

    var RX = /^https?:\/\/ui-avatars\.com\/api\/?\?/i;
    function localFor(url) {
        try {
            var q = new URL(url).searchParams;
            return avatarSvg(q.get('name') || '', q.get('background'), q.get('color'));
        } catch (e) { return avatarSvg(''); }
    }
    function fixImg(img) {
        var src = img.getAttribute('src');
        if (src && RX.test(src)) img.setAttribute('src', localFor(src));
        var ss = img.getAttribute('srcset');
        if (ss && /ui-avatars\.com/i.test(ss)) img.removeAttribute('srcset');
    }
    function fixBg(el) {
        var st = el.getAttribute('style');
        if (st && /ui-avatars\.com/i.test(st)) {
            el.setAttribute('style', st.replace(/url\((['"]?)(https?:\/\/ui-avatars\.com\/api\/?\?[^'")]*)\1\)/gi, function (m, q, u) { return 'url("' + localFor(u.replace(/&amp;/g, '&')) + '")'; }));
        }
    }
    function sweep(root) {
        if (!root || root.nodeType !== 1) return;
        if (root.tagName === 'IMG') fixImg(root);
        if (root.hasAttribute && root.hasAttribute('style')) fixBg(root);
        if (root.querySelectorAll) {
            var imgs = root.querySelectorAll('img[src*="ui-avatars"],img[srcset*="ui-avatars"]');
            for (var i = 0; i < imgs.length; i++) fixImg(imgs[i]);
            var bgs = root.querySelectorAll('[style*="ui-avatars"]');
            for (var j = 0; j < bgs.length; j++) fixBg(bgs[j]);
        }
    }
    try {
        new MutationObserver(function (list) {
            for (var i = 0; i < list.length; i++) {
                var m = list[i];
                if (m.type === 'attributes') { if (m.target.tagName === 'IMG') fixImg(m.target); else fixBg(m.target); }
                else for (var k = 0; k < m.addedNodes.length; k++) sweep(m.addedNodes[k]);
            }
        }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset', 'style'] });
    } catch (e) { /* very old browser: pictures load as before */ }

    // 2) broken pictures
    var AVATAR_HINT = /avatar|(^|[-_ ])av($|[-_ ])|dp|profile|photo-user|user-photo|seller-logo|logo|pfp/i;
    document.addEventListener('error', function (e) {
        var img = e.target;
        if (!img || img.tagName !== 'IMG' || img.__skhFallback) return;
        var src = img.getAttribute('src') || '';
        if (/^data:/.test(src)) return;
        img.__skhFallback = true;
        var hint = (img.className || '') + ' ' + (img.id || '') + ' ' + ((img.parentElement && img.parentElement.className) || '');
        if (AVATAR_HINT.test(hint) || (img.alt && img.width && img.width <= 96 && Math.abs((img.width || 0) - (img.height || 0)) < 4)) {
            img.src = avatarSvg(img.alt || img.getAttribute('data-name') || img.title || '');
        } else if (window.SKH_PLACEHOLDER_IMG) {
            img.src = window.SKH_PLACEHOLDER_IMG;
        }
        img.removeAttribute('srcset');
    }, true);
})();
