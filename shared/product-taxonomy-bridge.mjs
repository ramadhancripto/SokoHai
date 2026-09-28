import taxonomy from './canonical-taxonomy-core.js';

const norm = value => String(value || '').trim().toLowerCase();
function categoryIdFor(value) {
  if (!value) return null;
  const direct = taxonomy.getCategory(value);
  if (direct) return direct.id;
  const match = taxonomy.listCategories().find(c => norm(c.displayName) === norm(value) || norm(c.name) === norm(value));
  return match ? match.id : null;
}
function getProductSuggestions(category, subcategory, liveConfig = null) {
  const categoryId = categoryIdFor(category);
  const canonical = categoryId ? taxonomy.getProductDefinition(categoryId, subcategory || 'default') : null;
  const live = liveConfig && liveConfig.subcategories && subcategory ? liveConfig.subcategories[subcategory] : null;
  if (canonical) return { source: 'CANONICAL', categoryId, attributes: canonical.attributes || [], filters: canonical.filters || [], options: canonical.options || {}, features: canonical.features || [], variantRule: canonical.variantRule || null, definitionState: canonical.definitionState || 'UNKNOWN' };
  if (live) return { source: 'LEGACY_LIVE', categoryId, attributes: live.attributes || live.filters || [], filters: live.filters || [], options: live.options || {}, features: live.features || [], variantRule: live.variantRule || null, definitionState: 'LEGACY_LIVE' };
  return { source: 'GENERIC_FALLBACK', categoryId, attributes: [], filters: [], options: {}, features: [], variantRule: null, definitionState: 'FALLBACK' };
}
export { categoryIdFor, getProductSuggestions };
