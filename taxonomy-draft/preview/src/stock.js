  /* ---------- Awamu 3 simulator: one stock authority for POS + online (IMPLEMENTED local + emulator; preview ni simulator) ----------
     Each function below = ONE server transaction (T1–T8 in the architecture doc). It reads the
     records it needs, checks the rule, then writes everything or nothing. Every external event
     carries an idempotency key; a key that was already processed returns the first result.
     Three separate state machines per order: order.status · reservation.status · payment.status. */
  var INV = null;
  var TTL = 15; // minutes — trial value only; NOT validated against PesaPal / mobile-money callback timing.
  var REVIEW_WINDOW = 120; // minutes the seller has to restock a late-paid order before refund (proposal).
  function invReset() {
    INV = {
      key: BIZ + ':st-a:prod-dawa-ya-meno:-:piece', name: 'Dawa ya meno 100ml', loc: 'Duka Kariakoo',
      current: 3, reserved: 0, conflictQty: 0, marketplacePaused: false, clock: 0, seq: 0, oseq: 0,
      orders: [], reservations: [], ledger: [], seen: {}, refunds: {}, walletCredits: {}, recon: null, last: '',
    };
    mv('OPENING_BALANCE', 3, 'inventoryAdjust', 'open-1');
  }
  var avail = function () { return INV.current - INV.reserved; };
  function mv(type, qty, by, key, ok, note) { INV.ledger.unshift({ t: INV.clock, type: type, qty: qty, by: by, key: key, ok: ok !== false, note: note || '', cur: INV.current, res: INV.reserved }); }
  function once(key, fn) {
    if (INV.seen[key]) { mv('DUPLICATE_IGNORED', 0, 'idempotency', key, true, 'Tayari: ' + INV.seen[key]); INV.last = 'Tukio ' + key + ' limerudiwa: limepuuzwa (idempotent).'; return INV.seen[key]; }
    var r = fn(); INV.seen[key] = r; return r;
  }
  function order(id) { return INV.orders.find(function (o) { return o.id === id; }); }
  function resv(o) { return INV.reservations.find(function (r) { return r.id === o.resId; }); }

  // T1 orderCreateWithReservation — key checkout:{buyer}:{clientRequestId}
  function checkout(qty, key) {
    return once(key, function () {
      if (INV.marketplacePaused) { mv('RESERVE_REJECTED', qty, 'checkout', key, false, 'Marketplace imesimamishwa kwa conflict ya POS'); INV.last = 'Checkout imekataliwa: rekodi ina conflict ya POS inayosubiri kuhesabiwa.'; return 'PAUSED'; }
      if (!(qty > 0) || avail() < qty) { mv('RESERVE_REJECTED', qty, 'checkout', key, false, 'available ' + avail() + ' < ' + qty); INV.last = 'Oda haikuundwa: stock haitoshi. Hakuna oversell.'; return 'OUT_OF_STOCK'; }
      var id = 'ORD-' + (++INV.oseq), rid = 'RSV-' + INV.oseq;
      INV.reserved += qty;
      INV.reservations.push({ id: rid, orderId: id, qty: qty, status: 'ACTIVE', exp: INV.clock + TTL });
      INV.orders.push({ id: id, qty: qty, resId: rid, status: 'PAYMENT_PENDING', stock: 'RESERVED', pay: 'PENDING' });
      mv('STOCK_RESERVED', qty, id, key); INV.last = id + ' imeundwa na kushikilia ' + qty + ' hadi dakika ' + (INV.clock + TTL) + '.'; return id;
    });
  }
  // Lazy expiry: any transaction that touches a reservation first applies its deadline.
  function applyExpiry(r) { if (r && r.status === 'ACTIVE' && r.exp <= INV.clock) { r.status = 'EXPIRED'; INV.reserved -= r.qty; var o = order(r.orderId); if (o && o.pay === 'PENDING') { o.status = 'EXPIRED'; o.stock = 'RELEASED'; } mv('RESERVATION_EXPIRED', r.qty, r.orderId, 'expire:' + r.id); } }
  // T2 payment settlement — key escrow_holds/order_{id} (+ provider event id); stock commit in the SAME tx.
  function pay(id, evKey) {
    return once(evKey, function () {
      var o = order(id); if (!o) return 'NOT_FOUND';
      if (o.pay !== 'PENDING') { mv('PAYMENT_DUPLICATE', 0, id, evKey, true, 'Hold ya escrow tayari ipo'); INV.last = id + ': malipo yalishashughulikiwa.'; return 'ALREADY'; }
      var r = resv(o); applyExpiry(r);
      if (r.status === 'ACTIVE') {
        r.status = 'COMMITTED'; INV.reserved -= o.qty; INV.current -= o.qty; o.status = 'PAID'; o.stock = 'COMMITTED'; o.pay = 'PAID_HELD';
        mv('STOCK_COMMITTED', -o.qty, id, evKey); INV.last = id + ': malipo + stock vimethibitishwa kwenye transaction moja (escrow inashikilia fedha).'; return 'PAID';
      }
      return latePayment(o, evKey); // T3 inside the same transaction
    });
  }
  // T3 late payment: try to re-acquire atomically; otherwise do NOT confirm the order.
  function latePayment(o, evKey) {
    if (avail() >= o.qty && !INV.marketplacePaused) {
      var rid = 'RSV-' + o.id.slice(4) + '-R';
      INV.reservations.push({ id: rid, orderId: o.id, qty: o.qty, status: 'COMMITTED', exp: INV.clock, reacquired: true });
      INV.current -= o.qty; o.resId = rid; o.status = 'PAID'; o.stock = 'COMMITTED'; o.pay = 'PAID_HELD'; o.late = true;
      mv('LATE_PAYMENT_REACQUIRED', -o.qty, o.id, 'reacquire:' + o.id + ':' + evKey); INV.last = o.id + ': malipo yalichelewa, stock bado ipo: reservation mpya imethibitishwa mara moja.'; return 'PAID_REACQUIRED';
    }
    o.status = 'NEEDS_REVIEW'; o.stock = 'NONE'; o.pay = 'NEEDS_REVIEW'; o.reviewUntil = INV.clock + REVIEW_WINDOW;
    mv('LATE_PAYMENT_NO_STOCK', 0, o.id, evKey, false, 'Fedha zinashikiliwa escrow; oda haijathibitishwa');
    INV.last = o.id + ': malipo yalichelewa na stock haipo. Oda HAIJATHIBITISHWA; payment NEEDS_REVIEW (muuzaji ana dakika ' + REVIEW_WINDOW + ' kuongeza stock, vinginevyo refund).'; return 'NEEDS_REVIEW';
  }
  // T4 cancel (unpaid only) — status guard makes it idempotent.
  function cancel(id) {
    return once('cancel:' + id, function () {
      var o = order(id), r = o && resv(o); applyExpiry(r);
      if (!o || o.pay !== 'PENDING' || r.status !== 'ACTIVE') { INV.last = 'Hakuna reservation hai ya kughairi (oda iliyolipwa inafuata njia ya dispute iliyopo).'; return 'NOOP'; }
      r.status = 'RELEASED'; INV.reserved -= r.qty; o.status = 'CANCELLED'; o.stock = 'RELEASED';
      mv('STOCK_RELEASED', r.qty, id + ' (cancel)', 'cancel:' + id); INV.last = id + ' imeghairiwa: stock imeachiliwa.'; return 'CANCELLED';
    });
  }
  // T5 expiry sweep (schedule every 5 min) — one small tx per reservation, re-checks status inside.
  function sweep(mins) {
    INV.clock += mins;
    var n = 0; INV.reservations.forEach(function (r) { if (r.status === 'ACTIVE' && r.exp <= INV.clock) { applyExpiry(r); n++; } });
    INV.orders.forEach(function (o) { if (o.pay === 'NEEDS_REVIEW' && o.reviewUntil <= INV.clock) toRefund(o.id, 'review_window_elapsed'); });
    INV.last = 'Saa imesogea dakika ' + mins + '. Sweep: reservations ' + n + ' zimeisha.';
  }
  // T6 refund request — deterministic id refunds/online_{orderId}; create-only, so never twice.
  function toRefund(id, why) {
    var o = order(id); if (!o || o.pay !== 'NEEDS_REVIEW') return 'NOOP';
    o.pay = 'REFUND_PENDING'; o.status = 'CANCELLED_NOT_FULFILLED';
    if (!INV.refunds[id]) INV.refunds[id] = { status: 'PENDING', why: why, attempts: 0 };
    mv('REFUND_REQUESTED', 0, id, 'refund:online_' + id, true, why); return 'REFUND_PENDING';
  }
  function completeRefund(id, evKey) {
    return once(evKey, function () {
      var rf = INV.refunds[id], o = order(id);
      if (!rf) { INV.last = 'Hakuna refund ya oda hii.'; return 'NOOP'; }
      if (rf.status === 'COMPLETED') { mv('REFUND_DUPLICATE', 0, id, evKey, true, 'wallet_ledger/refund_late_' + id + ' tayari ipo'); INV.last = id + ': refund ilishakamilika; haitolewi mara ya pili.'; return 'ALREADY'; }
      rf.status = 'COMPLETED'; rf.attempts++; INV.walletCredits[id] = (INV.walletCredits[id] || 0) + 1; o.pay = 'REFUNDED';
      mv('REFUND_COMPLETED', 0, id, 'wallet_ledger/refund_late_' + id); INV.last = id + ': refund kwa SokoPay wallet ya mnunuzi imekamilika (mara moja tu).'; return 'REFUNDED';
    });
  }
  // Seller resolves NEEDS_REVIEW by restocking (inventoryAdjust) — then the same T3 re-acquire path runs.
  function sellerRestockAndFulfil(id) {
    var o = order(id); if (!o || o.pay !== 'NEEDS_REVIEW') return;
    adjust(o.qty, 'restock-for-' + id);
    latePayment(o, 'review:' + id);
  }
  // T7 POS sale — same record, checks AVAILABLE (not current).
  function posSell(qty, key) {
    return once(key, function () {
      if (avail() < qty) { mv('POS_SALE_REJECTED', qty, 'posSale', key, false, 'available ' + avail()); INV.last = 'POS imekataliwa: kilichopo kimeshikiliwa na oda za online.'; return 'REJECTED'; }
      INV.current -= qty; mv('STOCK_SOLD', -qty, 'posSale', key); INV.last = 'POS imeuza ' + qty + ' kutoka rekodi ileile.'; return 'SOLD';
    });
  }
  // T7b offline POS replay: goods already left the shop. Never go negative: keep the sale, record the gap.
  function posOfflineReplay(qty, key) {
    return once(key, function () {
      var take = Math.min(qty, Math.max(0, avail())), gap = qty - take;
      INV.current -= take; if (take) mv('STOCK_SOLD', -take, 'posSale (offline replay)', key);
      if (gap > 0) { INV.conflictQty += gap; INV.marketplacePaused = true; mv('SALE_UNMATCHED', gap, 'posSale (offline replay)', key, false, 'Mauzo yamehifadhiwa; stock haishuki chini ya 0. Marketplace imesimamishwa mpaka stock ihesabiwe.'); INV.last = 'Replay ya POS: ' + gap + ' hazikuwa na stock ya mfumo. Conflict imeundwa; marketplace ya rekodi hii imesimamishwa.'; return 'CONFLICT'; }
      INV.last = 'Replay ya POS imeingia bila conflict.'; return 'SOLD';
    });
  }
  // T8 inventoryAdjust — negative deltas may never cut into reserved stock.
  function adjust(delta, key) {
    return once(key, function () {
      if (INV.current + delta < INV.reserved) { mv('ADJUST_REJECTED', delta, 'inventoryAdjust', key, false, 'current + delta < reserved'); INV.last = 'Marekebisho yamekataliwa: yangeondoa stock iliyoshikiliwa na oda.'; return 'REJECTED'; }
      INV.current += delta; mv(delta >= 0 ? 'STOCK_RECEIVED' : 'STOCK_ADJUSTED', delta, 'inventoryAdjust', key); INV.last = 'Stock ' + (delta >= 0 ? '+' : '') + delta + '.'; return 'OK';
    });
  }
  function countResolve() { // physical count resolves POS conflict: the conflicting units were already gone
    if (!INV.conflictQty) return;
    mv('CONFLICT_RESOLVED', INV.conflictQty, 'stock count (inventoryAdjust COUNT)', 'count-' + (++INV.seq)); INV.conflictQty = 0; INV.marketplacePaused = false; INV.last = 'Stock imehesabiwa: conflict imefungwa, marketplace imerudi.';
  }
  // Reconciliation job: recompute derived values and compare with stored ones; report, never silently fix money.
  function reconcile() {
    var active = INV.reservations.filter(function (r) { return r.status === 'ACTIVE'; }).reduce(function (a, r) { return a + r.qty; }, 0);
    var ledgerSum = INV.ledger.filter(function (l) { return l.ok && /OPENING_BALANCE|STOCK_RECEIVED|STOCK_ADJUSTED|STOCK_SOLD|STOCK_COMMITTED|LATE_PAYMENT_REACQUIRED/.test(l.type); }).reduce(function (a, l) { return a + Number(l.qty); }, 0);
    var issues = [];
    if (active !== INV.reserved) issues.push('reserved ' + INV.reserved + ' ≠ reservations hai ' + active);
    if (ledgerSum !== INV.current) issues.push('current ' + INV.current + ' ≠ jumla ya ledger ' + ledgerSum);
    INV.orders.forEach(function (o) {
      if (o.pay === 'PAID_HELD' && o.stock !== 'COMMITTED') issues.push(o.id + ' imelipwa bila stock COMMITTED');
      if (o.pay === 'NEEDS_REVIEW' && o.reviewUntil <= INV.clock) issues.push(o.id + ' NEEDS_REVIEW imepita muda');
      if ((INV.walletCredits[o.id] || 0) > 1) issues.push(o.id + ' imepata refund zaidi ya 1');
      if (o.pay === 'PENDING' && o.missedIpn) { o.missedIpn = false; pay(o.id, 'status-poll:' + o.id); issues.push(o.id + ': IPN ilipotea; pesapalTransactionStatus imeitumia (imerekebishwa kwa njia ileile ya T2)'); }
    });
    INV.recon = { at: INV.clock, issues: issues, active: active, ledgerSum: ledgerSum };
    INV.last = issues.length ? 'Reconciliation: ' + issues.length + ' jambo limepatikana.' : 'Reconciliation: kila kitu kinalingana.';
  }
  function invariants() {
    var refundsOk = Object.keys(INV.walletCredits).every(function (k) { return INV.walletCredits[k] <= 1; });
    return [
      ['current ≥ 0 (stock haiwi negative)', INV.current >= 0], ['reserved ≥ 0', INV.reserved >= 0], ['current ≥ reserved (available ≥ 0)', INV.current >= INV.reserved],
      ['reserved = jumla ya reservations ACTIVE', INV.reserved === INV.reservations.filter(function (r) { return r.status === 'ACTIVE'; }).reduce(function (a, r) { return a + r.qty; }, 0)],
      ['oda iliyolipwa (PAID) ina stock COMMITTED', INV.orders.every(function (o) { return o.status !== 'PAID' || o.stock === 'COMMITTED'; })],
      ['NEEDS_REVIEW / REFUND haijathibitishwa wala kupunguza stock', INV.orders.every(function (o) { return ['NEEDS_REVIEW', 'REFUND_PENDING', 'REFUNDED'].indexOf(o.pay) < 0 || o.stock !== 'COMMITTED'; })],
      ['refund ≤ 1 kwa kila oda', refundsOk],
    ];
  }
  var PILL = { PAYMENT_PENDING: 'PROPOSED', PAID: 'IMPLEMENTED', EXPIRED: 'UNVERIFIED', CANCELLED: 'PARTIAL', NEEDS_REVIEW: 'UNVERIFIED', CANCELLED_NOT_FULFILLED: 'PARTIAL' };
  function renderStock() {
    if (!INV) invReset();
    var inv = invariants();
    $('stock-body').innerHTML =
      '<div class="admin"><div class="stack"><div class="panel stack"><div class="eyebrow">Rekodi moja ya inventory · ' + esc(INV.loc) + ' · POS + marketplace</div><h2>' + esc(INV.name) + '</h2><p class="mono">' + esc(INV.key) + '</p>' +
      '<div class="stats" style="font-size:14px"><span>Current <b id="inv-current">' + INV.current + '</b></span><span>Reserved <b id="inv-reserved">' + INV.reserved + '</b></span><span>Available <b id="inv-avail">' + avail() + '</b></span><span>POS conflict <b id="inv-conflict">' + INV.conflictQty + '</b></span><span>Saa <b>dk ' + INV.clock + '</b></span></div>' +
      (INV.marketplacePaused ? '<p class="note red small" id="inv-paused">Marketplace ya rekodi hii imesimamishwa mpaka stock ihesabiwe.</p>' : '') +
      (INV.last ? '<p class="note blue small" id="inv-last">' + esc(INV.last) + '</p>' : '') + '</div>' +
      '<div class="panel stack"><h3>Matukio ya kujaribu</h3>' +
      '<div class="row"><label class="row small" for="inv-qty">Idadi <input type="number" id="inv-qty" value="1" min="1" style="width:70px"></label><button type="button" class="btn pri sm" data-inv="reserve">Checkout online (T1)</button><button type="button" class="btn sm" data-inv="pos">POS inauza (T7)</button><button type="button" class="btn sm" data-inv="posoffline">Replay ya POS offline (T7b)</button></div>' +
      '<div class="row"><button type="button" class="btn sm" data-inv="tick">Sweep: saa +16 dk (T5)</button><button type="button" class="btn sm" data-inv="restock">inventoryAdjust +5 (T8)</button><button type="button" class="btn sm" data-inv="remove">inventoryAdjust −3 (T8)</button><button type="button" class="btn sm" data-inv="count"' + (INV.conflictQty ? '' : ' disabled') + '>Hesabu stock (funga conflict)</button></div>' +
      '<div class="row"><button type="button" class="btn gold sm" data-inv="race">Race: wanunuzi 2, kipande 1</button><button type="button" class="btn gold sm" data-inv="dupcheckout">Checkout key ileile mara 2</button><button type="button" class="btn sm" data-inv="recon">Endesha reconciliation</button><button type="button" class="btn sm" data-inv="reset">Anza upya</button></div>' +
      '<p class="small muted">TTL ya reservation: dakika ' + TTL + ' (thamani ya majaribio; <b>haijathibitishwa</b> dhidi ya muda wa callback za PesaPal/mobile money). Review ya malipo yaliyochelewa: dakika ' + REVIEW_WINDOW + ' (pendekezo).</p></div>' +
      '<div class="panel stack"><h3>Oda</h3>' + (INV.orders.length ? INV.orders.map(function (o) {
        var r = resv(o), rf = INV.refunds[o.id];
        return '<div class="prop" data-order="' + o.id + '"><div class="row"><b class="grow">' + o.id + ' · ' + o.qty + ' pc' + (o.late ? ' · late' : '') + '</b><span class="st st-' + (PILL[o.status] || 'PARTIAL') + '">' + o.status + '</span></div>' +
          '<div class="small mono">order: ' + o.status + ' · reservation: ' + (r ? r.status : '—') + ' · stock: ' + o.stock + ' · payment: ' + o.pay + (rf ? ' · refund: ' + rf.status : '') + '</div>' +
          (r && r.status === 'ACTIVE' ? '<div class="small muted">Reservation inaisha dk ' + r.exp + '</div>' : '') +
          '<div class="row">' +
          (o.pay === 'PENDING' ? '<button type="button" class="btn sm pri" data-inv="pay" data-o="' + o.id + '">Malipo yamefika (T2)</button><button type="button" class="btn sm" data-inv="paydup" data-o="' + o.id + '">Webhook mara 2</button><button type="button" class="btn sm" data-inv="cancel" data-o="' + o.id + '">Ghairi (T4)</button><button type="button" class="btn sm" data-inv="missed" data-o="' + o.id + '">Imelipwa, IPN imepotea</button>' : '') +
          (o.pay === 'NEEDS_REVIEW' ? '<button type="button" class="btn sm pri" data-inv="restockfulfil" data-o="' + o.id + '">Muuzaji ameongeza stock</button><button type="button" class="btn sm" data-inv="torefund" data-o="' + o.id + '">Review imeisha → refund (T6)</button>' : '') +
          (o.pay === 'REFUND_PENDING' || o.pay === 'REFUNDED' ? '<button type="button" class="btn sm pri" data-inv="refund" data-o="' + o.id + '">Kamilisha refund</button><button type="button" class="btn sm" data-inv="refunddup" data-o="' + o.id + '">Tukio la refund mara 2</button>' : '') +
          '</div></div>';
      }).join('') : '<p class="small muted">Hakuna oda bado.</p>') + '</div></div>' +
      '<div class="stack"><div class="panel stack"><h3>Invariants (baada ya kila tukio)</h3><div class="dep" id="inv-invariants">' + inv.map(function (x) { return '<span class="' + (x[1] ? 'ok' : 'no') + '">' + (x[1] ? '✓' : '✗') + '</span><span>' + esc(x[0]) + '</span>'; }).join('') + '</div></div>' +
      (INV.recon ? '<div class="panel stack" id="inv-recon"><h3>Reconciliation (dk ' + INV.recon.at + ')</h3><p class="small">Reservations hai: ' + INV.recon.active + ' · jumla ya ledger: ' + INV.recon.ledgerSum + '</p>' + (INV.recon.issues.length ? '<ul class="small" style="margin:0;padding-left:18px">' + INV.recon.issues.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>' : '<p class="small">Hakuna tofauti.</p>') + '</div>' : '') +
      '<div class="panel stack"><h3>Ledger (append-only)</h3><div class="tablewrap"><table><thead><tr><th>Dk</th><th>Tukio</th><th>Qty</th><th>Na</th><th>Idempotency key</th><th>Baada</th></tr></thead><tbody id="inv-ledger">' +
      INV.ledger.map(function (l) { return '<tr' + (l.ok ? '' : ' style="color:var(--red)"') + '><td class="num">' + l.t + '</td><td>' + esc(l.type) + (l.note ? '<div class="small muted">' + esc(l.note) + '</div>' : '') + '</td><td class="num">' + esc(l.qty) + '</td><td>' + esc(l.by) + '</td><td class="mono">' + esc(l.key) + '</td><td class="num small">c ' + l.cur + ' · r ' + l.res + '</td></tr>'; }).join('') + '</tbody></table></div></div></div></div>';
  }
  function onStockClick(e) {
    var t = e.target.closest('[data-inv]'); if (!t || t.disabled) return;
    var q = Math.max(1, Number(($('inv-qty') || {}).value) || 1), a = t.dataset.inv, o = t.dataset.o;
    if (a === 'reserve') checkout(q, 'checkout:buyer-a:' + (INV.seq + 1) + '-' + INV.clock + '-' + INV.ledger.length);
    if (a === 'pos') posSell(q, 'pos:' + (++INV.seq));
    if (a === 'posoffline') posOfflineReplay(q, 'pos-offline:' + (++INV.seq));
    if (a === 'tick') sweep(16);
    if (a === 'restock') adjust(5, 'adjust:' + (++INV.seq));
    if (a === 'remove') adjust(-3, 'adjust:' + (++INV.seq));
    if (a === 'count') countResolve();
    if (a === 'recon') reconcile();
    if (a === 'reset') invReset();
    if (a === 'pay') pay(o, 'pesapal:ipn:' + o);
    if (a === 'paydup') { pay(o, 'pesapal:ipn:' + o); pay(o, 'pesapal:status:' + o); }
    if (a === 'missed') { var mo = order(o); if (mo) { mo.missedIpn = true; INV.last = o + ': mnunuzi amelipa kwa provider lakini IPN haikufika. Endesha reconciliation.'; } }
    if (a === 'cancel') cancel(o);
    if (a === 'restockfulfil') sellerRestockAndFulfil(o);
    if (a === 'torefund') { toRefund(o, 'seller_declined_or_window'); INV.last = o + ': REFUND_PENDING.'; }
    if (a === 'refund') completeRefund(o, 'refund:online_' + o);
    if (a === 'refunddup') { completeRefund(o, 'refund:online_' + o); completeRefund(o, 'refund:retry_' + o); }
    if (a === 'dupcheckout') { var key = 'checkout:buyer-a:dup-' + (INV.seq + 1); checkout(1, key); checkout(1, key); }
    if (a === 'race') {
      if (avail() < 1) adjust(1 - avail(), 'race-prep:' + (++INV.seq));
      else if (avail() > 1) checkout(avail() - 1, 'checkout:buyer-c:hold-' + (++INV.seq));
      checkout(1, 'checkout:buyer-a:race-' + INV.seq); checkout(1, 'checkout:buyer-b:race-' + INV.seq);
      INV.last = 'Race: transaction ya kwanza imeshikilia kipande cha mwisho; ya pili imekataliwa.';
    }
    renderStock();
  }
