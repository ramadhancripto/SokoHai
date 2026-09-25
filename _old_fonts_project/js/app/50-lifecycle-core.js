/* ==== js/app/50-lifecycle-core.js ====
   SOKOHAI — GLOBAL DELETE, ARCHIVE & HISTORY SYSTEM (Injini Kuu)
   ================================================================
   KANUNI KUU YA SOKOHAI: "Futa pale ambapo ni salama; hifadhi kumbukumbu pale ambapo ni
    muhimu; usiharibu historia ya biashara."

   Faili hii ni CHANZO KIMOJA CHA UKWELI kwa maamuzi ya:
     - Je, rekodi hii inaweza kufutwa kabisa?  (canDeleteRecord)
     - Je, inaweza kuwekwa kumbukumbu?         (canArchiveRecord)
     - Lifecycle yake ni ipi?                  (getRecordLifecycle)
     - Vitendo vipi vionyeshwe kwenye menyu?   (getRecordActions)

   HAIANZISHI UPYA kitu chochote. Inatumia:
     - skh.db / doc / updateDoc / deleteDoc / getDoc (00-bootstrap)
     - skhConfirm / skhToast (js/05-dialogs.js)
   na inaheshimu muundo ULIOPO wa chat (`archived: {uid:true}`),
   ambao ndio kielelezo cha per-user maps kwenye mfumo mzima.

   Usajili wa policy uko chini (RECORD_POLICY) — ukiongeza collection
   mpya kwenye SokoHai, iandikishe hapo; bila usajili, mfumo huchukua
   njia SALAMA ZAIDI (archive-only, hakuna delete).
   ================================================================ */
import { skh } from './00-bootstrap.js';

(function () { 'use strict';

    /* ============================================================
     * 1) NGAZI ZA ULINZI
     * ============================================================
     *  PERSONAL  — data binafsi/temporary: inaweza kufutwa kabisa.
     *  SOFT      — ifichwe kwa mtumiaji (per-user), rekodi ibaki.
     *  BUSINESS  — rekodi ya biashara: ARCHIVE pekee, hakuna delete.
     *  IMMUTABLE — fedha/ushahidi: haifutiki, haifichwi; history tu.
     */
    const TIER = {
        PERSONAL: 'personal',
        SOFT: 'soft',
        BUSINESS: 'business',
        IMMUTABLE: 'immutable'
    };

    /* ============================================================
     * 2) USAJILI WA COLLECTIONS (kila moja na sheria yake)
     *    guard(data) => true ikiwa rekodi IMEPANDA hadhi (mf. oda
     *    iliyolipiwa) na hivyo haiwezi tena kufutwa.
     * ============================================================ */
    const PAID_ORDER = function (d) {
        const s = String((d && (d.status || d.orderStatus)) || '').toLowerCase();
        if (d && (d.paidAt || d.paymentConfirmedAt || d.escrowId || d.sokopayCode)) return true;
        return ['paid','payment_pending','preparing','shipped','in_transit','picked_up', 'delivered','completed','disputed','seller_confirmed','received', 'refunded','archived'].indexOf(s) !== -1;
    };
    const LIVE_TRANSPORT = function (d) {
        const s = String((d && d.status) || '').toLowerCase();
        if (d && (d.tokenIssued || d.pickupToken || d.escrowId)) return true;
        return ['accepted','picked_up','in_transit','delivered','completed','disputed'].indexOf(s) !== -1;
    };
    const SOLD_PRODUCT = function (d) {
        // Bidhaa iliyowahi kuuzwa/kuwa na maoni ina references — archive tu.
        return !!(d && ((Number(d.soldCount) > 0) || (Number(d.orderCount) > 0)
            || (Array.isArray(d.comments) && d.comments.length)));
    };

    // tier, label (kwa ujumbe), guard (hupandisha hadi BUSINESS)
    const RECORD_POLICY = {
        /* ---- IMMUTABLE: fedha, escrow, tokens, ushahidi ---- */
        sokopay_core_transactions: { tier: TIER.IMMUTABLE, label: 'Muamala wa SokoPay' },
        sokopay_links:             { tier: TIER.IMMUTABLE, label: 'Kiungo cha SokoPay' },
        sokopay_tokens:            { tier: TIER.IMMUTABLE, label: 'Token ya SokoPay' },
        delivery_tokens:           { tier: TIER.IMMUTABLE, label: 'Token ya uwasilishaji' },
        serious_deposits:          { tier: TIER.IMMUTABLE, label: 'Dhamana' },
        adminRevenue:              { tier: TIER.IMMUTABLE, label: 'Mapato ya kamisheni' },
        delivery_handovers:        { tier: TIER.IMMUTABLE, label: 'Rekodi ya makabidhiano' },
        delivery_events:           { tier: TIER.IMMUTABLE, label: 'Tukio la uwasilishaji' },
        negotiation_events:        { tier: TIER.IMMUTABLE, label: 'Tukio la majadiliano' },
        activity_logs:             { tier: TIER.IMMUTABLE, label: 'Kumbukumbu ya matukio' },
        platform_stats:            { tier: TIER.IMMUTABLE, label: 'Takwimu za mfumo' },
        order_adjustments:         { tier: TIER.IMMUTABLE, label: 'Marekebisho ya oda' },
        productPriceHistory:       { tier: TIER.IMMUTABLE, label: 'Historia ya bei' },

        /* ---- BUSINESS: archive pekee ---- */
        // Oda/safari AMBAZO HAZIJAWAHI kuwa muamala (rasimu, pending bila
        // malipo) zinaweza kufutwa na mwenyewe. Guard ikiwa kweli — ni
        // rekodi ya biashara: ARCHIVE pekee.
        orders:            { tier: TIER.BUSINESS, label: 'Oda', guard: PAID_ORDER, deletableWhenClean: true },
        seller_order_inbox:{ tier: TIER.BUSINESS, label: 'Oda ya muuzaji', guard: PAID_ORDER, deletableWhenClean: true },
        ride_requests:     { tier: TIER.BUSINESS, label: 'Safari/Usafirishaji', guard: LIVE_TRANSPORT, deletableWhenClean: true },
        shipments:         { tier: TIER.BUSINESS, label: 'Usafirishaji', guard: LIVE_TRANSPORT, deletableWhenClean: true },
        logistics_assignments: { tier: TIER.BUSINESS, label: 'Kazi ya usafirishaji' },
        negotiations:      { tier: TIER.BUSINESS, label: 'Majadiliano' },
        offers:            { tier: TIER.BUSINESS, label: 'Ofa' },
        shop_ledger:       { tier: TIER.BUSINESS, label: 'Rekodi ya POS' },
        stock_transfers:   { tier: TIER.BUSINESS, label: 'Uhamisho wa stoo' },
        purchase_orders:   { tier: TIER.BUSINESS, label: 'Oda ya manunuzi' },
        smart_cart_checkouts: { tier: TIER.BUSINESS, label: 'Malipo ya kikapu' },
        chatReports:       { tier: TIER.BUSINESS, label: 'Ripoti' },
        repairs:           { tier: TIER.BUSINESS, label: 'Rekodi ya matengenezo' },
        printing_jobs:     { tier: TIER.BUSINESS, label: 'Kazi ya uchapishaji' },
        garage_services:   { tier: TIER.BUSINESS, label: 'Huduma ya gereji' },
        construction_projects: { tier: TIER.BUSINESS, label: 'Mradi wa ujenzi' },
        driver_expenses:   { tier: TIER.BUSINESS, label: 'Matumizi ya dereva' },
        staff_attendance:  { tier: TIER.BUSINESS, label: 'Mahudhurio' },
        shift_logs:        { tier: TIER.BUSINESS, label: 'Rekodi ya zamu' },
        agents:            { tier: TIER.BUSINESS, label: 'Wakala' },
        agentMembers:      { tier: TIER.BUSINESS, label: 'Mwanachama wa wakala' },
        shop_staff:        { tier: TIER.BUSINESS, label: 'Mfanyakazi' },
        suppliers:         { tier: TIER.BUSINESS, label: 'Msambazaji' },
        customers:         { tier: TIER.BUSINESS, label: 'Mteja' },
        logistics_companies: { tier: TIER.BUSINESS, label: 'Kampuni ya usafirishaji' },
        transport_profiles:{ tier: TIER.BUSINESS, label: 'Wasifu wa usafirishaji' },

        /* ---- BUSINESS kwa masharti: matangazo ---- */
        products: { tier: TIER.BUSINESS, label: 'Bidhaa', guard: SOLD_PRODUCT, deletableWhenClean: true },
        services: { tier: TIER.BUSINESS, label: 'Huduma', guard: SOLD_PRODUCT, deletableWhenClean: true },
        drivers:  { tier: TIER.BUSINESS, label: 'Tangazo la usafiri', guard: LIVE_TRANSPORT, deletableWhenClean: true },

        /* ---- SOFT: ifichwe per-user, rekodi ibaki ---- */
        conversations: { tier: TIER.SOFT, label: 'Mazungumzo', userMap: 'archived' },
        chats:         { tier: TIER.SOFT, label: 'Mazungumzo', userMap: 'archived' },
        comments:      { tier: TIER.SOFT, label: 'Maoni' },
        requests:      { tier: TIER.SOFT, label: 'Ombi' },
        disputes:      { tier: TIER.SOFT, label: 'Mgogoro' },

        /* ---- PERSONAL: futa kabisa ni sawa ---- */
        notifications:    { tier: TIER.PERSONAL, label: 'Arifa' },
        savedProducts:    { tier: TIER.PERSONAL, label: 'Uliyohifadhi' },
        savedMessages:    { tier: TIER.PERSONAL, label: 'Ujumbe uliohifadhiwa' },
        productLikes:     { tier: TIER.PERSONAL, label: 'Kupenda' },
        productWatches:   { tier: TIER.PERSONAL, label: 'Kufuatilia bei' },
        commentLikes:     { tier: TIER.PERSONAL, label: 'Kupenda maoni' },
        sellerFollowers:  { tier: TIER.PERSONAL, label: 'Kufuata duka' },
        chatBlocks:       { tier: TIER.PERSONAL, label: 'Mzuio' },
        haipay_saved:     { tier: TIER.PERSONAL, label: 'Iliyohifadhiwa' },
        announcements:    { tier: TIER.PERSONAL, label: 'Tangazo' },
        recommendationEvents: { tier: TIER.PERSONAL, label: 'Pendekezo' },
        notificationPreferences: { tier: TIER.PERSONAL, label: 'Mapendeleo ya arifa' },
        searchHistory:    { tier: TIER.PERSONAL, label: 'Historia ya utafutaji' },
        drafts:           { tier: TIER.PERSONAL, label: 'Rasimu' }
    };

    // Chaguo-msingi SALAMA kwa collection isiyosajiliwa.
    const DEFAULT_POLICY = { tier: TIER.BUSINESS, label: 'Rekodi' };

    function policyFor(collection) {
        return RECORD_POLICY[collection] || DEFAULT_POLICY;
    }

    /* ============================================================
     * 3) LIFECYCLE — hatua za kila aina ya rekodi
     * ============================================================ */
    const LIFECYCLES = {
        orders: ['created','accepted','payment_pending','paid','preparing', 'transport_requested','picked_up','in_transit','delivered','completed'],
        ride_requests: ['requested','negotiating','accepted','token_issued','picked_up', 'in_transit','handoff','delivered','receiver_confirmed','completed'],
        shipments: ['requested','accepted','picked_up','in_transit','delivered','completed'],
        requests: ['pending','accepted','in_progress','completed'],
        negotiations: ['open','countered','agreement','final_agreement','order_created','closed'],
        services: ['request','negotiation','offer','accepted','service_order','in_progress','completed'],
        sokopay_core_transactions: ['pending','successful','failed','cancelled','refunded','disputed'],
        escrow: ['created','funded','held','released'],
        shop_ledger: ['completed','voided','reversed'],
        products: ['active','inactive','archived'],
        tokens: ['active','used','expired']
    };

    function getRecordLifecycle(collection) {
        return (LIFECYCLES[collection] || ['active','completed','archived']).slice();
    }

    /* ============================================================
     * 4) MAAMUZI
     * ============================================================ */
    function isArchived(data, uid) {
        if (!data) return false;
        if (data.archived === true) return true;
        if (data.archived && typeof data.archived === 'object' && uid) return !!data.archived[uid];
        return false;
    }

    function canArchiveRecord(collection, data, uid) {
        const p = policyFor(collection);
        if (p.tier === TIER.IMMUTABLE) return false;   // history pekee
        return !isArchived(data, uid);
    }

    /**
     * canDeleteRecord — HUU NDIO MLINZI MKUU.
     * Hurudisha { ok, reason, suggestArchive }
     */
    function canDeleteRecord(collection, data) {
        const p = policyFor(collection);

        if (p.tier === TIER.PERSONAL) return { ok: true };

        if (p.tier === TIER.IMMUTABLE) {
            return { ok: false, suggestArchive: false,
                reason: p.label + ' ni rekodi ya kudumu ya fedha/usalama. Haiwezi kufutwa wala kufichwa — inabaki kwenye historia.' };
        }

        if (p.tier === TIER.SOFT) {
            return { ok: false, suggestArchive: true,
                reason: p.label + ' inaweza kuondolewa kwenye orodha yako, lakini rekodi ya upande mwingine haiguswi.' };
        }

        // BUSINESS
        const escalated = typeof p.guard === 'function' ? !!p.guard(data) : false;
        if (!escalated && p.deletableWhenClean) {
            return { ok: true }; // mf. bidhaa isiyowahi kuuzwa
        }
        return { ok: false, suggestArchive: true,
            reason: p.label + ' ni rekodi ya biashara' +
                (escalated ? ' yenye muamala/historia inayohusiana' : '') + '. Haiwezi kufutwa — unaweza kuiweka kwenye Kumbukumbu.' };
    }

    /* ============================================================
     * 5) VITENDO (kwa menyu ya nukta tatu)
     * ============================================================ */
    function getRecordActions(collection, data, uid) {
        const p = policyFor(collection);
        const acts = [{ key: 'view', label: 'Tazama Maelezo', icon: 'eye' }];
        const archived = isArchived(data, uid);

        if (p.tier !== TIER.IMMUTABLE) {
            if (archived) acts.push({ key: 'restore', label: 'Rejesha', icon: 'refresh' });
            else acts.push({ key: 'archive', label: 'Weka kwenye Kumbukumbu', icon: 'archive' });
        } else {
            acts.push({ key: 'history', label: 'Historia', icon: 'clock' });
        }

        if (canDeleteRecord(collection, data).ok) {
            acts.push({ key: 'delete', label: 'Futa', icon: 'trash', danger: true });
        }
        return acts;
    }

    /* ============================================================
     * 6) VITENDO HALISI (Firestore)
     * ============================================================ */
    function uidNow() { return (skh.currentUser && skh.currentUser.uid) || null; }
    function nowIso() { return new Date().toISOString(); }

    async function readDoc(collection, id) {
        const ref = skh.doc(skh.db, collection, id);
        const snap = await skh.getDoc(ref);
        return { ref: ref, data: (snap && snap.exists && snap.exists()) ? (snap.data() || {}) : null };
    }

    /** Audit trail — hakuna kinachopotea kimya. */
    async function writeAudit(collection, id, action, extra) {
        try {
            const uid = uidNow();
            await skh.addDoc(skh.collection(skh.db, 'activity_logs'), Object.assign({
                type: 'LIFECYCLE_' + String(action).toUpperCase(),
                collectionName: collection,
                recordId: id,
                actorId: uid,
                actorName: (skh.currentUser && (skh.currentUser.displayName || skh.currentUser.email)) || '',
                at: nowIso()
            }, extra || {}));
        } catch (e) { /* audit isizuie kitendo cha mtumiaji */ }
    }

    /**
     * archiveRecord — huweka kumbukumbu bila kupoteza chochote.
     * Chat/conversations hutumia per-user map (`archived: {uid:true}`)
     * ili kuendana na mfumo ULIOPO (34-chat-core.js).
     */
    async function archiveRecord(collection, id, opts) {
        opts = opts || {};
        const uid = uidNow();
        const p = policyFor(collection);
        const got = await readDoc(collection, id);
        if (!got.data) return { ok: false, error: 'Rekodi haipo.' };

        if (!canArchiveRecord(collection, got.data, uid)) {
            return { ok: false, error: p.label + ' haiwezi kuwekwa kumbukumbu.' };
        }

        const patch = {};
        if (p.userMap) {
            // per-user (kama chat): usiguse upande wa mwenzako
            const map = Object.assign({}, got.data[p.userMap] || {});
            map[uid] = true;
            patch[p.userMap] = map;
        } else {
            patch.archived = true;
            patch.archivedAt = nowIso();
            patch.archivedBy = uid;
            patch.archiveReason = opts.reason || 'user_action';
        }
        await skh.updateDoc(got.ref, patch);
        await writeAudit(collection, id, 'archive', { reason: opts.reason || 'user_action' });
        return { ok: true };
    }

    /** restoreRecord — hurejesha; taarifa za archive zinabaki kwenye audit. */
    async function restoreRecord(collection, id) {
        const uid = uidNow();
        const p = policyFor(collection);
        const got = await readDoc(collection, id);
        if (!got.data) return { ok: false, error: 'Rekodi haipo.' };

        const patch = {};
        if (p.userMap) {
            const map = Object.assign({}, got.data[p.userMap] || {});
            delete map[uid];
            patch[p.userMap] = map;
        } else {
            patch.archived = false;
            patch.restoredAt = nowIso();
            patch.restoredBy = uid;
        }
        await skh.updateDoc(got.ref, patch);
        await writeAudit(collection, id, 'restore', {});
        return { ok: true };
    }

    /** softDeleteRecord — ficha kwa mtumiaji huyu tu; rekodi ibaki. */
    async function softDeleteRecord(collection, id) {
        const uid = uidNow();
        const got = await readDoc(collection, id);
        if (!got.data) return { ok: false, error: 'Rekodi haipo.' };
        const map = Object.assign({}, got.data.deletedForUser || {});
        map[uid] = true;
        await skh.updateDoc(got.ref, { deletedForUser: map, deletedAt: nowIso() });
        await writeAudit(collection, id, 'soft_delete', {});
        return { ok: true };
    }

    /** hardDeleteRecord — HUTUMIKA TU pale canDeleteRecord().ok ni kweli. */
    async function hardDeleteRecord(collection, id) {
        const got = await readDoc(collection, id);
        if (!got.data) return { ok: true }; // tayari haipo
        const verdict = canDeleteRecord(collection, got.data);
        if (!verdict.ok) return { ok: false, error: verdict.reason, suggestArchive: verdict.suggestArchive };
        await writeAudit(collection, id, 'delete', { snapshotTitle: got.data.title || got.data.name || '' });
        await skh.deleteDoc(got.ref);
        return { ok: true };
    }

    /* ============================================================
     * 7) KIINGILIO KIMOJA CHA UI — hapa ndipo kila kitufe cha
     * "Futa" kwenye SokoHai kinapaswa kupitia.
     * ============================================================ */
    async function requestDelete(collection, id, opts) {
        opts = opts || {};
        const p = policyFor(collection);
        const got = await readDoc(collection, id);
        if (!got.data) { skhToast('Rekodi haipo tena.', 'info'); return { ok: false }; }

        const verdict = canDeleteRecord(collection, got.data);
        const name = opts.title || got.data.title || got.data.name || p.label;

        // (a) Inaruhusiwa kufutwa kabisa
        if (verdict.ok) {
            const ok = await skhConfirm( 'Kitendo hiki kitaondoa "' + name + '" kwenye akaunti yako.',
                { title: 'Futa taarifa?', okText: 'Futa', cancelText: 'Ghairi' });
            if (!ok) return { ok: false, cancelled: true };
            const r = await hardDeleteRecord(collection, id);
            skhToast(r.ok ? 'Imefutwa.' : (r.error || 'Imeshindikana.'), r.ok ? 'success' : 'error');
            if (r.ok && typeof opts.onDone === 'function') opts.onDone('delete');
            return r;
        }

        // (b) Immutable — hakuna njia
        if (!verdict.suggestArchive) {
            await skhConfirm(verdict.reason, { title: 'Haiwezi kufutwa', okText: 'Nimeelewa', cancelText: null });
            return { ok: false, blocked: true };
        }

        // (c) Pendekeza kumbukumbu badala ya kufuta
        const goArchive = await skhConfirm(
            verdict.reason + '\n\nUnaweza kuiweka kwenye Kumbukumbu — itaondoka kwenye orodha yako lakini historia ibaki salama.',
            { title: 'Hii ni rekodi ya biashara', okText: 'Weka kwenye Kumbukumbu', cancelText: 'Ghairi' });
        if (!goArchive) return { ok: false, cancelled: true };

        const r = policyFor(collection).tier === TIER.SOFT
            ? await archiveRecord(collection, id, { reason: 'user_hide' })
            : await archiveRecord(collection, id, { reason: 'user_action' });
        skhToast(r.ok ? 'Imewekwa kwenye Kumbukumbu.' : (r.error || 'Imeshindikana.'), r.ok ? 'success' : 'error');
        if (r.ok && typeof opts.onDone === 'function') opts.onDone('archive');
        return r;
    }

    /* ============================================================
     * 8) BULK ACTIONS
     * ============================================================ */
    async function bulkAction(action, items, opts) {
        opts = opts || {};
        const list = (items || []).filter(Boolean);
        if (!list.length) { skhToast('Hujachagua chochote.', 'info'); return { ok: false }; }

        const verb = action === 'delete' ? 'kuvifuta' : (action === 'restore' ? 'kuvirejesha' : 'kuviweka kwenye Kumbukumbu');
        const ok = await skhConfirm('Umechagua vitu ' + list.length + '. Una uhakika unataka ' + verb + '?',
            { title: action === 'delete' ? 'Futa vilivyochaguliwa' : 'Thibitisha',
              okText: 'Ndiyo, endelea', cancelText: 'Ghairi' });
        if (!ok) return { ok: false, cancelled: true };

        skhBusy(true, 'Inashughulikia…');
        let done = 0, skipped = 0, failed = 0;
        for (const it of list) {
            try {
                let r;
                if (action === 'archive') r = await archiveRecord(it.collection, it.id, { reason: 'bulk' });
                else if (action === 'restore') r = await restoreRecord(it.collection, it.id);
                else {
                    r = await hardDeleteRecord(it.collection, it.id);
                    if (!r.ok && r.suggestArchive) { // shusha kwa usalama
                        r = await archiveRecord(it.collection, it.id, { reason: 'bulk_fallback' });
                        if (r.ok) skipped++;
                    }
                }
                if (r && r.ok) done++; else failed++;
            } catch (e) { failed++; }
        }
        skhBusy(false);
        let msg = 'Vimekamilika: ' + done;
        if (skipped) msg += ' · Vilivyowekwa kumbukumbu badala ya kufutwa: ' + skipped;
        if (failed) msg += ' · Vilivyoshindikana: ' + failed;
        skhToast(msg, failed ? 'info' : 'success', 4200);
        if (typeof opts.onDone === 'function') opts.onDone();
        return { ok: true, done, skipped, failed };
    }

    /* ============================================================
     * 9) VICHUJIO VYA MAONESHO (Active / Archived)
     * ============================================================ */
    function isHiddenForUser(data, uid) {
        if (!data) return false;
        if (data.deletedForUser && typeof data.deletedForUser === 'object' && uid) {
            if (data.deletedForUser[uid]) return true;
        }
        return false;
    }

    /** filterByView — 'active' | 'archived' | 'all' */
    function filterByView(items, view, uid) {
        const me = uid || uidNow();
        const arr = Array.isArray(items) ? items : [];
        return arr.filter(function (it) {
            const d = it || {};
            if (isHiddenForUser(d, me)) return false;
            const a = isArchived(d, me);
            if (view === 'archived') return a;
            if (view === 'active') return !a;
            return true;
        });
    }

    /* ============================================================
     * 10) TOKENS — token ikitumika HAIFUTWI
     * ============================================================ */
    async function markTokenUsed(collection, id, info) {
        info = info || {};
        const got = await readDoc(collection || 'delivery_tokens', id);
        if (!got.data) return { ok: false, error: 'Token haipo.' };
        const st = String(got.data.status || '').toLowerCase();
        if (st === 'used') return { ok: false, error: 'Token hii tayari imetumika.' };
        if (st === 'expired') return { ok: false, error: 'Token hii imeisha muda.' };
        await skh.updateDoc(got.ref, {
            status: 'USED',
            usedAt: nowIso(),
            usedBy: info.usedBy || uidNow(),
            usedFor: info.usedFor || '',
            orderId: info.orderId || got.data.orderId || null,
            transportId: info.transportId || got.data.transportId || null
        });
        await writeAudit(collection || 'delivery_tokens', id, 'token_used', info);
        return { ok: true };
    }

    /* ============================================================
     * 11) EXPORTS
     * ============================================================ */
    const API = {
        TIER: TIER,
        RECORD_POLICY: RECORD_POLICY,
        policyFor: policyFor,
        canDeleteRecord: canDeleteRecord,
        canArchiveRecord: canArchiveRecord,
        getRecordLifecycle: getRecordLifecycle,
        getRecordActions: getRecordActions,
        isArchived: isArchived,
        isHiddenForUser: isHiddenForUser,
        filterByView: filterByView,
        archiveRecord: archiveRecord,
        restoreRecord: restoreRecord,
        softDeleteRecord: softDeleteRecord,
        hardDeleteRecord: hardDeleteRecord,
        requestDelete: requestDelete,
        bulkAction: bulkAction,
        markTokenUsed: markTokenUsed,
        writeAudit: writeAudit
    };

    window.skhLifecycle = API;
    skh.lifecycle = API;

    // Njia fupi zinazotumika na UI popote kwenye SokoHai
    window.skhRequestDelete = requestDelete;
    window.skhArchiveRecord = archiveRecord;
    window.skhRestoreRecord = restoreRecord;
    window.skhBulkAction = bulkAction;
    window.skhCanDelete = canDeleteRecord;
})();
