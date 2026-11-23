/* ==== js/app/132-listing-country.js ====                         [LOCATION 2026-11-21]
 * Country + region on listing forms (product sell form, service hub form).
 *  - the seller CHOOSES the country (ISO 3166-1 alpha-2); nothing is assumed — not from GPS, not "Tanzania by default";
 *    the form only pre-selects the country this seller chose last time on this device;
 *  - the region list belongs to the chosen country (shared/admin-regions.js: TZ regions, KE counties); other countries
 *    save the country only;
 *  - window.skhListingCountryFields(prefix) returns exactly what may be saved: { countryCode, region? } or {}.
 * Public SEO pages show a region only when the saved country is verified and the region belongs to it. */
import '../../shared/admin-regions.js';

const AR = () => globalThis.SKHAdminRegions;
const COUNTRIES = ['TZ', 'KE', 'UG', 'RW', 'BI', 'CD', 'ZM', 'MW', 'MZ'];
const LAST = 'skh_listing_country';
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function fillRegions(prefix) {
    const c = document.getElementById(prefix + 'Country'), r = document.getElementById(prefix + 'Region');
    if (!c || !r || !AR()) return;
    const list = AR().regionsOf(c.value);
    r.innerHTML = '<option value="">' + (c.value ? (list.length ? 'Chagua mkoa' : 'Mkoa: haupatikani kwa nchi hii') : 'Chagua nchi kwanza') + '</option>'
        + list.map(n => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('');
    r.disabled = !list.length;
}
function setup(prefix) {
    const c = document.getElementById(prefix + 'Country');
    if (!c || c.__skhReady || !AR()) return;
    c.__skhReady = true;
    c.innerHTML = '<option value="">Chagua nchi</option>' + COUNTRIES.map(cc => '<option value="' + cc + '">' + esc(AR().countryName(cc)) + '</option>').join('');
    try { const last = localStorage.getItem(LAST); if (last && COUNTRIES.indexOf(last) !== -1) c.value = last; } catch (e) {}
    fillRegions(prefix);
    c.addEventListener('change', () => { fillRegions(prefix); try { if (c.value) localStorage.setItem(LAST, c.value); } catch (e) {} });
}
window.skhListingCountryFields = function (prefix) {
    const c = document.getElementById(prefix + 'Country'), r = document.getElementById(prefix + 'Region');
    if (!c || !AR()) return {};
    return AR().listingFields(c.value, r && !r.disabled ? r.value : '');
};
window.skhListingCountrySetup = function () { ['prod', 'servHub'].forEach(setup); };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.skhListingCountrySetup); else window.skhListingCountrySetup();
