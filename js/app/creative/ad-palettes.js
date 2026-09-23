/* SokoHai Creator Studio — CANONICAL advertisement design tokens.
   Single source of truth for: Design Palettes (70, grouped), CTA presets/icons, Ad categories.
   Loaded as a plain script so the legacy form, the Home renderer (js/06-announcement.js)
   and the ES-module Creative Studio (js/app/95-creative-studio.js) consume the SAME tokens.
   The 8 legacy palettes (emerald…neon) keep their exact pre-expansion base values and IDs.
   Token architecture: 22 tokens per palette (background…glow) — same canonical fields. */
(function(){
  'use strict';
  if(window.SKH_AD_PALETTES)return;
  const clamp255=n=>Math.max(0,Math.min(255,Math.round(n)));
  function shade(hex,pct){ // pct -100..100 (negative=darker)
    const h=String(hex||'').replace('#','');
    if(!/^[0-9a-f]{6}$/i.test(h))return hex;
    const f=pct<0?0:255,p=Math.abs(pct)/100;
    const ch=i=>{const v=parseInt(h.slice(i,i+2),16);return clamp255(v+(f-v)*p).toString(16).padStart(2,'0');};
    return '#'+ch(0)+ch(2)+ch(4);
  }
  function rgba(hex,a){
    const h=String(hex||'').replace('#','');if(!/^[0-9a-f]{6}$/i.test(h))return hex;
    const v=i=>parseInt(h.slice(i,i+2),16);return `rgba(${v(0)},${v(2)},${v(4)},${a})`;
  }
  /* Palette groups — logical sections for a large collection (no new navigation system,
     just labelled sections inside the EXISTING selectors). */
  const GROUPS=[
    {id:'classics',label:'Classics'},
    {id:'nature',label:'Nature / Earth'},
    {id:'blue',label:'Blue / Professional'},
    {id:'luxury',label:'Luxury / Metallic'},
    {id:'warm',label:'Warm / Promotional'},
    {id:'soft',label:'Purple / Soft'},
    {id:'future',label:'Futuristic'},
    {id:'corporate',label:'Business / Corporate'},
    {id:'neutral',label:'Neutral / Clean'}
  ];
  /* def: {label, group, base:[primary, accent, headline, surface, frameOpacity%],
           cta:[ctaBackground,ctaText], grad? [start,middle,end], bg? background-override }
     Legacy 8: values frozen at the pre-expansion generation. */
  const DEFS={
    /* ================= CLASSICS (legacy, IDs + values immutable) ================= */
    emerald:{label:'Emerald',group:'classics',base:['#0E7A5F','#18A982','#FFFFFF','#FFFFFF',42],cta:['#F4C542','#102A43']},
    ocean:{label:'Ocean',group:'classics',base:['#075E73','#2697B8','#FFFFFF','#FFFFFF',48],cta:['#F4C542','#102A43']},
    royal:{label:'Royal',group:'classics',base:['#343A8F','#7559C7','#FFFFFF','#FFFFFF',50],cta:['#F4C542','#102A43']},
    sunset:{label:'Sunset',group:'classics',base:['#A83E27','#E49A36','#FFFFFF','#FFFDFC',55],cta:['#F59E0B','#451A03']},
    mono:{label:'Mono',group:'classics',base:['#1F2937','#6B7280','#FFFFFF','#FFFFFF',36],cta:['#F59E0B','#111827']},
    gold:{label:'Gold Luxury',group:'classics',base:['#1E2229','#D4AF37','#FFFFFF','#111827',85],cta:['#D4AF37','#1E2229']},
    rose:{label:'Rose',group:'classics',base:['#881337','#E11D48','#FFFFFF','#FFF1F2',50],cta:['#FBBF24','#881337']},
    neon:{label:'Neon',group:'classics',base:['#064E3B','#10B981','#A7F3D0','#064E3B',60],cta:['#10B981','#064E3B']},
    /* ================= NATURE / EARTH ================= */
    forest:{label:'Forest',group:'nature',base:['#14532D','#4ADE80','#FFFFFF','#FFFFFF',48],cta:['#4ADE80','#052E16']},
    mint:{label:'Mint',group:'nature',base:['#A7F3D0','#059669','#064E3B','#F0FDF9',32],cta:['#059669','#FFFFFF'],grad:['#A7F3D0','#6EE7B7','#34D399'],bg:'#A7F3D0'},
    sage:{label:'Sage',group:'nature',base:['#A3B18A','#588157','#223018','#FAFAF4',30],cta:['#588157','#FFFFFF'],grad:['#A3B18A','#8B9B6E','#6B8E5A'],bg:'#A3B18A'},
    olive:{label:'Olive',group:'nature',base:['#4E5A20','#C0B236','#FFFFFF','#FBFAF0',44],cta:['#C0B236','#2E340F']},
    tropical:{label:'Tropical',group:'nature',base:['#15803D','#FDE047','#FFFFFF','#F6FEF8',45],cta:['#FDE047','#14532D']},
    earth:{label:'Earth',group:'nature',base:['#5C4033','#E0A458','#FFFFFF','#FAF6F0',46],cta:['#E0A458','#3E2B21']},
    sand:{label:'Sand',group:'nature',base:['#E7D3AF','#A4762B','#4A3415','#FCF8EF',26],cta:['#A4762B','#FFFFFF'],grad:['#E7D3AF','#DCC092','#C29A53'],bg:'#E7D3AF'},
    terra:{label:'Terra',group:'nature',base:['#B5533C','#F0B08C','#FFFFFF','#FDF6F2',47],cta:['#8E3A28','#FFE9DE']},
    /* ================= BLUE / PROFESSIONAL ================= */
    sky:{label:'Sky',group:'blue',base:['#0369A1','#38BDF8','#FFFFFF','#F0F9FF',45],cta:['#38BDF8','#082F49']},
    azure:{label:'Azure',group:'blue',base:['#0078D4','#50E6FF','#FFFFFF','#F2F9FF',46],cta:['#50E6FF','#003B66']},
    cobalt:{label:'Cobalt',group:'blue',base:['#0047AB','#6B9BFF','#FFFFFF','#F2F6FF',50],cta:['#6B9BFF','#001B45']},
    deep_ocean:{label:'Deep Ocean',group:'blue',base:['#023858','#0AB1DB','#FFFFFF','#EFF7FA',52],cta:['#0AB1DB','#012A44']},
    midnight:{label:'Midnight',group:'blue',base:['#101D42','#8FA3FF','#FFFFFF','#F4F6FC',60],cta:['#8FA3FF','#0B1530']},
    arctic:{label:'Arctic',group:'blue',base:['#E0F2FE','#0284C7','#075985','#F8FDFF',24],cta:['#0284C7','#FFFFFF'],grad:['#E0F2FE','#BAE6FD','#7DD3FC'],bg:'#E0F2FE'},
    cyan:{label:'Cyan',group:'blue',base:['#0E7490','#22D3EE','#FFFFFF','#ECFEFF',44],cta:['#22D3EE','#083344']},
    electric_blue:{label:'Electric Blue',group:'blue',base:['#1239E6','#00E0FF','#FFFFFF','#F2F5FF',52],cta:['#00E0FF','#001A66']},
    /* ================= LUXURY / METALLIC ================= */
    black_gold:{label:'Black Gold',group:'luxury',base:['#0B0B0F','#D4AF37','#F7F0DC','#FAF8F2',72],cta:['#D4AF37','#000000']},
    champagne:{label:'Champagne',group:'luxury',base:['#EADDC5','#B08D57','#4A3820','#FBF7EE',26],cta:['#B08D57','#FFFFFF'],grad:['#EADDC5','#DECBA6','#C5A067'],bg:'#EADDC5'},
    platinum:{label:'Platinum',group:'luxury',base:['#E5E4E2','#8B8D8F','#2F3235','#FAFAFA',24],cta:['#6B6E73','#FFFFFF'],grad:['#E5E4E2','#D1D0CE','#ADAEB0'],bg:'#E5E4E2'},
    silver:{label:'Silver',group:'luxury',base:['#C0C7CE','#6E7B87','#1F2A33','#F6F8FA',26],cta:['#566573','#FFFFFF'],grad:['#C0C7CE','#A6AEB6','#8A97A3'],bg:'#C0C7CE'},
    ivory:{label:'Ivory',group:'luxury',base:['#F5F1E6','#A88F5B','#3E3621','#FFFEF9',22],cta:['#A88F5B','#FFFFFF'],grad:['#F5F1E6','#EDE4CF','#D3BE92'],bg:'#F5F1E6'},
    burgundy:{label:'Burgundy',group:'luxury',base:['#581C2B','#D96A82','#FFFFFF','#FDF3F5',48],cta:['#D96A82','#3B0E1A']},
    royal_gold:{label:'Royal Gold',group:'luxury',base:['#2E1F10','#C9A227','#FFFFFF','#FBF7EC',56],cta:['#C9A227','#1E1508']},
    velvet:{label:'Velvet',group:'luxury',base:['#40204C','#C77DBB','#FFFFFF','#FAF2FB',54],cta:['#C77DBB','#2A1033']},
    /* ================= WARM / PROMOTIONAL ================= */
    fire:{label:'Fire',group:'warm',base:['#B91C1C','#F97316','#FFFFFF','#FFF7ED',55],cta:['#FFB02E','#4A1804']},
    coral:{label:'Coral',group:'warm',base:['#FF6F61','#FFB4A2','#5F130E','#FFF3F0',40],cta:['#B23B2E','#FFFFFF']},
    amber:{label:'Amber',group:'warm',base:['#B45309','#FBBF24','#FFFFFF','#FFFBEB',48],cta:['#FBBF24','#422006']},
    orange:{label:'Orange',group:'warm',base:['#C2410C','#FB923C','#FFFFFF','#FFF7ED',50],cta:['#FB923C','#431407']},
    mango:{label:'Mango',group:'warm',base:['#F2B705','#E07B00','#4A3300','#FFFCF0',38],cta:['#8A5200','#FFFFFF']},
    peach:{label:'Peach',group:'warm',base:['#FFC9A3','#F0804D','#5C2A12','#FFF5EC',28],cta:['#C05727','#FFFFFF'],grad:['#FFC9A3','#FFB288','#F79C6B'],bg:'#FFC9A3'},
    cherry:{label:'Cherry',group:'warm',base:['#8E0E2F','#FF4D6D','#FFFFFF','#FFF0F3',46],cta:['#FF4D6D','#4A0217']},
    crimson:{label:'Crimson',group:'warm',base:['#B3122F','#FF6B81','#FFFFFF','#FFF2F4',50],cta:['#FF6B81','#45000F']},
    /* ================= PURPLE / SOFT ================= */
    lavender:{label:'Lavender',group:'soft',base:['#C4B5FD','#7C3AED','#3B1A74','#F7F4FF',28],cta:['#7C3AED','#FFFFFF'],grad:['#C4B5FD','#B39DFB','#9B6DF8'],bg:'#C4B5FD'},
    violet:{label:'Violet',group:'soft',base:['#5B21B6','#A78BFA','#FFFFFF','#F5F3FF',52],cta:['#A78BFA','#2E1065']},
    lilac:{label:'Lilac',group:'soft',base:['#DDB3E8','#A864C4','#442058','#FBF4FD',26],cta:['#A864C4','#FFFFFF'],grad:['#DDB3E8','#CE9FDC','#BA84D0'],bg:'#DDB3E8'},
    soft_rose:{label:'Soft Rose',group:'soft',base:['#F8C3D6','#DB2777','#5C1033','#FFF4F8',30],cta:['#DB2777','#FFFFFF'],grad:['#F8C3D6','#F3A9C4','#E87FA9'],bg:'#F8C3D6'},
    blush:{label:'Blush',group:'soft',base:['#FADBD8','#C25E68','#6E2B33','#FEF7F6',24],cta:['#C25E68','#FFFFFF'],grad:['#FADBD8','#F2C1BE','#DA9099'],bg:'#FADBD8'},
    powder_blue:{label:'Powder Blue',group:'soft',base:['#D2E5F6','#4A7FB8','#1E3F63','#F5FAFF',24],cta:['#4A7FB8','#FFFFFF'],grad:['#D2E5F6','#BAD6EF','#8AB4DF'],bg:'#D2E5F6'},
    cream:{label:'Cream',group:'soft',base:['#FAF3DD','#B98A44','#4E3C19','#FFFDF5',22],cta:['#B98A44','#FFFFFF'],grad:['#FAF3DD','#F3E7C3','#D8BC85'],bg:'#FAF3DD'},
    cloud:{label:'Cloud',group:'soft',base:['#EDF1F7','#64748B','#273647','#FAFCFE',22],cta:['#64748B','#FFFFFF'],grad:['#EDF1F7','#DEE6F0','#BCC9D8'],bg:'#EDF1F7'},
    /* ================= FUTURISTIC ================= */
    electric:{label:'Electric',group:'future',base:['#5C00E0','#00F5D4','#FFFFFF','#F6F1FF',55],cta:['#00F5D4','#0B0420']},
    cyber:{label:'Cyber',group:'future',base:['#0A0F14','#00E5FF','#E0F7FF','#F3FAFC',66],cta:['#00E5FF','#041017']},
    hyper_neon:{label:'Hyper Neon',group:'future',base:['#0F0F12','#A8FF00','#F0FFE4','#F7FFF0',64],cta:['#A8FF00','#101203']},
    lime:{label:'Lime',group:'future',base:['#3F6212','#A3E635','#FFFFFF','#F7FEE7',45],cta:['#A3E635','#1A2E05']},
    magenta:{label:'Magenta',group:'future',base:['#B80E81','#FF4DD2','#FFFFFF','#FFF0FB',50],cta:['#FF4DD2','#4A0032']},
    electric_purple:{label:'Electric Purple',group:'future',base:['#6D28D9','#E879F9','#FFFFFF','#F8F0FF',55],cta:['#E879F9','#2E0257']},
    electric_cyan:{label:'Electric Cyan',group:'future',base:['#053B46','#00E8E8','#E9FFFF','#EFFBFB',58],cta:['#00E8E8','#03333A']},
    /* ================= BUSINESS / CORPORATE ================= */
    professional_blue:{label:'Professional Blue',group:'corporate',base:['#335C81','#7FAECC','#FFFFFF','#F3F7FB',46],cta:['#7FAECC','#0E2A44']},
    corporate_navy:{label:'Corporate Navy',group:'corporate',base:['#1B2A41','#3E5C76','#FFFFFF','#F4F7FA',58],cta:['#3E5C76','#FFFFFF']},
    trust_blue:{label:'Trust Blue',group:'corporate',base:['#155E97','#5BA8D5','#FFFFFF','#F1F8FC',48],cta:['#5BA8D5','#082A44']},
    executive:{label:'Executive',group:'corporate',base:['#262E3C','#8C1D40','#FFFFFF','#F6F7F9',55],cta:['#8C1D40','#FFFFFF']},
    enterprise:{label:'Enterprise',group:'corporate',base:['#3A4756','#6689A6','#FFFFFF','#F5F8FB',52],cta:['#6689A6','#0F1A26']},
    clean_business:{label:'Clean Business',group:'corporate',base:['#F7F9FB','#2D5AA8','#1A2B45','#FFFFFF',20],cta:['#2D5AA8','#FFFFFF'],grad:['#F7F9FB','#E8EEF6','#C7D6EC'],bg:'#F7F9FB'},
    finance:{label:'Finance',group:'corporate',base:['#20443A','#C9A227','#FFFFFF','#F6F8F4',55],cta:['#C9A227','#14251D']},
    healthcare:{label:'Healthcare',group:'corporate',base:['#E6F4F4','#1E7A86','#0D3B43','#F7FCFC',26],cta:['#1E7A86','#FFFFFF'],grad:['#E6F4F4','#CBE9E9','#8ED0D0'],bg:'#E6F4F4'},
    /* ================= NEUTRAL / CLEAN ================= */
    pure_white:{label:'Pure White',group:'neutral',base:['#1E293B','#94A3B8','#111827','#FFFFFF',16],cta:['#1E293B','#FFFFFF'],grad:['#FFFFFF','#F4F6F9','#E9EDF3'],bg:'#FFFFFF'},
    soft_white:{label:'Soft White',group:'neutral',base:['#3A5068','#8FA9C4','#1D2A38','#FAFCFE',20],cta:['#3A5068','#FFFFFF'],grad:['#FAFCFE','#EEF3F8','#DFE8F2'],bg:'#FAFCFE'},
    warm_white:{label:'Warm White',group:'neutral',base:['#453D33','#B8A586','#2E2820','#FDFBF6',22],cta:['#453D33','#FFFFFF'],grad:['#FDFBF6','#F4EEE2','#E7DCC8'],bg:'#FDFBF6'},
    graphite:{label:'Graphite',group:'neutral',base:['#3A3F44','#7C8A97','#FFFFFF','#F5F6F7',48],cta:['#5E6B77','#FFFFFF']},
    charcoal:{label:'Charcoal',group:'neutral',base:['#191B1E','#4E565F','#FFFFFF','#F5F6F7',56],cta:['#4E565F','#FFFFFF']},
    slate:{label:'Slate',group:'neutral',base:['#41576B','#94A3B8','#FFFFFF','#F4F7FA',46],cta:['#94A3B8','#1E293B']},
    deep_black:{label:'Deep Black',group:'neutral',base:['#0A0A0C','#3F3F46','#FFFFFF','#F4F4F5',70],cta:['#E4E4E7','#09090B']}
  };

  function tokens(id,def){
    const [primary,accent,headlineText,surface,frameOpacity]=def.base;
    const [ctaBackground,ctaText]=def.cta;
    return {
      id,label:def.label,group:def.group,
      background:def.bg||primary,                 // palette visual base
      surface,                                    // card surface color
      surfaceAlt:shade(surface,96)==='#ffffff'&&surface.toLowerCase()!=='#ffffff'?shade(surface,96):shade(surface,90),
      primary,                                    // ad frame + title anchor color
      primaryDark:shade(primary,-28),
      primaryLight:shade(primary,34),
      secondary:accent,
      accent,
      headline:headlineText,
      text:headlineText,
      mutedText:rgba(headlineText,0.72),
      border:rgba(headlineText,0.16),
      ctaBackground,
      ctaText,
      badgeBackground:'#F59E0B',                  // badge colors remain user-controlled
      badgeText:'#FFFFFF',
      overlay:rgba('#000000',0.35),
      gradientStart:def.grad?def.grad[0]:primary,
      gradientMiddle:def.grad?def.grad[1]:shade(primary,-10),
      gradientEnd:def.grad?def.grad[2]:accent,
      shadow:rgba(shade(primary,-40),0.35),
      glow:rgba(accent,0.55),
      frameOpacity:frameOpacity/100
    };
  }
  const PALETTES={};Object.keys(DEFS).forEach(id=>{PALETTES[id]=tokens(id,DEFS[id]);});

  // Canonical CTA label presets. First entry = no CTA is handled by the form itself.
  const CTA_PRESETS=[
    'Angalia Sasa','Jifunze Zaidi','Tembelea','Buy Now','Wasiliana Nasi','Pata Ofa Hii',
    'Agiza Hapa','Piga Simu','Download','Install','Apply Now','Book Appointment','Register','Visit Website',
    // Legacy labels kept selectable so existing ads keep their exact wording:
    'Tazama Zaidi','Nunua Sasa'
  ];

  // Canonical CTA icon map.
  const CTA_ICONS={
    arrow:'→',cart:'🛒',phone:'📞',whatsapp:'💬',star:'⭐',
    download:'⬇',external:'↗',calendar:'📅',location:'📍',none:''
  };

  // Advertisement Category = WHAT is being advertised (creative type = how it looks).
  const AD_CATEGORIES=[
    {id:'general',label:'General Advertisement'},
    {id:'product',label:'Product / Bidhaa'},
    {id:'service',label:'Service / Huduma'},
    {id:'business',label:'Business / Biashara'},
    {id:'app',label:'App / Application'},
    {id:'school',label:'School / Elimu'},
    {id:'hospital',label:'Hospital / Afya'},
    {id:'event',label:'Event / Tukio'},
    {id:'transport',label:'Transport / Usafiri'}
  ];

  window.SKH_AD_PALETTES=Object.freeze(PALETTES);
  window.SKH_AD_PALETTE_GROUPS=Object.freeze(GROUPS);
  window.SKH_CTA_PRESETS=Object.freeze(CTA_PRESETS);
  window.SKH_CTA_ICONS=Object.freeze(CTA_ICONS);
  window.SKH_AD_CATEGORIES=Object.freeze(AD_CATEGORIES);
  window.skhPaletteTokens=function(id){return PALETTES[id]||null;};
  window.skhCtaIcon=function(id){
    if(Object.prototype.hasOwnProperty.call(CTA_ICONS,id))return CTA_ICONS[id];
    return '→';
  };
})();
