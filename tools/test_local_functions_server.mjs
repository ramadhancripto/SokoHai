// Local functions server (no Cloud Billing) — smoke test with a throwaway key.
// Requires: cd functions && npm install
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawn } from 'node:child_process'; import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!fs.existsSync(path.join(ROOT, 'functions/node_modules/firebase-functions'))) { console.log('SKIP: run `cd functions && npm install` first'); process.exit(0); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skh-sa-'));
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
fs.writeFileSync(path.join(dir, 'key.json'), JSON.stringify({ type: 'service_account', project_id: 'sokonet-3b847', private_key_id: 'x', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), client_email: 'fake@sokonet-3b847.iam.gserviceaccount.com', client_id: '1', token_uri: 'https://oauth2.googleapis.com/token' }));
const PORT = 5099 + Math.floor(Math.random() * 500), B = 'http://127.0.0.1:' + PORT;
const child = spawn(process.execPath, ['local-server.js'], { cwd: path.join(ROOT, 'functions'), env: { ...process.env, PORT: String(PORT), SKH_SERVICE_ACCOUNT: path.join(dir, 'key.json'), SKH_RUN_SCHEDULES: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
let passed = 0; const fails = []; const ok = (c, n, x) => c ? passed++ : fails.push(n + (x !== undefined ? ' → ' + JSON.stringify(x) : ''));
try {
  for (let i = 0; i < 50 && !/LOCAL FUNCTIONS SERVER/.test(log); i++) await new Promise(r => setTimeout(r, 200));
  ok(/Callables\s+:\s+4\d/.test(log), 'loads real callables from functions/index.js', log.slice(-400));
  let r = await fetch(B + '/__fn/creativePublish', { method: 'OPTIONS', headers: { Origin: 'https://sokohaiworld.netlify.app', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Private-Network': 'true' } });
  ok(r.status === 204 && r.headers.get('access-control-allow-origin') === 'https://sokohaiworld.netlify.app', 'CORS preflight for Netlify origin');
  ok(r.headers.get('access-control-allow-private-network') === 'true', 'Private Network Access header');
  r = await fetch(B + '/__fn/creativePublish', { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
  ok(r.status === 403 && !r.headers.get('access-control-allow-origin'), 'unknown origin rejected');
  r = await fetch(B + '/__fn/creativePublish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { creativeId: 'x' } }) });
  let j = await r.json();
  ok(r.status === 401 && j.error && j.error.status === 'UNAUTHENTICATED', 'real creativePublish runs (HttpsError → callable wire format)', j);
  r = await fetch(B + '/__fn/creativeSaveDraft', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer bogus' }, body: JSON.stringify({ data: {} }) });
  ok(r.status === 401, 'forged ID token rejected');
  r = await fetch(B + '/__fn/doesNotExist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"data":{}}' });
  ok(r.status === 404 && (await r.json()).error.status === 'NOT_FOUND', 'unknown function → NOT_FOUND');
  const html = await (await fetch(B + '/')).text();
  ok(html.includes('window.SKH_FUNCTIONS_URL="/__fn"'), 'frontend served with functions URL injected');
  ok((await fetch(B + '/functions/local-server.js')).status === 404 && (await fetch(B + '/functions/service-account.json')).status === 404, 'server code / secrets never served');
  ok(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').includes('functions/service-account.json'), 'service account git-ignored');
  ok(/from = "\/functions\/\*"[\s\S]*status = 404/.test(fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8')), 'Netlify blocks /functions/*');
  const boot = fs.readFileSync(path.join(ROOT, 'js/app/00-bootstrap.js'), 'utf8');
  ok(boot.includes('httpsCallableFromURL') && boot.includes("skh_functions_url") && boot.includes("skh.httpsCallable(skh.getFunctions(skh.fApp, skh._functionsRegion), name)"), 'client routes to local server only when configured; cloud wiring kept');
} finally { child.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
console.log('LOCAL FUNCTIONS SERVER: ' + passed + ' passed, ' + fails.length + ' failed'); fails.forEach(f => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);
