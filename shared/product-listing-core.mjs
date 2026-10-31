/* [PHASE 1/2 — 2026-10-31] Seller listing model (pure, browser + Node).
 *
 * Keeps separate concepts separate on ONE product record:
 *   taxonomy (what it is)       -> category / taxonomy.* (unchanged here)
 *   nature                      -> physical | digital (service = services collection)
 *   salesChannels (where sold)  -> manage_only | marketplace | pos
 *   publicationStatus           -> marketplace only (draft | published | archived)
 *   availabilityStatus          -> derived from stock unless set manually
 *   location                    -> storeId / locationId (POS needs one)
 *   fulfilment                  -> pickup | seller_delivery | sokohai_delivery | digital_delivery
 *   pricing                     -> base price, packs (bigger unit, own price), wholesale tiers (qty breaks)
 *
 * Every function is additive: legacy fields (isOnline, isOffline, wholesalePrice,
 * hasBulkPackaging, bulkUnit, conversionRatio, baseUnit, modeData.tiers) are read
 * and kept; nothing is deleted or renamed.
 */

export const CHANNELS = Object.freeze(['manage_only', 'marketplace', 'pos']);
const txt = v => String(v == null ? '' : v).trim();
const low = v => txt(v).toLowerCase();
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/* ---------- sales channels ---------- */
/** visibility select value (form) -> channels. */
export function channelsFromVisibility(visibility) {
  switch (low(visibility)) {
    case 'manage_only': return ['manage_only'];
    case 'offline_only': return ['pos'];
    case 'online_only': return ['marketplace'];
    case 'hybrid': return ['marketplace', 'pos'];
    default: return null;
  }
}
/** channels -> visibility select value (form). */
export function visibilityFromChannels(channels) {
  const c = normalizeChannels(channels).channels;
  if (c.includes('manage_only')) return 'manage_only';
  if (c.includes('marketplace') && c.includes('pos')) return 'hybrid';
  return c.includes('pos') ? 'offline_only' : 'online_only';
}
export function normalizeChannels(input) {
  const list = [...new Set((Array.isArray(input) ? input : []).map(low).filter(x => CHANNELS.includes(x)))];
  if (!list.length) return { ok: false, error: 'CHANNEL_REQUIRED', channels: [] };
  if (list.includes('manage_only') && list.length > 1) return { ok: false, error: 'MANAGE_ONLY_IS_EXCLUSIVE', channels: ['manage_only'] };
  return { ok: true, channels: CHANNELS.filter(c => list.includes(c)) };
}
/**
 * Channels of an existing (maybe legacy) product.
 *  - explicit salesChannels wins;
 *  - legacy isOnline/isOffline: isOnline !== false -> marketplace (legacy default),
 *    isOffline === true -> pos; both false -> manage_only.
 * Legacy products without any flag stay visible online exactly as today.
 */
export function channelsOf(product) {
  const p = product || {};
  if (Array.isArray(p.salesChannels) && p.salesChannels.length) {
    const n = normalizeChannels(p.salesChannels);
    if (n.ok) return n.channels;
  }
  const online = p.isOnline !== false;
  const offline = p.isOffline === true;
  if (!online && !offline) return ['manage_only'];
  return CHANNELS.filter(c => (c === 'marketplace' && online) || (c === 'pos' && offline));
}
/** Legacy flags that every existing reader understands. */
export function legacyFlagsFor(channels) {
  const c = normalizeChannels(channels).channels;
  return { isOnline: c.includes('marketplace'), isOffline: c.includes('pos') };
}
/** May a POS sale use this product? Only an EXPLICIT channel list can say no (legacy = yes, as today). */
export function posAllowed(product) {
  const p = product || {};
  if (!Array.isArray(p.salesChannels) || !p.salesChannels.length) return true;
  return normalizeChannels(p.salesChannels).channels.includes('pos');
}

/* ---------- POS location safeguard ---------- */
/**
 * New sellers (with a Business) must pick a POS location. Legacy sellers without
 * a Business/Store keep working on the default location with a visible warning.
 */
export function posLocationCheck({ channels, businessId, storeId, locationId } = {}) {
  const c = normalizeChannels(channels).channels;
  if (!c.includes('pos')) return { ok: true, required: false };
  const loc = txt(locationId) || txt(storeId);
  if (loc) return { ok: true, required: true, locationId: loc };
  if (!txt(businessId)) return { ok: true, required: true, locationId: 'default', warning: 'LEGACY_DEFAULT_LOCATION' };
  return { ok: false, required: true, error: 'POS_LOCATION_REQUIRED' };
}

/* ---------- units: ONE registry (shared/canonical-taxonomy-data.js) + legacy labels ---------- */
// Mirrors taxonomy-draft/src/model.mjs UNIT_LEGACY_MAP (a contract test keeps them equal).
// registered=false: the unit id is a PROPOSED registry addition (taxonomy draft),
// not yet in the canonical registry; the legacy label keeps working meanwhile.
export const UNIT_LEGACY_MAP = Object.freeze([
  ['sellerForm.prodBaseUnit', 'Piece', 'piece', 'MAP'],
  ['sellerForm.prodBaseUnit', 'Kg', 'kg', 'MAP'],
  ['sellerForm.prodBaseUnit', 'Gram', 'g', 'MAP'],
  ['sellerForm.prodBaseUnit', 'Litre', 'L', 'MAP'],
  ['sellerForm.prodBaseUnit', 'Ml', 'mL', 'MAP'],
  ['sellerForm.prodBaseUnit', 'Meter', 'm', 'MAP'],
  ['sellerForm.prodBaseUnit', 'Pair', 'pair', 'MAP'],
  ['sellerForm.prodBaseUnit', 'Tablet', 'tablet', 'MAP_NEW_UNIT'],
  ['sellerForm.prodBaseUnit', 'Bottle', 'bottle', 'MAP_NEEDS_CONTENT'],
  ['sellerForm.prodBulkUnit', 'Box', 'box', 'MAP_PER_PRODUCT_CONTENT'],
  ['sellerForm.prodBulkUnit', 'Carton', 'carton', 'MAP_PER_PRODUCT_CONTENT'],
  ['sellerForm.prodBulkUnit', 'Crate', 'crate', 'MAP_PER_PRODUCT_CONTENT'],
  ['sellerForm.prodBulkUnit', 'Sack', 'gunia', 'MAP_PER_PRODUCT_CONTENT'],
  ['sellerForm.prodBulkUnit', 'Bag', 'bag', 'MAP_PER_PRODUCT_CONTENT'],
  ['sellerForm.prodBulkUnit', 'Tray', 'tray', 'MAP_PER_PRODUCT_CONTENT'],
  ['pos.offInvUnit', 'Piece', 'piece', 'MAP'],
  ['pos.offInvUnit', 'Box', 'box', 'MAP_PER_PRODUCT_CONTENT']
].map(([source, legacy, unitId, action]) => Object.freeze({ source, legacy, unitId, action })));
// Ids present in the canonical registry today (shared/canonical-taxonomy-data.js UNIT_REGISTRY).
export const CANONICAL_UNIT_IDS = Object.freeze(['mg', 'g', 'kg', 'ton', 'mL', 'L', 'mm', 'cm', 'm', 'inch', 'ft', 'm2', 'hectare', 'acre', 'piece', 'pair', 'set', 'pack', 'box', 'carton', 'bundle', 'roll']);

/** Legacy label (any source) or unit id -> { unitId, registered, action }. */
export function resolveUnit(value) {
  const v = txt(value);
  if (!v) return { unitId: 'piece', registered: true, action: 'DEFAULT' };
  if (CANONICAL_UNIT_IDS.includes(v)) return { unitId: v, registered: true, action: 'ID' };
  const hit = UNIT_LEGACY_MAP.find(m => low(m.legacy) === low(v)) || UNIT_LEGACY_MAP.find(m => low(m.unitId) === low(v));
  if (hit) return { unitId: hit.unitId, registered: CANONICAL_UNIT_IDS.includes(hit.unitId), action: hit.action };
  return { unitId: null, registered: false, action: 'UNMAPPED', legacy: v };
}

/* ---------- pricing: packs vs wholesale (never mixed) ---------- */
/**
 * pricing.basePrice      price of ONE base unit
 * pricing.packs[]        a bigger selling unit with its own content and price
 *                        (carton of 24 pieces at 20,000) - legacy hasBulkPackaging/bulkUnit/conversionRatio
 * pricing.wholesaleTiers price per BASE unit when buying at least minQty base units
 *                        - legacy wholesalePrice (+ wholesaleMinQty / minimumOrderQuantity) and saleMode 'wholesale' modeData.tiers
 * Tiers from modeData win over the single wholesalePrice (one list, no duplicates).
 */
export function normalizePricing(product) {
  const p = product || {};
  const baseUnit = resolveUnit(p.baseUnit || (p.unitConfig && p.unitConfig.unitId));
  const basePrice = num(p.price);
  const packs = [];
  const content = num(p.conversionRatio != null ? p.conversionRatio : p.pcsPerUnit);
  if ((p.hasBulkPackaging === true || p.pcsPerUnit > 1) && content && content > 1) {
    const packUnit = resolveUnit(p.bulkUnit || p.unitType || 'Box');
    const packPrice = num(p.bulkPrice != null ? p.bulkPrice : p.packPrice);
    packs.push({ unitId: packUnit.unitId, contentQuantity: content, contentUnitId: baseUnit.unitId, price: packPrice && packPrice > 0 ? packPrice : null, priceSource: packPrice ? 'PACK_PRICE' : 'BASE_PRICE_X_CONTENT' });
  }
  let tiers = [];
  const modeTiers = p.saleMode === 'wholesale' && p.modeData && Array.isArray(p.modeData.tiers) ? p.modeData.tiers : [];
  if (modeTiers.length) {
    tiers = modeTiers.map(t => ({ minQty: num(t.minQty), price: num(t.price) })).filter(t => t.minQty > 0 && t.price > 0);
  } else if (num(p.wholesalePrice) > 0) {
    const minQty = num(p.wholesaleMinQty) || num(p.minimumOrderQuantity) || (p.saleMode === 'wholesale' && p.modeData ? num(p.modeData.minQty) : null) || 1;
    tiers = [{ minQty: Math.max(1, minQty), price: num(p.wholesalePrice) }];
  }
  const seen = new Set();
  tiers = tiers.sort((a, b) => a.minQty - b.minQty).filter(t => (seen.has(t.minQty) ? false : seen.add(t.minQty)));
  const issues = [];
  if (basePrice != null && tiers.some(t => t.price > basePrice)) issues.push('WHOLESALE_ABOVE_BASE_PRICE');
  if (!baseUnit.registered) issues.push('BASE_UNIT_NOT_REGISTERED');
  return { basePrice, baseUnitId: baseUnit.unitId, packs, wholesaleTiers: tiers, issues };
}
/** Unit price for qty base units: the best tier that applies, else base price. */
export function unitPriceFor(pricing, qty) {
  const tiers = (pricing && pricing.wholesaleTiers) || [];
  const hit = tiers.filter(t => qty >= t.minQty).pop();
  return hit ? hit.price : pricing.basePrice;
}

/* ---------- fulfilment ---------- */
export function fulfilmentOptions({ nature = 'physical', channels = [], location = null } = {}) {
  const c = normalizeChannels(channels).channels;
  if (!c.includes('marketplace')) return [];
  if (low(nature) === 'digital') return ['digital_delivery'];
  const out = [];
  if (location && location.pickup === true) out.push('pickup');
  out.push('seller_delivery', 'sokohai_delivery');
  return out;
}

/* ---------- dynamic builder steps ---------- */
export const BUILDER_STEPS = Object.freeze(['kind', 'find', 'confirm', 'basic', 'channel', 'location', 'specs', 'price', 'delivery', 'review']);
/** Steps that apply; skipped ones are not counted. Services: no stock locations, no delivery step. */
export function builderSteps({ kind = 'product', nature = 'physical', channels = [] } = {}) {
  const c = normalizeChannels(channels).channels;
  const isSvc = kind === 'service';
  return BUILDER_STEPS.filter(k => {
    if (k === 'delivery') return !isSvc && c.includes('marketplace') && low(nature) === 'physical';
    if (k === 'location') return isSvc || low(nature) === 'physical';
    return true;
  });
}

/* ---------- one write projection ---------- */
/**
 * Additive fields for a product write. Legacy isOnline/isOffline are written
 * from the channels so every existing reader keeps working.
 */
export function listingProjection(product, { visibility } = {}) {
  const p = product || {};
  const fromForm = visibility ? channelsFromVisibility(visibility) : null;
  const channels = fromForm || channelsOf(p);
  const flags = legacyFlagsFor(channels);
  const nature = low(p.productType) === 'digital' ? 'digital' : 'physical';
  return { salesChannels: channels, ...flags, nature, pricing: normalizePricing(p) };
}

/* ---------- business mode -> default sales mode (2026-10-31, UX) ----------
 * Business mode (HYBRID / OFFLINE_ONLY / ONLINE_ONLY / MANAGE_ONLY) lives on the
 * business profile (sellerMode). It only sets the DEFAULT for a new product; each
 * product keeps its own salesChannels, so changing the business mode never
 * rewrites or deletes products. Seller lifecycle (temporary/permanent), product
 * type and condition are separate concepts and are not read here.
 */
export const BUSINESS_MODES = Object.freeze(['HYBRID', 'OFFLINE_ONLY', 'ONLINE_ONLY', 'MANAGE_ONLY']);
export function normalizeBusinessMode(value) {
  const v = txt(value).toUpperCase().replace(/[\s-]+/g, '_');
  if (v === 'HYBRID' || v === 'ONLINE_OFFLINE' || v === 'ONLINE_PLUS_OFFLINE') return 'HYBRID';
  if (v === 'OFFLINE' || v === 'OFFLINE_ONLY') return 'OFFLINE_ONLY';
  if (v === 'ONLINE' || v === 'ONLINE_ONLY') return 'ONLINE_ONLY';
  if (v === 'MANAGE' || v === 'MANAGE_ONLY') return 'MANAGE_ONLY';
  return null;
}
const MODE_TO_VISIBILITY = { HYBRID: 'hybrid', OFFLINE_ONLY: 'offline_only', ONLINE_ONLY: 'online_only', MANAGE_ONLY: 'manage_only' };
/** Default product sales mode for a business (legacy profiles without a mode: hybrid, as the form did). */
export function visibilityForBusinessMode(profile) {
  const p = profile || {};
  const mode = normalizeBusinessMode(p.sellerMode || p.sellMode || p.businessMode);
  return mode ? MODE_TO_VISIBILITY[mode] : 'hybrid';
}

/* ---------- progressive disclosure for the ONE seller form ----------
 * Which groups of the seller form apply to a sales mode, and which fields are
 * required. The form hides groups that do not apply; hidden fields keep their
 * values (switching mode back never loses typed data).
 */
export function sellerFormRules(visibility) {
  const ch = channelsFromVisibility(visibility) || ['marketplace', 'pos'];
  const online = ch.includes('marketplace');
  // Selling price stays required in every mode: stock value, POS and reports use it,
  // and validateProduct + rules expect price > 0 (unchanged data contract).
  return {
    channels: ch,
    groups: { channel: true, what: true, price: true, online, location: true },
    required: [
      'prodName',
      ...(online ? ['prodCategory', 'prodDesc', 'images'] : []),
      'prodPrice',
      'prodStock',
      'prodLocation'
    ],
    optional: ['prodBuyPrice', 'prodBarcode', 'prodWarehouseZone', ...(online ? [] : ['prodCategory'])],
    taxonomy: online ? 'required' : 'optional',
    priceRequired: true
  };
}

/* ---------- duplicate / copy previous product ----------
 * Copies settings a similar product shares; never copies identity or live data:
 * SKU, barcode, stock, reserved stock, variant ids/SKUs/stock, images, IMEI/serials,
 * batch/expiry, sales history, ratings, ids or owner/store fields.
 */
const COPY_FIELDS = ['title', 'name', 'category', 'subCategory', 'subcategory', 'productType', 'condition', 'baseUnit',
  'hasBulkPackaging', 'bulkUnit', 'conversionRatio', 'buyPrice', 'price', 'wholesalePrice', 'lowStockAlert', 'lowStockThreshold',
  'saleMode', 'description', 'location', 'warehouseZone', 'salesChannels', 'isOnline', 'isOffline', 'offlineCategory'];
export function duplicateTemplate(product) {
  const p = product || {};
  const t = {};
  COPY_FIELDS.forEach(k => { if (p[k] !== undefined && p[k] !== null) t[k] = JSON.parse(JSON.stringify(p[k])); });
  if (t.title) t.title = txt(t.title) + ' (nakala)';
  if (t.name) t.name = txt(t.name) + ' (nakala)';
  // Selectors/attributes are copied as a TEMPLATE: values keep their labels, lose images and ids.
  const strip = list => (Array.isArray(list) ? list : []).map(o => {
    const c = JSON.parse(JSON.stringify(o || {}));
    delete c.id; delete c.images;
    if (Array.isArray(c.values)) c.values = c.values.map(v => { const x = typeof v === 'object' && v ? { ...v } : { value: v, label: v }; delete x.id; delete x.images; return x; });
    return c;
  });
  t.options = strip(p.options);
  t.attributes = strip(p.attributes);
  t.features = Array.isArray(p.features) ? JSON.parse(JSON.stringify(p.features)) : [];
  t.copiedFrom = txt(p.id || p.productId) || null;
  t.visibility = visibilityFromChannels(channelsOf(p));
  return t;
}

/* ---------- local draft (per seller, per device) ----------
 * Only plain form fields; never files, photos, stock movements or variant identities.
 */
export const DRAFT_FIELDS = Object.freeze(['prodVisibility', 'prodName', 'prodProductType', 'prodCondition', 'prodPublicationStatus',
  'prodAvailabilityStatus', 'prodCategory', 'prodSubCategory', 'prodOfflineCategory', 'prodBaseUnit', 'prodBarcode', 'prodHasBulk',
  'prodBulkUnit', 'prodConversionRatio', 'prodBuyPrice', 'prodPrice', 'prodWholesalePrice', 'prodStock', 'prodLowStockAlert',
  'prodSaleMode', 'prodDesc', 'prodLocation', 'prodWarehouseZone', 'spbProductSku']);
export function draftKey(uid) { return 'skh_seller_draft_v1_' + (txt(uid) || 'anon'); }
export function draftHasContent(draft) {
  const f = (draft && draft.fields) || {};
  return ['prodName', 'prodPrice', 'prodDesc', 'prodBuyPrice'].some(k => txt(f[k]));
}
