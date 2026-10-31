// Legacy skh.advancedCategories (js/app/00-bootstrap.js) -> draft taxonomy.
// action: KEEP | MAP | MERGE | SPLIT | LEGACY_ALIAS | NEEDS_HUMAN_DECISION
// Category-level row + one row per legacy subcategory (120). Nothing is discarded:
// every legacy name stays as a searchable alias on its target node.
// target leaf "+" prefix = a NEW node proposed in additions.mjs; "@" = overlay dimension.

export const LEGACY_CATEGORIES = {
  'Vyakula na Vinywaji (Food)': { cat: 'CAT-01', action: 'MAP', subs: {
    'Grains & Cereals': 'Nafaka, Unga & Mikunde', 'Cooking Oils': 'Mafuta & Cooking Ingredients', 'Dairy Products': 'Maziwa & Dairy',
    'Snacks & Confectionery': 'Snacks & Sweets', 'Sugar & Sweeteners': 'Food Ingredients', 'Salt Products': 'Food Ingredients',
    'Spices & Seasonings': 'Viungo', 'Bakery Products': 'Bakery', 'Beverages': 'Vinywaji', 'Meat Products': 'Nyama', 'Fish & Seafood': 'Samaki & Seafood' } },
  'Kilimo (Agriculture)': { cat: 'CAT-02', action: 'MAP', subs: {
    'Crop Production': 'CAT-03|Agricultural Bulk Commodities', 'Seeds & Planting': 'Mbegu', 'Fertilizers': 'Mbolea',
    'Pesticides & Herbicides': 'Dawa za Mimea & Crop Protection', 'Farm Tools': 'Zana za Kilimo', 'Irrigation Supplies': 'Umwagiliaji & Water Management' } },
  'Ufugaji (Livestock)': { cat: 'CAT-04', action: 'MAP', subs: {
    'Live Animals': "Ng'ombe", 'Meat & Protein': 'Nyama', 'Dairy & Animal Products': 'Maziwa', 'Animal Feed & Nutrition': 'Livestock Feed',
    'Poultry Products': 'Kuku', 'Fish & Aquaculture': 'CAT-05|Aquaculture' },
    notes: { 'Live Animals': 'NEEDS_HUMAN_DECISION: legacy haitaji spishi — default Ng\'ombe ni pendekezo tu; seller athibitishe spishi.' } },
  'Afya na Pharmacy (Health)': { cat: 'CAT-19', action: 'MAP', subs: {
    'Medicines': 'Dawa na Medicinal Products', 'Medical Supplies': 'Medical Consumables', 'OTC Products': 'Dawa na Medicinal Products',
    'Veterinary Medicines': 'Veterinary Health Products', 'Health Supplements': 'Health Supplements & Nutrition Products', 'Personal Health Care': 'Personal Health & Wellness Products' },
    notes: { 'Medicines': 'Regulated: REG-TMDA + REG-PHARMACY — bidhaa zilizopo zipitiwe kabla ya kuonekana.', 'OTC Products': 'Regulated (TMDA).' } },
  'Mavazi na Fashoni (Fashion)': { cat: 'CAT-07', action: 'MAP', subs: {
    "Men's Wear": 'Nguo za Kiume', "Women's Wear": 'Nguo za Kike', 'Footwear': 'Viatu', 'Kids & Baby Wear': 'Nguo za Watoto' } },
  'Vito na Saa (Luxury)': { cat: 'CAT-07', action: 'SPLIT', subs: {
    'Jewelry': '+Vito & Saa', 'Watches': '+Vito & Saa', 'Luxury Accessories': 'Mifuko & Fashion Accessories', 'Precious Materials & Gems': 'CAT-43|Cut & Polished Gemstones' } },
  'Electronics & Teknoloji (Tech)': { cat: 'CAT-11', action: 'SPLIT', subs: {
    'Mobile Phones': 'CAT-12|Smartphones', 'Computers & Laptops': 'CAT-13|Laptops', 'TVs & Displays': 'TVs & Home Entertainment',
    'Audio Devices': 'Audio & Speakers', 'Gaming Devices': 'CAT-47|+Michezo ya Video & Consoles', 'Office Technology': 'Office Electronics' },
    notes: { 'Mobile Phones': 'Simu za kawaida zitahitaji kuhamishwa kwa mkono (seller confirm) — default Smartphones.', 'Computers & Laptops': 'Desktop → CAT-13 Desktop Computers kwa ukaguzi.' } },
  'Samani na Nyumbani (Home)': { cat: 'CAT-09', action: 'MAP', subs: {
    'Furniture': 'Samani', 'Bedroom Essentials': 'Bedroom', 'Kitchen & Dining': 'Kitchenware & Tableware', 'Home Appliances': 'CAT-11|Home Appliances',
    'Home Decor': 'Home Décor', 'Storage & Organization': 'Home Storage & Organization' } },
  'Ujenzi na Hardware (Hardware)': { cat: 'CAT-10', action: 'MAP', subs: {
    'Building Materials': 'Bricks, Blocks & Masonry', 'Cement & Concrete': 'Cement, Lime & Binders', 'Tools & Equipment': 'Hand Tools',
    'Electrical Supplies': 'Electrical Installation Materials', 'Plumbing Supplies': 'Plumbing & Water Systems', 'Paints & Chemicals': 'Paints, Coatings & Finishes' },
    notes: { 'Building Materials': 'Jina pana — NEEDS_HUMAN_DECISION per product (bricks/roofing/timber).', 'Tools & Equipment': 'Hand vs Power tools — seller confirm.' } },
  'Magari na Vyombo (Automotive)': { cat: 'CAT-14', action: 'SPLIT', subs: {
    'Vehicles': 'Magari Madogo', 'Spare Parts': 'CAT-15|Engine Parts', 'Tyres & Wheels': 'CAT-15|Wheels & Tyres',
    'Batteries & Electrical': 'CAT-15|Starting & Charging', 'Lubricants & Fluids': 'CAT-15|Lubrication' },
    notes: { 'Vehicles': 'Aina ya gari (SUV/pickup/truck) — seller confirm.', 'Spare Parts': 'Jina pana — NEEDS_HUMAN_DECISION per product.' } },
  'Vitabu na Elimu (Education)': { cat: 'CAT-45', action: 'SPLIT', subs: {
    'Books & Publications': 'CAT-45|+Vitabu Visivyo vya Hadithi', 'School Supplies': 'CAT-32|Classroom Products', 'Office Stationery': 'CAT-32|Desk Accessories',
    'Printing & Paper Products': 'CAT-32|Paper & Paper Products', 'Educational Tools': 'CAT-32|Educational Materials' },
    notes: { 'Books & Publications': 'Vitabu vya kiada vibaki CAT-32 "Books & Educational Publications" — seller confirm.' } },
  'Michezo na Mazoezi (Sports)': { cat: 'CAT-46', action: 'MAP', subs: {
    'Sports Equipment': '+Vifaa vya Timu & Klabu', 'Fitness & Gym': '+Gym & Mazoezi ya Viungo', 'Outdoor & Camping': '+Kambi & Kupanda Milima',
    'Sportswear': 'CAT-07|Sportswear & Activewear', 'Accessories': '+Vifaa vya Timu & Klabu' },
    notes: { 'Sports Equipment': 'Jina pana — NEEDS_HUMAN_DECISION (football/racket/...).' } },
  'Vichezeo na Michezo (Toys)': { cat: 'CAT-47', action: 'MAP', subs: {
    'Toys': '+Vichezeo vya Kielimu & STEM', 'Games': '+Michezo ya Bodi & Kadi', 'Puzzles & Brain Games': '+Mafumbo',
    'Collectibles & Models': '+Vitu vya Mkusanyiko & Modeli', 'Creative Kits': '+Ubunifu & Ufundi wa Watoto' },
    notes: { 'Toys': 'Jina pana — NEEDS_HUMAN_DECISION per product.' } },
  'Sauti na Muziki (Music)': { cat: 'CAT-27', action: 'SPLIT', subs: {
    'Musical Instruments': '+Vyombo vya Muziki', 'Audio Systems': 'CAT-11|Audio & Speakers', 'Studio & Recording': 'CAT-37|Audio Recording Equipment', 'DJ Equipment': '+Vyombo vya Muziki' } },
  'Sanaa na Ubunifu (Arts)': { cat: 'CAT-27', action: 'MAP', subs: {
    'Drawing & Painting': 'Michoro & Paintings', 'Craft Materials': 'Art Materials — PRODUCTS', 'Art Tools': 'Art Materials — PRODUCTS', 'DIY Kits': 'Art Collections & Sets', 'Decorative': 'Handmade Creative Products' },
    notes: { 'Drawing & Painting': 'Inaweza kuwa vifaa (materials) badala ya kazi ya sanaa — seller confirm.' } },
  'Dini na Utamaduni (Religion)': { cat: 'CAT-28', action: 'SPLIT', subs: {
    'Religious Books': 'CAT-45|+Vitabu vya Dini', 'Worship Items': '+Bidhaa za Dini & Ibada', 'Clothing & Accessories': '+Bidhaa za Dini & Ibada',
    'Ritual & Ceremonial': 'Masks & Ceremonial Objects', 'Cultural Artifacts': 'Collectible & Heritage Items' } },
  'Zawadi na Sherehe (Gifts)': { cat: 'CAT-29', action: 'MAP', subs: {
    'Gifts': '+Zawadi & Maua', 'Flowers': '+Zawadi & Maua', 'Party Supplies': 'Party Decorations', 'Celebration Decorations': 'Party Decorations', 'Greeting Cards': '+Zawadi & Maua' } },
  'Pet Products (Pet)': { cat: 'CAT-31', action: 'MAP', subs: {
    'Pet Food': 'Pet Food', 'Pet Health': 'Pet Health Products — NON-MEDICINE', 'Pet Accessories': 'Collars, Leashes & Harnesses', 'Pet Housing': 'Kennels, Cages & Enclosures', 'Live Pets': 'Pets / Companion Animals' },
    notes: { 'Pet Health': 'Dawa za wanyama → CAT-19 Veterinary Health Products (REG-TMDA) — seller confirm.' } },
  'Vifungashio na Printi (Packaging)': { cat: 'CAT-49', action: 'SPLIT', subs: {
    'Packaging Materials': '+Mifuko ya Kufungashia', 'Printing Materials': 'CAT-37|Printed Marketing Materials', 'Labelling & Branding': 'CAT-37|Labels & Stickers',
    'Packaging Machines': '+Mashine za Kufungashia', 'Industrial Wrapping': '+Vifaa vya Kufunga & Kulinda' } },
  'Ulinzi na Usalama (Safety)': { cat: 'CAT-36', action: 'MAP', subs: {
    'Personal Safety': 'Personal Security Products', 'Home Security': 'Alarm Systems', 'Surveillance': 'CCTV & Video Surveillance',
    'Fire Safety': 'CAT-33|+Vifaa vya Usalama Kazini Viwandani', 'Security Tools': 'Security Accessories & Consumables' },
    notes: { 'Fire Safety': 'NEEDS_HUMAN_DECISION: CAT-36 haina leaf ya Fire Safety; pendekezo ni kuongeza leaf "Fire Safety" CAT-36 badala ya CAT-33.' } },
  'Biashara ya Jumla (Wholesale)': { cat: '@saleMode', action: 'LEGACY_ALIAS', overlay: 'CAT-40', subs: {
    'Bulk Food': '@saleMode=wholesale + CAT-01', 'Industrial Bulk': '@saleMode=bulk + NEEDS_HUMAN_DECISION' } },
  'Maagizo ya Nje (Import/Export)': { cat: '@tradeOrigin', action: 'LEGACY_ALIAS', overlay: 'CAT-41', subs: {
    'Container Goods': '@tradeOrigin=imported + NEEDS_HUMAN_DECISION' } },
  'Vitu vya Kale na Thamani (Antiques)': { cat: 'CAT-27', action: 'MAP', subs: { 'Antiques': '+Vitu vya Kale & Mikusanyiko ya Thamani' } },
  'Mchanganyiko (General Merchandise)': { cat: 'CAT-44', action: 'NEEDS_HUMAN_DECISION', subs: { 'Mixed Retail': 'CAT-44|OTHER' },
    notes: { 'Mixed Retail': 'Kila bidhaa ipangwe upya na seller/admin; inabaki kuonekana kwa alias.' } },
  'Asili na Utamaduni (Traditional)': { cat: 'CAT-28', action: 'SPLIT', subs: {
    'Traditional Furniture': 'CAT-09|Handmade & Traditional Home Products', 'Honey & Bee Products': 'CAT-04|Nyuki & Ufugaji wa Nyuki', 'Traditional Farm': 'Traditional Agricultural & Rural Tools',
    'Handicrafts': 'Indigenous Natural Craft Products', 'Building Materials': 'CAT-06|Thatch & Natural Roofing Materials', 'Cultural Wear': 'Nguo za Jadi & Traditional Wear' } },
};
