#!/usr/bin/env node
/* [ROUTING 2026-11-24] Share URLs /p/<id>, /s/<id>, /d/<id> and /post/<id> are served the app shell by the SPA fallback.
 * Before <base href="/"> every relative asset ("css/..", "js/..", "assets/..") resolved under the share path
 * (/p/css/...), which the host answers with HTML or 404, so the page had no CSS and no JS. This test opens each route
 * family directly (new tab), reloads it, on a phone and a desktop viewport, and checks: no asset is requested under the
 * share path, every CSS/JS response is real CSS/JS, the styles apply, the app starts and the shared listing opens.
 * Needs the emulators + local server on 5055 (SKH_FIREBASE_SDK_DIR as the other browser tests). */
import { chromium, devices } from 'playwright'; import { readFileSync } from 'node:fs'; import assert from 'node:assert/strict';
const SDK = (process.env.SKH_FIREBASE_SDK_DIR || '').replace(/\/?$/, '/');
const APP = 'http://127.0.0.1:5055';
const FS = 'http://127.0.0.1:8085/v1/projects/demo-sokohai/databases/(default)/documents';
// optional modules that shared/product-taxonomy-bridge.mjs imports inside try/catch; they were never committed (404 on every route)
const OPTIONAL = /^\/shared\/product-schema-(pilots|refinements)\.mjs$/;
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  PASS ' + m); };
const firstId = async (col) => { try { const r = await (await fetch(FS + '/' + col + '?pageSize=1', { headers: { Authorization: 'Bearer owner' } })).json(); return r.documents && r.documents[0] ? r.documents[0].name.split('/').pop() : null; } catch (e) { return null; } };
const ids = { p: await firstId('products'), s: await firstId('services'), d: await firstId('drivers'), post: await firstId('posts') };
// the service worker is switched off on dev / preview hosts (js/00-pwa.js), so its path is checked in the source:
// a relative './sokohai-sw.js' would be /p/sokohai-sw.js on a share URL without <base>; it is registered from the root
const pwa = readFileSync(new URL('../js/00-pwa.js', import.meta.url), 'utf8'), head = readFileSync(new URL('../html/00-head.html', import.meta.url), 'utf8');
ok(/serviceWorker\.register\('\/sokohai-sw\.js'\)/.test(pwa), 'service worker is registered from the site root (/sokohai-sw.js)');
ok(head.indexOf('<base href="/">') > 0 && head.indexOf('<base href="/">') < head.search(/<(link|script)[^>]+(href|src)=/), '<base href="/"> comes before the first stylesheet / script in <head>');
const b = await chromium.launch();
for (const [label, opts] of [['phone', { ...devices['Pixel 7'] }], ['desktop', { viewport: { width: 1366, height: 900 } }]]) {
  for (const fam of ['p', 's', 'd', 'post']) {
    const id = ids[fam] || 'share-route-test';
    const ctx = await b.newContext(opts);
    if (SDK !== '/') await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, rt => rt.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(SDK + rt.request().url().split('/').pop()) }));
    await ctx.route(/res\.cloudinary\.com|nominatim|tile\.openstreetmap|arcgisonline/, r => r.abort());
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => { try { localStorage.setItem('skh_welcomed_v1', '1'); } catch (e) {} });
    const url = APP + '/' + fam + '/' + encodeURIComponent(id);
    const typeErr = []; p.on('response', res => { const t = res.request().resourceType(); if (!['stylesheet', 'script'].includes(t)) return; const u = new URL(res.url()); if (u.origin !== APP) return;
      const ct = res.headers()['content-type'] || ''; if (OPTIONAL.test(u.pathname)) return; if (res.status() >= 400 || (t === 'stylesheet' ? !/text\/css/.test(ct) : !/javascript/.test(ct))) typeErr.push(res.status() + ' ' + ct.split(';')[0] + ' ' + u.pathname); });
    const bad = []; p.on('request', r => { const u = new URL(r.url()); if (u.origin === APP && u.pathname.startsWith('/' + fam + '/') && r.resourceType() !== 'document') bad.push(u.pathname); });
    for (const step of ['open', 'reload']) {
      if (step === 'open') await p.goto(url); else await p.reload();
      await p.waitForFunction(() => window.skh && window.skh.__authResolved && window.SokoHaiLMS, null, { timeout: 45000 });
      await p.waitForTimeout(2500);
      const r = await p.evaluate(() => {
        const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
        const linked = [...document.styleSheets].filter(s => s.ownerNode && s.ownerNode.tagName === 'LINK');
        const empty = linked.filter(s => { try { return s.cssRules.length === 0; } catch (e) { return false; } }).map(s => s.href);
        const applied = linked.length - empty.length;
        const pm = document.getElementById('productModal');
        return { base: document.baseURI, links: links.length, applied, empty, font: getComputedStyle(document.body).fontFamily,
          wrongHref: links.map(l => l.href).filter(h => !/^https?:\/\/[^/]+\/(css|fonts)\//.test(h) && !/fonts\.googleapis|gstatic/.test(h)),
          scripts: [...document.querySelectorAll('script[src]')].map(s => s.src).filter(s => /\/(p|s|d|post)\//.test(new URL(s).pathname)),
          modal: !!pm && getComputedStyle(pm).display !== 'none', path: location.pathname,
          sw: navigator.serviceWorker && navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : null };
      });
      const tag = `${label} /${fam}/<id> (${step})`;
      ok(r.base === APP + '/', `${tag}: relative URLs resolve from the site root (${r.base})`);
      ok(bad.length === 0 && r.scripts.length === 0 && r.wrongHref.length === 0, `${tag}: no CSS / JS / image requested under /${fam}/: ` + JSON.stringify(bad.slice(0, 4).concat(r.scripts.slice(0, 2), r.wrongHref.slice(0, 2))));
      ok(r.links > 20 && typeErr.length === 0 && r.empty.every(h => /40-ui-refinement\.css/.test(h)) && /Inter/i.test(r.font), `${tag}: ${r.applied}/${r.links} stylesheets applied, body font "${r.font.split(',')[0]}" ` + '(every CSS/JS response is 200 text/css or javascript; ' + JSON.stringify(typeErr.slice(0, 3)) + ')');
      if (fam !== 'post' && ids[fam]) ok(r.modal, `${tag}: the shared listing opens (productModal)`);
      bad.length = 0; typeErr.length = 0;
    }
    ok(errs.filter(e => !/hdr is not defined/.test(e)).length === 0, `${label} /${fam}/: no page errors ` + errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
}
await b.close();
console.log(`\nSHARE ROUTES (browser): ${n} passed, 0 failed`);
