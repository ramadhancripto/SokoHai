  /* ---------- explorer ---------- */
  var EX = { open: new Set(), sel: null, q: '', type: '', other: false };
  function visibleKids(n) { return kids[n.i].map(function (i) { return N[i]; }).filter(function (k) { return (EX.other || !isOther(k)) && (!EX.type || kindOk(k, EX.type) || k.l === 0); }); }
  function renderTree() {
    var tree = $('tree'), html = [];
    var show = null, hits = [];
    if (EX.q.length >= 2) {
      var nq = norm(EX.q);
      hits = N.filter(function (n) { return n.q.indexOf(nq) >= 0 && (EX.other || !isOther(n)) && (!EX.type || kindOk(n, EX.type)); });
      show = new Set(); hits.slice(0, 300).forEach(function (h) { path(h).forEach(function (x) { show.add(x.i); }); });
      $('ex-hits').textContent = hits.length + ' zinalingana' + (hits.length > 300 ? ' (300 za kwanza zinaonyeshwa)' : '');
    } else $('ex-hits').textContent = '';
    var hl = function (s) { if (!show) return esc(s); var q = EX.q.trim().toLowerCase(), i = s.toLowerCase().indexOf(q); return i >= 0 && q ? esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length)) : esc(s); };
    function walk(n, depth) {
      if (show && !show.has(n.i)) return;
      var ks = visibleKids(n); var open = show ? true : EX.open.has(n.i);
      html.push('<div class="tn' + (EX.sel === n.i ? ' sel' : '') + (n.st === 'INACTIVE' || n.st === 'MERGED' ? ' inactive' : '') + '" role="treeitem" aria-level="' + (depth + 1) + '"' + (ks.length ? ' aria-expanded="' + open + '"' : '') + ' aria-selected="' + (EX.sel === n.i) + '" data-node="' + n.i + '" style="padding-left:' + (8 + depth * 16) + 'px">' +
        '<button type="button" class="tw" data-tw="' + n.i + '" aria-label="' + (open ? 'Funga' : 'Panua') + '"' + (ks.length ? '' : ' disabled style="visibility:hidden"') + '>' + (open ? '▾' : '▸') + '</button>' +
        '<span class="lv" title="' + LV[n.l] + '">' + LVS[n.l] + '</span><span class="lbl">' + hl(n.sw) + (n.sw !== n.en ? ' <span class="muted">' + hl(n.en) + '</span>' : '') + '</span>' +
        (n.o === 'PROPOSED' ? '<span class="o-PROPOSED">MPYA</span>' : n.o === 'SELLER_PROPOSED' ? '<span class="o-SELLER">MUUZAJI</span>' : '') + (n.reg.length ? '<span class="chip reg" style="padding:0 5px;font-size:10px">REG</span>' : '') +
        (ks.length ? '<span class="cnt num">' + ks.length + '</span>' : '') + '</div>');
      if (open) ks.forEach(function (k) { walk(k, depth + 1); });
    }
    N.filter(function (n) { return n.l === 0; }).forEach(function (s) { walk(s, 0); });
    tree.innerHTML = html.join('') || '<p class="muted" style="padding:8px">Hakuna kinacholingana.</p>';
  }
  function renderDetail() {
    var box = $('ex-detail');
    if (EX.sel == null) { box.innerHTML = '<h2>Chagua node</h2><p class="small muted">Bofya jina lolote kwenye mti. Utaona ID, ngazi, mzazi, hali, aina na attributes zinazohusika.</p>' + countsHtml(); return; }
    var n = N[EX.sel], p = par(n), d = defFor(n), fam = familyOf(n);
    box.innerHTML = '<div class="eyebrow">' + LV[n.l] + '</div><h2>' + label(n) + '</h2>' + pathHtml(n) +
      '<dl class="kv"><dt>ID</dt><dd class="mono">' + esc(n.id) + '</dd><dt>Ngazi</dt><dd>' + n.l + ' · ' + LV[n.l] + '</dd><dt>Mzazi</dt><dd>' + (p ? '<a href="#explorer" data-goto="' + p.i + '">' + esc(p.sw) + '</a> <span class="mono">' + esc(p.id) + '</span>' : '—') + '</dd>' +
      '<dt>Hali</dt><dd>' + esc(n.st) + '</dd><dt>Aina</dt><dd>' + esc({ product: 'Bidhaa', service: 'Huduma', both: 'Bidhaa + huduma', system: 'Mfumo' }[n.t] || n.t) + '</dd><dt>Asili</dt><dd>' + esc(n.o) + (n.o === 'CANONICAL' ? ' (ipo leo)' : n.o === 'PROPOSED' ? ' (mpya kwenye rasimu)' : '') + '</dd>' +
      '<dt>Watoto</dt><dd class="num">' + kids[n.i].length + '</dd>' + (n.reg.length ? '<dt>Udhibiti</dt><dd>' + n.reg.map(function (f) { return '<span class="chip reg">' + esc(f) + '</span>'; }).join(' ') + '</dd>' : '') +
      (n.al.length ? '<dt>Aliases</dt><dd>' + n.al.map(esc).join(', ') + '</dd>' : '') + (n.d ? '<dt>Maelezo</dt><dd>' + esc(n.d) + '</dd>' : '') +
      '<dt>Attributes</dt><dd>' + (d ? d.def.a.length + ' kutoka <span class="mono">' + esc(d.def.src) + '</span>' : 'template ya jumla tu') + '</dd><dt>Variants</dt><dd>' + (fam ? esc(fam.key) : '—') + '</dd></dl>' +
      '<div class="row">' + (n.l >= 2 && !isOther(n) ? '<button type="button" class="btn sm pri" data-usebuilder="' + n.id + '">Tumia kwenye Builder</button><button type="button" class="btn sm" data-useinfo="' + n.id + '">Taarifa za bidhaa</button>' : '') + '<button type="button" class="btn sm" data-useadmin="' + n.id + '">Fungua kwa Admin</button></div>';
  }
  function countsHtml() {
    var c = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }, o = 0;
    N.forEach(function (n) { if (isOther(n)) o++; else c[n.l]++; });
    return '<div class="stats"><span>Sekta <b>' + c[0] + '</b></span><span>Categories <b>' + c[1] + '</b></span><span>Subcategories <b>' + (c[2] + c[3]) + '</b></span><span>Aina <b>' + c[4] + '</b></span><span>Nodes za Other <b>' + o + '</b></span></div><p class="small muted">Chanzo: ' + esc(D.meta.generatedFrom) + ' (' + esc(D.meta.status) + ').</p>';
  }
  function exSelect(i, reveal) { EX.sel = i; if (reveal) path(N[i]).forEach(function (x) { if (x.i !== i) EX.open.add(x.i); }); renderTree(); renderDetail(); }

  /* ---------- info preview ---------- */
  var INFO = { id: null };
  function renderInfoList() {
    $('info-list').innerHTML = D.scenarios.map(function (s) { return '<button type="button" class="btn sm' + (INFO.id === s.nodeId ? ' pri' : '') + '" data-info="' + s.nodeId + '">' + esc(byId.get(s.nodeId).sw) + ' <span class="small">· ' + esc(catOf(byId.get(s.nodeId)).sw) + '</span></button>'; }).join('');
  }
  function renderInfo() {
    renderInfoList();
    var n = INFO.id ? byId.get(INFO.id) : null, body = $('info-body');
    if (!n) { body.innerHTML = '<div class="panel"><p class="muted">Chagua mfano upande wa kushoto.</p></div>'; return; }
    var d = defFor(n), fam = familyOf(n), regs = regList(n), svc = n.t === 'service', c = catOf(n);
    var attrRows = d ? d.def.a.map(function (a) { var r = D.attrs[a] || ['string', '', []]; var opts = d.def.o[a] || r[2]; return '<div class="attr"><span>' + esc(a) + (opts && opts.length ? '<br><span class="small muted">' + esc(opts.join(', ')) + '</span>' : '') + '</span><span class="small muted">' + esc(r[0]) + (r[1] ? ' · ' + esc(r[1]) : '') + '</span></div>'; }).join('') : '<p class="small muted">Hakuna canonical definition kwa tawi hili. Inatumia template ya jumla tu.</p>';
    var common = (svc ? D.common.service : D.common.product).map(function (a) { return '<div class="attr"><span>' + esc(a.id.replace('ATTR-', '')) + (a.when ? '<br><span class="small muted">ikiwa ' + esc(a.when) + '</span>' : '') + '</span><span class="small">' + esc(a.required) + (a.facet ? ' · filter' : '') + '</span></div>'; }).join('');
    var ug = {}; if (d) d.def.a.forEach(function (a) { var r = D.attrs[a]; if (r && r[1]) ug[r[1]] = 1; });
    if (!svc) ug.COUNT = 1; if (svc) { ug.TIME = 1; ug.SERVICE = 1; }
    if (c && ['CAT-01', 'CAT-03', 'CAT-04'].indexOf(c.id) >= 0) { ug.WEIGHT = 1; ug.PACKAGING = 1; }
    if (c && c.id === 'CAT-01') ug.VOLUME = 1;
    var units = D.units.filter(function (u) { return ug[u.group]; });
    var conds = [];
    if (regs.length) regs.forEach(function (f) { conds.push('<div class="attr"><span>' + esc((D.reg[f] || {}).sw || f) + '</span><span class="small">' + esc(((D.reg[f] || {}).requiredAttributes || []).join(', ')) + ' · ' + esc((D.reg[f] || {}).moderation || '') + '</span></div>'); });
    if (c && ['CAT-01', 'CAT-08', 'CAT-19'].indexOf(c.id) >= 0) conds.push('<div class="attr"><span>Expiry + batch</span><span class="small">IMPLEMENTED (smartExpiryFields)</span></div>');
    if (c && c.id === 'CAT-12') conds.push('<div class="attr"><span>IMEI / serial kwa kila kipande</span><span class="small">IMPLEMENTED (smartImeiFields)</span></div>');
    if (c && c.id === 'CAT-04') conds.push('<div class="attr"><span>Kuuza kwa idadi au uzito</span><span class="small">kitengo kimoja cha stock</span></div>');
    body.innerHTML = '<div class="panel stack"><div class="eyebrow">' + LV[n.l] + ' · ' + esc(n.id) + '</div><h2>' + label(n) + '</h2>' + pathHtml(n) + '<div class="row"><span class="chip ' + (svc ? 'svc' : 'prd') + '">' + (svc ? 'Huduma' : 'Bidhaa') + '</span>' + regChips(n) + '</div></div>' +
      '<div class="attrgrid"><div class="panel"><h3>Attributes / specifications</h3><p class="small muted">' + (d ? 'Canonical: <span class="mono">' + esc(d.def.src) + '</span>' : '') + '</p>' + attrRows + '</div>' +
      '<div class="panel"><h3>Template ya jumla (' + (svc ? 'huduma' : 'bidhaa') + ')</h3><p class="small muted">' + badge('PROPOSED') + ' inarithiwa na kila tawi</p>' + common + '</div>' +
      '<div class="panel"><h3>Sehemu za masharti</h3>' + (conds.join('') || '<p class="small muted">Hakuna kwa aina hii.</p>') + '</div>' +
      '<div class="panel"><h3>Units zinazofaa</h3>' + units.map(function (u) { return '<div class="attr"><span>' + esc(u.label) + ' <span class="small muted">' + esc(u.group) + '</span></span><span class="small">' + (u.ok && u.base ? '= ' + fmt(u.conv) + ' ' + esc(u.base) : u.ok ? 'msingi' : 'taja ukubwa') + (u.origin === 'PROPOSED' ? ' · mpya' : '') + '</span></div>'; }).join('') + '</div>' +
      '<div class="panel"><h3>Variants</h3>' + (svc ? '<p class="small">Vifurushi (package/tier), muda, ukubwa wa kikundi. Hakuna stock.</p>' : fam ? '<p class="small">Family <b>' + esc(fam.key) + '</b></p><div class="attr"><span>Axes zinazoruhusiwa</span><span class="small">' + esc(fam.f.axes.join(', ') || 'hakuna') + '</span></div><div class="attr"><span>Haziruhusiwi</span><span class="small">' + esc(fam.f.forbidden.join(', ')) + '</span></div>' + (fam.f.note ? '<p class="small muted">' + esc(fam.f.note) + '</p>' : '') : '') + (d && d.def.v ? '<p class="small muted">Canonical variantRule: ' + esc(d.def.v.m) + (d.def.v.c.length ? ' · ' + esc(d.def.v.c.join(', ')) : '') + '</p>' : '') + '</div>' +
      '<div class="panel"><h3>Filters & features</h3>' + (d ? '<p class="small"><b>Filters:</b> ' + esc(d.def.f.join(', ') || '—') + '</p><p class="small"><b>Features:</b> ' + esc(d.def.ft.join(', ') || '—') + '</p>' : '<p class="small muted">Hakuna canonical filters.</p>') + '</div></div>';
  }

  /* ---------- proposals ---------- */
  function dupCheck(text, parentId) {
    var nq = norm(text); if (!nq) return { exact: [], similar: [] };
    var exact = N.filter(function (n) { return !isOther(n) && (norm(n.sw) === nq || norm(n.en) === nq || n.al.some(function (a) { return norm(a) === nq; })); });
    var grams = function (s) { var g = {}; s = ' ' + s + ' '; for (var i = 0; i < s.length - 2; i++) g[s.slice(i, i + 3)] = 1; return g; };
    var gq = grams(nq), kq = Object.keys(gq).length;
    var scope = parentId ? kids[byId.get(parentId).i].map(function (i) { return N[i]; }).concat(search(text, '', 12)) : search(text, '', 12);
    var seen = {}, similar = [];
    scope.forEach(function (n) {
      if (!n || seen[n.id] || isOther(n) || exact.indexOf(n) >= 0) return; seen[n.id] = 1;
      var g = grams(norm(n.sw + ' ' + n.en)), inter = 0; Object.keys(gq).forEach(function (k) { if (g[k]) inter++; });
      var sim = inter / Math.max(1, kq); if (sim >= 0.45) similar.push({ n: n, sim: sim });
    });
    proposals.forEach(function (p) { if (p.status === 'PENDING' && norm(p.text) === nq) similar.push({ n: { id: p.id, sw: 'Pendekezo ' + p.id + ' (' + p.text + ')' }, sim: 1, prop: p }); });
    similar.sort(function (a, b) { return b.sim - a.sim; });
    return { exact: exact.slice(0, 3), similar: similar.slice(0, 4) };
  }
  function submitProposal(o) {
    if (!o.text || !o.parentId) { toast('Pendekezo linahitaji jina na tawi la mzazi.'); return null; }
    var dup = dupCheck(o.text, o.parentId);
    var same = proposals.find(function (p) { return p.status === 'PENDING' && norm(p.text) === norm(o.text) && p.parentId === o.parentId; });
    if (same) { same.support++; same.products.push(o.product || ''); toast('Pendekezo kama hili lipo (' + same.id + '): limeongezewa muungaji mkono.'); renderQueue(); return same; }
    var p = { id: 'PRP-' + String(seq++).padStart(4, '0'), text: o.text, rawText: o.text, parentId: o.parentId, kind: o.kind || 'type', by: o.by, status: 'PENDING', support: 1, products: o.product ? [o.product] : [], dup: dup, sample: !!o.sample, at: new Date().toLocaleTimeString('sw-TZ'), notes: [] };
    proposals.unshift(p);
    if (!o.sample) log('PROPOSAL_SUBMITTED', o.parentId, p.id + ': “' + o.text + '”', o.by);
    renderQueue();
    return p;
  }
  var PF = { text: '', parentId: '', kind: 'type', pq: '' };
  function renderPropForm() {
    var p = PF.parentId ? byId.get(PF.parentId) : null;
    var dup = PF.text.length > 1 ? dupCheck(PF.text, PF.parentId || null) : null;
    var hits = PF.pq ? search(PF.pq, '', 6).map(leafOf).filter(function (x, i, a) { return x && a.indexOf(x) === i; }) : [];
    $('prop-form').innerHTML = '<h2>Muuzaji anapendekeza</h2>' +
      '<div class="seg" role="group" aria-label="Aina ya pendekezo">' + [['type', 'Aina mpya'], ['subcategory', 'Subcategory mpya'], ['classification', 'Uainishaji mwingine']].map(function (k) { return '<button type="button" data-pkind="' + k[0] + '" aria-pressed="' + (PF.kind === k[0]) + '">' + k[1] + '</button>'; }).join('') + '</div>' +
      '<label class="f" for="pf-text"><span class="req">Jina analoandika muuzaji</span><input type="text" id="pf-text" value="' + esc(PF.text) + '" maxlength="80" placeholder="mf. Mashine ya kusaga karanga"></label>' +
      '<label class="f" for="pf-pq"><span class="req">Tawi la mzazi</span><input type="search" id="pf-pq" value="' + esc(PF.pq) + '" placeholder="Tafuta tawi…"></label>' +
      (hits.length ? '<div class="row">' + hits.map(function (h) { return '<button type="button" class="btn sm' + (PF.parentId === h.id ? ' pri' : '') + '" data-pparent="' + h.id + '">' + esc(h.sw) + ' <span class="small">· ' + esc(catOf(h).sw) + '</span></button>'; }).join('') + '</div>' : '') +
      (p ? '<div class="small">Mzazi: <b>' + esc(plain(p)) + '</b> ' + pathHtml(p) + '</div>' : '') +
      (dup ? '<div class="stack"><h3>Ukaguzi wa marudio (kabla ya kutuma)</h3>' + (dup.exact.length ? '<div class="note red">Jina hili tayari lipo: ' + dup.exact.map(function (n) { return '<b>' + esc(n.sw) + '</b> <span class="mono">' + esc(n.id) + '</span>'; }).join(', ') + '. Muuzaji anaonyeshwa “Ulimaanisha hii?”.</div>' : '<p class="small">Hakuna jina linalofanana kabisa.</p>') + (dup.similar.length ? '<div class="small">Yanayofanana: ' + dup.similar.map(function (s) { return esc(s.n.sw) + ' (' + Math.round(s.sim * 100) + '%)'; }).join(', ') + '</div>' : '') + '</div>' : '') +
      '<div class="row"><button type="button" class="btn gold" data-act="psubmit">Tuma pendekezo</button></div>' +
      '<div class="note blue small">Kinachohifadhiwa: <span class="mono">taxonomyProposals/{id}</span> = kind, parentNodeId, rawText (haibadiliki), normalized, submittedBy, storeId, productIds[], duplicateCandidates[], status, supportCount. Muuzaji hawezi kuandika <span class="mono">taxonomyNodes</span>. ' + badge('PROPOSED') + '</div>';
  }
  function renderQueue() {
    var q = $('prop-queue'); if (!q) return;
    q.innerHTML = proposals.length ? proposals.map(function (p) {
      var par0 = byId.get(p.parentId);
      return '<div class="prop"><div class="row"><b class="grow">' + esc(p.text) + '</b>' + (p.sample ? '<span class="chip">Mfano</span>' : '') + '<span class="st st-' + ({ PENDING: 'PROPOSED', APPROVED: 'IMPLEMENTED', MERGED: 'PARTIAL', REJECTED: 'UNVERIFIED', CLARIFY: 'PARTIAL' }[p.status]) + '">' + esc(p.status) + '</span></div>' +
        '<div class="small muted">' + esc(p.id) + ' · ' + esc(p.kind) + ' · chini ya ' + esc(par0 ? par0.sw : p.parentId) + ' · na ' + esc(p.by) + ' · wanaounga mkono ' + p.support + '</div>' +
        (p.dup && (p.dup.exact.length || p.dup.similar.length) ? '<div class="small">Marudio yanayowezekana: ' + p.dup.exact.concat(p.dup.similar.map(function (s) { return s.n; })).slice(0, 4).map(function (n) { return esc(n.sw); }).join(', ') + '</div>' : '') +
        (p.notes.length ? '<div class="small">' + p.notes.map(esc).join('<br>') + '</div>' : '') +
        (p.status === 'PENDING' || p.status === 'CLARIFY' ? '<div class="row"><button type="button" class="btn sm pri" data-pa="approve" data-pid="' + p.id + '">Approve</button><button type="button" class="btn sm" data-pa="merge" data-pid="' + p.id + '">Unganisha</button><button type="button" class="btn sm" data-pa="clarify" data-pid="' + p.id + '">Omba ufafanuzi</button><button type="button" class="btn sm" data-pa="reject" data-pid="' + p.id + '">Kataa</button></div>' : '') +
        '<div class="small muted">Maneno asili ya muuzaji: <span class="mono">“' + esc(p.rawText) + '”</span></div></div>';
    }).join('') : '<p class="muted small">Hakuna mapendekezo bado.</p>';
  }
  function decide(pid, action) {
    var p = proposals.find(function (x) { return x.id === pid; }); if (!p) return;
    var parentN = byId.get(p.parentId);
    if (action === 'approve') {
      var lvl = p.kind === 'subcategory' ? 2 : 4;
      var host = p.kind === 'subcategory' ? catOf(parentN) : parentN;
      var nid = (lvl === 2 ? 'SC-' : 'PT-') + (catOf(parentN) || { id: 'X' }).id + '-SP' + p.id.slice(4);
      N.push({ i: N.length, id: nid, p: host.i, l: lvl, sw: p.text, en: p.text, t: host.t === 'service' ? 'service' : 'product', o: 'SELLER_PROPOSED', st: 'ACTIVE', reg: [], al: [p.rawText], d: '' });
      index(); p.status = 'APPROVED'; p.notes.push('Imekuwa node ' + nid + '. Bidhaa ' + p.support + ' zitahamishiwa kwa batch ya server; historia ya kila bidhaa inahifadhi maneno asili.');
      log('PROPOSAL_APPROVED', nid, p.id + ' → node mpya chini ya ' + host.sw + ' (EN inahitaji tafsiri)');
    } else if (action === 'merge') {
      var target = (p.dup.exact[0]) || (p.dup.similar.find(function (s) { return !s.prop; }) || {}).n;
      if (!target) { toast('Hakuna node ya kuunganisha nayo. Tumia Admin kutafuta.'); return; }
      target.al.push(p.text); index(); p.status = 'MERGED'; p.notes.push('Limekuwa alias ya ' + target.sw + ' (' + target.id + ').');
      log('PROPOSAL_MERGED', target.id, p.id + ' “' + p.text + '” → alias');
    } else if (action === 'reject') { p.status = 'REJECTED'; p.notes.push('Limekataliwa: bidhaa zinabaki chini ya ' + (parentN ? parentN.sw : '') + ' kama Nyingine.'); log('PROPOSAL_REJECTED', p.parentId, p.id); }
    else if (action === 'clarify') { p.status = 'CLARIFY'; p.notes.push('Swali kwa muuzaji: “Bidhaa hii inatumika kwa kazi gani?”'); log('PROPOSAL_CLARIFY', p.parentId, p.id); }
    renderQueue(); renderTree(); toast(p.id + ': ' + p.status);
  }

  /* ---------- admin ---------- */
  var AD = { id: null, q: '', mq: '', mode: '' };
  function renderAdmin() {
    var hits = AD.q ? N.filter(function (n) { return n.q.indexOf(norm(AD.q)) >= 0 && !isOther(n); }).slice(0, 10) : [];
    $('ad-sugg').innerHTML = hits.map(function (n) { return '<button type="button" data-adpick="' + n.id + '" aria-pressed="' + (AD.id === n.id) + '"><b>' + label(n) + '</b><span class="small muted">' + LV[n.l] + ' · ' + esc(n.id) + ' · ' + esc(n.st) + '</span></button>'; }).join('');
    var n = AD.id ? byId.get(AD.id) : null, box = $('ad-node');
    if (!n) { box.innerHTML = '<p class="small muted">Tafuta node, mfano “mitumba”, “GPS” au “tablets”, kisha chagua.</p>'; return; }
    var targets = AD.mq ? N.filter(function (x) { return x.q.indexOf(norm(AD.mq)) >= 0 && !isOther(x) && x.id !== n.id; }).slice(0, 6) : [];
    box.innerHTML = '<div class="panel stack" style="box-shadow:none"><div class="eyebrow">' + LV[n.l] + ' · ' + esc(n.o) + '</div><h2>' + label(n) + '</h2>' + pathHtml(n) + '<p class="mono">' + esc(n.id) + ' · hali: ' + esc(n.st) + '</p>' +
      '<div class="grid2"><label class="f" for="ad-sw">Jina (Kiswahili)<input type="text" id="ad-sw" value="' + esc(n.sw) + '"></label><label class="f" for="ad-en">Jina (English)<input type="text" id="ad-en" value="' + esc(n.en) + '"></label></div>' +
      '<div class="row"><button type="button" class="btn sm pri" data-ad="rename">Hifadhi majina</button>' +
      (n.st === 'INACTIVE' ? '<button type="button" class="btn sm" data-ad="activate">Washa tena</button>' : n.st !== 'MERGED' ? '<button type="button" class="btn sm" data-ad="deactivate">Zima</button>' : '') +
      '<button type="button" class="btn sm" data-ad="move">Hamisha…</button><button type="button" class="btn sm" data-ad="merge">Unganisha na…</button><button type="button" class="btn sm" data-ad="child">Ongeza mtoto</button></div>' +
      (AD.mode === 'move' || AD.mode === 'merge' ? '<label class="f" for="ad-mq">' + (AD.mode === 'move' ? 'Mzazi mpya' : 'Node lengwa (inabaki)') + '<input type="search" id="ad-mq" value="' + esc(AD.mq) + '" placeholder="Tafuta…"></label><div class="row">' + targets.map(function (x) { return '<button type="button" class="btn sm" data-adtarget="' + x.id + '">' + esc(x.sw) + ' <span class="small">' + LVS[x.l] + '</span></button>'; }).join('') + '</div>' : '') +
      (AD.mode === 'child' ? '<div class="row"><input type="text" id="ad-child" placeholder="Jina la mtoto mpya" style="flex:1"><button type="button" class="btn sm pri" data-ad="childsave">Ongeza</button></div>' : '') +
      '<p class="small muted">Hakuna kufuta. “Zima” inaficha node kwa wauzaji wapya; bidhaa zilizopo zinabaki. “Unganisha” inaweka hali MERGED na kuhamisha jina kuwa alias ya node lengwa.</p></div>';
  }
  function adminAction(a, extra) {
    var n = byId.get(AD.id); if (!n) return;
    if (a === 'rename') { var sw = $('ad-sw').value.trim(), en = $('ad-en').value.trim(); if (!sw || !en) { toast('Majina yote mawili yanahitajika.'); return; } var before = n.sw + ' / ' + n.en; if (sw !== n.sw) n.al.push(n.sw); n.sw = sw; n.en = en; index(); log('RENAME', n.id, before + ' → ' + sw + ' / ' + en + ' (ID haibadiliki)'); }
    else if (a === 'deactivate') { n.st = 'INACTIVE'; log('DEACTIVATE', n.id, 'Imefichwa kwa wauzaji wapya; bidhaa zilizopo zinabaki'); }
    else if (a === 'activate') { n.st = 'ACTIVE'; log('REACTIVATE', n.id, 'Imewashwa tena'); }
    else if (a === 'move' || a === 'merge' || a === 'child') { AD.mode = AD.mode === a ? '' : a; AD.mq = ''; }
    else if (a === 'childsave') { var nm = ($('ad-child') || {}).value || ''; if (!nm.trim()) return; var lvl = Math.min(4, n.l + 1); var nid = (lvl === 4 ? 'PT-' : 'SC-') + ((catOf(n) || n).id) + '-ADM' + String(seq++).padStart(3, '0'); N.push({ i: N.length, id: nid, p: n.i, l: lvl, sw: nm.trim(), en: nm.trim(), t: n.t === 'both' ? 'product' : n.t, o: 'PROPOSED', st: 'ACTIVE', reg: [], al: [], d: '' }); index(); AD.mode = ''; log('ADD_CHILD', nid, 'chini ya ' + n.sw + ' (EN inahitaji tafsiri)'); }
    else if (a === 'target') {
      var t = byId.get(extra);
      if (AD.mode === 'move') {
        if (path(t).indexOf(n) >= 0) { toast('Haiwezekani: node lengwa iko ndani ya node hii (cycle).'); return; }
        var okLvl = t.l === n.l - 1 || (n.l === 4 && t.l === 2) || (n.l === 3 && t.l === 1);
        if (!okLvl) { toast('Ngazi haziendani: ' + LV[n.l] + ' haiwezi kukaa chini ya ' + LV[t.l] + '.'); return; }
        var from = par(n); n.p = t.i; if (n.l === 3 && t.l === 1) n.l = 2; index(); log('MOVE', n.id, (from ? from.sw : '') + ' → ' + t.sw + ' · bidhaa ' + 'zitahamishwa na server (batch inayoweza kurudishwa)');
      } else if (AD.mode === 'merge') {
        if (t.l !== n.l) { toast('Unganisha nodes za ngazi moja tu.'); return; }
        n.st = 'MERGED'; t.al.push(n.sw); index(); log('MERGE', n.id, '→ ' + t.id + ' (' + t.sw + '); jina la zamani limekuwa alias');
      }
      AD.mode = ''; AD.mq = '';
    }
    renderAdmin(); renderTree(); if (EX.sel != null) renderDetail();
  }
  function renderLog() {
    var l = $('ad-log'); if (!l) return;
    l.innerHTML = history.length ? history.map(function (h) { return '<div><b>' + esc(h.action) + '</b> <span class="mono">' + esc(h.nodeId) + '</span><br>' + esc(h.detail) + '<br><span class="muted">' + esc(h.at) + ' · ' + esc(h.actor) + '</span></div>'; }).join('') : '<p class="muted">Hakuna mabadiliko bado. Kila hatua utakayochukua itaonekana hapa, na haiwezi kufutwa.</p>';
  }

