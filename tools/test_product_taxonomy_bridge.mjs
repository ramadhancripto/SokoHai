import assert from 'node:assert/strict';
import { getProductSuggestions, categoryIdFor } from '../shared/product-taxonomy-bridge.mjs';
assert.equal(categoryIdFor('Chakula & Vinywaji'), 'CAT-01');
const canonical = getProductSuggestions('Mifugo', 'Ng\'ombe');
assert.equal(canonical.source, 'CANONICAL');
assert.ok(canonical.attributes.includes('Breed'));
// 'Livestock Services' is classified SERVICE in canonical branchContexts (CAT-04), so the
// bridge correctly short-circuits to CONTEXT_ONLY/NOT_PRODUCT instead of emitting a product
// schema. GENERIC_FALLBACK/LEGACY_LIVE remain valid for genuinely unmapped product branches.
const fallback = getProductSuggestions('Mifugo', 'Livestock Services');
assert.ok(['CONTEXT_ONLY','GENERIC_FALLBACK','LEGACY_LIVE'].includes(fallback.source), `unexpected source ${fallback.source}`);
assert.equal(fallback.completionState, 'NOT_PRODUCT');
assert.ok(Array.isArray(fallback.attributes));
// Canonical must not be displaced by a legacy live hint on a canonical route.
const shadow = getProductSuggestions('CAT-04', "Ng'ombe", { subcategories: { "Ng'ombe": { attributes: ['LEGACY ONLY FIELD'] } } });
assert.ok(shadow.attributes.includes('Breed'), 'canonical attributes must survive a legacy live hint');
assert.ok(shadow.taxonomyPrecedence.legacySuppressedFields.includes('attributes'), 'legacy attributes must be suppressed, not merged over canonical');
console.log('PRODUCT TAXONOMY BRIDGE: passed canonical lookup, canonical suggestions, and incomplete-category fallback.');
