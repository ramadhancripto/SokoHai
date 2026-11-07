# Picha 19 za kategoria — mpango wa kupata (unasubiri idhini ya chanzo)

Hali: **hakuna picha iliyopakuliwa wala asset iliyobadilishwa.** Kategoria hizi zinaonyesha tile ya
fallback (herufi ya kwanza juu ya kijani hafifu) hadi picha sahihi ziidhinishwe.

## Vipimo (kila picha)

| Kipimo | Thamani |
| --- | --- |
| Uwiano / ukubwa | 4:3, 1200×900 px |
| Muundo wa faili | WebP, ≤ 120 KB, jina = slug (mf. `uvuvi.webp`) |
| Somo | Bidhaa/huduma ya kategoria katikati, mandhari safi, mwanga wa asili |
| Mtindo | Sawa na picha 20 zilizopo (picha halisi, rangi angavu, hakuna kivuli kizito) |
| Hairuhusiwi | Watermark, logo ya mtu mwingine, maandishi, namba za simu, sura za watu maarufu |
| Leseni | Matumizi ya kibiashara bila malipo ya ziada wala sharti la watermark |

## Orodha

| # | Kategoria | Slug inayopendekezwa | Somo la picha |
| --- | --- | --- | --- |
| 1 | CAT-03 Mazao & Biashara ya Kilimo | `mazao` | Magunia ya mahindi / maharage sokoni |
| 2 | CAT-05 Uvuvi & Baharini | `uvuvi` | Samaki wabichi, mtumbwi au nyavu |
| 3 | CAT-06 Misitu, Mbao & Bidhaa Asilia | `mbao` | Mbao zilizopangwa au magogo |
| 4 | CAT-08 Urembo & Personal Care | `urembo` | Vipodozi na vifaa vya urembo |
| 5 | CAT-12 Simu & Mawasiliano | `simu` | Simu janja pekee |
| 6 | CAT-13 Computers & IT | `kompyuta` | Laptop / desktop |
| 7 | CAT-15 Vipuri & Accessories | `vipuri` | Vipuri vya magari au pikipiki |
| 8 | CAT-32 Ofisi, Shule & Stationery | `stationery` | Madaftari, kalamu, vifaa vya ofisi |
| 9 | CAT-33 Viwanda & Mashine | `mashine` | Mashine ya kiwanda / karakana |
| 10 | CAT-34 Nishati & Umeme | `nishati` | Paneli za sola, nyaya |
| 11 | CAT-35 Maji, Usafi & Mazingira | `maji` | Tanki la maji, vifaa vya usafi |
| 12 | CAT-38 Digital Products & Online Services | `digital` | Skrini ya app / software |
| 13 | CAT-41 Import / Export / Cross-border | `bandari` | Makontena bandarini |
| 14 | CAT-42 Ardhi & Property | `ardhi` | Kiwanja / nyumba |
| 15 | CAT-43 Madini, Mawe & Resources | `madini` | Madini ghafi / mawe |
| 16 | Huduma: Writing & Translation | `svc-writing-2` | Mtu anaandika au kutafsiri |
| 17 | Huduma: Online Coaching | `svc-coaching-2` | Darasa la mtandaoni |
| 18 | Huduma: Website Services | `svc-website-2` | Mbunifu wa tovuti kazini |
| 19 | Huduma: Rental Services | `svc-rental-2` | Vifaa vya kukodi (viti, hema) |

Faili 10 za zamani zenye watermark (`svc-construction`, `svc-rental`, `huduma`, `vitabu`, `vito`, `kale`,
`maagizo`, `svc-coaching`, `svc-writing`, `svc-website`) zinabaki kwenye disk na hazionyeshwi. Slug mpya
zina `-2` ili zisiandike juu ya faili za zamani.

## Vyanzo vinavyowezekana (chagua kimoja)

1. **Picha zako mwenyewe / mpiga picha uliyemlipa** — bora zaidi: zinaonyesha soko la Tanzania na
   umiliki uko wazi.
2. **Unsplash au Pexels** — leseni zao zinaruhusu matumizi ya kibiashara bila malipo na bila watermark.
   Kila picha itarekodiwa: URL ya chanzo, mpiga picha, tarehe ya kupakua, leseni.

## Baada ya idhini

1. Kupakua/kupokea picha 19 → kuzipunguza kuwa WebP 1200×900 ≤ 120 KB.
2. Kuziweka `assets/img/categories/<slug>.webp` (bila kuandika juu ya faili za zamani).
3. Kujaza `PHOTO_BY_ID` / `PHOTO` kwenye `js/app/83-category-photos.js`.
4. `tools/test_category_images.mjs` + karatasi ya ukaguzi wa macho (picha zote kwenye gridi moja).
5. Faili `assets/img/categories/SOURCES.md` lenye chanzo na leseni ya kila picha.
