/* ================================================================
 * 70-role-identity.js — [R19 COMMERCE IDENTITY 2026-09-17]
 * ROLE IDENTITY layer (sio system mpya — registry ya kati):
 *   - skhRoleIcon(role)  → mini SVG icon per role (SVG, si emoji-za-random)
 *   - skhRoleBadge(role) → ICON + LABEL (localized) — "RoleBadge" ya mradi
 *   - skhGetUserRoles(u) → roles HALISI kutoka backend/account fields
 *     (§14 DO NOT FAKE: hakuna role kutoka interaction, ni account state tu)
 *   - skhRoleBadgesFor(u) → multi-role badges (§3: mtu mmoja, roles nyingi)
 *   - Role ≠ Verification (§4): verified badge ni status tofauti kabisa —
 *     hainaunganishwi na role badges.
 * Inaunganishwa na: account/profile identity, Soga header, and Groups.
 * Soga header (participant overlay), Groups (member context baadaye R19+).
 * ================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    if (window.__skhRoleBoot) return;
    window.__skhRoleBoot = true;

    /* --------- CENTRALIZED ROLE→ICON mapping (§2) --------- */
    var ROLE_DEFS = {
        BUYER:             { sw: 'Mnunuzi',       en: 'Buyer',            icon: 'bag' },
        SELLER:            { sw: 'Muuzaji',       en: 'Seller',           icon: 'store' },
        SERVICE_PROVIDER:  { sw: 'Mtoa Huduma',   en: 'Service Provider', icon: 'wrench' },
        TRANSPORTER:       { sw: 'Msafirishaji',  en: 'Transporter',      icon: 'truck' },
        BUSINESS:          { sw: 'Biashara',      en: 'Business',         icon: 'building' },
        AGENT:             { sw: 'Wakala',        en: 'Agent',            icon: 'badge' }
    };
    var ROLE_ORDER = ['SELLER', 'SERVICE_PROVIDER', 'TRANSPORTER', 'BUSINESS', 'AGENT', 'BUYER'];

    const ICONS = {
        store: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.6-5h14.8L21 9M3 9v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M3 9h18M9 20v-7h6v7"/></svg>',
        wrench: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4.4 4.4 0 0 0-6 6L3 18l3 3 5.7-5.7a4.4 4.4 0 0 0 6-6L14 13l-3-3 3.7-3.7z"/></svg>',
        truck: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6h13v10H1zM14 9h4l3 3v4h-7z"/><circle cx="6" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/></svg>',
        bag: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 12a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9zM8 8V6a4 4 0 0 1 8 0v2"/></svg>',
        building: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3"/></svg>',
        badge: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h4"/><circle cx="12" cy="17" r="1.4" fill="currentColor" stroke="none"/></svg>'
    };

    function lang() { try { return (window.SokoHaiLMS && window.SokoHaiLMS.lang) || 'sw'; } catch (e) { return 'sw'; } }
    function esc(s) { return skh.skhEscape(String(s == null ? '' : s)); }

    /* --------- RoleBadge reusable component (§2) --------- */
    window.skhRoleBadge = function (role, opts) {
        var def = ROLE_DEFS[role];
        if (!def) return '';
        var label = (lang() === 'en' ? def.en : def.sw);
        return '<span class="skh-rb skh-rb--' + role.toLowerCase() + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">'
            + (ICONS[def.icon] || '') + '<span>' + esc(label) + '</span></span>';
    };
    window.skhRoleBadgeHtml = window.skhRoleBadge;

    /* --------- Role derivation HALISI (§14 — backend/account fields) --------- */
    window.skhGetUserRoles = function (u) {
        u = u || {};
        var roles = [];
        var roleStr = String(u.userRole || u.role || '').toLowerCase();
        var hasSeller = !!(u.isSeller || u.sellerType || roleStr === 'seller' || u.storeName);
        var hasProvider = !!(u.isProvider || u.providerId || roleStr === 'provider' || u.serviceCategory || u.servicesOffered);
        var hasTransporter = !!(u.isDriver || u.driverId || u.vehicleType || u.driverProfile || roleStr === 'driver' || u.routesAvailable);
        var hasBusiness = !!(u.businessName || u.primaryProfile || u.isBusiness);
        var hasAgent = !!(u.isAgent || u.agentId || u.agentCode || roleStr === 'agent');
        if (hasSeller) roles.push('SELLER');
        if (hasProvider) roles.push('SERVICE_PROVIDER');
        if (hasTransporter) roles.push('TRANSPORTER');
        if (hasBusiness) roles.push('BUSINESS');
        if (hasAgent) roles.push('AGENT');
        // BUYER: kama hakuna role nyingine (au ametahiri kwanua) — role ya msingi
        if (!roles.length || u.userRole === 'buyer' || u.isBuyer) roles.push('BUYER');
        return ROLE_ORDER.filter(function (r) { return roles.includes(r); });
    };

})();
