/* ==== js/app/27-route-dispatch.js ==== */
// ============================================================
// ROUTE DISPATCH — Kutaarifu vyombo vya usafiri vinavyotumia
// route husika kila kunapotokea ombi jipya la usafiri
// (ikiwemo legi za kati / intermediate deliveries).
//
// Utaratibu:
//   1) Tafuta madereva wenye chombo sawa + route inayopita
//      eneo la kutoka / kufika (pickupRegion, destinationRegion,
//      fullRoute) — "around the area".
//   2) Tumia kila dereva anayelingana taarifa (notification).
//   3) Kama HAKUNA dereva anayelingana → arifu Mawakala wa
//      SokoHai (agents) wa mkoa/eneo husika.
//   4) Kama hakuna hata wakala → arifu mteja tu.
// ============================================================
import { skh } from './00-bootstrap.js';

// ---------- Msaada wa kulinganisha maandishi ----------
function norm(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function contains(a, b) {
    a = norm(a); b = norm(b);
    if (!a || !b) return false;
    return a.indexOf(b) !== -1 || b.indexOf(a) !== -1;
}

// Kata route kamili ("Dar ➔ Moro ➔ Dom ➔ Mwanza") kuwa vituo
function splitStops(route) {
    return String(route || '')
        .split(/[➔→>—-]|,|\/|\|/)
        .map(norm)
        .filter(Boolean);
}

// ---------- Kagua ni ncha zipi za njia dereva anazipita ----------
// Hurudisha { origin:bool, dest:bool } — score ya juu zaidi akipita ZOTE.
window.skhRouteMatchEnds = function (driver, fromLoc, toLoc) {
    if (!driver) return { origin: false, dest: false };
    const f = norm(fromLoc);
    const t = norm(toLoc);
    const pickup = norm(driver.pickupRegion || driver.fromRegion || '');
    const dest = norm(driver.destinationRegion || driver.toRegion || '');
    const route = norm(driver.fullRoute || driver.route || '');
    const stops = splitStops(driver.fullRoute || driver.route || '');

    function stopHit(loc) {
        return contains(route, loc) || stops.some(s => contains(s, loc) || contains(loc, s));
    }
    let originOk = false, destOk = false;
    if (f) originOk = stopHit(f) || contains(pickup, f);
    if (t) destOk = stopHit(t) || contains(dest, t);
    return { origin: originOk, dest: destOk };
};

// ---------- Kagua kama dereva anapita eneo la kutoka/kufika ----------
window.skhRouteMatchesDriver = function (driver, fromLoc, toLoc) {
    if (!driver) return false;
    const f = norm(fromLoc);
    const t = norm(toLoc);
    if (!f && !t) return false;
    const m = window.skhRouteMatchEnds(driver, fromLoc, toLoc);
    // Dereva anapita eneo la kutoka AU la kufika → yuko "around the area"
    return m.origin || m.dest;
};

// ---------- Tuma taarifa (notification) ----------
function pushNotif(userId, title, body, type, rideId) {
    if (!userId) return Promise.resolve();
    return skh.addDoc(skh.collection(skh.db, "notifications"), {
        userId: userId,
        title: title,
        body: body,
        createdAt: new Date().toISOString(),
        read: false,
        type: type || 'ride_request',
        rideId: rideId || null
    }).catch(() => {});
}

// ---------- KIDOKEZO KUU: sambaza ombi kwa vyombo husika ----------
window.skhDispatchRideToCarriers = async function (ride, rideId) {
    try {
        const fromLoc = String(ride.fromLocation || '');
        const toLoc = String(ride.toLocation || '');
        const vehicleType = String(ride.vehicleType || '');
        const cargo = String(ride.cargoName || (ride.reqCategory === 'Passengers' ? 'Abiria' : 'Mzigo'));
        const isLeg = !!(ride.parentRideId || ride.isIntermediateLeg);
        const legLabel = isLeg ? ' (Legi ya Kati / Intermediate)' : '';
        const routeText = fromLoc + ' → ' + toLoc;

        // 1) Madereva wa chombo hicho
        const q = skh.query(
            skh.collection(skh.db, "drivers"),
            skh.where("vehicleType", "==", vehicleType),
            skh.limit(150)
        );
        const snap = await skh.getDocs(q);

        const matched = [];
        snap.forEach(d => {
            const dr = d.data();
            if (dr.online === false) return;                 // hayupo online
            if (dr.userId === (skh.currentUser && skh.currentUser.uid)) return; // mwombaji mwenyewe
            if (window.skhRouteMatchesDriver(dr, fromLoc, toLoc)) {
                matched.push(dr);
            }
        });

        // 2) Madereva wamepatikana → wape taarifa
        if (matched.length) {
            const tops = matched.slice(0, 12);
            await Promise.all(tops.map(dr =>
                pushNotif(
                    dr.userId,
                    ' Ombi Jipya la Usafiri' + legLabel + ' — Route Yako',
                    cargo + ' | ' + routeText + '. Fungua "Requests Marketplace" kukubali kazi.',
                    'ride_request',
                    rideId
                )
            ));
            await pushNotif(
                ride.customerId,
                ' Madereva Wamearifiwa',
                'Ombi lako (' + cargo + ') limetumwa kwa madereva ' + matched.length + ' wanaotumia route hiyo.',
                'delivery',
                rideId
            );
            return { ok: true, drivers: matched.length, agents: 0 };
        }

        // 3) Hakuna dereva → tumia Mawakala wa SokoHai wa eneo husika
        const aq = skh.query(
            skh.collection(skh.db, "agents"),
            skh.where("status", "==", "approved"),
            skh.limit(100)
        );
        const asnap = await skh.getDocs(aq);
        const agents = [];
        asnap.forEach(a => {
            const ag = a.data();
            const loc = norm(ag.location || ag.region || '');
            if (!loc) return;
            const hitOrigin = contains(loc, fromLoc) || contains(fromLoc, loc);
            const hitDest = contains(loc, toLoc) || contains(toLoc, loc);
            if (hitOrigin || hitDest) agents.push(ag);
        });

        if (agents.length) {
            const tops = agents.slice(0, 10);
            await Promise.all(tops.map(ag =>
                pushNotif(
                    ag.userId,
                    ' Ombi la Usafiri Halina Dereva (Eneo Lako)',
                    cargo + ' | ' + routeText + '. Tafuta msafirishaji wa eneo lako au wasiliana na mteja.',
                    'ride_request',
                    rideId
                )
            ));
            await pushNotif(
                ride.customerId,
                ' Wawakala Wamearifiwa',
                'Hakuna dereva wa moja kwa moja kwenye route hiyo bado. Wawakala wa SokoHai wa eneo lako wamearifiwa kukusaidia kupata msafirishaji.',
                'delivery',
                rideId
            );
            return { ok: true, drivers: 0, agents: agents.length };
        }

        // 4) Hakuna dereva wala wakala → arifu mteja tu
        await pushNotif(
            ride.customerId,
            ' Ombi Limewekwa Sokoni',
            'Ombi lako linaonekana kwenye soko la usafiri. Madereva watakubali mara tu wanapokuwa online.',
            'delivery',
            rideId
        );
        return { ok: true, drivers: 0, agents: 0 };
    } catch (e) {
        console.warn('[route-dispatch]', e && e.message);
        return { ok: false, error: e && e.message };
    }
};

/* ============================================================
   ROUTE MATCHER (2026-09) — badala ya kutangaza ombi kwa upofu:
   mteja anaweka NJIA + vigezo vya mzigo/abiria, SokoHai
   anafanya FILTER ya magari ('drivers') na kumwonesha yale
   yanayopitia route yake (kundi: vinafaa / mapendekezo), kisha
   anafungua MAJADILIANO na msafirishaji aliyemchagua.
   Mfumo wa zamani wa broadcast unabaki kama njia ya pili tu.
   ============================================================ */

// Ramani ya kundi la ombi → huduma anazotakiwa chombo kubeba
function skhRmServiceWanted(category) {
    switch (String(category || '').toLowerCase()) {
        case 'passengers': return ['passenger'];
        case 'livestock': return ['cargo', 'livestock'];
        case 'cargo':
        default: return ['cargo', 'product'];
    }
}

// Uzito wa uwezo wa chombo (maxWeight) kwenda KG; null kama haujulikana
function skhRmCapacityKg(dr) {
    const raw = String(dr.maxWeight || dr.capacity || '');
    const m = raw.match(/([\d.,]+)/);
    if (!m) return null;
    let n = parseFloat(m[1].replace(/,/g, '.'));
    if (!isFinite(n)) return null;
    if (/ton|tani|tonne|\bt\b/i.test(raw) && n < 200) n *= 1000; // tani → kg
    return n;
}

// ---------- Soma vigezo kutoka modali ya kuomba usafiri ----------
window.skhRouteMatcherReadForm = function () {
    const val = function (id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    const crit = {
        category: val('rideReqCategory'),
        vehicleType: val('rideReqType'),
        from: val('rideReqFrom') || (sessionStorage.getItem('chain_from') || ''),
        to: val('rideReqTo'),
        cargoName: val('cargoName') || (sessionStorage.getItem('chain_cargo_name') || ''),
        weight: parseFloat(val('cargoWeight')) || 0,
        pax: parseInt(val('ridePaxCount')) || 0,
        fragile: !!document.getElementById('isFragile') && document.getElementById('isFragile').checked
    };
    if (crit.category === 'Passengers' && !crit.cargoName) {
        crit.cargoName = 'Abiria ' + (crit.pax || 1);
    }
    return crit;
};

// ---------- Pima gari moja dhidi ya vigezo ----------
// score 0 = halingani kabisa. exact = linapita NJIA NZIMA + chombo/uwezo.
window.skhRouteMatcherScoreDriver = function (dr, crit) {
    if (!dr || dr.online === false) return null;
    if (String(dr.userId || '') === String((skh.currentUser && skh.currentUser.uid) || '')) return null;

    const ends = window.skhRouteMatchEnds(dr, crit.from, crit.to);
    const routeScore = (ends.origin ? 1 : 0) + (ends.dest ? 1 : 0);
    if (routeScore === 0) return null; // hategemei route hata kidogo

    const services = (dr.supportedServices || []).map(s => norm(s));
    const wanted = skhRmServiceWanted(crit.category);
    const serviceOk = !crit.category
        || services.length === 0
        || wanted.some(w => services.some(s => s.indexOf(w) !== -1 || w.indexOf(s) !== -1));

    const vehicleOk = !crit.vehicleType || norm(dr.vehicleType) === norm(crit.vehicleType);

    let capacityOk = true;
    if (crit.weight > 0) {
        const cap = skhRmCapacityKg(dr);
        if (cap != null) capacityOk = cap >= crit.weight;
    }

    // "Linafaa kabisa": lazima lipite ncha ZOTE za njia + chombo/huduma/uwezo.
    // La ncha moja (asili au mwisho tu) huwa pendekezo la route.
    const exact = (routeScore === 2) && vehicleOk && serviceOk && capacityOk;
    // Panga: njia kamili kwanza, bei nafuu, alama ya juu.
    const rating = parseFloat(dr.rating) || 0;
    const price = parseFloat(dr.price) || 0;
    let score = routeScore * 100 + rating * 10 - (price ? Math.min(price / 100000, 20) : 0);
    if (ends.origin && ends.dest) score += 25;
    if (dr.verified === true || dr.verificationStatus === 'verified') score += 5;
    if (dr.online === true) score += 3;
    return { score: score, exact: exact, routeScore: routeScore,
             vehicleOk: vehicleOk, serviceOk: serviceOk, capacityOk: capacityOk };
};

// ---------- Panga orodha yote: vinafaa / mapendekezo ya route ----------
window.skhRouteMatcherRank = function (drivers, crit) {
    const exact = [], alt = [];
    (drivers || []).forEach(function (dr) {
        const m = window.skhRouteMatcherScoreDriver(dr, crit);
        if (!m) return;
        dr._rm = m;
        (m.exact ? exact : alt).push(dr);
    });
    exact.sort(function (a, b) { return b._rm.score - a._rm.score; });
    alt.sort(function (a, b) { return b._rm.score - a._rm.score; });
    return { exact: exact, alt: alt.slice(0, 8) };
};

// ---------- Vuta magari kutoka Firestore na kuyapanga ----------
window.skhRouteMatchVehicles = async function (crit) {
    const snap = await skh.getDocs(skh.query(skh.collection(skh.db, 'drivers'), skh.limit(400)));
    const drivers = [];
    snap.forEach(function (d) { drivers.push(Object.assign({ id: d.id }, d.data())); });
    return window.skhRouteMatcherRank(drivers, crit);
};

// ---------- Ikoni ndogo (SVG — hakuna emoji) ----------
function rmIco(name, size) {
    return (window.skhNavIcon ? window.skhNavIcon(name, size || 14) : '');
}
function rmEsc(s) { return (skh.skhEscape ? skh.skhEscape(s) : String(s == null ? '' : s)); }
function rmMoney(n) {
    n = parseFloat(n);
    if (!isFinite(n) || n <= 0) return 'Maelewano';
    return 'Kuanzia TSh ' + Math.round(n).toLocaleString();
}

// ---------- Kadi ya gari kwenye matokeo ----------
window.skhRouteMatcherCard = function (dr, crit) {
    const img = dr.image || window.SKH_PLACEHOLDER_IMG || '';
    const from = dr.pickupRegion || dr.fromRegion || '…';
    const to = dr.destinationRegion || dr.toRegion || '…';
    const name = rmEsc(dr.title || dr.driverName || 'Msafirishaji');
    const verified = (dr.verified === true || dr.verificationStatus === 'verified')
        ? '<span class="rm-verified" title="Imethibitishwa">' + rmIco('shield-check', 12) + '</span>' : '';
    const online = (dr.online === true) ? '<span class="rm-online"><i></i> yuko online</span>' : '';
    const rating = parseFloat(dr.rating) > 0
        ? '<span class="rm-rating">' + rmIco('star', 12) + ' ' + Number(dr.rating).toFixed(1) + '</span>' : '';
    const chips = [];
    if (dr.vehicleType) chips.push('<span class="rm-chip">' + rmIco('truck', 12) + ' ' + rmEsc(dr.vehicleType) + '</span>');
    if (dr.maxWeight) chips.push('<span class="rm-chip">' + rmIco('scales', 12) + ' ' + rmEsc(dr.maxWeight) + '</span>');
    if (dr.supportedServices && dr.supportedServices.length) {
        chips.push('<span class="rm-chip">' + rmIco('package', 12) + ' ' + rmEsc(dr.supportedServices.slice(0, 3).join(', ')) + '</span>');
    }
    const warn = (!dr._rm.vehicleOk || !dr._rm.capacityOk)
        ? '<span class="rm-warn">' + rmIco('alert', 12) + ' Chombo/uwezo tofauti na ombi — wasiliana upate uhakika</span>' : '';

    return '<div class="rm-card">'
        + '<button type="button" class="rm-img" onclick="openProduct(\'' + skh.skhJsEsc(dr.id) + '\',\'drivers\')" aria-label="Fungua wasifu wa chombo">'
        +   '<img src="' + rmEsc(skh.getOptimizedImageUrl ? skh.getOptimizedImageUrl(img) : img) + '" loading="lazy" alt="" onerror="this.onerror=null;this.src=window.SKH_PLACEHOLDER_IMG||\'\';">'
        + '</button>'
        + '<div class="rm-body">'
        +   '<div class="rm-name"><b>' + name + '</b>' + verified + online + '</div>'
        +   '<div class="rm-route">' + rmIco('map', 13) + '<span>' + rmEsc(from) + '</span>'
        +     '<span class="rm-arrow">' + rmIco('arrow-right', 13) + '</span><span>' + rmEsc(to) + '</span></div>'
        +   '<div class="rm-meta"><span class="rm-price">' + rmMoney(dr.price) + '</span>' + rating + '</div>'
        +   '<div class="rm-chips">' + chips.join('') + '</div>'
        +   warn
        + '</div>'
        + '<div class="rm-actions">'
        +   '<button type="button" class="rm-btn rm-btn-light" onclick="openProduct(\'' + skh.skhJsEsc(dr.id) + '\',\'drivers\')">' + rmIco('search', 14) + ' Tazama</button>'
        +   '<button type="button" class="rm-btn rm-btn-primary" onclick="window.skhRouteMatcherChoose(\'' + skh.skhJsEsc(dr.id) + '\')">' + rmIco('chat', 14) + ' Jadili nafasi na bei</button>'
        + '</div></div>';
};

// ---------- Weka icons/kufunga (hakuna emoji) ----------
window.skhRouteMatcherInit = function () {
    const hi = document.getElementById('rmHeadIcon');
    if (hi && !hi.dataset.set) { hi.innerHTML = rmIco('filter', 20); hi.dataset.set = '1'; }
    const bi = document.getElementById('rmBroadcastIco');
    if (bi && !bi.dataset.set) { bi.innerHTML = rmIco('send', 13); bi.dataset.set = '1'; }
    const cb = document.getElementById('rmCloseBtn');
    if (cb && !cb.dataset.bound) {
        cb.addEventListener('click', function () {
            document.getElementById('routeMatchModal').style.display = 'none';
        });
        cb.dataset.bound = '1';
    }
};

// ---------- Tafuta na fungua matokeo ----------
window.skhRouteMatcherSearch = async function () {
    if (!skh.requireAuth || !skh.requireAuth()) return;
    const crit = window.skhRouteMatcherReadForm();
    if (!crit.from || !crit.to) { alert('Tafadhali jaza sehemu ya KUTOKEA na ya KWENDA.'); return; }

    window.skhRouteMatcherInit();
    const modal = document.getElementById('routeMatchModal');
    const box = document.getElementById('rmResults');
    const critBox = document.getElementById('rmCrit');
    if (!modal || !box) return;
    document.getElementById('rideRequestModal').style.display = 'none';
    modal.style.display = 'flex';
    critBox.innerHTML = '<span class="rm-crit-chip">' + rmIco('map', 13) + ' ' + rmEsc(crit.from)
        + '<span class="rm-crit-arrow">' + rmIco('arrow-right', 13) + '</span>' + rmEsc(crit.to) + '</span>'
        + (crit.vehicleType ? '<span class="rm-crit-chip">' + rmIco('truck', 13) + ' ' + rmEsc(crit.vehicleType) + '</span>' : '')
        + (crit.category ? '<span class="rm-crit-chip">' + rmIco('package', 13) + ' ' + rmEsc(crit.category) + '</span>' : '')
        + (crit.weight ? '<span class="rm-crit-chip">' + rmIco('scales', 13) + ' ' + crit.weight + ' kg</span>' : '');
    box.innerHTML = '<div class="rm-loading"><span class="rm-spinner" aria-hidden="true"></span> SokoHai anachambua magari kwenye route hiyo…</div>';

    try {
        const res = await window.skhRouteMatchVehicles(crit);
        window.__skhRouteMatcher = { crit: crit, drivers: {} };
        res.exact.concat(res.alt).forEach(function (dr) { window.__skhRouteMatcher.drivers[dr.id] = dr; });

        let html = '';
        if (res.exact.length) {
            html += '<h3 class="rm-group-title">' + rmIco('check', 14) + ' Vinafaa kabisa (' + res.exact.length + ')</h3>'
                + '<div class="rm-group">' + res.exact.map(function (dr) { return window.skhRouteMatcherCard(dr, crit); }).join('') + '</div>';
        }
        if (res.alt.length) {
            html += '<h3 class="rm-group-title rm-group-title--alt">' + rmIco('target', 14) + ' Mapendekezo — magari ya route hii yenye chombo tofauti (' + res.alt.length + ')</h3>'
                + '<div class="rm-group">' + res.alt.map(function (dr) { return window.skhRouteMatcherCard(dr, crit); }).join('') + '</div>';
        }
        if (!html) {
            html = '<div class="rm-empty">'
                + '<span class="rm-empty-ic">' + rmIco('search', 30) + '</span>'
                + '<b>Hatujapata gari linalopitia route hiyo kwa vigezo vyako</b>'
                + '<p>Unaweza kutangaza ombi kwa madereva na mawakala wa eneo lako — mwenye nafasi atakujibua kupitia SokoHai.</p>'
                + '</div>';
        }
        box.innerHTML = html;
        const foot = document.getElementById('rmFooter');
        if (foot) foot.style.display = '';
    } catch (e) {
        box.innerHTML = '<div class="rm-empty"><b>Imeshindikana kupakia magari</b><p>' + rmEsc(e && e.message) + '</p></div>';
    }
};

// ---------- Chagua gari → fungua MAJADILIANO (injini ya nego) ----------
window.skhRouteMatcherChoose = function (driverId) {
    const mem = window.__skhRouteMatcher || {};
    const dr = (mem.drivers || {})[driverId];
    const crit = mem.crit || window.skhRouteMatcherReadForm();
    if (!dr) return;

    const entity = {
        id: dr.id,
        collectionName: 'drivers',
        title: dr.title || dr.driverName || 'Usafiri',
        image: dr.image || '',
        price: dr.price || 0,
        sellerId: dr.userId || dr.sellerId || '',
        sellerName: dr.driverName || dr.ownerName || '',
        vehicleType: crit.vehicleType || dr.vehicleType || '',
        route: { from: crit.from || dr.pickupRegion || '', to: crit.to || dr.destinationRegion || '' },
        fromLocation: crit.from || dr.pickupRegion || '',
        toLocation: crit.to || dr.destinationRegion || '',
        packageDescription: crit.cargoName || '',
        weight: crit.weight || null
    };
    const modal = document.getElementById('routeMatchModal');
    if (modal) modal.style.display = 'none';
    if (typeof window.closeModals === 'function') window.closeModals();
    if (typeof window.skhNegoFormOpen === 'function') {
        window.skhNegoFormOpen({ type: 'transport', entity: entity });
    } else if (typeof window.openDirectHire === 'function') {
        window.openDirectHire(entity.sellerId, entity.sellerName, entity.vehicleType);
    }
};

// ---------- Broadcast (njia ya pili) kutoka kwenye matokeo ----------
window.skhRouteMatcherBroadcast = function () {
    const modal = document.getElementById('routeMatchModal');
    if (modal) modal.style.display = 'none';
    if (typeof window.broadcastRideRequest === 'function') {
        window.broadcastRideRequest();
    }
};
