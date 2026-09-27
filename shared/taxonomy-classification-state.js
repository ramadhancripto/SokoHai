/* Phase 1A pure classification-state definitions. */
const { CLASSIFICATION_STATES, FALLBACK } = require('./canonical-taxonomy-data.js');

function isClassificationState(value) { return CLASSIFICATION_STATES.includes(String(value == null ? '' : value).trim().toUpperCase()); }
function fallbackForLevel(level) {
  const value = String(level == null ? '' : level).trim().toUpperCase();
  return FALLBACK.allowedLevels.includes(value) ? `OTHER_${value}` : 'UNCLASSIFIED';
}
function isFallbackState(value) { return /^OTHER_(CATEGORY|SUBCATEGORY|PRODUCT_TYPE|ATTRIBUTE_VALUE|OPTION_VALUE|VARIANT_VALUE)$/.test(String(value || '').toUpperCase()); }
module.exports = { CLASSIFICATION_STATES, isClassificationState, fallbackForLevel, isFallbackState, FALLBACK };
