/* Additive Product Upload data contract.
 * This module normalizes new structured seller data into the existing product
 * record. It does not create a new collection or replace product identity. */
const TEXT_TYPES = new Set(['text', 'number', 'boolean', 'single_select', 'multi_select', 'measurement']);
const SELECTOR_TYPES = new Set(['color', 'button', 'dropdown', 'image', 'swatch', 'text']);
const STATUS = new Set(['ACTIVE', 'INACTIVE', 'DRAFT']);
const text = value => String(value == null ? '' : value).trim();
const cleanList = value => Array.isArray(value) ? value.filter(Boolean) : [];
const idPart = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const stableId = (prefix, value, index = 0) => `${prefix}_${idPart(value) || index + 1}`;

function normalizeAttribute(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const name = text(raw.name || raw.key || raw.label);
  if (!name) return null;
  const type = TEXT_TYPES.has(text(raw.type).toLowerCase()) ? text(raw.type).toLowerCase() : 'text';
  const value = raw.value === undefined ? (raw.values ?? '') : raw.value;
  return {
    id: text(raw.id) || stableId('attr', name, index),
    name,
    value,
    type,
    source: text(raw.source) || 'SELLER',
    categoryId: text(raw.categoryId) || undefined,
    subcategoryId: text(raw.subcategoryId || raw.subCategoryId) || undefined,
    display: raw.display !== false,
    filterable: raw.filterable === true,
    filterKey: text(raw.filterKey) || idPart(name)
  };
}

function normalizeAttributes(value) {
  const source = Array.isArray(value) ? value : (value && typeof value === 'object' ? Object.entries(value).map(([name, v]) => ({ name, value: v })) : []);
  return source.map(normalizeAttribute).filter(Boolean);
}

function normalizeFilterValue(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (value && typeof value === 'object' && value.value !== undefined) return normalizeFilterValue(value.value);
  const out = text(value);
  return out ? out : undefined;
}

function normalizeFilters(existing, attributes = []) {
  const filters = {};
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    Object.entries(existing).forEach(([key, value]) => { const v = normalizeFilterValue(value); if (v !== undefined) filters[key] = v; });
  }
  attributes.filter(a => a.filterable && a.value !== '' && a.value != null).forEach(a => {
    const v = normalizeFilterValue(a.value);
    if (v !== undefined) filters[a.filterKey || idPart(a.name)] = v;
  });
  return filters;
}

function normalizeOptionValue(raw, optionName, index = 0) {
  const source = raw && typeof raw === 'object' ? raw : { value: raw };
  const value = text(source.value ?? source.label ?? source.name);
  if (!value) return null;
  const images = cleanList(source.images || source.imageRefs || source.image).map(text).filter(Boolean);
  return {
    id: text(source.id) || stableId('optv', `${optionName}-${value}`, index),
    value,
    label: text(source.label) || value,
    images,
    availability: text(source.availability) || 'available',
    disabled: source.disabled === true
  };
}

function normalizeOption(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const name = text(raw.name || raw.key || raw.label);
  if (!name) return null;
  const requested = text(raw.selectorType || raw.selector || 'button').toLowerCase();
  const selectorType = SELECTOR_TYPES.has(requested) ? requested : 'button';
  const values = cleanList(raw.values || raw.options).map((v, i) => normalizeOptionValue(v, name, i)).filter(Boolean);
  if (!values.length) return null;
  return {
    id: text(raw.id) || stableId('option', name, index),
    name,
    selectorType,
    source: text(raw.source) || 'SELLER',
    values,
    required: raw.required === true,
    display: raw.display !== false
  };
}

function normalizeOptions(value) {
  return cleanList(value).map(normalizeOption).filter(Boolean);
}

function normalizeVariant(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const variantId = text(raw.variantId || raw.id);
  const options = raw.options && typeof raw.options === 'object' ? Object.fromEntries(Object.entries(raw.options).map(([k, v]) => [text(k), text(v)]).filter(([k, v]) => k && v)) : {};
  if (!variantId && !Object.keys(options).length) return null;
  const images = cleanList(raw.images || raw.imageRefs || raw.image).map(text).filter(Boolean);
  const status = STATUS.has(text(raw.status).toUpperCase()) ? text(raw.status).toUpperCase() : 'ACTIVE';
  return {
    ...raw,
    variantId: variantId || stableId('variant', Object.values(options).join('-'), index),
    options,
    images,
    status,
    available: raw.available !== false && status === 'ACTIVE',
    sku: text(raw.sku) || undefined,
    barcode: text(raw.barcode) || undefined,
    unitId: text(raw.unitId) || undefined,
    inventoryKey: text(raw.inventoryKey) || undefined,
    price: raw.price === undefined || raw.price === '' ? undefined : Number(raw.price),
    stock: raw.stock === undefined || raw.stock === '' ? undefined : Number(raw.stock)
  };
}

function normalizeFeatures(value) {
  const source = Array.isArray(value) ? value : (value && typeof value === 'object' ? Object.entries(value).map(([name, v]) => ({ name, value: v })) : []);
  return source.map((raw, index) => {
    if (!raw || typeof raw !== 'object') return null;
    const name = text(raw.name || raw.label);
    if (!name) return null;
    return { id: text(raw.id) || stableId('feature', name, index), name, value: raw.value === undefined ? true : raw.value, observable: raw.observable !== false, images: cleanList(raw.images || raw.imageRefs || raw.image).map(text).filter(Boolean), source: text(raw.source) || 'SELLER' };
  }).filter(Boolean);
}

function normalizeAdditionalInfo(value) {
  const source = Array.isArray(value) ? value : (value && typeof value === 'object' ? Object.entries(value).map(([name, value]) => ({ name, value })) : []);
  return source.map((raw, index) => {
    if (!raw || typeof raw !== 'object') return null;
    const name = text(raw.name || raw.label);
    if (!name || raw.value === undefined || raw.value === '') return null;
    return { id: text(raw.id) || stableId('info', name, index), name, value: raw.value, source: text(raw.source) || 'SELLER', display: raw.display !== false };
  }).filter(Boolean);
}

function normalizeProductUploadData(product = {}) {
  const attributes = normalizeAttributes(product.attributes);
  const options = normalizeOptions(product.options);
  const variants = cleanList(product.variantsStructured || product.variantCombinations || product.variants).map(normalizeVariant).filter(Boolean);
  const features = normalizeFeatures(product.features);
  const additionalInfo = normalizeAdditionalInfo(product.additionalInfo || product.others);
  const normalized = {};
  if (attributes.length) normalized.attributes = attributes;
  const filters = normalizeFilters(product.filters, attributes);
  if (Object.keys(filters).length) normalized.filters = filters;
  if (options.length) normalized.options = options;
  if (variants.length) normalized.variantsStructured = variants;
  if (features.length) normalized.features = features;
  if (additionalInfo.length) normalized.additionalInfo = additionalInfo;
  return normalized;
}

function resolveVariantImages(product = {}, variant = {}) {
  const explicit = cleanList(variant.images || variant.imageRefs).map(text).filter(Boolean);
  if (explicit.length) return explicit;
  const optionImages = [];
  const selected = variant.options || {};
  (product.options || []).forEach(option => {
    const selectedValue = text(selected[option.name]);
    const match = (option.values || []).find(v => v.value === selectedValue || v.label === selectedValue);
    if (match) optionImages.push(...cleanList(match.images));
  });
  if (optionImages.length) return [...new Set(optionImages)];
  return cleanList(product.images || product.image).map(text).filter(Boolean);
}

export { TEXT_TYPES, SELECTOR_TYPES, normalizeAttribute, normalizeAttributes, normalizeFilters, normalizeOption, normalizeOptions, normalizeVariant, normalizeFeatures, normalizeAdditionalInfo, normalizeProductUploadData, resolveVariantImages };
