/* ==== js/05-dialogs.js ==== */
// ============================================================
// SOKOHAI RESPONSE SYSTEM v2 (2026-09)
// Inaondoa KABISA dialogs za kivinjari ("sokohaitz.netlify.app says").
//   window.skhConfirm(msg, opts)  -> Promise<boolean>
//   window.skhPrompt(msg, def)    -> Promise<string|null>
//   window.skhToast(msg, type)    -> toast isiyozuia
//   window.skhBusy(true/false,txt)-> overlay ya "inashughulikia..."
// Confirm/prompt za asili zimefungwa (zinarudisha dialog nzuri kwa
// njia ya async; code ya zamani inatumia `await skhConfirm`).
// ============================================================
(function () { 'use strict';
    if (window.__skhDialogsV2) return;
    window.__skhDialogsV2 = true;

    var css = [ '.skd-ov{position:fixed;inset:0;z-index:2147483200;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(2,13,28,.55);backdrop-filter:blur(4px);animation:skdFade .16s ease-out}', '.skd-box{width:100%;max-width:400px;background:#fff;border-radius:20px;padding:22px 20px 18px;box-shadow:0 24px 60px rgba(2,13,28,.35);animation:skdPop .2s cubic-bezier(.22,1,.36,1);font-family:Inter,"Segoe UI",system-ui,sans-serif}', '.skd-ic{width:54px;height:54px;border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:26px}', '.skd-ttl{font-size:16px;font-weight:900;color:#0f172a;text-align:center;margin:0 0 6px}', '.skd-msg{font-size:13.5px;font-weight:600;color:#475569;text-align:center;line-height:1.6;white-space:pre-wrap;word-break:break-word;max-height:44vh;overflow:auto;margin:0 0 16px}', '.skd-inp{width:100%;box-sizing:border-box;padding:13px 14px;border:1.5px solid #cbd5e1;border-radius:12px;font-size:14px;outline:none;margin-bottom:14px;background:#f8fafc;color:#0f172a}', '.skd-inp:focus{border-color:#1268A8;background:#fff}', '.skd-row{display:flex;gap:10px}', '.skd-btn{flex:1;padding:14px;border:none;border-radius:13px;font-size:13.5px;font-weight:900;cursor:pointer;letter-spacing:.3px;transition:.15s}', '.skd-btn:active{transform:scale(.98)}', '.skd-no{background:#eef2f7;color:#475569}', '.skd-yes{background:#1268A8;color:#fff}', '.skd-yes.danger{background:#e11d48}', '.skd-busy{position:fixed;inset:0;z-index:2147483300;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;background:rgba(2,13,28,.5);backdrop-filter:blur(3px);color:#fff;font-weight:800;font-size:13px;font-family:Inter,system-ui,sans-serif}', '.skd-spin{width:42px;height:42px;border-radius:50%;border:4px solid rgba(255,255,255,.25);border-top-color:#18A982;animation:skdSpin .8s linear infinite}', '@keyframes skdSpin{to{transform:rotate(360deg)}}', '@keyframes skdFade{from{opacity:0}to{opacity:1}}', '@keyframes skdPop{from{opacity:0;transform:scale(.93) translateY(12px)}to{opacity:1;transform:none}}'
    ].join('\n');
    var st = document.createElement('style'); st.id = 'skhDialogsCss'; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);

    function kindOf(msg) {
        var m = String(msg || '');
        if (/futa|delete|ghairi|kataa|hatari|dharura|hakirudishiki|zuia|block/i.test(m)) return { ic: (window.skhNavIcon?window.skhNavIcon('alert',14):''), bg: '#fef2f2', danger: true, ttl: 'Thibitisha' };
        if (/lipa|malipo|pesa|escrow|tsh/i.test(m)) return { ic: (window.skhNavIcon?window.skhNavIcon('wallet',14):''), bg: '#ecfdf5', danger: false, ttl: 'Thibitisha Malipo' };
        return { ic: (window.skhNavIcon?window.skhNavIcon('alert',14):''), bg: '#eff6ff', danger: false, ttl: 'Thibitisha' };
    }

    function build(msg, opts) {
        opts = opts || {};
        var k = kindOf(msg);
        var ov = document.createElement('div'); ov.className = 'skd-ov';
        var box = document.createElement('div'); box.className = 'skd-box';
        var ic = document.createElement('div'); ic.className = 'skd-ic';
        ic.style.background = opts.iconBg || k.bg;
        // [FIX 2026-09-15] `k.ic` sasa ni SVG (baada ya kuondoa emoji). `textContent`
        // ilikuwa inaichapisha kama MAANDISHI — ndiyo sababu code ya <svg ...> ilionekana
        // juu ya dialog ya "Confirm". Tumia innerHTML kwa SVG, textContent kwa herufi.
        var _icon = opts.icon || k.ic || '';
        if (/^\s*</.test(String(_icon))) ic.innerHTML = _icon; else ic.textContent = _icon;
        var ttl = document.createElement('h3'); ttl.className = 'skd-ttl'; ttl.textContent = opts.title || k.ttl;
        var m = document.createElement('div'); m.className = 'skd-msg';
        // [LIFECYCLE 2026-09-14] `html:true` huruhusu maudhui tajiri (mf. orodha
        // ya historia/audit trail). Chaguo-msingi bado ni textContent — salama.
        if (opts.html) m.innerHTML = String(msg == null ? '' : msg);
        else m.textContent = String(msg == null ? '' : msg);
        box.appendChild(ic); box.appendChild(ttl); box.appendChild(m);
        ov.appendChild(box);
        return { ov: ov, box: box, danger: k.danger };
    }

    window.skhConfirm = function (msg, opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            var b = build(msg, opts);
            var row = document.createElement('div'); row.className = 'skd-row';
            var no = document.createElement('button'); no.className = 'skd-btn skd-no'; no.type = 'button';
            no.textContent = opts.cancelText || 'Hapana';
            var yes = document.createElement('button'); yes.className = 'skd-btn skd-yes' + (b.danger ? ' danger' : ''); yes.type = 'button';
            yes.textContent = opts.okText || 'Ndiyo, Endelea';
            // [LIFECYCLE 2026-09-14] `cancelText: null` = dialog ya taarifa pekee
            // (mf. "Haiwezi kufutwa") — kitufe kimoja tu cha kufunga.
            if (opts.cancelText !== null) row.appendChild(no);
            row.appendChild(yes); b.box.appendChild(row);
            function done(v) { if (b.ov.parentNode) b.ov.parentNode.removeChild(b.ov); document.removeEventListener('keydown', key, true); resolve(v); }
            function key(e) { if (e.key === 'Escape') { e.preventDefault(); done(false); } if (e.key === 'Enter') { e.preventDefault(); done(true); } }
            no.onclick = function () { done(false); };
            yes.onclick = function () { done(true); };
            b.ov.addEventListener('click', function (e) { if (e.target === b.ov) done(false); });
            document.addEventListener('keydown', key, true);
            document.body.appendChild(b.ov);
            yes.focus();
        });
    };
    if (typeof globalThis !== 'undefined') globalThis.skhConfirm = window.skhConfirm;

    window.skhPrompt = function (msg, def, opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            var b = build(msg, { icon: opts.icon || '️', iconBg: '#eff6ff', title: opts.title || 'Ingiza Taarifa' });
            var inp = document.createElement('input');
            inp.className = 'skd-inp'; inp.type = opts.type || 'text';
            inp.value = (def == null ? '' : String(def));
            inp.placeholder = opts.placeholder || '';
            b.box.appendChild(inp);
            var row = document.createElement('div'); row.className = 'skd-row';
            var no = document.createElement('button'); no.className = 'skd-btn skd-no'; no.type = 'button'; no.textContent = 'Ghairi';
            var yes = document.createElement('button'); yes.className = 'skd-btn skd-yes'; yes.type = 'button'; yes.textContent = 'Sawa';
            row.appendChild(no); row.appendChild(yes); b.box.appendChild(row);
            function done(v) { if (b.ov.parentNode) b.ov.parentNode.removeChild(b.ov); document.removeEventListener('keydown', key, true); resolve(v); }
            function key(e) {
                if (e.key === 'Escape') { e.preventDefault(); done(null); }
                if (e.key === 'Enter') { e.preventDefault(); done(inp.value); }
            }
            no.onclick = function () { done(null); };
            yes.onclick = function () { done(inp.value); };
            b.ov.addEventListener('click', function (e) { if (e.target === b.ov) done(null); });
            document.addEventListener('keydown', key, true);
            document.body.appendChild(b.ov);
            setTimeout(function () { inp.focus(); inp.select(); }, 30);
        });
    };

    // Toast fupi (isiyozuia) — hutumika kwa majibu ya mafanikio/hitilafu.
    window.skhToast = function (msg, type, ms) {
        if (typeof window.sokohaiToast === 'function') return window.sokohaiToast(msg, type, ms);
        /* [FIX 2026-09-15] `07-toasts.js` hupakiwa MWISHO (mstari 3872) wakati
           faili hii iko mstari 39. Kwa hiyo toast za mapema zilikuwa
           zinaishia console pekee — mtumiaji hakuona chochote.
           Sasa tunachora toast yetu wenyewe ikiwa ya nje bado haijafika. */
        try {
            var wrap = document.querySelector('.skh-toast-wrap');
            if (!wrap) {
                wrap = document.createElement('div');
                wrap.className = 'skh-toast-wrap';
                document.body.appendChild(wrap);
            }
            var colors = { success: '#10b981', error: '#ef4444', info: '#3b82f6', warn: '#f59e0b' };
            var icons  = { success: 'check', error: 'x', info: 'bell', warn: 'alert' };
            var t = document.createElement('div');
            t.className = 'skh-toast';
            t.style.borderLeft = '4px solid ' + (colors[type] || '#3b82f6');
            var ic = document.createElement('span');
            ic.className = 'skh-toast-ic';
            if (window.skhNavIcon) ic.innerHTML = window.skhNavIcon(icons[type] || 'bell', 16);
            var tx = document.createElement('span');
            tx.textContent = String(msg == null ? '' : msg);   // maandishi pekee
            t.appendChild(ic); t.appendChild(tx);
            wrap.appendChild(t);
            setTimeout(function () {
                t.classList.add('skh-out');
                setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 260);
            }, ms || 3200);
        } catch (e) { console.log('[toast]', type || '', msg); }
    };

    // Overlay ya "inashughulikia..."
    var busyEl = null;
    window.skhBusy = function (on, text) {
        if (on) {
            if (busyEl) { busyEl.querySelector('span').textContent = text || 'Inashughulikia...'; return; }
            busyEl = document.createElement('div');
            busyEl.className = 'skd-busy';
            busyEl.innerHTML = '<div class="skd-spin"></div><span></span>';
            busyEl.querySelector('span').textContent = text || 'Inashughulikia...';
            document.body.appendChild(busyEl);
        } else if (busyEl) {
            if (busyEl.parentNode) busyEl.parentNode.removeChild(busyEl);
            busyEl = null;
        }
    };

    // ---------- Zima dialogs za kivinjari kabisa ----------
    // Kama code yoyote ya zamani bado inaita confirm()/prompt(), badala ya
    // kuonyesha "site says", tunarudisha thamani salama + toast ya taarifa.
    window.confirm = function (msg) {
        window.skhConfirm(msg).then(function () {});
        console.warn('[skh] confirm() ya zamani imekamatwa:', msg);
        return true;
    };
    window.prompt = function (msg, def) {
        console.warn('[skh] prompt() ya zamani imekamatwa:', msg);
        return def == null ? '' : String(def);
    };
})();
