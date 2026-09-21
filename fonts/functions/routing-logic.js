'use strict';
/* ============================================================
 * SOKOHAI — REQUEST ROUTING LOGIC (2026-09)
 * ============================================================
 * Mantiki TAKATIFU (bila Firebase / DOM / madirisha) ya injini ya
 * kupeleka maombi ya usafiri kwa mawakala/madereva wanaostahili:
 *
 *   Request → Routing → Eligible Agents → Offer/Assignment
 *          → Agent Acceptance → (custody: Token chain) → Execution
 *
 * Kanuni za kulinganisha ni ZILE ZILE za matcher wa mteja
 * (js/app/27-route-dispatch.js): ncha za njia, aina ya chombo,
 * huduma, uwezo (tani→kg), hali ya kuwepo mtandaoni, alama/bei —
 * hapa zinatekelezwa upande wa SERVER ili ofa/assignment iwe ya
 * mamlaka (client haiwezi kujigawa kazi yenyewe).
 *
 * Mzunguko wa ofa (state machine) pia uko hapa ili uweze kupimwa:
 *   offered (mmoja hai) → waliosalia waiting
 *     · akikubali  → accepted, nyingine cancelled
 *     · akikataa   → declined, mwingine afunguliwe (offered)
 *     · muda ukiisha → expired, mwingine afunguliwe
 *     · wote wakiisha/waikatae → failed_assignment (soko la jumla)
 * ============================================================ */

// Muda wa jibu la ofa inayofuata kabla haijahamia kwa mwingine.
const OFFER_TTL_MS = 30 * 60 * 1000;        // dakika 30
const MAX_OFFERS_PER_ROUND = 5;

const OFFER = {
    WAITING: 'waiting',       // amechaguliwa lakini bado haijafika zamu yake
    OFFERED: 'offered',       // ofa HAI kwake (mmoja tu kwa wakati)
    ACCEPTED: 'accepted',     // amekubali → amepata assignment
    DECLINED: 'declined',     // amekataa kwa hiari
    EXPIRED: 'expired',       // hakujibu ndani ya muda
    CANCELLED: 'cancelled'    // mwingine amekabidhiwa / mzunguko umefungwa
};

const TERMINAL = [OFFER.ACCEPTED, OFFER.DECLINED, OFFER.EXPIRED, OFFER.CANCELLED];

/* ------------------ maandishi / njia ------------------ */

function norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function contains(a, b) {
    a = norm(a); b = norm(b);
    if (!a || !b) return false;
    return a.indexOf(b) !== -1 || b.indexOf(a) !== -1;
}

// Kata njia kamili ("Dar → Moro → Mwanza") kuwa vituo.
function splitStops(route) {
    return String(route == null ? '' : route)
        .split(/[➔→>—\-_,/|]+/)
        .map(norm)
        .filter(Boolean);
}

// Ni ncha zipi za ombi mgombeaji anazipita? {origin, dest}
function matchEnds(cand, fromLoc, toLoc) {
    if (!cand) return { origin: false, dest: false };
    const f = norm(fromLoc);
    const t = norm(toLoc);
    const pickup = norm(cand.pickupRegion || cand.fromRegion || cand.location || cand.region || '');
    const dest = norm(cand.destinationRegion || cand.toRegion || '');
    const route = norm(cand.fullRoute || cand.route || '');
    const stops = splitStops(cand.fullRoute || cand.route);

    function stopHit(loc) {
        if (!loc) return false;
        if (contains(route, loc)) return true;
        return stops.some(s => contains(s, loc) || contains(loc, s));
    }

    let originOk = false;
    let destOk = false;
    if (f) originOk = stopHit(f) || contains(pickup, f);
    if (t) destOk = stopHit(t) || contains(dest, t);
    return { origin: originOk, dest: destOk };
}

// Aina ya ombi → huduma zinazotakiwa kwa chombo.
function serviceWanted(category) {
    switch (String(category || '').toLowerCase()) {
        case 'passengers': return ['passenger'];
        case 'livestock': return ['cargo', 'livestock'];
        case 'cargo':
        default: return ['cargo', 'product'];
    }
}

// Uwezo wa chombo kwenda KG; null kama haujulikani.
function capacityKg(cand) {
    const raw = String((cand && (cand.maxWeight || cand.capacity)) || '');
    const m = raw.match(/([\d.,]+)/);
    if (!m) return null;
    let n = parseFloat(m[1].replace(/,/g, '.'));
    if (!isFinite(n)) return null;
    if (/ton|tani|tonne|\bt\b/i.test(raw) && n < 200) n *= 1000; // tani → kg
    return n;
}

/* ------------------ kipimo cha mgombeaji mmoja ------------------
 * cand: { uid, kind: 'driver'|'agent', online, rating, price, ... }
 * req : { from, to, category, vehicleType, weight, excludeUid }
 *
 * Hurudisha null asipostahili hata kidogo; vinginevyo
 * { score, exact, routeScore, vehicleOk, serviceOk, capacityOk }.
 * ---------------------------------------------------------------- */

function scoreCandidate(cand, req) {
    if (!cand || !cand.uid) return null;
    req = req || {};
    if (cand.online === false) return null;
    if (req.excludeUid && String(cand.uid) === String(req.excludeUid)) return null;

    // Mawakala: hupimwa kwa ENEO (wanapanga wengine), si chombo —
    // lakini wao ni safu ya pili (waangaliwe tu hakuna chombo).
    if (cand.kind === 'agent') {
        const base = norm(cand.location || cand.region || '');
        if (cand.status && String(cand.status) !== 'approved') return null;
        if (!base) return null;
        const hitOrigin = req.from && (contains(base, req.from));
        const hitDest = req.to && (contains(base, req.to));
        const routeScore = (hitOrigin ? 1 : 0) + (hitDest ? 1 : 0);
        if (routeScore === 0) return null;
        const rating = parseFloat(cand.rating) || 0;
        const score = routeScore * 50 + rating * 5;
        return {
            score: score, exact: false, routeScore: routeScore,
            vehicleOk: true, serviceOk: true, capacityOk: true, isAgent: true
        };
    }

    const ends = matchEnds(cand, req.from, req.to);
    const routeScore = (ends.origin ? 1 : 0) + (ends.dest ? 1 : 0);
    if (routeScore === 0) return null;

    const services = (cand.supportedServices || []).map(norm);
    const wanted = serviceWanted(req.category);
    const serviceOk = !req.category
        || services.length === 0
        || wanted.some(w => services.some(s => s.indexOf(w) !== -1 || w.indexOf(s) !== -1));

    const vehicleOk = !req.vehicleType || norm(cand.vehicleType) === norm(req.vehicleType);

    let capacityOk = true;
    if (Number(req.weight) > 0) {
        const cap = capacityKg(cand);
        if (cap != null) capacityOk = cap >= Number(req.weight);
    }

    // "Vinafaa kabisa": ncha ZOTE + chombo/huduma/uwezo.
    const exact = (routeScore === 2) && vehicleOk && serviceOk && capacityOk;
    const rating = parseFloat(cand.rating) || 0;
    const price = parseFloat(cand.price) || 0;
    let score = routeScore * 100 + rating * 10 - (price ? Math.min(price / 100000, 20) : 0);
    if (ends.origin && ends.dest) score += 25;
    if (cand.verified === true || cand.verificationStatus === 'verified') score += 5;
    if (cand.online === true) score += 3;
    return {
        score: score, exact: exact, routeScore: routeScore,
        vehicleOk: vehicleOk, serviceOk: serviceOk, capacityOk: capacityOk, isAgent: false
    };
}

/* ------------------ panga wagombeaji wote ------------------
 * Madereva huwa VINAFAAA/MAPENDEKEZO; mawakala ni safu ya pili
 * (wakati hakuna dereva hata mmoja anayepitia route).
 * ---------------------------------------------------------- */

function rankCandidates(candidates, req) {
    const drivers = [];
    const agents = [];
    (candidates || []).forEach(function (c) {
        const m = scoreCandidate(c, req);
        if (!m) return;
        c._m = m;
        (c.kind === 'agent' ? agents : drivers).push(c);
    });
    drivers.sort(function (a, b) { return b._m.score - a._m.score; });
    agents.sort(function (a, b) { return b._m.score - a._m.score; });
    const exact = drivers.filter(d => d._m.exact);
    const alt = drivers.filter(d => !d._m.exact);
    return {
        exact: exact,
        alt: alt,
        // wagombea wa kutumia: madereva kwanza; agents ikiwa hakuna dereva.
        chosen: (drivers.length ? drivers : agents).slice(0, MAX_OFFERS_PER_ROUND),
        drivers: drivers,
        agents: agents
    };
}

/* ============================================================
 * STATE MACHINE ya ofa — hupokea hali ya sasa na kitendo,
 * hurudisha mabadiliko yanayotakiwa (bila kugusa Firestore):
 *   { updates: {offerId: {status, expiresAt, offeredAt, ...}},
 *     ridePatch: {...}, notify: [uid...], accepted: uid|null }
 * ============================================================ */

function offerById(offers, id) {
    return (offers || []).find(o => String(o.id) === String(id)) || null;
}

// Chagua ofa inayofaa kufunguliwa baada ya nafasi ya wazi.
function nextWaiting(offers) {
    return (offers || [])
        .filter(o => o.status === OFFER.WAITING)
        .sort((a, b) => (a.rank || 0) - (b.rank || 0))[0] || null;
}

function activeOffered(offers) {
    return (offers || []).filter(o => o.status === OFFER.OFFERED
        && (!o.expiresAt || Date.parse(o.expiresAt) > Date.now()))[0] || null;
}

// Kufungua ofa inayokuja (waiting → offered).
function openNextOffer(offers, updates, now) {
    const nxt = nextWaiting(offers);
    if (nxt) {
        const expiresAt = new Date(now + OFFER_TTL_MS).toISOString();
        updates[nxt.id] = Object.assign({}, updates[nxt.id], {
            status: OFFER.OFFERED, offeredAt: new Date(now).toISOString(), expiresAt: expiresAt
        });
        return { id: nxt.id, uid: nxt.agentId, expiresAt: expiresAt };
    }
    return null;
}

function transitionOffers(offers, action, now) {
    now = now || Date.now();
    action = action || { type: 'sweep' };
    const updates = {};
    const notify = [];
    let ridePatch = null;
    let accepted = null;
    const list = (offers || []).slice();

    function patchRide(p) { ridePatch = Object.assign({}, ridePatch, p); }

    // Tambua kama bado kuna assignment iliyokwisha fanyika.
    const alreadyAssigned = list.some(o => o.status === OFFER.ACCEPTED);

    if (action.type === 'accept') {
        const of = offerById(list, action.offerId);
        if (!of) throw new Error('offer_not_found');
        if (alreadyAssigned && of.status !== OFFER.ACCEPTED) throw new Error('ride_already_assigned');
        if (String(of.agentId) !== String(action.agentId)) throw new Error('not_your_offer');
        if (of.status !== OFFER.OFFERED) throw new Error('offer_not_active');
        if (of.expiresAt && Date.parse(of.expiresAt) <= now) throw new Error('offer_expired');

        updates[of.id] = Object.assign({}, updates[of.id], {
            status: OFFER.ACCEPTED, acceptedAt: new Date(now).toISOString()
        });
        accepted = of.agentId;
        list.forEach(function (o) {
            if (String(o.id) === String(of.id)) return;
            if ([OFFER.WAITING, OFFER.OFFERED].indexOf(o.status) !== -1) {
                updates[o.id] = Object.assign({}, updates[o.id], {
                    status: OFFER.CANCELLED, cancelledAt: new Date(now).toISOString(),
                    cancelReason: 'assigned_to_another'
                });
            }
        });
        patchRide({ assignmentStatus: 'assigned', assignedAgentId: of.agentId, activeOfferId: null });
    } else if (action.type === 'decline') {
        const of = offerById(list, action.offerId);
        if (!of) throw new Error('offer_not_found');
        if (String(of.agentId) !== String(action.agentId)) throw new Error('not_your_offer');
        if ([OFFER.ACCEPTED, OFFER.DECLINED, OFFER.EXPIRED, OFFER.CANCELLED].indexOf(of.status) !== -1) {
            throw new Error('offer_not_active');
        }
        const wasActive = of.status === OFFER.OFFERED;
        updates[of.id] = Object.assign({}, updates[of.id], {
            status: OFFER.DECLINED, declinedAt: new Date(now).toISOString()
        });
        // Futa ofa hii kwenye orodha ya kazi ili isijirudie mzunguko huu.
        const idx = list.findIndex(o => String(o.id) === String(of.id));
        if (idx !== -1) list[idx] = Object.assign({}, list[idx], { status: OFFER.DECLINED });
        if (wasActive) {
            const opened = openNextOffer(list, updates, now);
            if (opened) notify.push(opened.uid);
            else patchRide({ assignmentStatus: 'failed_assignment', activeOfferId: null });
        }
    } else if (action.type === 'sweep') {
        // Mwisho-mwisho wa muda: offered zilizoisha → expired, kisha fungua nyingine.
        let expiredAny = false;
        list.forEach(function (o) {
            if (o.status === OFFER.OFFERED && o.expiresAt && Date.parse(o.expiresAt) <= now) {
                updates[o.id] = Object.assign({}, updates[o.id], {
                    status: OFFER.EXPIRED, expiredAt: new Date(now).toISOString()
                });
                const idx = list.findIndex(x => String(x.id) === String(o.id));
                if (idx !== -1) list[idx] = Object.assign({}, list[idx], { status: OFFER.EXPIRED });
                expiredAny = true;
            }
        });
        if (expiredAny || action.force) {
            if (!list.some(o => o.status === OFFER.OFFERED)) {
                const opened = openNextOffer(list, updates, now);
                if (opened) notify.push(opened.uid);
                else if (!list.some(o => [OFFER.WAITING, OFFER.OFFERED].indexOf(o.status) !== -1)) {
                    // wote wameisha/wamekataa/ghairiwa na hakuna aliyekubali
                    if (!alreadyAssigned) patchRide({ assignmentStatus: 'failed_assignment', activeOfferId: null });
                }
            }
        }
    } else if (action.type === 'cancel_round') {
        list.forEach(function (o) {
            if ([OFFER.WAITING, OFFER.OFFERED].indexOf(o.status) !== -1) {
                updates[o.id] = Object.assign({}, updates[o.id], {
                    status: OFFER.CANCELLED, cancelledAt: new Date(now).toISOString(),
                    cancelReason: action.reason || 'round_closed'
                });
            }
        });
        patchRide({ activeOfferId: null });
    } else {
        throw new Error('unknown_action');
    }

    return { updates: updates, ridePatch: ridePatch, notify: notify, accepted: accepted };
}

// Je, mzunguko umefeli (kila ofa ni terminal, hakuna aliyekubali)?
function roundFailed(offers) {
    if (!offers || !offers.length) return false;
    const accepted = offers.some(o => o.status === OFFER.ACCEPTED);
    if (accepted) return false;
    return offers.every(o => TERMINAL.indexOf(o.status) !== -1);
}

module.exports = {
    OFFER_TTL_MS: OFFER_TTL_MS,
    MAX_OFFERS_PER_ROUND: MAX_OFFERS_PER_ROUND,
    OFFER: OFFER,
    TERMINAL: TERMINAL,
    norm: norm,
    contains: contains,
    splitStops: splitStops,
    matchEnds: matchEnds,
    serviceWanted: serviceWanted,
    capacityKg: capacityKg,
    scoreCandidate: scoreCandidate,
    rankCandidates: rankCandidates,
    transitionOffers: transitionOffers,
    roundFailed: roundFailed,
    activeOffered: activeOffered
};
