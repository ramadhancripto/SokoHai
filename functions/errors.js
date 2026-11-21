'use strict';
/* [SRV-10/SRV-11 2026-11-20] ONE error contract for every callable (see docs/audit/2026-11-20-server/SERVER-ERROR-CONTRACT.md).
 *
 *  - Every callable built with this module's `onCall` runs inside `withErrors()`:
 *      * a request id (12 hex chars) per call;
 *      * an HttpsError thrown by the handler keeps its code and message (business logic unchanged);
 *      * known Firestore / runtime failures become typed codes (aborted, resource-exhausted, deadline-exceeded,
 *        unavailable, failed-precondition INDEX_UNAVAILABLE, invalid-argument INVALID_FIELD, already-exists);
 *      * anything else becomes `internal` with the message "Hitilafu ya server (namba: <id>)", never the raw text;
 *      * `details.requestId` is added when details are empty or a plain object (string details are left alone);
 *      * one structured log line per failure through firebase-functions/logger: fn, requestId, code, reason,
 *        where, uidHash (sha256, 12 chars), durationMs, upstream {service,status}. Never payloads, tokens,
 *        passwords/PINs, e-mails, phone numbers or keys.
 *  - `fetchWithTimeout()` gives external calls (PesaPal) an AbortController deadline.
 *  - `stripUndefined()` removes undefined fields from caller-built documents before a Firestore write.
 * The shim keeps the firebase-functions signature: onCall(handler) or onCall(options, handler). */
const crypto = require('crypto');
const https = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { HttpsError } = https;

const CLIENT_CODES = new Set(['invalid-argument', 'failed-precondition', 'out-of-range', 'unauthenticated', 'permission-denied',
  'not-found', 'already-exists', 'resource-exhausted', 'cancelled', 'aborted']);

function newRequestId() { return crypto.randomBytes(6).toString('hex'); }
function uidHash(uid) { return uid ? crypto.createHash('sha256').update(String(uid)).digest('hex').slice(0, 12) : null; }
function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype; }

/* Firestore / gRPC status (number or string) -> callable code. Returns null when unknown. */
function firestoreCode(e) {
  const c = e && e.code;
  const n = typeof c === 'number' ? c : null;
  const s = typeof c === 'string' ? c.toLowerCase() : '';
  const msg = String((e && e.message) || '');
  if (/Cannot use "undefined" as a Firestore value/i.test(msg) || /undefined.*not a valid Firestore value/i.test(msg)) {
    const field = (/field "([^"]{1,80})"/.exec(msg) || [])[1];
    return { code: 'invalid-argument', reason: 'INVALID_FIELD', message: 'INVALID_FIELD: taarifa iliyotumwa haijakamilika' + (field ? ' (' + field + ')' : '') + '.' };
  }
  if (n === 10 || s === 'aborted') return { code: 'aborted', reason: 'CONTENTION', message: 'Ombi limegongana na jingine kwa wakati mmoja. Jaribu tena.' };
  if (n === 8 || s === 'resource-exhausted') return { code: 'resource-exhausted', reason: 'RESOURCE_EXHAUSTED', message: 'Huduma ina shughuli nyingi kwa sasa. Jaribu tena baadaye.' };
  if ((n === 9 || s === 'failed-precondition') && /index/i.test(msg)) return { code: 'failed-precondition', reason: 'INDEX_UNAVAILABLE', message: 'INDEX_UNAVAILABLE: huduma hii bado inaandaliwa kwenye server. Jaribu tena baadaye.' };
  if (n === 4 || s === 'deadline-exceeded') return { code: 'deadline-exceeded', reason: 'DEADLINE', message: 'Ombi limechukua muda mrefu. Jaribu tena.' };
  if (n === 14 || s === 'unavailable') return { code: 'unavailable', reason: 'BACKEND_UNAVAILABLE', message: 'Huduma haipatikani kwa muda huu. Jaribu tena baadaye.' };
  if (n === 6 || s === 'already-exists') return { code: 'already-exists', reason: 'ALREADY_EXISTS', message: 'Taarifa hii tayari ipo.' };
  return null;
}

const CALLABLE_CODES = new Set(['ok', 'cancelled', 'unknown', 'invalid-argument', 'deadline-exceeded', 'not-found', 'already-exists',
  'permission-denied', 'resource-exhausted', 'failed-precondition', 'aborted', 'out-of-range', 'unimplemented', 'internal',
  'unavailable', 'data-loss', 'unauthenticated']);
/* An HttpsError from this module's class, or from another copy of firebase-functions (a second install, or a test
   double of 'firebase-functions/v2/https'): same class name and a valid callable code. Its code and message are the
   handler's deliberate answer, so they pass through unchanged. */
function isHttpsError(e) {
  if (e instanceof HttpsError) return true;
  return !!e && e instanceof Error && e.constructor && e.constructor.name === 'HttpsError' && typeof e.code === 'string' && CALLABLE_CODES.has(e.code);
}

/* Normalise any thrown value into an HttpsError carrying the request id. */
function toHttpsError(e, requestId) {
  let out;
  if (isHttpsError(e)) out = e;
  else {
    const mapped = firestoreCode(e);
    out = mapped ? new HttpsError(mapped.code, mapped.message) : new HttpsError('internal', 'Hitilafu ya server (namba: ' + requestId + '). Jaribu tena; ikiendelea, wasiliana na msaada ukitaja namba hii.');
    out.__skhReason = mapped ? mapped.reason : 'UNEXPECTED';
  }
  if (out.details === undefined) out.details = { requestId };
  else if (isPlainObject(out.details) && !out.details.requestId) out.details = Object.assign({}, out.details, { requestId });
  return out;
}

function where(e) {
  const line = String((e && e.stack) || '').split('\n').find(l => /functions[\\/][\w-]+\.js:\d+/.test(l) && !/errors\.js/.test(l));
  const m = line && /([\w-]+\.js):(\d+)/.exec(line);
  return m ? m[1] + ':' + m[2] : null;
}

function logFailure(label, requestId, req, err, original, started) {
  const code = err.code;
  const entry = {
    fn: label.name || 'callable', requestId, code,
    reason: isHttpsError(original) ? String(err.message || '').split(':')[0].slice(0, 60) : (err.__skhReason || 'UNEXPECTED'),
    where: where(original), uidHash: uidHash(req && req.auth && req.auth.uid), durationMs: Date.now() - started
  };
  if (original && original.upstream) entry.upstream = original.upstream;
  if (!isHttpsError(original)) entry.errorType = (original && original.constructor && original.constructor.name) || typeof original;
  if (code === 'internal' || code === 'unavailable' || code === 'deadline-exceeded' || code === 'unknown' || code === 'data-loss') logger.error('[callable] failure', entry);
  else if (CLIENT_CODES.has(code)) logger.info('[callable] rejected', entry);
  else logger.warn('[callable] failure', entry);
}

function withErrors(handler, label) {
  label = label || { name: null };
  const wrapped = async function (req, res) {
    const requestId = newRequestId();
    const started = Date.now();
    try {
      return await handler(req, res);
    } catch (e) {
      const err = toHttpsError(e, requestId);
      try { logFailure(label, requestId, req, err, e, started); } catch (logErr) { /* logging must never change the response */ }
      throw err;
    }
  };
  wrapped.__skhLabel = label;
  return wrapped;
}

/* Drop-in for firebase-functions/v2/https onCall. The export name is filled in by functions/index.js
   (labelCallables) so logs say which function failed. */
function onCall(optsOrHandler, maybeHandler) {
  const label = { name: null };
  const fn = typeof optsOrHandler === 'function'
    ? https.onCall(withErrors(optsOrHandler, label))
    : https.onCall(optsOrHandler, withErrors(maybeHandler, label));
  Object.defineProperty(fn, '__skhLabel', { value: label, enumerable: false });
  return fn;
}

function labelCallables(exp) {
  for (const k of Object.keys(exp)) { const f = exp[k]; if (f && f.__skhLabel && !f.__skhLabel.name) f.__skhLabel.name = k; }
}

/* fetch with an AbortController deadline. Throws an Error with .timeout = true on expiry. */
async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 15000);
  try { return await fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal })); }
  catch (e) { if (e && (e.name === 'AbortError' || ctrl.signal.aborted)) { const te = new Error('timeout after ' + (ms || 15000) + 'ms'); te.timeout = true; throw te; } throw e; }
  finally { clearTimeout(t); }
}

/* Recursively remove `undefined` values (Firestore rejects them). Arrays keep their order; nulls stay. */
function stripUndefined(v) {
  if (Array.isArray(v)) return v.filter(x => x !== undefined).map(stripUndefined);
  if (isPlainObject(v)) { const o = {}; for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = stripUndefined(x); return o; }
  return v;
}

/* [SRV-10] A deliberately non-fatal step (notification, cosmetic lookup, best-effort claim sync) failed:
   keep the main operation's result, but leave a structured trace instead of an empty catch. */
function logBestEffort(where, e) {
  try { logger.warn('[best-effort] ' + where, { where, code: (e && e.code) || null, errorType: (e && e.constructor && e.constructor.name) || typeof e }); } catch (_) { /* never throw from logging */ }
}

module.exports = { logBestEffort, isHttpsError, onCall, withErrors, toHttpsError, firestoreCode, labelCallables, fetchWithTimeout, stripUndefined, newRequestId, uidHash, HttpsError };
