/* ==== js/07-toasts.js ==== */
// ============================================================
// SOKOHAI NICE ALERTS (Phase 3.2)
// Inabadilisha window.alert() ya kivinjari kwa dialogs za kisani,
// bila kuvunja mtiririko wa code yoyote iliyopo:
//   - alert() ya asali inaitwa kwa zile nyingi mfululizo -> QUEUE
//   - Maandishi yanawekwa kwa textContent (XSS-safe kwa kubuni)
//   - Icon/rangi huchaguliwa kiotomatiki kutoka emoji ya ujumbe
//   - Ikiwa SOKOHAI_CONFIG.NICE_ALERTS === false -> alert ya asali
//     ya kivinjari inarudi (escape hatch).
//  window.confirm na window.prompt HAZIKUGUSWA (zinatawala
//    mtirirho wa maamuzi — tutasubiri Phase 4 kuzibadilisha salama).
// ============================================================
(function () {
    if (typeof window.SOKOHAI_CONFIG === 'undefined') return;
    if (window.SOKOHAI_CONFIG.NICE_ALERTS === false) return; // native alert inabaki

    var nativeAlert = window.alert.bind(window);
    var queue = [];
    var showing = false;

    // ---------- Styles (self-contained) ----------
    var css = [ '#skhAlertOverlay{position:fixed;inset:0;background:rgba(2,13,28,.55);backdrop-filter:blur(3px);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;animation:skhFadeIn .18s ease-out;font-family:var(--skh-font,"Segoe UI",system-ui,sans-serif)}', '#skhAlertBox{background:#fff;border-radius:16px;max-width:380px;width:100%;padding:22px 20px 18px;box-shadow:var(--skh-shadow-lg,0 12px 32px rgba(15,23,42,.16));animation:skhPopIn .22s var(--skh-ease,cubic-bezier(.22,1,.36,1));text-align:center}', '#skhAlertIcon{font-size:34px;line-height:1;margin-bottom:10px}', '#skhAlertMsg{font-size:14.5px;color:#0f172a;font-weight:600;line-height:1.55;white-space:pre-wrap;word-break:break-word;max-height:46vh;overflow-y:auto;margin:0 0 16px}', '#skhAlertBtn{display:block;width:100%;padding:14px;border:none;border-radius:12px;background:var(--skh-primary,#03509d);color:#fff;font-size:14px;font-weight:800;cursor:pointer;letter-spacing:.4px}', '#skhAlertBtn:active{transform:scale(.98)}', '#skhAlertBar{height:4px;border-radius:99px;width:56px;margin:0 auto 14px}', '@keyframes skhFadeIn{from{opacity:0}to{opacity:1}}', '@keyframes skhPopIn{from{opacity:0;transform:scale(.92) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}', '.skh-toast-wrap{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483100;display:flex;flex-direction:column;gap:8px;width:min(92vw,380px);pointer-events:none}', '.skh-toast{pointer-events:auto;background:#fff;color:#18352D;border:1px solid #CCEBDD;border-left:4px solid #18A982;border-radius:12px;padding:12px 16px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(24,53,45,.14);animation:skhToastIn .25s var(--skh-ease,ease-out);display:flex;gap:10px;align-items:flex-start;line-height:1.45}', '.skh-toast.skh-out{animation:skhToastOut .25s ease-in forwards}', '@keyframes skhToastIn{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}', '@keyframes skhToastOut{to{opacity:0;transform:translateY(-12px)}}'
    ].join('\n');
    var styleEl = document.createElement('style');
    styleEl.id = 'skhNiceAlertCss';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    // ---------- Aina ya ujumbe (kutoka emoji/maandishi) ----------
    function classify(msg) {
        var m = String(msg == null ? '' : msg);
        if (/||||success|imefanikiwa|imekamilika|imepokelewa|imeingizwa|/i.test(m)) return { icon: '', color: '#10b981' };
        if (/|||imeshindikana|kosa|error|wizi|hatari|kataliwa|feli|IMEFELI/i.test(m)) return { icon: '', color: '#ef4444' };
        if (/ℹ️|ℹ|tafadhali|kumbuka|DEMO|hakuna|bado|subiri|jaribu/i.test(m)) return { icon: 'ℹ️', color: '#03509d' };
        return { icon: '', color: '#03509d' };
    }

    // ---------- Dialog kwa queue (kama alert ya asali: moja baada ya nyingine) ----------
    function showNext() {
        if (showing) return;
        var next = queue.shift();
        if (!next) return;
        showing = true;

        var kind = classify(next);
        var overlay = document.createElement('div');
        overlay.id = 'skhAlertOverlay';
        var box = document.createElement('div');
        box.id = 'skhAlertBox';

        var icon = document.createElement('div');
        icon.id = 'skhAlertIcon';
        icon.textContent = kind.icon;

        var bar = document.createElement('div');
        bar.id = 'skhAlertBar';
        bar.style.background = kind.color;

        var msg = document.createElement('div');
        msg.id = 'skhAlertMsg';
        msg.textContent = String(next); // XSS-safe: textContent pekee

        var btn = document.createElement('button');
        btn.id = 'skhAlertBtn';
        btn.type = 'button';
        btn.textContent = 'SAWA';
        btn.style.background = kind.color;

        function close() {
            document.removeEventListener('keydown', onKey, true);
            overlay.removeEventListener('click', onBackdrop, false);
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            showing = false;
            showNext();
        }
        function onKey(e) { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }
        function onBackdrop(e) { if (e.target === overlay) close(); }

        btn.addEventListener('click', close);
        document.addEventListener('keydown', onKey, true);
        overlay.addEventListener('click', onBackdrop, false);

        box.appendChild(icon); box.appendChild(bar); box.appendChild(msg); box.appendChild(btn);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        btn.focus();
    }

    // ---------- Override ya alert ----------
    window.alert = function (message) {
        queue.push(message == null ? '' : String(message));
        showNext();
    };

    // ---------- Toast ya hiari (isiyozuia) kwa matumizi mapya ----------
    window.sokohaiToast = function (message, type, ms) {
        var wrap = document.querySelector('.skh-toast-wrap');
        if (!wrap) { wrap = document.createElement('div'); wrap.className = 'skh-toast-wrap'; document.body.appendChild(wrap); }
        var t = document.createElement('div');
        t.className = 'skh-toast';
        /* [FIX 2026-09-15] Icons zilikuwa tupu (emoji ziliondolewa) na
           `ℹ️` ilibaki peke yake. Sasa tunatumia SVG za maktaba — na
           `innerHTML` kwa SVG, si `textContent` (ndiyo iliyokuwa ikifanya
           code ionekane kama maandishi). */
        var kind = classify(message);
        var iconName = 'alert';
        if (type === 'success') { kind = { icon: '', color: '#10b981' }; iconName = 'check'; }
        if (type === 'error')   { kind = { icon: '', color: '#ef4444' }; iconName = 'x'; }
        if (type === 'info')    { kind = { icon: '', color: '#3b82f6' }; iconName = 'bell'; }
        if (type === 'warn')    { kind = { icon: '', color: '#f59e0b' }; iconName = 'alert'; }
        var ic = document.createElement('span');
        ic.className = 'skh-toast-ic';
        if (window.skhNavIcon) ic.innerHTML = window.skhNavIcon(iconName, 16);
        else ic.textContent = kind.icon || '';
        var tx = document.createElement('span'); tx.textContent = String(message);
        t.appendChild(ic); t.appendChild(tx);
        t.style.borderLeft = '4px solid ' + kind.color;
        wrap.appendChild(t);
        var life = ms || 3200;
        setTimeout(function () {
            t.classList.add('skh-out');
            setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 260);
        }, life);
    };

    // Debug hook
    window.SOKOHAI_NICE_ALERTS = true;
})();
