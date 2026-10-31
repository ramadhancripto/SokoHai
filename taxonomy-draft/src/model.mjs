// Information model drafts: units, attribute templates, variant compatibility.

// ---- Units -------------------------------------------------------------------------
// Existing UNIT_REGISTRY (22 units, groups WEIGHT/VOLUME/LENGTH/AREA/COUNT) is kept as-is.
// Proposed additions. convertible=false => packaging/local unit whose size varies:
// seller MUST declare contentQuantity + contentUnit (e.g. gunia = 90 kg) per listing.
export const UNIT_ADDITIONS = [
  { unitId: 'm3', label: 'm³', unitGroup: 'VOLUME', baseUnit: 'mL', conversion: 1e6, convertible: true },
  { unitId: 'gal_us', label: 'gallon (US)', unitGroup: 'VOLUME', baseUnit: 'mL', conversion: 3785.411784, convertible: true },
  { unitId: 'km', label: 'km', unitGroup: 'LENGTH', baseUnit: 'm', conversion: 1000, convertible: true },
  { unitId: 'dozen', label: 'dazeni', unitGroup: 'COUNT', baseUnit: 'piece', conversion: 12, convertible: true },
  { unitId: 'tray30', label: 'trei (mayai 30)', unitGroup: 'COUNT', baseUnit: 'piece', conversion: 30, convertible: true },
  { unitId: 'gunia', label: 'gunia (sack)', unitGroup: 'PACKAGING', baseUnit: null, conversion: null, convertible: false, note: 'Kawaida 90–100 kg kwa nafaka; tamko la seller ni lazima.' },
  { unitId: 'debe', label: 'debe', unitGroup: 'PACKAGING', baseUnit: null, conversion: null, convertible: false, note: 'Debe ≈ lita 20 kwa ujazo; uzito hutegemea zao.' },
  { unitId: 'tenga', label: 'tenga (crate)', unitGroup: 'PACKAGING', baseUnit: null, conversion: null, convertible: false },
  { unitId: 'kisado', label: 'kisado/kopo', unitGroup: 'PACKAGING', baseUnit: null, conversion: null, convertible: false },
  { unitId: 'crate', label: 'kreti', unitGroup: 'PACKAGING', baseUnit: null, conversion: null, convertible: false },
  { unitId: 'drum', label: 'drum', unitGroup: 'PACKAGING', baseUnit: null, conversion: null, convertible: false },
  { unitId: 'bag', label: 'mfuko', unitGroup: 'PACKAGING', baseUnit: null, conversion: null, convertible: false },
  { unitId: 'head', label: 'kichwa (mnyama)', unitGroup: 'COUNT', baseUnit: 'piece', conversion: 1, convertible: true, note: 'Mifugo hai.' },
  { unitId: 'W', label: 'W', unitGroup: 'POWER', baseUnit: 'W', conversion: 1, convertible: true },
  { unitId: 'kW', label: 'kW', unitGroup: 'POWER', baseUnit: 'W', conversion: 1000, convertible: true },
  { unitId: 'kVA', label: 'kVA', unitGroup: 'APPARENT_POWER', baseUnit: 'kVA', conversion: 1, convertible: true, note: 'Haibadilishwi kuwa kW bila power factor.' },
  { unitId: 'Wh', label: 'Wh', unitGroup: 'ENERGY', baseUnit: 'Wh', conversion: 1, convertible: true },
  { unitId: 'kWh', label: 'kWh', unitGroup: 'ENERGY', baseUnit: 'Wh', conversion: 1000, convertible: true },
  { unitId: 'mAh', label: 'mAh', unitGroup: 'CHARGE', baseUnit: 'mAh', conversion: 1, convertible: true },
  { unitId: 'Ah', label: 'Ah', unitGroup: 'CHARGE', baseUnit: 'mAh', conversion: 1000, convertible: true },
  { unitId: 'V', label: 'V', unitGroup: 'VOLTAGE', baseUnit: 'V', conversion: 1, convertible: true },
  { unitId: 'GB', label: 'GB', unitGroup: 'DATA', baseUnit: 'GB', conversion: 1, convertible: true, note: 'Decimal (1 TB = 1000 GB) kama watengenezaji wanavyoandika.' },
  { unitId: 'TB', label: 'TB', unitGroup: 'DATA', baseUnit: 'GB', conversion: 1000, convertible: true },
  { unitId: 'degC', label: '°C', unitGroup: 'TEMPERATURE', baseUnit: 'degC', conversion: 1, convertible: true },
  { unitId: 'minute', label: 'dakika', unitGroup: 'TIME', baseUnit: 'minute', conversion: 1, convertible: true },
  { unitId: 'hour', label: 'saa', unitGroup: 'TIME', baseUnit: 'minute', conversion: 60, convertible: true },
  { unitId: 'day', label: 'siku', unitGroup: 'TIME', baseUnit: 'minute', conversion: 1440, convertible: true },
  { unitId: 'night', label: 'usiku (malazi)', unitGroup: 'TIME', baseUnit: null, conversion: null, convertible: false },
  { unitId: 'month', label: 'mwezi', unitGroup: 'TIME', baseUnit: null, conversion: null, convertible: false, note: 'Urefu hutofautiana — bei kwa mwezi haibadilishwi kuwa siku.' },
  { unitId: 'session', label: 'kikao', unitGroup: 'SERVICE', baseUnit: null, conversion: null, convertible: false },
  { unitId: 'job', label: 'kazi nzima (flat)', unitGroup: 'SERVICE', baseUnit: null, conversion: null, convertible: false },
  { unitId: 'person', label: 'mtu', unitGroup: 'COUNT', baseUnit: 'piece', conversion: 1, convertible: true },
  { unitId: 'tablet', label: 'kidonge (tablet)', unitGroup: 'DOSE', baseUnit: 'tablet', conversion: 1, convertible: true, note: 'Haibadilishwi kuwa piece wala g.' },
  { unitId: 'bottle', label: 'chupa', unitGroup: 'PACKAGING', baseUnit: null, conversion: null, convertible: false, note: 'Taja ujazo (mf. 500 mL).' },
  { unitId: 'tray', label: 'trei', unitGroup: 'PACKAGING', baseUnit: null, conversion: null, convertible: false, note: 'Trei ya mayai ya 30 ni tray30.' },
  { unitId: 'carat', label: 'carat', unitGroup: 'WEIGHT', baseUnit: 'g', conversion: 0.2, convertible: true, note: 'Vito/gemstones.' },
];
// Legacy unit values -> registry. Meaning is preserved; nothing is silently converted.
// perProductContent = the legacy form stored a per-product count of base units (prodConversionRatio / pcsPerUnit).
export const UNIT_LEGACY_MAP = [
  { source: 'sellerForm.prodBaseUnit', legacy: 'Piece', unitId: 'piece', action: 'MAP' },
  { source: 'sellerForm.prodBaseUnit', legacy: 'Kg', unitId: 'kg', action: 'MAP' },
  { source: 'sellerForm.prodBaseUnit', legacy: 'Gram', unitId: 'g', action: 'MAP' },
  { source: 'sellerForm.prodBaseUnit', legacy: 'Litre', unitId: 'L', action: 'MAP' },
  { source: 'sellerForm.prodBaseUnit', legacy: 'Ml', unitId: 'mL', action: 'MAP' },
  { source: 'sellerForm.prodBaseUnit', legacy: 'Meter', unitId: 'm', action: 'MAP' },
  { source: 'sellerForm.prodBaseUnit', legacy: 'Pair', unitId: 'pair', action: 'MAP', note: 'Registry: pair = piece 2. Stock ya zamani ilihesabu jozi; inabaki kwa jozi.' },
  { source: 'sellerForm.prodBaseUnit', legacy: 'Tablet', unitId: 'tablet', action: 'MAP_NEW_UNIT' },
  { source: 'sellerForm.prodBaseUnit', legacy: 'Bottle', unitId: 'bottle', action: 'MAP_NEEDS_CONTENT', note: 'Bidhaa za zamani hazina ujazo wa chupa: NEEDS_REVIEW kabla ya kulinganisha bei kwa lita.' },
  { source: 'sellerForm.prodBulkUnit', legacy: 'Box', unitId: 'box', action: 'MAP_PER_PRODUCT_CONTENT', note: 'content = prodConversionRatio × baseUnit' },
  { source: 'sellerForm.prodBulkUnit', legacy: 'Carton', unitId: 'carton', action: 'MAP_PER_PRODUCT_CONTENT', note: 'content = prodConversionRatio × baseUnit' },
  { source: 'sellerForm.prodBulkUnit', legacy: 'Crate', unitId: 'crate', action: 'MAP_PER_PRODUCT_CONTENT', note: 'content = prodConversionRatio × baseUnit' },
  { source: 'sellerForm.prodBulkUnit', legacy: 'Sack', unitId: 'gunia', action: 'MAP_PER_PRODUCT_CONTENT', note: 'content = prodConversionRatio × baseUnit' },
  { source: 'sellerForm.prodBulkUnit', legacy: 'Bag', unitId: 'bag', action: 'MAP_PER_PRODUCT_CONTENT', note: 'content = prodConversionRatio × baseUnit' },
  { source: 'sellerForm.prodBulkUnit', legacy: 'Tray', unitId: 'tray', action: 'MAP_PER_PRODUCT_CONTENT', note: 'content = prodConversionRatio × baseUnit' },
  { source: 'pos.offInvUnit', legacy: 'Piece', unitId: 'piece', action: 'MAP' },
  { source: 'pos.offInvUnit', legacy: 'Box', unitId: 'box', action: 'MAP_PER_PRODUCT_CONTENT', note: 'Lebo ya POS ni “Box (Katoni)”; content = pcsPerUnit pieces. Stock ya POS tayari iko kwa pieces.' },
];

export const UNIT_RULES = [
  'Bei huhifadhiwa kwa TZS (integer, senti hazitumiki) + priceUnit (unitId) + optional pricePerBaseUnit iliyokokotolewa kwa vitengo convertible tu.',
  'Stock huhifadhiwa kwa stockUnit moja kwa variant; mabadiliko kati ya vitengo hufanywa kwa conversion ya registry, kamwe kwa maandishi ya seller.',
  'Vitengo vya PACKAGING/convertible=false vinahitaji contentQuantity + contentUnit ili kulinganisha bei (e.g. gunia 90 kg).',
  'Kwa huduma: priceModel ∈ {fixed, per_hour, per_day, per_session, per_unit, quote}; unit inatoka TIME/SERVICE.',
];

// ---- Attribute templates ------------------------------------------------------------
// Attribute IDs reuse ATTRIBUTE_REGISTRY ids where they exist (ATTR-<LABEL>). New ones flagged new:true.
export const COMMON_PRODUCT_ATTRIBUTES = [
  { id: 'ATTR-BRAND', group: 'identity', required: 'optional', facet: true },
  { id: 'ATTR-MODEL', group: 'identity', required: 'optional', facet: false },
  { id: 'ATTR-CONDITION', group: 'listing', required: 'required', facet: true, values: ['new', 'used', 'refurbished', 'for_parts', 'open_box'], overlay: 'CAT-39' },
  { id: 'ATTR-SALE_MODE', group: 'listing', required: 'optional', facet: true, values: ['retail', 'wholesale', 'bulk', 'trade'], overlay: 'CAT-40', new: true },
  { id: 'ATTR-ORIGIN', group: 'listing', required: 'optional', facet: true },
  { id: 'ATTR-GTIN', group: 'identity', required: 'optional', facet: false, validation: { pattern: '^[0-9]{8}$|^[0-9]{12,14}$', checkDigit: 'GS1' }, new: true },
  { id: 'ATTR-REG_NUMBER', group: 'compliance', required: 'conditional', when: 'leaf has REG-TMDA|REG-TPHPA|REG-TFRA', new: true },
  { id: 'ATTR-TYPE_APPROVAL', group: 'compliance', required: 'conditional', when: 'leaf has REG-TCRA', new: true },
  { id: 'ATTR-SELLER_LICENCE', group: 'compliance', required: 'conditional', when: 'leaf has REG-PHARMACY|REG-MINING|REG-UNVERIFIED-*', scope: 'seller', new: true },
  { id: 'ATTR-EXPIRY', group: 'compliance', required: 'conditional', when: 'perishable|medicine|cosmetic', new: true },
  { id: 'ATTR-WARRANTY', group: 'after_sale', required: 'optional', facet: true },
];
export const COMMON_SERVICE_ATTRIBUTES = [
  { id: 'ATTR-SVC_AREA', group: 'coverage', required: 'required', facet: true, note: 'Mkoa/wilaya/kata; au remote' },
  { id: 'ATTR-SVC_MODE', group: 'coverage', required: 'required', facet: true, values: ['onsite_customer', 'at_provider', 'remote'] },
  { id: 'ATTR-PRICE_MODEL', group: 'pricing', required: 'required', facet: true, values: ['fixed', 'per_hour', 'per_day', 'per_session', 'per_unit', 'quote'] },
  { id: 'ATTR-DURATION', group: 'pricing', required: 'optional', unitGroup: 'TIME' },
  { id: 'ATTR-AVAILABILITY', group: 'scheduling', required: 'optional', facet: true },
  { id: 'ATTR-QUALIFICATION', group: 'trust', required: 'optional' },
  { id: 'ATTR-SELLER_LICENCE', group: 'compliance', required: 'conditional', when: 'leaf has REG-*' },
  { id: 'ATTR-EXPERIENCE_YEARS', group: 'trust', required: 'optional', facet: true },
];

// ---- Variant compatibility by category family --------------------------------------
// axes = attributes allowed as variant axes; forbidden = never variants (create a new listing).
export const VARIANT_FAMILIES = {
  apparel:      { cats: ['CAT-07', 'CAT-29'], axes: ['Size', 'Colour', 'Material'], forbidden: ['Brand', 'Gender', 'Condition'], note: 'Gender/age ni attribute ya leaf, si variant.' },
  footwear:     { cats: [], axes: ['Shoe Size', 'Colour', 'Width'], forbidden: ['Brand', 'Condition'] },
  beauty:       { cats: ['CAT-08'], axes: ['Volume', 'Shade', 'Scent', 'Pack Size'], forbidden: ['Ingredients', 'Expiry'], note: 'Expiry ni sifa ya batch (inventory lot), si variant.' },
  food_fresh:   { cats: ['CAT-01', 'CAT-03'], axes: ['Weight', 'Pack Size', 'Grade', 'Variety'], forbidden: ['Origin+Organic combined with different price unit'], note: 'Variants lazima ziwe na unitGroup moja (WEIGHT au COUNT, si zote mbili).' },
  livestock:    { cats: ['CAT-04', 'CAT-05'], axes: ['Weight', 'Age Band', 'Sex'], forbidden: ['Breed'], note: 'Mnyama hai mmoja = listing moja; variants kwa lots tu.' },
  electronics:  { cats: ['CAT-11', 'CAT-12', 'CAT-13'], axes: ['Storage', 'RAM', 'Colour', 'Screen Size', 'Capacity'], forbidden: ['Model', 'Condition', 'Serial Number'], invalid: [['Storage', 'unitGroup!=DATA']], note: 'Model tofauti = product tofauti.' },
  unique_assets: { cats: ['CAT-14', 'CAT-42'], axes: [], forbidden: ['*'], note: 'Kila gari/mali ni kipengee cha kipekee (VIN/plot no.) — hakuna variants.' },
  parts:        { cats: ['CAT-15'], axes: ['Fitment Position', 'Pack Size'], forbidden: ['Vehicle Make/Model'], note: 'Fitment ni compatibility list, si variant.' },
  hardware:     { cats: ['CAT-10', 'CAT-33', 'CAT-34', 'CAT-35', 'CAT-36'], axes: ['Size', 'Length', 'Diameter', 'Gauge', 'Capacity', 'Power Rating', 'Pack Size', 'Colour'], forbidden: ['Brand', 'Standard/Grade mixing'] },
  furniture:    { cats: ['CAT-09'], axes: ['Colour', 'Material', 'Size'], forbidden: ['Brand'] },
  media_books:  { cats: ['CAT-45', 'CAT-38'], axes: ['Format', 'Language', 'Edition'], forbidden: ['Title', 'Author'], note: 'Kichwa tofauti = product tofauti.' },
  sports_toys:  { cats: ['CAT-46', 'CAT-47', 'CAT-30', 'CAT-31'], axes: ['Size', 'Colour', 'Weight', 'Age Band', 'Pack Size'], forbidden: ['Brand'] },
  arts_culture: { cats: ['CAT-27', 'CAT-28'], axes: ['Size', 'Colour', 'Material'], forbidden: ['*unique'], note: 'Kazi ya kipekee (one-of-a-kind) haina variants; prints/replicas zinaruhusiwa.' },
  stationery_packaging: { cats: ['CAT-32', 'CAT-37', 'CAT-49', 'CAT-48'], axes: ['Size', 'Pack Size', 'Colour', 'Grade/Concentration', 'Volume'], forbidden: ['Hazard Class'] },
  bulk_commodities: { cats: ['CAT-43', 'CAT-06', 'CAT-02'], axes: ['Grade', 'Weight', 'Pack Size'], forbidden: ['Origin licence'] },
  digital:      { cats: [], axes: ['Licence Tier', 'Duration', 'Seats'], forbidden: ['Platform mixing without SKU'] },
  services:     { cats: ['CAT-16', 'CAT-17', 'CAT-18', 'CAT-19', 'CAT-20', 'CAT-21', 'CAT-22', 'CAT-23', 'CAT-24', 'CAT-25', 'CAT-26'], axes: ['Package/Tier', 'Duration', 'Room Type', 'Group Size'], forbidden: ['Service Area'], note: 'Huduma hutumia "packages" badala ya stock; capacity = slots.' },
};
export const VARIANT_RULES_GLOBAL = [
  'Kila variant ina variantId thabiti, SKU ya kipekee ndani ya store, bei yake (au inarithi), stock yake kwa kila location, na hali (active/archived).',
  'Variant axes lazima zitoke kwenye VARIANT_FAMILIES[family].axes; "Other (Specify)" value inaruhusiwa lakini huenda NEEDS_REVIEW.',
  'Upeo: axes 3, combinations 100 kwa product (pendekezo la UX/perf).',
  'Product.stock ni jumla iliyokokotolewa (derived) ya variants — haiandikwi na client (inashughulikia TX-H3).',
];
