# SokoHai: orodha ya faili zilizobadilishwa

**Tawi:** `remediation/consolidated-20261120`
**Msingi:** `origin/main` 9ca6ad2

**Hayakuguswa:** firestore.rules, functions/, shared/ (taxonomy, inventory), category IDs, legacy mappings, `js/00-config.js` (mazingira ya Firebase), PesaPal, data.

## Code ya programu

| Faili | Badiliko | Rejista |
|---|---|---|
| `js/app/00-bootstrap.js` | Kadi moja ya mmiliki (`skh-oc`) kwa SokoHuruCard, ServicePostCard na TransportPostCard; helpers `cardCategoryName`, `cardRatingCompact`; maandishi ya pill ya uthibitishaji; `ProductPostCard` (`col` → `'products'`); `saveData`: ID ya mapema na `setDoc` kwa products/services/drivers | R-03, R-05, R-14, R-16 |
| `js/app/08-app-state.js` | Listener ya `resize` ya `hdr()` imeondolewa; `skipQueue` kwa bidhaa zenye variants; ujumbe wa kweli `builderIncomplete`; `setLoading` inarudishwa kabla ya return | R-02, R-06, R-07, R-08 |
| `js/app/102-publish-outbox.js` | `write()` inarudisha boolean; foleni iliyojaa au storage iliyoshindwa inakataa kwa `failNotice` | R-04 |
| `js/app/03-dashboard.js` | Fallback laini kwa queries za ziada (`__unavailable`) na toast | R-09 |
| `js/app/30-seller-products.js` | `ordersUnavailable`, `productsTruncated`, `ordersTruncated` | R-10 |
| `js/app/39-product-core.js` | `productEligible`: `isOnline!==false` na `availabilityStatus!=='hidden'` | R-01 |
| `js/app/110-business-os-shell.js` | Vitufe vya Taarifa na Gumzo; `__bosSuppressTabRestore` | R-11, R-12 |
| `js/app/112-business-os-pos-page.js` | Wrapper ya `showForm` inaweka bendera ya suppress | R-12 |
| `js/app/111-business-os-overview.js` | Ujumbe wa hitilafu wa ukweli | R-13 |
| `js/app/123-home-layout.js` | Safu 3 (Bidhaa, Huduma, Usafiri) na "Ona Zote"; `rail()`; `buildServicesRail`, `buildTransportRail` | R-15 |
| `css/82-owner-card-style.css` (**mpya**, safu ya mwisho ya CSS) | Muundo wa kadi ya mmiliki; safu za Home; urefu sawa wa kadi kwenye safu | R-14, R-15 |
| `css/66-home-layout.css` | Mpangilio (order) wa `#skhHomeServices` na `#skhHomeTransport` | R-15 |
| `html/00-head.html`, `html/21-scripts.html` | Matoleo ya cache (`?v=`) na `<link>` ya css/82 | — |
| `index.html` | Imejengwa upya kutoka `html/` (`build_html check`: byte-exact) | — |

## Vipimo

| Faili | Badiliko |
|---|---|
| `tools/e2e-emulator/test_owner_card_style.cjs` (**mpya**) | Kadi za mmiliki: bidhaa, huduma na usafiri (360/390/1440); mpangilio wa safu za Home; bidhaa iliyofichwa haionekani; hakuna JS errors |
| `tools/e2e-emulator/test_ui_header_cards.cjs` | Fremu ya 4:3 (picha 60–82% ya kadi); safu ya Home ni `.shx-rail-row > .skh-oc`. Sasa inathibitisha pia kwamba safu ina kadi (awali ilipita bila kadi yoyote). |
| `tools/test_commerce_cards.mjs`, `test_product_card_visual.mjs`, `test_home_ads_product_cards_contract.mjs`, `test_product_name_fallback.mjs` | Contracts zimesasishwa kwa muundo wa mmiliki |
| `tools/test_popular_rail_browser.mjs`, `test_home_product_archive_browser.mjs`, `test_market_rails_browser.mjs`, `test_natural_product_grid_browser.mjs`, `test_waterfall_feed_browser.mjs` | Selectors mpya na fremu ya 4:3; picha mpya haibadilishi urefu wa kadi |
| `tools/test_product_foundation_contract.mjs`, `test_delivery_choice.mjs`, `test_unified_ad_designer.mjs`, `test_admin_control_center.mjs` | Contracts/stubs zilizopitwa na wakati (baseline ilikuwa inashindwa) |
| `tools/test_my_products_kpi_browser.mjs` | Fixture: bidhaa iliyosimamishwa sasa ni `suspended:true`; bidhaa iliyo archived imeongezwa |
| 9 browser tests (business_os, business_os_9_modules, cockpit_kuu, dashboard_data_integrity, demand_insights, sales_insights, product_compare, product_performance, terminology_stage_b) + my_products_kpi | Route ya hiari ya Firebase SDK (`SKH_FIREBASE_SDK_DIR`) kwa mazingira yasiyo na gstatic. Haibadilishi assertions. |

## Nyaraka (docs/audit/2026-11-20/)

- `SOKOHAI-CONSOLIDATED-REMEDIATION-REPORT.md`
- `SOKOHAI-REMEDIATION-TEST-REPORT.md`
- `SOKOHAI-REMAINING-GAPS-AND-BLOCKERS.md`
- `SOKOHAI-CHANGED-FILES-MANIFEST.md` (faili hili)
- `SOKOHAI-ECOM-GAP-AUDIT.md`
- `SOKOHAI-INVENTORY-GAP-AUDIT.md`

## Visivyocommitiwa (kwa makusudi)

- `functions/node_modules`, `node_modules/`, `out/`
- Picha za vipimo (`poster-*.png`, `short-live-*.png`, `welcome-alert-*.png`)
- `docs/reports/TAXONOMY-QUALITY-REPORT-2026-11.*`: imerudishwa kama ilivyokuwa baada ya npm test
