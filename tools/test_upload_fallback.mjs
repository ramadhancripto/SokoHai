#!/usr/bin/env node
/* [UPLOAD 2026-11-15] skhUploadFromFile when the signing service (uploadSignature) answers in
 * different ways. Live root cause: on sokohaicom.netlify.app the Cloud Function was not deployed
 * (404) and a LOGGED-IN seller was told "Hakikisha umeingia (login)" for every photo. */
import { JSDOM } from 'jsdom'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0; const ok = (n, c, v) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + n + (c ? '' : ' -> ' + JSON.stringify(v))); };
function env({ user, sign }) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://sokohaicom.netlify.app/' });
  const w = dom.window; const posted = []; let refreshed = 0, calls = 0;
  w.fetch = async (url, o) => { const f = {}; for (const [k, v] of o.body.entries()) if (typeof v === 'string') f[k] = v; posted.push({ url, f }); return { json: async () => ({ secure_url: 'https://res.cloudinary.com/x/image/upload/ok.jpg' }) }; };
  const u = user ? { uid: 'u1', getIdToken: async (force) => { if (force) refreshed++; return 't'; } } : null;
  w.skh = { currentUser: u, wrapCallable: () => async () => { calls++; const r = sign(calls, refreshed); if (r instanceof Error) throw r; return { data: r }; } };
  w.eval(fs.readFileSync(path.join(ROOT, 'js/11-uploads.js'), 'utf8'));
  w.skhCompressImageFile = async (f) => f;
  return { w, posted, get refreshed() { return refreshed; } };
}
const err = (code, msg) => Object.assign(new Error(msg || code), { code: 'functions/' + code });
const file = (w) => new w.File(['x'], 'p.jpg', { type: 'image/jpeg' });

// 1. the live failure: function missing (404 -> unavailable), seller logged in -> upload still works (public preset)
for (const code of ['unavailable', 'not-found', 'internal']) {
  const e = env({ user: true, sign: () => err(code) });
  const r = await e.w.skhUploadFromFile(file(e.w), { folder: 'products' });
  ok(`signing service ${code}, logged in -> photo uploaded with the public preset`, r && r.url && e.posted.length === 1 && e.posted[0].f.upload_preset === 'Sokohai_preset' && !e.posted[0].f.signature && e.w.skhUploadMode === 'unsigned-fallback', { r, p: e.posted, m: e.w.skhUploadMode, le: e.w.skhUploadLastError });
}
// 2. not logged in -> honest login message, nothing sent
{ const e = env({ user: false, sign: () => err('unauthenticated', 'Login inahitajika kupakia picha.') });
  const r = await e.w.skhUploadFromFile(file(e.w), {});
  ok('not logged in -> "Ingia kwanza", no upload', !r && e.posted.length === 0 && e.w.skhUploadLastError.code === 'not_logged_in', e.w.skhUploadLastError); }
// 3. app shows logged in but the token is stale -> refresh once, then the signed upload goes through
{ const e = env({ user: true, sign: (n, refreshed) => refreshed ? { mode: 'signed', cloudName: 'c', apiKey: 'k', timestamp: 1, signature: 's', folder: 'sokohai/products/u1', uploadPreset: 'p' } : err('unauthenticated') });
  const r = await e.w.skhUploadFromFile(file(e.w), { folder: 'products' });
  ok('stale login token -> refreshed once -> signed upload', r && e.refreshed === 1 && e.posted[0].f.signature === 's', { r, rf: e.refreshed, p: e.posted }); }
// 4. still unauthenticated after refresh -> "log in again" (not a generic refusal), nothing sent
{ const e = env({ user: true, sign: () => err('unauthenticated') });
  const r = await e.w.skhUploadFromFile(file(e.w), {});
  ok('session really expired -> "toka uingie tena", no upload', !r && e.posted.length === 0 && e.w.skhUploadLastError.code === 'session_expired', e.w.skhUploadLastError); }
// 5. real server refusals are never bypassed
for (const [code, msg] of [['permission-denied', 'Akaunti imesimamishwa.'], ['resource-exhausted', 'Umepakia mara nyingi sana saa hii.'], ['failed-precondition', 'Upload salama haijasanidiwa kwenye server (CLOUDINARY_*).']]) {
  const e = env({ user: true, sign: () => err(code, msg) });
  const r = await e.w.skhUploadFromFile(file(e.w), {});
  ok(`server refuses (${code}) -> no fallback, real reason shown`, !r && e.posted.length === 0 && e.w.skhUploadLastError.message.indexOf(msg) !== -1, e.w.skhUploadLastError);
}
// 6. private identity documents never fall back to the public preset
{ const e = env({ user: true, sign: () => err('unavailable') });
  const r = await e.w.skhUploadFromFile(file(e.w), { folder: 'identity' });
  ok('identity document + signing service down -> refused, never public', !r && e.posted.length === 0, { p: e.posted, le: e.w.skhUploadLastError }); }
// 7. normal paths unchanged
{ const e = env({ user: true, sign: () => ({ ok: true, mode: 'unsigned' }) });
  const r = await e.w.skhUploadFromFile(file(e.w), { folder: 'products' });
  ok('server transition mode (unsigned) unchanged', r && e.posted[0].f.upload_preset === 'Sokohai_preset' && e.w.skhUploadMode === 'unsigned', e.posted); }
{ const e = env({ user: true, sign: () => ({ ok: true, mode: 'signed', cloudName: 'c', apiKey: 'k', timestamp: 1, signature: 's', folder: 'f', uploadPreset: 'p' }) });
  const r = await e.w.skhUploadFromFile(file(e.w), {});
  ok('signed mode unchanged', r && e.posted[0].url.indexOf('/c/') !== -1 && e.posted[0].f.signature === 's', e.posted); }
console.log(`\nUPLOAD FALLBACK: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
