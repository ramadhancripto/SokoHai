'use strict';

/*
 * SokoHai Canonical Ads Delivery & Rotation Engine.
 * Campaigns stay in `announcements`; creative validation and presentation stay
 * in the shared Creative Model and canonical `js/06-announcement.js` renderer.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const crypto = require('crypto');
const core = require('./ads-delivery-core');

const db = admin.firestore();
const FV = admin.firestore.FieldValue;
const REGION = 'europe-west1';
const MAX_CAMPAIGNS_PER_QUERY = 250;
const MAX_METRICS_CANDIDATES = 80;
const MAX_SELECTION_RECHECKS = 8;
const EVENT_TYPES = new Set(['loaded', 'rendered', 'entered_viewport', 'viewable', 'clicked', 'dismissed', 'lease_released']);
const PUBLIC_FIELDS = [
  'headline','title','text','description','brandName','brand','creativeType','layoutStyle','mediaType','type',
  'image','imageUrl','mediaUrl','photo','videoUrl','posterUrl','audioUrl','logoUrl','backgroundImageUrl',
  'badgeText','badgeColor','badgeTextColor','badgeStyle','badgeAnimation','badgeAnim','badgeSize','badgePosition',
  'badgeOpacity','badgeFontSize','badgeTextAlign','badgeIcon','primaryColor','accentColor','textColor',
  'descriptionColor','descriptionSize','descriptionAlign','offerColor','offerTextColor','offerSize','offerAlign',
  'surfaceColor','frameOpacity','gradientAngle','borderRadius','fontWeight','fontSize','textAlign','aspectRatio',
  'format','objectFit','fit','focalPoint','focalX','focalY','brightness','contrast','saturation','blur',
  'overlayColor','overlayOpacity','backgroundMode','priceTag','price','ctaLabel','actionLabel','link','actionUrl',
  'ctaStyle','ctaIcon','animation','textAnimation','headlineAnimation','textEmphasis','animationMode',
  'animationDuration','animationDelay','animationStagger','ctaAnimation','ctaAnim','compact','paletteId','category',
  'offer','displayDurationSeconds','rotationMs','mediaDurationSeconds','videoDuration','durationSeconds',
  'videoTrimStart','videoTrimEnd','videoOriginalDuration','videoControls','videoAutoplay','autoplay','videoLoop',
  'slideshow','likeCount','likesCount','viewCount','views','clickCount','clicks'
];

function sha(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function text(value, max = 180) { return core.text(value, max); }
function timestampMillis(value) { return core.millis(value); }
function isAdminToken(token) {
  return !!token && (token.admin === true || token.isAdmin === true || token.role === 'admin'
    || String(token.email || '').toLowerCase() === 'rshabansaid@gmail.com');
}
function callableError(code, message) { return new HttpsError(code, message); }
function randomId() { return crypto.randomBytes(18).toString('hex'); }
function publicReasonCodes(values) {
  const input = Array.isArray(values) ? values : [values];
  const safe = input.map(value => text(value, 64).toUpperCase().replace(/[^A-Z0-9_]/g, '')).filter(Boolean);
  return Array.from(new Set(safe)).slice(0, 12);
}
function normalizeSessionId(value, uid, ip) {
  const supplied = text(value, 160);
  if (supplied.length >= 16) return supplied;
  return 'server-' + sha((uid || 'anonymous') + '|' + (ip || '') + '|' + Math.floor(Date.now() / 3600000)).slice(0, 40);
}
function userScope(uid, sessionHash) {
  return uid ? 'u_' + sha('user:' + uid) : 'a_' + sha('anonymous:' + sessionHash);
}
function loadContext(input) { return core.safeContext(input); }
function withId(doc) { return Object.assign({}, doc.data() || {}, { id: doc.id }); }

function sanitizedSlideshow(value) {
  if (!value || typeof value !== 'object') return null;
  const slides = Array.isArray(value.slides) ? value.slides.slice(0, 12).map(slide => {
    if (!slide || typeof slide !== 'object') return null;
    return {
      src: text(slide.src, 1000),
      name: text(slide.name, 80),
      duration: Math.max(1, Math.min(30, Number(slide.duration) || Number(value.defaultDuration) || 3))
    };
  }).filter(slide => slide && slide.src) : [];
  const transition = String(value.transition || 'fade');
  return {
    enabled: value.enabled === true && slides.length >= 2,
    transition: ['none','fade','slide','slide-left','slide-right','zoom','crossfade'].includes(transition) ? transition : 'fade',
    defaultDuration: Math.max(1, Math.min(30, Number(value.defaultDuration) || 3)),
    slides
  };
}
function sanitizedAnimation(value) {
  if (!value || typeof value !== 'object') return undefined;
  const output = {};
  ['entrance','emphasis','mode'].forEach(key => { if (value[key] != null) output[key] = text(value[key], 32); });
  ['duration','delay','stagger'].forEach(key => {
    if (Number.isFinite(Number(value[key]))) output[key] = Math.max(0, Math.min(5000, Number(value[key])));
  });
  return output;
}
function publicCampaign(campaign, id) {
  const output = { id: String(id), campaignType: core.normalizeCampaignType(campaign.campaignType || campaign.adType || campaign.publicationType) };
  PUBLIC_FIELDS.forEach(field => {
    if (!Object.prototype.hasOwnProperty.call(campaign, field)) return;
    const value = campaign[field];
    if (field === 'slideshow') output.slideshow = sanitizedSlideshow(value);
    else if (field === 'animation') output.animation = sanitizedAnimation(value);
    else if (typeof value === 'string') output[field] = value.slice(0, field.toLowerCase().includes('url') || field === 'link' || field === 'actionUrl' ? 1600 : 1200);
    else if (typeof value === 'number' && Number.isFinite(value)) output[field] = value;
    else if (typeof value === 'boolean') output[field] = value;
    else if (Array.isArray(value) && field !== 'slideshow') output[field] = value.slice(0, 12);
    else if (value && typeof value === 'object' && field !== 'animation') {
      try { output[field] = JSON.parse(JSON.stringify(value).slice(0, 12000)); } catch (_) {}
    }
  });
  output.id = String(id);
  output.brandName = text(output.brandName || output.brand || 'SokoHai', 64);
  output.headline = text(output.headline || output.title || output.text || 'SokoHai', 180);
  output.description = text(output.description || output.text || '', 1000);
  output.displayDurationSeconds = Math.max(1, Math.min(59, Number(output.displayDurationSeconds)
    || (Number(output.rotationMs) ? Number(output.rotationMs) / 1000 : 15)));
  return output;
}
function policySummary(policy) {
  return { viewability: policy.viewability, lazy: policy.lazy, rotation: policy.rotation, lease: { ttlMs: policy.lease.ttlMs } };
}
function noAd(reasonCodes, config) {
  return {
    ok: true,
    status: 'NO_ELIGIBLE_AD',
    code: 'NO_ELIGIBLE_AD',
    reasonCodes: publicReasonCodes(reasonCodes && reasonCodes.length ? reasonCodes : ['NO_MATCHING_CAMPAIGN']),
    config: config ? policySummary(config) : undefined
  };
}
async function loadPolicy() {
  try {
    const snapshot = await db.collection('system').doc('adsDelivery').get();
    return core.normalizePolicy(snapshot.exists ? snapshot.data() : null);
  } catch (error) {
    console.warn('[ads-delivery] policy fallback:', error && error.code || error && error.message || 'unavailable');
    return core.normalizePolicy(null);
  }
}
async function loadAnnouncementCandidates() {
  const collection = db.collection('announcements');
  const queries = [
    collection.where('active', '==', true).limit(MAX_CAMPAIGNS_PER_QUERY),
    collection.where('status', 'in', ['scheduled', 'published', 'active']).limit(MAX_CAMPAIGNS_PER_QUERY),
    collection.where('lifecycleStatus', 'in', ['scheduled', 'published', 'active']).limit(MAX_CAMPAIGNS_PER_QUERY)
  ];
  let snapshots;
  try { snapshots = await Promise.all(queries.map(query => query.get())); }
  catch (_) {
    // Bounded fallback covers legacy fields and missing/incompatible indexes.
    snapshots = [await collection.limit(MAX_CAMPAIGNS_PER_QUERY * 2).get()];
  }
  const byId = new Map();
  snapshots.forEach(snapshot => snapshot.forEach(doc => { if (!byId.has(doc.id)) byId.set(doc.id, withId(doc)); }));
  return Array.from(byId.values());
}
async function loadMetrics(candidates, policy, now) {
  const day = core.dayKeyFor(now, policy.timezone);
  const refs = candidates.slice(0, MAX_METRICS_CANDIDATES).map(campaign => ({
    id: campaign.id,
    ref: db.collection('adDeliveryMetrics').doc(String(campaign.id))
  }));
  const snapshots = await Promise.all(refs.map(item => item.ref.get().catch(() => null)));
  const metricsById = Object.create(null);
  refs.forEach((item, index) => {
    const snapshot = snapshots[index];
    const raw = snapshot && snapshot.exists ? snapshot.data() || {} : {};
    metricsById[item.id] = core.currentDailyMetrics(raw, day);
    if (raw.dailyKey) metricsById[item.id].dailyKey = raw.dailyKey;
  });
  return metricsById;
}
function staticCandidates(all, placement, context, now, policy, isAdmin, uid) {
  const failures = [];
  const candidates = [];
  (all || []).forEach(campaign => {
    const placementResult = core.staticCampaignEligibility(campaign, placement, context, isAdmin);
    if (!placementResult.eligible) { failures.push(placementResult.reason); return; }
    const state = core.lifecycle(campaign, now, {}, policy);
    if (!state.eligible) { failures.push(state.reason); return; }
    const advertiser = String(campaign.advertiserId || campaign.ownerId || campaign.userId || '');
    if (uid && advertiser && advertiser === uid) { failures.push('ADVERTISER_SELF_EXCLUSION'); return; }
    candidates.push(campaign);
  });
  return { candidates, failures };
}
function metricRef(campaignId) { return db.collection('adDeliveryMetrics').doc(String(campaignId)); }
function eventRef(eventId) { return db.collection('adDeliveryEvents').doc(eventId); }
function leaseRef(leaseId) { return db.collection('adDeliveryLeases').doc(leaseId); }
function userStateRef(scopeId) { return db.collection('adDeliveryState').doc(scopeId); }
function sessionStateRef(scopeId, sessionHash) { return userStateRef(scopeId).collection('adDeliverySessions').doc(sessionHash); }
function timestampFromMillis(value) { return admin.firestore.Timestamp.fromMillis(value); }
function stateExpiry(now, days) { return timestampFromMillis(now + Math.max(1, Number(days) || 30) * 86400000); }
function eventExpiry(now, policy) { return timestampFromMillis(now + policy.analytics.retentionDays * 86400000); }
function eventDocument({ type, placement, campaignId, creativeId, leaseId, reasonCode, requestId, ownerKey, sessionKey, slotKey, now, policy }) {
  const event = {
    type,
    placement,
    campaignId: campaignId || null,
    creativeId: creativeId || null,
    createdAt: FV.serverTimestamp(),
    expireAt: eventExpiry(now, policy)
  };
  if (leaseId) {
    event.leaseKey = sha(leaseId);
    if (type === 'requested') event.leaseId = leaseId; // server-only idempotent response lookup
  }
  if (requestId) event.requestId = text(requestId, 128);
  if (ownerKey) event.ownerKey = ownerKey;
  if (sessionKey) event.sessionKey = sessionKey;
  if (slotKey) event.slotKey = slotKey;
  if (reasonCode) event.reasonCode = text(reasonCode, 80);
  return event;
}
function metricCounterFields(type) {
  const map = {
    requested: ['totalRequests', 'dailyRequests'], loaded: ['totalLoaded', 'dailyLoaded'],
    rendered: ['totalRendered', 'dailyRendered'], entered_viewport: ['totalEnteredViewport', 'dailyEnteredViewport'],
    viewable: ['totalViewable', 'dailyViewable'], clicked: ['totalClicks', 'dailyClicks'],
    dismissed: ['totalDismissed', 'dailyDismissed'], lease_released: ['totalLeaseReleases', 'dailyLeaseReleases']
  };
  return map[type] || null;
}
function writeMetricUpdate(transaction, ref, snapshot, type, now, policy) {
  const fields = metricCounterFields(type);
  if (!fields) return;
  const current = snapshot && snapshot.exists ? snapshot.data() || {} : {};
  const day = core.dayKeyFor(now, policy.timezone);
  const sameDay = current.dailyKey === day;
  const [totalField, dailyField] = fields;
  transaction.set(ref, {
    [totalField]: Math.max(0, Number(current[totalField]) || 0) + 1,
    [dailyField]: (sameDay ? Math.max(0, Number(current[dailyField]) || 0) : 0) + 1,
    dailyKey: day,
    updatedAt: FV.serverTimestamp()
  }, { merge: true });
}
function requestSlotKey(placement, slotId) { return sha(String(placement) + '|' + String(slotId)); }
function throttleRequest(sessionState, slotKey, now, policy) {
  const lastRequests = sessionState && sessionState.slotRequests && typeof sessionState.slotRequests === 'object'
    ? Object.assign({}, sessionState.slotRequests) : {};
  const last = Number(lastRequests[slotKey]) || 0;
  if (last && now - last < policy.lazy.requestThrottleMs) return { throttled: true, requests: lastRequests };
  lastRequests[slotKey] = now;
  Object.keys(lastRequests).forEach(key => { if (now - (Number(lastRequests[key]) || 0) > 86400000) delete lastRequests[key]; });
  const entries = Object.entries(lastRequests).sort((a, b) => b[1] - a[1]).slice(0, 100);
  return { throttled: false, requests: Object.fromEntries(entries) };
}
function requestEventId(requestId, scopeId, sessionHash, placement, slotId) {
  return sha(['request', scopeId, sessionHash, placement, slotId, requestId].join('|'));
}
function deliveryEventId(leaseId, type) { return sha('delivery|' + leaseId + '|' + type); }
function requestedResponse(status, leaseId, campaignId, expiresAt, campaign, policy) {
  if (!status || !leaseId || !campaignId || !campaign) return null;
  return {
    ok: true,
    status: 'DELIVERED',
    leaseId: String(leaseId),
    expiresAt: new Date(expiresAt).toISOString(),
    campaign: publicCampaign(campaign, String(campaignId)),
    config: policySummary(policy)
  };
}
async function replayExistingRequest(transaction, previous, options) {
  const opts = options || {};
  const fallback = previous && previous.reasonCode ? previous.reasonCode : 'REQUEST_ALREADY_PROCESSED';
  if (!previous || previous.ownerKey !== opts.scopeId || previous.sessionKey !== opts.sessionHash) {
    return { reasonCodes: ['REQUEST_ALREADY_PROCESSED'] };
  }
  if (opts.isAdmin || core.isProtectedContext(opts.placement, opts.context, false)) {
    return { reasonCodes: [opts.isAdmin ? 'ADMIN_CONTEXT' : 'PROTECTED_CONTEXT'] };
  }
  if (!previous.leaseId || !previous.campaignId) return { reasonCodes: [fallback] };
  const [leaseSnapshot, campaignSnapshot] = await Promise.all([
    transaction.get(leaseRef(previous.leaseId)),
    transaction.get(db.collection('announcements').doc(String(previous.campaignId)))
  ]);
  if (!leaseSnapshot.exists || !campaignSnapshot.exists) return { reasonCodes: [fallback] };
  const lease = leaseSnapshot.data() || {};
  const campaign = withId(campaignSnapshot);
  const expiresAt = timestampMillis(lease.expiresAt);
  const expectedSlotKey = requestSlotKey(opts.placement, opts.slotId);
  if (lease.ownerKey !== opts.scopeId || lease.sessionKey !== opts.sessionHash
      || lease.placement !== opts.placement || lease.slotKey !== expectedSlotKey || expiresAt <= opts.now) {
    return { reasonCodes: [fallback] };
  }
  const advertiser = String(campaign.advertiserId || campaign.ownerId || campaign.userId || '');
  if (opts.uid && advertiser && advertiser === opts.uid) return { reasonCodes: ['ADVERTISER_SELF_EXCLUSION'] };
  const staticResult = core.staticCampaignEligibility(campaign, opts.placement, opts.context, false);
  if (!staticResult.eligible) return { reasonCodes: [staticResult.reason] };
  const metricsSnapshot = await transaction.get(metricRef(String(previous.campaignId)));
  const metrics = metricsSnapshot.exists ? metricsSnapshot.data() || {} : {};
  const life = core.lifecycle(campaign, opts.now, metrics, opts.policy);
  if (!life.eligible) return { reasonCodes: [life.reason || 'CAMPAIGN_NO_LONGER_ELIGIBLE'] };
  return {
    delivery: requestedResponse(true, previous.leaseId, previous.campaignId, expiresAt, campaign, opts.policy)
  };
}
async function commitNoAdRequest({ requestId, scopeId, sessionHash, placement, slotId, reasonCodes, policy, now, context, uid, isAdmin }) {
  const sessionRef = sessionStateRef(scopeId, sessionHash);
  const slotKey = requestSlotKey(placement, slotId);
  const requestRef = eventRef(requestEventId(requestId, scopeId, sessionHash, placement, slotId));
  const codes = publicReasonCodes(reasonCodes);
  const outcome = await db.runTransaction(async transaction => {
    const [sessionSnapshot, requestSnapshot] = await Promise.all([transaction.get(sessionRef), transaction.get(requestRef)]);
    if (requestSnapshot.exists) {
      const replay = await replayExistingRequest(transaction, requestSnapshot.data() || {}, {
        scopeId, sessionHash, placement, slotId, context, uid, isAdmin, policy, now
      });
      return replay.delivery ? { delivery: replay.delivery } : { reasonCodes: replay.reasonCodes };
    }
    const session = sessionSnapshot.exists ? sessionSnapshot.data() || {} : {};
    const throttle = throttleRequest(session, slotKey, now, policy);
    const finalCodes = throttle.throttled ? ['REQUEST_THROTTLED'] : (codes.length ? codes : ['NO_MATCHING_CAMPAIGN']);
    transaction.set(sessionRef, {
      slotRequests: throttle.requests,
      expiresAt: stateExpiry(now, policy.state.sessionRetentionDays),
      updatedAt: FV.serverTimestamp()
    }, { merge: true });
    transaction.create(requestRef, eventDocument({
      type: 'requested', placement, reasonCode: finalCodes[0], requestId,
      ownerKey: scopeId, sessionKey: sessionHash, slotKey, now, policy
    }));
    return { reasonCodes: finalCodes };
  });
  if (outcome && outcome.delivery) return outcome.delivery;
  return noAd(outcome && outcome.reasonCodes || codes, policy);
}

async function requestDelivery(request) {
  const data = request && request.data && typeof request.data === 'object' ? request.data : {};
  const placement = core.normalizePlacement(data.placement);
  if (!placement) throw callableError('invalid-argument', 'A valid ad placement key is required.');
  const uid = request && request.auth && request.auth.uid ? String(request.auth.uid) : '';
  const adminUser = isAdminToken(request && request.auth && request.auth.token);
  const rawIp = text(request && request.rawRequest && request.rawRequest.ip, 100);
  const clientSessionId = normalizeSessionId(data.sessionId, uid, rawIp);
  const sessionHash = sha('session:' + clientSessionId);
  const scopeId = userScope(uid, sessionHash);
  const slotId = text(data.slotId || placement + '_' + sessionHash.slice(0, 12), 128);
  const suppliedRequestId = text(data.requestId, 128);
  const requestId = /^[A-Za-z0-9_-]{16,128}$/.test(suppliedRequestId) ? suppliedRequestId : randomId();
  const now = Date.now();
  const policy = await loadPolicy();
  const context = loadContext(data.context);
  if (adminUser) {
    return commitNoAdRequest({ requestId, scopeId, sessionHash, placement, slotId, reasonCodes: ['ADMIN_CONTEXT'], policy, now, context, uid, isAdmin: true });
  }
  if (core.isProtectedContext(placement, context, false)) {
    return commitNoAdRequest({ requestId, scopeId, sessionHash, placement, slotId, reasonCodes: ['PROTECTED_CONTEXT'], policy, now, context, uid, isAdmin: false });
  }

  try {
    const all = await loadAnnouncementCandidates();
    const matching = staticCandidates(all, placement, context, now, policy, false, uid);
    if (!matching.candidates.length) {
      return commitNoAdRequest({
        requestId, scopeId, sessionHash, placement, slotId,
        reasonCodes: matching.failures.length ? matching.failures : ['NO_MATCHING_CAMPAIGN'],
        policy, now, context, uid, isAdmin: false
      });
    }
    const candidates = matching.candidates.map(campaign => ({
      campaign,
      score: core.relevanceScore(campaign, context, now, {}, policy)
    })).sort((a, b) => b.score - a.score
      || String(b.campaign.createdAt || '').localeCompare(String(a.campaign.createdAt || '')))
      .slice(0, MAX_METRICS_CANDIDATES).map(item => item.campaign);
    const metricsById = await loadMetrics(candidates, policy, now);
    const stateRef = userStateRef(scopeId);
    const sessionRef = sessionStateRef(scopeId, sessionHash);
    const slotKey = requestSlotKey(placement, slotId);
    const requestRef = eventRef(requestEventId(requestId, scopeId, sessionHash, placement, slotId));
    const excluded = new Set();
    let lastReasons = matching.failures.slice();

    for (let attempt = 0; attempt < MAX_SELECTION_RECHECKS; attempt++) {
      const leaseId = randomId();
      const leaseDocumentRef = leaseRef(leaseId);
      const transactionResult = await db.runTransaction(async transaction => {
        const [userSnapshot, sessionSnapshot, requestSnapshot] = await Promise.all([
          transaction.get(stateRef), transaction.get(sessionRef), transaction.get(requestRef)
        ]);
        if (requestSnapshot.exists) {
          const replay = await replayExistingRequest(transaction, requestSnapshot.data() || {}, {
            scopeId, sessionHash, placement, slotId, context, uid, isAdmin: false, policy, now
          });
          return replay.delivery ? replay.delivery : { noAd: true, reasonCodes: replay.reasonCodes };
        }
        const userState = userSnapshot.exists ? userSnapshot.data() || {} : {};
        const sessionState = sessionSnapshot.exists ? sessionSnapshot.data() || {} : {};
        const throttle = throttleRequest(sessionState, slotKey, now, policy);
        if (throttle.throttled) {
          transaction.create(requestRef, eventDocument({
            type: 'requested', placement, reasonCode: 'REQUEST_THROTTLED', requestId,
            ownerKey: scopeId, sessionKey: sessionHash, slotKey, now, policy
          }));
          transaction.set(sessionRef, {
            slotRequests: throttle.requests,
            expiresAt: stateExpiry(now, policy.state.sessionRetentionDays),
            updatedAt: FV.serverTimestamp()
          }, { merge: true });
          return { noAd: true, reasonCodes: ['REQUEST_THROTTLED'] };
        }

        const selection = core.selectCandidate(candidates, {
          placement, context, userState, sessionState, metricsById, policy, now, isAdmin: false,
          excludeIds: Array.from(excluded)
        });
        if (!selection.selected) {
          const reasons = selection.reasonCodes.length ? selection.reasonCodes : lastReasons;
          transaction.create(requestRef, eventDocument({
            type: 'requested', placement, reasonCode: reasons[0] || 'NO_MATCHING_CAMPAIGN', requestId,
            ownerKey: scopeId, sessionKey: sessionHash, slotKey, now, policy
          }));
          transaction.set(sessionRef, {
            slotRequests: throttle.requests,
            expiresAt: stateExpiry(now, policy.state.sessionRetentionDays),
            updatedAt: FV.serverTimestamp()
          }, { merge: true });
          return { noAd: true, reasonCodes: reasons.length ? reasons : ['NO_MATCHING_CAMPAIGN'] };
        }

        const selected = selection.selected.campaign;
        const selectedId = String(selected.id);
        const selectedRef = db.collection('announcements').doc(selectedId);
        const metricsDocumentRef = metricRef(selectedId);
        const [campaignSnapshot, metricsSnapshot] = await Promise.all([
          transaction.get(selectedRef), transaction.get(metricsDocumentRef)
        ]);
        if (!campaignSnapshot.exists) return { retryCampaign: selectedId, reason: 'CAMPAIGN_NOT_FOUND' };
        const currentCampaign = withId(campaignSnapshot);
        const currentAdvertiser = String(currentCampaign.advertiserId || currentCampaign.ownerId || currentCampaign.userId || '');
        if (uid && currentAdvertiser && currentAdvertiser === uid) {
          return { retryCampaign: selectedId, reason: 'ADVERTISER_SELF_EXCLUSION' };
        }
        const currentMetrics = metricsSnapshot.exists ? metricsSnapshot.data() || {} : {};
        const finalResult = core.evaluateCandidate(currentCampaign, {
          placement, context, userState, sessionState, metrics: currentMetrics, policy, now, isAdmin: false
        });
        if (!finalResult.eligible) return { retryCampaign: selectedId, reason: finalResult.reason };

        const advertiserId = currentAdvertiser;
        const creativeId = String(currentCampaign.creativeId || currentCampaign.id);
        const lease = {
          leaseId,
          ownerKey: scopeId,
          sessionKey: sessionHash,
          campaignId: selectedId,
          creativeId,
          advertiserKey: core.identityFingerprint('advertiser', advertiserId),
          creativeKey: core.identityFingerprint('creative', creativeId),
          placement,
          slotKey,
          createdAt: now,
          expiresAt: timestampFromMillis(now + policy.lease.ttlMs)
        };
        const states = core.reserveLeaseState(userState, sessionState, lease, now, policy);
        states.user.slotRequests = throttle.requests;
        states.session.slotRequests = throttle.requests;
        const stateExpiresAt = stateExpiry(now, policy.state.sessionRetentionDays);
        const userStateWrite = Object.assign({}, states.user, { updatedAt: FV.serverTimestamp() });
        if (!uid) userStateWrite.expiresAt = stateExpiry(now, policy.state.anonymousRetentionDays);
        transaction.set(stateRef, userStateWrite, { merge: true });
        transaction.set(sessionRef, Object.assign({}, states.session, {
          expiresAt: stateExpiresAt, updatedAt: FV.serverTimestamp()
        }), { merge: true });
        transaction.create(leaseDocumentRef, lease);
        transaction.create(requestRef, eventDocument({
          type: 'requested', placement, campaignId: selectedId, creativeId, leaseId,
          requestId, ownerKey: scopeId, sessionKey: sessionHash, slotKey, now, policy
        }));
        writeMetricUpdate(transaction, metricsDocumentRef, metricsSnapshot, 'requested', now, policy);
        return {
          ok: true,
          status: 'DELIVERED',
          leaseId,
          expiresAt: new Date(now + policy.lease.ttlMs).toISOString(),
          campaign: publicCampaign(currentCampaign, selectedId),
          config: policySummary(policy)
        };
      });

      if (transactionResult && transactionResult.retryCampaign) {
        excluded.add(transactionResult.retryCampaign);
        lastReasons.push(transactionResult.reason || 'CAMPAIGN_CHANGED_DURING_SELECTION');
        continue;
      }
      if (transactionResult && transactionResult.noAd) return noAd(transactionResult.reasonCodes, policy);
      return transactionResult || noAd(['DELIVERY_UNAVAILABLE'], policy);
    }
    return commitNoAdRequest({
      requestId, scopeId, sessionHash, placement, slotId,
      reasonCodes: lastReasons.concat(['SELECTION_RECHECK_LIMIT']), policy, now, context, uid, isAdmin: false
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.warn('[ads-delivery] request failed open:', error && error.code || error && error.message || 'unavailable');
    return noAd(['DELIVERY_UNAVAILABLE'], policy);
  }
}

function countLegacyField(type) {
  if (type === 'viewable') return 'viewCount';
  if (type === 'clicked') return 'clickCount';
  return '';
}
async function trackDeliveryEvent(request) {
  const data = request && request.data && typeof request.data === 'object' ? request.data : {};
  const leaseId = text(data.leaseId, 128);
  const type = core.normalizeEventType(data.type);
  if (!leaseId || !type || !EVENT_TYPES.has(type)) throw callableError('invalid-argument', 'Invalid delivery event.');
  const uid = request && request.auth && request.auth.uid ? String(request.auth.uid) : '';
  const ip = text(request && request.rawRequest && request.rawRequest.ip, 100);
  const clientSessionId = normalizeSessionId(data.sessionId, uid, ip);
  const sessionHash = sha('session:' + clientSessionId);
  const scopeId = userScope(uid, sessionHash);
  const now = Date.now();
  const policy = await loadPolicy();
  const leaseDocumentRef = leaseRef(leaseId);
  const auditRef = eventRef(deliveryEventId(leaseId, type));

  try {
    const result = await db.runTransaction(async transaction => {
      const [leaseSnapshot, auditSnapshot] = await Promise.all([transaction.get(leaseDocumentRef), transaction.get(auditRef)]);
      if (!leaseSnapshot.exists) return { ok: false, reasonCode: 'LEASE_NOT_FOUND' };
      const lease = leaseSnapshot.data() || {};
      if (lease.ownerKey !== scopeId || lease.sessionKey !== sessionHash) {
        throw callableError('permission-denied', 'Delivery lease does not belong to this session.');
      }
      if (auditSnapshot.exists) return { ok: true, duplicate: true };
      const expiresAt = timestampMillis(lease.expiresAt);
      if (expiresAt && now > expiresAt && type !== 'clicked') return { ok: false, reasonCode: 'LEASE_EXPIRED' };

      const campaignDocumentRef = db.collection('announcements').doc(String(lease.campaignId));
      const metricsDocumentRef = metricRef(String(lease.campaignId));
      const [campaignSnapshot, metricsSnapshot] = await Promise.all([
        transaction.get(campaignDocumentRef), transaction.get(metricsDocumentRef)
      ]);
      if (!campaignSnapshot.exists && type !== 'lease_released') return { ok: false, reasonCode: 'CAMPAIGN_NOT_FOUND' };
      const campaign = campaignSnapshot.exists ? withId(campaignSnapshot) : { id: lease.campaignId };
      const metrics = metricsSnapshot.exists ? metricsSnapshot.data() || {} : {};
      if (type === 'viewable') {
        const live = core.lifecycle(campaign, now, metrics, policy);
        if (!live.eligible) return { ok: false, reasonCode: live.reason || 'CAMPAIGN_NO_LONGER_ELIGIBLE' };
      }

      const needsState = ['viewable', 'dismissed', 'lease_released'].includes(type);
      let userRef, perSessionRef, userState = {}, sessionState = {};
      if (needsState) {
        userRef = userStateRef(scopeId);
        perSessionRef = sessionStateRef(scopeId, sessionHash);
        const [userSnapshot, sessionSnapshot] = await Promise.all([transaction.get(userRef), transaction.get(perSessionRef)]);
        userState = userSnapshot.exists ? userSnapshot.data() || {} : {};
        sessionState = sessionSnapshot.exists ? sessionSnapshot.data() || {} : {};
      }

      transaction.create(auditRef, eventDocument({
        type, placement: String(lease.placement || ''), campaignId: String(lease.campaignId || ''),
        creativeId: String(lease.creativeId || ''), leaseId, now, policy
      }));
      transaction.update(leaseDocumentRef, {
        events: FV.arrayUnion(type),
        updatedAt: FV.serverTimestamp(),
        ...(type === 'viewable' ? { viewableAt: FV.serverTimestamp() } : {}),
        ...(type === 'clicked' ? { clickedAt: FV.serverTimestamp() } : {}),
        ...(type === 'dismissed' ? { dismissedAt: FV.serverTimestamp() } : {})
      });
      if (campaignSnapshot.exists) writeMetricUpdate(transaction, metricsDocumentRef, metricsSnapshot, type, now, policy);
      const legacyField = countLegacyField(type);
      if (legacyField && campaignSnapshot.exists) transaction.update(campaignDocumentRef, { [legacyField]: FV.increment(1) });
      if (needsState) {
        const state = core.applyStateEvent(userState, sessionState, {
          leaseId,
          campaignId: String(lease.campaignId || ''),
          creativeId: String(lease.creativeId || ''),
          creativeKey: String(lease.creativeKey || lease.creativeId || lease.campaignId || ''),
          advertiserKey: String(lease.advertiserKey || ''),
          placement: String(lease.placement || '')
        }, type, now, policy);
        const stateExpiresAt = stateExpiry(now, policy.state.sessionRetentionDays);
        const userStateWrite = Object.assign({}, state.user, { updatedAt: FV.serverTimestamp() });
        if (String(lease.ownerKey || '').startsWith('a_')) {
          userStateWrite.expiresAt = stateExpiry(now, policy.state.anonymousRetentionDays);
        }
        transaction.set(userRef, userStateWrite, { merge: true });
        transaction.set(perSessionRef, Object.assign({}, state.session, {
          expiresAt: stateExpiresAt, updatedAt: FV.serverTimestamp()
        }), { merge: true });
      }
      return { ok: true, event: type };
    });
    return result || { ok: false, reasonCode: 'EVENT_NOT_RECORDED' };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.warn('[ads-delivery] event failed open:', error && error.code || error && error.message || 'unavailable');
    return { ok: false, reasonCode: 'ANALYTICS_UNAVAILABLE' };
  }
}

async function deliverySweep() {
  const policy = await loadPolicy();
  const now = Date.now();
  const collection = db.collection('announcements');
  const queries = [
    collection.where('status', 'in', ['scheduled', 'published', 'active']).limit(500),
    collection.where('lifecycleStatus', 'in', ['scheduled', 'published', 'active']).limit(500),
    collection.where('active', '==', true).limit(500)
  ];
  const snapshots = await Promise.all(queries.map(query => query.get()));
  const docs = new Map();
  snapshots.forEach(snapshot => snapshot.forEach(doc => { if (!docs.has(doc.id)) docs.set(doc.id, doc); }));
  const campaigns = Array.from(docs.values());
  const metricsById = await Promise.all(campaigns.map(async doc => {
    const campaign = withId(doc);
    const goal = core.campaignGoal(campaign);
    if (!goal.daily && !goal.total) return [doc.id, {}];
    try {
      const metricSnapshot = await metricRef(doc.id).get();
      return [doc.id, metricSnapshot.exists ? metricSnapshot.data() || {} : {}];
    } catch (_) { return [doc.id, {}]; }
  }));
  const metrics = new Map(metricsById);
  let activated = 0, completed = 0, checked = 0;
  let batch = db.batch();
  let writes = 0;
  for (const doc of campaigns) {
    checked++;
    const campaign = withId(doc);
    const status = core.lifecycle(campaign, now, metrics.get(doc.id) || {}, policy);
    const scheduled = status.autoActivate && ['scheduled'].includes(String(campaign.lifecycleStatus || campaign.campaignStatus || campaign.status || '').toLowerCase());
    if (scheduled) {
      batch.update(doc.ref, {
        status: 'published', lifecycleStatus: 'active', active: true,
        activatedAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp()
      });
      activated++; writes++;
    } else if (status.autoComplete && campaign.archived !== true && campaign.active !== false) {
      // Keep legacy status readable; lifecycleStatus is canonical, while
      // active:false stops old clients and old campaign-management screens.
      batch.update(doc.ref, {
        lifecycleStatus: 'completed', active: false,
        completedAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp()
      });
      completed++; writes++;
    }
    if (writes >= 450) { await batch.commit(); batch = db.batch(); writes = 0; }
  }
  if (writes) await batch.commit();
  return { ok: true, checked, activated, completed };
}

async function updateCampaignDelivery(request) {
  if (!request || !request.auth) throw callableError('unauthenticated', 'Sign in as an administrator.');
  if (!isAdminToken(request.auth.token)) throw callableError('permission-denied', 'Administrator access is required.');
  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const announcementId = text(data.announcementId, 128);
  if (!announcementId) throw callableError('invalid-argument', 'announcementId is required.');
  const delivery = core.normalizeCampaignDelivery(data.delivery);
  if (delivery.invalidPlacements.length) {
    throw callableError('invalid-argument', 'One or more requested placements are invalid or protected.');
  }
  const lifecycleAction = core.key(data.lifecycleAction || 'keep');
  if (!['keep', 'active', 'paused'].includes(lifecycleAction)) {
    throw callableError('invalid-argument', 'Campaign lifecycle action must be active, paused, or keep.');
  }
  const announcementRef = db.collection('announcements').doc(announcementId);
  const snapshot = await announcementRef.get();
  if (!snapshot.exists) throw callableError('not-found', 'Campaign not found.');
  const campaign = withId(snapshot);
  const status = core.key(campaign.lifecycleStatus || campaign.status || '');
  if (campaign.archived === true || status === 'archived') {
    throw callableError('failed-precondition', 'Archived campaigns cannot be edited from Delivery Settings.');
  }
  const moderation = core.key(campaign.moderationStatus || '');
  const draft = status === 'draft' || moderation === 'draft';
  const now = Date.now();
  const endAt = core.millis(campaign.endAt || campaign.endsAt || campaign.expiresAt);
  const totalGoal = core.campaignGoal(campaign).total;
  let totalViewable = 0;
  if (totalGoal > 0) {
    try {
      const metricsSnapshot = await metricRef(announcementId).get();
      if (metricsSnapshot.exists) totalViewable = core.currentDailyMetrics(metricsSnapshot.data(), core.dayKeyFor(now)).totalViewable;
    } catch (_) {}
  }
  const completed = status === 'completed' || (endAt > 0 && endAt <= now) || (totalGoal > 0 && totalViewable >= totalGoal);
  const mayChangeLifecycle = !completed && !draft
    && !['pending', 'pending_moderation', 'moderation_pending', 'rejected', 'suspended'].includes(moderation);
  if (lifecycleAction !== 'keep' && !mayChangeLifecycle && !completed) {
    throw callableError('failed-precondition', 'Draft or moderation-pending campaigns cannot be activated or paused here.');
  }

  const patch = {
    campaignType: delivery.campaignType,
    placements: delivery.placements,
    targetCategories: delivery.targetCategories,
    targetKeywords: delivery.targetKeywords,
    targetRegions: delivery.targetRegions,
    targetEntityTypes: delivery.targetEntityTypes,
    targetEntityIds: delivery.targetEntityIds,
    goals: delivery.goals,
    deliveryUpdatedAt: FV.serverTimestamp(),
    updatedAt: FV.serverTimestamp()
  };
  if (lifecycleAction === 'paused') {
    patch.lifecycleStatus = 'paused';
    patch.active = false;
  } else if (lifecycleAction === 'active') {
    const startAt = core.millis(campaign.startAt || campaign.startsAt || campaign.scheduledAt);
    patch.lifecycleStatus = startAt > now ? 'scheduled' : 'active';
    patch.status = 'published';
    patch.active = true;
  }
  if (completed) {
    patch.lifecycleStatus = 'completed';
    patch.active = false;
  }
  await announcementRef.update(patch);
  return {
    ok: true,
    announcementId,
    campaignType: delivery.campaignType,
    placements: delivery.placements,
    targetCategories: delivery.targetCategories,
    targetKeywords: delivery.targetKeywords,
    targetRegions: delivery.targetRegions,
    targetEntityTypes: delivery.targetEntityTypes,
    targetEntityIds: delivery.targetEntityIds,
    goals: delivery.goals,
    lifecycleStatus: patch.lifecycleStatus || campaign.lifecycleStatus || campaign.status || (campaign.active === false ? 'paused' : 'active'),
    active: patch.active === undefined ? campaign.active !== false : patch.active
  };
}

exports.adsRequestDelivery = onCall({ region: REGION, enforceAppCheck: false }, requestDelivery);
exports.adsTrackDeliveryEvent = onCall({ region: REGION, enforceAppCheck: false }, trackDeliveryEvent);
exports.adsUpdateCampaignDelivery = onCall({ region: REGION, enforceAppCheck: false }, updateCampaignDelivery);
exports.adsDeliverySweep = onSchedule({ region: REGION, schedule: 'every 60 minutes', timeZone: 'Africa/Dar_es_Salaam' }, deliverySweep);
exports._testing = { requestDelivery, trackDeliveryEvent, updateCampaignDelivery, deliverySweep, publicCampaign, eventDocument };
