'use strict';
/* [SRV-09 2026-11-20] The ONE administrator policy for every Cloud Functions module.
 *
 *  admin       : custom claim admin:true, role:'admin' or superAdmin:true,
 *                or a VERIFIED e-mail listed in ADMIN_EMAILS,
 *                or a super admin (below).
 *  super admin : custom claim superAdmin:true,
 *                or a VERIFIED e-mail listed in SUPER_ADMIN_EMAILS
 *                (falls back to ADMIN_EMAILS only when SUPER_ADMIN_EMAILS is not set).
 *  An e-mail only counts when the ID token says email_verified === true.
 *  No address is hard-coded in source: the owner's address belongs in SUPER_ADMIN_EMAILS (functions/.env.<project>).
 *
 *  Accepts either a callable request ({auth:{uid, token}}), an auth object ({uid, token}) or a bare token.
 *  admin-authority.js re-exports these functions unchanged, so every module now agrees. */
function emailsFrom(name) {
    return String(process.env[name] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}
function tokenFrom(x) {
    if (!x) return null;
    if (x.auth && typeof x.auth === 'object') return x.auth.token || {};   // callable request
    if (x.token && typeof x.token === 'object') return x.token;            // auth object
    if (typeof x === 'object' && ('uid' in x || 'email' in x || 'admin' in x || 'role' in x || 'superAdmin' in x || 'email_verified' in x)) return x; // token
    return null;
}
function signedIn(x) {
    if (!x) return false;
    if (x.auth !== undefined) return !!(x.auth && x.auth.uid);
    if (x.token !== undefined) return !!x.uid || !!(x.token && x.token.uid);
    return !!tokenFrom(x);
}
function verifiedEmail(t) {
    return (t && t.email && t.email_verified === true) ? String(t.email).toLowerCase() : '';
}
function isSuperAdmin(x) {
    if (!signedIn(x)) return false;
    const t = tokenFrom(x) || {};
    if (t.superAdmin === true) return true;
    const em = verifiedEmail(t);
    const supers = emailsFrom('SUPER_ADMIN_EMAILS');
    const list = supers.length ? supers : emailsFrom('ADMIN_EMAILS');
    return !!em && list.includes(em);
}
function isAdmin(x) {
    if (!signedIn(x)) return false;
    const t = tokenFrom(x) || {};
    if (t.admin === true || t.role === 'admin' || t.superAdmin === true) return true;
    const em = verifiedEmail(t);
    return (!!em && emailsFrom('ADMIN_EMAILS').includes(em)) || isSuperAdmin(x);
}
module.exports = { isAdmin, isSuperAdmin, verifiedEmail, emailsFrom, tokenFrom };
