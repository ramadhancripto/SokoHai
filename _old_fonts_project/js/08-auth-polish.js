/* ==== js/08-auth-polish.js ==== */
// ============================================================
// SOKOHAI AUTH POLISH (Phase 3.3) — 100% ADDITIVE
// 1) Eye toggle kwenye password (login & signup)
// 2) Strength meter ya password ya signup
// 3) Loading states kwenye vitufe (inafunga window.doLogin/
//    doSignup/doGoogleLogin kwa usalama — try/finally, hakuna
//    kitu kinachovunjika; kama script hii isipatikane, app
//    inafanya kazi kama kabla yake)
// ============================================================
(function () { 'use strict';

    // ---------- 1) EYE TOGGLE ----------
    function addEyeToggle(input) {
        if (!input) return;
        var wrap = document.createElement('span');
        wrap.className = 'skh-pass-wrap';
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);

        var eye = document.createElement('button');
        eye.type = 'button';
        eye.className = 'skh-eye';
        eye.setAttribute('aria-label', 'Onyesha / ficha nenosiri');
        // [FIX 2026-09-14] Kitufe kilibaki tupu baada ya kuondoa emoji.
        // Sasa kinatumia SVG za maktaba (eye / eye-off).
        function paintEye(shown) {
            eye.innerHTML = (window.skhNavIcon
                ? window.skhNavIcon(shown ? 'eye-off' : 'eye', 18)
                : (shown ? '-' : '+'));
            eye.setAttribute('title', shown ? 'Ficha nenosiri' : 'Onyesha nenosiri');
        }
        paintEye(false);

        eye.addEventListener('click', function () {
            var show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            paintEye(show);
            input.focus({ preventScroll: true });
        });
        wrap.appendChild(eye);
    }

    // ---------- 2) STRENGTH METER (signup pekee) ----------
    function strengthOf(pw) {
        var score = 0;
        if (!pw) return 0;
        if (pw.length >= 6) score++;
        if (pw.length >= 10) score++;
        if (/[0-9]/.test(pw) && /[a-zA-Z]/.test(pw)) score++;
        if (/[^a-zA-Z0-9]/.test(pw)) score++;
        return Math.min(score, 4); // 0..4
    }
    var STRENGTH_INFO = [
        { label: '', color: '#e2e8f0' },
        { label: 'DHAIFU', color: '#ef4444' },
        { label: 'WASTANI', color: '#f59e0b' },
        { label: 'NZURI', color: '#0ea5e9' },
        { label: 'NGUVU ', color: '#10b981' }
    ];

    function addStrengthMeter(input) {
        if (!input) return;
        var box = document.createElement('div');
        box.className = 'skh-strength';
        var bars = document.createElement('div');
        bars.className = 'skh-strength-bars';
        var barEls = [];
        for (var i = 0; i < 4; i++) {
            var b = document.createElement('i');
            barEls.push(b);
            bars.appendChild(b);
        }
        var label = document.createElement('span');
        label.className = 'skh-strength-label';
        label.textContent = '';
        box.appendChild(bars);
        box.appendChild(label);

        function render() {
            var s = strengthOf(input.value || '');
            var info = STRENGTH_INFO[s];
            label.textContent = info.label;
            label.style.color = s === 0 ? '#94a3b8' : info.color;
            for (var j = 0; j < 4; j++) {
                barEls[j].style.background = (s > 0 && j < s) ? info.color : '#e2e8f0';
            }
        }
        input.addEventListener('input', render);
        render();
        // Weka meter BAADA ya wrap ya input (input imeshawekwa kwenye wrap na addEyeToggle)
        if (input.parentNode && input.parentNode.parentNode) {
            input.parentNode.parentNode.insertBefore(box, input.parentNode.nextSibling);
        }
    }

    var loginPass = document.getElementById('loginPass');
    var signupPass = document.getElementById('signupPass');
    addEyeToggle(loginPass);
    addEyeToggle(signupPass);
    addStrengthMeter(signupPass);

    // ---------- 3) LOADING STATES ----------
    function withLoading(fnName, buttonGetter, loadingText) {
        var orig = window[fnName];
        if (typeof orig !== 'function') return; // hakuna la kufanya — app inaendelea

        window[fnName] = async function () {
            var btn = buttonGetter();
            var origHtml = null;
            var restored = false;
            function restore() {
                if (!btn || restored) return;
                restored = true;
                btn.disabled = false;
                if (origHtml !== null) btn.innerHTML = origHtml;
            }
            try {
                if (btn) {
                    origHtml = btn.innerHTML;
                    btn.disabled = true;
                    btn.innerHTML = loadingText;
                }
                // Safety: re-weka baada ya sekunde 25 hata kama promise haishangi
                setTimeout(restore, 25000);
                return await orig.apply(this, arguments);
            } finally {
                restore();
            }
        };
    }

    withLoading('doLogin', function () {
        return document.querySelector('#loginForm button[type="submit"]');
    }, ' INAKUINGIZA...');

    withLoading('doSignup', function () {
        return document.querySelector('#signupForm button[type="submit"]');
    }, ' INATENGENEZA AKAUNTI...');

    withLoading('doGoogleLogin', function () {
        return document.querySelector('#authModal .google-btn');
    }, ' INAFUNGUA GOOGLE...');
})();
