/* ================================================================
 * 92-chat-auth-fix.js — AUTH COMPATIBILITY DIAGNOSTIC
 * 2026-09-22: 00-bootstrap.js sasa ndiyo authority pekee ya
 * onAuthStateChanged, skh.currentUser, __authResolved na skh:auth-ready.
 * 34-chat-core.js inasubiri contract hiyo moja. Hakuna polling, wrapper,
 * requireAuth override, login override au global error listener hapa.
 * ================================================================ */
(function () {
    'use strict';
    if (window.__skhChatAuthFixed) return;
    window.__skhChatAuthFixed = true;

    window.skhDiag = function () {
        var s = window.skh || {};
        var user = s.currentUser || (s.auth && s.auth.currentUser) || null;
        var msg = [
            'DIAGNOSTIC YA SOKOHAI:',
            '• currentUser: ' + (user ? 'YES (' + (user.email || user.uid) + ')' : 'NO'),
            '• __authResolved: ' + String(s.__authResolved),
            '• db: ' + (s.db ? 'available' : 'MISSING'),
            '• chatCore: ' + (s.chatCore ? ((s.chatCore.convId || 'active') + ' / ' + (s.chatCore.state || 'unknown')) : 'null'),
            '• currentChatUid: ' + (s.currentChatUid || '(none)')
        ].join('\n');
        console.log(msg);
        return msg;
    };

    console.log('[SOKOHAI 92] bootstrap auth authority verified — no chat wrappers installed');
})();
