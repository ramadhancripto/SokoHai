/* Phase 1A pure canonical taxonomy read/validation functions. */
const { CATEGORY_REGISTRY, PRODUCT_SUBCATEGORIES, BRANCH_CONTEXT_CLASSIFICATIONS, SERVICE_DOMAINS, OVERLAYS, CLASSIFICATION_STATES, FALLBACK, PROFILE_LIBRARY, CATEGORY_CLASSIFICATIONS, PRODUCT_TYPE_DEFINITIONS, PRODUCT_TYPE_REGISTRY, ATTRIBUTE_REGISTRY, OPTION_GROUP_REGISTRY, OPTION_REGISTRY, FILTER_REGISTRY, FEATURE_REGISTRY, VARIANT_RULE_REGISTRY, UNIT_DEFINITIONS, UNIT_REGISTRY, FALLBACK_DEFINITION } = require('./canonical-taxonomy-data.js');

const byId = new Map(CATEGORY_REGISTRY.map(x => [x.id, x]));
const norm = value => String(value == null ? '' : value).trim();
const stableId = (prefix, value) => `${prefix}-${String(value || '').normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase() || 'UNNAMED'}`;
const categoryId = value => {
  const s = norm(value).toUpperCase();
  if (/^CAT-\d+$/.test(s)) return `CAT-${s.slice(4).padStart(2, '0')}`;
  return s;
};

function getCategory(id) { return byId.get(categoryId(id)) || null; }
function listCategories() { return CATEGORY_REGISTRY.slice(); }
function getSubcategories(id) { return (PRODUCT_SUBCATEGORIES[categoryId(id)] || []).slice(); }
function isServiceDomain(id) { return SERVICE_DOMAINS.includes(categoryId(id)); }
function getProfileLibrary() { return PROFILE_LIBRARY; }
function getCategoryClassification(category) {
  const id = categoryId(category);
  const explicit = CATEGORY_CLASSIFICATIONS[id];
  if (explicit) return explicit;
  const item = getCategory(id);
  if (!item) return null;
  const context = item.kind === 'SERVICE_DOMAIN' ? 'SERVICE' : (item.kind === 'PRODUCT_DOMAIN' ? 'PRODUCT' : null);
  return Object.freeze({ contexts: Object.freeze(context ? [context] : []), productBranches: Object.freeze([]), serviceBranches: Object.freeze([]) });
}
function getCategoryBranches(category, context) {
  const classification = getCategoryClassification(category);
  if (!classification) return [];
  const key = norm(context).toLowerCase() === 'service' ? 'serviceBranches' : 'productBranches';
  return classification[key].slice();
}
function hasCategoryContext(category, context) {
  const classification = getCategoryClassification(category);
  return Boolean(classification && classification.contexts.includes(norm(context).toUpperCase()));
}
function isProductBranch(category, branch) { return getCategoryBranches(category, 'PRODUCT').includes(norm(branch)); }
function isServiceBranch(category, branch) { return getCategoryBranches(category, 'SERVICE').includes(norm(branch)); }
function getCanonicalRegistries() { return { productTypes: PRODUCT_TYPE_REGISTRY, attributes: ATTRIBUTE_REGISTRY, optionGroups: OPTION_GROUP_REGISTRY, options: OPTION_REGISTRY, filters: FILTER_REGISTRY, features: FEATURE_REGISTRY, variantRules: VARIANT_RULE_REGISTRY, units: UNIT_REGISTRY, unitGroups: UNIT_DEFINITIONS }; }
function getDefinitionState(category, subcategory = 'default') {
  const definitions = PRODUCT_TYPE_DEFINITIONS[categoryId(category)];
  if (!definitions) return 'UNSPECIFIED';
  if (definitions[subcategory]) return 'EXPLICIT_BRANCH_DEFINITION';
  if (subcategory !== 'default' && definitions.default) return 'INHERITED_FROM_CATEGORY';
  return 'UNSPECIFIED';
}
function getExactProductDefinition(category, subcategory = 'default') {
  const definitions = PRODUCT_TYPE_DEFINITIONS[categoryId(category)];
  return definitions?.[subcategory] || (subcategory === 'default' ? definitions?.default : null) || null;
}
function getAttributeApplicability(category, subcategory = 'default') {
  const definition = getExactProductDefinition(category, subcategory); if (!definition) return null;
  return (definition.attributes || []).map(label => { const id = stableId('ATTR', label); const meta = ATTRIBUTE_REGISTRY[id] || { id, label, dataType: 'string', unitGroup: null, allowedValues: [] }; const optionValues = Object.entries(definition.options || {}).find(([group]) => group === label)?.[1] || []; const explicitlyRequired = (definition.requiredAttributes || []).includes(label); return { ...meta, applicability: explicitlyRequired ? 'REQUIRED' : 'UNSPECIFIED', required: explicitlyRequired ? true : null, optional: explicitlyRequired ? false : null, conditional: (definition.conditionalAttributes || []).some(rule => rule.attribute === label) ? 'CONDITIONAL' : 'UNSPECIFIED', variantEligible: (definition.variantRule?.candidates || []).includes(label) ? true : null, filterable: (definition.filters || []).includes(label) ? true : null, allowedValues: optionValues.length ? optionValues.slice() : meta.allowedValues }; });
}
function getApplicability(category, subcategory = 'default') {
  const definition = getExactProductDefinition(category, subcategory); if (!definition) return null;
  const attrs = getAttributeApplicability(category, subcategory);
  const optionGroups = Object.entries(definition.options || {}).map(([label, values]) => ({ ...OPTION_GROUP_REGISTRY[stableId('OPTG', label)], attributeId: ATTRIBUTE_REGISTRY[stableId('ATTR', label)]?.id || null, optionIds: values.map(value => OPTION_REGISTRY[stableId('OPT', value)]?.id).filter(Boolean) }));
  const filters = (definition.filters || []).map(label => ({ ...FILTER_REGISTRY[stableId('FLT', label)], sourceType: ATTRIBUTE_REGISTRY[stableId('ATTR', label)] ? 'ATTRIBUTE' : 'TAXONOMY_PROPERTY', sourceId: ATTRIBUTE_REGISTRY[stableId('ATTR', label)]?.id || stableId('TAXONOMY', label) }));
  const features = (definition.features || []).map(label => ({ ...FEATURE_REGISTRY[stableId('FEAT', label)], applicable: true }));
  const variantRule = definition.variantRule ? VARIANT_RULE_REGISTRY[stableId('VR', `${categoryId(category)}-${subcategory}`)] || null : null;
  const units = attrs.filter(a => a.unitGroup).map(a => ({ attributeId: a.attributeId, unitGroup: a.unitGroup, allowedUnitIds: (definition.allowedUnits?.[a.label] || []).slice(), state: definition.allowedUnits?.[a.label] ? 'EXPLICIT' : 'UNSPECIFIED' }));
  return { categoryId: categoryId(category), branch: subcategory, definitionState: getDefinitionState(category, subcategory), productTypeIds: (definition.productTypes || []).map(label => getProductTypeId(category, subcategory, label)).filter(Boolean), attributes: attrs, optionGroups, filters, features, variantRule, units, complianceProfile: definition.complianceProfile || null, sellingUnit: definition.sellingUnit || 'UNSPECIFIED', stockUnit: definition.stockUnit || 'UNSPECIFIED', displayUnit: definition.displayUnit || 'UNSPECIFIED', measurementUnit: definition.measurementUnit || 'UNSPECIFIED' };
}
function convertUnit(value, fromUnitId, toUnitId) { const from = UNIT_REGISTRY[fromUnitId]; const to = UNIT_REGISTRY[toUnitId]; if (!from || !to || from.unitGroup !== to.unitGroup || from.kind !== 'MEASUREMENT' || to.kind !== 'MEASUREMENT' || from.conversion == null || to.conversion == null) return null; return value * from.conversion / to.conversion; }
function validateUnitConversion(fromUnitId, toUnitId) { return convertUnit(1, fromUnitId, toUnitId) !== null; }
function getComplianceProfiles() {
  const result = {};
  for (const [categoryId, branches] of Object.entries(PRODUCT_TYPE_DEFINITIONS)) for (const [branch, definition] of Object.entries(branches)) if (definition.complianceProfile) { const id = definition.complianceProfile; result[id] ||= { profileId: id, scope: [], requiredMetadata: [] }; result[id].scope.push({ categoryId, branch }); }
  for (const profile of Object.values(result)) profile.requiredMetadata = profile.profileId.includes('HEALTH') ? ['registrationNumber','prescriptionStatus','batchLot','manufactureDate','expiryDate','storageCondition','sterile','disposable','serialNumber'] : [];
  return result;
}
function reconcileProductSpecification() {
  const rows = [];
  const productCategories = CATEGORY_REGISTRY.filter(c => c.kind === 'PRODUCT_DOMAIN' || c.id === 'CAT-19' || c.kind === 'PROPERTY_DOMAIN' || c.kind === 'MINERAL_RESOURCE_DOMAIN');
  for (const category of productCategories) {
    const branches = getSubcategories(category.id);
    if (category.id === 'CAT-16' && !branches.length) { rows.push({ categoryId: category.id, branch: null, classification: 'GENUINELY_UNSPECIFIED', originalSpecificationFound: false, currentDefinition: false, reason: 'CAT-16 detailed Product specification not found in repository artifacts' }); continue; }
    for (const branch of branches) {
      const contextualClassification = BRANCH_CONTEXT_CLASSIFICATIONS[category.id]?.[branch];
      if (contextualClassification) { rows.push({ categoryId: category.id, branch, classification: contextualClassification, originalSpecificationFound: true, currentDefinition: false }); continue; }
      const definitions = PRODUCT_TYPE_DEFINITIONS[category.id];
      const definition = definitions?.[branch];
      const hasDefault = Boolean(definitions?.default);
      let classification = 'SPECIFIED_BUT_MISSING';
      if (definition) classification = (definition.productTypes?.length && definition.attributes?.length && definition.variantRule) ? 'SPECIFIED_AND_IMPLEMENTED' : 'SPECIFIED_BUT_INCOMPLETE';
      else if (hasDefault) classification = 'SPECIFIED_BUT_INCOMPLETE';
      rows.push({ categoryId: category.id, branch, classification, originalSpecificationFound: true, currentDefinition: Boolean(definition), productTypesSpecified: Boolean(definition?.productTypes?.length), attributesSpecified: Boolean(definition?.attributes?.length), optionsSpecified: Boolean(definition?.options), filtersSpecified: Boolean(definition?.filters?.length), featuresSpecified: Boolean(definition?.features?.length), variantRuleSpecified: Boolean(definition?.variantRule), unitRuleSpecified: Boolean(definition?.allowedUnits || definition?.sellingUnit || definition?.stockUnit || definition?.displayUnit || definition?.measurementUnit), complianceSpecified: Boolean(definition?.complianceProfile) });
    }
  }
  for (const category of CATEGORY_REGISTRY.filter(c => c.kind === 'SERVICE_DOMAIN')) rows.push({ categoryId: category.id, branch: null, classification: 'SERVICE', originalSpecificationFound: true });
  for (const categoryIdValue of Object.keys(OVERLAYS)) rows.push({ categoryId: categoryIdValue, branch: null, classification: 'OVERLAY', originalSpecificationFound: true });
  rows.push({ categoryId: 'CAT-44', branch: null, classification: 'FALLBACK', originalSpecificationFound: true });
  return { rows, counts: rows.reduce((out, row) => { out[row.classification] = (out[row.classification] || 0) + 1; return out; }, {}) };
}
function auditCanonicalProductTaxonomy() {
  const errors = [], warnings = [], branchAudit = [], productCategoryIds = new Set(CATEGORY_REGISTRY.filter(c => c.kind === 'PRODUCT_DOMAIN' || c.id === 'CAT-19' || c.kind === 'PROPERTY_DOMAIN' || c.kind === 'MINERAL_RESOURCE_DOMAIN').map(c => c.id));
  const definitions = PRODUCT_TYPE_DEFINITIONS;
  for (const [categoryIdValue, branches] of Object.entries(definitions)) {
    if (!productCategoryIds.has(categoryIdValue)) errors.push(`definition outside Product context: ${categoryIdValue}`);
    for (const [branch, definition] of Object.entries(branches)) {
      const validBranch = getSubcategories(categoryIdValue).includes(branch) || (categoryIdValue === 'CAT-19' && getCategoryBranches('CAT-19','PRODUCT').includes(branch)) || branch === 'default';
      if (!validBranch) errors.push(`definition branch not in hierarchy: ${categoryIdValue}/${branch}`);
      if (!(definition.productTypes || []).length) { if (definition.definitionState === 'SPECIFIED_BUT_INCOMPLETE') warnings.push(`unspecified Product Types: ${categoryIdValue}/${branch}`); else errors.push(`missing Product Types: ${categoryIdValue}/${branch}`); }
      const missing = ['attributes','filters','features','variantRule'].filter(key => !definition[key]);
      branchAudit.push({ categoryId: categoryIdValue, branch, complete: missing.length === 0 && branch !== 'default', missing });
      if (missing.length) warnings.push(`partial metadata: ${categoryIdValue}/${branch}: ${missing.join(',')}`);
    }
  }
  for (const [id, item] of Object.entries(PRODUCT_TYPE_REGISTRY)) { if (id !== item.id || id !== item.productTypeId || !item.categoryId || !item.branch || !item.label) errors.push(`invalid Product Type metadata: ${id}`); }
  for (const [id, unit] of Object.entries(UNIT_REGISTRY)) if (unit.unitId !== id || !unit.unitGroup || !unit.baseUnit || !unit.status) errors.push(`invalid unit metadata: ${id}`);
  const missingBranches = [];
  for (const category of CATEGORY_REGISTRY.filter(item => productCategoryIds.has(item.id))) {
    const branches = getSubcategories(category.id);
    if (category.id === 'CAT-16' && !branches.length && !definitions[category.id]) missingBranches.push({ categoryId: category.id, branch: null, reason: 'CAT-16 SPECIFICATION REQUIRED' });
    for (const branch of branches) {
      if (BRANCH_CONTEXT_CLASSIFICATIONS[category.id]?.[branch]) continue;
      const hasDefinition = Boolean(definitions[category.id]?.[branch] || definitions[category.id]?.default);
      if (!hasDefinition) missingBranches.push({ categoryId: category.id, branch, reason: category.id === 'CAT-16' ? 'CAT-16 SPECIFICATION REQUIRED' : 'branch definition missing' });
    }
  }
  const duplicateIds = new Set(); const seen = new Map(); for (const item of Object.values(PRODUCT_TYPE_REGISTRY)) { const key = `${item.categoryId}|${item.branch}|${item.label}`; if (seen.has(key) && seen.get(key) !== item.id) duplicateIds.add(key); seen.set(key, item.id); }
  for (const key of duplicateIds) errors.push(`duplicate Product Type semantic identity: ${key}`);
  return { ok: errors.length === 0, semanticComplete: errors.length === 0 && missingBranches.length === 0 && branchAudit.every(item => item.complete), errors, warnings, branchAudit, missingBranches, duplicateIds: [...duplicateIds], orphanEntities: [], incompatibleConversions: [['kg','L'],['L','kg']].filter(([from,to]) => validateUnitConversion(from,to)) };
}
function getProductTypeId(category, branch, label) {
  const id = stableProductTypeId(category, branch, label);
  return PRODUCT_TYPE_REGISTRY[id] ? id : null;
}
function stableProductTypeId(category, branch, label) {
  const slug = value => String(value || '').normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase() || 'UNNAMED';
  return `PT-${categoryId(category)}-${slug(`${branch}-${label}`)}`;
}
function getUnitDefinitions() { return { groups: UNIT_DEFINITIONS, units: UNIT_REGISTRY }; }
function getProductDefinition(category, subcategory = 'default') {
  const id = categoryId(category);
  if (!getCategory(id) || !isCanonicalProductCategory(id)) return null;
  const definitions = PRODUCT_TYPE_DEFINITIONS[id];
  if (!definitions) return null;
  return definitions[subcategory] || definitions.default || null;
}
function getProductApplicability(category, subcategory = 'default') { return getApplicability(category, subcategory); }
function listDefinedProductCategories() { return Object.keys(PRODUCT_TYPE_DEFINITIONS).filter(id => isCanonicalProductCategory(id)); }
function getFallbackProductDefinition() { return FALLBACK_DEFINITION; }
function isCanonicalProductCategory(id) {
  const category = getCategory(id);
  return Boolean(category && !isOverlay(category.id) && !isFallback(category.id) && (category.kind === 'PRODUCT_DOMAIN' || category.kind === 'PROPERTY_DOMAIN' || category.kind === 'MINERAL_RESOURCE_DOMAIN' || hasCategoryContext(category.id, 'PRODUCT')));
}
function isValidProductPath({ category, subcategory, productType } = {}) {
  const id = categoryId(category);
  if (!isCanonicalProductCategory(id) || !norm(subcategory) || !norm(productType)) return false;
  const definition = getProductDefinition(id, subcategory);
  return Boolean(definition && definition.productTypes.includes(norm(productType)));
}
function isOverlay(id) { return Boolean(OVERLAYS[categoryId(id)]); }
function isFallback(id) { return categoryId(id) === 'CAT-44'; }
function getOverlay(id) { return OVERLAYS[categoryId(id)] || null; }
function getFallbackDefinition() { return FALLBACK; }
function getClassificationStates() { return CLASSIFICATION_STATES.slice(); }
function isValidClassificationState(value) { return CLASSIFICATION_STATES.includes(norm(value).toUpperCase()); }
function validateCategoryRegistry() {
  const errors = [];
  if (CATEGORY_REGISTRY.length !== 44) errors.push(`expected 44 categories, got ${CATEGORY_REGISTRY.length}`);
  CATEGORY_REGISTRY.forEach((item, index) => {
    if (item.number !== index + 1) errors.push(`numbering gap at ${item.id}`);
    if (!item.id || !item.displayName || !item.kind) errors.push(`incomplete category ${item.number}`);
  });
  if (getCategory('CAT-16')?.displayName !== 'Usafiri & Logistics') errors.push('CAT-16 mismatch');
  for (let n = 17; n <= 26; n++) if (!isServiceDomain(`CAT-${n}`)) errors.push(`CAT-${n} is not SERVICE_DOMAIN`);
  for (let n = 39; n <= 41; n++) if (!isOverlay(`CAT-${n}`)) errors.push(`CAT-${n} overlay missing`);
  if (!isFallback('CAT-44')) errors.push('CAT-44 fallback missing');
  return { ok: errors.length === 0, errors };
}
function validateHierarchy() {
  const errors = [];
  for (const [id, names] of Object.entries(PRODUCT_SUBCATEGORIES)) {
    if (!getCategory(id)) errors.push(`subcategory parent missing: ${id}`);
    if (!Array.isArray(names) || names.some(x => !norm(x))) errors.push(`invalid subcategory list: ${id}`);
  }
  return { ok: errors.length === 0, errors };
}

module.exports = { listCategories, getCategory, getSubcategories, getProfileLibrary, getCategoryClassification, getCategoryBranches, hasCategoryContext, isProductBranch, isServiceBranch, getCanonicalRegistries, getProductTypeId, getUnitDefinitions, getProductApplicability, getAttributeApplicability, getApplicability, getDefinitionState, convertUnit, validateUnitConversion, getComplianceProfiles, reconcileProductSpecification, auditCanonicalProductTaxonomy, getProductDefinition, listDefinedProductCategories, getFallbackProductDefinition, isCanonicalProductCategory, isValidProductPath, getOverlay, getFallbackDefinition, getClassificationStates, isValidClassificationState, isServiceDomain, isOverlay, isFallback, validateCategoryRegistry, validateHierarchy };
