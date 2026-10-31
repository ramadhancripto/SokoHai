# Inventory, online reservation na Seller model (2026-10-31)

Hali: **IMETEKELEZWA LOCAL + KUPIMWA KWENYE EMULATOR. HAIJA-DEPLOY.**
Online reservation iko **OFF** kwa default (`system_config/inventory.mode = 'off'` au haipo).

## 1. Stock authority moja

| Rekodi | Stock | Imehifadhiwa (reserved) | Inapatikana |
|---|---|---|---|
| Bidhaa rahisi | `products/{id}.stock` | `products/{id}.reservedStock` | `stock − reservedStock` |
| Variant | `variantCombinations[i].stock` | `variantCombinations[i].reserved` | `stock − reserved` |

- POS (`posSale`), marekebisho (`inventoryAdjust`), returns/voids na online orders zinasoma na kuandika
  rekodi hiyohiyo ndani ya transaction moja ya Firestore. Hakuna stock authority ya pili.
- Fields zisizokuwepo = 0, kwa hiyo bidhaa za zamani zinafanya kazi bila migration.
- Browser haiandiki `stock`, `reservedStock` wala `variantCombinations` (rules, F6). Variants zinahifadhiwa
  na `productVariantsSave` (server), ambayo inaweka stock/reserved za sasa na kuongeza variants mpya kwa 0.
- Identity ya stock (`shared/inventory-reservation-core.js#stockKey`):
  `business:location:product:variant|-:unit`. Leo location ni moja kwa bidhaa (`storeId` au default).
  Collection `inventory/{key}` ya locations nyingi ni **Awamu 4** (bado).

## 2. Configuration (`system_config/inventory`, server-only)

| Field | Default | Mipaka | Maelezo |
|---|---|---|---|
| `mode` | `off` | `off` / `pilot` / `all` | `pilot` = wauzaji walio kwenye `pilotSellerIds` tu |
| `pilotSellerIds` | `[]` | | |
| `ttlMinutes` | 15 | 5–60 | **Thamani ya majaribio.** Haijathibitishwa dhidi ya callback za PesaPal/mobile money |
| `reviewWindowMinutes` | 120 | 30–1440 | NEEDS_REVIEW → REFUND_PENDING |
| `ttlValidated` | false | | Iwekwe `true` tu baada ya vipimo vya staging |

## 3. Functions mpya / zilizobadilika (`functions/`)

| Function | Aina | Kazi |
|---|---|---|
| `inventoryOrderCreated` / `inventoryOrderUpdated` | Firestore trigger | Reserve oda mpya ambayo haijalipwa; release ikifutwa |
| `inventoryReserve` | callable (buyer/admin) | Reserve tena (idempotent) |
| `inventoryReleaseReservation` | callable | Release ya oda isiyolipwa |
| `inventoryReservationSweep` | schedule, kila dakika 5 | Expire reservations zilizopitwa na TTL; NEEDS_REVIEW → REFUND_PENDING |
| `inventoryReconcile` | callable (muuzaji kwa bidhaa zake, au admin) | Ripoti ya drift na invariants (haibadilishi data) |
| `settlePesaPalPayment` | ndani ya IPN | Commit ya stock ndani ya transaction ileile ya escrow; late payment → re-reserve au NEEDS_REVIEW; malipo yasiyolingana na oda → `payment_reviews` (UNAPPLIED) |
| `adminPaymentReviewResolve` | callable (admin) | `fulfil` (re-reserve + commit) au `refund` (wallet ya mnunuzi, mara moja tu, audit) |
| `productVariantsSave` | callable | Variants zinahifadhiwa na server (F6) |
| `posSale` | callable | Inakagua `available` (si `stock`), inakataa bidhaa zisizo za POS (`CHANNEL_NOT_POS`), onyo la location kwa wauzaji wa zamani |
| `inventoryAdjust` | callable | Haishuki chini ya `reserved` (`BELOW_RESERVED`); opening stock mara moja kwa kila rekodi (bidhaa au variant) |

Collections mpya (server-only kwenye rules): `inventory_reservations`, `payment_reviews`, `refunds`.
Indexes mpya ziko `firestore.indexes.json`.

## 4. State machines (`shared/inventory-reservation-core.js#MACHINES`)

- Reservation: `ACTIVE → COMMITTED | RELEASED | EXPIRED`. Re-reserve baada ya expiry = hati mpya `{orderId}-R{n}`.
- Review ya oda: `NEEDS_REVIEW → REFUND_PENDING → REFUNDED`, au `→ RESOLVED_FULFILLED`.
- Escrow ya oda iliyo kwenye review haiwezi kutolewa (`escrowReleaseBlocked`).
- Refund: wallet ya SokoHai tu. **Refund kwa PesaPal/mobile money haijatekelezwa** (API haipo kwenye code).

## 5. Seller model (Awamu 1–2, `shared/product-listing-core.mjs`)

- `salesChannels`: `manage_only` (peke yake) | `marketplace` | `pos`. `isOnline`/`isOffline` za zamani
  zinaendelea kuandikwa sambamba.
- POS quick-add = `['pos']` (offline) kwa default.
- Unit registry moja + `UNIT_LEGACY_MAP` (inafanana na `taxonomy-draft/src/model.mjs`).
- `pricing.packs` (katoni/box yenye bei yake) ≠ `pricing.wholesaleTiers` (punguzo kwa idadi).
- `fulfilmentOptions` na `builderSteps` ni sheria za pamoja; fomu ya sasa ya production haijabadilishwa kuwa
  wizard ya hatua 10 (preview inaonyesha muundo huo).

## 5b. Business modes, seller lifecycle na fomu moja ya muuzaji (UX, 31 Okt)

Dhana zinazotenganishwa (kila moja ina field yake; hakuna inayoamua nyingine):

| Dhana | Inakaa wapi | Thamani |
|---|---|---|
| Business mode (default ya bidhaa mpya) | `users.sellerMode` / `businesses` | `HYBRID`, `OFFLINE`, `ONLINE`, `MANAGE_ONLY` (mpya) |
| Sales channels za bidhaa | `products.salesChannels` | `manage_only` / `marketplace` / `pos` |
| Seller lifecycle | `users.sellerType` (server pekee) | `temporary` / `permanent` |
| Store / location | `users.storeAddress`, `storeId` | anwani moja inatumika tena kama mahali pa bidhaa |
| Marketplace publication | `products.publicationStatus` | draft / published / archived |
| Fulfilment | `fulfilmentOptions()` | pickup / seller / SokoHai |

- Kubadilisha business mode **hakubadilishi bidhaa zilizopo**; inabadilisha default ya bidhaa mpya tu.
- `sellerLifecycleChange` (callable): temporary ↔ permanent kwenye akaunti ileile (uid, businessId, bidhaa,
  oda, wallet hazibadiliki), `sellerStatusHistory` + `seller_lifecycle_log` (audit). Permanent inahitaji
  kifurushi hai **pale tu** ada ya subscription imewashwa (`paymentGate('subscription')`). Rules zinazuia
  kivinjari kujipandisha. Uthibitisho wa utambulisho (KYC) haujawekwa kama sharti: unaripotiwa tu
  (`pendingVerification`) mpaka sheria halisi iidhinishwe. `productLimit` bado ni taarifa (haijalazimishwa).
- Fomu ya kuuza (`html/09-admin-sell.html`) ni ileile, ids zilezile, imepangwa kwa makundi:
  1 Inauzwa wapi · 2 Bidhaa (tafuta kategoria kwanza) · 3 Bei & stock · 4 Soko (online tu) · 5 Mahali ·
  6 Variants & sifa (hiari, inafunguka) · Mipangilio zaidi. Rasimu ya ndani (localStorage, kwa kifaa hiki),
  ujumbe wa kosa ndani ya fomu bila kufuta data, "Nakili" bidhaa iliyopita (bila SKU/stock/picha/variants),
  bei/stock moja kwa variants zote, picha za kila rangi/variant kwa mnunuzi.
- Picha ni lazima kwa bidhaa inayouzwa **mtandaoni** tu; dukani-tu/kusimamia-tu zinahifadhiwa bila picha.
- Vipimo: `docs/ux/seller-form-before.json`, `docs/ux/seller-form-after.json`, `docs/ux/seller-speed-2026-10-31.json`
  (`node tools/measure_seller_form.mjs`, `node tools/seller_speed_model.mjs`).

## 5c. Maamuzi ya 1 Nov: verification, attributes, vipimo vya desimali

**Kwa nini stock iko kwenye product, si `inventory/{key}` (uamuzi umebaki):** POS, marekebisho na reservation
zinasoma na kuandika rekodi moja ndani ya transaction moja; hakuna migration ya data iliyopo; bidhaa za zamani
zinafanya kazi bila mabadiliko. Hasara: variants zote ziko kwenye hati moja (ukomo wa 1 MiB, ~1 write/sec kwa
hati moja wakati wa mauzo mengi sana ya bidhaa ileile), na location moja kwa bidhaa. `inventory/{key}` itaongezwa
Awamu 4 kwa locations nyingi, na product itabaki kuwa projection (hakuna "big bang" migration).

- **Verification (configurable, haibuni sheria):** `system_config/seller_verification` (server/admin pekee):
  `{ enforced, requirements: [{ id, label, appliesTo: ['*' | businessType] }] }`. Ushahidi:
  `users.verificationChecks.{id} = true` (admin/server pekee; muuzaji hawezi kuandika). Bila config hakuna
  sharti; mapengo yanaripotiwa tu. Temporary haina ukomo wa server wa bidhaa (uamuzi A).
- **Canonical attributes:** `shared/attribute-alias-core.mjs` juu ya `ATTRIBUTE_REGISTRY` iliyopo. Majina ya
  maana moja (Colour→Color, Package Size→Pack Size, tofauti za herufi) ni attribute moja; Size/Dimensions,
  Grade/Quality na mengine hayaunganishwi bila semantic review. Thamani na lebo za zamani hazibadilishwi.
  Builder inazuia kuongeza "Colour" kama "Color" ipo.
- **Vipimo vya desimali (kg, L, m):** `shared/quantity-core.js` (scaled integers, hakuna rounding drift).
  Bidhaa inachagua kwa `quantityPrecision` (1–3; fomu inaiweka kwa Kg/Litre/Meter). Bila field hiyo bidhaa ni
  ya idadi kamili kama zamani. `posSale`, `inventoryAdjust`, `posReturn`, `posVoid`, reservation core na ripoti
  zinatumia kiasi sahihi; desimali zaidi ya zinazoruhusiwa zinakataliwa (hazizungushwi). Rules: precision ni 0–3
  na haibadilishwi na muuzaji baada ya kuundwa. Kikapu kikuu cha POS (17-hub) bado kinaongeza kwa 1; fomu ya
  mauzo ya haraka (15-pos-sales) inakubali desimali.

## 6. Rollout na rollback

1. Deploy rules + indexes + functions kwenye **staging** (mode `off`). Thibitisha hakuna mabadiliko ya tabia.
2. `mode: 'pilot'` kwa wauzaji wa majaribio (test accounts), PesaPal **sandbox**. Pima muda wa callback.
3. Weka `ttlMinutes` kutokana na vipimo, `ttlValidated: true`.
4. Production: `mode: 'off'` kwanza, kisha pilot, kisha `all`.

Rollback: `mode: 'off'` (reservations zilizopo zinaachiliwa na sweep/cancel; hakuna data inayofutwa).
Functions za zamani hazijaondolewa.

## 7. Tests

```bash
npm test                                   # unit/contract (inajumuisha reservation core + listing core)
npm run test:security:all:emulator         # rules + reservation kwenye Firestore emulator
npm run test:inventory:emulator            # inventory rules + reservation tu
npm run test:browser:taxonomy              # browser, real modules + fixture ya cloud
npm run test:browser:seller-ux             # fomu ya muuzaji: modes, rasimu (kwa kila akaunti), validation, nakili, variants, picha za rangi, kg
# emulator suite ina pia: test_seller_lifecycle_emulator.mjs (21), test_decimal_quantity_emulator.mjs (10)
# browser E2E (run.sh) ina s7: onboarding ya simu x lifecycle x modes + bidhaa ya kg
bash tools/e2e-emulator/run.sh             # browser E2E kwenye emulator (angalia maelekezo ndani)
node tools/build_dist.mjs --check
```

Hazijapimwa: callback halisi za PesaPal/mobile money, muda wa TTL, na production.
