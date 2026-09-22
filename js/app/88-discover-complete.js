/**
 * 88-discover-complete.js — COMPLETE DISCOVER SYSTEM (REBUILD)
 * 
 * Jenga overlay YAKE MENYENYE — haitumii 75's buildOverlay/renderHome.
 * Inatumia 75's universalSearch kwa data tu.
 * 
 * Kulingana na prototype HTML iliyotolewa na user.
 */
import { skh } from './00-bootstrap.js';

(function() {
  'use strict';
  if (window.__skhDiscoverComplete88) return;
  window.__skhDiscoverComplete88 = true;

  // ═══════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════
  var esc = function(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); };
  var T = function(sw,en){ try{return(window.SokoHaiLMS&&window.SokoHaiLMS.lang==='en')?en:sw;}catch(e){return sw;} };
  var uid = function(){ return (skh.currentUser&&skh.currentUser.uid)||''; };
  var $ = function(id){ return document.getElementById(id); };

  // ═══════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════
  var S = {
    entity: 'Zote',
    query: '',
    view: 'home',       // home | detail
    detail: null,
    applied: {},         // { section: [values] }
    draft: {},
    sections: null,      // last search results
    timer: null,
    history: []          // navigation stack
  };

  // ═══════════════════════════════════════════════════════════════
  // ENTITY TABS
  // ═══════════════════════════════════════════════════════════════
  var TABS = [
    ['Zote','🌐'],['Bidhaa','🛍️'],['Huduma','🔧'],['Watu','👥'],
    ['Wasafirishaji','🚚'],['Biashara','🏪'],['Wauzaji','🧑‍💼'],
    ['Vikundi','👨‍👩‍👧‍👦'],['Interests','💡']
  ];

  var ENT_MAP = {
    'Bidhaa':'products','Huduma':'services','Watu':'people',
    'Wasafirishaji':'transporters','Biashara':'businesses',
    'Wauzaji':'businesses','Vikundi':'groups','Interests':'interests'
  };

  var TYPE_MAP = {
    'Bidhaa':['PRODUCT'],'Huduma':['SERVICE'],'Watu':['PERSON'],
    'Wasafirishaji':['TRANSPORTER'],'Biashara':['BUSINESS'],
    'Wauzaji':['BUSINESS','PERSON'],'Vikundi':['GROUP']
  };

  // ═══════════════════════════════════════════════════════════════
  // FILTER DEFINITIONS
  // ═══════════════════════════════════════════════════════════════
  var FDEFS = {
    'Zote': [
      ['Mahali',['Karibu nami','1km','5km','10km','25km','100km']],
      ['Aina ya Entity',['Bidhaa','Huduma','Watu','Biashara','Wauzaji','Wasafirishaji','Vikundi','Interests']],
      ['Uthibitisho',['Verified','Wote']],
      ['Shughuli',['Mpya','Maarufu','Trending','Active']],
      ['Panga',['Umuhimu','Karibu zaidi','Mpya zaidi','Maarufu']]
    ],
    'Bidhaa': [
      ['Mahali',['Karibu nami','100m','500m','1km','5km','10km','25km','45km','100km']],
      ['Kategoria',['Chakula','Electronics','Fashion','Kilimo','Beauty','Ujenzi','Magari','Furniture']],
      ['Muuzaji',['Individual','Biashara','Offline','Wholesaler','Manufacturer','Verified']],
      ['Bei',['Chini ya 10k','10k-50k','50k-100k','100k-500k','500k+']],
      ['Upatikanaji',['In Stock','Delivery','Pickup','Online Ordering']],
      ['Biashara',['Online','Offline','Zote mbili']],
      ['Ushiriki',['Liked','Saved','Followed','Reviewed']],
      ['Vikundi',['Group Buy','Group Order','Inajadiliwa']],
      ['Panga',['Umuhimu','Karibu','Mpya','Bei ↓','Bei ↑','Maarufu']]
    ],
    'Huduma': [
      ['Mahali',['Karibu nami','1km','5km','10km','25km','100km']],
      ['Kategoria',['Beauty','Ushonaji','Usafiri','Repair','Elimu','Professional']],
      ['Mtoa huduma',['Individual','Biashara','Company','Verified']],
      ['Upatikanaji',['Available Now','Available','Scheduled']],
      ['Bei',['Fixed','Negotiable','Chini ya 20k','20k-100k','100k+']],
      ['Aina',['Online','Physical','Zote mbili']],
      ['Booking',['Instant','Booking','Contact','Chat']],
      ['Panga',['Umuhimu','Karibu','Mpya','Bei ↓','Reviewed']]
    ],
    'Watu': [
      ['Mahali',['Karibu nami','1km','5km','10km','25km']],
      ['Uhusiano',['Mutual','Following','Followers']],
      ['Interests',['Mchele','Kilimo','Fashion','Electronics','Usafiri']],
      ['Vikundi',['Same Group','Related Group']],
      ['Shughuli',['Recently Active','Public Activity']],
      ['Panga',['Umuhimu','Karibu','Active','Followed']]
    ],
    'Wasafirishaji': [
      ['Mahali',['Karibu nami','1km','5km','10km','25km']],
      ['Usafiri',['Delivery','Passenger','Cargo']],
      ['Gari',['Bodaboda','Bajaji','Car','Van','Pickup','Truck']],
      ['Upatikanaji',['Available Now','Available','Scheduled']],
      ['Eneo',['Local','Regional','Long Distance']],
      ['Bei',['Chini ya 5k','5k-20k','20k+']],
      ['Uthibitisho',['Verified','Wote']],
      ['Panga',['Umuhimu','Karibu','Bei ↓','Reviewed']]
    ],
    'Biashara': [
      ['Kategoria',['Chakula','Electronics','Fashion','Retail','Wholesale','Huduma']],
      ['Mahali',['Karibu nami','1km','5km','10km','25km']],
      ['Aina',['Online','Offline','Zote mbili']],
      ['Bidhaa',['Mchele','Simu','Mavazi','Kilimo']],
      ['Huduma',['Delivery','Pickup','Online Ordering','Contact']],
      ['Uthibitisho',['Verified','Wote']],
      ['Ushiriki',['Followed','Liked','Saved','Reviewed']],
      ['Panga',['Umuhimu','Karibu','Mpya','Maarufu']]
    ],
    'Wauzaji': [
      ['Aina',['Individual','Biashara','Offline','Online','Wholesale','Manufacturer']],
      ['Mahali',['Karibu nami','1km','5km','10km','25km']],
      ['Bidhaa',['Mchele','Simu','Mavazi','Kilimo']],
      ['Biashara',['Online Ordering','Offline','Pickup','Delivery','Chat']],
      ['Bei',['Retail','Wholesale','Fixed','Negotiable']],
      ['Uthibitisho',['Verified','Wote']],
      ['Panga',['Umuhimu','Karibu','Mpya','Maarufu']]
    ],
    'Vikundi': [
      ['Aina',['Community','Discussion','Group Buy','Group Order']],
      ['Mada',['Product','Service','Biashara','Usafiri','Interest']],
      ['Mahali',['Karibu nami','1km','5km','10km','25km']],
      ['Visibility',['Public','Discoverable','Joinable']],
      ['Shughuli',['Active','Recently Active','New']],
      ['Wanachama',['Chini ya 100','100-500','500-1000','1000+']],
      ['Panga',['Umuhimu','Karibu','Active','Mpya']]
    ],
    'Interests': [
      ['Kategoria',['Chakula','Kilimo','Fashion','Electronics','Biashara','Usafiri']],
      ['Uhusiano',['Products','Services','Biashara','Vikundi','Watu']],
      ['Shughuli',['Maarufu','Trending','Karibu','Recently Active']],
      ['Ushiriki',['Most Followed','Most Engaged']],
      ['Panga',['Umuhimu','Maarufu','Trending','Karibu']]
    ]
  };

  // ═══════════════════════════════════════════════════════════════
  // CSS
  // ═══════════════════════════════════════════════════════════════
  function injectCSS(){
    if($('dc88-css')) return;
    var s=document.createElement('style');
    s.id='dc88-css';
    s.textContent=`
/* OVERLAY */
#skhDiscoverEngine{position:fixed;inset:0;z-index:10000;background:#F6F9FC;display:none;flex-direction:column;font-family:Inter,Arial,sans-serif;color:#17324D}
#skhDiscoverEngine.open{display:flex}
/* HEADER */
.dc88-header{background:#fff;border-bottom:1px solid #E5EDF4;padding:14px 16px;flex-shrink:0}
.dc88-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.dc88-logo{display:flex;align-items:center;gap:8px;font-weight:800;color:#18A982;font-size:18px}
.dc88-logo-mark{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#18A982,#18A982);color:#fff;display:grid;place-items:center;font-weight:900;font-size:14px}
.dc88-title{font-size:20px;font-weight:800;color:#17324D}
.dc88-close-btn{width:36px;height:36px;border-radius:50%;background:#F1F5F8;color:#536A7B;border:0;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;font-weight:700;line-height:1}
.dc88-close-btn:hover{background:#E5EBEF;color:#D32F2F}
.dc88-close-btn:active{transform:scale(.9)}
.dc88-subtitle{color:#718096;font-size:12px;margin-top:2px}
/* SEARCH */
.dc88-search{display:flex;align-items:center;background:#F1F6FA;border:1px solid #E5EDF4;border-radius:14px;padding:0 12px;height:46px;gap:8px}
.dc88-search-icon{color:#18A982;font-size:18px}
.dc88-search input{flex:1;border:0;outline:0;background:transparent;color:#17324D;font-size:14px}
.dc88-search button{background:#18A982;color:#fff;border:0;border-radius:10px;padding:7px 12px;font-weight:700;font-size:12px;cursor:pointer;transition:background .15s}
.dc88-search button:hover{background:#17604E}
.dc88-search button:active{background:#083D5C}
/* TABS */
.dc88-tabs{display:flex;gap:6px;overflow-x:auto;padding:12px 0 4px;scrollbar-width:none}
.dc88-tabs::-webkit-scrollbar{display:none}
.dc88-tab{flex:0 0 auto;padding:8px 13px;border-radius:999px;background:#fff;border:1px solid #E5EDF4;color:#587086;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .15s}
.dc88-tab:hover{border-color:#B9DDF1;background:#F0F8FD;color:#18A982}
.dc88-tab:active{background:#E7F3FB;transform:scale(.97)}
.dc88-tab.active{background:#E7F3FB;color:#18A982;border-color:#B9DDF1;font-weight:700}
/* BODY */
.dc88-body{flex:1;overflow-y:auto;padding:16px}
/* TOOLBAR */
.dc88-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.dc88-filter-btn{display:flex;align-items:center;gap:7px;background:#fff;border:1px solid #E5EDF4;padding:10px 14px;border-radius:12px;color:#18A982;font-weight:700;font-size:12px;cursor:pointer;box-shadow:0 4px 15px rgba(17,56,84,.06);transition:all .15s}
.dc88-filter-btn:hover{background:#F0F8FD;border-color:#B9DDF1;box-shadow:0 6px 20px rgba(17,56,84,.1)}
.dc88-filter-btn:active{transform:scale(.97)}
.dc88-filter-count{background:#18A982;color:#fff;min-width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800}
.dc88-result-info{color:#718096;font-size:12px}
/* CHIPS */
.dc88-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.dc88-chip{background:#E8F6F1;color:#087B5A;border:1px solid #C9EBDD;padding:5px 9px;border-radius:999px;font-size:11px;display:inline-flex;align-items:center;gap:4px;font-weight:600;transition:all .15s}
.dc88-chip:hover{background:#D0EBE0;border-color:#A9DCCB}
.dc88-chip button{background:none;border:0;color:#087B5A;font-weight:800;cursor:pointer;font-size:13px;line-height:1;transition:all .15s;padding:0 2px;border-radius:50%}
.dc88-chip button:hover{color:#D32F2F;background:rgba(211,47,47,.1)}
/* RESULTS */
.dc88-results{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
/* SECTION */
.dc88-section{margin-bottom:20px}
.dc88-section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.dc88-section-head h3{font-size:14px;font-weight:800;color:#17324D}
.dc88-section-head span{font-size:11px;color:#18A982;font-weight:600}
/* CARDS */
.dc88-card{background:#fff;border:1px solid #E5EDF4;border-radius:16px;overflow:hidden;box-shadow:0 4px 15px rgba(17,56,84,.05);cursor:pointer;transition:transform .15s,box-shadow .15s}
.dc88-card:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(17,56,84,.1)}
.dc88-card-img{height:130px;background:#DDEAF1;position:relative;overflow:hidden}
.dc88-card-img img{width:100%;height:100%;object-fit:cover}
.dc88-badge{position:absolute;left:8px;top:8px;background:#fff;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:700;color:#18A982}
.dc88-card-body{padding:11px}
.dc88-card-title{font-size:13px;font-weight:700;color:#17324D;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dc88-card-desc{font-size:11px;color:#718096;margin-bottom:6px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dc88-card-price{font-size:14px;font-weight:800;color:#18A982;margin-bottom:4px}
.dc88-card-meta{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
.dc88-card-meta span{background:#F3F7FA;padding:3px 6px;border-radius:6px;font-size:10px;color:#60778A}
.dc88-card-actions{display:flex;gap:5px;margin-top:8px}
.dc88-card-actions button{flex:1;padding:7px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;border:0;transition:all .15s}
.dc88-btn-s{background:#EEF5F9;color:#18A982}
.dc88-btn-s:hover{background:#D5E8F2}
.dc88-btn-s:active{background:#C0DCE8;transform:scale(.96)}
.dc88-btn-p{background:#18A982;color:#fff}
.dc88-btn-p:hover{background:#17604E}
.dc88-btn-p:active{background:#083D5C;transform:scale(.96)}
/* 75's card buttons hover states */
.skh-de-card-btn{transition:all .15s}
.skh-de-card-btn:hover{opacity:.85;transform:translateY(-1px)}
.skh-de-card-btn:active{transform:scale(.96);opacity:.75}
.skh-de-card-btn--primary:hover{background:#17604E!important}
.skh-de-card-btn--green:hover{background:#0f766e!important}
.skh-de-card-btn--gold:hover{background:#c4a635!important}
/* PERSON */
.dc88-person-top{display:flex;gap:10px;align-items:center;margin-bottom:8px}
.dc88-avatar{width:42px;height:42px;border-radius:50%;object-fit:cover;background:#DDEAF1}
.dc88-online{width:8px;height:8px;border-radius:50%;background:#18A982;display:inline-block;margin-right:3px}
/* FILTER SHEET */
.dc88-overlay{position:fixed;inset:0;background:rgba(13,39,59,.35);z-index:100010;opacity:0;pointer-events:none;transition:opacity .25s}
.dc88-overlay.show{opacity:1;pointer-events:auto}
.dc88-sheet{position:fixed;left:0;right:0;bottom:0;max-height:85vh;background:#fff;z-index:100011;border-radius:22px 22px 0 0;transform:translateY(105%);transition:transform .3s cubic-bezier(.2,.8,.2,1);display:flex;flex-direction:column}
.dc88-sheet.show{transform:translateY(0)}
.dc88-handle{width:42px;height:4px;background:#D5DEE6;border-radius:10px;margin:10px auto 4px}
.dc88-sheet-head{display:flex;align-items:center;justify-content:space-between;padding:10px 18px;border-bottom:1px solid #E5EDF4}
.dc88-sheet-head h2{font-size:16px;font-weight:800;color:#17324D}
.dc88-sheet-close{width:32px;height:32px;border-radius:50%;background:#F1F5F8;color:#536A7B;border:0;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
.dc88-sheet-close:hover{background:#E5EBEF;color:#334155}
.dc88-sheet-close:active{transform:scale(.9)}
.dc88-sheet-content{overflow-y:auto;padding:14px 18px 80px;flex:1}
.dc88-fsec{border-bottom:1px solid #F1F5F8;padding:12px 0}
.dc88-fsec:last-child{border-bottom:none}
.dc88-fsec-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.dc88-fsec-head h3{font-size:13px;font-weight:700;color:#17324D}
.dc88-fsec-head span{color:#8797A5;font-size:11px}
.dc88-opts{display:flex;flex-wrap:wrap;gap:6px}
.dc88-opt{background:#F4F7F9;border:1px solid #E3EAF0;padding:7px 11px;border-radius:10px;font-size:11px;color:#526B7E;cursor:pointer;transition:all .15s;font-weight:500}
.dc88-opt:hover{border-color:#B9DDF1;background:#EEF5F9;color:#18A982}
.dc88-opt:active{transform:scale(.95)}
.dc88-opt.sel{background:#E6F4EF;border-color:#A9DCCB;color:#087A59;font-weight:700}
.dc88-opt.sel:hover{background:#D0EBE0;border-color:#80C9AD}
.dc88-sheet-foot{position:sticky;bottom:0;padding:10px 18px;background:rgba(255,255,255,.97);border-top:1px solid #E5EDF4;display:flex;gap:8px}
.dc88-sheet-foot button{flex:1;padding:12px;border-radius:11px;font-weight:800;font-size:13px;cursor:pointer;border:0}
.dc88-reset{background:#F1F5F7;color:#667C8C;transition:all .15s}
.dc88-reset:hover{background:#E5EBEF}
.dc88-reset:active{transform:scale(.97)}
.dc88-apply{background:#18A982;color:#fff;transition:all .15s}
.dc88-apply:hover{background:#17604E}
.dc88-apply:active{transform:scale(.97);background:#083D5C}
/* DETAIL */
.dc88-detail{animation:dc88fade .2s}
@keyframes dc88fade{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.dc88-back{background:#fff;border:1px solid #E5EDF4;padding:9px 14px;border-radius:11px;color:#18A982;font-weight:700;font-size:12px;cursor:pointer;margin-bottom:14px;transition:all .15s}
.dc88-back:hover{background:#F0F8FD;border-color:#B9DDF1}
.dc88-back:active{transform:scale(.97)}
.dc88-detail-cover{width:100%;height:220px;border-radius:18px;overflow:hidden;background:#DDEAF1;margin-bottom:14px}
.dc88-detail-cover img{width:100%;height:100%;object-fit:cover}
.dc88-detail-box{background:#fff;border:1px solid #E5EDF4;border-radius:16px;padding:16px;margin-bottom:14px}
.dc88-detail-title{font-size:20px;font-weight:900;color:#17324D;margin-bottom:4px}
.dc88-detail-price{color:#18A982;font-weight:900;font-size:18px;margin:8px 0}
.dc88-network{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.dc88-net-box{background:#F5F8FA;border-radius:10px;padding:10px;text-align:center}
.dc88-net-num{font-size:18px;font-weight:900;color:#18A982}
.dc88-net-label{font-size:10px;color:#718096;margin-top:2px}
/* EMPTY */
.dc88-empty{background:#fff;border:1px solid #E5EDF4;border-radius:16px;padding:40px 20px;text-align:center}
.dc88-empty-icon{font-size:32px;margin-bottom:8px}
.dc88-empty h3{font-size:15px;font-weight:700;color:#17324D;margin-bottom:4px}
.dc88-empty p{color:#718096;font-size:12px}
/* INTRO */
.dc88-intro{background:linear-gradient(135deg,#18A982,#18A982);color:#fff;border-radius:16px;padding:18px;margin-bottom:16px}
.dc88-intro h2{font-size:17px;font-weight:800;margin-bottom:4px}
.dc88-intro p{font-size:12px;opacity:.85;line-height:1.5}
/* LOADING */
.dc88-loading{text-align:center;padding:30px;color:#718096}
.dc88-spinner{width:24px;height:24px;border:3px solid #E5EDF4;border-top-color:#18A982;border-radius:50%;animation:dc88spin 1s linear infinite;display:inline-block;margin-bottom:8px}
@keyframes dc88spin{to{transform:rotate(360deg)}}
/* RESPONSIVE */
@media(min-width:600px){.dc88-results{grid-template-columns:repeat(3,1fr)}.dc88-sheet{left:50%;right:auto;width:500px;transform:translateX(-50%) translateY(105%)}.dc88-sheet.show{transform:translateX(-50%) translateY(0)}}
@media(max-width:400px){.dc88-results{grid-template-columns:repeat(2,1fr)}.dc88-card-img{height:100px}}
`;
    document.head.appendChild(s);
  }

  // ═══════════════════════════════════════════════════════════════
  // FILTER LOGIC
  // ═══════════════════════════════════════════════════════════════
  function filterCount(){
    var c=0;
    Object.keys(S.applied).forEach(function(k){ c+=(S.applied[k]||[]).length; });
    return c;
  }
  function filterList(){
    var l=[];
    Object.keys(S.applied).forEach(function(k){
      (S.applied[k]||[]).forEach(function(v){ l.push({section:k,value:v}); });
    });
    return l;
  }
  function removeFilter(sec,val){
    if(!S.applied[sec]) return;
    S.applied[sec]=S.applied[sec].filter(function(v){return v!==val;});
    if(!S.applied[sec].length) delete S.applied[sec];
    refresh();
  }
  function matchFilters(item){
    var l=item.listing||item;
    for(var sec in S.applied){
      var vals=S.applied[sec];
      if(!vals||!vals.length) continue;

      // 1. Umbali (Mahali) — Hesabu sahihi ya mita na kilomita
      if(sec==='Mahali'){
        if(l.distance!=null){
          var mx = Math.max.apply(null, vals.map(function(v){
            if(v==='Karibu nami') return 2;
            if(v.endsWith('m') && !v.endsWith('km')) {
              var mVal = parseFloat(v);
              return isNaN(mVal) ? 99999 : (mVal / 1000); // 100m -> 0.1km, 500m -> 0.5km
            }
            var kmVal = parseFloat(v);
            return isNaN(kmVal) ? 99999 : kmVal;
          }));
          if(l.distance > mx) return false;
        }
      }

      // 2. Bei (Price Range)
      if(sec==='Bei' && l.price != null){
        var p = Number(l.price);
        var matchPrice = vals.some(function(v){
          if(v==='Chini ya 10k') return p < 10000;
          if(v==='10k-50k') return p >= 10000 && p <= 50000;
          if(v==='50k-100k') return p > 50000 && p <= 100000;
          if(v==='100k-500k') return p > 100000 && p <= 500000;
          if(v==='500k+') return p > 500000;
          if(v==='Chini ya 5k') return p < 5000;
          if(v==='5k-20k') return p >= 5000 && p <= 20000;
          if(v==='20k+') return p > 20000;
          if(v==='Chini ya 20k') return p < 20000;
          if(v==='20k-100k') return p >= 20000 && p <= 100000;
          return true;
        });
        if(!matchPrice) return false;
      }

      // 3. Upatikanaji (Stock / Delivery / Online Ordering)
      if(sec==='Upatikanaji'){
        if(vals.indexOf('In Stock')>=0 && (l.availabilityStatus==='OUT_OF_STOCK' || l.stock===0)) return false;
        if(vals.indexOf('Online Ordering')>=0 && l.onlineOrderingEnabled===false) return false;
      }

      // 4. Uthibitisho (Verified)
      if(sec==='Uthibitisho'){
        if(vals.indexOf('Verified')>=0 && !l.verified && !(l.raw&&l.raw.verified)) return false;
      }

      // 5. Kategoria
      if(sec==='Kategoria'){
        var cat=String(l.categoryName||l.category||'').toLowerCase();
        var m=vals.some(function(v){return cat.indexOf(v.toLowerCase())>=0;});
        if(!m) return false;
      }
    }
    return true;
  }
  function matchSearch(item){
    if(!S.query) return true;
    var q=S.query.toLowerCase();
    var l=item.listing||item;
    var s=[l.title,l.categoryName,l.category,l.location,l.sellerName,l.businessName,l.description].filter(Boolean).join(' ').toLowerCase();
    return s.indexOf(q)>=0;
  }
  function filterItems(items){
    if(!items||!items.length) return[];
    var res = items.filter(function(i){return matchSearch(i)&&matchFilters(i);});

    // [PHASE 6 FIX] Utekelezaji wa kichujio cha 'Panga' (Sort)
    var sortVal = S.applied['Panga'] && S.applied['Panga'][0];
    if(sortVal){
      res.sort(function(a, b){
        var la = a.listing || a;
        var lb = b.listing || b;
        if(sortVal==='Bei ↓') return (Number(lb.price)||0) - (Number(la.price)||0);
        if(sortVal==='Bei ↑') return (Number(la.price)||0) - (Number(lb.price)||0);
        if(sortVal==='Karibu' || sortVal==='Karibu zaidi') return (la.distance||9999) - (lb.distance||9999);
        return 0;
      });
    }
    return res;
  }

  // ═══════════════════════════════════════════════════════════════
  // SEARCH
  // ═══════════════════════════════════════════════════════════════
  function doSearch(query, retryCount){
    retryCount = retryCount || 0;
    S.query=query||'';
    var E=window.SKH_DISCOVER_ENGINE;
    if(!E||!E.universalSearch){
      // Engine not ready — retry
      setTimeout(function(){ doSearch(query, retryCount); }, 300);
      return;
    }
    var opts={limit:30};
    // For "Zote" tab, don't set entityTypes (use default = all)
    var et=TYPE_MAP[S.entity];
    if(et) opts.entityTypes=et;

    E.universalSearch(query,opts).then(function(sections){
      sections.query=query;
      S.sections=sections;
      window.__deLastSections=sections;
      
      // [PHASE 6 FIX] Usirudie search mara 3 mtumiaji anapotafuta kitu kisichokuwepo (huua quota ya Firestore).
      // Jaribu tena mara MOJA tu iwapo ni ukurasa wa kwanza mtupu (bila query) na cache bado haijapakiwa.
      var totalCount = (sections.products||[]).length + (sections.services||[]).length + 
                       (sections.businesses||[]).length + (sections.transporters||[]).length + 
                       (sections.people||[]).length + (sections.groups||[]).length;
      
      if (!query && totalCount === 0 && retryCount < 1) {
        setTimeout(function(){ doSearch('', retryCount + 1); }, 1200);
        return;
      }
      
      refresh();
    }).catch(function(e){
      console.warn('[88 search error]',e);
      // Retry on error
      if (retryCount < 2) {
        setTimeout(function(){ doSearch(query, retryCount + 1); }, 2000);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // CARD RENDERERS
  // ═══════════════════════════════════════════════════════════════
  function productCard(item){
    var l=item.listing||item;
    var img=l.image||l.imageUrl||'';
    var price=l.price?'TZS '+Number(l.price).toLocaleString():'';
    var badge=l.sellerMode==='DISCOVER_ONLY'?T('Offline','Offline'):l.sellerMode==='ONLINE_DISCOVER'?T('Online','Online'):T('Bidhaa','Product');
    return '<div class="dc88-card" data-dc88-detail data-type="product" data-id="'+esc(l.entityId||'')+'">'
      +'<div class="dc88-card-img">'+(img?'<img src="'+esc(img)+'" loading="lazy" onerror="this.style.display=\'none\'">':'')+'<span class="dc88-badge">'+esc(badge)+'</span></div>'
      +'<div class="dc88-card-body">'
      +'<div class="dc88-card-title">'+esc(l.title||'Product')+'</div>'
      +(l.description?'<div class="dc88-card-desc">'+esc(l.description)+'</div>':'')
      +(price?'<div class="dc88-card-price">'+esc(price)+'</div>':'')
      +'<div class="dc88-card-meta">'
      +(l.location?'<span>📍 '+esc(l.location)+'</span>':'')
      +(l.distance!=null?'<span>'+l.distance.toFixed(1)+' km</span>':'')
      +(l.sellerName?'<span>'+esc(l.sellerName)+'</span>':'')
      +'</div>'
      +'<div class="dc88-card-actions">'
      +'<button class="dc88-btn-s" data-dc88-detail data-type="product" data-id="'+esc(l.entityId||'')+'">'+T('Fungua','View')+'</button>'
      +'<button class="dc88-btn-p" data-dc88-chat data-id="'+esc(l.sellerId||'')+'" data-name="'+esc(l.sellerName||'')+'">'+T('Chat','Chat')+'</button>'
      +'</div></div></div>';
  }

  function personCard(item){
    var l=item.listing||item;
    var img=l.image||l.imageUrl||'';
    var u=l.raw||{};
    var name=u.fullName||u.displayName||l.title||'Person';
    return '<div class="dc88-card" data-dc88-detail data-type="person" data-id="'+esc(l.entityId||'')+'">'
      +'<div class="dc88-card-body">'
      +'<div class="dc88-person-top">'
      +(img?'<img class="dc88-avatar" src="'+esc(img)+'" onerror="this.style.display=\'none\'">':'<div class="dc88-avatar"></div>')
      +'<div><div class="dc88-card-title">'+esc(name)+'</div>'
      +'<div class="dc88-card-desc"><span class="dc88-online"></span>'+esc(l.location||'')+(l.distance!=null?' · '+l.distance.toFixed(1)+' km':'')+'</div></div></div>'
      +'<div class="dc88-card-meta">'
      +(l.categoryName?'<span>'+esc(l.categoryName)+'</span>':'')
      +(u.followers?'<span>'+u.followers+' followers</span>':'')
      +'</div>'
      +'<div class="dc88-card-actions">'
      +'<button class="dc88-btn-s" data-dc88-detail data-type="person" data-id="'+esc(l.entityId||'')+'">'+T('Profile','Profile')+'</button>'
      +'<button class="dc88-btn-p" data-dc88-chat data-id="'+esc(l.entityId||'')+'" data-name="'+esc(name)+'">'+T('Chat','Chat')+'</button>'
      +'</div></div></div>';
  }

  function bizCard(item){
    var l=item.listing||item;
    var img=l.image||l.imageUrl||'';
    return '<div class="dc88-card" data-dc88-detail data-type="business" data-id="'+esc(l.entityId||'')+'">'
      +'<div class="dc88-card-img">'+(img?'<img src="'+esc(img)+'" loading="lazy" onerror="this.style.display=\'none\'">':'')+(l.verified?'<span class="dc88-badge">✓ Verified</span>':'<span class="dc88-badge">'+T('Biashara','Business')+'</span>')+'</div>'
      +'<div class="dc88-card-body">'
      +'<div class="dc88-card-title">'+esc(l.title||'Business')+'</div>'
      +'<div class="dc88-card-desc">'+esc(l.categoryName||l.category||'')+'</div>'
      +'<div class="dc88-card-meta">'
      +(l.location?'<span>📍 '+esc(l.location)+'</span>':'')
      +(l.distance!=null?'<span>'+l.distance.toFixed(1)+' km</span>':'')
      +'</div>'
      +'<div class="dc88-card-actions">'
      +'<button class="dc88-btn-s" data-dc88-detail data-type="business" data-id="'+esc(l.entityId||'')+'">'+T('View','View')+'</button>'
      +'<button class="dc88-btn-p" data-dc88-chat data-id="'+esc(l.entityId||'')+'" data-name="'+esc(l.title||'')+'">'+T('Chat','Chat')+'</button>'
      +'</div></div></div>';
  }

  function serviceCard(item){
    var l=item.listing||item;
    var img=l.image||l.imageUrl||'';
    var price=l.price?'TZS '+Number(l.price).toLocaleString()+'+':'';
    return '<div class="dc88-card" data-dc88-detail data-type="service" data-id="'+esc(l.entityId||'')+'">'
      +'<div class="dc88-card-img">'+(img?'<img src="'+esc(img)+'" loading="lazy" onerror="this.style.display=\'none\'">':'')+'<span class="dc88-badge">'+T('Huduma','Service')+'</span></div>'
      +'<div class="dc88-card-body">'
      +'<div class="dc88-card-title">'+esc(l.title||'Service')+'</div>'
      +'<div class="dc88-card-desc">'+T('Mtoa huduma','Provider')+': '+esc(l.sellerName||l.businessName||'')+'</div>'
      +(price?'<div class="dc88-card-price">'+esc(price)+'</div>':'')
      +'<div class="dc88-card-meta">'
      +(l.location?'<span>📍 '+esc(l.location)+'</span>':'')
      +(l.distance!=null?'<span>'+l.distance.toFixed(1)+' km</span>':'')
      +'</div>'
      +'<div class="dc88-card-actions">'
      +'<button class="dc88-btn-s" data-dc88-detail data-type="service" data-id="'+esc(l.entityId||'')+'">'+T('Fungua','View')+'</button>'
      +'<button class="dc88-btn-p" data-dc88-chat data-id="'+esc(l.sellerId||l.entityId||'')+'" data-name="'+esc(l.sellerName||l.title||'')+'">'+T('Request','Request')+'</button>'
      +'</div></div></div>';
  }

  function transportCard(item){
    var l=item.listing||item;
    var price=l.price?'TZS '+Number(l.price).toLocaleString()+'+':'';
    var u=l.raw||{};
    return '<div class="dc88-card" data-dc88-detail data-type="transport" data-id="'+esc(l.entityId||'')+'">'
      +'<div class="dc88-card-body">'
      +'<div class="dc88-card-title">'+esc(l.title||'Transporter')+'</div>'
      +'<div class="dc88-card-desc">'+esc(u.vehicleType||l.categoryName||'')+'</div>'
      +(price?'<div class="dc88-card-price">'+esc(price)+'</div>':'')
      +'<div class="dc88-card-meta">'
      +(l.location?'<span>📍 '+esc(l.location)+'</span>':'')
      +(l.distance!=null?'<span>'+l.distance.toFixed(1)+' km</span>':'')
      +(l.verified?'<span>✓ Verified</span>':'')
      +'</div>'
      +'<div class="dc88-card-actions">'
      +'<button class="dc88-btn-s" data-dc88-detail data-type="transport" data-id="'+esc(l.entityId||'')+'">'+T('Profile','Profile')+'</button>'
      +'<button class="dc88-btn-p" data-dc88-chat data-id="'+esc(l.entityId||'')+'" data-name="'+esc(l.title||'')+'">'+T('Request','Request')+'</button>'
      +'</div></div></div>';
  }

  function groupCard(item){
    var l=item.listing||item;
    var u=l.raw||{};
    return '<div class="dc88-card" data-dc88-detail data-type="group" data-id="'+esc(l.entityId||'')+'">'
      +'<div class="dc88-card-body">'
      +'<div class="dc88-card-title">'+esc(u.name||l.title||'Group')+'</div>'
      +'<div class="dc88-card-desc">'+esc(u.category||l.categoryName||'Group')+'</div>'
      +'<div class="dc88-card-meta">'
      +(l.location?'<span>📍 '+esc(l.location)+'</span>':'')
      +(u.memberCount?'<span>'+u.memberCount+' members</span>':'')
      +(u.active?'<span>Active</span>':'')
      +'</div>'
      +'<div class="dc88-card-actions">'
      +'<button class="dc88-btn-s" data-dc88-detail data-type="group" data-id="'+esc(l.entityId||'')+'">'+T('View','View')+'</button>'
      +'<button class="dc88-btn-p">'+T('Join','Join')+'</button>'
      +'</div></div></div>';
  }

  function genericCard(item){
    var l=item.listing||item;
    return '<div class="dc88-card" data-dc88-detail data-type="generic" data-id="'+esc(l.entityId||'')+'">'
      +'<div class="dc88-card-body">'
      +'<div class="dc88-card-title">'+esc(l.title||'Item')+'</div>'
      +'<div class="dc88-card-desc">'+esc(l.categoryName||l.entityType||'')+'</div>'
      +'<div class="dc88-card-meta">'
      +(l.location?'<span>📍 '+esc(l.location)+'</span>':'')
      +'</div>'
      +'<div class="dc88-card-actions">'
      +'<button class="dc88-btn-s" data-dc88-detail data-type="generic" data-id="'+esc(l.entityId||'')+'">'+T('View','View')+'</button>'
      +'</div></div></div>';
  }

  function getRenderer(type){
    var E = window.SKH_DISCOVER_ENGINE;
    if (!E) return genericCard;
    switch(type){
      case'PRODUCT': return function(item){ return E.renderProductCard ? E.renderProductCard(item) : genericCard(item); };
      case'PERSON': return function(item){ return E.renderPersonCard ? E.renderPersonCard(item) : personCard(item); };
      case'BUSINESS': return function(item){ return E.renderBusinessCard ? E.renderBusinessCard(item) : bizCard(item); };
      case'SERVICE': return function(item){ return E.renderServiceCard ? E.renderServiceCard(item) : serviceCard(item); };
      case'TRANSPORTER': return function(item){ return E.renderTransportCard ? E.renderTransportCard(item) : transportCard(item); };
      case'GROUP': return function(item){ return E.renderGroupCard ? E.renderGroupCard(item) : groupCard(item); };
      default:return genericCard;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDERING
  // ═══════════════════════════════════════════════════════════════
  function renderTabs(){
    return '<div class="dc88-tabs">'+TABS.map(function(t){
      var active=S.entity===t[0];
      return '<button class="dc88-tab'+(active?' active':'')+'" data-dc88-tab="'+t[0]+'">'+t[1]+' '+esc(t[0])+'</button>';
    }).join('')+'</div>';
  }

  function renderToolbar(){
    var c=filterCount();
    var h='<div class="dc88-toolbar">';
    h+='<button class="dc88-filter-btn" data-dc88-open-filters>'+(window.skhNavIcon?window.skhNavIcon('edit',13):'')+' '+T('Filters','Filters');
    if(c>0) h+=' <span class="dc88-filter-count">'+c+'</span>';
    h+='</button>';
    h+='<div class="dc88-result-info">'+(S.query?T('Matokeo ya','Results for')+' "'+esc(S.query)+'"':T('Gundua','Discover')+' '+esc(S.entity))+'</div>';
    h+='</div>';
    var chips=filterList();
    if(chips.length){
      h+='<div class="dc88-chips">';
      chips.forEach(function(c){
        h+='<span class="dc88-chip">'+esc(c.section)+': '+esc(c.value)+' <button data-dc88-rm data-section="'+esc(c.section)+'" data-value="'+esc(c.value)+'">×</button></span>';
      });
      h+='</div>';
    }
    return h;
  }

  function renderEntityContent(){
    var sec=S.sections;
    if(!sec) return '<div class="dc88-empty"><div class="dc88-empty-icon">🔍</div><h3>'+T('Tafuta kitu','Search something')+'</h3><p>'+T('Andika kwenye search bar ili kuanza kugundua.','Type in search bar to start discovering.')+'</p></div>';

    if(S.entity==='Zote') return renderAll(sec);

    var key=ENT_MAP[S.entity];
    if(!key) return renderEmpty();

    var items=sec[key]||[];
    if(S.entity==='Biashara'&&sec.nearbyBusinesses) items=items.concat(sec.nearbyBusinesses);
    // [PHASE 6 FIX] Wauzaji wajumuishe pia offline/online product sellers, si maduka makubwa pekee
    if(S.entity==='Wauzaji'){
      items = items.concat(sec.offlineSellers||[], sec.onlineSellers||[]);
    }

    var filtered=filterItems(items);
    if(!filtered.length) return renderEmpty();

    var ren=getRenderer((filtered[0].listing||filtered[0]).entityType);
    var h='<div class="dc88-results">';
    filtered.forEach(function(i){h+=ren(i);});
    h+='</div>';
    return h;
  }

  function renderAll(sec){
    var h='';
    var secs=[
      ['products',T('Bidhaa','Products'),'PRODUCT'],
      ['services',T('Huduma','Services'),'SERVICE'],
      ['people',T('Watu','People'),'PERSON'],
      ['businesses',T('Biashara','Businesses'),'BUSINESS'],
      ['nearbyBusinesses',T('Biashara Karibu','Nearby Businesses'),'BUSINESS'],
      ['transporters',T('Wasafirishaji','Transport'),'TRANSPORTER'],
      ['groups',T('Vikundi','Groups'),'GROUP']
    ];
    secs.forEach(function(s){
      var items=filterItems(sec[s[0]]||[]);
      if(!items.length) return;
      var ren=getRenderer(s[2]);
      h+='<div class="dc88-section">';
      h+='<div class="dc88-section-head"><h3>'+s[1]+'</h3><span>'+items.length+' '+T('matokeo','results')+'</span></div>';
      h+='<div class="dc88-results">';
      items.slice(0,6).forEach(function(i){h+=ren(i);});
      h+='</div></div>';
    });
    if(!h) return renderEmpty();
    return h;
  }

  function renderEmpty(){
    return '<div class="dc88-empty"><div class="dc88-empty-icon">🔍</div><h3>'+T('Hakuna matokeo','No results')+'</h3><p>'+T('Jaribu kubadilisha search au filters.','Try changing search or filters.')+'</p></div>';
  }

  function renderDetail(){
    var item=S.detail;
    if(!item) return renderHome();

    // Route to specific detail renderer based on type
    if(S.detailType==='person') return renderPersonDetail(item);
    if(S.detailType==='group') return renderGroupDetail(item);

    var l=item.listing||item;
    var img=l.image||l.imageUrl||'';
    var price=l.price?'TZS '+Number(l.price).toLocaleString():'';
    var sec=S.sections||{};

    var h='<div class="dc88-detail">';
    h+='<button class="dc88-back" data-dc88-back>← '+T('Rudi','Back')+'</button>';
    if(img) h+='<div class="dc88-detail-cover"><img src="'+esc(img)+'" onerror="this.style.display=\'none\'"></div>';
    h+='<div class="dc88-detail-box">';
    h+='<div class="dc88-detail-title">'+esc(l.title||'')+'</div>';
    if(price) h+='<div class="dc88-detail-price">'+esc(price)+'</div>';
    if(l.description) h+='<p style="color:#718096;font-size:13px;line-height:1.6">'+esc(l.description)+'</p>';
    h+='<div class="dc88-card-meta" style="margin-top:10px">';
    if(l.location) h+='<span>📍 '+esc(l.location)+'</span>';
    if(l.distance!=null) h+='<span>'+l.distance.toFixed(1)+' km</span>';
    if(l.sellerName) h+='<span>'+esc(l.sellerName)+'</span>';
    h+='</div>';
    h+='<div class="dc88-card-actions" style="margin-top:12px">';
    if(l.sellerId) h+='<button class="dc88-btn-p" data-dc88-chat data-id="'+esc(l.sellerId)+'" data-name="'+esc(l.sellerName||'')+'">'+T('Chat','Chat')+'</button>';
    if(l.sellerMode==='ONLINE_DISCOVER') h+='<button class="dc88-btn-s">'+T('Weka Kikapu','Add to Cart')+'</button>';
    if(l.latitude&&l.longitude) h+='<button class="dc88-btn-s" onclick="window.open(\'https://www.google.com/maps/dir/?api=1&destination='+l.latitude+','+l.longitude+'\',\'_blank\')">'+T('Maelekezo','Directions')+'</button>';
    h+='</div></div>';

    // Discovery Network (for products)
    if(l.entityType==='PRODUCT'){
      var people=filterItems(sec.people||[]);
      var biz=filterItems((sec.businesses||[]).concat(sec.nearbyBusinesses||[]));
      var groups=filterItems(sec.groups||[]);
      var trans=filterItems(sec.transporters||[]);

      h+='<div class="dc88-detail-box"><h3 style="font-size:15px;font-weight:800;margin-bottom:10px">'+T('Mtandao wa Ugunduzi','Discovery Network')+'</h3>';
      h+='<div class="dc88-network">';
      h+='<div class="dc88-net-box"><div class="dc88-net-num">'+people.length+'</div><div class="dc88-net-label">'+T('Watu','People')+'</div></div>';
      h+='<div class="dc88-net-box"><div class="dc88-net-num">'+biz.length+'</div><div class="dc88-net-label">'+T('Biashara','Businesses')+'</div></div>';
      h+='<div class="dc88-net-box"><div class="dc88-net-num">'+groups.length+'</div><div class="dc88-net-label">'+T('Vikundi','Groups')+'</div></div>';
      h+='<div class="dc88-net-box"><div class="dc88-net-num">'+trans.length+'</div><div class="dc88-net-label">'+T('Usafiri','Transport')+'</div></div>';
      h+='</div></div>';

      if(people.length){
        h+='<div class="dc88-detail-box"><h3 style="font-size:14px;font-weight:800;margin-bottom:10px">'+T('Watu wanaohusiana','Related People')+'</h3><div class="dc88-results">';
        people.slice(0,3).forEach(function(p){h+=personCard(p);});
        h+='</div></div>';
      }
      if(groups.length){
        h+='<div class="dc88-detail-box"><h3 style="font-size:14px;font-weight:800;margin-bottom:10px">'+T('Vikundi vinavyohusiana','Related Groups')+'</h3><div class="dc88-results">';
        groups.slice(0,3).forEach(function(g){h+=groupCard(g);});
        h+='</div></div>';
      }
    }
    h+='</div>';
    return h;
  }

  // ═══════════════════════════════════════════════════════════════
  // PERSON DETAIL VIEW — Full profile inside Discover
  // ═══════════════════════════════════════════════════════════════
  function renderPersonDetail(item){
    var l=item.listing||item;
    var u=l.raw||{};
    var name=u.fullName||u.displayName||l.title||'Person';
    var initial=String(name).charAt(0).toUpperCase();
    var role=u.primaryProfile||u.role||(u.isSeller?'Seller':'Customer');
    var photo=u.photoURL||u.profileImage||u.dp||'';
    var cover=u.coverImage||'';
    var verify=(u.verified||u.verifiedBusiness);
    var location=u.location||u.region||u.city||'Tanzania';
    var about=u.about||u.bio||u.description||'';
    var phone=u.phone||u.phoneNumber||'';
    var email=u.email||'';
    var businessName=u.businessName||u.shopName||'';
    var joined=u.memberSince||u.createdAt||'';
    var interests=Array.isArray(u.interests)?u.interests:[];
    var socialLinks=u.socialLinks||{};
    var rating=u.rating||0;
    var productsCount=u.productsCount||0;
    var ordersCount=u.ordersCount||0;

    var h='<div class="dc88-detail">';
    h+='<button class="dc88-back" data-dc88-back>← '+T('Rudi','Back')+'</button>';

    // Cover image
    if(cover){
      h+='<div style="width:100%;height:120px;background:linear-gradient(135deg,#EAF8F2,#F0F7FA);border-radius:16px 16px 0 0;overflow:hidden;"><img src="'+esc(cover)+'" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display=\'none\'"></div>';
    } else {
      h+='<div style="width:100%;height:120px;background:linear-gradient(135deg,#EAF8F2,#F0F7FA);border-radius:16px 16px 0 0;"></div>';
    }

    // Avatar + name header
    h+='<div style="padding:0 16px;margin-top:-36px;position:relative;">';
    h+='<div style="display:flex;align-items:flex-end;gap:14px;">';
    if(photo){
      h+='<div style="width:72px;height:72px;border-radius:50%;border:3px solid #fff;overflow:hidden;flex-shrink:0;background:#fff;"><img src="'+esc(photo)+'" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML=\'<div style=\\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#17604E;background:#e0f0fa;\\\'>\'+\''+esc(initial)+'\'</div>\'"></div>';
    } else {
      h+='<div style="width:72px;height:72px;border-radius:50%;border:3px solid #fff;background:linear-gradient(135deg,#18A982,#18A982);color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;flex-shrink:0;">'+esc(initial)+'</div>';
    }
    h+='<div style="padding-bottom:6px;flex:1;min-width:0;">';
    h+='<div style="font-size:18px;font-weight:900;color:#0f172a;display:flex;align-items:center;gap:6px;">'+esc(name);
    if(verify) h+=' <span style="color:#18A982;font-size:16px;" title="Verified">✓</span>';
    h+='</div>';
    h+='<div style="font-size:12px;color:#64748b;font-weight:600;">'+esc(role)+(businessName?' • '+esc(businessName):'')+'</div>';
    h+='</div></div></div>';

    // Quick stats
    h+='<div style="display:flex;gap:0;margin:16px;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">';
    h+='<div style="flex:1;text-align:center;padding:12px 8px;background:#f8fafc;">';
    h+='<div style="font-size:18px;font-weight:900;color:#17604E;">'+(rating?Number(rating).toFixed(1):'—')+'</div>';
    h+='<div style="font-size:10px;color:#64748b;font-weight:700;">'+T('Rating','Rating')+'</div></div>';
    h+='<div style="flex:1;text-align:center;padding:12px 8px;background:#f8fafc;border-left:1px solid #e2e8f0;">';
    h+='<div style="font-size:18px;font-weight:900;color:#17604E;">'+productsCount+'</div>';
    h+='<div style="font-size:10px;color:#64748b;font-weight:700;">'+T('Bidhaa','Products')+'</div></div>';
    h+='<div style="flex:1;text-align:center;padding:12px 8px;background:#f8fafc;border-left:1px solid #e2e8f0;">';
    h+='<div style="font-size:18px;font-weight:900;color:#17604E;">'+ordersCount+'</div>';
    h+='<div style="font-size:10px;color:#64748b;font-weight:700;">'+T('Orders','Orders')+'</div></div>';
    h+='</div>';

    // Action buttons
    h+='<div style="display:flex;gap:8px;padding:0 16px;margin-bottom:14px;">';
    h+='<button class="dc88-btn-p" style="flex:1;" data-dc88-chat data-id="'+esc(l.entityId||u.uid||'')+'" data-name="'+esc(name)+'">💬 '+T('Chat','Chat')+'</button>';
    if(phone){
      h+='<button class="dc88-btn-s" style="flex:1;" onclick="window.open(\'tel:'+esc(phone)+'\')">📞 '+T('Piga','Call')+'</button>';
    }
    h+='</div>';

    // About section
    if(about){
      h+='<div class="dc88-detail-box">';
      h+='<h3 style="font-size:14px;font-weight:800;margin-bottom:8px;">'+T('Kuhusu','About')+'</h3>';
      h+='<p style="color:#475569;font-size:13px;line-height:1.7;margin:0;">'+esc(about)+'</p>';
      h+='</div>';
    }

    // Info section
    h+='<div class="dc88-detail-box">';
    h+='<h3 style="font-size:14px;font-weight:800;margin-bottom:10px;">'+T('Taarifa','Info')+'</h3>';
    h+='<div style="display:flex;flex-direction:column;gap:8px;">';
    h+='<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#475569;"><span>📍</span><span>'+esc(location)+'</span></div>';
    if(phone) h+='<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#475569;"><span>📞</span><span>'+esc(phone)+'</span></div>';
    if(email) h+='<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#475569;"><span>✉️</span><span>'+esc(email)+'</span></div>';
    if(businessName) h+='<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#475569;"><span>🏪</span><span>'+esc(businessName)+'</span></div>';
    if(joined){
      var jDate = typeof joined === 'string' ? joined : (joined.toDate ? joined.toDate().toLocaleDateString('sw-TZ') : '');
      if(jDate) h+='<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#475569;"><span>📅</span><span>'+T('Mwanachama tangu','Member since')+' '+esc(jDate)+'</span></div>';
    }
    h+='</div></div>';

    // Interests
    if(interests.length){
      h+='<div class="dc88-detail-box">';
      h+='<h3 style="font-size:14px;font-weight:800;margin-bottom:10px;">'+T('Maslahi','Interests')+'</h3>';
      h+='<div style="display:flex;flex-wrap:wrap;gap:6px;">';
      interests.forEach(function(i){
        h+='<span style="display:inline-block;background:#eef6fc;color:#17604E;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;">'+esc(i)+'</span>';
      });
      h+='</div></div>';
    }

    // Location on map
    if(u.coords||u.latitude||l.latitude){
      var lat=u.latitude||u.coords&&u.coords.lat||l.latitude;
      var lng=u.longitude||u.coords&&u.coords.lng||l.longitude;
      if(lat&&lng){
        h+='<div class="dc88-detail-box">';
        h+='<h3 style="font-size:14px;font-weight:800;margin-bottom:10px;">'+T('Eneo','Location')+'</h3>';
        h+='<a href="https://www.google.com/maps/dir/?api=1&destination='+lat+','+lng+'" target="_blank" style="display:flex;align-items:center;gap:8px;padding:12px;background:#f0fdf4;border-radius:10px;text-decoration:none;color:#166534;font-weight:700;font-size:13px;">📍 '+T('Fungua kwenye Ramani','Open in Maps')+' →</a>';
        h+='</div>';
      }
    }

    // Social links
    if(Object.keys(socialLinks).length){
      h+='<div class="dc88-detail-box">';
      h+='<h3 style="font-size:14px;font-weight:800;margin-bottom:10px;">'+T('Mitandao','Social')+'</h3>';
      h+='<div style="display:flex;flex-wrap:wrap;gap:8px;">';
      Object.keys(socialLinks).forEach(function(k){
        h+='<a href="'+esc(socialLinks[k])+'" target="_blank" style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;background:#f1f5f9;border-radius:8px;text-decoration:none;color:#334155;font-size:12px;font-weight:700;">'+esc(k)+'</a>';
      });
      h+='</div></div>';
    }

    h+='</div>';
    return h;
  }

  // ═══════════════════════════════════════════════════════════════
  // GROUP DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════
  function renderGroupDetail(item){
    var l=item.listing||item;
    var g=l.raw||{};
    var name=g.name||l.title||'Group';
    var desc=g.description||'';
    var category=g.category||l.categoryName||'Group';
    var members=g.memberCount||1;
    var location=g.location||'';
    var isActive=g.active!==false;

    var h='<div class="dc88-detail">';
    h+='<button class="dc88-back" data-dc88-back>← '+T('Rudi','Back')+'</button>';

    // Header
    h+='<div style="text-align:center;padding:24px 16px;background:linear-gradient(135deg,#EAF8F2,#F0F7FA);border-radius:16px;margin:12px;">';
    h+='<div style="width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,0.2);color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;margin:0 auto 10px;">#</div>';
    h+='<div style="font-size:20px;font-weight:900;color:#fff;">'+esc(name)+'</div>';
    h+='<div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:4px;">'+esc(category)+'</div>';
    h+='</div>';

    // Stats
    h+='<div style="display:flex;gap:0;margin:0 12px;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">';
    h+='<div style="flex:1;text-align:center;padding:12px;background:#f8fafc;">';
    h+='<div style="font-size:20px;font-weight:900;color:#17604E;">'+members+'</div>';
    h+='<div style="font-size:10px;color:#64748b;font-weight:700;">'+T('Wanachama','Members')+'</div></div>';
    h+='<div style="flex:1;text-align:center;padding:12px;background:#f8fafc;border-left:1px solid #e2e8f0;">';
    h+='<div style="font-size:20px;font-weight:900;color:'+(isActive?'#16a34a':'#dc2626')+';">'+
    (isActive?'✓':'✗')+'</div>';
    h+='<div style="font-size:10px;color:#64748b;font-weight:700;">'+(isActive?T('Hai','Active'):T('Imekufa','Inactive'))+'</div></div>';
    h+='</div>';

    // Actions
    h+='<div style="padding:12px;">';
    h+='<button class="dc88-btn-p" style="width:100%;" onclick="if(window.skhOpenGroupSoga){window.skhOpenGroupSoga(\''+esc(l.entityId||g.id||'')+'\');}">'+T('Jiunge na Kikundi','Join Group')+'</button>';
    h+='</div>';

    // Description
    if(desc){
      h+='<div class="dc88-detail-box">';
      h+='<h3 style="font-size:14px;font-weight:800;margin-bottom:8px;">'+T('Maelezo','Description')+'</h3>';
      h+='<p style="color:#475569;font-size:13px;line-height:1.7;margin:0;">'+esc(desc)+'</p>';
      h+='</div>';
    }

    // Location
    if(location){
      h+='<div class="dc88-detail-box">';
      h+='<h3 style="font-size:14px;font-weight:800;margin-bottom:8px;">'+T('Eneo','Location')+'</h3>';
      h+='<div style="font-size:13px;color:#475569;">📍 '+esc(location)+'</div>';
      h+='</div>';
    }

    h+='</div>';
    return h;
  }

  function renderHome(){
    var h='';
    if(!S.sections){
      h+='<div class="dc88-intro"><h2>'+T('Gundua','Discover')+'</h2><p>'+T('Gundua watu, bidhaa, huduma, biashara, usafiri na vikundi karibu na SokoHai.','Discover people, products, services, businesses, transport and communities around SokoHai.')+'</p></div>';
    }
    h+=renderToolbar();
    h+=renderEntityContent();
    return h;
  }

  function renderFull(){
    if(S.view==='detail') return renderDetail();
    return renderHome();
  }

  function refresh(){
    var body=$('skhDiscoverEngineBody');
    if(!body) return;
    body.innerHTML=renderFull();
  }

  // ═══════════════════════════════════════════════════════════════
  // FILTER SHEET
  // ═══════════════════════════════════════════════════════════════
  function ensureSheet(){
    if($('dc88Overlay')) return;
    var ov=document.createElement('div');
    ov.id='dc88Overlay'; ov.className='dc88-overlay';
    document.body.appendChild(ov);
    var sh=document.createElement('div');
    sh.id='dc88Sheet'; sh.className='dc88-sheet';
    sh.innerHTML='<div class="dc88-handle"></div>'
      +'<div class="dc88-sheet-head"><h2>'+T('Filters','Filters')+'</h2><button class="dc88-sheet-close" data-dc88-close-sheet>×</button></div>'
      +'<div class="dc88-sheet-content" id="dc88SheetContent"></div>'
      +'<div class="dc88-sheet-foot">'
      +'<button class="dc88-reset" data-dc88-reset>'+T('Futa','Reset')+'</button>'
      +'<button class="dc88-apply" data-dc88-apply>'+T('Tumia Filters','Apply Filters')+'</button>'
      +'</div>';
    document.body.appendChild(sh);
    ov.addEventListener('click',closeSheet);
  }

  function openSheet(){
    ensureSheet();
    S.draft=JSON.parse(JSON.stringify(S.applied));
    renderSheet();
    $('dc88Overlay').classList.add('show');
    $('dc88Sheet').classList.add('show');
  }

  function closeSheet(){
    var ov=$('dc88Overlay'),sh=$('dc88Sheet');
    if(ov) ov.classList.remove('show');
    if(sh) sh.classList.remove('show');
  }

  function renderSheet(){
    var defs=FDEFS[S.entity]||FDEFS['Zote'];
    var h='';
    defs.forEach(function(d){
      var sec=d[0],opts=d[1],sel=S.draft[sec]||[];
      h+='<div class="dc88-fsec">';
      h+='<div class="dc88-fsec-head"><h3>'+esc(sec)+'</h3>';
      if(sel.length) h+='<span>'+sel.length+' '+T('zimechaguliwa','selected')+'</span>';
      h+='</div><div class="dc88-opts">';
      opts.forEach(function(o){
        var isSel=sel.indexOf(o)>=0;
        h+='<button class="dc88-opt'+(isSel?' sel':'')+'" data-dc88-toggle data-section="'+esc(sec)+'" data-value="'+esc(o)+'">';
        if(isSel) h+='✓ ';
        h+=esc(o)+'</button>';
      });
      h+='</div></div>';
    });
    var c=$('dc88SheetContent');
    if(c) c.innerHTML=h;
  }

  function toggleDraft(sec,val){
    if(!S.draft[sec]) S.draft[sec]=[];
    var i=S.draft[sec].indexOf(val);
    if(i>=0) S.draft[sec].splice(i,1);
    else S.draft[sec].push(val);
    renderSheet();
  }

  function applyFilters(){
    S.applied=JSON.parse(JSON.stringify(S.draft));
    closeSheet();
    refresh();
  }

  // ═══════════════════════════════════════════════════════════════
  // BUILD OVERLAY
  // ═══════════════════════════════════════════════════════════════
  function buildOverlay(){
    var el=$('skhDiscoverEngine');
    if(el&&el.querySelector('.dc88-header')) return el;

    if(!el){
      el=document.createElement('div');
      el.id='skhDiscoverEngine';
      document.body.appendChild(el);
    }

    // Clear any inline styles from 81's placeholder, but KEEP class for 75's CSS
    el.style.cssText = '';
    el.className = 'skh-discover-engine';

    el.innerHTML='<div class="dc88-header">'
      +'<div class="dc88-top">'
      +'<div><div class="dc88-logo"><div class="dc88-logo-mark">S</div>SokoHai</div><div class="dc88-subtitle">'+T('Mtandao wa Ugunduzi','Global Discovery Network')+'</div></div>'
      +'<div style="display:flex;align-items:center;gap:10px"><div class="dc88-title">'+T('Gundua','Discover')+'</div><button data-dc88-close class="dc88-close-btn" title="'+T('Rudi SokoHai','Back to SokoHai')+'">×</button></div>'
      +'</div>'
      +'<div class="dc88-search"><span class="dc88-search-icon">⌕</span><input id="skhDiscoverEngineInput" type="text" autocomplete="off" placeholder="'+T('Tafuta bidhaa, mtu, biashara, huduma...','Search products, people, businesses, services...')+'"><button data-dc88-search-btn>'+T('Tafuta','Search')+'</button></div>'
      +renderTabs()
      +'</div>'
      +'<div class="dc88-body skh-de-body" id="skhDiscoverEngineBody"></div>';

    return el;
  }

  // ═══════════════════════════════════════════════════════════════
  // FIND ITEM
  // ═══════════════════════════════════════════════════════════════
  function findItem(id){
    if(!S.sections||!id) return null;
    var all=[].concat(
      S.sections.products||[],S.sections.services||[],S.sections.people||[],
      S.sections.businesses||[],S.sections.nearbyBusinesses||[],
      S.sections.transporters||[],S.sections.groups||[]
    );
    for(var i=0;i<all.length;i++){
      var l=all[i].listing||all[i];
      if(l.entityId===id) return all[i];
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════
  // OPEN / CLOSE
  // ═══════════════════════════════════════════════════════════════
  function openDiscover(query){
    injectCSS();
    var el=buildOverlay();
    el.classList.add('open');
    document.body.style.overflow='hidden';

    // Set initial content
    S.view='home';
    S.detail=null;
    refresh();

    // Focus input
    var inp=$('skhDiscoverEngineInput');
    if(inp){
      if(query){
        inp.value=query;
      }
      setTimeout(function(){inp.focus();},100);
    }

    // Always load data (even without query - shows popular/recommended items)
    doSearch(query || '');

    // Add click listener to intercept 75's handlers
    if (!el.__dc88DetailHandler) {
      el.addEventListener('click', function(ev) {
        var t = ev.target;
        if (!t) return;
        var btn = t.closest ? t.closest('[data-act]') : null;
        if (!btn) return;
        var act = btn.getAttribute('data-act');

        // Intercept de-close-detail (back from detail view)
        if (act === 'de-close-detail' || act === 'de-back-home') {
          ev.stopImmediatePropagation();
          ev.preventDefault();
          S.view = 'home';
          S.detail = null;
          S.detailType = null;
          refresh();
          return;
        }

        // Intercept de-view-person (open person detail inside Discover)
        if (act === 'de-view-person') {
          ev.stopImmediatePropagation();
          ev.preventDefault();
          var id = btn.getAttribute('data-id');
          // Find person data
          var personItem = findItem(id);
          if (personItem) {
            S.detail = personItem;
            S.view = 'detail';
            S.detailType = 'person';
            refresh();
            var body2 = $('skhDiscoverEngineBody');
            if (body2) body2.scrollTop = 0;
          }
          return;
        }

        // Intercept de-view-group (open group detail inside Discover)
        if (act === 'de-view-group') {
          ev.stopImmediatePropagation();
          ev.preventDefault();
          var gid = btn.getAttribute('data-id');
          var groupItem = findItem(gid);
          if (groupItem) {
            S.detail = groupItem;
            S.view = 'detail';
            S.detailType = 'group';
            refresh();
            var body3 = $('skhDiscoverEngineBody');
            if (body3) body3.scrollTop = 0;
          }
          return;
        }

        // Intercept de-join-group
        if (act === 'de-join-group') {
          ev.stopImmediatePropagation();
          ev.preventDefault();
          var gid2 = btn.getAttribute('data-id');
          if (window.skhOpenGroupSoga) {
            closeDiscover();
            window.skhOpenGroupSoga(gid2);
          }
          return;
        }
      }, true); // useCapture: true to run before 75's handler
      el.__dc88DetailHandler = true;
    }
  }

  function closeDiscover(){
    var el=$('skhDiscoverEngine');
    if(el) el.classList.remove('open');
    document.body.style.overflow='auto';
  }

  // ═══════════════════════════════════════════════════════════════
  // OVERRIDE skhDiscoverEngineOpen — MARA MOJA, bila kusubiri 75
  // ═══════════════════════════════════════════════════════════════
  
  // Tumia Object.defineProperty ili KUZUIA 75 kubadilisha skhDiscoverEngineOpen
  // Hii ni njia ya uhakika — 75 haiwezi kubadilisha hata ikijaribu
  var _lockedOpen = function(query, opts) {
    openDiscover(query);
  };
  _lockedOpen.__dc88override = true;

  var _lockedClose = function() {
    closeDiscover();
  };
  _lockedClose.__dc88override = true;

  // Jaribu kutumia defineProperty (inaweza kushindwa kama property haiwezi kubadilishwa)
  try {
    Object.defineProperty(window, 'skhDiscoverEngineOpen', {
      get: function() { return _lockedOpen; },
      set: function(fn) {
        // 75 inajaribu kubadilisha — ignore (keep our version)
        console.log('[88] Blocked 75 from overriding skhDiscoverEngineOpen');
      },
      configurable: true,
      enumerable: true
    });

    Object.defineProperty(window, 'skhDiscoverEngineClose', {
      get: function() { return _lockedClose; },
      set: function(fn) {
        // 75 inajaribu kubadilisha — ignore
      },
      configurable: true,
      enumerable: true
    });
  } catch(e) {
    // Fallback: patch mara nyingi
    window.skhDiscoverEngineOpen = _lockedOpen;
    window.skhDiscoverEngineClose = _lockedClose;
    [200, 500, 1200, 2000, 5000].forEach(function(delay) {
      setTimeout(function() {
        window.skhDiscoverEngineOpen = _lockedOpen;
        window.skhDiscoverEngineClose = _lockedClose;
      }, delay);
    });
  }

  console.log('[88] Discover Complete System ready');

  // ═══════════════════════════════════════════════════════════════
  // EVENT DELEGATION
  // ═══════════════════════════════════════════════════════════════
  document.addEventListener('click',function(ev){
    var t=ev.target;
    if(!t) return;

    // Tab click
    var tab=t.closest?t.closest('[data-dc88-tab]'):null;
    if(tab){
      ev.preventDefault();ev.stopPropagation();
      S.entity=tab.getAttribute('data-dc88-tab');
      S.view='home';S.detail=null;S.detailType=null;
      S.applied={};
      if(S.query) doSearch(S.query);
      else refresh();
      return;
    }

    // Close Discover (× button)
    if(t.closest&&t.closest('[data-dc88-close]')){
      ev.preventDefault();ev.stopPropagation();
      closeDiscover();
      return;
    }

    // Open filters
    if(t.closest&&t.closest('[data-dc88-open-filters]')){
      ev.preventDefault();ev.stopPropagation();
      openSheet();
      return;
    }

    // Remove filter chip
    var rm=t.closest?t.closest('[data-dc88-rm]'):null;
    if(rm){
      ev.preventDefault();ev.stopPropagation();
      removeFilter(rm.getAttribute('data-section'),rm.getAttribute('data-value'));
      return;
    }

    // Toggle filter option
    var tog=t.closest?t.closest('[data-dc88-toggle]'):null;
    if(tog){
      ev.preventDefault();ev.stopPropagation();
      toggleDraft(tog.getAttribute('data-section'),tog.getAttribute('data-value'));
      return;
    }

    // Close sheet
    if(t.closest&&t.closest('[data-dc88-close-sheet]')){
      ev.preventDefault();closeSheet();return;
    }

    // Reset filters
    if(t.closest&&t.closest('[data-dc88-reset]')){
      ev.preventDefault();S.draft={};renderSheet();return;
    }

    // Apply filters
    if(t.closest&&t.closest('[data-dc88-apply]')){
      ev.preventDefault();applyFilters();return;
    }

    // Detail view
    var det=t.closest?t.closest('[data-dc88-detail]'):null;
    if(det){
      ev.preventDefault();ev.stopPropagation();
      var id=det.getAttribute('data-id');
      var dtype=det.getAttribute('data-type')||'';
      var item=findItem(id);
      if(item){
        S.detail=item;
        S.view='detail';
        // Set detailType for entity-specific rendering
        var entityType=(item.listing||item).entityType||'';
        if(entityType==='PERSON'||dtype==='person') S.detailType='person';
        else if(entityType==='GROUP'||dtype==='group') S.detailType='group';
        else S.detailType=null;
        refresh();
        var body=$('skhDiscoverEngineBody');
        if(body) body.scrollTop=0;
      }
      return;
    }

    // Back button
    if(t.closest&&t.closest('[data-dc88-back]')){
      ev.preventDefault();ev.stopPropagation();
      S.view='home';S.detail=null;S.detailType=null;
      refresh();
      return;
    }

    // Chat button (de-chat handled by 75's global handler)
    var chat=t.closest?t.closest('[data-dc88-chat]'):null;
    if(chat){
      ev.preventDefault();ev.stopPropagation();
      var cid=chat.getAttribute('data-id');
      var cname=chat.getAttribute('data-name');
      if(cid&&window.openChatWithUser){
        // Weka __skhOpening ili attachConversation isifunge chatModal (instant open)
        window.__skhOpening = { uid: cid, at: Date.now() };
        // Fungua chatModal MARA MOJA na loading indicator
        var cm=document.getElementById('chatModal');
        if(cm){
          cm.style.display='flex';
          cm.style.opacity='1';
          cm.style.transform='none';
          var cw=document.getElementById('chatWith');
          if(cw) cw.textContent=cname||'Chat';
        }
        // Funga Discover
        closeDiscover();
        // Ita openChatWithUser — itapakia data background
        try {
          window.openChatWithUser(cid, cname);
        } catch(e) {
          console.warn('[88 chat error]', e);
        }
      }
      return;
    }

    // Search button
    if(t.closest&&t.closest('[data-dc88-search-btn]')){
      ev.preventDefault();
      var inp=$('skhDiscoverEngineInput');
      if(inp) doSearch(inp.value.trim());
      return;
    }
  },true);

  // Input handler
  document.addEventListener('input',function(ev){
    if(ev.target&&ev.target.id==='skhDiscoverEngineInput'){
      var val=ev.target.value;
      clearTimeout(S.timer);
      if(!val){
        S.query='';
        // [PHASE 6 FIX] Badala ya kuacha skrini tupu, rudisha feed ya ugunduzi ya kawaida
        doSearch('');
        return;
      }
      S.timer=setTimeout(function(){
        doSearch(val.trim());
      },400);
    }
  },true);

  // Enter key
  document.addEventListener('keydown',function(ev){
    if(ev.target&&ev.target.id==='skhDiscoverEngineInput'&&ev.key==='Enter'){
      ev.preventDefault();
      doSearch(ev.target.value.trim());
    }
    // Android back / Escape
    if(ev.key==='Escape'){
      var sh=$('dc88Sheet');
      if(sh&&sh.classList.contains('show')){
        closeSheet();
      } else {
        var el=$('skhDiscoverEngine');
        if(el&&el.classList.contains('open')){
          if(S.view==='detail'){
            S.view='home';S.detail=null;S.detailType=null;refresh();
          } else {
            closeDiscover();
          }
        }
      }
    }
  },true);

  // Expose API
  window.SKH_DISCOVER_COMPLETE={
    open:openDiscover,
    close:closeDiscover,
    search:doSearch,
    state:S
  };

})();
