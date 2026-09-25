/* ==== js/app/25-tracking-hub.js ====
   KAZI YA FILE HII: UFUATILIAJI WA MZIGO (Tracking Hub).
   - Line track + Live track (ramani) ya mzigo wa mnunuzi.
   - Picha ya mzigo + details zote (muuzaji, dereva, njia, kiasi, token).
   - Location: dereva akiruhusu GPS -> mnunuzi anaona LIVE; vinginevyo
     tunaonyesha njia (from -> to) na mahali pa mwisho palipojulikana.
   - Dereva anaweza kushirikisha location yake live (share/stop).
*/
import { skh } from './00-bootstrap.js';

const TRACK_GEO_CACHE = {};
let liveWatchId = null;   // watch id ya GPS ya dereva (share location)
let trackUnsub = null;    // onSnapshot ya ufuatiliaji live

// Forward geocode ya jina la mahali -> [lat, lon] (cache ndani ya kumbukumbu)
window.skhGeocodePlace = async function(name) {
    if (!name) return null;
    const key = String(name).trim().toLowerCase();
    if (TRACK_GEO_CACHE[key] !== undefined) return TRACK_GEO_CACHE[key];
    try {
        const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(name));
        const arr = await res.json();
        if (arr && arr.length && typeof arr[0].lat === 'string') {
            const out = [parseFloat(arr[0].lat), parseFloat(arr[0].lon)];
            TRACK_GEO_CACHE[key] = out;
            return out;
        }
    } catch (e) { /* mtandao/mipaka — endelea bila */ }
    TRACK_GEO_CACHE[key] = null;
    return null;
};

// Hakikisha modal ya ufuatiliaji ipo kwenye DOM (inajengwa mara moja)
window.ensureTrackDetailModal = function() {
    let m = document.getElementById('trackDetailModal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'trackDetailModal';
    m.className = 'overlay-menu';
    m.style.cssText = 'z-index: 9600; padding: 0;';
    m.innerHTML = `
        <div style="background:#ffffff; width:100%; max-width:520px; height:100vh; height:100dvh; max-height:100vh; max-height:100dvh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 50px rgba(0,0,0,0.45);"> <div style="background:var(--primary-dark, #052e4f); padding:14px 16px; color:white; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;"> <div style="display:flex; align-items:center; gap:10px;"> <div style="font-size:22px;"></div> <div> <b id="trackTitle" style="font-size:15px; display:block;">Ufuatiliaji wa Mzigo</b> <small id="trackSub" style="color:#a5c8e8; font-size:13px; font-weight:bold;">Line Track + Live Track</small> </div> </div> <button onclick="window.closeModals()" style="background:transparent; border:none; color:white; width:34px; height:34px; border-radius:50%; font-size:18px; cursor:pointer;">&#10005;</button> </div> <div id="trackBody" style="flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; background:#f4f6f8; padding:14px;"></div> </div>`;
    document.body.appendChild(m);
    return m;
};

// Chora ramani ndani ya container: live location + njia + mahali pa mwisho
window.skhRenderTrackingMap = function(containerId, opts) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (typeof L === 'undefined') {
        // [PERF 2026-09] Leaflet haikupakuliwa mwanzoni — ipakue kwa uvivu sasa.
        container.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">Ramani inapakia kwenye kifaa chenye mtandao...</p>';
        if (typeof window.skhWithLeaflet === 'function') {
            window.skhWithLeaflet(function () { window.skhRenderTrackingMap(containerId, opts); });
        }
        return;
    }
    try {
        // Kama ramani tayari imechorwa kwenye container hii, iondoe kwanza (epuka double-init)
        try {
            if (container._leaflet_id) {
                const existing = L.map(container);
                existing.remove();
            }
            container.innerHTML = '';
        } catch (e) { container.innerHTML = ''; }
        const map = L.map(containerId, { zoomControl: true }).setView([-6.7924, 39.2083], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        const points = [];
        let liveMarker = null;

        const addMarker = (lat, lon, color, label) => {
            if (typeof lat !== 'number' || typeof lon !== 'number') return;
            points.push([lat, lon]);
            return L.circleMarker([lat, lon], { radius: 8, color: color, weight: 2, fillColor: color, fillOpacity: 0.9 })
                .addTo(map).bindPopup(label);
        };

        if (typeof opts.liveLat === 'number' && typeof opts.liveLon === 'number') {
            liveMarker = addMarker(opts.liveLat, opts.liveLon, '#2563eb', '<b>MZIGO UPO HAPA (LIVE)</b><br>' + (opts.liveLabel || 'GPS live'));
            map.setView([opts.liveLat, opts.liveLon], 13);
        } else {
            const fromPt = opts.from ? opts.from : null;
            const toPt = opts.to ? opts.to : null;
            if (fromPt) addMarker(fromPt[0], fromPt[1], '#16a34a', '<b>Kutoka:</b> ' + (opts.fromName || ''));
            if (toPt) addMarker(toPt[0], toPt[1], '#dc2626', '<b>Kufika:</b> ' + (opts.toName || ''));
            if (fromPt && toPt) {
                L.polyline([fromPt, toPt], { color: '#f59e0b', weight: 3, dashArray: '6,6' }).addTo(map);
            }
            if (typeof opts.lastLat === 'number' && typeof opts.lastLon === 'number') {
                addMarker(opts.lastLat, opts.lastLon, '#7c3aed', '<b>Mahali pa mwisho palipojulikana</b><br>' + (opts.lastLabel || ''));
            }
            if (points.length) {
                map.fitBounds(points.map(p => [p[0], p[1]]).length > 1 ? points : [[points[0][0], points[0][1]], [points[0][0], points[0][1]]]);
                if (points.length === 1) map.setView(points[0], 11);
            }
        }
        if (typeof opts.onReady === 'function') opts.onReady(map);
        setTimeout(() => { try { map.invalidateSize(); } catch(e){} }, 150);
    } catch (e) {
        container.innerHTML = '<p style="text-align:center; color:#b91c1c; padding:20px;">Ramani imeshindwa kuchorwa.</p>';
    }
};

// Line tracker (hatua 4) — rangi kulingana na status
window.skhTrackSteps = function(status) {
    let width = '5%', s1 = 'done', s2 = '', s3 = '', s4 = '';
    const st = String(status || '').toLowerCase();
    if (st === 'held' || st === 'paid' || st === 'pending' || st === 'searching' || st === 'pending_acceptance' || st === 'awaiting_pickup') {
        width = '18%'; s1 = 'active';
    } else if (st === 'accepted' || st === 'pickup_pending') {
        width = '30%'; s1 = 'active';
    } else if (st === 'seller_confirmed_handover' || st === 'transporter_confirmed_receipt' || st === 'picked_up') {
        width = '45%'; s1 = 'done'; s2 = 'active';
    } else if (st === 'shipped' || st === 'in_transit' || st === 'awaiting_handover') {
        width = '60%'; s1 = 'done'; s2 = 'active';
    } else if (st === 'arrived_at_hub' || st === 'arrived_destination') {
        width = '80%'; s1 = 'done'; s2 = 'done'; s3 = 'active';
    } else if (st === 'completed' || st === 'delivered') {
        width = '100%'; s1 = 'done'; s2 = 'done'; s3 = 'done'; s4 = 'done';
    } else if (st === 'refunded_by_admin' || st === 'cancelled') {
        width = '5%'; s1 = 'done'; s2 = ''; s3 = ''; s4 = '';
    }
    return { width, s1, s2, s3, s4 };
};

window.skhTrackLineHTML = function(status) {
    const t = window.skhTrackSteps(status);
    return `
        <div class="tracker-wrap" style="margin:14px 0;"> <div class="tracker-line"></div> <div class="tracker-fill" style="width: ${t.width};"></div> <div class="tracker-steps"> <div class="t-step ${t.s1}"><div class="t-dot"></div><span class="t-label">Muuzaji</span></div> <div class="t-step ${t.s2}"><div class="t-dot"></div><span class="t-label">Safarini</span></div> <div class="t-step ${t.s3}"><div class="t-dot"></div><span class="t-label">Kituoni</span></div> <div class="t-step ${t.s4}"><div class="t-dot"></div><span class="t-label">Mteja</span></div> </div> </div>`;
};

// PATA (Fuatilia) oda ya bidhaa — photo + details + line track + ramani/last location
window.openOrderTracking = async function(orderId) {
    if (!skh.currentUser) { alert("Ingia kwanza!"); return; }
    window.ensureTrackDetailModal();
    const body = document.getElementById('trackBody');
    const title = document.getElementById('trackTitle');
    const sub = document.getElementById('trackSub');
    body.innerHTML = '<p style="text-align:center; color:#64748b; padding:30px;">Inapakia maelezo ya mzigo...</p>';
    window.closeModals();
    document.getElementById('trackDetailModal').style.display = 'flex';

    try {
        const snap = await skh.getDoc(skh.doc(skh.db, "orders", orderId));
        if (!snap || !snap.exists()) {
            body.innerHTML = '<p style="text-align:center; color:#b91c1c; padding:30px;">Oda haijapatikana.</p>';
            return;
        }
        const od = snap.data();
        title.innerText = od.itemTitle || 'Oda ya Bidhaa';
        sub.innerText = (od.status || 'held').toUpperCase();
        const img = od.itemImg || '';
        const st = String(od.status || 'held').toLowerCase();

        body.innerHTML = `
            <div style="background:#fff; border-radius:16px; padding:14px; border:1px solid #e2e8f0; margin-bottom:12px;"> <div style="display:flex; gap:12px; align-items:center;"> <img src="${img || 'https://ui-avatars.com/api/?name=Mzigo&background=cccccc&color=fff'}" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=Mzigo&background=cccccc&color=fff';" style="width:84px; height:84px; border-radius:14px; object-fit:cover; border:1px solid #e2e8f0; background:#f1f5f9; flex-shrink:0;"> <div style="flex:1; min-width:0;"> <b style="font-size:14px; color:#0f172a; display:block; margin-bottom:4px;">${skh.skhEscape(od.itemTitle || 'Bidhaa')}</b> <span style="font-size:13px; font-weight:900; color:#065f46; display:block;">TSh ${Number(od.amount || 0).toLocaleString()}</span> <span style="font-size:13px; color:#64748b; display:block; margin-top:2px;">Muuzaji: ${skh.skhEscape(od.sellerName || 'Muuzaji')}</span> </div> </div> </div>

            ${window.skhTrackLineHTML(od.status)}

            <div style="background:#fff; border-radius:16px; padding:14px; border:1px solid #e2e8f0; margin-bottom:12px;"> <b style="font-size:12px; color:#0f172a; display:block; margin-bottom:8px;">DETAILS ZA MZIGO</b> <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px;"> <div><small style="color:#94a3b8;">Hali</small><br><b>${String(od.status || 'held').toUpperCase()}</b></div> <div><small style="color:#94a3b8;">Tarehe</small><br><b>${od.date ? new Date(od.date).toLocaleDateString('sw-TZ', {day:'numeric', month:'short', year:'numeric'}) : '—'}</b></div> <div><small style="color:#94a3b8;">Malipo</small><br><b>${skh.skhEscape(od.paymentType || '—')}</b></div> <div><small style="color:#94a3b8;">Ref</small><br><b style="font-family:monospace;">${skh.skhEscape(od.paymentRef || '—')}</b></div> </div>
                ${od.lastLocation ? `<div style="margin-top:8px; background:#fef3c7; border-radius:8px; padding:8px; font-size:13px; color:#92400e;"><b>Mahali pa mwisho:</b> ${skh.skhEscape(od.lastLocation)}</div>` : ''}
            </div> <div id="orderTrackMap" style="height:240px; border-radius:16px; overflow:hidden; border:1px solid #e2e8f0; margin-bottom:8px;"></div> <p id="orderTrackGps" style="font-size:13px; color:#475569; text-align:center; margin:4px 0 12px;">Inachunguza GPS ya mzigo...</p> <div style="display:flex; gap:8px;"> <button onclick="window.openChatWithUser('${skh.skhJsEsc(od.sellerId || '')}', '${skh.skhJsEsc(od.sellerName || 'Muuzaji')}')" style="flex:1; padding:13px; background:#25D366; color:white; border:none; border-radius:12px; font-weight:900; font-size:13px; cursor:pointer;">CHAT NA MUUZAJI</button> </div> <button onclick="window.closeModals()" style="margin-top:8px; width:100%; padding:13px; background:#e2e8f0; color:#334155; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">FUNGA</button> `;

        // Ramani ya oda: live GPS (kutoka kwa dereva aliyeunganishwa) -> vinginevyo njia + last known
        const gps = document.getElementById('orderTrackGps');
        const q = skh.query(skh.collection(skh.db, "ride_requests"),
            skh.where("customerId", "==", skh.currentUser.uid),
            skh.where("itemId", "==", od.itemId || '__none__'));
        skh.getDocs(q).then(async rsnap => {
            if (!rsnap.empty) {
                const rd = rsnap.docs[0].data();
                await window.openRideTrackingInto('orderTrackMap', 'orderTrackGps', rsnap.docs[0].id, rd);
            } else {
                // Hakuna safari iliyounganishwa — tumia last location ya oda kama ipo
                const opts = {};
                if (typeof od.lastLat === 'number' && typeof od.lastLon === 'number') {
                    opts.lastLat = od.lastLat; opts.lastLon = od.lastLon; opts.lastLabel = od.lastLocation || '';
                }
                window.skhRenderTrackingMap('orderTrackMap', opts);
                gps.innerText = (opts.lastLat) ? 'Hakuna GPS live sasa — tunaonyesha mahali pa mwisho palipojulikana.' : 'Hakuna GPS live bado. Dereva akishirikisha location, ramani itaonyesha mzigo LIVE.';
            }
        }).catch(() => {
            gps.innerText = 'Hakuna GPS live bado. Dereva akishirikisha location, ramani itaonyesha mzigo LIVE.';
        });
    } catch (e) {
        body.innerHTML = '<p style="text-align:center; color:#b91c1c; padding:30px;">Hitilafu: ' + skh.skhEscape(e.message) + '</p>';
    }
};

// Fuatilia safari ya usafirishaji (ride) — live GPS au njia + last location
window.openRideTracking = async function(rideId) {
    if (!skh.currentUser) { alert("Ingia kwanza!"); return; }
    window.ensureTrackDetailModal();
    const body = document.getElementById('trackBody');
    const title = document.getElementById('trackTitle');
    const sub = document.getElementById('trackSub');
    body.innerHTML = '<p style="text-align:center; color:#64748b; padding:30px;">Inapakia safari...</p>';
    window.closeModals();
    document.getElementById('trackDetailModal').style.display = 'flex';
    try {
        const snap = await skh.getDoc(skh.doc(skh.db, "ride_requests", rideId));
        if (!snap || !snap.exists()) { body.innerHTML = '<p style="text-align:center; color:#b91c1c; padding:30px;">Safari haijapatikana.</p>'; return; }
        const rd = snap.data();
        title.innerText = rd.cargoName || 'Safari ya Mzigo';
        sub.innerText = (rd.status || 'searching').toUpperCase();
        await window.openRideTrackingInto('trackDetailMap', 'trackDetailGps', rideId, rd, body);
    } catch (e) {
        body.innerHTML = '<p style="text-align:center; color:#b91c1c; padding:30px;">Hitilafu: ' + skh.skhEscape(e.message) + '</p>';
    }
};

// Chora mwili wa safari ndani ya container (inatumika na oda + safari moja kwa moja)
window.openRideTrackingInto = async function(mapId, gpsId, rideId, rd, bodyEl) {
    if (bodyEl) {
        const img = rd.cargoImage || '';
        bodyEl.innerHTML = `
            <div style="background:#fff; border-radius:16px; padding:14px; border:1px solid #e2e8f0; margin-bottom:12px;"> <div style="display:flex; gap:12px; align-items:center;"> <img src="${img || 'https://ui-avatars.com/api/?name=Mzigo&background=cccccc&color=fff'}" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=Mzigo&background=cccccc&color=fff';" style="width:84px; height:84px; border-radius:14px; object-fit:cover; border:1px solid #e2e8f0; background:#f1f5f9; flex-shrink:0;"> <div style="flex:1; min-width:0;"> <b style="font-size:14px; color:#0f172a; display:block; margin-bottom:4px;">${skh.skhEscape(rd.cargoName || 'Mzigo')}</b> <span style="font-size:13px; color:#475569; display:block;">${skh.skhEscape(rd.fromLocation || '—')} &#10142; ${skh.skhEscape(rd.toLocation || '—')}</span>
                        ${rd.cargoPrice ? `<span style="font-size:13px; font-weight:900; color:#065f46; display:block; margin-top:2px;">TSh ${Number(rd.cargoPrice).toLocaleString()}</span>` : ''}
                    </div> </div> </div>

            ${window.skhTrackLineHTML(rd.status)}

            <div style="background:#fff; border-radius:16px; padding:14px; border:1px solid #e2e8f0; margin-bottom:12px;"> <b style="font-size:12px; color:#0f172a; display:block; margin-bottom:8px;">DETAILS ZA SAFARI</b> <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px;"> <div><small style="color:#94a3b8;">Hali</small><br><b>${String(rd.status || 'searching').toUpperCase()}</b></div> <div><small style="color:#94a3b8;">Dereva</small><br><b>${skh.skhEscape(rd.driverName || 'Hajapewa bado')}</b></div> <div><small style="color:#94a3b8;">Simu ya Dereva</small><br><b>${skh.skhEscape(rd.driverPhone || '—')}</b></div> <div><small style="color:#94a3b8;">Chombo</small><br><b>${skh.skhEscape(rd.vehicleType || rd.vehicle || '—')}</b></div> </div> <div style="margin-top:8px; background:#fff7ed; border:1px dashed #f97316; border-radius:8px; padding:8px; text-align:center;"><small style="font-size:12px; color:#9a3412; display:block;">CODE YA UTHIBITISHO</small><b data-custody-token-ride="${rideId}" data-custody-token-kind="transfer" style="font-size:16px; color:#ea580c; letter-spacing:2px;">• • •</b></div>
                ${rd.driverLocName ? `<div style="margin-top:8px; background:#fef3c7; border-radius:8px; padding:8px; font-size:13px; color:#92400e;"><b>Mahali pa mwisho:</b> ${skh.skhEscape(rd.driverLocName)}</div>` : ''}
            </div> <div style="background:#fff; border-radius:16px; padding:14px; border:1px solid #e2e8f0; margin-bottom:12px;"> <b style="font-size:12px; color:#0f172a; display:block; margin-bottom:8px;"> MLINZI WA MZIGO (CHAIN OF CUSTODY)</b> <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px;"> <div><small style="color:#94a3b8;">Hali ya Makabidhiano</small><br><b>${window.skhCustodyStatusLabel ? window.skhCustodyStatusLabel(rd.status) : String(rd.status || '—').toUpperCase()}</b></div> <div><small style="color:#94a3b8;">Mshika Mzigo Sasa</small><br><b>${skh.skhEscape(rd.currentCustodianName || rd.driverName || '—')}</b></div> </div> <div id="custodyTimeline_${mapId}" style="margin-top:10px;"></div> </div> <div id="${mapId}" style="height:240px; border-radius:16px; overflow:hidden; border:1px solid #e2e8f0; margin-bottom:8px;"></div> <p id="${gpsId}" style="font-size:13px; color:#475569; text-align:center; margin:4px 0 12px;">Inachunguza GPS ya dereva...</p> <div style="display:flex; gap:8px;"> <button onclick="window.openChatWithUser('${skh.skhJsEsc(rd.driverId || '')}', '${skh.skhJsEsc(rd.driverName || 'Dereva')}')" style="flex:1; padding:13px; background:#25D366; color:white; border:none; border-radius:12px; font-weight:900; font-size:13px; cursor:pointer;">CHAT NA MSAFIRISHAJI</button>
                ${rd.driverPhone ? `<button onclick="window.location.href='tel:${skh.skhJsEsc(rd.driverPhone)}'" style="flex:1; padding:13px; background:#0f172a; color:white; border:none; border-radius:12px; font-weight:900; font-size:13px; cursor:pointer;">&#128222; PIGA SIMU</button>` : ''}
            </div> <button onclick="window.closeModals()" style="margin-top:8px; width:100%; padding:13px; background:#e2e8f0; color:#334155; border:none; border-radius:12px; font-weight:bold; cursor:pointer;">FUNGA</button> `;
        // [CUSTODY 2026-09] Mlolongo wa makabidhiano kutoka kwenye matukio halisi (delivery_events).
        if (typeof window.skhCustodyRenderTimeline === 'function') {
            window.skhCustodyRenderTimeline(rideId, 'custodyTimeline_' + mapId);
        }
        // [CUSTODY PHASE B] Jaza Token C halisi (kwa mhusika pekee) badala ya plaintext.
        if (typeof window.skhCustodyHydrateTokenCodes === 'function') {
            await window.skhCustodyHydrateTokenCodes(bodyEl);
        }
    }

    const gps = document.getElementById(gpsId);
    const mapOpts = { fromName: rd.fromLocation, toName: rd.toLocation };

    const hasLive = typeof rd.driverLat === 'number' && typeof rd.driverLon === 'number';
    if (hasLive) {
        mapOpts.liveLat = rd.driverLat;
        mapOpts.liveLon = rd.driverLon;
        mapOpts.liveLabel = rd.driverLocName || rd.driverName || 'GPS live';
        window.skhRenderTrackingMap(mapId, mapOpts);
        if (gps) gps.innerText = '&#128640; LIVE — dereva ameshirikisha location yake. Mzigo upo ' + (rd.driverLocName || 'safarini') + '.';
        // Live refresh kila sekunde kadhaa
        const unsub = skh.onSnapshot(skh.doc(skh.db, "ride_requests", rideId), (snapDoc) => {
            const d = snapDoc && snapDoc.data ? snapDoc.data() : null;
            if (d && typeof d.driverLat === 'number' && typeof d.driverLon === 'number') {
                window.skhRenderTrackingMap(mapId, { liveLat: d.driverLat, liveLon: d.driverLon, liveLabel: d.driverLocName || d.driverName || 'GPS live' });
                if (gps) gps.innerText = '&#128640; LIVE — mzigo upo ' + (d.driverLocName || 'safarini') + '.';
            }
        }, () => {});
        trackUnsub = unsub;
    } else {
        // Hakuna live GPS — chora njia (from -> to) + last known kama ipo
        if (typeof rd.lastLat === 'number' && typeof rd.lastLon === 'number') {
            mapOpts.lastLat = rd.lastLat; mapOpts.lastLon = rd.lastLon; mapOpts.lastLabel = rd.driverLocName || rd.lastLocation || '';
        }
        const mapDiv = document.getElementById(mapId);
        if (mapDiv) mapDiv.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">Inachora njia ya mzigo...</p>';
        Promise.all([
            rd.fromLocation ? window.skhGeocodePlace(rd.fromLocation) : Promise.resolve(null),
            rd.toLocation ? window.skhGeocodePlace(rd.toLocation) : Promise.resolve(null)
        ]).then(([fromPt, toPt]) => {
            if (fromPt) mapOpts.from = fromPt;
            if (toPt) mapOpts.to = toPt;
            window.skhRenderTrackingMap(mapId, mapOpts);
        });
        if (gps) {
            gps.innerText = (typeof rd.lastLat === 'number')
                ? 'Hakuna GPS live sasa — tunaonyesha njia na mahali pa mwisho palipojulikana.'
                : 'Dereva hajashirikisha GPS live bado. Tunaonyesha njia ya mzigo (from &#10142; to).';
        }
    }
};

// DEREVA/MSAFIRISHAJI: shirikisha location yako live kwa mnunuzi
window.shareMyLocation = function(rideId) {
    if (!skh.currentUser) { alert("Ingia kwanza!"); return; }
    if (!rideId) { alert("Safari haijabainishwa."); return; }
    if (!navigator.geolocation) { alert("Kifaa chako hakina GPS."); return; }
    alert(" Tunaanza kushirikisha location yako LIVE kwa mnunuzi. Bonyeza 'Ruhusu' ukiombwa.");

    const push = (pos) => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        if (typeof skh.getAddressName === 'function') {
            skh.getAddressName(lat, lon).then(n => {
                skh.updateDoc(skh.doc(skh.db, "ride_requests", rideId), {
                    driverLat: lat, driverLon: lon,
                    driverLocAt: new Date().toISOString(),
                    driverLocName: n || 'Safarini'
                }).catch(() => {});
            }).catch(() => {});
        } else {
            skh.updateDoc(skh.doc(skh.db, "ride_requests", rideId), {
                driverLat: lat, driverLon: lon,
                driverLocAt: new Date().toISOString(),
                driverLocName: 'Safarini'
            }).catch(() => {});
        }
    };

    navigator.geolocation.getCurrentPosition(push, () => {});
    if (liveWatchId) { try { navigator.geolocation.clearWatch(liveWatchId); } catch(e){} }
    liveWatchId = navigator.geolocation.watchPosition(push, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 });
};

// DEREVA: acha kushirikisha location live (last location inabaki kama kumbukumbu)
window.stopSharingMyLocation = function() {
    try {
        if (liveWatchId) { navigator.geolocation.clearWatch(liveWatchId); }
    } catch (e) {}
    liveWatchId = null;
    alert(" Umeshacha kushirikisha location live. Mahali pa mwisho palibaki kwa mnunuzi.");
};
