import fs from 'node:fs';
const r=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const market=r('js/app/00-bootstrap.js'), cardCss=r('css/37-product-card-visual.css'), adCss=r('css/38-home-ad-manager.css'), top=r('html/16-topnav.html'), ad=r('js/06-announcement.js'), admin=r('js/app/16-pos-admin-jobs.js'), basic=r('js/app/creative/basic-ad-creative.js'), adsRules=r('shared/ads-design-rules.js'), advanced=r('js/app/95-creative-studio.js'), engine=r('js/app/09-feed-announcements.js'), rules=r('firestore.rules'), upload=r('js/11-uploads.js'), adv=r('html/03-modals-core.html');
let pass=0,fail=0;function t(n,v){if(v){pass++;console.log('PASS '+n)}else{fail++;console.error('FAIL '+n)}}
const product=market.slice(market.indexOf('skh.ProductPostCard'),market.indexOf('skh.ServicePostCard'));
t('product front card keeps image/title/price/location',product.includes('skh.cardImage')&&product.includes('skh-title')&&product.includes("cardPriceHtml(data, 'products')")&&product.includes("cardPinLocation(data, 'products')"));
t('product front card omits seller details',!product.includes('cardSellerMini')&&!product.includes('cardRating'));
t('product front card omits mode/detail controls',!product.includes('cardModeSignalLine')&&!product.includes('description'));
t('product image has stable wide aspect ratio',cardCss.includes('aspect-ratio:4/3')&&cardCss.includes('object-fit:cover!important'));
t('product title uses readable two-line clamp',cardCss.includes('-webkit-line-clamp:2')&&cardCss.includes('font-size:15px!important'));
t('desktop card grid uses wide minimum',cardCss.includes('minmax(min(100%,220px),1fr)'));
t('small phone uses balanced compact grid',cardCss.includes('@media(max-width:360px)')&&(cardCss.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important')||cardCss.includes('grid-template-columns:1fr!important')));
t('Home advertisement is under Search',top.indexOf('id="topAnnouncement"')>top.indexOf('id="topSearchRow"'));
t('Home showcase hides when no active ad',ad.includes("host.hidden=true")||ad.includes('h.hidden=true'));
t('showcase derives active/scheduled/expired/archive state',ad.includes("return 'scheduled'")&&ad.includes("return 'expired'")&&ad.includes("return 'archived'"));
/* [2026-09-24] Rotation moved to the shared Delivery Controller (96) in 0538616; priority ordering lives in 06 local selector. */
t('showcase supports priority ordering and rotation',ad.includes('Number(b.priority)')&&(ad.includes('rotationTimer')||r('js/app/96-ad-delivery-controller.js').includes('record.rotateTimer = window.setTimeout')));
t('showcase wakes at schedule boundaries without a reload',ad.includes('armScheduleRefresh')&&ad.includes('scheduleTimer=setTimeout(renderCurrent')&&ad.includes('if(s>now)times.push(s)')&&ad.includes('if(e>now)times.push(e+50)'));
t('showcase labels promotional content honestly',ad.includes('Advertisement'));
t('showcase supports image creative',ad.includes('skh-ann-media-main')&&ad.includes('a.image || a.imageUrl'));
/* [2026-09-24] published video ad = clean presentation (subtle cue + duration),
   full player controls zimeondolewa kwa mujibu wa Ad Visual System; `controls` ni opt-in tu. */
t('showcase supports video with safe controls',ad.includes('<video')&&ad.includes('muted playsinline')&&ad.includes('preload="metadata"')&&!ad.includes('playsinline controls')&&ad.includes('skh-ann-video-cue'));
t('showcase supports audio controls',ad.includes('<audio')&&ad.includes('preload="none"'));
t('showcase supports poster image',ad.includes('poster='));
t('showcase supports logo, brand, headline and CTA',ad.includes('logoUrl')&&ad.includes('brandName')&&ad.includes('headline')&&ad.includes('ctaLabel'));
/* [2026-09-24] ad indicator moja tu ya subtle ('Sponsored' + AD pill) — redundant 'Sponsored · Advertisement' iliondolewa. */
t('Home advertisement is rendered as a clear sponsored post',ad.includes('skh-ann-post-head')&&ad.includes("'Sponsored'")&&ad.includes('skh-ann-sponsored')&&ad.includes('skh-ann-post-actions'));
t('advertisement image preserves the whole creative',adCss.includes('aspect-ratio:4/3')&&adCss.includes('skh-ann-media-main')&&adCss.includes('object-fit:contain!important'));
t('preview and Home share the canonical advertisement card',ad.includes('window.skhAdvertisementCardHtml=cardHtml')&&admin.includes("typeof window.skhAdvertisementCardHtml==='function'"));
t('admin can edit primary, accent, text and surface colors',['annPrimaryColor','annAccentColor','annTextColor','annSurfaceColor'].every(id=>admin.includes(id)));
t('frame opacity is editable and persisted',admin.includes('annFrameOpacity')&&admin.includes('skhAdOpacityChanged')&&engine.includes('frameOpacity'));
t('theme colors are sanitized before rendering and saving',ad.includes('safeColor')&&engine.includes("/^#[0-9a-f]{6}$/i"));
t('graphic design presets and contrast guidance are available',admin.includes('skhAdApplyPreset')&&admin.includes('annContrastHint')&&admin.includes('ratio>=4.5'));
t('custom theme variables drive card frame, text and gradient',ad.includes('--ad-primary:')&&adCss.includes('var(--ad-frame-alpha')&&adCss.includes('var(--ad-text')&&adCss.includes('var(--ad-accent'));
t('engagement metrics display only when authentic count is positive',ad.includes("return n>0?")&&ad.includes('a.likeCount')&&ad.includes('a.viewCount'));
t('published Firestore write updates Home immediately',engine.includes('window.__sokohaiAnnouncementsCache = cache')&&engine.includes('window.__sokohaiOnAnnouncementsUpdate(cache)'));
t('new advertisement defaults to Draft with distinct draft/publish actions',admin.includes('id="annStatus" type="hidden" value="draft"')&&admin.includes("submitAnnouncementForm('draft')")&&admin.includes("submitAnnouncementForm('publish')"));
t('Admin manager has required status filters',['active','scheduled','draft','expired','archived'].every(x=>admin.includes(x.charAt(0).toUpperCase()+x.slice(1))));
/* [2026-09-24] primary action label ya Ads top-nav sasa '+ Tengeneza Tangazo'. */
t('Admin manager has Create Advertisement',admin.includes('+ Tengeneza Tangazo'));
t('Basic wizard supports all eight shared creative types',['image_text','image','solid_text','video','video_text','image_audio','slideshow','full_multimedia'].every(x=>admin.includes('value="'+x+'"'))&&adsRules.includes('BASIC_AD_TYPES = Object.freeze'));
t('admin must confirm the rendered preview before publish',admin.includes('annPreviewConfirmed')&&admin.includes("if(!adInput('annPreviewConfirmed')?.checked)"));
t('Basic publish uses the shared image/video/audio validation rules',admin.includes('validateBasicCreative(form,creative')&&basic.includes('validateCreative(creative, { forPublish: options.forPublish !== false')&&adsRules.includes("image_text: ['image'], image: ['image']")&&adsRules.includes("video: ['video'], video_text: ['video']")&&adsRules.includes("image_audio: ['image', 'audio']"));
t('CTA destination is an internal SokoHai entity or a valid HTTPS URL',adsRules.includes("c.destination.type === 'external' && isHttps(c.destination.url)")&&adsRules.includes('Choose a real SokoHai destination or valid HTTPS link'));
t('existing shared Cloudinary uploader is reused',admin.includes('window.skhUploadFromFile')&&upload.includes('window.skhUploadFromFile'));
t('media bytes are not written to Firestore',admin.includes("collection(skh.db,'adminMedia')")&&!admin.match(/adminMedia[^\n]*(base64|dataUrl|arrayBuffer)/i));
t('media library records dimensions/date/type',advanced.includes('width:d.width')&&advanced.includes('height:d.height')&&advanced.includes('uploadedAt')&&advanced.includes("type:opts.asLogo?'logo':kind"));
t('active media cannot be archived while in use',admin.includes("skhAdminAdState(a)==='active'")&&admin.includes('Replace creative kwanza'));
t('media reference deletion is guarded and accurately scoped',admin.includes('window.skhDeleteAdminMedia')&&admin.includes('if(inUse)return alert')&&admin.includes('Cloudinary asset haitafutwa bila signed deletion')&&admin.includes("deleteDoc(skh.doc(skh.db,'adminMedia',id))"));
t('advertisement writes are Admin-only in rules',/match \/announcements\/\{id\}[\s\S]*?allow create, update, delete: if isAdmin\(\)/.test(rules));
t('media library is Admin-only in rules',/match \/adminMedia\/\{id\}[\s\S]*?allow read, create, update, delete: if isAdmin\(\)/.test(rules));
t('archive replaces destructive ad deletion',engine.includes("status:'archived'")&&!engine.includes('deleteDoc(skh.doc(skh.db, "announcements"'));
t('Company Ads remains Coming Soon only',adv.includes('id="companyAdsSoonModal"')&&adv.includes('Company Ads')&&adv.includes('Coming Soon'));
t('external advertiser system was not added',!rules.match(/advertiserCampaigns|adBilling|adPricing|campaignWallet/i));
console.log(`\nHOME ADS + PRODUCT CARDS CONTRACT: ${pass} passed, ${fail} failed`);if(fail)process.exit(1);
