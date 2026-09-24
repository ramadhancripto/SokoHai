/* ==== js/app/96-ad-delivery-controller.js ====
   One client controller for every campaign placement. It owns lazy requests,
   leases, viewport/viewability events, rotation and fail-open DOM behavior.
   Campaign eligibility/frequency policy is server-authoritative in Functions.
*/
import { skh } from './00-bootstrap.js';

(function () {
  'use strict';
  if (window.skhAdDeliveryController) return;

  const records = new Map();
  const DEFAULTS = {
    viewability: { threshold: 0.5, durationMs: 1000 },
    lazy: { rootMarginPx: 400, requestThrottleMs: 5000 },
    rotation: { defaultSeconds: 15, minSeconds: 5, maxSeconds: 59 },
    lease: { ttlMs: 300000 }
  };
  let policy = cloneDefaults();
  let nearObserver = null;
  let viewObserver = null;
  let mutationObserver = null;
  let observerThreshold = null;
  let observerMargin = null;
  let scanQueued = false;
  let disposed = false;
  const SESSION_KEY = 'skh_ad_delivery_session_v1';
  const PROTECTED_ID = /(^|[-_])(admin|checkout|payment|wallet|sokopay|escrow|security|critical)([-_]|$)/i;

  function cloneDefaults() {
    return {
      viewability: Object.assign({}, DEFAULTS.viewability),
      lazy: Object.assign({}, DEFAULTS.lazy),
      rotation: Object.assign({}, DEFAULTS.rotation),
      lease: Object.assign({}, DEFAULTS.lease)
    };
  }
  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }
  function randomToken() {
    try { if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID(); } catch (_) {}
    const bytes = new Uint8Array(24);
    try { window.crypto.getRandomValues(bytes); } catch (_) { for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256); }
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }
  function sessionId() {
    try {
      let value = window.sessionStorage.getItem(SESSION_KEY);
      if (!value || value.length < 16) {
        value = randomToken();
        window.sessionStorage.setItem(SESSION_KEY, value);
      }
      return value;
    } catch (_) { return randomToken(); }
  }
  function unwrap(result) { return result && result.data ? result.data : result; }
  function plain(value) { return value && typeof value === 'object' ? value : {}; }
  function isAdmin() {
    const claims = window.SOKOHAI_CLAIMS || {};
    const user = skh.currentUser || {};
    return claims.isAdmin === true || claims.admin === true || user.admin === true
      || String(user.email || '').toLowerCase() === String(skh.MY_ADMIN_EMAIL || 'rshabansaid@gmail.com').toLowerCase();
  }
  function hiddenByLayout(element) {
    let node = element;
    while (node && node.nodeType === 1) {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return true;
      const style = node.style;
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return true;
      try {
        const computed = window.getComputedStyle && window.getComputedStyle(node);
        if (computed && (computed.display === 'none' || computed.visibility === 'hidden')) return true;
      } catch (_) {}
      node = node.parentElement;
    }
    return false;
  }
  function isProtectedSlot(host, placement, context) {
    if (isAdmin()) return true;
    if (context && (context.protected || context.adminDashboard || context.isAdmin)) return true;
    if (context && [context.surface, context.flow, context.screen, context.contextType].some(value => {
      return /(^|[-_])(admin|checkout|payment|wallet|sokopay|escrow|security|critical|transaction)([-_]|$)/i.test(String(value || ''));
    })) return true;
    let node = host;
    while (node && node.nodeType === 1) {
      if (node.dataset && (node.dataset.skhAdProtected === 'true' || node.dataset.skhAdminDashboard === 'true')) return true;
      if (node.id && PROTECTED_ID.test(node.id)) return true;
      node = node.parentElement;
    }
    if (['payment', 'checkout', 'wallet', 'sokopay', 'escrow', 'security', 'critical_alert'].includes(String(placement || '').toLowerCase())) return true;
    return false;
  }
  function contextOf(host) {
    const d = host.dataset || {};
    let extra = {};
    try { if (d.skhAdContext) extra = JSON.parse(d.skhAdContext); } catch (_) {}
    extra = plain(extra);
    const profile = plain(skh.currentUserData);
    const interests = extra.interests || extra.interestCategories || profile.interests || profile.interestCategories || [];
    return {
      category: d.skhAdCategory || d.adCategory || extra.category || '',
      categories: d.skhAdCategories ? d.skhAdCategories.split(/[;,|]/) : (extra.categories || []),
      query: d.skhAdQuery || extra.query || '',
      region: d.skhAdRegion || extra.region || '',
      entityType: d.skhAdEntityType || extra.entityType || '',
      entityId: d.skhAdEntityId || extra.entityId || '',
      mode: d.skhAdMode || extra.mode || '',
      surface: d.skhAdSurface || extra.surface || '',
      flow: d.skhAdFlow || extra.flow || '',
      screen: d.skhAdScreen || extra.screen || '',
      contextType: d.skhAdContextType || extra.contextType || '',
      protected: d.skhAdProtected === 'true' || extra.protected === true,
      adminDashboard: d.skhAdminDashboard === 'true' || extra.adminDashboard === true,
      isAdmin: extra.isAdmin === true,
      interests: Array.isArray(interests) ? interests.slice(0, 12) : (typeof interests === 'string' ? interests.split(/[;,|]/).slice(0, 12) : [])
    };
  }
  function contextKey(placement, context) {
    try { return placement + '|' + JSON.stringify(context); } catch (_) { return placement; }
  }
  function configure(raw) {
    const source = plain(raw);
    const next = cloneDefaults();
    next.viewability.threshold = clamp(plain(source.viewability).threshold, 0.05, 0.95, DEFAULTS.viewability.threshold);
    next.viewability.durationMs = Math.floor(clamp(plain(source.viewability).durationMs, 0, 60000, DEFAULTS.viewability.durationMs));
    next.lazy.rootMarginPx = Math.floor(clamp(plain(source.lazy).rootMarginPx, 0, 1500, DEFAULTS.lazy.rootMarginPx));
    next.lazy.requestThrottleMs = Math.floor(clamp(plain(source.lazy).requestThrottleMs, 0, 60000, DEFAULTS.lazy.requestThrottleMs));
    next.rotation.defaultSeconds = clamp(plain(source.rotation).defaultSeconds, 1, 59, DEFAULTS.rotation.defaultSeconds);
    next.rotation.minSeconds = clamp(plain(source.rotation).minSeconds, 1, 59, DEFAULTS.rotation.minSeconds);
    next.rotation.maxSeconds = clamp(plain(source.rotation).maxSeconds, next.rotation.minSeconds, 59, DEFAULTS.rotation.maxSeconds);
    next.lease.ttlMs = Math.floor(clamp(plain(source.lease).ttlMs, 30000, 3600000, DEFAULTS.lease.ttlMs));
    const thresholdChanged = observerThreshold !== null && observerThreshold !== next.viewability.threshold;
    const marginChanged = observerMargin !== null && observerMargin !== next.lazy.rootMarginPx;
    policy = next;
    if (thresholdChanged || marginChanged) rebuildObservers();
  }
  function addRenderingClasses(host) {
    host.classList.add('skh-ad-delivery-slot', 'skh-ann-story', 'skh-home-ad', 'skh-ann-post');
    host.classList.remove('is-empty', 'is-live');
    host.setAttribute('aria-label', host.getAttribute('aria-label') || 'Sponsored content');
  }
  function makeRecord(host, placement, context, key) {
    if (!host.dataset.skhAdSlotId) host.dataset.skhAdSlotId = randomToken().slice(0, 32);
    return {
      host, placement, context, key,
      slotId: host.dataset.skhAdSlotId,
      requestPromise: null,
      leaseId: '',
      ad: null,
      events: new Set(),
      visible: false,
      ratio: 0,
      viewable: false,
      entered: false,
      viewTimer: null,
      rotateTimer: null,
      retryTimer: null,
      lastRequestAt: 0,
      dismissed: false
    };
  }
  function clearTimers(record) {
    ['viewTimer','rotateTimer','retryTimer'].forEach(name => {
      if (record[name]) window.clearTimeout(record[name]);
      record[name] = null;
    });
  }
  function track(record, type) {
    if (!record || !record.leaseId || record.events.has(type)) return Promise.resolve(false);
    record.events.add(type);
    try {
      if (!skh || typeof skh.callFunction !== 'function') return Promise.resolve(false);
      return Promise.resolve(skh.callFunction('adsTrackDeliveryEvent', {
        leaseId: record.leaseId,
        type,
        sessionId: sessionId()
      })).then(unwrap).catch(function () { return false; });
    } catch (_) { return Promise.resolve(false); }
  }
  function release(record, eventType) {
    if (!record) return;
    clearTimers(record);
    try { if (nearObserver) nearObserver.unobserve(record.host); } catch (_) {}
    try { if (viewObserver) viewObserver.unobserve(record.host); } catch (_) {}
    if (record.leaseId) track(record, eventType || 'lease_released');
  }
  function emptySlot(record, hide) {
    if (!record || !record.host) return;
    try {
      record.host.innerHTML = '';
      if (hide === false) {
        // Keep a tiny, transparent intersection target while a lazy request is
        // pending; `hidden` elements cannot intersect and would never load.
        record.host.hidden = false;
        record.host.style.minHeight = '1px';
        record.host.style.opacity = '0';
      } else {
        record.host.hidden = true;
        record.host.style.minHeight = '';
        record.host.style.opacity = '';
      }
    } catch (_) {}
  }
  function discard(record, options) {
    const opts = options || {};
    release(record, opts.eventType || 'lease_released');
    if (opts.clear !== false) emptySlot(record, opts.hide !== false);
    records.delete(record.host);
  }
  function protectedRefresh(host, current) {
    if (current) discard(current, { clear: false, hide: false });
    // Protected/system hosts own their content; never clear or cover it.
    return null;
  }
  function refreshSlot(host, options) {
    if (disposed || !host || !host.dataset) return null;
    const opts = options || {};
    const placement = String(host.dataset.skhAdSlot || '').trim().toLowerCase();
    if (!placement || !/^[a-z][a-z0-9_]{0,47}$/.test(placement)) return null;
    const context = contextOf(host);
    const key = contextKey(placement, context);
    const current = records.get(host);
    if (isProtectedSlot(host, placement, context)) return protectedRefresh(host, current);
    if (current && current.key === key && !opts.force) return current;
    if (current) discard(current, { clear: true, hide: true });
    const record = makeRecord(host, placement, context, key);
    records.set(host, record);
    addRenderingClasses(host);
    emptySlot(record, false);
    try { if (nearObserver) nearObserver.observe(host); }
    catch (_) { /* IntersectionObserver missing: ads remain absent (fail open). */ }
    return record;
  }
  function buildRequest(record) {
    const ctx = Object.assign({}, record.context);
    return {
      placement: record.placement,
      slotId: record.slotId,
      requestId: record.requestId,
      sessionId: sessionId(),
      context: ctx
    };
  }
  function displayDuration(record) {
    const seconds = Number(record.ad && record.ad.displayDurationSeconds);
    if (Number.isFinite(seconds) && seconds > 0) {
      return clamp(seconds, policy.rotation.minSeconds, policy.rotation.maxSeconds, policy.rotation.defaultSeconds) * 1000;
    }
    return clamp(policy.rotation.defaultSeconds, policy.rotation.minSeconds, policy.rotation.maxSeconds, 15) * 1000;
  }
  function armRotation(record) {
    if (!record || !record.leaseId || !record.visible || record.rotateTimer || record.dismissed) return;
    record.rotateTimer = window.setTimeout(function () {
      record.rotateTimer = null;
      if (!record.host || !record.host.isConnected || isProtectedSlot(record.host, record.placement, record.context)) return;
      const host = record.host;
      release(record, 'lease_released');
      record.leaseId = '';
      record.ad = null;
      record.events.clear();
      record.viewable = false;
      record.entered = false;
      record.dismissed = false;
      emptySlot(record, false);
      if (nearObserver) {
        try { nearObserver.observe(host); } catch (_) {}
      }
    }, displayDuration(record));
  }
  function addDismissButton(record) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'skh-ad-dismiss-button';
    button.setAttribute('aria-label', 'Dismiss this ad');
    button.setAttribute('title', 'Dismiss this ad');
    button.textContent = '×';
    button.style.cssText = 'position:absolute;z-index:30;top:7px;right:7px;width:30px;height:30px;border:1px solid rgba(15,23,42,.18);border-radius:50%;background:rgba(255,255,255,.94);color:#334155;font-size:20px;line-height:1;cursor:pointer;box-shadow:0 2px 8px rgba(15,23,42,.16);';
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (record.dismissed) return;
      record.dismissed = true;
      track(record, 'dismissed');
      release(record, 'lease_released');
      record.leaseId = '';
      record.host.hidden = true;
      record.host.innerHTML = '';
      // A replacement can be requested after the current slot is cleared. The
      // central user state remembers this dismissal and applies fatigue/cooldown.
      record.retryTimer = window.setTimeout(function () {
        record.retryTimer = null;
        if (!record.host.isConnected || isProtectedSlot(record.host, record.placement, record.context)) return;
        record.events.clear();
        record.ad = null;
        record.viewable = false;
        record.entered = false;
        record.dismissed = false;
        emptySlot(record, false);
        if (nearObserver) { try { nearObserver.observe(record.host); } catch (_) {} }
      }, Math.max(500, policy.lazy.requestThrottleMs));
    });
    record.host.style.position = record.host.style.position || 'relative';
    record.host.appendChild(button);
  }
  function render(record, response) {
    const host = record.host;
    const ad = response && response.campaign;
    if (!ad || !ad.id || typeof window.skhAdvertisementCardHtml !== 'function') {
      track(record, 'lease_released');
      record.leaseId = '';
      emptySlot(record, true);
      return false;
    }
    addRenderingClasses(host);
    host.hidden = false;
    host.style.minHeight = '';
    host.style.opacity = '';
    host.innerHTML = window.skhAdvertisementCardHtml(ad, false);
    const hasMedia = !!(ad.image || ad.imageUrl || ad.mediaUrl || ad.photo || ad.videoUrl || ad.audioUrl
      || (ad.slideshow && Array.isArray(ad.slideshow.slides) && ad.slideshow.slides.some(slide => slide && slide.src)));
    host.classList.toggle('has-media', hasMedia);
    host.classList.toggle('no-media', !hasMedia);
    if (!host.querySelector('.skh-ann-card')) throw new Error('Canonical Creative renderer returned no card.');
    record.ad = ad;
    record.viewable = false;
    record.entered = false;
    record.dismissed = false;
    addDismissButton(record);
    if (viewObserver) viewObserver.observe(host);
    track(record, 'rendered');
    return true;
  }
  async function load(record) {
    if (!record || record.requestPromise || record.leaseId || record.dismissed || !record.host.isConnected) return;
    if (isProtectedSlot(record.host, record.placement, record.context) || hiddenByLayout(record.host)) return;
    const elapsed = Date.now() - record.lastRequestAt;
    if (record.lastRequestAt && elapsed < policy.lazy.requestThrottleMs) {
      record.retryTimer = window.setTimeout(function () { record.retryTimer = null; load(record); }, policy.lazy.requestThrottleMs - elapsed + 15);
      return;
    }
    record.lastRequestAt = Date.now();
    record.requestId = randomToken();
    if (nearObserver) { try { nearObserver.unobserve(record.host); } catch (_) {} }
    record.requestPromise = (async function () {
      try {
        if (!skh || typeof skh.callFunction !== 'function') return;
        const raw = await skh.callFunction('adsRequestDelivery', buildRequest(record));
        const response = unwrap(raw) || {};
        if (response.config) configure(response.config);
        if (response.status !== 'DELIVERED' || !response.leaseId || !response.campaign) {
          record.noAd = true;
          emptySlot(record, true);
          return;
        }
        record.leaseId = String(response.leaseId);
        record.expiresAt = response.expiresAt || '';
        record.ad = response.campaign;
        record.events.clear();
        track(record, 'loaded');
        render(record, response);
      } catch (error) {
        // Ads are optional: unavailable Functions, metadata, rendering or
        // analytics must never change marketplace/chat/checkout behavior.
        if (record.leaseId) {
          track(record, 'lease_released');
          record.leaseId = '';
        }
        emptySlot(record, true);
        try { console.warn('[ads-delivery] slot skipped:', error && (error.code || error.message) || 'unavailable'); } catch (_) {}
      } finally {
        record.requestPromise = null;
      }
    })();
    await record.requestPromise;
  }
  function onNear(entries) {
    entries.forEach(entry => {
      const record = records.get(entry.target);
      if (!record || !entry.isIntersecting || entry.intersectionRatio === 0) return;
      load(record);
    });
  }
  function onView(entries) {
    entries.forEach(entry => {
      const record = records.get(entry.target);
      if (!record || !record.leaseId || !record.ad) return;
      const intersecting = !!entry.isIntersecting && Number(entry.intersectionRatio) > 0;
      record.visible = intersecting;
      record.ratio = Number(entry.intersectionRatio) || 0;
      if (intersecting && !record.entered) {
        record.entered = true;
        track(record, 'entered_viewport');
      }
      const viewable = intersecting && record.ratio >= policy.viewability.threshold
        && document.visibilityState !== 'hidden' && !record.viewable;
      if (viewable && !record.viewTimer) {
        record.viewTimer = window.setTimeout(function () {
          record.viewTimer = null;
          if (!record.leaseId || !record.visible || record.ratio < policy.viewability.threshold
              || document.visibilityState === 'hidden' || record.viewable) return;
          record.viewable = true;
          track(record, 'viewable');
        }, policy.viewability.durationMs);
      } else if (!viewable && record.viewTimer) {
        window.clearTimeout(record.viewTimer);
        record.viewTimer = null;
      }
      if (intersecting) armRotation(record);
      else if (record.rotateTimer) { window.clearTimeout(record.rotateTimer); record.rotateTimer = null; }
    });
  }
  function rebuildObservers() {
    if (nearObserver) { try { nearObserver.disconnect(); } catch (_) {} }
    if (viewObserver) { try { viewObserver.disconnect(); } catch (_) {} }
    nearObserver = null;
    viewObserver = null;
    observerThreshold = policy.viewability.threshold;
    observerMargin = policy.lazy.rootMarginPx;
    if (typeof window.IntersectionObserver !== 'function') return;
    try {
      nearObserver = new window.IntersectionObserver(onNear, {
        root: null,
        rootMargin: policy.lazy.rootMarginPx + 'px 0px',
        threshold: 0
      });
      viewObserver = new window.IntersectionObserver(onView, {
        root: null,
        threshold: [0, policy.viewability.threshold]
      });
      records.forEach(record => {
        if (record.leaseId) viewObserver.observe(record.host);
        else nearObserver.observe(record.host);
      });
    } catch (_) { nearObserver = null; viewObserver = null; }
  }
  function scan(root) {
    if (!root) return;
    if (root.nodeType === 1 && root.matches && root.matches('[data-skh-ad-slot]')) refreshSlot(root);
    if (root.querySelectorAll) root.querySelectorAll('[data-skh-ad-slot]').forEach(element => refreshSlot(element));
  }
  function pruneRemoved() {
    records.forEach((record, host) => {
      if (!host.isConnected) discard(record, { clear: false, hide: false });
    });
  }
  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    window.setTimeout(function () {
      scanQueued = false;
      if (disposed) return;
      pruneRemoved();
      scan(document.documentElement || document.body);
    }, 50);
  }
  function start() {
    rebuildObservers();
    scan(document.documentElement || document.body);
    if (typeof window.MutationObserver === 'function' && document.documentElement) {
      mutationObserver = new window.MutationObserver(function (changes) {
        changes.forEach(change => {
          if (change.type === 'childList') change.addedNodes.forEach(scan);
          else if (change.target && change.target.matches && change.target.matches('[data-skh-ad-slot]')) refreshSlot(change.target);
        });
        pruneRemoved();
      });
      mutationObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          'data-skh-ad-slot','data-skh-ad-context','data-skh-ad-category','data-skh-ad-categories',
          'data-skh-ad-query','data-skh-ad-region','data-skh-ad-entity-type','data-skh-ad-entity-id',
          'data-skh-ad-mode','data-skh-ad-surface','data-skh-ad-flow','data-skh-ad-screen',
          'data-skh-ad-context-type','data-skh-ad-protected','data-skh-admin-dashboard'
        ]
      });
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        records.forEach(record => {
          if (record.viewTimer) { window.clearTimeout(record.viewTimer); record.viewTimer = null; }
          if (record.rotateTimer) { window.clearTimeout(record.rotateTimer); record.rotateTimer = null; }
        });
      }
    });
  }

  window.skhAdDeliveryController = {
    refreshSlot,
    refreshAll: function () { queueScan(); },
    pauseSlot: function (host) {
      const record = host && records.get(host);
      if (record) discard(record, { clear: false, hide: false });
    },
    resumeSlot: function (host) { return refreshSlot(host, { force: true }); },
    releaseSlot: function (host) {
      const record = host && records.get(host);
      if (record) discard(record, { clear: true, hide: true });
    },
    getPolicy: function () { return JSON.parse(JSON.stringify(policy)); },
    getSlotCount: function () { return records.size; },
    destroy: function () {
      disposed = true;
      if (mutationObserver) mutationObserver.disconnect();
      if (nearObserver) nearObserver.disconnect();
      if (viewObserver) viewObserver.disconnect();
      records.forEach(record => discard(record, { clear: false, hide: false }));
      records.clear();
    }
  };
  window.skhAdDeliveryTrackForAd = function (campaignId, type) {
    let tracked = false;
    records.forEach(record => {
      if (record.ad && String(record.ad.id) === String(campaignId) && record.leaseId) {
        tracked = true;
        track(record, type || 'clicked');
      }
    });
    return tracked;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
