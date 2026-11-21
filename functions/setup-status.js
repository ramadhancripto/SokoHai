/**
 * SokoHai — owner setup checklist (admin-only, read-only).          [R16 2026-11-13]
 * Reports WHICH external settings exist on this server — booleans and non-secret values only
 * (never a key, secret or token) — so the owner can see what is left in the setup checklist
 * (docs/SOKOHAI-USER-SETUP-CHECKLIST.md) from the Admin Control Center.
 */
'use strict';
const { HttpsError } = require('firebase-functions/v2/https');
const { onCall, logBestEffort } = require('./errors'); // [SRV-10] same onCall, wrapped in the shared error contract
const admin = require('firebase-admin');
const authority = require('./admin-authority');
const { isAdmin } = authority._internal;
const has = (k) => !!String(process.env[k] || '').trim();

function status() {
    const base = String(process.env.PESAPAL_BASE_URL || 'https://pay.pesapal.com/v3');
    let host = ''; try { host = new URL(base).hostname; } catch (e) { /* invalid URL is reported as host '' (not configured) */ }
    const pesapalEnv = !has('PESAPAL_BASE_URL') ? 'unset' : (host === 'pay.pesapal.com' ? 'live' : (/cybqa|sandbox/.test(host) ? 'sandbox' : (host || 'unset')));
    const cloud = has('CLOUDINARY_CLOUD_NAME') && has('CLOUDINARY_API_KEY') && has('CLOUDINARY_API_SECRET') && has('CLOUDINARY_SIGNED_PRESET');
    const items = [
        { key: 'pesapal_keys', label: 'PesaPal: consumer key + secret', ok: has('PESAPAL_CONSUMER_KEY') && has('PESAPAL_CONSUMER_SECRET') },
        { key: 'pesapal_env', label: 'PesaPal: mazingira', ok: pesapalEnv === 'sandbox' || pesapalEnv === 'live', value: pesapalEnv },
        { key: 'pesapal_ipn', label: 'PesaPal: IPN URL + IPN ID', ok: has('PESAPAL_IPN_URL') && has('PESAPAL_IPN_ID') },
        { key: 'pesapal_redirect', label: 'PesaPal: redirect URL', ok: has('PESAPAL_REDIRECT_URL') },
        { key: 'cloudinary_signed', label: 'Cloudinary: upakiaji salama (signed)', ok: cloud, value: String(process.env.CLOUDINARY_UPLOAD_MODE || 'transition') },
        { key: 'push', label: 'Push (FCM): SKH_PUSH_ENABLED=1', ok: String(process.env.SKH_PUSH_ENABLED || '') === '1' },
        { key: 'admins', label: 'Super admin e-mail(s)', ok: has('SUPER_ADMIN_EMAILS') || has('ADMIN_EMAILS') },
        // [PILOT 2026-11-14] App Check: server enforcement (client site key is js/00-config.js APP_CHECK_SITE_KEY)
        { key: 'app_check', label: 'App Check: APP_CHECK_ENFORCE=true', ok: String(process.env.APP_CHECK_ENFORCE || '').toLowerCase() === 'true' }
    ];
    return { items, done: items.filter(i => i.ok).length, total: items.length };
}
exports.adminSetupStatus = onCall({ region: 'europe-west1' }, async (req) => {
    if (!req.auth || !isAdmin(req)) throw new HttpsError('permission-denied', 'Admin pekee.');
    let cfg = {};
    try { cfg = (await admin.firestore().doc('system/config').get()).data() || {}; } catch (e) { logBestEffort('adminSetupStatus.config', e); }
    const gb = cfg.groupBuy || {};
    const s = status();
    // [PILOT 2026-11-14] two-person withdrawals + search index (run adminSearchBackfill once after deploy)
    const dual = Number(((cfg.withdrawals || {}).dualApprovalMin)) || 0;
    s.items.push({ key: 'withdraw_dual', label: 'Kutoa pesa: idhini ya admin wawili (kiwango)', ok: dual > 0, value: dual > 0 ? 'TSh ' + dual.toLocaleString() : 'haijawekwa' });
    const pl = cfg.pilotLimits || {}, pay = Number(pl.maxPaymentTSh) || 0, wd = Number(pl.maxWithdrawalTSh) || 0;
    s.items.push({ key: 'pilot_limits', label: 'Pilot: kikomo cha malipo / kutoa pesa kwa muamala', ok: pay > 0 && wd > 0, optional: true,
        value: (pay > 0 ? 'malipo ≤ TSh ' + pay.toLocaleString() : 'malipo: hakuna kikomo') + ' · ' + (wd > 0 ? 'kutoa ≤ TSh ' + wd.toLocaleString() : 'kutoa: hakuna kikomo') });
    let backfilled = false;
    try { backfilled = !(await admin.firestore().collection('admin_audit_log').where('action', '==', 'SEARCH_BACKFILL').limit(1).get()).empty; } catch (e) { logBestEffort('adminSetupStatus.backfill', e); }
    s.items.push({ key: 'search_backfill', label: 'Utafutaji: adminSearchBackfill imeendeshwa', ok: backfilled });
    s.items.push({ key: 'group_buy_money', label: 'Group Buy: pesa halisi (escrow_commit) imeidhinishwa', ok: gb.realMoneyApproved === true, optional: true });
    return Object.assign({ ok: true }, s);
});
exports._testing = { status };
