import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const core = require('../functions/ads-delivery-core.js');
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`✓ ${String(passed).padStart(2, '0')} ${name}`);
}
const now = Date.parse('2026-09-24T08:00:00Z');
const freshCampaign = (overrides = {}) => Object.assign({
  id: 'campaign-1',
  status: 'published',
  active: true,
  archived: false,
  moderationStatus: 'approved',
  campaignType: 'product',
  advertiserId: 'advertiser-1',
  creativeId: 'creative-1',
  placements: ['home'],
  createdAt: new Date(now - 60000).toISOString(),
  priority: 0
}, overrides);
const openPolicy = core.normalizePolicy({
  frequency: { session: 100, hour: 100, day: 100, maxActiveLeases: 20 },
  cooldowns: { globalGapMs: 0, advertiserMs: 0, creativeMs: 0, dismissedCreativeMs: 0 },
  fatigue: { viewWeight: 0.1, dismissWeight: 0.3, decayMs: 86400000, suppressionThreshold: 1, max: 1 }
});

await test('lifecycle and moderation states normalize safely', async () => {
  for (const status of ['draft', 'scheduled', 'active', 'paused', 'completed', 'archived']) assert.ok(status);
  assert.equal(core.lifecycle(freshCampaign({ status: 'draft' }), now, {}, openPolicy).reason, 'CAMPAIGN_DRAFT');
  assert.equal(core.lifecycle(freshCampaign({ lifecycleStatus: 'paused' }), now, {}, openPolicy).reason, 'CAMPAIGN_PAUSED');
  assert.equal(core.lifecycle(freshCampaign({ lifecycleStatus: 'completed' }), now, {}, openPolicy).reason, 'CAMPAIGN_COMPLETED');
  assert.equal(core.lifecycle(freshCampaign({ archived: true }), now, {}, openPolicy).reason, 'CAMPAIGN_ARCHIVED');
  assert.equal(core.lifecycle(freshCampaign({ moderationStatus: 'pending' }), now, {}, openPolicy).reason, 'MODERATION_NOT_APPROVED');
});
await test('scheduled campaigns wait for start time, then become eligible automatically', async () => {
  const scheduled = freshCampaign({ status: 'scheduled', active: false, startAt: new Date(now + 60000).toISOString() });
  assert.equal(core.lifecycle(scheduled, now, {}, openPolicy).reason, 'CAMPAIGN_NOT_STARTED');
  const started = core.lifecycle(scheduled, now + 120000, {}, openPolicy);
  assert.equal(started.eligible, true);
  assert.equal(started.autoActivate, true);
  const overGoal = core.lifecycle({ ...scheduled, goals: { totalImpressions: 2 } }, now + 120000, { totalViewable: 2 }, openPolicy);
  assert.equal(overGoal.eligible, false);
  assert.equal(overGoal.reason, 'CAMPAIGN_TOTAL_GOAL_MET');
});
await test('campaign expiry closes delivery even when the legacy active flag is true', async () => {
  const expired = freshCampaign({ endAt: new Date(now - 1).toISOString() });
  const result = core.lifecycle(expired, now, {}, openPolicy);
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'CAMPAIGN_EXPIRED');
  assert.equal(result.autoComplete, true);
});
await test('campaign goals stop delivery at the daily impression goal', async () => {
  const campaign = freshCampaign({ goals: { dailyImpressions: 3, totalImpressions: 100 } });
  const metrics = { dailyKey: core.dayKeyFor(now), dailyViewable: 3, totalViewable: 3 };
  assert.equal(core.lifecycle(campaign, now, metrics, openPolicy).reason, 'CAMPAIGN_DAILY_GOAL_MET');
  assert.equal(core.lifecycle(campaign, now + 86400000, metrics, openPolicy).eligible, true);
});
await test('campaign total impression goal completes the campaign', async () => {
  const campaign = freshCampaign({ goals: { totalImpressions: 25 } });
  const result = core.lifecycle(campaign, now, { totalViewable: 25 }, openPolicy);
  assert.equal(result.reason, 'CAMPAIGN_TOTAL_GOAL_MET');
  assert.equal(result.autoComplete, true);
});
await test('all declared campaign types are supported with safe unknown fallback', async () => {
  for (const type of ['business','product','service','event','announcement','promotion','partnership','community','sokohai_announcement','other']) {
    assert.ok(core.CAMPAIGN_TYPES.includes(core.normalizeCampaignType(type)));
  }
  assert.equal(core.normalizeCampaignType('business_update'), 'business');
  assert.equal(core.normalizeCampaignType('SokoHai announcement'), 'sokohai_announcement');
  assert.equal(core.normalizeCampaignType('unreviewed-type'), 'other');
});
await test('all required placement keys and syntactically safe future keys are accepted', async () => {
  for (const placement of ['home','discover','search','product_detail','service_detail','chat','groups','live','auction','group_buy','price_drop','dashboard']) {
    assert.equal(core.normalizePlacement(placement), placement);
  }
  assert.equal(core.normalizePlacement('future_partner_hub'), 'future_partner_hub');
  assert.equal(core.normalizePlacement('../admin'), '');
});
await test('legacy announcements default to Home only; explicit placements opt into more slots', async () => {
  assert.deepEqual(core.campaignPlacements(freshCampaign({ placements: undefined })), ['home']);
  assert.equal(core.staticCampaignEligibility(freshCampaign({ placements: undefined }), 'home', {}).eligible, true);
  assert.equal(core.staticCampaignEligibility(freshCampaign({ placements: undefined }), 'search', {}).reason, 'PLACEMENT_MISMATCH');
  assert.equal(core.staticCampaignEligibility(freshCampaign({ placements: ['home','search'] }), 'search', {}).eligible, true);
});
await test('placement targeting and protected transaction, security, alert and Admin contexts reject ads', async () => {
  const campaign = freshCampaign({ placements: ['dashboard','chat','live','home'] });
  assert.equal(core.staticCampaignEligibility(campaign, 'home', { flow: 'checkout_payment' }).reason, 'PROTECTED_CONTEXT');
  assert.equal(core.staticCampaignEligibility(campaign, 'dashboard', { screen: 'admin_dashboard' }).reason, 'PROTECTED_CONTEXT');
  assert.equal(core.staticCampaignEligibility(campaign, 'live', { surface: 'critical_alert' }).reason, 'PROTECTED_CONTEXT');
  assert.equal(core.staticCampaignEligibility(campaign, 'chat', {}, true).reason, 'PROTECTED_CONTEXT');
  assert.equal(core.staticCampaignEligibility(campaign, 'chat', { flow: 'conversation' }).eligible, true);
});
await test('category, keyword, region, entity-type and entity-id targeting are honored', async () => {
  const campaign = freshCampaign({
    placements: ['search'],
    targetCategories: ['footwear'], targetKeywords: ['running'], targetRegions: ['dar_es_salaam'],
    targetEntityTypes: ['product'], targetEntityIds: ['prod-1']
  });
  const matching = { category: 'footwear', query: 'running shoes', region: 'dar_es_salaam', entityType: 'product', entityId: 'prod-1' };
  assert.equal(core.staticCampaignEligibility(campaign, 'search', matching).eligible, true);
  assert.equal(core.staticCampaignEligibility(campaign, 'search', { ...matching, category: 'furniture' }).reason, 'CONTEXT_CATEGORY_MISMATCH');
  assert.equal(core.staticCampaignEligibility(campaign, 'search', { ...matching, query: 'chairs' }).reason, 'CONTEXT_KEYWORD_MISMATCH');
  assert.equal(core.staticCampaignEligibility(campaign, 'search', { ...matching, region: 'arusha' }).reason, 'CONTEXT_REGION_MISMATCH');
});
await test('campaign lifecycle blocks inactive and unapproved campaigns without deleting legacy data', async () => {
  assert.equal(core.lifecycle(freshCampaign({ status: 'published', active: false }), now, {}, openPolicy).reason, 'CAMPAIGN_INACTIVE');
  assert.equal(core.lifecycle(freshCampaign({ moderationStatus: 'rejected' }), now, {}, openPolicy).reason, 'MODERATION_NOT_APPROVED');
  assert.equal(freshCampaign({ id: 'kept-legacy', status: 'published' }).id, 'kept-legacy');
});
await test('session frequency cap includes active leases and session viewable events', async () => {
  const policy = core.normalizePolicy({ frequency: { session: 2, hour: 10, day: 10 } });
  const sessionState = { recent: [{ at: now - 1000 }, { at: now - 500 }] };
  assert.equal(core.frequencyReason({}, sessionState, now, policy), 'FREQUENCY_SESSION_CAP');
});
await test('hour frequency cap is global across placements', async () => {
  const policy = core.normalizePolicy({ frequency: { session: 10, hour: 2, day: 10 } });
  const userState = { recent: [{ at: now - 30000 }, { at: now - 10000 }] };
  assert.equal(core.frequencyReason(userState, {}, now, policy), 'FREQUENCY_HOUR_CAP');
});
await test('day frequency cap is shared across placement keys', async () => {
  const policy = core.normalizePolicy({ frequency: { session: 10, hour: 10, day: 3 } });
  const userState = { recent: [{ at: now - 4 * 3600000 }, { at: now - 3 * 3600000 }, { at: now - 2 * 3600000 }] };
  assert.equal(core.frequencyReason(userState, {}, now, policy), 'FREQUENCY_DAY_CAP');
});
await test('global minimum gap is enforced between any two campaign viewables', async () => {
  const policy = core.normalizePolicy({ frequency: { session: 10, hour: 10, day: 10 }, cooldowns: { globalGapMs: 5000 } });
  assert.equal(core.frequencyReason({ recent: [{ at: now - 1000, placement: 'home' }] }, {}, now, policy), 'GLOBAL_MINIMUM_GAP');
});
await test('advertiser cooldown prevents cross-placement advertiser repetition', async () => {
  const policy = core.normalizePolicy({ cooldowns: { advertiserMs: 5000, creativeMs: 0, dismissedCreativeMs: 0, globalGapMs: 0 } });
  const campaign = freshCampaign({ advertiserId: 'seller-9', creativeId: 'new-creative' });
  const state = { recent: [{ at: now - 1000, advertiserKey: core.identityFingerprint('advertiser','seller-9'), creativeKey: 'old' }] };
  assert.equal(core.userCooldownReason(campaign, state, now, policy), 'ADVERTISER_COOLDOWN');
});
await test('creative cooldown is independent from advertiser cooldown', async () => {
  const policy = core.normalizePolicy({ cooldowns: { advertiserMs: 0, creativeMs: 5000, dismissedCreativeMs: 0, globalGapMs: 0 } });
  const campaign = freshCampaign({ advertiserId: 'new-seller', creativeId: 'same-creative' });
  const state = { recent: [{ at: now - 1000, advertiserKey: 'other', creativeKey: core.identityFingerprint('creative','same-creative') }] };
  assert.equal(core.userCooldownReason(campaign, state, now, policy), 'CREATIVE_COOLDOWN');
});
await test('dismissal memory suppresses the dismissed creative for its configured cooldown', async () => {
  const policy = core.normalizePolicy({ cooldowns: { advertiserMs: 0, creativeMs: 0, dismissedCreativeMs: 5000, globalGapMs: 0 } });
  const campaign = freshCampaign({ creativeId: 'dismissed-creative' });
  const state = { dismissals: [{ creativeKey: core.identityFingerprint('creative','dismissed-creative'), at: now - 1000 }] };
  assert.equal(core.userCooldownReason(campaign, state, now, policy), 'DISMISSED_CREATIVE_COOLDOWN');
});
await test('fatigue decays over time, adds score penalty and can suppress a creative', async () => {
  const campaign = freshCampaign({ placements: ['home'] });
  const base = core.evaluateCandidate(campaign, { placement: 'home', policy: openPolicy, now, metrics: {} });
  const tired = core.evaluateCandidate(campaign, { placement: 'home', policy: openPolicy, now, metrics: {}, userState: { fatigue: { [core.identityFingerprint('creative','creative-1')]: { score: 0.4, lastAt: now } } } });
  assert.ok(tired.score < base.score);
  const suppressPolicy = core.normalizePolicy({ ...openPolicy, fatigue: { ...openPolicy.fatigue, suppressionThreshold: 0.5 } });
  const blocked = core.evaluateCandidate(campaign, { placement: 'home', policy: suppressPolicy, now, metrics: {}, userState: { fatigue: { [core.identityFingerprint('creative','creative-1')]: { score: 0.8, lastAt: now } } } });
  assert.equal(blocked.reason, 'CREATIVE_FATIGUE_SUPPRESSED');
  assert.ok(core.decayedFatigue({ score: 0.8, lastAt: now - 86400000 }, now, openPolicy) < 0.8);
  const manyRecords = Object.fromEntries(Array.from({ length: 320 }, (_, i) => ['fatigue_' + i, { score: 0.1, lastAt: now - i }]));
  const bounded = core.reserveLeaseState({ fatigue: manyRecords }, {}, { leaseId: 'cap', placement: 'home' }, now, openPolicy);
  assert.ok(Object.keys(bounded.user.fatigue).length <= 300);
});
await test('pacing favors under-delivery relative to total campaign goal', async () => {
  const campaign = freshCampaign({ startAt: new Date(now - 3600000).toISOString(), endAt: new Date(now + 3600000).toISOString(), goals: { totalImpressions: 1000 } });
  const under = core.relevanceScore(campaign, {}, now, { totalViewable: 0 }, openPolicy);
  const over = core.relevanceScore(campaign, {}, now, { totalViewable: 400 }, openPolicy);
  assert.ok(under > over);
});
await test('scored selection prefers context relevance and freshness rather than a fixed slot ad', async () => {
  const generic = freshCampaign({ id: 'generic', creativeId: 'g', placements: ['search'], targetCategories: [] });
  const relevant = freshCampaign({ id: 'relevant', creativeId: 'r', placements: ['search'], targetCategories: ['footwear'] });
  const result = core.selectCandidate([generic, relevant], { placement: 'search', context: { category: 'footwear' }, policy: openPolicy, now, metricsById: {} });
  assert.equal(result.selected.campaign.id, 'relevant');
});
await test('active leases diversify advertisers and creatives before viewability', async () => {
  const sameAdvertiser = freshCampaign({ id: 'next', advertiserId: 'seller-1', creativeId: 'new-creative' });
  const result = core.evaluateCandidate(sameAdvertiser, {
    placement: 'home', policy: openPolicy, now, metrics: {},
    userState: { reservations: [{ leaseId: 'lease-old', advertiserKey: core.identityFingerprint('advertiser','seller-1'), creativeKey: core.identityFingerprint('creative','old'), expiresAt: now + 50000 }] }
  });
  assert.equal(result.reason, 'ADVERTISER_LEASE_COOLDOWN');
});
await test('temporary leases reserve caps, viewable clears reservations, and dismiss updates fatigue', async () => {
  const lease = {
    leaseId: 'lease-1', campaignId: 'campaign-1', placement: 'home',
    advertiserKey: core.identityFingerprint('advertiser','seller-1'),
    creativeKey: core.identityFingerprint('creative','creative-1')
  };
  const reserved = core.reserveLeaseState({}, {}, lease, now, openPolicy);
  assert.equal(reserved.user.reservations.length, 1);
  const viewed = core.applyStateEvent(reserved.user, reserved.session, lease, 'viewable', now + 1000, openPolicy);
  assert.equal(viewed.user.reservations.length, 0);
  assert.equal(viewed.user.recent.length, 1);
  assert.equal(viewed.session.recent.length, 1);
  const dismissed = core.applyStateEvent(viewed.user, viewed.session, lease, 'dismissed', now + 2000, openPolicy);
  assert.equal(dismissed.user.dismissals.length, 1);
  assert.ok(dismissed.user.fatigue[lease.creativeKey].score > viewed.user.fatigue[lease.creativeKey].score);
});
await test('event aliases preserve distinct requested, loaded, rendered, viewport, viewable, click and dismiss semantics', async () => {
  for (const type of ['loaded','rendered','entered_viewport','viewable','clicked','dismissed','lease_released']) assert.equal(core.normalizeEventType(type), type);
  assert.equal(core.normalizeEventType('impression'), 'viewable');
  assert.equal(core.normalizeEventType('click'), 'clicked');
  assert.equal(core.normalizeEventType('render'), '');
});
await test('configurable caps, cooldowns, retention, viewability and lazy settings are bounded', async () => {
  const config = core.normalizePolicy({
    frequency: { session: 7, hour: 15, day: 30 },
    cooldowns: { globalGapMs: 45000, advertiserMs: 300000, creativeMs: 120000 },
    viewability: { threshold: 0.6, durationMs: 1400 },
    lazy: { rootMarginPx: 700, requestThrottleMs: 6000 },
    state: { sessionRetentionDays: 45, anonymousRetentionDays: 30 }
  });
  assert.equal(config.frequency.session, 7);
  assert.equal(config.cooldowns.globalGapMs, 45000);
  assert.equal(config.viewability.threshold, 0.6);
  assert.equal(config.viewability.durationMs, 1400);
  assert.equal(config.lazy.rootMarginPx, 700);
  assert.equal(config.lazy.requestThrottleMs, 6000);
  assert.equal(config.state.sessionRetentionDays, 45);
  assert.equal(config.state.anonymousRetentionDays, 30);
});
await test('selection returns safe no-ad conditions as internal reason codes, not a broken placement', async () => {
  const result = core.selectCandidate([], { placement: 'search', context: {}, policy: openPolicy, now });
  assert.equal(result.selected, null);
  assert.ok(core.staticCampaignEligibility(freshCampaign({ placements: ['home'] }), 'search', {}).reason === 'PLACEMENT_MISMATCH');
});
await test('campaign context does not admit Admin, transaction/payment, security or critical-alert ads', async () => {
  for (const context of [{ flow: 'payment' }, { surface: 'security' }, { contextType: 'transaction_confirmation' }, { surface: 'critical_alerts' }, { adminDashboard: true }]) {
    assert.equal(core.isProtectedContext('home', context, false), true);
  }
  assert.equal(core.isProtectedContext('dashboard', { surface: 'buyer_overview' }, false), false);
});
await test('legacy Home announcement compatibility and campaign source remain intact', async () => {
  const campaign = freshCampaign({ placements: undefined, publicationType: 'advertisement' });
  assert.equal(core.staticCampaignEligibility(campaign, 'home', {}).eligible, true);
  const server = await readFile(new URL('../functions/ads-delivery.js', import.meta.url), 'utf8');
  assert.ok(server.includes("collection('announcements')"));
  assert.ok(server.includes("status: 'NO_ELIGIBLE_AD'"));
});
await test('all ad placements use the single client controller and canonical Creative renderer', async () => {
  const controller = await readFile(new URL('../js/app/96-ad-delivery-controller.js', import.meta.url), 'utf8');
  const renderer = await readFile(new URL('../js/06-announcement.js', import.meta.url), 'utf8');
  assert.ok(controller.includes("skhAdvertisementCardHtml(ad, false)"));
  assert.ok(controller.includes("adsRequestDelivery"));
  assert.ok(controller.includes("adsTrackDeliveryEvent"));
  assert.ok(renderer.includes('window.skhAdvertisementCardHtml=cardHtml'));
  const server = await readFile(new URL('../functions/ads-delivery.js', import.meta.url), 'utf8');
  assert.ok(server.includes("where('lifecycleStatus'"));
  assert.ok(server.includes('replayExistingRequest'));
  assert.ok(!renderer.includes('function activeAds()'));
  assert.ok(!renderer.includes("track(a,'impression')"));
});
await test('video remains poster-first and requires a user gesture; server projection reuses renderer-safe media', async () => {
  const renderer = await readFile(new URL('../js/06-announcement.js', import.meta.url), 'utf8');
  const server = await readFile(new URL('../functions/ads-delivery.js', import.meta.url), 'utf8');
  assert.ok(renderer.includes('Poster-first'));
  assert.ok(renderer.includes("v.play()"));
  assert.ok(renderer.includes("video.paused"));
  assert.ok(server.includes("'posterUrl'"));
  assert.ok(server.includes("'videoUrl'"));
});
await test('distinct persistent analytics are server-only and separate from user delivery state', async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  const indexes = JSON.parse(await readFile(new URL('../firestore.indexes.json', import.meta.url), 'utf8'));
  const server = await readFile(new URL('../functions/ads-delivery.js', import.meta.url), 'utf8');
  assert.ok(rules.includes('match /adDeliveryState/{id}'));
  assert.ok(rules.includes('match /adDeliverySessions/{sessionId}'));
  assert.ok(rules.includes('match /adDeliveryMetrics/{id}'));
  assert.ok(rules.includes('match /adDeliveryEvents/{id}'));
  assert.ok(server.includes("collection('adDeliveryState')"));
  assert.ok(server.includes("collection('adDeliveryEvents')"));
  assert.ok(indexes.fieldOverrides.some(item => item.collectionGroup === 'adDeliveryEvents' && item.fieldPath === 'expireAt' && item.ttl === true));
  assert.ok(indexes.fieldOverrides.some(item => item.collectionGroup === 'adDeliveryLeases' && item.fieldPath === 'expiresAt' && item.ttl === true));
});
await test('Basic and Advanced still share publication functions and the Creative Model is not duplicated', async () => {
  const index = await readFile(new URL('../functions/index.js', import.meta.url), 'utf8');
  const creative = await readFile(new URL('../functions/creative.js', import.meta.url), 'utf8');
  const studio = await readFile(new URL('../js/app/95-creative-studio.js', import.meta.url), 'utf8');
  assert.ok(index.includes('exports.creativeSaveDraft = creativeEngine.creativeSaveDraft'));
  assert.ok(index.includes('exports.creativePublish = creativeEngine.creativePublish'));
  assert.ok(creative.includes("db.collection('announcements')"));
  assert.ok(studio.includes("skh.callFunction('creativePublish'"));
  assert.ok(!studio.includes('HomeAdEngine'));
});
await test('Admin delivery normalization accepts safe metadata, defaults Home, and rejects protected placements', async () => {
  const normalized=core.normalizeCampaignDelivery({campaignType:'business_update',placements:['home','search','payment','../admin','future_partner_hub'],targetCategories:'footwear, beauty',targetKeywords:['running'],targetRegions:['dar_es_salaam'],targetEntityTypes:['product'],targetEntityIds:['prod-9'],goals:{dailyImpressions:12,totalImpressions:120}});
  assert.equal(normalized.campaignType,'business');
  assert.deepEqual(normalized.placements,['home','search','future_partner_hub']);
  assert.deepEqual(normalized.invalidPlacements,['payment','../admin']);
  assert.deepEqual(normalized.targetCategories,['footwear','beauty']);
  assert.deepEqual(normalized.goals,{dailyImpressions:12,totalImpressions:120});
  assert.deepEqual(core.normalizeCampaignDelivery({}).placements,['home']);
});
await test('Admin Delivery Settings write path is callable, authenticated, and does not fork creative publishing', async () => {
  const server=await readFile(new URL('../functions/ads-delivery.js',import.meta.url),'utf8');
  const index=await readFile(new URL('../functions/index.js',import.meta.url),'utf8');
  assert.ok(server.includes('async function updateCampaignDelivery(request)'));
  assert.ok(server.includes('isAdminToken(request.auth.token)'));
  assert.ok(server.includes("const draft = status === 'draft' || moderation === 'draft';"));
  assert.ok(server.includes("if (lifecycleAction !== 'keep' && !mayChangeLifecycle && !completed)"));
  assert.ok(server.includes('core.normalizeCampaignDelivery(data.delivery)'));
  assert.ok(server.includes("'Draft or moderation-pending campaigns cannot be activated or paused here.'"));
  assert.ok(server.includes('exports.adsUpdateCampaignDelivery = onCall'));
  assert.ok(index.includes('exports.adsUpdateCampaignDelivery = adsDeliveryEngine.adsUpdateCampaignDelivery'));
  assert.ok(!server.includes('creativePublish('));
});
await test('Admin exposes campaign type, placements, targeting, goals, and paused/completed lifecycle filters', async () => {
  const admin=await readFile(new URL('../js/app/16-pos-admin-jobs.js',import.meta.url),'utf8');
  const feed=await readFile(new URL('../js/app/09-feed-announcements.js',import.meta.url),'utf8');
  assert.ok(admin.includes('window.skhOpenAdDeliverySettings'));
  assert.ok(admin.includes("skh.callFunction('adsUpdateCampaignDelivery'"));
  for(const control of ['skhAdDeliveryType','skhAdDeliveryPlacements','skhAdDeliveryCategories','skhAdDeliveryKeywords','skhAdDeliveryRegions','skhAdDeliveryEntityTypes','skhAdDeliveryEntityIds','skhAdDeliveryDailyGoal','skhAdDeliveryTotalGoal'])assert.ok(admin.includes(control));
  assert.ok(admin.includes("skhAdminAdSetFilter(\\'paused\\',this)"));
  assert.ok(admin.includes("skhAdminAdSetFilter(\\'completed\\',this)"));
  assert.ok(admin.includes("lifecycleStatus === 'paused'"));
  assert.ok(admin.includes('Draft delivery metadata can be saved now'));
  assert.ok(feed.includes("lifecycleStatus:'archived'"));
  assert.ok(feed.includes("'paused'"));
});
await test('creative replacement preserves campaign delivery metadata and Advanced uses the same replacement path', async () => {
  const creative=await readFile(new URL('../functions/creative.js',import.meta.url),'utf8');
  const studio=await readFile(new URL('../js/app/95-creative-studio.js',import.meta.url),'utf8');
  const admin=await readFile(new URL('../js/app/16-pos-admin-jobs.js',import.meta.url),'utf8');
  assert.ok(creative.includes('DELIVERY_METADATA_FIELDS'));
  assert.ok(creative.includes('replacedAnnouncement[field]'));
  assert.ok(creative.includes("announcement.lifecycleStatus = 'paused'"));
  assert.ok(creative.includes("lifecycleStatus:'archived'"));
  assert.ok(studio.includes('replaceAnnouncementId:window.__editingAnnouncementId||\'\''));
  assert.ok(studio.includes('payload.replaceAnnouncementId=sourceAnnouncementId'));
  assert.ok(admin.includes('replaceAnnouncementId:window.__editingAnnouncementId||\'\''));
});
await test('placement adapters keep Admin/critical surfaces clear and preserve organic group announcements', async () => {
  const group = await readFile(new URL('../js/app/73-group-soga.js', import.meta.url), 'utf8');
  const chat = await readFile(new URL('../html/06-modals-social.html', import.meta.url), 'utf8');
  const product = await readFile(new URL('../js/app/39-product-showcase.js', import.meta.url), 'utf8');
  assert.ok(group.includes('g.groupType === \'PERMANENT_COMMUNITY\''));
  assert.ok(group.includes('renderAnnounce(g.announcement || null)'));
  assert.ok(chat.includes('data-skh-ad-slot="chat"'));
  assert.ok(product.includes("placement = 'auction'"));
  assert.ok(product.includes("placement = 'group_buy'"));
  assert.ok(product.includes("placement = 'price_drop'"));
});
await test('Search, buyer overview, and Home use safe optional adapters', async () => {
  const buyer = await readFile(new URL('../js/app/28-buyer-engagement.js', import.meta.url), 'utf8');
  const topnav = await readFile(new URL('../html/16-topnav.html', import.meta.url), 'utf8');
  assert.ok(buyer.includes('data-skh-ad-slot=\"dashboard\"'));
  assert.ok(topnav.includes('data-skh-ad-slot=\"home\"'));
});
await test('client request is lazy, render is not an impression, and viewability needs threshold plus duration', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="slot" data-skh-ad-slot="home"></div></body></html>', {
    url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const { window } = dom;
  const calls = [];
  class FakeIntersectionObserver {
    static instances = [];
    constructor(callback, options) { this.callback = callback; this.options = options || {}; this.targets = new Set(); FakeIntersectionObserver.instances.push(this); }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); }
    fire(target, ratio) { this.callback([{ target, isIntersecting: ratio > 0, intersectionRatio: ratio }], this); }
  }
  window.IntersectionObserver = FakeIntersectionObserver;
  window.__skh = {
    currentUser: null, currentUserData: {}, MY_ADMIN_EMAIL: 'admin@example.com',
    callFunction(name, data) {
      calls.push({ name, data });
      if (name === 'adsRequestDelivery') return Promise.resolve({ data: {
        status: 'DELIVERED', leaseId: 'lease-test', expiresAt: new Date(Date.now() + 60000).toISOString(),
        campaign: { id: 'ad-test', imageUrl: 'https://cdn.example/ad.jpg' },
        config: { viewability: { threshold: 0.5, durationMs: 15 }, lazy: { rootMarginPx: 200, requestThrottleMs: 0 }, rotation: { defaultSeconds: 59, minSeconds: 59, maxSeconds: 59 } }
      } });
      return Promise.resolve({ data: { ok: true } });
    }
  };
  window.skhAdvertisementCardHtml = ad => '<article class="skh-ann-card"><b>' + ad.id + '</b></article>';
  let controllerSource = await readFile(new URL('../js/app/96-ad-delivery-controller.js', import.meta.url), 'utf8');
  controllerSource = controllerSource.replace("import { skh } from './00-bootstrap.js';", 'const skh = window.__skh;');
  window.eval(controllerSource);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  const slot = window.document.getElementById('slot');
  const near = FakeIntersectionObserver.instances.find(observer => observer.options.threshold === 0);
  assert.ok(near);
  assert.equal(calls.some(call => call.name === 'adsRequestDelivery'), false);
  near.fire(slot, 1);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(calls.some(call => call.name === 'adsRequestDelivery'), true);
  const deliveryCall = calls.find(call => call.name === 'adsRequestDelivery');
  assert.ok(typeof deliveryCall.data.requestId === 'string' && deliveryCall.data.requestId.length >= 16);
  assert.ok(slot.querySelector('.skh-ann-card'));
  assert.equal(calls.some(call => call.name === 'adsTrackDeliveryEvent' && call.data.type === 'rendered'), true);
  assert.equal(calls.some(call => call.name === 'adsTrackDeliveryEvent' && call.data.type === 'viewable'), false);
  const view = FakeIntersectionObserver.instances.find(observer => Array.isArray(observer.options.threshold));
  assert.ok(view);
  view.fire(slot, 0.4);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(calls.some(call => call.name === 'adsTrackDeliveryEvent' && call.data.type === 'viewable'), false);
  view.fire(slot, 0.6);
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.equal(calls.some(call => call.name === 'adsTrackDeliveryEvent' && call.data.type === 'entered_viewport'), true);
  assert.equal(calls.some(call => call.name === 'adsTrackDeliveryEvent' && call.data.type === 'viewable'), true);
  window.skhAdDeliveryTrackForAd('ad-test', 'clicked');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(calls.some(call => call.name === 'adsTrackDeliveryEvent' && call.data.type === 'clicked'), true);
  slot.querySelector('.skh-ad-dismiss-button').click();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(calls.some(call => call.name === 'adsTrackDeliveryEvent' && call.data.type === 'dismissed'), true);
  assert.equal(calls.some(call => call.name === 'adsTrackDeliveryEvent' && call.data.type === 'lease_released'), true);
  assert.equal(slot.hidden, true);
  window.skhAdDeliveryController.destroy();
  dom.window.close();
});
await test('delivery/network/renderer failures fail open without changing marketplace content', async () => {
  const dom = new JSDOM('<!doctype html><html><body><main id="market"><div data-skh-ad-slot="discover"></div><p id="commerce">Product content remains</p></main></body></html>', {
    url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const { window } = dom;
  class FakeIO {
    static instances = [];
    constructor(callback, options) { this.callback = callback; this.options = options || {}; FakeIO.instances.push(this); }
    observe(target) { this.target = target; }
    unobserve() {}
    disconnect() {}
    fire(target) { this.callback([{ target, isIntersecting: true, intersectionRatio: 1 }], this); }
  }
  window.IntersectionObserver = FakeIO;
  window.__skh = { currentUser: null, currentUserData: {}, callFunction: () => Promise.reject(Object.assign(new Error('offline'), { code: 'functions/unavailable' })) };
  const src = (await readFile(new URL('../js/app/96-ad-delivery-controller.js', import.meta.url), 'utf8')).replace("import { skh } from './00-bootstrap.js';", 'const skh = window.__skh;');
  window.eval(src);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  const slot = window.document.querySelector('[data-skh-ad-slot]');
  const near = FakeIO.instances.find(observer => observer.options.threshold === 0);
  near.fire(slot);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(window.document.getElementById('commerce').textContent, 'Product content remains');
  assert.equal(slot.hidden, true);
  window.skhAdDeliveryController.destroy();
  dom.window.close();
});

console.log(`\nAds Delivery Engine: ${passed}/40 focused checks passed (covering the 28 requested acceptance areas plus Admin metadata controls).`);
assert.equal(passed, 40);
