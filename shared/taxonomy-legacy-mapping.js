/* Phase 1A read-only legacy mapping interface.
 * Only direct/high-confidence mappings already supported by the Master labels are included.
 * No legacy data is read, rewritten, migrated, or mutated here.
 */
const DIRECT_CATEGORY_MAPPINGS = Object.freeze({
  'Vyakula na Vinywaji (Food)': 'CAT-01',
  'Kilimo (Agriculture)': 'CAT-02',
  'Ufugaji (Livestock)': 'CAT-04',
  'Mavazi na Fashoni (Fashion)': 'CAT-07',
  'Electronics & Teknoloji (Tech)': 'CAT-11',
  'Samani na Nyumbani (Home)': 'CAT-09',
  'Ujenzi na Hardware (Hardware)': 'CAT-10',
  'Magari na Vyombo (Automotive)': 'CAT-14',
  'Pet Products (Pet)': 'CAT-31',
  'Ulinzi na Usalama (Safety)': 'CAT-36',
  'Biashara ya Jumla (Wholesale)': 'CAT-40',
  'Maagizo ya Nje (Import/Export)': 'CAT-41',
  'Asili na Utamaduni (Traditional)': 'CAT-28',
  /* [F-F1 2026-11-10] Reviewed: the 12 remaining seller-form categories.
   * Without these, products listed under them never match canonical buyer
   * filters (categoryMatches falls back to self-only). */
  'Afya na Pharmacy (Health)': 'CAT-19',
  'Vito na Saa (Luxury)': 'CAT-27', /* jewellery leaf lives under CAT-27 */
  'Vitabu na Elimu (Education)': 'CAT-32', /* books/stationery products */
  'Michezo na Mazoezi (Sports)': 'CAT-26',
  'Vichezeo na Michezo (Toys)': 'CAT-26', /* toys/games = burudani */
  'Sauti na Muziki (Music)': 'CAT-26',
  'Sanaa na Ubunifu (Arts)': 'CAT-27',
  'Dini na Utamaduni (Religion)': 'CAT-28',
  'Zawadi na Sherehe (Gifts)': 'CAT-29',
  'Vifungashio na Printi (Packaging)': 'CAT-37', /* print + labelling/branding */
  'Vitu vya Kale na Thamani (Antiques)': 'CAT-28', /* heritage/collectibles */
  'Mchanganyiko (General Merchandise)': 'CAT-44'
});

function mapLegacyCategory(label) {
  const key = String(label == null ? '' : label).trim();
  return DIRECT_CATEGORY_MAPPINGS[key] || null;
}
function mappingCoverage(labels) {
  const values = Array.from(labels || [], x => String(x).trim());
  return { mapped: values.filter(x => Boolean(DIRECT_CATEGORY_MAPPINGS[x])), unmapped: values.filter(x => !DIRECT_CATEGORY_MAPPINGS[x]) };
}
module.exports = { DIRECT_CATEGORY_MAPPINGS, mapLegacyCategory, mappingCoverage };
