// Service-domain subcategories (DRAFT). Informed by UN CPC 2.1 divisions (SRC-UN-CPC)
// and the live legacy skh.serviceDataMap (72 subcategories). Types are "Swahili|English".
// cpc = CPC 2.1 division (2 digits). Only the division level is cited.

const S = (sw, en, cpc, types, extra = {}) => ({ sw, en, cpc, types, ...extra });

export const SERVICE_SUBCATEGORIES = {
  'CAT-16': [ // proposal: kind PRODUCT_DOMAIN -> SERVICE_DOMAIN (0 leaves today)
    S('Usafirishaji wa Mizigo', 'Freight Transport', '65', ['Lori la Mizigo|Truck Freight', 'Mizigo ya Pikipiki/Guta|Motorcycle/Tricycle Cargo', 'Usafirishaji wa Baridi|Cold-chain Transport', 'Mizigo ya Mkoa hadi Mkoa|Inter-regional Haulage']),
    S('Courier & Delivery', 'Courier & Last-mile Delivery', '68', ['Delivery ya Siku Moja|Same-day Delivery', 'Courier wa Vifurushi|Parcel Courier', 'Delivery ya Bodaboda|Boda Delivery']),
    S('Usafiri wa Abiria', 'Passenger Transport', '64', ['Teksi|Taxi', 'Bodaboda|Motorcycle Taxi', 'Bajaji|Auto-rickshaw', 'Basi la Kukodi|Chartered Bus', 'Usafiri wa Shule|School Transport', 'Usafiri wa Uwanja wa Ndege|Airport Transfer']),
    S('Kuhamisha Nyumba & Ofisi', 'Moving & Relocation', '65', ['Kuhamisha Nyumba|House Moving', 'Kuhamisha Ofisi|Office Relocation', 'Kufunga Mizigo|Packing Service']),
    S('Uhifadhi & Maghala', 'Warehousing & Storage', '67', ['Ghala la Kukodi|Warehouse Space', 'Hifadhi ya Baridi|Cold Storage', 'Fulfilment / Usimamizi wa Stock|Fulfilment Service'], { legacy: ['Industrial Support/Warehouse Support', 'Industrial Support/Logistics Handling'] }),
    S('Clearing & Forwarding', 'Clearing & Forwarding', '67', ['Clearing Bandarini|Port Clearing', 'Forwarding ya Kimataifa|International Forwarding', 'Uwakala wa Forodha|Customs Agency']),
    S('Kukodisha Magari & Mashine', 'Vehicle & Equipment Rental', '73', ['Gari la Kukodi|Car Hire', 'Gari na Dereva|Car with Driver', 'Mashine Nzito ya Kukodi|Heavy Equipment Hire', 'Trekta ya Kukodi|Tractor Hire'], { legacy: ['Rental Services/Vehicle Rentals', 'Rental Services/Equipment Rentals', 'Rental Services/Agricultural Rentals', 'Industrial Support/Heavy Equipment'] }),
  ],
  'CAT-17': [
    S('Usafi wa Nyumba', 'House Cleaning', '85', ['Usafi wa Kawaida|Regular Cleaning', 'Usafi wa Kina|Deep Cleaning', 'Usafi Baada ya Ujenzi|Post-construction Cleaning', 'Kusafisha Sofa & Mazulia|Sofa & Carpet Cleaning'], { legacy: ['Home & Personal/Cleaning Services', 'Cleaning & Maintenance/House Cleaning', 'Cleaning & Maintenance/Deep Cleaning'] }),
    S('Usafi wa Ofisi & Biashara', 'Office & Commercial Cleaning', '85', ['Usafi wa Ofisi|Office Cleaning', 'Usafi wa Viwanda|Industrial Cleaning'], { legacy: ['Cleaning & Maintenance/Office Cleaning'] }),
    S('Kufua & Laundry', 'Laundry & Dry Cleaning', '97', ['Kufua kwa Kilo|Wash & Fold (per kg)', 'Dry Cleaning|Dry Cleaning', 'Kupiga Pasi|Ironing', 'Laundry ya Kuchukua & Kurudisha|Pickup & Delivery Laundry'], { legacy: ['Home & Personal/Laundry Services'] }),
    S('Kuosha Magari', 'Vehicle Washing', '87', ['Car Wash|Car Wash', 'Kuosha Gari Nyumbani|Mobile Car Wash', 'Detailing|Car Detailing'], { legacy: ['Cleaning & Maintenance/Vehicle Cleaning'] }),
    S('Kudhibiti Wadudu', 'Pest Control & Fumigation', '85', ['Fumigation|Fumigation', 'Kudhibiti Mchwa|Termite Control', 'Kudhibiti Panya|Rodent Control'], { legacy: ['Cleaning & Maintenance/Pest Control'] }),
    S('Bustani & Mandhari', 'Gardening & Landscaping', '81', ['Kutunza Bustani|Garden Maintenance', 'Kupanda Majani|Lawn Planting', 'Ubunifu wa Mandhari|Landscape Design'], { legacy: ['Cleaning & Maintenance/Outdoor Maintenance'] }),
    S('Upishi wa Nyumbani & Mpishi Binafsi', 'Home Cooking & Personal Chef', '63', ['Mpishi wa Nyumbani|Home Cook', 'Mpishi Binafsi wa Tukio|Private Chef', 'Mpango wa Milo|Meal Prep Plan'], { legacy: ['Home & Personal/Home Cooking', 'Food Services/Personal Chef', 'Food Services/Meal Prep Plans'] }),
    S('Urembo & Unyoaji', 'Beauty & Grooming Services', '97', ['Saluni ya Nywele|Hair Salon', 'Kinyozi|Barber', 'Kusuka Nywele|Hair Braiding', 'Makeup Artist|Makeup Artist', 'Kucha (Manicure/Pedicure)|Nail Service', 'Spa & Massage|Spa & Massage', 'Urembo Nyumbani|Mobile Beauty'], { legacy: ['Home & Personal/Beauty & Grooming', 'Home & Personal/Personal Care'], absorbs: 'CAT-08/Beauty Services' }),
    S('Wafanyakazi wa Ndani & Malezi', 'Domestic Help & Care', '98', ['Msaidizi wa Ndani|Housekeeper', 'Mlezi wa Watoto|Nanny / Babysitter', 'Mhudumu wa Wazee|Elderly Carer', 'Mlinzi wa Nyumba|Home Watchman']),
  ],
  'CAT-18': [
    S('Umeme wa Majengo', 'Electrical Installation & Repair', '54', ['Wiring ya Nyumba|House Wiring', 'Kufunga Solar|Solar Installation', 'Kurekebisha Hitilafu ya Umeme|Electrical Fault Repair'], { legacy: ['Construction & Handyman/Electrical Installation'] }),
    S('Bomba & Maji', 'Plumbing', '54', ['Kufunga Bomba|Pipe Installation', 'Kuzibua Mfereji|Drain Unblocking', 'Kufunga Tanki & Pampu|Tank & Pump Installation'], { legacy: ['Construction & Handyman/Plumbing Services'] }),
    S('Ujenzi & Ukarabati wa Majengo', 'Building Construction & Renovation', '54', ['Fundi Mwashi|Mason', 'Ujenzi wa Nyumba|House Construction', 'Ukarabati|Renovation', 'Kuweka Vigae|Tiling', 'Gypsum & Ceiling|Gypsum Ceiling'], { legacy: ['Construction & Handyman/Building Construction', 'Construction & Handyman/General Repairs'] }),
    S('Rangi & Finishing', 'Painting & Finishing', '54', ['Kupaka Rangi Nyumba|House Painting', 'Rangi ya Mapambo|Decorative Finish'], { legacy: ['Construction & Handyman/Painting & Finishing'] }),
    S('Useremala & Samani', 'Carpentry & Furniture Repair', '87', ['Kutengeneza Samani|Custom Furniture Making', 'Kurekebisha Samani|Furniture Repair', 'Kufunga Kabati|Cabinet Installation'], { legacy: ['Construction & Handyman/Carpentry & Furniture'] }),
    S('Uchomeleaji & Chuma', 'Welding & Metal Works', '87', ['Kuchomelea|Welding', 'Grili & Mageti|Grills & Gates Fabrication'], { legacy: ['Construction & Handyman/Welding & Metal Works'] }),
    S('Ukarabati wa Simu', 'Phone Repair', '87', ['Kubadilisha Kioo|Screen Replacement', 'Kubadilisha Betri|Battery Replacement', 'Software / Flashing|Software Repair'], { legacy: ['Tech & Repair/Phone Repair'] }),
    S('Ukarabati wa Kompyuta & Printa', 'Computer & Printer Repair', '87', ['Kurekebisha Laptop|Laptop Repair', 'Kurekebisha Printa|Printer Service', 'Data Recovery|Data Recovery'], { legacy: ['Tech & Repair/Computer Repair', 'Tech & Repair/Printer Services'] }),
    S('Ukarabati wa Electronics & Vifaa vya Nyumbani', 'Electronics & Appliance Repair', '87', ['Kurekebisha TV|TV Repair', 'Kurekebisha Friji|Fridge Repair', 'Kurekebisha Mashine ya Kufua|Washing Machine Repair', 'AC / Kiyoyozi|AC Service'], { legacy: ['Tech & Repair/Electronics Repair'] }),
    S('Mitandao & CCTV', 'Networking & CCTV Installation', '87', ['Kufunga Mtandao|Network Setup', 'Kufunga CCTV|CCTV Installation', 'Kufunga Alarm|Alarm Installation'], { legacy: ['Tech & Repair/Network Setup', 'Tech & Repair/CCTV Systems'] }),
    S('Gereji & Magari', 'Vehicle Repair & Maintenance', '87', ['Service ya Gari|Car Service', 'Fundi Umeme wa Magari|Auto Electrician', 'Bodi & Rangi ya Gari|Panel Beating & Spray', 'Matairi & Alignment|Tyres & Alignment', 'Fundi Pikipiki|Motorcycle Mechanic']),
    S('Mashine & Viwanda', 'Machinery Maintenance & Installation', '87', ['Matengenezo ya Mashine|Machine Maintenance', 'Ufungaji wa Mashine|Industrial Installation', 'Ukaguzi wa Ubora|Quality Inspection'], { legacy: ['Industrial Support/Machine Maintenance', 'Industrial Support/Industrial Installation', 'Industrial Support/Quality Control'] }),
    S('Ushonaji & Kurekebisha Nguo', 'Tailoring & Alterations', '97', ['Kushona Nguo Mpya|Custom Tailoring', 'Kurekebisha Nguo|Alterations', 'Fundi Viatu|Shoe Repair']),
  ],
  'CAT-19': [ // HYBRID: service subcategories added alongside the 17 existing product leaves
    S('Kliniki & Daktari', 'Clinic & Doctor Consultation', '93', ['Ushauri wa Daktari|GP Consultation', 'Daktari Bingwa|Specialist Consultation', 'Telemedicine|Telemedicine'], { regulatory: ['REG-UNVERIFIED-HEALTH'] }),
    S('Meno', 'Dental Services', '93', ['Kung’oa/Kuziba Jino|Extraction / Filling', 'Kusafisha Meno|Scaling & Cleaning', 'Braces|Orthodontics']),
    S('Macho', 'Eye Care Services', '93', ['Kupima Macho|Eye Test', 'Miwani ya Daktari|Prescription Glasses Fitting']),
    S('Maabara & Vipimo', 'Diagnostics & Laboratory Tests', '93', ['Kipimo cha Damu|Blood Test', 'Ultrasound|Ultrasound', 'X-ray|X-ray']),
    S('Huduma ya Afya Nyumbani', 'Home Nursing & Care', '93', ['Nesi wa Nyumbani|Home Nurse', 'Physiotherapy|Physiotherapy', 'Huduma ya Wazee|Elderly Care']),
    S('Ushauri Nasaha & Afya ya Akili', 'Counselling & Mental Health', '93', ['Ushauri Nasaha|Counselling', 'Therapy|Psychotherapy']),
    S('Lishe & Ustawi', 'Nutrition & Wellness Services', '93', ['Mtaalamu wa Lishe|Dietitian', 'Kocha wa Afya|Wellness Coach']),
  ],
  'CAT-20': [
    S('Tuition & Masomo ya Ziada', 'Tutoring & Extra Classes', '92', ['Tuition ya Msingi|Primary Tutoring', 'Tuition ya Sekondari|Secondary Tutoring', 'Maandalizi ya Mtihani|Exam Preparation'], { legacy: ['Online Coaching/Coaching & Lessons'] }),
    S('Lugha', 'Language Courses', '92', ['Kiingereza|English Course', 'Kiswahili kwa Wageni|Swahili for Foreigners', 'Kifaransa/Kichina n.k.|Other Language Course']),
    S('Ufundi Stadi', 'Vocational & Technical Training', '92', ['Ushonaji|Tailoring Course', 'Umeme|Electrical Course', 'Upishi|Cookery Course', 'Ufundi Magari|Motor Mechanics Course']),
    S('Kompyuta & IT', 'Computer & IT Training', '92', ['Kompyuta ya Msingi|Basic Computer', 'Programming|Programming', 'Graphic Design|Design Course']),
    S('Udereva', 'Driving School', '92', ['Leseni ya Gari|Car Licence Course', 'Leseni ya Pikipiki|Motorcycle Course']),
    S('Muziki, Sanaa & Michezo', 'Music, Arts & Sports Lessons', '92', ['Masomo ya Muziki|Music Lessons', 'Kuogelea|Swimming Lessons', 'Kocha wa Michezo|Sports Coaching']),
    S('Mafunzo ya Kitaaluma & Biashara', 'Professional & Business Training', '92', ['Ujasiriamali|Entrepreneurship', 'Uhasibu|Accounting Course', 'Uongozi|Leadership Training']),
    S('Kozi za Mtandaoni (Live)', 'Live Online Classes', '92', ['Darasa Mtandaoni|Live Online Class', 'Mentorship|Mentorship'], { note: 'Kozi zilizorekodiwa ni bidhaa ya kidijitali → CAT-38 Digital Courses.' }),
  ],
  'CAT-21': [
    S('Sheria', 'Legal Services', '82', ['Wakili|Advocate', 'Mikataba|Contract Drafting', 'Notary / Commissioner for Oaths|Notary']),
    S('Uhasibu, Kodi & Ukaguzi', 'Accounting, Tax & Audit', '82', ['Uhasibu|Bookkeeping', 'Ushauri wa Kodi|Tax Advisory', 'Ukaguzi|Audit']),
    S('Ushauri wa Biashara', 'Business Consulting', '83', ['Mpango wa Biashara|Business Plan', 'Usajili wa Kampuni|Company Registration', 'Utafiti wa Soko|Market Research']),
    S('Uhandisi, Usanifu & Upimaji', 'Engineering, Architecture & Surveying', '83', ['Ramani ya Nyumba|Architectural Drawings', 'Upimaji Ardhi|Land Surveying', 'Mhandisi wa Majengo|Structural Engineering']),
    S('Ubunifu & Media', 'Creative & Media Services', '83', ['Graphic Design|Graphic Design', 'Picha & Video|Photo & Video Production', 'Kuandika Maudhui|Content Writing', 'Social Media Management|Social Media Management', 'Uhariri wa Video|Video Editing', 'Matangazo/Kampeni|Ad Campaigns'], { legacy: ['Creative Freelancing/Graphic Design', 'Creative Freelancing/Video Production', 'Creative Freelancing/Photography', 'Creative Freelancing/Content Writing', 'Creative Freelancing/Social Media Management', 'Digital Marketing/Campaigns', 'Media Production/Editing'] }),
    S('IT, Software & Web', 'IT, Software & Web Services', '83', ['Kutengeneza Website|Website Development', 'Kutengeneza App|App Development', 'Hosting & Domain|Hosting Setup', 'IT Support ya Mbali|Remote IT Support', 'Huduma za AI|AI Services'], { legacy: ['Creative Freelancing/Web & App Design', 'Creative Freelancing/Digital AI Services', 'Software & IT/Web & App Dev', 'Website Services/Site Setup', 'Remote Support/Tech Help', 'AI Services/Prompt Engineering'] }),
    S('Tafsiri & Uandishi', 'Translation & Writing', '83', ['Tafsiri|Translation', 'Ukalimani|Interpretation', 'Uandishi wa CV|CV Writing'], { legacy: ['Writing & Translation/Languages'] }),
    S('Msaada wa Ofisi', 'Business Support & Virtual Assistance', '85', ['Msaidizi wa Mtandaoni|Virtual Assistant', 'Kuingiza Data|Data Entry', 'Call Centre|Call Centre'], { legacy: ['Virtual Business/Office Support'] }),
    S('Ulinzi & Walinzi', 'Security Guard Services', '85', ['Mlinzi|Security Guard', 'Ulinzi wa Tukio|Event Security', 'Ufuatiliaji wa Alarm|Alarm Monitoring']),
    S('Ushauri wa Kilimo & Mifugo', 'Agricultural & Livestock Advisory', '83', ['Afisa Ugani|Agronomy Advice', 'Kupima Udongo|Soil Testing', 'Daktari wa Mifugo|Veterinary Service', 'Kuandaa Shamba|Farm Preparation', 'Huduma Baada ya Mavuno|Post-harvest Service', 'Kufunga Umwagiliaji|Irrigation Installation'], { legacy: ['Agriculture Support/Farm Preparation', 'Agriculture Support/Crop Production', 'Agriculture Support/Irrigation Systems', 'Agriculture Support/Livestock Services', 'Agriculture Support/Agricultural Advisory', 'Agriculture Support/Post-Harvest Services'], note: 'Inagusana na branchContext CAT-04 "Livestock Services".' }),
  ],
  'CAT-22': [
    S('Mikopo', 'Loans & Credit', '71', ['Mkopo wa Biashara Ndogo|Micro-business Loan', 'Mkopo wa Mshahara|Salary Loan', 'Mkopo wa Vifaa|Asset Financing']),
    S('Bima', 'Insurance', '71', ['Bima ya Gari|Motor Insurance', 'Bima ya Afya|Health Insurance', 'Bima ya Mali|Property Insurance', 'Bima ya Mazao/Mifugo|Agricultural Insurance']),
    S('Mawakala wa Fedha', 'Payment & Mobile-money Agents', '71', ['Wakala wa Mobile Money|Mobile Money Agent', 'Wakala wa Benki|Bank Agent']),
    S('Akiba & Vikundi', 'Savings Groups & SACCOS', '71', ['SACCOS|SACCOS', 'VICOBA|Village Community Bank']),
    S('Ushauri wa Fedha & Uwekezaji', 'Financial & Investment Advisory', '71', ['Mshauri wa Fedha|Financial Advisor', 'Ushauri wa Uwekezaji|Investment Advisory']),
  ],
  'CAT-23': [
    S('Nafasi za Kazi', 'Job Vacancies', '85', ['Kazi ya Kudumu|Full-time Job', 'Kazi ya Muda|Part-time Job', 'Mkataba|Contract Role'], { listingType: 'JOB' }),
    S('Kazi za Gig & Freelance', 'Gig & Freelance Work', '85', ['Kazi ya Siku|Day Labour', 'Mradi wa Freelance|Freelance Project']),
    S('Wakala wa Ajira', 'Recruitment Agencies', '85', ['Uajiri|Recruitment', 'Kutoa Wafanyakazi|Staff Outsourcing']),
    S('Mafunzo Kazini', 'Internships & Apprenticeships', '85', ['Internship|Internship', 'Uanagenzi|Apprenticeship']),
    S('Watafuta Kazi', 'Job Seekers / CV Profiles', '85', ['Wasifu wa Mtafuta Kazi|Job Seeker Profile'], { note: 'Data binafsi — onyesho la umma lazima liwe kwa ridhaa (privacy).' }),
  ],
  'CAT-24': [
    S('Hoteli', 'Hotels', '63', ['Chumba cha Hoteli|Hotel Room', 'Suite|Suite', 'Ukumbi wa Mikutano|Conference Hall']),
    S('Lodge, Guest House & Hostel', 'Lodges, Guest Houses & Hostels', '63', ['Chumba cha Guest House|Guest House Room', 'Lodge|Safari Lodge', 'Hostel|Hostel Bed']),
    S('Nyumba za Kukaa Muda Mfupi', 'Short-stay Apartments', '63', ['Apartment ya Siku|Serviced Apartment', 'Nyumba ya Likizo|Holiday Home'], { legacy: ['Rental Services/Property Rentals'], note: 'Upangishaji wa muda mrefu → CAT-42 (listingType=rent).' }),
    S('Safari & Utalii', 'Tours & Safaris', '85', ['Safari ya Mbuga|Game Drive Safari', 'Kupanda Mlima|Mountain Trek', 'Ziara ya Mji|City Tour', 'Utalii wa Fukwe|Beach Excursion']),
    S('Waongozaji & Mawakala wa Usafiri', 'Guides & Travel Agents', '85', ['Mwongozaji wa Utalii|Tour Guide', 'Wakala wa Tiketi|Ticketing Agent', 'Visa & Nyaraka za Safari|Travel Documents Assistance']),
    S('Kambi', 'Campsites', '63', ['Eneo la Kambi|Campsite Pitch', 'Hema la Kukodi|Tent Hire']),
  ],
  'CAT-25': [
    S('Migahawa', 'Restaurants', '63', ['Mgahawa wa Kukaa|Dine-in Restaurant', 'Mama Lishe|Local Eatery', 'Fast Food|Fast Food'], { legacy: ['Food Services/Restaurants Food'] }),
    S('Chakula cha Mtaani', 'Street Food', '63', ['Chipsi Mayai|Chips Mayai', 'Mishikaki & Nyama Choma|Grilled Meat', 'Vitafunwa|Street Snacks'], { legacy: ['Food Services/Street Food'] }),
    S('Catering ya Matukio', 'Event Catering', '63', ['Catering ya Harusi|Wedding Catering', 'Catering ya Ofisi|Corporate Catering', 'Buffet|Buffet Service'], { legacy: ['Food Services/Catering Services'] }),
    S('Oda Maalum za Keki & Vyakula', 'Custom Cakes & Food Orders', '63', ['Keki ya Oda|Custom Cake', 'Chakula cha Oda|Pre-order Meal']),
    S('Delivery ya Chakula', 'Food Delivery', '63', ['Delivery ya Mgahawa|Restaurant Delivery'], { legacy: ['Food Services/Food Delivery'] }),
    S('Vinywaji & Bar', 'Bars & Beverage Service', '63', ['Bar|Bar', 'Café|Café', 'Juice Bar|Juice Bar'], { note: 'Pombe → umri 18+ na leseni ya vileo (HAIJATHIBITISHWA).' }),
  ],
  'CAT-26': [
    S('Kupanga Matukio', 'Event Planning', '96', ['Mpangaji wa Harusi|Wedding Planner', 'Mpangaji wa Tukio|Event Planner', 'Mapambo ya Ukumbi|Venue Decoration'], { legacy: ['Event & Entertainment/Event Planning', 'Event & Entertainment/Decoration Services'] }),
    S('MC, DJ & Muziki', 'MC, DJ & Live Music', '96', ['MC|Master of Ceremonies', 'DJ|DJ', 'Bendi|Live Band', 'Kwaya|Choir', 'Wasanii wa Burudani|Entertainment Performers'], { legacy: ['Event & Entertainment/DJ & Music', 'Event & Entertainment/MC / Host Services', 'Event & Entertainment/Entertainment Performers'] }),
    S('Picha & Video za Matukio', 'Event Photo & Video', '96', ['Mpiga Picha|Photographer', 'Video ya Tukio|Event Videography', 'Drone ya Picha|Drone Filming'], { legacy: ['Event & Entertainment/Photography & Video'] }),
    S('Kukodisha Vifaa vya Matukio', 'Event Equipment Hire', '73', ['Mahema|Tent Hire', 'Viti & Meza|Chairs & Tables Hire', 'Sound System|PA System Hire', 'Taa za Jukwaa|Stage Lighting Hire', 'Samani ya Kukodi|Furniture Hire'], { legacy: ['Event & Entertainment/Sound Systems', 'Rental Services/Event Rentals', 'Rental Services/Furniture Rentals'] }),
    S('Kumbi & Maeneo ya Matukio', 'Venues', '96', ['Ukumbi wa Harusi|Wedding Hall', 'Bustani ya Tukio|Garden Venue']),
    S('Gym, Michezo & Burudani', 'Gym, Sports & Recreation', '96', ['Uanachama wa Gym|Gym Membership', 'Uwanja wa Kukodi|Pitch Hire', 'Gaming Lounge|Gaming Lounge', 'Swimming Pool|Swimming Pool Access']),
    S('Tiketi za Matukio', 'Event Tickets', '96', ['Tiketi ya Tamasha|Concert Ticket', 'Tiketi ya Mchezo|Sports Ticket']),
  ],
};

// Every serviceDataMap subcategory must resolve. Keys "Group/Sub".
// Built from the `legacy` arrays above; a few are routed to product branch contexts.
export const SERVICE_LEGACY_EXTRA = {
  'Home & Personal/Home Maintenance': { target: 'CAT-18', sub: 'Ujenzi & Ukarabati wa Majengo', action: 'MERGE' },
};
