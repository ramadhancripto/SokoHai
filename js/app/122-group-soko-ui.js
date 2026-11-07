/* ==== js/app/122-group-soko-ui.js ==== */
/* [R13-B 2026-11] Group Soko — biashara ya pamoja (UI). Every action calls the group-soko
 * callables; reads come from Firestore (members only, by rules). Screens:
 *   Orodha ya groups zangu · Unda Group Soko · Dashibodi: Muhtasari, Wanachama, Michango,
 *   Mapendekezo (kura), Manunuzi (pokea → kagua → lipa), Bidhaa (tangazo la mwanachama), Ripoti.
 * The money boundary is shown on every money screen: SokoHai keeps RECORDS only. */
import { skh } from './00-bootstrap.js';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tsh = (n) => 'TSh ' + Math.round(Number(n) || 0).toLocaleString('en-US');
const ico = (n, s) => (window.skhNavIcon ? window.skhNavIcon(n, s || 16) : '');
const toast = (m, k) => { try { if (window.sokohaiToast) return window.sokohaiToast(m, k || 'info', 3800); } catch (e) {} console.log(m); };
const call = (n, d) => skh.callFunction(n, d).then(r => (r && r.data) || r);
const ROLE = { chair: 'Mwenyekiti', treasurer: 'Mweka hazina', storekeeper: 'Mtunza stoo', auditor: 'Mkaguzi', member: 'Mwanachama' };
const PST = { ordered: 'Imeagizwa', received: 'Imepokelewa', inspected: 'Imekaguliwa', rejected: 'Imekataliwa (ubora)', paid: 'Imelipwa' };
const PTYPE = { purchase: 'Ununuzi', expense: 'Gharama', role: 'Jukumu', distribution: 'Mgawanyo wa faida', rule: 'Sheria za group' };
const ERR = { jukumu_halitoshi: 'Jukumu lako haliruhusu hatua hii.', mtu_mwingine_athibitishe: 'Mchango uthibitishwe na mtu mwingine (si aliyeandika wala mchangiaji).',
    aliyeomba_asipokee: 'Aliyeomba ununuzi hawezi kuupokea.', aliyepokea_asikague: 'Aliyepokea mzigo hawezi kuukagua.', mtu_huyo_huyo_hawezi_kulipa: 'Aliyepokea au kukagua hawezi kuidhinisha malipo.',
    umeshapiga_kura: 'Umeshapiga kura.', pendekezo_halijakubaliwa: 'Pendekezo bado halijakubaliwa kwa kura.', hisa_ziwe_100: 'Hisa zote ziwe jumla ya 100%.', si_mwanachama: 'Si mwanachama hai wa group hii.',
    mmiliki_wa_tangazo_si_mwanachama: 'Tangazo hili si la mwanachama wa group.', kumbukumbu_ya_malipo: 'Andika kumbukumbu ya malipo (mf. namba ya muamala wa benki).' };
const friendly = (e) => { const m = window.skhFnErrText ? window.skhFnErrText(e) : (e && e.message) || ''; const k = Object.keys(ERR).find(x => m.indexOf(x) !== -1); return k ? ERR[k] : m; };
const BOUNDARY = `<div class="gsx-note">${ico('shield', 14)}<span>SokoHai inahifadhi <b>kumbukumbu</b> za mitaji na malipo tu. Pesa za wanachama ziko kwenye akaunti ya group yenyewe (benki/simu). Escrow ya SokoPay ni ya malipo ya wateja wa oda pekee.</span></div>`;
let G = null; // { id, data, me, tab }

function sheet(html) {
    let el = document.getElementById('gsxSheet');
    if (!el) { el = document.createElement('div'); el.id = 'gsxSheet'; document.body.appendChild(el); }
    el.className = 'lvx-overlay'; el.hidden = false; el.innerHTML = `<div class="lvx-panel gsx">${html}</div>`;
    document.body.classList.add('lvx-open');
    return el;
}
window.skhGroupSokoClose = function () { const el = document.getElementById('gsxSheet'); if (el) { el.hidden = true; el.innerHTML = ''; } G = null; if (!document.querySelector('.lvx-overlay:not([hidden])')) document.body.classList.remove('lvx-open'); };

/* ---------------- list + create ---------------- */
window.skhGroupSoko = async function () {
    if (!skh.requireAuth || !skh.requireAuth()) return;
    const el = sheet(`<header class="lvx-head"><button class="lvx-icon-btn" onclick="skhGroupSokoClose()" aria-label="Funga">${ico('back', 18)}</button>
        <div><b>Group Soko</b><small>Biashara ya pamoja: mitaji, ununuzi, stoo, mauzo na hesabu</small></div>
        <button class="lvx-btn lvx-btn-gold" onclick="skhGroupSokoNew()">${ico('plus', 15)} Unda Group Soko</button></header>
        <div id="gsxList" class="gsx-list"><div class="lvx-empty">Inapakia…</div></div>`);
    try {
        const snap = await skh.getDocs(skh.query(skh.collection(skh.db, 'group_soko'), skh.where('memberUids', 'array-contains', skh.currentUser.uid), skh.orderBy('updatedAt', 'desc'), skh.limit(30)));
        el.querySelector('#gsxList').innerHTML = snap.empty
            ? `<div class="lvx-empty">${ico('users', 30)}<b>Huna Group Soko bado</b><span>Unda group ya biashara ya pamoja, alika wanachama, kisha rekodi mitaji na manunuzi kwa uwazi.</span></div>`
            : snap.docs.map(d => { const g = d.data(); return `<button class="gsx-card" onclick="skhGroupSokoOpen('${esc(d.id)}')"><span class="gsx-av">${ico('users', 20)}</span><span><b>${esc(g.name)}</b><small>${esc(g.purpose || '')}</small><em>${g.memberCount || 1} wanachama</em></span></button>`; }).join('');
    } catch (e) { el.querySelector('#gsxList').innerHTML = `<div class="lvx-empty"><b>Imeshindikana kupakia</b><span>${esc(friendly(e))}</span></div>`; }
};
window.skhGroupSokoNew = function () {
    const el = sheet(`<header class="lvx-head"><button class="lvx-icon-btn" onclick="skhGroupSoko()" aria-label="Rudi">${ico('back', 18)}</button><div><b>Unda Group Soko</b><small>Wewe utakuwa Mwenyekiti; majukumu mengine yanawekwa kwa kura</small></div></header>
        <div class="lvx-form"><label>Jina la group<input id="gsxName" maxlength="80" placeholder="Mf. Wakulima Pamoja Iringa"></label>
        <label>Madhumuni<textarea id="gsxPurpose" rows="2" maxlength="500" placeholder="Mf. Kununua mbolea kwa jumla na kuuza kwa wanachama na wateja"></textarea></label>
        <label>Mgawanyo wa umiliki<select id="gsxBasis"><option value="capital">Kulingana na mitaji iliyothibitishwa</option><option value="equal">Sawa kwa kila mwanachama</option><option value="agreed">Kwa makubaliano (yanawekwa kwa kura)</option></select></label>
        <label>Kura zinazohitajika kukubali pendekezo (%)<input id="gsxQuorum" type="number" min="51" max="100" value="51"></label>
        ${BOUNDARY}<div class="lvx-actions"><button class="lvx-btn" onclick="skhGroupSoko()">Ghairi</button><button class="lvx-btn lvx-btn-primary" id="gsxCreate">Unda</button></div></div>`);
    el.querySelector('#gsxCreate').onclick = async (ev) => { ev.currentTarget.disabled = true;
        try { const r = await call('groupSokoCreate', { name: el.querySelector('#gsxName').value, purpose: el.querySelector('#gsxPurpose').value, ownershipBasis: el.querySelector('#gsxBasis').value, quorumPct: el.querySelector('#gsxQuorum').value });
            toast('Group Soko imeundwa.', 'success'); window.skhGroupSokoOpen(r.groupId); } catch (e) { toast(friendly(e), 'warn'); ev.currentTarget.disabled = false; } };
};

/* ---------------- dashboard ---------------- */
window.skhGroupSokoOpen = async function (id, tab) {
    try {
        const [g, m] = await Promise.all([skh.getDoc(skh.doc(skh.db, 'group_soko', id)), skh.getDoc(skh.doc(skh.db, 'group_soko', id, 'members', skh.currentUser.uid))]);
        if (!g.exists()) return toast('Group haipatikani.', 'warn');
        G = { id, data: g.data(), me: m.exists() ? m.data() : null, tab: tab || 'overview' };
    } catch (e) { return toast(friendly(e), 'warn'); }
    if (G.me && G.me.status === 'invited') {
        sheet(`<header class="lvx-head"><button class="lvx-icon-btn" onclick="skhGroupSokoClose()">${ico('back', 18)}</button><div><b>${esc(G.data.name)}</b><small>Mwaliko</small></div></header>
          <div class="lvx-form"><p>${esc(G.data.purpose || '')}</p>${BOUNDARY}<div class="lvx-actions"><button class="lvx-btn lvx-btn-primary" onclick="skhGsAct('accept')">Kubali mwaliko</button></div></div>`);
        return;
    }
    const tabs = [['overview', 'Muhtasari'], ['members', 'Wanachama'], ['capital', 'Michango'], ['proposals', 'Mapendekezo'], ['purchases', 'Manunuzi'], ['products', 'Bidhaa']];
    sheet(`<header class="lvx-head"><button class="lvx-icon-btn" onclick="skhGroupSoko()" aria-label="Rudi">${ico('back', 18)}</button>
        <div><b>${esc(G.data.name)}</b><small>${esc(ROLE[G.me && G.me.role] || '')} · ${G.data.memberCount || 1} wanachama</small></div></header>
        <div class="lvx-tabs gsx-tabs">${tabs.map(([k, l]) => `<button class="${k === G.tab ? 'on' : ''}" onclick="skhGroupSokoOpen('${esc(id)}','${k}')">${l}</button>`).join('')}</div>
        <div class="gsx-body" id="gsxBody"><div class="lvx-empty">Inapakia…</div></div>`);
    const body = document.getElementById('gsxBody');
    try { const on = document.querySelector('#gsxSheet .gsx-tabs .on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) {}
    try { body.innerHTML = await ({ overview, members, capital, proposals, purchases, products })[G.tab](); } catch (e) { body.innerHTML = `<div class="lvx-empty"><b>Imeshindikana</b><span>${esc(friendly(e))}</span></div>`; }
};
const sub = (name, ...q) => skh.getDocs(skh.query(skh.collection(skh.db, 'group_soko', G.id, name), ...q));
const role = () => (G.me && G.me.role) || 'member';

async function overview() {
    const r = await call('groupSokoReport', { groupId: G.id });
    const kpi = [['Mitaji iliyothibitishwa', r.capital], ['Mauzo (oda zilizokamilika)', r.sales], ['Manunuzi yaliyolipwa', r.purchasesPaid], ['Gharama', r.expenses], ['Madeni kwa wasambazaji', r.payables], ['Faida / hasara', r.profit]];
    return `<div class="gsx-kpis">${kpi.map(([l, v]) => `<div class="gsx-kpi ${l.indexOf('Faida') === 0 ? (v < 0 ? 'neg' : 'pos') : ''}"><small>${l}</small><b>${esc(tsh(v))}</b></div>`).join('')}</div>
      <div class="lvx-label">Hisa za wanachama (${r.basis === 'capital' ? 'kwa mitaji' : r.basis === 'equal' ? 'sawa' : 'kwa makubaliano'})</div>
      <table class="gsx-table"><thead><tr><th>Mwanachama</th><th>Jukumu</th><th>Mitaji</th><th>Hisa</th></tr></thead><tbody>${r.shares.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(ROLE[s.role] || s.role)}</td><td>${esc(tsh(s.capital))}</td><td>${s.sharePct}%</td></tr>`).join('')}</tbody></table>
      <p class="lvx-muted">Pesa kwenye kumbukumbu: ${esc(tsh(r.cashOnRecord))} · Mgawanyo uliofanyika: ${esc(tsh(r.distributed))} · Oda zilizokamilika: ${r.completedOrders}</p>${BOUNDARY}`;
}
async function members() {
    const snap = await sub('members', skh.limit(200));
    const rows = snap.docs.map(d => d.data()).map(m => `<tr><td>${esc(m.name)}</td><td>${esc(ROLE[m.role] || m.role)}</td><td>${m.status === 'active' ? 'Hai' : m.status === 'invited' ? 'Amealikwa' : esc(m.status)}</td></tr>`).join('');
    return `<table class="gsx-table"><thead><tr><th>Jina</th><th>Jukumu</th><th>Hali</th></tr></thead><tbody>${rows}</tbody></table>
      ${role() === 'chair' ? `<div class="lvx-label">Alika mwanachama</div><div class="gsx-row"><input id="gsxFind" placeholder="Andika jina lake kama lilivyo kwenye SokoHai"><button class="lvx-btn" onclick="skhGsFind()">Tafuta</button></div><div id="gsxFound"></div>` : ''}
      <p class="lvx-muted">Kubadilisha jukumu (mweka hazina, mtunza stoo, mkaguzi) kunafanywa kwa pendekezo na kura kwenye "Mapendekezo".</p>`;
}
window.skhGsFind = async function () {
    const q = (document.getElementById('gsxFind').value || '').trim(); if (q.length < 2) return;
    const snap = await skh.getDocs(skh.query(skh.collection(skh.db, 'userCards'), skh.where('fullName', '>=', q), skh.where('fullName', '<=', q + ''), skh.limit(8)));
    document.getElementById('gsxFound').innerHTML = snap.empty ? '<span class="lvx-muted">Hakuna aliyepatikana.</span>' : snap.docs.map(d => { const u = d.data(); return `<div class="gsx-row"><span>${esc(u.fullName)}${u.region ? ' · ' + esc(u.region) : ''}</span><button class="lvx-btn" onclick="skhGsAct('invite','${esc(u.uid || d.id)}')">Alika</button></div>`; }).join('');
};
async function capital() {
    const snap = await sub('capital', skh.orderBy('createdAt', 'desc'), skh.limit(100));
    const can = ['treasurer', 'chair'].indexOf(role()) !== -1, me = skh.currentUser.uid;
    const rows = snap.docs.map(d => { const c = d.data(); const confirmable = can && c.status === 'pending' && c.recordedBy !== me && c.memberUid !== me;
        return `<tr><td>${esc(c.memberName)}</td><td>${esc(tsh(c.amount))}</td><td>${esc(c.method)} ${esc(c.reference || '')}</td><td>${c.status === 'confirmed' ? 'Imethibitishwa' : c.status === 'rejected' ? 'Imekataliwa' : 'Inasubiri'}</td>
          <td>${confirmable ? `<button class="lvx-btn" onclick="skhGsAct('confirm','${esc(d.id)}')">Thibitisha</button><button class="lvx-btn" onclick="skhGsAct('reject','${esc(d.id)}')">Kataa</button>` : ''}</td></tr>`; }).join('');
    return `${BOUNDARY}<div class="lvx-label">Rekodi mchango wako</div><div class="gsx-row"><input id="gsxAmt" type="number" min="1" placeholder="Kiasi (TSh)"><select id="gsxMethod"><option value="mobile_money">Simu (M-Pesa, Tigo…)</option><option value="bank">Benki</option><option value="cash">Taslimu</option><option value="other">Nyingine</option></select><input id="gsxRef" placeholder="Kumbukumbu (mf. namba ya muamala)"><button class="lvx-btn lvx-btn-primary" onclick="skhGsAct('capital')">Rekodi</button></div>
      <p class="lvx-muted">Mchango unahesabika baada ya kuthibitishwa na Mweka hazina au Mwenyekiti ambaye si wewe.</p>
      <table class="gsx-table"><thead><tr><th>Mwanachama</th><th>Kiasi</th><th>Njia</th><th>Hali</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5">Hakuna michango bado.</td></tr>'}</tbody></table>`;
}
async function proposals() {
    const snap = await sub('proposals', skh.orderBy('createdAt', 'desc'), skh.limit(60));
    const me = skh.currentUser.uid, r = role();
    const list = snap.docs.map(d => { const p = d.data(); const voted = p.votes && p.votes[me]; const money = ['purchase', 'expense', 'distribution'].indexOf(p.type) !== -1;
        const canExec = p.status === 'approved' && (money ? ['treasurer', 'chair'].indexOf(r) !== -1 : r === 'chair');
        return `<div class="gsx-prop"><div><small>${esc(PTYPE[p.type] || p.type)} · ${p.status === 'open' ? 'Kura zinaendelea' : p.status === 'approved' ? 'Limekubaliwa' : p.status === 'rejected' ? 'Limekataliwa' : 'Limetekelezwa'}</small><b>${esc(p.title)}</b>
          ${p.amount ? `<em>${esc(tsh(p.amount))}</em>` : ''}${p.details && p.details.supplierName ? `<span class="lvx-muted">Msambazaji: ${esc(p.details.supplierName)} · ${p.details.ownership === 'consignment' ? 'kwa niaba ya msambazaji' : 'mali ya group'}</span>` : ''}
          <span class="lvx-muted">Ndiyo ${p.yes || 0} · Hapana ${p.no || 0}${p.quorumNeeded ? ' · zinahitajika ' + p.quorumNeeded : ''}</span></div>
          <div class="gsx-prop-act">${p.status === 'open' && !voted ? `<button class="lvx-btn lvx-btn-primary" onclick="skhGsVote('${esc(d.id)}','yes')">Ndiyo</button><button class="lvx-btn" onclick="skhGsVote('${esc(d.id)}','no')">Hapana</button>` : voted ? `<span class="lvx-ok">Umepiga: ${voted === 'yes' ? 'Ndiyo' : 'Hapana'}</span>` : ''}
          ${canExec ? `<button class="lvx-btn lvx-btn-gold" onclick="skhGsAct('execute','${esc(d.id)}')">Tekeleza</button>` : ''}</div></div>`; }).join('');
    return `<div class="lvx-label">Pendekezo jipya</div><div class="gsx-new">
        <select id="gsxPType"><option value="purchase">Ununuzi kutoka kwa msambazaji</option><option value="expense">Gharama</option><option value="distribution">Mgawanyo wa faida</option><option value="role">Jukumu la mwanachama</option></select>
        <input id="gsxPTitle" placeholder="Kichwa (mf. Mbolea UREA magunia 10)">
        <input id="gsxPSupplier" placeholder="Msambazaji (kwa ununuzi)"><select id="gsxPOwn"><option value="owned">Mali ya group</option><option value="consignment">Kwa niaba ya msambazaji</option></select>
        <input id="gsxPItem" placeholder="Bidhaa (kwa ununuzi)"><input id="gsxPQty" type="number" min="1" placeholder="Idadi"><input id="gsxPCost" type="number" min="1" placeholder="Bei ya kipande (TSh)">
        <input id="gsxPAmount" type="number" min="1" placeholder="Kiasi (gharama/mgawanyo)"><input id="gsxPUid" placeholder="Mwanachama (uid, kwa jukumu)"><select id="gsxPRole"><option value="treasurer">Mweka hazina</option><option value="storekeeper">Mtunza stoo</option><option value="auditor">Mkaguzi</option><option value="member">Mwanachama</option><option value="chair">Mwenyekiti</option></select>
        <button class="lvx-btn lvx-btn-primary" onclick="skhGsPropose()">Wasilisha kwa kura</button></div>${list || '<p class="lvx-muted">Hakuna mapendekezo bado.</p>'}`;
}
async function purchases() {
    const snap = await sub('purchases', skh.orderBy('createdAt', 'desc'), skh.limit(60));
    const r = role();
    const rows = snap.docs.map(d => { const p = d.data(); const btn = [];
        if (p.status === 'ordered' && ['storekeeper', 'chair'].indexOf(r) !== -1) btn.push(`<button class="lvx-btn" onclick="skhGsStep('${esc(d.id)}','receive')">Pokea mzigo</button>`);
        if (p.status === 'received') btn.push(`<button class="lvx-btn" onclick="skhGsStep('${esc(d.id)}','inspect')">Kagua: ubora sawa</button><button class="lvx-btn" onclick="skhGsStep('${esc(d.id)}','inspect-fail')">Ubora mbaya</button>`);
        if (p.status === 'inspected' && r === 'treasurer') btn.push(`<button class="lvx-btn lvx-btn-gold" onclick="skhGsStep('${esc(d.id)}','pay')">Idhinisha malipo</button>`);
        return `<tr><td>${esc(p.supplierName || '')}<br><small>${(p.items || []).map(i => esc(i.name) + ' ×' + i.qty).join(', ')}</small></td><td>${esc(tsh(p.total))}</td><td>${esc(PST[p.status] || p.status)}${p.stockEntry === 'pending_business_os' ? '<br><small>Ingiza stoo kwenye Business OS</small>' : ''}</td><td>${btn.join('')}</td></tr>`; }).join('');
    return `<p class="lvx-muted">Hatua zinatenganishwa: aliyeomba hapokei, aliyepokea hakagui, na Mweka hazina asiyepokea wala kukagua ndiye anaidhinisha malipo.</p>${BOUNDARY}
      <table class="gsx-table"><thead><tr><th>Msambazaji / bidhaa</th><th>Jumla</th><th>Hali</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4">Hakuna manunuzi. Anza na pendekezo la ununuzi.</td></tr>'}</tbody></table>`;
}
async function products() {
    const snap = await sub('products', skh.limit(100));
    const ids = snap.docs.map(d => d.data());
    const r = role();
    return `<p class="lvx-muted">Bidhaa za group zinauzwa kwenye soko la SokoHai lililopo (search, kikapu, oda, SokoPay). Kila bidhaa inaonyesha kuwa ni ya group au ya msambazaji.</p>
      <table class="gsx-table"><thead><tr><th>Bidhaa</th><th>Umiliki</th></tr></thead><tbody>${ids.map(p => `<tr><td><a href="#" onclick="openProduct('${esc(p.productId)}','products');return false">${esc(p.productId)}</a></td><td>${p.ownership === 'consignment' ? 'Kwa niaba ya msambazaji' : 'Mali ya group'}</td></tr>`).join('') || '<tr><td colspan="2">Hakuna bidhaa bado.</td></tr>'}</tbody></table>
      ${['chair', 'storekeeper'].indexOf(r) !== -1 ? `<div class="lvx-label">Unganisha tangazo la mwanachama</div><div class="gsx-row"><input id="gsxProdId" placeholder="ID ya tangazo"><select id="gsxProdOwn"><option value="owned">Mali ya group</option><option value="consignment">Kwa niaba ya msambazaji</option></select><input id="gsxProdSup" placeholder="Msambazaji (consignment)"><button class="lvx-btn lvx-btn-primary" onclick="skhGsAct('attach')">Unganisha</button></div>` : ''}`;
}

window.skhGsVote = async (pid, v) => { try { const r = await call('groupSokoVote', { groupId: G.id, proposalId: pid, vote: v }); toast(r.status === 'approved' ? 'Pendekezo limekubaliwa.' : r.status === 'rejected' ? 'Pendekezo limekataliwa.' : 'Kura yako imehesabiwa.', 'success'); window.skhGroupSokoOpen(G.id, 'proposals'); } catch (e) { toast(friendly(e), 'warn'); } };
window.skhGsStep = async (id, step) => {
    const d = { groupId: G.id, purchaseId: id, step: step === 'inspect-fail' ? 'inspect' : step };
    if (step === 'inspect-fail') d.qualityOk = false;
    if (step === 'pay') { d.paymentRef = window.prompt('Kumbukumbu ya malipo kwa msambazaji (mf. namba ya muamala):', ''); if (!d.paymentRef) return; }
    if (step === 'receive' || step.indexOf('inspect') === 0) d.note = window.prompt('Maelezo (hiari):', '') || '';
    try { await call('groupSokoPurchaseStep', d); toast('Imehifadhiwa.', 'success'); window.skhGroupSokoOpen(G.id, 'purchases'); } catch (e) { toast(friendly(e), 'warn'); }
};
window.skhGsPropose = async function () {
    const v = id => (document.getElementById(id) || {}).value || '';
    const type = v('gsxPType'); const d = { groupId: G.id, type, title: v('gsxPTitle') };
    if (type === 'purchase') d.details = { supplierName: v('gsxPSupplier'), ownership: v('gsxPOwn'), items: [{ name: v('gsxPItem') || v('gsxPTitle'), qty: v('gsxPQty'), unitCost: v('gsxPCost') }] };
    if (type === 'expense' || type === 'distribution') { d.amount = v('gsxPAmount'); d.details = {}; }
    if (type === 'role') d.details = { uid: v('gsxPUid'), role: v('gsxPRole') };
    try { await call('groupSokoPropose', d); toast('Pendekezo limetumwa kwa wanachama.', 'success'); window.skhGroupSokoOpen(G.id, 'proposals'); } catch (e) { toast(friendly(e), 'warn'); }
};
window.skhGsAct = async function (what, arg) {
    const v = id => (document.getElementById(id) || {}).value || '';
    try {
        if (what === 'accept') { await call('groupSokoAccept', { groupId: G.id }); toast('Karibu kwenye group.', 'success'); return window.skhGroupSokoOpen(G.id); }
        if (what === 'invite') { await call('groupSokoInvite', { groupId: G.id, uid: arg }); toast('Mwaliko umetumwa.', 'success'); return window.skhGroupSokoOpen(G.id, 'members'); }
        if (what === 'capital') { await call('groupSokoCapitalRecord', { groupId: G.id, amount: v('gsxAmt'), method: v('gsxMethod'), reference: v('gsxRef') }); toast('Mchango umerekodiwa; unasubiri uthibitisho.', 'success'); return window.skhGroupSokoOpen(G.id, 'capital'); }
        if (what === 'confirm' || what === 'reject') { await call('groupSokoCapitalConfirm', { groupId: G.id, capitalId: arg, decision: what }); return window.skhGroupSokoOpen(G.id, 'capital'); }
        if (what === 'execute') { const r = await call('groupSokoExecute', { groupId: G.id, proposalId: arg }); toast(r.purchaseId ? 'Ununuzi umeagizwa. Fuatilia kwenye "Manunuzi".' : 'Limetekelezwa.', 'success'); return window.skhGroupSokoOpen(G.id, r.purchaseId ? 'purchases' : 'proposals'); }
        if (what === 'attach') { await call('groupSokoAttachProduct', { groupId: G.id, productId: v('gsxProdId'), ownership: v('gsxProdOwn'), supplierName: v('gsxProdSup') }); toast('Tangazo limeunganishwa na group.', 'success'); return window.skhGroupSokoOpen(G.id, 'products'); }
    } catch (e) { toast(friendly(e), 'warn'); }
};

/* ---------------- entry points in the sidebar drawer ---------------- */
(function mountDrawerEntries() {
    const ITEMS = [
        ['skh-menu-live-row', 'video', 'Live sasa', 'Live za wauzaji, Mnada Live na Bei Kushuka Live', () => window.skhLiveHub && window.skhLiveHub()],
        ['skh-menu-mybids-row', 'gavel', 'Zabuni zangu', 'Minada unayoshiriki, uliyoshinda na malipo', () => window.skhMyBids && window.skhMyBids()],
        ['skh-menu-groupsoko-row', 'users', 'Group Soko', 'Biashara ya pamoja: mitaji, manunuzi, stoo na hesabu', () => window.skhGroupSoko()]
    ];
    function inject() {
        const drawer = document.querySelector('#sidebarMenuModal .skh-menu-scroll');
        if (!drawer) return;
        const anchor = drawer.querySelector('.skh-menu-account-row');
        ITEMS.forEach(([cls, icon, title, subt, fn]) => {
            if (drawer.querySelector('.' + cls)) return;
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'skh-menu-item ' + cls;
            b.innerHTML = `<span class="ico">${ico(icon, 20)}</span><span class="txt"><b>${title}</b><small>${subt}</small></span><span class="chev">›</span>`;
            b.addEventListener('click', () => { try { window.closeModals && window.closeModals(); } catch (e) {} fn(); });
            if (anchor && anchor.nextSibling) drawer.insertBefore(b, anchor.nextSibling); else drawer.appendChild(b);
        });
    }
    const host = document.getElementById('sidebarMenuModal');
    if (host) new MutationObserver(inject).observe(host, { childList: true, subtree: true });
    inject();
})();
