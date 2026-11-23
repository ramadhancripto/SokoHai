#!/usr/bin/env node
/* [PERF 2026-11-22] Reproducible page-load measurement (Chromium + CDP), used for the before/after report.
 * Profile: 390x844 phone, 4x CPU slowdown, simulated slow 4G (150 ms RTT, 1.6 Mbps down, 750 kbps up), cold cache.
 * Firebase SDK served locally (SKH_FIREBASE_SDK_DIR) so numbers do not depend on gstatic; images from Cloudinary are
 * blocked (the local emulator data uses placeholder URLs) — image payload is measured from local /assets only.
 * Metrics per run: FCP, LCP, CLS, load event, long-task total (TBT-like, > 50 ms), requests, transferred bytes by type,
 * duplicate GETs, Firestore channel requests in the first 10 s, and the latency of a tap on the "Bidhaa" tab (INP proxy,
 * Event Timing API). Median of N runs (default 3).
 * Usage: SKH_FIREBASE_SDK_DIR=... node tools/measure_performance.mjs [url] [runs] */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const URL_ = process.argv[2] || 'http://127.0.0.1:5055/', RUNS = Number(process.argv[3] || 3);
const SDK = (process.env.SKH_FIREBASE_SDK_DIR || '').replace(/\/?$/, '/');
const med = (a) => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const runs = [];
const b = await chromium.launch();
for (let i = 0; i < RUNS; i++) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  if (SDK !== '/') await ctx.route(/gstatic\.com\/firebasejs\/10\.8\.1\/(.+\.js)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(SDK + r.request().url().split('/').pop()) }));
  await ctx.route(/res\.cloudinary\.com|nominatim|googletagmanager|google-analytics/, r => r.abort());
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    try { localStorage.setItem('skh_welcomed_v1', '1'); } catch (e) {}
    window.__perf = { lcp: 0, cls: 0, long: 0, inp: [] };
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.long += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.interactionId) window.__perf.inp.push(e.duration); }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const reqs = new Map(), bytes = {}, urls = [];
  cdp.on('Network.requestWillBeSent', e => { reqs.set(e.requestId, { url: e.request.url, method: e.request.method, type: e.type, t: e.timestamp }); if (e.request.method === 'GET') urls.push(e.request.url); });
  cdp.on('Network.responseReceived', e => { const r = reqs.get(e.requestId); if (r) r.mime = e.response.mimeType; });
  cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (!r) return; const k = /javascript/.test(r.mime || '') || r.type === 'Script' ? 'js' : /css/.test(r.mime || '') ? 'css' : /image/.test(r.mime || '') ? 'img' : /font/.test(r.mime || '') || r.type === 'Font' ? 'font' : r.type === 'Document' ? 'html' : 'other'; bytes[k] = (bytes[k] || 0) + e.encodedDataLength; });
  const t0 = Date.now();
  await p.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  const loadMs = Date.now() - t0;
  await p.waitForTimeout(10000);
  const fcp = await p.evaluate(() => (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || null);
  // INP proxy: one tap on the "Bidhaa" tab
  await p.evaluate(() => { const a = document.getElementById('authModal'); if (a) a.style.display = 'none'; });
  const tab = await p.$('.nav-tab:nth-child(2)'); if (tab) { await tab.tap().catch(() => tab.click()); await p.waitForTimeout(2500); }
  const perf = await p.evaluate(() => window.__perf);
  const all = [...reqs.values()];
  const dup = Object.entries(urls.reduce((m, u) => (m[u] = (m[u] || 0) + 1, m), {})).filter(([u, c]) => c > 1 && !/firestore|google\.firestore|identitytoolkit|securetoken|Listen|channel/.test(u));
  runs.push({ loadMs, fcp, lcp: perf.lcp, cls: perf.cls, longTaskMs: perf.long, tapMs: perf.inp.length ? Math.max(...perf.inp) : null,
    requests: all.length, scripts: all.filter(r => r.type === 'Script').length, firestore: all.filter(r => /:8085|firestore\.googleapis/.test(r.url)).length,
    kb: Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, Math.round(v / 1024)])), totalKb: Math.round(Object.values(bytes).reduce((a, c) => a + c, 0) / 1024), duplicates: dup.length, dupSample: dup.slice(0, 5) });
  await ctx.close();
}
await b.close();
const keys = ['loadMs', 'fcp', 'lcp', 'cls', 'longTaskMs', 'tapMs', 'requests', 'scripts', 'firestore', 'totalKb', 'duplicates'];
const summary = Object.fromEntries(keys.map(k => [k, med(runs.map(r => r[k]))]));
summary.kb = Object.fromEntries(['html', 'js', 'css', 'img', 'font', 'other'].map(k => [k, med(runs.map(r => r.kb[k] || 0))]));
summary.cls = summary.cls != null ? Number(summary.cls.toFixed(3)) : null;
console.log(JSON.stringify({ url: URL_, runs: RUNS, profile: '390x844, CPU x4, 150ms RTT, 1.6 Mbps', median: summary, dupSample: runs[0].dupSample }, null, 1));
