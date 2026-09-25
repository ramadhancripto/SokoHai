/* ==== js/app/36-seller-chat-comments.js ====
   SOKOHAI — SELLER CHAT/COMMENTS + ADMIN MODERATION (Phase 7/11 finish)
   ------------------------------------------------------------
   - Seller dashboard: Tathmini (reviews) HALISI kutoka data + maswali
     (Q&A) yenye jibu la moja kwa moja + response rate.
   - Admin: usimamizi wa maoni + ripoti (hide/unhide/delete via server).
   ADDITIVE — haibadilishi mifumo iliyopo; inaongeza kwenye dashboards.
   ============================================================ */
import { skh } from './00-bootstrap.js';

(function () { 'use strict';

    function T(key, en) {
        var s = null;
        try { if (window.t) s = window.t(key); } catch (e) {}
        if (!s || s === key) s = en;
        return s;
    }
    function esc(s) { return skh.skhEscape(s == null ? '' : String(s)); }
    function jsEsc(s) { return skh.skhJsEsc(s == null ? '' : String(s)); }
    function nowIso() { return new Date().toISOString(); }
    function myUid() { return (skh.currentUser && skh.currentUser.uid) || null; }
    function truncate(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
    function fmtDate(iso) { try { var d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString(); } catch (e) { return ''; } }

    function cfCallable(name) {
        try {
            if (typeof skh.wrapCallable === 'function') return skh.wrapCallable(name);
            return skh.httpsCallable(skh.getFunctions(skh.fApp, 'europe-west1'), name);
        } catch (e) { return null; }
    }

    /* ---------- Takwimu HALISI za muuzaji ---------- */
    window.skhSellerStatsReal = async function () {
        var me = myUid();
        var stats = { avg: 0, count: 0, breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, responseRate: null, questions: 0, answered: 0 };
        if (!me) return stats;
        var products = [];
        try {
            var q = skh.query(skh.collection(skh.db, 'products'), skh.where('userId', '==', me), skh.limit(100));
            var snap = await skh.getDocs(q);
            if (snap && snap.forEach) snap.forEach(function (d) { products.push(Object.assign({ id: d.id }, d.data())); });
        } catch (e) { /* ignore */ }

        var ratings = [];
        products.forEach(function (p) {
            (p.comments || []).forEach(function (c) {
                var r = Number(c.rating || 0);
                if (r >= 1 && r <= 5) { ratings.push(r); stats.breakdown[r] = (stats.breakdown[r] || 0) + 1; }
            });
        });
        stats.count = ratings.length;
        if (stats.count) {
            var sum = ratings.reduce(function (a, b) { return a + b; }, 0);
            stats.avg = Math.round((sum / stats.count) * 10) / 10;
        }

        // Response rate: maswali ya wateja kwenye bidhaa zangu yenye jibu langu.
        try {
            var ids = {};
            products.forEach(function (p) { ids[p.id] = true; });
            var cq = skh.query(skh.collection(skh.db, 'comments'), skh.limit(400));
            var csnap = await skh.getDocs(cq);
            var tops = [], replies = {};
            if (csnap && csnap.forEach) csnap.forEach(function (d) {
                var c = d.data();
                if (!ids[c.targetId]) return;
                if (!c.parentId) tops.push(c); else (replies[c.rootId || c.parentId] = replies[c.rootId || c.parentId] || []).push(c);
            });
            tops.forEach(function (t) {
                if (t.authorId === me) return; // si swali la mteja
                stats.questions++;
                var rs = replies[t.id] || [];
                if (rs.some(function (r) { return r.authorId === me; })) stats.answered++;
            });
            if (stats.questions) stats.responseRate = Math.round((stats.answered / stats.questions) * 100);
        } catch (e) { /* ignore */ }
        return stats;
    };

    /* ---------- Modal: Tathmini & Maswali (seller) ---------- */
    window.skhSellerCommentsPanel = async function () {
        if (!skh.requireAuth()) return;
        closeModals();
        var m = document.getElementById('skhSellerCommentsModal');
        if (!m) {
            m = document.createElement('div');
            m.id = 'skhSellerCommentsModal';
            m.className = 'overlay-menu';
            m.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:9600;padding:12px;';
            document.body.appendChild(m);
        }
        m.innerHTML = '<div style="background:#fff;border-radius:18px;width:96%;max-width:640px;max-height:90vh;overflow:auto;box-shadow:0 24px 72px rgba(15,23,42,.4);">'
            + '<div style="background:linear-gradient(135deg,#001122,#00509d);color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:1;">'
            + '<b>' + T('sc_title', 'Tathmini & Maswali (Halisi)') + '</b>'
            + '<button type="button" onclick="document.getElementById(\'skhSellerCommentsModal\').style.display=\'none\'" style="border:none;background:transparent;color:#fff;font-size:20px;cursor:pointer;" aria-label="Funga">' + (window.skhNavIcon ? window.skhNavIcon('x',16) : '') + '</button></div>'
            + '<div id="skhSellerCommentsBody" style="padding:14px;font-size:12px;color:#475569;">' + T('sc_loading', 'Inapakia...') + '</div></div>';
        m.style.display = 'flex';
        await renderSellerPanel();
    };

    async function renderSellerPanel() {
        var body = document.getElementById('skhSellerCommentsBody');
        if (!body) return;
        var me = myUid();
        var s = await window.skhSellerStatsReal();
        var star = function (n) { var g = ''; for (var i = 0; i < n; i++) g += ''; return '<span style="color:#f59e0b;">' + g + '</span>'; };
        var html = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;">'
            + '<div style="flex:1;min-width:140px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px;text-align:center;">'
            + '<div style="font-size:28px;font-weight:900;color:#0f172a;">' + (s.avg ? s.avg.toFixed(1) : '—') + '</div>'
            + '<div style="font-size:13px;color:#64748b;">' + T('sc_avg_rating', 'Wastani wa Nyota') + ' (' + s.count + ')</div></div>'
            + '<div style="flex:1;min-width:140px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px;text-align:center;">'
            + '<div style="font-size:28px;font-weight:900;color:#16a34a;">' + (s.responseRate == null ? '—' : s.responseRate + '%') + '</div>'
            + '<div style="font-size:13px;color:#64748b;">' + T('sc_response_rate', 'Kiwango cha Kujibu') + '</div></div>'
            + '<div style="flex:1;min-width:140px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px;text-align:center;">'
            + '<div style="font-size:28px;font-weight:900;color:#d97706;">' + s.questions + '</div>'
            + '<div style="font-size:13px;color:#64748b;">' + T('sc_questions', 'Maswali ya Wateja') + '</div></div></div>';

        html += '<b style="display:block;margin-bottom:6px;">' + T('sc_breakdown', 'Mgawanyo wa Nyota') + '</b>'
            + '<div style="font-size:13px;color:#64748b;margin-bottom:12px;">'
            + [5, 4, 3, 2, 1].map(function (n) {
                var pct = s.count ? Math.round((s.breakdown[n] || 0) / s.count * 100) : 0;
                return '<div style="display:flex;align-items:center;gap:8px;margin:2px 0;">' + n + ' ' + star(1)
                    + '<div style="flex:1;height:7px;background:#eef2f6;border-radius:99px;"><div style="width:' + pct + '%;height:7px;background:#f59e0b;border-radius:99px;"></div></div>'
                    + '<b>' + pct + '%</b></div>';
            }).join('') + '</div>';

        // Maswali ya wateja (Q&A) yenye jibu la moja kwa moja.
        html += '<b style="display:block;margin-bottom:6px;">' + T('sc_qa', 'Maswali ya Wateja (jibu moja kwa moja)') + '</b><div id="skhSellerQaList">' + T('sc_loading', 'Inapakia...') + '</div>';
        body.innerHTML = html;
        await renderQaList();
    }

    async function renderQaList() {
        var host = document.getElementById('skhSellerQaList');
        if (!host) return;
        var me = myUid();
        var products = [];
        try {
            var q = skh.query(skh.collection(skh.db, 'products'), skh.where('userId', '==', me), skh.limit(100));
            var snap = await skh.getDocs(q);
            if (snap && snap.forEach) snap.forEach(function (d) { products.push(Object.assign({ id: d.id }, d.data())); });
        } catch (e) {}
        var ids = {}; products.forEach(function (p) { ids[p.id] = true; });
        var tops = [], replies = {};
        try {
            var cq = skh.query(skh.collection(skh.db, 'comments'), skh.limit(400));
            var csnap = await skh.getDocs(cq);
            if (csnap && csnap.forEach) csnap.forEach(function (d) {
                var c = d.data();
                if (!ids[c.targetId] || c.deletedAt) return;
                if (!c.parentId) tops.push(Object.assign({ id: d.id }, c)); else (replies[c.rootId || c.parentId] = replies[c.rootId || c.parentId] || []).push(c);
            });
        } catch (e) {}
        tops = tops.filter(function (t) { return t.authorId !== me; }).sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); }).slice(0, 30);
        if (!tops.length) { host.innerHTML = '<p style="color:#94a3b8;">' + T('sc_no_qa', 'Hakuna maswali bado.') + '</p>'; return; }
        host.innerHTML = tops.map(function (t) {
            var rs = (replies[t.id] || []);
            var answered = rs.some(function (r) { return r.authorId === me; });
            return '<div style="border:1px solid #e2e8f0;border-radius:12px;padding:9px;margin-bottom:8px;background:#f8fafc;">'
                + '<b style="font-size:12px;color:#0f172a;">' + esc(t.authorName || 'Mteja') + '</b> <span style="color:#94a3b8;font-size:12.5px;">' + fmtDate(t.createdAt) + '</span>'
                + '<div style="font-size:12px;margin:3px 0;">' + esc(t.text || '') + '</div>'
                + (rs.length ? rs.map(function (r) { return '<div style="margin-left:14px;font-size:13px;color:#0369a1;">↳ ' + esc(r.authorName || '') + ': ' + esc(r.text || '') + '</div>'; }).join('') : '')
                + '<div style="margin-top:6px;"><button type="button" style="border:none;background:#03509d;color:#fff;border-radius:99px;padding:5px 12px;font-size:13px;font-weight:800;cursor:pointer;" onclick="window.skhSellerReplyToQuestion(\'' + jsEsc(t.id) + '\')">'
                + (answered ? T('sc_reply_again', 'Jibu Tena') : T('sc_reply', 'Jibu')) + '</button></div></div>';
        }).join('');
    }

    // [COMMENT FIX 2026-09] Arifu mwandishi wa swali (mteja) kwamba muuzaji amejibu
    // — kwa kutumia mfumo ULIOPO wa notifications (hakuna mfumo mpya).
    function sellerNotify(uid, title, body, meta) {
        if (!uid) return Promise.resolve();
        if (typeof window.skhEngageSendNotif === 'function') {
            try { return window.skhEngageSendNotif(uid, title, body, 'comment_reply', meta || {}); } catch (e) {}
        }
        try {
            return skh.addDoc(skh.collection(skh.db, 'notifications'), Object.assign({
                userId: uid, title: title, body: body, createdAt: nowIso(), read: false, type: 'comment_reply'
            }, meta || {}));
        } catch (e) { return Promise.resolve(); }
    }

    window.skhSellerReplyToQuestion = async function (commentId) {
        if (!commentId) return;
        var doSend = async function (txt) {
            txt = String(txt || '').trim();
            if (!txt) return;
            var fn = cfCallable('commentsPublish');
            var targetId = '';
            var parentAuthorId = null;
            // [COMMENT FIX 2026-09] Chukua targetId + mwandishi wa swali kutoka
            // kwenye comment mzazi KABLA ya kutuma (ili arifa imfikie mteja).
            try {
                var ps = await skh.getDoc(skh.doc(skh.db, 'comments', commentId));
                if (ps && ps.exists && ps.exists()) {
                    var pd = ps.data();
                    targetId = pd.targetId || '';
                    parentAuthorId = pd.authorId || null;
                }
            } catch (e) { /* ignore */ }

            var payload = {
                targetType: 'product', targetId: targetId, text: txt,
                authorName: (skh.currentUser && skh.currentUser.displayName) || 'Muuzaji',
                authorPhoto: (skh.currentUserData && skh.currentUserData.photoURL) || '',
                parentId: commentId, rootId: commentId, media: []
            };
            var published = null;
            // 1) Server kwanza (verifiedPurchase/author ni SERVER-ONLY).
            if (fn && targetId) {
                try {
                    var res = await fn(payload);
                    if (res && res.data && res.data.ok) published = true;
                } catch (e) {
                    var code = String((e && e.code) || '');
                    if (code && code !== 'functions/not-found' && code !== 'unavailable' && code !== 'internal' && !/not-found/.test(code)) {
                        alert(T('sc_fail', 'Imeshindwa.') + ' ' + (e && e.message ? e.message : ''));
                        return;
                    }
                    // server haipatikani -> endelea na fallback.
                }
            }
            // 2) Fallback: server haipatikani -> andika moja kwa moja (rules za author).
            if (!published && targetId) {
                try {
                    await skh.addDoc(skh.collection(skh.db, 'comments'), {
                        targetType: 'product', targetId: targetId, authorId: skh.currentUser.uid,
                        authorName: payload.authorName, authorPhoto: payload.authorPhoto,
                        parentId: commentId, rootId: commentId, text: txt, media: [],
                        productRef: null, createdAt: nowIso(), updatedAt: nowIso(), deletedAt: null
                    });
                    published = true;
                } catch (e) {
                    alert(T('sc_fail', 'Imeshindwa.') + ' ' + (e && e.message ? e.message : ''));
                    return;
                }
            }
            if (!targetId) {
                alert(T('sc_fail', 'Imeshindwa.') + ' ' + T('sc_no_target', 'Bidhaa ya swali haikutambulika.'));
                return;
            }
            // 3) Arifu mwandishi wa swali kwamba amejibiwa (in-app notification).
            if (parentAuthorId && parentAuthorId !== skh.currentUser.uid) {
                var body = txt.length > 140 ? txt.slice(0, 140) + '…' : txt;
                sellerNotify(parentAuthorId, T('sc_reply_notif_title', 'Muuzaji amejibu swali lako'), body, { commentId: commentId, targetId: targetId });
            }
            await renderQaList();
        };
        if (typeof window.customPrompt === 'function') window.customPrompt(T('sc_reply_ph', 'Andika jibu lako...'), '', doSend);
        else { var v = await skhPrompt(T('sc_reply_ph', 'Andika jibu lako...'), ''); if (v != null) doSend(v); }
    };

    /* ---------- Admin: usimamizi wa maoni + ripoti ---------- */
    window.skhAdminModerationOpen = async function () {
        if (!skh.requireAuth()) return;
        closeModals();
        var m = document.getElementById('skhAdminModerationModal');
        if (!m) {
            m = document.createElement('div');
            m.id = 'skhAdminModerationModal';
            m.className = 'overlay-menu';
            m.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:9600;padding:12px;';
            document.body.appendChild(m);
        }
        m.innerHTML = '<div style="background:#fff;border-radius:18px;width:96%;max-width:680px;max-height:90vh;overflow:auto;box-shadow:0 24px 72px rgba(15,23,42,.4);">'
            + '<div style="background:linear-gradient(135deg,#0b1120,#1e293b);color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:1;">'
            + '<b>' + T('md_title', 'Usimamizi wa Maoni & Ripoti') + '</b>'
            + '<button type="button" onclick="document.getElementById(\'skhAdminModerationModal\').style.display=\'none\'" style="border:none;background:transparent;color:#fff;font-size:20px;cursor:pointer;" aria-label="Funga">' + (window.skhNavIcon ? window.skhNavIcon('x',16) : '') + '</button></div>'
            + '<div id="skhAdminModerationBody" style="padding:14px;font-size:12px;color:#475569;">' + T('sc_loading', 'Inapakia...') + '</div></div>';
        m.style.display = 'flex';
        await renderAdminModeration();
    };

    async function renderAdminModeration() {
        var body = document.getElementById('skhAdminModerationBody');
        if (!body) return;
        var html = '<b style="display:block;margin-bottom:8px;">' + T('md_reports', 'Ripoti zilizowasilishwa') + '</b><div id="skhAdminReports">—</div>'
            + '<b style="display:block;margin:14px 0 8px;">' + T('md_comments', 'Maoni (chagua hatua)') + '</b><div id="skhAdminComments">—</div>';
        body.innerHTML = html;

        // Ripoti
        try {
            var rq = skh.query(skh.collection(skh.db, 'chatReports'), skh.limit(50));
            var rs = await skh.getDocs(rq);
            var rhtml = '';
            if (rs && rs.forEach) rs.forEach(function (d) {
                var r = d.data();
                rhtml += '<div style="border:1px solid #fecaca;background:#fff5f5;border-radius:10px;padding:8px;margin-bottom:6px;">'
                    + '<b>#' + esc(r.reason || '') + '</b> · ' + esc(r.reportedBy || '') + ' · ' + (r.commentId ? 'Maoni ' + esc(r.commentId) : (r.messageId ? 'Ujumbe' : 'Chat')) + '</div>';
            });
            document.getElementById('skhAdminReports').innerHTML = rhtml || '<span style="color:#94a3b8;">' + T('md_none', 'Hakuna ripoti.') + '</span>';
        } catch (e) { document.getElementById('skhAdminReports').innerHTML = '<span style="color:#94a3b8;">—</span>'; }

        // Maoni
        try {
            var cq = skh.query(skh.collection(skh.db, 'comments'), skh.limit(60));
            var cs = await skh.getDocs(cq);
            var items = [];
            if (cs && cs.forEach) cs.forEach(function (d) { items.push(Object.assign({ id: d.id }, d.data())); });
            items.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
            var chtml = items.map(function (c) {
                var st = c.moderationStatus || 'visible';
                return '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:8px;margin-bottom:6px;background:#f8fafc;">'
                    + '<div style="font-size:13px;color:#64748b;">' + esc(c.authorName || '') + ' · ' + fmtDate(c.createdAt) + ' · <b>' + esc(st) + '</b>' + (c.verifiedPurchase ? ' ·  Umenunua' : '') + '</div>'
                    + '<div style="font-size:12px;margin:3px 0;">' + esc(truncate(c.text || '', 160)) + '</div>'
                    + '<div style="display:flex;gap:6px;">'
                    + (st === 'visible' ? '<button type="button" style="border:1px solid #cbd5e1;background:#fff;border-radius:99px;padding:4px 10px;font-size:13px;cursor:pointer;" onclick="window.skhAdminModerateComment(\'' + jsEsc(c.id) + '\',\'hide\')">' + T('md_hide', 'Ficha') + '</button>' : '')
                    + (st === 'hidden' ? '<button type="button" style="border:1px solid #cbd5e1;background:#fff;border-radius:99px;padding:4px 10px;font-size:13px;cursor:pointer;" onclick="window.skhAdminModerateComment(\'' + jsEsc(c.id) + '\',\'unhide\')">' + T('md_unhide', 'Onyesha') + '</button>' : '')
                    + '<button type="button" style="border:1px solid #fecaca;background:#fff5f5;color:#b91c1c;border-radius:99px;padding:4px 10px;font-size:13px;cursor:pointer;" onclick="window.skhAdminModerateComment(\'' + jsEsc(c.id) + '\',\'delete\')">' + T('md_delete', 'Futa') + '</button>'
                    + '</div></div>';
            }).join('');
            document.getElementById('skhAdminComments').innerHTML = chtml || '<span style="color:#94a3b8;">' + T('md_none', 'Hakuna maoni.') + '</span>';
        } catch (e) { document.getElementById('skhAdminComments').innerHTML = '<span style="color:#94a3b8;">—</span>'; }
    }

    window.skhAdminModerateComment = async function (commentId, action) {
        var fn = cfCallable('commentsModerate');
        if (!fn) { alert(T('md_fail', 'Huduma haipatikani.')); return; }
        try {
            await fn({ commentId: commentId, action: action });
            await renderAdminModeration();
        } catch (e) { alert(T('md_fail', 'Imeshindwa.') + ' ' + (e && e.message)); }
    };

    /* ---------- Hook: provider dashboard (reviews tab -> halisi) ---------- */
    const _oldSwitchProvider = window.switchProviderDashTab;
    window.switchProviderDashTab = function (tab) {
        if (tab === 'reviews' && typeof window.loadHubDetailedReviews === 'function') {
            if (_oldSwitchProvider) _oldSwitchProvider(tab);
            setTimeout(function () {
                var ws = document.getElementById('providerWorkspace');
                if (!ws) return;
                var btn = document.getElementById('skhSellerRealBtn');
                if (btn) return;
                var host = document.createElement('div');
                host.style.cssText = 'margin-top:14px;';
                host.innerHTML = '<button type="button" id="skhSellerRealBtn" style="width:100%;padding:14px;background:linear-gradient(135deg,#001122,#00509d);color:#fff;border:none;border-radius:14px;font-weight:900;font-size:13px;cursor:pointer;" onclick="window.skhSellerCommentsPanel()"> ' + T('sc_open_real', 'Tazama Tathmini & Maswali Halisi') + '</button>';
                ws.appendChild(host);
            }, 150);
            return;
        }
        if (_oldSwitchProvider) return _oldSwitchProvider(tab);
    };

    // Admin: weka kitufe kwenye dashboard ya admin (ikiwa ina container).
    const _oldLoadAdmin = window.loadAdminDashboard;
    window.loadAdminDashboard = async function () {
        if (_oldLoadAdmin) await _oldLoadAdmin.apply(this, arguments);
        setTimeout(function () {
            var ws = document.getElementById('richDashboardContainer') || document.getElementById('adminWorkspace') || document.querySelector('[id*="admin"]');
            if (!ws || document.getElementById('skhAdminModBtn')) return;
            var host = document.createElement('div');
            host.style.cssText = 'margin-top:14px;';
            host.innerHTML = '<button type="button" id="skhAdminModBtn" style="padding:12px 16px;background:#0f172a;color:#fff;border:none;border-radius:12px;font-weight:800;font-size:12px;cursor:pointer;" onclick="window.skhAdminModerationOpen()"> ' + T('md_open', 'Usimamizi wa Maoni & Ripoti') + '</button>';
            ws.appendChild(host);
        }, 200);
    };
})();
