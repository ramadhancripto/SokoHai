/**
 * Creative persistence contract: NOTHING written to Firestore may contain
 * `undefined` — Firestore rejects it with
 *   "Function addDoc() called with invalid data. Unsupported field value:
 *    undefined (found in field durationAuto in document creatives/…)"
 * Also guards the duration semantics that must not change.
 */
import { chromium } from 'playwright';
const R = { checks: [] };
const check = (n, ok, d = '') => { R.checks.push({ n, ok: !!ok, d }); };
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
await p.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(5500);

const out = await p.evaluate(async () => {
  const strict = (doc) => {
    (function w(o, path) {
      if (!o || typeof o !== 'object') return;
      Object.entries(o).forEach(([k, v]) => {
        if (v === undefined) throw new Error(`Unsupported field value: undefined (found in field ${path}${k})`);
        if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) w(v, path + k + '.');
        if (Array.isArray(v)) v.forEach((x, i) => { if (x === undefined) throw new Error(`undefined in ${path}${k}[${i}]`); });
      });
    })(doc, '');
    return true;
  };
  window.__writes = [];
  window.skh.addDoc = async (c, payload) => { strict(payload); window.__writes.push('addDoc'); return { id: 'CRE_OK' }; };
  window.skh.setDoc = async (r, payload) => { strict(payload); window.__writes.push('setDoc'); return true; };
  window.skh.currentUser = { uid: 'u1', email: 'demo@example.test' };

  const D = window.SokoHaiAdsDesignRules, CS = window.SokoHaiCreativeStudio;
  const res = {};

  const deep = (o) => { const hits = []; (function w(x, path) { if (!x || typeof x !== 'object') return; Object.entries(x).forEach(([k, v]) => { if (v === undefined) hits.push(path + k); else if (v && typeof v === 'object') w(v, path + k + '.'); }); })(o, ''); return hits; };

  // 1) every ad type the studio supports, normalized and written
  for (const cat of ['product', 'service', 'transport', 'general']) {
    const c = D.normalizeCreative(CS.createCreative({ format: 'landscape', ownerId: 'u1', category: cat, campaignName: 'T ' + cat }));
    res['undef_' + cat] = deep(c);
    res['write_' + cat] = await window.skhPersistCreativeDraft(c).then(() => 'OK').catch(e => 'FAILED: ' + e.message.slice(0, 80));
  }

  // 2) duration semantics preserved
  const explicit = D.normalizeCreative({ duration: 10, displayDurationSeconds: 45 });
  res.durationPreserved = explicit.duration === 10;
  res.displayPreserved = explicit.displayDurationSeconds === 45;
  res.durationAutoIsBoolean = typeof explicit.durationAuto === 'boolean';
  const empty = D.normalizeCreative({});
  res.emptyDurationAutoIsBoolean = typeof empty.durationAuto === 'boolean';

  // 3) sanitizer keeps null, drops undefined, filters arrays
  const s = window.skhStripUndefined({ a: 1, b: undefined, n: null, arr: [1, undefined, 2], deep: { x: undefined, y: 3 } });
  res.sanitizer = JSON.stringify(s);

  res.writes = window.__writes;
  return res;
});

const undef = Object.entries(out).filter(([k]) => k.startsWith('undef_'));
undef.forEach(([k, v]) => check(`${k}: no undefined fields`, Array.isArray(v) && v.length === 0, JSON.stringify(v)));
const writes = Object.entries(out).filter(([k]) => k.startsWith('write_'));
writes.forEach(([k, v]) => check(`${k}: strict Firestore write succeeds`, v === 'OK', v));
check('explicit media duration is not recomputed', out.durationPreserved, String(out.durationPreserved));
check('custom display duration preserved', out.displayPreserved, String(out.displayPreserved));
check('durationAuto is always a boolean', out.durationAutoIsBoolean && out.emptyDurationAutoIsBoolean, `${out.durationAutoIsBoolean}/${out.emptyDurationAutoIsBoolean}`);
check('sanitizer drops undefined, keeps null, filters arrays', out.sanitizer === '{"a":1,"n":null,"arr":[1,2],"deep":{"y":3}}', out.sanitizer);

await b.close();
const failed = R.checks.filter(c => !c.ok);
console.log(`${R.checks.length - failed.length}/${R.checks.length} checks passed`);
failed.forEach(f => console.log('  FAIL:', f.n, '→', f.d));
process.exit(failed.length ? 1 : 0);
