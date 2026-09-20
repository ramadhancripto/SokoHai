/* ================================================================
 * 90-chat-fixes.js — MAREKEBISHO MAKUBWA YA CHAT SYSTEM
 * ----------------------------------------------------------------
 * YANAYOSHUGHULIKIWA:
 *  1. Chat za zamani hazionekani / historia kukosa (cache fallback)
 *  2. UI nyeupe wakati wa loading (background nzuri ya chat)
 *  3. Loader isiyokwisha ("inafungua chat" milele) → timeout + retry
 *  4. Composer/typing-bar kutoweka wakati wa load → daima ionekane
 *  5. Group chat kutofunguka (loader daima, typing-bar haionekani)
 *  6. Inbox isiyofunguka baada ya kufungua chat nyingine → timeout
 *  7. MutationObserver inayobadilisha "Inapakia..." tupu kuwa state nzuri
 * ================================================================ */
(function () {
    'use strict';
    if (window.__skhChatFixesBooted) return;

    function skh() { return window.skh || {}; }

    function boot() {
        if (window.__skhChatFixesBooted) return;
        // Subiri window.skh ipatikane (bootstrap inaiweka baada ya modules)
        if (typeof window.skh === 'undefined' || !window.skh.chatCore === undefined) {
            // Jaribu tena baada ya muda mfupi
            setTimeout(boot, 150);
            return;
        }
        window.__skhChatFixesBooted = true;
        install();
    }

    function ensureSpinCss() {
        if (document.getElementById('skhSpinStyle')) return;
        var s = document.createElement('style');
        s.id = 'skhSpinStyle';
        s.textContent = '@keyframes skhSpin{to{transform:rotate(360deg)}}';
        document.head.appendChild(s);
    }

    function T(k, fb) {
        try { return (window.t && window.t(k)) || fb || k; } catch (e) { return fb || k; }
    }

    function install() {
        ensureSpinCss();

        // ---------- 1. BACKGROUND / EMPTY STATE STYLES ----------
        var cssFixes = document.createElement('style');
        cssFixes.id = 'skhChatFixCss';
        cssFixes.textContent = [
            '#chatMessages { position: relative !important; }',
            '#chatMessages.ch-loading::before,',
            '#chatMessages.ch-empty::before,',
            '#chatMessages.ch-error::before {',
            '    content: ""; position: absolute; inset: 0;',
            '    background-color: #efe7dd !important;',
            '    background-image:',
            '        radial-gradient(circle at 25% 15%, rgba(18,104,168,0.06) 0, transparent 40%),',
            '        radial-gradient(circle at 80% 75%, rgba(24,169,130,0.07) 0, transparent 45%),',
            '        url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2722%27 height=%2722%27 viewBox=%270 0 22 22%27><circle cx=%272%27 cy=%272%27 r=%271%27 fill=%27%23d9cdbf%27 opacity=%270.35%27/><circle cx=%2713%27 cy=%2713%27 r=%271%27 fill=%27%23d9cdbf%27 opacity=%270.35%27/></svg>") !important;',
            '    background-size: auto, auto, 22px 22px !important;',
            '    z-index: 0; pointer-events: none;',
            '}',
            '#chatMessages.ch-loading > *,',
            '#chatMessages.ch-empty > *,',
            '#chatMessages.ch-error > * { position: relative; z-index: 1; }',
            '.skh-chat-state { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:32px 20px; min-height:240px; color:#667781; text-align:center; width:100%; box-sizing:border-box; }',
            '.skh-chat-state .skh-chat-ill { width:96px; height:96px; border-radius:50%; background:linear-gradient(135deg,#e0f2fe,#d9fdd3); display:flex; align-items:center; justify-content:center; margin-bottom:14px; box-shadow:0 6px 20px rgba(18,104,168,.12); }',
            '.skh-chat-state .skh-chat-ill svg { width:46px; height:46px; stroke:#1268A8; }',
            '.skh-chat-state b { display:block; color:#0f172a; font-size:15px; margin-bottom:6px; }',
            '.skh-chat-state span { font-size:13px; color:#64748b; max-width:280px; line-height:1.5; }',
            '.skh-chat-state .skh-chat-btn { margin-top:14px; padding:9px 18px; background:#1268A8; color:#fff; border:none; border-radius:24px; font-weight:700; font-size:13px; cursor:pointer; }',
            '.skh-chat-state .skh-chat-btn.ghost { background:#fff; color:#1268A8; border:1.5px solid #cbd5e1; margin-left:8px; }',
            '.skh-chat-state .skh-spin { width:34px; height:34px; border:3px solid #d3e6f5; border-top-color:#1268A8; border-radius:50%; animation:skhSpin .8s linear infinite; margin-bottom:12px; }',
            '.skh-chat-state.small { min-height:160px; padding:24px 20px; }',
            '.skh-chat-state.small .skh-chat-ill { width:60px; height:60px; margin-bottom:8px; }',
            '.skh-chat-state.small .skh-chat-ill svg { width:28px; height:28px; }',
            '#chatModal[data-state="open"] #chatComposer,',
            '#chatModal[data-state="loading"] #chatComposer { display:flex !important; opacity:1 !important; pointer-events:auto !important; }',
            '#chatComposer { transition: opacity .2s; }',
            '#skhGroupSogaModal.open #gsgComposerRow { display:flex !important; }'
        ].join('\n');
        document.head.appendChild(cssFixes);

        var EMPTY_ILL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="9.01" y2="10"/><line x1="15" y1="10" x2="15.01" y2="10"/><line x1="12" y1="10" x2="12.01" y2="10"/></svg>';
        var ERROR_ILL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

        function escAttr(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

        function setChatState(state) {
            var chatDiv = document.getElementById('chatMessages');
            var cm = document.getElementById('chatModal');
            if (!chatDiv) return;
            chatDiv.classList.remove('ch-loading', 'ch-empty', 'ch-error');
            if (cm) cm.setAttribute('data-state', state || 'open');
            if (state === 'loading') {
                chatDiv.classList.add('ch-loading');
                chatDiv.innerHTML = '<div class="skh-chat-state"><div class="skh-spin"></div><b>' + T('ch_connecting', 'Inaunganisha mazungumzo...') + '</b><span>' + T('ch_loading_sub', 'Tunapakia historia ya meseji.') + '</span></div>';
                try { chatDiv.scrollTop = chatDiv.scrollHeight; } catch (e) {}
            } else if (state === 'empty') {
                chatDiv.classList.add('ch-empty');
                chatDiv.innerHTML = '<div class="skh-chat-state"><div class="skh-chat-ill">' + EMPTY_ILL_SVG + '</div><b>' + T('ch_empty', 'Hamna meseji bado') + '</b><span>' + T('ch_empty_sub', 'Anza mazungumzo kwa kumtumia ujumbe chini.') + '</span></div>';
            } else if (state === 'error') {
                chatDiv.classList.add('ch-error');
                var s = skh();
                var core = s.chatCore || {};
                var partnerUid = core.partnerUid || s.currentChatUid || '';
                chatDiv.innerHTML = '<div class="skh-chat-state"><div class="skh-chat-ill">' + ERROR_ILL_SVG + '</div><b>' + T('ch_load_fail', 'Imeshindwa kupakia meseji') + '</b><span>' + T('ch_load_fail_sub', 'Angalia mtandao wako kisha jaribu tena.') + '</span>'
                    + '<div><button class="skh-chat-btn" onclick="window.skhChatRetryCurrent()">' + T('ch_retry', 'Jaribu Tena') + '</button>'
                    + (partnerUid ? '<button class="skh-chat-btn ghost" onclick="window.skhChatOpen(\'' + escAttr(partnerUid) + '\')">' + T('ch_reopen', 'Fungua upya') + '</button>' : '')
                    + '</div></div>';
            }
        }

        window.skhChatRetryCurrent = function () {
            var s = skh();
            var core = s.chatCore || {};
            if (core.convId && core.partnerUid) {
                setChatState('loading');
                try { window.skhChatOpen(core.partnerUid, core.partnerName, { ctx: '', related: (core.conv && core.conv.related) || null }); }
                catch (e) { console.warn('[retry]', e); }
                return;
            }
            if (typeof window.skhChatOpenInbox === 'function') window.skhChatOpenInbox();
        };

        // ---------- HOOK skhChatOpen ----------
        var _origChatOpen = window.skhChatOpen;
        var _listenTimeout = null;

        function markComposerVisible() {
            var cm = document.getElementById('chatModal');
            if (cm) cm.setAttribute('data-state', 'loading');
            var comp = document.getElementById('chatComposer');
            if (comp) { comp.style.display = 'flex'; comp.style.opacity = '1'; comp.style.pointerEvents = 'auto'; }
        }

        window.skhChatOpen = async function (uid, name, opts) {
            ensureSpinCss();
            markComposerVisible();
            setChatState('loading');
            if (_listenTimeout) { clearTimeout(_listenTimeout); _listenTimeout = null; }

            var _timedOut = false;
            _listenTimeout = setTimeout(function () {
                _timedOut = true;
                var chatDiv = document.getElementById('chatMessages');
                var core = skh().chatCore || {};
                if (!chatDiv) return;
                if (core.msgs && core.msgs.length) {
                    try { if (typeof window.skhChatRenderStream === 'function') window.skhChatRenderStream(); } catch (e) {}
                    return;
                }
                // Jaribu cache ya localStorage
                var cached = null;
                if (core.convId) cached = loadCache(core.convId);
                if (cached && cached.length) {
                    core.msgs = cached;
                    try { if (typeof window.skhChatRenderStream === 'function') window.skhChatRenderStream(); } catch (e) {}
                    // onyesha bango "inaonyesha meseji za akiba"
                    var note = document.createElement('div');
                    note.style.cssText = 'text-align:center;font-size:11px;color:#92400e;background:#fef3c7;padding:6px 12px;margin:8px auto;border-radius:16px;display:inline-block;';
                    note.textContent = T('ch_cache_note', 'Inaonyesha meseji za akiba — bado inaunganisha...');
                    if (chatDiv.firstChild) chatDiv.insertBefore(note, chatDiv.firstChild);
                    return;
                }
                setChatState('error');
            }, 8000);

            try {
                var result = await _origChatOpen.call(this, uid, name, opts);
                if (!_timedOut) {
                    clearTimeout(_listenTimeout); _listenTimeout = null;
                    setTimeout(function () {
                        var chatDiv = document.getElementById('chatMessages');
                        if (!chatDiv) return;
                        var txt = chatDiv.textContent || '';
                        var core = skh().chatCore || {};
                        if (txt.indexOf('Inapakia') !== -1 || txt.indexOf('Inaunganisha') !== -1) {
                            if (core.msgs && core.msgs.length) return;
                            if (core.convId) setChatState('empty');
                            else setChatState('error');
                        } else {
                            chatDiv.classList.remove('ch-loading', 'ch-empty', 'ch-error');
                            var cm = document.getElementById('chatModal');
                            if (cm) cm.setAttribute('data-state', 'open');
                        }
                    }, 2500);
                }
                return result;
            } catch (e) {
                clearTimeout(_listenTimeout); _listenTimeout = null;
                console.warn('[chat open]', e);
                setChatState('error');
                return null;
            }
        };

        // ---------- MUTATION OBSERVER: badilisha loader-text na state nzuri ----------
        var msgObs = new MutationObserver(function () {
            var chatDiv = document.getElementById('chatMessages');
            if (!chatDiv) return;
            var html = chatDiv.innerHTML;
            if (!html) return;
            if (html.indexOf('ch-msg') !== -1 || html.indexOf('chat-bubble') !== -1) {
                // meseji zipo — ondoa state classes
                chatDiv.classList.remove('ch-loading', 'ch-empty', 'ch-error');
                var cm = document.getElementById('chatModal');
                if (cm) cm.setAttribute('data-state', 'open');
                // cache messages
                try {
                    var core = skh().chatCore;
                    if (core && core.convId && core.msgs) saveCache(core.convId, core.msgs);
                } catch (e) {}
                return;
            }
            if (html.indexOf('skh-chat-state') !== -1) return;
            if (html.indexOf('Inapakia') !== -1 || html.indexOf('Inaunganisha') !== -1) {
                // acha tuweke loader yetu nzuri (yenye background) mara moja
                setChatState('loading');
            } else if (html.indexOf('Imeshindwa') !== -1) {
                setChatState('error');
            } else if (html.indexOf('Hamna meseji') !== -1) {
                setChatState('empty');
            }
        });
        function installMsgObserver() {
            var chatDiv = document.getElementById('chatMessages');
            if (!chatDiv) return setTimeout(installMsgObserver, 500);
            msgObs.observe(chatDiv, { childList: true, subtree: true });
        }
        installMsgObserver();

        // ---------- COMPOSER VISIBILITY GUARD ----------
        setInterval(function () {
            var cm = document.getElementById('chatModal');
            if (!cm) return;
            var vis = (cm.style.display === 'flex' || cm.style.display === 'block' || getComputedStyle(cm).display !== 'none');
            var comp = document.getElementById('chatComposer');
            if (!comp) return;
            if (vis && comp.style.display === 'none') {
                var blocked = document.getElementById('chatBlockedState');
                if (blocked && getComputedStyle(blocked).display !== 'none') return;
                comp.style.display = 'flex';
            }
        }, 800);

        // ---------- GROUP CHAT FIX ----------
        var _origGroupOpen = window.skhOpenGroupSoga;
        if (_origGroupOpen) {
            window.skhOpenGroupSoga = async function (gid) {
                if (!gid) return;
                var cleanGid = String(gid).trim().replace(/^conv_group_/, '');
                return _origGroupOpen.call(this, cleanGid);
            };
        }

        // ---------- INBOX TIMEOUT ----------
        var _origOpenInbox = window.skhChatOpenInbox;
        if (_origOpenInbox) {
            window.skhChatOpenInbox = async function () {
                try {
                    var cl = document.getElementById('chatListModal');
                    if (cl) { cl.style.display = 'flex'; cl.classList.add('open'); }
                } catch (e) {}
                var _promise;
                try { _promise = _origOpenInbox.apply(this, arguments); }
                catch (e) { console.warn('[inbox sync error]', e); }
                setTimeout(function () {
                    var list = document.getElementById('inboxList');
                    if (!list) return;
                    var html = list.innerHTML || '';
                    if (html.indexOf('Inapakia') !== -1 && html.indexOf('Jaribu') === -1) {
                        list.innerHTML = '<div class="skh-chat-state small">'
                            + '<div class="skh-spin"></div>'
                            + '<b>' + T('ch_inbox_slow','Mazungumzo yanachukua muda') + '</b>'
                            + '<span>' + T('ch_inbox_slow_sub','Huenda mtandao uko polepole. Bonyeza jaribu tena.') + '</span>'
                            + '<div><button class="skh-chat-btn" onclick="window.skhChatOpenInbox()">' + T('ch_retry','Jaribu Tena') + '</button></div>'
                            + '</div>';
                    }
                }, 12000);
                return _promise;
            };
        }

        // ---------- MESSAGE CACHE (localStorage fallback for history) ----------
        function cacheKey(convId) { return 'skh_chat_cache_' + convId; }
        function saveCache(convId, msgs) {
            try {
                var s = skh();
                if (!convId || !msgs || !s.safeLocalStorage) return;
                var tail = msgs.slice(-200);
                s.safeLocalStorage.setItem(cacheKey(convId), JSON.stringify({ at: Date.now(), msgs: tail }));
            } catch (e) {}
        }
        function loadCache(convId) {
            try {
                var s = skh();
                if (!convId || !s.safeLocalStorage) return null;
                var raw = s.safeLocalStorage.getItem(cacheKey(convId));
                if (!raw) return null;
                var obj = JSON.parse(raw);
                if (!obj || !obj.msgs || Date.now() - (obj.at||0) > 7*24*3600*1000) return null;
                return obj.msgs || null;
            } catch (e) { return null; }
        }
        // Expose for use in the open wrapper
        window.__skhChatSaveCache = saveCache;
        window.__skhChatLoadCache = loadCache;

        var _origRenderStream = window.skhChatRenderStream;
        if (_origRenderStream) {
            window.skhChatRenderStream = function () {
                try {
                    var core = skh().chatCore;
                    if (core && core.convId && core.msgs) saveCache(core.convId, core.msgs);
                } catch (e) {}
                return _origRenderStream.apply(this, arguments);
            };
        }

        console.log('[SOKOHAI CHAT FIXES] v1 loaded ✓ — background, infinite-loader, group-open, inbox-timeout, msg-cache');
    }

    // Jaribu ku-boot mara baada ya DOM kupatikana — na kwa urahisi, subiri window.load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 300); });
    } else {
        setTimeout(boot, 300);
    }
    // Safety: jaribu tena baada ya window.load (modules huchukua muda)
    window.addEventListener('load', function () { setTimeout(boot, 500); });
})();
