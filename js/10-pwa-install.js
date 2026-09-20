/* ==== js/10-pwa-install.js ==== */
// ============================================================
// SOKOHAI PWA INSTALL PROMPT (Phase 3.10) — 100% ADDITIVE
// Inakamata beforeinstallprompt, inaonyesha banner nzuri
// (badala ya prompt ya browser), inakumbuka uamuzi wa user.
// Haionyeshi kama app imeshasakwa (standalone) au user
// amekataa awali (localStorage).
// ============================================================
(function () {
    'use strict';
    var KEY = 'sokohai_install_dismissed';
    var deferred = null;

    // Muda umepita? (decay ya siku 7 — ruhusu kuuliza tena baada ya muda)
    try {
        var t = parseInt(localStorage.getItem(KEY) || '0', 10);
        if (t && (Date.now() - t) < 7 * 24 * 3600 * 1000) return; // amekataa karibuni
    } catch (e) { /* localStorage haipatikani — endelea */ }

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferred = e;
        showBanner();
    });

    function standalone() {
        return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ||
               navigator.standalone === true;
    }

    function showBanner() {
        if (standalone() || document.getElementById('skhInstallBanner')) return;

        var b = document.createElement('div');
        b.id = 'skhInstallBanner';

        var ico = document.createElement('span');
        ico.className = 'skh-inst-ico';
        ico.textContent = '📲';

        var txt = document.createElement('div');
        txt.className = 'skh-inst-txt';
        var t1 = document.createElement('b'); t1.textContent = 'Weka SOKOHAI kwenye simu yako';
        var t2 = document.createElement('small'); t2.textContent = 'Haraka, nje ya browser — bila kuilipia duka la apps';
        txt.appendChild(t1); txt.appendChild(t2);

        var go = document.createElement('button');
        go.className = 'skh-inst-go';
        go.type = 'button';
        go.textContent = 'WEKA';
        go.addEventListener('click', async function () {
            if (!deferred) { b.remove(); return; }
            deferred.prompt();
            try { await deferred.userChoice; } catch (e) {}
            deferred = null;
            b.remove();
        });

        var no = document.createElement('button');
        no.className = 'skh-inst-no';
        no.type = 'button';
        no.textContent = 'Sasa Hivi';
        no.addEventListener('click', function () {
            try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
            b.remove();
        });

        b.appendChild(ico); b.appendChild(txt); b.appendChild(go); b.appendChild(no);

        // Usifunike content ya chini kabisa — ruhusu scroll
        b.addEventListener('click', function (e) {
            if (e.target === b) b.remove();
        });

        document.body.appendChild(b);
        // Ondoka yenyewe baada ya sekunde 30
        setTimeout(function () { if (document.body.contains(b)) b.remove(); }, 30000);
    }

    window.addEventListener('appinstalled', function () {
        var b = document.getElementById('skhInstallBanner');
        if (b) b.remove();
        if (window.sokohaiToast) window.sokohaiToast('🎉 SOKOHAI imesakwa kwenye simu yako!', 'success', 4000);
    });
})();
