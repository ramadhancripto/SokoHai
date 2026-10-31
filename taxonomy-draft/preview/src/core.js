  'use strict';
  var D = window.SKH_DATA;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var $ = function (id) { return document.getElementById(id); };
  var norm = function (s) { return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); };
  var fmt = function (n) { return (Number(n) || 0).toLocaleString('en-US'); };
  var badge = function (s) { return '<span class="st st-' + s + '">' + s + '</span>'; };

  /* ---------- taxonomy model ---------- */
  var LV = ['Sekta', 'Category', 'Subcategory', 'Sub-subcategory', 'Aina'];
  var LVS = ['S', 'C', 'SC', 'SS', 'T'];
  var N = D.nodes.map(function (r, i) {
    return { i: i, id: r[0], p: r[1], l: r[2], sw: r[3], en: r[4], t: r[5], o: r[6], st: r[7], reg: r[8] ? r[8].split(' ') : [], al: r[9] ? r[9].split('|') : [], d: r[10] || '' };
  });
  var byId = new Map();
  var kids = [];
  function index() {
    byId = new Map(N.map(function (n) { return [n.id, n]; }));
    kids = N.map(function () { return []; });
    N.forEach(function (n) { if (n.p >= 0) kids[n.p].push(n.i); });
    N.forEach(function (n) { n.q = norm(n.sw + ' ' + n.en + ' ' + n.al.join(' ') + ' ' + n.id); });
  }
  index();
  var par = function (n) { return n && n.p >= 0 ? N[n.p] : null; };
  function path(n) { var out = []; while (n) { out.unshift(n); n = par(n); } return out; }
  function catOf(n) { return path(n).find(function (x) { return x.l === 1; }) || null; }
  function leafOf(n) { if (!n) return null; if (n.l === 4) return par(n); return n; }
  var isOther = function (n) { return n.o === 'SYSTEM'; };
  var label = function (n) { return n.sw === n.en ? n.sw : n.sw + ' <span class="muted">/ ' + esc(n.en) + '</span>'; };
  var plain = function (n) { return n.sw === n.en ? n.sw : n.sw + ' / ' + n.en; };
  function pathHtml(n) { return '<div class="path">' + path(n).map(function (x) { return '<span>' + esc(x.sw) + '</span>'; }).join('') + '</div>'; }
  function regChips(n) {
    var flags = {}; path(n).forEach(function (x) { x.reg.forEach(function (f) { flags[f] = 1; }); });
    return Object.keys(flags).map(function (f) { return '<span class="chip reg" title="' + esc((D.reg[f] || {}).en || '') + '">' + esc(f) + '</span>'; }).join(' ');
  }
  function regList(n) { var flags = {}; path(n).forEach(function (x) { x.reg.forEach(function (f) { flags[f] = 1; }); }); return Object.keys(flags); }
  function kindOk(n, kind) { return !kind || n.t === kind || n.t === 'both'; }
  function defFor(n) {
    var p = path(n);
    for (var i = p.length - 1; i >= 0; i--) { if (D.defs[p[i].id]) return { def: D.defs[p[i].id], at: p[i] }; }
    return null;
  }
  function familyOf(n) {
    var c = catOf(n); if (!c) return null;
    for (var k in D.families) { if (D.families[k].cats.indexOf(c.id) >= 0) return { key: k, f: D.families[k] }; }
    return null;
  }

  function search(q, kind, limit) {
    var nq = norm(q); if (nq.length < 2) return [];
    var toks = nq.split(' ');
    var res = [];
    N.forEach(function (n) {
      if (n.l < 2 || isOther(n) || n.st === 'INACTIVE' || n.st === 'MERGED' || !kindOk(n, kind)) return;
      var s = 0, a = norm(n.sw), b = norm(n.en);
      if (a === nq || b === nq) s += 100;
      else if (a.indexOf(nq) === 0 || b.indexOf(nq) === 0) s += 60;
      else if (a.indexOf(nq) >= 0 || b.indexOf(nq) >= 0) s += 40;
      var all = true;
      toks.forEach(function (t) { if (n.q.indexOf(t) >= 0) s += 12; else all = false; });
      if (!all) return;
      if (n.al.some(function (x) { return norm(x).indexOf(nq) >= 0; })) s += 8;
      s += n.l === 4 ? 6 : 0;
      s -= Math.min(10, a.length / 8);
      res.push({ n: n, s: s });
    });
    res.sort(function (x, y) { return y.s - x.s; });
    return res.slice(0, limit || 8).map(function (r) { return r.n; });
  }

  /* ---------- shared session state (memory only) ---------- */
  var proposals = [];
  var history = [];
  var saved = [];
  var seq = 1;
  function log(action, nodeId, detail, actor) { history.unshift({ at: new Date().toLocaleTimeString('sw-TZ'), action: action, nodeId: nodeId, detail: detail, actor: actor || 'admin (preview)' }); renderLog(); }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 3200); }

