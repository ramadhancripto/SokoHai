/* ==== js/app/26-image-zoom.js ==== */
// ============================================================
// IMAGE ZOOM (Touch-friendly) — kama simu smart:
//   - Pinch (vidole viwili) → kuza / kupunguza
//   - Drag (kidole kimoja, picha ikiwa imekuzwa) → kusogeza upande wowote
//   - Swipe kushoto/kulia (picha ikiwa kawaida) → picha inayofuata/iliyotangulia
//   - Double-tap → kuza haraka / rudisha kawaida
//   - Vitufe + / − na wheel (desktop)
// ============================================================
(function () {
    'use strict';

    var images = [];
    var index = 0;
    var scale = 1, tx = 0, ty = 0;

    var overlay = null, imgEl = null, countEl = null, dotsEl = null;
    var pointers = {}; // pointerId -> {x,y}
    var pinch = null;       // { startDist, startScale, startTx, startTy, midX, midY }
    var drag = null;        // { x, y, tx, ty }
    var swipe = null;       // { x, y, moved }
    var lastTap = { t: 0, x: 0, y: 0 };
    var MIN = 1, MAX = 4;

    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

    function apply(animate) {
        if (!imgEl) return;
        imgEl.style.transition = animate ? 'transform 0.25s ease' : 'none';
        imgEl.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    }

    // Zuia picha isipotee nje ya kioo kabisa
    function clampPan() {
        if (!imgEl || scale <= 1) { tx = 0; ty = 0; return; }
        var bw = imgEl.offsetWidth || 1, bh = imgEl.offsetHeight || 1;
        var vw = window.innerWidth, vh = window.innerHeight;
        var maxTx = Math.max(0, (bw * scale - vw) / 2);
        var maxTy = Math.max(0, (bh * scale - vh) / 2);
        tx = clamp(tx, -maxTx, maxTx);
        ty = clamp(ty, -maxTy, maxTy);
    }

    function setScale(ns, cx, cy) {
        scale = clamp(ns, MIN, MAX);
        if (scale <= 1) { tx = 0; ty = 0; }
        else {
            // zoom karibu na katikati ya kioo (cx/cy ni pointi ya kugusa)
            var vw = window.innerWidth, vh = window.innerHeight;
            var px = (cx != null ? cx : vw / 2) - vw / 2;
            var py = (cy != null ? cy : vh / 2) - vh / 2;
            tx = px * (1 - scale) * 0.6;
            ty = py * (1 - scale) * 0.6;
            clampPan();
        }
        apply();
    }

    function resetView() { scale = 1; tx = 0; ty = 0; apply(); }

    function updateMeta() {
        if (countEl) countEl.textContent = (index + 1) + ' / ' + images.length;
        if (dotsEl) {
            dotsEl.innerHTML = images.map(function (_, i) {
                return '<span style="width:8px;height:8px;border-radius:50%;background:' + (i === index ? 'var(--gold, #FFD700)' : 'rgba(255,255,255,0.4)') + ';display:inline-block;transition:0.2s;"></span>';
            }).join('');
        }
    }

    function load(i) {
        index = clamp(i, 0, images.length - 1);
        resetView();
        if (imgEl) {
            var src = images[index];
            imgEl.src = src || (window.SKH_PLACEHOLDER_IMG || '');
        }
        updateMeta();
    }

    function next() { if (index < images.length - 1) load(index + 1); }
    function prev() { if (index > 0) load(index - 1); }

    // ---------- pointer handlers ----------
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

    function onDown(e) {
        if (!overlay) return;
        e.preventDefault();
        try { overlay.setPointerCapture(e.pointerId); } catch (err) {}
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        var pc = Object.keys(pointers).length;

        if (pc === 1) {
            drag = { x: e.clientX, y: e.clientY, tx: tx, ty: ty };
            swipe = { x: e.clientX, y: e.clientY, moved: false };
            // double-tap
            var now = Date.now();
            if (now - lastTap.t < 320 && Math.abs(e.clientX - lastTap.x) < 40 && Math.abs(e.clientY - lastTap.y) < 40) {
                lastTap.t = 0;
                if (scale > 1.05) { setScale(1, e.clientX, e.clientY); }
                else { setScale(2.5, e.clientX, e.clientY); }
            } else {
                lastTap = { t: now, x: e.clientX, y: e.clientY };
            }
        } else if (pc === 2) {
            var pts = Object.keys(pointers).map(function (k) { return pointers[k]; });
            pinch = {
                startDist: Math.max(20, dist(pts[0], pts[1])),
                startScale: scale,
                startTx: tx, startTy: ty,
                midX: (pts[0].x + pts[1].x) / 2,
                midY: (pts[0].y + pts[1].y) / 2
            };
            drag = null; swipe = null;
        }
    }

    function onMove(e) {
        if (!overlay || !pointers[e.pointerId]) return;
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        var pc = Object.keys(pointers).length;

        if (pc === 2 && pinch) {
            var pts = Object.keys(pointers).map(function (k) { return pointers[k]; });
            var d = Math.max(20, dist(pts[0], pts[1]));
            var ns = clamp(pinch.startScale * (d / pinch.startDist), MIN, MAX);
            scale = ns;
            if (scale <= 1.02) { tx = 0; ty = 0; }
            else {
                var mx = (pts[0].x + pts[1].x) / 2;
                var my = (pts[0].y + pts[1].y) / 2;
                tx = pinch.startTx + (mx - pinch.midX);
                ty = pinch.startTy + (my - pinch.midY);
            }
            apply();
        } else if (pc === 1 && drag) {
            if (scale > 1.02) {
                tx = drag.tx + (e.clientX - drag.x);
                ty = drag.ty + (e.clientY - drag.y);
                apply();
            } else if (swipe) {
                var dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
                if (Math.abs(dx) > 8 || Math.abs(dy) > 8) swipe.moved = true;
                // mwendo mdogo wa kusogeza kwa kuslide (kivuli)
                if (Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy)) {
                    imgEl.style.transform = 'translate(' + dx + 'px,0) scale(1)';
                }
            }
        }
    }

    function onUp(e) {
        if (!overlay) return;
        delete pointers[e.pointerId];
        var pc = Object.keys(pointers).length;

        if (pc === 0) {
            // snap: kama imekuzwa kidogo tu, rudisha kawaida
            if (scale < 1.05) { scale = 1; tx = 0; ty = 0; apply(); clampPan(); }
            else clampPan();
            apply();

            // swipe ya kubadilisha picha
            if (swipe && swipe.moved && scale <= 1.02) {
                var dx = e.clientX - swipe.x;
                if (Math.abs(dx) > 50) { if (dx < 0) next(); else prev(); }
                else apply(true);
            }
            swipe = null; drag = null; pinch = null;
        } else if (pc === 1 && scale > 1.02) {
            var p = pointers[Object.keys(pointers)[0]];
            drag = { x: p.x, y: p.y, tx: tx, ty: ty };
            swipe = null;
        } else if (pc === 1) {
            var q = pointers[Object.keys(pointers)[0]];
            drag = { x: q.x, y: q.y, tx: tx, ty: ty };
            swipe = { x: q.x, y: q.y, moved: false };
        }
    }

    function onWheel(e) {
        if (!overlay) return;
        e.preventDefault();
        var factor = e.deltaY < 0 ? 1.12 : 0.9;
        setScale(scale * factor, e.clientX, e.clientY);
    }

    // ---------- build ----------
    function build() {
        if (overlay) overlay.remove();

        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9999990;background:rgba(0,0,0,0.93);display:flex;align-items:center;justify-content:center;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;';

        // picha
        imgEl = document.createElement('img');
        imgEl.draggable = false;
        imgEl.style.cssText = 'max-width:100%;max-height:100%;transform-origin:center center;will-change:transform;background:transparent;';
        imgEl.alt = '';
        overlay.appendChild(imgEl);

        // upau wa juu: karibu (left) + counter (center) + zoom buttons (right)
        var top = document.createElement('div');
        top.style.cssText = 'position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:12px 14px;z-index:5;';
        var btnStyle = 'width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.16);border:1px solid rgba(255,255,255,0.25);color:#fff;font-size:20px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);line-height:1;';
        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&#10005;';
        closeBtn.style.cssText = btnStyle + 'font-size:16px;';
        closeBtn.onclick = function () { window.closeImageZoom(); };
        var counter = document.createElement('div');
        counter.style.cssText = 'color:#fff;font-size:13px;font-weight:800;background:rgba(0,0,0,0.35);padding:5px 12px;border-radius:16px;letter-spacing:0.5px;';
        countEl = counter;
        var zoomBox = document.createElement('div');
        zoomBox.style.cssText = 'display:flex;gap:8px;';
        var outBtn = document.createElement('button');
        outBtn.innerHTML = '&#8722;';
        outBtn.style.cssText = btnStyle;
        outBtn.onclick = function () { setScale(scale - 0.6); };
        var inBtn = document.createElement('button');
        inBtn.innerHTML = '+';
        inBtn.style.cssText = btnStyle;
        inBtn.onclick = function () { setScale(scale + 0.6); };
        zoomBox.appendChild(outBtn);
        zoomBox.appendChild(inBtn);
        top.appendChild(closeBtn);
        top.appendChild(counter);
        top.appendChild(zoomBox);
        overlay.appendChild(top);

        // mishale ya kushoto/kulia
        if (images.length > 1) {
            var lBtn = document.createElement('button');
            lBtn.innerHTML = '&#8249;';
            lBtn.style.cssText = 'position:absolute;left:10px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.35);border:none;color:#fff;font-size:30px;cursor:pointer;z-index:5;line-height:1;';
            lBtn.onclick = function () { prev(); };
            var rBtn = document.createElement('button');
            rBtn.innerHTML = '&#8250;';
            rBtn.style.cssText = 'position:absolute;right:10px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.35);border:none;color:#fff;font-size:30px;cursor:pointer;z-index:5;line-height:1;';
            rBtn.onclick = function () { next(); };
            overlay.appendChild(lBtn);
            overlay.appendChild(rBtn);
        }

        // dots chini
        var dots = document.createElement('div');
        dots.style.cssText = 'position:absolute;bottom:16px;left:0;right:0;display:flex;justify-content:center;gap:6px;z-index:5;';
        dotsEl = dots;
        overlay.appendChild(dots);

        // pointer/wheel events
        overlay.addEventListener('pointerdown', onDown);
        overlay.addEventListener('pointermove', onMove);
        overlay.addEventListener('pointerup', onUp);
        overlay.addEventListener('pointercancel', onUp);
        overlay.addEventListener('wheel', onWheel, { passive: false });

        document.body.appendChild(overlay);
    }

    window.openImageZoom = function (imgs, startIndex, initialScale) {
        images = (imgs && imgs.length) ? imgs.slice() : [];
        if (!images.length) return;
        index = clamp(startIndex || 0, 0, images.length - 1);
        build();
        load(index);
        if (initialScale && initialScale > 1) setScale(clamp(initialScale, MIN, MAX));
    };

    window.closeImageZoom = function () {
        if (overlay) overlay.remove();
        overlay = null; imgEl = null; countEl = null; dotsEl = null;
        pointers = {}; pinch = null; drag = null; swipe = null;
    };
})();
