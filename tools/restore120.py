#!/usr/bin/env python3
"""Re-apply the approved AUCTION-LIVE frontend edits to js/app/120-live-commerce-ui.js.
All replacements assert count==1; the file is written once at the end (atomic)."""
import sys

P = '/home/user/sokoHai/js/app/120-live-commerce-ui.js'
src = open(P, encoding='utf-8').read()
n = 0

def rep(old, new, tag):
    global src, n
    c = src.count(old)
    if c != 1:
        print(f'ANCHOR-FAIL [{tag}]: count={c}')
        print('--- wanted anchor ---')
        print(old[:300])
        sys.exit(1)
    src = src.replace(old, new, 1)
    n += 1
    print(f'OK [{tag}]')

# ---------- E1: ERR strings ----------
rep("""    kampeni_imeisha: 'Kampeni imeisha.', kampeni_haijaanza: 'Kampeni haijaanza bado.', stock_haitoshi: 'Idadi uliyoomba haipo kwenye stock.' };""",
"""    kampeni_imeisha: 'Kampeni imeisha.', kampeni_haijaanza: 'Kampeni haijaanza bado.', stock_haitoshi: 'Idadi uliyoomba haipo kwenye stock.',
    /* [AUCTION-LIVE] pause / bid states */
    mnada_umesitishwa: 'Mnada umesitishwa na mwenyeji kwa muda. Subiri uendelee.', live_imesitishwa: 'Live imesitishwa kwa muda na mwenyeji.',
    mnada_una_zabuni: 'Mnada una zabuni tayari \\u2014 hauwezi kusitishwa.' };""", 'E1-ERR')

# ---------- E2: auctionState ----------
rep("""    return { cur, minNext: Math.round(cur + Math.max(abs, Math.ceil(cur * pct / 100))), left, ended: !!md.ended || left <= 0, notStarted: Number(md.startTime) > now,
        leader: md.maxBidder || null, winner, winBid: Number(md.winnerBid) > 0 ? Number(md.winnerBid) : cur, bids: Number(md.totalBids) || 0, deadline: Number(md.paymentDeadline) || 0, md };""",
"""    /* [AUCTION-LIVE] paused / distinct bidders / anti-sniping extensions / ending-soon (server values) */
    const paused = md.livePaused === true, bidders = parseInt(md.bidderCount, 10) || 0, extensions = parseInt(md.extensions, 10) || 0;
    const ended = !!md.ended || left <= 0;
    return { cur, minNext: Math.round(cur + Math.max(abs, Math.ceil(cur * pct / 100))), left, ended, notStarted: Number(md.startTime) > now,
        leader: md.maxBidder || null, winner, winBid: Number(md.winnerBid) > 0 ? Number(md.winnerBid) : cur, bids: Number(md.totalBids) || 0, deadline: Number(md.paymentDeadline) || 0,
        paused, bidders, extensions, endingSoon: !ended && left > 0 && left <= 60000, md };""", 'E2-auctionState')

# ---------- E3: leaveRoom + conn fns ----------
rep("""function leaveRoom() {
    if (!room) return;
    room.unsub.forEach(u => { try { u(); } catch (e) {} });
    clearInterval(room.timer); clearInterval(room.rankTimer);
    if (room.id && room.joined) call('liveLeave', { sessionId: room.id }).catch(() => {});
    room = null;
}""",
"""/* [AUCTION-LIVE] leave-once: the room object is dropped first so parallel close paths
 * (X button, mini close, re-open) can only send liveLeave a single time. keepJoin tears
 * the UI/listeners down without leaving (re-opening the same session, e.g. conn retry). */
function leaveRoom(keepJoin) {
    if (!room) return;
    const r = room; room = null;
    r.unsub.forEach(u => { try { u(); } catch (e) {} });
    clearInterval(r.timer); clearInterval(r.rankTimer);
    try { window.removeEventListener('online', onNetBack); window.removeEventListener('offline', onNetGone); } catch (e) {}
    if (!keepJoin && r.id && r.joined && !r.left) { r.left = true; call('liveLeave', { sessionId: r.id }).catch(() => {}); }
}
/* [AUCTION-LIVE] connection overlay: listener errors / offline show #lv7Conn with retry. */
function showConn(msg, retry) {
    const box = document.getElementById('lv7Conn'); if (!box) { toast(msg, 'warn'); return; }
    const m = document.getElementById('lv7ConnMsg'); if (m) m.textContent = msg;
    const btn = document.getElementById('lv7ConnRetry');
    if (btn) btn.onclick = () => { hideConn(); try { retry && retry(); } catch (e) { toast(friendly(e), 'warn'); } };
    box.hidden = false;
}
function hideConn() { const box = document.getElementById('lv7Conn'); if (box) box.hidden = true; }
function onNetGone() { showConn('Hakuna muunganisho wa intaneti. Ukirejea online, bonyeza Jaribu tena.', () => { try { tick(); } catch (e) {} }); }
function onNetBack() { hideConn(); toast('Umerrejea online \\u2014 live inaendelea.', 'success'); try { tick(); } catch (e) {} }""", 'E3-leaveRoom-conn')

# ---------- E12: mini player (after onNetBack) ----------
rep("""function onNetBack() { hideConn(); toast('Umerrejea online \\u2014 live inaendelea.', 'success'); try { tick(); } catch (e) {} }""",
"""function onNetBack() { hideConn(); toast('Umerrejea online \\u2014 live inaendelea.', 'success'); try { tick(); } catch (e) {} }
/* [AUCTION-LIVE] real mini player: the stage node itself moves into the floating box,
 * so video/listeners/session continue untouched (no leave on minimize, no leaks).
 * Restore moves it back; only MiniClose leaves (once, via leaveRoom). */
function closeMiniBox() { const m = document.getElementById('lvxMini'); if (m) m.remove(); }
window.skhLiveMinimize = function () {
    if (!room || document.getElementById('lvxMini')) return;
    const stage = document.getElementById('lv7Stage'); if (!stage) return;
    const s = room.session || {};
    const box = document.createElement('div'); box.id = 'lvxMini'; box.className = 'lvx-mini';
    box.innerHTML = `<div class="lvx-mini-head"><b>${esc(s.title || 'Live')}</b><span><button onclick="skhLiveMiniRestore()">\\u2197 Rudi</button><button onclick="skhLiveMiniClose()" aria-label="Funga">\\u00d7</button></span></div><div class="lvx-mini-slot" id="lvxMiniSlot"></div>`;
    document.body.appendChild(box);
    box.querySelector('#lvxMiniSlot').appendChild(stage);
    const ov = document.getElementById('lvxRoom'); if (ov) ov.hidden = true;
};
window.skhLiveMiniRestore = function () {
    const box = document.getElementById('lvxMini'); if (!box || !room) { closeMiniBox(); return; }
    const stage = box.querySelector('#lv7Stage');
    let ov = document.getElementById('lvxRoom');
    if (!ov) { renderRoomShell(); ov = document.getElementById('lvxRoom'); }
    const host = ov && ov.querySelector('.lv7');
    if (stage && host) host.insertBefore(stage, host.firstChild);
    closeMiniBox();
    if (ov) ov.hidden = false;
    try { paintRoom(room.session); tick(); } catch (e) {}
};
window.skhLiveMiniClose = function () {
    closeMiniBox();
    const ov = document.getElementById('lvxRoom');
    leaveRoom();
    if (ov) { ov.hidden = true; ov.innerHTML = ''; }
    if (!document.querySelector('.lvx-overlay:not([hidden])')) document.body.classList.remove('lvx-open');
};""", 'E12-mini')

# ---------- E4a: shell minimize button ----------
rep("""          <button class="lv7-x" onclick="skhLiveCloseAsk('lvxRoom')" aria-label="Funga">${ico('x', 18)}</button>""",
"""          <button class="lv7-x" onclick="skhLiveMinimize()" aria-label="Punguza" title="Punguza">${ico('minus', 18)}</button>
          <button class="lv7-x" onclick="skhLiveCloseAsk('lvxRoom')" aria-label="Funga">${ico('x', 18)}</button>""", 'E4a-minbtn')

# ---------- E4b: shell overlays + emoji row ----------
rep("""        <div class="lv7-sheet" id="lv7Sheet" hidden></div>""",
"""        <div class="lvx-emoji" id="lvxEmoji"><button type="button" data-e="\\U0001F525">\\U0001F525</button><button type="button" data-e="\\u2764\\ufe0f">\\u2764\\ufe0f</button><button type="button" data-e="\\U0001F602">\\U0001F602</button><button type="button" data-e="\\U0001F44F">\\U0001F44F</button><button type="button" data-e="\\U0001F4AF">\\U0001F4AF</button></div>
        <div class="lv7-paused" id="lv7Paused" hidden><div><b>\\u23f8 Live imesitishwa</b><span>Mwenyeji amesimamisha live kwa muda. Zabuni na maoni vimesimama \\u2014 endelea kutazama.</span></div></div>
        <div class="lv7-conn" id="lv7Conn" hidden><div><b>Muunganisho umekatika</b><span id="lv7ConnMsg"></span><button class="lv-btn" id="lv7ConnRetry" type="button">JARIBU TENA</button></div></div>
        <div class="lv7-sheet" id="lv7Sheet" hidden></div>""", 'E4b-overlays-emoji')

# ---------- E4c: emoji wiring ----------
rep("""    document.querySelectorAll('.lv7-side-tabs button').forEach(b => b.onclick = () => { document.querySelectorAll('.lv7-side-tabs button').forEach(x => x.classList.toggle('on', x === b)); room && (room.side = b.dataset.s); paintSide(); });""",
"""    document.getElementById('lvxEmoji').onclick = (e) => { const b = e.target.closest('button[data-e]'); if (!b || !room) return; const i = document.getElementById('lvxChatInput'); if (i && !i.disabled) { i.value += b.dataset.e; try { i.focus(); } catch (_) {} } };
    document.querySelectorAll('.lv7-side-tabs button').forEach(b => b.onclick = () => { document.querySelectorAll('.lv7-side-tabs button').forEach(x => x.classList.toggle('on', x === b)); room && (room.side = b.dataset.s); paintSide(); });""", 'E4c-emojiwire')

# ---------- E5a: skhLiveOpen keepJoin + net listeners ----------
rep("""window.skhLiveOpen = async function (sessionId) {
    if (!skh.requireAuth || !skh.requireAuth()) return;
    leaveRoom();
    room = { id: sessionId, unsub: [], products: {}, session: null, joined: false, side: 'chat', comments: [] };
    renderRoomShell();""",
"""window.skhLiveOpen = async function (sessionId, opts) {
    if (!skh.requireAuth || !skh.requireAuth()) return;
    opts = opts || {};
    leaveRoom(!!opts.keepJoin); closeMiniBox();
    room = { id: sessionId, unsub: [], products: {}, session: null, joined: false, side: 'chat', comments: [] };
    renderRoomShell();
    try { window.removeEventListener('online', onNetBack); window.removeEventListener('offline', onNetGone); window.addEventListener('online', onNetBack); window.addEventListener('offline', onNetGone); } catch (e) {}""", 'E5a-open')

# ---------- E5b: session error -> conn retry ----------
rep("""    }, (e) => { const st = document.getElementById('lvxStage'); if (st) st.innerHTML = `<div class="lv7-gone"><b>Live haipatikani</b><span>${esc(friendly(e))}</span></div>`; }));""",
"""    }, (e) => { showConn('Imeshindikana kupakia live: ' + friendly(e), () => window.skhLiveOpen(sessionId, { keepJoin: true })); }));""", 'E5b-sesserr')

# ---------- E5c: joined includes paused ----------
rep("""    try { const r = await call('liveJoin', { sessionId }); if (room) room.joined = r && r.status === 'live'; } catch (e) {}""",
"""    try { const r = await call('liveJoin', { sessionId }); if (room) room.joined = !!(r && (r.status === 'live' || r.status === 'paused')); } catch (e) {}""", 'E5c-joined')

# ---------- E5d: productRoom closes mini ----------
rep("""    leaveRoom();
    room = { id: null, unsub: [], products: {}, session: null, joined: false, side: kind === 'auction' ? 'board' : 'board', comments: [] };""",
"""    leaveRoom(); closeMiniBox();
    room = { id: null, unsub: [], products: {}, session: null, joined: false, side: kind === 'auction' ? 'board' : 'board', comments: [] };""", 'E5d-proomin')

# ---------- E6: paintRoom paused pill + overlay ----------
rep("""    st.innerHTML = s.status === 'live' ? ico('radio', 15) + ' LIVE' : s.status === 'scheduled' ? 'INAKUJA' : s.status === 'ended' ? 'IMEKWISHA' : 'IMEONDOLEWA';""",
"""    st.innerHTML = s.status === 'live' ? ico('radio', 15) + ' LIVE' : s.status === 'paused' ? '\\u23f8 IMESITISHWA' : s.status === 'scheduled' ? 'INAKUJA' : s.status === 'ended' ? 'IMEKWISHA' : 'IMEONDOLEWA';
    const pz = document.getElementById('lv7Paused'); if (pz) pz.hidden = s.status !== 'paused';""", 'E6-pausedpill')

# ---------- E7a: watchProduct error ----------
rep("""    room.unsub.push(skh.onSnapshot(skh.doc(skh.db, 'products', pid), (s) => { if (room && s.exists()) { room.products[pid] = Object.assign({ id: s.id, collectionName: 'products' }, s.data()); paintPinned(); tick(); outcomeCheck(); } }, () => {}));""",
"""    room.unsub.push(skh.onSnapshot(skh.doc(skh.db, 'products', pid), (s) => { if (room && s.exists()) { room.products[pid] = Object.assign({ id: s.id, collectionName: 'products' }, s.data()); paintPinned(); tick(); outcomeCheck(); } }, (e) => showConn('Imeshindikana kupakia bidhaa: ' + friendly(e), () => { if (room && room.watching === pid) { room.watching = null; watchProduct(pid); } })));""", 'E7a-watcherr')

# ---------- E7b: bids error ----------
rep("""            if (!room) return; room.bids = snap.docs.map(d => d.data()); paintSide(); if (!room.id) paintComments();
        }, () => {}));""",
"""            if (!room) return; room.bids = snap.docs.map(d => d.data()); paintSide(); if (!room.id) paintComments();
        }, (e) => showConn('Imeshindikana kupakia zabuni: ' + friendly(e), () => { try { tick(); } catch (_) {} })));""", 'E7b-bidserr')

# ---------- E8: tick auction block ----------
rep("""    if (mode === 'auction') {
        const a = auctionState(p, now), mine = me() && a.leader === me(), won = a.ended && me() && a.winner === me();
        let cta;
        if (a.notStarted) cta = `<button class="lv7-cta is-off" disabled><b>MNADA HAUJAANZA</b><small>Unaanza baada ya ${fmtLeft(Number(a.md.startTime) - now)}</small></button>`;
        else if (won) cta = `<button class="lv7-cta lv7-gold" onclick="skhLiveWinner('${esc(p.id)}')"><b>LIPA SASA</b><small>Umeshinda kwa ${esc(tsh(a.winBid))}</small></button>`;
        else if (a.ended) cta = `<button class="lv7-cta is-off" disabled><b>MNADA UMEFUNGWA</b><small>${a.winner ? 'Mshindi amepatikana' : 'Hakuna zabuni'}</small></button>`;
        else if (mine) cta = `<button class="lv7-cta lv7-lead" onclick="skhBidConfirm('${esc(p.id)}')"><b>UNAONGOZA MNADA</b><small>Zabuni yako: ${esc(tsh(a.cur))} · Ongeza zabuni</small></button>`;
        else if (isHost() || p.userId === me()) cta = `<button class="lv7-cta is-off" disabled><b>MNADA WAKO</b><small>Inayokubalika: ${esc(tsh(a.minNext))}</small></button>`;
        else cta = `<button class="lv7-cta" id="lv7BidCta" onclick="skhBidConfirm('${esc(p.id)}')"><b>WEKA ZABUNI</b><small>Inayokubalika: ${esc(tsh(a.minNext))}</small></button>`;
        bottom.innerHTML = cta + `<div class="lv7-foot"><button onclick="skhLiveSheet('board')">Zabuni ya Juu: <b id="lvxBidNow">${esc(tsh(a.cur))}</b></button><span>Muda: <b>${a.ended ? '00:00' : fmtLeft(a.left)}</b></span></div>`;
        if (a.ended && !a.md.endNotified && !room.finalizing) { room.finalizing = true; call('auctionFinalize', { productId: p.id }).catch(() => {}); }
        return;
    }""",
"""    if (mode === 'auction') {
        const a = auctionState(p, now), mine = me() && a.leader === me(), won = a.ended && me() && a.winner === me();
        /* [AUCTION-LIVE] frozen display while paused: the server clock stopped, so the client holds the last shown time. */
        if (a.paused && !a.ended) { if (room.pausedLeft == null) room.pausedLeft = a.left; a.left = room.pausedLeft; } else room.pausedLeft = null;
        let cta;
        if (a.notStarted) cta = `<button class="lv7-cta is-off" disabled><b>MNADA HAUJAANZA</b><small>Unaanza baada ya ${fmtLeft(Number(a.md.startTime) - now)}</small></button>`;
        else if (won) cta = `<button class="lv7-cta lv7-gold" onclick="skhLiveWinner('${esc(p.id)}')"><b>LIPA SASA</b><small>Umeshinda kwa ${esc(tsh(a.winBid))}</small></button>`;
        else if (a.ended) cta = `<button class="lv7-cta is-off" disabled><b>MNADA UMEFUNGWA</b><small>${a.winner ? 'Mshindi amepatikana' : 'Hakuna zabuni'}</small></button>`;
        else if (a.paused) cta = `<button class="lv7-cta is-off" disabled><b>\\u23f8 IMESITISHWA</b><small>Live imesimamishwa kwa muda na mwenyeji</small></button>`;
        else if (mine) cta = `<button class="lv7-cta lv7-lead" onclick="skhBidConfirm('${esc(p.id)}')"><b>UNAONGOZA MNADA</b><small>Zabuni yako: ${esc(tsh(a.cur))} · Ongeza zabuni</small></button>`;
        else if (isHost() || p.userId === me()) cta = `<button class="lv7-cta is-off" disabled><b>MNADA WAKO</b><small>Inayokubalika: ${esc(tsh(a.minNext))}</small></button>`;
        else cta = `<button class="lv7-cta" id="lv7BidCta" onclick="skhBidConfirm('${esc(p.id)}')"><b>WEKA ZABUNI</b><small>Inayokubalika: ${esc(tsh(a.minNext))}</small></button>`;
        const soon = a.endingSoon && !a.paused ? `<div class="lv7-endsoon">\\u23f3 INAKARIBIA KUISHA \\u2014 chini ya dakika 1!</div>` : '';
        const ext = a.extensions > 0 && !a.ended ? ` <em class="lv7-ext">\\u23f1 +2:00 \\u00d7${a.extensions}</em>` : '';
        bottom.innerHTML = soon + cta + `<div class="lv7-foot"><button onclick="skhLiveSheet('board')">Zabuni ya Juu: <b id="lvxBidNow">${esc(tsh(a.cur))}</b></button><span>Muda: <b>${a.ended ? '00:00' : fmtLeft(a.left)}</b></span><span>Zabuni: <b>${a.bids}</b> \\u00b7 Wazabuni: <b>${a.bidders}</b>${ext}</span></div>`;
        if (a.ended && !a.md.endNotified && !room.finalizing) { room.finalizing = true; call('auctionFinalize', { productId: p.id }).catch(() => {}); }
        return;
    }""", 'E8-tick')

# ---------- E9: paintPinned states ----------
rep("""    if (mode === 'auction') { const a = auctionState(p, now); extra = `<i>Dau la juu: <b class="lvx-price">${esc(tsh(a.cur))}</b></i><i>Muda: <b>${a.ended ? 'Imefungwa' : fmtLeft(a.left)}</b></i>`; }""",
"""    if (mode === 'auction') { const a = auctionState(p, now); extra = `<i>Dau la juu: <b class="lvx-price">${esc(tsh(a.cur))}</b></i><i>Muda: <b>${a.paused ? '\\u23f8 Imesitishwa' : a.ended ? 'Imefungwa' : fmtLeft(a.left)}</b></i><i>Wazabuni: <b>${a.bidders}</b></i>${a.extensions > 0 && !a.ended ? `<i>\\u23f1 <b>+2:00 \\u00d7${a.extensions}</b></i>` : ''}`; }""", 'E9-pinned')

# ---------- E10a: chips amounts ----------
rep("""    const a = auctionState(p, Date.now());
    modal(`<p class="lv-kicker">THIBITISHA ZABUNI</p>""",
"""    const a = auctionState(p, Date.now());
    /* [AUCTION-LIVE] quick-bid chips: minimum + one/two increments up */
    const chipStep = Math.max(1, a.minNext - a.cur), chipAmts = [a.minNext, a.minNext + chipStep, a.minNext + chipStep * 2];
    modal(`<p class="lv-kicker">THIBITISHA ZABUNI</p>""", 'E10a-chipamts')

# ---------- E10b: chips markup ----------
rep("""        <label class="lv-lab">Zabuni yako (angalau ${esc(tsh(a.minNext))})<input id="lvBidAmt" inputmode="numeric" value="${a.minNext}"></label>
        <div class="lv-info">""",
"""        <label class="lv-lab">Zabuni yako (angalau ${esc(tsh(a.minNext))})<input id="lvBidAmt" inputmode="numeric" value="${a.minNext}"></label>
        <div class="lv-chips" id="lvBidChips">${chipAmts.map(x => `<button type="button" data-amt="${x}">${esc(tsh(x))}</button>`).join('')}</div>
        <div class="lv-info">""", 'E10b-chipshtml')

# ---------- E10c: chips wiring ----------
rep("""    const go = document.getElementById('lvBidGo');
    go.onclick = async () => {""",
"""    const go = document.getElementById('lvBidGo');
    document.querySelectorAll('#lvBidChips button').forEach(b => b.onclick = () => { const i = document.getElementById('lvBidAmt'); if (i) i.value = b.dataset.amt; });
    go.onclick = async () => {""", 'E10c-chipwire')

# ---------- E11a: host menu pause rows ----------
rep("""            if (s.status === 'scheduled') rows.push(`<button class="lv7-mrow" onclick="skhLiveHost('start')">${ico('video', 16)} Anza live</button>`);
            if (s.status === 'live' || s.status === 'scheduled') rows.push(`<button class="lv7-mrow danger" onclick="skhLiveHost('end')">${ico('x', 16)} Maliza live</button>`);""",
"""            if (s.status === 'scheduled') rows.push(`<button class="lv7-mrow" onclick="skhLiveHost('start')">${ico('video', 16)} Anza live</button>`);
            /* [AUCTION-LIVE] pause is offered for auction lives; the server enforces pre-1st-bid-only. */
            if (s.status === 'live' && kindOf(s) === 'auction') rows.push(`<button class="lv7-mrow" onclick="skhLiveHost('pause')">${ico('pause', 16)} Sitisha live kwa muda</button>`);
            if (s.status === 'paused') rows.push(`<button class="lv7-mrow" onclick="skhLiveHost('resume')">${ico('play', 16)} Endelea na live</button>`);
            if (s.status === 'live' || s.status === 'scheduled') rows.push(`<button class="lv7-mrow danger" onclick="skhLiveHost('end')">${ico('x', 16)} Maliza live</button>`);""", 'E11a-rows')

# ---------- E11b: skhLiveHost pause/resume ----------
rep("""        if (what === 'pin') { await call('livePin', { sessionId: room.id, productId: pid }); room.watching = null; }""",
"""        if (what === 'pause') { await call('livePause', { sessionId: room.id }); toast('Live imesitishwa kwa muda. Zabuni zimesimama.', 'success'); }
        if (what === 'resume') { await call('liveResume', { sessionId: room.id }); toast('Live imeendelea.', 'success'); }
        if (what === 'pin') { await call('livePin', { sessionId: room.id, productId: pid }); room.watching = null; }""", 'E11b-host')

# ---------- E14a: hub paused query ----------
rep("""        const snap = await skh.getDocs(skh.query(skh.collection(skh.db, 'live_sessions'), skh.where('status', '==', t), skh.orderBy('updatedAt', 'desc'), skh.limit(30)));
        if (snap.empty) {""",
"""        /* [AUCTION-LIVE] paused lives stay visible under LIVE SASA with a tag. */
        const sts = t === 'live' ? ['live', 'paused'] : [t];
        const snaps = await Promise.all(sts.map(st => skh.getDocs(skh.query(skh.collection(skh.db, 'live_sessions'), skh.where('status', '==', st), skh.orderBy('updatedAt', 'desc'), skh.limit(30)))));
        const sessions = snaps.reduce((acc, x) => acc.concat(x.docs.map(d => Object.assign({ id: d.id }, d.data()))), []);
        if (!sessions.length) {""", 'E14a-hubquery')

# ---------- E14b: hub sessions line replaced (remove old const sessions) ----------
rep("""        const sessions = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
        const prods = await Promise.all""",
"""        const prods = await Promise.all""", 'E14b-hubsess')

# ---------- E14c: hub paused tag ----------
rep("""        grid.innerHTML = sessions.map((s, i) => {
            const p = prods[i], k = kindOf(s);
            if (k === 'auction' && p) return cardHtml({ kind: k, title: p.title, img: photo(p), rows: auctionRows(p, s.viewerCount), onclick: `skhLiveOpen('${esc(s.id)}')` });
            if (k === 'price_drop' && p) return cardHtml({ kind: k, title: p.title, img: photo(p), rows: dropRows(p), onclick: `skhLiveOpen('${esc(s.id)}')` });""",
"""        grid.innerHTML = sessions.map((s, i) => {
            const p = prods[i], k = kindOf(s);
            const ptag = s.status === 'paused' ? `<span class="lvh-pausedtag">\\u23f8 IMESITISHWA</span>` : '';
            if (k === 'auction' && p) return cardHtml({ kind: k, title: p.title, img: photo(p), rows: ptag + auctionRows(p, s.viewerCount), onclick: `skhLiveOpen('${esc(s.id)}')` });
            if (k === 'price_drop' && p) return cardHtml({ kind: k, title: p.title, img: photo(p), rows: ptag + dropRows(p), onclick: `skhLiveOpen('${esc(s.id)}')` });""", 'E14c-hubtag')

# ---------- E14d: hub live-card tag ----------
rep("""                rows: `<div class="lvh-three"><div><small>Watazamaji</small>""",
"""                rows: ptag + `<div class="lvh-three"><div><small>Watazamaji</small>""", 'E14d-hublivetag')

# ---------- E15a: product panel pill ----------
rep("""        const a = auctionState(p, now), md = a.md, won = a.ended && me() && a.winner === me();
        area.innerHTML = `<div class="lvp">
            <div class="lvp-top"><span class="lvp-pill">${ico('radio', 12)} ${a.ended ? 'MNADA UMEFUNGWA' : 'MNADA LIVE'}</span>""",
"""        const a = auctionState(p, now), md = a.md, won = a.ended && me() && a.winner === me();
        const pillTxt = a.ended ? 'MNADA UMEFUNGWA' : a.paused ? '\\u23f8 IMESITISHWA' : a.endingSoon ? 'MNADA LIVE \\u00b7 \\u23f3 INAKARIBIA KUISHA' : 'MNADA LIVE';
        area.innerHTML = `<div class="lvp">
            <div class="lvp-top"><span class="lvp-pill">${ico('radio', 12)} ${pillTxt}</span>""", 'E15a-pill')

# ---------- E15b: product panel kv ----------
rep("""<b>${esc(tsh(a.ended ? a.winBid : a.cur))}</b><em>${a.bids} zabuni</em></div>""",
"""<b>${esc(tsh(a.ended ? a.winBid : a.cur))}</b><em>${a.bids} zabuni \\u00b7 ${a.bidders} wazabuni${a.extensions > 0 && !a.ended ? ` \\u00b7 \\u23f1 +2:00 \\u00d7${a.extensions}` : ''}</em></div>""", 'E15b-kv')

# ---------- E15c: product panel paused button ----------
rep("""<div class="lvp-acts">${won ? `<button class="lvp-btn gold" onclick="skhLiveWinner('${esc(p.id)}')">LIPA SASA</button>` : a.ended ? '' : `<button class="lvp-btn" onclick="skhBidConfirm('${esc(p.id)}')">WEKA ZABUNI</button>`}""",
"""<div class="lvp-acts">${won ? `<button class="lvp-btn gold" onclick="skhLiveWinner('${esc(p.id)}')">LIPA SASA</button>` : a.ended ? '' : a.paused ? `<button class="lvp-btn" disabled>\\u23f8 IMESITISHWA</button>` : `<button class="lvp-btn" onclick="skhBidConfirm('${esc(p.id)}')">WEKA ZABUNI</button>`}""", 'E15c-pausedbtn')

open(P, 'w', encoding='utf-8').write(src)
print(f'WROTE {P}: {n} replacements')
