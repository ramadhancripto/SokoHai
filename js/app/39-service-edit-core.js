/* ==== js/app/39-service-edit-core.js ====                        [PART 4 FOLLOW-UP 2026-11-24]
 * Mantiki SAFI (bila DOM) ya KUHARIRI huduma iliyopo:
 *   - kuamua mmiliki (guard),
 *   - kuchukua thamani zilizohifadhiwa kwa ajili ya kujaza fomu ile ile ya kuunda huduma,
 *   - kuhakiki sehemu za lazima,
 *   - kutengeneza patch ya update ambayo HAIWEZI kubadilisha hali ya uchapishaji (status /
 *     publicationStatus), umiliki (userId) wala tarehe ya kuundwa (createdAt).
 *
 * Hakuna fomu ya pili na hakuna collection mpya: hii ni hesabu tu inayotumiwa na
 * `submitSokohaiService` (19-roles.js) na fomu ILIYOPO `#serviceForm`.
 * Data ya zamani (section, priceType, filters) inasomwa kwa upole.
 */

export const SERVICE_GROUPS = ['physical', 'online', 'food', 'rental'];
const PRICE_EXEMPT = ['quotation_required', 'negotiable'];

/* Mmiliki pekee anayeweza kuhariri / kubadili hali ya huduma.
 * Hati isiyo na mmiliki (data ya zamani isiyo ya kawaida) haikubaliwi kuhaririwa
 * kwa njia ya client — mtoa huduma hawezi kudai hati isiyo yake. */
export function serviceEditGuard(doc, uid) {
    if (!doc || !doc.id) return { ok: false, error: 'missing' };
    if (!uid) return { ok: false, error: 'auth' };
    const owner = String(doc.userId || doc.ownerId || '');
    if (!owner) return { ok: false, error: 'no_owner' };
    if (owner !== uid) return { ok: false, error: 'forbidden' };
    return { ok: true, error: '' };
}

/* Thamani za kujaza fomu (zote kutoka hati halisi; hakuna kubuni). */
export function serviceEditSnapshot(doc) {
    doc = doc || {};
    const filters = {};
    if (doc.filters && typeof doc.filters === 'object' && !Array.isArray(doc.filters)) {
        Object.keys(doc.filters).forEach(k => {
            const v = doc.filters[k];
            if (v !== null && v !== undefined && String(v).trim() !== '') filters[k] = String(v);
        });
    }
    const priceNum = Number(doc.price);
    return {
        id: String(doc.id || ''),
        title: String(doc.title || doc.serviceName || ''),
        groupType: String(doc.groupType || doc.section || ''),
        category: String(doc.category || ''),
        subCategory: String(doc.subCategory || ''),
        price: Number.isFinite(priceNum) && doc.price !== null && doc.price !== '' && doc.price !== undefined ? String(priceNum) : '',
        pricingModel: String(doc.pricingModel || doc.priceType || 'fixed'),
        availabilityStatus: String(doc.availabilityStatus || ''),
        travelAvailable: doc.travelAvailable === true,
        negotiationAllowed: doc.negotiationAllowed !== false,
        description: String(doc.description || ''),
        location: String(doc.location || ''),
        countryCode: String(doc.countryCode || ''),
        region: String(doc.region || ''),
        image: String(doc.image || (Array.isArray(doc.images) ? (doc.images[0] || '') : '') || ''),
        filters: filters,
        /* hali ya uchapishaji: inasomwa kwa maonyesho tu, HAIJUMUISHWI kwenye patch */
        publicationLabel: (function () {
            const st = String(doc.publicationStatus || doc.status || '').toLowerCase();
            if (['draft', 'suspended', 'archived', 'inactive'].indexOf(st) !== -1) return 'suspended';
            return 'published';
        })()
    };
}

/* Sehemu za lazima — kanuni zile zile zinazotumika wakati wa kuunda huduma. */
export function validateServiceUpdate(values) {
    const errors = [];
    if (!values) return ['no_values'];
    const v = values;
    if (!String(v.title || '').trim()) errors.push('title');
    if (SERVICE_GROUPS.indexOf(String(v.groupType || '').toLowerCase()) === -1) errors.push('groupType');
    if (!String(v.category || '').trim()) errors.push('category');
    if (!String(v.subCategory || '').trim()) errors.push('subCategory');
    if (!String(v.description || '').trim()) errors.push('description');
    if (!String(v.location || '').trim()) errors.push('location');
    const model = String(v.pricingModel || 'fixed').toLowerCase();
    const price = Number(v.price);
    if (PRICE_EXEMPT.indexOf(model) === -1 && !(Number.isFinite(price) && price > 0)) errors.push('price');
    return errors;
}

/* Patch ya update. HAIWEZI kuwa na: id, userId, createdAt, status, publicationStatus. */
export function buildServiceUpdate(values, existing, nowIso) {
    const errors = validateServiceUpdate(values);
    if (errors.length) return { ok: false, errors: errors, patch: null };
    existing = existing || {};
    const v = values;
    const num = Number(v.price);
    const patch = {
        title: String(v.title).trim(),
        groupType: String(v.groupType).toLowerCase(),
        category: String(v.category).trim(),
        subCategory: String(v.subCategory).trim(),
        description: String(v.description).trim(),
        location: String(v.location).trim(),
        price: Number.isFinite(num) && num > 0 ? num : 0,
        pricingModel: String(v.pricingModel || 'fixed').toLowerCase(),
        availabilityStatus: String(v.availabilityStatus || ''),
        travelAvailable: v.travelAvailable === true,
        negotiationAllowed: v.negotiationAllowed !== false,
        filters: (v.filters && typeof v.filters === 'object' && !Array.isArray(v.filters)) ? v.filters : {},
        updatedAt: String(nowIso || new Date().toISOString())
    };
    /* Eneo: tumia lililochaguliwa; la sivyo lile lililohifadhiwa (haliondolewi kimya kimya). */
    if (v.countryCode) { patch.countryCode = String(v.countryCode); patch.region = String(v.region || ''); }
    else if (existing.countryCode) { patch.countryCode = String(existing.countryCode); patch.region = String(existing.region || ''); }
    else if (existing.region && !v.region) { patch.region = String(existing.region); }
    /* Picha: mpya ikiwa imepakiwa; la sivyo iliyopo inabaki. */
    if (v.image) patch.image = String(v.image);
    else if (existing.image) patch.image = String(existing.image);
    return { ok: true, errors: [], patch: patch };
}

/* Kizuizi cha kutuma mara mbili kwa haraka (double click / kurudia):
 *  - `busy` = ombi linaendelea,
 *  - `lastOkAt` ndani ya dirisha fupi = limeshashaamuliwa mafanikio. */
export function serviceSubmitGate(state, nowMs, windowMs) {
    const win = Number.isFinite(windowMs) ? windowMs : 2500;
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    if (!state) return { blocked: false, reason: '' };
    if (state.busy) return { blocked: true, reason: 'busy' };
    if (state.lastOkAt && (now - state.lastOkAt) < win) return { blocked: true, reason: 'recent_success' };
    return { blocked: false, reason: '' };
}

/* Ujumbe wa kosa la update — wa kweli, bila kudai mafanikio. */
export function serviceUpdateErrorText(err) {
    const code = String((err && (err.code || err.message)) || '');
    if (/permission-denied/i.test(code)) return 'Hauna ruhusa kubadilisha huduma hii.';
    if (/not-found/i.test(code)) return 'Huduma hii haipo tena.';
    if (/unavailable|network|offline|timeout/i.test(code)) return 'Mtandao umeshindwa — mabadiliko HAYAKUHIFADHIWA. Jaribu tena.';
    return 'Imeshindwa kuhifadhi mabadiliko' + (code ? ': ' + code : '.');
}
