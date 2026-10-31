  /* ---------- decisions, concepts, phases ---------- */
  function renderFlow() {
    var t = function (head, rows) { return '<div class="tablewrap"><table><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>'; };
    var Y = '✓', X = '–';
    $('flow-body').innerHTML =
      '<div class="panel stack"><h2>Maamuzi yako na yanavyoonekana kwenye preview</h2>' + t(['#', 'Uamuzi', 'Kwenye preview', 'Awamu'], [
        ['1', 'Manage only ni channel rasmi', 'Builder › Sales channels: “Kusimamia tu” (inafuta marketplace na POS)', '1'],
        ['2', 'POS quick-add = POS tu kwa default', 'Builder: salesChannels = [pos]; isOnline=false. Marketplace inawashwa kupitia Edit', '1'],
        ['3', 'POS inahitaji location, na safeguard kwa wa zamani', 'Builder › Locations: “Wa zamani (bila location)” → location ya msingi + onyo; “Mpya” → kosa', '1'],
        ['4', 'Multi-location kama awamu tofauti, model tangu mwanzo', 'Stock ina business:location:product:variant:unit; mfano “Stores nyingi”', '4'],
        ['5', 'Online reservation kwanza', 'Tabo “Stock & Reservation”: reserve, expiry, release, confirm, idempotency, race', '3'],
        ['6', 'Jumla ≠ unit/pack-size pricing', 'Builder › Units, bei & stock: sehemu 2 (bei kwa kitengo + packs) na 3 (jumla); mfano “Jumla”', '2'],
        ['7', 'Unit registry moja + legacy mapping', 'Builder › base unit kutoka registry; jedwali la ramani hapa chini', '2'],
        ['8', 'Mlango mmoja, collections mbili', 'Builder › hatua 1; huduma haina inventory wala POS', '1'],
        ['9', 'Pickup / muuzaji / SokoHai, pickup inahitaji location yenye pickup', 'Builder › Delivery; ghala na location ya msingi haziruhusu pickup', '5'],
        ['R2-3', 'TTL ya reservation dakika 15 kwa majaribio tu', 'Simulator inaonyesha TTL kama thamani ya majaribio, haijathibitishwa dhidi ya callback za PesaPal/mobile money', '3'],
        ['R2-4', 'Malipo yaliyochelewa: re-reserve ya atomiki; vinginevyo NEEDS_REVIEW → REFUND_PENDING → refund mara moja', 'Simulator: “Malipo yamefika” baada ya sweep; “Review imeisha → refund”; “Tukio la refund mara 2”', '3'],
        ['R2-5', 'Oda moja = location moja', 'Rekodi moja ya inventory kwa oda; kuchanganya locations ni Awamu 4', '3 / 4'],
        ['R2-6', 'Test accounts na staging tu', 'Hakuna data halisi kwenye preview; utekelezaji utaanzia emulator/staging', '1–5'],
        ['10', 'Hatua dynamic', 'Hatua zisizohusika zinarukwa na hazihesabiwi (mf. huduma: 9 kati ya 10, POS tu: 9)', '1'],
      ]) + '</div>' +
      '<div class="panel stack"><h2>Dhana zisizochanganywa (A)</h2>' + t(['Dhana', 'Inajibu swali', 'Sehemu mpya', 'Sehemu ya zamani inayobaki'], [
        ['Taxonomy', 'Ni nini?', 'taxonomyNodeId, taxonomyPath', 'category, subCategory'],
        ['Nature', 'Inashikika au kidijitali?', 'nature', 'productType (physical/digital)'],
        ['Sales channel', 'Inauzwa wapi?', 'salesChannels[] (manage_only | marketplace | pos)', 'isOnline, isOffline'],
        ['Publication', 'Imechapishwa marketplace?', 'publicationStatus (marketplace tu)', 'publicationStatus'],
        ['Availability', 'Inapatikana kuagizwa?', 'availabilityStatus (out_of_stock inatokana na stock)', 'availabilityStatus'],
        ['Location', 'Stock iko wapi?', 'locations[] + inventory/{business:location:product:variant:unit}', 'storeId, stock'],
        ['Fulfilment', 'Mnunuzi anaipataje?', 'fulfilment.marketplaceLocationId, fulfilment.options[]', '—'],
        ['Pricing', 'Bei gani kwa kipimo/idadi gani?', 'pricing.basePrice, packs[], wholesaleTiers[]', 'price, wholesalePrice, baseUnit, bulkUnit'],
      ]) + '</div>' +
      '<div class="panel stack"><h2>Channel × mahitaji</h2>' + t(['Channels', 'Marketplace', 'POS', 'Location', 'Maelezo + picha', 'Delivery', 'Reservation', 'Stock inapunguzwa na'], [
        ['Kusimamia tu', X, X, 'inashauriwa', 'hiari', X, X, 'inventoryAdjust tu'],
        ['Marketplace', Y, X, 'lazima kwa stock (default inaruhusiwa)', 'lazima', Y, badge('IMPLEMENTED') + ' <span class="small muted">(local + emulator, haija-deploy)</span>', 'oda iliyothibitishwa'],
        ['POS', X, Y, 'duka; wa zamani: default + onyo', 'hiari', X, X, 'posSale ' + badge('IMPLEMENTED')],
        ['Marketplace + POS', Y, Y, 'duka; location ya marketplace ikichaguliwa', 'lazima', Y, badge('IMPLEMENTED') + ' <span class="small muted">(local + emulator, haija-deploy)</span>', 'zote mbili, stock moja'],
      ]) + '</div>' +
      '<div class="panel stack"><h2>Locations za mfano</h2>' + t(['Location', 'Aina', 'POS', 'Pickup', 'Maelezo'], Object.keys(LOCS).map(function (k) { var l = LOCS[k]; return [esc(l.name), LOC_TYPE[l.type], l.pos ? Y : X, l.pickup ? Y : X, esc(l.note || (l.type === 'warehouse' ? 'Ghala: stock ya akiba; haiuzi POS wala pickup kwa default.' : 'Duka: POS + pickup.'))]; })) + '<p class="small muted">Transfer ya stock kati ya locations (Awamu 4) ni tukio la inventory (STOCK_TRANSFER_OUT / IN). Si oda ya delivery. Collection ya leo <span class="mono">stock_transfers</span> ni ya usafirishaji kati ya matawi na inabaki hivyo.</p></div>' +
      '<div class="panel stack"><h2>Ramani ya vitengo vya zamani (uamuzi #7)</h2>' + t(['Chanzo', 'Thamani ya zamani', 'Registry', 'Hatua', 'Maelezo'], (D.unitLegacy || []).map(function (m) { var u = D.units.find(function (x) { return x.id === m.unitId; }); return ['<span class="mono">' + esc(m.source) + '</span>', esc(m.legacy), esc(m.unitId) + (u && !u.ok ? ' <span class="small muted">(haibadilishiki)</span>' : ''), esc(m.action), esc(m.note || '')]; })) + '</div>' +
      '<div class="panel stack"><h2>Inventory lifecycle</h2>' + t(['Tukio', 'Hali', 'Inafanywa na', 'Awamu'], [
        ['Opening stock', badge('IMPLEMENTED'), 'inventoryAdjust OPENING_BALANCE', '1 (ongeza location: 4)'],
        ['Marekebisho / purchase / consumption', badge('IMPLEMENTED'), 'inventoryAdjust + inventory_movements', '—'],
        ['Mauzo ya POS, return, void, refund', badge('IMPLEMENTED'), 'posSale, posReturn, posVoid, posRefund', '—'],
        ['Reserve wakati wa checkout', badge('IMPLEMENTED'), 'inventoryOrderCreated / inventoryReserve: reservedStock kwenye product (local + emulator, OFF kwa default)', '3'],
        ['Confirm baada ya malipo', badge('IMPLEMENTED'), 'ndani ya transaction ya settlePesaPalPayment (commit ya stock + escrow pamoja)', '3'],
        ['Expiry / cancel → release', badge('IMPLEMENTED'), 'inventoryReleaseReservation + inventoryReservationSweep (kila dakika 5)', '3'],
        ['Stock kwa location', badge('PROPOSED'), 'inventory/{key} yenye locationId (leo: stock + reservedStock kwenye product, location moja)', '4'],
        ['Transfer kati ya locations', badge('PROPOSED'), 'inventoryTransfer (out + in, transaction moja)', '4'],
        ['Pickup / delivery ya oda', badge('PARTIAL'), 'mfumo wa delivery uliopo + fulfilment ya bidhaa', '5'],
      ]) + '</div>' +
      '<div class="panel stack"><h2>Awamu (muhtasari)</h2>' + t(['Awamu', 'Lengo', 'Inategemea'], [
        ['1', 'Taxonomy + Seller Builder + legacy compatibility (manage only, POS quick-add, mlango mmoja, safeguard ya location)', '—'],
        ['2', 'Unit registry + pricing normalization (packs, jumla)', '1'],
        ['3', 'Reservation ya online + stock authority (atomic, idempotent)', '1 (inaweza kwenda sambamba na 2)'],
        ['4', 'Inventory ya locations nyingi + transfers', '3'],
        ['5', 'Delivery/pickup integration + full testing', '3, 4'],
      ]) + '<p class="small muted">Maelezo kamili ya kila awamu (files, data model, migration/rollback, rules, tests, risks) yako kwenye hati ya architecture.</p></div>';
  }
