  /* ---------- seller builder (refined after owner decisions 1–10) ----------
     Seven separate concepts, each with its own state:
     taxonomy (nodeId) · nature (physical/digital) · sales channels (marketplace, pos; none = manage only)
     · publication status · availability · locations (stock lives here) · fulfilment (delivery/pickup) · pricing. */
  var LOCS = {
    'loc-default': { id: 'loc-default', name: 'Location ya msingi', type: 'default', pickup: false, pos: false, note: 'Inaundwa kiotomatiki kwa muuzaji asiye na store (migration safeguard).' },
    'st-a': { id: 'st-a', name: 'Duka Kariakoo', type: 'store', pickup: true, pos: true },
    'wh-b': { id: 'wh-b', name: 'Ghala Mbezi', type: 'warehouse', pickup: false, pos: false },
  };
  var LOC_TYPE = { default: 'Default', store: 'Duka', warehouse: 'Ghala' };
  var BIZ = 'biz-mfano';
  var STEPS = [
    { k: 'kind', t: 'Bidhaa au huduma' },
    { k: 'find', t: 'Tafuta au chagua' },
    { k: 'confirm', t: 'Thibitisha uainishaji' },
    { k: 'basic', t: 'Taarifa za msingi' },
    { k: 'channel', t: 'Sales channels' },
    { k: 'location', t: 'Locations za stock' },
    { k: 'specs', t: 'Sifa & variants' },
    { k: 'price', t: 'Units, bei & stock' },
    { k: 'delivery', t: 'Delivery / pickup' },
    { k: 'review', t: 'Hali & hifadhi' },
  ];
  function fresh() {
    return {
      kind: 'product', step: 'kind', q: '', nodeId: null, other: null, browse: [null, null, null, null], browseOpen: false,
      name: '', desc: '', images: [], nature: 'physical',
      chSet: false, ch: { marketplace: false, pos: false },
      publication: 'draft', availability: 'available',
      legacySeller: false, sellerLocs: ['st-a'], locs: [], fulfil: '', defaultLocCreated: false,
      attrs: {}, cond: {}, hasVar: false, axes: {}, vrows: {},
      unit: '', content: '', contentUnit: 'kg', basePrice: '', cost: '', packs: [], packMode: 'base', tiers: [],
      stock: {}, low: 5, delivery: [],
      svc: { model: 'fixed', area: '', mode: 'onsite_customer', travel: false }, price: '',
      saleBy: 'count', scenario: null,
    };
  }
  var S = fresh();
  var node = function () { return S.nodeId ? byId.get(S.nodeId) : null; };
  var classNode = function () { return S.other ? byId.get(S.other.parentId) : node(); };
  var isSvc = function () { return S.kind === 'service'; };
  var mkt = function () { return S.ch.marketplace; };
  var pos = function () { return S.ch.pos && !isSvc(); };
  var manageOnly = function () { return S.chSet && !S.ch.marketplace && !S.ch.pos; };
  var physical = function () { return !isSvc() && S.nature === 'physical'; };
  function channelList() { var a = []; if (S.ch.marketplace) a.push('marketplace'); if (pos()) a.push('pos'); return a.length ? a : (S.chSet ? ['manage_only'] : []); }
  function effectiveLocs() {
    var l = S.locs.slice();
    if (physical() && !l.length && pos() && S.legacySeller) l = ['loc-default'];
    return l.map(function (id) { return LOCS[id]; });
  }
  function stepActive(k) {
    if (k === 'delivery') return !isSvc() && mkt() && S.nature === 'physical';
    if (k === 'location') return isSvc() || S.nature === 'physical';
    return true;
  }
  var activeSteps = function () { return STEPS.filter(function (s) { return stepActive(s.k); }); };
  function goStep(k) { if (!stepActive(k)) k = 'review'; S.step = k; renderBuilder(); }
  function moveStep(d) { var a = activeSteps(), i = a.findIndex(function (s) { return s.k === S.step; }); var j = Math.max(0, Math.min(a.length - 1, (i < 0 ? 0 : i) + d)); S.step = a[j].k; renderBuilder(); var p = $('stepPanel'); if (p.getBoundingClientRect().top < 0) p.scrollIntoView({ block: 'start' }); }
  function unitById(id) { return D.units.find(function (u) { return u.id === id; }); }

  function loadScenario(key) {
    var sc = D.scenarios.find(function (x) { return x.key === key; }); if (!sc) return;
    S = fresh(); S.scenario = key; S.kind = sc.kind; S.nodeId = sc.nodeId; S.q = sc.name.split(' ')[0]; S.name = sc.name;
    S.nature = sc.nature || 'physical'; S.chSet = true; S.ch = { marketplace: !!sc.marketplace, pos: !!sc.pos };
    S.legacySeller = !!sc.legacySeller; S.sellerLocs = (sc.sellerLocs || []).slice(); S.locs = (sc.locs || []).slice(); S.fulfil = sc.fulfil || (S.locs.length === 1 ? S.locs[0] : '');
    S.unit = sc.unit || ''; S.content = sc.content || ''; S.contentUnit = sc.contentUnit || 'kg';
    S.basePrice = sc.price || ''; S.cost = sc.cost || ''; S.packs = (sc.packs || []).map(function (p) { return Object.assign({}, p); }); S.packMode = sc.packMode || 'base';
    S.tiers = (sc.tiers || []).map(function (t) { return Object.assign({}, t); });
    S.delivery = (sc.delivery || []).slice(); S.publication = sc.marketplace ? 'published' : 'draft'; S.availability = sc.availability || 'available';
    if (sc.marketplace) { S.desc = 'Maelezo ya mfano kwa ' + sc.name + '.'; S.images = ['sample']; }
    if (sc.axes && Object.keys(sc.axes).length) { S.hasVar = true; S.axes = JSON.parse(JSON.stringify(sc.axes)); }
    if (sc.stock) S.stock = JSON.parse(JSON.stringify(sc.stock));
    if (sc.kind === 'service') { S.svc.model = sc.priceModel || 'fixed'; S.svc.area = sc.area || ''; S.svc.mode = sc.mode || 'onsite_customer'; S.svc.travel = true; S.desc = 'Ufungaji wa wiring mpya, soketi na DB.'; S.ch = { marketplace: true, pos: false }; S.publication = 'published'; }
    if (sc.kind === 'product') S.cond['ATTR-CONDITION'] = key === 'gari' ? 'used' : 'new';
    if (key === 'mifugo') S.saleBy = 'count';
    S.step = 'confirm'; renderBuilder(); toast('Mfano umepakiwa: ' + sc.title);
  }

  function combos() {
    if (!S.hasVar) return [];
    var axes = Object.keys(S.axes).filter(function (a) { return (S.axes[a] || []).length; });
    if (!axes.length) return [];
    var out = [[]];
    axes.forEach(function (a) { var nx = []; out.forEach(function (c) { S.axes[a].forEach(function (v) { nx.push(c.concat([[a, v]])); }); }); out = nx; });
    return out.slice(0, 100).map(function (c) { return { key: c.map(function (x) { return x[1]; }).join(' · '), opts: c }; });
  }
  function skuFor(key) { var base = norm(S.name).split(' ').slice(0, 2).join('-').toUpperCase() || 'SKU'; return base + (key ? '-' + norm(key).replace(/ /g, '-').toUpperCase() : ''); }
  // Stock items: variants, or pre-packed packs, or the base unit. Each item × location is one inventory record.
  function stockItems() {
    var cs = combos();
    if (cs.length) return cs.map(function (c) { return { key: c.key, label: c.key, variantId: 'v-' + norm(c.key).replace(/ /g, '-'), unit: S.unit }; });
    if (S.packMode === 'packs' && S.packs.length) return S.packs.map(function (p) { return { key: 'pack:' + p.label, label: p.label, variantId: 'pk-' + norm(p.label).replace(/ /g, '-'), unit: 'pack' }; });
    return [{ key: '', label: S.name || 'Bidhaa', variantId: null, unit: S.unit }];
  }
  function invKey(locId, item) { return [BIZ, locId, '{productId}', item.variantId || '-', item.unit || '-'].join(':'); }

  function validate() {
    var e = {};
    var add = function (k, m) { (e[k] = e[k] || []).push(m); };
    var warn = {};
    var n = node();
    if (!n && !S.other) add('find', 'Chagua aina/tawi au andika “Nyingine (Taja)”.');
    if (S.other && (!S.other.text || S.other.text.trim().length < 2)) add('find', 'Andika jina la aina unayopendekeza.');
    if (S.other && !S.other.parentId) add('find', 'Chagua tawi ambalo pendekezo lako linaingia.');
    if (!S.name.trim()) add('basic', 'Jina linahitajika.');
    if (mkt() && !S.desc.trim()) add('basic', 'Maelezo yanahitajika kwa sababu inaonekana marketplace.');
    if (mkt() && !isSvc() && !S.images.length) add('basic', 'Weka angalau picha 1 kwa bidhaa ya marketplace.');
    if (!S.chSet) add('channel', 'Chagua channel: kusimamia tu, marketplace, POS, au marketplace + POS.');
    if (isSvc()) {
      if (!S.svc.area.trim() && S.svc.mode !== 'remote') add('location', 'Taja eneo unalohudumia.');
      if (S.svc.model !== 'quote' && !(Number(S.price) > 0)) add('price', 'Weka bei, au chagua “Kwa makubaliano (quote)”.');
      return { e: e, warn: warn };
    }
    if (physical()) {
      var locs = effectiveLocs();
      if (!S.locs.length && pos() && S.legacySeller) warn.location = 'Muuzaji wa zamani hana location: “Location ya msingi” itaundwa kiotomatiki. POS itaendelea kufanya kazi, lakini ombi la kusajili duka litaonyeshwa.';
      else if (!locs.length) add('location', pos() ? 'POS inahitaji location halali (duka). Chagua au ongeza location.' : 'Chagua location ambapo stock inakaa.');
      if (pos() && locs.length && !locs.some(function (l) { return l.pos || l.type === 'default'; })) add('location', 'Hakuna location kati ya ulizochagua inayoweza kuuza kwa POS. Chagua duka.');
      if (mkt() && locs.length > 1 && !S.fulfil) add('location', 'Chagua location inayohudumia oda za marketplace.');
      if (!S.unit) add('price', 'Chagua kitengo cha msingi (base unit).');
      var u = unitById(S.unit);
      if (u && !u.ok && !(Number(S.content) > 0)) add('price', 'Kitengo “' + u.label + '” hakina ukubwa wa kudumu: taja kina kiasi gani.');
      if (!(Number(S.basePrice) > 0) && !S.packs.some(function (p) { return Number(p.price) > 0; })) add('price', 'Weka bei kwa kitengo cha msingi au bei ya angalau pack moja.');
      S.packs.forEach(function (p) { if (!(Number(p.content) > 0) || !(Number(p.price) > 0)) add('price', 'Pack “' + (p.label || '?') + '” inahitaji ukubwa na bei.'); });
      S.tiers.forEach(function (t) {
        var ref = t.ref === 'base' ? Number(S.basePrice) : Number((S.packs.find(function (p) { return p.label === t.ref; }) || {}).price);
        if (!(Number(t.min) >= 2)) add('price', 'Bei ya jumla inahitaji idadi ya chini ≥ 2.');
        if (ref && !(Number(t.price) < ref)) add('price', 'Bei ya jumla ya ' + t.ref + ' lazima iwe chini ya bei ya rejareja (' + fmt(ref) + ').');
      });
      if (S.hasVar && !combos().length) add('specs', 'Ongeza thamani za variant, au zima variants.');
      if (mkt() && !S.delivery.length) add('delivery', 'Chagua angalau njia moja ya mnunuzi kupata bidhaa.');
      if (S.delivery.indexOf('pickup') >= 0 && !locs.some(function (l) { return l.pickup; })) add('delivery', 'Pickup inahitaji location inayoruhusu pickup (duka). Ghala na location ya msingi haziruhusu kwa sasa.');
    }
    if (!isSvc()) {
      if (!S.cond['ATTR-CONDITION']) add('specs', 'Chagua hali (mpya/iliyotumika…).');
      regList(classNode() || n || N[0]).forEach(function (f) { ((D.reg[f] || {}).requiredAttributes || []).forEach(function (a) { if (!S.cond[a]) add('specs', 'Kwa sababu ya ' + f + ': jaza ' + a.replace('ATTR-', '') + '.'); }); });
    }
    return { e: e, warn: warn };
  }

  function renderSteps(errs) {
    var a = activeSteps();
    $('steps').innerHTML = STEPS.map(function (s) {
      var on = stepActive(s.k), idx = a.findIndex(function (x) { return x.k === s.k; });
      if (!on) return '<li><button type="button" class="skip" disabled title="Haihusiki kwa chaguo lako"><span class="n">–</span><span>' + esc(s.t) + ' <span class="small">(inarukwa)</span></span></button></li>';
      return '<li><button type="button" data-step="' + s.k + '"' + (S.step === s.k ? ' aria-current="step"' : '') + '><span class="n">' + (idx + 1) + '</span><span>' + esc(s.t) + (errs[s.k] ? ' <span class="st st-UNVERIFIED" title="Kuna kinachokosekana">!</span>' : '') + '</span></button></li>';
    }).join('');
  }

  function stepKind() {
    return '<div class="cards"><button type="button" class="card" data-kind="product" aria-pressed="' + (S.kind === 'product') + '"><b>Bidhaa</b><span class="small">Ina stock kwenye location, units, bei, variants; inaweza kuuzwa marketplace na/au POS.</span></button>' +
      '<button type="button" class="card" data-kind="service" aria-pressed="' + (S.kind === 'service') + '"><b>Huduma</b><span class="small">Eneo la kazi, mfumo wa bei, upatikanaji. Haina stock wala POS.</span></button></div>' +
      (S.kind === 'product' ? '<div class="row"><span class="small">Asili ya bidhaa:</span><div class="seg" role="group" aria-label="Asili ya bidhaa"><button type="button" data-nature="physical" aria-pressed="' + (S.nature === 'physical') + '">Inashikika</button><button type="button" data-nature="digital" aria-pressed="' + (S.nature === 'digital') + '">Ya kidijitali</button></div><span class="small muted">Si channel wala mtindo wa bei. Inachukua nafasi ya physical/digital ndani ya prodProductType.</span></div>' : '') +
      '<p class="small muted">Mlango mmoja ' + badge('PROPOSED') + '. Collections zinabaki mbili: <span class="mono">products</span> na <span class="mono">services</span> ' + badge('IMPLEMENTED') + '. Huduma hazilazimishwi kuwa na inventory wala POS.</p>';
  }

  function stepFind() {
    var hits = S.q ? search(S.q, S.kind, 8) : [];
    var cats = {}; hits.forEach(function (h) { var c = catOf(h); if (c) cats[c.id] = c; });
    var h = '<div class="stack"><label class="f" for="b-q">Andika unachouza<input type="search" id="b-q" value="' + esc(S.q) + '" placeholder="' + (isSvc() ? 'mf. fundi umeme, usafi wa nyumba, tuition' : 'mf. mahindi, simu, mafuta ya alizeti, saruji') + '" autocomplete="off"></label>';
    if (S.q && hits.length) {
      h += '<div class="row small"><span class="muted">Category zinazohusika:</span>' + Object.keys(cats).map(function (k) { return '<span class="chip ' + (isSvc() ? 'svc' : 'prd') + '">' + esc(cats[k].sw) + '</span>'; }).join('') + '</div>';
      h += '<div class="sugg" id="b-hits">' + hits.map(function (n) {
        return '<button type="button" data-pick="' + n.id + '" aria-pressed="' + (S.nodeId === n.id) + '"><b>' + label(n) + '</b>' + pathHtml(n) + '<span class="small muted">' + LV[n.l] + ' · ' + n.id + (n.o === 'PROPOSED' ? ' · mpya kwenye rasimu' : '') + '</span></button>';
      }).join('') + '</div>';
    } else if (S.q) h += '<p class="note">Hakuna inayolingana na “' + esc(S.q) + '”. Chagua tawi hapa chini, kisha andika jina lako kwenye Nyingine (Taja).</p>';
    h += '<div class="row"><button type="button" class="btn gold" data-act="other">Sijapata — Nyingine (Taja)</button><span class="small muted">Haiingii kwenye taxonomy rasmi mpaka admin aidhinishe.</span></div>';
    if (S.other) h += otherBox();
    h += '<details id="b-browse"' + (S.browseOpen || !(S.q && hits.length) ? ' open' : '') + '><summary><b>Au chagua mwenyewe</b> <span class="small muted">— unaweza kusimama ngazi yoyote kuanzia subcategory</span></summary>' + browseCols() + '</details></div>';
    return h;
  }
  function otherBox() {
    var p = S.other.parentId ? byId.get(S.other.parentId) : null;
    var sug = S.other.text ? search(S.other.text, S.kind, 3) : [];
    return '<div class="panel stack" style="border-color:var(--gold)"><h3>Nyingine (Taja)</h3>' +
      '<label class="f" for="b-other">Jina la aina unayouza<input type="text" id="b-other" value="' + esc(S.other.text) + '" maxlength="80"></label>' +
      (sug.length ? '<div class="note">Kabla ya kutuma: je, ulimaanisha mojawapo ya hizi? ' + sug.map(function (n) { return '<button type="button" class="btn sm" data-pick="' + n.id + '">' + esc(n.sw) + '</button>'; }).join(' ') + '</div>' : '') +
      '<div class="small">Tawi la mzazi: ' + (p ? '<b>' + esc(plain(p)) + '</b> ' + pathHtml(p) : '<span class="muted">chagua kwenye “Chagua mwenyewe”</span>') + '</div>' +
      '<p class="small muted">Bidhaa inahifadhiwa chini ya tawi hili ikiwa na <span class="mono">classificationState: OTHER_PRODUCT_TYPE</span>. Pendekezo linaenda kwenye foleni ya admin.</p></div>';
  }
  function browseCols() {
    var b = S.browse;
    var col = function (title, list, lvl) {
      return '<div class="col"><div class="colh">' + title + '</div>' + list.map(function (n) {
        return '<button type="button" data-browse="' + lvl + '" data-id="' + n.id + '" aria-pressed="' + (b[lvl] === n.id) + '">' + esc(n.sw) + (n.o === 'PROPOSED' ? ' <span class="st st-PROPOSED">MPYA</span>' : '') + '</button>';
      }).join('') + '</div>';
    };
    var top = N.filter(function (n) { return n.l === 1 && n.t !== 'system' && kindOk(n, S.kind) && n.st !== 'INACTIVE'; });
    var c1 = b[0] ? byId.get(b[0]) : null;
    var subs = c1 ? kids[c1.i].map(function (i) { return N[i]; }).filter(function (n) { return !isOther(n) && n.l <= 3 && kindOk(n, S.kind); }) : [];
    var c2 = b[1] ? byId.get(b[1]) : null;
    var deeper = c2 ? kids[c2.i].map(function (i) { return N[i]; }).filter(function (n) { return !isOther(n) && kindOk(n, S.kind); }) : [];
    var h = '<div class="cols" style="margin-top:8px">' + col('Category', top, 0) + col('Subcategory', subs, 1) + col(c2 && deeper.some(function (n) { return n.l === 3; }) ? 'Sub-subcategory / Aina' : 'Aina', deeper, 2) + '</div>';
    var chosen = b[2] ? byId.get(b[2]) : c2;
    if (chosen && chosen.l >= 3 && kids[chosen.i].some(function (i) { return !isOther(N[i]); })) h += '<div class="cols" style="margin-top:8px">' + col('Aina ndani ya ' + esc(chosen.sw), kids[chosen.i].map(function (i) { return N[i]; }).filter(function (n) { return !isOther(n); }), 3) + '</div>';
    var target = (b[3] && byId.get(b[3])) || (b[2] && byId.get(b[2])) || c2;
    if (target) h += '<div class="row" style="margin-top:8px"><button type="button" class="btn pri sm" data-pick="' + target.id + '">Tumia: ' + esc(target.sw) + '</button>' + (S.other ? '<button type="button" class="btn sm gold" data-otherparent="' + leafOf(target).id + '">Weka kama mzazi wa “Nyingine”</button>' : '') + '<span class="small muted">' + LV[target.l] + ' · ' + target.id + '</span></div>';
    return h;
  }

  function stepConfirm() {
    var n = node(), c = classNode();
    if (!n && !S.other) return '<p class="note red">Bado hujachagua. Rudi hatua ya “Tafuta au chagua”.</p>';
    var shown = S.other ? c : n;
    var fam = familyOf(shown), def = defFor(shown);
    var sib = n && par(n) ? kids[par(n).i].map(function (i) { return N[i]; }).filter(function (x) { return !isOther(x) && x.id !== n.id; }).slice(0, 8) : [];
    return '<div class="picked stack"><div class="eyebrow">' + (S.other ? 'Pendekezo lako (Nyingine)' : 'Umechagua') + '</div><h2>' + (S.other ? esc(S.other.text) + ' <span class="st st-PROPOSED">INASUBIRI ADMIN</span>' : label(n)) + '</h2>' + pathHtml(shown) +
      '<div class="row"><span class="chip ' + (shown.t === 'service' ? 'svc' : 'prd') + '">' + (shown.t === 'service' ? 'Huduma' : shown.t === 'both' ? 'Bidhaa + huduma' : 'Bidhaa') + '</span>' + regChips(shown) + (fam ? '<span class="chip">Variants: ' + esc(fam.key) + '</span>' : '') + (def ? '<span class="chip">Attributes ' + def.def.a.length + ' (canonical)</span>' : '<span class="chip">Template ya jumla tu</span>') + '</div>' +
      '<p class="small mono">taxonomyNodeId: ' + esc(S.other ? 'OTHER-' + c.id : n.id) + '</p></div>' +
      (regList(shown).length ? '<div class="note red"><b>Bidhaa inayodhibitiwa.</b> ' + regList(shown).map(function (f) { return esc((D.reg[f] || {}).sw || f); }).join('; ') + '.</div>' : '') +
      (sib.length ? '<div class="stack"><span class="small muted">Si sahihi? Aina nyingine kwenye tawi hili:</span><div class="row">' + sib.map(function (x) { return '<button type="button" class="btn sm" data-pick="' + x.id + '">' + esc(x.sw) + '</button>'; }).join('') + '</div></div>' : '') +
      '<p class="small muted">Taxonomy inaeleza bidhaa <i>ni nini</i>. Inauzwa wapi, stock iko wapi, bei na inamfikiaje mnunuzi ni hatua tofauti.</p>';
  }

  function stepBasic() {
    var req = mkt();
    return '<div class="stack"><label class="f" for="b-name"><span class="req">Jina ' + (isSvc() ? 'la huduma' : 'la bidhaa') + '</span><input type="text" id="b-name" value="' + esc(S.name) + '" maxlength="140"></label>' +
      '<label class="f" for="b-desc"><span class="' + (req ? 'req' : '') + '">Maelezo</span><span class="h">' + (req ? 'Lazima: inaonekana marketplace.' : 'Hiari kwa channel ulizochagua.') + '</span><textarea id="b-desc">' + esc(S.desc) + '</textarea></label>' +
      '<div class="stack"><span class="small"><b class="' + (req && !isSvc() ? 'req' : '') + '">Picha</b> <span class="muted">' + (req && !isSvc() ? 'Angalau 1 kwa marketplace.' : 'Hiari.') + ' Zinabaki kwenye kivinjari chako tu.</span></span>' +
      '<div class="thumbs">' + S.images.map(function (src, i) { return src === 'sample' ? '<span class="chip">Picha ya mfano ' + (i + 1) + '</span>' : '<img alt="Picha ' + (i + 1) + '" src="' + src + '">'; }).join('') + '</div>' +
      '<input type="file" id="b-img" accept="image/*" multiple aria-label="Ongeza picha"></div>' +
      (S.chSet ? '' : '<p class="note blue small">Sehemu za lazima hapa zinategemea channel utakayochagua.</p>') + '</div>';
  }

  function stepChannel() {
    if (isSvc()) {
      return '<div class="cards"><button type="button" class="card" data-svcch="private" aria-pressed="' + (S.chSet && !S.ch.marketplace) + '"><b>Hifadhi binafsi</b><span class="small">Haionekani Huduma Hub.</span><span>' + badge('PROPOSED') + '</span></button>' +
        '<button type="button" class="card" data-svcch="hub" aria-pressed="' + (S.ch.marketplace) + '"><b>Onekana Huduma Hub</b><span class="small">Wateja wanakuona na kukuomba huduma.</span><span>' + badge('IMPLEMENTED') + '</span></button></div><p class="small muted">Huduma hazina POS wala stock.</p>';
    }
    var h = '<p class="small muted">Channel ni <b>inauzwa wapi</b>. Bidhaa moja inaweza kuwa na channels nyingi bila kurudiwa (rekodi moja). Stock iko kwenye location (hatua inayofuata), si kwenye channel.</p>' +
      '<div class="cards" role="group" aria-label="Sales channels">' +
      '<button type="button" class="card" data-ch="manage" aria-pressed="' + manageOnly() + '"><b>Kusimamia tu</b><span class="small">Stock, bei, gharama na historia ya ndani. Haionekani marketplace wala POS.</span><span>' + badge('PROPOSED') + ' <span class="small">Uamuzi #1 ✓</span></span></button>' +
      '<button type="button" class="card" data-ch="marketplace" aria-pressed="' + S.ch.marketplace + '"><b>Marketplace (online)</b><span class="small">Inaonekana kwa wanunuzi mtandaoni.</span><span>' + badge('IMPLEMENTED') + '</span></button>' +
      '<button type="button" class="card" data-ch="pos" aria-pressed="' + S.ch.pos + '"><b>POS (dukani)</b><span class="small">Inauzwa kwenye POS ya location yenye duka.</span><span>' + badge('IMPLEMENTED') + '</span></button></div>' +
      '<p class="small">Channels zilizochaguliwa: <b>' + esc(channelList().join(' + ') || '—') + '</b></p>' +
      '<div class="note blue small">Ramani kwa sehemu za zamani: marketplace → <span class="mono">isOnline</span>, POS → <span class="mono">isOffline</span>; kusimamia tu → zote mbili <span class="mono">false</span> (kichujio cha mnunuzi tayari kinaficha <span class="mono">isOnline:false</span>). POS quick-add: <b>POS tu kwa default</b> (uamuzi #2); marketplace inawashwa baadaye kupitia Edit.</div>';
    return h;
  }

  function stepLocation() {
    if (isSvc()) {
      return '<div class="stack"><p class="small muted">Huduma haina stock wala location ya stock. Taja unapofanyia kazi.</p>' +
        '<div class="seg blue" role="group" aria-label="Mahali pa huduma">' + [['onsite_customer', 'Kwa mteja'], ['at_provider', 'Kwangu (ofisi/karakana)'], ['remote', 'Mtandaoni']].map(function (m) { return '<button type="button" data-svcmode="' + m[0] + '" aria-pressed="' + (S.svc.mode === m[0]) + '">' + m[1] + '</button>'; }).join('') + '</div>' +
        '<label class="f" for="b-area"><span class="' + (S.svc.mode === 'remote' ? '' : 'req') + '">Eneo unalohudumia</span><input type="text" id="b-area" value="' + esc(S.svc.area) + '"></label>' +
        '<label class="row small"><input type="checkbox" id="b-travel"' + (S.svc.travel ? ' checked' : '') + '> Ninasafiri kwa mteja ' + badge('IMPLEMENTED') + '</label></div>';
    }
    var mine = S.sellerLocs.map(function (id) { return LOCS[id]; });
    var h = '<div class="row"><span class="small">Hali ya muuzaji (kwa majaribio):</span><div class="seg" role="group" aria-label="Aina ya muuzaji"><button type="button" data-legacy="0" aria-pressed="' + !S.legacySeller + '">Mpya</button><button type="button" data-legacy="1" aria-pressed="' + S.legacySeller + '">Wa zamani (bila location)</button></div></div>';
    h += '<p class="small muted">Stock inahifadhiwa kwa <b>business × location × product × variant × unit</b>. Bidhaa moja inaweza kukaa locations nyingi; kila moja ina stock yake. Majina ya locations ni ya mfano.</p>';
    if (!mine.length) h += '<p class="note">Muuzaji huyu hana location iliyosajiliwa.</p>';
    else h += '<div class="cards">' + mine.map(function (l) {
      var on = S.locs.indexOf(l.id) >= 0;
      return '<button type="button" class="card" data-loc="' + l.id + '" aria-pressed="' + on + '"><b>' + esc(l.name) + '</b><span class="small">' + LOC_TYPE[l.type] + ' · POS ' + (l.pos ? 'ndiyo' : 'hapana') + ' · pickup ' + (l.pickup ? 'ndiyo' : 'hapana') + '</span>' + (l.note ? '<span class="small">' + esc(l.note) + '</span>' : '') + '</button>';
    }).join('') + '</div>';
    var v = validate();
    if (v.warn.location) h += '<div class="note"><b>Migration safeguard</b> ' + badge('PROPOSED') + ': ' + esc(v.warn.location) + '</div>';
    var locs = effectiveLocs();
    if (mkt() && locs.length > 1) h += '<label class="f" for="b-fulfil"><span class="req">Oda za marketplace zinachukua stock kutoka</span><select id="b-fulfil"><option value="">Chagua location</option>' + locs.map(function (l) { return '<option value="' + l.id + '"' + (S.fulfil === l.id ? ' selected' : '') + '>' + esc(l.name) + '</option>'; }).join('') + '</select></label>';
    var shared = mkt() && pos() && locs.length && (locs.length === 1 || (S.fulfil && LOCS[S.fulfil] && LOCS[S.fulfil].pos));
    if (shared) h += '<p class="note blue small"><b>Stock moja:</b> marketplace na POS zinasoma na kupunguza stock ileile ya ' + esc((LOCS[S.fulfil] || locs[0]).name) + ' (uamuzi C). Reservation ya oda za online inazuia oversell (Awamu 3).</p>';
    if (locs.length > 1) h += '<p class="small muted">Stock kwa locations nyingi na transfers kati yake ni Awamu 4 ' + badge('PROPOSED') + '. Transfer ya stock si delivery.</p>';
    return h;
  }

  function fieldFor(labelTxt, val) {
    var a = D.attrs[labelTxt] || ['string', '', []];
    var def = defFor(classNode() || node());
    var opts = (def && def.def.o[labelTxt]) || a[2] || [];
    var id = 'at-' + norm(labelTxt).replace(/ /g, '-');
    var input;
    if (opts.length) input = '<select id="' + id + '" data-attr="' + esc(labelTxt) + '"><option value="">—</option>' + opts.map(function (o) { return '<option' + (val === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '<option value="__other">Nyingine (taja)</option></select>';
    else if (a[0] === 'boolean') input = '<select id="' + id + '" data-attr="' + esc(labelTxt) + '"><option value="">—</option><option>Ndiyo</option><option>Hapana</option></select>';
    else if (a[0] === 'measurement' || a[0] === 'number') {
      var g = a[1]; var us = D.units.filter(function (u) { return !g || u.group === g; });
      input = '<div class="row" style="flex-wrap:nowrap"><input type="number" id="' + id + '" data-attr="' + esc(labelTxt) + '" value="' + esc(val || '') + '" style="flex:1">' + (g ? '<select aria-label="Kitengo cha ' + esc(labelTxt) + '" style="width:auto">' + us.map(function (u) { return '<option>' + esc(u.label) + '</option>'; }).join('') + '</select>' : '') + '</div>';
    } else input = '<input type="text" id="' + id + '" data-attr="' + esc(labelTxt) + '" value="' + esc(val || '') + '">';
    return '<label class="f" for="' + id + '"><span>' + esc(labelTxt) + ' <span class="muted small">' + esc(a[0]) + (a[1] ? ' · ' + esc(a[1]) : '') + '</span></span>' + input + '</label>';
  }
  function condField(id, lbl, note) { return '<label class="f"><span>' + esc(lbl) + '</span><input type="text" data-cond="' + id + '" value="' + esc(S.cond[id] || '') + '"><span class="h">' + (note || badge('PROPOSED')) + '</span></label>'; }

  function stepSpecs() {
    var n = classNode() || node();
    if (!n) return '<p class="note red">Chagua uainishaji kwanza.</p>';
    if (isSvc()) {
      return '<div class="stack"><h3>Sifa za huduma (template ya jumla)</h3><div class="grid2">' +
        D.common.service.filter(function (a) { return ['ATTR-SVC_AREA', 'ATTR-SVC_MODE', 'ATTR-PRICE_MODEL', 'ATTR-SELLER_LICENCE'].indexOf(a.id) < 0; }).map(function (a) {
          return '<label class="f"><span>' + esc(a.id.replace('ATTR-', '').replace(/_/g, ' ').toLowerCase()) + '</span><input type="text" data-cond="' + a.id + '" value="' + esc(S.cond[a.id] || '') + '"><span class="h">' + a.required + ' · ' + badge('PROPOSED') + '</span></label>';
        }).join('') + '</div>' + (regList(n).length ? condField('ATTR-SELLER_LICENCE', 'Namba ya leseni') : '') + '<p class="small muted">Vifurushi (package/tier, muda) ni variants za huduma; hazina stock.</p></div>';
    }
    var d = defFor(n), fam = familyOf(n), regs = regList(n), c = catOf(n);
    var own = d ? d.def.a : [];
    var h = '<div class="stack"><h3>Kwa kila bidhaa</h3><div class="grid2">' +
      '<label class="f" for="cond-condition"><span class="req">Hali</span><select id="cond-condition" data-cond="ATTR-CONDITION"><option value="">—</option>' + [['new', 'Mpya'], ['used', 'Imetumika (mitumba)'], ['refurbished', 'Refurbished'], ['for_parts', 'Kwa vipuri'], ['open_box', 'Open box']].map(function (v) { return '<option value="' + v[0] + '"' + (S.cond['ATTR-CONDITION'] === v[0] ? ' selected' : '') + '>' + v[1] + '</option>'; }).join('') + '</select><span class="h">prodCondition ' + badge('IMPLEMENTED') + '</span></label>' +
      (own.indexOf('Brand') < 0 ? condField('ATTR-BRAND', 'Brand (hiari)') : '') + condField('ATTR-GTIN', 'Barcode / GTIN (hiari)', 'prodBarcode ' + badge('IMPLEMENTED')) + '</div>';
    var conds = [];
    if (regs.some(function (f) { return /TMDA|TPHPA|TFRA/.test(f); })) conds.push(condField('ATTR-REG_NUMBER', 'Namba ya usajili (' + regs.filter(function (f) { return /TMDA|TPHPA|TFRA/.test(f); }).join(', ') + ')'));
    if (regs.indexOf('REG-TCRA') >= 0) conds.push(condField('ATTR-TYPE_APPROVAL', 'Namba ya TCRA type approval'));
    if (regs.some(function (f) { return /PHARMACY|MINING|UNVERIFIED/.test(f); })) conds.push(condField('ATTR-SELLER_LICENCE', 'Leseni ya muuzaji'));
    if (c && ['CAT-01', 'CAT-08', 'CAT-19'].indexOf(c.id) >= 0) conds.push(condField('ATTR-EXPIRY', 'Tarehe ya kuisha', 'smartExpiryFields ' + badge('IMPLEMENTED')) + condField('BATCH', 'Batch number', 'smartExpiryFields ' + badge('IMPLEMENTED')));
    if (c && c.id === 'CAT-12') conds.push(condField('IMEI', 'IMEI / Serial (kila kipande)', 'smartImeiFields ' + badge('IMPLEMENTED')));
    if (conds.length) h += '<h3>Sehemu za masharti (kwa aina hii tu)</h3><div class="grid2">' + conds.join('') + '</div>';
    h += '<h3>Attributes za aina hii</h3>' + (d ? '<p class="small muted">Chanzo: <span class="mono">' + esc(d.def.src) + '</span></p><div class="grid2">' + own.filter(function (a) { return ['Condition', 'Unit', 'Quantity', 'Price'].indexOf(a) < 0; }).map(function (a) { return fieldFor(a, S.attrs[a]); }).join('') + '</div>' : '<p class="note">Aina hii haina canonical definition ya attributes bado. Inatumia template ya jumla tu.</p>');
    h += '<h3>Variants</h3>';
    if (!fam) h += '<p class="small muted">Hakuna variant family kwa category hii.</p>';
    else if (!fam.f.axes.length) h += '<p class="note">' + esc(fam.f.note || 'Kila kipengee ni cha kipekee: hakuna variants.') + '</p>';
    else {
      h += '<label class="row small"><input type="checkbox" id="b-hasvar"' + (S.hasVar ? ' checked' : '') + '> Bidhaa hii ina variants (kila mchanganyiko una SKU, bei na stock kwa kila location)</label>';
      if (S.hasVar) {
        h += '<p class="small muted">Family <b>' + esc(fam.key) + '</b>. Zinazoruhusiwa: ' + fam.f.axes.map(esc).join(', ') + '. Haziruhusiwi: ' + fam.f.forbidden.map(esc).join(', ') + '. Pack size za bei (lita, debe) zinawekwa kwenye “Units, bei & stock”, si hapa.</p><div class="grid2">' +
          fam.f.axes.filter(function (ax) { return ax !== 'Pack Size'; }).map(function (ax) {
            var on = !!S.axes[ax];
            return '<label class="f"><span><input type="checkbox" data-axis="' + esc(ax) + '"' + (on ? ' checked' : '') + '> ' + esc(ax) + '</span>' + (on ? '<input type="text" data-axisvals="' + esc(ax) + '" value="' + esc((S.axes[ax] || []).join(', ')) + '" placeholder="Tenganisha kwa koma">' : '') + '</label>';
          }).join('') + '</div>';
        var cs = combos();
        if (cs.length) h += '<p class="small">Michanganyiko <b class="num">' + cs.length + '</b>: ' + cs.slice(0, 12).map(function (x) { return '<span class="chip">' + esc(x.key) + '</span>'; }).join(' ') + '</p>';
      }
    }
    return h + '</div>';
  }

  function stepPrice() {
    if (isSvc()) {
      return '<div class="stack"><div class="grid2"><label class="f" for="b-model"><span class="req">Mfumo wa bei</span><select id="b-model">' + [['fixed', 'Bei kamili'], ['per_hour', 'Kwa saa'], ['per_day', 'Kwa siku'], ['per_session', 'Kwa kikao'], ['per_unit', 'Kwa kipimo'], ['quote', 'Kwa makubaliano (quote)']].map(function (m) { return '<option value="' + m[0] + '"' + (S.svc.model === m[0] ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') + '</select><span class="h">servPricingModel ' + badge('IMPLEMENTED') + '</span></label>' +
        (S.svc.model === 'quote' ? '<p class="note small">Mteja anaomba bei; mazungumzo yanapitia mfumo wa negotiation uliopo.</p>' : '<label class="f" for="b-price"><span class="req">Bei (TZS)</span><input type="number" id="b-price" value="' + esc(S.price) + '"></label>') + '</div><p class="small muted">Huduma haina stock. Upatikanaji: availabilityStatus ' + badge('IMPLEMENTED') + '; slots/ratiba ' + badge('PROPOSED') + '.</p></div>';
    }
    var n = classNode() || node(), c = catOf(n);
    var groups = {}; D.units.forEach(function (u) { (groups[u.group] = groups[u.group] || []).push(u); });
    var u = unitById(S.unit), ul = u ? u.label : 'kitengo';
    var h = '<div class="stack"><h3>1 · Kitengo cha msingi (base unit) ' + badge('PROPOSED') + '</h3><p class="small muted">Registry moja kwa fomu zote (uamuzi #7). Stock na bei ya msingi zinahesabiwa kwa kitengo hiki.</p>';
    if (c && c.id === 'CAT-04') h += '<div class="row"><span class="small">Unauza kwa:</span><div class="seg" role="group" aria-label="Kuuza kwa idadi au uzito"><button type="button" data-saleby="count" aria-pressed="' + (S.saleBy === 'count') + '">Idadi (kichwa)</button><button type="button" data-saleby="weight" aria-pressed="' + (S.saleBy === 'weight') + '">Uzito (kg)</button></div></div><p class="note small">' + (S.saleBy === 'count' ? 'Stock = vichwa. Uzito wa kila kuku ni attribute au variant.' : 'Stock = kg na bei ni kwa kg.') + ' Idadi na uzito havibadilishani kiotomatiki (COUNT na WEIGHT ni makundi tofauti).</p>';
    h += '<div class="grid2"><label class="f" for="b-unit"><span class="req">Base unit</span><select id="b-unit"><option value="">Chagua</option>' + Object.keys(groups).map(function (g) {
      return '<optgroup label="' + esc(g) + '">' + groups[g].map(function (x) { return '<option value="' + x.id + '"' + (S.unit === x.id ? ' selected' : '') + '>' + esc(x.label) + (x.ok ? '' : ' · taja ukubwa') + '</option>'; }).join('') + '</optgroup>';
    }).join('') + '</select></label>';
    if (u && !u.ok) h += '<label class="f" for="b-content"><span class="req">Kila ' + esc(u.label) + ' kina kiasi gani?</span><div class="row" style="flex-wrap:nowrap"><input type="number" id="b-content" value="' + esc(S.content) + '" style="flex:1"><select id="b-cunit" style="width:auto">' + ['kg', 'L', 'piece', 'g', 'mL'].map(function (x) { return '<option' + (S.contentUnit === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div><span class="h">' + esc(u.note || 'Kitengo hiki hakina ukubwa wa kudumu; hakibadilishwi kiotomatiki.') + '</span></label>';
    h += '<label class="f" for="b-cost">Gharama kwa ' + esc(ul) + ' (TZS)<input type="number" id="b-cost" value="' + esc(S.cost) + '"><span class="h">prodBuyPrice ' + badge('IMPLEMENTED') + ' · haionekani kwa mnunuzi</span></label></div>';

    h += '<h3>2 · Bei ya rejareja kwa kitengo na pack sizes</h3><p class="small muted">Hii ni <b>unit/pack-size pricing</b>: bei ya kitu kimoja cha ukubwa fulani. Si bei ya jumla.</p>';
    h += '<div class="grid2"><label class="f" for="b-baseprice">Bei kwa ' + esc(ul) + ' (TZS)<input type="number" id="b-baseprice" value="' + esc(S.basePrice) + '"><span class="h">prodPrice ' + badge('IMPLEMENTED') + ' · acha wazi kama unauza kwa packs tu</span></label></div>';
    h += '<div class="tablewrap"><table><thead><tr><th>Pack</th><th>Ina ' + esc(ul) + '</th><th>Bei (TZS)</th><th>Bei kwa ' + esc(ul) + '</th><th></th></tr></thead><tbody>' +
      (S.packs.length ? S.packs.map(function (p, i) {
        var per = Number(p.content) > 0 && Number(p.price) > 0 ? Math.round(p.price / p.content) : null;
        return '<tr><td><input type="text" data-pack="' + i + '|label" value="' + esc(p.label) + '" aria-label="Jina la pack" style="min-width:110px"></td><td><input type="number" data-pack="' + i + '|content" value="' + esc(p.content) + '" aria-label="Ukubwa" style="width:80px"></td><td><input type="number" data-pack="' + i + '|price" value="' + esc(p.price) + '" aria-label="Bei" style="width:110px"></td><td class="num">' + (per ? fmt(per) + (Number(S.basePrice) > 0 && per !== Number(S.basePrice) ? ' <span class="small muted">(' + Math.abs(Math.round((1 - per / S.basePrice) * 100)) + '% ' + (per < S.basePrice ? 'nafuu' : 'ghali') + ' kuliko bei ya ' + esc(ul) + ')</span>' : '') : '—') + '</td><td><button type="button" class="btn sm" data-packdel="' + i + '" aria-label="Ondoa pack">Ondoa</button></td></tr>';
      }).join('') : '<tr><td colspan="5" class="muted small">Hakuna pack. Ongeza mf. “Chupa 3 L” au “Debe 20 L”.</td></tr>') + '</tbody></table></div>' +
      '<div class="row"><button type="button" class="btn sm" data-act="addpack">+ Ongeza pack size</button>' + (S.packs.length ? '<span class="small">Stock ya packs:</span><div class="seg" role="group" aria-label="Stock ya packs"><button type="button" data-packmode="base" aria-pressed="' + (S.packMode === 'base') + '">Inapimwa kutoka stock ya ' + esc(ul) + '</button><button type="button" data-packmode="packs" aria-pressed="' + (S.packMode === 'packs') + '">Kila pack ina stock yake</button></div>' : '') + '</div>';

    h += '<h3>3 · Bei ya jumla (wholesale) ' + badge('PROPOSED') + '</h3><p class="small muted">Sehemu moja ya bei ya jumla (uamuzi #6) badala ya prodProductType = wholesale, prodSaleMode = wholesale na prodWholesalePrice. Bei inashuka kulingana na idadi inayonunuliwa.</p>' +
      '<div class="tablewrap"><table><thead><tr><th>Inatumika kwa</th><th>Idadi ya chini</th><th>Bei kwa moja (TZS)</th><th></th></tr></thead><tbody>' +
      (S.tiers.length ? S.tiers.map(function (t, i) {
        return '<tr><td><select data-tier="' + i + '|ref" aria-label="Inatumika kwa"><option value="base"' + (t.ref === 'base' ? ' selected' : '') + '>' + esc(ul) + '</option>' + S.packs.map(function (p) { return '<option' + (t.ref === p.label ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join('') + '</select></td><td><input type="number" data-tier="' + i + '|min" value="' + esc(t.min) + '" style="width:80px" aria-label="Idadi ya chini"></td><td><input type="number" data-tier="' + i + '|price" value="' + esc(t.price) + '" style="width:110px" aria-label="Bei ya jumla"></td><td><button type="button" class="btn sm" data-tierdel="' + i + '">Ondoa</button></td></tr>';
      }).join('') : '<tr><td colspan="4" class="muted small">Hakuna bei ya jumla.</td></tr>') + '</tbody></table></div><div class="row"><button type="button" class="btn sm" data-act="addtier">+ Ongeza ngazi ya bei ya jumla</button></div>';

    var locs = effectiveLocs(), items = stockItems();
    h += '<h3>4 · Stock ya kuanzia kwa location</h3><p class="small muted">Kila kisanduku ni rekodi moja ya inventory: <span class="mono">business:location:product:variant:unit</span>. Inaandikwa na server pekee kupitia inventoryAdjust OPENING_BALANCE ' + badge('IMPLEMENTED') + '; location dimension ' + badge('PROPOSED') + '.</p>';
    if (!locs.length) h += '<p class="note red small">Chagua location kwanza.</p>';
    else h += '<div class="tablewrap"><table><thead><tr><th>Kipengee</th><th>Kitengo</th>' + locs.map(function (l) { return '<th>' + esc(l.name) + '</th>'; }).join('') + '<th>Jumla</th></tr></thead><tbody>' + items.map(function (it) {
      var tot = 0;
      var cells = locs.map(function (l) { var v = ((S.stock[it.key] || {})[l.id]); tot += Number(v) || 0; return '<td><input type="number" min="0" aria-label="Stock ' + esc(it.label) + ' ' + esc(l.name) + '" data-stock="' + esc(it.key) + '|' + l.id + '" value="' + esc(v == null ? '' : v) + '" style="width:90px"><div class="small muted mono">' + esc(invKey(l.id, it).split(':').slice(1).join(':')) + '</div></td>'; }).join('');
      return '<tr><td>' + esc(it.label) + '</td><td>' + esc(it.unit === 'pack' ? 'pack' : ul) + '</td>' + cells + '<td class="num"><b>' + fmt(tot) + '</b></td></tr>';
    }).join('') + '</tbody></table></div>';
    h += '<label class="f" for="b-low" style="max-width:220px">Tahadhari ya stock ndogo<input type="number" id="b-low" value="' + esc(S.low) + '"><span class="h">prodLowStockAlert ' + badge('IMPLEMENTED') + '</span></label>';
    return h + '</div>';
  }

  var DELIVERY = [
    { k: 'pickup', t: 'Mnunuzi anachukua kwenye location', s: 'PROPOSED', why: 'Inahitaji location yenye pickup (duka).' },
    { k: 'seller', t: 'Muuzaji anafikisha', s: 'PROPOSED' },
    { k: 'sokohai', t: 'Usafirishaji wa SokoHai', s: 'PARTIAL', why: 'Mfumo wa delivery upo; mpangilio kwa kila bidhaa haupo.' },
  ];
  function stepDelivery() {
    var locs = effectiveLocs(), canPick = locs.some(function (l) { return l.pickup; });
    return '<p class="small muted">Fulfilment ni namna mnunuzi wa marketplace anavyopata bidhaa. Ni tofauti na channel na tofauti na transfer ya stock kati ya locations.</p><div class="cards">' + DELIVERY.map(function (o) {
      var dis = o.k === 'pickup' && !canPick;
      return '<button type="button" class="card" data-delivery="' + o.k + '" aria-pressed="' + (S.delivery.indexOf(o.k) >= 0) + '"' + (dis ? ' aria-disabled="true"' : '') + '><b>' + esc(o.t) + '</b>' + (o.why ? '<span class="small">' + esc(o.why) + '</span>' : '') + (dis ? '<span class="small" style="color:var(--red)">Hakuna location yenye pickup kati ya ulizochagua.</span>' : '') + '<span>' + badge(o.s) + '</span></button>';
    }).join('') + '</div>' + (S.delivery.indexOf('pickup') >= 0 && canPick ? '<p class="small">Pickup inapatikana: ' + locs.filter(function (l) { return l.pickup; }).map(function (l) { return esc(l.name); }).join(', ') + '</p>' : '');
  }

  function stepReview(v) {
    var errs = v.e, keys = Object.keys(errs).filter(stepActive);
    var n = node();
    var h = '<div class="stack"><h3>Hali ya bidhaa (dhana tofauti na channel)</h3><div class="grid2">' +
      '<label class="f" for="b-pub">Publication status<select id="b-pub"' + (mkt() ? '' : ' disabled') + '>' + [['draft', 'Draft'], ['published', 'Published']].map(function (p) { return '<option value="' + p[0] + '"' + (S.publication === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') + '</select><span class="h">' + (mkt() ? 'Inahusu marketplace tu. ' : 'Haihusiki: hakuna marketplace (inahifadhiwa kama draft). ') + 'prodPublicationStatus ' + badge('IMPLEMENTED') + '</span></label>' +
      '<label class="f" for="b-avail">Availability<select id="b-avail">' + [['available', 'Inapatikana'], ['pre_order', 'Pre-order'], ['made_to_order', 'Inatengenezwa kwa oda'], ['hidden', 'Imefichwa']].map(function (p) { return '<option value="' + p[0] + '"' + (S.availability === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') + '</select><span class="h">“Imeisha” inatokana na stock, haichaguliwi. prodAvailabilityStatus ' + badge('IMPLEMENTED') + '</span></label></div>';
    h += '<div class="grid2">' + kvBox('Aina', isSvc() ? 'Huduma' : 'Bidhaa (' + (S.nature === 'physical' ? 'inashikika' : 'kidijitali') + ')') + kvBox('Uainishaji', S.other ? S.other.text + ' (pendekezo)' : n ? plain(n) : '—') + kvBox('Channels', channelList().join(' + ') || '—') +
      (isSvc() ? kvBox('Eneo', S.svc.area || '—') : kvBox('Locations', effectiveLocs().map(function (l) { return l.name; }).join(', ') || '—')) +
      (isSvc() ? kvBox('Bei', S.svc.model === 'quote' ? 'Quote' : 'TZS ' + fmt(S.price)) : kvBox('Bei', (Number(S.basePrice) > 0 ? 'TZS ' + fmt(S.basePrice) + ' / ' + ((unitById(S.unit) || {}).label || '') : '') + (S.packs.length ? ' · packs ' + S.packs.length : '') + (S.tiers.length ? ' · jumla ' + S.tiers.length : ''))) + '</div>';
    if (v.warn.location) h += '<div class="note small">' + esc(v.warn.location) + '</div>';
    h += keys.length ? '<div class="note red"><b>Bado vinakosekana:</b><ul class="errs">' + keys.map(function (k) { return errs[k].map(function (m) { return '<li><a href="#builder" data-gostep="' + k + '">' + esc(STEPS.find(function (s) { return s.k === k; }).t) + '</a>: ' + esc(m) + '</li>'; }).join(''); }).join('') + '</ul></div>' : '<p class="note blue">Kila kinachohitajika kimejazwa.</p>';
    var label2 = isSvc() ? (mkt() ? 'Chapisha Huduma Hub' : 'Hifadhi binafsi') : manageOnly() ? 'Hifadhi (kusimamia tu)' : mkt() && S.publication === 'published' ? (pos() ? 'Chapisha + weka kwenye POS' : 'Chapisha') : pos() ? 'Hifadhi na weka kwenye POS' : 'Hifadhi';
    h += '<div class="row"><button type="button" class="btn" data-act="draft">Hifadhi kama draft</button><button type="button" class="btn pri" data-act="publish"' + (keys.length ? ' disabled' : '') + '>' + label2 + '</button></div>';
    if (saved.length) h += '<div class="stack"><h3>Zilizohifadhiwa kwenye preview hii</h3>' + saved.map(function (s) { return '<div class="small">' + esc(s.at) + ' · <b>' + esc(s.name) + '</b> · ' + esc(s.status) + (s.proposalId ? ' · pendekezo ' + esc(s.proposalId) : '') + '</div>'; }).join('') + '</div>';
    return h + '</div>';
  }
  var kvBox = function (k, v) { return '<div><div class="eyebrow">' + esc(k) + '</div><div><b>' + esc(v) + '</b></div></div>'; };

  function record() {
    var n = node(), c = classNode();
    var tn = S.other ? (c ? 'OTHER-' + c.id : null) : (n ? n.id : null);
    var leaf = leafOf(c || n), cat = catOf(c || n);
    var pathIds = (c || n) ? path(c || n).map(function (x) { return x.id; }) : [];
    if (isSvc()) {
      return {
        legacy_IMPLEMENTED: { collection: 'services', title: S.name, category: cat ? cat.id : null, subCategory: leaf ? leaf.en : null, pricingModel: S.svc.model, price: S.svc.model === 'quote' ? 0 : Number(S.price) || 0, travelAvailable: S.svc.travel, location: S.svc.area },
        proposed: { entry: 'seller_entry_v1', taxonomyNodeId: tn, taxonomyPath: pathIds, classificationState: S.other ? 'OTHER_PRODUCT_TYPE' : 'CANONICAL', otherText: S.other ? S.other.text : undefined, serviceMode: S.svc.mode, visibility: S.ch.marketplace ? 'hub' : 'private', inventory: null, pos: null },
      };
    }
    var locs = effectiveLocs(), items = stockItems(), u = unitById(S.unit);
    var retail = Number(S.basePrice) || Number((S.packs[0] || {}).price) || 0;
    var ws = S.tiers.length ? Number(S.tiers[0].price) : 0;
    return {
      legacy_IMPLEMENTED: {
        collection: 'products', title: S.name, category: cat ? cat.id : null, subCategory: leaf && leaf.l >= 2 ? leaf.en : null,
        productType: S.nature, isOnline: S.ch.marketplace, isOffline: !!pos(),
        publicationStatus: S.ch.marketplace ? S.publication : 'draft', availabilityStatus: S.availability,
        condition: S.cond['ATTR-CONDITION'] || null, price: retail, buyPrice: Number(S.cost) || 0, wholesalePrice: ws,
        baseUnit: legacyUnitName(S.unit), storeId: (LOCS[S.fulfil] || locs[0] || {}).type === 'store' ? (S.fulfil || locs[0].id) : null,
        stock: 0, openingStockPending: true,
      },
      proposed: {
        salesChannels: channelList(), nature: S.nature, taxonomyNodeId: tn, taxonomyPath: pathIds,
        classificationState: S.other ? 'OTHER_PRODUCT_TYPE' : 'CANONICAL', otherText: S.other ? S.other.text : undefined,
        publicationStatus: S.ch.marketplace ? S.publication : 'not_applicable', availabilityStatus: S.availability,
        locations: locs.map(function (l) { return { locationId: l.id, type: l.type, pos: !!(pos() && (l.pos || l.type === 'default')), marketplace: S.ch.marketplace && (locs.length === 1 || S.fulfil === l.id), pickup: l.pickup && S.delivery.indexOf('pickup') >= 0, autoCreated: l.id === 'loc-default' || undefined }; }),
        fulfilment: S.ch.marketplace ? { marketplaceLocationId: S.fulfil || (locs[0] || {}).id || null, options: S.delivery.slice() } : null,
        pricing: { currency: 'TZS', baseUnit: S.unit || null, unitGroup: u ? u.group : null, contentQuantity: S.content ? Number(S.content) : undefined, contentUnit: S.content ? S.contentUnit : undefined, basePrice: Number(S.basePrice) || null, packs: S.packs.map(function (p) { return { label: p.label, contentQty: Number(p.content), contentUnit: S.unit, price: Number(p.price), stockMode: S.packMode }; }), wholesaleTiers: S.tiers.map(function (t) { return { appliesTo: t.ref, minQty: Number(t.min), unitPrice: Number(t.price) }; }) },
        variants: combos().map(function (r) { var vr = S.vrows[r.key] || {}; return { variantId: 'v-' + norm(r.key).replace(/ /g, '-'), sku: vr.sku || skuFor(r.key), options: Object.fromEntries(r.opts) }; }),
        inventory: locs.reduce(function (acc, l) { items.forEach(function (it) { acc.push({ inventoryKey: invKey(l.id, it), businessId: BIZ, locationId: l.id, variantId: it.variantId, unitId: it.unit === 'pack' ? 'pack' : S.unit, openingQty: Number((S.stock[it.key] || {})[l.id]) || 0, writer: 'server: inventoryAdjust OPENING_BALANCE' }); }); return acc; }, []),
      },
    };
  }
  function legacyUnitName(id) { var m = (D.unitLegacy || []).find(function (x) { return x.source === 'sellerForm.prodBaseUnit' && x.unitId === id; }); return m ? m.legacy : (id || null); }

  function deps(v) {
    var locs = effectiveLocs();
    var rows = [
      [mkt(), 'Marketplace → maelezo + picha + category ni lazima', 'IMPLEMENTED', '1'],
      [manageOnly(), 'Kusimamia tu → haionekani marketplace wala POS', 'PROPOSED', '1'],
      [pos(), 'POS → location halali (duka); wa zamani: location ya msingi + onyo', 'PROPOSED', '1'],
      [mkt() && pos(), 'Marketplace + POS kutoka location moja → stock moja', 'PARTIAL', '3'],
      [mkt() && physical(), 'Oda ya online → reserve → confirm/expire/cancel, idempotent', 'PROPOSED', '3'],
      [pos(), 'Mauzo ya POS → posSale (server) inapunguza stock', 'IMPLEMENTED', '1'],
      [locs.length > 1, 'Locations nyingi → stock kwa kila location + location ya marketplace', 'PROPOSED', '4'],
      [S.packs.length > 0, 'Pack sizes → bei kwa pack; stock kutoka base au kwa pack', 'PROPOSED', '2'],
      [S.tiers.length > 0, 'Bei ya jumla → sehemu moja, bei < rejareja', 'PROPOSED', '2'],
      [!!(unitById(S.unit) && !unitById(S.unit).ok), 'Kitengo kisichobadilishika → ukubwa ni lazima', 'PROPOSED', '2'],
      [combos().length > 0, 'Variants → SKU + stock kwa kila mchanganyiko × location', 'PARTIAL', '1/4'],
      [S.delivery.indexOf('pickup') >= 0, 'Pickup → location yenye pickup', 'PROPOSED', '5'],
      [!!(classNode() && regList(classNode()).length), 'Inadhibitiwa → usajili/leseni + ukaguzi', 'PROPOSED', '1'],
      [!!S.other, 'Nyingine (Taja) → pendekezo kwa admin', 'PROPOSED', '1'],
    ];
    return rows.map(function (r) { return '<span class="' + (r[0] ? 'ok' : 'no') + '">' + (r[0] ? '✓' : '–') + '</span><span' + (r[0] ? '' : ' class="muted"') + '>' + esc(r[1]) + ' ' + badge(r[2]) + ' <span class="small muted">Awamu ' + r[3] + '</span></span>'; }).join('');
  }

  function renderBuilder() {
    if (!stepActive(S.step)) S.step = 'review';
    var v = validate(), errs = v.e;
    renderSteps(errs);
    var a = activeSteps(), idx = a.findIndex(function (x) { return x.k === S.step; });
    var s = STEPS.find(function (x) { return x.k === S.step; });
    var body = { kind: stepKind, find: stepFind, confirm: stepConfirm, basic: stepBasic, channel: stepChannel, location: stepLocation, specs: stepSpecs, price: stepPrice, delivery: stepDelivery, review: function () { return stepReview(v); } }[s.k]();
    var sc = S.scenario ? D.scenarios.find(function (x) { return x.key === S.scenario; }) : null;
    $('stepPanel').innerHTML = '<div class="mprog" aria-hidden="true">' + a.map(function (x, i) { return '<i class="' + (i <= idx ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
      '<div class="stephead"><div><div class="eyebrow">Hatua ' + (idx + 1) + ' kati ya ' + a.length + (a.length < STEPS.length ? ' (' + (STEPS.length - a.length) + ' zimerukwa)' : '') + (sc ? ' · ' + esc(sc.biz) : '') + '</div><h2>' + esc(s.t) + '</h2></div>' +
      '<span class="chip ' + (isSvc() ? 'svc' : 'prd') + '">' + (isSvc() ? 'Huduma' : 'Bidhaa') + '</span></div>' + body +
      (errs[s.k] && s.k !== 'review' ? '<ul class="errs">' + errs[s.k].map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="nav"><button type="button" class="btn" data-act="prev"' + (idx === 0 ? ' disabled' : '') + '>← Nyuma</button>' + (idx < a.length - 1 ? '<button type="button" class="btn pri" data-act="next">Endelea →</button>' : '') + '</div>';
    $('record').textContent = JSON.stringify(record(), null, 1);
    $('deps').innerHTML = deps(v);
    $('scenarios').innerHTML = '<span class="small muted" style="align-self:center">Biashara za mfano:</span>' + D.scenarios.map(function (x) { return '<button type="button" class="btn sm' + (S.scenario === x.key ? ' pri' : '') + '" data-scenario="' + x.key + '" title="' + esc(x.title) + '">' + esc(x.biz) + '</button>'; }).join('');
  }

  function onBuilderClick(e) {
    var t = e.target.closest('button, a'); if (!t) return;
    if (t.dataset.step) { S.step = t.dataset.step; return renderBuilder(); }
    if (t.dataset.scenario) return loadScenario(t.dataset.scenario);
    if (t.dataset.kind) { if (S.kind !== t.dataset.kind) { var k = t.dataset.kind; S = fresh(); S.kind = k; } return renderBuilder(); }
    if (t.dataset.nature) { S.nature = t.dataset.nature; if (S.nature === 'digital') { S.ch.pos = false; S.delivery = []; } return renderBuilder(); }
    if (t.dataset.pick) { S.nodeId = t.dataset.pick; S.other = null; var pn = byId.get(S.nodeId); if (pn && pn.t === 'service' && S.kind !== 'service') S.kind = 'service'; return renderBuilder(); }
    if (t.dataset.otherparent) { S.other.parentId = t.dataset.otherparent; return renderBuilder(); }
    if (t.dataset.browse) { var l = Number(t.dataset.browse); S.browse[l] = t.dataset.id; for (var j = l + 1; j < 4; j++) S.browse[j] = null; if (S.other && l >= 1) S.other.parentId = leafOf(byId.get(t.dataset.id)).id; return renderBuilder(); }
    if (t.dataset.ch) {
      S.chSet = true;
      if (t.dataset.ch === 'manage') S.ch = { marketplace: false, pos: false };
      else { if (t.dataset.ch === 'pos' && S.nature === 'digital') { toast('Bidhaa ya kidijitali haiuzwi kwa POS.'); return; } S.ch[t.dataset.ch] = !S.ch[t.dataset.ch]; }
      if (!S.ch.marketplace) S.delivery = [];
      return renderBuilder();
    }
    if (t.dataset.svcch) { S.chSet = true; S.ch = { marketplace: t.dataset.svcch === 'hub', pos: false }; return renderBuilder(); }
    if (t.dataset.legacy) { S.legacySeller = t.dataset.legacy === '1'; if (S.legacySeller) { S.sellerLocs = []; S.locs = []; S.fulfil = ''; } else if (!S.sellerLocs.length) { S.sellerLocs = ['st-a']; } return renderBuilder(); }
    if (t.dataset.loc) { var id = t.dataset.loc, ix = S.locs.indexOf(id); if (ix >= 0) S.locs.splice(ix, 1); else S.locs.push(id); if (S.locs.indexOf(S.fulfil) < 0) S.fulfil = S.locs.length === 1 ? S.locs[0] : ''; if (S.locs.length === 1) S.fulfil = S.locs[0]; S.delivery = S.delivery.filter(function (d) { return d !== 'pickup' || effectiveLocs().some(function (x) { return x.pickup; }); }); return renderBuilder(); }
    if (t.dataset.svcmode) { S.svc.mode = t.dataset.svcmode; return renderBuilder(); }
    if (t.dataset.saleby) { S.saleBy = t.dataset.saleby; S.unit = S.saleBy === 'count' ? 'head' : 'kg'; return renderBuilder(); }
    if (t.dataset.packmode) { S.packMode = t.dataset.packmode; S.stock = {}; return renderBuilder(); }
    if (t.dataset.packdel) { var removed = S.packs.splice(Number(t.dataset.packdel), 1)[0]; S.tiers = S.tiers.filter(function (x) { return x.ref !== (removed || {}).label; }); return renderBuilder(); }
    if (t.dataset.tierdel) { S.tiers.splice(Number(t.dataset.tierdel), 1); return renderBuilder(); }
    if (t.dataset.delivery) { if (t.getAttribute('aria-disabled') === 'true') { toast('Pickup inahitaji location yenye pickup (duka).'); return; } var dk = t.dataset.delivery, di = S.delivery.indexOf(dk); if (di >= 0) S.delivery.splice(di, 1); else S.delivery.push(dk); return renderBuilder(); }
    if (t.dataset.gostep) { e.preventDefault(); return goStep(t.dataset.gostep); }
    var act = t.dataset.act;
    if (act === 'prev') return moveStep(-1);
    if (act === 'next') return moveStep(1);
    if (act === 'addpack') { S.packs.push({ label: 'Pack ' + (S.packs.length + 1), content: '', price: '' }); return renderBuilder(); }
    if (act === 'addtier') { S.tiers.push({ ref: S.packs.length ? S.packs[S.packs.length - 1].label : 'base', min: 10, price: '' }); return renderBuilder(); }
    if (act === 'other') { var top = S.q ? search(S.q, S.kind, 1)[0] : null, cur = node(); S.other = { text: S.q || '', parentId: top ? leafOf(top).id : cur ? leafOf(cur).id : (S.browse[1] || null) }; S.nodeId = null; return renderBuilder(); }
    if (act === 'draft' || act === 'publish') return saveFromBuilder(act);
  }
  function saveFromBuilder(act) {
    var pid = null;
    if (S.other) { var p = submitProposal({ text: S.other.text, parentId: S.other.parentId, kind: 'type', by: 'muuzaji (preview)', product: S.name }); pid = p ? p.id : null; }
    var status = act === 'draft' ? 'draft' : isSvc() ? (mkt() ? 'imechapishwa Huduma Hub' : 'binafsi') : channelList().join(' + ');
    saved.unshift({ at: new Date().toLocaleTimeString('sw-TZ'), name: S.name || '(bila jina)', status: status, proposalId: pid });
    toast((act === 'draft' ? 'Draft imehifadhiwa' : 'Imehifadhiwa: ' + status) + (pid ? ' · pendekezo ' + pid + ' kwa admin' : '') + '. Hakuna kilichotumwa Firebase.');
    renderBuilder(); renderQueue();
  }
  function refreshSide() { $('record').textContent = JSON.stringify(record(), null, 1); var v = validate(); $('deps').innerHTML = deps(v); renderSteps(v.e); }
  function onBuilderInput(e) {
    var t = e.target, v = t.value;
    if (t.id === 'b-q') { S.q = v; var pos0 = t.selectionStart; renderBuilder(); var q = $('b-q'); if (q) { q.focus(); q.setSelectionRange(pos0, pos0); } return; }
    if (t.id === 'b-other') { S.other.text = v; return; }
    if (t.id === 'b-name') S.name = v;
    else if (t.id === 'b-desc') S.desc = v;
    else if (t.id === 'b-area') S.svc.area = v;
    else if (t.id === 'b-price') S.price = v;
    else if (t.id === 'b-baseprice') S.basePrice = v;
    else if (t.id === 'b-cost') S.cost = v;
    else if (t.id === 'b-low') S.low = v;
    else if (t.id === 'b-content') S.content = v;
    else if (t.dataset.attr) S.attrs[t.dataset.attr] = v;
    else if (t.dataset.cond) S.cond[t.dataset.cond] = v;
    else if (t.dataset.pack) { var pp = t.dataset.pack.split('|'), pk = S.packs[Number(pp[0])], old = pk.label; pk[pp[1]] = v; if (pp[1] === 'label') S.tiers.forEach(function (x) { if (x.ref === old) x.ref = v; }); }
    else if (t.dataset.tier) { var tp = t.dataset.tier.split('|'); S.tiers[Number(tp[0])][tp[1]] = v; }
    else if (t.dataset.stock) {
      var parts = t.dataset.stock.split('|'); (S.stock[parts[0]] = S.stock[parts[0]] || {})[parts[1]] = Number(v) || 0;
      var row = t.closest('tr'); if (row) { var tot = 0; row.querySelectorAll('input[data-stock]').forEach(function (x) { tot += Number(x.value) || 0; }); row.lastElementChild.innerHTML = '<b>' + fmt(tot) + '</b>'; }
    } else return;
    refreshSide();
  }
  function onBuilderChange(e) {
    var t = e.target;
    if (t.id === 'b-q') return;
    if (t.id === 'b-other' || t.dataset.pack || t.dataset.tier) return renderBuilder();
    if (t.id === 'b-img') { Array.prototype.slice.call(t.files || [], 0, 6).forEach(function (f) { var r = new FileReader(); r.onload = function () { S.images.push(r.result); renderBuilder(); }; r.readAsDataURL(f); }); return; }
    if (t.id === 'b-unit') S.unit = t.value;
    else if (t.id === 'b-cunit') S.contentUnit = t.value;
    else if (t.id === 'b-fulfil') S.fulfil = t.value;
    else if (t.id === 'b-model') S.svc.model = t.value;
    else if (t.id === 'b-travel') S.svc.travel = t.checked;
    else if (t.id === 'b-hasvar') S.hasVar = t.checked;
    else if (t.id === 'b-pub') S.publication = t.value;
    else if (t.id === 'b-avail') S.availability = t.value;
    else if (/^b-(content|baseprice|cost|price|low|name|desc|area)$/.test(t.id)) { /* value already stored on input; re-render to show validation */ }
    else if (t.dataset.axis) { if (t.checked) { var d = defFor(classNode() || node()); S.axes[t.dataset.axis] = d && d.def.o[t.dataset.axis] ? d.def.o[t.dataset.axis].slice(0, 3) : []; } else delete S.axes[t.dataset.axis]; }
    else if (t.dataset.axisvals) S.axes[t.dataset.axisvals] = t.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    else if (t.dataset.attr || t.dataset.cond) { onBuilderInput(e); return renderBuilder(); }
    else return;
    renderBuilder();
  }
