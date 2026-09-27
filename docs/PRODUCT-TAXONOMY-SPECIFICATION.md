# SokoHai Product Taxonomy Specification

**Status:** Materialized specification artifact; documentation only.

**Runtime authority:** shared/canonical-taxonomy-data.js

## Purpose

This document materializes the authoritative taxonomy material available in the SokoHai project/context for deterministic reconciliation. It is not executable and is not a second runtime taxonomy engine. Runtime IDs and behavior remain in the canonical JavaScript authority.

## Evidence and non-inference rule

The available authoritative material contains the CAT-01–CAT-44 master hierarchy, the approved CAT-19 dual-context decision, overlay/fallback boundaries, and explicit branch definitions where present. A branch listed in the hierarchy is not automatically a Product leaf. Where branch-level semantics are absent, this document records PRODUCT_PARTIAL or UNSPECIFIED; it does not invent Product Types, Attributes, Options, Filters, Features, Variant matrices, Unit mappings, or compliance requirements.

## Documentation classifications

- PRODUCT_DEFINED: explicit Product semantics are present.
- PRODUCT_PARTIAL: Product/hierarchy scope exists but branch semantics are incomplete.
- SERVICE: Service authority; not a Product definition.
- MIXED: Product and Service contexts coexist.
- OVERLAY_CONTEXT: cross-category overlay, not an ordinary Product category.
- FALLBACK: classification safety/fallback.
- INTENTIONALLY_SKIPPED: deliberately outside Product scope.
- UNSPECIFIED: required semantic detail is not established.

## Protected boundaries

- CAT-19 = Product + Service; 17 approved Product branches; 0 active Service branches.
- CAT-17, CAT-18, CAT-20–CAT-26 = Service.
- CAT-39 = condition/discovery overlay.
- CAT-40 = wholesale/bulk overlay.
- CAT-41 = import/export/cross-border overlay.
- CAT-44 = fallback/classification safety.
- CAT-16 Product branch specification = UNSPECIFIED; no Product branch is invented here.

## CAT-01 — Chakula & Vinywaji

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 18

### Nafaka, Unga & Mikunde

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Mahindi; Mchele; Ngano; Mtama; Unga wa Mahindi; Unga wa Ngano; Maharage; Dengu; Choroko

**Attributes:** Variety; Origin; Grade; Processing; Packaging; Weight; Unit; Organic; Condition

**Options:** Processing=[Whole, Milled, Flour, Polished, Unpolished, Parboiled]; Packaging=[Loose, Sack, Bag, Bottle, Container]; Unit=[Kg, Gram, Debe, Gunia, Tani]

**Filters:** Price; Distance; Availability; Brand; Variety; Origin; Grade; Processing; Organic; Packaging; Weight

**Features:** Organic; Wholesale; Retail

**Variant rule:** {"mode":"OPTIONAL","candidates":["Weight","Packaging"],"sellingUnitMayReplaceVariant":true}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Mboga & Fresh Produce

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Nyanya; Vitunguu; Karoti; Kabichi

**Attributes:** Variety; Grade; Freshness; Origin; Farming Method; Packaging; Weight; Unit; Organic

**Options:** Size=[Small, Medium, Large]; Freshness=[Fresh, Mature, Processing Grade]

**Filters:** Price; Distance; Availability; Brand; Variety; Origin; Grade; Fresh; Organic; Packaging; Weight

**Features:** Organic; Locally grown; Fresh

**Variant rule:** {"mode":"OPTIONAL","candidates":["Size","Packaging","Weight"],"requireSkuPriceStockIdentity":true}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Matunda

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Ndizi; Maembe; Parachichi; Machungwa; Papai

**Attributes:** Variety; Ripeness; Size; Grade; Origin; Organic; Season; Packaging; Weight; Unit

**Options:** Ripeness=[Green, Ready, Ripe]; Variety=[Hass, Fuerte, Local]

**Filters:** Price; Distance; Availability; Variety; Origin; Ripeness; Organic; Weight

**Features:** Organic; Seasonal

**Variant rule:** {"mode":"OPTIONAL","candidates":["Variety","Ripeness","Size","Packaging"]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Mizizi & Viazi

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Nyama

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Samaki & Seafood

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Maziwa & Dairy

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Mayai

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Mafuta & Cooking Ingredients

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Viungo

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Vyakula Vilivyopikwa

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Bakery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Snacks & Sweets

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Vinywaji

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Local & Traditional Foods

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Food Ingredients

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Food Packaging

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Food Services

**Classification:** SERVICE
**Definition state:** UNSPECIFIED

## CAT-02 — Kilimo & Inputs za Kilimo

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 14

Canonical treatment: Service/context boundary; not a Product Type.

### Mbegu

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Mbegu za Mahindi; Mbegu za Mpunga; Mbegu za Mboga; Mbegu za Matunda; Mbegu za Malisho

**Attributes:** Crop Type; Variety; Seed Type; Hybrid/Open Pollinated; Maturity Period; Planting Season; Yield Potential; Disease Resistance; Drought Tolerance; Germination Rate; Origin; Certification; Treatment; Package Size; Quantity; Unit; Brand

**Options:** Seed Type=[Hybrid, OPV, Local, Improved, Certified]; Package Size=[10g, 50g, 100g, 500g, 1kg, 2kg, 5kg, 10kg, 25kg, 50kg, Custom]

**Filters:** Price; Distance; Availability; Brand; Crop; Variety; Maturity; Package Size; Certification; Drought Tolerance; Location

**Features:** Certified seed; Drought tolerant; Early maturity; Disease resistant; High yield

**Variant rule:** {"mode":"OPTIONAL","candidates":["Package Size"],"nonVariantAttributes":["Hybrid/Open Pollinated","Drought Tolerance"]}

**Unit rule:** UNSPECIFIED

**Compliance:** AGRICULTURAL_REGULATED_CONDITIONAL

### Miche & Nursery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Mbolea

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Urea; DAP; CAN; NPK; TSP; MOP; Organic Fertilizer; Compost; Manure; Liquid Fertilizer

**Attributes:** Fertilizer Type; NPK Ratio; Nutrient Composition; Form; Application Method; Crop; Soil Type; Brand; Package Size; Weight; Origin; Certification

**Options:** Form=[Granular, Powder, Liquid, Crystal, Pellet]; Application=[Basal, Top dressing, Foliar, Fertigation, Soil amendment]

**Filters:** Price; Brand; Fertilizer Type; NPK Ratio; Crop; Soil Type; Package Size; Organic; Location

**Features:** Organic; Fast release; Slow release; Crop-specific

**Variant rule:** {"mode":"OPTIONAL","candidates":["Package Size","Weight"]}

**Unit rule:** UNSPECIFIED

**Compliance:** AGRICULTURAL_REGULATED_CONDITIONAL

### Dawa za Mimea & Crop Protection

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Insecticides; Herbicides; Fungicides; Nematicides; Seed Treatment; Biological Pest Control

**Attributes:** Product Type; Active Ingredient; Target Pest; Target Crop; Formulation; Concentration; Application Method; Application Rate; Brand; Package Size; Certification; Origin

**Options:** Formulation=[EC, SC, WP, WG, SL, GR, Other]

**Filters:** Price; Brand; Active Ingredient; Target Crop; Target Pest; Formulation; Certification; Location

**Features:** Broad spectrum; Selective; Biological; Preventive; Curative

**Variant rule:** {"mode":"OPTIONAL","candidates":["Package Size"],"nonVariantAttributes":["Active Ingredient","Concentration"]}

**Unit rule:** UNSPECIFIED

**Compliance:** AGRICULTURAL_CHEMICAL_CONDITIONAL

### Zana za Kilimo

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Mashine & Equipment za Kilimo

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Umwagiliaji & Water Management

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Greenhouse & Controlled Farming

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Soil & Land Preparation Inputs

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Farm Protection & Storage

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Harvesting & Post-Harvest

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Farm Supplies & Consumables

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Agricultural Technology

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Organic & Sustainable Farming Inputs

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

## CAT-03 — Mazao & Biashara ya Kilimo

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 22

### Nafaka

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mikunde & Pulses

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mizizi & Viazi

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mbegu za Mafuta / Oil Crops

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Horticulture — Mboga

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Horticulture — Matunda

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Kahawa

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Chai

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Korosho

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pamba

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Tumbaku

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mkonge / Sisal

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Miwa & Sugar Crops

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Kakao

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Nazi & Coconut Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Karafuu & Spices Crops

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mazao ya Asili / Indigenous Crops

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Hay & Crop Residues

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mazao Yaliyokaushwa

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Agricultural Bulk Commodities

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Grading, Sorting & Quality State

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Agricultural Processing State

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-04 — Mifugo

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 20

### Ng'ombe

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Ng'ombe wa nyama; Ng'ombe wa maziwa; Ng'ombe wa mchanganyiko; Ng'ombe wa kazi; Ng'ombe wa kuzalisha; Ng'ombe wa kunenepesha; Ndama; Ng'ombe wazima; Ng'ombe wa asili; Ng'ombe improved/exotic; Breeding bulls; Heifers

**Attributes:** Breed; Sex; Age; Life Stage; Purpose; Weight; Body Condition; Health Status; Vaccination Status; Pregnancy Status; Lactation Status; Milk Yield; Origin; Identification; Ear Tag; Registration; Breeding Status

**Options:** Sex=[Male, Female]; Life Stage=[Calf, Young, Heifer, Adult, Bull, Cow]; Purpose=[Beef, Dairy, Dual purpose, Breeding, Draft/work]

**Filters:** Species; Breed; Purpose; Age; Sex; Weight; Location; Price; Health; Vaccination

**Features:** Breeding stock; Meat production; Dairy; Draft/work

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Mbuzi

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Mbuzi wa nyama; Mbuzi wa maziwa; Mbuzi wa kuzalisha; Mbuzi wa asili; Improved goats; Breeding buck; Doe; Kids; Fattening goats

**Attributes:** Breed; Sex; Age; Weight; Purpose; Health; Vaccination; Pregnancy; Lactation; Origin; Identification

**Options:** UNSPECIFIED

**Filters:** Breed; Sex; Age; Purpose; Weight; Location; Price

**Features:** Breeding stock; Meat production; Dairy

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Kondoo

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Sheep for meat; Breeding sheep; Rams; Ewes; Lambs; Local breeds; Improved breeds

**Attributes:** Breed; Sex; Age; Weight; Purpose; Health; Vaccination; Pregnancy; Origin; Identification

**Options:** UNSPECIFIED

**Filters:** Breed; Sex; Age; Purpose; Weight; Location; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Nguruwe

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Piglets; Growers; Sows; Boars; Fattening pigs; Breeding pigs

**Attributes:** Breed; Sex; Age; Weight; Growth Stage; Breeding Status; Pregnancy; Health Status; Vaccination; Origin; Identification

**Options:** UNSPECIFIED

**Filters:** Breed; Sex; Age; Growth Stage; Purpose; Weight; Location; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Kuku

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Kuku wa nyama; Kuku wa mayai; Kuku wa kienyeji; Broilers; Layers; Dual-purpose; Breeding chickens; Cocks; Hens; Chicks; Pullets; Cockerels

**Attributes:** Breed; Type; Sex; Age; Life Stage; Purpose; Weight; Vaccination; Health; Production Stage; Egg Production; Origin; Quantity

**Options:** Life Stage=[Day-old chick, Chick, Grower, Pullet/Cockerel, Adult]

**Filters:** Breed; Type; Age; Purpose; Production Stage; Quantity; Location; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Bata, Bata Mzinga & Poultry nyingine

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Bata; Bata mzinga; Kanga; Guinea fowl; Quail; Geese; Pigeons; Other poultry

**Attributes:** Species; Breed; Sex; Age; Purpose; Weight; Health; Vaccination; Quantity; Origin

**Options:** UNSPECIFIED

**Filters:** Species; Breed; Age; Purpose; Quantity; Location; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Sungura

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Meat rabbits; Breeding rabbits; Does; Bucks; Kits; Growers

**Attributes:** Breed; Sex; Age; Weight; Purpose; Breeding status; Health; Quantity

**Options:** UNSPECIFIED

**Filters:** Breed; Sex; Age; Purpose; Quantity; Location; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Nyuki & Ufugaji wa Nyuki

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Bee colonies; Queen bees; Bee packages; Bee nuclei; Beehives; Hive frames; Beeswax; Honey; Propolis; Royal jelly; Pollen

**Attributes:** Colony Strength; Queen Status; Hive Type; Colony Age; Honey Type; Floral Source; Region; Harvest Season; Raw/Processed; Grade; Moisture; Weight; Packaging; Origin

**Options:** UNSPECIFIED

**Filters:** Product Type; Species; Region; Processing; Weight; Location; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Maziwa

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Cow milk; Goat milk; Sheep milk; Camel milk; Fresh milk; Raw milk; Pasteurized milk; Fermented milk; Milk products

**Attributes:** Animal Source; Milk Type; Fat Content; Processing; Freshness; Volume; Packaging; Expiry; Origin; Brand

**Options:** Processing=[Raw, Fresh, Pasteurized, UHT, Fermented]

**Filters:** Milk Type; Animal Source; Processing; Freshness; Volume; Brand; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Mayai

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Chicken eggs; Duck eggs; Quail eggs; Guinea fowl eggs; Other eggs

**Attributes:** Species; Size; Grade; Freshness; Production System; Quantity; Packaging; Origin

**Options:** Size=[Small, Medium, Large, Extra Large]; Packaging=[6, 12, 18, 30, Tray, Bulk]

**Filters:** Species; Size; Freshness; Packaging; Quantity; Location; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Nyama

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Beef; Goat meat; Mutton; Pork; Chicken; Duck; Turkey; Rabbit; Other livestock meat

**Attributes:** Animal Source; Cut; Fresh/Frozen; Grade; Weight; Packaging; Origin; Processing; Bone-in/Boneless; Fat Level

**Options:** Cut=[Whole carcass, Half carcass, Quarter, Steak, Fillet, Ribs, Minced, Brisket, Shank, Offal, Other]

**Filters:** Animal Source; Cut; Fresh/Frozen; Grade; Weight; Location; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Ngozi, Hides & Skins

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Cattle hides; Goat skins; Sheep skins; Processed hides; Raw hides; Leather raw materials

**Attributes:** Animal Source; Size; Grade; Condition; Processing; Tanning State; Weight; Origin

**Options:** Processing=[Raw, Salted, Dried, Treated, Tanned]

**Filters:** Animal Source; Grade; Processing; Weight; Origin; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Manure & Livestock By-products

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Cow manure; Goat manure; Sheep manure; Chicken manure; Pig manure; Compost; Bone meal; Blood meal; Other livestock by-products

**Attributes:** Source Animal; Processing; Moisture; Nutrient Content; Weight; Packaging; Organic; Origin

**Options:** UNSPECIFIED

**Filters:** Source Animal; Processing; Organic; Weight; Location; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Livestock Breeding

**Classification:** CONTEXT_ONLY
**Definition state:** UNSPECIFIED

Canonical treatment: context/commercial/compliance concept; not an ordinary Product Type.

### Livestock Trading / Bulk

**Classification:** CONTEXT_ONLY
**Definition state:** UNSPECIFIED

Canonical treatment: context/commercial/compliance concept; not an ordinary Product Type.

### Livestock Equipment

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Feeders; Drinkers; Milking machines; Milk cans; Milk tanks; Animal weighing scales; Cages; Poultry houses; Brooders; Incubators; Egg trays; Egg handling equipment; Animal pens; Fencing; Water troughs; Hay racks; Livestock transport equipment; Beekeeping equipment

**Attributes:** Equipment Type; Material; Capacity; Size; Power; Voltage; Brand; Model; Condition; Compatibility; Warranty

**Options:** UNSPECIFIED

**Filters:** Equipment Type; Capacity; Brand; Condition; Price; Location

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Incubators & Poultry Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Livestock Feed

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Hay; Silage; Maize bran; Wheat bran; Dairy feed; Broiler feed; Layer feed; Pig feed; Goat feed; Mineral supplements; Premixes

**Attributes:** Target Animal; Animal Stage; Feed Type; Protein %; Energy; Ingredients; Weight; Packaging; Brand; Purpose

**Options:** UNSPECIFIED

**Filters:** Target Animal; Life Stage; Feed Type; Weight; Brand; Price; Location

**Features:** Animal Feed

**Variant rule:** []

**Unit rule:** UNSPECIFIED

**Compliance:** ANIMAL_FEED_CONDITIONAL

### Animal Health Products

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Veterinary medicines; Vaccination-related products; Veterinary consumables; Animal diagnostic kits; Syringes/needles; Animal health equipment; Deworming products; Animal wound-care products; Veterinary supplements

**Attributes:** Animal Type; Product Type; Usage; Brand; Pack Size; Prescription/Restriction status; Manufacturer; Batch/Lot; Expiry

**Options:** UNSPECIFIED

**Filters:** Animal Type; Product Type; Usage; Brand; Condition; Price

**Features:** Regulated

**Variant rule:** []

**Unit rule:** UNSPECIFIED

**Compliance:** HEALTH_PRODUCT_CONDITIONAL

### Livestock Services

**Classification:** SERVICE
**Definition state:** UNSPECIFIED

## CAT-05 — Uvuvi & Baharini

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 20

Canonical treatment: Service/context boundary; not a Product Type.

### Samaki wa Maji Safi

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Sato / Tilapia; Kambale / African Catfish; Sangara; Perege; Samaki wa Ziwa Victoria; Samaki wa Ziwa Tanganyika; Samaki wa Ziwa Nyasa; Samaki wa mito; Samaki wa mabwawa; Freshwater fish wengine

**Attributes:** Species; Scientific Name; Local Name; Origin; Water Body; Capture/Farmed; Breed; Size; Weight; Grade; Freshness; Catch Date; Harvest Date; Processing; Packaging; Quantity; Unit

**Options:** Capture/Farmed=[Capture, Farmed]

**Filters:** Species; Capture/Farmed; Size; Freshness; Origin; Location; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Samaki wa Bahari

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Changu; Tafi; Tuna; Kingfish; Snapper; Grouper; Parrotfish; Rabbitfish; Emperor; Mackerel; Sardines; Shark; Ray; Marine fish wengine

**Attributes:** Species; Scientific Name; Size; Weight; Fishing Method; Catch Area; Catch Date; Freshness; Grade; Processing; Packaging; Origin

**Options:** Fishing Method=[Hook & line, Net, Trap, Longline, Other permitted method]

**Filters:** Species; Size; Freshness; Fishing Method; Origin; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Dagaa & Small Fish

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Dagaa wa Ziwa; Sardines; Small pelagic fish; Anchovy-type fish; Small dried fish; Small fish wengine

**Attributes:** Species; Water Body; Fresh/Dried; Grade; Size; Drying Method; Moisture; Weight; Packaging; Origin

**Options:** UNSPECIFIED

**Filters:** Species; Fresh/Dried; Grade; Size; Weight; Origin; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Kamba & Crustaceans

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Prawns; Shrimp; Lobster; Crabs; Freshwater prawns; Crustaceans wengine

**Attributes:** Species; Capture/Farmed; Size; Weight; Grade; Fresh/Frozen; Origin; Processing; Packaging

**Options:** UNSPECIFIED

**Filters:** Species; Capture/Farmed; Size; Fresh/Frozen; Grade; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Pweza, Chaza & Shellfish

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Octopus; Oysters; Mussels; Cockles; Clams; Shellfish wengine

**Attributes:** Species; Capture/Farmed; Size; Freshness; Weight; Grade; Processing; Origin; Packaging

**Options:** UNSPECIFIED

**Filters:** Species; Capture/Farmed; Freshness; Size; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Samaki Waliokaushwa

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Dagaa dried; Sardines dried; Tilapia dried; Catfish dried; Small fish dried; Marine fish dried; Smoked fish

**Attributes:** Species; Drying Method; Smoking; Moisture; Grade; Size; Weight; Packaging; Origin

**Options:** Processing State=[Sun dried, Smoked, Salted, Dried, Dried & salted]

**Filters:** Species; Processing; Moisture; Grade; Weight; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Frozen Fish & Seafood

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Frozen whole fish; Frozen fillets; Frozen prawns; Frozen octopus; Frozen squid; Frozen lobster; Frozen crab; Frozen seafood mix

**Attributes:** Species; Cut; Frozen State; Net Weight; Glazing; Grade; Origin; Packaging; Storage Temperature; Expiry

**Options:** UNSPECIFIED

**Filters:** Species; Cut; Grade; Storage Temperature; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Fish Fillets & Cuts

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Whole fish; Fillet; Steak; Head; Tail; Fish portions; Minced fish; Fish offal

**Attributes:** Species; Cut; Bone-in; Boneless; Skin-on; Skinless; Fresh/Frozen; Weight; Packaging

**Options:** UNSPECIFIED

**Filters:** Species; Cut; Fresh/Frozen; Weight; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Aquaculture

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Tilapia; Catfish; Trout; Milkfish; Mullet; Prawns; Crabs; Oysters; Seaweed; Other farmed aquatic organisms

**Attributes:** Species; Farm Type; Water Type; Production System; Stocking Density; Age; Average Weight; Quantity; Farm Location; Harvest Date; Feed Type; Water Parameters; Certification

**Options:** Production System=[Pond, Cage, Tank, Raceway, Sea cage, Marine farm, Other]

**Filters:** Species; Water Type; Production System; Age; Quantity; Location; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Fish Fingerlings & Juveniles

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Tilapia fingerlings; Catfish fingerlings; Trout fingerlings; Marine fish juveniles; Prawn juveniles; Crab juveniles; Other aquatic juveniles

**Attributes:** Species; Strain; Age; Size; Average Weight; Quantity; Sex/Monosex; Source; Hatchery; Health status; Certification

**Options:** UNSPECIFIED

**Filters:** Species; Age; Size; Quantity; Hatchery; Health; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Fish Breeding & Hatchery

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Broodstock; Breeding fish; Fish eggs; Fingerlings; Hatchery equipment; Hatchery supplies

**Attributes:** Species; Breed/Strain; Sex; Age; Breeding status; Source; Hatchery; Quantity; Health status

**Options:** UNSPECIFIED

**Filters:** Species; Age; Breeding status; Quantity; Hatchery; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Seaweed & Aquatic Plants

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Fresh seaweed; Dried seaweed; Seaweed seedlings; Seaweed farming materials; Other aquatic plants

**Attributes:** Species; Strain; Fresh/Dried; Quality; Moisture; Origin; Harvest Date; Weight; Packaging; Processing

**Options:** UNSPECIFIED

**Filters:** Species; Fresh/Dried; Quality; Origin; Weight; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Pearl & Shell Products

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Pearl oysters; Pearls; Oyster shells; Shell raw material; Shell crafts raw material

**Attributes:** Species; Size; Quality; Color; Origin; Cultured/Wild; Processing

**Options:** UNSPECIFIED

**Filters:** Species; Quality; Origin; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Fishing Equipment

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Fishing nets; Hooks; Fishing lines; Traps; Fishing rods; Reels; Floats; Sinkers; Baskets; Fish traps; Fish cages; Fishing knives/tools; Cool boxes; Fish crates; Life jackets; Fishing lights; Navigation equipment

**Attributes:** Equipment Type; Material; Size; Length; Mesh Size; Capacity; Brand; Model; Condition; Target Species; Water Type

**Options:** UNSPECIFIED

**Filters:** Equipment Type; Mesh Size; Length; Target Species; Condition; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Boats & Fishing Vessels

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Fishing boat; Canoe; Fiberglass boat; Wooden boat; Boat engine; Outboard motor; Boat accessories

**Attributes:** Boat Type; Material; Length; Width; Capacity; Engine Type; Engine Power; Fuel Type; Year; Condition; Registration; Safety Equipment

**Options:** UNSPECIFIED

**Filters:** Boat Type; Material; Capacity; Condition; Location; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Aquaculture Equipment

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Fish tanks; Fish cages; Pond liners; Aerators; Water pumps; Water filters; Feeders; Fish graders; Hatchery tanks; Incubation equipment; Water testing equipment; Oxygen equipment

**Attributes:** Equipment Type; Capacity; Material; Power; Voltage; Flow Rate; Oxygen Capacity; Brand; Model; Condition; Warranty

**Options:** UNSPECIFIED

**Filters:** Equipment Type; Capacity; Power; Condition; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Fish Feed & Aquaculture Inputs

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Fish feed; Fingerling feed; Grower feed; Finisher feed; Broodstock feed; Artemia; Feed additives; Aquaculture supplements

**Attributes:** Target Species; Life Stage; Feed Type; Protein %; Pellet Size; Weight; Packaging; Brand; Ingredients

**Options:** UNSPECIFIED

**Filters:** Target Species; Life Stage; Feed Type; Protein; Weight; Brand; Price

**Features:** Aquaculture input

**Variant rule:** []

**Unit rule:** UNSPECIFIED

**Compliance:** ANIMAL_FEED_CONDITIONAL

### Fish Processing & Cold Chain Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

### Fisheries Trade

**Classification:** CONTEXT_ONLY
**Definition state:** UNSPECIFIED

Canonical treatment: context/commercial/compliance concept; not an ordinary Product Type.

### Fish Landing / Source

**Classification:** CONTEXT_ONLY
**Definition state:** UNSPECIFIED

## CAT-06 — Misitu, Mbao & Bidhaa Asilia

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 21

Canonical treatment: context/commercial/compliance concept; not an ordinary Product Type.

### Miti & Magogo

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Round logs; Tree trunks; Saw logs; Pulpwood; Poles raw; Firewood logs; Plantation logs; Hardwood logs; Softwood logs

**Attributes:** Species; Scientific Name; Local Name; Origin; Forest Type; Plantation/Natural; Tree Age; Log Length; Diameter; Volume; Moisture; Grade; Quality; Treatment; Certification; Quantity; Unit

**Options:** UNSPECIFIED

**Filters:** Species; Origin; Grade; Moisture; Length; Diameter; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Mbao / Sawn Timber

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Timber planks; Boards; Battens; Beams; Rafters; Flooring timber; Structural timber; Hardwood timber; Softwood timber

**Attributes:** Species; Grade; Thickness; Width; Length; Moisture; Surface; Treatment; Planed/Unplaned; Kiln Dried/Air Dried; Origin; Certification

**Options:** Surface=[Rough sawn, Planed, Sanded]; Drying=[Fresh, Air dried, Kiln dried]; Treatment=[Untreated, Treated]

**Filters:** Species; Grade; Thickness; Width; Length; Drying; Treatment; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Poles & Posts

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Building poles; Fence posts; Utility poles; Transmission poles; Farm poles; Treated poles; Untreated poles; Round poles; Split poles

**Attributes:** Species; Diameter; Length; Treatment; Strength Class; Grade; Moisture; Usage; Origin

**Options:** UNSPECIFIED

**Filters:** Purpose; Species; Length; Diameter; Treatment; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Plywood & Engineered Wood

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Plywood; MDF; HDF; Fibreboard; Particle board; OSB; Blockboard; Finger-jointed boards; Laminated wood; Engineered timber

**Attributes:** Product Type; Wood Species; Core Type; Thickness; Width; Length; Grade; Surface; Moisture Resistance; Fire Resistance; Application; Brand; Certification

**Options:** UNSPECIFIED

**Filters:** Product Type; Thickness; Width; Length; Grade; Application; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Veneer

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Natural veneer; Reconstituted veneer; Decorative veneer; Wood veneer sheets

**Attributes:** Species; Pattern; Thickness; Sheet Size; Finish; Grade; Color; Origin

**Options:** UNSPECIFIED

**Filters:** Species; Thickness; Finish; Grade; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Sawdust & Wood Residues

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Sawdust; Wood chips; Wood shavings; Bark; Wood offcuts; Wood waste; Biomass residues

**Attributes:** Wood Species; Particle Size; Moisture; Clean/Contaminated; Weight; Packaging; Intended Use

**Options:** UNSPECIFIED

**Filters:** Species; Particle Size; Moisture; Intended Use; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Firewood

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Firewood logs; Split firewood; Bundled firewood; Cooking firewood; Dry firewood

**Attributes:** Species; Moisture; Length; Diameter; Weight; Volume; Dryness; Packaging; Origin

**Options:** UNSPECIFIED

**Filters:** Species; Dry; Weight; Volume; Bulk; Location; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Charcoal & Biomass Fuel

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Charcoal; Hardwood charcoal; Briquettes; Biomass briquettes; Wood pellets; Biomass pellets

**Attributes:** Source Material; Species; Production Method; Fixed Carbon; Ash Content; Moisture; Heat Value; Piece Size; Weight; Packaging; Origin

**Options:** UNSPECIFIED

**Filters:** Source Material; Production Method; Moisture; Weight; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Bamboo

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Raw bamboo poles; Bamboo culms; Bamboo sticks; Bamboo splits; Bamboo boards; Bamboo panels; Bamboo flooring; Bamboo charcoal; Bamboo fibre; Bamboo craft material

**Attributes:** Species; Diameter; Length; Wall Thickness; Age; Treatment; Drying; Grade; Origin

**Options:** UNSPECIFIED

**Filters:** Species; Diameter; Length; Treatment; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Rattan, Canes & Reeds

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Rattan cane; Rattan poles; Cane; Reeds; Woven cane material; Raw weaving material

**Attributes:** Species; Diameter; Length; Flexibility; Dryness; Treatment; Grade; Weight; Origin

**Options:** UNSPECIFIED

**Filters:** Species; Diameter; Length; Dryness; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Natural Fibres

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Sisal fibre; Coconut fibre; Palm fibre; Bark fibre; Raffia; Natural weaving fibre; Other forest fibres

**Attributes:** Fibre Type; Source; Length; Grade; Color; Processing; Moisture; Weight; Packaging

**Options:** UNSPECIFIED

**Filters:** Fibre Type; Grade; Processing; Weight; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Resins, Gums & Latex

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Pine resin; Gum arabic; Natural gums; Latex; Tree sap; Frankincense; Myrrh; Natural resin products

**Attributes:** Source Species; Type; Grade; Purity; Processing; Origin; Color; Moisture; Weight; Packaging

**Options:** UNSPECIFIED

**Filters:** Type; Grade; Purity; Processing; Origin; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Wild Fruits, Nuts & Seeds

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Baobab fruit; Baobab powder; Wild berries; Wild fruits; Forest nuts; Wild seeds; Tamarind; Indigenous fruits; Other forest foods

**Attributes:** Species; Local Name; Origin; Harvest Season; Fresh/Dried; Processing; Grade; Weight; Packaging; Organic/Wild Harvested

**Options:** UNSPECIFIED

**Filters:** Species; Fresh/Dried; Origin; Grade; Organic; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Mushrooms & Wild Foods

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Fresh mushrooms; Dried mushrooms; Wild mushrooms; Edible fungi; Wild vegetables; Wild leaves; Forest food products

**Attributes:** Species; Edible Status; Fresh/Dried; Origin; Harvest Date; Processing; Weight; Packaging

**Options:** UNSPECIFIED

**Filters:** Species; Fresh/Dried; Origin; Harvest Date; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Medicinal Plants & Herbs

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Medicinal leaves; Roots; Bark; Seeds; Flowers; Herbal plants; Dried herbs; Aromatic plants; Traditional medicine raw materials

**Attributes:** Plant Species; Local Name; Plant Part; Fresh/Dried; Origin; Harvest Method; Processing; Weight; Packaging; Traditional Use

**Options:** UNSPECIFIED

**Filters:** Plant Species; Plant Part; Fresh/Dried; Origin; Price

**Features:** Traditional use

**Variant rule:** []

**Unit rule:** UNSPECIFIED

**Compliance:** HEALTH_PRODUCT_CONDITIONAL

### Natural Dyes & Aromatics

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Natural dyes; Plant pigments; Bark dyes; Natural fragrance materials; Essential-oil raw materials; Aromatic resins; Incense materials

**Attributes:** Source Plant; Color; Extraction Method; Purity; Form; Weight; Packaging; Origin

**Options:** UNSPECIFIED

**Filters:** Source Plant; Color; Purity; Form; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Thatch & Natural Roofing Materials

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Grass thatch; Palm leaves; Coconut leaves; Reed roofing; Bamboo roofing material; Natural roofing bundles

**Attributes:** Material; Length; Dryness; Treatment; Bundle Size; Coverage Area; Origin

**Options:** UNSPECIFIED

**Filters:** Material; Length; Dryness; Coverage Area; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Tree Seeds & Nursery Materials

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Tree seeds; Forest tree seedlings; Bamboo seedlings; Nursery seedlings; Propagation materials

**Attributes:** Species; Variety; Source; Germination; Age; Height; Container; Certification; Quantity

**Options:** UNSPECIFIED

**Filters:** Species; Variety; Germination; Age; Quantity; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Forest Products Used for Construction

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Timber; Poles; Bamboo; Roofing material; Wood panels; Boards; Structural wood; Natural building materials

**Attributes:** Material Type; Species; Grade; Treatment; Dimensions; Moisture; Origin; Certification; Intended Use

**Options:** UNSPECIFIED

**Filters:** Material Type; Species; Grade; Treatment; Price

**Features:** UNSPECIFIED

**Variant rule:** {"mode":"UNSPECIFIED","candidates":[]}

**Unit rule:** UNSPECIFIED

**Compliance:** UNSPECIFIED

### Forest & Wood Equipment

**Classification:** PRODUCT_DEFINED
**Definition state:** EXPLICIT

**Product Types:** Chainsaws; Sawmills; Portable sawmills; Wood splitters; Wood chippers; Log loaders; Wood dryers/kilns; Wood treatment equipment; Woodworking machinery; Resin tapping equipment; Bamboo processing machines

**Attributes:** Equipment Type; Brand; Model; Power; Fuel; Capacity; Cutting Capacity; Condition; Year; Warranty

**Options:** UNSPECIFIED

**Filters:** Equipment Type; Brand; Power; Capacity; Condition; Price

**Features:** Industrial Grade

**Variant rule:** []

**Unit rule:** UNSPECIFIED

**Compliance:** MACHINERY_SAFETY_CONDITIONAL

### Forest Trade & Compliance

**Classification:** CONTEXT_ONLY
**Definition state:** UNSPECIFIED

## CAT-07 — Nguo & Mavazi

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 22

Canonical treatment: context/commercial/compliance concept; not an ordinary Product Type.

### Vitambaa

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Kitenge & Khanga

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Nguo za Kiume

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Nguo za Kike

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Nguo za Watoto

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Nguo za Watoto Wachanga

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Nguo za Jadi & Kitamaduni

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Nguo za Kazi & Uniform

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Sportswear & Activewear

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Underwear & Sleepwear

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Nguo za Sherehe & Occasion Wear

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Hijab & Modest Wear

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Outerwear

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Swimwear

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Viatu

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mifuko & Fashion Accessories

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Textile Accessories & Trims

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Tailoring Materials

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Made-to-Measure / Custom Clothing

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Clothing Rental

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Second-hand / Mitumba

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Handmade / Local Made

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-08 — Urembo & Personal Care

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 21

### Skincare

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Haircare

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Hair Styling & Treatment Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Makeup & Cosmetics

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Fragrance & Perfume

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Bath & Body Care

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Oral & Dental Personal Care

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Nail Care

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Shaving & Grooming

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Men's Grooming

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Feminine Personal Care

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Baby Personal Care

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Deodorants & Antiperspirants

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Sun Care

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Beauty Tools & Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Hair Extensions & Wigs

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Beauty Accessories & Consumables

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Natural & Herbal Beauty Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Beauty Packaging

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Professional Beauty Supplies

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Beauty Services

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-09 — Nyumba & Samani

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 22

### Samani

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Living Room

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Bedroom

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Kitchen Furniture & Storage

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Dining

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Office & Home Office

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Bathroom Furniture

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Outdoor & Garden Furniture

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mattresses & Bedding

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Curtains & Window Coverings

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Rugs, Carpets & Mats

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Home Décor

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Lighting & Decorative Lighting

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Kitchenware & Tableware

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Home Storage & Organization

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Household Textiles

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Cleaning & Household Supplies

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Home Safety & Utility Accessories

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Handmade & Traditional Home Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Custom-Made Furniture

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Home Sets

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Furniture/Household Trade & Custom Orders

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-10 — Ujenzi & Hardware

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 28

### Cement, Lime & Binders

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Sand, Aggregates & Fillers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Bricks, Blocks & Masonry

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Concrete Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Steel & Reinforcement

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Structural Steel & Metal Sections

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Roofing Materials

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Timber for Construction

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Boards & Panels

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Doors, Windows & Frames

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Flooring & Wall Finishes

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Paints, Coatings & Finishes

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Waterproofing & Sealants

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Plumbing & Water Systems

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Sanitaryware

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Electrical Installation Materials

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Fasteners & Fixings

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Hand Tools

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Power Tools

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Construction Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Safety & PPE

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Building Chemicals & Additives

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Fencing & Gates

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Glass & Glazing

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Insulation & Ceiling Systems

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Scaffolding & Formwork

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### General Hardware

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Bulk / Construction Trade

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-11 — Electronics & Appliances

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 19

### TVs & Home Entertainment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Audio & Speakers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Cameras & Imaging

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Home Appliances

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Kitchen Appliances

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Cooling & Heating

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Washing & Laundry

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Personal Care Appliances

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Small Electrical Appliances

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Power & Backup Devices

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Batteries & Chargers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Smart Home

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Electronic Components

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Cables, Adapters & Connectors

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Gadgets & Accessories

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Office Electronics

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Commercial Appliances

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Professional / Industrial Electronics

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Replacement Electronic Parts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-12 — Simu & Mawasiliano

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 20

### Simu za Mkononi

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Tablets & Mobile Computing

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Simu za Kawaida / Feature Phones

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Smartphones

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Foldable & Specialty Phones

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mobile Modems & MiFi

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Routers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Wi-Fi & Wireless Networking

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Network Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Antennas & Signal Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### SIM & eSIM Related Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Wearables & Communication Devices

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### GPS & Tracking Devices

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### IoT & M2M

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Communication Radios

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Intercom & Communication Systems

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Phone Accessories

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mobile Power

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mobile Replacement Parts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Network Accessories

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-13 — Computers & IT

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 31

### Laptops

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Desktop Computers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### All-in-One Computers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mini PCs

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Workstations

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Servers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Thin Clients

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Tablets/Hybrid Computers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Computer Components

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### CPUs & Processors

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Motherboards

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### RAM & Memory

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Graphics Cards

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Storage Devices

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Power Supplies

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Computer Cases

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Cooling Systems

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Monitors & Displays

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Keyboards & Mice

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Printers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Scanners

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Projectors & Presentation

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### POS & Business Computing

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### UPS & Computer Power

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Network/IT Infrastructure

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Cables & Adapters

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### External Accessories

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Servers & Data Center Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Software & Licenses

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Refurbished & Used IT

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### IT Trade / Bulk / Custom Builds

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-14 — Magari & Vyombo

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 22

### Magari Madogo

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### SUVs & 4x4

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pickups

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Vans & Minibuses

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Buses

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Trucks

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Trailers & Semi-Trailers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Motorcycles

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Tricycles

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Electric Vehicles

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Hybrid Vehicles

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Agricultural Vehicles

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Construction & Special Vehicles

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Emergency & Special Purpose Vehicles

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Recreational Vehicles

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Commercial Vehicles

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Boats & Watercraft

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Vehicle Accessories

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Vehicle Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Used Vehicles

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Vehicle Trade / Import

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Vehicle Rental / Sale Context

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-15 — Vipuri & Accessories

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 33

### Engine Parts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Transmission & Drivetrain

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Fuel System

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Air Intake & Exhaust

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Cooling System

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Electrical & Ignition

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Starting & Charging

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Suspension

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Steering

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Braking System

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Wheels & Tyres

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Body Parts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Interior Parts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Glass & Mirrors

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Lighting

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### HVAC / Air Conditioning

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Filters

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Lubrication

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Exhaust & Emission

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### EV & Hybrid Parts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Motorcycle Parts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Truck & Heavy Equipment Parts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Trailer Parts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Marine/Boat Parts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Performance Parts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Safety Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Vehicle Accessories

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Tools & Workshop Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Consumables

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Used / Salvaged Parts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### OEM Parts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Aftermarket Parts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Bulk / Trade Parts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-16 — Usafiri & Logistics

**Category classification:** UNSPECIFIED
**Hierarchy branches:** 0

Product specification status: UNSPECIFIED / CAT-16 SPECIFICATION REQUIRED. No Product Types or guessed branches are documented.

## CAT-17 — Huduma za Nyumbani

**Category classification:** SERVICE
**Hierarchy branches:** 0

Canonical treatment: Service authority; intentionally not represented as Product definitions.

## CAT-18 — Ufundi & Repair

**Category classification:** SERVICE
**Hierarchy branches:** 0

Canonical treatment: Service authority; intentionally not represented as Product definitions.

## CAT-19 — Afya & Bidhaa za Afya

**Category classification:** SERVICE
**Hierarchy branches:** 0

Canonical treatment: Service authority; intentionally not represented as Product definitions.

## CAT-20 — Elimu & Mafunzo

**Category classification:** SERVICE
**Hierarchy branches:** 0

Canonical treatment: Service authority; intentionally not represented as Product definitions.

## CAT-21 — Biashara & Professional Services

**Category classification:** SERVICE
**Hierarchy branches:** 0

Canonical treatment: Service authority; intentionally not represented as Product definitions.

## CAT-22 — Fedha & Insurance

**Category classification:** SERVICE
**Hierarchy branches:** 0

Canonical treatment: Service authority; intentionally not represented as Product definitions.

## CAT-23 — Ajira & Kazi

**Category classification:** SERVICE
**Hierarchy branches:** 0

Canonical treatment: Service authority; intentionally not represented as Product definitions.

## CAT-24 — Hotel, Malazi & Utalii

**Category classification:** SERVICE
**Hierarchy branches:** 0

Canonical treatment: Service authority; intentionally not represented as Product definitions.

## CAT-25 — Migahawa, Restaurants & Catering

**Category classification:** SERVICE
**Hierarchy branches:** 0

Canonical treatment: Service authority; intentionally not represented as Product definitions.

## CAT-26 — Burudani, Michezo & Events

**Category classification:** SERVICE
**Hierarchy branches:** 0

Canonical treatment: Service authority; intentionally not represented as Product definitions.

## CAT-27 — Sanaa & Ubunifu

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 20

### Michoro & Paintings

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Sculptures & 3D Art

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Photography Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Posters & Prints

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Handmade Creative Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Beads, Jewellery & Artistic Accessories

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Textile Art & Creative Fabric Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Calligraphy & Typography Art

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Cultural & Traditional Art Objects

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pottery, Ceramics & Artistic Clay Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Wood Art & Carving

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Metal Art

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Glass Art

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Leather Art & Craft

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Paper & Book Art

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Creative Gifts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Souvenirs & Collectibles

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Art Materials — PRODUCTS

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Frames & Display Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Art Collections & Sets

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-28 — Bidhaa za Jadi & Utamaduni

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 22

### Nguo za Jadi & Traditional Wear

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Vikapu & Weaving Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Traditional Pottery & Ceramics

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Traditional Woodcraft

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Masks & Ceremonial Objects

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Traditional Jewellery & Ornaments

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Traditional Musical Instruments

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Traditional Household Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Traditional Kitchen & Utensils

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Traditional Agricultural & Rural Tools

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Traditional Hunting/Fishing Craft Objects

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Traditional Food Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Traditional Beauty & Personal-care Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Indigenous Natural Craft Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Traditional Textiles & Handwoven Fabrics

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Traditional Leather Craft

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Traditional Footwear

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Traditional Toys & Cultural Children’s Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Traditional Decorative & Heritage Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Traditional & Cultural Gift Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Cultural Souvenirs

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Collectible & Heritage Items

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-29 — Harusi & Sherehe

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 28

### Wedding Dresses & Bridal Wear

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Groom Wear

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Bridesmaids & Wedding Party Wear

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Wedding Veils & Head Accessories

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Wedding Jewellery & Accessories

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Wedding Shoes

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Wedding Invitations & Stationery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Wedding Gift Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Wedding Décor Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Balloons & Balloon Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Party Decorations

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Birthday Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Graduation Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Baby Shower Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Baby Celebration Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Religious Celebration Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Seasonal Celebration Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Party Tableware

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Cake & Dessert Decoration Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Party Favors & Guest Gifts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Gift Packaging

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Event Lighting Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Event Signs & Boards

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Party Costumes & Props

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Wedding & Party Furniture — PRODUCTS

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Event Equipment — PRODUCTS

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Custom Event Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Event Bundles / Sets

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-30 — Mama, Mtoto & Familia

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 27

### Maternity Wear

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Maternity Support Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Maternity Accessories

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Baby Clothing — Newborn

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Children’s Clothing

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Baby Shoes & Footwear

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Baby Diapers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Changing Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Baby Wipes & Hygiene

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Baby Bath Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Baby Feeding Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Breastfeeding Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Baby Food Storage & Preparation

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Nursery & Sleeping Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Baby Furniture

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Strollers & Prams

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Baby Car Seats

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Baby Carriers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Baby Safety Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Baby Monitors

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Baby Toys & Development Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Baby Books & Learning Materials

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Children’s School Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Family Travel Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Family Care & Household Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Baby & Children’s Gifts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Maternity & Baby Bags

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-31 — Wanyama & Pets

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 32

### Pets / Companion Animals

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Food

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Dog Food

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Cat Food

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Rabbit & Small-Animal Food

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Bird Food

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Fish & Aquarium Animals

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Aquarium Fish Food

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Treats

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Supplements

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Bowls & Feeding Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Beds & Sleeping Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Kennels, Cages & Enclosures

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Carriers & Travel

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Collars, Leashes & Harnesses

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Identification Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Grooming Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Hygiene Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Toys

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Cat Scratching & Climbing Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Clothing & Accessories

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Furniture

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Safety Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Health Products — NON-MEDICINE

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Waste Management

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Travel & Outdoor Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Aquarium Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Aquarium Décor

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Breeding / Reproductive Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Animal Housing & Farm-Pet Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Gift Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pet Product Bundles

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-32 — Ofisi, Shule & Stationery

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 29

### Paper & Paper Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Writing Instruments

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pencils & Drawing Instruments

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Erasers & Correction Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Sharpeners

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Notebooks & Exercise Books

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Registers & Business Books

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Files & Folders

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Filing & Archive Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Desk Accessories

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Staplers & Staples

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Scissors & Cutting Tools

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Rulers & Measuring Tools

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Geometry & Mathematical Sets

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### School Bags & Cases

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Lunch & School Containers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Classroom Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Whiteboards & Writing Boards

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Educational Materials

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Books & Educational Publications

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Art & Craft Supplies

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Printer & Copier Consumables

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Labels & Identification

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Packaging & Mailing Stationery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Calendars, Diaries & Planners

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Stamps & Stamp Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### ID, Card & Badge Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Office & School Consumables

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Custom Printed Stationery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-33 — Viwanda & Mashine

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 31

### Industrial Machinery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Production Machinery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Food Processing Machinery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Grain & Crop Processing Machinery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Oil Processing Machinery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Textile & Garment Machinery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Woodworking Machinery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Metalworking Machinery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Welding Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Machine Tools

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Dies, Moulds & Tooling

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pumps

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Compressors & Air Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Boilers & Steam Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Industrial Mixers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Industrial Ovens & Dryers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Industrial Cooling & Refrigeration Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Material Handling Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Lifting Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Conveyors

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Plastic & Rubber Processing Machinery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Printing & Industrial Finishing Machinery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mining & Mineral Processing Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Recycling & Waste Processing Machinery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Industrial Cleaning Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Workshop Machinery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Machine Components

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Industrial Consumables

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Used Industrial Machinery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Refurbished Machinery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Attachments

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-34 — Nishati & Umeme

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 37

### Solar Energy Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Solar PV Modules

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Solar Inverters

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Solar Charge Controllers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Solar Batteries & Energy Storage

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Battery Packs & Energy Storage Systems

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Solar Kits

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Solar Mounting & Installation Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Solar Cables & Connectors

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Solar Lighting

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Solar Water Heating

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Solar Water Pumping

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Generators

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Generator Components

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Inverters & Backup Power

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### UPS Systems

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Portable Power Stations

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Batteries — General

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Battery Chargers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Electrical Distribution Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Circuit Protection

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Switches & Sockets

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Transformers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Voltage Regulators & Stabilizers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Cables & Wires

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Cable Accessories

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Earthing & Lightning Protection

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Lighting Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Electric Motors

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Motor Controllers & Drives

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### EV Charging Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Energy Monitoring Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Power Quality Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Electrical Test Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Smart Energy Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Industrial / Commercial Energy Systems

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Energy-Related Consumables

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-35 — Maji, Usafi & Mazingira

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 34

### Water Storage

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Water Tanks

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Water Containers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Water Collection Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Rainwater Harvesting Systems

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Water Pipes & Tubing

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pipe Fittings

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Water Valves

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Water Pumps

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Water Pressure Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Water Filtration

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Water Purification

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Water Treatment Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Water Disinfection Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Water Testing Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Drinking Water Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Water Dispensers & Coolers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Sanitation Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Toilets & Toilet Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Handwashing Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Hygiene & Cleaning Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Cleaning Chemicals

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Waste Bins & Containers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Waste Sorting & Recycling

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Composting Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Waste Processing Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Wastewater & Septic Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Drainage Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Environmental Monitoring Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Air Quality Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Eco-Friendly Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Biodegradable & Compostable Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Environmental Protection Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Water & Environment Kits

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-36 — Usalama

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 27

### Physical Locks

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Door Locks

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Smart Locks

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Safes & Strongboxes

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Access Control

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Access Credentials

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### CCTV & Video Surveillance

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Security Camera Profile

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### DVR / NVR

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Surveillance Storage

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### CCTV Accessories

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Alarm Systems

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Intrusion Sensors

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Sirens & Warning Devices

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Panic & Emergency Buttons

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Intercom & Entry Communication

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Video Doorbells

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Security Lighting

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Security Mirrors

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Perimeter Security

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Bollards

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Vehicle Security

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### GPS Tracking

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Personal Security Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Identification & Access Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Security Storage

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Security Accessories & Consumables

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-37 — Marketing, Media & Branding

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 33

### Printed Marketing Materials

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Business Cards

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Flyers & Leaflets

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Brochures & Catalogues

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Posters

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Large Format Printing Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Roll-up Banners

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Flags & Branded Flags

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Signboards

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Shop Signs

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Illuminated Signs

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Labels & Stickers

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Barcode & QR Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Window & Glass Branding

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Promotional Merchandise

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Branded Clothing

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Branded Bags

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Promotional Bottles & Mugs

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Pens & Promotional Stationery

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Display Stands

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Exhibition Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### POS Marketing Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Packaging Branding

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Branded Boxes

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Branded Tape

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Promotional Gifts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Media Production Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Photography Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Video Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Audio Recording Equipment

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Studio Lighting

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Projectors & Presentation Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Outdoor Advertising Hardware

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-38 — Digital Products & Online Services

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 29

### Software

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mobile Apps

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Desktop Software

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Web Applications

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### SaaS Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Software License

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Activation Keys & Digital Codes

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Digital Content

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### E-books

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Digital Courses

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Educational Digital Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Digital Business Templates

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Spreadsheet Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Digital Design Assets

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Fonts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Icons

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Stock Photography

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Digital Media

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Digital Games

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Digital Gift Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Digital Memberships

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Digital Community Access

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### APIs & Developer Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### API Access

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Plugins & Extensions

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Themes

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Digital Data Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Digital Reports

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Digital Maps & Geographic Data

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-39 — Used / Second-hand / Refurbished

**Category classification:** OVERLAY_CONTEXT
**Hierarchy branches:** 0

Canonical treatment: cross-category overlay; not an ordinary Product category.

## CAT-40 — Wholesale / Bulk

**Category classification:** OVERLAY_CONTEXT
**Hierarchy branches:** 0

Canonical treatment: cross-category overlay; not an ordinary Product category.

## CAT-41 — Import / Export / Cross-border

**Category classification:** OVERLAY_CONTEXT
**Hierarchy branches:** 0

Canonical treatment: cross-category overlay; not an ordinary Product category.

## CAT-42 — Ardhi & Property

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 30

### Viwanja

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Ardhi ya Kilimo

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Ardhi ya Makazi

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Ardhi ya Biashara

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Ardhi ya Viwanda

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Ardhi ya Ufugaji

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Ardhi ya Misitu / Asili

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Ardhi ya Taasisi / Community

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Nyumba

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Apartments

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Vyumba / Rooms

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Villas

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Townhouses

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Commercial Buildings

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Offices

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Shops / Retail Spaces

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Warehouses

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Workshops

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Industrial Properties

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Farms

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Ranches

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Hotels / Lodges

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Guest Houses

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Rental Properties

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Property for Sale

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Property for Lease

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Property for Rent

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Property Development

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Property Projects

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Property Investment Opportunities

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-43 — Madini, Mawe & Resources

**Category classification:** PRODUCT_PARTIAL
**Hierarchy branches:** 21

### Metallic Minerals

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Precious Metals

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Gemstones

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Industrial Minerals

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Construction Minerals

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Energy Minerals

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Strategic / Critical Minerals

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Rare Earth Elements & Minerals

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Ores

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mineral Concentrates

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Processed Minerals

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Refined Minerals & Metals

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mineral Salts

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Dimension Stone

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Aggregates & Stone Materials

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Sand, Gravel & Clay

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mineral By-products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mineral Samples & Specimens

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Gem Rough

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Cut & Polished Gemstones

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

### Mineral Trade Products

**Classification:** PRODUCT_PARTIAL
**Definition state:** UNSPECIFIED

Runtime note: category-level default exists, but this document does not authorize silent branch inheritance. Branch-level semantics remain incomplete.

## CAT-44 — OTHER / HAIPO HAPA

**Category classification:** FALLBACK
**Hierarchy branches:** 0

Canonical treatment: UNKNOWN / OTHER / NOT_APPLICABLE with review states PENDING, UNDER_REVIEW, MATCHED, MERGED, PROMOTED, REJECTED.

## Runtime identity boundary

Runtime canonical IDs remain in the JavaScript authority. This document does not define a competing ID registry. POS identity remains productId, variantId, sku, unitId, and inventoryKey.

## Reconciliation rule

The canonical reconciliation must distinguish specification evidence from implementation state. A hierarchy branch with no explicit semantic definition is not silently inherited, and an unspecified relationship remains UNSPECIFIED. Product Editor authorization requires all specification-backed Product semantics to be implemented and verified.
