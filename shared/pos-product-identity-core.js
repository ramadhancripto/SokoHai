'use strict';

const crypto = require('crypto');

const text = value => String(value == null ? '' : value).trim();
const keyText = value => text(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function normalizeOptionEntries(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return [];
  const entries = Object.entries(options).map(([name, value]) => [keyText(name), text(value)]).filter(([name, value]) => name && value);
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  const names = new Set();
  if (entries.some(([name]) => names.has(name))) throw new Error('DUPLICATE_VARIANT_OPTION');
  entries.forEach(([name]) => names.add(name));
  return entries;
}

function optionSignature(options) {
  const entries = normalizeOptionEntries(options);
  return entries.map(([name, value]) => `${name}=${keyText(value)}`).join('|');
}

function deterministicVariantId(productId, signature) {
  const product = text(productId);
  const normalized = text(signature);
  if (!product || !normalized) throw new Error('VARIANT_ID_INPUT_INVALID');
  return 'var_' + crypto.createHash('sha256').update(product + '|' + normalized).digest('hex').slice(0, 24);
}

function deterministicInventoryKey(productId, variantId, unitId) {
  return [text(productId), text(variantId) || 'product', text(unitId) || 'default'].join(':');
}

function normalizeDefinitions(definitions) {
  if (!Array.isArray(definitions)) return [];
  return definitions.map(definition => ({
    name: text(definition && definition.name),
    options: [...new Set((Array.isArray(definition && definition.options) ? definition.options : []).map(text).filter(Boolean))]
  })).filter(definition => definition.name && definition.options.length);
}

function validateVariantDefinitions(definitions) {
  const source = Array.isArray(definitions) ? definitions : [];
  const names = new Set();
  const errors = [];
  source.forEach(definition => {
    const name = keyText(definition && definition.name);
    if (name && names.has(name)) errors.push('DUPLICATE_VARIANT_DEFINITION');
    if (name) names.add(name);
    const options = Array.isArray(definition && definition.options) ? definition.options.map(text).filter(Boolean) : [];
    if (options.length !== new Set(options.map(keyText)).size) errors.push('DUPLICATE_VARIANT_OPTION');
  });
  return { ok: errors.length === 0, errors, definitions: normalizeDefinitions(definitions) };
}

function buildVariantCombination(productId, options, input = {}) {
  const signature = optionSignature(options);
  if (!signature) throw new Error('VARIANT_OPTIONS_REQUIRED');
  const variantId = text(input.variantId) || deterministicVariantId(productId, signature);
  if (text(input.variantId) && text(input.variantId) !== deterministicVariantId(productId, signature)) throw new Error('VARIANT_ID_NOT_CANONICAL');
  return {
    variantId,
    productId: text(productId),
    options: Object.fromEntries(normalizeOptionEntries(options)),
    optionSignature: signature,
    sku: text(input.sku) || null,
    barcode: text(input.barcode) || null,
    price: input.price == null ? null : Number(input.price),
    wholesalePrice: input.wholesalePrice == null ? null : Number(input.wholesalePrice),
    unitId: text(input.unitId) || null,
    inventoryKey: deterministicInventoryKey(productId, variantId, input.unitId),
    stock: Number.isSafeInteger(input.stock) && input.stock >= 0 ? input.stock : 0,
    status: text(input.status) || 'ACTIVE'
  };
}

function validateCombinationAgainstDefinitions(definitions, options) {
  const normalized = normalizeOptionEntries(options);
  const allowed = new Map(normalizeDefinitions(definitions).map(definition => [keyText(definition.name), new Set(definition.options.map(keyText))]));
  if (!allowed.size) return { ok: false, error: 'VARIANT_DEFINITIONS_REQUIRED' };
  if (normalized.length !== allowed.size) return { ok: false, error: 'VARIANT_OPTIONS_INCOMPLETE' };
  for (const [name, value] of normalized) {
    if (!allowed.has(name) || !allowed.get(name).has(keyText(value))) return { ok: false, error: 'VARIANT_OPTION_NOT_ALLOWED' };
  }
  return { ok: true };
}

function validateConcreteCombinations(product) {
  const combinations = Array.isArray(product && product.variantCombinations) ? product.variantCombinations : [];
  const variantIds = new Set();
  const skus = new Set();
  for (const combination of combinations) {
    if (!combination || !text(combination.variantId) || !text(combination.sku)) return { ok: false, error: 'VARIANT_COMBINATION_INVALID' };
    if (variantIds.has(combination.variantId)) return { ok: false, error: 'DUPLICATE_VARIANT_ID' };
    if (skus.has(combination.sku)) return { ok: false, error: 'DUPLICATE_SKU' };
    variantIds.add(combination.variantId);
    skus.add(combination.sku);
    if (combination.status && combination.status !== 'ACTIVE' && combination.status !== 'INACTIVE') return { ok: false, error: 'VARIANT_STATUS_INVALID' };
    if (combination.inventoryKey && combination.inventoryKey !== deterministicInventoryKey(product.productId, combination.variantId, combination.unitId)) return { ok: false, error: 'INVENTORY_KEY_NOT_CANONICAL' };
  }
  return { ok: true };
}

function resolveConcreteCombination(product, options) {
  const validation = validateConcreteCombinations(product);
  if (!validation.ok) return validation;
  const signature = optionSignature(options);
  const combinations = Array.isArray(product && product.variantCombinations) ? product.variantCombinations : [];
  const combination = combinations.find(item => item && item.optionSignature === signature || item && optionSignature(item.options) === signature);
  if (!combination) return { ok: false, error: 'VARIANT_COMBINATION_NOT_FOUND' };
  if (combination.status && combination.status !== 'ACTIVE') return { ok: false, error: 'VARIANT_INACTIVE' };
  return { ok: true, combination };
}

function findVariant(product, request) {
  const combinations = Array.isArray(product && product.variantCombinations) ? product.variantCombinations : [];
  const combinationValidation = validateConcreteCombinations(product);
  if (!combinationValidation.ok) return combinationValidation;
  const requestedVariantId = text(request && request.variantId);
  const requestedSku = text(request && request.sku);
  if (!combinations.length) {
    if (requestedVariantId || requestedSku) return { ok: false, error: 'VARIANT_NOT_SUPPORTED' };
    return { ok: true, variant: null };
  }
  if (!requestedVariantId) return { ok: false, error: 'VARIANT_REQUIRED' };
  const variant = combinations.find(item => item && item.variantId === requestedVariantId);
  if (!variant) return { ok: false, error: 'VARIANT_NOT_FOUND' };
  if (requestedSku && requestedSku !== variant.sku) return { ok: false, error: 'SKU_VARIANT_MISMATCH' };
  if (variant.status && variant.status !== 'ACTIVE') return { ok: false, error: 'VARIANT_INACTIVE' };
  return { ok: true, variant };
}

function resolveUnit(product, request) {
  const requestedUnitId = text(request && request.unitId);
  const unitConfig = product && product.unitConfig && typeof product.unitConfig === 'object' ? product.unitConfig : null;
  const configuredUnitId = (unitConfig && text(unitConfig.unitId)) || text(product && product.baseUnit) || null;
  const unitId = requestedUnitId || configuredUnitId || null;
  const unitMode = text(request && request.unitMode);
  if (!['pc', 'unit'].includes(unitMode)) return { ok: false, error: 'UNIT_MODE_UNSUPPORTED' };
  if (requestedUnitId && configuredUnitId && requestedUnitId !== configuredUnitId) return { ok: false, error: 'UNIT_NOT_ALLOWED' };
  if (requestedUnitId && !configuredUnitId && !['piece', 'pc', 'unit'].includes(keyText(requestedUnitId))) return { ok: false, error: 'UNIT_NOT_ALLOWED' };
  const conversion = unitMode === 'unit'
    ? (unitConfig && unitConfig.conversionToBase != null ? Number(unitConfig.conversionToBase) : Number(product && product.pcsPerUnit) || 1)
    : 1;
  if (!Number.isSafeInteger(conversion) || conversion <= 0) return { ok: false, error: 'UNIT_CONVERSION_INVALID' };
  return { ok: true, unitId: unitId || (unitMode === 'pc' ? 'piece' : 'unit'), unitMode, conversion, conversionSource: unitConfig ? unitConfig.conversionSource || 'PRODUCT_UNIT_CONFIG' : 'LEGACY_PCS_PER_UNIT' };
}

function resolveProductIdentity(product, request) {
  if (!product || typeof product !== 'object') return { ok: false, error: 'PRODUCT_NOT_FOUND' };
  const variantResult = findVariant(product, request);
  if (!variantResult.ok) return variantResult;
  const unitResult = resolveUnit(product, request);
  if (!unitResult.ok) return unitResult;
  const variant = variantResult.variant;
  const variantPrice = variant && variant.price != null ? Number(variant.price) : null;
  const variantWholesale = variant && variant.wholesalePrice != null ? Number(variant.wholesalePrice) : null;
  const pricingMode = text(request && request.pricingMode) || 'retail';
  const basePrice = pricingMode === 'wholesale' ? (variantWholesale ?? Number(product.wholesalePrice)) : (variantPrice ?? Number(product.price));
  if (!Number.isFinite(basePrice) || basePrice <= 0) return { ok: false, error: 'PRICE_NOT_AVAILABLE' };
  const stock = variant ? Number(variant.stock) : Number(product.stock);
  if (!Number.isSafeInteger(stock) || stock < 0) return { ok: false, error: 'INVENTORY_NOT_VALID' };
  const variantId = variant ? variant.variantId : null;
  const sku = variant ? variant.sku : text(product.sku) || null;
  return { ok: true, variant, variantId, sku, unit: unitResult, inventoryKey: variant ? (variant.inventoryKey || deterministicInventoryKey(product.productId || request.productId, variantId, unitResult.unitId)) : deterministicInventoryKey(product.productId || request.productId, null, unitResult.unitId), stock, basePrice };
}

module.exports = { normalizeOptionEntries, optionSignature, deterministicVariantId, deterministicInventoryKey, normalizeDefinitions, validateVariantDefinitions, buildVariantCombination, validateCombinationAgainstDefinitions, validateConcreteCombinations, resolveConcreteCombination, findVariant, resolveUnit, resolveProductIdentity, keyText };
