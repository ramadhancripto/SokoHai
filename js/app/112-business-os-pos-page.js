/* ==== js/app/112-business-os-pos-page.js ==== */
/* ============================================================================
   SokoHai BUSINESS OS — POS kama UKURASA (Moduli 8) · Stage 5 review
   ----------------------------------------------------------------------------
   KANUNI: hakuna POS ya pili. Terminal ile ile (`#businessOSForm` — scan,
   cart, checkout, receipt, offline queue, madeni, malipo) inahamishwa
   (DOM move) ndani ya `#dashWorkspace` ikiwa ukurasa kamili. Nodi ni ile
   ile → handlers zote, ids zote, listeners zote zinabaki kama zilivyo.

   Njia mbili zinaendelea kufanya kazi:
     1. Sidebar Moduli 8 → `switchDashTab('pos_page')` → POS kama ukurasa
     2. Vitufe vya zamani (`showForm('businessOSForm')`, footer POS, header
        POS, "REKODI MAUZO") → modal ile ile ya awali
        (usiache uvunjike: `showForm` inarejesha fomu kwanza kisha inafungua)

   Hakuna data, collection, callable, wala kanuni ya biashara iliyoguzwa.
   ========================================================================== */

(function () {
    var FORM_ID = 'businessOSForm';
    var PAGE_ID = 'bosPosPage';

    function formEl() { return document.getElementById(FORM_ID); }
    function isEmbedded() { return !!window.__bosPosEmbedded; }

    /* Hifadhi mahali pa asili + style ya asili MARA MOJA tu. */
    function rememberHome(form) {
        if (window.__bosPosHome) return;
        window.__bosPosHome = {
            parent: form.parentNode,
            next: form.nextSibling || null,
            style: form.getAttribute('style') || ''
        };
    }

    /* ---------- 1. Onyesha POS kama ukurasa ---------- */
    window.skhBOSPosPageRender = function () {
        var ws = document.getElementById('dashWorkspace');
        if (!ws) return false;
        var form = formEl();

        if (!form) {
            /* Hakuna terminal kwenye DOM (index.html isiyo kamili): hakuna kubuni. */
            ws.innerHTML = ''
                + '<div class="bos-pos-page" id="' + PAGE_ID + '">'
                + '<div class="bos-pos-empty">'
                + '<b>POS haipatikani kwenye ukurasa huu</b>'
                + '<p>Fomu ya POS (businessOSForm) haipo kwenye DOM. Fungua upya ukurasa wa Business OS.</p>'
                + '</div></div>';
            return true;
        }

        rememberHome(form);

        ws.innerHTML = ''
            + '<div class="bos-pos-page" id="' + PAGE_ID + '">'
            + '<div class="bos-pos-page-head">'
            + '  <div class="bos-pos-page-title">'
            + '    <b>POS — Mauzo ya Dukani</b>'
            + '    <small>Kituo kamili cha miamala (terminal ile ile ya SokoHai POS)</small>'
            + '  </div>'
            + '  <div class="bos-pos-page-actions">'
            + '    <button type="button" class="bos-btn is-ghost" onclick="window.skhBOSPosPageRestore(); window.switchDashTab(\'overview\')">Rudi Dashibodi</button>'
            + '    <button type="button" class="bos-btn" onclick="window.skhBOSPosPageToModal()">Dirisha dogo</button>'
            + '  </div>'
            + '</div>'
            + '<div class="bos-pos-page-body" id="bosPosBody"></div>'
            + '</div>';

        var body = document.getElementById('bosPosBody');
        body.appendChild(form);           /* DOM move: nodi ile ile, handlers zile zile */

        form.style.display = 'block';
        form.style.position = 'static';
        form.style.transform = 'none';
        form.style.top = 'auto';
        form.style.left = 'auto';
        form.style.margin = '0';
        form.style.maxHeight = 'none';
        form.style.maxWidth = '100%';
        form.style.width = '100%';
        form.style.boxShadow = 'none';
        form.classList.add('bos-pos-embedded');
        window.__bosPosEmbedded = true;

        /* Tabo za POS zile zile za awali (zilikuwa zinaitwa na showForm) */
        try { if (typeof window.warmPosProductsCache === 'function') window.warmPosProductsCache(); } catch (e) { }
        try { if (typeof window.renderRecentProducts === 'function') window.renderRecentProducts(); } catch (e) { }
        try { if (typeof window.renderPosOfflineQueueStatus === 'function') window.renderPosOfflineQueueStatus(); } catch (e) { }
        return true;
    };

    /* ---------- 2. Rejesha fomu mahali pake (bila kuifuta) ---------- */
    window.skhBOSPosPageRestore = function () {
        var form = formEl();
        var home = window.__bosPosHome;
        window.__bosPosEmbedded = false;
        if (!form || !home || !home.parent) return false;
        try {
            form.classList.remove('bos-pos-embedded');
            if (home.style) form.setAttribute('style', home.style);
            else form.removeAttribute('style');
            if (home.next && home.next.parentNode === home.parent) home.parent.insertBefore(form, home.next);
            else home.parent.appendChild(form);
        } catch (e) { console.warn('[BOS] POS restore imeshindikana:', e && e.message); }
        return true;
    };

    /* "Dirisha dogo" — kitufe cha hiari kinachorudisha POS kwenye modal ile ile */
    window.skhBOSPosPageToModal = function () {
        window.skhBOSPosPageRestore();
        if (typeof window.showForm === 'function') return window.showForm(FORM_ID);
        return false;
    };

    /* ---------- 3. Kuunganisha kwenye mtiririko uliopo (additive wrappers) ---------- */

    /* 3a. switchDashTab: `pos_page` inachora ukurasa; kuondoka kunarejesha fomu. */
    if (typeof window.switchDashTab === 'function' && !window.__bosPosSwitchWrapped) {
        var prevSwitch = window.switchDashTab;
        window.switchDashTab = function (tabName) {
            if (isEmbedded() && tabName !== 'pos_page') {
                try { window.skhBOSPosPageRestore(); } catch (e) { }
            }
            var out = prevSwitch.apply(this, arguments);
            if (tabName === 'pos_page') {
                try { window.skhBOSPosPageRender(); } catch (e) { console.warn('[BOS] POS page:', e && e.message); }
            }
            return out;
        };
        window.__bosPosSwitchWrapped = true;
    }

    /* 3b. showForm: modal ya POS ya zamani iendelee kufanya kazi (fomu irejeshwe kwanza) */
    if (typeof window.showForm === 'function' && !window.__bosPosShowFormWrapped) {
        var prevShowForm = window.showForm;
        window.showForm = function (formId) {
            if (isEmbedded() && formId === FORM_ID) {
                try { window.skhBOSPosPageRestore(); } catch (e) { }
            }
            return prevShowForm.apply(this, arguments);
        };
        window.__bosPosShowFormWrapped = true;
    }

    /* 3c. goBackToMenu: ndani ya ukurasa wa POS, "Rudi Nyuma" inarudi Dashboard Kuu */
    if (typeof window.goBackToMenu === 'function' && !window.__bosPosBackWrapped) {
        var prevBack = window.goBackToMenu;
        window.goBackToMenu = function () {
            if (isEmbedded()) {
                try { window.skhBOSPosPageRestore(); } catch (e) { }
                try { window.switchDashTab('overview'); } catch (e) { }
                return;
            }
            return prevBack.apply(this, arguments);
        };
        window.__bosPosBackWrapped = true;
    }

    /* 3d. loadAndRenderDashboard: usifute fomu iliyoingizwa kwenye ukurasa */
    if (typeof window.loadAndRenderDashboard === 'function' && !window.__bosPosDashWrapped) {
        var prevLoad = window.loadAndRenderDashboard;
        window.loadAndRenderDashboard = function () {
            if (isEmbedded()) { try { window.skhBOSPosPageRestore(); } catch (e) { } }
            return prevLoad.apply(this, arguments);
        };
        window.__bosPosDashWrapped = true;
    }

    window.skhBOSPosPage = {
        render: window.skhBOSPosPageRender,
        restore: window.skhBOSPosPageRestore,
        toModal: window.skhBOSPosPageToModal,
        isEmbedded: isEmbedded
    };
})();
