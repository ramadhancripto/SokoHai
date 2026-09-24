'use strict';

/*
 * Canonical ad-delivery policy and decision functions.
 * This module is deliberately dependency-free so the exact rules used by
 * Cloud Functions can be regression-tested without Firebase emulators.
 */
const PLACEMENTS = Object.freeze([
  'home', 'discover', 'search', 'product_detail', 'service_detail', 'chat',
  'groups', 'live', 'auction', 'group_buy', 'price_drop', 'dashboard'
]);
const CAMPAIGN_TYPES = Object.freeze([
  'business', 'product', 'service', 'event', 'announcement', 'promotion',
  'partnership', 'community', 'sokohai_announcement', 'other'
]);

const DEFAULT_POLICY = Object.freeze({
  frequency: Object.freeze({ session: 5, hour: 12, day: 30, maxActiveLeases: 3 }),
  cooldowns: Object.freeze({
    globalGapMs: 30000,
    advertiserMs: 3600000,
    creativeMs: 900000,
    dismissedCreativeMs: 86400000
  }),
  fatigue: Object.freeze({
    viewWeight: 0.12,
    dismissWeight: 0.45,
    decayMs: 86400000,
    suppressionThreshold: 0.82,
    max: 1
  }),
  viewability: Object.freeze({ threshold: 0.5, durationMs: 1000 }),
  lazy: Object.freeze({ rootMarginPx: 400, requestThrottleMs: 5000 }),
  rotation: Object.freeze({ defaultSeconds: 15, minSeconds: 5, maxSeconds: 59 }),
  lease: Object.freeze({ ttlMs: 300000 }),
  analytics: Object.freeze({ retentionDays: 90 }),
  state: Object.freeze({ sessionRetentionDays: 30, anonymousRetentionDays: 30 }),
  timezone: 'Africa/Dar_es_Salaam'
});

const crypto = require('crypto');

function identityFingerprint(namespace, value) {
  const normalized = text(value, 180);
  return normalized ? crypto.createHash('sha256').update(String(namespace) + ':' + normalized).digest('hex') : '';
}

const MAX_POLICY = Object.freeze({
  frequency: Object.freeze({ session: 100, hour: 100, day: 100, maxActiveLeases: 20 }),
  cooldowns: Object.freeze({
    globalGapMs: 86400000,
    advertiserMs: 604800000,
    creativeMs: 604800000,
    dismissedCreativeMs: 2592000000
  }),
  fatigue: Object.freeze({ viewWeight: 1, dismissWeight: 1, decayMs: 2592000000, suppressionThreshold: 1, max: 1 }),
  viewability: Object.freeze({ threshold: 0.95, durationMs: 60000 }),
  lazy: Object.freeze({ rootMarginPx: 1500, requestThrottleMs: 60000 }),
  rotation: Object.freeze({ defaultSeconds: 59, minSeconds: 1, maxSeconds: 59 }),
  lease: Object.freeze({ ttlMs: 3600000 }),
  analytics: Object.freeze({ retentionDays: 365 }),
  state: Object.freeze({ sessionRetentionDays: 365, anonymousRetentionDays: 365 })
});

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function own(object, key) { return !!object && Object.prototype.hasOwnProperty.call(object, key); }
function firstValue(object, keys) {
  for (const key of keys) if (own(object, key) && object[key] !== '' && object[key] != null) return object[key];
  return undefined;
}
function millis(value) {
  if (value == null || value === '') return 0;
  if (typeof value.toMillis === 'function') {
    try { return value.toMillis(); } catch (_) { return 0; }
  }
  if (typeof value.toDate === 'function') {
    try { return value.toDate().getTime(); } catch (_) { return 0; }
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}
function text(value, max = 160) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function key(value) { return text(value, 120).toLowerCase().replace(/[^a-z0-9_-]/g, ''); }
function normalizedList(value, limit = 30) {
  const input = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(/[;,|]/) : []);
  return Array.from(new Set(input.map(item => key(item)).filter(Boolean))).slice(0, limit);
}
function normalizePlacement(value) {
  const result = text(value, 64).toLowerCase();
  if (PLACEMENTS.includes(result)) return result;
  // Future placement keys are allowed by the shared controller contract, but
  // are syntax-limited and still pass all central safety/eligibility checks.
  return /^[a-z][a-z0-9_]{0,47}$/.test(result) ? result : '';
}
function normalizeCampaignType(value) {
  const raw = key(value).replace(/-/g, '_');
  const aliases = {
    business_update: 'business', product_post: 'product', service_post: 'service',
    sale: 'promotion', discount: 'promotion', soko_hai: 'sokohai_announcement',
    sokohai: 'sokohai_announcement', sokohaiannouncement: 'sokohai_announcement',
    platform_announcement: 'sokohai_announcement'
  };
  const mapped = aliases[raw] || raw;
  return CAMPAIGN_TYPES.includes(mapped) ? mapped : 'other';
}
function policyNumber(raw, group, name, fallback) {
  const value = raw && raw[group] ? raw[group][name] : undefined;
  const cap = MAX_POLICY[group] && MAX_POLICY[group][name];
  return clamp(finiteNumber(value, fallback), 0, Number.isFinite(cap) ? cap : Number.MAX_SAFE_INTEGER);
}
function normalizePolicy(raw) {
  const config = raw && typeof raw === 'object' ? raw : {};
  // Accept a wrapped config (`{delivery:{...}}`) as well as the documented
  // direct `/system/adsDelivery` document shape.
  const source = config.delivery && typeof config.delivery === 'object' ? config.delivery : config;
  const merged = {
    frequency: {}, cooldowns: {}, fatigue: {}, viewability: {}, lazy: {},
    rotation: {}, lease: {}, analytics: {}, state: {}, timezone: text(source.timezone || DEFAULT_POLICY.timezone, 64)
  };
  for (const group of Object.keys(merged)) {
    if (group === 'timezone') continue;
    const defaults = DEFAULT_POLICY[group] || {};
    for (const name of Object.keys(defaults)) merged[group][name] = policyNumber(source, group, name, defaults[name]);
  }
  merged.frequency.session = Math.floor(merged.frequency.session);
  merged.frequency.hour = Math.floor(merged.frequency.hour);
  merged.frequency.day = Math.floor(merged.frequency.day);
  merged.frequency.maxActiveLeases = Math.max(1, Math.floor(merged.frequency.maxActiveLeases));
  merged.viewability.threshold = clamp(merged.viewability.threshold, 0.05, 0.95);
  merged.viewability.durationMs = Math.max(0, Math.floor(merged.viewability.durationMs));
  merged.lazy.rootMarginPx = Math.floor(merged.lazy.rootMarginPx);
  merged.lazy.requestThrottleMs = Math.floor(merged.lazy.requestThrottleMs);
  merged.rotation.defaultSeconds = clamp(merged.rotation.defaultSeconds, 1, 59);
  merged.rotation.minSeconds = clamp(merged.rotation.minSeconds, 1, merged.rotation.maxSeconds || 59);
  merged.rotation.maxSeconds = clamp(merged.rotation.maxSeconds, merged.rotation.minSeconds, 59);
  merged.lease.ttlMs = Math.max(30000, Math.floor(merged.lease.ttlMs));
  merged.analytics.retentionDays = Math.max(1, Math.floor(merged.analytics.retentionDays));
  merged.state.sessionRetentionDays = Math.max(1, Math.floor(merged.state.sessionRetentionDays));
  merged.state.anonymousRetentionDays = Math.max(1, Math.floor(merged.state.anonymousRetentionDays));
  merged.fatigue.suppressionThreshold = clamp(merged.fatigue.suppressionThreshold, 0.1, 1);
  merged.fatigue.max = clamp(merged.fatigue.max, 0.1, 1);
  return merged;
}

function isProtectedContext(placement, context, isAdmin = false) {
  const p = normalizePlacement(placement);
  const c = context && typeof context === 'object' ? context : {};
  if (isAdmin || c.isAdmin === true || c.adminDashboard === true || c.protected === true) return true;
  const protectedNames = new Set([
    'admin', 'admin_dashboard', 'checkout', 'payment', 'sokopay', 'wallet',
    'escrow', 'transaction', 'transaction_confirmation', 'security', 'account_security',
    'critical_alert', 'critical_alerts', 'moderation', 'support_case'
  ]);
  const fields = [p, c.surface, c.flow, c.contextType, c.screen, c.mode];
  return fields.some(value => {
    const normalized = key(value).replace(/-/g, '_');
    return protectedNames.has(normalized)
      || /(^|_)(admin|checkout|payment|wallet|escrow|security|critical_alert|transaction)(_|$)/.test(normalized);
  });
}
function campaignPlacements(campaign) {
  const raw = firstValue(campaign, ['placements', 'targetPlacements', 'adPlacements']);
  const delivery = campaign && campaign.delivery && typeof campaign.delivery === 'object' ? campaign.delivery : {};
  const list = raw === undefined ? normalizedList(delivery.placements) : normalizedList(raw);
  // Backwards compatibility: historical Home announcements remain Home-only
  // until an operator explicitly opts them into additional locations.
  return list.length ? list : ['home'];
}
function campaignTargets(campaign) {
  const targeting = campaign && campaign.targeting && typeof campaign.targeting === 'object' ? campaign.targeting : {};
  return {
    categories: normalizedList(firstValue(campaign, ['targetCategories', 'categories']) || targeting.categories),
    keywords: normalizedList(firstValue(campaign, ['targetKeywords', 'keywords']) || targeting.keywords),
    regions: normalizedList(firstValue(campaign, ['targetRegions', 'regions']) || targeting.regions),
    entityTypes: normalizedList(firstValue(campaign, ['targetEntityTypes']) || targeting.entityTypes),
    entityIds: normalizedList(firstValue(campaign, ['targetEntityIds']) || targeting.entityIds)
  };
}
function campaignGoal(campaign) {
  const goals = campaign && (campaign.goals || campaign.goal || campaign.deliveryGoals || campaign.deliveryGoal);
  const g = goals && typeof goals === 'object' ? goals : {};
  const daily = finiteNumber(firstValue(g, ['dailyImpressions', 'dailyGoal', 'daily']),
    finiteNumber(firstValue(campaign, ['dailyImpressionGoal', 'dailyGoal']), 0));
  const total = finiteNumber(firstValue(g, ['totalImpressions', 'totalGoal', 'total']),
    finiteNumber(firstValue(campaign, ['totalImpressionGoal', 'impressionGoal', 'totalGoal']), 0));
  return { daily: Math.max(0, Math.floor(daily)), total: Math.max(0, Math.floor(total)) };
}
function normalizeCampaignDelivery(input) {
  const source = input && typeof input === 'object' ? input : {};
  const rawPlacements = firstValue(source, ['placements', 'targetPlacements', 'adPlacements']);
  const requestedPlacements = Array.isArray(rawPlacements)
    ? rawPlacements : (typeof rawPlacements === 'string' ? rawPlacements.split(/[;,|]/) : []);
  const invalidPlacements = [];
  const placements = Array.from(new Set(requestedPlacements.map(value => {
    const placement = normalizePlacement(value);
    if (!placement || isProtectedContext(placement, {}, false)) {
      if (text(value, 64)) invalidPlacements.push(text(value, 64));
      return '';
    }
    return placement;
  }).filter(Boolean))).slice(0, 16);
  const targets = campaignTargets(source);
  const goal = campaignGoal(source);
  return {
    campaignType: normalizeCampaignType(source.campaignType || source.adType || source.publicationType),
    placements: placements.length ? placements : ['home'],
    invalidPlacements: Array.from(new Set(invalidPlacements)).slice(0, 16),
    targetCategories: targets.categories.slice(0, 30),
    targetKeywords: targets.keywords.slice(0, 30),
    targetRegions: targets.regions.slice(0, 30),
    targetEntityTypes: targets.entityTypes.slice(0, 20),
    targetEntityIds: targets.entityIds.slice(0, 50),
    goals: { dailyImpressions: Math.min(1000000000, goal.daily), totalImpressions: Math.min(1000000000, goal.total) }
  };
}
function currentDailyMetrics(metrics, dayKey) {
  const m = metrics && typeof metrics === 'object' ? metrics : {};
  const sameDay = !m.dailyKey || m.dailyKey === dayKey;
  return {
    dailyViewable: sameDay ? Math.max(0, finiteNumber(m.dailyViewable, 0)) : 0,
    totalViewable: Math.max(0, finiteNumber(m.totalViewable, finiteNumber(m.viewCount, 0)))
  };
}
function dayKeyFor(now, timeZone = DEFAULT_POLICY.timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
    const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${fields.year}-${fields.month}-${fields.day}`;
  } catch (_) {
    return new Date(now).toISOString().slice(0, 10);
  }
}
function lifecycle(campaign, now = Date.now(), metrics = {}, policy = DEFAULT_POLICY) {
  const c = campaign || {};
  const status = key(firstValue(c, ['lifecycleStatus', 'campaignStatus', 'status']) || '');
  const moderation = key(c.moderationStatus || '');
  const archive = c.archived === true || status === 'archived';
  if (archive) return { eligible: false, state: 'archived', reason: 'CAMPAIGN_ARCHIVED' };
  if (status === 'draft') return { eligible: false, state: 'draft', reason: 'CAMPAIGN_DRAFT' };
  if (status === 'paused' || c.paused === true) return { eligible: false, state: 'paused', reason: 'CAMPAIGN_PAUSED' };
  if (status === 'completed') return { eligible: false, state: 'completed', reason: 'CAMPAIGN_COMPLETED' };
  if (['pending', 'pending_moderation', 'moderation_pending', 'rejected', 'suspended'].includes(moderation)) {
    return { eligible: false, state: 'pending', reason: 'MODERATION_NOT_APPROVED' };
  }

  const start = millis(firstValue(c, ['startAt', 'startsAt', 'scheduledAt']));
  const end = millis(firstValue(c, ['endAt', 'endsAt', 'expiresAt']));
  if (start && start > now) return { eligible: false, state: 'scheduled', reason: 'CAMPAIGN_NOT_STARTED' };
  if (end && end <= now) return { eligible: false, state: 'completed', reason: 'CAMPAIGN_EXPIRED', autoComplete: true };

  // Explicit scheduled items with a reached start become active automatically.
  // Legacy `published` items still require active:true unless explicitly scheduled.
  const autoActivate = status === 'scheduled';
  if (status && !['active', 'published', 'approved', 'scheduled', ''].includes(status)) {
    return { eligible: false, state: status, reason: 'CAMPAIGN_STATE_UNSUPPORTED' };
  }
  if (c.active === false && !autoActivate) return { eligible: false, state: 'paused', reason: 'CAMPAIGN_INACTIVE' };
  if (moderation && !['approved', 'published', 'active'].includes(moderation)) {
    return { eligible: false, state: 'pending', reason: 'MODERATION_NOT_APPROVED' };
  }

  const goal = campaignGoal(c);
  const metricsNow = currentDailyMetrics(metrics, dayKeyFor(now, (policy && policy.timezone) || DEFAULT_POLICY.timezone));
  if (goal.total > 0 && metricsNow.totalViewable >= goal.total) {
    return { eligible: false, state: 'completed', reason: 'CAMPAIGN_TOTAL_GOAL_MET', autoComplete: true };
  }
  if (goal.daily > 0 && metricsNow.dailyViewable >= goal.daily) {
    return { eligible: false, state: 'active', reason: 'CAMPAIGN_DAILY_GOAL_MET' };
  }
  return { eligible: true, state: 'active', autoActivate };
}
function safeContext(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const interests = normalizedList(raw.interests || raw.interestCategories, 12);
  return {
    category: key(raw.category || raw.categoryId),
    categories: normalizedList(raw.categories || raw.interestCategories, 12),
    query: text(raw.query || raw.searchQuery, 120).toLowerCase(),
    region: key(raw.region),
    entityType: key(raw.entityType),
    entityId: text(raw.entityId, 128),
    mode: key(raw.mode),
    surface: key(raw.surface),
    flow: key(raw.flow),
    screen: key(raw.screen),
    contextType: key(raw.contextType),
    interests,
    protected: raw.protected === true,
    adminDashboard: raw.adminDashboard === true,
    isAdmin: raw.isAdmin === true
  };
}
function staticCampaignEligibility(campaign, placement, context, isAdmin = false) {
  const p = normalizePlacement(placement);
  const c = safeContext(context);
  if (!p) return { eligible: false, reason: 'INVALID_PLACEMENT' };
  if (isProtectedContext(p, c, isAdmin)) return { eligible: false, reason: 'PROTECTED_CONTEXT' };
  const allowed = campaignPlacements(campaign);
  if (!allowed.includes('*') && !allowed.includes(p)) return { eligible: false, reason: 'PLACEMENT_MISMATCH' };
  const type = normalizeCampaignType(campaign && (campaign.campaignType || campaign.adType || campaign.publicationType));
  if (!CAMPAIGN_TYPES.includes(type)) return { eligible: false, reason: 'CAMPAIGN_TYPE_UNSUPPORTED' };
  const targets = campaignTargets(campaign || {});
  const contextCategories = new Set([c.category, ...c.categories, ...c.interests].filter(Boolean));
  const queryWords = new Set(c.query.split(/[^a-z0-9]+/).filter(word => word.length > 2));
  const categoryMatch = targets.categories.length === 0 || targets.categories.some(item => contextCategories.has(item));
  const keywordMatch = targets.keywords.length === 0 || targets.keywords.some(item => queryWords.has(item) || c.query.includes(item));
  const regionMatch = targets.regions.length === 0 || (c.region && targets.regions.includes(c.region));
  const typeMatch = targets.entityTypes.length === 0 || (c.entityType && targets.entityTypes.includes(c.entityType));
  const entityMatch = targets.entityIds.length === 0 || (c.entityId && targets.entityIds.includes(key(c.entityId)));
  // No targeting field means broad/contextual. If targeting is present, all
  // supplied dimensions are honored rather than widening into unrelated slots.
  if (targets.categories.length && !categoryMatch) return { eligible: false, reason: 'CONTEXT_CATEGORY_MISMATCH' };
  if (targets.keywords.length && !keywordMatch) return { eligible: false, reason: 'CONTEXT_KEYWORD_MISMATCH' };
  if (targets.regions.length && !regionMatch) return { eligible: false, reason: 'CONTEXT_REGION_MISMATCH' };
  if (targets.entityTypes.length && !typeMatch) return { eligible: false, reason: 'CONTEXT_ENTITY_TYPE_MISMATCH' };
  if (targets.entityIds.length && !entityMatch) return { eligible: false, reason: 'CONTEXT_ENTITY_MISMATCH' };
  return { eligible: true, reason: 'ELIGIBLE', type, targets };
}
function decayedFatigue(fatigueRecord, now, policy = DEFAULT_POLICY) {
  const f = fatigueRecord && typeof fatigueRecord === 'object' ? fatigueRecord : {};
  const score = clamp(finiteNumber(f.score, 0), 0, policy.fatigue.max);
  const lastAt = millis(f.lastAt);
  if (!lastAt || now <= lastAt) return score;
  const decay = policy.fatigue.decayMs > 0 ? Math.exp(-(now - lastAt) / policy.fatigue.decayMs) : 0;
  return clamp(score * decay, 0, policy.fatigue.max);
}
function recentEntries(state, now, periodMs) {
  const list = state && Array.isArray(state.recent) ? state.recent : [];
  const start = now - periodMs;
  return list.filter(item => {
    const at = millis(item && item.at);
    return at > 0 && at >= start && at <= now;
  });
}
function cleanReservations(state, now) {
  const reservations = state && Array.isArray(state.reservations) ? state.reservations : [];
  return reservations.filter(item => millis(item && item.expiresAt) > now);
}
function boundedFatigue(value, now, limit = 300) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.entries(source)
    .filter(([, record]) => {
      const lastAt = millis(record && record.lastAt);
      return lastAt > 0 && now - lastAt <= 90 * 86400000;
    })
    .sort((a, b) => millis(b[1] && b[1].lastAt) - millis(a[1] && a[1].lastAt))
    .slice(0, limit));
}
function frequencyReason(userState, sessionState, now, policy = DEFAULT_POLICY) {
  const userRecent = recentEntries(userState, now, 86400000);
  const hourRecent = userRecent.filter(item => millis(item.at) >= now - 3600000);
  const sessionRecent = (sessionState && Array.isArray(sessionState.recent) ? sessionState.recent : [])
    .filter(item => millis(item && item.at) > 0 && millis(item.at) <= now);
  const userReservations = cleanReservations(userState, now);
  const sessionReservations = cleanReservations(sessionState, now);
  if (userRecent.length + userReservations.length >= policy.frequency.day) return 'FREQUENCY_DAY_CAP';
  if (hourRecent.length + userReservations.filter(item => millis(item.createdAt) >= now - 3600000).length >= policy.frequency.hour) return 'FREQUENCY_HOUR_CAP';
  if (sessionRecent.length + sessionReservations.length >= policy.frequency.session) return 'FREQUENCY_SESSION_CAP';
  if (userReservations.length >= policy.frequency.maxActiveLeases) return 'MAX_ACTIVE_LEASES';
  const last = userRecent.reduce((value, item) => Math.max(value, millis(item.at)), 0);
  if (last && now - last < policy.cooldowns.globalGapMs) return 'GLOBAL_MINIMUM_GAP';
  return '';
}
function userCooldownReason(campaign, userState, now, policy = DEFAULT_POLICY) {
  const recent = recentEntries(userState, now, 7 * 86400000);
  const advertiserId = text(campaign && (campaign.advertiserId || campaign.ownerId || campaign.userId), 128);
  const creativeId = text(campaign && campaign.creativeId, 128);
  const campaignId = text(campaign && campaign.id, 128);
  const advertiserKey = identityFingerprint('advertiser', advertiserId);
  const creativeKey = identityFingerprint('creative', creativeId || campaignId);
  const mostRecent = entries => entries.reduce((latest, item) => Math.max(latest, millis(item.at)), 0);
  if (advertiserKey && policy.cooldowns.advertiserMs > 0) {
    const latest = mostRecent(recent.filter(item => item.advertiserKey === advertiserKey));
    if (latest && now - latest < policy.cooldowns.advertiserMs) return 'ADVERTISER_COOLDOWN';
  }
  if (creativeKey && policy.cooldowns.creativeMs > 0) {
    const latest = mostRecent(recent.filter(item => item.creativeKey === creativeKey));
    if (latest && now - latest < policy.cooldowns.creativeMs) return 'CREATIVE_COOLDOWN';
  }
  const dismissals = userState && Array.isArray(userState.dismissals) ? userState.dismissals : [];
  const lastDismiss = dismissals.reduce((latest, item) => {
    if (key(item && item.creativeKey) !== creativeKey) return latest;
    return Math.max(latest, millis(item && item.at));
  }, 0);
  if (lastDismiss && now - lastDismiss < policy.cooldowns.dismissedCreativeMs) return 'DISMISSED_CREATIVE_COOLDOWN';
  const fatigue = userState && userState.fatigue && userState.fatigue[creativeKey];
  if (decayedFatigue(fatigue, now, policy) >= policy.fatigue.suppressionThreshold) return 'CREATIVE_FATIGUE_SUPPRESSED';
  return '';
}
function relevanceScore(campaign, context, now, metrics = {}, policy = DEFAULT_POLICY) {
  const c = safeContext(context);
  const targets = campaignTargets(campaign || {});
  const contextCategories = new Set([c.category, ...c.categories, ...c.interests].filter(Boolean));
  let score = 20;
  if (targets.categories.some(item => contextCategories.has(item))) score += 34;
  if (targets.keywords.some(item => c.query.includes(item))) score += 28;
  if (targets.regions.includes(c.region)) score += 12;
  if (targets.entityTypes.includes(c.entityType)) score += 16;
  if (targets.entityIds.includes(key(c.entityId))) score += 50;
  if (c.category && key(campaign && campaign.category) === c.category) score += 10;
  if (c.entityType && key(campaign && campaign.entityType) === c.entityType) score += 8;
  const priority = clamp(finiteNumber(campaign && campaign.priority, 0), 0, 1000);
  score += Math.min(16, Math.log1p(priority) * 3);

  const createdAt = millis(campaign && (campaign.createdAt || campaign.updatedAt));
  if (createdAt > 0) {
    const ageHours = Math.max(0, (now - createdAt) / 3600000);
    score += 12 * Math.exp(-ageHours / (24 * 14));
  } else score += 2;

  const goal = campaignGoal(campaign);
  const metricValues = currentDailyMetrics(metrics, dayKeyFor(now, policy.timezone));
  if (goal.total > 0) {
    const start = millis(firstValue(campaign, ['startAt', 'startsAt'])) || createdAt || now;
    const end = millis(firstValue(campaign, ['endAt', 'endsAt'])) || now + 86400000;
    const duration = Math.max(1, end - start);
    const progress = clamp((now - start) / duration, 0.02, 1);
    const expected = Math.max(1, goal.total * progress);
    const paceRatio = metricValues.totalViewable / expected;
    score += clamp(10 - paceRatio * 8, -10, 10);
  }
  if (goal.daily > 0) {
    const pace = metricValues.dailyViewable / Math.max(1, goal.daily);
    score += clamp(4 - pace * 5, -5, 4);
  }
  // Last-served campaigns are already suppressed by cooldowns where configured;
  // this small penalty additionally diversifies distinct campaigns/ad partners.
  return score;
}
function evaluateCandidate(campaign, options) {
  const opts = options || {};
  const policy = opts.policy || DEFAULT_POLICY;
  const now = finiteNumber(opts.now, Date.now());
  const userState = opts.userState || {};
  const sessionState = opts.sessionState || {};
  const metrics = opts.metrics || {};
  const placement = normalizePlacement(opts.placement);
  const context = safeContext(opts.context);
  const staticResult = staticCampaignEligibility(campaign, placement, context, opts.isAdmin === true);
  if (!staticResult.eligible) return { eligible: false, reason: staticResult.reason };
  const status = lifecycle(campaign, now, metrics, policy);
  if (!status.eligible) return { eligible: false, reason: status.reason, state: status.state };
  const freq = frequencyReason(userState, sessionState, now, policy);
  if (freq) return { eligible: false, reason: freq };
  const cooldown = userCooldownReason(campaign, userState, now, policy);
  if (cooldown) return { eligible: false, reason: cooldown };
  const advertiser = identityFingerprint('advertiser', campaign && (campaign.advertiserId || campaign.ownerId || campaign.userId));
  const creative = identityFingerprint('creative', campaign && (campaign.creativeId || campaign.id));
  const reservations = cleanReservations(userState, now).concat(cleanReservations(sessionState, now));
  if (reservations.some(item => item.advertiserKey === advertiser && advertiser)) {
    return { eligible: false, reason: 'ADVERTISER_LEASE_COOLDOWN' };
  }
  if (reservations.some(item => item.creativeKey === creative && creative)) {
    return { eligible: false, reason: 'CREATIVE_ALREADY_LEASED' };
  }
  const fatigueKey = creative;
  const fatigue = userState.fatigue && userState.fatigue[fatigueKey];
  const fatiguePenalty = decayedFatigue(fatigue, now, policy) * 30;
  const score = relevanceScore(campaign, context, now, metrics, policy) - fatiguePenalty;
  return { eligible: true, reason: 'ELIGIBLE', state: status.state, score, type: staticResult.type };
}
function selectCandidate(candidates, options) {
  const opts = options || {};
  const exclude = new Set(opts.excludeIds || []);
  const results = [];
  const reasons = [];
  for (const campaign of (candidates || [])) {
    if (!campaign || !campaign.id || exclude.has(String(campaign.id))) continue;
    const result = evaluateCandidate(campaign, Object.assign({}, opts, {
      metrics: (opts.metricsById && opts.metricsById[campaign.id]) || opts.metrics || {}
    }));
    if (result.eligible) results.push({ campaign, score: result.score, result });
    else if (result.reason) reasons.push(result.reason);
  }
  results.sort((a, b) => b.score - a.score
    || String(b.campaign.createdAt || '').localeCompare(String(a.campaign.createdAt || ''))
    || String(a.campaign.id).localeCompare(String(b.campaign.id)));
  return { selected: results[0] || null, eligible: results, reasonCodes: Array.from(new Set(reasons)).slice(0, 12) };
}
function reserveLeaseState(userState, sessionState, lease, now, policy = DEFAULT_POLICY) {
  const user = Object.assign({}, userState || {});
  const session = Object.assign({}, sessionState || {});
  user.recent = recentEntries(user, now, 7 * 86400000).slice(-800);
  session.recent = recentEntries(session, now, 7 * 86400000).slice(-120);
  user.dismissals = (Array.isArray(user.dismissals) ? user.dismissals : []).filter(item => now - millis(item.at) <= 30 * 86400000).slice(-100);
  user.fatigue = boundedFatigue(user.fatigue, now);
  user.reservations = cleanReservations(user, now).slice(-40);
  session.reservations = cleanReservations(session, now).slice(-30);
  const reservation = {
    leaseId: lease.leaseId,
    campaignId: lease.campaignId,
    advertiserKey: lease.advertiserKey || '',
    creativeKey: lease.creativeKey || '',
    placement: lease.placement,
    createdAt: now,
    expiresAt: now + policy.lease.ttlMs
  };
  user.reservations.push(reservation);
  session.reservations.push(reservation);
  return { user, session };
}
function removeReservation(state, leaseId, now) {
  const result = Object.assign({}, state || {});
  result.reservations = cleanReservations(result, now).filter(item => item.leaseId !== leaseId);
  return result;
}
function applyStateEvent(userState, sessionState, lease, eventType, now, policy = DEFAULT_POLICY) {
  let user = removeReservation(userState, lease.leaseId, now);
  let session = removeReservation(sessionState, lease.leaseId, now);
  user.recent = recentEntries(user, now, 7 * 86400000).slice(-800);
  session.recent = recentEntries(session, now, 7 * 86400000).slice(-120);
  user.dismissals = (Array.isArray(user.dismissals) ? user.dismissals : []).filter(item => now - millis(item.at) <= 30 * 86400000).slice(-100);
  user.fatigue = boundedFatigue(user.fatigue, now);
  const creativeKey = key(lease.creativeKey || lease.creativeId || lease.campaignId);
  if (eventType === 'viewable') {
    const record = {
      at: now,
      campaignId: text(lease.campaignId, 128),
      advertiserKey: key(lease.advertiserKey),
      creativeKey,
      placement: key(lease.placement)
    };
    user.recent.push(record);
    session.recent.push(record);
    user.recent = user.recent.slice(-800);
    session.recent = session.recent.slice(-120);
    const previous = user.fatigue[creativeKey] || {};
    const score = decayedFatigue(previous, now, policy) + policy.fatigue.viewWeight;
    user.fatigue[creativeKey] = { score: clamp(score, 0, policy.fatigue.max), lastAt: now, views: Math.max(0, finiteNumber(previous.views, 0)) + 1 };
    user.lastGlobalViewAt = now;
  } else if (eventType === 'dismissed') {
    const previous = user.fatigue[creativeKey] || {};
    const score = decayedFatigue(previous, now, policy) + policy.fatigue.dismissWeight;
    user.fatigue[creativeKey] = { score: clamp(score, 0, policy.fatigue.max), lastAt: now, dismissals: Math.max(0, finiteNumber(previous.dismissals, 0)) + 1 };
    user.dismissals.push({ creativeKey, campaignId: text(lease.campaignId, 128), at: now });
    user.dismissals = user.dismissals.slice(-100);
  }
  return { user, session };
}
function eventIsCounted(eventType) {
  return ['requested', 'loaded', 'rendered', 'entered_viewport', 'viewable', 'clicked', 'dismissed', 'lease_released'].includes(eventType);
}
function normalizeEventType(value) {
  const type = key(value).replace(/-/g, '_');
  const aliases = { viewport_entered: 'entered_viewport', impression: 'viewable', click: 'clicked', dismiss: 'dismissed' };
  const mapped = aliases[type] || type;
  return eventIsCounted(mapped) ? mapped : '';
}

module.exports = {
  PLACEMENTS, CAMPAIGN_TYPES, DEFAULT_POLICY, normalizePolicy, normalizePlacement,
  normalizeCampaignType, normalizeEventType, normalizeCampaignDelivery, dayKeyFor, isProtectedContext,
  campaignPlacements, campaignTargets, campaignGoal, currentDailyMetrics, lifecycle,
  safeContext, staticCampaignEligibility, decayedFatigue, frequencyReason,
  userCooldownReason, relevanceScore, evaluateCandidate, selectCandidate,
  reserveLeaseState, removeReservation, applyStateEvent, millis, text, key, identityFingerprint
};
