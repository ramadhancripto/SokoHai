/* SVG rendering & Image processing pipeline for SokoHai Creative Studio. */
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=0)=>Number.isFinite(+v)?+v:d;

function lines(text,width,fontSize){
  const max=Math.max(2,Math.floor(width/(fontSize*.57))),words=String(text||'').split(/\s+/),out=[];
  let line='';
  words.forEach(w=>{
    if((line+' '+w).trim().length>max&&line){out.push(line);line=w;}
    else line=(line+' '+w).trim();
  });
  if(line)out.push(line);
  return out.slice(0,16);
}

function filterId(l){return `fx_${String(l.id).replace(/[^a-z0-9_]/gi,'')}`;}

function defs(c){
  const bg=c.background||{};
  const rad=(num(bg.angle,135)*Math.PI)/180;
  const x1=Math.round(50+Math.cos(rad-Math.PI)*50)+'%',y1=Math.round(50+Math.sin(rad-Math.PI)*50)+'%';
  const x2=Math.round(50+Math.cos(rad)*50)+'%',y2=Math.round(50+Math.sin(rad)*50)+'%';
  let s=`<defs>
    <linearGradient id="bgGrad" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
      <stop offset="0%" stop-color="${esc(bg.color||'#0E7A5F')}"/>
      <stop offset="100%" stop-color="${esc(bg.color2||bg.color||'#075C7A')}"/>
    </linearGradient>
    <radialGradient id="bgRadial" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${esc(bg.color2||'#18A982')}"/>
      <stop offset="100%" stop-color="${esc(bg.color||'#0E7A5F')}"/>
    </radialGradient>
    <pattern id="pat_dots" width="28" height="28" patternUnits="userSpaceOnUse">
      <circle cx="4" cy="4" r="2.5" fill="#ffffff" opacity=".4"/>
    </pattern>
    <pattern id="pat_grid" width="44" height="44" patternUnits="userSpaceOnUse">
      <path d="M44 0H0V44" fill="none" stroke="#ffffff" opacity=".3" stroke-width="1.5"/>
    </pattern>
    <pattern id="pat_lines" width="20" height="20" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="20" y2="0" stroke="#ffffff" opacity=".35" stroke-width="2"/>
    </pattern>
    <pattern id="pat_diagonal" width="30" height="30" patternUnits="userSpaceOnUse">
      <line x1="0" y1="30" x2="30" y2="0" stroke="#ffffff" opacity=".35" stroke-width="2"/>
    </pattern>
    <pattern id="pat_waves" width="60" height="24" patternUnits="userSpaceOnUse">
      <path d="M0 12 Q15 0 30 12 T60 12" fill="none" stroke="#ffffff" opacity=".3" stroke-width="2"/>
    </pattern>
    <pattern id="pat_geometric" width="40" height="40" patternUnits="userSpaceOnUse">
      <polygon points="0,0 20,40 40,0" fill="none" stroke="#ffffff" opacity=".25" stroke-width="1.5"/>
    </pattern>
    <pattern id="pat_circles" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="20" cy="20" r="14" fill="none" stroke="#ffffff" opacity=".3" stroke-width="2"/>
    </pattern>
    <pattern id="pat_squares" width="36" height="36" patternUnits="userSpaceOnUse">
      <rect x="6" y="6" width="24" height="24" fill="none" stroke="#ffffff" opacity=".25" stroke-width="2"/>
    </pattern>`;

  c.layers.forEach(l=>{
    const st=l.style||{},f=st.filter||{};
    const temp=num(f.temperature,0);
    const hueRotate=temp*0.4;
    s+=`<filter id="${filterId(l)}" x="-30%" y="-30%" width="160%" height="160%">
      <feColorMatrix type="saturate" values="${num(f.saturation,100)/100}"/>
      <feColorMatrix type="hueRotate" values="${hueRotate}"/>
      <feComponentTransfer>
        <feFuncR type="linear" slope="${num(f.contrast,100)/100}" intercept="${(num(f.brightness,100)-num(f.contrast,100))/200}"/>
        <feFuncG type="linear" slope="${num(f.contrast,100)/100}" intercept="${(num(f.brightness,100)-num(f.contrast,100))/200}"/>
        <feFuncB type="linear" slope="${num(f.contrast,100)/100}" intercept="${(num(f.brightness,100)-num(f.contrast,100))/200}"/>
      </feComponentTransfer>
      <feGaussianBlur stdDeviation="${num(f.blur,0)}"/>
    </filter>`;
  });
  return s+'</defs>';
}

function layerSvg(l){
  if(l.visible===false)return '';
  const st=l.style||{};
  const t=`translate(${num(l.x)} ${num(l.y)}) rotate(${num(l.rotation)} ${num(l.width)/2} ${num(l.height)/2}) scale(${st.flipX?-1:1} ${st.flipY?-1:1})`;
  const common=`data-layer-id="${esc(l.id)}" opacity="${num(l.opacity,1)}" transform="${t}" filter="url(#${filterId(l)})"`;

  if(l.type==='text'){
    const fs=num(st.fontSize,48),lh=fs*num(st.lineHeight,1.1),ls=lines(l.content,l.width,fs);
    const anchor=st.textAlign==='center'?'middle':st.textAlign==='right'?'end':'start';
    const x=anchor==='middle'?l.width/2:anchor==='end'?l.width:0;
    let tsp='';
    ls.forEach((line,i)=>{
      const formatted=st.textTransform==='uppercase'?line.toUpperCase():st.textTransform==='lowercase'?line.toLowerCase():line;
      tsp+=`<tspan x="${x}" dy="${i?lh:fs}">${esc(formatted)}</tspan>`;
    });
    const shadow=num(st.shadowOpacity)>0||num(st.glowBlur)>0
      ?`style="filter:drop-shadow(${num(st.shadowX)}px ${num(st.shadowY)}px ${num(st.shadowBlur||st.glowBlur)}px ${esc(st.shadowColor||st.glowColor||'#000000')}88)"`:'';
    const bgRect=st.backgroundColor&&st.backgroundColor!=='transparent'
      ?`<rect x="-${num(st.padding,0)}" y="0" width="${num(l.width)+2*num(st.padding,0)}" height="${num(l.height)}" rx="${num(st.radius,0)}" fill="${esc(st.backgroundColor)}"/>`:'' ;

    return `<g ${common}>${bgRect}<text x="${x}" y="0" text-anchor="${anchor}" fill="${esc(st.fill||'#102A43')}" font-family="${esc(st.fontFamily||'Inter')}" font-size="${fs}" font-weight="${num(st.fontWeight,600)}" font-style="${esc(st.fontStyle||'normal')}" text-decoration="${esc(st.textDecoration||'none')}" letter-spacing="${num(st.letterSpacing)}" stroke="${esc(st.stroke||'none')}" stroke-width="${num(st.strokeWidth)}" stroke-opacity="${num(st.strokeOpacity,1)}" ${shadow}>${tsp}</text></g>`;
  }

  if(l.type==='image'){
    const imgSrc=esc(l.cutoutDataUrl||st.cutoutDataUrl||l.src||st.originalSrc||'');
    const shape=st.frameShape||'rounded';
    let rx=num(st.radius,20);
    if(shape==='circle')rx=Math.min(num(l.width),num(l.height))/2;
    if(shape==='square')rx=0;

    let polaroidFrame='';
    if(shape==='polaroid'){
      polaroidFrame=`<rect width="${num(l.width)}" height="${num(l.height)}" fill="#ffffff" rx="12" filter="drop-shadow(0 10px 25px rgba(0,0,0,0.25))"/><rect x="16" y="16" width="${num(l.width)-32}" height="${num(l.height)-75}" rx="8" fill="#f1f5f9"/>`;
    }

    return `<g ${common}>
      ${polaroidFrame}
      <clipPath id="clip_${esc(l.id)}">
        <rect ${shape==='polaroid'?'x="16" y="16" width="'+(num(l.width)-32)+'" height="'+(num(l.height)-75)+'"':'width="'+num(l.width)+'" height="'+num(l.height)+'"'} rx="${rx}"/>
      </clipPath>
      <image href="${imgSrc}" crossorigin="anonymous" x="${num(st.cropX)}" y="${num(st.cropY)}" width="${num(l.width)*num(st.zoom,1)}" height="${num(l.height)*num(st.zoom,1)}" preserveAspectRatio="${st.fit==='contain'?'xMidYMid meet':'xMidYMid slice'}" clip-path="url(#clip_${esc(l.id)})"/>
      <rect width="${num(l.width)}" height="${num(l.height)}" rx="${rx}" fill="none" stroke="${esc(st.borderColor||'none')}" stroke-width="${num(st.borderWidth)}"/>
    </g>`;
  }

  if(l.type==='icon'){
    const paths={
      phone:'M7 3l4 4-2 3c2 4 5 7 9 9l3-2 4 4-3 4C12 22 2 12 3 6z',
      location:'M14 27S6 19 6 11a8 8 0 1 1 16 0c0 8-8 16-8 16zm0-12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
      cart:'M3 4h3l3 14h13l3-9H8m3 14a2 2 0 1 0 0 .1m10-.1a2 2 0 1 0 0 .1',
      clock:'M14 3a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm0 5v7l5 3',
      calendar:'M5 7h18v17H5zM9 3v7m10-7v7M5 12h18',
      verified:'M4 15l6 6L25 6',
      star:'M14 3l3 8h9l-7 5 3 9-8-5-8 5 3-9-7-5h9z',
      arrow:'M4 14h21m-7-7 7 7-7 7',
      chat:'M4 5h21v15H12l-7 5V5z',
      delivery:'M3 8h14v12H3zM17 12h6l4 5v3H17M8 23a2 2 0 1 0 0 .1m14-.1a2 2 0 1 0 0 .1',
      price:'M4 5h14l8 9-12 12L4 16zM9 10a2 2 0 1 0 0 .1',
      discount:'M6 23L22 5M8 6a3 3 0 1 0 0 .1m12 14a3 3 0 1 0 0 .1'
    };
    const p=paths[l.icon]||paths.star,scale=Math.min(num(l.width),num(l.height))/30;
    return `<g ${common}>
      <circle cx="${num(l.width)/2}" cy="${num(l.height)/2}" r="${Math.min(num(l.width),num(l.height))/2}" fill="${esc(st.backgroundColor||'transparent')}"/>
      <path d="${p}" transform="translate(${(num(l.width)-30*scale)/2} ${(num(l.height)-30*scale)/2}) scale(${scale})" fill="${['star','price'].includes(l.icon)?esc(st.fill||'#fff'):'none'}" stroke="${esc(st.fill||'#fff')}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;
  }

  const shape=l.shape||'rectangle',fill=esc(st.fill||'#18A982'),stroke=esc(st.borderColor||'none'),sw=num(st.borderWidth);
  if(shape==='circle')return `<ellipse ${common} cx="${num(l.width)/2}" cy="${num(l.height)/2}" rx="${num(l.width)/2}" ry="${num(l.height)/2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  if(shape==='line'||shape==='arrow')return `<g ${common}><line x1="0" y1="${num(l.height)/2}" x2="${num(l.width)}" y2="${num(l.height)/2}" stroke="${fill}" stroke-width="${Math.max(2,sw||8)}"/>${shape==='arrow'?`<path d="M${num(l.width)-25} ${num(l.height)/2-20}L${num(l.width)} ${num(l.height)/2}L${num(l.width)-25} ${num(l.height)/2+20}" fill="none" stroke="${fill}" stroke-width="${Math.max(2,sw||8)}"/>`:''}</g>`;
  return `<rect ${common} width="${num(l.width)}" height="${num(l.height)}" rx="${num(st.radius,16)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
}

export function renderCreativeSvg(c,{guides=false,selectedId=''}={}){
  const w=c.canvas.width,h=c.canvas.height,bg=c.background||{},sorted=[...c.layers].sort((a,b)=>a.zIndex-b.zIndex);
  let background=bg.type==='image'&&bg.imageUrl
    ?`<image href="${esc(bg.imageUrl)}" crossorigin="anonymous" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`
    :bg.type==='radial_gradient'
    ?`<rect width="${w}" height="${h}" fill="url(#bgRadial)"/>`
    :`<rect width="${w}" height="${h}" fill="${bg.type==='gradient'?'url(#bgGrad)':esc(bg.color||'#0E7A5F')}"/>`;

  // Overlay textures & patterns
  const pat=bg.pattern||'none',tex=bg.texture||'none';
  if(pat!=='none'&&pat!=='dots'&&pat!=='grid')background+=`<rect width="${w}" height="${h}" fill="url(#pat_${esc(pat)})" opacity="${num(bg.patternOpacity,.12)}"/>`;
  else if(pat==='dots'||tex==='dots')background+=`<rect width="${w}" height="${h}" fill="url(#pat_dots)" opacity="${num(bg.textureOpacity||bg.patternOpacity,.12)}"/>`;
  else if(pat==='grid'||tex==='grid')background+=`<rect width="${w}" height="${h}" fill="url(#pat_grid)" opacity="${num(bg.textureOpacity||bg.patternOpacity,.12)}"/>`;
  else if(tex&&tex!=='none'&&tex!=='dots'&&tex!=='grid')background+=`<rect width="${w}" height="${h}" fill="url(#pat_dots)" opacity="${num(bg.textureOpacity,.08)}"/>`;

  const guide=guides
    ?`<rect x="${c.canvas.safe}" y="${c.canvas.safe}" width="${w-2*c.canvas.safe}" height="${h-2*c.canvas.safe}" fill="none" stroke="#22D3EE" stroke-width="3" stroke-dasharray="14 12" pointer-events="none"/><path d="M${w/2} 0V${h}M0 ${h/2}H${w}" stroke="#22D3EE" stroke-width="2" opacity=".4" pointer-events="none"/>`
    :'';

  const sel=selectedId?(()=>{
    const l=c.layers.find(x=>x.id===selectedId);if(!l)return'';
    const x=l.x,y=l.y,w=l.width,h=l.height;
    return `<g class="cs-selection">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#38BDF8" stroke-width="4" stroke-dasharray="12 8" pointer-events="none"/>
      <circle data-resize-id="${esc(l.id)}" data-corner="se" cx="${x+w}" cy="${y+h}" r="16" fill="#ffffff" stroke="#0284C7" stroke-width="6" style="cursor:nwse-resize"/>
      <circle data-resize-id="${esc(l.id)}" data-corner="ne" cx="${x+w}" cy="${y}" r="14" fill="#ffffff" stroke="#0284C7" stroke-width="5" style="cursor:nesw-resize"/>
    </g>`;
  })():'';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img" aria-label="${esc(c.title||'Creative design')}">${defs(c)}${background}${sorted.map(layerSvg).join('')}${guide}${sel}</svg>`;
}

export async function exportCreative(c,type='png',quality=.92){
  const svg=renderCreativeSvg(c);
  const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  try{
    const img=new Image();
    img.crossOrigin='anonymous';
    await new Promise((ok,bad)=>{
      img.onload=ok;
      img.onerror=()=>bad(new Error('One or more images could not be loaded for export. Check Cloudinary/CORS access.'));
      img.src=url;
    });
    const canvas=document.createElement('canvas');
    canvas.width=c.canvas.width;canvas.height=c.canvas.height;
    const ctx=canvas.getContext('2d');
    if(type==='jpg'||type==='jpeg'){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);}
    ctx.drawImage(img,0,0);
    return await new Promise((ok,bad)=>canvas.toBlob(b=>b?ok(b):bad(new Error('Export failed.')),type==='jpg'||type==='jpeg'?'image/jpeg':'image/png',quality));
  }finally{
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob,name){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

/* Real client-side canvas Background Removal & Cutout processor */
export async function removeBackgroundClient(imageSrc,options={}){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=()=>{
      try{
        const canvas=document.createElement('canvas');
        canvas.width=img.naturalWidth||img.width;
        canvas.height=img.naturalHeight||img.height;
        const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0);
        const imgData=ctx.getImageData(0,0,canvas.width,canvas.height);
        const data=imgData.data;
        const w=canvas.width,h=canvas.height;

        // Sample corner background pixels for color distance threshold
        const sampleCorner=(x,y)=>{
          const i=(y*w+x)*4;
          return[data[i],data[i+1],data[i+2]];
        };
        const c1=sampleCorner(0,0),c2=sampleCorner(w-1,0),c3=sampleCorner(0,h-1),c4=sampleCorner(w-1,h-1);
        const bgR=Math.round((c1[0]+c2[0]+c3[0]+c4[0])/4);
        const bgG=Math.round((c1[1]+c2[1]+c3[1]+c4[1])/4);
        const bgB=Math.round((c1[2]+c2[2]+c3[2]+c4[2])/4);
        const tol=options.tolerance||38;

        for(let i=0;i<data.length;i+=4){
          const r=data[i],g=data[i+1],b=data[i+2];
          const dist=Math.sqrt((r-bgR)**2+(g-bgG)**2+(b-bgB)**2);
          if(dist<tol){
            data[i+3]=0; // Transparent
          }else if(dist<tol+15){
            data[i+3]=Math.round(((dist-tol)/15)*255); // Smooth feathering
          }
        }
        ctx.putImageData(imgData,0,0);
        resolve(canvas.toDataURL('image/png'));
      }catch(err){
        reject(err);
      }
    };
    img.onerror=()=>reject(new Error('Image could not be loaded for background removal.'));
    img.src=imageSrc;
  });
}
