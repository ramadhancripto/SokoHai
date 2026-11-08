# Mapendekezo ya mapping ya kategoria 12 za zamani (2026-11)

HALI: **mapendekezo tu — hakuna kilichotekelezwa.** `shared/taxonomy-legacy-mapping.js` haijabadilishwa.

Jinsi uamuzi utakavyotekelezwa ukiidhinisha: mstari mmoja kwa kila kategoria kwenye
`DIRECT_CATEGORY_MAPPINGS`, kisha `node tools/build_product_schema_bridge.mjs`. Rekodi za bidhaa
HAZIBADILISHWI wala kufutwa: bidhaa ya zamani inabaki na lebo yake, na kichujio cha mnunuzi
kinaiunganisha na CAT-xx kupitia mapping. Kurudisha nyuma = kuondoa mstari huo.

Ushahidi: maneno ya jina na sub-kategoria za zamani yamelinganishwa na majina, sub-kategoria na
aina za bidhaa za taxonomy ya canonical (alama = idadi ya maneno yanayolingana).

| # | Kategoria ya zamani | Sub-kategoria za zamani | Pendekezo | Ujasiri | Ushahidi / tahadhari |
| --- | --- | --- | --- | --- | --- |
| 1 | Afya na Pharmacy (Health) | Medicines; Medical Supplies; OTC Products; Veterinary Medicines; Health Supplements; Personal Health Care | CAT-19 Afya & Bidhaa za Afya | Juu | Alama 7; leaves "Dawa na Medicinal Products", "Medical Devices", "Medical Consumables". Veterinary Medicines inafaa zaidi CAT-04 Mifugo. |
| 2 | Vito na Saa (Luxury) | Jewelry; Watches; Luxury Accessories; Precious Materials & Gems | Hakuna nyumba moja — baki ya zamani | Chini | Jewellery iko CAT-27/28/29 (kisanii, jadi, harusi); saa hazina tawi; vito ghafi CAT-43. Inahitaji tawi jipya la mmiliki. |
| 3 | Vitabu na Elimu (Education) | Books & Publications; School Supplies; Office Stationery; Printing & Paper; Educational Tools | CAT-32 Ofisi, Shule & Stationery | Juu | Alama 9. |
| 4 | Michezo na Mazoezi (Sports) | Sports Equipment; Fitness & Gym; Outdoor & Camping; Sportswear; Accessories | Hakuna — baki ya zamani | Chini | Sportswear iko CAT-07; vifaa vya michezo/gym havina tawi la bidhaa (CAT-26 ni huduma). |
| 5 | Vichezeo na Michezo (Toys) | Toys; Games; Puzzles; Collectibles & Models; Creative Kits | CAT-30 Mama, Mtoto & Familia (kwa sehemu) | Kati | "Baby Toys & Development Products" pekee; michezo ya watoto wakubwa, puzzles, collectibles hazina tawi. |
| 6 | Sauti na Muziki (Music) | Musical Instruments; Audio Systems; Studio & Recording; DJ Equipment | CAT-11 Electronics (audio) | Kati-Chini | "Audio & Speakers" iko CAT-11; ala za muziki za kisasa hazina tawi (CAT-28 ina za jadi tu). |
| 7 | Sanaa na Ubunifu (Arts) | Drawing & Painting; Craft Materials; Art Tools; DIY Kits; Decorative | CAT-27 Sanaa & Ubunifu | Juu | Jina sawa; alama 9. |
| 8 | Dini na Utamaduni (Religion) | Religious Books; Worship Items; Clothing; Ritual & Ceremonial; Cultural Artifacts | CAT-28 Bidhaa za Jadi & Utamaduni | Kati-Juu | Alama 5; vitabu vya dini vinaweza kwenda CAT-32. |
| 9 | Zawadi na Sherehe (Gifts) | Gifts; Flowers; Party Supplies; Celebration Decorations; Greeting Cards | CAT-29 Harusi & Sherehe | Juu | Alama 8; "Gift Packaging" iko CAT-29. |
| 10 | Vifungashio na Printi (Packaging) | Packaging Materials; Printing Materials; Labelling & Branding; Packaging Machines; Industrial Wrapping | Gawanya: CAT-37 (branding/printi) au CAT-33 (mashine) | Kati-Chini | Vifungashio vimetawanyika (CAT-01, 08, 19, 29, 32, 37). Mapping ya moja-kwa-moja itachanganya. |
| 11 | Vitu vya Kale na Thamani (Antiques) | Antiques | Hakuna — baki ya zamani (au CAT-28 + CAT-39) | Chini | Hakuna tawi la "antiques"; CAT-39 ni overlay ya "used", si kategoria. |
| 12 | Mchanganyiko (General Merchandise) | Mixed Retail | CAT-44 OTHER / HAIPO HAPA | Kati | CAT-44 ndiyo fallback ya taxonomy; bidhaa hizi hazina kipimo cha kategoria. |

## Bidhaa zitakazoathirika

Sina ufikiaji wa data ya production (na sijaisoma). Idadi halisi hupatikana kwa zana ya kusoma tu:

    node tools/legacy_category_impact.mjs --allow-production-read --project <id>

Zana inaandika idadi tu kwa kila thamani ya `category` (canonical / ya zamani yenye mapping / ya zamani
bila mapping), haiandiki chochote, na haionyeshi taarifa za bidhaa. Imejaribiwa kwenye emulator
(`tools/test_category_filter_emulator.mjs`).
