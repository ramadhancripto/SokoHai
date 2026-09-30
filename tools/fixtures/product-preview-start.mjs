// Controls only for navigating the existing UI; no duplicated product renderer.
const config=await (await fetch('/preview-config.json')).json(),$=id=>document.getElementById(id);
window.liveCatalog=config.live;window.stripUndefined=x=>JSON.parse(JSON.stringify(x));
window.loadAndRenderDashboard=()=>{};
window.closeModals=()=>document.querySelectorAll('.overlay-menu,#editModal').forEach(e=>e.style.display='none');
$('skhBootSplash')?.remove();document.documentElement.classList.remove('skh-booting');
await import('/js/app/06-product-builder.js');await import('/js/app/05-forms.js');await import('/js/app/08-app-state.js');await import('/js/app/12-sys-modes.js');await import('/js/app/39-product-showcase.js');
await import('/js/11-uploads.js');
window.skhProdPicker=skhInitPhotoPicker({galleryInput:'prodImage',cameraInput:'prodImageCam',previewId:'prodImagePreviews',max:6,min:1,hintId:'prodImageCount'});
skh.getOptimizedImageUrl=x=>x;
(0,eval)(config.save);(0,eval)(config.media);
// Existing uploader/picker remains. Only remote Cloudinary HTTP is intercepted:
// selected files become session-local URLs, not a second uploader authority.
const realFetch=window.fetch.bind(window);
window.fetch=async(input,opts)=>{if(String(input).includes('api.cloudinary.com')){const file=opts?.body?.get('file');if(!(file instanceof Blob))throw Error('Preview upload missing file');return new Response(JSON.stringify({secure_url:URL.createObjectURL(file)}),{headers:{'Content-Type':'application/json'}});}return realFetch(input,opts);};
window.openImageZoom=()=>{};window.zoomProductImage=()=>{};
populateFormCategories();
const bar=document.createElement('aside');bar.id='previewNavigation';bar.style='position:sticky;top:0;z-index:99999;background:#edf8f2;padding:12px;border-bottom:1px solid #99bea9;display:flex;gap:8px;flex-wrap:wrap;color:#164c38';
bar.innerHTML='<strong>LOCAL PRODUCT PREVIEW · mock cloud · session-only</strong><button id="previewSeller">Seller</button><button id="previewEdit">Edit last saved</button><button id="previewBuyer">Buyer: last saved</button><span id="previewStatus">No real uploads, accounts or orders.</span>';
document.body.prepend(bar);
const show=e=>{for(let n=e;n&&n!==document.body;n=n.parentElement){n.style.display=n.classList.contains('overlay-menu')?'flex':'block';n.style.visibility='visible';}};
window.previewSeller=()=>{closeModals();skhProductBuilder.resumeCreate();show($('sellerForm'));};
const last=()=>[...testDocs.entries()].at(-1);
$('previewSeller').onclick=previewSeller;
$('previewEdit').onclick=async()=>{const x=last();if(!x){$('previewStatus').textContent='Save a product first.';return;}closeModals();await openEditModal(x[0],'products');show($('editModal'));};
$('previewBuyer').onclick=()=>{const x=last();if(!x){$('previewStatus').textContent='Save a product first.';return;}closeModals();const p={...x[1],id:x[0]};skh.currentOpenProduct=p;$('pmTitle').textContent=p.title||p.name;skhRenderProductMedia(p.imagesArray||p.images||[]);skhRenderShowcase(p,'products');show($('productModal'));};
window.alert=text=>{$('previewStatus').textContent=String(text);};
previewSeller();window.previewReady=true;
