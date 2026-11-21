'use strict';
/* [R-18 2026-11-20] One server-side answer to "may this product still be sold?".
 * Used by every money/sale path that reads a product (order price check -> orderWalletPay and
 * PesaPal settlement, pesapalCheckout pre-check, auction bids, live session products), so a buyer
 * holding an old link or calling the database/API directly cannot buy an archived, deleted,
 * suspended or admin-removed listing. Reads only; never changes or deletes the product (history and
 * past orders stay intact). Legacy products without these fields stay sellable. */
const BLOCKED_STATUS = ['archived', 'deleted', 'suspended', 'inactive', 'removed'];

function low(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

/** Returns '' when the product may be sold, otherwise a stable reason code. */
function productUnsellableReason(p) {
    if (!p || typeof p !== 'object') return 'product_missing';
    if (p.deleted === true || p.isDeleted === true || p.permanentlyDeleted === true) return 'product_deleted';
    if (p.archivedAt || p.archived === true || low(p.publicationStatus) === 'archived') return 'product_archived';
    if (low(p.publicationStatus) === 'draft') return 'product_draft';
    if (BLOCKED_STATUS.indexOf(low(p.status)) !== -1) return 'product_' + low(p.status);
    if (p.adminHidden === true || low(p.moderationStatus) === 'removed') return 'product_removed_by_admin';
    if (p.suspended === true) return 'product_suspended';
    return '';
}

module.exports = { productUnsellableReason, BLOCKED_STATUS };
