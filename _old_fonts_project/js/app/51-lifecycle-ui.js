/* ==== js/app/51-lifecycle-ui.js ====
   SOKOHAI — LIFECYCLE UI (menyu , tabs, bulk, search ya kumbukumbu)
   ================================================================
   Hii ni SEHEMU YA UI ya mfumo wa Kufuta/Kumbukumbu/Historia.
   Mantiki yote ya maamuzi iko 50-lifecycle-core.js — hapa
   tunaonyesha tu kile kinachoruhusiwa.

   Haiongezi buttons nyingi kwenye UI: kila rekodi inapata menyu
   MOJA ya nukta tatu, na chaguo zinabadilika kulingana na aina ya
   rekodi (mf. "Futa" haionyeshwi kwenye muamala wa SokoPay).
   ================================================================ */
import { skh } from './00-bootstrap.js';

(function () { 'use strict';

    function LC() { return window.skhLifecycle; }
    function esc(s) { return skh.skhEscape ? skh.skhEscape(String(s == null ? '' : s)) : String(s == null ? '' : s); }
    function jesc(s) { return String(s == null ? '' : s).replace(/'/g, "\\'"); }
    function ico(n, s) { return window.skhNavIcon ? window.skhNavIcon(n, s || 14) : ''; }

    /* ============================================================
     * CSS
     * ============================================================ */
    const CSS = `
.skh-lc-menu-wrap{position:relative;display:inline-block}
.skh-lc-dots{background:transparent;border:none;cursor:pointer;padding:6px 8px;border-radius:8px;
  color:#64748b;font-size:17px;line-height:1;font-weight:900}
.skh-lc-dots:hover{background:rgba(15,23,42,.07);color:#0f172a}
.skh-lc-menu{position:fixed;z-index:2147483000;min-width:220px;background:#fff;border:1px solid #e6edf5;
  border-radius:14px;box-shadow:0 18px 44px -12px rgba(15,42,77,.34);padding:6px;display:none}
.skh-lc-menu.open{display:block}
.skh-lc-mi{display:flex;align-items:center;gap:10px;width:100%;background:transparent;border:none;
  cursor:pointer;padding:11px 12px;border-radius:10px;font-size:13.5px;font-weight:700;color:#0f172a;text-align:left}
.skh-lc-mi:hover{background:#f1f5f9}
.skh-lc-mi.danger{color:#dc2626}
.skh-lc-mi.danger:hover{background:#fef2f2}
.skh-lc-mi svg{width:15px;height:15px;flex-shrink:0}
.skh-lc-note{padding:9px 12px;font-size:13px;color:#64748b;border-top:1px solid #eef2f7;margin-top:4px;line-height:1.5}

/* Tabs: Zinazoendelea / Zimekamilika / Kumbukumbu */
.skh-lc-tabs{display:flex;gap:8px;overflow-x:auto;padding:10px 12px;scrollbar-width:none}
.skh-lc-tabs::-webkit-scrollbar{display:none}
.skh-lc-tab{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;
  border:1px solid #dbe5ef;background:#f8fafc;color:#334155;font-size:12.5px;font-weight:800;cursor:pointer}
.skh-lc-tab.active{background:#1268A8;border-color:#1268A8;color:#fff;box-shadow:0 5px 14px rgba(18,104,168,.3)}
.skh-lc-tab .n{background:rgba(15,23,42,.08);border-radius:99px;padding:1px 7px;font-size:12.5px;font-weight:900}
.skh-lc-tab.active .n{background:rgba(255,255,255,.22)}

/* Search + filters ndani ya kumbukumbu */
.skh-lc-search{display:flex;gap:8px;align-items:center;padding:0 12px 10px}
.skh-lc-search input{flex:1;min-width:0;padding:10px 12px;border:1px solid #dbe5ef;border-radius:10px;
  font-size:13px;background:#fff}
.skh-lc-search input:focus{outline:none;border-color:#1268A8;box-shadow:0 0 0 3px rgba(18,104,168,.12)}

/* Bulk bar */
.skh-lc-bulk{position:fixed;left:50%;transform:translateX(-50%);bottom:78px;z-index:2147482000;
  background:#0f172a;color:#fff;border-radius:14px;padding:10px 12px;display:none;align-items:center;gap:10px;
  box-shadow:0 18px 40px -10px rgba(0,0,0,.5);max-width:94vw}
.skh-lc-bulk.show{display:flex}
.skh-lc-bulk b{font-size:13px}
.skh-lc-bulk button{background:#1e293b;color:#fff;border:none;border-radius:9px;padding:8px 11px;
  font-size:12px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
.skh-lc-bulk button:hover{background:#334155}
.skh-lc-bulk button.danger{background:#dc2626}
.skh-lc-bulk button.ghost{background:transparent;color:#94a3b8}

/* Beji ya rekodi iliyowekwa kumbukumbu */
.skh-lc-badge{display:inline-flex;align-items:center;gap:4px;background:#f1f5f9;color:#475569;
  border:1px solid #e2e8f0;border-radius:99px;padding:2px 9px;font-size:12.5px;font-weight:800}

/* Historia (audit trail) */
.skh-lc-hist{padding:4px 0}
.skh-lc-hrow{display:flex;gap:10px;padding:9px 2px;border-bottom:1px dashed #e8eef5}
.skh-lc-hrow:last-child{border-bottom:none}
.skh-lc-hdot{width:9px;height:9px;border-radius:50%;background:#1268A8;margin-top:5px;flex-shrink:0}
.skh-lc-hb{flex:1;min-width:0}
.skh-lc-ht{font-size:13px;font-weight:800;color:#0f172a}
.skh-lc-hm{font-size:13px;color:#64748b}
`;
    const st = document.createElement('style');
    st.id = 'skhLifecycleCss';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);

    /* ============================================================
     * MENYU YA NUKTA TATU
     * ============================================================ */
    let menuEl = null;

    function closeMenu() {
        if (menuEl) { menuEl.classList.remove('open'); menuEl.remove(); menuEl = null; }
    }
    document.addEventListener('click', function (e) {
        if (menuEl && !menuEl.contains(e.target) && !e.target.closest('.skh-lc-dots')) closeMenu();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    window.addEventListener('scroll', closeMenu, true);

    /**
     * skhLcMenu — fungua menyu ya vitendo kwa rekodi moja.
     * Hutumia getRecordActions(): chaguo zinabadilika kwa aina ya rekodi.
     */
    window.skhLcMenu = async function (btn, collection, id, opts) {
        opts = opts || {};
        closeMenu();
        const lc = LC();
        if (!lc) return;

        let data = opts.data || null;
        if (!data) {
            try {
                const s = await skh.getDoc(skh.doc(skh.db, collection, id));
                data = (s && s.exists && s.exists()) ? s.data() : {};
            } catch (e) { data = {}; }
        }
        const uid = (skh.currentUser && skh.currentUser.uid) || null;
        const acts = lc.getRecordActions(collection, data, uid);
        const pol = lc.policyFor(collection);
        const verdict = lc.canDeleteRecord(collection, data);

        menuEl = document.createElement('div');
        menuEl.className = 'skh-lc-menu open';
        menuEl.innerHTML = acts.map(function (a) {
            return '<button type="button" class="skh-lc-mi' + (a.danger ? ' danger' : '') + '" data-act="' + a.key + '">'
                + ico(a.icon, 15) + '<span>' + esc(a.label) + '</span></button>';
        }).join('')
        + (!verdict.ok && verdict.reason
            ? '<div class="skh-lc-note">' + ico('shield-check', 12) + ' ' + esc(verdict.reason) + '</div>' : '');

        document.body.appendChild(menuEl);
        const r = btn.getBoundingClientRect();
        const w = 224, h = menuEl.offsetHeight || 180;
        menuEl.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
        menuEl.style.top = (r.bottom + h > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';

        menuEl.querySelectorAll('.skh-lc-mi').forEach(function (b) {
            b.addEventListener('click', async function () {
                const act = b.getAttribute('data-act');
                closeMenu();
                if (act === 'view') {
                    if (typeof opts.onView === 'function') opts.onView();
                    else if (typeof window.openProduct === 'function' && ['products','services','drivers'].indexOf(collection) !== -1) {
                        window.openProduct(id, collection);
                    }
                    return;
                }
                if (act === 'history') { window.skhLcShowHistory(collection, id); return; }
                if (act === 'archive') {
                    const res = await lc.archiveRecord(collection, id, { reason: 'user_action' });
                    skhToast(res.ok ? 'Imewekwa kwenye Kumbukumbu.' : (res.error || 'Imeshindikana.'), res.ok ? 'success' : 'error');
                    if (res.ok && typeof opts.onDone === 'function') opts.onDone('archive');
                    return;
                }
                if (act === 'restore') {
                    const res = await lc.restoreRecord(collection, id);
                    skhToast(res.ok ? 'Imerejeshwa.' : (res.error || 'Imeshindikana.'), res.ok ? 'success' : 'error');
                    if (res.ok && typeof opts.onDone === 'function') opts.onDone('restore');
                    return;
                }
                if (act === 'delete') {
                    await lc.requestDelete(collection, id, {
                        title: opts.title || data.title || data.name || pol.label,
                        onDone: opts.onDone
                    });
                }
            });
        });
    };

    /** HTML ya kitufe cha  — tumia hii popote kwenye kadi/rows. */
    window.skhLcDots = function (collection, id, title) {
        return '<button type="button" class="skh-lc-dots" aria-label="Vitendo zaidi" title="Vitendo"'
            + ' onclick="event.stopPropagation();window.skhLcMenu(this,\'' + jesc(collection) + '\',\'' + jesc(id) + '\',{title:\'' + jesc(title || '') + '\'})">&#8942;</button>';
    };

    /** Beji ya "Kumbukumbu" */
    window.skhLcBadge = function (data, uid) {
        const lc = LC();
        if (!lc || !lc.isArchived(data, uid || (skh.currentUser && skh.currentUser.uid))) return '';
        return '<span class="skh-lc-badge">' + ico('archive', 11) + ' Kumbukumbu</span>';
    };

    /* ============================================================
     * TABS: Active / Completed / Archived
     * ============================================================ */
    const TAB_SETS = {
        orders:        [['active','Zinazoendelea'],['completed','Zimekamilika'],['archived','Kumbukumbu']],
        requests:      [['pending','Yanayosubiri'],['accepted','Yaliyokubaliwa'],['rejected','Yaliyokataliwa'],['cancelled','Yaliyoghairiwa'],['archived','Kumbukumbu']],
        conversations: [['active','Yanayoendelea'],['archived','Kumbukumbu']],
        ride_requests: [['pending','Unaosubiri'],['accepted','Umekubaliwa'],['active','Unaendelea'],['completed','Umekamilika'],['archived','Historia']],
        tokens:        [['active','Active Tokens'],['used','Used Tokens'],['expired','Expired Tokens']],
        _default:      [['active','Zinazoendelea'],['completed','Zimekamilika'],['archived','Kumbukumbu']]
    };

    window.skhLcTabsHtml = function (collection, current, counts) {
        const set = TAB_SETS[collection] || TAB_SETS._default;
        counts = counts || {};
        return '<div class="skh-lc-tabs" role="tablist">' + set.map(function (t) {
            const n = counts[t[0]];
            return '<button type="button" role="tab" class="skh-lc-tab' + (current === t[0] ? ' active' : '') + '"'
                + ' onclick="window.skhLcSetView(\'' + jesc(collection) + '\',\'' + t[0] + '\')">'
                + esc(t[1]) + (n ? '<span class="n">' + n + '</span>' : '') + '</button>';
        }).join('') + '</div>';
    };

    window.skhLcView = {};   // collection -> view ya sasa
    window.skhLcQuery = {};  // collection -> maneno ya utafutaji

    window.skhLcSetView = function (collection, view) {
        window.skhLcView[collection] = view;
        const h = window.skhLcHandlers && window.skhLcHandlers[collection];
        if (typeof h === 'function') h(view);
        document.dispatchEvent(new CustomEvent('skh:lc-view', { detail: { collection: collection, view: view } }));
    };
    window.skhLcHandlers = {};

    /** Sajili mtoa-huduma wa kuonyesha upya orodha baada ya kubadili tab. */
    window.skhLcOnViewChange = function (collection, fn) {
        window.skhLcHandlers[collection] = fn;
    };

    /* ============================================================
     * SEARCH + FILTER NDANI YA KUMBUKUMBU
     * ============================================================ */
    window.skhLcSearchHtml = function (collection, placeholder) {
        return '<div class="skh-lc-search">'
            + '<input type="search" id="lcQ_' + esc(collection) + '" placeholder="' + esc(placeholder || 'Tafuta...') + '"'
            + ' oninput="window.skhLcSetQuery(\'' + jesc(collection) + '\', this.value)">'
            + '</div>';
    };

    window.skhLcSetQuery = function (collection, q) {
        window.skhLcQuery[collection] = String(q || '').toLowerCase();
        const h = window.skhLcHandlers[collection];
        if (typeof h === 'function') h(window.skhLcView[collection] || 'active');
    };

    /**
     * skhLcApply — chuja orodha kwa view + search kwa mkupuo mmoja.
     * Hii ndiyo njia inayopendekezwa kwa kila ukurasa wenye orodha.
     */
    window.skhLcApply = function (items, collection, opts) {
        opts = opts || {};
        const lc = LC();
        const uid = (skh.currentUser && skh.currentUser.uid) || null;
        const view = opts.view || window.skhLcView[collection] || 'active';
        let out = Array.isArray(items) ? items.slice() : [];

        // 1) Ficha zilizofichwa kwa mtumiaji huyu
        if (lc) out = out.filter(function (d) { return !lc.isHiddenForUser(d, uid); });

        // 2) Archived vs active
        if (lc) {
            if (view === 'archived') out = out.filter(function (d) { return lc.isArchived(d, uid); });
            else out = out.filter(function (d) { return !lc.isArchived(d, uid); });
        }

        // 3) Status maalum (completed/pending/...)
        if (['completed','pending','accepted','rejected','cancelled','used','expired'].indexOf(view) !== -1) {
            out = out.filter(function (d) {
                return String(d.status || d.orderStatus || '').toLowerCase() === view;
            });
        }

        // 4) Search
        const q = window.skhLcQuery[collection];
        if (q) {
            out = out.filter(function (d) {
                return JSON.stringify(d).toLowerCase().indexOf(q) !== -1;
            });
        }

        // 5) Date range (hiari)
        if (opts.from || opts.to) {
            out = out.filter(function (d) {
                const t = d.createdAt || d.at || d.timestamp || '';
                if (!t) return true;
                if (opts.from && String(t) < opts.from) return false;
                if (opts.to && String(t) > opts.to) return false;
                return true;
            });
        }
        return out;
    };

    /** Hesabu za tabs */
    window.skhLcCounts = function (items, collection) {
        const lc = LC();
        const uid = (skh.currentUser && skh.currentUser.uid) || null;
        const c = { active: 0, completed: 0, archived: 0, pending: 0, accepted: 0, rejected: 0, cancelled: 0, used: 0, expired: 0 };
        (items || []).forEach(function (d) {
            if (lc && lc.isHiddenForUser(d, uid)) return;
            if (lc && lc.isArchived(d, uid)) { c.archived++; return; }
            const s = String(d.status || d.orderStatus || '').toLowerCase();
            if (c[s] !== undefined) c[s]++;
            if (s !== 'completed') c.active++;
        });
        return c;
    };

    /* ============================================================
     * BULK ACTIONS
     * ============================================================ */
    let bulkSel = {};   // key "collection|id" -> true
    let bulkColl = null;

    function bulkBar() {
        let el = document.getElementById('skhLcBulkBar');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'skhLcBulkBar';
        el.className = 'skh-lc-bulk';
        el.innerHTML = '<b id="lcBulkN">0</b>'
            + '<button type="button" id="lcBulkArchive">' + ico('archive', 13) + ' Kumbukumbu</button>'
            + '<button type="button" id="lcBulkRestore">' + ico('refresh', 13) + ' Rejesha</button>'
            + '<button type="button" class="danger" id="lcBulkDelete">' + ico('trash', 13) + ' Futa</button>'
            + '<button type="button" class="ghost" id="lcBulkClear">Ghairi</button>';
        document.body.appendChild(el);

        el.querySelector('#lcBulkClear').addEventListener('click', window.skhLcBulkClear);
        ['archive','restore','delete'].forEach(function (act) {
            el.querySelector('#lcBulk' + act.charAt(0).toUpperCase() + act.slice(1))
              .addEventListener('click', async function () {
                const items = Object.keys(bulkSel).map(function (k) {
                    const p = k.split('|'); return { collection: p[0], id: p[1] };
                });
                await LC().bulkAction(act, items, {
                    onDone: function () {
                        window.skhLcBulkClear();
                        const h = window.skhLcHandlers[bulkColl];
                        if (typeof h === 'function') h(window.skhLcView[bulkColl] || 'active');
                    }
                });
            });
        });
        return el;
    }

    window.skhLcBulkToggle = function (collection, id, on) {
        bulkColl = collection;
        const k = collection + '|' + id;
        if (on) bulkSel[k] = true; else delete bulkSel[k];
        const n = Object.keys(bulkSel).length;
        const bar = bulkBar();
        bar.querySelector('#lcBulkN').textContent = n + ' vimechaguliwa';
        bar.classList.toggle('show', n > 0);
    };

    window.skhLcBulkClear = function () {
        bulkSel = {};
        const bar = document.getElementById('skhLcBulkBar');
        if (bar) bar.classList.remove('show');
        document.querySelectorAll('.skh-lc-check:checked').forEach(function (c) { c.checked = false; });
    };

    window.skhLcCheckbox = function (collection, id) {
        return '<input type="checkbox" class="skh-lc-check" aria-label="Chagua"'
            + ' onclick="event.stopPropagation();window.skhLcBulkToggle(\'' + jesc(collection) + '\',\'' + jesc(id) + '\',this.checked)">';
    };

    /* ============================================================
     * HISTORIA / AUDIT TRAIL
     * ============================================================ */
    const ACTION_LBL = {
        LIFECYCLE_ARCHIVE: 'Imewekwa kwenye Kumbukumbu',
        LIFECYCLE_RESTORE: 'Imerejeshwa',
        LIFECYCLE_SOFT_DELETE: 'Imefichwa kwa mtumiaji',
        LIFECYCLE_DELETE: 'Imefutwa',
        LIFECYCLE_TOKEN_USED: 'Token imetumika'
    };

    window.skhLcShowHistory = async function (collection, id) {
        let rows = [];
        try {
            const q = skh.query(
                skh.collection(skh.db, 'activity_logs'),
                skh.where('collectionName', '==', collection),
                skh.where('recordId', '==', id),
                skh.limit(50)
            );
            const s = await skh.getDocs(q);
            if (s && s.forEach) s.forEach(function (d) { rows.push(d.data() || {}); });
        } catch (e) { /* index bado, au hakuna ruhusa */ }

        rows.sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });

        const body = rows.length
            ? '<div class="skh-lc-hist">' + rows.map(function (r) {
                const lbl = ACTION_LBL[r.type] || String(r.type || 'Tukio').replace('LIFECYCLE_', '');
                let when = '';
                try { when = new Date(r.at).toLocaleString(); } catch (e) { when = r.at || ''; }
                return '<div class="skh-lc-hrow"><span class="skh-lc-hdot"></span><div class="skh-lc-hb">'
                    + '<div class="skh-lc-ht">' + esc(lbl) + '</div>'
                    + '<div class="skh-lc-hm">' + esc(r.actorName || r.actorId || 'Mfumo') + ' · ' + esc(when) + '</div>'
                    + '</div></div>';
              }).join('') + '</div>'
            : '<p style="color:#64748b;font-size:13px;margin:6px 0">Hakuna matukio yaliyorekodiwa bado.</p>';

        await skhConfirm(body, { title: 'Historia ya rekodi', okText: 'Funga', cancelText: null, html: true });
    };

    /* ============================================================
     * KIELELEZO CHA KUCHORA: header kamili (tabs + search)
     * ============================================================ */
    window.skhLcHeader = function (collection, items, opts) {
        opts = opts || {};
        const view = window.skhLcView[collection] || opts.defaultView || 'active';
        window.skhLcView[collection] = view;
        return window.skhLcTabsHtml(collection, view, window.skhLcCounts(items, collection))
             + (opts.search === false ? '' : window.skhLcSearchHtml(collection, opts.placeholder));
    };
})();
