/**
 * SokoHai — owner setup checklist (admin-only, read-only).          [R16 2026-11-13]
 * Reports WHICH external settings exist on this server — booleans and non-secret values only
 * (never a key, secret or token) — so the owner can see what is left in the setup checklist
 * (docs/SOKOHAI-USER-SETUP-CHECKLIST.md) from the Admin Control Center.
 */
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const authority = require('./admin-authority');
const { isAdmin } = authority._internal;
const has = (k) => !!String(process.env[k] || '').trim();

function status() {
    const base = String(process.env.PESAPAL_BASE_URL || 'https://pay.pesapal.com/v3');
    let host = ''; try { host = new URL(base).hostname; } catch (e) {}
    const pesapalEnv = !has('PESAPAL_BASE_URL') ? 'unset' : (host === 'pay.pesapal.com' ? 'live' : (/cybqa|sandbox/.test(host) ? 'sandbox' : (host || 'unset')));
    const cloud = has('CLOUDINARY_CLOUD_NAME') && has('CLOUDINARY_API_KEY') && has('CLOUDINARY_API_SECRET') && has('CLOUDINARY_SIGNED_PRESET');
    const items = [
        { key: 'pesapal_keys', label: 'PesaPal: consumer key + secret', ok: has('PESAPAL_CONSUMER_KEY') && has('PESAPAL_CONSUMER_SECRET') },
        { key: 'pesapal_env', label: 'PesaPal: mazingira', ok: pesapalEnv === 'sandbox' || pesapalEnv === 'live', value: pesapalEnv },
        { key: 'pesapal_ipn', label: 'PesaPal: IPN URL + IPN ID', ok: has('PESAPAL_IPN_URL') && has('PESAPAL_IPN_ID') },
        { key: 'pesapal_redirect', label: 'PesaPal: redirect URL', ok: has('PESAPAL_REDIRECT_URL') },
        { key: 'cloudinary_signed', label: 'Cloudinary: upakiaji salama (signed)', ok: cloud, value: String(process.env.CLOUDINARY_UPLOAD_MODE || 'transition') },
        { key: 'push', label: 'Push (FCM): SKH_PUSH_ENABLED=1', ok: String(process.env.SKH_PUSH_ENABLED || '') === '1' },
        { key: 'admins', label: 'Super admin e-mail(s)', ok: has('SUPER_ADMIN_EMAILS') || has('ADMIN_EMAILS') }
    ];
    return { items, done: items.filter(i => i.ok).length, total: items.length };
}
exports.adminSetupStatus = onCall({ region: 'europe-west1' }, async (req) => {
    if (!req.auth || !isAdmin(req)) throw new HttpsError('permission-denied', 'Admin pekee.');
    let gb = {};
    try { gb = ((await admin.firestore().doc('system/config').get()).data() || {}).groupBuy || {}; } catch (e) {}
    const s = status();
    s.items.push({ key: 'group_buy_money', label: 'Group Buy: pesa halisi (escrow_commit) imeidhinishwa', ok: gb.realMoneyApproved === true, optional: true });
    return Object.assign({ ok: true }, s);
});
exports._testing = { status };
