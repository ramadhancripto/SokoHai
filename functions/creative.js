'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = admin.firestore();
const FV = admin.firestore.FieldValue;
const REGION = 'europe-west1';
const TYPES = new Set(['advertisement','business_update','product_post','service_post','general_post']);
const ENTITY_COLLECTIONS = { product:'products', service:'services', transport:'delivery', seller:'publicProfiles', business:'publicProfiles' };
const DELIVERY_METADATA_FIELDS = [
  'campaignType','placements','targetCategories','targetKeywords','targetRegions',
  'targetEntityTypes','targetEntityIds','goals'
];
const packagedRules = path.join(__dirname, 'shared', 'ads-design-rules.js');
const localRules = path.join(__dirname, '..', 'shared', 'ads-design-rules.js');
const ADS_RULES = require(fs.existsSync(packagedRules) ? packagedRules : localRules);

function isAdmin(token) {
  return token && (token.admin === true || token.role === 'admin' || String(token.email || '').toLowerCase() === 'rshabansaid@gmail.com');
}
function text(value, max = 240) { return String(value == null ? '' : value).trim().slice(0, max); }
function validateDesign(input, options = {}) {
  const creative = ADS_RULES.normalizeCreative(input || {});
  const validation = ADS_RULES.validateCreative(creative, {
    forPublish: true,
    requireSchedule: options.requireSchedule === true,
    now: Date.now()
  });
  if (!validation.ok) {
    throw new HttpsError('failed-precondition', validation.errors.map(error => error.message).join(' '), {
      errors: validation.errors.map(({ code, layerId, message }) => ({ code, layerId: layerId || null, message }))
    });
  }
  return creative;
}
function projectAnnouncement(creative, entity = {}, status = 'draft') {
  const link = entity.type === 'custom' ? entity.externalUrl : entity.type && entity.id ? '#' + entity.type + '-' + entity.id : '';
  const projected = ADS_RULES.creativeToAdvertisement(creative, {
    brandName:entity.name || (creative.brandKit && creative.brandKit.name) || 'SokoHai',
    image:entity.image || '',
    link,
    status
  });
  const headlineLayer = creative.layers.find(layer => layer && layer.role === 'headline' && layer.type === 'text');
  return {
    ...projected,
    headline:projected.headline || text(headlineLayer && headlineLayer.content, 120) || text(creative.title, 160),
    brandName:projected.brandName || entity.name || 'SokoHai',
    image:projected.image || '',
    imageUrl:projected.imageUrl || '',
    link:projected.link || link,
    status
  };
}

async function canonicalEntity(linked, destination, uid, adminUser, creative) {
  if (!linked || !linked.type || !linked.id) {
    if (destination && destination.type === 'external' && /^https:\/\//i.test(String(destination.url || ''))) {
      return { id:'custom_' + uid, type:'custom', name:text(creative.title, 160) || 'Advertisement', image:'', price:null, location:'', ownerId:uid, externalUrl:text(destination.url, 1000) };
    }
    throw new HttpsError('failed-precondition', 'Choose a linked SokoHai entity or valid HTTPS destination.');
  }
  const collection = ENTITY_COLLECTIONS[linked.type];
  if (!collection) throw new HttpsError('invalid-argument', 'Unsupported linked entity type.');
  const snap = await db.collection(collection).doc(String(linked.id)).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Linked destination no longer exists.');
  const data = snap.data() || {};
  const owners = [data.ownerId, data.sellerId, data.userId, data.uid, data.providerId, data.driverId, snap.id].filter(Boolean).map(String);
  if (!adminUser && !owners.includes(uid)) throw new HttpsError('permission-denied', 'You are not authorized to advertise this entity.');
  return {
    id:snap.id,
    type:linked.type,
    name:text(data.title || data.name || data.serviceName || data.company || data.driverName, 160),
    image:text(data.imageUrl || data.image || data.photo || data.logoUrl || (Array.isArray(data.images) && data.images[0]), 1000),
    price:Number.isFinite(Number(data.price || data.currentPrice || data.servicePrice)) ? Number(data.price || data.currentPrice || data.servicePrice) : null,
    location:text(data.location || data.region || data.serviceArea || data.pickupRegion, 160),
    ownerId:owners[0] || uid
  };
}

exports.creativeSaveDraft = onCall({ region:REGION, enforceAppCheck:false }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in before saving a Creative draft.');
  const uid = request.auth.uid;
  const adminUser = isAdmin(request.auth.token);
  const id = text(request.data && request.data.creativeId, 128);
  const sourceAnnouncementId = text(request.data && request.data.announcementId, 128);
  if (!id) throw new HttpsError('invalid-argument', 'creativeId is required.');
  const creativeRef = db.collection('creatives').doc(id);
  const creativeSnap = await creativeRef.get();
  if (!creativeSnap.exists) throw new HttpsError('not-found', 'Creative not found.');
  const creative = ADS_RULES.normalizeCreative(creativeSnap.data() || {});
  if (creative.ownerId !== uid && !adminUser) throw new HttpsError('permission-denied', 'This Creative belongs to another advertiser.');
  const createdAt = FV.serverTimestamp();
  const announcementRef = sourceAnnouncementId ? db.collection('announcements').doc(sourceAnnouncementId) : null;
  let updateDraft = false;
  let source = null;
  if (announcementRef) {
    const sourceSnap = await announcementRef.get();
    if (sourceSnap.exists) {
      source = sourceSnap.data() || {};
      const owners = [source.advertiserId, source.ownerId, source.userId].filter(Boolean).map(String);
      if (!adminUser && !owners.includes(uid)) throw new HttpsError('permission-denied', 'You are not authorized to save this announcement draft.');
      updateDraft = source.status === 'draft' && source.archived !== true;
    }
  }
  const targetRef = updateDraft ? announcementRef : db.collection('announcements').doc();
  const projected = projectAnnouncement(creative, {}, 'draft');
  const payload = {
    ...projected,
    advertiserId:creative.ownerId || uid,
    creativeId:id,
    creativeVersion:Math.max(0, Number(creative.publishedVersion) || 0),
    publicationType:'advertisement',
    entityType:creative.linkedEntity && creative.linkedEntity.type || creative.destination && creative.destination.type || '',
    entityId:creative.linkedEntity && creative.linkedEntity.id || creative.destination && creative.destination.id || '',
    linkedEntity:creative.linkedEntity || null,
    destination:creative.destination || null,
    moderationStatus:'draft',
    active:false,
    archived:false,
    priority:Math.max(0, Number(creative.priority) || 0),
    updatedAt:createdAt
  };
  if (!updateDraft) {
    payload.createdAt = createdAt;
    if (sourceAnnouncementId) payload.draftSourceAnnouncementId = sourceAnnouncementId;
  }
  const batch = db.batch();
  if (updateDraft) batch.set(targetRef, payload, { merge:true });
  else batch.create(targetRef, payload);
  await batch.commit();
  return { ok:true, creativeId:id, announcementId:targetRef.id, status:'draft' };
});

exports.creativePublish = onCall({ region:REGION, enforceAppCheck:false }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in before publishing.');
  const uid = request.auth.uid;
  const adminUser = isAdmin(request.auth.token);
  const id = text(request.data && request.data.creativeId, 128);
  const publicationType = text(request.data && request.data.publicationType, 40) || 'advertisement';
  const action = text(request.data && request.data.action, 20) === 'schedule' ? 'schedule' : 'publish';
  const replaceAnnouncementId = text(request.data && request.data.replaceAnnouncementId, 128);
  if (!id) throw new HttpsError('invalid-argument', 'creativeId is required.');
  if (!TYPES.has(publicationType)) throw new HttpsError('invalid-argument', 'Unsupported publication type.');

  const creativeRef = db.collection('creatives').doc(id);
  const creativeSnap = await creativeRef.get();
  if (!creativeSnap.exists) throw new HttpsError('not-found', 'Creative not found.');
  const storedCreative = creativeSnap.data() || {};
  if (storedCreative.ownerId !== uid && !adminUser) throw new HttpsError('permission-denied', 'This Creative belongs to another advertiser.');
  const creative = validateDesign(storedCreative, { requireSchedule: action === 'schedule' });
  const entity = await canonicalEntity(creative.linkedEntity, creative.destination, uid, adminUser, creative);
  if (entity.type !== 'custom' && (!creative.destination || String(creative.destination.id) !== entity.id)) {
    throw new HttpsError('failed-precondition', 'Creative destination must match its linked entity.');
  }

  let replacedAnnouncementRef = null;
  let replacedAnnouncement = null;
  if (replaceAnnouncementId) {
    if (publicationType !== 'advertisement') throw new HttpsError('invalid-argument', 'Only advertisements can replace an announcement.');
    replacedAnnouncementRef = db.collection('announcements').doc(replaceAnnouncementId);
    const replaced = await replacedAnnouncementRef.get();
    if (!replaced.exists) throw new HttpsError('not-found', 'The announcement being replaced no longer exists.');
    const previous = replaced.data() || {};
    replacedAnnouncement = previous;
    const owners = [previous.advertiserId, previous.ownerId, previous.userId].filter(Boolean).map(String);
    if (!adminUser && !owners.includes(uid)) throw new HttpsError('permission-denied', 'You are not authorized to replace this announcement.');
  }

  const version = Math.max(0, Number(creative.publishedVersion) || 0) + 1;
  const versionId = 'v' + version;
  const createdAt = FV.serverTimestamp();
  const versionRef = creativeRef.collection('versions').doc(versionId);
  const publicationRef = db.collection('creativePublications').doc();
  const moderationStatus = adminUser ? 'approved' : 'pending';
  const creativeStatus = adminUser ? 'PUBLISHED' : 'READY';
  const destinationSnapshot = entity.type === 'custom'
    ? { type:'external', url:entity.externalUrl }
    : { type:entity.type, id:entity.id };
  const frozen = {
    creativeId:id,
    version,
    ownerId:creative.ownerId,
    type:publicationType,
    canvas:creative.canvas,
    background:creative.background,
    layers:creative.layers,
    slideshow:creative.slideshow,
    creativeSnapshot:creative,
    brandSnapshot:creative.brandKit || null,
    linkedEntitySnapshot:entity,
    destinationSnapshot,
    createdBy:uid,
    createdAt,
    immutable:true,
    schemaVersion:creative.schemaVersion || 1
  };
  const batch = db.batch();
  batch.create(versionRef, frozen);
  batch.set(publicationRef, {
    creativeId:id,
    creativeVersion:version,
    versionPath:versionRef.path,
    ownerId:creative.ownerId,
    publicationType,
    linkedEntity:{ type:entity.type, id:entity.id },
    destination:destinationSnapshot,
    status:adminUser ? 'PUBLISHED' : 'PENDING_MODERATION',
    moderationStatus,
    createdAt,
    updatedAt:createdAt
  });
  batch.set(creativeRef, { ...creative, publishedVersion:version, status:creativeStatus, updatedAt:createdAt }, { merge:true });

  let announcementId = null;
  if (publicationType === 'advertisement') {
    const announcementRef = db.collection('announcements').doc();
    announcementId = announcementRef.id;
    const announcement = {
      ...projectAnnouncement(creative, entity, adminUser ? 'published' : 'moderation_pending'),
      creativeId:id,
      creativeVersion:version,
      advertiserId:creative.ownerId,
      publicationId:publicationRef.id,
      publicationType,
      entityType:entity.type,
      entityId:entity.id,
      linkedEntity:{ type:entity.type, id:entity.id },
      destination:destinationSnapshot,
      moderationStatus,
      active:adminUser,
      archived:false,
      priority:Math.max(0, Number(creative.priority) || 0),
      createdAt,
      updatedAt:createdAt,
      viewCount:0,
      clickCount:0
    };
    if (replacedAnnouncement) {
      DELIVERY_METADATA_FIELDS.forEach(field => {
        if (Object.prototype.hasOwnProperty.call(replacedAnnouncement, field)) announcement[field] = replacedAnnouncement[field];
      });
      const oldMillis = value => {
        if (value && typeof value.toMillis === 'function') { try { return value.toMillis(); } catch (_) { return 0; } }
        if (value instanceof Date) return value.getTime();
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        const parsed = Date.parse(String(value || ''));
        return Number.isFinite(parsed) ? parsed : 0;
      };
      const oldStart = oldMillis(replacedAnnouncement.startAt || replacedAnnouncement.startsAt || replacedAnnouncement.scheduledAt);
      const oldEnd = oldMillis(replacedAnnouncement.endAt || replacedAnnouncement.endsAt || replacedAnnouncement.expiresAt);
      const oldLifecycle = String(replacedAnnouncement.lifecycleStatus || '').toLowerCase();
      const oldModeration = String(replacedAnnouncement.moderationStatus || '').toLowerCase();
      const oldCompleted = oldLifecycle === 'completed' || (oldEnd > 0 && oldEnd <= Date.now());
      const wasPaused = !oldCompleted && (oldLifecycle === 'paused'
        || (replacedAnnouncement.active === false && String(replacedAnnouncement.status || '').toLowerCase() === 'published'
          && !(oldStart > Date.now())
          && (!oldModeration || oldModeration === 'approved')));
      if (wasPaused) {
        announcement.lifecycleStatus = 'paused';
        announcement.active = false;
      }
    }
    batch.create(announcementRef, announcement);
    if (replacedAnnouncementRef) {
      batch.update(replacedAnnouncementRef, {
        archived:true,
        archivedAt:createdAt,
        active:false,
        status:'archived',
        lifecycleStatus:'archived',
        replacedByCreativeId:id,
        replacedByVersion:version,
        updatedAt:createdAt
      });
    }
  }

  await batch.commit();
  return {
    ok:true,
    creativeId:id,
    version,
    publicationId:publicationRef.id,
    announcementId,
    status:creativeStatus,
    moderationStatus,
    action
  };
});

exports.creativeTrackEvent = onCall({ region:REGION, enforceAppCheck:false }, async request => {
  const id = text(request.data && request.data.announcementId, 128);
  const type = text(request.data && request.data.type, 20);
  if (!id || !['impression', 'click'].includes(type)) throw new HttpsError('invalid-argument', 'Invalid event.');
  const announcementRef = db.collection('announcements').doc(id);
  const snap = await announcementRef.get();
  if (!snap.exists || snap.data().status !== 'published' || snap.data().archived === true) throw new HttpsError('failed-precondition', 'Advertisement is not active.');
  const ip = text(request.rawRequest && request.rawRequest.ip, 100);
  const bucket = Math.floor(Date.now() / (type === 'impression' ? 3600000 : 60000));
  const key = crypto.createHash('sha256').update(id + '|' + type + '|' + ip + '|' + bucket).digest('hex');
  const eventRef = db.collection('creativeEvents').doc(key);
  await db.runTransaction(async transaction => {
    const event = await transaction.get(eventRef);
    if (event.exists) return;
    transaction.create(eventRef, {
      announcementId:id,
      creativeId:snap.data().creativeId || null,
      creativeVersion:snap.data().creativeVersion || null,
      type,
      createdAt:FV.serverTimestamp(),
      expiresBucket:bucket
    });
    transaction.update(announcementRef, { [type === 'click' ? 'clickCount' : 'viewCount']:FV.increment(1) });
  });
  return { ok:true };
});
