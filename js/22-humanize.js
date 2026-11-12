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
    var EN2SW = { 'Welcome back': 'Karibu tena', 'Total Received': 'Jumla Iliyopokelewa', 'Total Assets': 'Jumla ya Mali', 'Total Earnings': 'Mapato Yote', 'This Month': 'Mwezi Huu', 'Printing & Copy Services': 'Huduma za Uchapishaji na Nakala', 'Physical Services': 'Huduma za Ana kwa Ana', 'Online Services': 'Huduma za Mtandaoni', 'Food Services': 'Huduma za Vyakula', 'Rental Services': 'Huduma za Ukodishaji', 'Pet Products': 'Bidhaa za Wanyama', 'Code Search': 'Tafuta kwa Msimbo', 'Home': 'Nyumbani', 'Transport': 'Usafiri', 'Fashion': 'Mavazi', 'Loading': 'Inapakia', 'Processing': 'Inashughulikia', 'Search': 'Tafuta', 'Filter': 'Chuja', 'Close': 'Funga', 'Cancel': 'Ghairi', 'Save': 'Hifadhi', 'Delete': 'Futa', 'Edit': 'Hariri', 'View': 'Tazama', 'Back': 'Rudi', 'Next': 'Endelea', 'Submit': 'Wasilisha', 'Confirm': 'Thibitisha', 'Total': 'Jumla', 'Price': 'Bei', 'Quantity': 'Idadi', 'Seller': 'Muuzaji', 'Buyer': 'Mnunuzi', 'Order': 'Oda', 'Payment': 'Malipo', 'Delivery': 'Uwasilishaji', 'Status': 'Hali', 'Pending': 'Inasubiri', 'Completed': 'Imekamilika', 'Cancelled': 'Imeghairiwa', 'Active': 'Inaendelea',
        // [R12] phrases found by the full-system label scan (whole phrases beat word-by-word mixes)
        "Available Balance": "Salio Linalopatikana", "Cart iko wazi.": "Kikapu ni tupu.", "Cart iko wazi": "Kikapu ni tupu", "Create Contract": "Tengeneza Mkataba", "Create Link": "Tengeneza Link ya Malipo", "Discover New Updates": "Mapya Sokoni", "Discover, vichujio na search": "Gundua, vichujio na utafutaji", "EMPLOYEES DIRECTORY & PAYROLL DETAILS": "ORODHA YA WAFANYAKAZI NA MISHAHARA", "EXPECTED PROFIT (STOCK)": "FAIDA INAYOTARAJIWA (STOO)", "EXPECTED SALES VALUE": "THAMANI YA MAUZO INAYOTARAJIWA", "Fuel, repairs and other trip costs.": "Mafuta, matengenezo na gharama nyingine za safari.", "Go to Wallet": "Fungua Wallet", "Help & Support": "Msaada", "Help": "Msaada", "Here's what's happening with your account today.": "Haya ndiyo yanayoendelea kwenye akaunti yako leo.", "INVENTORY VALUE (COST)": "THAMANI YA STOO (GHARAMA)", "Inventory & Stock Control Room": "Udhibiti wa Stoo", "KIKAPU CHA POS (CART)": "KIKAPU CHA POS", "Live Tracking Feed": "Ufuatiliaji wa Moja kwa Moja", "Live linked": "Imeunganishwa", "Buyer Dashboard": "Dashibodi ya Mnunuzi", "Mnunuzi Dashboard": "Dashibodi ya Mnunuzi", "Quick Actions": "Vitendo vya Haraka", "Ready to use": "Tayari kutumika", "Request Service": "Omba Huduma", "Back to Main Dashboard": "Rudi Dashibodi Kuu", "Rudi to Main Dashboard": "Rudi Dashibodi Kuu", "Staff & Payroll Management": "Wafanyakazi na Mishahara", "Staff & Payroll": "Wafanyakazi na Mishahara", "Staff Distribution": "Mgawanyo wa Wafanyakazi", "Stock Movement Trend (In vs Out)": "Mwenendo wa Stoo (Iliyoingia na Iliyotoka)", "TOP PERFORMER": "ANAYEONGOZA", "TOTAL SKUs": "JUMLA YA SKU", "TOTAL STAFF": "JUMLA YA WAFANYAKAZI", "TOTAL STOCK UNITS": "JUMLA YA VIPIMO VYA STOO", "STOCK TURNOVER": "MZUNGUKO WA STOO", "STOCK OVERVIEW (MULTI-UNIT CONVERSIONS)": "MUHTASARI WA STOO (VIPIMO VINGI)", "STOCK MODE (SHERIA ZA STOO)": "SHERIA ZA STOO", "View all": "Tazama zote", "Tazama all": "Tazama zote", "See all": "Tazama zote", "Usafiri performance: trips, revenue and efficiency.": "Utendaji wa usafiri: safari, mapato na ufanisi.", "Transport performance: trips, revenue and efficiency.": "Utendaji wa usafiri: safari, mapato na ufanisi.", "Open Usafiri System": "Fungua Mfumo wa Usafiri", "Open Transport System": "Fungua Mfumo wa Usafiri", "Wallet Summary": "Muhtasari wa Wallet", "Withdraw": "Toa Pesa", "Bidhaa (Product)": "Bidhaa", "CHAGUA KITENDO CHA POS (ACTION CENTER)": "CHAGUA KITENDO CHA POS", "Chagua aina hapo juu kuona vichujio (Filters)": "Chagua aina hapo juu kuona vichujio", "Ondoa filters zote": "Ondoa vichujio vyote", "Onyesha faida (Profit)": "Onyesha faida", "Onyesha mauzo (Sales)": "Onyesha mauzo", "Onyesha tahadhari ya stoo ndogo (Low stock)": "Onyesha tahadhari ya stoo ndogo", "Mpe Cashier uwezo wa kuona ripoti ya Faida (Profit)": "Mpe Cashier uwezo wa kuona ripoti ya faida", "Performance": "Utendaji", "Settings": "Mipangilio", "Clear": "Futa", "Continue": "Endelea", "Discount": "Punguzo", "Icons, alama, badges & maana zake \u2014 single source of truth": "Alama na maana zake", "Track Package": "Fuatilia Mzigo", "Track": "Fuatilia", "Transactions": "Miamala", "Disputes": "Migogoro", "Direct Pay": "Lipa Moja kwa Moja", "SOKOPAY MVP": "SOKOPAY", "TRUST & SECURITY": "USALAMA NA UAMINIFU", "Verified Node": "Imethibitishwa", "Escrow Locked": "Imefungwa (Escrow)", "Protected": "Imelindwa", "Awaiting confirm": "Inasubiri uthibitisho", "Send Payment": "Tuma Malipo", "Generate Token": "Tengeneza Token", "Available": "Inapatikana", "Escrow / Locked": "Escrow (imefungwa)", "Add option": "Ongeza chaguo", "Add variant": "Ongeza variant", "Add feature": "Ongeza sifa", "Add information": "Ongeza taarifa", "Existing legacy fields and identities remain preserved.": "Taarifa za zamani za bidhaa zinabaki kama zilivyo.", "Discovery filter": "Kichujio cha utafutaji", "\u2014 Select / Custom \u2014": "\u2014 Chagua / Andika mwenyewe \u2014", "Sellable stock": "Stock inayouzika", "Dashboard Kuu": "Dashibodi Kuu", "DASHBOARD KUU": "DASHIBODI KUU", "Fixed Price (Trip Moja)": "Bei Maalum (Safari Moja)", "Tengeneza variants (Generate variants)": "Tengeneza variants", "\uff0b Ongeza variant mwenyewe (Add Variant Manually)": "\uff0b Ongeza variant mwenyewe"
    };

    // sw -> en (kinyume; hutumika lugha ikiwa EN)
    var SW2EN = {};
    Object.keys(EN2SW).forEach(function (k) { if (!SW2EN[EN2SW[k]]) SW2EN[EN2SW[k]] = k; });
    var byLen = function (a, b) { return b.length - a.length; };
    var EN2SW_KEYS = Object.keys(EN2SW).sort(byLen), SW2EN_KEYS = Object.keys(SW2EN).sort(byLen);

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
    var DATA_TEXT = ['.subcat-chip', '.cat-name', '.cps-card-name', '.gds-tile-name', '.skh-title', '#pmTitle', '.pm-rel-title',
        '.pm-offer-who', '#prodCategory', '#prodSubCategory', '#prodOfflineCategory', '#editCategory', '#editSubCategory',
        '#activeCategoryText', '#prodTaxonomyResults', '.spb-suggest'].join(',');

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
                // [REMEDIATION R5] taxonomy names and seller-written listing text are DATA,
                // never UI phrases ("Home Appliances" must not become "Nyumbani Appliances").
                if (p.closest && p.closest('[data-no-i18n],.ch-react,.ch-reaction,input,textarea,' + DATA_TEXT)) {
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
            // [R12] longest phrase first ("Back to Main Dashboard" before "Back"), and a word
            // boundary only on a side that is a word character ("(Profit)" has none).
            (map === SW2EN ? SW2EN_KEYS : EN2SW_KEYS).forEach(function (from) {
                if (t.indexOf(from) === -1) return;
                var body = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                var re = new RegExp((/^\w/.test(from) ? '\\b' : '') + body + (/\w$/.test(from) ? '\\b' : ''), 'g');
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
