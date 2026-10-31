  /* ---------- routing & events ---------- */
  var VIEWS = ['builder', 'stock', 'explorer', 'info', 'proposals', 'admin', 'flow'];
  function route() {
    var v = (location.hash || '#builder').slice(1); if (VIEWS.indexOf(v) < 0) v = 'builder';
    VIEWS.forEach(function (x) { $('view-' + x).hidden = x !== v; });
    document.querySelectorAll('.tabs a').forEach(function (a) { if (a.dataset.view === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (v === 'explorer') { renderTree(); renderDetail(); }
    if (v === 'info') renderInfo();
    if (v === 'proposals') { renderPropForm(); renderQueue(); }
    if (v === 'admin') { renderAdmin(); renderLog(); }
    if (v === 'flow') renderFlow();
    if (v === 'stock') renderStock();
  }
  window.addEventListener('hashchange', route);
  $('stepPanel').addEventListener('click', onBuilderClick);
  $('steps').addEventListener('click', onBuilderClick);
  $('scenarios').addEventListener('click', onBuilderClick);
  $('stepPanel').addEventListener('input', onBuilderInput);
  $('stepPanel').addEventListener('change', onBuilderChange);
  $('stepPanel').addEventListener('toggle', function (e) { if (e.target.id === 'b-browse') S.browseOpen = e.target.open; }, true);
  $('stock-body').addEventListener('click', onStockClick);
  $('b-reset').addEventListener('click', function () { S = fresh(); renderBuilder(); });
  var setVw = function (phone) { $('builderFrame').classList.toggle('phone', phone); $('vw-phone').setAttribute('aria-pressed', phone); $('vw-desktop').setAttribute('aria-pressed', !phone); };
  $('vw-phone').addEventListener('click', function () { setVw(true); });
  $('vw-desktop').addEventListener('click', function () { setVw(false); });

  $('tree').addEventListener('click', function (e) {
    var tw = e.target.closest('[data-tw]');
    if (tw) { var i = Number(tw.dataset.tw); if (EX.open.has(i)) EX.open.delete(i); else EX.open.add(i); renderTree(); return; }
    var row = e.target.closest('[data-node]'); if (row) exSelect(Number(row.dataset.node), false);
  });
  $('ex-detail').addEventListener('click', function (e) {
    var t = e.target.closest('[data-goto],[data-usebuilder],[data-useinfo],[data-useadmin]'); if (!t) return;
    if (t.dataset.goto) { e.preventDefault(); exSelect(Number(t.dataset.goto), true); }
    if (t.dataset.usebuilder) { var n = byId.get(t.dataset.usebuilder); S = fresh(); S.kind = n.t === 'service' ? 'service' : 'product'; S.nodeId = n.id; S.step = 'confirm'; location.hash = '#builder'; renderBuilder(); }
    if (t.dataset.useinfo) { INFO.id = t.dataset.useinfo; location.hash = '#info'; }
    if (t.dataset.useadmin) { AD.id = t.dataset.useadmin; location.hash = '#admin'; }
  });
  $('ex-q').addEventListener('input', function (e) { EX.q = e.target.value; renderTree(); });
  $('ex-type').addEventListener('change', function (e) { EX.type = e.target.value; renderTree(); });
  $('ex-other').addEventListener('change', function (e) { EX.other = e.target.checked; renderTree(); });
  $('ex-expand').addEventListener('click', function () { N.forEach(function (n) { if (n.l === 0) EX.open.add(n.i); }); renderTree(); });
  $('ex-collapse').addEventListener('click', function () { EX.open.clear(); renderTree(); });

  $('info-list').addEventListener('click', function (e) { var t = e.target.closest('[data-info]'); if (t) { INFO.id = t.dataset.info; renderInfo(); } });
  $('info-q').addEventListener('input', function (e) { $('info-sugg').innerHTML = search(e.target.value, '', 8).map(function (n) { return '<button type="button" data-info="' + n.id + '"><b>' + label(n) + '</b>' + pathHtml(n) + '</button>'; }).join(''); });
  $('info-sugg').addEventListener('click', function (e) { var t = e.target.closest('[data-info]'); if (t) { INFO.id = t.dataset.info; renderInfo(); } });

  $('prop-form').addEventListener('input', function (e) {
    if (e.target.id === 'pf-text') { PF.text = e.target.value; }
    if (e.target.id === 'pf-pq') { PF.pq = e.target.value; }
    var id = e.target.id, pos = e.target.selectionStart; renderPropForm(); var el = $(id); if (el) { el.focus(); el.setSelectionRange(pos, pos); }
  });
  $('prop-form').addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t) return;
    if (t.dataset.pkind) { PF.kind = t.dataset.pkind; renderPropForm(); }
    if (t.dataset.pparent) { PF.parentId = t.dataset.pparent; renderPropForm(); }
    if (t.dataset.act === 'psubmit') { var p = submitProposal({ text: PF.text.trim(), parentId: PF.parentId, kind: PF.kind, by: 'muuzaji (preview)' }); if (p) { PF.text = ''; renderPropForm(); toast('Pendekezo ' + p.id + ' limehifadhiwa kama PENDING.'); } }
  });
  $('prop-queue').addEventListener('click', function (e) { var t = e.target.closest('[data-pa]'); if (t) decide(t.dataset.pid, t.dataset.pa); });

  $('ad-q').addEventListener('input', function (e) { AD.q = e.target.value; renderAdmin(); });
  $('ad-sugg').addEventListener('click', function (e) { var t = e.target.closest('[data-adpick]'); if (t) { AD.id = t.dataset.adpick; AD.mode = ''; renderAdmin(); } });
  $('ad-node').addEventListener('click', function (e) { var t = e.target.closest('[data-ad],[data-adtarget]'); if (!t) return; if (t.dataset.adtarget) adminAction('target', t.dataset.adtarget); else adminAction(t.dataset.ad); });
  $('ad-node').addEventListener('input', function (e) { if (e.target.id === 'ad-mq') { AD.mq = e.target.value; var pos = e.target.selectionStart; renderAdmin(); var el = $('ad-mq'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } } });
  $('ad-roles').innerHTML = [['taxonomy_viewer', 'Kuona na kutafuta'], ['taxonomy_editor', 'Kuongeza, kuhariri, kuamua mapendekezo'], ['taxonomy_admin', 'Kuhamisha, kuunganisha, kuzima; mapendekezo yenye REG-*'], ['muuzaji', 'Kutuma pendekezo tu; hawezi kuandika taxonomyNodes']].map(function (r) { return '<span class="mono">' + r[0] + '</span><span>' + esc(r[1]) + ' ' + badge('PROPOSED') + '</span>'; }).join('');

  /* sample proposals, clearly labelled as examples */
  [['Mashine ya kusaga karanga', 'SC-CAT-33-FOOD_PROCESSING_MACHINERY'], ['Kitenge cha batiki', 'SC-CAT-07-KITENGE_KHANGA'], ['Smartphone', 'SC-CAT-12-SMARTPHONES']].forEach(function (s) { if (byId.has(s[1])) submitProposal({ text: s[0], parentId: s[1], kind: 'type', by: 'muuzaji (mfano)', sample: true }); });

  renderBuilder(); renderLog(); route();
  window.__skhPreview = { state: function () { return S; }, nodes: function () { return N.length; }, search: function (q, k) { return search(q, k, 8).map(function (n) { return n.id; }); } };
