// Proposed ADDITIONS to the canonical taxonomy (DRAFT, needs owner approval).
// Each entry: parent, names (sw|en), description, rationale, sourceRefs.
// Types are written "Swahili|English". Brands and variants (size/colour) are NOT types.

const T = (...xs) => xs; // readability helper

// ---- New main categories (level 1) -------------------------------------------------
export const NEW_CATEGORIES = [
  {
    id: 'CAT-45', sector: 'SEC-08', kind: 'PRODUCT_DOMAIN', type: 'product',
    sw: 'Vitabu, Muziki & Media', en: 'Books, Music & Media',
    description: 'Vitabu vya aina zote (si vya shule pekee), majarida, muziki na filamu kwenye media ya kushikika.',
    rationale: 'Google "Media" ni top-level; SokoHai ina vitabu vya elimu tu (CAT-32). Legacy "Vitabu na Elimu" haijapangwa.',
    sourceRefs: ['SRC-GOOGLE-PT'], legacyFrom: ['Vitabu na Elimu (Education)'],
    subs: [
      ['Vitabu vya Hadithi & Riwaya', 'Fiction & Novels', T('Riwaya|Novel', 'Hadithi Fupi|Short Stories', 'Mashairi|Poetry', 'Tamthilia|Drama / Play')],
      ['Vitabu Visivyo vya Hadithi', 'Non-fiction Books', T('Wasifu|Biography', 'Historia|History', 'Biashara & Ujasiriamali|Business & Entrepreneurship', 'Kujiendeleza|Self-help', 'Sayansi & Teknolojia|Science & Technology', 'Mapishi|Cookbook', 'Kilimo & Ufugaji|Agriculture Guide')],
      ['Vitabu vya Watoto', "Children's Books", T('Vitabu vya Picha|Picture Book', 'Vitabu vya Kujifunza Kusoma|Early Reader', 'Vitabu vya Kuchora/Kupaka Rangi|Colouring Book')],
      ['Vitabu vya Dini', 'Religious Books', T('Biblia|Bible', 'Kurani|Quran', 'Vitabu vya Mafundisho ya Dini|Religious Teaching Book', 'Vitabu vya Nyimbo za Dini|Hymn Book')],
      ['Kamusi & Marejeo', 'Dictionaries & Reference', T('Kamusi|Dictionary', 'Ensaiklopidia|Encyclopedia', 'Atlasi & Ramani|Atlas & Maps')],
      ['Majarida & Magazeti', 'Magazines & Newspapers', T('Gazeti|Newspaper', 'Jarida|Magazine', 'Usajili wa Jarida|Periodical Subscription')],
      ['Comics & Vitabu vya Picha', 'Comics & Graphic Novels', T('Comic|Comic Book', 'Graphic Novel|Graphic Novel')],
      ['Muziki wa Kushikika', 'Physical Music Media', T('CD ya Muziki|Music CD', 'Santuri / Vinyl|Vinyl Record', 'Kaseti|Cassette')],
      ['Filamu & Video', 'Films & Video Media', T('DVD ya Filamu|Film DVD', 'Blu-ray|Blu-ray Disc', 'Filamu ya Elimu|Educational Video')],
      ['Vitabu vya Mitumba', 'Second-hand Books', T('Kitabu cha Mitumba|Used Book', 'Mkusanyiko wa Vitabu|Book Lot')],
    ],
    regulatory: [],
  },
  {
    id: 'CAT-46', sector: 'SEC-07', kind: 'PRODUCT_DOMAIN', type: 'product',
    sw: 'Michezo, Mazoezi & Burudani ya Nje', en: 'Sports, Fitness & Outdoor',
    description: 'Vifaa vya michezo ya timu na binafsi, mazoezi/gym, baiskeli za michezo, kambi na shughuli za nje.',
    rationale: 'Google "Sporting Goods" ni top-level; SokoHai ina sportswear tu (CAT-07). Legacy "Michezo na Mazoezi" haijapangwa.',
    sourceRefs: ['SRC-GOOGLE-PT'], legacyFrom: ['Michezo na Mazoezi (Sports)'],
    subs: [
      ['Mpira wa Miguu', 'Football', T('Mpira wa Miguu|Football', 'Viatu vya Mpira|Football Boots', 'Jezi za Timu|Team Jersey', 'Glovu za Golikipa|Goalkeeper Gloves', 'Goli & Neti|Goal Post & Net', 'Shin Guards|Shin Guards')],
      ['Mpira wa Kikapu, Wavu & Netiboli', 'Basketball, Volleyball & Netball', T('Mpira wa Kikapu|Basketball', 'Mpira wa Wavu|Volleyball', 'Mpira wa Netiboli|Netball', 'Goli/Hoop la Kikapu|Basketball Hoop', 'Neti ya Wavu|Volleyball Net')],
      ['Michezo ya Raketi', 'Racket Sports', T('Raketi ya Tenisi|Tennis Racket', 'Mpira wa Tenisi|Tennis Ball', 'Badminton|Badminton Set', 'Tenisi ya Meza|Table Tennis Set')],
      ['Riadha & Mbio', 'Athletics & Running', T('Viatu vya Kukimbia|Running Shoes', 'Saa ya Michezo|Sports Watch', 'Vifaa vya Riadha|Athletics Equipment')],
      ['Gym & Mazoezi ya Viungo', 'Gym & Fitness Equipment', T('Dumbbells|Dumbbells', 'Barbell & Uzito|Barbell & Weight Plates', 'Treadmill|Treadmill', 'Baiskeli ya Mazoezi|Exercise Bike', 'Mkeka wa Yoga|Yoga Mat', 'Kamba ya Kuruka|Skipping Rope', 'Resistance Bands|Resistance Bands', 'Benchi la Mazoezi|Weight Bench')],
      ['Ngumi & Michezo ya Mapigano', 'Boxing & Martial Arts', T('Glovu za Ngumi|Boxing Gloves', 'Mfuko wa Kupiga|Punching Bag', 'Vazi la Karate/Judo|Martial Arts Uniform')],
      ['Michezo ya Maji', 'Water Sports', T('Miwani ya Kuogelea|Swimming Goggles', 'Kofia ya Kuogelea|Swim Cap', 'Life Jacket|Life Jacket', 'Vifaa vya Kupiga Mbizi|Snorkelling Gear', 'Ubao wa Surf|Surfboard')],
      ['Baiskeli za Michezo & Vifaa', 'Sport Cycling', T('Baiskeli ya Mlimani|Mountain Bike', 'Baiskeli ya Barabarani|Road Bike', 'Helmeti ya Baiskeli|Cycling Helmet', 'Vifaa vya Baiskeli|Cycling Accessories')],
      ['Kambi & Kupanda Milima', 'Camping & Hiking', T('Hema la Kambi|Camping Tent', 'Mfuko wa Kulalia|Sleeping Bag', 'Begi la Mgongoni la Safari|Hiking Backpack', 'Tochi ya Kichwa|Headlamp', 'Jiko la Kambi|Camping Stove', 'Chupa ya Maji ya Safari|Hydration Bottle')],
      ['Michezo ya Ndani & Meza', 'Indoor & Table Games Equipment', T('Meza ya Pool|Pool Table', 'Bao la Dati|Dartboard', 'Meza ya Foosball|Foosball Table')],
      ['Lishe ya Michezo', 'Sports Nutrition', T('Protini ya Unga|Protein Powder', 'Kinywaji cha Michezo|Sports Drink', 'Energy Bar|Energy Bar')],
      ['Vifaa vya Timu & Klabu', 'Team & Club Equipment', T('Koni za Mazoezi|Training Cones', 'Filimbi|Whistle', 'Ubao wa Mbinu|Tactics Board', 'Medali & Vikombe|Medals & Trophies')],
    ],
    regulatory: [],
  },
  {
    id: 'CAT-47', sector: 'SEC-07', kind: 'PRODUCT_DOMAIN', type: 'product',
    sw: 'Vichezeo & Michezo', en: 'Toys & Games',
    description: 'Vichezeo vya watoto wa umri wote, michezo ya bodi, mafumbo, vichezeo vya kielimu na michezo ya video (vifaa na diski).',
    rationale: 'Google "Toys & Games" ni top-level; SokoHai ina vichezeo vya watoto wachanga (CAT-30) na vya jadi (CAT-28) tu. Legacy "Vichezeo na Michezo" haijapangwa.',
    sourceRefs: ['SRC-GOOGLE-PT'], legacyFrom: ['Vichezeo na Michezo (Toys)'],
    subs: [
      ['Vichezeo vya Kielimu & STEM', 'Educational & STEM Toys', T('Vipande vya Kujenga|Building Blocks', 'Kit ya Sayansi|Science Kit', 'Kit ya Robotiki|Robotics Kit', 'Vichezeo vya Herufi & Namba|Alphabet & Number Toys')],
      ['Midoli & Wanasesere', 'Dolls & Action Figures', T('Mdoli|Doll', 'Action Figure|Action Figure', 'Nyumba ya Mdoli|Dollhouse')],
      ['Magari & Vichezeo vya Rimoti', 'Vehicles & Remote-control Toys', T('Gari la Kuchezea|Toy Car', 'Gari la Rimoti|RC Car', 'Drone ya Kuchezea|Toy Drone', 'Treni ya Kuchezea|Toy Train')],
      ['Michezo ya Bodi & Kadi', 'Board & Card Games', T('Bao|Bao Board Game', 'Drafti|Draughts', 'Chess|Chess', 'Ludo|Ludo', 'Karata|Playing Cards', 'Scrabble/Michezo ya Maneno|Word Game')],
      ['Mafumbo', 'Puzzles', T('Fumbo la Vipande|Jigsaw Puzzle', 'Rubik / Fumbo la Akili|Brain-teaser Puzzle')],
      ['Vichezeo vya Nje', 'Outdoor Toys', T('Bembea|Swing', 'Slide ya Watoto|Kids Slide', 'Baiskeli ya Watoto|Kids Bicycle', 'Scooter|Kick Scooter', 'Trampoline|Trampoline', 'Mpira wa Watoto|Play Ball')],
      ['Vichezeo Laini', 'Soft & Plush Toys', T('Mdoli wa Pamba|Plush Toy', 'Teddy|Teddy Bear')],
      ['Ubunifu & Ufundi wa Watoto', 'Kids Arts & Crafts', T('Kit ya Ufundi|Craft Kit', 'Udongo wa Kuchezea|Play Dough', 'Seti ya Kuchora|Drawing Set')],
      ['Michezo ya Video & Consoles', 'Video Games & Consoles', T('Console ya Michezo|Game Console', 'Diski/Cartridge ya Mchezo|Physical Video Game', 'Kidhibiti cha Mchezo|Game Controller', 'Vifaa vya Gaming|Gaming Accessories')],
      ['Vitu vya Mkusanyiko & Modeli', 'Collectibles & Scale Models', T('Modeli ya Gari/Ndege|Scale Model', 'Kadi za Mkusanyiko|Trading Cards')],
    ],
    regulatory: ['REG-TBS'],
  },
  {
    id: 'CAT-48', sector: 'SEC-10', kind: 'PRODUCT_DOMAIN', type: 'product',
    sw: 'Kemikali, Maabara & Sayansi', en: 'Chemicals, Laboratory & Scientific',
    description: 'Kemikali za viwandani na maabara, vifaa vya maabara ya shule/utafiti, vipimo na vifaa vya kupima.',
    rationale: 'UNSPSC ina segments maalum za kemikali na vifaa vya maabara/vipimo. SokoHai ina kemikali za ujenzi (CAT-10) na maabara ya afya (CAT-19) tu.',
    sourceRefs: ['SRC-UNSPSC'], legacyFrom: [],
    subs: [
      ['Kemikali za Viwandani', 'Industrial Chemicals', T('Asidi|Acid', 'Alkali|Alkali / Base', 'Solvent|Solvent', 'Kemikali za Kutibu Maji|Water Treatment Chemical', 'Kemikali za Kutengeneza Sabuni|Soap-making Chemical')],
      ['Kemikali za Maabara & Reagents', 'Laboratory Chemicals & Reagents', T('Reagent ya Maabara|Laboratory Reagent', 'Kiashiria / Indicator|Chemical Indicator', 'Standard Solution|Standard Solution')],
      ['Vioo & Vifaa vya Maabara', 'Labware & Glassware', T('Beaker|Beaker', 'Test Tube|Test Tube', 'Flask|Flask', 'Pipette|Pipette', 'Burette|Burette')],
      ['Vifaa vya Maabara', 'Laboratory Equipment', T('Hadubini|Microscope', 'Mizani ya Maabara|Laboratory Balance', 'Centrifuge|Centrifuge', 'Incubator ya Maabara|Lab Incubator', 'Fume Hood|Fume Hood')],
      ['Vifaa vya Kupima & Vipimo', 'Measuring & Testing Instruments', T('pH Meter|pH Meter', 'Kipima Joto|Thermometer', 'Multimeter|Multimeter', 'Kipima Unyevu|Moisture Meter', 'Refractometer|Refractometer')],
      ['Vifaa vya Maabara ya Shule', 'School Science Kits', T('Kit ya Fizikia|Physics Kit', 'Kit ya Kemia|Chemistry Kit', 'Kit ya Biolojia|Biology Kit')],
      ['Gesi za Viwandani', 'Industrial Gases', T('Oksijeni ya Viwandani|Industrial Oxygen', 'Acetylene|Acetylene', 'CO2|Carbon Dioxide', 'Nitrogen|Nitrogen')],
      ['Usalama wa Kemikali', 'Chemical Safety & Storage', T('Kabati la Kemikali|Chemical Cabinet', 'Spill Kit|Spill Kit', 'Eyewash Station|Eyewash Station')],
    ],
    regulatory: ['REG-TBS'],
    flagsNote: 'Kemikali hatari zinaweza kuhitaji kibali cha mamlaka ya kemikali — mamlaka husika HAIJATHIBITISHWA katika utafiti huu (NEEDS_HUMAN_DECISION).',
  },
  {
    id: 'CAT-49', sector: 'SEC-10', kind: 'PRODUCT_DOMAIN', type: 'product',
    sw: 'Vifungashio & Vifaa vya Kufunga', en: 'Packaging & Packing Supplies',
    description: 'Vifungashio vya biashara (si branding): mifuko, chupa, makopo, maboksi, vifaa vya kufunga na mashine ndogo za kufunga.',
    rationale: 'Legacy "Vifungashio na Printi" haijapangwa; vifungashio sasa vimetawanyika (CAT-01 Food Packaging, CAT-08 Beauty Packaging, CAT-19 Health Packaging, CAT-29 Gift Packaging, CAT-37 Packaging Branding). Kitengo kimoja cha B2B kinapunguza mgongano.',
    sourceRefs: ['SRC-UNSPSC', 'SRC-GOOGLE-PT'], legacyFrom: ['Vifungashio na Printi (Packaging)'],
    subs: [
      ['Mifuko ya Kufungashia', 'Packaging Bags', T('Mfuko wa Karatasi|Paper Bag', 'Mfuko wa Kitambaa/Non-woven|Non-woven Bag', 'Gunia la Polypropylene|Woven PP Sack', 'Mfuko wa Zip-lock|Zip-lock Bag', 'Pouch ya Chakula|Food Pouch')],
      ['Maboksi & Katoni', 'Boxes & Cartons', T('Katoni|Corrugated Carton', 'Boksi la Pizza/Chakula|Food Box', 'Boksi la Zawadi|Gift Box')],
      ['Chupa, Mitungi & Makopo', 'Bottles, Jars & Containers', T('Chupa ya Plastiki|PET Bottle', 'Chupa ya Kioo|Glass Bottle', 'Mtungi wa Kioo|Glass Jar', 'Ndoo ya Plastiki|Plastic Bucket', 'Dumu / Jerrycan|Jerrycan')],
      ['Vifungashio vya Chakula cha Kuchukua', 'Takeaway Food Packaging', T('Container ya Takeaway|Takeaway Container', 'Kikombe cha Kutupwa|Disposable Cup', 'Kijiko/Uma cha Kutupwa|Disposable Cutlery')],
      ['Vifaa vya Kufunga & Kulinda', 'Packing & Protective Materials', T('Tepu ya Kufungia|Packing Tape', 'Stretch Film|Stretch Film', 'Bubble Wrap|Bubble Wrap', 'Kamba ya Kufungia|Strapping')],
      ['Lebo & Stika za Kifungashio', 'Packaging Labels', T('Lebo Tupu|Blank Label', 'Lebo ya Barcode|Barcode Label Roll')],
      ['Mashine za Kufungashia', 'Packaging Machines', T('Mashine ya Kufunga Mifuko|Bag Sealer', 'Mashine ya Kujaza|Filling Machine', 'Mashine ya Lebo|Labelling Machine', 'Vacuum Sealer|Vacuum Sealer')],
      ['Vifaa vya Logistics & Ghala', 'Logistics & Warehouse Supplies', T('Pallet|Pallet', 'Kreti ya Plastiki|Plastic Crate', 'Toroli la Mizigo|Hand Truck / Trolley', 'Rafu za Ghala|Warehouse Racking', 'Kontena la Kuhifadhi|Storage Container')],
      ['Vifungashio Rafiki kwa Mazingira', 'Eco-friendly Packaging', T('Kifungashio Kinachooza|Biodegradable Packaging', 'Kifungashio cha Karatasi Iliyorejelewa|Recycled Paper Packaging')],
    ],
    regulatory: ['REG-TBS'],
    flagsNote: 'Mifuko ya plastiki ya kubebea imepigwa marufuku Tanzania tangu 2019 — HAIJATHIBITISHWA tena katika utafiti huu; weka kama sheria ya moderation baada ya uthibitisho.',
  },
];

// ---- New subcategories in EXISTING categories (level 2) ----------------------------
export const NEW_SUBCATEGORIES = [
  { parent: 'CAT-07', sw: 'Vito & Saa', en: 'Jewellery & Watches', rationale: 'Google: Apparel & Accessories > Jewelry (incl. Watches). Legacy "Vito na Saa" haijapangwa.', sourceRefs: ['SRC-GOOGLE-PT'],
    types: T('Pete|Ring', 'Mkufu|Necklace', 'Bangili|Bracelet', 'Hereni|Earrings', 'Saa ya Mkono|Wristwatch', 'Saa Janja (fashion)|Fashion Smartwatch', 'Vito vya Dhahabu|Gold Jewellery', 'Vito vya Fedha|Silver Jewellery'), regulatory: [] , note: 'Vito vyenye vito vya thamani (gemstones) → REG-MINING attribute check.' },
  { parent: 'CAT-07', sw: 'Mabegi & Vifaa vya Safari', en: 'Bags & Luggage', rationale: 'Google "Luggage & Bags" ni top-level; CAT-07 ina "Mifuko & Fashion Accessories" tu.', sourceRefs: ['SRC-GOOGLE-PT'],
    types: T('Sanduku la Safari|Suitcase', 'Begi la Mgongoni|Backpack', 'Begi la Laptop|Laptop Bag', 'Begi la Mkononi|Handbag', 'Pochi|Wallet / Purse', 'Begi la Michezo|Duffel / Gym Bag') },
  { parent: 'CAT-14', sw: 'Baiskeli & Vyombo Visivyo na Injini', en: 'Bicycles & Non-motorised Vehicles', rationale: 'Baiskeli ni usafiri muhimu Tanzania; CAT-14 haina kitengo hiki.', sourceRefs: ['SRC-GOOGLE-PT', 'SRC-TZ-ECON'],
    types: T('Baiskeli ya Kawaida|Standard Bicycle', 'Baiskeli ya Mizigo|Cargo Bicycle', 'Baiskeli ya Umeme|E-bike', 'Mkokoteni|Handcart', 'Guta (bila injini)|Pedal Tricycle') },
  { parent: 'CAT-27', sw: 'Vyombo vya Muziki', en: 'Musical Instruments', rationale: 'Google: Arts & Entertainment > Musical Instruments. CAT-28 ina vya jadi tu. Legacy "Sauti na Muziki".', sourceRefs: ['SRC-GOOGLE-PT'],
    types: T('Gitaa|Guitar', 'Kinanda / Keyboard|Keyboard / Piano', 'Ngoma ya Kisasa / Drum Kit|Drum Kit', 'Violin|Violin', 'Saxophone/Tarumbeta|Brass & Wind Instrument', 'Kipaza Sauti cha Studio|Studio Microphone', 'Audio Interface|Audio Interface', 'Mixer ya DJ|DJ Controller / Mixer') },
  { parent: 'CAT-27', sw: 'Vitu vya Kale & Mikusanyiko ya Thamani', en: 'Antiques & Valuable Collectibles', rationale: 'Legacy "Vitu vya Kale na Thamani" haijapangwa; Google: Arts & Entertainment > Collectibles.', sourceRefs: ['SRC-GOOGLE-PT'],
    types: T('Samani ya Kale|Antique Furniture', 'Sarafu za Kale|Collectible Coins', 'Stempu za Mkusanyiko|Collectible Stamps', 'Kazi ya Sanaa ya Kale|Antique Artwork') ,
    note: 'Vitu vya urithi wa kitaifa vinaweza kuzuiwa kuuzwa/kusafirishwa — moderation PRE_APPROVAL; sheria HAIJATHIBITISHWA.' },
  { parent: 'CAT-28', sw: 'Bidhaa za Dini & Ibada', en: 'Religious & Worship Items', rationale: 'Google "Religious & Ceremonial" ni top-level. Legacy "Dini na Utamaduni" haijapangwa.', sourceRefs: ['SRC-GOOGLE-PT'],
    types: T('Msala / Mkeka wa Swala|Prayer Mat', 'Tasbihi|Prayer Beads (Tasbih)', 'Rozari|Rosary', 'Kanzu & Kofia (ibada)|Kanzu & Kofia', 'Msalaba|Cross / Crucifix', 'Ubani & Udi|Incense & Oud', 'Mavazi ya Kwaya/Ibada|Choir & Clergy Robes') },
  { parent: 'CAT-29', sw: 'Zawadi & Maua', en: 'Gifts & Flowers', rationale: 'Legacy "Zawadi na Sherehe" ina Gifts/Flowers/Greeting Cards ambazo CAT-29 haina kama vitengo.', sourceRefs: ['SRC-GOOGLE-PT'],
    types: T('Maua Freshi|Fresh Flowers', 'Maua Bandia|Artificial Flowers', 'Kikapu cha Zawadi|Gift Hamper', 'Kadi ya Salamu|Greeting Card', 'Zawadi Iliyobinafsishwa|Personalised Gift') },
  { parent: 'CAT-33', sw: 'Vifaa vya Usalama Kazini Viwandani', en: 'Industrial Workplace Safety', rationale: 'Pengo: CAT-10 ina PPE ya ujenzi; viwanda vinahitaji usalama maalum (ear/eye/fall).', sourceRefs: ['SRC-UNSPSC'],
    types: T('Kinga ya Masikio|Hearing Protection', 'Harness ya Kuzuia Kuanguka|Fall-arrest Harness', 'Gas Detector|Gas Detector', 'Kizima Moto|Fire Extinguisher') ,
    note: 'Inagusana na CAT-36 Fire Safety (legacy) — tazama ripoti ya mgongano.' },
];

// ---- Sub-subcategory proposals (level 3) — restructure without deleting ------------
// Existing leaves stay ACTIVE; a new grouping node is inserted and the listed leaves get
// a proposed new parent. Applying it is a reversible display-tree change only.
export const SUBSUB_GROUPINGS = [
  { parent: 'CAT-31', groupLeaf: 'Pet Food', children: ['Dog Food', 'Cat Food', 'Rabbit & Small-Animal Food', 'Bird Food', 'Aquarium Fish Food', 'Pet Treats'], rationale: '"Pet Food" ni mzazi wa kimantiki wa vyakula vya kila mnyama; sasa ni ndugu (sibling).' },
  { parent: 'CAT-12', groupLeaf: 'Simu za Mkononi', children: ['Smartphones', 'Simu za Kawaida / Feature Phones', 'Foldable & Specialty Phones'], rationale: '"Simu za Mkononi" ni kundi la aina tatu za simu.' },
  { parent: 'CAT-34', groupLeaf: 'Solar Energy Products', children: ['Solar PV Modules', 'Solar Inverters', 'Solar Charge Controllers', 'Solar Batteries & Energy Storage', 'Solar Kits', 'Solar Mounting & Installation Products', 'Solar Cables & Connectors', 'Solar Lighting', 'Solar Water Heating', 'Solar Water Pumping'], rationale: 'Leaf ya jumla "Solar Energy Products" inakuwa mzazi wa leaves 10 za solar.' },
  { parent: 'CAT-13', groupLeaf: 'Computer Components', children: ['CPUs & Processors', 'Motherboards', 'RAM & Memory', 'Graphics Cards', 'Storage Devices', 'Power Supplies', 'Computer Cases', 'Cooling Systems'], rationale: 'Vipengele 8 ni watoto wa "Computer Components".' },
  { parent: 'CAT-36', groupLeaf: 'CCTV & Video Surveillance', children: ['Security Camera Profile', 'DVR / NVR', 'Surveillance Storage', 'CCTV Accessories'], rationale: 'Kundi la CCTV; "Security Camera Profile" inapendekezwa kubadilishwa jina kuwa "Security Cameras" (label tu).' },
  { parent: 'CAT-42', groupLeaf: 'Viwanja', children: ['Ardhi ya Kilimo', 'Ardhi ya Makazi', 'Ardhi ya Biashara', 'Ardhi ya Viwanda', 'Ardhi ya Ufugaji', 'Ardhi ya Misitu / Asili', 'Ardhi ya Taasisi / Community'], rationale: 'Aina za ardhi ni watoto wa "Viwanja/Ardhi".' },
];

// ---- Mapping of existing category-level ("default") product types onto leaves -------
// Only the leaf assignment is proposed; type IDs stay unchanged.
export const DEFAULT_TYPE_TO_LEAF = {
  'CAT-03': { Mahindi: 'Nafaka', Mchele: 'Nafaka', Maharage: 'Mikunde & Pulses', Korosho: 'Korosho', Kahawa: 'Kahawa', Chai: 'Chai', Nyanya: 'Horticulture — Mboga', Parachichi: 'Horticulture — Matunda' },
  'CAT-07': { 'T-Shirt': '*', Shirt: '*', Dress: 'Nguo za Kike', Trousers: '*', Kitenge: 'Kitenge & Khanga', Khanga: 'Kitenge & Khanga', Sneakers: 'Viatu', 'School Uniform': 'Nguo za Kazi & Uniform' },
  'CAT-08': { 'Face Wash': 'Skincare', 'Body Lotion': 'Bath & Body Care', Shampoo: 'Haircare', Foundation: 'Makeup & Cosmetics', Lipstick: 'Makeup & Cosmetics', Perfume: 'Fragrance & Perfume', Sunscreen: 'Sun Care', 'Hair Dryer': 'Beauty Tools & Equipment' },
  'CAT-09': { Sofa: 'Living Room', Table: 'Samani', Chair: 'Samani', Wardrobe: 'Bedroom', Bed: 'Bedroom', Mattress: 'Mattresses & Bedding', Curtains: 'Curtains & Window Coverings', Rug: 'Rugs, Carpets & Mats', Kitchenware: 'Kitchenware & Tableware' },
  'CAT-10': { Cement: 'Cement, Lime & Binders', 'Building Sand': 'Sand, Aggregates & Fillers', 'Reinforcement Bars': 'Steel & Reinforcement', 'Roofing Sheet': 'Roofing Materials', 'PVC Pipe': 'Plumbing & Water Systems', Tiles: 'Flooring & Wall Finishes', Door: 'Doors, Windows & Frames', Paint: 'Paints, Coatings & Finishes', Hammer: 'Hand Tools', Drill: 'Power Tools' },
  'CAT-11': { 'Smart TV': 'TVs & Home Entertainment', 'Bluetooth Speaker': 'Audio & Speakers', Refrigerator: 'Home Appliances', 'Washing Machine': 'Washing & Laundry', Blender: 'Kitchen Appliances', 'Hair Dryer': 'Personal Care Appliances', Printer: 'Office Electronics' },
  'CAT-12': { Smartphone: 'Smartphones', 'Feature Phone': 'Simu za Kawaida / Feature Phones', Tablet: 'Tablets & Mobile Computing', Router: 'Routers', Modem: 'Mobile Modems & MiFi', 'GPS Tracker': 'GPS & Tracking Devices', 'Walkie-Talkie': 'Communication Radios', Smartwatch: 'Wearables & Communication Devices' },
  'CAT-13': { Laptop: 'Laptops', 'Desktop Computer': 'Desktop Computers', Workstation: 'Workstations', Server: 'Servers', RAM: 'RAM & Memory', SSD: 'Storage Devices', 'Graphics Card': 'Graphics Cards', Monitor: 'Monitors & Displays', Keyboard: 'Keyboards & Mice', Printer: 'Printers' },
  'CAT-14': { Sedan: 'Magari Madogo', SUV: 'SUVs & 4x4', Pickup: 'Pickups', Bus: 'Buses', Truck: 'Trucks', Motorcycle: 'Motorcycles', Trailer: 'Trailers & Semi-Trailers', Boat: 'Boats & Watercraft', 'Electric Vehicle': 'Electric Vehicles' },
  'CAT-15': { 'Brake Pad': 'Braking System', 'Oil Filter': 'Filters', 'Shock Absorber': 'Suspension', Battery: 'Starting & Charging', Headlight: 'Lighting', Tyre: 'Wheels & Tyres', 'Clutch Kit': 'Transmission & Drivetrain', 'Engine Part': 'Engine Parts' },
  'CAT-19': { Tablets: 'Dawa na Medicinal Products', Capsules: 'Dawa na Medicinal Products', Syrups: 'Dawa na Medicinal Products', 'Medical Device': 'Medical Devices', 'Medical Consumable': 'Medical Consumables', 'First Aid Kit': 'First Aid & Emergency Products', 'Health Supplement': 'Health Supplements & Nutrition Products', 'Laboratory Equipment': 'Laboratory Products & Equipment' },
  'CAT-27': { Painting: 'Michoro & Paintings', Sculpture: 'Sculptures & 3D Art', 'Photo Print': 'Photography Products', Poster: 'Posters & Prints', 'Handmade Creative Product': 'Handmade Creative Products', Jewellery: 'Beads, Jewellery & Artistic Accessories', Pottery: 'Pottery, Ceramics & Artistic Clay Products', 'Wood Carving': 'Wood Art & Carving', 'Leather Art': 'Leather Art & Craft', 'Art Material': 'Art Materials — PRODUCTS' },
  'CAT-28': { Kanga: 'Traditional Textiles & Handwoven Fabrics', Basket: 'Vikapu & Weaving Products', 'Traditional Pottery': 'Traditional Pottery & Ceramics', 'Traditional Woodcraft': 'Traditional Woodcraft', Mask: 'Masks & Ceremonial Objects', 'Traditional Jewellery': 'Traditional Jewellery & Ornaments', 'Traditional Musical Instrument': 'Traditional Musical Instruments', 'Traditional Household Product': 'Traditional Household Products', 'Traditional Footwear': 'Traditional Footwear', 'Cultural Souvenir': 'Cultural Souvenirs' },
  'CAT-29': { 'Wedding Dress': 'Wedding Dresses & Bridal Wear', Invitation: 'Wedding Invitations & Stationery', Balloon: 'Balloons & Balloon Products', 'Party Decoration': 'Party Decorations', 'Cake Topper': 'Cake & Dessert Decoration Products', 'Gift Product': 'Party Favors & Guest Gifts', 'Event Sign': 'Event Signs & Boards', 'Party Tableware': 'Party Tableware' },
  'CAT-30': { 'Maternity Wear': 'Maternity Wear', 'Baby Clothing': 'Baby Clothing — Newborn', 'Baby Diaper': 'Baby Diapers', 'Baby Feeding Product': 'Baby Feeding Products', Stroller: 'Strollers & Prams', 'Baby Car Seat': 'Baby Car Seats', 'Baby Toy': 'Baby Toys & Development Products', 'Nursery Product': 'Nursery & Sleeping Products' },
  'CAT-31': { Dog: 'Pets / Companion Animals', Cat: 'Pets / Companion Animals', 'Pet Food': 'Pet Food', 'Pet Bed': 'Pet Beds & Sleeping Products', Kennel: 'Kennels, Cages & Enclosures', Collar: 'Collars, Leashes & Harnesses', 'Pet Toy': 'Pet Toys', Aquarium: 'Aquarium Equipment', 'Pet Grooming Product': 'Pet Grooming Products' },
  'CAT-32': { 'A4 Paper': 'Paper & Paper Products', 'Ballpoint Pen': 'Writing Instruments', Notebook: 'Notebooks & Exercise Books', Register: 'Registers & Business Books', File: 'Files & Folders', 'School Bag': 'School Bags & Cases', Whiteboard: 'Whiteboards & Writing Boards', Textbook: 'Books & Educational Publications', 'Printer Toner': 'Printer & Copier Consumables', 'Custom Printed Stationery': 'Custom Printed Stationery' },
  'CAT-33': { 'Industrial Machine': 'Industrial Machinery', 'Food Processing Machine': 'Food Processing Machinery', Pump: 'Pumps', Compressor: 'Compressors & Air Equipment', 'Welding Machine': 'Welding Equipment', Conveyor: 'Conveyors', 'Machine Component': 'Machine Components', 'Industrial Consumable': 'Industrial Consumables' },
  'CAT-34': { 'Solar Panel': 'Solar PV Modules', 'Solar Inverter': 'Solar Inverters', Battery: 'Batteries — General', Generator: 'Generators', UPS: 'UPS Systems', 'LED Bulb': 'Lighting Products', 'Electrical Cable': 'Cables & Wires', 'EV Charger': 'EV Charging Equipment' },
  'CAT-35': { 'Water Tank': 'Water Tanks', 'Water Filter': 'Water Filtration', 'Purification System': 'Water Purification', 'Water Testing Kit': 'Water Testing Products', 'Water Pump': 'Water Pumps', 'Cleaning Product': 'Hygiene & Cleaning Products', 'Waste Bin': 'Waste Bins & Containers', 'Compost Bin': 'Composting Products' },
  'CAT-36': { Padlock: 'Physical Locks', 'Door Lock': 'Door Locks', 'Smart Lock': 'Smart Locks', Safe: 'Safes & Strongboxes', 'Security Camera': 'Security Camera Profile', 'DVR/NVR': 'DVR / NVR', 'Alarm System': 'Alarm Systems', 'Access Controller': 'Access Control', 'GPS Tracker': 'GPS Tracking' },
  'CAT-37': { 'Business Card': 'Business Cards', Flyer: 'Flyers & Leaflets', Poster: 'Posters', Banner: 'Roll-up Banners', 'Shop Sign': 'Shop Signs', Label: 'Labels & Stickers', 'Display Stand': 'Display Stands', 'Promotional Gift': 'Promotional Gifts' },
  'CAT-38': { Software: 'Software', 'Mobile App': 'Mobile Apps', 'SaaS Product': 'SaaS Products', 'E-book': 'E-books', 'Digital Course': 'Digital Courses', Template: 'Digital Business Templates', 'Stock Photo': 'Stock Photography', 'Digital Media': 'Digital Media', 'Game Code': 'Digital Games', 'Gift Code': 'Digital Gift Products', 'API Access': 'API Access', 'Digital Membership': 'Digital Memberships' },
  'CAT-42': { Land: 'Viwanja', Plot: 'Viwanja', House: 'Nyumba', Apartment: 'Apartments', Room: 'Vyumba / Rooms', Villa: 'Villas', Office: 'Offices', Shop: 'Shops / Retail Spaces', Warehouse: 'Warehouses', Farm: 'Farms', Ranch: 'Ranches', Hotel: 'Hotels / Lodges' },
  'CAT-43': { Gold: 'Precious Metals', Silver: 'Precious Metals', Tanzanite: 'Gemstones', Diamond: 'Gemstones', Ruby: 'Gemstones', Graphite: 'Industrial Minerals', Gypsum: 'Industrial Minerals', Granite: 'Dimension Stone', Sand: 'Sand, Gravel & Clay', Ore: 'Ores', 'Mineral Concentrate': 'Mineral Concentrates', 'Refined Metal': 'Refined Minerals & Metals' },
};
// '*' = applies to several gender/age leaves → becomes a shared type referenced from
// Nguo za Kiume / Nguo za Kike / Nguo za Watoto (type is the garment; gender is an attribute).
export const MULTI_LEAF = { 'CAT-07': ['Nguo za Kiume', 'Nguo za Kike', 'Nguo za Watoto'] };

// ---- Regulatory flag assignment (by category or leaf) -------------------------------
export const REG_ASSIGN = [
  { cat: 'CAT-19', leaves: ['Dawa na Medicinal Products'], flags: ['REG-TMDA', 'REG-PHARMACY'] },
  { cat: 'CAT-19', leaves: ['Medical Devices', 'Hospital & Clinical Equipment', 'Laboratory Products & Equipment', 'Used / Refurbished Medical Equipment', 'Hearing & Assistive Devices'], flags: ['REG-TMDA'] },
  { cat: 'CAT-19', leaves: ['Veterinary Health Products'], flags: ['REG-TMDA'] },
  { cat: 'CAT-04', leaves: ['Animal Health Products'], flags: ['REG-TMDA'] },
  { cat: 'CAT-02', leaves: ['Dawa za Mimea & Crop Protection'], flags: ['REG-TPHPA'] },
  { cat: 'CAT-02', leaves: ['Mbolea'], flags: ['REG-TFRA'] },
  { cat: 'CAT-01', leaves: '*', flags: ['REG-TBS'] },
  { cat: 'CAT-08', leaves: '*', flags: ['REG-TBS'] },
  { cat: 'CAT-10', leaves: ['Cement, Lime & Binders', 'Steel & Reinforcement', 'Roofing Materials', 'Electrical Installation Materials'], flags: ['REG-TBS'] },
  { cat: 'CAT-12', leaves: ['Smartphones', 'Simu za Kawaida / Feature Phones', 'Foldable & Specialty Phones', 'Simu za Mkononi', 'Mobile Modems & MiFi', 'Routers', 'Wi-Fi & Wireless Networking', 'Communication Radios', 'IoT & M2M', 'Antennas & Signal Equipment', 'Tablets & Mobile Computing', 'Wearables & Communication Devices', 'GPS & Tracking Devices'], flags: ['REG-TCRA'] },
  { cat: 'CAT-43', leaves: '*', flags: ['REG-MINING'] },
  { cat: 'CAT-22', leaves: '*', flags: ['REG-UNVERIFIED-FIN'] },
];
