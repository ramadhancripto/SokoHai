# SokoHai: ukaguzi wa mapengo ya Inventory (INV)

**Tarehe:** 20 Nov 2026
**Msingi:** `origin/main` 9ca6ad2, tawi `remediation/consolidated-20261120`.

## Aina ya ukaguzi

- **Ukaguzi wa kusoma tu (READ-ONLY).** Hakuna mabadiliko yoyote ya inventory authority, rules, wala data.
- **Chanzo cha ukweli (server):**
  - `functions/inventory-authority.js`
  - `shared/inventory-reservation-core.js`
  - `shared/pos-product-identity-core.js`
  - `firestore.rules`
- **Chanzo cha ukweli (client):** `js/app/08-app-state.js`, `05-forms.js`, `06-product-builder.js`, `17-hub.js` na `03-dashboard.js`.
- **Vipimo vinavyothibitisha tabia halisi (emulator):**
  - `test_inventory_rules`: 44 zimepita
  - `test_inventory_reservation_emulator`: 27 zimepita
  - `test_decimal_quantity_emulator`
  - E2E 15: POS, stock 4 → 3

## Jedwali la maamuzi

Hali zinazotumika:

- **IPO**: inatekelezwa na server.
- **SEHEMU**: data inakusanywa lakini haitekelezwi, au inatekelezwa upande wa client tu.
- **PENGO**: haipo.

| Eneo | Kipengele | Hali | Ushahidi (file:line) | Uamuzi |
|---|---|---|---|---|
| Harakati za stock | Movement types na ledger | IPO | `inventoryAdjust` movementType ADJUSTMENT / PURCHASE / RETURN / TRANSFER / CONSUMPTION / OPENING_BALANCE (functions/inventory-authority.js:980–983) | Hakuna kazi |
| Uhifadhi wa stock | Reservation → commit / release / expire | IPO | ACTIVE → COMMITTED / RELEASED / EXPIRED (shared/inventory-reservation-core.js:92–93); replay = ALREADY_COMMITTED (:346) | Hakuna kazi |
| Marejesho | Disposition ya bidhaa iliyorudishwa | IPO | SELLABLE_RETURN / DAMAGED_RETURN (inventory-authority.js:114, :880); `posReturn` / `posVoid` (functions/index.js:4393–4396, inventory-authority.js:767) | Hakuna kazi |
| Vipimo vya desimali | kg / L / m (catch-weight) | IPO | `quantityPrecision` (inventory-reservation-core.js:136; pos-product-identity-core.js:163) | Hakuna kazi |
| Uhamisho kati ya maduka/hub | Transfer pamoja na tokens | IPO | `stock_transfers` (js/app/17-hub.js:2167, :2187) | Hakuna kazi |
| Consignment | Umiliki wa bidhaa (owned / consignment) | IPO (Group Soko) | functions/group-soko.js:154 | Hakuna kazi |
| Tahadhari ya stock ndogo | Low-stock threshold | SEHEMU | `lowStockAlert` / `lowStockThreshold` (03-dashboard.js:97; 06-product-builder.js:483). Inaonyeshwa kwenye dashboard tu; hakuna arifa ya server. | Pendekezo; si kasoro |
| Batch / expiry / IMEI | Ufuatiliaji wa lot | SEHEMU | Zinakusanywa wakati wa kuunda bidhaa (08-app-state.js:513–515, :747–749), lakini **hazitekelezwi**: hakuna FEFO wala kuzuia kuuza bidhaa iliyopita muda. HEALTH profile inazidai (canonical-taxonomy-core.js:70). | **BLOCKED**: kutekeleza expiry kunagusa njia ya mauzo na pesa; kunahitaji muundo na idhini |
| Eneo la ghala | Warehouse zone / bin | SEHEMU | `prodWarehouseZone` (08-app-state.js:678; 05-forms.js:532). Ni maandishi tu; hakuna bin-level stock. | Pendekezo |
| Gharama | Cost price | SEHEMU | `buyPrice` ipo (06-product-builder.js:483). Hakuna njia ya gharama (FIFO / weighted average). | **BLOCKED**: uamuzi wa uhasibu |
| Write-off | Sababu za kufuta stock (reason codes) | **PENGO** | ADJUSTMENT haina orodha ya sababu (kuharibika, kuibiwa, kupita muda). DAMAGED_RETURN ipo kwa marejesho tu. | Pendekezo; linahitaji idhini (linabadilisha schema ya ledger) |
| Hesabu ya mzunguko | Cycle count / stocktake | **PENGO** | Hakuna mtiririko wa stocktake. ADJUSTMENT ndiyo njia pekee. | Pendekezo |
| Uchambuzi | ABC / XYZ | **PENGO** | Hakuna | Pendekezo (ripoti tu, haina hatari) |
| Hali ya karantini | Quarantine / QC hold | **PENGO** | Hakuna hali ya stock iliyozuiliwa | Pendekezo; linahitaji idhini |

## Kasoro zilizothibitishwa na kurekebishwa (zinazohusu inventory)

Hizi ni za upande wa client. Inventory authority ya server haikuguswa.

| Kasoro | Marekebisho | Faili |
|---|---|---|
| Bidhaa yenye variants ikihifadhiwa offline, variants zilipotea | Bidhaa zenye variants hazipangwi kwenye foleni ya offline (`skipQueue`); mtumiaji anaambiwa ajaribu tena akiwa mtandaoni | js/app/08-app-state.js |
| Kujaribu tena baada ya hitilafu ya mtandao kungeweza kuunda bidhaa mbili | ID inatengenezwa kabla ya kuandika (`setDoc`), kwa hiyo kujaribu tena kunatumia ID ileile | js/app/00-bootstrap.js (`saveData`) |
| Foleni ilipojaa, kipengele cha zamani kilifutwa kimya kimya | Foleni iliyojaa inakataa kipengele kipya na kumwonyesha mtumiaji ujumbe | js/app/102-publish-outbox.js |
| Orodha ya bidhaa za muuzaji: hitilafu ya oda ilifichwa, kikomo cha 300 hakikuonyeshwa | `ordersUnavailable` na `ordersTruncated`, pamoja na ujumbe kwa mtumiaji | js/app/30-seller-products.js |

## Muhtasari

| Hali | Idadi |
|---|---|
| IPO | 6 |
| SEHEMU | 4 |
| PENGO | 4 |

**BLOCKED:**

- utekelezaji wa expiry/FEFO;
- njia ya gharama (FIFO / weighted average).

Vingine ni mapendekezo yanayohitaji idhini ya mmiliki. Hakuna kilichotekelezwa kwenye server, rules wala schema.
