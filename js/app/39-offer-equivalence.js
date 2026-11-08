/* ==== js/app/39-offer-equivalence.js ==== */
// [REMEDIATION 2026-11 R3] Specification-aware seller comparison.
//
// "Linganisha wauzaji" may only put two listings side by side when they are the
// SAME product: same kind (product type / sub-category), same core name, and the
// same value for every specification either listing states — brand, model,
// size, capacity, weight/volume, pack size, condition, variants, …
//
// RULE: a specification that one listing states and the other does not is NOT
// assumed to match. Such pairs are "related" (shown in a separate rail), never
// "equivalent". Category profiles add specifications that MUST be known on both
// sides (e.g. screen size + condition for TVs, weight for rice).
//
// Pure ES module (no DOM / Firebase) so it is unit-tested directly.

const STOP = new Set(['na', 'ya', 'kwa', 'la', 'za', 'wa', 'cha', 'vya', 'ni', 'katika', 'kutoka', 'kama', 'hii', 'hizi',
    'hilo', 'the', 'and', 'for', 'with', 'an', 'of', 'to', 'in', 'bei', 'nafuu', 'offer', 'sale', 'original', 'quality', 'bora', 'safi', 'kali']);
const CONDITION_WORDS = { mpya: 'new', new: 'new', brandnew: 'new', iliyotumika: 'used', used: 'used', mtumba: 'used',
    secondhand: 'used', refurbished: 'refurbished', refurb: 'refurbished', imekarabatiwa: 'refurbished', exuk: 'used', exjapan: 'used' };

// unit → [dimension, factor to the dimension's base unit]
const UNITS = {
    kg: ['weight', 1], kgs: ['weight', 1], kilo: ['weight', 1], kilos: ['weight', 1], g: ['weight', 0.001], gm: ['weight', 0.001],
    gr: ['weight', 0.001], gram: ['weight', 0.001], grams: ['weight', 0.001], gramu: ['weight', 0.001], tani: ['weight', 1000],
    ton: ['weight', 1000], tons: ['weight', 1000], tonne: ['weight', 1000],
    l: ['volume', 1], lt: ['volume', 1], ltr: ['volume', 1], ltrs: ['volume', 1], litre: ['volume', 1], liter: ['volume', 1],
    litres: ['volume', 1], liters: ['volume', 1], lita: ['volume', 1], ml: ['volume', 0.001],
    inch: ['size', 1], inches: ['size', 1], in: ['size', 1], '"': ['size', 1], '″': ['size', 1], inchi: ['size', 1],
    gb: ['capacity', 1], tb: ['capacity', 1024], mb: ['capacity', 1 / 1024],
    mah: ['battery', 1], w: ['power', 1], watt: ['power', 1], watts: ['power', 1], kw: ['power', 1000], hp: ['power', 746],
    v: ['voltage', 1], volt: ['voltage', 1], volts: ['voltage', 1],
    mm: ['length', 0.001], cm: ['length', 0.01], m: ['length', 1], mita: ['length', 1], ft: ['length', 0.3048], futi: ['length', 0.3048],
    pcs: ['pack', 1], pc: ['pack', 1], pieces: ['pack', 1], vipande: ['pack', 1], pack: ['pack', 1], pk: ['pack', 1],
    seater: ['seats', 1], seaters: ['seats', 1], viti: ['seats', 1], cc: ['engine', 1]
};
const UNIT_RE = /(\d+(?:[.,]\d+)?)\s*(kgs?|kilos?|grams?|gramu|gm|gr|g|tani|tons?|tonne|litres?|liters?|ltrs?|lita|lt|l|ml|inches|inchi|inch|in|"|″|gb|tb|mb|mah|kw|hp|watts?|w|volts?|v|mm|cm|mita|m|ft|futi|pieces|pcs|pc|vipande|pack|pk|seaters?|viti|cc)(?![a-z0-9])/gi;
const MULTI_RE = /(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|ltr|lt)(?![a-z0-9])/gi;
const RAM_RE = /(\d+)\s*gb\s*(?:ram)\b|\bram\s*(\d+)\s*gb/gi;

// attribute key (normalised) → dimension
const ATTR_KEYS = {
    brand: 'brand', chapa: 'brand', make: 'brand', manufacturer: 'brand', mtengenezaji: 'brand',
    model: 'model', modeli: 'model', modelnumber: 'model',
    size: 'size', saizi: 'size', ukubwa: 'size', screensize: 'size', screen: 'size', display: 'size',
    capacity: 'capacity', storage: 'capacity', hifadhi: 'capacity', rom: 'capacity', uwezo: 'capacity', internalstorage: 'capacity',
    ram: 'ram', memory: 'ram',
    weight: 'weight', uzito: 'weight', netweight: 'weight',
    volume: 'volume', ujazo: 'volume',
    pack: 'pack', packsize: 'pack', packqty: 'pack', idadi: 'pack', quantityperpack: 'pack', unitsperpack: 'pack',
    unit: 'unit', kipimo: 'unit', baseunit: 'unit',
    condition: 'condition', hali: 'condition', itemcondition: 'condition',
    variety: 'variety', aina: 'variety', mbegu: 'variety', breed: 'variety',
    grade: 'grade', daraja: 'grade',
    material: 'material', malighafi: 'material',
    seats: 'seats', seater: 'seats', viti: 'seats',
    power: 'power', wattage: 'power', voltage: 'voltage', battery: 'battery',
    length: 'length', urefu: 'length', dimensions: 'dimensions', vipimo: 'dimensions',
    color: 'color', colour: 'color', rangi: 'color'
};
// Compared only when both listings state them (a colour choice does not change the product).
const SOFT_DIMS = new Set(['color', 'unit']);

/* Category profiles: specifications that must be KNOWN on both sides before two
   listings may be called the same product. Keyed by canonical id and by legacy
   / sub-category keywords. */
const PROFILES = [
    { id: 'electronics', cats: ['CAT-11', 'CAT-12', 'CAT-13', 'CAT-34'], kw: /electronic|simu|phone|tv|televisheni|laptop|kompyuta|computer|tablet|umeme|appliance|friji|fridge|redio|spika|speaker|camera/i,
      require: ['condition', 'identity'], identityAny: ['model', 'size', 'capacity', 'power'] },
    { id: 'food', cats: ['CAT-01'], kw: /chakula|vyakula|food|vinywaji|drink|mchele|unga|sukari|mafuta ya kupikia|nafaka|maharage|juice|maji ya kunywa/i,
      require: ['quantity'] },
    { id: 'agriculture', cats: ['CAT-02', 'CAT-03'], kw: /kilimo|agri|mbegu|seed|mbolea|fertili|pembejeo|dawa ya wadudu|pesticide|mazao|crop/i,
      require: ['quantity'] },
    { id: 'livestock', cats: ['CAT-04', 'CAT-31'], kw: /mifugo|livestock|kuku|ng'ombe|mbuzi|chakula cha mifugo|feed|pets?/i, require: [] },
    { id: 'furniture', cats: ['CAT-09'], kw: /samani|furniture|fenicha|sofa|kitanda|bed|meza|table|kabati|wardrobe|godoro|mattress/i,
      require: ['identity'], identityAny: ['size', 'seats', 'dimensions', 'length', 'model'] },
    { id: 'fashion', cats: ['CAT-07'], kw: /nguo|mavazi|fashion|viatu|shoe|kiatu|shati|dress|gauni/i, require: ['size'] },
    { id: 'vehicles', cats: ['CAT-14', 'CAT-15'], kw: /gari|magari|vehicle|pikipiki|bajaji|vipuri|spare|tyre|tairi/i,
      require: ['condition', 'identity'], identityAny: ['model', 'engine', 'size'] },
    { id: 'construction', cats: ['CAT-10'], kw: /ujenzi|hardware|cement|saruji|nondo|bati|rangi ya ukuta|paint|mabomba/i,
      require: ['quantity'] }
];

function low(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function normVal(v) { return low(v).replace(/[^a-z0-9.]+/g, ''); }
function num(v) { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; }
function round(n) { return Math.round(n * 10000) / 10000; }

export function profileFor(p) {
    const ids = [p && p.categoryId, p && p.taxonomy && p.taxonomy.categoryId].map(low).filter(Boolean).map(s => s.toUpperCase());
    for (const pr of PROFILES) if (ids.some(id => pr.cats.includes(id))) return pr;
    const text = [p && p.category, p && p.subCategory, p && p.productType].map(low).join(' ');
    for (const pr of PROFILES) if (pr.kw.test(text)) return pr;
    return { id: 'general', require: [] };
}

function parseQuantityValue(dim, raw) {
    // "5kg", "1.5 L", "55 inch", "128GB" given as an attribute value
    UNIT_RE.lastIndex = 0;
    const m = UNIT_RE.exec(String(raw));
    if (m) { const u = UNITS[m[2].toLowerCase()]; const n = num(m[1]); if (u && n !== null) return { dim: u[0], val: String(round(n * u[1])) }; }
    const n = num(raw);
    if (n !== null) return { dim, val: String(round(n)) };
    return { dim, val: normVal(raw) };
}

/* Extract the comparable specification of one listing. */
export function offerSpecs(p) {
    p = p || {};
    const specs = {};
    const put = (dim, val) => { if (val === '' || val == null) return; if (specs[dim] === undefined) specs[dim] = String(val); };
    // 1) structured fields (authoritative)
    if (p.brand) put('brand', normVal(p.brand));
    if (p.model) put('model', normVal(p.model));
    const cond = low(p.condition || p.itemCondition).replace(/[^a-z]/g, '');
    if (cond) put('condition', CONDITION_WORDS[cond] || cond);
    const attrSources = [p.attributes, p.filters, p.specs, p.taxonomy && p.taxonomy.attributeValues];
    attrSources.forEach(src => {
        if (!src || typeof src !== 'object' || Array.isArray(src)) return;
        Object.keys(src).forEach(k => {
            const key = low(k).replace(/^attr[-_]?/, '').replace(/[^a-z]/g, '');
            const dim = ATTR_KEYS[key];
            const v = src[k];
            if (!dim || v == null || typeof v === 'object') return;
            if (dim === 'condition') { const c = low(v).replace(/[^a-z]/g, ''); put('condition', CONDITION_WORDS[c] || c); return; }
            if (['weight', 'volume', 'size', 'capacity', 'ram', 'power', 'voltage', 'length', 'battery', 'pack', 'seats'].includes(dim)) {
                const q = parseQuantityValue(dim, v); put(q.dim, q.val); return;
            }
            put(dim, normVal(v));
        });
    });
    if (p.packSize != null) put('pack', String(num(p.packSize) ?? normVal(p.packSize)));
    if (p.baseUnit) put('unit', normVal(p.baseUnit));

    // 2) title-derived quantities and model codes (fill only what fields did not state)
    let title = low(p.title || p.name || p.itemTitle);
    MULTI_RE.lastIndex = 0;
    title = title.replace(MULTI_RE, (_, cnt, q, u) => {
        const unit = UNITS[u.toLowerCase()]; const n = num(q);
        put('pack', String(Number(cnt)));
        if (unit && n !== null) put(unit[0], String(round(n * unit[1])));
        return ' ';
    });
    RAM_RE.lastIndex = 0;
    title = title.replace(RAM_RE, (_, a, b) => { put('ram', String(Number(a || b))); return ' '; });
    UNIT_RE.lastIndex = 0;
    title = title.replace(UNIT_RE, (_, q, u) => {
        const unit = UNITS[u.toLowerCase()]; const n = num(q);
        if (unit && n !== null) put(unit[0], String(round(n * unit[1])));
        return ' ';
    });
    const core = [], codes = [];
    title.split(/[^a-z0-9À-ɏ]+/).forEach(w => {
        if (!w) return;
        if (CONDITION_WORDS[w]) { put('condition', CONDITION_WORDS[w]); return; }
        if (/\d/.test(w)) { codes.push(w); return; }          // a54, rtx3060, bare "13"
        if (w.length >= 2 && !STOP.has(w)) core.push(w); // keeps 2-letter brands (HP, LG)
    });
    if (codes.length && specs.model === undefined) specs.model = codes.sort().join('+');

    return { specs, core: [...new Set(core)] };
}

function hasQuantity(s) { return ['weight', 'volume', 'pack', 'length'].some(d => s[d] !== undefined); }
function hasIdentity(s, any) { return (any || []).some(d => s[d] !== undefined); }

/* Decide whether b is the SAME product as a (equivalent), a close relative
   (related), or unrelated. Same-seller filtering is the caller's job. */
export function offerEquivalence(a, b) {
    const reasons = [];
    const A = offerSpecs(a), B = offerSpecs(b);
    const typeA = low(a && (a.productTypeId || (a.taxonomy && a.taxonomy.productTypeId) || a.productType));
    const typeB = low(b && (b.productTypeId || (b.taxonomy && b.taxonomy.productTypeId) || b.productType));
    const subA = low(a && a.subCategory), subB = low(b && b.subCategory);
    const sameKind = (typeA && typeB) ? typeA === typeB : !!(subA && subB && subA === subB);
    if (!sameKind) return { equivalent: false, related: false, reasons: ['different_kind'] };

    // core name overlap: ≥ 60 % of the LONGER core (both directions), at least 1 word
    const setB = new Set(B.core);
    const ov = A.core.filter(w => setB.has(w)).length;
    const base = Math.max(A.core.length, B.core.length);
    const need = base <= 2 ? base : Math.ceil(base * 0.6);
    if (!base || ov < Math.max(1, need)) return { equivalent: false, related: ov >= 1, reasons: ['different_name'] };

    // every stated specification must agree; one-sided = unknown, never assumed
    const dims = new Set([...Object.keys(A.specs), ...Object.keys(B.specs)]);
    dims.forEach(d => {
        const x = A.specs[d], y = B.specs[d];
        if (x !== undefined && y !== undefined) { if (x !== y) reasons.push('mismatch:' + d); }
        else if (!SOFT_DIMS.has(d)) reasons.push('missing:' + d);
    });
    // variants: both must offer at least one common option per shared variant name
    const va = variantMap(a), vb = variantMap(b);
    const vKeys = new Set([...Object.keys(va), ...Object.keys(vb)]);
    vKeys.forEach(k => {
        if (!va[k] || !vb[k]) { reasons.push('missing:variant:' + k); return; }
        if (![...va[k]].some(o => vb[k].has(o))) reasons.push('mismatch:variant:' + k);
    });
    // category profile: required knowledge on BOTH sides
    const pr = profileFor(a);
    (pr.require || []).forEach(req => {
        if (req === 'quantity') { if (!hasQuantity(A.specs) || !hasQuantity(B.specs)) reasons.push('required:quantity'); }
        else if (req === 'identity') { if (!hasIdentity(A.specs, pr.identityAny) || !hasIdentity(B.specs, pr.identityAny)) reasons.push('required:identity'); }
        else if (A.specs[req] === undefined || B.specs[req] === undefined) reasons.push('required:' + req);
    });
    return { equivalent: reasons.length === 0, related: true, reasons: [...new Set(reasons)], profile: pr.id };
}

function variantMap(p) {
    const out = {};
    const list = Array.isArray(p && p.variants) ? p.variants : [];
    list.forEach(v => {
        if (!v || !v.name) return;
        const opts = (Array.isArray(v.options) ? v.options : String(v.options || '').split(',')).map(normVal).filter(Boolean);
        const key = normVal(v.name);
        if (key && opts.length && !/^(rangi|color|colour)$/.test(key)) out[key] = new Set(opts);
    });
    return out;
}
