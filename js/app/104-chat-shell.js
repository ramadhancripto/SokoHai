/* ==== js/app/104-chat-shell.js ==== */
/* =====================================================================
   SokoHai — [CHAT SHELL 2026-11]
   Viongezeo vya UI ya mazungumzo: emoji/hisia, menyu ya biashara ndani ya
   upau wa kuandika, na kitufe cha kurekodi sauti kinachoonekana wazi.

   Hii ni SHELL pekee — haibadilishi mtiririko wa kutuma ujumbe
   (`sendMessage`), negotiation, wala oda. Kila kitufe kinaita function
   iliyopo tayari.
   ===================================================================== */
(function () {
    'use strict';

    /* ------------------------------------------------ 1. EMOJI & HISIA */
    // Emoji za kawaida za biashara + hisia (reaction) — zinapangwa kwa gridi.
    var EMOJI = [
        '😀', '😄', '😊', '🙂', '😉', '😍', '🤩', '😘',
        '😎', '🤝', '👍', '👏', '🙏', '💪', '👌', '✌️',
        '❤️', '🧡', '💚', '💙', '🔥', '✨', '🎉', '💯',
        '😅', '😢', '😮', '🤔', '😴', '🫡', '🤗', '😇',
        '🛒', '📦', '🚚', '💰', '💵', '📱', '🏷️', '🧾',
        '📍', '⏰', '✅', '❌', '⚠️', '📞', '📷', '🔒'
    ];

    function buildEmojiGrid() {
        var host = document.getElementById('chEmojiGrid');
        if (!host || host.__built) return;
        host.__built = true;
        var html = '';
        for (var i = 0; i < EMOJI.length; i++) {
            html += '<button type="button" data-emoji="' + EMOJI[i] + '" aria-label="' + EMOJI[i] + '">' + EMOJI[i] + '</button>';
        }
        host.innerHTML = html;
        host.addEventListener('click', function (e) {
            var b = e.target && e.target.closest ? e.target.closest('button[data-emoji]') : null;
            if (!b) return;
            insertIntoInput(b.getAttribute('data-emoji') || '');
        });
    }

    // Weka emoji mahali palipo na cursor ndani ya `#chatInput`.
    function insertIntoInput(txt) {
        var input = document.getElementById('chatInput');
        if (!input || !txt) return;
        var start = (input.selectionStart == null) ? input.value.length : input.selectionStart;
        var end = (input.selectionEnd == null) ? input.value.length : input.selectionEnd;
        input.value = input.value.slice(0, start) + txt + input.value.slice(end);
        var pos = start + txt.length;
        try { input.setSelectionRange(pos, pos); } catch (e) {}
        input.focus();
        try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (e2) {}
    }

    /* -------------------------------------------------- 2. POPOVERS */
    var POPS = ['chEmojiPop', 'chTradePop', 'chPlusMenu'];
    var BTNS = { chEmojiPop: 'chatEmojiBtn', chTradePop: 'chatTradeBtn', chPlusMenu: 'chatPlusBtn' };

    function closeAll(exceptId) {
        POPS.forEach(function (id) {
            if (id === exceptId) return;
            var el = document.getElementById(id);
            if (el) { el.hidden = true; el.style.display = 'none'; }
            var b = document.getElementById(BTNS[id]);
            if (b) { b.classList.remove('is-open'); b.setAttribute('aria-expanded', 'false'); }
        });
    }

    function togglePop(id, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        var el = document.getElementById(id);
        if (!el) return;
        var willOpen = !!el.hidden;
        closeAll(id);
        el.hidden = !willOpen;
        el.style.display = willOpen ? 'flex' : 'none';
        if (id === 'chEmojiPop') { el.style.display = willOpen ? 'block' : 'none'; buildEmojiGrid(); }
        var b = document.getElementById(BTNS[id]);
        if (b) {
            b.classList.toggle('is-open', willOpen);
            b.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        }
    }

    window.skhChatPopClose = function () { closeAll(null); };
    window.skhChatToggleEmoji = function (ev) { togglePop('chEmojiPop', ev); };
    window.skhChatToggleTrade = function (ev) { togglePop('chTradePop', ev); };

    // Bonyeza nje au Escape → funga popovers zote.
    document.addEventListener('click', function (e) {
        var t = e.target;
        if (!t) return;
        if (t.closest && (t.closest('.ch-pop') || t.closest('.ch-cbtn') || t.closest('#chatPlusMenu') || t.closest('#chatPlusBtn'))) return;
        closeAll(null);
    }, true);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeAll(null);
    });

    /* ------------------------------ 3. KICHWA: hali ya mwenzako */
    // Hali inaandikwa na sehemu nyingine za mfumo (typing/etc); hii ni default
    // isiyo ya uongo: inaonyesha aina ya mazungumzo, si madai ya "online".
    window.skhChatHeaderStatus = function (text) {
        var sub = document.getElementById('chatSub');
        if (!sub) return;
        sub.textContent = text == null ? '' : String(text);
    };

    /* ------------------------------------- 4. CHIP YA KUREKODI SAUTI */
    var recTimer = null, recStart = 0;
    window.skhChatRecChip = function (on) {
        var chip = document.getElementById('chRecChip');
        var btn = document.getElementById('voiceBtn');
        var lbl = document.getElementById('chRecTime');
        if (btn) btn.classList.toggle('is-recording', !!on);
        if (chip) { chip.hidden = !on; chip.style.display = on ? 'flex' : 'none'; }
        if (recTimer) { clearInterval(recTimer); recTimer = null; }
        if (!on) { if (lbl) lbl.textContent = '0:00'; return; }
        recStart = Date.now();
        var tick = function () {
            if (!lbl) return;
            var s = Math.floor((Date.now() - recStart) / 1000);
            lbl.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        };
        tick();
        recTimer = setInterval(tick, 500);
    };

    /* ------------------------------------------------- 6. INIT */
    function init() { buildEmojiGrid(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
