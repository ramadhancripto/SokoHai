/* [2026-11-01] Canonical attribute aliases (pure; browser + Node).
 *
 * The canonical attribute registry is the EXISTING runtime registry
 * (shared/canonical-taxonomy-data.js ATTRIBUTE_REGISTRY). This module only says
 * which labels are the SAME attribute written differently, so a seller's
 * "Colour" and the taxonomy's "Color" become one attribute.
 *
 *  - Only spelling/case variants with the same meaning are aliased.
 *  - Pairs that may differ in meaning (Size vs Dimensions, Grade vs Quality, ...)
 *    are listed as NOT aliased until a person confirms them (semantic review).
 *  - Legacy attribute ids and stored values are never rewritten: the original
 *    label and its id stay on the product; the canonical id is derived on read.
 */
const txt = v => String(v == null ? '' : v).trim();
const slug = v => txt(v).normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase();
/** Same id scheme as shared/canonical-taxonomy-core.js stableId('ATTR', label). */
export const attributeIdFor = label => `ATTR-${slug(label) || 'UNNAMED'}`;

// canonical label -> aliases (same meaning). Canonical labels exist in ATTRIBUTE_REGISTRY.
export const ATTRIBUTE_ALIASES = Object.freeze({
  'Color': Object.freeze(['Colour', 'Rangi']),
  'Pack Size': Object.freeze(['Package Size', 'Packet Size', 'Ukubwa wa Pakiti']),
  'Breeding status': Object.freeze(['Breeding Status']),
  'Health status': Object.freeze(['Health Status']),
  'Size': Object.freeze(['Saizi']),
  'Material': Object.freeze(['Malighafi']),
  'Brand': Object.freeze(['Chapa'])
});
// Looked at and deliberately NOT aliased: meaning can differ; needs semantic validation first.
export const NOT_ALIASED_PENDING_REVIEW = Object.freeze([
  ['Size', 'Dimensions'], ['Grade', 'Quality'], ['Storage', 'Capacity'], ['Volume', 'Capacity'],
  ['Crop', 'Crop Type'], ['Variety', 'Crop Variety'], ['Weight', 'Net Weight'], ['Model', 'Model Number'],
  ['Power', 'Power Rating'], ['Color', 'Shade'], ['Packaging', 'Pack Size']
]);

const INDEX = (() => {
  const m = new Map();
  Object.entries(ATTRIBUTE_ALIASES).forEach(([canon, aliases]) => {
    m.set(canon.toLowerCase(), canon);
    aliases.forEach(a => m.set(a.toLowerCase(), canon));
  });
  return m;
})();

/** label -> { label (canonical), attributeId (canonical), legacyId (id of the label as written), alias } */
export function canonicalAttribute(label) {
  const raw = txt(label);
  if (!raw) return null;
  const canon = INDEX.get(raw.toLowerCase()) || raw;
  return { label: canon, attributeId: attributeIdFor(canon), legacyId: attributeIdFor(raw), alias: canon.toLowerCase() !== raw.toLowerCase() };
}
/** Comparison key: two labels of the same attribute give the same key. */
export function canonicalKey(label) {
  const c = canonicalAttribute(label);
  return c ? c.attributeId : '';
}
/** Registry check: every canonical label must exist in the runtime registry (contract test). */
export function aliasRegistryIssues(registry) {
  const ids = new Set(Object.keys(registry || {}));
  return Object.keys(ATTRIBUTE_ALIASES).filter(l => !ids.has(attributeIdFor(l))).map(l => ({ label: l, error: 'CANONICAL_NOT_IN_REGISTRY' }));
}
