// Child process for tools/test_app_check.mjs: loads functions/index.js with a
// given APP_CHECK_ENFORCE value and calls callables over their real HTTP handler
// WITHOUT an App Check token. Prints one JSON line per callable.
process.env.GCLOUD_PROJECT = 'demo-sokohai';
process.env.FIREBASE_CONFIG = '{"projectId":"demo-sokohai"}';
process.env.APP_CHECK_ENFORCE = process.argv[2] || '';
const path = require('path');
const fns = require(path.join(__dirname, '..', '..', 'functions', 'index.js'));
const names = process.argv.slice(3);
function req() { return { method: 'POST', headers: { 'content-type': 'application/json' }, header(n) { return this.headers[n.toLowerCase()]; }, get(n) { return this.headers[n.toLowerCase()]; }, body: { data: {} } }; }
function res(done) { return { statusCode: 200, headers: {}, status(c) { this.statusCode = c; return this; }, set(k, v) { this.headers[k] = v; return this; }, setHeader(k, v) { this.headers[k] = v; }, getHeader(k) { return this.headers[k]; }, send(b) { done(this.statusCode, b); }, json(b) { done(this.statusCode, b); }, end(b) { done(this.statusCode, b); }, on() {} }; }
(async () => {
  const out = {};
  for (const n of names) {
    out[n] = await new Promise(r => fns[n](req(), res((code, body) => r({ code, body: typeof body === 'string' ? body : JSON.stringify(body) }))));
  }
  process.stdout.write('RESULT ' + JSON.stringify(out) + '\n');
  process.exit(0);
})();
