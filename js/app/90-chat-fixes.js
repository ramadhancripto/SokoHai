/* ================================================================
 * 90-chat-fixes.js — CHAT COMPATIBILITY SUPPORT
 * 2026-09-22: direct-chat lifecycle imehamishwa kikamilifu kwenye
 * 34-chat-core.js. Faili hii HAIFUNIKI tena skhChatOpen, inbox, composer,
 * listener au timeout. Inabaki na CSS ya state na cache best-effort pekee.
 * ================================================================ */
(function () {
    'use strict';
    if (window.__skhChatFixesBooted) return;
    window.__skhChatFixesBooted = true;

    function installCss() {
        if (document.getElementById('skhChatFixCss')) return;
        var s = document.createElement('style');
        s.id = 'skhChatFixCss';
        s.textContent = [
            '@keyframes skhSpin{to{transform:rotate(360deg)}}',
            '#chatMessages{position:relative!important;min-width:0;max-width:100%;overflow-x:hidden}',
            '#chatMessages.ch-loading::before,#chatMessages.ch-empty::before,#chatMessages.ch-error::before{content:"";position:absolute;inset:0;background-color:#efe7dd;background-image:radial-gradient(circle at 25% 15%,rgba(18,104,168,.06) 0,transparent 40%),radial-gradient(circle at 80% 75%,rgba(24,169,130,.07) 0,transparent 45%);z-index:0;pointer-events:none}',
            '#chatMessages.ch-loading>*,#chatMessages.ch-empty>*,#chatMessages.ch-error>*{position:relative;z-index:1}',
            '.skh-chat-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:32px 20px;min-height:220px;color:#667781;text-align:center;width:100%;max-width:100%;box-sizing:border-box;overflow-wrap:anywhere}',
            '.skh-chat-state b{color:#0f172a;font-size:15px}',
            '.skh-chat-state span{font-size:13px;color:#64748b;max-width:280px;line-height:1.5}',
            '.skh-chat-state .skh-chat-btn{margin-top:8px;padding:9px 18px;background:#1268A8;color:#fff;border:0;border-radius:24px;font-weight:700;font-size:13px;cursor:pointer}',
            '.skh-chat-state .skh-spin{width:34px;height:34px;border:3px solid #d3e6f5;border-top-color:#1268A8;border-radius:50%;animation:skhSpin .8s linear infinite}'
        ].join('\n');
        document.head.appendChild(s);
    }

    function storage() {
        var S = window.skh || {};
        return S.safeLocalStorage || S.localStorage || window.localStorage;
    }
    function cacheKey(convId) { return 'skh_chat_cache_' + convId; }
    function saveCache(convId, msgs) {
        try {
            if (!convId || !Array.isArray(msgs)) return;
            storage().setItem(cacheKey(convId), JSON.stringify({ at: Date.now(), msgs: msgs.slice(-200) }));
        } catch (e) {}
    }
    function loadCache(convId) {
        try {
            var raw = convId && storage().getItem(cacheKey(convId));
            if (!raw) return null;
            var obj = JSON.parse(raw);
            if (!obj || !Array.isArray(obj.msgs) || Date.now() - Number(obj.at || 0) > 7 * 24 * 3600 * 1000) return null;
            return obj.msgs;
        } catch (e) { return null; }
    }
    window.__skhChatSaveCache = saveCache;
    window.__skhChatLoadCache = loadCache;

    /* Retry ni delegate safi kwa core; hakuna timer/listener mpya. */
    window.skhChatRetryCurrent = function () {
        if (typeof window.skhChatRetryOpen === 'function') return window.skhChatRetryOpen();
    };

    installCss();
    console.log('[SOKOHAI 90] compatibility support loaded — 34 owns direct-chat lifecycle');
})();
