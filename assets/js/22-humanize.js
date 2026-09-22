/* ============================================================
   SOKOHAI — HUMANIZE LAYER (2026-09-14)
   ------------------------------------------------------------
   Inashughulikia mambo matatu:

   1) ICONS  — hubadilisha <span class="skh-ico" data-ico="x">
               kuwa SVG halisi (nafasi ya emoji zilizoondolewa).

   2) LUGHA  — hurekebisha kuchanganyika kwa lugha. Mfumo ulikuwa
               na dictionaries MBILI (24-ui-final.js + 32-i18n.js)
               na maandishi 663 yaliyofungwa moja kwa moja kwenye
               HTML, hivyo Kiswahili na Kiingereza vilionekana kwa
               wakati mmoja (SW 69 + EN 13 kwenye skrini moja).

   3) MAELEKEZO — hupunguza maneno marefu ya maelekezo kuwa lugha
               ya kibinadamu, fupi (humanized form).
   ============================================================ */
(function () { 'use strict';

    /* ========================================================
     * 1) ICONS — hydrate
     * ======================================================== */
    function hydrateIcons(root) {
        if (!window.skhNavIcon) return;
        var nodes = (root || document).querySelectorAll('.skh-ico[data-ico]:empty');
        Array.prototype.forEach.call(nodes, function (el) {
            var name = el.getAttribute('data-ico');
            try { el.innerHTML = window.skhNavIcon(name, 14) || ''; } catch (e) {}
        });
    }
    window.skhHydrateIcons = hydrateIcons;

    /* ========================================================
     * 2) LUGHA — kamusi ya nyongeza kwa maandishi yaliyokwama
     *    Hii INAZIBA pengo bila kuandika upya index.html nzima:
     *    maneno yanayoonekana yanabadilishwa moja kwa moja
     *    kulingana na lugha iliyochaguliwa.
     * ======================================================== */

    // en -> sw  (maandishi yanayojitokeza kwenye UI halisi)
    var EN2SW = { 'Welcome back': 'Karibu tena', 'Total Received': 'Jumla Iliyopokelewa', 'Total Assets': 'Jumla ya Mali', 'Total Earnings': 'Mapato Yote', 'This Month': 'Mwezi Huu', 'Printing & Copy Services': 'Huduma za Uchapishaji na Nakala', 'Physical Services': 'Huduma za Ana kwa Ana', 'Online Services': 'Huduma za Mtandaoni', 'Food Services': 'Huduma za Vyakula', 'Rental Services': 'Huduma za Ukodishaji', 'Pet Products': 'Bidhaa za Wanyama', 'Code Search': 'Tafuta kwa Msimbo', 'Home': 'Nyumbani', 'Transport': 'Usafiri', 'Fashion': 'Mavazi', 'Loading': 'Inapakia', 'Processing': 'Inashughulikia', 'Search': 'Tafuta', 'Filter': 'Chuja', 'Close': 'Funga', 'Cancel': 'Ghairi', 'Save': 'Hifadhi', 'Delete': 'Futa', 'Edit': 'Hariri', 'View': 'Tazama', 'Back': 'Rudi', 'Next': 'Endelea', 'Submit': 'Wasilisha', 'Confirm': 'Thibitisha', 'Total': 'Jumla', 'Price': 'Bei', 'Quantity': 'Idadi', 'Seller': 'Muuzaji', 'Buyer': 'Mnunuzi', 'Order': 'Oda', 'Payment': 'Malipo', 'Delivery': 'Uwasilishaji', 'Status': 'Hali', 'Pending': 'Inasubiri', 'Completed': 'Imekamilika', 'Cancelled': 'Imeghairiwa', 'Active': 'Inaendelea'
    };

    // sw -> en (kinyume; hutumika lugha ikiwa EN)
    var SW2EN = {};
    Object.keys(EN2SW).forEach(function (k) { SW2EN[EN2SW[k]] = k; });

    /* --------------------------------------------------------
     * 3) MAELEKEZO MAFUPI (humanized form)
     *    Kabla: sentensi ndefu za kiufundi.
     *    Baada: fupi, za kibinadamu.
     * -------------------------------------------------------- */
    var SHORTEN = [
        [/Malipo yanalindwa na Escrow\s*—\s*huachiwa muuzaji hadi upokee\.?/gi, 'Pesa yako inalindwa hadi upokee bidhaa.'],
        [/Usafirishaji hupangwa kupitia madereva wa SokoHai wakati wa kulipa;\s*nauli ni ya msafirishaji\.?/gi, 'Utachagua dereva wakati wa kulipa.'],
        [/Unaweza kulipa mtandaoni kwa Escrow na uchukue au usafirishwe\.?/gi, 'Lipa mtandaoni, kisha chukua au usafirishwe.'],
        [/Eleza mahitaji kwa kitufe cha Agiza Huduma au mwasiliane kwa Chat\.?/gi, 'Bonyeza "Agiza Huduma" au anza mazungumzo.'],
        [/Kubaliananeni nauli na dereva;\s*malipo ya Escrow baada ya kupokezana mzigo\.?/gi, 'Kubaliana nauli na dereva. Pesa inalindwa hadi mzigo ufike.'],
        [/Hujaona tathmini bado\.\s*Ukinunua kupitia Escrow,\s*tathmini yako inaweza kuthibitishwa\.?/gi, 'Bado hakuna tathmini.'],
        [/Muuzaji hajaweka maelezo ya kina\.?/gi, 'Hakuna maelezo ya ziada.'],
        [/Bei ya sokoni \*?\*?haibadilishwi\*?\*?\.\s*Unawasilisha bei yako ya majadiliano pekee\s*—\s*muuzaji ndiye atakayejibu\.?/gi, 'Pendekeza bei yako. Muuzaji atajibu.'],
        [/Nauli ya tangazo \*?\*?haibadilishwi\*?\*?\.\s*Unawasilisha nauli unayopendekeza\s*—\s*msafirishaji ndiye atakayejibu\.?/gi, 'Pendekeza nauli yako. Msafirishaji atajibu.'],
        [/Bei ya kawaida \*?\*?haibadilishwi\*?\*?\.\s*Unawasilisha bei unayopendekeza\s*—\s*mtoa huduma ndiye atakayejibu\.?/gi, 'Pendekeza bei yako. Mtoa huduma atajibu.'],
        [/Tafadhali kamilisha sehemu zilizoonyeshwa\.?/gi, 'Jaza sehemu zilizokosekana.'],
        [/Fungua mazungumzo na muuzaji kwanza,\s*kisha rudi kwenye ofa\.?/gi, 'Mazungumzo yanaandaliwa kiotomatiki. Jaribu tena.'],
        [/Kitendo hiki hakirudishiki nyuma!?/gi, 'Hakuna kurudi nyuma.'],
        [/\bJe,\s*una uhakika unataka\b/gi, 'Una uhakika unataka'],
        // [FIX] `\b` ni MUHIMU. Bila mpaka wa neno, "Tafadhali\s+" ilikata
        // herufi ndani ya maneno mengine ("lako..." ikawa "lal").
        [/\bTafadhali\b[ ]*/gi, ''],
        [/\bSamahani,?[ ]*/gi, '']
    ];

    function humanizeText(s) {
        if (!s || s.length < 12) return s;
        var out = s;
        for (var i = 0; i < SHORTEN.length; i++) out = out.replace(SHORTEN[i][0], SHORTEN[i][1]);
        return out;
    }
    window.skhHumanize = humanizeText;

    /* ========================================================
     * KIPITIO CHA DOM — hutumia zote tatu kwa pamoja
     * ======================================================== */
    var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, PRE: 1, SVG: 1 };

    function currentLang() {
        try {
            if (window.SokoHaiLMS && window.SokoHaiLMS.lang) return window.SokoHaiLMS.lang;
            return localStorage.getItem('sokohai_lang') || 'sw';
        } catch (e) { return 'sw'; }
    }

    function sweep(root) {
        var lang = currentLang();
        var map = lang === 'en' ? SW2EN : EN2SW;
        var walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                var p = n.parentNode;
                if (!p || SKIP_TAGS[p.nodeName]) return NodeFilter.FILTER_REJECT;
                if (p.closest && p.closest('[data-no-i18n],.ch-react,.ch-reaction,input,textarea')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        var node, changed = 0;
        while ((node = walker.nextNode())) {
            var t = node.nodeValue, orig = t;

            // (a) fupisha maelekezo marefu
            t = humanizeText(t);

            // (b) sawazisha lugha (maneno kamili pekee — si sehemu za maneno)
            Object.keys(map).forEach(function (from) {
                if (t.indexOf(from) === -1) return;
                var re = new RegExp('\\b' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
                t = t.replace(re, map[from]);
            });

            if (t !== orig) { node.nodeValue = t; changed++; }
        }
        return changed;
    }
    window.skhLangSweep = sweep;

    /* ========================================================
     * ENDESHA: baada ya boot, na kila DOM inapobadilika
     * ======================================================== */
    var pending = null;
    function run() {
        if (pending) return;
        pending = setTimeout(function () {
            pending = null;
            try { hydrateIcons(document); } catch (e) {}
            try { sweep(document.body); } catch (e) {}
        }, 160);
    }

    function start() {
        run();
        try {
            new MutationObserver(function (muts) {
                for (var i = 0; i < muts.length; i++) {
                    if (muts[i].addedNodes && muts[i].addedNodes.length) { run(); return; }
                }
            }).observe(document.body, { childList: true, subtree: true });
        } catch (e) {}
        // Lugha ikibadilishwa, pitia upya mara moja
        document.addEventListener('skh:lang-changed', run);
        var origSet = window.setSokoHaiLanguage;
        if (typeof origSet === 'function') {
            window.setSokoHaiLanguage = function (l) {
                var r = origSet.apply(this, arguments);
                setTimeout(run, 120);
                return r;
            };
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
