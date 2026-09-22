/* ==== js/09-states.js ==== */
// ============================================================
// SOKOHAI STATES (Phase 3.9) — 100% ADDITIVE
// 1) Online/Offline pill: inaonyesha hali ya mtandao
//    (muhimu kwa watumiaji wa TZ — intaneti inakatika sana)
// 2) Helper za baadaye: empty-state component (haitoi kosa
//    kwa sasa; inatumika na code mpya tu)
// ============================================================
(function () { 'use strict';

    var pill = null;
    var hideTimer = null;

    function ensurePill() {
        if (pill) return pill;
        pill = document.createElement('div');
        pill.id = 'skhNetPill';
        pill.style.display = 'none';
        document.body.appendChild(pill);
        return pill;
    }

    function showNet(state) {
        var p = ensurePill();
        clearTimeout(hideTimer);
        p.className = state === 'online' ? 'skh-online' : 'skh-offline';
        p.innerHTML = '';
        var dot = document.createElement('span'); dot.className = 'skh-dot';
        var txt = document.createElement('span');
        txt.textContent = state === 'online'
            ? ' Intaneti imerudi — unaunganishwa'
            : ' HAKUNA INTANETI — vitu vingi vitaendelea, mengine vinakisubiri';
        p.appendChild(dot); p.appendChild(txt);
        p.style.display = 'flex';
        if (state === 'online') {
            // pill ya online inajificha yenyewe baada ya sekunde 2.5
            hideTimer = setTimeout(function () { p.style.display = 'none'; }, 2500);
        }
    }

    window.addEventListener('offline', function () { showNet('offline'); });
    window.addEventListener('online', function () { showNet('online'); });

    // Ikiwa inafunguliwa bila intaneti, onyesha pill mara moja (bila kuvuruga)
    if (!navigator.onLine) {
        window.addEventListener('load', function () { showNet('offline'); });
    }

    // ---------- Empty-state helper (ya matumizi mapya) ----------
    window.skhEmptyState = function (icon, title, subtitle, actionLabel, actionFn) {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'text-align:center;padding:44px 18px;color:#64748b;';
        var ic = document.createElement('div');
        ic.style.cssText = 'font-size:46px;margin-bottom:12px;opacity:.9;';
        ic.textContent = icon || '';
        var t = document.createElement('b');
        t.style.cssText = 'display:block;font-size:15px;color:#0f172a;margin-bottom:6px;';
        t.textContent = title || 'Hakuna kitu bado';
        var s = document.createElement('p');
        s.style.cssText = 'font-size:12.5px;margin:0 0 14px;line-height:1.5;';
        s.textContent = subtitle || '';
        wrap.appendChild(ic); wrap.appendChild(t); wrap.appendChild(s);
        if (actionLabel) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = actionLabel;
            btn.style.cssText = 'padding:11px 20px;background:#18A982;color:#fff;border:none;border-radius:11px;font-weight:800;font-size:12.5px;cursor:pointer;';
            btn.addEventListener('click', function () { if (actionFn) actionFn(); });
            wrap.appendChild(btn);
        }
        return wrap;
    };
})();
