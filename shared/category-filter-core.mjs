// [REMEDIATION 2026-11 R4] One canonical category identity, end to end.
//
// Seller form → saved product → taxonomy → buyer filter → search all resolve a
// category to ONE canonical id (CAT-xx). Legacy labels reach it only through the
// explicit, reviewed table in shared/taxonomy-legacy-mapping.js (projected into
// category-identity.mjs). A label with no reviewed mapping is reported as
// UNMAPPED and keeps matching only itself — it is never guessed.
import identity from './category-identity.mjs';

const norm = v => String(v == null ? '' : v).normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const byId = new Map(identity.categories.map(c => [c.id, c]));
const byName = new Map(identity.categories.map(c => [norm(c.displayName), c.id]));
const legacyByNorm = new Map(Object.entries(identity.mappings).map(([k, v]) => [norm(k), v]));
const legacyLabelsById = {};
Object.entries(identity.mappings).forEach(([label, id]) => { (legacyLabelsById[id] = legacyLabelsById[id] || []).push(label); });

export const CANONICAL_CATEGORIES = identity.categories;

/* CAT-xx | canonical display name | reviewed legacy label → CAT-xx, else null. */
export function canonicalCategoryId(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return null;
    const up = raw.toUpperCase();
    if (/^CAT-\d{2}$/.test(up) && byId.has(up)) return up;
    const n = norm(raw);
    return byName.get(n) || legacyByNorm.get(n) || null;
}

export function categoryInfo(value) {
    const id = canonicalCategoryId(value);
    const c = id ? byId.get(id) : null;
    return c ? { id: c.id, displayName: c.displayName, kind: c.kind, legacyLabels: (legacyLabelsById[c.id] || []).slice() }
             : { id: null, displayName: String(value == null ? '' : value), kind: null, legacyLabels: [], unmapped: true };
}

/* Every stored `category` value that means the selected category.
   Firestore `in` accepts ≤ 30 values; the list here is at most a handful. */
export function categoryFilterValues(active) {
    const raw = String(active == null ? '' : active).trim();
    if (!raw) return { values: [], canonicalId: null, unmapped: false };
    const id = canonicalCategoryId(raw);
    if (!id) return { values: [raw], canonicalId: null, unmapped: true };
    const values = [raw, id].concat(legacyLabelsById[id] || []);
    const seen = new Set();
    return { values: values.filter(v => { const k = String(v); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 30), canonicalId: id, unmapped: false };
}

/* Client-side check that mirrors the query. */
export function categoryMatches(itemCategory, active) {
    if (!active || active === 'Zote') return true;
    const a = canonicalCategoryId(active), b = canonicalCategoryId(itemCategory);
    if (a && b) return a === b;
    return norm(itemCategory) === norm(active);
}

/* Sub-categories a buyer can filter by: canonical leaves of the category first,
   then legacy sub-category names (de-duplicated). Nothing is invented. */
export function buyerSubcategories(active, legacySubs) {
    const id = canonicalCategoryId(active);
    const out = [], seen = new Set();
    [].concat((id && identity.productLeaves[id]) || [], legacySubs || []).forEach(s => {
        const k = norm(s); if (!k || seen.has(k)) return; seen.add(k); out.push(s);
    });
    return out;
}

/* Taxonomy quality report over a list of category values (products, filters). */
export function categoryCoverage(values) {
    const rows = {};
    (values || []).forEach(v => {
        const key = String(v == null ? '' : v).trim() || '(empty)';
        const r = rows[key] || (rows[key] = { value: key, count: 0, canonicalId: canonicalCategoryId(key) });
        r.count++;
    });
    const list = Object.values(rows);
    return {
        total: (values || []).length,
        distinct: list.length,
        canonical: list.filter(r => /^CAT-\d{2}$/.test(r.value)),
        legacyMapped: list.filter(r => r.canonicalId && !/^CAT-\d{2}$/.test(r.value)),
        unmapped: list.filter(r => !r.canonicalId)
    };
}

/* The buyer's product-category list = the seller form's list
   (shared/product-taxonomy-bridge.mjs getSellerCategoryOptions): canonical
   product categories first, then legacy-only labels with no reviewed mapping.
   A legacy label that maps to a canonical id is represented by that id. */
export function buyerProductCategories(legacyNames) {
    const out = [];
    identity.categories.forEach(c => {
        if ((identity.productLeaves[c.id] || []).length) out.push({ value: c.id, label: c.displayName, canonicalId: c.id, source: 'CANONICAL' });
    });
    (legacyNames || []).forEach(n => {
        const id = canonicalCategoryId(n);
        if (id && out.some(o => o.canonicalId === id)) return;
        if (out.some(o => o.value === n)) return;
        out.push({ value: n, label: n, canonicalId: id || null, source: 'LEGACY_COMPATIBILITY' });
    });
    return out;
}

/* Legacy sub-category names of every legacy label that shares the category id. */
export function legacySubcategoriesFor(active, advancedCategories) {
    const adv = advancedCategories || {};
    const id = canonicalCategoryId(active);
    const labels = id ? [active].concat(legacyLabelsById[id] || []) : [active];
    const out = [];
    labels.forEach(l => { const s = adv[l] && adv[l].subcategories; if (s) Object.keys(s).forEach(k => { if (!out.includes(k)) out.push(k); }); });
    return out;
}

export function categoryLabel(value) {
    const id = canonicalCategoryId(value);
    if (id && /^CAT-\d{2}$/i.test(String(value).trim())) return byId.get(id).displayName;
    return String(value == null ? '' : value);
}
