/* [SOKOHURU 2026-11-21] Launch scope in the browser.
 *
 * SokoHai launches as the free marketplace "SokoHuru": register, browse, search, post for free, edit/archive own
 * listings, contact the seller, report a listing, admin moderation, and paid promotions verified by hand.
 * Auction, Price Drop, Group Buy, wallet, escrow, checkout and delivery booking are OFF.
 *
 * THIS FILE IS NOT THE SECURITY CONTROL. The switches are enforced by firestore.rules (system/launch) and by
 * functions/launch-gates.js. This module only keeps the interface honest: disabled actions show a clear message
 * instead of a form that the server will refuse, and disabled sale modes are not offered.
 *
 * Flag resolution (same meaning as the server):
 *   system/launch.<flag> boolean (readable when signed in)  >  SOKOHAI_CONFIG.LAUNCH defaults (production hosts)
 *   On the local emulator the historic behaviour stays unless ?launchScope=sokohuru is in the URL.
 * Nothing is deleted: the original functions are kept and run unchanged once a feature is switched on. */
import { skh } from './00-bootstrap.js';

const CFG = (window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.LAUNCH) || {};
const LABEL = {
    auction: 'Mnada', priceDrop: 'Bei Kushuka', groupBuy: 'Nunua Pamoja (Group Buy)', wallet: 'Wallet (kuweka na kutoa pesa)',
    escrow: 'SokoPay / Escrow', checkout: 'Malipo ndani ya programu', delivery: 'Kuagiza usafiri', paidEntitlements: 'Malipo ya ada',
    promotionsManual: 'Matangazo ya kulipia'
};
let remote = null;

function scoped() {
    if (!skh.emulator) return String(CFG.scope || '') === 'sokohuru';
    try { return new URLSearchParams(window.location.search).get('launchScope') === 'sokohuru'; } catch (e) { return false; }
}
function enabled(f) {
    if (remote && typeof remote[f] === 'boolean') return remote[f];
    if (f === 'promotionsManual') return CFG.promotionsManual === true;      // opt-in only
    if (!scoped()) return true;
    return CFG[f] === true;
}
function say(msg) {
    if (typeof window.skhToast === 'function') window.skhToast(msg, 'info', 5000); else alert(msg);
}
function notify(f) {
    say((LABEL[f] || 'Huduma hii') + ' haijawashwa kwenye SokoHuru kwa sasa. Unaweza kuweka bidhaa bure, kutafuta bidhaa na kuwasiliana na muuzaji kwa chat.');
}
const esc = x => (skh.skhEscape ? skh.skhEscape(String(x == null ? '' : x)) : String(x == null ? '' : x).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'));
const uid = () => skh.currentUser && skh.currentUser.uid;
const nowIso = () => new Date().toISOString();

/* ---------------- 1. global entry points ---------------- */
const GUARDS = {
    checkout: ['checkoutSeriousMode', 'openCheckout', 'finalProceedCheckout', 'processPayment', 'skhPesaPalPay', 'skhOpenOrderCheckout', 'skhBuyNowProceed',
        'skhChatBuy', 'skhChatPay', 'skhChatPayNegoOrder', 'skhNegoCreateOrder', 'skhServiceOrderPay', 'skhWholesaleCheckout', 'confirmSmartCartOrder', 'skhTxPay'],
    escrow: ['proceedToPaySokoPay', 'executeSokoPayWalletPayment', 'skhPayCartFromWallet'],
    auction: ['placeBid', 'placeLiveBid', 'handleAuctionBid', 'skhAuctionPlaceBid', 'skhBidConfirm', 'skhAuctionWinnerCheckout'],
    priceDrop: ['skhPriceDropCheckout', 'skhPriceDropOffer', 'skhPriceDropOfferCheckout'],
    groupBuy: ['skhGroupBuyJoin', 'skhGroupBuyJoinAndCheckout', 'skhGroupOrderCreate', 'skhGroupOrderCreateFull', 'skhGroupOrderJoin', 'skhGroupOrderJoinFull', 'skhGroupOrderWizardOpen'],
    wallet: ['openSokoPayDeposit', 'processSokoPayDeposit', 'requestWithdrawal', 'skhWithdrawalRequest'],
    delivery: ['openRideRequestModal', 'broadcastRideRequest', 'directRequestTransporter', 'skhDeliveryRequestAny', 'skhDispatchRideToCarriers', 'skhPsBookTransport',
        'proceedToDeliverySelection', 'acceptTransportMission'],
    paidEntitlements: ['paySubscription', 'payForBoost']
};
const GUARDED = {};
for (const [f, names] of Object.entries(GUARDS)) for (const n of names) GUARDED[n] = f;

function guardFn(fn, name, feature) {
    if (typeof fn !== 'function' || fn.__skhLaunchGuard) return fn;
    const g = function (...args) {
        if (enabled(feature)) return fn.apply(this, args);
        if (name === 'payForBoost' && enabled('promotionsManual') && skh.activeBoostItem && skh.activeBoostItem.collectionName === 'products') {
            openPromotionSheet(skh.activeBoostItem.id); return undefined;
        }
        notify(feature);
        return undefined;
    };
    Object.defineProperty(g, '__skhLaunchGuard', { value: feature });
    Object.defineProperty(g, '__skhLaunchOriginal', { value: fn });
    return g;
}
function install(name, feature) {
    const d = Object.getOwnPropertyDescriptor(window, name);
    if (d && d.get && d.get.__skhLaunchAccessor) return;
    if (d && !d.configurable) { if (d.writable && typeof window[name] === 'function') window[name] = guardFn(window[name], name, feature); return; }
    let v = guardFn(window[name], name, feature);
    const get = function () { return v; };
    Object.defineProperty(get, '__skhLaunchAccessor', { value: true });
    Object.defineProperty(window, name, { configurable: true, enumerable: true, get, set(n) { v = guardFn(n, name, feature); } });
}
for (const [n, f] of Object.entries(GUARDED)) install(n, f);

// boost button: paid boosts go through the manual promotion request while PesaPal entitlements are off
(function () {
    const name = 'openBoostModal';
    let v = window[name];
    const wrap = fn => (typeof fn !== 'function' || fn.__skhLaunchGuard) ? fn : Object.defineProperty(function (id, collectionName) {
        if (enabled('paidEntitlements')) return fn.apply(this, arguments);
        if (enabled('promotionsManual') && (collectionName || 'products') === 'products') { openPromotionSheet(id); return; }
        notify('promotionsManual');
    }, '__skhLaunchGuard', { value: 'paidEntitlements' });
    v = wrap(v);
    try { Object.defineProperty(window, name, { configurable: true, enumerable: true, get: () => v, set: n => { v = wrap(n); } }); } catch (e) { window[name] = v; }
})();

// sale type chooser (113): disabled modes are refused
(function () {
    const MODE = { auction: 'auction', price_drop: 'priceDrop', group_buy: 'groupBuy' };
    let v = window.skhSaleFlowChoose;
    const wrap = fn => (typeof fn !== 'function' || fn.__skhLaunchGuard) ? fn : Object.defineProperty(function (mode) {
        const f = MODE[mode]; if (f && !enabled(f)) { notify(f); return; }
        return fn.apply(this, arguments);
    }, '__skhLaunchGuard', { value: 'saleMode' });
    v = wrap(v);
    try { Object.defineProperty(window, 'skhSaleFlowChoose', { configurable: true, enumerable: true, get: () => v, set: n => { v = wrap(n); } }); } catch (e) { window.skhSaleFlowChoose = v; }
})();

/* ---------------- 2. callables answered locally while the feature is off ---------------- */
const CALLABLE = {
    auctionPlaceBid: 'auction', auctionFinalize: 'auction', auctionCancel: 'auction', auctionConfirmPayment: 'auction',
    priceDropSubmit: 'priceDrop', priceDropSettle: 'priceDrop',
    groupBuyJoin: 'groupBuy', groupBuyCommitJoin: 'groupBuy', groupBuyLeave: 'groupBuy', groupBuyCancel: 'groupBuy', groupBuySettleNow: 'groupBuy',
    groupSokoCapitalRecord: 'groupBuy', groupSokoCapitalConfirm: 'groupBuy', groupSokoPurchaseStep: 'groupBuy', groupSokoExecute: 'groupBuy',
    walletAdjust: 'wallet', withdrawalRequest: 'wallet',
    escrowRelease: 'escrow', sokopayReleaseLink: 'escrow', sokopayLinkWalletPay: 'escrow', disputeOpen: 'escrow',
    orderWalletPay: 'checkout', serviceOrderWalletPay: 'checkout', pesapalCheckout: 'checkout', pesapalTransactionStatus: 'checkout', negotiationOrderAction: 'checkout',
    deliveryAccept: 'delivery', deliveryOfferAccept: 'delivery', deliveryRouteBooking: 'delivery', deliveryComplete: 'delivery',
    entitlementGrant: 'paidEntitlements'
};
(function () {
    const orig = skh.wrapCallable;
    if (typeof orig !== 'function' || orig.__skhLaunchGuard) return;
    const w = function (name, ...rest) {
        const f = CALLABLE[name];
        if (f && !enabled(f)) return async function () {
            const e = new Error((LABEL[f] || 'Huduma hii') + ' haijawashwa kwenye SokoHuru kwa sasa.');
            e.code = 'functions/failed-precondition'; e.launchFeature = f; e.details = { feature: f, message: 'FEATURE_DISABLED' };
            throw e;
        };
        return orig.call(this, name, ...rest);
    };
    Object.defineProperty(w, '__skhLaunchGuard', { value: true });
    skh.wrapCallable = w;
})();

/* ---------------- 3. sale-mode options ---------------- */
const MODE_FLAG = { auction: 'auction', price_drop: 'priceDrop', group_buy: 'groupBuy' };
function applyModeUI() {
    for (const sel of document.querySelectorAll('#prodSaleMode, #editSaleMode, #lvxKind')) {
        for (const o of sel.options) {
            const f = MODE_FLAG[o.value]; if (!f) continue;
            const off = !enabled(f);
            if (off && sel.value === o.value && sel.id === 'prodSaleMode') { sel.value = 'free_market'; try { sel.dispatchEvent(new Event('change')); } catch (e) {} }
            if (off && sel.value === o.value && sel.id === 'lvxKind') sel.value = 'live_commerce';
            // an EXISTING listing keeps its mode visible in the edit form (rules let it stay unchanged)
            if (off && sel.id === 'editSaleMode' && sel.value === o.value) { o.disabled = false; o.hidden = false; continue; }
            o.disabled = off; o.hidden = off;
        }
    }
    for (const b of document.querySelectorAll('.skst-type[data-type]')) {
        const f = MODE_FLAG[b.getAttribute('data-type')]; if (!f) continue;
        const off = !enabled(f); b.hidden = off; b.disabled = off; b.setAttribute('aria-hidden', off ? 'true' : 'false');
    }
    // Home promo cards must not advertise switched-off services (escrow payments, delivery tracking)
    for (const [sel, f] of [['#skhHomePromos .shm-g', 'escrow'], ['#skhHomePromos .shm-b', 'delivery']]) {
        for (const el of document.querySelectorAll(sel)) el.style.display = enabled(f) ? '' : 'none';
    }
    try { if (typeof window.skhHeroPrune === 'function') window.skhHeroPrune(); } catch (e) {}
    injectProductActions();
}
let modeTimer = 0;
function scheduleUI() { if (modeTimer) return; modeTimer = setTimeout(() => { modeTimer = 0; try { applyModeUI(); } catch (e) { console.warn('[launch] ui', e); } }, 60); }

/* ---------------- 4. report a listing + promote my listing (product modal) ---------------- */
const REASONS = [['scam', 'Utapeli / udanganyifu'], ['prohibited', 'Bidhaa iliyokatazwa'], ['wrong_category', 'Kundi si sahihi'], ['duplicate', 'Tangazo limerudiwa'],
    ['offensive', 'Maudhui yasiyofaa'], ['wrong_price', 'Bei si ya kweli'], ['other', 'Sababu nyingine']];
function injectProductActions() {
    const row = document.getElementById('pmEngageRow'); if (!row) return;
    const p = skh.currentOpenProduct || {};
    const mine = !!(uid() && p.userId === uid());
    let r = document.getElementById('pmEngReportBtn');
    if (!r) {
        r = document.createElement('button'); r.type = 'button'; r.id = 'pmEngReportBtn'; r.className = 'pm-eng-btn';
        r.setAttribute('aria-label', 'Ripoti tangazo'); r.title = 'Ripoti tangazo';
        r.innerHTML = '<span class="skh-ico pm-eng-ico" data-ico="flag" aria-hidden="true"></span><span class="pm-eng-txt"><span class="pm-eng-lbl">Ripoti</span></span>';
        r.addEventListener('click', () => window.skhReportListing());
        row.appendChild(r);
    }
    r.hidden = mine;
    let pr = document.getElementById('pmEngPromoteBtn');
    if (!pr) {
        pr = document.createElement('button'); pr.type = 'button'; pr.id = 'pmEngPromoteBtn'; pr.className = 'pm-eng-btn';
        pr.setAttribute('aria-label', 'Tangaza bidhaa hii'); pr.title = 'Tangaza bidhaa hii';
        pr.innerHTML = '<span class="skh-ico pm-eng-ico" data-ico="star" aria-hidden="true"></span><span class="pm-eng-txt"><span class="pm-eng-lbl">Tangaza</span></span>';
        pr.addEventListener('click', () => { const q = skh.currentOpenProduct; if (q && q.id) openPromotionSheet(q.id); });
        row.appendChild(pr);
    }
    pr.hidden = !(mine && enabled('promotionsManual'));
}
function sheet(id, title, body) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.id = id; el.className = 'overlay-menu'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); document.body.appendChild(el); }
    el.style.cssText = 'display:flex;z-index:100030;background:rgba(15,23,42,.55);align-items:center;justify-content:center;padding:16px;';
    el.innerHTML = '<section style="width:min(100%,420px);background:#fff;border-radius:18px;padding:18px;box-shadow:0 20px 60px rgba(15,23,42,.24);max-height:90vh;overflow:auto;">'
        + '<h3 style="margin:0 0 10px;color:#17604E;font-size:17px;">' + esc(title) + '</h3>' + body
        + '<button type="button" data-skl-close style="width:100%;margin-top:10px;padding:12px;border:none;border-radius:12px;background:#e2e8f0;font-weight:700;cursor:pointer;">Funga</button></section>';
    el.querySelector('[data-skl-close]').onclick = () => { el.style.display = 'none'; };
    el.onclick = e => { if (e.target === el) el.style.display = 'none'; };
    return el;
}
window.skhReportListing = function (productId) {
    const p = skh.currentOpenProduct || {};
    const pid = String(productId || p.id || '');
    if (!pid || pid.includes('/')) return;
    if (!uid()) { if (skh.requireAuth) skh.requireAuth(() => window.skhReportListing(pid)); return; }
    if (p.userId === uid()) { say('Huwezi kuripoti tangazo lako mwenyewe.'); return; }
    const el = sheet('skhReportSheet', 'Ripoti tangazo hili',
        '<p style="font-size:13px;color:#64748b;margin:0 0 8px;">Timu ya usimamizi itakagua. Muuzaji hataona jina lako.</p>'
        + '<select id="sklReason" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:10px;margin-bottom:8px;">' + REASONS.map(r => '<option value="' + r[0] + '">' + esc(r[1]) + '</option>').join('') + '</select>'
        + '<textarea id="sklNote" maxlength="500" placeholder="Maelezo (si lazima, herufi 500 za juu)" style="width:100%;box-sizing:border-box;height:80px;padding:10px;border:1px solid #cbd5e1;border-radius:10px;"></textarea>'
        + '<button type="button" id="sklSend" style="width:100%;margin-top:10px;padding:12px;border:none;border-radius:12px;background:#b91c1c;color:#fff;font-weight:800;cursor:pointer;">Tuma ripoti</button>'
        + '<p id="sklMsg" role="status" style="font-size:13px;margin:8px 0 0;"></p>');
    const send = el.querySelector('#sklSend');
    send.onclick = async () => {
        const who = uid(); if (!who) return;
        send.disabled = true;
        const msg = el.querySelector('#sklMsg');
        try {
            const ref = skh.doc(skh.db, 'listing_reports', pid + '_' + who);
            const prev = await skh.getDoc(ref).catch(() => null);
            if (prev && prev.exists()) { msg.textContent = 'Umeshaliripoti tangazo hili. Asante, linakaguliwa.'; return; }
            await skh.setDoc(ref, { productId: pid, reporterUid: who, reason: el.querySelector('#sklReason').value,
                note: String(el.querySelector('#sklNote').value || '').trim().slice(0, 500), status: 'open', createdAt: nowIso() });
            msg.textContent = 'Asante. Ripoti imepokelewa.';
            setTimeout(() => { el.style.display = 'none'; }, 1200);
        } catch (e) {
            msg.textContent = /permission/i.test(String(e && (e.code || e.message))) ? 'Umeshaliripoti tangazo hili au halipo tena.' : 'Imeshindikana kutuma ripoti. Jaribu tena.';
        } finally { send.disabled = false; }
    };
};

/* ---------------- 5. paid promotions: seller request (manual verification) ---------------- */
function newReference() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = new Uint8Array(10); crypto.getRandomValues(b);
    return 'PRM-' + Array.from(b, x => A[x % A.length]).join('');
}
async function packages() {
    try { const s = await skh.getDoc(skh.doc(skh.db, 'system', 'promotion_packages')); const d = (s.exists() && s.data()) || {}; return d.packages || {}; }
    catch (e) { return {}; }
}
function payInstructions(ref, amount) {
    const pp = CFG.promotionPayment || {}, ch = Array.isArray(pp.channels) ? pp.channels.filter(c => c && c.label && c.number) : [];
    if (!ch.length) return null;
    return '<div style="background:#f1f5f9;border-radius:12px;padding:12px;font-size:13px;">'
        + '<p style="margin:0 0 6px;">Lipa <b>TSh ' + Number(amount).toLocaleString() + '</b>' + (pp.payeeName ? ' kwa <b>' + esc(pp.payeeName) + '</b>' : '') + ' kupitia:</p>'
        + '<ul style="margin:0 0 6px 18px;padding:0;">' + ch.map(c => '<li>' + esc(c.label) + ': <b>' + esc(c.number) + '</b></li>').join('') + '</ul>'
        + '<p style="margin:0;">Andika kumbukumbu <b style="font-family:monospace">' + esc(ref) + '</b> kwenye maelezo ya malipo. Tangazo litawashwa baada ya admin kuthibitisha malipo kwenye rekodi rasmi za mtoa huduma. Picha ya skrini si uthibitisho.</p></div>';
}
async function openPromotionSheet(productId) {
    if (!enabled('promotionsManual')) { notify('promotionsManual'); return; }
    if (!uid()) { if (skh.requireAuth) skh.requireAuth(() => openPromotionSheet(productId)); return; }
    const pid = String(productId || ''); if (!pid || pid.includes('/')) return;
    const pk = await packages();
    const list = Object.entries(pk).filter(([, v]) => v && v.active === true && Number(v.amount) > 0 && Number(v.days) > 0);
    if (!list.length || !payInstructions('X', 1)) {
        sheet('skhPromoSheet', 'Tangaza bidhaa yako', '<p style="font-size:13px;color:#64748b;">Malipo ya matangazo bado hayajafunguliwa. Kuweka bidhaa ni bure.</p>');
        return;
    }
    const el = sheet('skhPromoSheet', 'Tangaza bidhaa yako',
        '<p style="font-size:13px;color:#64748b;margin:0 0 8px;">Chagua kifurushi. Tangazo la kulipiwa litaonyeshwa na alama "Boosted" ili wanunuzi walitofautishe.</p>'
        + list.map(([id, v]) => '<label style="display:flex;gap:8px;align-items:center;border:1px solid #e2e8f0;border-radius:12px;padding:10px;margin-bottom:6px;font-size:13px;">'
            + '<input type="radio" name="sklPkg" value="' + esc(id) + '"> <span><b>' + esc(v.label || id) + '</b><br>Siku ' + Number(v.days) + ' · TSh ' + Number(v.amount).toLocaleString() + '</span></label>').join('')
        + '<button type="button" id="sklPromoGo" style="width:100%;margin-top:8px;padding:12px;border:none;border-radius:12px;background:#17604E;color:#fff;font-weight:800;cursor:pointer;">Tengeneza ombi</button>'
        + '<div id="sklPromoOut" style="margin-top:10px;"></div>');
    el.querySelector('#sklPromoGo').onclick = async (ev) => {
        const pick = el.querySelector('input[name=sklPkg]:checked'); if (!pick) { say('Chagua kifurushi kwanza.'); return; }
        const id = pick.value, v = pk[id], ref = newReference(), who = uid(); if (!who) return;
        ev.target.disabled = true;
        try {
            await skh.setDoc(skh.doc(skh.db, 'promotion_requests', ref), { reference: ref, sellerUid: who, productId: pid, packageId: id, kind: v.kind,
                amount: Number(v.amount), currency: 'TZS', days: Number(v.days), status: 'pending', createdAt: nowIso() });
            el.querySelector('#sklPromoOut').innerHTML = payInstructions(ref, v.amount);
        } catch (e) { el.querySelector('#sklPromoOut').innerHTML = '<p style="color:#b91c1c;font-size:13px;">Imeshindikana kutengeneza ombi. Hakikisha tangazo ni lako kisha jaribu tena.</p>'; ev.target.disabled = false; }
    };
}

/* ---------------- 6. admin: reports, promotions, browser moderation ---------------- */
async function moderateProduct(productId, action, reason) {
    const who = uid(); if (!who) throw new Error('Ingia kwanza.');
    const id = String(productId || ''); if (!/^[A-Za-z0-9_-]{1,150}$/.test(id)) throw new Error('ID ya tangazo si sahihi.');
    if (String(reason || '').trim().length < 5) throw new Error('Sababu ni fupi mno.');
    const now = nowIso(), hide = action === 'hide', auditId = 'mod_' + id + '_' + Date.now().toString(36);
    const b = skh.writeBatch(skh.db);
    b.set(skh.doc(skh.db, 'admin_audit_log', auditId), { actorUid: who, actorRole: 'admin', via: 'browser', action: hide ? 'LISTING_HIDE' : 'LISTING_RESTORE',
        reason: String(reason).trim().slice(0, 500), createdAt: now, targetCollection: 'products', targetId: id });
    b.update(skh.doc(skh.db, 'products', id), { adminHidden: hide, moderationStatus: hide ? 'hidden' : 'active', moderatedAt: now, moderatedBy: who,
        moderationAuditId: auditId, lastChangedBy: who, lastChangedAt: now });
    await b.commit();
    return { ok: true, auditId };
}
async function activatePromotion(reqId, provider, paymentRef, note) {
    const who = uid(); if (!who) throw new Error('Ingia kwanza.');
    const ref = String(paymentRef || '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{6,40}$/.test(ref)) throw new Error('Namba ya muamala si sahihi (herufi/namba 6-40).');
    const s = await skh.getDoc(skh.doc(skh.db, 'promotion_requests', reqId)); if (!s.exists()) throw new Error('Ombi halipo.');
    const r = s.data(); if (r.status !== 'pending') throw new Error('Ombi hili si "pending" tena.');
    const now = new Date(), at = now.toISOString(), exp = new Date(now.getTime() + Number(r.days) * 86400000).toISOString();
    const b = skh.writeBatch(skh.db);
    b.update(skh.doc(skh.db, 'promotion_requests', reqId), { status: 'active', paymentRef: ref, paymentProvider: provider, verifiedBy: who, verifiedAt: at, activatedAt: at, expiresAt: exp });
    b.set(skh.doc(skh.db, 'promotion_payment_refs', provider + '_' + ref), { requestId: reqId, amount: r.amount, verifiedBy: who, verifiedAt: at });
    b.set(skh.doc(skh.db, 'admin_audit_log', 'promo_' + reqId + '_activate'), { actorUid: who, actorRole: 'admin', via: 'browser', action: 'PROMOTION_ACTIVATED',
        reason: String(note || 'Malipo yamethibitishwa kwenye rekodi rasmi').slice(0, 500), createdAt: at, targetCollection: 'promotion_requests', targetId: reqId,
        productId: r.productId, amount: r.amount, paymentProvider: provider, paymentRef: ref });
    b.update(skh.doc(skh.db, 'products', r.productId), { isBoosted: true, boostDays: r.days, boostedAt: at, boostExpiresAt: exp, boostPaidRef: reqId, boostPlacement: r.kind,
        lastChangedBy: who, lastChangedAt: at });
    await b.commit();
    return { ok: true, expiresAt: exp };
}
async function rejectPromotion(reqId, reason) {
    const who = uid(); if (!who) throw new Error('Ingia kwanza.');
    if (String(reason || '').trim().length < 5) throw new Error('Andika sababu (angalau herufi 5).');
    const at = nowIso(), b = skh.writeBatch(skh.db);
    b.update(skh.doc(skh.db, 'promotion_requests', reqId), { status: 'rejected', verifiedBy: who, verifiedAt: at, rejectReason: String(reason).trim().slice(0, 500) });
    b.set(skh.doc(skh.db, 'admin_audit_log', 'promo_' + reqId + '_reject'), { actorUid: who, actorRole: 'admin', via: 'browser', action: 'PROMOTION_REJECTED',
        reason: String(reason).trim().slice(0, 500), createdAt: at, targetCollection: 'promotion_requests', targetId: reqId });
    await b.commit();
}
async function resolveReport(rid, status, resolution) {
    const who = uid(); if (!who) throw new Error('Ingia kwanza.');
    await skh.updateDoc(skh.doc(skh.db, 'listing_reports', rid), { status, resolvedBy: who, resolvedAt: nowIso(), resolution: String(resolution || '').slice(0, 500) });
}
const PROVIDERS = [['mpesa', 'M-Pesa'], ['tigopesa', 'Mixx by Yas (Tigo Pesa)'], ['airtelmoney', 'Airtel Money'], ['halopesa', 'HaloPesa'], ['bank', 'Benki'], ['pesapal_manual', 'PesaPal (dashibodi)']];
async function adminSectionHtml() {
    const box = (t, b) => '<div style="border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:12px;"><h4 style="margin:0 0 8px;color:#18352D;font-size:14px;">' + t + '</h4>' + b + '</div>';
    const b2 = (label, js, bg, fg) => '<button type="button" onclick="' + js + '" style="padding:7px 10px;border:none;border-radius:9px;font-weight:700;font-size:12px;cursor:pointer;background:' + bg + ';color:' + fg + ';margin:3px 6px 3px 0;">' + label + '</button>';
    let reports = [], promos = [];
    try { const q = await skh.getDocs(skh.query(skh.collection(skh.db, 'listing_reports'), skh.where('status', '==', 'open'), skh.limit(50))); reports = q.docs.map(d => Object.assign({ id: d.id }, d.data())); } catch (e) { reports = null; }
    try { const q = await skh.getDocs(skh.query(skh.collection(skh.db, 'promotion_requests'), skh.where('status', '==', 'pending'), skh.limit(50))); promos = q.docs.map(d => Object.assign({ id: d.id }, d.data())); } catch (e) { promos = null; }
    const rep = reports === null ? '<p style="color:#b91c1c;font-size:13px;">Imeshindikana kusoma ripoti.</p>' : (!reports.length ? '<p style="color:#64748b;font-size:13px;">Hakuna ripoti mpya.</p>' : reports.map(r =>
        '<div style="border-top:1px solid #eef2f1;padding:8px 0;font-size:13px;"><b>' + esc(r.reason) + '</b> · tangazo <code>' + esc(r.productId) + '</code><br><span style="color:#64748b;">' + esc(r.note || '') + '</span><br>'
        + b2('Ficha tangazo', "window.skhLaunchAdmin.report('" + esc(r.id) + "','hide')", '#fee2e2', '#b91c1c') + b2('Si kosa', "window.skhLaunchAdmin.report('" + esc(r.id) + "','dismiss')", '#f1f5f9', '#18352D') + '</div>').join(''));
    const pro = !enabled('promotionsManual') ? '<p style="color:#64748b;font-size:13px;">Matangazo ya kulipia YAMEZIMWA (system/launch.promotionsManual). Hakuna malipo yanayokusanywa.</p>'
        : promos === null ? '<p style="color:#b91c1c;font-size:13px;">Imeshindikana kusoma maombi.</p>' : (!promos.length ? '<p style="color:#64748b;font-size:13px;">Hakuna maombi yanayosubiri.</p>' : promos.map(r =>
        '<div style="border-top:1px solid #eef2f1;padding:8px 0;font-size:13px;"><b style="font-family:monospace">' + esc(r.reference) + '</b> · TSh ' + Number(r.amount).toLocaleString() + ' · siku ' + Number(r.days) + ' · ' + esc(r.kind) + '<br>tangazo <code>' + esc(r.productId) + '</code> · muuzaji <code>' + esc(r.sellerUid) + '</code><br>'
        + '<select id="sklProv_' + esc(r.id) + '" style="padding:7px;border:1px solid #cbd5e1;border-radius:8px;margin:4px 4px 4px 0;">' + PROVIDERS.map(p => '<option value="' + p[0] + '">' + p[1] + '</option>').join('') + '</select>'
        + '<input id="sklRef_' + esc(r.id) + '" placeholder="Namba ya muamala (kutoka rekodi rasmi)" style="padding:7px;border:1px solid #cbd5e1;border-radius:8px;width:220px;max-width:100%;"><br>'
        + b2('Thibitisha na washa', "window.skhLaunchAdmin.activate('" + esc(r.id) + "')", '#17604E', '#fff') + b2('Kataa', "window.skhLaunchAdmin.reject('" + esc(r.id) + "')", '#fee2e2', '#b91c1c') + '</div>').join(''));
    return box('Ripoti za matangazo', rep) + box('Maombi ya matangazo ya kulipia (uthibitisho wa mkono)',
        '<p style="color:#64748b;font-size:12px;margin:0 0 6px;">Thibitisha kila malipo kwenye rekodi RASMI za mtoa huduma (si picha ya skrini). Namba moja ya muamala haiwezi kutumika mara mbili.</p>' + pro);
}
const rerender = () => { if (typeof window.skhAdminCCTab === 'function') window.skhAdminCCTab('listings'); };
const askText = async q => String((typeof window.skhPrompt === 'function' ? await window.skhPrompt(q) : window.prompt(q)) || '').trim();
window.skhLaunchAdmin = {
    async report(rid, what) {
        try {
            const s = await skh.getDoc(skh.doc(skh.db, 'listing_reports', rid)); if (!s.exists()) throw new Error('Ripoti haipo.');
            const r = s.data();
            if (what === 'hide') { const reason = await askText('Sababu ya kuficha tangazo (itahifadhiwa):'); if (reason.length < 5) { say('Sababu ni fupi mno.'); return; }
                let done = false;
                try { await skh.wrapCallable('adminModerateListing')({ collection: 'products', id: r.productId, action: 'hide', reason }); done = true; }
                catch (e) { const k = skh.fnErrorKind ? skh.fnErrorKind(e) : 'server'; if (k !== 'missing' && k !== 'unreachable') throw e; }
                if (!done) await moderateProduct(r.productId, 'hide', reason);
                await resolveReport(rid, 'actioned', reason);
            } else await resolveReport(rid, 'dismissed', 'Si kosa');
            say('Imehifadhiwa.'); rerender();
        } catch (e) { say('Imeshindikana: ' + (e && e.message || e)); }
    },
    async activate(id) {
        try {
            const prov = (document.getElementById('sklProv_' + id) || {}).value, ref = (document.getElementById('sklRef_' + id) || {}).value;
            const ok = typeof window.skhConfirm === 'function' ? await window.skhConfirm('Umethibitisha kiasi na namba ya muamala kwenye rekodi rasmi za ' + prov + '?') : window.confirm('Umethibitisha malipo?');
            if (!ok) return;
            await activatePromotion(id, prov, ref); say('Tangazo limewashwa.'); rerender();
        } catch (e) { say(/permission/i.test(String(e && (e.code || e.message))) ? 'Imekataliwa: namba ya muamala imeshatumika, au ombi si halali.' : 'Imeshindikana: ' + (e && e.message || e)); }
    },
    async reject(id) {
        try { const reason = await askText('Sababu ya kukataa (mf. malipo hayakupatikana):'); await rejectPromotion(id, reason); say('Ombi limekataliwa.'); rerender(); }
        catch (e) { say('Imeshindikana: ' + (e && e.message || e)); }
    }
};

/* ---------------- 7. boot ---------------- */
async function loadRemote() {
    if (!uid() || !skh.db) return;
    try { const s = await skh.getDoc(skh.doc(skh.db, 'system', 'launch')); remote = s.exists() ? (s.data() || {}) : null; }
    catch (e) { /* keep the defaults */ }
    document.documentElement.setAttribute('data-launch-scope', scoped() || remote ? 'sokohuru' : 'full');
    scheduleUI();
}
document.addEventListener('skh:auth-ready', () => { loadRemote(); });
if (skh.currentUser) loadRemote();
try { new MutationObserver(scheduleUI).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
document.addEventListener('DOMContentLoaded', scheduleUI);
scheduleUI();

window.skhLaunch = { enabled, scoped, notify, openPromotionSheet, moderateProduct, activatePromotion, rejectPromotion, adminSectionHtml,
    flags: () => Object.fromEntries(Object.keys(LABEL).map(f => [f, enabled(f)])), _setRemote: r => { remote = r; scheduleUI(); } };
