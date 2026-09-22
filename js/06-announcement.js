/* SokoHai Announcement Story Card — real Firestore campaigns, no marquee. */
(function () {
  'use strict';
  if (window.__SOKOHAI_ANNOUNCEMENT_STORY_V1__) return;
  window.__SOKOHAI_ANNOUNCEMENT_STORY_V1__ = true;

  const TYPE_META = {
    normal:{ label:'SokoHai' }, breaking:{ label:'Taarifa' }, feature:{ label:'Kipengele kipya' },
    promotion:{ label:'Ofa' }, maintenance:{ label:'Matengenezo' }, 'security-notice':{ label:'Usalama' },
    tender:{ label:'Zabuni' }, event:{ label:'Tukio' }, security:{ label:'SokoPay' }, launch:{ label:'Uzinduzi' },
    company:{ label:'Biashara' }, service:{ label:'Huduma' }, payment:{ label:'Malipo' }, update:{ label:'Taarifa mpya' }
  };
  window.SOKOHAI_ANNOUNCEMENT_TYPE_META = TYPE_META;

  let activeIndex = 0;
  let rotationTimer = null;
  let liveTimer = null;
  let liveNotice = null;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }
  function safeUrl(v) {
    const s = String(v || '').trim();
    return /^(https:\/\/|\/)/i.test(s) && !/["'<>\s]/.test(s) ? s : '';
  }
  function short(v, n) {
    const s = String(v || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
  }
  function activeAnnouncements() {
    const now = Date.now();
    const source = Array.isArray(window.__sokohaiAnnouncementsCache) ? window.__sokohaiAnnouncementsCache : [];
    return source.filter(a => {
      if (!a || !String(a.text || '').trim() || a.active === false) return false;
      const start = a.startAt ? Date.parse(a.startAt) : 0;
      const end = a.endAt ? Date.parse(a.endAt) : 0;
      return (!start || start <= now) && (!end || end >= now);
    }).sort((a, b) => String(b.createdAt || b.updatedAt || '').localeCompare(String(a.createdAt || a.updatedAt || '')));
  }
  function hide() {
    const host = document.getElementById('topAnnouncement');
    if (!host) return;
    host.className = 'big-announcement skh-ann-story is-empty';
    host.innerHTML = '';
    host.hidden = true;
  }
  function openAction(url) {
    if (!url) return;
    if (url.charAt(0) === '#' || url.charAt(0) === '/') window.location.href = url;
    else window.open(url, '_blank', 'noopener');
  }
  window.skhAnnouncementOpen = openAction;

  function renderAnnouncement(a, live) {
    const host = document.getElementById('topAnnouncement');
    if (!host || !a) return;
    const meta = TYPE_META[a.type] || TYPE_META.normal;
    const image = safeUrl(a.image || a.imageUrl || a.mediaUrl || a.photo);
    const link = safeUrl(a.link || a.actionUrl);
    const title = short(a.title || meta.label || 'SokoHai', 72);
    const message = short(a.text || a.message, 170);
    const action = short(a.actionLabel || 'Angalia', 26);
    host.hidden = false;
    host.className = 'big-announcement skh-ann-story' + (image ? ' has-image' : ' no-image') + (live ? ' is-live' : '');
    host.innerHTML = '<article class="skh-ann-card">'
      + (image ? '<button type="button" class="skh-ann-media"' + (link ? ' onclick="window.skhAnnouncementOpen(\'' + esc(link) + '\')"' : '') + '><img src="' + esc(image) + '" alt="' + esc(title) + '" loading="lazy"></button>' : '')
      + '<div class="skh-ann-copy"><div class="skh-ann-kicker"><span></span>' + esc(meta.label || 'SokoHai') + '</div>'
      + '<b class="skh-ann-title">' + esc(title) + '</b><p>' + esc(message) + '</p>'
      + (link ? '<button type="button" class="skh-ann-action" onclick="window.skhAnnouncementOpen(\'' + esc(link) + '\')">' + esc(action) + '</button>' : '')
      + '</div></article>';
  }

  function renderCurrent() {
    clearTimeout(rotationTimer);
    if (liveNotice) { renderAnnouncement(liveNotice, true); return; }
    const list = activeAnnouncements();
    if (!list.length) { hide(); return; }
    if (activeIndex >= list.length) activeIndex = 0;
    renderAnnouncement(list[activeIndex], false);
    if (list.length > 1) {
      rotationTimer = setTimeout(function () { activeIndex = (activeIndex + 1) % list.length; renderCurrent(); }, 9000);
    }
  }

  window.startSokoHaiSmoothMarquee = renderCurrent;
  window.startSokoHaiAnnouncementRotator = renderCurrent;
  window.startSokoHaiProAnnouncementBar = renderCurrent;
  window.playNextSokoHaiProAnnouncement = function () { activeIndex += 1; renderCurrent(); };
  window.rotateSokoHaiAnnouncement = window.playNextSokoHaiProAnnouncement;
  window.__sokohaiOnAnnouncementsUpdate = function () { activeIndex = 0; renderCurrent(); };

  window.updateLiveTicker = function (type, message, subject, forceReset) {
    clearTimeout(liveTimer);
    const t = String(type || 'normal');
    if (t === 'normal' || forceReset) { liveNotice = null; renderCurrent(); return; }
    const labels = { auction:'Mnada unaendelea', price_drop:'Bei imeshuka', group_buy:'Group Buy', alert:'Taarifa muhimu' };
    const generated = message || ((labels[t] || 'Taarifa') + (subject ? ': ' + subject : ''));
    liveNotice = { type: t === 'price_drop' ? 'promotion' : 'update', title: labels[t] || 'SokoHai', text: generated, active: true };
    renderCurrent();
    liveTimer = setTimeout(function () { liveNotice = null; renderCurrent(); }, 16000);
  };

  document.addEventListener('DOMContentLoaded', renderCurrent);
  setTimeout(renderCurrent, 250);
})();
