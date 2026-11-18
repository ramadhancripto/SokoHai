'use strict';
/* Emulator-only experiment for a possible external callable backend.
 * Not registered with Netlify and intentionally cannot connect to real projects.
 * Never remove the guard for production without a separate security review.
 */
const emulatorHost = value => /^127\.0\.0\.1:\d{1,5}$/.test(String(value || ''));
function assertDemoEnvironment() {
  const project = String(process.env.GCLOUD_PROJECT || '');
  if (!/^demo-[a-z0-9-]+$/.test(project) ||
      !emulatorHost(process.env.FIRESTORE_EMULATOR_HOST) ||
      !emulatorHost(process.env.FIREBASE_AUTH_EMULATOR_HOST) ||
      (process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_PROJECT !== project)) {
    throw new Error('BLOCKED: only demo project with local Auth and Firestore emulators is allowed');
  }
  return project;
}
const allowed = new Set(['commentsEvidence', 'commentsPublish', 'commentsLike', 'businessEnsureContext', 'posReports']);
const httpCodes = { 'invalid-argument': 400, unauthenticated: 401, 'permission-denied': 403, 'not-found': 404, 'already-exists': 409, 'failed-precondition': 400, 'resource-exhausted': 429, aborted: 409, unavailable: 503, internal: 500, 'deadline-exceeded': 504, 'out-of-range': 400, unimplemented: 501, 'data-loss': 500, cancelled: 499, unknown: 500 };
const reply = (statusCode, value) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(value) });
const error = (code, message) => reply(httpCodes[code] || 500, {error: {status: code.toUpperCase().replace(/-/g, '_'), message}});
let loaded;
function dependencies() {
  const project = assertDemoEnvironment();
  if (!loaded) {
    process.env.FIREBASE_CONFIG = JSON.stringify({projectId: project});
    const functions = require('./index.js');
    const admin = require('firebase-admin');
    loaded = { functions, admin, project };
  }
  // Reject environment changes in a warm process too.
  if (loaded.project !== project) throw new Error('BLOCKED: emulator project changed');
  return loaded;
}
async function handler(event) {
  try { assertDemoEnvironment(); } catch (_) { return error('failed-precondition', 'Emulator-only adapter is disabled.'); }
  const name = String(event.path || '').split('/').pop();
  if (!allowed.has(name)) return error('not-found', 'Function not available.');
  if (event.httpMethod !== 'POST') return reply(405, {error: {status:'INVALID_ARGUMENT', message:'POST required.'}});
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k,v]) => [k.toLowerCase(), v]));
  if (!/^application\/json(?:\s*;|\s*$)/i.test(String(headers['content-type'] || ''))) return error('invalid-argument', 'JSON required.');
  if (event.isBase64Encoded || typeof event.body !== 'string' || Buffer.byteLength(event.body, 'utf8') > 65536) return error('invalid-argument', 'Invalid request body.');
  let payload;
  try { payload = JSON.parse(event.body); } catch (_) { return error('invalid-argument', 'Invalid JSON.'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length !== 1 || !Object.prototype.hasOwnProperty.call(payload, 'data')) return error('invalid-argument', 'Expected {data}.');
  const match = /^Bearer\s+(\S+)$/i.exec(String(headers.authorization || ''));
  if (!match) return error('unauthenticated', 'Sign in required.');
  let dep, token;
  try { dep = dependencies(); token = await dep.admin.auth().verifyIdToken(match[1]); }
  catch (_) { return error('unauthenticated', 'Invalid authentication.'); }
  // Real App Check validation and production-grade abuse controls are deliberately
  // not implemented in this emulator-only prototype. Do not expose it publicly.
  try {
    const fn = dep.functions[name];
    if (!fn || !fn.__endpoint || !fn.__endpoint.callableTrigger || typeof fn.run !== 'function') return error('unavailable', 'Function not available.');
    const result = await fn.run({data: payload.data, auth: {uid: token.uid, token, rawToken: match[1]}, rawRequest: {headers}, acceptsStreaming: false});
    return reply(200, {result});
  } catch (e) {
    // Only known callable errors are returned; unexpected exceptions are not leaked.
    const HttpsError = require('firebase-functions/v2/https').HttpsError;
    if (e instanceof HttpsError && Object.prototype.hasOwnProperty.call(httpCodes, e.code)) return error(e.code, e.message);
    return error('internal', 'Internal error.');
  }
}
module.exports = {handler};
