/* ================================================================
 * 67-payment-accounts.js — [PAYMENT ACCOUNTS FIX 2026-09-17]
 * ROOT CAUSE: userPaymentModal ilikuwa na form + "Edit" pekee —
 * kitufe cha KUSAVE hakikuwepo DOM, na hakuna function ya kuhifadhi.
 * MREKEBISHO: save halisi (Firestore users/{uid}.paymentMethods),
 * legacy mirror (paymentAccount/paymentType kwa readers zilizopo),
 * CVV HAIFADHIWI kamwe, card = last4 + brand tu. UI = data-attrs
 * + event delegation (hakuna inline-quotes kabisa).
 * ================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    if (window.__skhPayAccountsBoot) return;
    window.__skhPayAccountsBoot = true;

    function tk(k, fb) { try { var s = window.t && window.t(k); return (s && s !== k) ? s : (fb || k); } catch (e) { return fb || k; } }
    function uid() { return (skh.currentUser && skh.currentUser.uid) || null; }
    function userRef() { return skh.doc(skh.db, 'users', uid()); }
    function nowIso() { return new Date().toISOString(); }
    function esc(s) { return skh.skhEscape(String(s == null ? '' : s)); }
    function detectCardBrand(num) {
        var n = String(num || '').replace(/\D/g, '');
        if (/^4/.test(n)) return 'Visa';
        if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard';
        if (/^3[47]/.test(n)) return 'Amex';
        return tk('pay_card_generic', 'Card');
    }
    function maskDigits(s, visible) {
        var d = String(s || '').replace(/\D/g, '');
        if (d.length <= (visible || 4)) return d;
        return '•••• ' + d.slice(-(visible || 4));
    }

    function myMethods() {
        var u = skh.currentUserData || {};
        var arr = Array.isArray(u.paymentMethods) ? u.paymentMethods.slice() : [];
        if (!arr.length && u.paymentAccount) {
            arr.push({
                id: 'pm_legacy', type: (u.paymentType || 'mobile').toLowerCase(),
                provider: u.paymentProvider || '', masked: maskDigits(u.paymentAccount, 4),
                label: '', accountNumber: u.paymentAccount, accountName: u.paymentAccountName || '',
                isDefault: true, createdAt: u.updatedAt || nowIso(), updatedAt: u.updatedAt || nowIso()
            });
        }
        return arr;
    }
    window.skhPaymentMethods = myMethods;

    window.skhSavePaymentAccount = async function () {
        try {
            if (!uid()) { alert(tk('login_first', 'Ingia kwanza ili kuhifadhi.')); return; }
            var type = (document.getElementById('paySetupType') || {}).value || '';
            var rec = null;
            if (type === 'Mobile') {
                var mp = document.getElementById('setupMobileProvider').value;
                var mn = document.getElementById('setupMobileNumber').value.trim().replace(/\s/g, '');
                var mname = document.getElementById('setupMobileName').value.trim();
                if (!/^[0-9+]{9,14}$/.test(mn.replace(/\D/g, '') + '') || mn.replace(/\D/g, '').length < 9) { alert(tk('pay_err_phone', 'Weka namba sahihi ya simu (mf: 0712345678).')); return; }
                if (mname.length < 3) { alert(tk('pay_err_name', 'Weka jina la usajili la laini.')); return; }
                rec = { type: 'mobile', provider: mp, accountNumber: mn.replace(/\D/g, ''), accountName: mname,
                        label: ({ Mpesa: 'M-Pesa', Tigo: 'Tigo Pesa', Airtel: 'Airtel Money', Halopesa: 'Halopesa' })[mp] || mp };
            } else if (type === 'Bank') {
                var bp = document.getElementById('setupBankProvider').value;
                var bn = document.getElementById('setupBankNumber').value.trim().replace(/\s/g, '');
                var bname = document.getElementById('setupBankName').value.trim();
                var bbr = document.getElementById('setupBankBranch').value.trim();
                if (bn.length < 6) { alert(tk('pay_err_bank', 'Weka namba sahihi ya akaunti ya benki.')); return; }
                if (bname.length < 3) { alert(tk('pay_err_name', 'Weka jina la akaunti.')); return; }
                rec = { type: 'bank', provider: bp, accountNumber: bn, accountName: bname, branch: bbr, label: bp + ' Bank' };
            } else if (type === 'Card') {
                var cn = document.getElementById('setupCardNumber').value.replace(/\D/g, '');
                var ce = document.getElementById('setupCardExpiry').value.trim();
                var cvv = document.getElementById('setupCardCvv').value;
                var cname = document.getElementById('setupCardName').value.trim();
                if (cn.length < 13 || cn.length > 19) { alert(tk('pay_err_card', 'Weka namba sahihi ya kadi.')); return; }
                if (!/^\d{2}\s?.\s?\d{2}$/.test(ce)) { alert(tk('pay_err_exp', 'Weka muda wa kuisha (MM/YY).')); return; }
                if (cvv.length < 3) { alert(tk('pay_err_cvv', 'Weka CVV sahihi.')); return; }
                if (cname.length < 3) { alert(tk('pay_err_name', 'Weka jina lililo kwenye kadi.')); return; }
                rec = { type: 'card', provider: detectCardBrand(cn), accountNumber: cn.slice(-4),
                        accountName: cname, expiry: ce, label: detectCardBrand(cn) };
            } else {
                alert(tk('pay_err_type', 'Chagua aina ya njia ya malipo kwanza.')); return;
            }

            var isFirst = !myMethods().length;
            rec.id = 'pm_' + Date.now().toString(36);
            rec.masked = maskDigits(rec.accountNumber, 4);
            rec.isDefault = isFirst;
            rec.createdAt = nowIso(); rec.updatedAt = nowIso();

            var arr = myMethods().map(function (m) { return Object.assign({}, m, { isDefault: rec.isDefault ? false : m.isDefault }); });
            arr.push(rec);
            var patch = { paymentMethods: arr };
            if (rec.isDefault) patch = Object.assign(patch, legacyMirror(rec));
            await skh.setDoc(userRef(), patch, { merge: true });
            skh.currentUserData = Object.assign({}, skh.currentUserData || {}, patch);
            renderSavedList();
            lockForm(true);
            try { if (window.showToast) window.showToast(tk('pay_saved_ok', 'Akaunti ya malipo imehifadhiwa permanent'), 'success'); } catch (eT) {}
        } catch (e) {
            console.warn('[pay-acct save]', e);
            alert(tk('pay_err_save', 'Imeshindikana kuhifadhi. Jaribu tena.'));
        }
    };

    function legacyMirror(rec) {
        var cap = rec.type.charAt(0).toUpperCase() + rec.type.slice(1);
        return {
            paymentType: cap === 'Mobile' ? 'Mobile' : cap,
            paymentAccount: rec.accountNumber,
            paymentProvider: rec.provider,
            paymentAccountName: rec.accountName || ''
        };
    }

    window.skhSetDefaultPayment = async function (id) {
        try {
            var arr = myMethods().map(function (m) { return Object.assign({}, m, { isDefault: m.id === id }); });
            var def = arr.find(function (m) { return m.isDefault; }) || null;
            var patch = { paymentMethods: arr };
            if (def) patch = Object.assign(patch, legacyMirror(def));
            await skh.setDoc(userRef(), patch, { merge: true });
            skh.currentUserData = Object.assign({}, skh.currentUserData || {}, patch);
            renderSavedList();
        } catch (e) { alert(tk('pay_err_save', 'Imeshindikana kuhifadhi. Jaribu tena.')); }
    };
    window.skhDeletePayment = async function (id) {
        try {
            if (!confirm(tk('pay_del_confirm', 'Futa akaunti hii ya malipo? Tendo halirejelewi.'))) return;
            var arr = myMethods().filter(function (m) { return m.id !== id; });
            if (arr.length && !arr.some(function (m) { return m.isDefault; })) arr[0].isDefault = true;
            var def = arr.find(function (m) { return m.isDefault; }) || null;
            var patch = { paymentMethods: arr };
            if (def) patch = Object.assign(patch, legacyMirror(def));
            if (!arr.length) patch = Object.assign(patch, { paymentType: '', paymentAccount: '', paymentProvider: '', paymentAccountName: '' });
            await skh.setDoc(userRef(), patch, { merge: true });
            skh.currentUserData = Object.assign({}, skh.currentUserData || {}, patch);
            renderSavedList();
        } catch (e) { alert(tk('pay_err_save', 'Imeshindikana kuhifadhi. Jaribu tena.')); }
    };

    /* ---------- UI (data-attrs + delegation — hakuna inline quotes) ---------- */
    function savedRow(rec) {
        var icon = rec.type === 'card' ? '' : (rec.type === 'bank' ? '' : '');
        return '<div class="skh-ps-row" data-pmid="' + esc(rec.id) + '" style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:8px;background:#fff;">'
            + '<span style="font-size:18px;">' + icon + '</span>'
            + '<div style="flex:1;min-width:0;">'
            + '<b style="font-size:13.5px;color:#0f172a;display:block;">' + esc(rec.label || rec.provider || rec.type) + '</b>'
            + '<small style="color:#64748b;font-size:12.5px;">' + esc(rec.masked || '') + (rec.accountName ? ' · ' + esc(rec.accountName) : '') + '</small>'
            + '</div>'
            + (rec.isDefault
                ? '<span style="font-size:11px;font-weight:800;color:#15803d;background:#dcfce7;padding:3px 8px;border-radius:99px;">' + tk('pay_default_badge', 'MSINGI') + '</span>'
                : '<button type="button" data-act="pay-default" style="font-size:11.5px;font-weight:700;color:#1268A8;background:#e0f0fa;padding:5px 10px;border-radius:99px;border:none;cursor:pointer;">' + tk('pay_set_default', 'Weka Kuwa Msingi') + '</button>')
            + '<button type="button" data-act="pay-delete" aria-label="' + tk('pay_delete', 'Futa') + '" style="border:none;background:#fef2f2;color:#dc2626;width:28px;height:28px;border-radius:8px;cursor:pointer;font-weight:800;">&times;</button>'
            + '</div>';
    }

    document.addEventListener('click', function (ev) {
        try {
            var b = ev.target && ev.target.closest ? ev.target.closest('[data-act="pay-default"],[data-act="pay-delete"]') : null;
            if (!b) return;
            var row = b.closest('.skh-ps-row');
            var id = row ? row.getAttribute('data-pmid') : null;
            if (!id) return;
            ev.stopPropagation();
            if (b.getAttribute('data-act') === 'pay-default') window.skhSetDefaultPayment(id);
            else window.skhDeletePayment(id);
        } catch (e) {}
    }, true);

    function renderSavedList() {
        var host = document.getElementById('skhSavedPayments');
        if (!host) return;
        var arr = myMethods();
        host.innerHTML = '<b style="font-size:12px;color:var(--primary-dark,#022b52);display:block;margin:14px 0 8px;text-transform:uppercase;letter-spacing:.4px;">'
            + tk('pay_saved_title', 'AKAUNTI ZILIZOHIFADHIWA')
            + '</b>'
            + (arr.length ? arr.map(savedRow).join('')
                          : '<small style="color:#94a3b8;display:block;padding:8px;text-align:center;">' + tk('pay_none_saved', 'Huna akaunti iliyohifadhiwa bado.') + '</small>');
    }
    window.skhRenderSavedPayments = renderSavedList;

    function lockForm() {
        var pm = document.getElementById('userPaymentModal');
        if (!pm) return;
        var hasAny = myMethods().length > 0;
        var unlocked = !hasAny || !!window.__payEditMode;
        pm.querySelectorAll('input, select').forEach(function (inp) {
            inp.disabled = !unlocked;
            inp.style.opacity = inp.disabled ? '0.8' : '1';
        });
        var btnSave = document.getElementById('btnSavePaymentAccount');
        var btnEdit = document.getElementById('btnEditPaymentAccount');
        if (btnSave) btnSave.style.display = unlocked ? 'block' : 'none';
        if (btnEdit) btnEdit.style.display = (hasAny && !unlocked) ? 'block' : 'none';
    }

    var origOpen = window.openUserPaymentModal;
    if (typeof origOpen === 'function') {
        window.openUserPaymentModal = function () {
            var r = origOpen.apply(this, arguments);
            try { ensureInjected(); renderSavedList(); lockForm(); } catch (eIn) {}
            return r;
        };
    }

    window.enableEditPaymentInfo = function () {
        window.__payEditMode = true;
        lockForm();
        try { alert(tk('pay_edit_hint', 'Sasa unaweza kubadili au kuongeza taarifa mpya za malipo. Ukimaliza bofya HIFADHI.')); } catch (eA) {}
    };

    function ensureInjected() {
        var pm = document.getElementById('userPaymentModal');
        if (!pm) return;
        var sheet = pm.firstElementChild;
        if (!sheet) return;
        var btnEdit = document.getElementById('btnEditPaymentAccount');
        if (!document.getElementById('btnSavePaymentAccount') && btnEdit) {
            var b = document.createElement('button');
            b.id = 'btnSavePaymentAccount';
            b.type = 'button';
            b.addEventListener('click', function (ev) { ev.preventDefault(); window.skhSavePaymentAccount(); });
            b.style.cssText = 'width:100%;padding:16px;background:#00509d;color:white;border:none;border-radius:14px;font-weight:900;font-size:15px;cursor:pointer;margin-bottom:10px;';
            b.textContent = tk('pay_save_btn', 'HIFADHI TAARIFA');
            btnEdit.parentNode.insertBefore(b, btnEdit);
        }
        if (!document.getElementById('skhSavedPayments')) {
            var host = document.createElement('div');
            host.id = 'skhSavedPayments';
            var anchor = null;
            Array.prototype.forEach.call(sheet.children, function (c) {
                if (!anchor && c.querySelector && c.querySelector('#userSokoPayList')) anchor = c;
            });
            if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(host, anchor);
            else sheet.appendChild(host);
        }
        var btnEdit2 = document.getElementById('btnEditPaymentAccount');
        if (btnEdit2 && !btnEdit2.__skhPayWired) {
            btnEdit2.__skhPayWired = true;
            btnEdit2.addEventListener('click', function (ev) { ev.preventDefault(); window.enableEditPaymentInfo(); });
        }
    }
    window.skhInjectPaymentSaveUI = ensureInjected;

    document.addEventListener('DOMContentLoaded', function () { try { ensureInjected(); } catch (e) {} });
})();
