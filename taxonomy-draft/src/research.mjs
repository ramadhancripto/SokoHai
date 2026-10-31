// SokoHai taxonomy DRAFT — research sources and sector layer.
// Haitumiwi na runtime. Haibadilishi shared/canonical-taxonomy-data.js.
// "researched" = fact taken from the source; "proposal" = SokoHai design choice informed by it.

export const RESEARCH_DATE = '2026-10-31';

export const SOURCES = {
  'SRC-GS1-GPC': {
    title: 'GS1 Global Product Classification (GPC)',
    urls: [
      'https://www.gs1uk.org/knowledge-hub/product-identification/what-is-global-product-classification-gpc',
      'https://gs1.se/en/standards-and-services/global-product-classification-gpc/',
      'https://www.gs1.nl/media/sfpiaxye/gpc-in-a-nutshell_jun24-def.pdf',
    ],
    accessed: RESEARCH_DATE,
    researched: 'Four-tier hierarchy Segment > Family > Class > Brick; bricks group products by purpose/form/material and carry brick attributes (attribute types + values). One brick per trade item.',
    informed: ['level model (Main Category > Subcategory > Sub-subcategory > Product type ≈ Segment > Family > Class > Brick)', 'attribute-on-leaf model', 'externalRefs.gpcBrick field'],
  },
  'SRC-UNSPSC': {
    title: 'UNSPSC (United Nations Standard Products and Services Code)',
    urls: ['https://en.wikipedia.org/wiki/UNSPSC', 'https://www.onetcenter.org/dictionary/30.0/text/unspsc_reference.html'],
    accessed: RESEARCH_DATE,
    researched: '8-digit Segment/Family/Class/Commodity (2 digits each) + optional 2-digit business function; UNDP has managed change requests and releases since 1 Jan 2025 (GS1 US until end-2024); UNv26.0801 lists 158,448 items. Covers products AND services in one code set.',
    informed: ['single tree for products + services (type = product | service | both)', 'externalRefs.unspsc field', 'Chemicals & Laboratory category (UNSPSC has dedicated chemical and laboratory/measuring segments)'],
  },
  'SRC-UN-CPC': {
    title: 'UN Central Product Classification CPC Ver. 2.1',
    urls: [
      'https://unstats.un.org/unsd/classifications/Econ/cpc',
      'https://unstats.un.org/unsd/classifications/unsdclassifications/cpcv21.pdf',
    ],
    accessed: RESEARCH_DATE,
    researched: 'Classifies goods AND services; CPC 2.1 is the latest version with complete published materials (CPC 3.0 forthcoming); correspondence tables to HS 2012/2017 and ISIC Rev.4. Service sections 5–9 (e.g. div. 63 accommodation & food serving, 64–68 transport/postal/courier, 71 financial, 82–83 legal/accounting/professional, 85 support services, 87 maintenance & repair, 92 education, 93 health & social, 96 recreation/culture/sport, 97 other services incl. laundry & personal care).',
    informed: ['service-domain subcategories for CAT-16..CAT-26', 'externalRefs.cpc field (division level)'],
  },
  'SRC-ISIC': {
    title: 'ISIC Rev.4 (International Standard Industrial Classification)',
    urls: ['https://unstats.un.org/unsd/classifications/Econ/isic', 'https://unstats.un.org/unsd/classifications/Econ/Download/In Text/ISIC_Rev_4_publication_English.pdf'],
    accessed: RESEARCH_DATE,
    researched: 'Industry (activity) classification with sections A–U (A agriculture/forestry/fishing, B mining, C manufacturing, F construction, G trade, H transport, I accommodation & food, J information & communication, K finance, L real estate, M professional, N administrative support, P education, Q health, R arts/entertainment, S other services).',
    informed: ['Sector (level 0) grouping and isicSections tags on sectors'],
  },
  'SRC-GOOGLE-PT': {
    title: 'Google Merchant Center product taxonomy',
    urls: ['https://webappick.com/google-product-category-taxonomy-guide/', 'https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt'],
    accessed: RESEARCH_DATE,
    researched: '21 top-level categories (Animals & Pet Supplies, Apparel & Accessories, Arts & Entertainment, Baby & Toddler, Business & Industrial, Cameras & Optics, Electronics, Food Beverages & Tobacco, Furniture, Hardware, Health & Beauty, Home & Garden, Luggage & Bags, Mature, Media, Office Supplies, Religious & Ceremonial, Software, Sporting Goods, Toys & Games, Vehicles & Parts); 5,595 categories in the 2021-09-21 file; up to 7 levels; numeric IDs reused across languages.',
    informed: ['gap detection (Media/Books, Sporting Goods, Toys & Games, Luggage & Bags, Religious & Ceremonial, Jewelry & Watches)', 'numeric/stable-ID policy', 'externalRefs.googleCategoryId field'],
  },
  'SRC-JUMIA': {
    title: 'Jumia Kenya storefront (African marketplace reference)',
    urls: ['https://www.jumia.co.ke/'],
    accessed: RESEARCH_DATE,
    researched: 'Retail navigation centred on Phones & Tablets, Computing, Fashion (women/men), Beauty, Home appliances.',
    informed: ['buyer-facing ordering of sectors and displayName style'],
  },
  'SRC-TZ-TMDA-TBS': {
    title: 'Tanzania — TMDA and TBS product regulation',
    urls: [
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC11482716',
      'https://newscentraltv.com/?p=20889',
      'https://dailynews.co.tz/?p=30058',
      'https://omcmedical.com/tanzania-medical-device-registration',
    ],
    accessed: RESEARCH_DATE,
    researched: 'TMDA regulates medicines, medical devices and diagnostics; regulation of cosmetics and food moved to TBS (2019 Finance Act change). TBS also runs product standards / import conformity.',
    informed: ['regulatory flags REG-TMDA (CAT-19 medicines/devices, CAT-04/31 vet medicines) and REG-TBS (food, cosmetics, building materials)'],
  },
  'SRC-TZ-TCRA': {
    title: 'TCRA — type approval of electronic communication equipment',
    urls: [
      'https://tcra.go.tz/faq/frequent-asked-questions-on-type-approval-of-electronic-communication-equipment',
      'https://www.tcra.go.tz/download/sw-1619019748-Guidelines%20and%20Fees%20for%20Type%20Approval%20of%20Telecommunications%20or%20Radio-communications%20Equipment.pdf',
    ],
    accessed: RESEARCH_DATE,
    researched: 'Telecommunication/radio-communication equipment requires TCRA type approval before sale/use in Tanzania.',
    informed: ['regulatory flag REG-TCRA on CAT-12 and radio/networking leaves'],
  },
  'SRC-TZ-TPHPA': {
    title: 'TPHPA — pesticide control',
    urls: [
      'https://www.thecitizen.co.tz/tanzania/news/national/tanzania-pulls-805-hazardous-pesticides-off-market-enforces-import-ban-5335008',
      'https://dailynews.co.tz/tphpa-removes-245-pesticides-from-market-after-they-failed-to-meet-legal-standards/',
      'https://www.thecitizen.co.tz/tanzania/news/national/tanzania-bans-44-pesticides-unsafe-for-human-health-and-the-environment-4203210',
    ],
    accessed: RESEARCH_DATE,
    researched: 'On 22 Jan 2026 TPHPA withdrew 805 pesticide products (e.g. paraquat, dimethoate, acephate) and banned their import; earlier removals of 245 and bans of 44 highly hazardous pesticides.',
    informed: ['REG-TPHPA flag + mandatory registrationNumber attribute on crop-protection leaves', 'moderation rule: block listing of withdrawn products'],
  },
  'SRC-TZ-TFRA': {
    title: 'TFRA — fertilizer regulation (Fertilizers Act 2009)',
    urls: ['https://policyvault.africa/wp-content/uploads/2024/11/Fertilizers-Act-2009.pdf', 'https://www.aecfafrica.org/wp-content/uploads/2022/08/Registering-and-Certifying-Agricultural-Inputs-in-Tanzania.pdf'],
    accessed: RESEARCH_DATE,
    researched: 'Fertilizers and fertilizer dealers must be registered under the Fertilizers Act 2009 administered by TFRA; agricultural inputs (seeds, pesticides, fertilizer) each have registration/certification routes.',
    informed: ['REG-TFRA flag on CAT-02 Mbolea'],
  },
  'SRC-TZ-MINING': {
    title: 'Tanzania Mining Commission — mineral trading licences',
    urls: [
      'https://tz.cmadvocates.com/wp-content/uploads/2023/04/THE-LEGAL-AND-PROCEDURAL-REQUIREMENTS-FOR-ESTABLISHING-MINERAL-TRADING-AND-EXPORT-OPERATIONS-IN-TANZANIA.pdf',
      'https://tanzlii.org/akn/tz/act/gn/1999/215',
      'https://www.tanzaniainvest.com/mining/mining-licences-2024-2025-issued-revoked-warnings',
    ],
    accessed: RESEARCH_DATE,
    researched: 'Trading minerals (gold, gemstones incl. tanzanite) requires broker/dealer licences issued under the Mining Act and Mineral Trading Regulations.',
    informed: ['REG-MINING flag on CAT-43 and gemstone jewellery; listing requires licence number + admin verification'],
  },
  'SRC-TZ-ECON': {
    title: 'Tanzania economic structure (agriculture weight)',
    urls: ['https://tanzaniainvest.com/agriculture', 'https://www.theglobaleconomy.com/Tanzania/Employment_in_agriculture/', 'https://knowledge4policy.ec.europa.eu/publication/tanzania%E2%80%99s-agrifood-system-structure-drivers-transformation_en'],
    accessed: RESEARCH_DATE,
    researched: 'Agriculture is roughly a quarter of GDP and the largest employer; key crops maize, rice, cassava, beans, cashew, coffee, tea, cotton, tobacco, sisal, sesame, cloves.',
    informed: ['depth priority: agriculture/food/livestock branches get the deepest type coverage first', 'local units (gunia, debe, tenga)'],
  },
};

// Level 0 — Sector (proposal; grouping informed by ISIC sections + Google top-levels).
export const SECTORS = [
  { id: 'SEC-01', sw: 'Chakula, Kilimo & Rasilimali Hai', en: 'Food, Agriculture & Natural Resources', isic: ['A', 'C10-C12'], cats: ['CAT-01', 'CAT-02', 'CAT-03', 'CAT-04', 'CAT-05', 'CAT-06'] },
  { id: 'SEC-02', sw: 'Mitindo, Urembo & Binafsi', en: 'Fashion, Beauty & Personal', isic: ['C13-C15', 'C20.4', 'G47'], cats: ['CAT-07', 'CAT-08'] },
  { id: 'SEC-03', sw: 'Nyumba, Ujenzi & Hardware', en: 'Home, Construction & Hardware', isic: ['C16', 'C23', 'C31', 'F'], cats: ['CAT-09', 'CAT-10'] },
  { id: 'SEC-04', sw: 'Teknolojia & Electronics', en: 'Technology & Electronics', isic: ['C26-C27', 'J61'], cats: ['CAT-11', 'CAT-12', 'CAT-13'] },
  { id: 'SEC-05', sw: 'Magari, Usafiri & Logistics', en: 'Vehicles, Transport & Logistics', isic: ['C29-C30', 'G45', 'H'], cats: ['CAT-14', 'CAT-15', 'CAT-16'] },
  { id: 'SEC-06', sw: 'Afya & Ustawi', en: 'Health & Wellbeing', isic: ['C21', 'Q'], cats: ['CAT-19'] },
  { id: 'SEC-07', sw: 'Familia, Watoto, Wanyama Vipenzi & Michezo', en: 'Family, Kids, Pets & Sport', isic: ['C32', 'G47'], cats: ['CAT-30', 'CAT-31', 'CAT-46', 'CAT-47'] },
  { id: 'SEC-08', sw: 'Elimu, Ofisi, Media & Digital', en: 'Education, Office, Media & Digital', isic: ['C17-C18', 'J58-J63', 'P'], cats: ['CAT-32', 'CAT-45', 'CAT-37', 'CAT-38', 'CAT-20'] },
  { id: 'SEC-09', sw: 'Sanaa, Utamaduni & Sherehe', en: 'Arts, Culture & Celebrations', isic: ['R90-R91', 'C32'], cats: ['CAT-27', 'CAT-28', 'CAT-29'] },
  { id: 'SEC-10', sw: 'Viwanda, Nishati, Mazingira & Usalama', en: 'Industry, Energy, Environment & Safety', isic: ['C20', 'C28', 'D', 'E', 'N80'], cats: ['CAT-33', 'CAT-48', 'CAT-49', 'CAT-34', 'CAT-35', 'CAT-36'] },
  { id: 'SEC-11', sw: 'Ardhi, Mali Isiyohamishika & Madini', en: 'Land, Real Estate & Minerals', isic: ['B', 'L'], cats: ['CAT-42', 'CAT-43'] },
  { id: 'SEC-12', sw: 'Huduma za Nyumbani & Ufundi', en: 'Home & Repair Services', isic: ['S95-S96', 'N81', 'T97'], cats: ['CAT-17', 'CAT-18'] },
  { id: 'SEC-13', sw: 'Huduma za Kitaalamu, Fedha & Ajira', en: 'Professional, Financial & Employment Services', isic: ['K', 'M', 'N78'], cats: ['CAT-21', 'CAT-22', 'CAT-23'] },
  { id: 'SEC-14', sw: 'Ukarimu, Utalii, Chakula & Burudani', en: 'Hospitality, Tourism, Dining & Entertainment', isic: ['I', 'N79', 'R93'], cats: ['CAT-24', 'CAT-25', 'CAT-26'] },
  { id: 'SEC-99', sw: 'Nyingine / Haijapangwa', en: 'Other / Unclassified', isic: [], cats: ['CAT-44'], system: true },
];

// Overlays are NOT tree nodes: they are listing dimensions that apply to any leaf.
export const OVERLAY_POLICY = {
  'CAT-39': { dimension: 'condition', values: ['new', 'used', 'refurbished', 'for_parts', 'open_box'] },
  'CAT-40': { dimension: 'saleMode', values: ['retail', 'wholesale', 'bulk', 'trade'] },
  'CAT-41': { dimension: 'tradeOrigin', values: ['local', 'imported', 'export_ready', 'cross_border'] },
};

// Regulatory flags (researched → proposal of enforcement).
export const REGULATORY_FLAGS = {
  'REG-TMDA': { sw: 'Inahitaji usajili/kibali cha TMDA', en: 'TMDA registration required', source: 'SRC-TZ-TMDA-TBS', requiredAttributes: ['ATTR-REG_NUMBER'], moderation: 'PRE_APPROVAL' },
  'REG-PHARMACY': { sw: 'Uuzaji kupitia famasia/ADDO yenye leseni pekee', en: 'Licensed pharmacy / ADDO seller only', source: 'SRC-TZ-TMDA-TBS', requiredAttributes: ['ATTR-SELLER_LICENCE'], moderation: 'SELLER_VERIFIED' },
  'REG-TBS': { sw: 'Kiwango cha TBS / alama ya ubora', en: 'TBS standard / quality mark', source: 'SRC-TZ-TMDA-TBS', requiredAttributes: [], moderation: 'POST_REVIEW' },
  'REG-TCRA': { sw: 'Type approval ya TCRA', en: 'TCRA type approval', source: 'SRC-TZ-TCRA', requiredAttributes: ['ATTR-TYPE_APPROVAL'], moderation: 'POST_REVIEW' },
  'REG-TPHPA': { sw: 'Usajili wa TPHPA (viuatilifu)', en: 'TPHPA pesticide registration', source: 'SRC-TZ-TPHPA', requiredAttributes: ['ATTR-REG_NUMBER'], moderation: 'PRE_APPROVAL' },
  'REG-TFRA': { sw: 'Usajili wa TFRA (mbolea)', en: 'TFRA fertilizer registration', source: 'SRC-TZ-TFRA', requiredAttributes: ['ATTR-REG_NUMBER'], moderation: 'POST_REVIEW' },
  'REG-MINING': { sw: 'Leseni ya Tume ya Madini (broker/dealer)', en: 'Mining Commission broker/dealer licence', source: 'SRC-TZ-MINING', requiredAttributes: ['ATTR-SELLER_LICENCE'], moderation: 'PRE_APPROVAL' },
  'REG-UNVERIFIED-HEALTH': { sw: 'Huduma ya afya — leseni ya kituo/mtaalamu (mamlaka haijathibitishwa kwenye utafiti huu)', en: 'Health facility / practitioner licence (regulator not verified in this research)', source: null, requiredAttributes: ['ATTR-SELLER_LICENCE'], moderation: 'PRE_APPROVAL' },
  'REG-UNVERIFIED-FIN': { sw: 'Huduma ya fedha/bima — leseni ya mamlaka husika (haijathibitishwa kwenye utafiti huu)', en: 'Financial/insurance licence (regulator not verified in this research)', source: null, requiredAttributes: ['ATTR-SELLER_LICENCE'], moderation: 'PRE_APPROVAL' },
};
