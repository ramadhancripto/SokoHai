/**
 * SokoHai — Group Soko: biashara ya pamoja (cooperative trading group)  [R13-B 2026-11]
 *
 * NOT a group chat and NOT a second marketplace. A Group Soko is a governance + accounting layer:
 *   members & roles, capital contributions (records), proposals & votes, supplier purchases with
 *   separation of duties, an append-only ledger, and reports (P&L, payables, member shares).
 * Its products are ordinary SokoHai listings tagged by the server (groupSokoId + groupOwnership
 * 'owned' | 'consignment'), so they use the existing catalog, search, cart, orders, inventory,
 * Business OS (branches, stock transfers, POS) and SokoPay escrow for CUSTOMER payments.
 *
 * MONEY BOUNDARY: SokoHai does NOT hold members' capital. Capital entries are records of money
 * the group keeps in its own account (bank/mobile money); each needs confirmation by someone
 * other than the person who recorded it. Order escrow is never used as a capital account.
 *
 * SEPARATION OF DUTIES (purchases): the requester cannot receive, the receiver cannot inspect,
 * and payment is approved by a treasurer who neither received nor inspected the goods.
 */
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const REGION = 'europe-west1';
const db = () => admin.firestore();
const FV = () => admin.firestore.FieldValue;

const ROLES = ['chair', 'treasurer', 'storekeeper', 'auditor', 'member'];
const PROPOSAL_TYPES = ['purchase', 'expense', 'role', 'distribution', 'rule'];
const METHODS = ['cash', 'bank', 'mobile_money', 'other'];
const clean = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const gid = (v) => { const s = String(v || ''); if (!s || s.length > 128 || s.indexOf('/') !== -1) throw new HttpsError('invalid-argument', 'id_si_sahihi'); return s; };
const money = (v) => { const n = Math.round(Number(v)); if (!Number.isFinite(n) || n <= 0 || n > 1e12) throw new HttpsError('invalid-argument', 'kiasi_si_sahihi'); return n; };
const now = () => new Date().toISOString();

async function ctx(req, groupId, needRoles) {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const gref = db().doc('group_soko/' + gid(groupId));
    const g = await gref.get();
    if (!g.exists) throw new HttpsError('not-found', 'group_haipo');
    const G = g.data() || {};
    if (G.status !== 'active') throw new HttpsError('failed-precondition', 'group_imefungwa');
    const ms = await gref.collection('members').doc(req.auth.uid).get();
    const me = ms.exists ? (ms.data() || {}) : null;
    if (!me || me.status !== 'active') throw new HttpsError('permission-denied', 'si_mwanachama');
    if (needRoles && needRoles.indexOf(me.role) === -1) throw new HttpsError('permission-denied', 'jukumu_halitoshi:' + needRoles.join('|'));
    return { gref, G, me, uid: req.auth.uid };
}
async function activeMembers(gref) { return (await gref.collection('members').where('status', '==', 'active').get()).docs.map(d => d.data()); }
async function ledger(t, gref, entry) {
    const ref = gref.collection('ledger').doc();
    t.set(ref, Object.assign({ createdAt: now() }, entry));
    return ref.id;
}
async function notifyMembers(gref, G, title, body, extra, exceptUid) {
    const ms = await activeMembers(gref);
    for (const m of ms) {
        if (m.uid === exceptUid) continue;
        try { await db().collection('notifications').add(Object.assign({ userId: m.uid, title: clean(G.name + ': ' + title, 140), body: clean(body, 500), createdAt: now(), read: false, source: 'server', type: 'group_soko', groupSokoId: gref.id }, extra || {})); } catch (e) { /* */ }
    }
}

exports.groupSokoCreate = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const d = req.data || {}, uid = req.auth.uid;
    const us = await db().doc('users/' + uid).get();
    if (!us.exists) throw new HttpsError('failed-precondition', 'akaunti_haipo');
    const u = us.data() || {};
    if (u.accountStatus === 'suspended' || u.isSuspended) throw new HttpsError('permission-denied', 'akaunti_imesimamishwa');
    const name = clean(d.name, 80);
    if (name.length < 3) throw new HttpsError('invalid-argument', 'jina_linahitajika');
    const quorumPct = Math.min(100, Math.max(51, Math.round(Number(d.quorumPct) || 51)));
    const ownershipBasis = ['capital', 'equal', 'agreed'].indexOf(d.ownershipBasis) !== -1 ? d.ownershipBasis : 'capital';
    const gref = db().collection('group_soko').doc();
    const t0 = now();
    const batch = db().batch();
    batch.set(gref, { name, purpose: clean(d.purpose, 500), status: 'active', createdBy: uid, createdAt: t0, updatedAt: t0,
        rules: { quorumPct, ownershipBasis, agreedShares: {} }, memberCount: 1, memberUids: [uid],
        moneyBoundary: 'records_only_sokopay_does_not_hold_capital', businessId: null });
    batch.set(gref.collection('members').doc(uid), { uid, name: clean(u.fullName || u.displayName || 'Mwanachama', 80), role: 'chair', status: 'active', joinedAt: t0, invitedBy: uid });
    await batch.commit();
    return { ok: true, groupId: gref.id };
});

exports.groupSokoInvite = onCall({ region: REGION }, async (req) => {
    const d = req.data || {};
    const { gref, G, uid } = await ctx(req, d.groupId, ['chair']);
    const target = gid(d.uid);
    const ts = await db().doc('users/' + target).get();
    if (!ts.exists) throw new HttpsError('not-found', 'mtumiaji_hayupo');
    const mref = gref.collection('members').doc(target);
    const ex = await mref.get();
    if (ex.exists && (ex.data() || {}).status === 'active') return { ok: true, already: true };
    // New members always start as 'member'; other roles need a vote (proposal type 'role').
    await mref.set({ uid: target, name: clean((ts.data() || {}).fullName || 'Mwanachama', 80), role: 'member', status: 'invited', invitedBy: uid, invitedAt: now() });
    await db().collection('notifications').add({ userId: target, title: 'Mwaliko wa Group Soko', body: 'Umealikwa kujiunga na ' + G.name + '.', type: 'group_soko_invite', groupSokoId: gref.id, createdAt: now(), read: false, source: 'server' });
    return { ok: true };
});

exports.groupSokoAccept = onCall({ region: REGION }, async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'login');
    const gref = db().doc('group_soko/' + gid((req.data || {}).groupId));
    const mref = gref.collection('members').doc(req.auth.uid);
    await db().runTransaction(async (t) => {
        const g = await t.get(gref), m = await t.get(mref);
        if (!g.exists || (g.data() || {}).status !== 'active') throw new HttpsError('not-found', 'group_haipo');
        if (!m.exists || (m.data() || {}).status !== 'invited') throw new HttpsError('failed-precondition', 'hakuna_mwaliko');
        t.update(mref, { status: 'active', joinedAt: now() });
        t.update(gref, { memberCount: FV().increment(1), memberUids: FV().arrayUnion(req.auth.uid), updatedAt: now() });
    });
    return { ok: true };
});

/* Capital: a RECORD of money the group holds in its own account. Pending until a treasurer or
 * chair who is neither the recorder nor the contributor confirms it. */
exports.groupSokoCapitalRecord = onCall({ region: REGION }, async (req) => {
    const d = req.data || {};
    const { gref, me, uid } = await ctx(req, d.groupId);
    const member = d.memberUid ? gid(d.memberUid) : uid;
    if (member !== uid && ['treasurer', 'chair'].indexOf(me.role) === -1) throw new HttpsError('permission-denied', 'jukumu_halitoshi:treasurer|chair');
    const ms = await gref.collection('members').doc(member).get();
    if (!ms.exists || (ms.data() || {}).status !== 'active') throw new HttpsError('failed-precondition', 'si_mwanachama');
    const ref = gref.collection('capital').doc();
    await ref.set({ memberUid: member, memberName: (ms.data() || {}).name || '', amount: money(d.amount), method: METHODS.indexOf(d.method) !== -1 ? d.method : 'other',
        reference: clean(d.reference, 120), recordedBy: uid, status: 'pending', createdAt: now() });
    return { ok: true, capitalId: ref.id };
});
exports.groupSokoCapitalConfirm = onCall({ region: REGION }, async (req) => {
    const d = req.data || {};
    const { gref, uid } = await ctx(req, d.groupId, ['treasurer', 'chair']);
    const cref = gref.collection('capital').doc(gid(d.capitalId));
    const decision = d.decision === 'reject' ? 'rejected' : 'confirmed';
    await db().runTransaction(async (t) => {
        const c = await t.get(cref);
        if (!c.exists) throw new HttpsError('not-found', 'mchango_haupo');
        const C = c.data() || {};
        if (C.status !== 'pending') throw new HttpsError('failed-precondition', 'tayari_' + C.status);
        if (C.recordedBy === uid || C.memberUid === uid) throw new HttpsError('permission-denied', 'mtu_mwingine_athibitishe');
        t.update(cref, { status: decision, confirmedBy: uid, confirmedAt: now(), note: clean(d.note, 200) || null });
        if (decision === 'confirmed') await ledger(t, gref, { kind: 'capital_in', amount: C.amount, memberUid: C.memberUid, ref: cref.id, method: C.method, createdBy: uid });
    });
    return { ok: true, status: decision };
});

exports.groupSokoPropose = onCall({ region: REGION }, async (req) => {
    const d = req.data || {};
    const { gref, G, uid } = await ctx(req, d.groupId);
    const type = PROPOSAL_TYPES.indexOf(d.type) !== -1 ? d.type : null;
    if (!type) throw new HttpsError('invalid-argument', 'aina_si_sahihi');
    const title = clean(d.title, 140);
    if (title.length < 3) throw new HttpsError('invalid-argument', 'kichwa_kinahitajika');
    const det = d.details || {};
    const p = { type, title, description: clean(d.description, 1000), createdBy: uid, status: 'open', votes: {}, yes: 0, no: 0, createdAt: now() };
    if (type === 'purchase') {
        const items = (Array.isArray(det.items) ? det.items : []).slice(0, 50).map(i => ({ name: clean(i.name, 120), qty: money(i.qty), unitCost: money(i.unitCost) }));
        if (!items.length) throw new HttpsError('invalid-argument', 'ongeza_bidhaa');
        p.details = { supplierName: clean(det.supplierName, 120), supplierId: det.supplierId ? gid(det.supplierId) : null, ownership: det.ownership === 'consignment' ? 'consignment' : 'owned', items };
        p.amount = items.reduce((a, i) => a + i.qty * i.unitCost, 0);
    } else if (type === 'expense' || type === 'distribution') {
        p.amount = money(d.amount); p.details = { category: clean(det.category, 60), payee: clean(det.payee, 120) };
    } else if (type === 'role') {
        if (ROLES.indexOf(det.role) === -1) throw new HttpsError('invalid-argument', 'jukumu_si_sahihi');
        const ms = await gref.collection('members').doc(gid(det.uid)).get();
        if (!ms.exists || (ms.data() || {}).status !== 'active') throw new HttpsError('failed-precondition', 'si_mwanachama');
        p.details = { uid: det.uid, role: det.role };
    } else if (type === 'rule') {
        const quorumPct = Math.min(100, Math.max(51, Math.round(Number(det.quorumPct) || G.rules.quorumPct)));
        const shares = {}; let sum = 0;
        for (const [k, v] of Object.entries(det.agreedShares || {})) { const n = Number(v); if (n > 0) { shares[gid(k)] = n; sum += n; } }
        if (Object.keys(shares).length && Math.round(sum) !== 100) throw new HttpsError('invalid-argument', 'hisa_ziwe_100');
        p.details = { quorumPct, ownershipBasis: ['capital', 'equal', 'agreed'].indexOf(det.ownershipBasis) !== -1 ? det.ownershipBasis : G.rules.ownershipBasis, agreedShares: shares };
    }
    const ref = gref.collection('proposals').doc();
    await ref.set(p);
    await notifyMembers(gref, G, 'Pendekezo jipya', title, { proposalId: ref.id }, uid);
    return { ok: true, proposalId: ref.id };
});

/* One vote per active member. Decided as soon as YES (or NO) reaches the quorum of ACTIVE members. */
exports.groupSokoVote = onCall({ region: REGION }, async (req) => {
    const d = req.data || {};
    const { gref, G, uid } = await ctx(req, d.groupId);
    const vote = d.vote === 'no' ? 'no' : (d.vote === 'yes' ? 'yes' : null);
    if (!vote) throw new HttpsError('invalid-argument', 'kura_si_sahihi');
    const pref = gref.collection('proposals').doc(gid(d.proposalId));
    const n = (await activeMembers(gref)).length;
    const need = Math.max(1, Math.ceil(n * (G.rules.quorumPct || 51) / 100));
    let out = null;
    await db().runTransaction(async (t) => {
        const s = await t.get(pref);
        if (!s.exists) throw new HttpsError('not-found', 'pendekezo_halipo');
        const P = s.data() || {};
        if (P.status !== 'open') throw new HttpsError('failed-precondition', 'pendekezo_' + P.status);
        if (P.votes && P.votes[uid]) throw new HttpsError('failed-precondition', 'umeshapiga_kura');
        const yes = (P.yes || 0) + (vote === 'yes' ? 1 : 0), no = (P.no || 0) + (vote === 'no' ? 1 : 0);
        const status = yes >= need ? 'approved' : (no >= need || no > n - need ? 'rejected' : 'open');
        t.update(pref, { ['votes.' + uid]: vote, yes, no, status, quorumNeeded: need, decidedAt: status === 'open' ? null : now() });
        out = { status, yes, no, need };
    });
    if (out.status !== 'open') await notifyMembers(gref, G, out.status === 'approved' ? 'Pendekezo limekubaliwa' : 'Pendekezo limekataliwa', 'Kura: ' + out.yes + ' ndiyo, ' + out.no + ' hapana.', { proposalId: pref.id });
    return Object.assign({ ok: true }, out);
});

/* Carry out an approved proposal. Money proposals are executed by the treasurer. */
exports.groupSokoExecute = onCall({ region: REGION }, async (req) => {
    const d = req.data || {};
    const c = await ctx(req, d.groupId);
    const pref = c.gref.collection('proposals').doc(gid(d.proposalId));
    let result = null;
    await db().runTransaction(async (t) => {
        const s = await t.get(pref);
        if (!s.exists) throw new HttpsError('not-found', 'pendekezo_halipo');
        const P = s.data() || {};
        if (P.status !== 'approved') throw new HttpsError('failed-precondition', 'pendekezo_halijakubaliwa');
        const moneyType = ['purchase', 'expense', 'distribution'].indexOf(P.type) !== -1;
        if (moneyType && c.me.role !== 'treasurer' && c.me.role !== 'chair') throw new HttpsError('permission-denied', 'jukumu_halitoshi:treasurer|chair');
        if (!moneyType && c.me.role !== 'chair') throw new HttpsError('permission-denied', 'jukumu_halitoshi:chair');
        if (P.type === 'purchase') {
            const pr = c.gref.collection('purchases').doc();
            t.set(pr, { proposalId: pref.id, supplierName: P.details.supplierName, supplierId: P.details.supplierId, ownership: P.details.ownership, items: P.details.items,
                total: P.amount, status: 'ordered', requestedBy: P.createdBy, orderedBy: c.uid, createdAt: now() });
            result = { purchaseId: pr.id };
        } else if (P.type === 'expense') {
            await ledger(t, c.gref, { kind: 'expense', amount: P.amount, category: P.details.category, payee: P.details.payee, ref: pref.id, createdBy: c.uid });
        } else if (P.type === 'distribution') {
            await ledger(t, c.gref, { kind: 'distribution', amount: P.amount, ref: pref.id, createdBy: c.uid, note: 'Mgawanyo wa faida kulingana na hisa (rekodi)' });
        } else if (P.type === 'role') {
            t.update(c.gref.collection('members').doc(P.details.uid), { role: P.details.role, roleSetAt: now(), roleProposalId: pref.id });
        } else if (P.type === 'rule') {
            t.update(c.gref, { 'rules.quorumPct': P.details.quorumPct, 'rules.ownershipBasis': P.details.ownershipBasis, 'rules.agreedShares': P.details.agreedShares, updatedAt: now() });
        }
        t.update(pref, { status: 'executed', executedBy: c.uid, executedAt: now() });
    });
    return Object.assign({ ok: true }, result || {});
});

/* Purchase steps with separation of duties:
 *   receive  — storekeeper/chair, not the requester
 *   inspect  — auditor/chair/member, not the receiver (quality check; failed -> 'rejected')
 *   pay      — treasurer, not the receiver nor the inspector; writes the ledger payment */
exports.groupSokoPurchaseStep = onCall({ region: REGION }, async (req) => {
    const d = req.data || {};
    const c = await ctx(req, d.groupId);
    const ref = c.gref.collection('purchases').doc(gid(d.purchaseId));
    const step = String(d.step || '');
    await db().runTransaction(async (t) => {
        const s = await t.get(ref);
        if (!s.exists) throw new HttpsError('not-found', 'ununuzi_haupo');
        const P = s.data() || {};
        if (step === 'receive') {
            if (P.status !== 'ordered') throw new HttpsError('failed-precondition', 'hatua_si_sahihi:' + P.status);
            if (['storekeeper', 'chair'].indexOf(c.me.role) === -1) throw new HttpsError('permission-denied', 'jukumu_halitoshi:storekeeper|chair');
            if (c.uid === P.requestedBy) throw new HttpsError('permission-denied', 'aliyeomba_asipokee');
            t.update(ref, { status: 'received', receivedBy: c.uid, receivedAt: now(), receiveNote: clean(d.note, 300) || null });
        } else if (step === 'inspect') {
            if (P.status !== 'received') throw new HttpsError('failed-precondition', 'hatua_si_sahihi:' + P.status);
            if (c.uid === P.receivedBy) throw new HttpsError('permission-denied', 'aliyepokea_asikague');
            const okQ = d.qualityOk !== false;
            t.update(ref, { status: okQ ? 'inspected' : 'rejected', inspectedBy: c.uid, inspectedAt: now(), qualityOk: okQ, inspectNote: clean(d.note, 300) || null,
                stockEntry: okQ ? 'pending_business_os' : null });
        } else if (step === 'pay') {
            if (P.status !== 'inspected') throw new HttpsError('failed-precondition', 'hatua_si_sahihi:' + P.status);
            if (c.me.role !== 'treasurer') throw new HttpsError('permission-denied', 'jukumu_halitoshi:treasurer');
            if (c.uid === P.receivedBy || c.uid === P.inspectedBy) throw new HttpsError('permission-denied', 'mtu_huyo_huyo_hawezi_kulipa');
            const pref = clean(d.paymentRef, 120);
            if (pref.length < 3) throw new HttpsError('invalid-argument', 'kumbukumbu_ya_malipo');
            t.update(ref, { status: 'paid', paidBy: c.uid, paidAt: now(), paymentRef: pref });
            await ledger(t, c.gref, { kind: 'purchase_payment', amount: P.total, ref: ref.id, supplierName: P.supplierName, paymentRef: pref, createdBy: c.uid });
        } else throw new HttpsError('invalid-argument', 'hatua_si_sahihi');
    });
    return { ok: true };
});

/* Tag a member's listing as a Group Soko product (owned stock or consignment from a supplier).
 * Only the server writes these fields (firestore.rules). */
exports.groupSokoAttachProduct = onCall({ region: REGION }, async (req) => {
    const d = req.data || {};
    const c = await ctx(req, d.groupId, ['chair', 'storekeeper']);
    const pref = db().doc('products/' + gid(d.productId));
    const ps = await pref.get();
    if (!ps.exists) throw new HttpsError('not-found', 'bidhaa_haipo');
    const p = ps.data() || {};
    const owner = await c.gref.collection('members').doc(String(p.userId || '_')).get();
    if (!owner.exists || (owner.data() || {}).status !== 'active') throw new HttpsError('permission-denied', 'mmiliki_wa_tangazo_si_mwanachama');
    if (p.groupSokoId && p.groupSokoId !== c.gref.id) throw new HttpsError('failed-precondition', 'tayari_kwenye_group_nyingine');
    const ownership = d.ownership === 'consignment' ? 'consignment' : 'owned';
    await pref.update({ groupSokoId: c.gref.id, groupSokoName: c.G.name, groupOwnership: ownership, consignmentSupplier: ownership === 'consignment' ? clean(d.supplierName, 120) : null });
    await c.gref.collection('products').doc(pref.id).set({ productId: pref.id, ownerUid: p.userId, ownership, attachedBy: c.uid, attachedAt: now() });
    return { ok: true };
});

/* Report: ledger totals, payables, sales of the group's listings (completed orders), P&L and
 * member shares by the agreed basis. Numbers only from records; nothing is estimated. */
exports.groupSokoReport = onCall({ region: REGION }, async (req) => {
    const d = req.data || {};
    const c = await ctx(req, d.groupId);
    const L = (await c.gref.collection('ledger').get()).docs.map(x => x.data());
    const sum = k => L.filter(e => e.kind === k).reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const purchases = (await c.gref.collection('purchases').get()).docs.map(x => x.data());
    const payables = purchases.filter(p => ['received', 'inspected'].indexOf(p.status) !== -1).reduce((a, p) => a + (p.total || 0), 0);
    const gp = (await c.gref.collection('products').get()).docs.map(x => x.data());
    const pset = new Set(gp.map(p => p.productId)), owners = [...new Set(gp.map(p => p.ownerUid))];
    let sales = 0, orders = 0;
    for (const owner of owners.slice(0, 50)) {
        const q = await db().collection('orders').where('sellerId', '==', owner).where('status', '==', 'completed').limit(1000).get();
        for (const o of q.docs) {
            const O = o.data() || {};
            let amt = 0;
            if (pset.has(String(O.productId || ''))) amt = Number(O.amount) || 0;
            else if (Array.isArray(O.items)) for (const i of O.items) { if (pset.has(String(i.productId || i.itemId || i.id || ''))) amt += (Number(i.lineTotal) || (Number(i.price || i.unitPrice) || 0) * (Number(i.qty || i.quantity) || 1)); }
            if (amt > 0) { sales += amt; orders++; }
        }
    }
    const members = await activeMembers(c.gref);
    const capitalBy = {}; L.filter(e => e.kind === 'capital_in').forEach(e => { capitalBy[e.memberUid] = (capitalBy[e.memberUid] || 0) + e.amount; });
    const totalCap = Object.values(capitalBy).reduce((a, b) => a + b, 0);
    const basis = (c.G.rules || {}).ownershipBasis || 'capital';
    const shares = members.map(m => ({ uid: m.uid, name: m.name, role: m.role, capital: capitalBy[m.uid] || 0,
        sharePct: basis === 'equal' ? Math.round(10000 / members.length) / 100
            : basis === 'agreed' ? Number(((c.G.rules || {}).agreedShares || {})[m.uid] || 0)
            : (totalCap > 0 ? Math.round((capitalBy[m.uid] || 0) * 10000 / totalCap) / 100 : 0) }));
    const expenses = sum('expense'), paid = sum('purchase_payment'), distributed = sum('distribution');
    return { ok: true, currency: 'TZS', basis, capital: totalCap, purchasesPaid: paid, payables, expenses, sales, completedOrders: orders,
        profit: sales - paid - expenses, distributed, cashOnRecord: totalCap + sales - paid - expenses - distributed, shares,
        moneyBoundary: 'SokoHai inahifadhi kumbukumbu tu; mitaji iko kwenye akaunti ya group yenyewe.' };
});
