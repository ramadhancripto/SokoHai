/**
 * SokoHai — System settings audit trail
 * [REPAIR 2026-10 M7] Phase 6.
 *
 * The Super Admin still flips fees and module switches from the existing admin
 * panel (js/app/09-feed-announcements.js toggleSys, js/app/12-sys-modes.js
 * toggleSysMode). Firestore rules require each browser write to system/config
 * to carry lastChangedBy == the caller's uid. This trigger records every
 * change (key, before, after, who) in admin_audit_log, which nobody can edit.
 * Writes made by adminSetEscrowPolicy are already audited there and skipped.
 */
'use strict';

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

const REGION = 'europe-west1';
const META = ['lastChangedBy', 'lastChangedAt', 'lastChangedVia'];

function flat(obj, prefix, out, depth) {
    out = out || {};
    Object.keys(obj || {}).forEach(k => {
        if (!prefix && META.indexOf(k) !== -1) return;
        const v = obj[k];
        const key = prefix ? prefix + '.' + k : k;
        if (v && typeof v === 'object' && !Array.isArray(v) && depth < 2 && !(v instanceof Date) && typeof v.toDate !== 'function') flat(v, key, out, depth + 1);
        else out[key] = v === undefined ? null : v;
    });
    return out;
}

/* Pure: list of {key, before, after} between two system docs. */
function diffConfig(before, after) {
    const a = flat(before || {}, '', {}, 0), b = flat(after || {}, '', {}, 0);
    const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).sort();
    const changes = [];
    keys.forEach(k => {
        const x = a.hasOwnProperty(k) ? a[k] : null, y = b.hasOwnProperty(k) ? b[k] : null;
        if (JSON.stringify(x) !== JSON.stringify(y)) changes.push({ key: k, before: x, after: y });
    });
    return changes.slice(0, 100);
}

async function auditSystemChange(docId, before, after) {
    if (after && after.lastChangedVia === 'adminSetEscrowPolicy'
        && (!before || before.lastChangedAt !== after.lastChangedAt)) return { skipped: 'audited_by_callable' };
    const changes = diffConfig(before, after);
    if (!changes.length) return { skipped: 'no_changes' };
    const actor = (after && after.lastChangedBy) || (before && !after ? 'unknown (deleted)' : 'unknown');
    await admin.firestore().collection('admin_audit_log').add({
        action: 'SYSTEM_CONFIG_CHANGED',
        actorUid: String(actor), actorEmail: null, actorRole: 'superAdmin',
        target: { kind: 'system', id: docId },
        details: { changes, via: (after && after.lastChangedVia) || null },
        createdAt: new Date().toISOString()
    });
    return { ok: true, count: changes.length };
}

/* [REPAIR 2026-10] Admin-only collections edited from the browser
 * (announcements = Home ads managed by admin, adminMedia = media library).
 * Rules require a fresh lastChangedBy stamp on every browser write; server
 * writes (ads delivery metrics) do not touch lastChangedAt and are skipped. */
async function auditStampedChange(collection, docId, before, after) {
    const deleted = !!before && !after;
    const stamped = after && after.lastChangedAt && (!before || before.lastChangedAt !== after.lastChangedAt);
    if (!deleted && !stamped) return { skipped: 'not_a_browser_admin_write' };
    const changes = deleted ? [{ key: '(document)', before: 'exists', after: 'deleted' }] : diffConfig(before, after);
    if (!changes.length) return { skipped: 'no_changes' };
    const actor = deleted ? ((before && before.lastChangedBy) ? before.lastChangedBy + ' (last editor)' : 'unknown') : after.lastChangedBy;
    await admin.firestore().collection('admin_audit_log').add({
        action: collection === 'announcements' ? 'ANNOUNCEMENT_CHANGED' : 'ADMIN_MEDIA_CHANGED',
        actorUid: String(actor || 'unknown'), actorEmail: null, actorRole: 'admin',
        target: { kind: collection, id: docId },
        details: { changes: changes.filter(c => ['updatedAt'].indexOf(c.key) === -1).slice(0, 60), deleted },
        createdAt: new Date().toISOString()
    });
    return { ok: true, count: changes.length };
}
exports.announcementsAudit = onDocumentWritten({ document: 'announcements/{docId}', region: REGION }, async (event) => {
    const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
    const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
    await auditStampedChange('announcements', event.params.docId, before, after);
});
exports.adminMediaAudit = onDocumentWritten({ document: 'adminMedia/{docId}', region: REGION }, async (event) => {
    const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
    const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
    await auditStampedChange('adminMedia', event.params.docId, before, after);
});

exports.systemConfigAudit = onDocumentWritten({ document: 'system/{docId}', region: REGION }, async (event) => {
    const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
    const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
    await auditSystemChange(event.params.docId, before, after);
});

/* [PHASE 9 B-18] Signed admin edits from the browser on records that belong to
 * someone else (orders, products, users). Rules demand the signature for those
 * edits and forbid anyone from signing as another person, so a stamp whose
 * author is not the record's owner is an admin action. */
const ADMIN_EDIT = {
    orders:   { action: 'ORDER_CHANGED_BY_ADMIN',   owner: () => null },
    products: { action: 'PRODUCT_CHANGED_BY_ADMIN', owner: (d) => d && d.userId },
    users:    { action: 'USER_CHANGED_BY_ADMIN',    owner: (d, id) => (d && d.uid) || id }
};
async function auditAdminSignedChange(collection, docId, before, after) {
    const cfg = ADMIN_EDIT[collection];
    if (!cfg || !after) return { skipped: 'not_tracked' };
    const stamped = after.lastChangedAt && (!before || before.lastChangedAt !== after.lastChangedAt);
    if (!stamped || !after.lastChangedBy) return { skipped: 'not_signed' };
    const owner = cfg.owner(after, docId);
    if (owner && String(owner) === String(after.lastChangedBy)) return { skipped: 'owner_edit' };
    const changes = diffConfig(before, after).filter(c => ['updatedAt'].indexOf(c.key) === -1).slice(0, 60);
    if (!changes.length) return { skipped: 'no_changes' };
    await admin.firestore().collection('admin_audit_log').add({
        action: cfg.action, actorUid: String(after.lastChangedBy), actorEmail: null, actorRole: 'admin',
        target: { kind: collection.replace(/s$/, ''), id: docId, ownerUid: owner || null },
        details: { changes, via: 'browser' }, createdAt: new Date().toISOString()
    });
    return { ok: true, count: changes.length };
}
const adminEditTrigger = (collection) => onDocumentWritten({ document: collection + '/{docId}', region: REGION }, async (event) => {
    const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
    const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
    await auditAdminSignedChange(collection, event.params.docId, before, after);
});
exports.ordersAdminAudit = adminEditTrigger('orders');
exports.productsAdminAudit = adminEditTrigger('products');
exports.usersAdminAudit = adminEditTrigger('users');

exports._testing = { diffConfig, auditSystemChange, auditStampedChange, auditAdminSignedChange };
