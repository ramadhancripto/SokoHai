/* [SEARCH-INTEL 2026-11-21] SokoHai search language dictionary — DATA ONLY, one source of truth.
 *
 * Used by shared/search-engine.js (browser + build tools + tests) and shared/search-tokens.js
 * (the server-side catalogue index). To teach search a new word, add it to a group here — do not add
 * one-off `if` conditions in UI code.
 *
 *   GROUPS      words/phrases that mean the same thing (Kiswahili + English). `cat` = canonical
 *               category hint (shared/category-filter-core.mjs), `kind` = products | services | drivers,
 *               `catWide` = the group names the WHOLE category, so every listing in it answers the words.
 *   INTENTS     words that change HOW to search (cheap -> sort by price, near me -> nearest, ...).
 *   FILLER      conversational words removed from natural-language queries ("nataka", "I need").
 *   REGIONS     Tanzanian regions and the town / district names people type.
 *   PLURALS     Kiswahili noun-class prefix pairs (ki/vi, m/mi, m/wa, ji/ma ...) used to match singular
 *               and plural forms; English plurals are handled by rule in the engine.
 *
 * Keep entries lower-case, without accents. Phrases (with spaces) are matched before single words. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SKHSearchDictionary = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var P = 'products', S = 'services', D = 'drivers';
  var GROUPS = [
    // ---- phones, electronics, IT
    { kind: P, cat: 'CAT-12', catWide: true, terms: ['simu', 'phone', 'phones', 'smartphone', 'mobile', 'mobile phone', 'simu janja', 'simu ya mkononi', 'rununu'] },
    { kind: P, cat: 'CAT-12', terms: ['chaja', 'charger', 'chaji'] },
    { kind: P, cat: 'CAT-12', terms: ['earphone', 'earphones', 'headphones', 'hedifoni', 'vipokea sauti'] },
    { kind: P, cat: 'CAT-11', terms: ['tv', 'televisheni', 'television', 'runinga', 'tivii'] },
    { kind: P, cat: 'CAT-11', terms: ['friji', 'fridge', 'jokofu', 'refrigerator', 'freezer', 'friza'] },
    { kind: P, cat: 'CAT-11', terms: ['spika', 'speaker', 'speakers', 'sabufa', 'subwoofer', 'redio', 'radio'] },
    { kind: P, cat: 'CAT-11', terms: ['pasi', 'iron', 'pasi ya umeme'] },
    { kind: P, cat: 'CAT-11', terms: ['blenda', 'blender', 'mashine ya kusaga'] },
    { kind: P, cat: 'CAT-11', terms: ['jiko', 'cooker', 'stove', 'jiko la gesi', 'gas cooker'] },
    { kind: P, cat: 'CAT-11', terms: ['feni', 'fan', 'pangaboi'] },
    { kind: P, cat: 'CAT-11', terms: ['ac', 'air conditioner', 'kiyoyozi'] },
    { kind: P, cat: 'CAT-13', catWide: true, terms: ['kompyuta', 'computer', 'laptop', 'pc', 'kompyuta mpakato', 'desktop'] },
    { kind: P, cat: 'CAT-13', terms: ['printa', 'printer', 'mashine ya kuchapa'] },
    { kind: P, cat: 'CAT-13', terms: ['tablet', 'tabuleti', 'ipad'] },
    { kind: P, cat: 'CAT-34', terms: ['sola', 'solar', 'solar panel', 'paneli ya jua', 'umeme wa jua'] },
    { kind: P, cat: 'CAT-34', terms: ['jenereta', 'generator'] },
    { kind: P, cat: 'CAT-34', terms: ['betri', 'battery', 'batteries'] },
    // ---- clothes, beauty
    { kind: P, cat: 'CAT-07', catWide: true, terms: ['nguo', 'clothes', 'mavazi', 'clothing', 'apparel'] },
    { kind: P, cat: 'CAT-07', terms: ['nguo za watoto', "children's clothes", 'children clothes', 'kids clothes', 'mavazi ya watoto', 'baby clothes'] },
    { kind: P, cat: 'CAT-07', terms: ['nguo za kike', 'nguo za wanawake', "women's clothes", 'ladies wear', 'womens clothes'] },
    { kind: P, cat: 'CAT-07', terms: ['nguo za kiume', 'nguo za wanaume', "men's clothes", 'mens clothes', 'menswear'] },
    { kind: P, cat: 'CAT-07', terms: ['viatu', 'shoes', 'kiatu', 'shoe', 'raba', 'sneakers', 'footwear'] },
    { kind: P, cat: 'CAT-07', terms: ['sandali', 'sandals', 'ndala', 'slippers', 'malapa'] },
    { kind: P, cat: 'CAT-07', terms: ['shati', 'shirt', 'mashati', 'shirts'] },
    { kind: P, cat: 'CAT-07', terms: ['suruali', 'trousers', 'pants', 'jeans', 'jinsi'] },
    { kind: P, cat: 'CAT-07', terms: ['gauni', 'dress', 'magauni', 'dresses'] },
    { kind: P, cat: 'CAT-07', terms: ['kitenge', 'vitenge', 'kanga', 'khanga'] },
    { kind: P, cat: 'CAT-07', terms: ['mkoba', 'bag', 'begi', 'handbag', 'pochi', 'mikoba'] },
    { kind: P, cat: 'CAT-07', terms: ['saa', 'watch', 'wristwatch', 'saa ya mkono'] },
    { kind: P, cat: 'CAT-08', catWide: true, terms: ['vipodozi', 'cosmetics', 'makeup', 'make up', 'urembo', 'beauty'] },
    { kind: P, cat: 'CAT-08', terms: ['manukato', 'perfume', 'pafyumu', 'fragrance'] },
    { kind: P, cat: 'CAT-08', terms: ['nywele', 'hair', 'wigi', 'wig', 'weave', 'mawigi'] },
    { kind: P, cat: 'CAT-08', terms: ['mafuta ya kupaka', 'lotion', 'losheni', 'body lotion'] },
    // ---- home, building
    { kind: P, cat: 'CAT-09', terms: ['sofa', 'kochi', 'couch', 'makochi', 'sofa set'] },
    { kind: P, cat: 'CAT-09', terms: ['kitanda', 'bed', 'vitanda', 'beds'] },
    { kind: P, cat: 'CAT-09', terms: ['godoro', 'mattress', 'magodoro'] },
    { kind: P, cat: 'CAT-09', terms: ['meza', 'table', 'tables'] },
    { kind: P, cat: 'CAT-09', terms: ['kiti', 'chair', 'viti', 'chairs'] },
    { kind: P, cat: 'CAT-09', terms: ['kabati', 'cupboard', 'wardrobe', 'makabati'] },
    { kind: P, cat: 'CAT-09', terms: ['vyombo', 'utensils', 'vyombo vya jikoni', 'kitchenware', 'sufuria', 'pots'] },
    { kind: P, cat: 'CAT-09', terms: ['pazia', 'curtains', 'mapazia', 'curtain'] },
    { kind: P, cat: 'CAT-10', terms: ['saruji', 'cement', 'simenti'] },
    { kind: P, cat: 'CAT-10', terms: ['bati', 'iron sheets', 'mabati', 'roofing sheets'] },
    { kind: P, cat: 'CAT-10', terms: ['nondo', 'steel bars', 'rebar', 'chuma'] },
    { kind: P, cat: 'CAT-10', terms: ['rangi', 'paint', 'rangi ya nyumba'] },
    { kind: P, cat: 'CAT-10', terms: ['tofali', 'bricks', 'matofali', 'brick', 'blocks'] },
    { kind: P, cat: 'CAT-10', terms: ['mbao', 'timber', 'wood', 'lumber'] },
    { kind: P, cat: 'CAT-10', terms: ['bomba la maji', 'pipe', 'pipes', 'mabomba ya maji'] },
    // ---- food, agriculture
    { kind: P, cat: 'CAT-01', terms: ['mchele', 'rice', 'wali'] },
    { kind: P, cat: 'CAT-01', terms: ['unga', 'flour', 'unga wa mahindi', 'maize flour', 'sembe'] },
    { kind: P, cat: 'CAT-01', terms: ['sukari', 'sugar'] },
    { kind: P, cat: 'CAT-01', terms: ['mafuta ya kupikia', 'cooking oil', 'mafuta ya alizeti', 'sunflower oil'] },
    { kind: P, cat: 'CAT-01', terms: ['maziwa', 'milk', 'dairy'] },
    { kind: P, cat: 'CAT-01', terms: ['mayai', 'eggs', 'yai', 'egg'] },
    { kind: P, cat: 'CAT-01', terms: ['nyama', 'meat', 'beef', 'nyama ya ng\'ombe'] },
    { kind: P, cat: 'CAT-01', terms: ['kuku', 'chicken', 'poultry'] },
    { kind: P, cat: 'CAT-05', terms: ['samaki', 'fish', 'dagaa', 'sardines'] },
    { kind: P, cat: 'CAT-01', terms: ['matunda', 'fruits', 'fruit', 'tunda'] },
    { kind: P, cat: 'CAT-01', terms: ['mboga', 'vegetables', 'mbogamboga', 'veggies'] },
    { kind: P, cat: 'CAT-01', terms: ['vinywaji', 'drinks', 'beverages', 'soda', 'juisi', 'juice'] },
    { kind: P, cat: 'CAT-02', terms: ['mbolea', 'fertilizer', 'fertiliser', 'samadi', 'manure'] },
    { kind: P, cat: 'CAT-02', terms: ['mbegu', 'seeds', 'seed'] },
    { kind: P, cat: 'CAT-02', terms: ['dawa ya kuua wadudu', 'pesticide', 'pesticides', 'viuatilifu'] },
    { kind: P, cat: 'CAT-03', terms: ['mahindi', 'maize', 'corn'] },
    { kind: P, cat: 'CAT-03', terms: ['maharage', 'beans', 'haragwe'] },
    { kind: P, cat: 'CAT-04', terms: ['ng\'ombe', 'ngombe', 'cow', 'cattle', 'cows'] },
    { kind: P, cat: 'CAT-04', terms: ['mbuzi', 'goat', 'goats'] },
    // ---- vehicles
    { kind: P, cat: 'CAT-14', terms: ['gari', 'car', 'magari', 'vehicle', 'cars', 'motokaa'] },
    { kind: P, cat: 'CAT-14', terms: ['pikipiki', 'motorcycle', 'motorbike', 'bodaboda', 'boda', 'boda boda'] },
    { kind: P, cat: 'CAT-14', terms: ['bajaji', 'bajaj', 'tuktuk', 'tuk tuk', 'three wheeler'] },
    { kind: P, cat: 'CAT-14', terms: ['baiskeli', 'bicycle', 'bike', 'cycle'] },
    { kind: P, cat: 'CAT-15', catWide: true, terms: ['vipuri', 'spare parts', 'spares', 'kipuri', 'parts'] },
    { kind: P, cat: 'CAT-15', terms: ['tairi', 'tyre', 'tire', 'matairi', 'tyres', 'tires'] },
    // ---- health, family, office
    { kind: P, cat: 'CAT-19', catWide: true, terms: ['dawa', 'medicine', 'medicines', 'madawa'] },
    { kind: P, cat: 'CAT-30', terms: ['vitu vya mtoto', 'baby products', 'baby items', 'nepi', 'diapers', 'pampers'] },
    { kind: P, cat: 'CAT-30', terms: ['vinyago', 'toys', 'kinyago', 'toy', 'midoli'] },
    { kind: P, cat: 'CAT-32', terms: ['madaftari', 'exercise books', 'daftari', 'notebooks', 'stationery', 'vifaa vya shule', 'school supplies'] },
    // ---- services
    { kind: S, terms: ['fundi', 'technician', 'repair', 'mafundi', 'matengenezo', 'repairs', 'fixing'] },
    { kind: S, terms: ['fundi umeme', 'electrician', 'electrical', 'fundi wa umeme', 'wiring', 'umeme wa nyumba'] },
    { kind: S, terms: ['fundi bomba', 'plumber', 'plumbing', 'fundi wa bomba', 'fundi mabomba'] },
    { kind: S, terms: ['fundi simu', 'phone repair', 'kutengeneza simu', 'fundi wa simu'] },
    { kind: S, terms: ['fundi magari', 'mechanic', 'fundi wa magari', 'gereji', 'garage', 'car repair'] },
    { kind: S, terms: ['fundi seremala', 'carpenter', 'seremala', 'carpentry', 'fundi mbao'] },
    { kind: S, terms: ['fundi ujenzi', 'mason', 'builder', 'fundi mwashi', 'construction'] },
    { kind: S, terms: ['fundi cherehani', 'tailor', 'mshonaji', 'tailoring', 'fundi nguo'] },
    { kind: S, terms: ['usafi', 'cleaning', 'cleaner', 'cleaners', 'usafishaji', 'cleaning services'] },
    { kind: S, terms: ['saluni', 'salon', 'kinyozi', 'barber', 'hair salon', 'kusuka'] },
    { kind: S, terms: ['mpishi', 'chef', 'cook', 'catering', 'upishi'] },
    { kind: S, terms: ['mpiga picha', 'photographer', 'photography', 'picha za harusi', 'videographer'] },
    { kind: S, terms: ['mwalimu', 'tutor', 'teacher', 'tuition', 'masomo ya ziada'] },
    { kind: S, terms: ['ubunifu', 'design', 'graphic design', 'mbunifu', 'designer', 'logo'] },
    { kind: S, terms: ['ushauri', 'consulting', 'consultant', 'mshauri', 'advice'] },
    { kind: S, terms: ['mlinzi', 'security guard', 'ulinzi', 'guard'] },
    // ---- transport
    { kind: D, terms: ['usafiri', 'transport', 'usafirishaji', 'delivery', 'kusafirisha', 'shipping'] },
    { kind: D, terms: ['mzigo', 'cargo', 'mizigo', 'freight', 'kubeba mzigo', 'parcel'] },
    { kind: D, terms: ['lori', 'truck', 'malori', 'trucks', 'fuso', 'canter'] },
    { kind: D, terms: ['dereva', 'driver', 'madereva', 'drivers'] },
    { kind: D, terms: ['kuhama', 'moving', 'house moving', 'kuhamisha vitu', 'relocation'] }
  ];

  var INTENTS = {
    cheap: { set: { sort: 'price_asc' }, terms: ['bei nafuu', 'bei rahisi', 'nafuu', 'rahisi', 'affordable', 'cheap', 'cheapest', 'low price', 'bei ya chini', 'punguzo', 'discount'] },
    pricey: { set: { sort: 'price_desc' }, terms: ['bei ya juu', 'ghali', 'expensive', 'premium', 'luxury'] },
    near: { set: { sort: 'nearest', near: true }, terms: ['karibu nami', 'karibu yangu', 'karibu', 'near me', 'nearby', 'close to me', 'jirani'] },
    fresh: { set: { sort: 'newest' }, terms: ['mpya kabisa sokoni', 'zilizoongezwa karibuni', 'newly listed', 'latest', 'za karibuni'] },
    condNew: { set: { condition: 'new' }, terms: ['mpya', 'new', 'brand new', 'original', 'orijino'] },
    condUsed: { set: { condition: 'used' }, terms: ['used', 'mtumba', 'imetumika', 'second hand', 'secondhand', 'za mkono wa pili', 'refurbished'] },
    verified: { set: { verifiedOnly: true }, terms: ['waliothibitishwa', 'aliyethibitishwa', 'verified', 'kuaminika', 'trusted', 'wa kuaminika'] },
    inStock: { set: { inStockOnly: true }, terms: ['inapatikana', 'zinapatikana', 'available', 'in stock', 'ipo stoo', 'stoo'] }
  };

  var FILLER = ['nataka', 'natafuta', 'nahitaji', 'naomba', 'nipatie', 'nionyeshe', 'tafuta', 'tafadhali', 'ninatafuta', 'ninahitaji',
    'i want', 'i need', 'looking for', 'show me', 'find me', 'find', 'please', 'search', 'where can i buy', 'where to buy', 'buy',
    'kununua', 'kuuza', 'nauza', 'nunua', 'wapi', 'bei gani', 'ni bei gani', 'how much', 'price of', 'kwa ajili ya', 'for sale',
    'inauzwa', 'zinauzwa', 'yenye', 'ambayo', 'nzuri', 'good', 'best', 'bora', 'the', 'a', 'an', 'of', 'and', 'in', 'at', 'for',
    'na', 'ya', 'wa', 'la', 'za', 'kwa', 'cha', 'vya', 'katika', 'kwenye', 'huko', 'hapa', 'demo'];

  // Region display name + what people type. (Same names as skh.TZ_REGIONS in js/app/00-bootstrap.js.)
  var REGIONS = [
    ['Arusha', ['arusha']], ['Dar es Salaam', ['dar es salaam', 'dar-es-salaam', 'dar', 'dsm', 'ilala', 'kinondoni', 'temeke', 'ubungo', 'kigamboni', 'kariakoo', 'posta', 'mbezi', 'sinza', 'mwenge']],
    ['Dodoma', ['dodoma']], ['Geita', ['geita']], ['Iringa', ['iringa']], ['Kagera', ['kagera', 'bukoba']], ['Katavi', ['katavi', 'mpanda']],
    ['Kigoma', ['kigoma']], ['Kilimanjaro', ['kilimanjaro', 'moshi', 'kili']], ['Lindi', ['lindi']], ['Manyara', ['manyara', 'babati']],
    ['Mara', ['mara', 'musoma']], ['Mbeya', ['mbeya']], ['Morogoro', ['morogoro', 'moro']], ['Mtwara', ['mtwara']], ['Mwanza', ['mwanza']],
    ['Njombe', ['njombe']], ['Pwani', ['pwani', 'coast', 'kibaha', 'bagamoyo']], ['Rukwa', ['rukwa', 'sumbawanga']], ['Ruvuma', ['ruvuma', 'songea']],
    ['Shinyanga', ['shinyanga']], ['Simiyu', ['simiyu']], ['Singida', ['singida']], ['Songwe', ['songwe']], ['Tabora', ['tabora']], ['Tanga', ['tanga']],
    ['Unguja Kaskazini', ['unguja kaskazini', 'zanzibar north']], ['Unguja Kusini', ['unguja kusini', 'zanzibar south']],
    ['Mjini Magharibi', ['mjini magharibi', 'zanzibar west', 'zanzibar', 'unguja']], ['Pemba Kaskazini', ['pemba kaskazini', 'pemba north']],
    ['Pemba Kusini', ['pemba kusini', 'pemba south', 'pemba']]
  ];

  // Kiswahili noun-class singular/plural prefixes (singular, plural). Applied only to words of 4+ letters.
  var PLURALS = [['ki', 'vi'], ['ch', 'vy'], ['mw', 'mi'], ['m', 'mi'], ['mw', 'wa'], ['m', 'wa'], ['ji', 'ma'], ['', 'ma'], ['u', 'nyu']];

  return { GROUPS: GROUPS, INTENTS: INTENTS, FILLER: FILLER, REGIONS: REGIONS, PLURALS: PLURALS, VERSION: '2026-11-21.1' };
});
