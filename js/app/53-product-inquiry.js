/* ==== js/app/53-product-inquiry.js ====
   ============================================================================
   SOKOHAI — ULIZA ZAIDI KUHUSU BIDHAA (Product Inquiry Builder)
   ----------------------------------------------------------------------------
   Mteja hujenga swali lenye maswali mengi: kila swali lina aina ya jibu na
   (inapohitajika) machaguo; anaweza kuongeza, kuhariri, kupanga upya na
   kufuta kabla ya kutuma. Kabla ya kutuma anaona skrini ya TATHMINI.

   MUHIMU — HATUGUSI MAONI YA UMMA:
     • Maoni (comments) = `skhOpenMaoni()` / collection `comments` — HAIJAGUSWA.
     • Swali (inquiry)  = collection mpya `productInquiries` + ujumbe wa Chat.
   Kila swali linaenda kwa muuzaji kama ujumbe wa faragha (si comment ya umma).

   Mipaka: maswali <= 20, machaguo <= 12, swali <= 160 herufi, chaguo <= 60.
   ============================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    'use strict';

    var MAX_Q = 20, MAX_OPT = 12, MAX_Q_LEN = 160, MAX_OPT_LEN = 60;
    var UNITS = ['Kg', 'g', 'L', 'ml', 'm', 'cm', 'pcs', 'Dazeni', 'Sanduku', 'Gunia'];

    var TYPES = {
        single:  { label: 'Chaguo moja',      answerModel: 'single_select', opts: true },
        multi:   { label: 'Chaguo nyingi',    answerModel: 'multi_select',  opts: true },
        yesno:   { label: 'Ndiyo / Hapana',   answerModel: 'boolean',       opts: false },
        text:    { label: 'Maandishi mafupi', answerModel: 'short_text',    opts: false },
        number:  { label: 'Namba',            answerModel: 'number',        opts: false },
        measure: { label: 'Kipimo + unit',    answerModel: 'quantity',      opts: false }
    };
    var TYPE_ORDER = ['single', 'multi', 'yesno', 'text', 'number', 'measure'];

    var S = {
        product: null,
        questions: [],
        seq: 0,
        view: 'builder',   // builder | review | done
        busy: false,
        lastDoc: null
    };

    var LAYER = null;

    /* ---------------------------------------------------------------- utils */
    function $(id) { return document.getElementById(id); }
    function nowIso() { return new Date().toISOString(); }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function uid(p) { S.seq++; return (p || 'x') + S.seq + '_' + Date.now().toString(36).slice(-4); }
    function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) : s; }
    function myUid() { return (skh.currentUser && skh.currentUser.uid) || null; }
    function myName() {
        if (skh.currentUser && skh.currentUser.displayName) return skh.currentUser.displayName;
        if (skh.currentUser && skh.currentUser.email) return String(skh.currentUser.email).split('@')[0];
        return 'Mteja';
    }
    function toast(msg, undoLabel, undoFn) {
        if (!LAYER) return;
        var t = LAYER.querySelector('.inq-toast');
        if (!t) return;
        t.querySelector('.inq-toast-msg').textContent = msg;
        var b = t.querySelector('.inq-toast-undo');
        if (undoFn) {
            b.style.display = 'inline-block';
            b.textContent = undoLabel || 'Rudisha';
            b.onclick = function () { undoFn(); hideToast(); };
        } else {
            b.style.display = 'none';
            b.onclick = null;
        }
        t.classList.add('show');
        clearTimeout(t._tm);
        t._tm = setTimeout(hideToast, undoFn ? 5000 : 2600);
    }
    function hideToast() {
        var t = LAYER && LAYER.querySelector('.inq-toast');
        if (t) t.classList.remove('show');
    }

    /* ------------------------------------------------------------- maswali */
    function newQuestion(text, type, opts) {
        var q = {
            id: uid('q'),
            text: text || '',
            type: type || 'single',
            options: [],
            unit: 'Kg',
            numVal: '',
            touched: false
        };
        var list = (opts && opts.length) ? opts : ['', ''];
        list.slice(0, MAX_OPT).forEach(function (t) {
            q.options.push({ id: uid('o'), text: t || '' });
        });
        return q;
    }
    function findQ(id) {
        for (var i = 0; i < S.questions.length; i++) if (S.questions[i].id === id) return S.questions[i];
        return null;
    }
    function idxOf(id) {
        for (var i = 0; i < S.questions.length; i++) if (S.questions[i].id === id) return i;
        return -1;
    }
    function cleanOpts(q) {
        return q.options.map(function (o) { return String(o.text || '').trim(); }).filter(Boolean);
    }
    function qState(q) {
        if (!String(q.text || '').trim()) return { ok: false, why: 'Swali halina maandishi' };
        if (TYPES[q.type].opts && cleanOpts(q).length < 2) return { ok: false, why: 'Ongeza machaguo 2+' };
        return { ok: true };
    }
    function validCount() {
        return S.questions.filter(function (q) { return qState(q).ok; }).length;
    }
    function progressPct() {
        if (!S.questions.length) return 0;
        return Math.round((validCount() / S.questions.length) * 100);
    }

    /* ---------------------------------------------------------- kufungua */
    function ensureLayer() {
        if (LAYER) return LAYER;
        LAYER = $('inquiryLayer');
        if (!LAYER) return null;
        LAYER.querySelector('.inq-scrim').onclick = close;
        LAYER.addEventListener('click', onClick);
        LAYER.addEventListener('input', onInput);
        LAYER.addEventListener('change', onChange);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && LAYER && !LAYER.hidden) close();
        });
        return LAYER;
    }

    window.skhOpenInquiryBuilder = function () {
        var p = skh.currentOpenProduct;
        if (!p || !p.id) {
            if (typeof window.skhToast === 'function') window.skhToast('Fungua bidhaa kwanza.', 'info', 2000);
            return;
        }
        if (!ensureLayer()) return;

        S.product = p;
        S.view = 'builder';
        S.lastDoc = null;
        if (!S.questions.length) S.questions.push(newQuestion());

        // Funga maoni kama yamefunguliwa (tabaka moja tu kwa wakati mmoja).
        try { if (typeof window.skhCloseMaoni === 'function' && $('maoniLayer') && !$('maoniLayer').hidden) window.skhCloseMaoni(); } catch (e) {}

        LAYER.hidden = false;
        requestAnimationFrame(function () { LAYER.classList.add('is-open'); });
        render();
        setTimeout(function () {
            var t = LAYER.querySelector('.inq-qtext');
            if (t) { try { t.focus(); } catch (e) {} }
        }, 260);
    };

    function close() {
        if (!LAYER) return;
        LAYER.classList.remove('is-open');
        setTimeout(function () { LAYER.hidden = true; }, 210);
    }
    window.skhCloseInquiryBuilder = close;

    /* ------------------------------------------------------------- render */
    function headHtml() {
        var title = S.view === 'review' ? 'Tathmini swali lako'
                  : S.view === 'done' ? 'Swali limetumwa'
                  : 'Uliza Zaidi kuhusu Bidhaa';
        var sub = S.product
            ? (clip(S.product.title || 'Bidhaa', 26) + ' · ' + clip(S.product.location || S.product.region || '', 18))
            : '';
        var count = S.questions.length;
        return ''
            + '<div class="inq-head">'
            +   '<div class="inq-head-row">'
            +     '<button type="button" class="inq-back" data-act="back" aria-label="Rudi kwenye bidhaa">'
            +       '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>'
            +     '</button>'
            +     '<div class="inq-titles"><h3>' + title + '</h3><p>' + esc(sub) + '</p></div>'
            +     '<span class="inq-count" id="inqCount">Maswali ' + count + '</span>'
            +     '<button type="button" class="inq-x" data-act="close" aria-label="Funga">'
            +       '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
            +     '</button>'
            +   '</div>'
            +   '<div class="inq-progress" aria-hidden="true"><i id="inqBar" style="width:' + progressPct() + '%"></i></div>'
            + '</div>';
    }

    function typeChips(q) {
        return TYPE_ORDER.map(function (t) {
            var on = q.type === t;
            return '<button type="button" class="inq-type' + (on ? ' on' : '') + '" data-act="type" data-id="' + q.id + '" data-t="' + t + '" aria-pressed="' + on + '">'
                + '<span class="dot" aria-hidden="true"></span>' + TYPES[t].label + '</button>';
        }).join('');
    }

    function optionsBlock(q) {
        if (!TYPES[q.type].opts) return '';
        var rows = q.options.map(function (o, i) {
            return '<div class="inq-opt">'
                + '<span class="inq-opt-mark" aria-hidden="true">' + (q.type === 'multi' ? '✓' : (i + 1)) + '</span>'
                + '<input type="text" data-act="opt" data-id="' + q.id + '" data-oid="' + o.id + '" value="' + esc(o.text) + '" maxlength="' + MAX_OPT_LEN + '" placeholder="Chaguo ' + (i + 1) + '" aria-label="Chaguo ' + (i + 1) + '">'
                + '<button type="button" class="inq-mini danger" data-act="delopt" data-id="' + q.id + '" data-oid="' + o.id + '" aria-label="Ondoa chaguo">✕</button>'
                + '</div>';
        }).join('');
        var addBtn = q.options.length >= MAX_OPT ? '' :
            '<button type="button" class="inq-addopt" data-act="addopt" data-id="' + q.id + '">＋ Ongeza chaguo</button>';
        return '<div class="inq-opts">' + rows + addBtn + '</div>';
    }

    function numberBlock(q) {
        if (q.type === 'number') {
            return '<div class="inq-numrow">'
                + '<input type="number" inputmode="decimal" min="0" data-act="num" data-id="' + q.id + '" value="' + esc(q.numVal) + '" placeholder="Mfano: 50" aria-label="Thamani ya namba">'
                + '<span class="inq-hint">Jibu litakuwa namba</span></div>';
        }
        if (q.type === 'measure') {
            return '<div class="inq-numrow">'
                + '<input type="number" inputmode="decimal" min="0" data-act="num" data-id="' + q.id + '" value="' + esc(q.numVal) + '" placeholder="Mfano: 50" aria-label="Thamani ya kipimo">'
                + '<select data-act="unit" data-id="' + q.id + '" aria-label="Kipimo">'
                + UNITS.map(function (u) { return '<option value="' + u + '"' + (q.unit === u ? ' selected' : '') + '>' + u + '</option>'; }).join('')
                + '</select><span class="inq-hint">Kipimo + unit</span></div>';
        }
        if (q.type === 'yesno') return '<div class="inq-numrow"><span class="inq-hint">Majibu: <b>Ndiyo</b> au <b>Hapana</b>.</span></div>';
        if (q.type === 'text') return '<div class="inq-numrow"><span class="inq-hint">Mteja ataandika jibu fupi.</span></div>';
        return '';
    }

    function cardHtml(q, i) {
        var st = qState(q);
        return '<article class="inq-card' + (q.touched && !st.ok ? ' is-bad' : '') + '" data-qid="' + q.id + '">'
            + '<div class="inq-card-top">'
            +   '<span class="inq-num">' + (i + 1) + '</span>'
            +   '<input class="inq-qtext" type="text" data-act="text" data-id="' + q.id + '" value="' + esc(q.text) + '" maxlength="' + MAX_Q_LEN + '" placeholder="Andika swali lako… mfano: Ni uzito gani kwa kila gunia?" aria-label="Swali ' + (i + 1) + '">'
            +   '<div class="inq-tools">'
            +     '<button type="button" class="inq-mini" data-act="up" data-id="' + q.id + '" aria-label="Pandisha juu"' + (i === 0 ? ' disabled' : '') + '>↑</button>'
            +     '<button type="button" class="inq-mini" data-act="down" data-id="' + q.id + '" aria-label="Shusha chini"' + (i === S.questions.length - 1 ? ' disabled' : '') + '>↓</button>'
            +     '<button type="button" class="inq-mini danger" data-act="del" data-id="' + q.id + '" aria-label="Ondoa swali">✕</button>'
            +   '</div>'
            + '</div>'
            + '<div class="inq-types">' + typeChips(q) + '</div>'
            + optionsBlock(q)
            + numberBlock(q)
            + '<div class="inq-foot">'
            +   '<span class="inq-state ' + (st.ok ? 'ok' : 'bad') + '">' + (st.ok ? '✓ Tayari' : '• ' + st.why) + '</span>'
            +   '<span class="inq-badge">' + TYPES[q.type].label + '</span>'
            + '</div>'
            + '</article>';
    }

    function builderHtml() {
        var body = '';
        if (!S.questions.length) {
            body = '<div class="inq-empty"><div style="font-size:26px">💬</div>'
                + '<h4>Bado hujaongeza swali</h4><p>Bonyeza “Ongeza Taarifa Nyingine” au chagua mfano.</p></div>';
        } else {
            body = S.questions.map(cardHtml).join('');
        }
        return body
            + '<button type="button" class="inq-addq" data-act="add">'
            +   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
            +   'Ongeza Taarifa Nyingine</button>'
            + '<div class="inq-suggest"><h5>Mifano ya haraka</h5><div class="inq-chips">'
            +   '<button type="button" class="inq-chip" data-act="quick" data-q="Ni uzito gani kwa kila kipimo?" data-type="measure">Uzito kwa kipimo?</button>'
            +   '<button type="button" class="inq-chip" data-act="quick" data-q="Bei ni ya jumla au kwa kilo?" data-type="single" data-opts="Kwa kilo|Kwa jumla (gunia)">Bei ya jumla au kilo?</button>'
            +   '<button type="button" class="inq-chip" data-act="quick" data-q="Unaweza kusafirisha hadi Dar es Salaam?" data-type="yesno">Kusafirisha Dar?</button>'
            +   '<button type="button" class="inq-chip" data-act="quick" data-q="Kiwango cha chini cha oda ni kipi?" data-type="number">Kiwango cha chini?</button>'
            +   '<button type="button" class="inq-chip" data-act="quick" data-q="Bidhaa ni mpya au iliyotumika?" data-type="single" data-opts="Mpya|Iliyotumika">Mpya au iliyotumika?</button>'
            + '</div></div>';
    }

    function reviewHtml() {
        if (!S.questions.length) {
            return '<div class="inq-empty"><h4>Hakuna swali</h4><p>Rudi nyuma uongeze swali.</p></div>';
        }
        var items = S.questions.map(function (q, i) {
            var st = qState(q), inner = '';
            if (TYPES[q.type].opts) {
                inner = '<div class="inq-optchips">' + (cleanOpts(q).length ? cleanOpts(q).map(function (o) {
                    return '<span class="inq-optchip">' + esc(o) + '</span>';
                }).join('') : '<span class="inq-optchip">(hakuna machaguo)</span>') + '</div>';
            } else if (q.type === 'measure') {
                inner = '<div class="inq-optchips"><span class="inq-optchip">Kipimo: ' + esc(q.unit) + '</span>'
                    + (q.numVal ? '<span class="inq-optchip">Mfano: ' + esc(q.numVal) + ' ' + esc(q.unit) + '</span>' : '') + '</div>';
            } else if (q.type === 'number') {
                inner = '<div class="inq-optchips"><span class="inq-optchip">Namba' + (q.numVal ? ' · mfano ' + esc(q.numVal) : '') + '</span></div>';
            } else if (q.type === 'yesno') {
                inner = '<div class="inq-optchips"><span class="inq-optchip">Ndiyo</span><span class="inq-optchip">Hapana</span></div>';
            } else {
                inner = '<div class="inq-optchips"><span class="inq-optchip">Jibu la maandishi</span></div>';
            }
            return '<div class="inq-rev">'
                + '<span class="inq-rev-n">' + (i + 1) + '</span>'
                + '<div class="inq-rev-b"><h4>' + esc(q.text || '(swali tupu)') + '</h4>'
                + '<span class="inq-badge" style="margin:0">' + TYPES[q.type].label + '</span>'
                + (st.ok ? '' : '<span class="inq-badge" style="margin-left:6px;background:#FFF1F4;color:#BE123C">' + st.why + '</span>')
                + inner + '</div>'
                + '<div class="inq-rev-tools">'
                +   '<button type="button" class="inq-mini" data-act="up" data-id="' + q.id + '" aria-label="Pandisha juu"' + (i === 0 ? ' disabled' : '') + '>↑</button>'
                +   '<button type="button" class="inq-mini" data-act="down" data-id="' + q.id + '" aria-label="Shusha chini"' + (i === S.questions.length - 1 ? ' disabled' : '') + '>↓</button>'
                +   '<button type="button" class="inq-mini" data-act="edit" data-id="' + q.id + '" aria-label="Badilisha">'
                +     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>'
                +   '<button type="button" class="inq-mini danger" data-act="del" data-id="' + q.id + '" aria-label="Ondoa">✕</button>'
                + '</div></div>';
        }).join('');
        return items
            + '<div class="inq-summary"><h4>Muhtasari wa ujumbe</h4>'
            + '<p>Hivi ndivyo muuzaji atakavyoona swali lako kwenye Chat.</p>'
            + '<pre class="inq-pre">' + esc(chatText()) + '</pre></div>';
    }

    function doneHtml() {
        var d = S.lastDoc || {};
        return '<div class="inq-done">'
            + '<div class="inq-tick"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>'
            + '<h3>Swali limetumwa kwa muuzaji</h3>'
            + '<p>' + (d.questions ? d.questions.length : S.questions.length) + ' maswali yametumwa'
            + (d.chatSent ? ' pamoja na ujumbe wa Chat' : '') + '. Majibu yatawasili kwenye Chat.</p>'
            + '<div class="inq-done-actions">'
            +   '<button type="button" class="inq-secondary" data-act="newq">Uliza swali lingine</button>'
            +   '<button type="button" class="inq-primary" data-act="close">Funga</button>'
            + '</div></div>';
    }

    function footbarHtml() {
        if (S.view === 'done') return '';
        var n = S.questions.length, v = validCount();
        var meta = '<b>Maswali ' + n + '</b>' + (n === 0 ? 'anza kwa kuongeza swali' : (v === n ? 'yote tayari · endelea' : (n - v) + ' bado hayajakamilika'));
        var label = S.view === 'review' ? (S.busy ? 'Inatuma…' : 'Tuma Swali') : 'Tathmini';
        var dis = (S.busy || !(n > 0 && v === n)) ? ' disabled' : '';
        return '<div class="inq-footbar"><div class="inq-footbar-in">'
            + '<div class="inq-meta" id="inqMeta">' + meta + '</div>'
            + '<button type="button" class="inq-primary" id="inqCta" data-act="cta"' + dis + '>' + label
            +   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>'
            + '</button></div></div>';
    }

    function render() {
        if (!LAYER) return;
        var sheet = LAYER.querySelector('.inq-sheet');
        var body = S.view === 'review' ? reviewHtml() : (S.view === 'done' ? doneHtml() : builderHtml());
        sheet.innerHTML = headHtml()
            + '<div class="inq-body" id="inqBody">' + body + '</div>'
            + footbarHtml()
            + '<div class="inq-toast"><span class="inq-toast-msg"></span><button type="button" class="inq-toast-undo" style="display:none">Rudisha</button></div>';
    }

    function syncChrome() {
        var n = S.questions.length, v = validCount();
        var chip = $('inqCount'); if (chip) chip.textContent = 'Maswali ' + n;
        var bar = $('inqBar'); if (bar) bar.style.width = progressPct() + '%';
        var meta = $('inqMeta');
        if (meta) meta.innerHTML = '<b>Maswali ' + n + '</b>' + (n === 0 ? 'anza kwa kuongeza swali' : (v === n ? 'yote tayari · endelea' : (n - v) + ' bado hayajakamilika'));
        var cta = $('inqCta');
        if (cta) {
            cta.disabled = S.busy || !(n > 0 && v === n);
            cta.innerHTML = (S.view === 'review' ? (S.busy ? 'Inatuma…' : 'Tuma Swali') : 'Tathmini')
                + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
        }
    }

    function lightSync(q, inputEl) {
        var card = inputEl && inputEl.closest ? inputEl.closest('.inq-card') : null;
        if (card) {
            var st = qState(q);
            var state = card.querySelector('.inq-state');
            if (state) {
                state.className = 'inq-state ' + (st.ok ? 'ok' : 'bad');
                state.textContent = st.ok ? '✓ Tayari' : '• ' + st.why;
            }
            card.classList.toggle('is-bad', q.touched && !st.ok);
        }
        syncChrome();
    }

    /* ------------------------------------------------------------- matukio */
    function onClick(e) {
        var el = e.target.closest ? e.target.closest('[data-act]') : null;
        if (!el) return;
        var act = el.getAttribute('data-act');
        var id = el.getAttribute('data-id');
        var q = id ? findQ(id) : null;

        if (act === 'close') { close(); return; }
        if (act === 'back') {
            // Review -> builder; vingine vyote (builder / done) -> funga na
            // urudi kwenye bidhaa. Kitufe hiki KILA WAKATI kinafanya kazi.
            if (S.view === 'review') { S.view = 'builder'; render(); return; }
            close();
            return;
        }
        if (act === 'add') {
            if (S.questions.length >= MAX_Q) { toast('Kikomo ni maswali ' + MAX_Q); return; }
            S.questions.push(newQuestion());
            S.view = 'builder';
            render();
            setTimeout(function () {
                var cards = LAYER.querySelectorAll('.inq-card');
                var last = cards[cards.length - 1];
                if (last) { var inp = last.querySelector('.inq-qtext'); if (inp) inp.focus(); }
                var b = $('inqBody'); if (b) b.scrollTop = b.scrollHeight;
            }, 60);
            return;
        }
        if (act === 'quick') {
            if (S.questions.length >= MAX_Q) { toast('Kikomo ni maswali ' + MAX_Q); return; }
            var opts = (el.getAttribute('data-opts') || '').split('|').filter(Boolean);
            S.questions.push(newQuestion(el.getAttribute('data-q') || '', el.getAttribute('data-type') || 'single', opts));
            S.view = 'builder';
            render();
            toast('Swali limeongezwa');
            return;
        }
        if (act === 'newq') {
            S.questions = [newQuestion()];
            S.view = 'builder';
            S.lastDoc = null;
            render();
            return;
        }
        if (act === 'cta') {
            if (S.view === 'builder') {
                if (!(S.questions.length && validCount() === S.questions.length)) {
                    toast('Kamilisha maswali yote kwanza');
                    return;
                }
                S.view = 'review';
                render();
                var b2 = $('inqBody'); if (b2) b2.scrollTop = 0;
                return;
            }
            if (S.view === 'review') submit();
            return;
        }
        if (!q) return;

        if (act === 'type') {
            q.type = el.getAttribute('data-t');
            if (TYPES[q.type].opts && q.options.length < 2) {
                q.options = [{ id: uid('o'), text: '' }, { id: uid('o'), text: '' }];
            }
            render();
            return;
        }
        if (act === 'addopt') {
            if (q.options.length >= MAX_OPT) { toast('Kikomo ni machaguo ' + MAX_OPT); return; }
            q.options.push({ id: uid('o'), text: '' });
            render();
            return;
        }
        if (act === 'delopt') {
            if (q.options.length <= 1) { toast('Acha chaguo moja angalau'); return; }
            var oid = el.getAttribute('data-oid');
            q.options = q.options.filter(function (o) { return o.id !== oid; });
            render();
            return;
        }
        if (act === 'up') { move(id, -1); return; }
        if (act === 'down') { move(id, 1); return; }
        if (act === 'del') { removeQuestion(id); return; }
        if (act === 'edit') {
            S.view = 'builder';
            render();
            setTimeout(function () {
                var card = LAYER.querySelector('[data-qid="' + id + '"]');
                if (card) {
                    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    var inp = card.querySelector('.inq-qtext');
                    if (inp) { inp.focus(); inp.select(); }
                }
            }, 220);
            return;
        }
    }

    function onInput(e) {
        var el = e.target;
        if (!el || !el.getAttribute) return;
        var act = el.getAttribute('data-act');
        if (!act) return;
        var q = findQ(el.getAttribute('data-id'));
        if (!q) return;
        if (act === 'text') { q.text = clip(el.value, MAX_Q_LEN); q.touched = true; lightSync(q, el); }
        if (act === 'opt') {
            var oid = el.getAttribute('data-oid');
            q.options.forEach(function (o) { if (o.id === oid) o.text = clip(el.value, MAX_OPT_LEN); });
            lightSync(q, el);
        }
        if (act === 'num') { q.numVal = el.value; }
    }

    function onChange(e) {
        var el = e.target;
        if (!el || !el.getAttribute) return;
        if (el.getAttribute('data-act') === 'unit') {
            var q = findQ(el.getAttribute('data-id'));
            if (q) q.unit = el.value;
        }
    }

    function move(id, dir) {
        var i = idxOf(id), j = i + dir;
        if (i < 0 || j < 0 || j >= S.questions.length) return;
        var tmp = S.questions[i]; S.questions[i] = S.questions[j]; S.questions[j] = tmp;
        render();
    }

    function removeQuestion(id) {
        var i = idxOf(id);
        if (i < 0) return;
        var removed = S.questions[i];
        S.questions.splice(i, 1);
        render();
        toast('Swali limeondolewa', 'Rudisha', function () {
            S.questions.splice(i, 0, removed);
            render();
        });
    }

    /* --------------------------------------------------------- payload/tuma */
    function payloadQuestions() {
        return S.questions.map(function (q, i) {
            var o = {
                n: i + 1,
                text: String(q.text || '').trim(),
                type: q.type,
                answerModel: TYPES[q.type].answerModel,
                required: true,
                answer: null
            };
            if (TYPES[q.type].opts) o.options = cleanOpts(q);
            if (q.type === 'measure') o.unit = q.unit;
            if (q.numVal && (q.type === 'measure' || q.type === 'number')) o.exampleValue = Number(q.numVal);
            return o;
        });
    }

    function chatText() {
        var p = S.product || {};
        var lines = ['Habari, nina maswali ' + S.questions.length + ' kuhusu ' + clip(p.title || 'bidhaa', 40) + ':'];
        S.questions.forEach(function (q, i) {
            var t = String(q.text || '').trim() || '(swali tupu)';
            var extra = '';
            if (TYPES[q.type].opts) extra = ' [' + cleanOpts(q).join(' / ') + ']';
            else if (q.type === 'measure') extra = ' [' + q.unit + ']';
            else if (q.type === 'yesno') extra = ' [Ndiyo / Hapana]';
            lines.push((i + 1) + '. ' + t + extra);
        });
        return lines.join('\n');
    }

    async function submit() {
        if (S.busy) return;
        var p = S.product;
        if (!p || !p.id) { toast('Bidhaa haipo'); return; }
        var bad = S.questions.filter(function (q) { return !qState(q).ok; });
        if (bad.length) {
            toast('Kamilisha maswali ' + bad.map(function (q) { return idxOf(q.id) + 1; }).join(', '));
            return;
        }
        if (!skh.currentUser) {
            if (typeof window.openAuthModal === 'function') window.openAuthModal();
            toast('Ingia kwanza ili kutuma swali kwa muuzaji.');
            return;
        }

        S.busy = true; syncChrome();

        var sellerId = p.userId || p.ownerUid || p.sellerId || null;
        var qs = payloadQuestions();
        var doc = {
            productId: p.id,
            productCollection: p.collectionName || 'products',
            productTitle: clip(p.title || '', 120),
            productImage: p.image || (p.images && p.images[0]) || p.photo || '',
            productPrice: p.price == null ? null : Number(p.price) || 0,
            productUnit: p.unit || p.unitLabel || '',
            sellerId: sellerId,
            sellerName: clip(p.ownerName || p.sellerName || '', 80),
            buyerId: myUid(),
            buyerName: clip(myName(), 80),
            buyerPhoto: (skh.currentUser && skh.currentUser.photoURL) || '',
            status: 'sent',
            version: 1,
            questions: qs,
            counts: { questions: qs.length, answered: 0 },
            createdAt: nowIso(),
            updatedAt: nowIso()
        };

        var docId = null, chatOk = false;

        // 1) Hifadhi swali (collection mpya; maoni hayaguswi).
        try {
            var ref = await skh.addDoc(skh.collection(skh.db, 'productInquiries'), doc);
            docId = (ref && ref.id) || null;
        } catch (err) {
            console.warn('[inquiry:save]', err && err.message);
        }

        // 2) Tuma ujumbe wa Chat (mkataba wa Chat Arena) — hiari, haizuii.
        try {
            if (typeof window.skhChatSendMessage === 'function' && sellerId) {
                var res = await window.skhChatSendMessage(chatText(), { partnerUid: sellerId });
                chatOk = !!(res && (res.ok !== false));
            }
        } catch (e) { console.warn('[inquiry:chat]', e && e.message); }

        // 3) Arifa kwa muuzaji (injini iliyopo — hakuna mfumo mpya).
        try {
            if (typeof window.skhEngageSendNotif === 'function' && sellerId) {
                window.skhEngageSendNotif(
                    sellerId,
                    'Swali jipya kuhusu bidhaa',
                    myName() + ' ameuliza maswali ' + qs.length + ' kuhusu ' + clip(p.title || 'bidhaa', 50),
                    'inquiry',
                    { productId: p.id, inquiryId: docId || '', link: 'chat' }
                );
            }
        } catch (e) {}

        S.busy = false;

        if (!docId && !chatOk) {
            toast('Imeshindwa kutuma. Angalia mtandao kisha ujaribu tena.');
            syncChrome();
            return;
        }

        S.lastDoc = { questions: qs, chatSent: chatOk, id: docId };
        S.view = 'done';
        render();
        refreshInquireBadge();
        if (typeof window.skhToast === 'function') {
            window.skhToast('Swali lako limetumwa kwa muuzaji ✓', 'success', 2600);
        }
    }

    /* -------------------------------------------------- beji ya maswali */
    async function refreshInquireBadge() {
        var el = $('pmInquireCount');
        if (!el) return;
        var p = skh.currentOpenProduct;
        var me = myUid();
        if (!p || !p.id || !me) { el.textContent = ''; return; }
        try {
            var q = skh.query(
                skh.collection(skh.db, 'productInquiries'),
                skh.where('buyerId', '==', me),
                skh.where('productId', '==', p.id),
                skh.limit(20)
            );
            var snap = await skh.getDocs(q);
            var open = 0;
            snap.forEach(function (d) {
                var v = d.data() || {};
                if (v.status === 'sent' || v.status === 'answered') open++;
            });
            el.textContent = open > 0 ? String(open) : '';
        } catch (e) {
            el.textContent = '';
        }
    }
    window.skhRefreshInquireBadge = refreshInquireBadge;

    // Sasisha beji kila bidhaa inapofunguliwa (bila kubadilisha showcase).
    var tries = 0;
    var hook = setInterval(function () {
        tries++;
        if (typeof window.skhRenderShowcase === 'function') {
            clearInterval(hook);
            var orig = window.skhRenderShowcase;
            window.skhRenderShowcase = function (found, col) {
                var r = orig.apply(this, arguments);
                try {
                    setTimeout(function () { refreshInquireBadge(); }, 600);
                    setTimeout(function () { refreshInquireBadge(); }, 2200);
                } catch (e) {}
                return r;
            };
        }
        if (tries > 60) clearInterval(hook);
    }, 500);

    window.skhInquiryPayload = function () {
        return { kind: 'product_inquiry', version: 1, questions: payloadQuestions() };
    };
})();
