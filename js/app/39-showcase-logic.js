/* ==== js/app/39-showcase-logic.js ====
   SOKOHAI — PRODUCT SHOWCASE LOGIC (Module 02 · Logic)
   ----------------------------------------------------------------
   Functions za mantiki (pure) zinazotumika na 39-product-showcase.js.
   Haziingiliani na DOM — zinarudisha data tu.
   ================================================================ */
// Collection constants
export const PS_PRODUCT = 'products';
export const PS_SERVICE = 'services';
export const PS_DRIVER = 'drivers';
export const PS_FETCH_CAP = 20;
export const PS_LOW_STOCK = 5;

// Money formatting
export function psNum(v) {
    if (v == null || v === '') return null;
    // [AUDIT-FIX] bei iliyohifadhiwa kama "120,000" / "120 000" ilionekana kama TSh 0 (Number("120,000") = NaN)
    var n = (typeof v === 'string') ? Number(v.replace(/[,\s]/g, '')) : Number(v);
    return isNaN(n) ? null : n;
}

export function psMoney(v) {
    var n = psNum(v);
    if (n == null) return '';
    return 'TSh ' + n.toLocaleString('en-US');
}

// Title extraction
export function psTitle(p, col) {
    if (!p) return '';
    if (col === PS_SERVICE) return p.title || p.serviceName || 'Huduma';
    if (col === PS_DRIVER) return p.title || p.driverName || p.company || 'Usafiri';
    return p.title || p.itemTitle || 'Bidhaa';
}

// Seller name extraction
export function psSellerName(p, col) {
    if (!p) return '';
    return p.ownerName || p.sellerName || p.storeName || p.businessName || p.driverName || p.providerName || '';
}

// Video check
export function psIsVideo(url) {
    if (!url) return false;
    var s = String(url);
    return /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(s) || /\/video\/upload\//.test(s);
}

// Availability status
export function psAvailability(p, col) {
    if (!p) return { kind: 'unknown', label: '' };

    // Auction
    if (col === PS_PRODUCT && p.saleMode === 'auction') {
        var ended = false;
        if (p.modeData && p.modeData.endsAt) {
            ended = new Date(p.modeData.endsAt).getTime() < Date.now();
        }
        if (ended) return { kind: 'ended', label: 'Mnada Umefungwa' };
        return { kind: 'auction', label: 'Mnada Hai' };
    }

    // Group buy
    if (col === PS_PRODUCT && p.saleMode === 'group_buy') {
        return { kind: 'group', label: 'Group Buy' };
    }

    // Price drop
    if (col === PS_PRODUCT && p.saleMode === 'price_drop') {
        return { kind: 'drop', label: 'Bei Kushuka' };
    }

    // Wholesale
    if (col === PS_PRODUCT && p.saleMode === 'wholesale') {
        return { kind: 'wholesale', label: 'Jumla' };
    }

    // Service
    if (col === PS_SERVICE) {
        if (p.status === 'inactive' || p.available === false) {
            return { kind: 'out', label: 'Haipatikani' };
        }
        return { kind: 'available', label: 'Inapatikana' };
    }

    // Transport
    if (col === PS_DRIVER) {
        if (p.status === 'inactive' || p.available === false) {
            return { kind: 'out', label: 'Haipatikani' };
        }
        return { kind: 'available', label: 'Inapatikana' };
    }

    // Product stock check
    var stock = p.stock != null ? Number(p.stock) : null;
    if (stock !== null && stock <= 0) {
        return { kind: 'out', label: 'Zimeisha' };
    }
    if (stock !== null && stock <= PS_LOW_STOCK) {
        return { kind: 'low', label: 'Zimebaki ' + stock + ' tu' };
    }
    if (p.sellerMode === 'DISCOVER_ONLY' || p.sellerMode === 'POS_DISCOVER') {
        return { kind: 'offline', label: 'Dukani pekee' };
    }
    return { kind: 'available', label: '' };
}

// Can bid (auction)?
export function psCanBid(p, col) {
    if (col !== PS_PRODUCT || p.saleMode !== 'auction') return false;
    var av = psAvailability(p, col);
    return av.kind === 'auction';
}

// Spec rows (product attributes)
export function psSpecRows(p, col) {
    var rows = [];
    if (!p) return rows;

    if (col === PS_PRODUCT) {
        if (p.brand) rows.push({ label: 'Brand', value: p.brand });
        if (p.condition) rows.push({ label: 'Hali', value: p.condition });
        if (p.weight) rows.push({ label: 'Uzito', value: p.weight + (p.weightUnit || ' kg') });
        if (p.dimensions) rows.push({ label: 'Vipimo', value: p.dimensions });
        if (p.material) rows.push({ label: 'Nyenzo', value: p.material });
        if (p.color) rows.push({ label: 'Rangi', value: p.color });
        if (p.size) rows.push({ label: 'Ukubwa', value: p.size });
        if (p.warranty) rows.push({ label: 'Waranti', value: p.warranty });
    } else if (col === PS_SERVICE) {
        if (p.scope) rows.push({ label: 'Wigo', value: p.scope });
        if (p.duration) rows.push({ label: 'Muda', value: p.duration });
        if (p.location) rows.push({ label: 'Eneo', value: p.location });
        if (p.experience) rows.push({ label: 'Uzoefu', value: p.experience });
    } else if (col === PS_DRIVER) {
        if (p.vehicleType) rows.push({ label: 'Aina ya gari', value: p.vehicleType });
        if (p.capacity) rows.push({ label: 'Uwezo', value: p.capacity });
        if (p.pickupRegion) rows.push({ label: 'Kutoka', value: p.pickupRegion });
        if (p.destinationRegion) rows.push({ label: 'Kwenda', value: p.destinationRegion });
    }

    // Generic filters/attributes
    if (p.filters && typeof p.filters === 'object') {
        Object.keys(p.filters).forEach(function(k) {
            if (p.filters[k] && !rows.find(function(r) { return r.label.toLowerCase() === k.toLowerCase(); })) {
                rows.push({ label: k, value: p.filters[k] });
            }
        });
    }

    return rows;
}

// Has detailed specs?
export function psHasDetails(p, col) {
    return psSpecRows(p, col).length > 0 || !!(p.description);
}

// Summarize reviews
export function psSummarizeReviews(reviews) {
    if (!reviews || !reviews.length) return { count: 0, avg: 0, dist: {} };
    var sum = 0;
    var dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(function(r) {
        var rating = Number(r.rating || r.stars || 0);
        sum += rating;
        var bucket = Math.max(1, Math.min(5, Math.round(rating)));
        dist[bucket] = (dist[bucket] || 0) + 1;
    });
    return { count: reviews.length, avg: sum / reviews.length, dist: dist };
}

// Rating display HTML — takes product object, extracts rating info
export function psRatingDisplay(p) {
    if (!p) return null;
    var avg = Number(p.rating || p.averageRating || 0);
    var count = Number(p.ratingCount || p.reviewCount || (p.comments && p.comments.length) || 0);
    if (!avg && !count) return null;
    return { avg: avg, count: count };
}

// Variant groups — takes product object, returns ARRAY of {label, key, options: [{value, delta}]}
export function psVariantGroups(p, col) {
    if (!p) return [];
    var result = [];
    
    // Check for explicit variant groups (preferred format)
    var vGroups = p.variantGroups || p.variantSelections;
    if (Array.isArray(vGroups) && vGroups.length) {
        vGroups.forEach(function(g) {
            if (g.label && g.key && Array.isArray(g.options)) {
                result.push({
                    label: g.label,
                    key: g.key,
                    options: g.options.map(function(o) {
                        if (typeof o === 'string') return { value: o, delta: 0 };
                        return { value: o.value || o.name || String(o), delta: Number(o.delta || o.priceAdjustment || 0) };
                    })
                });
            }
        });
        if (result.length) return result;
    }
    
    // Check for variants array with attributes
    var variants = p.variants || p.variantOptions || [];
    if (Array.isArray(variants) && variants.length) {
        // Build groups from variant attributes
        var attrMap = {};
        variants.forEach(function(v) {
            // Named group format
            if (v.name && Array.isArray(v.options)) {
                attrMap[v.name] = v.options.map(function(o) {
                    if (typeof o === 'string') return { value: o, delta: 0 };
                    return { value: o.value || o.name || String(o), delta: Number(o.delta || o.priceAdjustment || 0) };
                });
            }
            // Attributes format
            if (v.attributes) {
                Object.keys(v.attributes).forEach(function(attr) {
                    if (!attrMap[attr]) attrMap[attr] = {};
                    attrMap[attr][v.attributes[attr]] = v.priceAdjustment || 0;
                });
            }
        });
        Object.keys(attrMap).forEach(function(key) {
            var val = attrMap[key];
            if (Array.isArray(val)) {
                result.push({ label: key, key: key.toLowerCase().replace(/\s+/g, '_'), options: val });
            } else if (typeof val === 'object') {
                var opts = Object.keys(val).map(function(v) {
                    return { value: v, delta: Number(val[v]) || 0 };
                });
                if (opts.length) result.push({ label: key, key: key.toLowerCase().replace(/\s+/g, '_'), options: opts });
            }
        });
        if (result.length) return result;
    }
    
    // Fallback: sizes and colors fields
    if (p.sizes || p.availableSizes) {
        var sizes = p.sizes || p.availableSizes;
        if (typeof sizes === 'string') sizes = sizes.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        if (Array.isArray(sizes) && sizes.length) {
            result.push({ label: 'Ukubwa', key: 'size', options: sizes.map(function(s) { return { value: s, delta: 0 }; }) });
        }
    }
    if (p.colors || p.availableColors) {
        var colors = p.colors || p.availableColors;
        if (typeof colors === 'string') colors = colors.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        if (Array.isArray(colors) && colors.length) {
            result.push({ label: 'Rangi', key: 'color', options: colors.map(function(s) { return { value: s, delta: 0 }; }) });
        }
    }
    return result;
}

// Variant price delta — takes product object and selected variants map
export function psVariantDelta(p, selected) {
    if (!p || !selected) return 0;
    var variants = p.variants || p.variantOptions || [];
    if (!variants.length) return 0;
    // Find matching variant
    var matched = variants.find(function(v) {
        if (v.attributes) {
            return Object.keys(selected).every(function(k) { return v.attributes[k] === selected[k]; });
        }
        return false;
    });
    if (!matched || matched.priceAdjustment == null) return 0;
    return Number(matched.priceAdjustment) || 0;
}

// Build recommendation rails — returns object {similar, moreCategory, otherSellers, recommended}
export function psBuildRails(items, currentProduct, opts) {
    var empty = { similar: [], moreCategory: [], otherSellers: [], recommended: [] };
    if (!items || !items.length || !currentProduct) return empty;
    
    var col = (opts && opts.collection) || 'products';
    var currentId = currentProduct.id;
    var category = currentProduct.category;
    var sellerId = currentProduct.sellerId || currentProduct.userId || currentProduct.businessName;
    var usedIds = {};
    usedIds[currentId] = true;
    
    function pick(arr, limit) {
        var out = [];
        for (var i = 0; i < arr.length && out.length < (limit || 12); i++) {
            if (!usedIds[arr[i].id]) {
                out.push(arr[i]);
                usedIds[arr[i].id] = true;
            }
        }
        return out;
    }
    
    // similar: same category + same seller
    var similarPool = items.filter(function(it) {
        return it.id !== currentId 
            && it.category === category 
            && (it.sellerId === sellerId || it.userId === sellerId || it.businessName === sellerId);
    });
    
    // moreCategory: same category, different seller
    var moreCatPool = items.filter(function(it) {
        return it.id !== currentId 
            && it.category === category 
            && it.sellerId !== sellerId && it.userId !== sellerId && it.businessName !== sellerId;
    });
    
    // otherSellers: different category
    var otherPool = items.filter(function(it) {
        return it.id !== currentId && it.category !== category;
    });
    
    var result = {};
    result.similar = pick(similarPool, 12);
    result.moreCategory = pick(moreCatPool, 12);
    result.otherSellers = pick(otherPool, 12);
    
    // recommended: remaining items not yet used
    var remaining = items.filter(function(it) { return !usedIds[it.id]; });
    result.recommended = pick(remaining, 12);
    
    return result;
}
