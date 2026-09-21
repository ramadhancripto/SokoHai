/* ==== js/app/39-showcase-logic.js ====
   SOKOHAI — PRODUCT SHOWCASE · LOGIC TUPU (Module 02)
   ----------------------------------------------------------------
   Hapa hakuna DOM wala Firebase — ni mantiki tupu ya:
   - upatikanaji (stock/availability) wa bidhaa/huduma/usafiri;
   - sifa za bidhaa zinazoonyeshwa (spec rows — zilizopo TU);
   - muhtasari wa tathmini (reviews) kutoka comments array;
   - vikundi vya variants (size/color/variants) vinavyotokana na DATA;
   - ugawaji wa bidhaa zinazohusiana (related/recommendation rails)
     bila kumrudia muuzaji mmoja, bila duplicates, na kwa idadi ndogo.

   Faili hili huagizwa na 39-product-showcase.js (DOM) na kupimwa
   moja kwa moja na tools/test_showcase.mjs.

   KANUNI:
   - Hakuna chochote kinachobuniwa ambapo data haipo (hatubandiki
     sifa, bei, au upatikanaji wa uongo).
   - Bidhaa ya sasa haijirudi kwenye related; kila id inaonekana mara
     moja tu (deduupe).
   - "Maduka mengine" lazima iwe na wauzaji TOFAUTI.
   ================================================================ */
'use strict';

export const PS_PRODUCT = 'products';
export const PS_SERVICE = 'services';
export const PS_DRIVER = 'drivers';

export const PS_RAIL_CAP = 10;        // idadi ya juu kwa kila rail
export const PS_FETCH_CAP = 40;       // idadi ya juu ya kuvuta kutoka Firestore
export const PS_LOW_STOCK = 5;

const STOP_WORDS = {
    na: 1, ya: 1, kwa: 1, la: 1, za: 1, wa: 1, cha: 1, vya: 1, ni: 1,
    na: 1, katika: 1, kutoka: 1, kama: 1, hii: 1, hizi: 1, hilo: 1,
    the: 1, and: 1, for: 1, with: 1, 'a': 1, an: 1, of: 1, to: 1, in: 1
};

/* ================================================================
 * MISAADA
 * ================================================================ */
export function psNum(v) {
    if (v === null || v === undefined || v === '') return null; // Number(null)=0 — kataa kwa makusudi
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

export function psMoney(v) {
    const n = psNum(v);
    if (n === null || n <= 0) return 'Maelewano';
    return 'TSh ' + Math.round(n).toLocaleString('en-US');
}

export function psPresent(v) {
    if (v === null || v === undefined) return false;
    if (typeof v === 'number') return Number.isFinite(v);
    const s = String(v).trim();
    return s !== '' && s.toLowerCase() !== 'n/a' && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined';
}

export function psIsVideo(url) {
    return /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(String(url || ''))
        || /\/video\/upload\//.test(String(url || ''));
}

export function psTitle(p, col) {
    if (!p) return 'Tangazo';
    return (p.title || p.driverName || p.company || '').trim()
        || (col === PS_SERVICE ? 'Huduma' : col === PS_DRIVER ? 'Safari/Usafiri' : 'Bidhaa');
}

export function psSellerId(p) {
    return (p && (p.userId || p.sellerId || p.ownerId)) || null;
}

export function psSellerName(p) {
    return (p && (p.ownerName || p.sellerName || p.storeName || p.driverName || p.fullName)) || 'Muuzaji';
}

/* ================================================================
 * 1) UPATIKANAJI (availability) — huonyeshwa ikiwa umejulikana tu
 * ================================================================ */
export function psAvailability(p, col) {
    if (!p) return { kind: 'unknown', label: '' };
    if (col === PS_SERVICE) {
        if (p.section === 'online' || p.online === true) return { kind: 'service', label: 'Inapatikana mtandaoni' };
        return { kind: 'service', label: 'Inapatikana leo' };
    }
    if (col === PS_DRIVER) {
        if (p.online === true || p.status === 'available') return { kind: 'in', label: 'Dereva yupo tayari' };
        return { kind: 'unknown', label: '' };
    }
    // products
    if (p.saleMode === 'auction') {
        const m = p.modeData || {};
        const closed = m.endTime && Date.now() >= Number(m.endTime);
        return { kind: closed ? 'out' : 'auction', label: closed ? 'Mnada umefungwa' : 'Mnada unaendelea' };
    }
    const stock = psNum(p.stock);
    if (stock === null) {
        if (p.isOnline === false && p.isOffline === true) {
            return { kind: 'offline', label: 'Dukani pekee' };
        }
        return { kind: 'unknown', label: '' };
    }
    if (stock <= 0) return { kind: 'out', label: 'Zimeisha', stock: 0 };
    if (stock <= PS_LOW_STOCK) return { kind: 'low', label: 'Zimebaki ' + stock, stock: stock };
    return { kind: 'in', label: 'Zipo (' + stock + ')', stock: stock };
}

// Je, kitendo cha kununua kinapaswa kuwepo? (states validi tu)
export function psCanBuy(p, col) {
    const av = psAvailability(p, col);
    if (av.kind === 'out' || av.kind === 'offline') return false;
    if (p.saleMode === 'auction') return false; // mnada: kuna "Weka Dau" tofauti
    return true;
}

export function psCanBid(p, col) {
    if (col !== PS_PRODUCT || p.saleMode !== 'auction') return false;
    const m = p.modeData || {};
    return !(m.endTime && Date.now() >= Number(m.endTime));
}

/* ================================================================
 * 2) SIFA ZINAZOONYESHWA (spec rows) — zilizopo tu, hakuna uongo
 *    hurejesha [{ label, value }]
 * ================================================================ */
function row(label, value) {
    if (!psPresent(value)) return null;
    return { label: label, value: String(value).trim() };
}

function rowsFromFilters(p, out) {
    const f = p.filters || {};
    if (typeof f === 'object') {
        Object.keys(f).forEach(function (k) {
            const r = row(k, f[k]);
            if (r) out.push(r);
        });
    }
}

export function psSpecRows(p, col) {
    if (!p) return [];
    const out = [];

    if (col === PS_DRIVER) {
        out.push(row('Chombo', p.vehicleType));
        if (Array.isArray(p.supportedServices) && p.supportedServices.length) {
            out.push(row('Huduma', p.supportedServices.join(', ')));
        }
        if (psPresent(p.pickupRegion) || psPresent(p.destinationRegion)) {
            out.push(row('Njia', (p.pickupRegion || '…') + ' → ' + (p.destinationRegion || '…')));
        }
        out.push(row('Eneo', p.location || p.region));
        return out.filter(Boolean);
    }

    if (col === PS_SERVICE) {
        out.push(row('Aina ya huduma', p.section || p.groupType));
        out.push(row('Kategoria', p.category));
        rowsFromFilters(p, out);
        out.push(row('Eneo', p.location || p.region));
        if (p.section === 'online' || p.online === true) out.push(row('Mpangilio', 'Mtandaoni'));
        return out.filter(Boolean);
    }

    // PRODUCTS
    out.push(row('Kategoria', p.category));
    const sub = psPresent(p.subCategory) && String(p.subCategory).toLowerCase() !== 'n/a' ? p.subCategory : null;
    out.push(row('Aina', sub));
    rowsFromFilters(p, out);
    out.push(row('Kipimo', p.baseUnit));
    if (p.hasBulkPackaging) {
        if (psPresent(p.conversionRatio) && psPresent(p.bulkUnit)) {
            out.push(row('Ufungaji wa jumla', (p.conversionRatio + ' ' + (p.baseUnit || 'vipande') + ' = 1 ' + p.bulkUnit)));
        }
        const wp = psNum(p.wholesalePrice);
        if (wp !== null && wp > 0) {
            out.push(row('Bei ya jumla', psMoney(wp) + (p.bulkUnit ? ' / ' + p.bulkUnit : '')));
        }
    }
    // Mfumo wa kupata (mtandaoni/dukani)
    let channel = null;
    if (p.isOnline === true && p.isOffline === true) channel = 'Mtandaoni na dukani';
    else if (p.isOnline === true) channel = 'Mtandaoni';
    else if (p.isOffline === true) channel = 'Dukani';
    out.push(row('Mpangilio wa kupata', channel));
    if (psPresent(p.expiryDate)) {
        const d = String(p.expiryDate).slice(0, 10);
        out.push(row('Inaisha tarehe', d));
    }
    // barcode ni ya ndani ya duka — haionyeshwi kwa mteja.
    return out.filter(Boolean);
}

/* Je, sehemu ya maelezo (details) ionyeshwe? (description au specs) */
export function psHasDetails(p, col) {
    const desc = (p.description || '').trim();
    const meaningfulDesc = desc && desc.toLowerCase() !== 'in-store product' && desc.toLowerCase() !== 'no description.';
    return !!(meaningfulDesc || psSpecRows(p, col).length);
}

/* ================================================================
 * 3) TATHMINI (reviews) — kutoka comments array iliyo na rating
 * ================================================================ */
export function psSummarizeReviews(comments) {
    const list = Array.isArray(comments) ? comments.filter(function (c) {
        const r = Number(c && c.rating);
        return Number.isFinite(r) && r >= 1 && r <= 5;
    }) : [];
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sum = 0;
    list.forEach(function (c) {
        const r = Number(c.rating);
        distribution[r] = (distribution[r] || 0) + 1;
        sum += r;
    });
    const sorted = list.slice().sort(function (a, b) {
        return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
    });
    return {
        count: list.length,
        avg: list.length ? Math.round((sum / list.length) * 10) / 10 : 0,
        distribution: distribution,
        latest: sorted
    };
}

// Pima thamani ya rating ya kuonyesha: tumia comments zilizopo;
// kama hakuna, tumia aggregate field ya zamani (rating/reviewCount).
export function psRatingDisplay(p) {
    const s = psSummarizeReviews(p && p.comments);
    if (s.count > 0) return { avg: s.avg, count: s.count, source: 'comments' };
    const r = Number(p && p.rating);
    if (Number.isFinite(r) && r > 0) {
        const c = Number(p && (p.reviewCount || p.totalReviews || p.ratingCount)) || 0;
        return { avg: Math.round(r * 10) / 10, count: c, source: 'field' };
    }
    return null;
}

/* ================================================================
 * 4) VARIANTS — kutoka DATA ya muuzaji (si vyips vya kubahatisha)
 *    hurejesha [{ key, label, options:[{value, delta}] }]
 * ================================================================ */
function arrFrom() {
    const out = [];
    for (let i = 0; i < arguments.length; i++) {
        const v = arguments[i];
        if (Array.isArray(v)) v.forEach(function (x) { if (psPresent(x) && out.indexOf(String(x)) === -1) out.push(String(x)); });
        else if (psPresent(v)) String(v).split(/[,/|]/).map(function (s) { return s.trim(); }).forEach(function (s) {
            if (s && out.indexOf(s) === -1) out.push(s);
        });
    }
    return out;
}

function deltasFor(p, values, maps) {
    const dmap = {};
    (maps || []).forEach(function (m) {
        if (m && typeof m === 'object') {
            Object.keys(m).forEach(function (k) {
                const n = Number(m[k]);
                if (Number.isFinite(n)) dmap[String(k).toLowerCase()] = n;
            });
        }
    });
    return values.map(function (v) {
        const d = dmap[String(v).toLowerCase()];
        return { value: v, delta: Number.isFinite(d) ? d : 0 };
    });
}

export function psVariantGroups(p, col) {
    if (!p || col !== PS_PRODUCT) return [];
    const groups = [];

    // 4a) Muundo wa jumla: p.variants (array ya {name,options} au object)
    const explicit = [];
    if (Array.isArray(p.variants)) {
        p.variants.forEach(function (vg) {
            if (!vg) return;
            const name = vg.name || vg.label || vg.key;
            const opts = arrFrom(vg.options || vg.values);
            if (name && opts.length) explicit.push({ key: String(name).toLowerCase(), label: String(name), options: deltasFor(p, opts, [vg.priceDeltas, vg.priceDelta]) });
        });
    } else if (p.variants && typeof p.variants === 'object') {
        Object.keys(p.variants).forEach(function (k) {
            const vg = p.variants[k];
            const opts = arrFrom(Array.isArray(vg) ? vg : (vg && (vg.options || vg.values)));
            if (opts.length) explicit.push({ key: k.toLowerCase(), label: k, options: deltasFor(p, opts, [vg && vg.priceDeltas]) });
        });
    }
    if (explicit.length) return explicit;

    const isFashion = /mavazi|nguo|fashion|viatu|shoe/i.test((p.category || '') + ' ' + (p.subCategory || ''));

    // 4b) Saizi — data halisi kwanza; fallback ya kihafidhina kwa Mavazi
    const sizes = arrFrom(p.sizes, p.availableSizes, p.sizeOptions,
        p.filters && (p.filters.Saizi || p.filters.Size || p.filters.Ukubwa));
    if (sizes.length) {
        groups.push({ key: 'size', label: 'Saizi', options: deltasFor(p, sizes, [p.sizePrices, p.sizePriceDeltas, p.variantPriceDeltas && p.variantPriceDeltas.size]) });
    } else if (isFashion) {
        // Saizi za kawaida; lakini bado heshimu sizePrices za muuzaji zikiwepo
        groups.push({ key: 'size', label: 'Saizi', options: deltasFor(p, ['S', 'M', 'L', 'XL', 'XXL'], [p.sizePrices, p.sizePriceDeltas]) });
    }

    // 4c) Rangi — DATA tu (hatutengezi rangi zisizouzwa)
    const colors = arrFrom(p.colors, p.availableColors, p.colorOptions,
        p.filters && (p.filters.Rangi || p.filters.Color || p.filters.Colour));
    if (colors.length) {
        groups.push({ key: 'color', label: 'Rangi', options: deltasFor(p, colors, [p.colorPrices, p.variantPriceDeltas && p.variantPriceDeltas.color]) });
    }

    return groups;
}

// Jumla ya nyongeza ya bei kutokana na variants zilizochaguliwa
export function psVariantDelta(p, selections) {
    const groups = psVariantGroups(p, PS_PRODUCT);
    let delta = 0;
    groups.forEach(function (g) {
        const sel = selections && selections[g.key];
        if (!sel) return;
        const opt = g.options.find(function (o) { return String(o.value) === String(sel); });
        if (opt) delta += Number(opt.delta) || 0;
    });
    return delta;
}

export function psVariantLabel(selections, groups) {
    if (!selections) return '';
    const parts = [];
    (groups || []).forEach(function (g) {
        const v = selections[g.key];
        if (v && String(v).toUpperCase() !== 'N/A') parts.push(v);
    });
    return parts.join(' / ');
}

/* ================================================================
 * 5) RELATED / RECOMMENDATION — rails safi, maduka mbalimbali
 * ================================================================ */
export function psTokens(title) {
    const set = {};
    String(title || '').toLowerCase().split(/[^a-z0-9À-ɏ]+/).forEach(function (w) {
        if (w.length > 2 && !STOP_WORDS[w]) set[w] = 1;
    });
    return Object.keys(set);
}

function locOf(it) {
    return String((it && (it.location || it.region)) || '').toLowerCase();
}

// Piga kila bidhaa alama dhidi ya bidhaa ya sasa
export function psScoreItem(it, cur) {
    if (!it || !cur) return -999;
    let score = 0;
    const curSeller = psSellerId(cur);
    const itSeller = psSellerId(it);
    const sameSeller = curSeller && itSeller && curSeller === itSeller;

    const curSub = (cur.subCategory || '').trim();
    const itSub = (it.subCategory || '').trim();
    const curCat = (cur.category || '').trim().toLowerCase();
    const itCat = (it.category || '').trim().toLowerCase();
    if (curSub && itSub && curSub === itSub) score += 30;
    else if (curCat && itCat && curCat === itCat) score += 15;

    const curTokens = psTokens(psTitle(cur, cur.collectionName));
    const itTokens = {};
    psTokens(psTitle(it, it.collectionName)).forEach(function (t) { itTokens[t] = 1; });
    let overlap = 0;
    curTokens.forEach(function (t) { if (itTokens[t]) overlap++; });
    score += Math.min(overlap * 5, 20);

    const curLoc = locOf(cur);
    if (curLoc && locOf(it) && (locOf(it).indexOf(curLoc) !== -1 || curLoc.indexOf(locOf(it)) !== -1)) score += 6;

    // Upatikanaji — zilizopo mbele, zilizoisha nyuma
    const stock = Number(it.stock);
    if (Number.isFinite(stock)) {
        if (stock <= 0) score -= 10;
        else score += 3;
    }
    // Mseto wa wauzaji (upendeleo mwepesi; hauzuiwi kabisa)
    if (curSeller && itSeller) score += sameSeller ? -4 : 8;

    // Mpya zaidi mbele
    const ageDays = (Date.now() - new Date(it.createdAt || Date.now()).getTime()) / 86400000;
    if (Number.isFinite(ageDays) && ageDays >= 0 && ageDays < 60) score += 2;

    return score;
}

/* Gawanya vipande kwenye rails.
 * opts: { collection, cap }
 * rudisha { similar, moreCategory, otherSellers, recommended, usedIds }
 */
export function psBuildRails(items, cur, opts) {
    opts = opts || {};
    const cap = opts.cap || PS_RAIL_CAP;
    const col = opts.collection || (cur && cur.collectionName) || PS_PRODUCT;
    const curId = cur && cur.id;
    const curSeller = psSellerId(cur);

    const seen = {};
    const pool = [];
    (items || []).forEach(function (raw) {
        if (!raw || !raw.id) return;
        if (String(raw.id) === String(curId)) return;
        const rc = raw.collectionName || col;
        if (rc !== col) return;
        if (seen[raw.id]) return; // dedupe
        seen[raw.id] = 1;
        pool.push(Object.assign({ collectionName: rc, __score: psScoreItem(raw, cur) }, raw));
    });
    pool.sort(function (a, b) { return b.__score - a.__score; });

    const used = {};
    const similar = [];
    const more = [];
    const other = [];
    const recommended = [];

    const curSub = (cur.subCategory || '').trim();
    const curCat = (cur.category || '').trim().toLowerCase();
    const curTokens = psTokens(psTitle(cur, col));

    pool.forEach(function (it) {
        const itSub = (it.subCategory || '').trim();
        const itCat = (it.category || '').trim().toLowerCase();
        const sameSub = !!(curSub && itSub && curSub === itSub);
        const sameCat = !!(curCat && itCat && curCat === itCat);
        const itTokens = psTokens(psTitle(it, col));
        let overlap = 0;
        curTokens.forEach(function (t) { if (itTokens.indexOf(t) !== -1) overlap++; });
        const seller = psSellerId(it);
        const otherSeller = !!(curSeller && seller && seller !== curSeller);

        if (!used[it.id] && (sameSub || (sameCat && overlap >= 1)) && it.__score >= 25 && similar.length < cap) {
            used[it.id] = 1; similar.push(it);
        } else if (!used[it.id] && sameCat && more.length < cap) {
            used[it.id] = 1; more.push(it);
        } else if (!used[it.id] && otherSeller && (sameCat || overlap >= 1) && other.length < cap) {
            used[it.id] = 1; other.push(it);
        }
    });

    // "Maduka mengine" isibaki tupu: jaza maduka wengine wowote wa collection
    if (other.length < Math.min(4, cap)) {
        pool.forEach(function (it) {
            if (used[it.id] || other.length >= cap) return;
            const seller = psSellerId(it);
            if (curSeller && seller && seller !== curSeller) { used[it.id] = 1; other.push(it); }
        });
    }

    // Recommended: baki zote zenye alama nzuri (ugunduzi zaidi)
    pool.forEach(function (it) {
        if (used[it.id] || recommended.length >= cap) return;
        if (it.__score >= 5) { used[it.id] = 1; recommended.push(it); }
    });
    // Kama bado tupu, jaza chochote kilichobaki (ili mteja asione ukuta)
    if (!similar.length && !more.length && !other.length) {
        pool.forEach(function (it) {
            if (used[it.id] || recommended.length >= cap) return;
            used[it.id] = 1; recommended.push(it);
        });
    }

    return {
        similar: similar,
        moreCategory: more,
        otherSellers: other,
        recommended: recommended,
        usedIds: Object.keys(used)
    };
}
