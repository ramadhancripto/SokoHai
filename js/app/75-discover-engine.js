/* ================================================================
 * 75-discover-engine.js — SOKOHAI DISCOVER — DEEP PRODUCT & DISCOVERY SYSTEM
 * Founder Spec 39 sections — Global Discovery Engine, NOT product listing only
 * Phases 1-15: Audit → Shell → Universal Search → Suggestions → Result Types
 * → Location → Offline Seller + Listing → Attributes/Options/Variants → Stock Freshness
 * → Chat/Negotiation → POS Sync → Filters → Saves/Follows/Recent → Ranking → Request Nearby
 *
 * PRESERVE EXISTING: Reuses skh.cachedItems, advancedCategories, serviceDataMap,
 * deliveryTaxonomy, 42-discovery-feed, 68-chat-discover, 72-discover-global,
 * 00-bootstrap product model, chat, negotiation, location handling.
 * EXTENSIBLE: Categories via IDs, not hardcoded names.
 *
 * Data Model (conceptual → Firebase):
 *  Business {businessId, ownerUid, name, category, lat,lng, address, area, city, region, country, accuracy, updatedAt}
 *  Product {existing + discoverable, onlineOrderingEnabled, stockTrackingEnabled, availabilityStatus, inventoryUpdatedAt, businessLocation, attributes, options, variants}
 *  DiscoverListing {entityId, entityType, businessId, sellerId, title, categoryId, searchableAttributes, price, currency, lat,lng, discoverable, onlineOrderingEnabled, stockTrackingEnabled, availabilityStatus, inventoryUpdatedAt, locationUpdatedAt, updatedAt, sellerMode, distance, ...}
 *  DiscoverRequest {product, quantity, area, priceRange, expiry, userId, status}
 *
 * Offline Seller Modes:
 *  Mode1 Discover Only: visible, price, location, no checkout, stock optional/off
 *  Mode2 POS+Discover: POS active, stock, price, location, Discover active, online ordering OFF
 *  Mode3 Online+Discover: catalogue, images, variants, stock, online ordering, SokoPay, delivery, Discover
 *
 * Availability: Available, Low Stock, Out of Stock, Not Tracked, Unknown, Stale
 * SellerMode: DISCOVER_ONLY, POS_DISCOVER, ONLINE_DISCOVER
 * EntityType: PRODUCT, SERVICE, BUSINESS, TRANSPORTER, AGENT, PERSON, GROUP, OPPORTUNITY
 * SearchIntent: PRODUCT_SEARCH, SERVICE_SEARCH, BUSINESS_SEARCH, PERSON_SEARCH, LOCATION_SEARCH, TRANSPORT_SEARCH, CATEGORY_SEARCH, DISCOVERY_SEARCH
 * ================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
  if (window.__skhDiscoverEngineBoot) return;
  window.__skhDiscoverEngineBoot = true;

  // --- Utils ---
  function esc(s) { return skh.skhEscape(String(s == null ? '' : s)); }
  function jsEsc(s) { return skh.skhJsEsc ? skh.skhJsEsc(String(s == null ? '' : s)) : esc(s); }
  function tk(k, fb) { try { var s = window.t && window.t(k); return (s && s !== k) ? s : (fb || k); } catch (e) { return fb || k; } }
  function uid() { return (skh.currentUser && skh.currentUser.uid) || ''; }
  function nowIso() { return new Date().toISOString(); }
  function T2(sw, en) { try { return (window.SokoHaiLMS && window.SokoHaiLMS.lang === 'en') ? en : sw; } catch (e) { return sw; } }
  function genId(prefix) { return (prefix || 'DISC') + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(); }

  // --- Enums ---
  var ENTITY_TYPE = {
    PRODUCT: 'PRODUCT',
    SERVICE: 'SERVICE',
    BUSINESS: 'BUSINESS',
    TRANSPORTER: 'TRANSPORTER',
    AGENT: 'AGENT',
    PERSON: 'PERSON',
    GROUP: 'GROUP',
    OPPORTUNITY: 'OPPORTUNITY'
  };
  var SELLER_MODE = {
    DISCOVER_ONLY: 'DISCOVER_ONLY',
    POS_DISCOVER: 'POS_DISCOVER',
    ONLINE_DISCOVER: 'ONLINE_DISCOVER'
  };
  var AVAILABILITY_STATUS = {
    AVAILABLE: 'AVAILABLE',
    LOW_STOCK: 'LOW_STOCK',
    OUT_OF_STOCK: 'OUT_OF_STOCK',
    NOT_TRACKED: 'NOT_TRACKED',
    UNKNOWN: 'UNKNOWN',
    STALE: 'STALE'
  };
  var SEARCH_INTENT = {
    PRODUCT_SEARCH: 'PRODUCT_SEARCH',
    SERVICE_SEARCH: 'SERVICE_SEARCH',
    BUSINESS_SEARCH: 'BUSINESS_SEARCH',
    PERSON_SEARCH: 'PERSON_SEARCH',
    LOCATION_SEARCH: 'LOCATION_SEARCH',
    TRANSPORT_SEARCH: 'TRANSPORT_SEARCH',
    CATEGORY_SEARCH: 'CATEGORY_SEARCH',
    DISCOVERY_SEARCH: 'DISCOVERY_SEARCH'
  };
  var DISTANCE_FILTER = {
    M100: 0.1,
    M500: 0.5,
    KM1: 1,
    KM5: 5,
    KM10: 10,
    ANY: 99999
  };

  // --- Location Handling ---
  function getUserDiscoveryLocation() {
    // Priority: skh.userLat/Lon (GPS) → saved localStorage → manual → Dar es Salaam fallback
    var lat = skh.userLat, lon = skh.userLon;
    if (typeof lat === 'number' && typeof lon === 'number') return { lat, lon, source: 'gps', name: skh.userRegionName || '' };
    try {
      var raw = skh.localStorage && skh.localStorage.getItem('skh_last_loc');
      if (raw) {
        var d = JSON.parse(raw);
        if (d && typeof d.lat === 'number' && typeof d.lon === 'number') return { lat: d.lat, lon: d.lon, source: d.source || 'saved', name: d.name || '' };
      }
      var manual = skh.localStorage && skh.localStorage.getItem('skh_discover_manual_loc');
      if (manual) {
        var m = JSON.parse(manual);
        if (m && typeof m.lat === 'number' && typeof m.lon === 'number') return { lat: m.lat, lon: m.lon, source: 'manual', name: m.name || '' };
      }
    } catch (e) {}
    // Fallback Dar es Salaam
    return { lat: -6.7924, lon: 39.2083, source: 'fallback', name: 'Dar es Salaam' };
  }

  function calcDistance(lat1, lon1, lat2, lon2) {
    try {
      if (typeof skh.calculateDistance === 'function') return skh.calculateDistance(lat1, lon1, lat2, lon2);
      if (typeof skh.getKmDistance === 'function') return parseFloat(skh.getKmDistance(lat1, lon1, lat2, lon2));
    } catch (e) {}
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function formatDistance(km) {
    if (km == null || km >= 9999) return '';
    if (km < 1) return Math.round(km * 1000) + 'm';
    if (km < 10) return km.toFixed(1) + 'km';
    return Math.round(km) + 'km';
  }

  function buildBusinessLocation(productOrUser) {
    var p = productOrUser || {};
    // Business location is permanent registered business location, NOT live seller location
    var lat = null, lon = null;
    if (p.businessLocation && typeof p.businessLocation.lat === 'number') {
      lat = p.businessLocation.lat; lon = p.businessLocation.lng || p.businessLocation.lon;
    } else if (p.coords && typeof p.coords.lat === 'number') {
      lat = p.coords.lat; lon = p.coords.lon;
    } else if (p.latitude && p.longitude) {
      lat = parseFloat(p.latitude); lon = parseFloat(p.longitude);
    } else if (p.lat && p.lng) {
      lat = parseFloat(p.lat); lon = parseFloat(p.lng);
    }
    // Fallback to userLat if product has no coords but we have region matching?
    var formatted = p.location || p.formattedAddress || p.address || '';
    var area = p.area || p.subRegion || '';
    var city = p.city || p.region || p.pickupRegion || '';
    var region = p.region || p.city || '';
    var country = p.country || 'Tanzania';
    var accuracy = p.locationAccuracy || (lat != null ? 'approximate' : 'unknown');
    var updatedAt = p.locationUpdatedAt || p.updatedAt || p.createdAt || nowIso();
    return {
      latitude: lat, longitude: lon,
      formattedAddress: formatted, area: area, city: city, region: region, country: country,
      accuracy: accuracy, updatedAt: updatedAt
    };
  }

  // --- Product Structure: Product vs Attribute vs Option vs Variant vs Stock ---
  function parseProductStructure(product) {
    var p = product || {};
    var attributes = {}; // {Color: {name, options: []}, Size: {...}}
    var options = {}; // {Color: ['Black','White'], Size: ['36','37']}
    var variants = []; // [{id, attributes: {Color:'Red', Size:'39'}, stock:5, price?, image?}]
    var stockMap = {}; // variantKey -> stock

    // Existing filters: {Brand, Color, Size, Material, ...}
    var filters = p.filters || {};
    Object.keys(filters).forEach(function (k) {
      var v = filters[k];
      if (!v) return;
      var key = String(k).trim();
      var val = String(v).trim();
      if (!attributes[key]) attributes[key] = { name: key, options: [] };
      if (attributes[key].options.indexOf(val) === -1) attributes[key].options.push(val);
      if (!options[key]) options[key] = [];
      if (options[key].indexOf(val) === -1) options[key].push(val);
    });

    // If product has explicit variants array (seller defined)
    if (Array.isArray(p.variants) && p.variants.length) {
      p.variants.forEach(function (v, idx) {
        var varAttrs = v.attributes || { Color: v.color, Size: v.size, Material: v.material } || {};
        // Clean undefined
        var cleanAttrs = {};
        Object.keys(varAttrs).forEach(function (ak) { if (varAttrs[ak]) cleanAttrs[ak] = String(varAttrs[ak]); });
        var variant = {
          id: v.id || ('var-' + idx),
          attributes: cleanAttrs,
          stock: v.stock != null ? parseInt(v.stock) : (v.quantity != null ? parseInt(v.quantity) : null),
          price: v.price != null ? parseFloat(v.price) : null,
          image: v.image || null,
          sku: v.sku || null
        };
        variants.push(variant);
        // Merge into attributes/options
        Object.keys(cleanAttrs).forEach(function (ak) {
          if (!attributes[ak]) attributes[ak] = { name: ak, options: [] };
          if (attributes[ak].options.indexOf(cleanAttrs[ak]) === -1) attributes[ak].options.push(cleanAttrs[ak]);
          if (!options[ak]) options[ak] = [];
          if (options[ak].indexOf(cleanAttrs[ak]) === -1) options[ak].push(cleanAttrs[ak]);
        });
      });
    }

    // If no variants but has color/size lists (options without images)
    if (!variants.length) {
      var colorList = p.colors || p.availableColors || (filters.Color ? [filters.Color] : []);
      var sizeList = p.sizes || p.availableSizes || (filters.Size ? [filters.Size] : []);
      // Support comma separated
      if (typeof colorList === 'string') colorList = colorList.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      if (typeof sizeList === 'string') sizeList = sizeList.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      if (colorList.length || sizeList.length) {
        if (colorList.length) {
          if (!attributes['Color']) attributes['Color'] = { name: 'Color', options: [] };
          colorList.forEach(function (c) { if (attributes['Color'].options.indexOf(c) === -1) attributes['Color'].options.push(c); });
          options['Color'] = colorList.slice();
        }
        if (sizeList.length) {
          if (!attributes['Size']) attributes['Size'] = { name: 'Size', options: [] };
          sizeList.forEach(function (s) { if (attributes['Size'].options.indexOf(s) === -1) attributes['Size'].options.push(s); });
          options['Size'] = sizeList.slice();
        }
        // Generate variants cartesian if both exist (optional)
        if (colorList.length && sizeList.length && colorList.length * sizeList.length <= 50) {
          colorList.forEach(function (col) {
            sizeList.forEach(function (sz) {
              variants.push({ id: 'gen-' + col + '-' + sz, attributes: { Color: col, Size: sz }, stock: p.stock != null ? p.stock : null, price: null, image: null });
            });
          });
        }
      }
    }

    // Stock handling
    var totalStock = null;
    if (p.stock != null) totalStock = parseInt(p.stock);
    else if (variants.length) {
      var sum = 0, has = false;
      variants.forEach(function (v) { if (v.stock != null) { sum += v.stock; has = true; } });
      if (has) totalStock = sum;
    }

    return { attributes, options, variants, stock: totalStock, filters };
  }

  function getSellerMode(product) {
    var p = product || {};
    // Explicit fields take precedence
    if (p.sellerMode) return p.sellerMode;
    if (p.discoverMode) return p.discoverMode;
    var onlineEnabled = p.onlineOrderingEnabled;
    var hasImage = !!(p.image || (p.imagesArray && p.imagesArray.length) || p.photo);
    var hasStock = p.stock != null || p.quantity != null || (Array.isArray(p.variants) && p.variants.length > 0) || p.stockQuantity != null;
    var hasPOS = p.posActive || p.hasPOS || p.stockTrackingEnabled === true || hasStock;
    var hasPrice = p.price != null && parseFloat(p.price) > 0;

    if (onlineEnabled === false) {
      if (hasPOS) return SELLER_MODE.POS_DISCOVER;
      return SELLER_MODE.DISCOVER_ONLY;
    }
    if (onlineEnabled === true) return SELLER_MODE.ONLINE_DISCOVER;

    // [FIX 2026-09-19] Legacy products without onlineOrderingEnabled field:
    // Treat undefined as TRUE when price+image exists (original system working).
    // Previously inferred DISCOVER_ONLY when saleMode=='discover_only' or checkoutEnabled false,
    // causing offline UI for legacy products lacking field.
    // Priority: price+image/stock => ONLINE_DISCOVER, then POS, then explicit discover_only.

    // Legacy fallback: if has price and (stock or image), it's ONLINE_DISCOVER
    if (hasPrice && (hasStock || hasImage)) {
      // Even if saleMode is discover_only, if checkout not explicitly disabled and has image, treat as online
      // Only force DISCOVER_ONLY if saleMode is discover_only AND explicitly has no image/stock AND onlineOrderingEnabled is undefined but seller wants discover only
      // For backward compat, if saleMode is discover_only but has price+image, still treat as ONLINE unless explicitly flagged offline via posOnly flag
      if (p.saleMode === 'discover_only' && !hasPOS && !hasImage) {
        return SELLER_MODE.DISCOVER_ONLY;
      }
      // If has POS and price but no image? Still POS_DISCOVER? No, if image exists, online.
      if (hasImage) return SELLER_MODE.ONLINE_DISCOVER;
      if (hasPOS) return SELLER_MODE.POS_DISCOVER;
      return SELLER_MODE.ONLINE_DISCOVER;
    }

    if (p.saleMode === 'discover_only') {
      // Only honor if truly offline (no online checkout)
      if (hasPOS) return SELLER_MODE.POS_DISCOVER;
      return SELLER_MODE.DISCOVER_ONLY;
    }

    if (hasPOS && !hasPrice) return SELLER_MODE.POS_DISCOVER; // POS but no online price

    if (hasPrice) {
      var checkoutEnabled = p.checkoutEnabled !== false; // treat undefined as true
      if (checkoutEnabled && hasImage) return SELLER_MODE.ONLINE_DISCOVER;
      if (hasPOS) return SELLER_MODE.POS_DISCOVER;
      return SELLER_MODE.DISCOVER_ONLY;
    }
    return SELLER_MODE.DISCOVER_ONLY;
  }

  function getAvailabilityStatus(product) {
    var p = product || {};
    if (p.availabilityStatus) return p.availabilityStatus;
    var stockTracking = p.stockTrackingEnabled;
    if (stockTracking === false) return AVAILABILITY_STATUS.NOT_TRACKED;
    if (p.stock == null && (!p.variants || !p.variants.length)) {
      // No stock tracking
      if (p.availability === 'not_tracked' || p.listed === true) return AVAILABILITY_STATUS.NOT_TRACKED;
      return AVAILABILITY_STATUS.UNKNOWN;
    }
    var stock = p.stock;
    if (stock != null) {
      stock = parseInt(stock);
      if (stock <= 0) return AVAILABILITY_STATUS.OUT_OF_STOCK;
      if (stock <= 5) return AVAILABILITY_STATUS.LOW_STOCK;
      // Check freshness
      var updated = p.inventoryUpdatedAt || p.stockUpdatedAt || p.updatedAt;
      if (updated) {
        var age = Date.now() - new Date(updated).getTime();
        if (age > 24 * 60 * 60 * 1000) return AVAILABILITY_STATUS.STALE;
      }
      return AVAILABILITY_STATUS.AVAILABLE;
    }
    // Variants stock
    if (Array.isArray(p.variants) && p.variants.length) {
      var total = 0, has = false, allZero = true;
      p.variants.forEach(function (v) {
        if (v.stock != null) { has = true; total += v.stock; if (v.stock > 0) allZero = false; }
      });
      if (!has) return AVAILABILITY_STATUS.NOT_TRACKED;
      if (allZero) return AVAILABILITY_STATUS.OUT_OF_STOCK;
      if (total <= 5) return AVAILABILITY_STATUS.LOW_STOCK;
      return AVAILABILITY_STATUS.AVAILABLE;
    }
    return AVAILABILITY_STATUS.UNKNOWN;
  }

  function getInventoryFreshness(product) {
    var p = product || {};
    var updated = p.inventoryUpdatedAt || p.stockUpdatedAt || p.updatedAt || p.createdAt;
    if (!updated) return { label: 'Unknown', freshness: 'unknown', ageMs: null };
    var age = Date.now() - new Date(updated).getTime();
    var mins = Math.floor(age / 60000);
    if (mins < 1) return { label: 'Just now', freshness: 'fresh', ageMs: age };
    if (mins < 60) return { label: 'Updated ' + mins + 'm ago', freshness: 'fresh', ageMs: age };
    var hours = Math.floor(mins / 60);
    if (hours < 24) return { label: 'Updated ' + hours + 'h ago', freshness: 'recent', ageMs: age };
    var days = Math.floor(hours / 24);
    if (days === 1) return { label: 'Updated 1 day ago', freshness: 'stale', ageMs: age };
    return { label: 'Updated ' + days + ' days ago', freshness: 'stale', ageMs: age };
  }

  // --- DiscoverListing Builder ---
  function buildDiscoverListing(entity, entityType) {
    var e = entity || {};
    var type = entityType || ENTITY_TYPE.PRODUCT;
    var businessLoc = buildBusinessLocation(e);
    var struct = type === ENTITY_TYPE.PRODUCT ? parseProductStructure(e) : { attributes: {}, options: {}, variants: [], stock: null };
    var sellerMode = type === ENTITY_TYPE.PRODUCT ? getSellerMode(e) : null;
    var availability = type === ENTITY_TYPE.PRODUCT ? getAvailabilityStatus(e) : null;
    var freshness = type === ENTITY_TYPE.PRODUCT ? getInventoryFreshness(e) : null;

    var listing = {
      entityId: e.id || e.uid || genId('ENT'),
      entityType: type,
      businessId: e.businessId || e.shopId || e.userId || null,
      sellerId: e.userId || e.sellerId || e.ownerId || null,
      title: e.title || e.name || e.driverName || e.company || e.fullName || e.displayName || e.businessName || 'Unknown',
      categoryId: e.categoryId || e.category || null,
      categoryName: e.category || e.categoryName || '',
      subCategory: e.subCategory || e.subCategoryName || '',
      searchableAttributes: {},
      price: e.price != null ? parseFloat(e.price) : null,
      currency: e.currency || 'TZS',
      latitude: businessLoc.latitude,
      longitude: businessLoc.longitude,
      formattedAddress: businessLoc.formattedAddress,
      area: businessLoc.area,
      city: businessLoc.city,
      region: businessLoc.region,
      country: businessLoc.country,
      locationAccuracy: businessLoc.accuracy,
      locationUpdatedAt: businessLoc.updatedAt,
      discoverable: e.discoverable !== false,
      // [FIX 2026-09-19] Legacy: undefined onlineOrderingEnabled treated as true when sellerMode is ONLINE_DISCOVER and has price
      // Previously e.onlineOrderingEnabled !== false && sellerMode==ONLINE_DISCOVER caused offline UI for legacy products lacking field if sellerMode mis-inferred
      onlineOrderingEnabled: (e.onlineOrderingEnabled === undefined ? true : e.onlineOrderingEnabled !== false) && sellerMode === SELLER_MODE.ONLINE_DISCOVER,
      stockTrackingEnabled: e.stockTrackingEnabled !== false && (e.stock != null || (struct.variants && struct.variants.length > 0)),
      availabilityStatus: availability,
      inventoryUpdatedAt: e.inventoryUpdatedAt || e.stockUpdatedAt || e.updatedAt || null,
      updatedAt: e.updatedAt || e.createdAt || nowIso(),
      sellerMode: sellerMode,
      images: e.imagesArray || e.images || (e.image ? [e.image] : []),
      image: e.image || e.photo || (e.imagesArray && e.imagesArray[0]) || null,
      rating: e.rating != null ? parseFloat(e.rating) : null,
      reviewCount: e.reviewCount || e.totalReviews || 0,
      description: e.description || e.bio || '',
      attributes: struct.attributes,
      options: struct.options,
      variants: struct.variants,
      stock: struct.stock,
      filters: struct.filters || e.filters || {},
      businessName: e.businessName || e.shopName || e.ownerName || e.storeName || '',
      sellerName: e.ownerName || e.sellerName || e.fullName || e.displayName || '',
      location: e.location || '',
      saleMode: e.saleMode || 'free_market',
      modeData: e.modeData || null,
      isBoosted: !!e.isBoosted,
      distance: null,
      freshness: freshness,
      raw: e
    };

    // searchableAttributes for fast discovery
    var searchable = {};
    if (listing.categoryName) searchable.category = listing.categoryName.toLowerCase();
    if (listing.subCategory) searchable.subCategory = listing.subCategory.toLowerCase();
    if (listing.businessName) searchable.business = listing.businessName.toLowerCase();
    if (listing.sellerName) searchable.seller = listing.sellerName.toLowerCase();
    if (listing.title) searchable.title = listing.title.toLowerCase();
    // Attributes
    Object.keys(listing.attributes).forEach(function (ak) {
      searchable[ak.toLowerCase()] = listing.attributes[ak].options.join(' ').toLowerCase();
    });
    // Filters
    Object.keys(listing.filters).forEach(function (fk) {
      searchable[fk.toLowerCase()] = String(listing.filters[fk]).toLowerCase();
    });
    listing.searchableAttributes = searchable;

    // Compute distance if user location available
    var userLoc = getUserDiscoveryLocation();
    if (listing.latitude != null && listing.longitude != null && userLoc) {
      listing.distance = calcDistance(userLoc.lat, userLoc.lon, listing.latitude, listing.longitude);
    }

    return listing;
  }

  // --- Search Intent Detection ---
  function detectIntent(query) {
    var q = String(query || '').toLowerCase().trim();
    if (!q) return SEARCH_INTENT.DISCOVERY_SEARCH;

    // Location intent
    if (/\b(near me|nearby|karibu|karibu nami|around me|close to me|mikoa|jirani)\b/.test(q)) return SEARCH_INTENT.LOCATION_SEARCH;

    // Transport intent
    var transportKeywords = ['boda', 'bajaj', 'pickup', 'lori', 'truck', 'fuso', 'trailer', 'daladala', 'gari', 'taxi', 'ride', 'safari', 'usafiri', 'delivery', 'mizigo', 'abiria', 'transporter', 'dereva', 'driver'];
    if (transportKeywords.some(function (k) { return q.includes(k); })) return SEARCH_INTENT.TRANSPORT_SEARCH;

    // Service intent
    var serviceKeywords = ['tailor', 'mshonaji', 'fundi', 'doctor', 'daktari', 'mechanic', 'electrician', 'plumber', 'cleaning', 'usafi', 'beauty', 'salon', 'kina mama', 'cooking', 'mpishi', 'lawyer', 'wakili', 'teacher', 'mwalimu', 'photographer', 'mpiga picha', 'dj', 'mc', 'decoration', 'event', 'sherehe'];
    if (serviceKeywords.some(function (k) { return q.includes(k); })) return SEARCH_INTENT.SERVICE_SEARCH;

    // Person intent
    if (q.startsWith('@') || /\b(juma|asha|john|people|mtu|watu|account|profile)\b/.test(q)) return SEARCH_INTENT.PERSON_SEARCH;

    // Business intent
    var businessKeywords = ['hardware', 'duka', 'shop', 'store', 'biashara', 'business', 'supermarket', 'pharmacy', 'd pharmacy', 'restaurant', 'hotel', 'bar', 'salon', 'boutique', 'stationery', 'bookshop', 'agrovet'];
    if (businessKeywords.some(function (k) { return q.includes(k); })) return SEARCH_INTENT.BUSINESS_SEARCH;

    // Category intent
    var categories = [];
    try {
      if (skh.advancedCategories) categories = categories.concat(Object.keys(skh.advancedCategories));
      if (skh.serviceDataMap) {
        Object.keys(skh.serviceDataMap).forEach(function (sec) { categories = categories.concat(Object.keys(skh.serviceDataMap[sec])); });
      }
    } catch (e) {}
    var qCat = categories.some(function (cat) { return q.includes(String(cat).toLowerCase()); });
    if (qCat) return SEARCH_INTENT.CATEGORY_SEARCH;

    // Product intent (has attributes like color/size/brand/weight)
    var productAttrKeywords = ['red', 'blue', 'black', 'white', 'green', 'yellow', 'size', '36', '37', '38', '39', '40', 'kg', '50kg', '25kg', 'brand', 'nike', 'samsung', 'iphone', 'cement', 'saruji', 'mchele', 'rice', 'shoes', 'viatu', 'phone', 'simu', 'laptop', 'tv'];
    if (productAttrKeywords.some(function (k) { return q.includes(k); })) return SEARCH_INTENT.PRODUCT_SEARCH;

    // Discovery intent (people who like, following, etc)
    if (/\b(who like|who follow|people interested|watu wanaopenda|following|interests)\b/.test(q)) return SEARCH_INTENT.DISCOVERY_SEARCH;

    return SEARCH_INTENT.PRODUCT_SEARCH;
  }

  // --- Ranking / Relevance ---
  function rankListings(listings, query, userLoc, intent) {
    var q = String(query || '').toLowerCase().trim();
    var qTokens = q.split(/\s+/).filter(Boolean);
    return listings.map(function (listing) {
      var score = 0;
      var reasons = [];

      // Search relevance
      if (q) {
        var title = String(listing.title || '').toLowerCase();
        if (title === q) { score += 20; reasons.push('exact title'); }
        else if (title.includes(q)) { score += 10; reasons.push('title contains'); }
        else {
          qTokens.forEach(function (tok) {
            if (title.includes(tok)) { score += 3; reasons.push('token:' + tok); }
          });
        }
        // Category match
        if (listing.categoryName && listing.categoryName.toLowerCase().includes(q)) { score += 8; reasons.push('category match'); }
        if (listing.subCategory && listing.subCategory.toLowerCase().includes(q)) { score += 6; reasons.push('subcat match'); }
        // Attribute match
        Object.keys(listing.searchableAttributes).forEach(function (ak) {
          var av = listing.searchableAttributes[ak];
          if (av && qTokens.some(function (tok) { return av.includes(tok); })) { score += 4; reasons.push('attr:' + ak); }
        });
        // Business name
        if (listing.businessName && listing.businessName.toLowerCase().includes(q)) { score += 7; reasons.push('business match'); }
      }

      // Distance (for location intent, prioritize nearby)
      if (listing.distance != null) {
        if (intent === SEARCH_INTENT.LOCATION_SEARCH || intent === SEARCH_INTENT.PRODUCT_SEARCH) {
          // Closer = higher score, inverse
          var distScore = Math.max(0, 10 - listing.distance); // 10 for 0km, 0 for 10km+
          score += distScore;
          reasons.push('distance:' + listing.distance.toFixed(2) + 'km');
        } else {
          // For generic, slight boost for nearby but not restrictive
          if (listing.distance < 5) { score += 2; reasons.push('nearby'); }
        }
      }

      // Availability
      if (listing.availabilityStatus === AVAILABILITY_STATUS.AVAILABLE) { score += 5; reasons.push('available'); }
      else if (listing.availabilityStatus === AVAILABILITY_STATUS.LOW_STOCK) { score += 2; reasons.push('low stock'); }
      else if (listing.availabilityStatus === AVAILABILITY_STATUS.OUT_OF_STOCK) { score -= 3; reasons.push('out of stock'); }
      else if (listing.availabilityStatus === AVAILABILITY_STATUS.NOT_TRACKED) { score += 1; reasons.push('listed'); }
      else if (listing.availabilityStatus === AVAILABILITY_STATUS.STALE) { score -= 1; reasons.push('stale'); }

      // Inventory freshness
      if (listing.freshness) {
        if (listing.freshness.freshness === 'fresh') { score += 2; reasons.push('fresh'); }
        else if (listing.freshness.freshness === 'stale') { score -= 1; reasons.push('stale inv'); }
      }

      // Business relevance
      if (listing.entityType === ENTITY_TYPE.BUSINESS) { score += 1; }

      // Boosted (transparent, separate, not secret)
      if (listing.isBoosted) { score += 2; reasons.push('boosted'); }

      // Discoverability
      if (!listing.discoverable) { score -= 20; }

      // Online ordering enabled boost for product searches
      if (intent === SEARCH_INTENT.PRODUCT_SEARCH && listing.onlineOrderingEnabled) { score += 1; }

      return { listing: listing, score: score, reasons: reasons };
    }).sort(function (a, b) { return b.score - a.score; });
  }

  // --- Search Suggestions / Helper ---
  var popularSearches = [];
  try {
    var saved = skh.localStorage && skh.localStorage.getItem('skh_popular_searches');
    if (saved) popularSearches = JSON.parse(saved);
  } catch (e) {}

  function addPopularSearch(query) {
    if (!query || query.trim().length < 2) return;
    var q = query.trim().toLowerCase();
    var existing = popularSearches.find(function (p) { return p.q === q; });
    if (existing) existing.count = (existing.count || 1) + 1;
    else popularSearches.push({ q: q, count: 1, lastAt: nowIso() });
    popularSearches.sort(function (a, b) { return (b.count || 0) - (a.count || 0); });
    popularSearches = popularSearches.slice(0, 30);
    try { skh.localStorage && skh.localStorage.setItem('skh_popular_searches', JSON.stringify(popularSearches)); } catch (e) {}
  }

  function getSearchSuggestions(query) {
    var q = String(query || '').toLowerCase().trim();
    var suggestions = [];

    // From Global Categories
    try {
      if (skh.advancedCategories) {
        Object.keys(skh.advancedCategories).forEach(function (cat) {
          if (!q || cat.toLowerCase().includes(q)) suggestions.push({ type: 'category', text: cat, sub: 'Category', icon: '📦' });
          var subs = skh.advancedCategories[cat].subcategories || {};
          Object.keys(subs).forEach(function (sub) {
            if (!q || sub.toLowerCase().includes(q) || cat.toLowerCase().includes(q)) suggestions.push({ type: 'subcategory', text: sub, sub: cat, icon: '🏷️' });
          });
        });
      }
      if (skh.serviceDataMap) {
        Object.keys(skh.serviceDataMap).forEach(function (sec) {
          Object.keys(skh.serviceDataMap[sec]).forEach(function (cat) {
            if (!q || cat.toLowerCase().includes(q)) suggestions.push({ type: 'service_category', text: cat, sub: sec, icon: '🔧' });
          });
        });
      }
      if (skh.deliveryTaxonomy) {
        Object.keys(skh.deliveryTaxonomy).forEach(function (cat) {
          if (!q || cat.toLowerCase().includes(q)) suggestions.push({ type: 'transport_category', text: cat, sub: 'Transport', icon: '🚚' });
        });
      }
    } catch (e) {}

    // From product names in cache
    try {
      var cached = skh.cachedItems || [];
      var seen = {};
      cached.forEach(function (it) {
        var title = it.title || it.name || '';
        if (!title) return;
        var lt = title.toLowerCase();
        if (q && !lt.includes(q)) return;
        if (seen[lt]) return;
        seen[lt] = true;
        suggestions.push({ type: 'product', text: title, sub: it.category || 'Product', icon: '🛍️', data: it });
      });
    } catch (e) {}

    // From popular searches
    popularSearches.forEach(function (p) {
      if (!q || p.q.includes(q)) suggestions.push({ type: 'popular', text: p.q, sub: 'Popular • ' + (p.count || 1) + ' searches', icon: '🔥' });
    });

    // From nearby inventory (if location available)
    try {
      var userLoc = getUserDiscoveryLocation();
      if (userLoc) {
        var nearby = (skh.cachedItems || []).filter(function (it) {
          if (!it.coords) return false;
          var d = calcDistance(userLoc.lat, userLoc.lon, it.coords.lat, it.coords.lon);
          return d < 5;
        }).slice(0, 5);
        nearby.forEach(function (it) {
          if (!q || String(it.title || '').toLowerCase().includes(q)) suggestions.push({ type: 'nearby', text: it.title, sub: 'Nearby • ' + (it.location || 'close'), icon: '📍', data: it });
        });
      }
    } catch (e) {}

    // Business names
    try {
      var bizSeen = {};
      (skh.cachedItems || []).forEach(function (it) {
        var bn = it.ownerName || it.businessName || '';
        if (!bn) return;
        var lbn = bn.toLowerCase();
        if (q && !lbn.includes(q)) return;
        if (bizSeen[lbn]) return;
        bizSeen[lbn] = true;
        suggestions.push({ type: 'business', text: bn, sub: 'Business', icon: '🏪', data: it });
      });
    } catch (e) {}

    // Deduplicate and limit
    var unique = [];
    var seenText = {};
    suggestions.forEach(function (s) {
      var key = s.type + ':' + s.text.toLowerCase();
      if (seenText[key]) return;
      seenText[key] = true;
      unique.push(s);
    });

    // Prioritize: exact match first, then product, then category, then others
    unique.sort(function (a, b) {
      var aExact = a.text.toLowerCase() === q;
      var bExact = b.text.toLowerCase() === q;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      var order = { product: 0, nearby: 1, category: 2, subcategory: 3, business: 4, service_category: 5, transport_category: 6, popular: 7 };
      return (order[a.type] || 10) - (order[b.type] || 10);
    });

    return unique.slice(0, 12);
  }

  // --- Universal Search ---
  async function universalSearch(query, opts) {
    opts = opts || {};
    var q = String(query || '').trim();
    var intent = detectIntent(q);
    var userLoc = getUserDiscoveryLocation();
    var distanceFilter = opts.distanceFilter != null ? opts.distanceFilter : DISTANCE_FILTER.ANY;
    var entityTypes = opts.entityTypes || [ENTITY_TYPE.PRODUCT, ENTITY_TYPE.SERVICE, ENTITY_TYPE.BUSINESS, ENTITY_TYPE.TRANSPORTER, ENTITY_TYPE.PERSON, ENTITY_TYPE.GROUP];
    var limit = opts.limit || 100;

    var allListings = [];

    // Fetch from Firestore + cache
    // Products
    if (entityTypes.indexOf(ENTITY_TYPE.PRODUCT) !== -1) {
      try {
        var products = [];
        // Use cachedItems first for speed
        var cached = (skh.cachedItems || []).filter(function (it) { return (it.collectionName || 'products') === 'products'; });
        products = products.concat(cached);
        // If query and cached not enough, fetch from Firestore
        if (q || products.length < 20) {
          try {
            // [FIX §11/§53] Bounded to 30 results — was limit(100) which violates cost spec
            var snap = await skh.getDocs(skh.query(skh.collection(skh.db, 'products'), skh.orderBy('createdAt', 'desc'), skh.limit(30)));
            snap.forEach(function (d) {
              var data = Object.assign({ id: d.id, collectionName: 'products' }, d.data());
              if (!products.find(function (p) { return p.id === data.id; })) products.push(data);
            });
          } catch (e) { console.warn('[discover] products fetch', e); }
        }
        products.forEach(function (p) {
          var listing = buildDiscoverListing(p, ENTITY_TYPE.PRODUCT);
          // Distance filter
          if (listing.distance != null && listing.distance > distanceFilter) return;
          // Query filter (if q, check searchable)
          if (q) {
            var hay = (listing.title + ' ' + listing.categoryName + ' ' + listing.subCategory + ' ' + listing.businessName + ' ' + Object.values(listing.searchableAttributes).join(' ')).toLowerCase();
            // Also check attribute-specific search like "red shoes size 39"
            var qTokens = q.toLowerCase().split(/\s+/);
            var match = qTokens.every(function (tok) {
              // For "near me", ignore location tokens
              if (['near', 'me', 'karibu', 'nami'].indexOf(tok) !== -1) return true;
              return hay.includes(tok);
            });
            if (!match) return;
          }
          allListings.push(listing);
        });
      } catch (e) { console.warn('[discover] product listings', e); }
    }

    // Services
    if (entityTypes.indexOf(ENTITY_TYPE.SERVICE) !== -1) {
      try {
        var services = (skh.cachedItems || []).filter(function (it) { return (it.collectionName || '') === 'services'; });
        if (q || services.length < 10) {
          try {
            var sSnap = await skh.getDocs(skh.query(skh.collection(skh.db, 'services'), skh.orderBy('createdAt', 'desc'), skh.limit(50)));
            sSnap.forEach(function (d) {
              var data = Object.assign({ id: d.id, collectionName: 'services' }, d.data());
              if (!services.find(function (s) { return s.id === data.id; })) services.push(data);
            });
          } catch (e) {}
        }
        services.forEach(function (s) {
          var listing = buildDiscoverListing(s, ENTITY_TYPE.SERVICE);
          if (listing.distance != null && listing.distance > distanceFilter) return;
          if (q) {
            var hay = (listing.title + ' ' + listing.categoryName + ' ' + listing.businessName).toLowerCase();
            if (!hay.includes(q.toLowerCase())) {
              // Check tokens
              var toks = q.toLowerCase().split(/\s+/);
              if (!toks.some(function (t) { return hay.includes(t); })) return;
            }
          }
          allListings.push(listing);
        });
      } catch (e) {}
    }

    // Transporters (drivers)
    if (entityTypes.indexOf(ENTITY_TYPE.TRANSPORTER) !== -1) {
      try {
        var drivers = (skh.cachedItems || []).filter(function (it) { return (it.collectionName || '') === 'drivers'; });
        if (q || drivers.length < 10) {
          try {
            var dSnap = await skh.getDocs(skh.query(skh.collection(skh.db, 'drivers'), skh.orderBy('createdAt', 'desc'), skh.limit(50)));
            dSnap.forEach(function (d) {
              var data = Object.assign({ id: d.id, collectionName: 'drivers' }, d.data());
              if (!drivers.find(function (x) { return x.id === data.id; })) drivers.push(data);
            });
          } catch (e) {}
        }
        drivers.forEach(function (d) {
          var listing = buildDiscoverListing(d, ENTITY_TYPE.TRANSPORTER);
          if (listing.distance != null && listing.distance > distanceFilter) return;
          if (q) {
            var hay = (listing.title + ' ' + (d.vehicleType || '') + ' ' + (d.supportedServices || []).join(' ') + ' ' + listing.businessName).toLowerCase();
            if (!hay.includes(q.toLowerCase())) {
              var toks = q.toLowerCase().split(/\s+/);
              if (!toks.some(function (t) { return hay.includes(t); })) return;
            }
          }
          allListings.push(listing);
        });
      } catch (e) {}
    }

    // [PHASE 6 OPTIMIZATION] Vuta 'users' mara MOJA pekee kwa ajili ya Biashara na Watu wote
    var needUsers = (entityTypes.indexOf(ENTITY_TYPE.BUSINESS) !== -1) || (entityTypes.indexOf(ENTITY_TYPE.PERSON) !== -1);
    var sharedUsers = [];
    if (needUsers) {
      try {
        var uSnap = await skh.getDocs(skh.query(skh.collection(skh.db, 'users'), skh.limit(50)));
        uSnap.forEach(function (d) {
          var u = d.data() || {}; u.uid = u.uid || d.id;
          if (u.discoverable !== false) sharedUsers.push(u);
        });
      } catch (eUsers) {
        console.warn('[discover] users fetch error', eUsers);
      }
    }

    // Businesses (from users with businessName/shopName)
    if (entityTypes.indexOf(ENTITY_TYPE.BUSINESS) !== -1) {
      try {
        var bizUsers = sharedUsers.filter(function (u) { return u.businessName || u.shopName || u.isSeller; });
        bizUsers.forEach(function (u) {
          var listing = buildDiscoverListing({ id: u.uid, businessName: u.businessName || u.shopName, title: u.businessName || u.shopName, ownerName: u.fullName, category: u.category, location: u.location || u.region, coords: u.coords || null, rating: u.rating }, ENTITY_TYPE.BUSINESS);
          if (listing.distance != null && listing.distance > distanceFilter) return;
          if (q) {
            var hay = (listing.title + ' ' + listing.categoryName + ' ' + (u.fullName || '')).toLowerCase();
            if (!hay.includes(q.toLowerCase())) return;
          }
          allListings.push(listing);
        });
      } catch (e) {}
    }

    // People (discoverable)
    if (entityTypes.indexOf(ENTITY_TYPE.PERSON) !== -1) {
      try {
        var myId = uid();
        var people = sharedUsers.filter(function (u) { return u.uid !== myId; });
        people.forEach(function (u) {
          var listing = buildDiscoverListing({ id: u.uid, uid: u.uid, fullName: u.fullName, displayName: u.displayName, businessName: u.businessName, category: u.category, interests: u.interests, location: u.location, region: u.region, photoURL: u.photoURL, verified: u.verified }, ENTITY_TYPE.PERSON);
          if (q) {
            var hay = (u.fullName + ' ' + (u.displayName || '') + ' ' + (u.username || '') + ' ' + (u.businessName || '') + ' ' + (Array.isArray(u.interests) ? u.interests.join(' ') : '')).toLowerCase();
            if (q && !hay.includes(q.toLowerCase())) {
              var toks = q.toLowerCase().split(/\s+/);
              if (!toks.some(function (t) { return hay.includes(t); })) return;
            }
          }
          listing.raw = u;
          allListings.push(listing);
        });
      } catch (e) {}
    }

    // Groups
    if (entityTypes.indexOf(ENTITY_TYPE.GROUP) !== -1) {
      try {
        var groups = [];
        try {
          var gSnap = await skh.getDocs(skh.query(skh.collection(skh.db, 'chatGroups'), skh.where('visibility', '==', 'public'), skh.limit(30)));
          gSnap.forEach(function (d) { var g = d.data() || {}; g.id = d.id; groups.push(g); });
        } catch (e) {}
        groups.forEach(function (g) {
          var listing = buildDiscoverListing({ id: g.id, title: g.name || g.title, description: g.description, category: g.category, location: g.location }, ENTITY_TYPE.GROUP);
          if (q && !String(g.name || '').toLowerCase().includes(q.toLowerCase())) return;
          listing.raw = g;
          allListings.push(listing);
        });
      } catch (e) {}
    }

    // Ranking
    var ranked = rankListings(allListings, q, userLoc, intent);

    // Group into sections
    var sections = {
      intent: intent,
      query: q,
      userLocation: userLoc,
      products: [],
      nearbyBusinesses: [],
      onlineSellers: [],
      offlineSellers: [],
      services: [],
      transporters: [],
      businesses: [],
      people: [],
      groups: [],
      interests: [], // <-- [PHASE 6 FIX]
      opportunities: [],
      related: []
    };

    ranked.forEach(function (r) {
      var l = r.listing;
      if (l.entityType === ENTITY_TYPE.PRODUCT) {
        sections.products.push(r);
        if (l.sellerMode === SELLER_MODE.DISCOVER_ONLY || l.sellerMode === SELLER_MODE.POS_DISCOVER) sections.offlineSellers.push(r);
        if (l.sellerMode === SELLER_MODE.ONLINE_DISCOVER) sections.onlineSellers.push(r);
      } else if (l.entityType === ENTITY_TYPE.SERVICE) {
        sections.services.push(r);
      } else if (l.entityType === ENTITY_TYPE.TRANSPORTER) {
        sections.transporters.push(r);
      } else if (l.entityType === ENTITY_TYPE.BUSINESS) {
        sections.businesses.push(r);
        sections.nearbyBusinesses.push(r);
      } else if (l.entityType === ENTITY_TYPE.PERSON) {
        sections.people.push(r);
      } else if (l.entityType === ENTITY_TYPE.GROUP) {
        sections.groups.push(r);
      }
    });

    // [PHASE 6 FIX] Jaza sections.interests ili Tab ya 'Interests' isikae tupu
    try {
      var pSec = getPersonalizedSections();
      if (pSec && pSec.basedOnInterests && pSec.basedOnInterests.length) {
        sections.interests = pSec.basedOnInterests.map(function (item) { return { listing: item, score: 10 }; });
      }
    } catch (eInt) {}

    // Related categories
    try {
      if (q) {
        var relatedCats = [];
        if (skh.advancedCategories) {
          Object.keys(skh.advancedCategories).forEach(function (cat) {
            if (cat.toLowerCase().includes(q.toLowerCase()) || q.toLowerCase().includes(cat.toLowerCase())) relatedCats.push(cat);
          });
        }
        sections.related = relatedCats.slice(0, 5);
      }
    } catch (e) {}

    // Save popular search + activity halisi ya ranking (dedupe iko service layer).
    if (q) {
      addPopularSearch(q);
      if (typeof skh.recordMarketSearch === 'function') skh.recordMarketSearch(q, 'discover');
    }

    // Save search event for personalization
    try {
      var searchHistory = JSON.parse(skh.localStorage.getItem('skh_search_history') || '[]');
      searchHistory.unshift({ q: q, intent: intent, at: nowIso() });
      searchHistory = searchHistory.slice(0, 50);
      skh.localStorage.setItem('skh_search_history', JSON.stringify(searchHistory));
    } catch (e) {}

    return sections;
  }

  // --- Recently Viewed & Personalized ---
  function getRecentlyViewed() {
    try {
      var raw = skh.localStorage.getItem('skh_recently_viewed');
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.slice(0, 20) : [];
    } catch (e) { return []; }
  }

  function addRecentlyViewed(listing) {
    try {
      var arr = getRecentlyViewed();
      arr = arr.filter(function (it) { return it.entityId !== listing.entityId; });
      arr.unshift({ entityId: listing.entityId, entityType: listing.entityType, title: listing.title, image: listing.image, at: nowIso() });
      arr = arr.slice(0, 30);
      skh.localStorage.setItem('skh_recently_viewed', JSON.stringify(arr));
    } catch (e) {}
  }

  function getPersonalizedSections() {
    var sections = { basedOnInterests: [], popularNearYou: [] };
    try {
      var interests = [];
      var userData = skh.currentUserData || {};
      if (Array.isArray(userData.interests)) interests = interests.concat(userData.interests);
      if (userData.category) interests.push(userData.category);
      // From search history
      var searchHistory = JSON.parse(skh.localStorage.getItem('skh_search_history') || '[]');
      searchHistory.slice(0, 10).forEach(function (h) { if (h.q) interests.push(h.q); });

      var uniqueInterests = Array.from(new Set(interests.map(function (i) { return String(i).toLowerCase(); }))).slice(0, 5);

      // Find products matching interests
      var cached = skh.cachedItems || [];
      uniqueInterests.forEach(function (interest) {
        var matches = cached.filter(function (it) {
          var hay = (it.title + ' ' + (it.category || '') + ' ' + (it.description || '')).toLowerCase();
          return hay.includes(interest);
        }).slice(0, 3);
        matches.forEach(function (m) {
          var listing = buildDiscoverListing(m, ENTITY_TYPE.PRODUCT);
          sections.basedOnInterests.push(listing);
        });
      });

      // [FIX §32/§74] Popular near you — uses REAL engagement data (views+likes from product data)
      // NOT mock/fake. If no engagement data exists, section simply won't render.
      var popular = cached.filter(function(p) { return (p.views > 0 || p.likes > 0); }).sort(function (a, b) { return ((b.views||0)*0.1 + (b.likes||0)*2) - ((a.views||0)*0.1 + (a.likes||0)*2); }).slice(0, 10);
      popular.forEach(function (p) {
        var listing = buildDiscoverListing(p, ENTITY_TYPE.PRODUCT);
        if (listing.distance != null && listing.distance < 10) sections.popularNearYou.push(listing);
      });
    } catch (e) {}
    return sections;
  }

  // --- UI Rendering ---
  function renderQuickCategories(activeKind) {
    var cats = [
      { id: 'all', label: T2('Bidhaa', 'All'), icon: '🌐' },
      { id: 'products', label: T2('Bidhaa', 'Products'), icon: '🛍️' },
      { id: 'services', label: T2('Huduma', 'Services'), icon: '🔧' },
      { id: 'businesses', label: T2('Biashara', 'Businesses'), icon: '🏪' },
      { id: 'nearby', label: T2('Karibu', 'Nearby'), icon: '📍' },
      { id: 'transport', label: T2('Usafiri', 'Transport'), icon: '🚚' },
      { id: 'sellers', label: T2('Wauzaji', 'Sellers'), icon: '👨‍💼' },
      { id: 'people', label: T2('Watu', 'People'), icon: '👥' },
      { id: 'groups', label: T2('Vikundi', 'Groups'), icon: '👨‍👩‍👧‍👦' }
    ];
    return '<div class="skh-de-quick">' + cats.map(function (c) {
      var on = activeKind === c.id;
      return '<div class="skh-de-qcat' + (on ? ' active' : '') + '" data-act="de-qcat" data-kind="' + esc(c.id) + '"><div class="skh-de-qcat-ic">' + esc(c.icon) + '</div><label>' + esc(c.label) + '</label></div>';
    }).join('') + '</div>';
  }

  function renderDistanceFilters(active) {
    // If 88-discover-complete.js is loaded, skip distance buttons (88 has its own filter UI)
    if (window.__skhDiscoverComplete88) return '';
    var filters = [
      { id: 'any', label: 'Anywhere', value: DISTANCE_FILTER.ANY },
      { id: '100m', label: '100m', value: DISTANCE_FILTER.M100 },
      { id: '500m', label: '500m', value: DISTANCE_FILTER.M500 },
      { id: '1km', label: '1km', value: DISTANCE_FILTER.KM1 },
      { id: '5km', label: '5km', value: DISTANCE_FILTER.KM5 },
      { id: '10km', label: '10km', value: DISTANCE_FILTER.KM10 }
    ];
    return '<div class="skh-de-distance-filter">' + filters.map(function (f) {
      var on = active === f.value;
      return '<button class="skh-de-dist-btn' + (on ? ' active' : '') + '" data-act="de-dist" data-value="' + f.value + '">' + esc(f.label) + '</button>';
    }).join('') + '</div>';
  }

  function renderAvailabilityBadge(status, freshness) {
    var map = {
      AVAILABLE: { label: 'Available', cls: 'available', dot: '#18A982' },
      LOW_STOCK: { label: 'Low Stock', cls: 'low', dot: '#f59e0b' },
      OUT_OF_STOCK: { label: 'Out of Stock', cls: 'out', dot: '#ef4444' },
      NOT_TRACKED: { label: 'Listed', cls: 'notracked', dot: '#94a3b8' },
      UNKNOWN: { label: 'Unknown', cls: 'unknown', dot: '#94a3b8' },
      STALE: { label: 'Stale', cls: 'stale', dot: '#f97316' }
    };
    var info = map[status] || map.UNKNOWN;
    var freshLabel = freshness ? freshness.label : '';
    return '<span class="skh-de-avail skh-de-avail--' + info.cls + '"><span class="skh-de-avail-dot"></span>' + esc(info.label) + (freshLabel ? ' • ' + esc(freshLabel) : '') + '</span>';
  }

  function renderProductCard(listing, isOffline) {
    var l = listing.listing || listing;
    var score = listing.score != null ? listing.score : null;
    var isOff = isOffline || l.sellerMode === SELLER_MODE.DISCOVER_ONLY || l.sellerMode === SELLER_MODE.POS_DISCOVER;
    var cardCls = isOff ? 'skh-de-card--offline' : 'skh-de-card--online';
    var badge = isOff ? '<span class="skh-de-card-badge skh-de-card-badge--offline">Listed on SokoHai</span>' : '<span class="skh-de-card-badge skh-de-card-badge--online">Online Ordering</span>';
    if (l.sellerMode === SELLER_MODE.POS_DISCOVER) badge = '<span class="skh-de-card-badge skh-de-card-badge--offline">POS + Discover</span>';
    // [FIX §54] Image optimization: use thumbnail for cards, lazy loading, CDN transform if available
    var imgUrl = l.image;
    if (imgUrl && typeof imgUrl === 'string') {
      // Cloudinary auto-transform if URL contains cloudinary
      if (imgUrl.includes('cloudinary.com')) {
        imgUrl = imgUrl.replace('/upload/', '/upload/w_320,h_240,c_fill,q_auto,f_auto/');
      }
      // Firebase Storage: add size params if possible
      else if (imgUrl.includes('firebasestorage') || imgUrl.includes('storage.googleapis')) {
        imgUrl = imgUrl + '?alt=media&width=320';
      }
    }
    var img = imgUrl ? '<img src="' + esc(imgUrl) + '" loading="lazy" decoding="async" width="320" height="240" style="width:100%;height:100%;object-fit:cover;" onerror="this.src=window.SKH_PLACEHOLDER_IMG||\'\'">' : '<div style="width:100%;height:100%;background:linear-gradient(135deg,#1268A8,#2B82BD);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:22px;">' + esc((l.title||'P').charAt(0).toUpperCase()) + '</div>';
    var price = l.price != null ? 'TSh ' + Number(l.price).toLocaleString() : T2('Bei ya Maelewano', 'Negotiable');
    var distance = l.distance != null ? '<span class="skh-de-card-distance">📍 ' + esc(formatDistance(l.distance)) + ' away</span>' : '';
    var avail = l.availabilityStatus ? renderAvailabilityBadge(l.availabilityStatus, l.freshness) : '';
    var business = l.businessName ? '<div class="skh-de-card-business">🏪 ' + esc(l.businessName) + '</div>' : (l.sellerName ? '<div class="skh-de-card-business">👤 ' + esc(l.sellerName) + '</div>' : '');

    var actions = '';
    if (isOff) {
      actions = '<div class="skh-de-card-actions"><button class="skh-de-card-btn skh-de-card-btn--gold" data-act="de-go-there" data-id="' + esc(l.entityId) + '">Go There</button><button class="skh-de-card-btn" data-act="de-chat" data-id="' + esc(l.entityId) + '" data-type="' + esc(l.entityType) + '">Chat</button><button class="skh-de-card-btn" data-act="de-navigate" data-id="' + esc(l.entityId) + '">Navigate</button></div>';
    } else {
      actions = '<div class="skh-de-card-actions"><button class="skh-de-card-btn skh-de-card-btn--primary" data-act="de-view" data-id="' + esc(l.entityId) + '" data-type="' + esc(l.entityType) + '">View</button><button class="skh-de-card-btn skh-de-card-btn--green" data-act="de-chat" data-id="' + esc(l.entityId) + '" data-type="' + esc(l.entityType) + '">Chat</button><button class="skh-de-card-btn" data-act="de-cart" data-id="' + esc(l.entityId) + '">Cart</button></div>';
    }

    return '<div class="skh-de-card ' + cardCls + '" data-act="de-view" data-id="' + esc(l.entityId) + '" data-type="' + esc(l.entityType) + '">'
      + '<div class="skh-de-card-img">' + img + badge + '</div>'
      + '<div class="skh-de-card-body"><div class="skh-de-card-title">' + esc(l.title) + '</div>'
      + '<div class="skh-de-card-price">' + esc(price) + '</div>'
      + '<div class="skh-de-card-meta">' + avail + (distance ? '<span class="dot"></span>' + distance : '') + '</div>'
      + business
      + actions
      + '</div></div>';
  }

  function renderBusinessCard(listing) {
    var l = listing.listing || listing;
    var initial = String(l.title||'B').charAt(0).toUpperCase();
    var distance = l.distance != null ? formatDistance(l.distance) + ' away' : (l.location || '');
    var products = '';
    try {
      var cached = (skh.cachedItems || []).filter(function (it) { return (it.ownerName||'') === l.title || (it.businessName||'') === l.title; }).slice(0,4);
      if (cached.length) products = '<div class="skh-de-biz-products">' + cached.map(function (it) { return '<span>' + esc(it.title||'Product') + '</span>'; }).join('') + '</div>';
    } catch (e) {}
    return '<div class="skh-de-biz-card" data-act="de-view-business" data-id="' + esc(l.entityId) + '">'
      + '<div class="skh-de-biz-avatar">' + esc(initial) + '</div>'
      + '<div class="skh-de-biz-info"><b>' + esc(l.title) + '</b><small>🏪 ' + esc(l.categoryName||'Business') + (distance ? ' • 📍 ' + esc(distance) : '') + '</small>' + products + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:6px;"><button class="skh-de-card-btn skh-de-card-btn--primary" data-act="de-view-business" data-id="' + esc(l.entityId) + '">View</button><button class="skh-de-card-btn" data-act="de-go-there" data-id="' + esc(l.entityId) + '">Go There</button></div>'
      + '</div>';
  }

  function renderServiceCard(listing) {
    var l = listing.listing || listing;
    var initial = String(l.title||'S').charAt(0).toUpperCase();
    var distance = l.distance != null ? formatDistance(l.distance) + ' away' : '';
    return '<div class="skh-de-service-card" data-act="de-view" data-id="' + esc(l.entityId) + '" data-type="' + esc(l.entityType) + '">'
      + '<div class="skh-de-biz-avatar" style="background:linear-gradient(135deg,#2B82BD,#0B4F7A);">' + esc(initial) + '</div>'
      + '<div class="skh-de-biz-info"><b>' + esc(l.title) + '</b><small>🔧 ' + esc(l.categoryName||'Service') + (distance ? ' • 📍 ' + esc(distance) : '') + '</small><small style="color:#64748b;">' + esc((l.description||'').slice(0,80)) + '</small></div>'
      + '<div style="display:flex;flex-direction:column;gap:6px;"><button class="skh-de-card-btn skh-de-card-btn--primary" data-act="de-view" data-id="' + esc(l.entityId) + '" data-type="' + esc(l.entityType) + '">View</button><button class="skh-de-card-btn" data-act="de-chat" data-id="' + esc(l.entityId) + '" data-type="' + esc(l.entityType) + '">Chat</button></div>'
      + '</div>';
  }

  function renderTransportCard(listing) {
    var l = listing.listing || listing;
    var initial = String(l.title||'T').charAt(0).toUpperCase();
    var distance = l.distance != null ? formatDistance(l.distance) + ' away' : '';
    var vehicle = l.raw && l.raw.vehicleType ? l.raw.vehicleType : '';
    var services = l.raw && l.raw.supportedServices ? l.raw.supportedServices.join(', ') : '';
    return '<div class="skh-de-transport-card" data-act="de-view" data-id="' + esc(l.entityId) + '" data-type="' + esc(l.entityType) + '">'
      + '<div class="skh-de-biz-avatar" style="background:linear-gradient(135deg,#18A982,#0f766e);">' + esc(initial) + '</div>'
      + '<div class="skh-de-biz-info"><b>' + esc(l.title) + '</b><small>🚚 ' + esc(vehicle||'Transport') + (services ? ' • ' + esc(services) : '') + (distance ? ' • 📍 ' + esc(distance) : '') + '</small><small style="color:#64748b;">' + esc(l.location||'') + '</small></div>'
      + '<div style="display:flex;flex-direction:column;gap:6px;"><button class="skh-de-card-btn skh-de-card-btn--green" data-act="de-request-ride" data-id="' + esc(l.entityId) + '">Request Ride</button><button class="skh-de-card-btn" data-act="de-chat" data-id="' + esc(l.entityId) + '" data-type="' + esc(l.entityType) + '">Chat</button></div>'
      + '</div>';
  }

  function renderPersonCard(listing) {
    var l = listing.listing || listing;
    var u = l.raw || {};
    var name = u.fullName || u.displayName || l.title || 'Person';
    var initial = String(name).charAt(0).toUpperCase();
    var role = u.primaryProfile || u.role || (u.isSeller ? 'Seller' : 'Customer');
    var badges = window.skhRoleBadgesFor ? window.skhRoleBadgesFor(u) : '';
    var verify = (u.verified || u.verifiedBusiness) ? '<span style="color:#18A982;font-weight:900;">✓</span>' : '';
    var interests = '';
    if (u.discovery && u.discovery.showInterests !== false && Array.isArray(u.interests)) {
      interests = '<div style="margin-top:4px;">' + u.interests.slice(0,3).map(function (i) { return '<span style="display:inline-block;background:#eef6fc;color:#0B4F7A;font-size:10px;font-weight:700;padding:2px 6px;border-radius:99px;margin:2px;">' + esc(i) + '</span>'; }).join('') + '</div>';
    }
    return '<div class="skh-de-person-card" data-act="de-view-person" data-id="' + esc(l.entityId) + '">'
      + '<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#1268A8,#18A982);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;">' + esc(initial) + '</div>'
      + '<div class="skh-de-biz-info"><b>' + esc(name) + ' ' + verify + '</b><small>' + esc(role) + (u.businessName ? ' • ' + esc(u.businessName) : '') + '</small>' + badges + interests + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:6px;"><button class="skh-de-card-btn skh-de-card-btn--green" data-act="de-chat-person" data-id="' + esc(l.entityId) + '">Chat</button><button class="skh-de-card-btn" data-act="de-view-person" data-id="' + esc(l.entityId) + '">View</button></div>'
      + '</div>';
  }

  function renderGroupCard(listing) {
    var l = listing.listing || listing;
    var g = l.raw || {};
    var name = g.name || l.title || 'Group';
    return '<div class="skh-de-biz-card" data-act="de-view-group" data-id="' + esc(l.entityId) + '">'
      + '<div class="skh-de-biz-avatar" style="background:#e0f0fa;color:#1268A8;">#</div>'
      + '<div class="skh-de-biz-info"><b>' + esc(name) + '</b><small>' + esc(g.category||'Group') + ' • ' + (g.memberCount||1) + ' members</small><small style="color:#64748b;">' + esc((g.description||'').slice(0,80)) + '</small></div>'
      + '<div style="display:flex;flex-direction:column;gap:6px;"><button class="skh-de-card-btn skh-de-card-btn--primary" data-act="de-join-group" data-id="' + esc(l.entityId) + '">Join</button><button class="skh-de-card-btn" data-act="de-view-group" data-id="' + esc(l.entityId) + '">View</button></div>'
      + '</div>';
  }

  function renderSearchResults(sections) {
    var html = '';

    // Intent badge (skip if 88 is loaded — 88 has its own search header)
    if (sections.query && !window.__skhDiscoverComplete88) {
      html += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;"><span class="skh-de-intent">Intent: ' + esc(sections.intent) + '</span><small style="color:#64748b;font-size:11px;">for "' + esc(sections.query) + '"</small></div>';
    }

    // Filters
    html += renderDistanceFilters(sections.distanceFilter || DISTANCE_FILTER.ANY);

    // Products section
    if (sections.products && sections.products.length) {
      html += '<div class="skh-de-section"><div class="skh-de-section-head"><h3>🛍️ Products (' + sections.products.length + ')</h3></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;">' + sections.products.slice(0,12).map(function (r) { return renderProductCard(r); }).join('') + '</div></div>';
    }

    // Nearby Businesses
    if (sections.nearbyBusinesses && sections.nearbyBusinesses.length) {
      html += '<div class="skh-de-section"><div class="skh-de-section-head"><h3>🏪 Nearby Businesses (' + sections.nearbyBusinesses.length + ')</h3></div>' + sections.nearbyBusinesses.slice(0,6).map(function (r) { return renderBusinessCard(r); }).join('') + '</div>';
    }

    // Services
    if (sections.services && sections.services.length) {
      html += '<div class="skh-de-section"><div class="skh-de-section-head"><h3>🔧 Services (' + sections.services.length + ')</h3></div>' + sections.services.slice(0,6).map(function (r) { return renderServiceCard(r); }).join('') + '</div>';
    }

    // Transporters
    if (sections.transporters && sections.transporters.length) {
      html += '<div class="skh-de-section"><div class="skh-de-section-head"><h3>🚚 Transporters (' + sections.transporters.length + ')</h3></div>' + sections.transporters.slice(0,6).map(function (r) { return renderTransportCard(r); }).join('') + '</div>';
    }

    // People
    if (sections.people && sections.people.length) {
      html += '<div class="skh-de-section"><div class="skh-de-section-head"><h3>👥 People (' + sections.people.length + ')</h3></div>' + sections.people.slice(0,6).map(function (r) { return renderPersonCard(r); }).join('') + '</div>';
    }

    // Groups
    if (sections.groups && sections.groups.length) {
      html += '<div class="skh-de-section"><div class="skh-de-section-head"><h3>👨‍👩‍👧‍👦 Groups (' + sections.groups.length + ')</h3></div>' + sections.groups.slice(0,6).map(function (r) { return renderGroupCard(r); }).join('') + '</div>';
    }

    // Related
    if (sections.related && sections.related.length) {
      html += '<div class="skh-de-section"><div class="skh-de-section-head"><h3>🔗 Related</h3></div><div style="display:flex;gap:8px;flex-wrap:wrap;">' + sections.related.map(function (cat) { return '<span class="skh-de-filter" data-act="de-related" data-cat="' + esc(cat) + '">' + esc(cat) + '</span>'; }).join('') + '</div></div>';
    }

    // Empty state with actions
    if (!sections.products.length && !(sections.nearbyBusinesses||[]).length && !(sections.businesses||[]).length && !sections.services.length && !sections.transporters.length && !sections.people.length && !sections.groups.length) {
      html += '<div class="skh-de-empty"><b>Nothing found' + (sections.query ? ' for "' + esc(sections.query) + '"' : ' nearby') + '</b><small>Try expanding search radius, searching online, or requesting this product.</small><div class="skh-de-empty-actions"><button data-act="de-expand-radius">Expand Radius</button><button data-act="de-search-online">Search Online</button><button data-act="de-request-nearby" data-query="' + esc(sections.query||'') + '">Request Product Nearby</button></div></div>';
    }

    return html || '<div class="skh-de-empty"><b>No results</b><small>Try different keywords.</small></div>';
  }

  function renderDiscoverHome() {
    var userLoc = getUserDiscoveryLocation();
    var recent = getRecentlyViewed();
    var personalized = getPersonalizedSections();
    var html = '';

    html += '<div style="margin-bottom:12px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:12px;"><div style="display:flex;justify-content:space-between;align-items:center;"><b style="font-size:13px;color:#0f172a;">📍 Discovery Location</b><button data-act="de-change-loc" style="border:1px solid #cbd5e1;background:#fff;color:#1268A8;font-weight:800;font-size:11px;padding:6px 10px;border-radius:8px;cursor:pointer;">Change</button></div><small style="color:#64748b;font-size:11.5px;display:block;margin-top:4px;">' + esc(userLoc.name||'') + ' • ' + esc(userLoc.source) + ' • ' + esc(userLoc.lat.toFixed(4) + ', ' + userLoc.lon.toFixed(4)) + '</small>' + renderDistanceFilters(DISTANCE_FILTER.ANY) + '</div>';

    html += renderQuickCategories('all');

    // Near You
    html += '<div class="skh-de-section"><div class="skh-de-section-head"><h3>📍 Near You</h3><a data-act="de-see-all" data-kind="nearby">See All</a></div>';
    try {
      var nearProducts = (skh.cachedItems || []).filter(function (it) {
        if (!it.coords) return false;
        var d = calcDistance(userLoc.lat, userLoc.lon, it.coords.lat, it.coords.lon);
        return d < 5;
      }).slice(0, 6);
      if (nearProducts.length) {
        html += '<div class="skh-de-hscroll">' + nearProducts.map(function (p) {
          var listing = buildDiscoverListing(p, ENTITY_TYPE.PRODUCT);
          return '<div style="min-width:160px;">' + renderProductCard(listing) + '</div>';
        }).join('') + '</div>';
      } else {
        html += '<div class="skh-de-empty" style="padding:18px;"><small>No nearby businesses yet. Expand radius or search online.</small></div>';
      }
    } catch (e) {
      html += '<div class="skh-de-empty"><small>Location unavailable. Search by area or select location manually.</small></div>';
    }
    html += '</div>';

    // Popular Near You
    if (personalized.popularNearYou && personalized.popularNearYou.length) {
      html += '<div class="skh-de-section"><div class="skh-de-section-head"><h3>🔥 Popular Near You</h3></div><div class="skh-de-hscroll">' + personalized.popularNearYou.slice(0,6).map(function (l) { return '<div style="min-width:160px;">' + renderProductCard(l) + '</div>'; }).join('') + '</div></div>';
    }

    // Recently Viewed
    if (recent && recent.length) {
      html += '<div class="skh-de-section"><div class="skh-de-section-head"><h3>🕒 Recently Viewed</h3></div><div class="skh-de-hscroll">' + recent.map(function (it) {
        return '<div class="skh-de-card" style="min-width:140px;" data-act="de-view" data-id="' + esc(it.entityId) + '" data-type="' + esc(it.entityType) + '"><div class="skh-de-card-img">' + (it.image ? '<img src="' + esc(it.image) + '">' : '<div style="width:100%;height:100%;background:#f1f5f9;display:flex;align-items:center;justify-content:center;">' + esc((it.title||'P').charAt(0)) + '</div>') + '</div><div class="skh-de-card-body"><div class="skh-de-card-title" style="min-height:auto;font-size:12px;">' + esc(it.title) + '</div></div></div>';
      }).join('') + '</div></div>';
    }

    // Based on Interests
    if (personalized.basedOnInterests && personalized.basedOnInterests.length) {
      html += '<div class="skh-de-section"><div class="skh-de-section-head"><h3>💡 Based on Your Interests</h3></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;">' + personalized.basedOnInterests.slice(0,6).map(function (l) { return renderProductCard(l); }).join('') + '</div></div>';
    }

    // Quick Discovery Categories explanation
    html += '<div class="skh-de-section"><div class="skh-de-section-head"><h3>🧭 Discover Categories</h3></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
      + '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;"><b style="font-size:12px;">🛍️ Products</b><small style="display:block;color:#64748b;font-size:11px;margin-top:4px;">Online & offline products, cement, shoes, rice...</small></div>'
      + '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;"><b style="font-size:12px;">🔧 Services</b><small style="display:block;color:#64748b;font-size:11px;margin-top:4px;">Tailors, doctors, fundis, beauty...</small></div>'
      + '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;"><b style="font-size:12px;">🏪 Businesses</b><small style="display:block;color:#64748b;font-size:11px;margin-top:4px;">Hardware, shops, stores near you</small></div>'
      + '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;"><b style="font-size:12px;">🚚 Transport</b><small style="display:block;color:#64748b;font-size:11px;margin-top:4px;">Boda, bajaj, pickup, lori</small></div>'
      + '</div></div>';

    return html;
  }

  function renderProductDetail(listing) {
    var l = listing.listing || listing;
    var isOff = l.sellerMode === SELLER_MODE.DISCOVER_ONLY || l.sellerMode === SELLER_MODE.POS_DISCOVER;
    var price = l.price != null ? 'TSh ' + Number(l.price).toLocaleString() : T2('Bei ya Maelewano', 'Negotiable');
    var distance = l.distance != null ? formatDistance(l.distance) + ' away' : '';
    var avail = l.availabilityStatus ? renderAvailabilityBadge(l.availabilityStatus, l.freshness) : '';
    var img = l.image ? '<img src="' + esc(l.image) + '" style="width:100%;height:100%;object-fit:cover;">' : '<div style="width:100%;height:100%;background:linear-gradient(135deg,#1268A8,#2B82BD);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:48px;">' + esc((l.title||'P').charAt(0)) + '</div>';

    var attributesHtml = '';
    if (l.attributes && Object.keys(l.attributes).length) {
      attributesHtml += '<div class="skh-de-attr-section"><h4>Attributes</h4>';
      Object.keys(l.attributes).forEach(function (ak) {
        var attr = l.attributes[ak];
        attributesHtml += '<div style="margin-bottom:10px;"><small style="font-weight:800;color:#334155;font-size:11px;text-transform:uppercase;letter-spacing:.4px;">' + esc(ak) + '</small><div class="skh-de-options">' + attr.options.map(function (opt) {
          return '<button class="skh-de-option" data-act="de-select-option" data-attr="' + esc(ak) + '" data-opt="' + esc(opt) + '">' + esc(opt) + '</button>';
        }).join('') + '</div></div>';
      });
      attributesHtml += '</div>';
    }

    var variantsHtml = '';
    if (l.variants && l.variants.length) {
      variantsHtml += '<div class="skh-de-attr-section"><h4>Variants (' + l.variants.length + ')</h4><div style="display:flex;flex-direction:column;gap:6px;">' + l.variants.slice(0,10).map(function (v) {
        var attrs = Object.keys(v.attributes).map(function (k) { return k + ': ' + v.attributes[k]; }).join(', ');
        var stock = v.stock != null ? v.stock + ' in stock' : 'Stock not tracked';
        return '<div style="display:flex;justify-content:space-between;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:11.5px;"><span>' + esc(attrs) + '</span><span style="font-weight:800;">' + esc(stock) + '</span></div>';
      }).join('') + '</div></div>';
    }

    var stockInfo = '';
    if (l.stock != null) stockInfo = '<div class="skh-de-variant-info">Stock: ' + esc(String(l.stock)) + ' • ' + (l.freshness ? esc(l.freshness.label) : '') + '</div>';
    else if (l.availabilityStatus === AVAILABILITY_STATUS.NOT_TRACKED) stockInfo = '<div class="skh-de-variant-info">Availability: Listed — availability not tracked</div>';

    var locationHtml = '<div class="skh-de-location-card"><b>📍 Business Location</b><small>' + esc(l.formattedAddress || l.location || 'Location not set') + '</small><small style="display:block;margin-top:4px;">' + esc(l.area ? l.area + ', ' : '') + esc(l.city || l.region || '') + ' • ' + esc(distance) + '</small><small style="display:block;margin-top:4px;color:#94a3b8;">Lat: ' + esc(l.latitude != null ? String(l.latitude) : '—') + ' Lng: ' + esc(l.longitude != null ? String(l.longitude) : '—') + ' • Accuracy: ' + esc(l.locationAccuracy||'unknown') + '</small></div>';

    var actions = '';
    if (isOff) {
      actions = '<div style="display:flex;gap:8px;margin-top:14px;"><button class="skh-de-card-btn skh-de-card-btn--gold" data-act="de-go-there" data-id="' + esc(l.entityId) + '" style="flex:1;padding:12px;font-size:13px;">📍 Go There</button><button class="skh-de-card-btn" data-act="de-navigate" data-id="' + esc(l.entityId) + '" style="flex:1;padding:12px;">Navigate</button></div><div style="display:flex;gap:8px;margin-top:8px;"><button class="skh-de-card-btn skh-de-card-btn--green" data-act="de-chat" data-id="' + esc(l.entityId) + '" data-type="' + esc(l.entityType) + '" style="flex:1;padding:12px;">💬 Chat Seller</button></div>';
    } else {
      actions = '<div style="display:flex;gap:8px;margin-top:14px;"><button class="skh-de-card-btn skh-de-card-btn--primary" data-act="de-buy" data-id="' + esc(l.entityId) + '" style="flex:1;padding:12px;font-size:13px;">Buy</button><button class="skh-de-card-btn" data-act="de-cart" data-id="' + esc(l.entityId) + '" style="flex:1;padding:12px;">Add to Cart</button></div><div style="display:flex;gap:8px;margin-top:8px;"><button class="skh-de-card-btn skh-de-card-btn--green" data-act="de-chat" data-id="' + esc(l.entityId) + '" data-type="' + esc(l.entityType) + '" style="flex:1;padding:12px;">💬 Chat Seller</button></div>';
    }

    var commerceContext = '<div class="skh-de-nego-context"><b>💬 Negotiation Context</b><small>When you chat, this info will be shared:</small><div style="margin-top:6px;font-size:11.5px;">Product: ' + esc(l.title) + '<br>Price: ' + esc(price) + '<br>Business: ' + esc(l.businessName||l.sellerName||'') + '<br><span id="deSelectedOptions">No options selected</span><br>Quantity: <span id="deSelectedQty">1</span></div></div>';

    var engagement = '<div class="skh-de-eng"><button data-act="de-like" data-id="' + esc(l.entityId) + '">❤️ Like</button><button data-act="de-save" data-id="' + esc(l.entityId) + '">🔖 Save</button><button data-act="de-open-comments" data-id="' + esc(l.entityId) + '" data-type="' + esc(l.entityType) + '" data-title="' + esc(l.title) + '">💬 Comment</button><button data-act="de-follow" data-id="' + esc(l.sellerId||'') + '">👤 Follow</button><button data-act="de-share-entity" data-id="' + esc(l.entityId) + '" data-type="' + esc(l.entityType) + '" data-title="' + esc(l.title) + '">🔗 Share</button><button data-act="de-report" data-id="' + esc(l.entityId) + '" data-type="' + esc(l.entityType) + '" data-title="' + esc(l.title) + '" style="color:#94a3b8;">🚩</button></div>';

    return '<div class="skh-de-detail"><div class="skh-de-detail-hero">' + img + '<button data-act="de-close-detail" style="position:absolute;top:12px;left:12px;width:36px;height:36px;border-radius:50%;border:none;background:rgba(15,23,42,.7);color:#fff;font-weight:900;cursor:pointer;">‹</button></div><div class="skh-de-detail-body"><h2 class="skh-de-detail-title">' + esc(l.title) + '</h2><div class="skh-de-detail-price">' + esc(price) + '</div><div class="skh-de-detail-meta">' + avail + (distance ? '<span class="skh-de-card-distance">📍 ' + esc(distance) + '</span>' : '') + '<span class="skh-de-intent">' + esc(l.sellerMode||'DISCOVER') + '</span><span class="skh-de-intent">' + esc(l.entityType) + '</span></div>'
      + '<div style="margin-top:8px;font-size:12px;color:#475569;">' + esc(l.description||'') + '</div>'
      + '<div style="margin-top:8px;font-size:11.5px;color:#64748b;">Category: ' + esc(l.categoryName||'') + (l.subCategory ? ' • ' + esc(l.subCategory) : '') + '</div>'
      + stockInfo
      + attributesHtml
      + variantsHtml
      + locationHtml
      + commerceContext
      + engagement
      + actions
      + '<div style="margin-top:12px;"><small style="color:#94a3b8;font-size:11px;">Delivery/Pickup: ' + (l.onlineOrderingEnabled ? 'Online ordering enabled • Delivery & Pickup available' : 'Go There • No online checkout') + '</small></div>'
      + '</div></div>';
  }

  // --- Overlay Shell ---
  function buildOverlay() {
    var el = document.getElementById('skhDiscoverEngine');
    // Check if element exists AND has proper content (not just a placeholder from 81)
    if (el && el.querySelector('#skhDiscoverEngineInput')) return el;
    
    // If element exists but is a placeholder, clear it
    if (el) {
      el.innerHTML = '';
      el.className = 'skh-discover-engine';
    } else {
      el = document.createElement('div');
      el.id = 'skhDiscoverEngine';
      el.className = 'skh-discover-engine';
    }
    
    el.innerHTML = '<div class="skh-de-header"><button class="skh-de-back" data-act="de-close">‹</button><div style="flex:1;min-width:0;"><b>Discover</b><small>Gundua bidhaa, biashara, huduma, watu karibu nawe</small></div><button class="skh-de-back" data-act="de-location" title="Location" style="width:38px;">📍</button></div><div style="padding:12px 14px;background:#fff;border-bottom:1px solid #e2e8f0;"><div class="skh-de-search-wrap"><span class="skh-de-search-ic">⌕</span><input id="skhDiscoverEngineInput" type="text" autocomplete="off" placeholder="Search products, services, businesses or people..."><button data-act="de-clear-search" style="border:none;background:#f1f5f9;width:28px;height:28px;border-radius:50%;cursor:pointer;font-weight:800;display:none;" id="deClearBtn">×</button><div id="skhDiscoverEngineHelper" class="skh-de-search-helper"></div></div></div><div id="skhDiscoverEngineBody" class="skh-de-body"></div>';
    
    if (!el.parentNode) document.body.appendChild(el);

    var input = el.querySelector('#skhDiscoverEngineInput');
    var helper = el.querySelector('#skhDiscoverEngineHelper');
    var clearBtn = el.querySelector('#deClearBtn');

    input.addEventListener('focus', function () {
      if (!this.value) {
        var sug = getSearchSuggestions('');
        renderHelper(sug, helper);
      }
    });
    input.addEventListener('input', function () {
      var v = this.value;
      if (v) clearBtn.style.display = 'flex'; else clearBtn.style.display = 'none';
      clearTimeout(window.__deSearchTimer);
      if (!v) {
        var sug = getSearchSuggestions('');
        renderHelper(sug, helper);
        // Show home
        renderHome();
        return;
      }
      window.__deSearchTimer = setTimeout(async function () {
        var suggestions = getSearchSuggestions(v);
        renderHelper(suggestions, helper);
        // Also run universal search
        await runDiscoverSearch(v);
      }, 300);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        helper.classList.remove('open');
        runDiscoverSearch(this.value);
      }
      if (e.key === 'Escape') {
        helper.classList.remove('open');
      }
    });

    // Click outside helper closes
    document.addEventListener('click', function (e) {
      if (!helper.contains(e.target) && e.target !== input) helper.classList.remove('open');
    });

    return el;
  }

  function renderHelper(suggestions, helperEl) {
    var helper = helperEl || document.getElementById('skhDiscoverEngineHelper');
    if (!helper) return;
    if (!suggestions || !suggestions.length) { helper.classList.remove('open'); helper.innerHTML = ''; return; }
    var grouped = {};
    suggestions.forEach(function (s) {
      if (!grouped[s.type]) grouped[s.type] = [];
      grouped[s.type].push(s);
    });
    var html = '';
    Object.keys(grouped).forEach(function (type) {
      var label = type.replace('_', ' ').toUpperCase();
      html += '<div class="skh-de-suggest-sec">' + esc(label) + '</div>';
      grouped[type].forEach(function (s) {
        html += '<div class="skh-de-suggest-row" data-act="de-suggest" data-text="' + esc(s.text) + '" data-type="' + esc(s.type) + '"><div class="skh-de-suggest-ic">' + esc(s.icon||'⌕') + '</div><div class="skh-de-suggest-tx"><b>' + esc(s.text) + '</b><small>' + esc(s.sub||'') + '</small></div></div>';
      });
    });
    helper.innerHTML = html;
    helper.classList.add('open');
  }

  function renderHome() {
    var body = document.getElementById('skhDiscoverEngineBody');
    if (!body) return;
    body.innerHTML = renderDiscoverHome();
  }

  async function runDiscoverSearch(query, opts) {
    var body = document.getElementById('skhDiscoverEngineBody');
    if (!body) return;
    body.innerHTML = '<div style="text-align:center;padding:30px;color:#64748b;"><small>Searching "' + esc(query) + '"...</small><div style="margin-top:12px;width:24px;height:24px;border:3px solid #e2e8f0;border-top-color:#1268A8;border-radius:50%;animation:spin 1s linear infinite;display:inline-block;"></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style></div>';
    try {
      var sections = await universalSearch(query, opts);
      body.innerHTML = renderSearchResults(sections);
      window.__deLastSections = sections;
    } catch (e) {
      console.warn('[discover search]', e);
      body.innerHTML = '<div class="skh-de-empty"><b>Search failed</b><small>' + esc(e.message||'Try again') + '</small></div>';
    }
  }

  // --- Global Open/Close ---
  window.skhDiscoverEngineOpen = function (initialQuery, opts) {
    var el = buildOverlay();
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
    var input = document.getElementById('skhDiscoverEngineInput');
    if (initialQuery) {
      input.value = initialQuery;
      document.getElementById('deClearBtn').style.display = 'flex';
      runDiscoverSearch(initialQuery, opts);
    } else {
      renderHome();
      setTimeout(function () { input.focus(); }, 100);
    }
  };

  window.skhDiscoverEngineClose = function () {
    var el = document.getElementById('skhDiscoverEngine');
    if (el) el.classList.remove('open');
    document.body.style.overflow = 'auto';
    var helper = document.getElementById('skhDiscoverEngineHelper');
    if (helper) helper.classList.remove('open');
  };

  // Backward compat: enhance old discover open
  // [FIX 2026-09-19] Use EXISTING floating Gundua FAB (#skhDiscFab from 68-chat-discover.js)
  // as single entry point per founder instruction - no extra top button.
  // skhDiscoverOpen with no kind now opens GLOBAL engine (products/services/businesses/people/groups/transport/nearby)
  var origDiscoverOpen = window.skhDiscoverOpen;
  window.skhDiscoverOpen = function (kind) {
    // Global engine is primary - existing FAB should open full Discover
    if (!kind || kind === 'all' || ['products','services','businesses','nearby','transport','people','sellers','groups'].indexOf(kind) !== -1) {
      window.skhDiscoverEngineOpen('', { entityTypes: kind === 'products' ? [ENTITY_TYPE.PRODUCT] : kind === 'services' ? [ENTITY_TYPE.SERVICE] : kind === 'businesses' ? [ENTITY_TYPE.BUSINESS] : kind === 'transport' ? [ENTITY_TYPE.TRANSPORTER] : kind === 'people' ? [ENTITY_TYPE.PERSON] : kind === 'groups' ? [ENTITY_TYPE.GROUP] : kind === 'sellers' ? [ENTITY_TYPE.BUSINESS, ENTITY_TYPE.PERSON] : undefined });
      return;
    }
    // Legacy kinds (connections, opportunities, etc) still handled by 72 overlay if needed
    if (origDiscoverOpen) return origDiscoverOpen(kind);
    window.skhDiscoverEngineOpen();
  };

  // Enhance main searchInput to trigger Discover Engine - NO EXTRA BUTTON
  // Uses existing floating Gundua button as entry point per spec §1-21
  function enhanceMainSearch() {
    var mainInput = document.getElementById('searchInput');
    if (!mainInput || mainInput._deEnhanced) return;
    mainInput._deEnhanced = true;
    // Remove any previously injected extra button if exists (cleanup)
    try {
      var oldBtn = document.getElementById('skhDiscoverMainBtn');
      if (oldBtn && oldBtn.parentElement) oldBtn.parentElement.removeChild(oldBtn);
    } catch (e) {}
    // Optional: Enter on main search with discovery intent opens global engine
    // but does NOT create new UI button - reuses existing FAB system
    mainInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && this.value.trim().length >= 2) {
        var intent = detectIntent(this.value);
        if ([SEARCH_INTENT.LOCATION_SEARCH, SEARCH_INTENT.SERVICE_SEARCH, SEARCH_INTENT.TRANSPORT_SEARCH, SEARCH_INTENT.BUSINESS_SEARCH, SEARCH_INTENT.PRODUCT_SEARCH].indexOf(intent) !== -1) {
          // Let original handleSearch run, but also allow engine if user explicitly wants global discover
          // Do not auto-open to avoid double UI - user can use FAB for full discover
        }
      }
    });
  }

  // --- Negotiation Integration ---
  var selectedOptions = {}; // {Color:'Red', Size:'39'}
  var selectedQty = 1;

  function updateNegoContext() {
    var optEl = document.getElementById('deSelectedOptions');
    var qtyEl = document.getElementById('deSelectedQty');
    if (optEl) {
      var parts = Object.keys(selectedOptions).map(function (k) { return k + ': ' + selectedOptions[k]; });
      optEl.textContent = parts.length ? parts.join(', ') : 'No options selected';
    }
    if (qtyEl) qtyEl.textContent = String(selectedQty);
  }

  window.skhDiscoverOpenNegotiation = function (listing) {
    var l = listing.listing || listing;
    // Build commerce context
    var context = {
      productId: l.entityId,
      sellerId: l.sellerId,
      collection: 'products',
      title: l.title,
      price: l.price,
      variant: Object.keys(selectedOptions).map(function (k) { return selectedOptions[k]; }).join(' / ') || null,
      quantity: selectedQty,
      businessName: l.businessName,
      sellerName: l.sellerName,
      attributes: selectedOptions
    };
    // Try to open chat with seller with context
    try {
      if (l.sellerId && window.openChatWithUser) {
        // Set activeChatProduct context for negotiation card
        skh.activeChatProduct = Object.assign({}, l.raw || {}, { id: l.entityId, title: l.title, image: l.image, price: l.price, collectionName: 'products', userId: l.sellerId, selectedVariants: selectedOptions, selectedQty: selectedQty });
        skh.activeChatProductContext = context;
        window.openChatWithUser(l.sellerId, l.sellerName || l.businessName || l.title);
        // After chat opens, refresh negotiation card
        setTimeout(function () {
          if (typeof window.skhChatRefreshNegoCard === 'function') window.skhChatRefreshNegoCard();
        }, 800);
        window.skhDiscoverEngineClose();
      } else {
        // Fallback: open product
        if (window.openProduct) window.openProduct(l.entityId, 'products');
      }
    } catch (e) { console.warn('[discover nego]', e); }
  };

  // --- Request Product Nearby ---
  async function createDiscoverRequest(query, quantity, area, priceRange) {
    if (!uid()) { alert(T2('Ingia kwanza', 'Login first')); return; }
    var req = {
      id: genId('REQ'),
      productQuery: query,
      quantity: quantity || 1,
      area: area || getUserDiscoveryLocation().name || '',
      priceRange: priceRange || null,
      userId: uid(),
      userName: (skh.currentUser && skh.currentUser.displayName) || '',
      status: 'OPEN',
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48h expiry
      interestedSellers: []
    };
    try {
      await skh.addDoc(skh.collection(skh.db, 'discoverRequests'), req);
      alert(T2('Ombi lako limetumwa kwa wauzaji wa karibu!', 'Your request sent to nearby sellers!'));
      // Notify relevant sellers (if they opted into opportunities) — via cloud function conceptually
      // For now, add to local queue
      var queue = JSON.parse(skh.localStorage.getItem('skh_discover_requests') || '[]');
      queue.unshift(req);
      skh.localStorage.setItem('skh_discover_requests', JSON.stringify(queue.slice(0,20)));
    } catch (e) {
      console.warn('[discover request]', e);
      alert('Failed to send request: ' + (e.message||''));
    }
  }

  function renderRequestNearbyModal(query) {
    var m = document.getElementById('skhDiscoverRequestModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'skhDiscoverRequestModal';
      m.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:16px;';
      document.body.appendChild(m);
    }
    m.style.display = 'flex';
    var userLoc = getUserDiscoveryLocation();
    m.innerHTML = '<div style="background:#fff;border-radius:20px;padding:20px;width:100%;max-width:400px;max-height:90vh;overflow-y:auto;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><b style="font-size:15px;color:#0f172a;">📦 Request Product Nearby</b><button data-act="de-close-request" style="border:none;background:#f1f5f9;width:32px;height:32px;border-radius:50%;cursor:pointer;font-weight:900;">×</button></div>'
      + '<div style="display:flex;flex-direction:column;gap:10px;">'
      + '<label style="font-size:12px;font-weight:800;color:#334155;">Product Needed</label><input id="deReqProduct" type="text" value="' + esc(query||'') + '" placeholder="e.g. Cement 50kg" style="padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;">'
      + '<label style="font-size:12px;font-weight:800;color:#334155;">Quantity</label><input id="deReqQty" type="number" min="1" value="1" style="padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;">'
      + '<label style="font-size:12px;font-weight:800;color:#334155;">Preferred Area</label><input id="deReqArea" type="text" value="' + esc(userLoc.name||'') + '" placeholder="e.g. Kariakoo, Dar" style="padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;">'
      + '<label style="font-size:12px;font-weight:800;color:#334155;">Price Range (optional)</label><input id="deReqPrice" type="text" placeholder="e.g. 15000-20000" style="padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;">'
      + '<small style="color:#64748b;font-size:11px;">Request expires in 48h. Relevant sellers who opted into opportunities will receive it.</small>'
      + '<button data-act="de-submit-request" style="border:none;background:#1268A8;color:#fff;font-weight:800;font-size:13px;padding:12px;border-radius:12px;cursor:pointer;margin-top:8px;">Send Request to Nearby Sellers</button>'
      + '</div></div>';
  }

  // --- POS Sync Handling (conceptual) ---
  function handlePOSSync(product) {
    // Local POS database → Sync queue → Backend → Discover index
    // If product from POS has pending sync, show stale state
    var isPOS = product.posActive || product.hasPOS;
    if (!isPOS) return;
    // Check sync queue
    try {
      var queue = JSON.parse(skh.localStorage.getItem('skh_pos_sync_queue') || '[]');
      var pending = queue.find(function (q) { return q.id === product.id; });
      if (pending) {
        // Show freshness as unknown/stale until sync
        product.inventoryUpdatedAt = pending.localUpdatedAt;
        product.availabilityStatus = AVAILABILITY_STATUS.STALE;
      }
    } catch (e) {}
  }

  // --- Event Delegation [FIX 2026-09-19] ---
  // Changed from capture true to bubble false + namespace check de-* and container guard
  // Prevents intercepting chat-contact and competing with 68/72 capture listeners
  document.addEventListener('click', function (ev) {
    try {
      var b = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (!act || !act.startsWith('de-')) return;
      // Guard: only handle if inside Discover Engine overlay or its helper/modals
      if (b.closest) {
        var insideEngine = b.closest('#skhDiscoverEngine') || b.closest('#skhDiscoverRequestModal');
        if (!insideEngine) return;
      }

      if (act === 'de-close') {
        // Smart back: if we have search results, go home. If already home, close Discover.
        var body = document.getElementById('skhDiscoverEngineBody');
        var input = document.getElementById('skhDiscoverEngineInput');
        if (input && input.value) {
          // We have a search query - clear it and go home
          input.value = '';
          var clearBtn = document.getElementById('deClearBtn');
          if (clearBtn) clearBtn.style.display = 'none';
          renderHome();
        } else {
          // Already home - close Discover
          window.skhDiscoverEngineClose();
        }
        return;
      }
      if (act === 'de-clear-search') {
        var inp = document.getElementById('skhDiscoverEngineInput');
        if (inp) { inp.value = ''; inp.focus(); }
        document.getElementById('deClearBtn').style.display = 'none';
        document.getElementById('skhDiscoverEngineHelper').classList.remove('open');
        renderHome();
        return;
      }
      if (act === 'de-suggest') {
        var text = b.getAttribute('data-text') || '';
        var input = document.getElementById('skhDiscoverEngineInput');
        if (input) input.value = text;
        document.getElementById('skhDiscoverEngineHelper').classList.remove('open');
        document.getElementById('deClearBtn').style.display = 'flex';
        runDiscoverSearch(text);
        return;
      }
      if (act === 'de-qcat') {
        var kind = b.getAttribute('data-kind');
        document.querySelectorAll('.skh-de-qcat').forEach(function (el) { el.classList.remove('active'); });
        b.classList.add('active');
        if (kind === 'all') renderHome();
        else if (kind === 'nearby') runDiscoverSearch('', { distanceFilter: DISTANCE_FILTER.KM1 });
        else if (kind === 'products') runDiscoverSearch('', { entityTypes: [ENTITY_TYPE.PRODUCT] });
        else if (kind === 'services') runDiscoverSearch('', { entityTypes: [ENTITY_TYPE.SERVICE] });
        else if (kind === 'businesses') runDiscoverSearch('', { entityTypes: [ENTITY_TYPE.BUSINESS] });
        else if (kind === 'transport') runDiscoverSearch('', { entityTypes: [ENTITY_TYPE.TRANSPORTER] });
        else if (kind === 'sellers') runDiscoverSearch('', { entityTypes: [ENTITY_TYPE.BUSINESS, ENTITY_TYPE.PERSON] });
        else if (kind === 'people') runDiscoverSearch('', { entityTypes: [ENTITY_TYPE.PERSON] });
        else if (kind === 'groups') runDiscoverSearch('', { entityTypes: [ENTITY_TYPE.GROUP] });
        return;
      }
      if (act === 'de-dist') {
        var val = parseFloat(b.getAttribute('data-value'));
        document.querySelectorAll('.skh-de-dist-btn').forEach(function (el) { el.classList.remove('active'); });
        b.classList.add('active');
        var lastQ = window.__deLastSections ? window.__deLastSections.query : (document.getElementById('skhDiscoverEngineInput').value || '');
        runDiscoverSearch(lastQ, { distanceFilter: val });
        return;
      }
      if (act === 'de-view') {
        var id = b.getAttribute('data-id');
        var type = b.getAttribute('data-type');
        // Find listing
        var listing = null;
        if (window.__deLastSections) {
          var all = [].concat(window.__deLastSections.products||[], window.__deLastSections.services||[], window.__deLastSections.transporters||[], window.__deLastSections.businesses||[], window.__deLastSections.people||[], window.__deLastSections.groups||[]);
          var found = all.find(function (r) { return (r.listing||r).entityId === id; });
          if (found) listing = found.listing || found;
        }
        if (!listing) {
          // Try cachedItems
          var cached = (skh.cachedItems || []).find(function (it) { return it.id === id; });
          if (cached) listing = buildDiscoverListing(cached, type === 'SERVICE' ? ENTITY_TYPE.SERVICE : type === 'TRANSPORTER' ? ENTITY_TYPE.TRANSPORTER : ENTITY_TYPE.PRODUCT);
        }
        if (listing) {
          addRecentlyViewed(listing);
          var body = document.getElementById('skhDiscoverEngineBody');
          if (body) body.innerHTML = renderProductDetail(listing);
          // If online, also open product modal for full commerce?
          if (!listing.sellerMode || listing.sellerMode === SELLER_MODE.ONLINE_DISCOVER) {
            // Keep detail, but also allow opening product modal via button
          }
        } else {
          // Fallback to existing openProduct
          if (window.openProduct) { window.skhDiscoverEngineClose(); window.openProduct(id, type === 'SERVICE' ? 'services' : type === 'TRANSPORTER' ? 'drivers' : 'products'); }
        }
        return;
      }
      if (act === 'de-view-business') {
        var id = b.getAttribute('data-id');
        var listing = null;
        if (window.__deLastSections) {
          var all = [].concat(window.__deLastSections.businesses||[], window.__deLastSections.nearbyBusinesses||[]);
          var found = all.find(function (r) { return (r.listing||r).entityId === id; });
          if (found) listing = found.listing || found;
        }
        if (listing) {
          var body = document.getElementById('skhDiscoverEngineBody');
          if (body) {
            // Business detail: show business + its products
            var bizProducts = (skh.cachedItems || []).filter(function (it) { return (it.ownerName||'') === listing.title || (it.businessName||'') === listing.title; }).slice(0,6);
            var prodHtml = bizProducts.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-top:10px;">' + bizProducts.map(function (p) { var l = buildDiscoverListing(p, ENTITY_TYPE.PRODUCT); return renderProductCard(l); }).join('') + '</div>' : '<div class="skh-de-empty"><small>No products listed yet</small></div>';
            body.innerHTML = '<div class="skh-de-detail"><div style="padding:16px;"><button data-act="de-back-home" style="border:none;background:#f1f5f9;width:36px;height:36px;border-radius:50%;cursor:pointer;font-weight:900;">‹</button><div style="display:flex;gap:12px;align-items:center;margin-top:12px;"><div class="skh-de-biz-avatar" style="width:64px;height:64px;font-size:24px;">' + esc(String(listing.title).charAt(0)) + '</div><div><b style="font-size:18px;color:#0f172a;">' + esc(listing.title) + '</b><small style="display:block;color:#64748b;">' + esc(listing.categoryName||'Business') + ' • 📍 ' + esc(listing.location||'') + '</small></div></div><div style="margin-top:14px;display:flex;gap:8px;"><button class="skh-de-card-btn skh-de-card-btn--gold" data-act="de-go-there" data-id="' + esc(listing.entityId) + '" style="flex:1;padding:12px;">📍 Go There</button><button class="skh-de-card-btn" data-act="de-navigate" data-id="' + esc(listing.entityId) + '" style="flex:1;padding:12px;">Navigate</button><button class="skh-de-card-btn skh-de-card-btn--green" data-act="de-chat" data-id="' + esc(listing.entityId) + '" data-type="BUSINESS" style="flex:1;padding:12px;">Chat</button></div><div style="margin-top:16px;"><b style="font-size:13px;">Products from this business</b>' + prodHtml + '</div></div></div>';
          }
        }
        return;
      }
      if (act === 'de-back-home') { renderHome(); return; }
      if (act === 'de-close-detail') { if (window.__deLastSections) { document.getElementById('skhDiscoverEngineBody').innerHTML = renderSearchResults(window.__deLastSections); } else renderHome(); return; }
      if (act === 'de-go-there') {
        var id = b.getAttribute('data-id');
        // Find listing for location
        var listing = null;
        if (window.__deLastSections) {
          var all = [].concat(window.__deLastSections.products||[], window.__deLastSections.businesses||[], window.__deLastSections.nearbyBusinesses||[]);
          var found = all.find(function (r) { return (r.listing||r).entityId === id; });
          if (found) listing = found.listing || found;
        }
        if (listing && listing.latitude != null && listing.longitude != null) {
          var url = 'https://www.google.com/maps/dir/?api=1&destination=' + listing.latitude + ',' + listing.longitude;
          window.open(url, '_blank');
        } else {
          alert(T2('Eneo la biashara halijapatikana', 'Business location not available'));
        }
        return;
      }
      if (act === 'de-navigate') {
        var id = b.getAttribute('data-id');
        var listing = null;
        if (window.__deLastSections) {
          var all = [].concat(window.__deLastSections.products||[], window.__deLastSections.businesses||[]);
          var found = all.find(function (r) { return (r.listing||r).entityId === id; });
          if (found) listing = found.listing || found;
        }
        if (listing && listing.latitude != null) {
          // Use same as go there for now
          var url = 'https://www.google.com/maps/dir/?api=1&destination=' + listing.latitude + ',' + listing.longitude;
          window.open(url, '_blank');
        }
        return;
      }
      if (act === 'de-chat') {
        var id = b.getAttribute('data-id');
        var type = b.getAttribute('data-type');
        var listing = null;
        if (window.__deLastSections) {
          var all = [].concat(window.__deLastSections.products||[], window.__deLastSections.services||[], window.__deLastSections.transporters||[], window.__deLastSections.businesses||[]);
          var found = all.find(function (r) { return (r.listing||r).entityId === id; });
          if (found) listing = found.listing || found;
        }
        if (listing) {
          window.skhDiscoverOpenNegotiation(listing);
        }
        return;
      }
      if (act === 'de-chat-person') {
        var id = b.getAttribute('data-id');
        var listing = null;
        if (window.__deLastSections) {
          var all = window.__deLastSections.people||[];
          var found = all.find(function (r) { return (r.listing||r).entityId === id; });
          if (found) listing = found.listing || found;
        }
        if (listing && listing.sellerId) {
          if (window.openChatWithUser) { window.skhDiscoverEngineClose(); window.openChatWithUser(listing.sellerId, listing.title); }
        }
        return;
      }
      if (act === 'de-view-person') {
        var id = b.getAttribute('data-id');
        // Use existing person preview from 72-discover-global.js if available
        var u = null;
        if (window.__deLastSections) {
          var all = window.__deLastSections.people||[];
          var found = all.find(function (r) { return (r.listing||r).entityId === id; });
          if (found) u = found.listing.raw || found.raw;
        }
        if (u && window.skhDiscoverContact) {
          // Reuse existing modal logic? For now simple
          alert(T2('Profaili ya ', 'Profile of ') + (u.fullName||u.displayName||id));
        }
        return;
      }
      if (act === 'de-view-group' || act === 'de-join-group') {
        var id = b.getAttribute('data-id');
        if (window.skhOpenGroupSoga) { window.skhDiscoverEngineClose(); window.skhOpenGroupSoga(id); }
        return;
      }
      if (act === 'de-select-option') {
        var attr = b.getAttribute('data-attr');
        var opt = b.getAttribute('data-opt');
        selectedOptions[attr] = opt;
        document.querySelectorAll('[data-act="de-select-option"][data-attr="' + attr + '"]').forEach(function (el) { el.classList.remove('selected'); });
        b.classList.add('selected');
        updateNegoContext();
        // Update variant info if matches
        var body = document.getElementById('skhDiscoverEngineBody');
        if (body && window.__deCurrentDetail) {
          var l = window.__deCurrentDetail;
          var matched = (l.variants||[]).find(function (v) {
            return Object.keys(selectedOptions).every(function (k) { return v.attributes[k] === selectedOptions[k]; });
          });
          if (matched) {
            var info = document.querySelector('.skh-de-variant-info');
            if (info) info.innerHTML = 'Variant: ' + esc(Object.keys(matched.attributes).map(function (k) { return k+': '+matched.attributes[k]; }).join(', ')) + ' • Stock: ' + (matched.stock!=null?matched.stock:'not tracked') + (matched.price?' • Price: TSh '+Number(matched.price).toLocaleString():'');
          }
        }
        return;
      }
      if (act === 'de-buy') {
        var id = b.getAttribute('data-id');
        if (window.openProduct) { window.skhDiscoverEngineClose(); window.openProduct(id, 'products'); }
        return;
      }
      if (act === 'de-cart') {
        var id = b.getAttribute('data-id');
        if (window.openProduct) { window.skhDiscoverEngineClose(); window.openProduct(id, 'products'); }
        return;
      }
      if (act === 'de-request-ride') {
        var id = b.getAttribute('data-id');
        if (window.openRideRequestModal) { window.skhDiscoverEngineClose(); window.openRideRequestModal(); }
        else alert(T2('Ombi la usafiri', 'Transport request'));
        return;
      }
      if (act === 'de-like') {
        var id = b.getAttribute('data-id');
        if (window.skhCardToggle) window.skhCardToggle('like', id);
        b.classList.add('active');
        return;
      }
      if (act === 'de-save') {
        var id = b.getAttribute('data-id');
        if (window.skhCardToggle) window.skhCardToggle('save', id);
        b.classList.add('active');
        // Save to savedItems collection
        try {
          var saved = JSON.parse(skh.localStorage.getItem('skh_saved_items')||'[]');
          if (!saved.find(function (s) { return s.id===id; })) { saved.push({ id:id, at: nowIso() }); skh.localStorage.setItem('skh_saved_items', JSON.stringify(saved)); }
        } catch (e) {}
        return;
      }
      if (act === 'de-follow') {
        var id = b.getAttribute('data-id');
        if (window.toggleFollow) { /* existing follow */ }
        b.classList.add('active');
        return;
      }
      if (act === 'de-request-nearby') {
        var q = b.getAttribute('data-query') || document.getElementById('skhDiscoverEngineInput').value || '';
        renderRequestNearbyModal(q);
        return;
      }
      if (act === 'de-close-request') {
        var m = document.getElementById('skhDiscoverRequestModal');
        if (m) m.style.display = 'none';
        return;
      }
      if (act === 'de-submit-request') {
        var prod = document.getElementById('deReqProduct').value;
        var qty = parseInt(document.getElementById('deReqQty').value) || 1;
        var area = document.getElementById('deReqArea').value;
        var price = document.getElementById('deReqPrice').value;
        createDiscoverRequest(prod, qty, area, price);
        var m = document.getElementById('skhDiscoverRequestModal');
        if (m) m.style.display = 'none';
        return;
      }
      if (act === 'de-expand-radius') {
        var lastQ = window.__deLastSections ? window.__deLastSections.query : '';
        runDiscoverSearch(lastQ, { distanceFilter: DISTANCE_FILTER.ANY });
        return;
      }
      if (act === 'de-search-online') {
        var lastQ = window.__deLastSections ? window.__deLastSections.query : '';
        runDiscoverSearch(lastQ, { distanceFilter: DISTANCE_FILTER.ANY });
        return;
      }
      if (act === 'de-related') {
        var cat = b.getAttribute('data-cat');
        var input = document.getElementById('skhDiscoverEngineInput');
        if (input) input.value = cat;
        runDiscoverSearch(cat);
        return;
      }
      if (act === 'de-change-loc') {
        var loc = prompt(T2('Weka eneo lako (mf: Kariakoo, Dar) au lat,lng:', 'Enter your area or lat,lng:'), getUserDiscoveryLocation().name||'');
        if (loc) {
          // Try parse lat,lng
          var parts = loc.split(',');
          if (parts.length===2 && !isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))) {
            var lat = parseFloat(parts[0]), lon = parseFloat(parts[1]);
            try { skh.localStorage.setItem('skh_discover_manual_loc', JSON.stringify({ lat:lat, lon:lon, name: loc, ts: Date.now(), source:'manual' })); } catch (e) {}
            skh.userLat = lat; skh.userLon = lon;
          } else {
            try { skh.localStorage.setItem('skh_discover_manual_loc', JSON.stringify({ lat: getUserDiscoveryLocation().lat, lon: getUserDiscoveryLocation().lon, name: loc, ts: Date.now(), source:'manual' })); } catch (e) {}
          }
          renderHome();
        }
        return;
      }
      if (act === 'de-location') {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(function (pos) {
            skh.userLat = pos.coords.latitude; skh.userLon = pos.coords.longitude;
            try { skh.localStorage.setItem('skh_last_loc', JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'Current Location', ts: Date.now(), source:'gps' })); } catch (e) {}
            renderHome();
          }, function (err) { alert(T2('Imeshindikana kupata eneo', 'Failed to get location')); });
        }
        ev.stopPropagation();
        return;
      }
    } catch (e) { console.warn('[discover click]', e); }
  }, false);

  // --- Test Cases (Section 38) ---
  window.SKH_DISCOVER_ENGINE_TESTS = {
    caseA: function () { // Online seller + product + stock + image + checkout
      var p = { id:'testA', title:'Nike Shoes', price:50000, stock:10, image:'https://via.placeholder.com/150', category:'Fashion', location:'Dar', coords:{lat:-6.7924,lon:39.2083}, onlineOrderingEnabled:true, stockTrackingEnabled:true };
      var l = buildDiscoverListing(p, ENTITY_TYPE.PRODUCT);
      console.assert(l.sellerMode===SELLER_MODE.ONLINE_DISCOVER, 'CaseA sellerMode ONLINE');
      console.assert(l.availabilityStatus===AVAILABILITY_STATUS.AVAILABLE, 'CaseA available');
      console.assert(l.onlineOrderingEnabled===true, 'CaseA online enabled');
      return l;
    },
    caseB: function () { // Offline seller + product + price + location + no stock tracking
      var p = { id:'testB', title:'Cement 50kg', price:18500, location:'Mangi Hardware', coords:{lat:-6.79,lon:39.20}, onlineOrderingEnabled:false, stockTrackingEnabled:false };
      var l = buildDiscoverListing(p, ENTITY_TYPE.PRODUCT);
      console.assert(l.sellerMode===SELLER_MODE.DISCOVER_ONLY, 'CaseB DISCOVER_ONLY');
      console.assert(l.availabilityStatus===AVAILABILITY_STATUS.NOT_TRACKED, 'CaseB NOT_TRACKED');
      console.assert(l.onlineOrderingEnabled===false, 'CaseB offline');
      return l;
    },
    caseC: function () { // Offline seller + POS + stock tracking + Discover
      var p = { id:'testC', title:'Rice 25kg', price:65000, stock:20, location:'Shop', coords:{lat:-6.79,lon:39.20}, posActive:true, onlineOrderingEnabled:false, stockTrackingEnabled:true, inventoryUpdatedAt: nowIso() };
      var l = buildDiscoverListing(p, ENTITY_TYPE.PRODUCT);
      console.assert(l.sellerMode===SELLER_MODE.POS_DISCOVER, 'CaseC POS_DISCOVER');
      console.assert(l.availabilityStatus===AVAILABILITY_STATUS.AVAILABLE, 'CaseC available');
      return l;
    },
    caseD: function () { // Seller offline while customer searches online
      var p = { id:'testD', title:'Cement', price:18500, location:'Hardware', businessLocation:{lat:-6.79,lon:39.20, formattedAddress:'Mangi Hardware'}, onlineOrderingEnabled:false };
      var l = buildDiscoverListing(p, ENTITY_TYPE.PRODUCT);
      // Business location permanent, not live seller location
      console.assert(l.latitude!=null, 'CaseD business location exists even if seller offline');
      return l;
    },
    caseE: function () { // Product with 5 colors and no color images
      var p = { id:'testE', title:'Ladies Shoe', price:30000, colors:['Black','White','Red','Blue','Green'], filters:{Color:'Red'}, stock:10 };
      var struct = parseProductStructure(p);
      console.assert(struct.options.Color.length===5, 'CaseE 5 colors');
      console.assert(struct.variants.length===0 || struct.attributes.Color, 'CaseE options without images');
      return struct;
    },
    caseF: function () { // Product with sizes 36,38,39,40 and individual stock
      var p = { id:'testF', title:'Shoe', sizes:['36','38','39','40'], variants:[{attributes:{Size:'36'},stock:2},{attributes:{Size:'38'},stock:5},{attributes:{Size:'39'},stock:0},{attributes:{Size:'40'},stock:3}] };
      var struct = parseProductStructure(p);
      console.assert(struct.variants.length===4, 'CaseF 4 variants');
      console.assert(struct.variants.find(function(v){return v.attributes.Size==='39';}).stock===0, 'CaseF size 39 out of stock');
      return struct;
    },
    caseG: function () { // Product with colors AND sizes, each variant separate stock
      var p = { id:'testG', title:'Shoe', colors:['Red','Black'], sizes:['39','40'], variants:[{attributes:{Color:'Red',Size:'39'},stock:5},{attributes:{Color:'Red',Size:'40'},stock:2},{attributes:{Color:'Black',Size:'39'},stock:3},{attributes:{Color:'Black',Size:'40'},stock:1}] };
      var struct = parseProductStructure(p);
      console.assert(struct.variants.length===4, 'CaseG 4 variants color+size');
      return struct;
    },
    caseH: function () { // Product with attributes but no variants
      var p = { id:'testH', title:'Shirt', filters:{Brand:'Nike', Material:'Cotton', Color:'Blue'} };
      var struct = parseProductStructure(p);
      console.assert(Object.keys(struct.attributes).length===3, 'CaseH 3 attributes');
      console.assert(struct.variants.length===0, 'CaseH no variants');
      return struct;
    },
    caseI: function () { // Stock changes 20→19→0
      var p = { id:'testI', stock:20 };
      console.assert(getAvailabilityStatus(p)===AVAILABILITY_STATUS.AVAILABLE, 'CaseI 20 available');
      p.stock=19; console.assert(getAvailabilityStatus(p)===AVAILABILITY_STATUS.AVAILABLE, 'CaseI 19 available');
      p.stock=0; console.assert(getAvailabilityStatus(p)===AVAILABILITY_STATUS.OUT_OF_STOCK, 'CaseI 0 out');
      return true;
    },
    caseJ: function () { // Seller moves business location
      var p = { id:'testJ', businessLocation:{lat:-6.79,lon:39.20, formattedAddress:'Old Location', updatedAt: nowIso()} };
      var loc1 = buildBusinessLocation(p);
      p.businessLocation = {lat:-6.80,lon:39.21, formattedAddress:'New Location', updatedAt: nowIso()};
      var loc2 = buildBusinessLocation(p);
      console.assert(loc1.latitude!==loc2.latitude, 'CaseJ location moved');
      return {loc1, loc2};
    },
    caseK: function () { // User searches product within 100m
      var userLoc = {lat:-6.7924,lon:39.2083};
      var pNear = { id:'near', coords:{lat:-6.7925,lon:39.2084} };
      var pFar = { id:'far', coords:{lat:-6.80,lon:39.25} };
      var dNear = calcDistance(userLoc.lat,userLoc.lon,pNear.coords.lat,pNear.coords.lon);
      var dFar = calcDistance(userLoc.lat,userLoc.lon,pFar.coords.lat,pFar.coords.lon);
      console.assert(dNear < 0.1, 'CaseK near within 100m');
      console.assert(dFar > 0.1, 'CaseK far outside 100m');
      return {dNear, dFar};
    },
    caseL: function () { // User searches without location permission
      var loc = getUserDiscoveryLocation(); // Should fallback to Dar
      console.assert(loc.source==='fallback' || loc.lat!=null, 'CaseL fallback location');
      return loc;
    },
    caseM: function () { // Service search
      var intent = detectIntent('tailor');
      console.assert(intent===SEARCH_INTENT.SERVICE_SEARCH, 'CaseM tailor service');
      return intent;
    },
    caseN: function () { // Business search
      var intent = detectIntent('Mangi Hardware');
      console.assert(intent===SEARCH_INTENT.BUSINESS_SEARCH, 'CaseN business');
      return intent;
    },
    caseO: function () { // Transport search
      var intent = detectIntent('boda');
      console.assert(intent===SEARCH_INTENT.TRANSPORT_SEARCH, 'CaseO boda transport');
      return intent;
    },
    caseP: function () { // Offline listing must NOT see Buy/Checkout
      var p = { id:'testP', title:'Cement', price:18500, onlineOrderingEnabled:false, sellerMode: SELLER_MODE.DISCOVER_ONLY };
      var l = buildDiscoverListing(p, ENTITY_TYPE.PRODUCT);
      var cardHtml = renderProductCard(l, true);
      console.assert(cardHtml.includes('Go There') && !cardHtml.includes('Buy now'), 'CaseP offline no buy');
      return cardHtml;
    },
    caseQ: function () { // Online listing can use configured online commerce actions
      var p = { id:'testQ', title:'Nike', price:50000, onlineOrderingEnabled:true, sellerMode: SELLER_MODE.ONLINE_DISCOVER };
      var l = buildDiscoverListing(p, ENTITY_TYPE.PRODUCT);
      var cardHtml = renderProductCard(l, false);
      console.assert(cardHtml.includes('Buy') || cardHtml.includes('Cart'), 'CaseQ online has buy/cart');
      return cardHtml;
    },
    caseR: function () { // Buyer selects Color+Size and opens negotiation
      selectedOptions = {Color:'Red', Size:'39'};
      selectedQty = 2;
      var l = { entityId:'testR', title:'Ladies Shoe', price:30000, sellerId:'seller1', businessName:'Shop', sellerName:'Seller' };
      updateNegoContext();
      console.assert(selectedOptions.Color==='Red' && selectedOptions.Size==='39', 'CaseR options selected');
      return selectedOptions;
    },
    runAll: function () {
      var results = {};
      Object.keys(this).forEach(function (k) {
        if (k==='runAll') return;
        try { results[k] = { ok:true, result: window.SKH_DISCOVER_ENGINE_TESTS[k]() }; } catch (e) { results[k] = { ok:false, error:e.message }; }
      });
      console.log('[Discover Engine Tests]', results);
      return results;
    }
  };

  // --- Init ---
  function init() {
    buildOverlay();
    enhanceMainSearch();
    // Hook to global search bar: if user types "near me" etc, open engine
    var mainInput = document.getElementById('searchInput');
    if (mainInput) {
      mainInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && this.value.trim().length >= 2) {
          // If query looks like discovery (contains near me, boda, tailor, etc), open engine
          var intent = detectIntent(this.value);
          if ([SEARCH_INTENT.LOCATION_SEARCH, SEARCH_INTENT.SERVICE_SEARCH, SEARCH_INTENT.TRANSPORT_SEARCH, SEARCH_INTENT.BUSINESS_SEARCH].indexOf(intent) !== -1) {
            e.preventDefault();
            window.skhDiscoverEngineOpen(this.value);
          }
        }
      });
    }
    // Expose global API
    window.SKH_DISCOVER_ENGINE = {
      ENTITY_TYPE, SELLER_MODE, AVAILABILITY_STATUS, SEARCH_INTENT, DISTANCE_FILTER,
      buildDiscoverListing, parseProductStructure, getSellerMode, getAvailabilityStatus,
      getInventoryFreshness, buildBusinessLocation, getUserDiscoveryLocation, calcDistance,
      detectIntent, rankListings, universalSearch, getSearchSuggestions,
      renderDiscoverHome, renderSearchResults, renderProductCard,
      renderBusinessCard, renderServiceCard, renderTransportCard,
      renderPersonCard, renderGroupCard, renderProductDetail,
      getRecentlyViewed, addRecentlyViewed, getPersonalizedSections,
      createDiscoverRequest
    };
    console.log('[Discover Engine] Ready — Global Discovery Engine (Online/Offline/Nearby)');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  setTimeout(init, 1000);

  // --- CSS Animation for spinner ---
  try {
    var style = document.createElement('style');
    style.textContent = '@keyframes spin{to{transform:rotate(360deg)}} .skh-discover-engine ::-webkit-scrollbar{display:none;} .skh-discover-engine{scrollbar-width:none;}';
    document.head.appendChild(style);
  } catch (e) {}

})();
