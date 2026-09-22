/* SOKOHAI MARKET RANKING — centralized, deterministic, real-record only.
   UI modules consume ranked records; they do not invent listings or scores. */

function num(v) { v = Number(v); return Number.isFinite(v) ? v : 0; }
function text(v) { return String(v == null ? '' : v).trim(); }
function lower(v) { return text(v).toLowerCase(); }
function ts(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v === 'object' && Number.isFinite(v.seconds)) return v.seconds * 1000;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : 0;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function log(v) { return Math.log1p(Math.max(0, num(v))); }

export function listingKey(x) {
  return lower(x.collectionName || x.collection || 'products') + '/' + text(x.id || x.entityId);
}

export function listingEligible(x) {
  if (!x || !text(x.id || x.entityId)) return false;
  const state = lower(x.status || x.listingStatus || 'active');
  if (x.deletedAt || x.archivedAt || x.suspendedAt || x.active === false || x.isActive === false) return false;
  if (['deleted', 'archived', 'suspended', 'blocked', 'rejected', 'inactive', 'draft'].includes(state)) return false;
  const kind = lower(x.collectionName || x.collection || 'products');
  if (kind === 'products' && lower(x.availability) === 'deleted') return false;
  return !!text(x.title || x.serviceName || x.driverName || x.company || x.name);
}

function boostEndMs(x) {
  const explicit = ts(x.boostExpiresAt || x.boostedUntil || x.boostEndAt || x.boostExpiry);
  if (explicit) return explicit;
  // Legacy migration boundary: old paid records stored boostedAt but forgot expiry.
  // Honour only their original product/service default window; never boost forever.
  const start = ts(x.boostedAt);
  if (!start) return 0;
  const kind = lower(x.collectionName || x.collection || 'products');
  const days = Math.max(1, num(x.boostDays) || (kind === 'products' ? 3 : 7));
  return start + days * 86400000;
}

export function boostEligibility(x, now = Date.now()) {
  if (!listingEligible(x) || x.isBoosted !== true) return { eligible: false, reason: 'not-boosted' };
  const end = boostEndMs(x);
  if (!end || end <= now) return { eligible: false, reason: 'expired', expiresAt: end || null };
  const target = num(x.boostTargetViews);
  const delivered = num(x.boostedViewsCount);
  if (target > 0 && delivered >= target) return { eligible: false, reason: 'target-reached', expiresAt: end };
  return { eligible: true, reason: 'active', expiresAt: end, remainingViews: target > 0 ? Math.max(0, target - delivered) : null };
}

function coords(x) {
  const c = x.coords || x.coordinates || x.geo || x.locationCoords || {};
  const lat = num(c.lat != null ? c.lat : (c.latitude != null ? c.latitude : x.latitude));
  const lon = num(c.lon != null ? c.lon : (c.lng != null ? c.lng : (c.longitude != null ? c.longitude : x.longitude)));
  if (!lat || !lon || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function distanceKm(aLat, aLon, bLat, bLon) {
  const r = 6371;
  const p = Math.PI / 180;
  const dLat = (bLat - aLat) * p;
  const dLon = (bLon - aLon) * p;
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

function freshness(x, now) {
  const t = ts(x.updatedAt || x.createdAt || x.publishedAt || x.boostedAt);
  if (!t) return 0;
  const days = Math.max(0, (now - t) / 86400000);
  return Math.exp(-days / 21);
}

function searchSignal(x, context) {
  let score = log(x.recentSearchCount) * 5 + log(x.searchCount7d) * 4 + log(x.searchCount) * 1.5;
  const hay = lower([x.title, x.serviceName, x.driverName, x.company, x.category, x.subCategory, x.description].join(' '));
  const now = context.now || Date.now();
  (context.searchTerms || []).forEach(e => {
    const q = lower(e && (e.query || e.q));
    if (!q || !hay.includes(q)) return;
    const ageDays = Math.max(0, (now - ts(e.at || e.createdAt)) / 86400000);
    if (ageDays <= 14) score += Math.exp(-ageDays / 7) * 2.5;
  });
  return score;
}
function trendSignal(x) {
  return log(x.views24h || x.recentViews) * 3.2
    + log(x.views7d) * 1.7
    + log(x.likeCount || x.likesCount) * 1.3
    + log(x.saveCount || x.savesCount) * 1.6
    + log(x.shareCount || x.sharesCount) * 1.8
    + log(x.orderCount7d || x.recentOrders) * 3.5;
}
function qualitySignal(x) {
  const rating = clamp(num(x.rating || x.averageRating), 0, 5);
  const reviews = log(x.reviewCount || x.ratingCount || (Array.isArray(x.comments) ? x.comments.length : 0));
  return rating * 1.2 + reviews * .7 + (x.verified === true || x.isVerified === true ? 1.5 : 0);
}
function availabilitySignal(x) {
  if (lower(x.availability) === 'out_of_stock' || num(x.stock) === 0 && x.stock != null) return -8;
  if (x.available === false || x.online === false && lower(x.collectionName) === 'drivers') return -5;
  return 1;
}
function relevanceSignal(x, context) {
  let s = 0;
  const q = lower(context.query);
  const cat = lower(context.category);
  const hay = lower([x.title, x.serviceName, x.driverName, x.company, x.description, x.category, x.subCategory, x.vehicleType].join(' '));
  if (q) {
    const words = q.split(/\s+/).filter(Boolean);
    const matched = words.filter(w => hay.includes(w)).length;
    if (!matched) return -100;
    s += matched * 8 + (matched === words.length ? 10 : 0);
  }
  if (cat && cat !== 'zote' && cat !== 'all') s += lower(x.category) === cat ? 7 : -5;
  return s;
}

function decorate(x, score, reason, distance, boost) {
  const out = Object.assign({}, x, { _marketScore: score, _marketReason: reason });
  if (distance != null) out.computedDistance = distance;
  out._boostEligible = !!(boost && boost.eligible);
  return out;
}

function rankPool(items, kind, context) {
  const now = context.now || Date.now();
  const uLat = num(context.userLat), uLon = num(context.userLon);
  const region = lower(context.region);
  return items.filter(listingEligible).map(x => {
    const b = boostEligibility(x, now);
    const c = coords(x);
    const d = c && uLat && uLon ? distanceKm(uLat, uLon, c.lat, c.lon) : null;
    const localText = lower([x.location, x.region, x.pickupRegion, x.destinationRegion].join(' '));
    const regionMatch = !!(region && localText.includes(region));
    const fresh = freshness(x, now);
    const rel = relevanceSignal(x, context);
    const trend = trendSignal(x);
    const searched = searchSignal(x, context);
    const quality = qualitySignal(x);
    const available = availabilitySignal(x);
    let score = rel + quality + available + fresh * 4;
    if (kind === 'nearby') {
      if (d == null && !regionMatch) return null;
      score += d == null ? 8 : Math.max(0, 30 - Math.min(30, d));
      if (regionMatch) score += 6;
    } else if (kind === 'trending') {
      if (trend <= 0) return null;
      score += trend * (0.65 + fresh * 0.35);
    } else if (kind === 'searched') {
      if (searched <= 0) return null;
      score += searched + trend * .2;
    } else if (kind === 'boosted') {
      if (!b.eligible || rel <= -100) return null;
      // Boost improves placement only after eligibility and relevance checks.
      score += 16 + trend * .25 + (d == null ? 0 : Math.max(0, 8 - d / 10));
    } else {
      score += trend * .35 + searched * .25 + (b.eligible ? 3 : 0);
    }
    return decorate(x, score, kind, d, b);
  }).filter(Boolean).sort((a, b) => b._marketScore - a._marketScore || listingKey(a).localeCompare(listingKey(b)));
}

function takeDistinct(ranked, used, limit, allowReuseWhenEmpty) {
  let out = ranked.filter(x => !used.has(listingKey(x))).slice(0, limit);
  if (!out.length && allowReuseWhenEmpty) out = ranked.slice(0, limit);
  out.forEach(x => used.add(listingKey(x)));
  return out;
}

export function buildMarketplaceSections(items, context = {}) {
  const limit = Math.max(1, num(context.limit) || 8);
  const clean = (items || []).filter(listingEligible);
  const used = new Set();
  const boostedRank = rankPool(clean, 'boosted', context);
  const nearbyRank = rankPool(clean, 'nearby', context);
  const trendingRank = rankPool(clean, 'trending', context);
  const searchedRank = rankPool(clean, 'searched', context);
  const recommendedRank = rankPool(clean, 'recommended', context);
  return {
    nearby: takeDistinct(nearbyRank, used, limit, false),
    trending: takeDistinct(trendingRank, used, limit, true),
    searched: takeDistinct(searchedRank, used, limit, true),
    boosted: takeDistinct(boostedRank, used, limit, true),
    recommended: takeDistinct(recommendedRank, used, limit, true),
    counts: { eligible: clean.length, boosted: boostedRank.length, nearby: nearbyRank.length, trending: trendingRank.length, searched: searchedRank.length }
  };
}

export const MARKET_RANKING_VERSION = '2026-09-white-first-v1';
