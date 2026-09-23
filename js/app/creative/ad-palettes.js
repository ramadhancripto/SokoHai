/* SokoHai Creator Studio — CANONICAL advertisement design tokens.
   Single source of truth for: Design Palettes, CTA presets/icons, Ad categories.
   Loaded as a plain script so both the legacy form (plain/module JS), the Home
   renderer (js/06-announcement.js) and the ES-module Creative Studio
   (js/app/95-creative-studio.js) consume the SAME tokens. No Firebase/DOM work here.
   The 8 palettes preserve the exact legacy skhAdApplyPreset base values. */
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
  // def: [primary, accent(accent/gradient second), headlineText, surface, frameOpacity%]
  const BASE={
    emerald:{label:'Emerald',base:['#0E7A5F','#18A982','#FFFFFF','#FFFFFF',42]},
    ocean:{label:'Ocean',base:['#075E73','#2697B8','#FFFFFF','#FFFFFF',48]},
    royal:{label:'Royal',base:['#343A8F','#7559C7','#FFFFFF','#FFFFFF',50]},
    sunset:{label:'Sunset',base:['#A83E27','#E49A36','#FFFFFF','#FFFDFC',55]},
    mono:{label:'Mono',base:['#1F2937','#6B7280','#FFFFFF','#FFFFFF',36]},
    gold:{label:'Gold Luxury',base:['#1E2229','#D4AF37','#FFFFFF','#111827',85]},
    rose:{label:'Rose',base:['#881337','#E11D48','#FFFFFF','#FFF1F2',50]},
    neon:{label:'Neon',base:['#064E3B','#10B981','#A7F3D0','#064E3B',60]}
  };
  // Extra token choices per palette where a generic derivation would look wrong.
  const OVERRIDES={
    emerald:{ctaBackground:'#F4C542',ctaText:'#102A43'},
    ocean:{ctaBackground:'#F4C542',ctaText:'#102A43'},
    royal:{ctaBackground:'#F4C542',ctaText:'#102A43'},
    sunset:{ctaBackground:'#F59E0B',ctaText:'#451A03'},
    mono:{ctaBackground:'#F59E0B',ctaText:'#111827'},
    gold:{ctaBackground:'#D4AF37',ctaText:'#1E2229'},
    rose:{ctaBackground:'#FBBF24',ctaText:'#881337'},
    neon:{ctaBackground:'#10B981',ctaText:'#064E3B'}
  };
  function tokens(id,def){
    const [primary,accent,headlineText,surface,frameOpacity]=def.base;
    const o=OVERRIDES[id]||OVERRIDES.emerald;
    return {
      id,label:def.label,
      background:primary,                       // ad frame base (legacy primary)
      surface,                                  // legacy card surface color
      surfaceAlt:shade(surface,96)==='#ffffff'&&surface.toLowerCase()!=='#ffffff'?shade(surface,96):shade(surface,90),
      primary,                                  // legacy annPrimaryColor
      primaryDark:shade(primary,-28),
      primaryLight:shade(primary,34),
      secondary:accent,                         // legacy annAccentColor
      accent,
      headline:headlineText,                    // legacy annTextColor
      text:headlineText,
      mutedText:rgba(headlineText,0.72),
      border:rgba(headlineText,0.16),
      ctaBackground:o.ctaBackground,
      ctaText:o.ctaText,
      badgeBackground:'#F59E0B',                // badge colors stay user-controlled; palette only suggests
      badgeText:'#FFFFFF',
      overlay:rgba('#000000',0.35),
      gradientStart:primary,
      gradientMiddle:shade(primary,-10),
      gradientEnd:accent,
      shadow:rgba(shade(primary,-40),0.35),
      glow:rgba(accent,0.55),
      frameOpacity:frameOpacity/100             // legacy annFrameOpacity (0..1)
    };
  }
  const PALETTES={};Object.keys(BASE).forEach(id=>{PALETTES[id]=tokens(id,BASE[id]);});

  // Canonical CTA label presets (brief). First entry = no CTA is handled by the form itself.
  const CTA_PRESETS=[
    'Angalia Sasa','Jifunze Zaidi','Tembelea','Buy Now','Wasiliana Nasi','Pata Ofa Hii',
    'Agiza Hapa','Piga Simu','Download','Install','Apply Now','Book Appointment','Register','Visit Website',
    // Legacy labels kept selectable so existing ads keep their exact wording:
    'Tazama Zaidi','Nunua Sasa'
  ];

  // Canonical CTA icon map. Renderer falls back to this exact inline map when this file is absent.
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
  window.SKH_CTA_PRESETS=Object.freeze(CTA_PRESETS);
  window.SKH_CTA_ICONS=Object.freeze(CTA_ICONS);
  window.SKH_AD_CATEGORIES=Object.freeze(AD_CATEGORIES);
  window.skhPaletteTokens=function(id){return PALETTES[id]||null;};
  window.skhCtaIcon=function(id){
    if(Object.prototype.hasOwnProperty.call(CTA_ICONS,id))return CTA_ICONS[id];
    return '→';
  };
})();
